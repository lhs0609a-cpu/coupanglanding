import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * POST — 상세 추출 결과를 수집물에 반영한다.
 *
 * ★ 왜 쿠키가 아니라 Bearer 인가: 이 요청을 보내는 쪽은 브라우저가 아니라 **도우미**다.
 *   상세 추출은 건당 30~90초라 수십 건이면 몇 시간짜리 작업이고, 그동안 사람은 브라우저를
 *   닫거나 다른 화면에 가 있다. 저장이 "어느 탭이 열려 있었는가"에 달리면 안 된다는 걸
 *   목록 수집에서 이미 한 번 겪었다(카탈로그가 0건인 채로 남았다).
 *
 * ★ 이미지는 **URL 만** 받는다. 바이트는 서버에 두지 않는다 — 상품 1건이 원본 107MB, 줄여도
 *   7MB 다. 셀러는 등록 직전에 자기 PC 에서 CDN(pstatic)으로 직접 받으면 되고, 그 경로는
 *   로그인도 안티봇도 없다. 서버에는 상품당 수 KB 의 JSON 만 남는다.
 */
export async function POST(request: NextRequest) {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return NextResponse.json({ error: 'missing access token' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 500 });

  const userClient = createSbClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) return NextResponse.json({ error: 'invalid or expired session' }, { status: 401 });

  const service = await createServiceClient();
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 저장할 수 있습니다.' }, { status: 403 });
  }

  let body: {
    productNo?: string;
    originProductNo?: string;
    ok?: boolean;
    error?: string;
    url?: string;
    title?: string;
    price?: number;
    brand?: string;
    categoryPath?: string;
    categoryId?: string;
    options?: Array<{ optionName: string; price: number; stock: number; soldOut: boolean }>;
    detailText?: string;
    notice?: unknown;
    images?: { main?: string[]; detail?: string[]; review?: string[] };
    folderPath?: string;
  } = {};
  try { body = await request.json(); } catch { /* 아래에서 걸린다 */ }

  const productNo = String(body.productNo || '').trim();
  if (!productNo) return NextResponse.json({ error: 'productNo 가 없습니다.' }, { status: 400 });

  // 실패도 기록한다 — 안 그러면 실패한 상품을 매번 다시 시도하게 된다.
  if (body.ok === false) {
    const { error } = await service
      .from('sh_naver_sourcing_products')
      .update({ detail_status: 'failed', detail_at: new Date().toISOString(), detail: { error: body.error || '알 수 없음' } })
      .eq('product_no', productNo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'failed' });
  }

  const patch: Record<string, unknown> = {
    origin_product_no: body.originProductNo || null,
    detail_status: 'done',
    detail_at: new Date().toISOString(),
    detail: {
      options: body.options ?? [],
      detailText: (body.detailText || '').slice(0, 20000),
      notice: body.notice ?? null,
      brand: body.brand || '',
      categoryPath: body.categoryPath || '',
      categoryId: body.categoryId || '',
    },
    images: {
      main: body.images?.main ?? [],
      detail: body.images?.detail ?? [],
      review: body.images?.review ?? [],
    },
    folder_path: body.folderPath || null,
  };
  // 상세에서 확인된 값이 목록보다 정확하다 — 있으면 갱신한다(리뷰수는 목록이 5자리로 잘려 온다).
  if (body.title) patch.title = String(body.title).slice(0, 300);
  if (Number.isFinite(Number(body.price)) && Number(body.price) > 0) patch.price = Math.round(Number(body.price));
  if (body.categoryPath) patch.category_path = body.categoryPath;
  if (body.categoryId) patch.naver_category_id = body.categoryId;

  // 목록 수집을 거치지 않고 상세부터 받은 경우도 있으므로, 없으면 새로 만든다.
  const { data: existing } = await service
    .from('sh_naver_sourcing_products').select('id').eq('product_no', productNo).maybeSingle();

  if (existing) {
    const { error } = await service
      .from('sh_naver_sourcing_products').update(patch).eq('product_no', productNo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'updated' });
  }

  const { error } = await service.from('sh_naver_sourcing_products').insert({
    product_no: productNo,
    url: body.url || '',
    title: (body.title || '').slice(0, 300) || productNo,
    price: Number.isFinite(Number(body.price)) ? Math.round(Number(body.price)) : 0,
    ...patch,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'inserted' });
}
