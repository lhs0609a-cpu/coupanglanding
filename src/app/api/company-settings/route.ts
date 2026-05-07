import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const serviceClient = await createServiceClient();

    // 기존 레코드 조회
    const { data: existing } = await serviceClient
      .from('company_settings')
      .select('id')
      .limit(1)
      .single();

    if (!existing) {
      return NextResponse.json({ error: '설정을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { error } = await serviceClient
      .from('company_settings')
      .update({
        business_name: body.business_name,
        business_registration_number: body.business_registration_number,
        representative_name: body.representative_name,
        business_address: body.business_address,
        business_type: body.business_type,
        business_category: body.business_category,
        email: body.email,
        phone: body.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'update_settings',
      targetType: 'company_settings',
      targetId: existing.id,
      details: { business_name: body.business_name },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
