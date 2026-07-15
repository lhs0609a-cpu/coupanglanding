/**
 * 채널 카테고리 리졸버 — 쿠팡 카테고리 → 대상 채널 leaf 카테고리 (grounded).
 *
 * 왜 이게 필요한가:
 *   기존 ai.service.mapCategory 는 GPT 에게 "이 채널 카테고리 코드 추천해줘"만 시켜
 *   존재하지 않는 코드를 환각(hallucination)했다. 채널마다 카테고리 트리·코드가 전혀 달라
 *   (지마켓 9자리 / 네이버 8자리 / 11번가 7자리 dispCtgrNo / 롯데온 std_cat_id …) 자유생성은
 *   거의 100% 무효 코드가 된다.
 *
 * 해결(플레이오토/사방넷 등 상용툴과 동일한 정석):
 *   1) 사전계산 크로스워크(coupang→channel) 데이터가 있으면 그걸 사용(결정론적).
 *   2) 없으면 채널의 실제 카테고리 API(adapter.searchCategory)로 후보를 가져와
 *      그 후보 안에서만 AI 가 선택(verifyCategoryFromCandidates — 후보 외 코드 거부).
 *   3) 확신이 낮으면 null → 러너가 needs_input 으로 보류(무효 코드 전송 절대 금지).
 *
 * 채널 지식(코드 포맷/검색 방식)은 어댑터 안에만, 여기선 채널 독립적으로 조합만 한다(ACL).
 */
import type { BaseAdapter } from '../adapters/base.adapter';
import type { Channel } from '../types';
import type { CanonicalProduct } from './canonical-product';
import { verifyCategoryFromCandidates } from './ai.service';
import detailsJson from '../data/coupang-cat-details.json';
import coupangToNaverMap from '../data/coupang-to-naver-map.json';
import coupangToAuctionMap from '../data/coupang-to-auction-map.json';

/** 이 값 미만 신뢰도는 채택하지 않고 보류(needs_input) → 오분류 리스팅 차단 */
const CONFIDENCE_FLOOR = 0.5;
const MAX_CANDIDATES = 20;

export interface ChannelCategoryResolution {
  channelCategoryId: string;
  channelCategoryName: string | null;
  confidence: number;
  source: 'precomputed' | 'grounded';
}

/** 쿠팡 카테고리 코드 → 전체 경로 (coupang-cat-details.json: {code:{p:path}}) */
function coupangPath(code: string | null | undefined): string | null {
  if (!code) return null;
  const entry = (detailsJson as Record<string, { p?: string }>)[code];
  return entry?.p || null;
}

/** 경로에서 leaf(최하위) 이름 추출: "식품>신선식품>과일류>과일>사과" → "사과" */
function leafName(path: string | null): string {
  if (!path) return '';
  const seg = path.split('>').map((s) => s.trim()).filter(Boolean);
  return seg[seg.length - 1] || '';
}

/**
 * 사전계산 크로스워크 레지스트리 — 채널별 `coupang-to-{channel}-map.json`.
 * 형식(네이버맵과 동일): { map: { [coupangCode]: { c: channelCode, n?: confidence, nm?: name } } }
 *
 * ⚠️ 동적 require(`../data/${channel}...`) 는 webpack 이 data/ 전체를 번들링하고
 *    "Critical dependency" 경고를 내므로 금지. 오프라인 맵을 채널별로 만들면
 *    여기 static import 를 추가하고 아래 레지스트리에 등록한다(번들 안전).
 *    (예: import gmarketMap from '../data/coupang-to-gmarket-map.json'; PRECOMPUTED.gmarket = gmarketMap;)
 */
type CrosswalkFile = { map?: Record<string, { c: string; n?: number; nm?: string }> };
const PRECOMPUTED: Partial<Record<Channel, CrosswalkFile>> = {
  // naver: naver-to-coupang-map 반전(scripts/build-coupang-naver-map.cjs). 2,737 쿠팡코드 커버, 나머지는 grounded 폴백.
  naver: coupangToNaverMap as unknown as CrosswalkFile,
  // auction: 옥션 무인증 XML 이름/경로 유사도(scripts/build-coupang-auction-map.cjs). 도메인 가드로 고정밀 1,437, 나머지 grounded.
  auction: coupangToAuctionMap as unknown as CrosswalkFile,
  // gmarket: ESM_BU_CAT_MATCHING.xlsx(sd↔gmkt) 필요 / 11번가·롯데온: 크레덴셜 후 트리 크롤 — 순차 추가
};

function lookupPrecomputed(channel: Channel, coupangCode: string | null | undefined): ChannelCategoryResolution | null {
  if (!coupangCode) return null;
  const hit = PRECOMPUTED[channel]?.map?.[coupangCode];
  if (hit?.c) {
    return {
      channelCategoryId: hit.c,
      channelCategoryName: hit.nm || null,
      confidence: typeof hit.n === 'number' ? hit.n : 0.9,
      source: 'precomputed',
    };
  }
  return null;
}

/**
 * 쿠팡 카테고리(+상품명)를 대상 채널의 실제 leaf 카테고리로 해소.
 * 반환 null = 확신 있는 매핑 실패 → 호출측(러너)이 needs_input 으로 보류해야 함.
 *
 * ⚠️ adapter.searchCategory 는 인증된 채널 API 를 호출한다(자격증명 없으면 throw → null).
 *    (channel,쿠팡카테고리) 단위 캐시는 러너(sh_category_mappings)가 담당 → 상품마다 재호출 안 함.
 */
export async function resolveChannelCategory(opts: {
  adapter: BaseAdapter;
  channel: Channel;
  canonical: CanonicalProduct;
}): Promise<ChannelCategoryResolution | null> {
  const { adapter, channel, canonical } = opts;

  // 1) 사전계산 크로스워크 (결정론적, 최우선)
  const pre = lookupPrecomputed(channel, canonical.sourceCategoryCode);
  if (pre) return pre;

  // 2) grounded: 쿠팡 leaf 이름을 질의어로 채널 실제 후보를 가져와 그 안에서 선택
  const cpPath = coupangPath(canonical.sourceCategoryCode);
  const leaf = leafName(cpPath);
  const firstToken = (canonical.name || '').trim().split(/\s+/).find((w) => w.length >= 2) || '';
  const queries = [leaf, firstToken].filter(Boolean);

  let candidates: { code: string; path: string }[] = [];
  for (const q of queries) {
    try {
      const res = await adapter.searchCategory(q);
      candidates = (res.items || [])
        .map((c) => ({ code: c.id, path: c.path || c.name }))
        .filter((c) => c.code);
    } catch {
      candidates = [];
    }
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) return null;

  // 3) 후보 안에서만 선택 — 후보 외 코드는 verifyCategoryFromCandidates 가 reject(환각 차단)
  const picked = await verifyCategoryFromCandidates(
    `${canonical.name} ${leaf}`.trim(),
    candidates.slice(0, MAX_CANDIDATES),
  );
  if (!picked || picked.confidence < CONFIDENCE_FLOOR) return null;

  return {
    channelCategoryId: picked.code,
    channelCategoryName: picked.path,
    confidence: picked.confidence,
    source: 'grounded',
  };
}
