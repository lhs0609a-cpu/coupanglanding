import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkEligibility, type Eligibility } from '@/lib/megaload/services/catalog-register';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 관리자 전용 — 이 라우트는 어떤 경우에도 일반 사용자에게 열리지 않는다. */
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
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

interface Row {
  megaloadUserId: string;
  profileId: string;
  name: string | null;
  email: string | null;
  eligible: boolean;
  skipReason?: string;
  detail?: string;
  daysSinceLastUpload: number | null;
  optOut: boolean;
}

/**
 * GET /api/admin/megaload-catalog/eligible-users
 *
 * 대리 등록이 "지금 가능한" 계정을 가려낸다.
 * 가능 조건: 쿠팡 API 키 유효 + 쿠팡에 출고지·반품지 존재 + 연락처 설정 + 거부 안 함.
 *
 * ?force=1  캐시 무시하고 쿠팡에 다시 물어본다 (키 만료 재확인용).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const force = request.nextUrl.searchParams.get('force') === '1';
  const serviceClient = await createServiceClient();

  const { data: users } = await serviceClient
    .from('megaload_users')
    .select('id, profile_id, bulk_register_opt_out')
    .limit(500);

  const list = (users || []) as unknown as { id: string; profile_id: string; bulk_register_opt_out: boolean | null }[];
  if (list.length === 0) return NextResponse.json({ rows: [], summary: { total: 0, eligible: 0 } });

  // 표시용 프로필
  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id, full_name, email')
    .in('id', list.map((u) => u.profile_id));
  const profMap = new Map(
    ((profiles || []) as unknown as { id: string; full_name: string | null; email: string | null }[])
      .map((p) => [p.id, p]),
  );

  // 마지막 업로드일 — 휴면 여부 판단용
  const lastUpload = new Map<string, string | null>();
  await Promise.all(
    list.map(async (u) => {
      const { data } = await serviceClient
        .from('sh_products')
        .select('created_at')
        .eq('megaload_user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(1);
      lastUpload.set(u.id, (data?.[0] as { created_at: string } | undefined)?.created_at ?? null);
    }),
  );

  // 쿠팡 조회는 계정당 2회 — 한꺼번에 쏘면 429 가 난다. 5개씩 끊어서 진행.
  const rows: Row[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (u): Promise<Row> => {
        let e: Eligibility;
        try {
          e = await checkEligibility(serviceClient, u.id, { force });
        } catch (err) {
          e = {
            megaloadUserId: u.id,
            eligible: false,
            skipReason: 'no_credentials',
            detail: err instanceof Error ? err.message : String(err),
          };
        }
        const prof = profMap.get(u.profile_id);
        const last = lastUpload.get(u.id) || null;
        return {
          megaloadUserId: u.id,
          profileId: u.profile_id,
          name: prof?.full_name ?? null,
          email: prof?.email ?? null,
          eligible: e.eligible,
          skipReason: e.skipReason,
          detail: e.detail,
          daysSinceLastUpload: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null,
          optOut: !!u.bulk_register_opt_out,
        };
      }),
    );
    rows.push(...results);
  }

  const eligible = rows.filter((r) => r.eligible);
  const byReason: Record<string, number> = {};
  for (const r of rows) {
    if (r.eligible) continue;
    byReason[r.skipReason || 'unknown'] = (byReason[r.skipReason || 'unknown'] || 0) + 1;
  }

  return NextResponse.json({
    rows: rows.sort((a, b) => Number(b.eligible) - Number(a.eligible)),
    summary: {
      total: rows.length,
      eligible: eligible.length,
      // 휴면(31일+) 이면서 등록 가능한 계정 — 대리 등록의 주 타깃
      eligibleDormant: eligible.filter((r) => r.daysSinceLastUpload === null || r.daysSinceLastUpload > 30).length,
      byReason,
    },
  });
}
