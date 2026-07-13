/**
 * POST /api/megaload/products/bulk-register/registered-codes  { productCodes: string[] }
 *   내 쿠팡 계정에 이미 등록된 상품(productCode)만 골라 반환.
 *   업로드 전 검수화면에서 "이미 등록됨" 표시 + 제외/그냥등록 선택에 사용.
 *   → { registered: string[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  let shUserId: string;
  try {
    shUserId = await ensureMegaloadUser(supabase, service, user.id);
  } catch {
    return NextResponse.json({ registered: [] });
  }

  const body = await req.json().catch(() => ({}));
  const productCodes: string[] = Array.isArray(body?.productCodes)
    ? body.productCodes.map((c: unknown) => String(c || '')).filter(Boolean).slice(0, 3000)
    : [];
  if (productCodes.length === 0) return NextResponse.json({ registered: [] });

  const { data, error } = await service
    .from('sh_products')
    .select('raw_data')
    .eq('megaload_user_id', shUserId)
    .in('raw_data->>productCode', productCodes);
  if (error) return NextResponse.json({ registered: [], error: error.message });

  const registered = Array.from(new Set(
    (data || [])
      .map((p) => (p.raw_data as Record<string, unknown> | null)?.productCode as string | undefined)
      .filter((c): c is string => !!c),
  ));
  return NextResponse.json({ registered });
}
