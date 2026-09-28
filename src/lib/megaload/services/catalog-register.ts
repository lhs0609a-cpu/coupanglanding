/**
 * 관리자 대리 등록 서비스 — 카탈로그 상품을 특정 셀러 계정에 쿠팡 등록한다.
 *
 * 기존 사용자 등록 경로(bulk-register/batch)와 같은 페이로드 빌더를 쓰되,
 * 세션이 아니라 megaload_user_id 로 어댑터를 만든다(= 관리자가 타 계정에 등록 가능).
 *
 * 설계 근거:
 *   - 출고지/반품지는 megaload_users.return_address 가 아니라 쿠팡에서 조회한다.
 *     (2026-09 실측: 44계정 중 return_address 입력은 3건뿐, 반면 쿠팡 쪽엔 27계정이
 *      출고지·반품지를 이미 보유 → 쿠팡이 source of truth)
 *   - 조회 결과는 megaload_users 에 캐시해 매번 쿠팡을 때리지 않는다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { downloadFile } from '@/lib/megaload/integrations/google-drive';
import { buildProductPayload, type BuildPayloadProduct } from './preflight-builder';
import type { DeliveryInfo, ReturnInfo, AttributeMeta } from './coupang-product-builder';
import type { NoticeCategoryMeta } from './notice-field-filler';
import { shuffleWithSeed, DEFAULT_PREVENTION_CONFIG, type PreventionConfig } from './item-winner-prevention';
import { generateDisplayName } from './display-name-generator';
import { generateStoryV2 } from './story-generator';
import { createSeededRandom, stringToSeed } from './seeded-random';
import { fetchEnrolledCoupangBrands, resolveCoupangBrandId } from '@/lib/utils/coupang-api-client';

/** 쿠팡 물류정보 캐시 유효기간 — 출고지는 자주 바뀌지 않지만 폐기될 수 있다. */
const SHIPPING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type SkipReason =
  | 'opt_out'
  | 'contract_inactive'
  | 'no_credentials'
  | 'no_shipping'
  | 'no_contact'
  | 'no_wing_id'
  | 'no_option_value'
  | 'already_registered'
  | 'limit';

export interface Eligibility {
  megaloadUserId: string;
  eligible: boolean;
  skipReason?: SkipReason;
  detail?: string;
  outboundCode?: string;
  returnCode?: string;
  contactNumber?: string;
  /** 셀러 고유 브랜드 — 아이템위너 방지용 차별화 요소 */
  sellerBrand?: string;
  /**
   * 쿠팡 WING 로그인 ID (`vendorUserId`). 업체코드(vendorId)와 다른 값이고,
   * 상품등록 API 가 필수로 요구한다 — 없으면 "'vendorUserId' 값을 확인해 주세요" 로 거부된다.
   */
  wingUserId?: string;
}

interface MegaloadUserRow {
  id: string;
  profile_id: string;
  bulk_register_prefs: Record<string, unknown> | null;
  bulk_register_opt_out: boolean | null;
  coupang_outbound_code: string | null;
  coupang_return_code: string | null;
  coupang_shipping_checked_at: string | null;
  coupang_shipping_error: string | null;
}

/**
 * 한 계정이 "지금 대리 등록 가능한지" 판정한다.
 *
 * 순서대로 막히는 지점을 돌려준다 — 관리자가 무엇을 고쳐야 하는지 알 수 있게.
 *   opt_out → contract_inactive → no_credentials → no_shipping → no_contact
 *
 * @param force  true 면 캐시를 무시하고 쿠팡에 다시 물어본다.
 */
export async function checkEligibility(
  serviceClient: SupabaseClient,
  megaloadUserId: string,
  opts: { force?: boolean } = {},
): Promise<Eligibility> {
  const base: Eligibility = { megaloadUserId, eligible: false };

  const { data: userRow } = await serviceClient
    .from('megaload_users')
    .select('id, profile_id, bulk_register_prefs, bulk_register_opt_out, coupang_outbound_code, coupang_return_code, coupang_shipping_checked_at, coupang_shipping_error')
    .eq('id', megaloadUserId)
    .maybeSingle();

  const user = userRow as unknown as MegaloadUserRow | null;
  if (!user) return { ...base, skipReason: 'no_credentials', detail: '계정을 찾을 수 없습니다.' };

  // 셀러가 대리 등록을 거부했으면 어떤 캠페인에서도 제외한다.
  if (user.bulk_register_opt_out) {
    return { ...base, skipReason: 'opt_out', detail: '셀러가 대리 등록을 거부했습니다.' };
  }

  // 계약이 끝났거나 멈춘 계정에는 아무것도 올리지 않는다.
  // 실측 2026-09-28: status=terminated 인 계정 6곳에 342건씩 계속 올라갔다 —
  // 자격 판정이 계약 상태를 아예 안 봤기 때문이다. 쿠팡 호출보다 먼저 막는다.
  // pt_users 에 행이 없는 계정은 계약 관리 대상이 아니므로 여기서 판단하지 않는다.
  // WING 로그인 ID(상품등록 API 필수값)도 같은 행에 있어 조회를 한 번에 합쳤다.
  let wingUserId = '';
  if (user.profile_id) {
    const { data: pt } = await serviceClient
      .from('pt_users')
      .select('status, coupang_seller_id')
      .eq('profile_id', user.profile_id)
      .maybeSingle();
    const ptRow = pt as { status?: string; coupang_seller_id?: string } | null;
    if (ptRow && ptRow.status !== 'active') {
      return {
        ...base,
        skipReason: 'contract_inactive',
        detail: `계약이 유효하지 않은 계정입니다 (status=${ptRow.status ?? '없음'}).`,
      };
    }
    wingUserId = String(ptRow?.coupang_seller_id || '').trim();
  }

  const prefs = (user.bulk_register_prefs || {}) as Record<string, unknown>;
  // 연락처 — 쿠팡 등록 API 가 반품/AS 번호를 필수로 요구한다.
  //   1순위: 대량등록 설정에 저장된 고객센터 번호
  //   2순위: 가입 프로필 전화번호 (실측 2026-09: 44계정 중 prefs 는 1건뿐, profiles.phone 은 40건)
  let contactNumber = String(prefs.contactNumber || '').trim();
  if (!contactNumber && user.profile_id) {
    const { data: prof } = await serviceClient
      .from('profiles')
      .select('phone')
      .eq('id', user.profile_id)
      .maybeSingle();
    contactNumber = normalizePhone(String((prof as { phone?: string } | null)?.phone || ''));
  }
  // 셀러 고유 브랜드 — 설정돼 있으면 상품 차별화에 쓴다(없으면 빌더가 '자체'로 폴백).
  const sellerBrand = String(prefs.sellerBrand || '').trim() || undefined;

  // 캐시가 살아있으면 쿠팡 호출 생략
  const cachedAt = user.coupang_shipping_checked_at ? new Date(user.coupang_shipping_checked_at).getTime() : 0;
  const cacheFresh = !opts.force && cachedAt > 0 && Date.now() - cachedAt < SHIPPING_CACHE_TTL_MS;

  // 캐시된 "실패"도 캐시다 — 이걸 안 보면 죽은 계정이 자격 있음으로 되살아난다.
  //   cacheShippingError 는 checked_at 만 갱신하고 낡은 출고지 코드를 남긴다.
  //   그래서 "코드 있음 + 캐시 신선" 만 보면 키가 폐기된 계정이 24시간 동안 통과한다
  //   (실측 2026-09-28: 대량등록이 회차마다 같은 계정에 5건씩 헛시도).
  if (cacheFresh && user.coupang_shipping_error) {
    return { ...base, skipReason: 'no_credentials', detail: user.coupang_shipping_error };
  }

  if (cacheFresh && user.coupang_outbound_code && user.coupang_return_code) {
    if (!contactNumber) {
      return { ...base, skipReason: 'no_contact', detail: '연락처(고객센터 번호)가 설정되지 않았습니다.' };
    }
    if (!wingUserId) {
      return { ...base, skipReason: 'no_wing_id', detail: 'WING 로그인 ID(pt_users.coupang_seller_id)가 없습니다.' };
    }
    return {
      megaloadUserId,
      eligible: true,
      outboundCode: user.coupang_outbound_code,
      returnCode: user.coupang_return_code,
      contactNumber,
      sellerBrand,
      wingUserId,
    };
  }

  // 쿠팡 인증
  let adapter: CoupangAdapter;
  try {
    adapter = (await getAuthenticatedAdapter(serviceClient, megaloadUserId, 'coupang')) as CoupangAdapter;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await cacheShippingError(serviceClient, megaloadUserId, detail);
    return { ...base, skipReason: 'no_credentials', detail };
  }

  // 출고지 / 반품지 — 둘 다 있어야 등록이 가능하다.
  let outboundCode = '';
  let returnCode = '';
  let detail = '';
  try {
    const [out, ret] = await Promise.all([
      adapter.getOutboundShippingPlaces(),
      adapter.getReturnShippingCenters(),
    ]);
    outboundCode = out.items.find((p) => p.usable)?.outboundShippingPlaceCode || '';
    returnCode = ret.items.find((c) => c.usable)?.returnCenterCode || '';
    if (!outboundCode) detail = '쿠팡에 사용 가능한 출고지가 없습니다.';
    else if (!returnCode) detail = '쿠팡에 사용 가능한 반품지가 없습니다.';
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
    await cacheShippingError(serviceClient, megaloadUserId, detail);
    return { ...base, skipReason: 'no_credentials', detail };
  }

  if (!outboundCode || !returnCode) {
    await cacheShippingError(serviceClient, megaloadUserId, detail);
    return { ...base, skipReason: 'no_shipping', detail };
  }

  await serviceClient
    .from('megaload_users')
    .update({
      coupang_outbound_code: outboundCode,
      coupang_return_code: returnCode,
      coupang_shipping_checked_at: new Date().toISOString(),
      coupang_shipping_error: null,
    })
    .eq('id', megaloadUserId);

  if (!contactNumber) {
    return { ...base, skipReason: 'no_contact', detail: '연락처(고객센터 번호)가 설정되지 않았습니다.', outboundCode, returnCode };
  }
  // WING ID 가 없으면 쿠팡이 "'vendorUserId' 값을 확인해 주세요" 로 거부한다 —
  // 등록을 시도해봐야 실패하므로 자격 단계에서 걸러낸다.
  if (!wingUserId) {
    return { ...base, skipReason: 'no_wing_id', detail: 'WING 로그인 ID(pt_users.coupang_seller_id)가 없습니다.', outboundCode, returnCode, contactNumber };
  }

  return { megaloadUserId, eligible: true, outboundCode, returnCode, contactNumber, sellerBrand, wingUserId };
}

/**
 * 쿠팡이 받는 형태로 전화번호를 다듬는다.
 * 숫자만 9자리 미만이면 유효하지 않은 값으로 보고 빈 문자열을 돌려준다.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 9) return '';
  if (digits.startsWith('02') && digits.length <= 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

async function cacheShippingError(serviceClient: SupabaseClient, megaloadUserId: string, msg: string) {
  await serviceClient
    .from('megaload_users')
    .update({ coupang_shipping_checked_at: new Date().toISOString(), coupang_shipping_error: msg.slice(0, 500) })
    .eq('id', megaloadUserId);
}

// ─────────────────────────────────────────────────────────────
// 실제 등록 — 셀러마다 다른 상품으로 만들어 올린다 (아이템위너 방지)
//
// 관리자가 카탈로그 상품 1건을 등록하면, 대상 셀러마다
//   · 상품명      generateDisplayName(sellerSeed)  — 셀러별 다른 SEO 조합
//   · 상세 본문   generateStoryV2(sellerSeed)      — 셀러별 다른 후기/문단
//   · 대표이미지  shuffleWithSeed(sellerSeed)      — 셀러별 다른 첫 장
//   · 상세 레이아웃 selectWithSeed(shUserId)       — 빌더가 자동 적용
// 이 네 가지가 전부 달라진다. 시드가 megaload_user_id 라 결정적이고(재실행해도 동일),
// 셀러끼리는 절대 겹치지 않는다.
//
// ⚠️ 수량·옵션은 건드리지 않는다 — stock 고정, 옵션은 카탈로그 원본 그대로.
// ─────────────────────────────────────────────────────────────

interface CatalogImage {
  id: string;
  name: string;
  mime_type?: string;
  width?: number | null;
  height?: number | null;
  kind: 'main' | 'detail' | 'option';
  cdn_url?: string | null;
}

interface CatalogRow {
  id: string;
  product_name: string;
  display_name: string | null;
  brand: string | null;
  manufacturer: string | null;
  coupang_category_code: string | null;
  suggested_price: number | null;
  cost_price: number | null;
  images: CatalogImage[];
  options: unknown[];
  notices: Record<string, unknown> | null;
  attributes: Record<string, unknown> | null;
  status: string;
  is_visible: boolean;
}

export interface RegisterResult {
  ok: boolean;
  skipped?: boolean;
  skipReason?: SkipReason;
  channelProductId?: string;
  shProductId?: string;
  error?: string;
  /** dryRun 일 때만 — 셀러별로 무엇이 달라졌는지 확인용 */
  preview?: {
    displayName: string;
    categoryCode: string;
    categoryPath: string;
    price: number;
    mainImage: string;
    mainImageUrl: string;
    storyFirstLine: string;
    imageCount: number;
  };
}

function inferExt(name: string, mime: string): string {
  const m = name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/);
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/** 카탈로그 상품 id → 안정적인 productIndex (생성기 시드 분산용) */
function stableIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

/**
 * 상품명에서 중량을 뽑아 필수 구매옵션 값으로 쓴다.
 *
 * 왜 필요한가: 빌더는 상품명에 중량이 하나일 때만 값을 채운다.
 * "썬 골드키위 특대과 점보 5kg 5.8kg" 처럼 여러 개면 무엇이 대표값인지 몰라
 * "상세페이지 참조" 로 폴백하고, 쿠팡은 그 값을 거부한다(실측).
 * 사람이 검수 화면에서 하나를 고르는 것과 같은 판단을 여기서 대신한다 —
 * **맨 앞에 적힌 중량**이 그 상품의 대표 규격이다(뒤는 대개 변형·참고치).
 */
function pickWeightFromName(name: string): string {
  const m = String(name || '').match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g)/i);
  if (!m) return '';
  return `${m[1]}${m[2].toLowerCase()}`;
}

/**
 * 셀러별 대표이미지 변형 — 같은 원본이라도 셀러마다 다른 이미지 파일이 되게 만든다.
 *
 * 왜 필요한가: 카탈로그 상품의 대표이미지는 보통 1~3장인데 대상 셀러는 수십 명이다.
 * 라운드로빈만으로는 장수가 모자라 겹친다(실측: 대표 3장 / 셀러 27명 → 3종류뿐).
 * 쿠팡은 동일 이미지를 같은 상품으로 묶어 아이템위너 경쟁을 붙이므로, 겹치면 안 된다.
 *
 * 무엇을 하는가: 시드 기반으로 가장자리 crop + 미세 밝기/채도 조정 → 픽셀이 달라진 새 파일.
 * 상품 자체는 그대로라 오인 소지가 없고, 셀러가 같으면 몇 번을 돌려도 같은 결과가 나온다.
 *
 * 실패하면 원본 URL 을 그대로 돌려준다 — 변형 실패로 등록 자체가 막히면 안 된다.
 */
async function makeSellerMainImage(
  serviceClient: SupabaseClient,
  url: string,
  sellerSeed: string,
  megaloadUserId: string,
  catalogProductId: string,
): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return url;
    const input = Buffer.from(await res.arrayBuffer());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Jimp: any;
    try {
      Jimp = (await import('jimp')).default || (await import('jimp'));
    } catch {
      return url; // jimp 없으면 변형 없이 진행
    }

    const image = await Jimp.read(input);
    const w: number = image.getWidth?.() ?? image.bitmap?.width ?? 0;
    const h: number = image.getHeight?.() ?? image.bitmap?.height ?? 0;
    if (!w || !h) return url;

    const rng = createSeededRandom(stringToSeed(`${sellerSeed}::img::${catalogProductId}`));

    // 쿠팡 대표이미지 규격: 500~5000px, 10MB 이하. 이 범위를 절대 벗어나지 않게 만든다.
    //
    // 변형은 "가로세로 비율을 유지한 채 1~4% 축소 크롭 + 육안으로 안 보이는 밝기 차이" 만 준다.
    // 상품이 잘리거나 찌그러지면 노출과 전환이 나빠지므로 그 이상은 손대지 않는다.
    const COUPANG_MIN = 500;
    const COUPANG_MAX = 5000;

    const keep = 0.96 + rng() * 0.03;               // 96~99% 만 남긴다 = 1~4% 크롭
    let cw = Math.round(w * keep);
    let ch = Math.round(h * keep);                   // 같은 비율로 줄여 종횡비 유지

    // 크롭 후 최소 규격을 못 지키면 크롭하지 않는다(밝기 차이만으로 구분).
    if (cw >= COUPANG_MIN && ch >= COUPANG_MIN && cw <= w && ch <= h) {
      const x = Math.floor(rng() * (w - cw));        // 남는 여백 안에서 시드로 위치 선택
      const y = Math.floor(rng() * (h - ch));
      image.crop(x, y, cw, ch);
    } else {
      cw = w; ch = h;
    }

    // 상한 초과 시 비율 유지하며 축소 (원본이 큰 경우 대비)
    if (image.getWidth() > COUPANG_MAX || image.getHeight() > COUPANG_MAX) {
      const f = Math.min(4500 / image.getWidth(), 4500 / image.getHeight());
      image.resize(Math.round(image.getWidth() * f), Math.round(image.getHeight() * f));
    }
    // 하한 미달 시 비율 유지하며 확대
    if (image.getWidth() < COUPANG_MIN || image.getHeight() < COUPANG_MIN) {
      const f = Math.max(800 / image.getWidth(), 800 / image.getHeight());
      image.resize(Math.round(image.getWidth() * f), Math.round(image.getHeight() * f));
    }

    // 육안으로 구분 안 되는 수준(±1.5%)의 밝기 차 — 픽셀 해시만 갈라놓는다.
    image.brightness((rng() - 0.5) * 0.03);

    const MIME_JPEG = Jimp.MIME_JPEG || 'image/jpeg';
    let quality = 92;
    let out = Buffer.from(await image.quality(quality).getBufferAsync(MIME_JPEG));
    while (out.length > 10 * 1024 * 1024 && quality > 50) {
      quality -= 10;
      out = Buffer.from(await image.quality(quality).getBufferAsync(MIME_JPEG));
    }
    // 그래도 상한을 못 맞추면 변형을 포기하고 원본을 쓴다 — 규격 위반 업로드는 하지 않는다.
    if (out.length > 10 * 1024 * 1024) return url;

    const path = `megaload/${megaloadUserId}/variant/${catalogProductId}.jpg`;
    const bucket = serviceClient.storage.from('product-images');
    const { error } = await bucket.upload(path, out, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) return url;
    return bucket.getPublicUrl(path).data.publicUrl;
  } catch {
    return url;
  }
}

/**
 * 카탈로그 상품 1건을 셀러 1명의 쿠팡 계정에 등록한다.
 *
 * dryRun=true 면 페이로드 빌드까지만 하고 쿠팡 호출과 DB 기록을 건너뛴다.
 * → 실제 등록 전에 "셀러마다 정말 다르게 나오는가"를 비용 없이 눈으로 확인할 수 있다.
 */
export async function registerCatalogProductForUser(
  serviceClient: SupabaseClient,
  params: {
    megaloadUserId: string;
    catalogProductId: string;
    eligibility: Eligibility;
    stock?: number;
    dryRun?: boolean;
    /**
     * 캠페인이 배정한 대표이미지 인덱스.
     * 셀러끼리 같은 대표이미지를 쓰지 않도록 캠페인 생성 시 라운드로빈으로 정해 넘긴다.
     * 없으면(단건 등록) 셀러 시드 셔플로 고른다.
     */
    mainImageIndex?: number;
  },
): Promise<RegisterResult> {
  const { megaloadUserId, catalogProductId, eligibility, stock = 999, dryRun = false, mainImageIndex } = params;

  if (!eligibility.eligible || !eligibility.outboundCode || !eligibility.returnCode) {
    return { ok: false, skipped: true, skipReason: eligibility.skipReason || 'no_shipping', error: eligibility.detail };
  }

  // 1) 카탈로그 상품
  const { data: catRow } = await serviceClient
    .from('catalog_products')
    .select('*')
    .eq('id', catalogProductId)
    .maybeSingle();
  const catalog = catRow as unknown as CatalogRow | null;
  if (!catalog) return { ok: false, error: '카탈로그 상품을 찾을 수 없습니다.' };
  if (catalog.status !== 'active' || !catalog.is_visible) {
    return { ok: false, error: '등록 가능 상태가 아닙니다 (active + visible 필요).' };
  }
  if (!catalog.coupang_category_code) {
    return { ok: false, error: '쿠팡 카테고리코드가 없습니다 — 카탈로그에서 먼저 분류해야 합니다.' };
  }
  const price = catalog.suggested_price || 0;
  if (price <= 0) return { ok: false, error: '제안 판매가가 없습니다.' };

  // 2) 중복 등록 방지 — 같은 상품을 같은 셀러에게 두 번 올리지 않는다.
  const { data: dup } = await serviceClient
    .from('catalog_registrations')
    .select('id, status')
    .eq('catalog_product_id', catalogProductId)
    .eq('megaload_user_id', megaloadUserId)
    .eq('channel', 'coupang')
    .maybeSingle();
  if (dup && (dup as { status: string }).status !== 'failed') {
    return { ok: false, skipped: true, skipReason: 'already_registered' };
  }

  // 3) 어댑터
  let adapter: CoupangAdapter;
  try {
    adapter = (await getAuthenticatedAdapter(serviceClient, megaloadUserId, 'coupang')) as CoupangAdapter;
  } catch (err) {
    return { ok: false, skipped: true, skipReason: 'no_credentials', error: err instanceof Error ? err.message : String(err) };
  }
  const vendorId = adapter.getVendorId();

  // 4) 이미지 — 동기화 때 만들어진 cdn_url 재사용, 없으면 Drive 에서 1회 복사
  const images = (catalog.images || []).filter((i) => i.id);
  if (images.length === 0) return { ok: false, error: '등록할 이미지가 없습니다.' };

  const resolved = await Promise.all(
    images.map(async (img, idx) => {
      let url = img.cdn_url || '';
      if (!url) {
        const { buffer, mimeType } = await downloadFile(img.id);
        const ext = inferExt(img.name, mimeType);
        const path = `catalog/${catalog.id}/${String(idx).padStart(3, '0')}_${img.id}.${ext}`;
        const { error } = await serviceClient.storage
          .from('product-images')
          .upload(path, buffer, { contentType: mimeType || 'image/jpeg', cacheControl: '31536000', upsert: true });
        if (error) throw new Error(`이미지 업로드 실패 (${img.name}): ${error.message}`);
        url = serviceClient.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }
      return { url, kind: img.kind, name: img.name, width: img.width ?? null, height: img.height ?? null };
    }),
  );

  // ── 셀러 고유 시드 — 클라이언트 등록 경로와 동일한 형식 ──
  const sellerSeed = `seller_${megaloadUserId}`;
  const productIndex = stableIndex(catalogProductId);

  // 대표이미지: 셀러마다 다른 장이 첫 번째가 되도록 시드 셔플.
  //   대표 후보가 1장뿐이면 셔플해도 같으므로, 상세컷을 후보에 합쳐 첫 장을 고른다.
  const mainCandidates = resolved.filter((r) => r.kind === 'main');
  const detailOnly = resolved.filter((r) => r.kind === 'detail');
  const shufflePool = mainCandidates.length > 1 ? mainCandidates : [...mainCandidates, ...detailOnly];
  if (shufflePool.length === 0) return { ok: false, error: '대표 이미지가 없습니다.' };

  // 후보 순서는 "상품" 기준으로 고정한다 — 셀러별로 순서가 흔들리면 라운드로빈 배정이 무의미해진다.
  const pool = shuffleWithSeed(shufflePool, `catalog_${catalogProductId}`);
  // 캠페인이 인덱스를 지정했으면 그대로 따른다(= 셀러끼리 겹치지 않음).
  // 단건 등록이라 지정이 없으면 셀러 시드로 고른다.
  const chosen =
    typeof mainImageIndex === 'number'
      ? pool[((mainImageIndex % pool.length) + pool.length) % pool.length]
      : shuffleWithSeed(pool, sellerSeed)[0];
  const shuffled = [chosen];

  // 라운드로빈으로 고른 장을 셀러별로 한 번 더 변형한다 — 장수가 셀러 수보다 적어도 겹치지 않게.
  const mainUrl = await makeSellerMainImage(serviceClient, shuffled[0].url, sellerSeed, megaloadUserId, catalogProductId);
  const mainImageUrls = [mainUrl];
  // 대표로 뽑힌 장은 상세에서 빼고, 나머지는 원래 순서 유지.
  const detailImageUrls = resolved
    .filter((r) => r.url !== shuffled[0].url && r.kind !== 'option')
    .map((r) => r.url);

  // 5) 카테고리 — 경로(생성기용) + 메타(고시/속성)
  const categoryCode = catalog.coupang_category_code;
  let categoryPath = '';
  let requiredBuyOptions: string[] = [];
  try {
    const { getCategoryDetails } = await import('./category-matcher');
    const det = await getCategoryDetails(categoryCode);
    categoryPath = det?.path || '';
    // 쿠팡이 필수로 요구하는 구매옵션 — 값이 안 채워지면 등록이 거부된다.
    requiredBuyOptions = (det?.buyOptions || []).filter((b) => b.required).map((b) => b.name);
  } catch {
    // 경로를 못 구해도 생성기는 폴백 풀로 동작한다.
  }

  let noticeMeta: NoticeCategoryMeta[] = [];
  let attributeMeta: AttributeMeta[] = [];
  try {
    const { getNoticeCategoriesWithCacheBatch } = await import('./notice-category-cache');
    const { getAttributesWithCacheBatch } = await import('./attribute-cache');
    const [nMap, aMap] = await Promise.all([
      getNoticeCategoriesWithCacheBatch(serviceClient, adapter, [categoryCode], { concurrency: 2, delayMs: 100 }),
      getAttributesWithCacheBatch(serviceClient, adapter, [categoryCode], { concurrency: 2, delayMs: 100 }) as Promise<Record<string, AttributeMeta[]>>,
    ]);
    noticeMeta = nMap[categoryCode] || [];
    attributeMeta = aMap[categoryCode] || [];
  } catch (err) {
    console.warn('[catalog-register] 카테고리 메타 조회 실패:', err instanceof Error ? err.message : err);
  }

  // 6) 셀러별 상품명 — 같은 카탈로그 상품이어도 셀러마다 다른 제목이 나와야 한다.
  //
  // generateDisplayName 은 조합 수가 유한해서 셀러가 수십 명이면 충돌한다
  // (실측: 상품 80건 × 셀러 27명에서 0.97% 충돌). 제목이 같으면 쿠팡이 아이템위너로
  // 묶어버리므로, 이미 이 상품에 쓰인 제목을 조회해 겹치면 시드를 바꿔 다시 뽑는다.
  const baseBrand = catalog.brand || '';
  const { data: usedRows } = await serviceClient
    .from('catalog_registrations')
    .select('display_name')
    .eq('catalog_product_id', catalogProductId)
    .neq('megaload_user_id', megaloadUserId)
    .not('display_name', 'is', null);
  const usedTitles = new Set(
    ((usedRows || []) as unknown as { display_name: string }[]).map((r) => r.display_name),
  );

  let displayName = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const seed = attempt === 0 ? sellerSeed : `${sellerSeed}#${attempt}`;
    displayName = generateDisplayName(
      catalog.display_name || catalog.product_name,
      baseBrand,
      categoryPath,
      seed,
      productIndex + attempt,
    );
    if (!usedTitles.has(displayName)) break;
  }
  if (usedTitles.has(displayName)) {
    // 12번을 다시 뽑아도 겹치면 등록하지 않는다 — 겹친 채 올리느니 건너뛴다.
    return { ok: false, error: `상품명이 다른 셀러와 겹칩니다(${displayName}). 이 상품은 셀러 수 대비 조합이 부족합니다.` };
  }

  // 7) 셀러별 상세 본문 — 문단/후기 조합이 셀러마다 달라진다.
  const story = generateStoryV2(displayName, categoryPath, sellerSeed, productIndex, {
    brand: baseBrand,
    noticeValues: (catalog.notices || {}) as Record<string, string>,
    attributeValues: (catalog.attributes || {}) as Record<string, string>,
  }, categoryCode);

  // 8) 페이로드
  const deliveryInfo: DeliveryInfo = {
    deliveryCompanyCode: 'CJGLS',
    deliveryChargeType: 'FREE',
    deliveryCharge: 0,
    freeShipOverAmount: 0,
    deliveryChargeOnReturn: 5000,
    outboundShippingPlaceCode: eligibility.outboundCode,
  };
  const returnInfo: ReturnInfo = {
    returnCenterCode: eligibility.returnCode,
    returnCharge: 5000,
    companyContactNumber: eligibility.contactNumber || '',
    afterServiceContactNumber: eligibility.contactNumber || '',
    afterServiceInformation: '상품 이상 시 고객센터로 연락 바랍니다.',
  };

  const preventionConfig: PreventionConfig = {
    ...DEFAULT_PREVENTION_CONFIG,
    sellerBrand: eligibility.sellerBrand || '',
  };

  // 필수 구매옵션 중 중량 항목은 상품명에서 뽑은 대표값을 명시한다.
  // 이게 없으면 중량이 여러 개인 상품이 전부 "상세페이지 참조" 로 떨어져 등록이 거부된다.
  const buyOptionValuesOverride: Record<string, string> = {};
  const weight = pickWeightFromName(catalog.product_name);
  if (weight) {
    for (const optName of requiredBuyOptions) {
      if (/중량|무게/.test(optName)) buyOptionValuesOverride[optName] = weight;
    }
  }

  const product: BuildPayloadProduct = {
    productCode: `CAT-${catalog.id.slice(0, 8)}`,
    folderPath: `catalog/${catalog.id}`,
    name: catalog.product_name,
    brand: baseBrand || '자체',
    sellingPrice: price,
    sourcePrice: catalog.cost_price || price,
    categoryCode,
    categoryPath,
    tags: [],
    description: '',
    mainImages: [shuffled[0].name],
    detailImages: resolved.filter((r) => r.url !== shuffled[0].url && r.kind !== 'option').map((r) => r.name),
    reviewImages: [],
    infoImages: [],
    noticeMeta,
    attributeMeta,
    // 셀러별 차별화 결과를 override 로 주입 — 빌더가 그대로 쓴다.
    displayProductNameOverride: displayName,
    aiDisplayName: displayName,
    // 원본 상품정보제공고시 — 고시/속성 값을 상품명이나 폴백("상세페이지 참조")으로 추측하기 전에
    // 이 사실값을 먼저 쓴다. 없으면 쿠팡이 "유효하지 않은 구매 옵션 값" 으로 거부한다.
    providedNotice: catalog.notices ?? undefined,
    buyOptionValuesOverride: Object.keys(buyOptionValuesOverride).length ? buyOptionValuesOverride : undefined,
    storyParagraphsOverride: story.paragraphs,
    reviewTextsOverride: story.reviewTexts,
    contentBlocksOverride: story.contentBlocks,
    manufacturerOverride: catalog.manufacturer || undefined,
  };

  // 쿠팡이 brandId 를 필수로 요구하는 판매자가 있다(실측: 26계정 중 1곳이 전량 거부).
  // WING 에 등록된(enrolled) 브랜드가 있으면 그중 하나를 기본 brandId 로 붙인다.
  // 없으면 붙이지 않고 진행 — 대부분의 계정은 brandId 없이도 등록된다.
  let resolvedBrandId: string | undefined;
  let resolvedBrandName: string | undefined;
  if (eligibility.sellerBrand) {
    try {
      const creds = adapter.getCredentials();
      const enrolled = await fetchEnrolledCoupangBrands(creds);
      if (enrolled.length > 0) {
        const hit = await resolveCoupangBrandId(creds, eligibility.sellerBrand, { enrolledCache: enrolled }).catch(() => null);
        if (hit) { resolvedBrandId = hit.brandId; resolvedBrandName = hit.brandName; }
      }
    } catch {
      // 브랜드 조회 실패는 치명적이지 않다 — brandId 없이 등록을 시도한다.
    }
  }

  let payload: Record<string, unknown>;
  try {
    const built = await buildProductPayload({
      product,
      vendorId,
      deliveryInfo,
      returnInfo,
      stock,
      shUserId: megaloadUserId,       // 상세 레이아웃 변형 시드로도 쓰인다
      preventionConfig,
      vendorUserId: eligibility.wingUserId || undefined,
      resolvedBrandId,
      resolvedBrandName,
      sellerBrand: eligibility.sellerBrand || undefined,
      mainImageUrls,
      detailImageUrls,
      reviewImageUrls: [],
      infoImageUrls: [],
      aiStoryParagraphs: story.paragraphs,
      aiReviewTexts: story.reviewTexts,
      contentBlocks: story.contentBlocks,
      skipAiNoticeFill: dryRun,
    });
    payload = built.payload;
  } catch (err) {
    return { ok: false, error: `페이로드 빌드 실패: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 필수 구매옵션에 폴백("상세페이지 참조")이 남아 있으면 쿠팡이 "허용되지 않는 구매옵션 값"
  // 으로 거부한다(실측: 토마토 카테고리 72498). 쏘기 전에 걸러 실패율을 낮춘다.
  if (requiredBuyOptions.length > 0) {
    // attributes 는 최상위가 아니라 sellerProductItemList(또는 items) 각 항목 안에 있다.
    const items = (payload.sellerProductItemList || payload.items || []) as Record<string, unknown>[];
    const attrs = items.flatMap(
      (it) => (it.attributes || []) as { attributeTypeName?: string; attributeValueName?: string }[],
    );
    const unresolved = attrs
      .filter((a) => requiredBuyOptions.includes(String(a.attributeTypeName || '')))
      .filter((a) => /상세\s*페이지\s*참조|상세정보\s*참고/.test(String(a.attributeValueName || '')))
      .map((a) => a.attributeTypeName);
    if (unresolved.length > 0) {
      return {
        ok: false,
        skipped: true,
        skipReason: 'no_option_value',
        error: `필수 구매옵션 값을 상품정보에서 찾지 못했습니다: ${unresolved.join(', ')} (카테고리 ${categoryCode})`,
      };
    }
  }

  if (dryRun) {
    return {
      ok: true,
      preview: {
        displayName: String(payload.sellerProductName || displayName),
        categoryCode,
        categoryPath,
        price,
        mainImage: `${shuffled[0].name}${mainUrl !== shuffled[0].url ? '+변형' : ''}`,
        mainImageUrl: mainUrl,
        storyFirstLine: (story.paragraphs[0] || '').slice(0, 60),
        imageCount: mainImageUrls.length + detailImageUrls.length,
      },
    };
  }

  // 9) 쿠팡 등록
  let channelProductId: string;
  try {
    const res = await adapter.createProduct(payload);
    channelProductId = res.channelProductId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await serviceClient.from('catalog_registrations').upsert(
      {
        catalog_product_id: catalogProductId,
        megaload_user_id: megaloadUserId,
        channel: 'coupang',
        status: 'failed',
        error_message: msg.slice(0, 1000),
      },
      { onConflict: 'catalog_product_id,megaload_user_id,channel' },
    );
    return { ok: false, error: msg };
  }

  // 10) 우리 DB 반영
  const { data: shp } = await serviceClient
    .from('sh_products')
    .insert({
      megaload_user_id: megaloadUserId,
      coupang_product_id: channelProductId,
      product_name: catalog.product_name,
      display_name: displayName,
      brand: catalog.brand,
      manufacturer: catalog.manufacturer,
      status: 'active',
      raw_data: {
        source: 'admin_bulk',
        catalog_product_id: catalogProductId,
        coupang_category_code: categoryCode,
        seller_seed: sellerSeed,
      },
    })
    .select('id')
    .single();
  const shProductId = (shp as { id: string } | null)?.id;

  if (shProductId) {
    await serviceClient.from('sh_product_images').insert(
      resolved.map((r, i) => ({
        product_id: shProductId,
        image_url: r.url === shuffled[0].url ? mainUrl : r.url,
        cdn_url: r.url === shuffled[0].url ? mainUrl : r.url,
        image_type: r.url === shuffled[0].url ? 'main' : r.kind === 'option' ? 'option' : 'detail',
        sort_order: i,
        width: r.width,
        height: r.height,
      })),
    );
    // 옵션·수량은 카탈로그 원본 그대로 — 셀러별로 건드리지 않는다.
    await serviceClient.from('sh_product_options').insert({
      product_id: shProductId,
      option_name: '기본',
      sale_price: price,
      cost_price: catalog.cost_price ?? null,
    });
    await serviceClient.from('sh_product_channels').insert({
      product_id: shProductId,
      channel: 'coupang',
      channel_product_id: channelProductId,
      status: 'active',
    });
  }

  await serviceClient.from('catalog_registrations').upsert(
    {
      catalog_product_id: catalogProductId,
      megaload_user_id: megaloadUserId,
      channel: 'coupang',
      sh_product_id: shProductId ?? null,
      channel_product_id: channelProductId,
      display_name: displayName,
      status: 'succeeded',
      error_message: null,
      registered_at: new Date().toISOString(),
    },
    { onConflict: 'catalog_product_id,megaload_user_id,channel' },
  );

  return { ok: true, channelProductId, shProductId };
}
