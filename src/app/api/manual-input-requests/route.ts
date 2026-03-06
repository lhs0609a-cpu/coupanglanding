import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/utils/notifications';

/** POST: PT 사용자가 수동 입력 승인 요청 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { yearMonth, reason } = body as { yearMonth: string; reason: string };

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'yearMonth 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!reason || reason.trim().length < 5) {
      return NextResponse.json({ error: '사유를 5자 이상 입력해주세요.' }, { status: 400 });
    }

    // PT 사용자 확인
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이미 요청이 있는지 확인
    const serviceClient = await createServiceClient();
    const { data: existing } = await serviceClient
      .from('manual_input_requests')
      .select('id, status')
      .eq('pt_user_id', ptUser.id)
      .eq('year_month', yearMonth)
      .single();

    if (existing) {
      if (existing.status === 'pending') {
        return NextResponse.json({ error: '이미 승인 요청이 대기 중입니다.' }, { status: 409 });
      }
      if (existing.status === 'approved') {
        return NextResponse.json({ error: '이미 수동 입력이 승인되었습니다.' }, { status: 409 });
      }
      // rejected인 경우 재요청 허용: 기존 레코드 업데이트
      const { error } = await serviceClient
        .from('manual_input_requests')
        .update({
          reason: reason.trim(),
          status: 'pending',
          admin_note: null,
          reviewed_by: null,
          reviewed_at: null,
          requested_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        return NextResponse.json({ error: '재요청에 실패했습니다.' }, { status: 500 });
      }
    } else {
      // 새 요청 생성
      const { error } = await serviceClient
        .from('manual_input_requests')
        .insert({
          pt_user_id: ptUser.id,
          year_month: yearMonth,
          reason: reason.trim(),
        });

      if (error) {
        return NextResponse.json({ error: '요청 생성에 실패했습니다.' }, { status: 500 });
      }
    }

    // 관리자에게 알림
    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    if (admins && userProfile) {
      for (const admin of admins) {
        await createNotification(serviceClient, {
          userId: admin.id,
          type: 'settlement',
          title: '수동 입력 승인 요청',
          message: `${userProfile.full_name}님이 ${yearMonth} 수동 입력을 요청했습니다. 사유: ${reason.trim()}`,
          link: '/admin/pt-users',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** GET: 수동 입력 요청 목록 조회 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const serviceClient = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const status = searchParams.get('status');

    let query = serviceClient
      .from('manual_input_requests')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name, email))')
      .order('requested_at', { ascending: false });

    // PT 사용자는 본인 것만
    if (profile?.role !== 'admin') {
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!ptUser) {
        return NextResponse.json([]);
      }
      query = query.eq('pt_user_id', ptUser.id);
    }

    if (yearMonth) query = query.eq('year_month', yearMonth);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
