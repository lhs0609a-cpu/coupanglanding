import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

/**
 * GET — 시스템 로그 조회
 * Query:
 *   level: error|warn|info|all
 *   category: coupang_api|... |all
 *   resolved: true|false|all
 *   sinceDays: 1|7|30 (기본 7)
 *   limit: 기본 200
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const level = searchParams.get('level') || 'all';
    const category = searchParams.get('category') || 'all';
    const resolved = searchParams.get('resolved') || 'all';
    const sinceDays = parseInt(searchParams.get('sinceDays') || '7', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

    const serviceClient = await createServiceClient();
    const sinceTs = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    let query = serviceClient
      .from('system_logs')
      .select('*')
      .gte('last_seen_at', sinceTs)
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (level !== 'all') query = query.eq('level', level);
    if (category !== 'all') query = query.eq('category', category);
    if (resolved === 'true') query = query.eq('resolved', true);
    else if (resolved === 'false') query = query.eq('resolved', false);

    const { data: logs, error } = await query;
    if (error) throw error;

    // 통계 카드용 집계 — 같은 7일 윈도우
    const { data: statsRows } = await serviceClient
      .from('system_logs')
      .select('level, category, resolved, occurrences')
      .gte('last_seen_at', sinceTs)
      .limit(5000);

    const stats = {
      total: 0,
      errors: 0,
      warns: 0,
      unresolved: 0,
      todayErrors: 0,
      byCategory: {} as Record<string, number>,
    };
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    for (const r of (statsRows || []) as Array<{ level: string; category: string; resolved: boolean; occurrences: number; last_seen_at?: string }>) {
      const occ = r.occurrences || 1;
      stats.total += occ;
      if (r.level === 'error') stats.errors += occ;
      if (r.level === 'warn') stats.warns += occ;
      if (!r.resolved) stats.unresolved += 1;
      stats.byCategory[r.category] = (stats.byCategory[r.category] || 0) + occ;
    }
    // todayErrors 별도 쿼리
    const { count: todayErrCount } = await serviceClient
      .from('system_logs')
      .select('id', { count: 'exact', head: true })
      .eq('level', 'error')
      .gte('last_seen_at', todayStart.toISOString());
    stats.todayErrors = todayErrCount || 0;

    return NextResponse.json({ data: logs || [], stats });
  } catch (err) {
    console.error('admin/system-logs GET error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '조회 실패' }, { status: 500 });
  }
}

/**
 * PATCH — 로그 해결 마킹 / 노트 작성
 * Body: { id, resolved?: boolean, resolved_note?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const serviceClient = await createServiceClient();
    const update: Record<string, unknown> = {};
    if (typeof body.resolved === 'boolean') {
      update.resolved = body.resolved;
      if (body.resolved) {
        update.resolved_by = user.id;
        update.resolved_at = new Date().toISOString();
      } else {
        update.resolved_by = null;
        update.resolved_at = null;
      }
    }
    if (typeof body.resolved_note === 'string') {
      update.resolved_note = body.resolved_note.slice(0, 500);
    }

    const { data, error } = await serviceClient
      .from('system_logs')
      .update(update)
      .eq('id', body.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    console.error('admin/system-logs PATCH error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '업데이트 실패' }, { status: 500 });
  }
}
