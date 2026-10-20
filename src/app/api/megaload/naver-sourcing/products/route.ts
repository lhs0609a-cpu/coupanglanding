import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isInSeason, fruitKindFromCategoryPath } from '@/lib/megaload/services/fruit-season';
import { assignToQueue } from '@/lib/megaload/detail-queue-assign';
import { isDetailExtractable } from '@/lib/megaload/naver-store-type';
import { UNCLASSIFIED, PATH_SEP, flattenTree, pathMatches } from '@/lib/megaload/naver-category-tree';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;
/** 한 번에 올릴 수 있는 최대 건수 — 목록 수집은 카테고리당 60개 안팎이라 넉넉하다. */
const MAX_UPSERT = 1000;

/**
 * 상세를 못 뽑는 스토어(네이버 마켓·쇼핑윈도)를 **카탈로그에 담지 않는다.**
 * 담아 봐야 셀러가 고를 수 없고(카드에 '상세 미지원'), 큐도 못 타니 자리만 차지한다.
 * 추출기가 그 유형을 지원하게 되면 이 상수를 true 로 되돌리면 된다 — 그때는 이미 수집된
 * 것부터 다시 긁으면 되므로 되돌리기 비용이 낮다.
 */
const KEEP_UNSUPPORTED_STORES = false;

/**
 * 상품이 아닌 카드 — 목록에 섞여 들어오는 배너다(실측 2026-08-20: 제목이 그냥 '전단행사'인
 * 줄이 3건 있었다). 제목 부분일치로 거르면 '전단행사 특가 사과 5kg' 같은 진짜 상품까지
 * 날아가므로 **제목 전체가 이 말뿐인 경우만** 버린다.
 */
const BANNER_TITLES = new Set([
  '전단행사', '전단', '기획전', '이벤트', '행사', '특가', '특가전', '알뜰쇼핑', '오늘의특가',
]);

function isBannerCard(title: string, url: string): boolean {
  const t = (title || '').trim();
  if (!t || t.length < 2) return true;                 // 제목이 없으면 상품으로 볼 수 없다
  if (BANNER_TITLES.has(t)) return true;
  return !/\/products\/\d+/.test(url);                 // 상품 상세 주소가 아니면 상품이 아니다
}

interface IncomingCard {
  productNo?: string;
  storeId?: string;
  url?: string;
  title?: string;
  price?: number;
  thumb?: string;
  reviewCount?: number;
  nvMid?: string;
  catId?: string;
}

/**
 * GET — 수집물 목록.
 * 읽기는 **로그인한 모두**에게 열려 있다(셀러도 본다). 수집은 네이버 예산을 태우는 비싼
 * 작업이라, 관리자 한 사람의 PC 메모리에만 있으면 같은 걸 계속 다시 긁게 된다.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  const path = (searchParams.get('path') || '').trim();     // 카테고리 트리에서 고른 이름 경로
  const onlyDetail = searchParams.get('detail') === '1';
  const sort = searchParams.get('sort') || 'recent';   // recent | price | review

  const service = await createServiceClient();

  // 관리자 여부를 **목록을 짜기 전에** 안다 — all=1 을 관리자에게만 허용해야 하기 때문이다.
  // (아래 응답에도 그대로 실어 보낸다. 화면이 삭제 버튼을 보일지 판단하는 데 쓴다)
  const { data: prof } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = prof?.role === 'admin';
  /**
   * 관리자 진단용 — 걸러진 줄까지 전부 본다(정리·집계에 필요하다).
   * ★ 관리자만이다. 예전엔 로그인한 누구나 ?all=1 로 숨긴 줄을 다 볼 수 있었다 —
   *   아래 필터가 "셀러에게 안 보이게 한다"는 약속을 하는데, 주소창 한 글자로 풀리면
   *   약속이 아니다.
   */
  const showAll = searchParams.get('all') === '1' && isAdmin;
  const from = (page - 1) * PAGE_SIZE;

  let query = service
    .from('sh_naver_sourcing_products')
    .select(
      'id, product_no, store_id, url, title, price, thumb, review_count, nv_mid,'
      + ' naver_category_id, category_path, detail_status, detail_at, folder_path, collected_at',
      { count: 'exact' },
    )
    .range(from, from + PAGE_SIZE - 1);

  if (q) query = query.ilike('title', `%${q}%`);
  if (category) query = query.eq('naver_category_id', category);

  // ── 카테고리 트리로 좁히기 ──
  // 이름 경로로 찾는다(트리 id 1000xxxx ≠ 상품 카테고리 id 5000xxxx — 자세한 이유는
  // naver-category-tree.ts). 상위를 고르면 하위도 나와야 하므로 '경로' 또는 '경로 > …' 이다.
  // ★ 단순 like '경로%' 는 안 된다 — 실제로 '휴대폰/카메라 > 휴대폰' 이 '…휴대폰액세서리' 를
  //   먹는 접두사 충돌이 트리에 3쌍 있다(실측). 구분자까지 포함해야 한다.
  if (path === UNCLASSIFIED) {
    // '미분류' = 트리 어느 가지에도 안 붙는 것 + 경로가 아예 없는 것.
    // 알려진 401개 경로를 not-in 으로 넘기면 URL 이 8KB 를 넘는다 → 실제로 존재하는
    // 고아 경로만 찾아서 in 으로 건다(보통 한두 개다).
    // ★ 한 요청은 1,000행에서 잘린다(Supabase 기본 max-rows) — limit(20000) 은 그냥 무시된다.
    //   categories/route.ts 와 같은 함정이라 같은 방식으로 끝까지 넘겨 읽는다(실측 2026-09-04).
    const paths: { category_path: string | null }[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data: chunk } = await service
        .from('sh_naver_sourcing_products').select('category_path').range(from, from + 999);
      paths.push(...(chunk ?? []));
      if ((chunk ?? []).length < 1000) break;
    }
    const nodes = flattenTree();
    const orphans = [...new Set((paths ?? [])
      .map((r) => (r.category_path || '').trim())
      .filter((p) => p && !nodes.some((n) => pathMatches(p, n.path))))].slice(0, 200);
    query = orphans.length
      ? query.or(`category_path.is.null,category_path.in.(${orphans.map((p) => `"${p}"`).join(',')})`)
      : query.is('category_path', null);
  } else if (path) {
    query = query.or(`category_path.eq.${path},category_path.like.${path}${PATH_SEP}*`);
  }
  if (onlyDetail) query = query.eq('detail_status', 'done');

  /**
   * ★ **등록까지 가는 것만** 보여 준다(사용자 확정 2026-10-20).
   * ---------------------------------------------------------------------------
   * 전에는 failed 만 뺐다. 그래서 화면에는 4,029건이 보이는데 실제로 등록까지 가는 건
   * 1,319건(33%)뿐이었다 — 나머지 2,710건은 상세가 아직 없는 requested/none 이다.
   * 그것들도 **고를 수는 있다**(isPickable 은 주소만 멀쩡하면 통과시킨다). 고르면 상세
   * 큐에 들어가 기다리는데, 그 큐는 네이버 게이트 때문에 분당 12건이 상한이고 실패율이
   * 83%다. 즉 셀러가 보는 3건 중 2건은 눌러 봐야 기다리다 실패하는 줄이었다.
   * "보여 주고 막는 것보다 안 보여 주는 게 맞다"는 2026-09-02 의 결정을 failed 에만
   * 적용했던 셈이라, 여기서 끝까지 적용한다 — done 만 남긴다.
   *
   * ⚠️ 카탈로그에서 **지우지는 않는다.** 숨길 뿐이다. 상세 수집은 수집 시점의
   *    assignToQueue 와 도우미의 adoptUnownedWork 로 돌아가므로(셀러가 눌러 주는 데
   *    의존하지 않는다) 숨겨도 파이프라인은 그대로 돌고, done 이 되는 순간 다시 나타난다.
   * ⚠️ 주소 화이트리스트(smartstore·brand)는 남겨 둔다. 지금은 done 중 어긋나는 줄이
   *    0건이라 효과가 없지만, 지원 범위가 넓어질 때 조용히 새는 것을 막는 그물이다.
   * 관리자는 all=1 로 전부 본다(무엇이 왜 빠졌는지 봐야 정리할 수 있다).
   */
  if (!showAll) {
    query = query
      .or('url.ilike.%smartstore.naver.com/%,url.ilike.%brand.naver.com/%')
      .eq('detail_status', 'done');
  }

  if (sort === 'price') query = query.order('price', { ascending: true });
  else if (sort === 'review') query = query.order('review_count', { ascending: false });
  else query = query.order('collected_at', { ascending: false });

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 관리자 여부(위에서 이미 읽었다)를 함께 준다 — 화면이 삭제 버튼과 '전부 보기'를 보일지
  // 판단하는 데 쓴다. 표시용일 뿐이고 실제 차단은 showAll 과 아래 DELETE 가 서버에서 한다.
  return NextResponse.json({
    products: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > from + (data?.length ?? 0),
    isAdmin,
  });
}

/**
 * DELETE — 카탈로그에서 줄을 지운다(관리자 전용).
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 수집은 완벽하지 않다. 실제로 '딸기' 를 골랐는데 형제 분류로 넘어가는 기능 탓에
 * 감귤·오렌지가 섞여 들어왔다(2026-08-26). 그 기능은 껐지만 **이미 들어간 줄은 남는다.**
 * 지울 길이 없으면 셀러 목록이 계속 오염된 채로 간다.
 *
 * 상세를 이미 받아 둔 줄도 지운다 — 잘못 들어온 상품은 상세가 있어도 쓰레기다.
 * 폴더는 관리자 PC 에 남지만 그건 디스크일 뿐이고, 카탈로그에서 사라지면 셀러는 못 고른다.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const service = await createServiceClient();
  const { data: prof } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && !!x) : [];
  if (!ids.length) return NextResponse.json({ error: '지울 상품을 고르세요.' }, { status: 400 });
  // 실수로 목록 전체가 날아가는 일이 없도록 한 번에 지울 수 있는 양을 묶는다.
  if (ids.length > 500) return NextResponse.json({ error: '한 번에 500개까지만 지웁니다.' }, { status: 400 });

  const { data, error } = await service
    .from('sh_naver_sourcing_products')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}

/**
 * POST — 수집 결과 저장(관리자 전용).
 * ★ product_no 로 **upsert** 한다. 같은 카테고리를 다시 수집하면 대부분 같은 상품이 나오는데,
 *   그때마다 줄이 늘면 목록이 금방 쓰레기가 된다. 재수집은 갱신이지 추가가 아니다.
 * ★ 이미 상세를 받아 둔 줄의 detail_status/detail 은 **건드리지 않는다** — 목록 재수집이
 *   비싸게 받아 둔 상세를 지워 버리면 안 된다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const service = await createServiceClient();
  const { data: profile } = await service
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 저장할 수 있습니다.' }, { status: 403 });
  }

  let body: { items?: IncomingCard[]; categoryPath?: string } = {};
  try { body = await request.json(); } catch { /* 아래에서 빈 배열로 걸린다 */ }

  const incoming = (body.items ?? []).filter((c) => c && c.productNo && c.url);

  // ── 담기 전에 거른다 ──
  // 예전엔 목록에 뜬 걸 전부 담았다. 그 결과 카탈로그에 **고를 수 없는 줄**(마켓·윈도)과
  // **상품이 아닌 줄**(배너)이 섞였고, 셀러는 그걸 고른 뒤에야 안 된다는 걸 알았다.
  const banner = incoming.filter((c) => isBannerCard(c.title || '', String(c.url)));
  const notBanner = incoming.filter((c) => !isBannerCard(c.title || '', String(c.url)));
  const unsupported = KEEP_UNSUPPORTED_STORES
    ? []
    : notBanner.filter((c) => !isDetailExtractable(String(c.url)));
  const items = KEEP_UNSUPPORTED_STORES
    ? notBanner
    : notBanner.filter((c) => isDetailExtractable(String(c.url)));

  if (!items.length) {
    return NextResponse.json({
      error: '저장할 상품이 없습니다.',
      skipped: { banner: banner.length, unsupported: unsupported.length },
    }, { status: 400 });
  }
  if (items.length > MAX_UPSERT) {
    return NextResponse.json({ error: `한 번에 ${MAX_UPSERT}건까지만 저장합니다.` }, { status: 400 });
  }

  const { data: mu } = await service
    .from('megaload_users').select('id').eq('profile_id', user.id).maybeSingle();

  const now = new Date().toISOString();
  const rows = items.map((c) => ({
    product_no: String(c.productNo),
    store_id: c.storeId || null,
    url: String(c.url),
    title: (c.title || '').slice(0, 300),
    price: Number.isFinite(Number(c.price)) ? Math.max(0, Math.round(Number(c.price))) : 0,
    thumb: c.thumb || null,
    review_count: Number.isFinite(Number(c.reviewCount)) ? Math.max(0, Math.round(Number(c.reviewCount))) : 0,
    nv_mid: c.nvMid || null,
    naver_category_id: c.catId || null,
    category_path: body.categoryPath || null,
    collected_by: mu?.id ?? null,
    collected_at: now,
  }));

  // onConflict=product_no — 있으면 갱신, 없으면 추가. detail_* 은 payload 에 없으므로 유지된다.
  const { data, error } = await service
    .from('sh_naver_sourcing_products')
    .upsert(rows, { onConflict: 'product_no' })
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── 담자마자 상세 수집을 예약한다 ──
  // 목록만 담아 두면 셀러 화면에는 "고를 수 없는 줄"로 보인다(상세가 없으면 등록이 안 된다).
  // 그래서 담는 즉시 큐에 올리고 도우미들에게 나눠 배정한다.
  //
  // ⚠️ **제철 품목만** 올린다. 전량을 미리 뽑던 시절에 419(SDW-E90419)가 누적되며 상세
  //    성공률이 88% → 0% 까지 떨어졌다(실측 2026-08-28~31). 지금 팔 수 없는 품목까지
  //    뽑느라 정작 필요한 상품이 뒤로 밀리는 걸 막는다. 비시즌은 'none' 으로 남겨 두고,
  //    셀러가 직접 고르면 그때 그 셀러 몫으로 요청된다.
  const fruitKind = fruitKindFromCategoryPath(body.categoryPath);
  const savedIds = ((data || []) as { id: string }[]).map((r) => r.id);
  let queued = 0;
  if (isInSeason(fruitKind) && savedIds.length > 0) {
    try {
      queued = await assignToQueue(service, savedIds);
    } catch {
      /* 큐 예약 실패가 수집 저장을 되돌리면 안 된다 — 나중에 일괄 큐잉으로 복구된다. */
    }
  }

  // 제외 건수를 함께 돌려준다 — 조종석이 "50개 긁었는데 42개만 저장" 을 설명할 수 있어야 한다.
  return NextResponse.json({
    ok: true,
    saved: data?.length ?? rows.length,
    skipped: { banner: banner.length, unsupported: unsupported.length },
    // 상세 수집 예약 결과 — 0 이면 비시즌이거나 이미 상세가 있는 상품들이다.
    detailQueued: queued,
    seasonQueued: isInSeason(fruitKind),
    fruitKind: fruitKind || null,
  });
}
