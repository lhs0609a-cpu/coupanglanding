import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: inventory } = await supabase
    .from('sh_inventory')
    .select('*')
    .eq('product_option_id', optionId)
    .single();

  return NextResponse.json({ inventory });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { quantity, safety_stock, auto_suspend_threshold, auto_resume_threshold, note } = body;

  // 현재 재고 조회
  const { data: current } = await supabase
    .from('sh_inventory')
    .select('*')
    .eq('product_option_id', optionId)
    .single();

  if (!current) {
    return NextResponse.json({ error: '재고 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  const currentData = current as Record<string, unknown>;
  const beforeQuantity = currentData.quantity as number;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (quantity !== undefined) updates.quantity = quantity;
  if (safety_stock !== undefined) updates.safety_stock = safety_stock;
  if (auto_suspend_threshold !== undefined) updates.auto_suspend_threshold = auto_suspend_threshold;
  if (auto_resume_threshold !== undefined) updates.auto_resume_threshold = auto_resume_threshold;

  // 재고 업데이트
  await supabase
    .from('sh_inventory')
    .update(updates)
    .eq('product_option_id', optionId);

  // 변동 이력 기록
  if (quantity !== undefined && quantity !== beforeQuantity) {
    await supabase.from('sh_inventory_logs').insert({
      inventory_id: currentData.id,
      change_type: 'MANUAL',
      change_quantity: (quantity as number) - beforeQuantity,
      before_quantity: beforeQuantity,
      after_quantity: quantity,
      note: note || '수동 조정',
    });
  }

  return NextResponse.json({ success: true });
}
