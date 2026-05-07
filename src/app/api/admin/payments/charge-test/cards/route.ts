import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


/**
 * GET /api/admin/payments/charge-test/cards?ptUserId=...
 * 관리자가 선택한 PT 사용자의 활성 결제 카드 목록 조회.
 */

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const ptUserId = request.nextUrl.searchParams.get('ptUserId');
    if (!ptUserId) {
      return NextResponse.json({ error: 'ptUserId가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data: cards, error } = await serviceClient
      .from('billing_cards')
      .select('id, card_company, card_number, card_type, is_primary, is_active, failed_count, registered_at, last_used_at')
      .eq('pt_user_id', ptUserId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('registered_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cards: cards || [] });
  } catch (err) {
    console.error('GET /api/admin/payments/charge-test/cards error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
