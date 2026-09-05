import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * GET /api/admin/stock-monitor/naver
 * 관리자 현황판 — "누가 네이버 로그인이 안 돼 있어서 스마트스토어를 못 보고 있는가".
 *
 * 왜 필요한가:
 *   품절 감시는 셀러 각자의 PC 가 자기 네이버 계정으로 자기 상품만 확인한다.
 *   로그인이 없으면 도우미는 스마트스토어 건을 **통째로 건너뛴다**(조용히). 서버에는
 *   "실패"조차 남지 않으므로, 로그인 상태를 직접 보지 않으면 방치된 셀러를 찾을 수 없다.
 *
 * 계정 정보는 다루지 않는다 — 참/거짓 세 개(로그인/영구/자격증명 저장)뿐이다.
 */

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

interface HeartbeatRow {
  megaload_user_id: string;
  last_seen: string;
  hostname: string | null;
  app_version: string | null;
  naver_logged_in?: boolean | null;
  naver_persistent?: boolean | null;
  naver_credential?: boolean | null;
  naver_checked_at?: string | null;
}

/** 스마트스토어 판정 — 도우미(worker/.../stock-monitor/module.mjs siteOf)와 같은 규칙이어야 한다. */
const isSmartstore = (url: string | null) => !!url && /smartstore\.naver|shop\.naver/i.test(url);

export async function GET() {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const now = Date.now();

    // ── 1. 도우미 하트비트 (네이버 상태 포함)
    //    마이그레이션 전 DB 에서도 화면이 뜨도록, 컬럼이 없으면 기본 컬럼만 다시 읽는다.
    let needsMigration = false;
    let heartbeats: HeartbeatRow[] = [];
    {
      const full = await serviceClient
        .from('megaload_worker_heartbeats')
        .select('megaload_user_id, last_seen, hostname, app_version, naver_logged_in, naver_persistent, naver_credential, naver_checked_at')
        .order('last_seen', { ascending: false });
      if (full.error) {
        needsMigration = true;
        const basic = await serviceClient
          .from('megaload_worker_heartbeats')
          .select('megaload_user_id, last_seen, hostname, app_version')
          .order('last_seen', { ascending: false });
        heartbeats = (basic.data ?? []) as HeartbeatRow[];
      } else {
        heartbeats = (full.data ?? []) as HeartbeatRow[];
      }
    }

    // 유저당 가장 최근 하트비트 1건만 남긴다(위에서 last_seen 내림차순이므로 첫 건).
    const hbByUser = new Map<string, HeartbeatRow>();
    for (const hb of heartbeats) {
      if (!hbByUser.has(hb.megaload_user_id)) hbByUser.set(hb.megaload_user_id, hb);
    }

    // ── 2. 활성 스마트스토어 감시 집계
    //    그룹 집계를 서버에서 못 하므로(RPC 없음) 필요한 두 컬럼만 페이지로 훑는다.
    const PAGE = 1000;
    const MAX_PAGES = 40;              // 40,000건까지. 넘으면 잘렸다고 응답에 밝힌다(조용한 절단 금지).
    const oneDayAgo = now - 24 * 60 * 60_000;
    const agg = new Map<string, { smartstore: number; checked24h: number; stale: number }>();
    let scanned = 0;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await serviceClient
        .from('sh_stock_monitors')
        .select('megaload_user_id, source_url, last_checked_at')
        .eq('is_active', true)
        .or('source_url.ilike.%smartstore.naver%,source_url.ilike.%shop.naver%')
        .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) break;
      const rows = (data ?? []) as { megaload_user_id: string; source_url: string | null; last_checked_at: string | null }[];
      for (const r of rows) {
        if (!isSmartstore(r.source_url)) continue;   // ilike 는 넓게 잡으므로 도우미와 같은 규칙으로 한 번 더 거른다
        const a = agg.get(r.megaload_user_id) ?? { smartstore: 0, checked24h: 0, stale: 0 };
        a.smartstore++;
        const ts = r.last_checked_at ? new Date(r.last_checked_at).getTime() : 0;
        if (ts >= oneDayAgo) a.checked24h++;
        if (!ts || now - ts > 3 * 24 * 60 * 60_000) a.stale++;
        agg.set(r.megaload_user_id, a);
      }
      scanned += rows.length;
      if (rows.length < PAGE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    // ── 3. 셀러 신원 — 감시가 있거나 도우미가 붙은 유저 전부
    const userIds = Array.from(new Set([...agg.keys(), ...hbByUser.keys()]));
    const nameById = new Map<string, { businessName: string | null; email: string | null; fullName: string | null }>();
    if (userIds.length > 0) {
      const { data: users } = await serviceClient
        .from('megaload_users')
        .select('id, business_name, profile_id')
        .in('id', userIds);
      const rows = (users ?? []) as { id: string; business_name: string | null; profile_id: string | null }[];
      const profileIds = rows.map((r) => r.profile_id).filter((v): v is string => !!v);
      const profById = new Map<string, { email: string | null; full_name: string | null }>();
      if (profileIds.length > 0) {
        const { data: profs } = await serviceClient
          .from('profiles')
          .select('id, email, full_name')
          .in('id', profileIds);
        for (const p of (profs ?? []) as { id: string; email: string | null; full_name: string | null }[]) {
          profById.set(p.id, { email: p.email, full_name: p.full_name });
        }
      }
      for (const r of rows) {
        const p = r.profile_id ? profById.get(r.profile_id) : undefined;
        nameById.set(r.id, {
          businessName: r.business_name,
          email: p?.email ?? null,
          fullName: p?.full_name ?? null,
        });
      }
    }

    // ── 4. 한 줄씩 판정
    const WORKER_ALIVE_MIN = 5;   // 워커 하트비트는 30초 주기 → 5분이면 확실히 켜져 있다(status 라우트와 동일 기준)
    const sellers = userIds.map((id) => {
      const hb = hbByUser.get(id) ?? null;
      const a = agg.get(id) ?? { smartstore: 0, checked24h: 0, stale: 0 };
      const hbAgeMin = hb ? Math.floor((now - new Date(hb.last_seen).getTime()) / 60_000) : -1;
      const appAlive = hbAgeMin >= 0 && hbAgeMin < WORKER_ALIVE_MIN;
      const naverKnown = !!hb && !!hb.naver_checked_at;
      const loggedIn = naverKnown ? (hb!.naver_logged_in ?? null) : null;

      // 상태는 "무엇을 해야 하는가"로 가른다.
      //   no_app        도우미가 꺼져 있다        → 로그인 이전의 문제
      //   logged_out    켜져 있는데 로그인 없음   → 안내 대상(스마트스토어를 통째로 못 봄)
      //   session_only  로그인은 됐지만 앱 끄면 풀림 → 약한 안내
      //   ok            정상
      //   unknown       구버전 도우미라 상태를 안 보냄
      const status: 'no_app' | 'logged_out' | 'session_only' | 'ok' | 'unknown' =
        !appAlive ? 'no_app'
          : !naverKnown ? 'unknown'
            : loggedIn === false ? 'logged_out'
              : hb!.naver_persistent === false ? 'session_only'
                : 'ok';

      return {
        megaloadUserId: id,
        businessName: nameById.get(id)?.businessName ?? null,
        email: nameById.get(id)?.email ?? null,
        fullName: nameById.get(id)?.fullName ?? null,
        hostname: hb?.hostname ?? null,
        appVersion: hb?.app_version ?? null,
        lastSeenAt: hb?.last_seen ?? null,
        heartbeatAgeMin: hbAgeMin,
        appAlive,
        naverLoggedIn: loggedIn,
        naverPersistent: naverKnown ? (hb!.naver_persistent ?? null) : null,
        naverCredential: naverKnown ? (hb!.naver_credential ?? null) : null,
        naverCheckedAt: hb?.naver_checked_at ?? null,
        smartstoreMonitors: a.smartstore,
        smartstoreChecked24h: a.checked24h,
        smartstoreStale3d: a.stale,
        status,
        // 안내할 값어치가 있는가 — 못 보는 상품이 실제로 있을 때만.
        needsAttention: (status === 'logged_out' || status === 'no_app') && a.smartstore > 0,
      };
    });

    // 안내 대상 먼저, 그 안에서는 못 보고 있는 상품이 많은 순.
    sellers.sort((x, y) => {
      if (x.needsAttention !== y.needsAttention) return x.needsAttention ? -1 : 1;
      return y.smartstoreMonitors - x.smartstoreMonitors;
    });

    const summary = {
      sellers: sellers.length,
      loggedOut: sellers.filter((s) => s.status === 'logged_out').length,
      sessionOnly: sellers.filter((s) => s.status === 'session_only').length,
      noApp: sellers.filter((s) => s.status === 'no_app').length,
      ok: sellers.filter((s) => s.status === 'ok').length,
      unknown: sellers.filter((s) => s.status === 'unknown').length,
      // 지금 이 순간 아무도 못 보고 있는 스마트스토어 상품 수 — 현황판의 한 줄 결론.
      blindSmartstore: sellers
        .filter((s) => s.needsAttention)
        .reduce((sum, s) => sum + s.smartstoreMonitors, 0),
      smartstoreTotal: sellers.reduce((sum, s) => sum + s.smartstoreMonitors, 0),
    };

    return NextResponse.json({
      ok: true,
      needsMigration,   // true 면 마이그레이션 전 — 네이버 상태 칸이 전부 "모름"으로 나온다
      truncated,        // true 면 감시 스캔이 상한에서 잘렸다(집계가 실제보다 작다)
      scanned,
      summary,
      sellers,
      generatedAt: new Date(now).toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
