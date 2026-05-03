import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdminRole } from '@/lib/payments/admin-guard';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/_diag/billing-rpc-test
 * 어디서 hang하는지 단계별 시간 측정.
 * - Stage 1: createClient (auth)
 * - Stage 2: getUser
 * - Stage 3: requireAdminRole (profiles 조회)
 * - Stage 4: createServiceClient
 * - Stage 5: 단순 select (pt_users 1건)
 * - Stage 6: RPC 함수 존재 여부 (pg_proc 조회)
 *
 * 각 단계에 5초 timeout — 어디서 막히는지 즉시 식별.
 */
export async function GET() {
  const stages: Array<{ name: string; ms: number; ok: boolean; detail?: string }> = [];
  const t0 = Date.now();

  const stage = async <T,>(name: string, fn: () => Promise<T>, timeoutMs = 5000): Promise<T | null> => {
    const start = Date.now();
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`stage timeout ${timeoutMs}ms`)), timeoutMs)),
      ]);
      stages.push({ name, ms: Date.now() - start, ok: true });
      return result;
    } catch (err) {
      stages.push({
        name,
        ms: Date.now() - start,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const supabase = await stage('1_createClient', () => createClient());
  if (!supabase) return NextResponse.json({ stages, totalMs: Date.now() - t0, blocker: '1_createClient' }, { status: 500 });

  const userRes = await stage('2_getUser', () => supabase.auth.getUser());
  if (!userRes) return NextResponse.json({ stages, totalMs: Date.now() - t0, blocker: '2_getUser' }, { status: 500 });

  const userId = userRes.data?.user?.id;
  if (!userId) {
    stages.push({ name: '2_getUser', ms: 0, ok: false, detail: 'user is null — 로그인 안 됨' });
    return NextResponse.json({ stages, totalMs: Date.now() - t0, blocker: '2_getUser_null' }, { status: 401 });
  }

  const guard = await stage('3_requireAdminRole', () => requireAdminRole(supabase, userId, 'read'));
  if (!guard || !guard.ok) {
    return NextResponse.json({ stages, totalMs: Date.now() - t0, blocker: '3_requireAdminRole' }, { status: 403 });
  }

  const sc = await stage('4_createServiceClient', () => createServiceClient());
  if (!sc) return NextResponse.json({ stages, totalMs: Date.now() - t0, blocker: '4_createServiceClient' }, { status: 500 });

  await stage('5_simple_select', async () => {
    const { data, error } = await sc.from('pt_users').select('id').limit(1);
    if (error) throw error;
    return data;
  });

  // RPC 함수 존재 여부 확인
  await stage('6_rpc_function_check', async () => {
    const { data, error } = await sc.rpc('set_billing_exclusion', {
      p_pt_user_id: '00000000-0000-0000-0000-000000000000',
      p_excluded_until: '2099-12-31',
      p_reason: 'diag-test',
      p_admin_id: '00000000-0000-0000-0000-000000000000',
    });
    // 'pt_user_id 를 찾을 수 없습니다' 에러가 나오면 함수는 존재하는 것 (정상).
    // 'function does not exist' 같은 에러면 함수 미등록.
    if (error && /function .* does not exist|search_path|not found/i.test(error.message)) {
      throw new Error(`RPC 미등록: ${error.message}`);
    }
    return data;
  });

  return NextResponse.json({
    success: true,
    totalMs: Date.now() - t0,
    stages,
    summary: stages.every((s) => s.ok) ? '✅ 모든 stage 정상' : `❌ 막힌 stage: ${stages.find((s) => !s.ok)?.name}`,
  });
}
