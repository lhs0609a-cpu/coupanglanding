import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

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
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const serviceClient = await createServiceClient();

    // 취소 처리
    if (body.status === 'cancelled') {
      const { error } = await serviceClient
        .from('tax_invoices')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: body.cancelled_reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'issued');

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
