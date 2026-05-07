import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 15;

function withTimeout<T>(p: Promise<T> | PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); },
    );
  });
}

// GET: 내 알림 목록
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const tlog = (s: string) => console.log(`[notifications] ${s} +${Date.now() - t0}ms`);
  try {
    const supabase = await createClient();
    tlog('supabase client created');

    // 1. auth.getUser — 5s timeout
    let user;
    try {
      const got = await withTimeout(supabase.auth.getUser(), 5_000, 'auth.getUser');
      user = got.data.user;
    } catch (e) {
      tlog(`auth.getUser TIMEOUT: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: '세션 확인 지연 — 다시 로그인 후 시도해주세요.' }, { status: 504 });
    }
    tlog(`auth.getUser done (user=${user?.id || 'none'})`);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // 2. notifications 조회 — 5s timeout
    let notifications: unknown[] = [];
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (unreadOnly) query = query.eq('is_read', false);

      const r = await withTimeout<{ data: unknown[] | null; error: { message: string } | null }>(
        query as unknown as Promise<{ data: unknown[] | null; error: { message: string } | null }>,
        5_000,
        'notifications select',
      );
      if (r.error) throw new Error(r.error.message);
      notifications = r.data || [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      tlog(`notifications select TIMEOUT/ERROR: ${msg}`);
      const isTimeout = msg.startsWith('timeout(');
      return NextResponse.json(
        { error: isTimeout ? '알림 조회 지연 — 잠시 후 다시 시도해주세요.' : '알림 조회 실패' },
        { status: isTimeout ? 504 : 500 },
      );
    }
    tlog(`notifications done (count=${notifications.length})`);

    // 3. 읽지 않은 알림 수 — 3s timeout (실패해도 0으로 폴백 — UX 우선)
    let unreadCount = 0;
    try {
      const r = await withTimeout<{ count: number | null }>(
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false) as unknown as Promise<{ count: number | null }>,
        3_000,
        'notifications count',
      );
      unreadCount = r.count || 0;
    } catch (e) {
      tlog(`notifications count TIMEOUT (무시, 0 폴백): ${e instanceof Error ? e.message : e}`);
    }
    tlog(`unreadCount done (${unreadCount}) — returning`);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    tlog(`error: ${err instanceof Error ? err.message : err}`);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH: 알림 읽음 처리
export async function PATCH(request: NextRequest) {
  const t0 = Date.now();
  const tlog = (s: string) => console.log(`[notifications PATCH] ${s} +${Date.now() - t0}ms`);
  try {
    const supabase = await createClient();

    // 1. auth.getUser — 5s timeout
    let user;
    try {
      const got = await withTimeout(supabase.auth.getUser(), 5_000, 'auth.getUser');
      user = got.data.user;
    } catch (e) {
      tlog(`auth.getUser TIMEOUT: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: '세션 확인 지연' }, { status: 504 });
    }
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { ids, readAll } = await request.json();

    // 2. update — 5s timeout
    try {
      if (readAll) {
        await withTimeout(
          supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false) as unknown as Promise<unknown>,
          5_000,
          'notifications update readAll',
        );
      } else if (ids && ids.length > 0) {
        await withTimeout(
          supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .in('id', ids) as unknown as Promise<unknown>,
          5_000,
          'notifications update ids',
        );
      }
    } catch (e) {
      tlog(`update TIMEOUT/ERROR: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: '읽음 처리 지연 — 잠시 후 다시 시도해주세요.' }, { status: 504 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
