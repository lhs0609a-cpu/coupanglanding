import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyIncidentReported } from '@/lib/utils/notifications';

export const maxDuration = 30;


export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[incidents GET] Supabase error:', error.message, error.code, error.details);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('[incidents GET] Unexpected error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const { incident_type, sub_type, severity, title, description, brand_name, product_name, coupang_reference, actions_taken } = body;

    if (!incident_type || !sub_type || !title) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    const { data, error } = await serviceClient
      .from('incidents')
      .insert({
        pt_user_id: ptUser.id,
        incident_type,
        sub_type,
        severity: severity || 'medium',
        title,
        description: description || null,
        brand_name: brand_name || null,
        product_name: product_name || null,
        coupang_reference: coupang_reference || null,
        actions_taken: actions_taken || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 관리자 알림
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const partnerName = profile?.full_name || '파트너';

    const { data: admins } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins) {
      for (const admin of admins) {
        await notifyIncidentReported(serviceClient, admin.id, partnerName, title);
      }
    }

    // 활동 로그
    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'report_incident',
      targetType: 'incident',
      targetId: data.id,
      details: { incident_type, sub_type, title },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
