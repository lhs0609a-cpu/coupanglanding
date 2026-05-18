import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 20;

interface PtUserRow {
  id: string;
  status: string;
  profile: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[];
}

interface ProgressRow {
  pt_user_id: string;
  status: string;
  triggered_at: string | null;
  completed_at: string | null;
}

/**
 * GET /api/admin/education/students
 * 학생 목록 + 진행률 요약 — 메인 보드에서 사용.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'partner'].includes(profile.role)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();

    // 1) 활성 PT 학생 목록
    const { data: ptUsers, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, status, profile:profiles(id, full_name, email)')
      .neq('status', 'terminated')
      .order('created_at', { ascending: false });
    if (ptErr) return NextResponse.json({ error: ptErr.message }, { status: 500 });

    const users = (ptUsers || []) as PtUserRow[];
    if (users.length === 0) return NextResponse.json({ students: [], totalModules: 0 });

    // 2) 모듈 마스터 (전체 카운트 계산용)
    const { data: modules } = await serviceClient
      .from('pt_education_modules').select('key').eq('is_active', true);
    const totalModules = modules?.length ?? 0;

    // 3) 진행 상태 일괄 조회
    const ids = users.map(u => u.id);
    const { data: progressRows } = await serviceClient
      .from('pt_education_progress')
      .select('pt_user_id, status, triggered_at, completed_at')
      .in('pt_user_id', ids);

    const progressByUser = new Map<string, ProgressRow[]>();
    for (const r of (progressRows || []) as ProgressRow[]) {
      const arr = progressByUser.get(r.pt_user_id) || [];
      arr.push(r);
      progressByUser.set(r.pt_user_id, arr);
    }

    const now = Date.now();
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;

    const students = users.map(u => {
      const rows = progressByUser.get(u.id) || [];
      const completed = rows.filter(r => r.status === 'completed').length;
      const inProgress = rows.filter(r => r.status === 'in_progress').length;
      const triggered = rows.filter(r => r.status === 'triggered').length;
      const needsReview = rows.filter(r => r.status === 'needs_review').length;
      // 정체: triggered/in_progress 인데 7일+ 지난 것
      const stale = rows.filter(r =>
        (r.status === 'triggered' || r.status === 'in_progress') &&
        r.triggered_at && (now - new Date(r.triggered_at).getTime()) >= STALE_MS,
      ).length;

      const profile = Array.isArray(u.profile) ? u.profile[0] : u.profile;
      return {
        ptUserId: u.id,
        profileId: profile?.id ?? null,
        fullName: profile?.full_name ?? '(이름 없음)',
        email: profile?.email ?? '',
        status: u.status,
        progress: { completed, inProgress, triggered, needsReview, stale, total: totalModules },
      };
    });

    return NextResponse.json({ students, totalModules });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 },
    );
  }
}
