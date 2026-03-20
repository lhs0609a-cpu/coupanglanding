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

// GET: 사전등록 전체 목록
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('pre_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('pre-registrations GET error:', error);
    return NextResponse.json({ error: '사전등록 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 사전등록 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { email, full_name, phone, share_percentage, memo } = body;

    if (!email || !full_name) {
      return NextResponse.json({ error: '이메일과 이름은 필수입니다.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const serviceClient = await createServiceClient();

    // 이미 pending 상태인 사전등록 확인
    const { data: existing } = await serviceClient
      .from('pre_registrations')
      .select('id')
      .eq('status', 'pending')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '이미 대기중인 사전등록이 있습니다.' }, { status: 409 });
    }

    // 이미 가입된 이메일 확인
    const { data: existingAuth } = await serviceClient.auth.admin.listUsers();
    const alreadyRegistered = existingAuth?.users?.some(
      u => u.email?.toLowerCase() === normalizedEmail
    );
    if (alreadyRegistered) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
    }

    const { data, error } = await serviceClient
      .from('pre_registrations')
      .insert({
        email: normalizedEmail,
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        share_percentage: share_percentage ?? 30,
        memo: memo?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_pre_registration',
      targetType: 'pre_registration',
      targetId: data.id,
      details: { email: normalizedEmail, full_name: full_name.trim() },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('pre-registrations POST error:', error);
    return NextResponse.json({ error: '사전등록 생성에 실패했습니다.' }, { status: 500 });
  }
}

// PATCH: 사전등록 취소
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || status !== 'cancelled') {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // pending 상태만 취소 가능
    const { data: existing } = await serviceClient
      .from('pre_registrations')
      .select('id, status, email')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: '사전등록을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: '대기중 상태만 취소할 수 있습니다.' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('pre_registrations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'cancel_pre_registration',
      targetType: 'pre_registration',
      targetId: id,
      details: { email: existing.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('pre-registrations PATCH error:', error);
    return NextResponse.json({ error: '사전등록 취소에 실패했습니다.' }, { status: 500 });
  }
}
