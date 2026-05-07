import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const ptUserIdFilter = searchParams.get('pt_user_id');

    const serviceClient = await createServiceClient();

    let query = serviceClient
      .from('penalty_records')
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .order('created_at', { ascending: false });

    if (ptUserIdFilter) {
      query = query.eq('pt_user_id', ptUserIdFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('관리자 페널티 조회 오류:', error);
      void logSystemError({ source: 'admin/penalty', error: error }).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('관리자 페널티 조회 서버 오류:', err);
    void logSystemError({ source: 'admin/penalty', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { pt_user_id, penalty_category, title, description, occurred_at, score_impact, evidence_url } = body;

    if (!pt_user_id || !penalty_category || !title || score_impact === undefined) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다. (pt_user_id, penalty_category, title, score_impact)' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Insert penalty record
    const { data: record, error: insertError } = await serviceClient
      .from('penalty_records')
      .insert({
        pt_user_id,
        penalty_category,
        title,
        description: description || null,
        occurred_at: occurred_at || new Date().toISOString(),
        score_impact,
        evidence_url: evidence_url || null,
        reported_by: 'admin',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('관리자 페널티 등록 오류:', insertError);
      void logSystemError({ source: 'admin/penalty', error: insertError }).catch(() => {});
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Recalculate penalty summary
    const { error: rpcError } = await serviceClient
      .rpc('recalculate_penalty_summary', { target_pt_user_id: pt_user_id });

    if (rpcError) {
      console.error('페널티 요약 재계산 오류:', rpcError);
      void logSystemError({ source: 'admin/penalty', error: rpcError }).catch(() => {});
    }

    return NextResponse.json({ data: record });
  } catch (err) {
    console.error('관리자 페널티 등록 서버 오류:', err);
    void logSystemError({ source: 'admin/penalty', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, is_resolved, resolution_note, ...otherUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: '페널티 ID는 필수입니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Build update data
    const updateData: Record<string, unknown> = {
      ...otherUpdates,
      updated_at: new Date().toISOString(),
    };

    if (is_resolved !== undefined) {
      updateData.is_resolved = is_resolved;
    }

    if (resolution_note !== undefined) {
      updateData.resolution_note = resolution_note;
    }

    // If resolving, set resolved_at to now
    if (is_resolved === true) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: record, error: updateError } = await serviceClient
      .from('penalty_records')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('페널티 업데이트 오류:', updateError);
      void logSystemError({ source: 'admin/penalty', error: updateError }).catch(() => {});
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!record) {
      return NextResponse.json({ error: '해당 페널티 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Recalculate penalty summary for the affected pt_user
    const { error: rpcError } = await serviceClient
      .rpc('recalculate_penalty_summary', { target_pt_user_id: record.pt_user_id });

    if (rpcError) {
      console.error('페널티 요약 재계산 오류:', rpcError);
      void logSystemError({ source: 'admin/penalty', error: rpcError }).catch(() => {});
    }

    return NextResponse.json({ data: record });
  } catch (err) {
    console.error('페널티 업데이트 서버 오류:', err);
    void logSystemError({ source: 'admin/penalty', error: err }).catch(() => {});
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
