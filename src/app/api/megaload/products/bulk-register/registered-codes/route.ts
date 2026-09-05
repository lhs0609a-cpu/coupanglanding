/**
 * POST /api/megaload/products/bulk-register/registered-codes  { productCodes: string[] }
 *   내 쿠팡 계정에 이미 등록된 상품(productCode)만 골라 반환.
 *   업로드 전 검수화면에서 "이미 등록됨" 표시 + 제외/그냥등록 선택에 사용.
 *   네이버 소싱 카탈로그도 같은 열쇠를 쓴다 — 카탈로그의 채널상품번호(product_no)가
 *   도우미 폴더명(product_<번호>)을 거쳐 그대로 productCode 가 되기 때문이다.
 *   → { registered: string[], registeredAt: Record<productCode, ISO시각> }
 *
 * ⚠️ 여기서 아는 것은 "메가로드로 등록에 성공한 기록"뿐이다. 윙에서 직접 올린 상품은 모른다.
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
    return NextResponse.json({ registered: [], registeredAt: {} });
  }

  const body = await req.json().catch(() => ({}));
  const productCodes: string[] = Array.isArray(body?.productCodes)
    ? body.productCodes.map((c: unknown) => String(c || '')).filter(Boolean).slice(0, 3000)
    : [];
  if (productCodes.length === 0) return NextResponse.json({ registered: [], registeredAt: {} });

  const { data, error } = await service
    .from('sh_products')
    .select('raw_data, created_at')
    .eq('megaload_user_id', shUserId)
    // 지운 상품까지 "이미 올림"이라고 하면 거짓말이 된다 — 지웠으면 다시 올릴 수 있어야 한다.
    .neq('status', 'deleted')
    .in('raw_data->>productCode', productCodes);
  if (error) return NextResponse.json({ registered: [], registeredAt: {}, error: error.message });

  // 코드별 **첫 등록 시각**. 같은 상품을 두 번 올렸다면 사람이 기억하는 건 이른 쪽이다.
  const registeredAt: Record<string, string> = {};
  for (const p of data || []) {
    const code = (p.raw_data as Record<string, unknown> | null)?.productCode as string | undefined;
    if (!code) continue;
    const at = String(p.created_at || '');
    const prev = registeredAt[code];
    if (prev === undefined || (at && (!prev || at < prev))) registeredAt[code] = at;
  }
  return NextResponse.json({ registered: Object.keys(registeredAt), registeredAt });
}
