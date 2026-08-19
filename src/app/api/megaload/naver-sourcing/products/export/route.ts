import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** 한 번에 가져갈 수 있는 상품 수 — 셀러 PC 가 이미지를 받아야 하므로 무한정 열어두지 않는다. */
const MAX_EXPORT = 200;

/**
 * POST — 고른 상품의 **전체 데이터**(옵션·상세글·고시정보·이미지 URL)를 내려준다.
 *
 * 목록 조회(GET /products)는 격자에 뿌릴 가벼운 필드만 준다. 여기는 셀러가 "내 상품으로
 * 가져오기"를 눌렀을 때 딱 한 번 부르는 무거운 쪽이다 — 그래서 분리했다.
 *
 * ★ 이미지는 **URL** 이다. 바이트는 서버에 없다(상품 1건이 원본 107MB). 셀러 PC 의 도우미가
 *   이 URL 로 CDN(pstatic)에서 직접 받는다. 그 경로엔 로그인도 안티봇도 없어서, 셀러는
 *   네이버 로그인·캡차·429 를 겪지 않는다.
 * ★ 읽기는 로그인한 모두에게 열려 있다(수집물은 셀러 전원 공개로 확정).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: { ids?: string[] } = {};
  try { body = await request.json(); } catch { /* 아래에서 걸린다 */ }
  const ids = (body.ids ?? []).filter((s) => typeof s === 'string' && s);
  if (!ids.length) return NextResponse.json({ error: '선택된 상품이 없습니다.' }, { status: 400 });
  if (ids.length > MAX_EXPORT) {
    return NextResponse.json({ error: `한 번에 ${MAX_EXPORT}개까지만 가져올 수 있습니다.` }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from('sh_naver_sourcing_products')
    .select('id, product_no, origin_product_no, url, title, price, thumb, naver_category_id, category_path, detail_status, detail, images')
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string; product_no: string; origin_product_no: string | null; url: string;
    title: string; price: number; thumb: string | null;
    naver_category_id: string | null; category_path: string | null;
    detail_status: string;
    detail: { options?: unknown[]; detailText?: string; notice?: unknown; brand?: string; categoryPath?: string; categoryId?: string } | null;
    images: { main?: string[]; detail?: string[]; review?: string[] } | null;
  };

  const rows = (data ?? []) as Row[];
  // 상세를 아직 안 받은 상품은 대표 이미지 1장뿐이라 올인원이 제대로 만들지 못한다.
  // 조용히 반쪽짜리를 넘기지 말고 **왜 빠졌는지** 알려 준다.
  const ready = rows.filter((r) => r.detail_status === 'done');
  const notReady = rows.filter((r) => r.detail_status !== 'done');

  const products = ready.map((r) => ({
    productNo: r.product_no,
    originProductNo: r.origin_product_no || '',
    url: r.url,
    title: r.title,
    price: r.price,
    brand: r.detail?.brand || '',
    categoryPath: r.detail?.categoryPath || r.category_path || '',
    categoryId: r.detail?.categoryId || r.naver_category_id || '',
    options: r.detail?.options ?? [],
    detailText: r.detail?.detailText || '',
    notice: r.detail?.notice ?? null,
    images: {
      main: r.images?.main?.length ? r.images.main : (r.thumb ? [r.thumb] : []),
      detail: r.images?.detail ?? [],
      review: r.images?.review ?? [],
    },
  }));

  return NextResponse.json({
    products,
    skipped: notReady.map((r) => ({ id: r.id, title: r.title, reason: '상세 미확보' })),
  });
}
