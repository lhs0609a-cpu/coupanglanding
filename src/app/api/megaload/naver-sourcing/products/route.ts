import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;
/** 한 번에 올릴 수 있는 최대 건수 — 목록 수집은 카테고리당 60개 안팎이라 넉넉하다. */
const MAX_UPSERT = 1000;

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
  const onlyDetail = searchParams.get('detail') === '1';
  const sort = searchParams.get('sort') || 'recent';   // recent | price | review

  const service = await createServiceClient();
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
  if (onlyDetail) query = query.eq('detail_status', 'done');

  if (sort === 'price') query = query.order('price', { ascending: true });
  else if (sort === 'review') query = query.order('review_count', { ascending: false });
  else query = query.order('collected_at', { ascending: false });

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    products: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > from + (data?.length ?? 0),
  });
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

  const items = (body.items ?? []).filter((c) => c && c.productNo && c.url);
  if (!items.length) return NextResponse.json({ error: '저장할 상품이 없습니다.' }, { status: 400 });
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
  return NextResponse.json({ ok: true, saved: data?.length ?? rows.length });
}
