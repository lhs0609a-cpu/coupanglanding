/**
 * GET /api/brands/wall
 *   브랜드 로고 월 — 노출 동의한 승인 공급사 로고 + 신뢰 지표(집계).
 *   공개 엔드포인트(마케팅) — 개별 민감정보 없음(회사명·로고·검증여부만).
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET() {
  const sc = await createServiceClient();

  // 노출 동의 + 승인 + 로고 있는 공급사
  const { data: suppliers } = await sc
    .from('suppliers')
    .select('id, company_name, brand_name, logo_url')
    .eq('status', 'approved')
    .eq('logo_public_consent', true)
    .not('logo_url', 'is', null)
    .limit(200);

  const ids = (suppliers || []).map((s) => (s as { id: string }).id);

  // 실판매 검증 뱃지 — 확정 판매 있는 공급사
  const verified = new Set<string>();
  if (ids.length > 0) {
    const { data: sales } = await sc
      .from('supplier_sales')
      .select('supplier_id')
      .in('supplier_id', ids)
      .eq('status', 'confirmed')
      .limit(2000);
    for (const s of (sales || []) as { supplier_id: string }[]) verified.add(s.supplier_id);
  }

  const brands = (suppliers || []).map((s) => {
    const r = s as { id: string; company_name: string; brand_name: string | null; logo_url: string | null };
    return { name: r.brand_name || r.company_name, logo_url: r.logo_url, verified: verified.has(r.id) };
  });

  // 셀러망 지난달 매출(신뢰 헤드라인) — api_revenue_snapshots 집계
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  let networkGmv = 0;
  const { data: snaps } = await sc
    .from('api_revenue_snapshots')
    .select('total_sales')
    .eq('year_month', prevYm);
  for (const s of (snaps || []) as { total_sales: number }[]) networkGmv += Number(s.total_sales) || 0;

  return NextResponse.json({
    brands,
    stats: { brandCount: brands.length, networkGmv, month: prevYm },
  });
}
