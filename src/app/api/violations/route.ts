import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();

    // Get pt_user_id
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // Get violations
    const { data: violations, error } = await serviceClient
      .from('partner_violations')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get summary
    const { data: summary } = await serviceClient
      .from('violation_summary')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .single();

    return NextResponse.json({ data: violations, summary: summary || null });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** Partner submits a response to a violation */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { id, partner_response } = body;

    if (!id || !partner_response) {
      return NextResponse.json({ error: 'ID와 소명 내용은 필수입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Verify ownership
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: violation } = await serviceClient
      .from('partner_violations')
      .select('id, pt_user_id, status')
      .eq('id', id)
      .single();

    if (!violation || violation.pt_user_id !== ptUser.id) {
      return NextResponse.json({ error: '해당 위반 건을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Only allow response during investigating or action_taken
    if (!['reported', 'investigating', 'action_taken'].includes(violation.status)) {
      return NextResponse.json({ error: '소명을 제출할 수 없는 상태입니다.' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('partner_violations')
      .update({
        partner_response,
        partner_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
