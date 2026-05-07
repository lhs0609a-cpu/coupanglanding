import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

export const maxDuration = 30;


async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;
    const serviceClient = await createServiceClient();

    const { data, error } = await serviceClient
      .from('tax_invoices')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name, email))')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '세금계산서를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();
    const serviceClient = await createServiceClient();

    // PT 사용자의 세금계산서 확인 처리
    if (body.status === 'confirmed') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
      }

      // PT 사용자 본인 소유 확인
      const { data: ptUser } = await serviceClient
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!ptUser) {
        return NextResponse.json({ error: 'PT 사용자가 아닙니다.' }, { status: 403 });
      }

      const { data: invoice } = await serviceClient
        .from('tax_invoices')
        .select('id, pt_user_id, status')
        .eq('id', id)
        .single();

      if (!invoice) {
        return NextResponse.json({ error: '세금계산서를 찾을 수 없습니다.' }, { status: 404 });
      }

      if (invoice.pt_user_id !== ptUser.id) {
        return NextResponse.json({ error: '본인의 세금계산서만 확인할 수 있습니다.' }, { status: 403 });
      }

      if (invoice.status !== 'issued') {
        return NextResponse.json({ error: '발행 상태의 세금계산서만 확인할 수 있습니다.' }, { status: 400 });
      }

      const { error } = await serviceClient
        .from('tax_invoices')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // 관리자 전용: 취소 처리
    if (body.status === 'cancelled') {
      const admin = await requireAdmin(supabase);
      if (!admin) {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
      }

      const { error } = await serviceClient
        .from('tax_invoices')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: body.cancelled_reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('status', ['issued', 'confirmed']);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logActivity(serviceClient, {
        adminId: admin.id,
        action: 'cancel_tax_invoice',
        targetType: 'tax_invoice',
        targetId: id,
        details: { reason: body.cancelled_reason },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
