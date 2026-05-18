import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

export const maxDuration = 10;

type Status = 'locked' | 'triggered' | 'in_progress' | 'completed' | 'needs_review';

interface PatchBody {
  status?: Status;
  subProgress?: Record<string, boolean>;
  notes?: string | null;
  resumePoint?: string | null;
}

const VALID_STATUSES: Status[] = ['locked', 'triggered', 'in_progress', 'completed', 'needs_review'];

/**
 * PATCH /api/admin/education/students/[ptUserId]/[moduleKey]
 * 단일 모듈의 상태/하위진행/메모 갱신.
 * upsert — 행 없으면 생성.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ ptUserId: string; moduleKey: string }> }) {
  try {
    const { ptUserId, moduleKey } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const body = (await req.json()) as PatchBody;
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 기존 row 조회
    const { data: existing } = await serviceClient
      .from('pt_education_progress')
      .select('id, status, sub_progress, triggered_at, started_at, completed_at')
      .eq('pt_user_id', ptUserId).eq('module_key', moduleKey)
      .maybeSingle();

    const now = new Date().toISOString();
    const next: Record<string, unknown> = {
      pt_user_id: ptUserId,
      module_key: moduleKey,
      trainer_id: user.id,
    };

    if (body.status !== undefined) {
      next.status = body.status;
      // 상태 전이에 따른 타임스탬프 자동 설정
      if (body.status === 'triggered' && !existing?.triggered_at) next.triggered_at = now;
      if (body.status === 'in_progress' && !(existing as { started_at?: string })?.started_at) next.started_at = now;
      if (body.status === 'completed') next.completed_at = now;
      if (body.status === 'locked') {
        next.triggered_at = null;
        next.started_at = null;
        next.completed_at = null;
      }
    }
    if (body.subProgress !== undefined) next.sub_progress = body.subProgress;
    if (body.notes !== undefined) next.notes = body.notes;
    if (body.resumePoint !== undefined) next.resume_point = body.resumePoint;

    const { data, error } = await serviceClient
      .from('pt_education_progress')
      .upsert(next, { onConflict: 'pt_user_id,module_key' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Activity log (감사 추적 — 누가 언제 뭘 바꿨나)
    try {
      await logActivity(serviceClient, {
        adminId: user.id,
        action: 'pt_education_update',
        targetType: 'pt_user',
        targetId: ptUserId,
        details: {
          moduleKey,
          status: body.status,
          hasNotes: !!body.notes,
          hasSubProgress: !!body.subProgress,
        },
      });
    } catch { /* 감사 실패는 무시 */ }

    return NextResponse.json({ progress: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
