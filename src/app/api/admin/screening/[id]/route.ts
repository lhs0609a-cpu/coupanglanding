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

// GET: 단일 스크리닝 결과 상세
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();

    const { data: link, error } = await serviceClient
      .from('screening_links')
      .select('*, screening_results(*)')
      .eq('id', id)
      .single();

    if (error || !link) {
      return NextResponse.json({ error: '스크리닝 링크를 찾을 수 없습니다.' }, { status: 404 });
    }

    const results = (link as Record<string, unknown>).screening_results;
    const result = Array.isArray(results) ? results[0] || null : results || null;

    return NextResponse.json({
      data: {
        ...link,
        screening_result: result,
        screening_results: undefined,
      },
    });
  } catch (error) {
    console.error('admin screening [id] GET error:', error);
    return NextResponse.json({ error: '스크리닝 상세 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PATCH: admin_decision + admin_memo 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { admin_decision, admin_memo } = body;

    if (!admin_decision || !['approved', 'rejected', 'hold', 'pending'].includes(admin_decision)) {
      return NextResponse.json({ error: '유효한 판정을 선택해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 해당 링크의 screening_result 찾기
    const { data: link } = await serviceClient
      .from('screening_links')
      .select('id, candidate_name, screening_results(id)')
      .eq('id', id)
      .single();

    if (!link) {
      return NextResponse.json({ error: '스크리닝 링크를 찾을 수 없습니다.' }, { status: 404 });
    }

    const results = (link as Record<string, unknown>).screening_results;
    const resultRow = Array.isArray(results) ? results[0] : results;
    const resultId = (resultRow as Record<string, unknown> | null)?.id as string | undefined;

    if (!resultId) {
      return NextResponse.json({ error: '아직 응시 결과가 없습니다.' }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from('screening_results')
      .update({
        admin_decision,
        admin_memo: admin_memo || null,
      })
      .eq('id', resultId);

    if (updateError) throw updateError;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'decide_screening',
      targetType: 'screening_result',
      targetId: resultId,
      details: { admin_decision, candidate_name: link.candidate_name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin screening [id] PATCH error:', error);
    return NextResponse.json({ error: '판정 저장에 실패했습니다.' }, { status: 500 });
  }
}
