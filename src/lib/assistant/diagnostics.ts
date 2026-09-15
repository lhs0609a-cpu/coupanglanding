import type { UserStatusSnapshot } from './types';
import { getReportTargetMonth, getSettlementDDay } from '@/lib/utils/settlement';

/**
 * 로그인한 사용자의 "지금 실제 상태"를 모아 봇에게 넘긴다.
 *
 * 이게 이 상담봇의 핵심이다. 일반적인 FAQ 봇은 "채널 연동을 확인해보세요"라고 말하지만,
 * 여기서는 실제로 연동이 돼 있는지 보고 "쿠팡만 연동돼 있고 네이버는 안 돼 있습니다"라고 말한다.
 *
 * 원칙
 *  - 어떤 쿼리가 실패해도 전체가 죽지 않는다. 못 읽은 항목은 빼고 나머지로 답한다.
 *  - 개인정보(구매자 이름·주소·전화)는 절대 담지 않는다. 집계 숫자만 낸다.
 *  - 관리자 권한으로 읽되 반드시 본인 소유 행만 읽는다.
 */

// supabase-js 클라이언트를 느슨하게 받는다 (createClient / createServiceClient 둘 다 허용)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

const DESKTOP_ONLINE_WINDOW_MS = 5 * 60 * 1000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function countRows(
  sb: Sb,
  table: string,
  filters: (q: Sb) => Sb,
): Promise<number> {
  return safe(async () => {
    let q = sb.from(table).select('id', { count: 'exact', head: true });
    q = filters(q);
    const { count } = await q;
    return typeof count === 'number' ? count : 0;
  }, 0);
}

export async function buildUserStatus(
  serviceClient: Sb,
  profileId: string | null,
): Promise<UserStatusSnapshot> {
  const warnings: string[] = [];
  if (!profileId) return { loggedIn: false, warnings };

  const snapshot: UserStatusSnapshot = { loggedIn: true, warnings };

  // ── 프로필 ──
  const profile = await safe(async () => {
    const { data } = await serviceClient
      .from('profiles')
      .select('full_name, role, is_active')
      .eq('id', profileId)
      .maybeSingle();
    return data as { full_name?: string; role?: string; is_active?: boolean } | null;
  }, null);
  if (profile) {
    snapshot.name = profile.full_name ?? undefined;
    snapshot.role = profile.role ?? undefined;
    if (profile.is_active === false) warnings.push('계정이 아직 활성화되지 않았습니다 (승인 대기).');
  }

  // ── PT 회원 ──
  const ptUser = await safe(async () => {
    const { data } = await serviceClient
      .from('pt_users')
      .select(
        'id, created_at, coupang_api_connected, coupang_vendor_id, payment_lock_level, payment_overdue_since, admin_override_level, payment_lock_exempt_until, billing_excluded_until, is_test_account',
      )
      .eq('profile_id', profileId)
      .maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  if (ptUser) {
    const createdAt = (ptUser.created_at as string) || null;
    const days = createdAt
      ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
      : null;

    const hasPaymentCard = await safe(async () => {
      const { data } = await serviceClient
        .from('billing_cards')
        .select('id')
        .eq('pt_user_id', ptUser.id)
        .eq('is_active', true)
        .limit(1);
      return (data || []).length > 0;
    }, false);

    const rawLock = Number(ptUser.payment_lock_level ?? 0);
    const override = ptUser.admin_override_level as number | null | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const exempt =
      (typeof ptUser.payment_lock_exempt_until === 'string' && ptUser.payment_lock_exempt_until >= today) ||
      (typeof ptUser.billing_excluded_until === 'string' && ptUser.billing_excluded_until >= today) ||
      ptUser.is_test_account === true;
    const lockLevel = exempt ? 0 : (override ?? rawLock);

    snapshot.pt = {
      joinedAt: createdAt,
      daysSinceJoin: days,
      coupangApiConnected: !!ptUser.coupang_api_connected,
      coupangVendorId: (ptUser.coupang_vendor_id as string) || null,
      paymentLockLevel: lockLevel,
      paymentOverdueSince: (ptUser.payment_overdue_since as string) || null,
      hasPaymentCard,
    };

    if (lockLevel >= 3) warnings.push('결제 잠금 3단계 — 결제 전까지 대부분 기능이 차단됩니다.');
    else if (lockLevel > 0) warnings.push(`결제 잠금 ${lockLevel}단계 — 코칭비 미납 상태입니다.`);
    if (!hasPaymentCard && !exempt) warnings.push('결제 카드가 등록돼 있지 않습니다.');
    if (!ptUser.coupang_api_connected) warnings.push('쿠팡 API가 연동돼 있지 않아 매출이 자동 검증되지 않습니다.');

    // ── 정산 ──
    const targetMonth = getReportTargetMonth();
    const dday = getSettlementDDay(targetMonth);
    const report = await safe(async () => {
      const { data } = await serviceClient
        .from('monthly_reports')
        .select('payment_status, fee_payment_status')
        .eq('pt_user_id', ptUser.id)
        .eq('year_month', targetMonth)
        .maybeSingle();
      return data as { payment_status?: string; fee_payment_status?: string } | null;
    }, null);

    snapshot.settlement = {
      targetMonth,
      dday,
      reportStatus: report?.payment_status ?? null,
      feePaymentStatus: report?.fee_payment_status ?? null,
    };

    const submitted = ['submitted', 'reviewed', 'deposited', 'confirmed'].includes(
      report?.payment_status ?? '',
    );
    if (!submitted && dday <= 7) {
      warnings.push(
        dday >= 0
          ? `${targetMonth} 정산 보고서 미제출 — 마감까지 D-${dday}.`
          : `${targetMonth} 정산 보고서가 마감 ${Math.abs(dday)}일 지났습니다. 기능이 제한될 수 있습니다.`,
      );
    }

    // ── 페널티 ──
    const penalty = await safe(async () => {
      const { data } = await serviceClient
        .from('penalty_summary')
        .select('risk_score, active_records')
        .eq('pt_user_id', ptUser.id)
        .maybeSingle();
      return data as { risk_score?: number; active_records?: number } | null;
    }, null);
    if (penalty) {
      snapshot.penalty = {
        score: penalty.risk_score ?? null,
        openIncidents: penalty.active_records ?? 0,
      };
      if ((penalty.active_records ?? 0) > 0) {
        warnings.push(`처리 중인 페널티 ${penalty.active_records}건이 있습니다.`);
      }
    }
  }

  // ── 메가로드 ──
  const shUser = await safe(async () => {
    const { data } = await serviceClient
      .from('megaload_users')
      .select('id, plan, onboarding_done')
      .eq('profile_id', profileId)
      .maybeSingle();
    return data as { id: string; plan?: string; onboarding_done?: boolean } | null;
  }, null);

  if (shUser) {
    const shId = shUser.id;

    const [productCount, registeredCount, pendingOrders, pendingInquiries, stockMonitorCount] =
      await Promise.all([
        countRows(serviceClient, 'sh_products', (q: Sb) =>
          q.eq('megaload_user_id', shId).neq('status', 'deleted'),
        ),
        // 채널에 실제로 올라간 건수 — product_id 로 조인이 어려우므로 상품 기준 근사
        safe(async () => {
          const { data } = await serviceClient
            .from('sh_products')
            .select('id')
            .eq('megaload_user_id', shId)
            .not('coupang_product_id', 'is', null)
            .limit(20000);
          return (data || []).length;
        }, 0),
        countRows(serviceClient, 'sh_orders', (q: Sb) =>
          q.eq('megaload_user_id', shId).in('order_status', ['payment_done', 'order_confirmed', 'shipping_ready']),
        ),
        countRows(serviceClient, 'sh_cs_inquiries', (q: Sb) =>
          q.eq('megaload_user_id', shId).eq('status', 'pending'),
        ),
        countRows(serviceClient, 'sh_stock_monitors', (q: Sb) => q.eq('megaload_user_id', shId)),
      ]);

    // 최근 7일 등록 실패
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const recentFailures = await safe(async () => {
      const { data } = await serviceClient
        .from('sh_product_channels')
        .select('id, status, updated_at')
        .eq('status', 'failed')
        .gte('updated_at', since)
        .limit(1000);
      return (data || []).length;
    }, 0);

    const connectedChannels = await safe(async () => {
      const { data } = await serviceClient
        .from('channel_credentials')
        .select('channel, is_connected')
        .eq('megaload_user_id', shId)
        .eq('is_connected', true);
      return ((data || []) as Array<{ channel: string }>).map((r) => r.channel);
    }, [] as string[]);

    const desktop = await safe(async () => {
      const { data } = await serviceClient
        .from('megaload_worker_heartbeats')
        .select('last_seen, app_version')
        .eq('megaload_user_id', shId)
        .order('last_seen', { ascending: false })
        .limit(1);
      const row = ((data || [])[0] || null) as { last_seen?: string; app_version?: string } | null;
      if (!row?.last_seen) return { online: false, lastSeenAt: null, version: null };
      const online = Date.now() - new Date(row.last_seen).getTime() < DESKTOP_ONLINE_WINDOW_MS;
      return { online, lastSeenAt: row.last_seen, version: row.app_version ?? null };
    }, { online: false, lastSeenAt: null as string | null, version: null as string | null });

    snapshot.megaload = {
      plan: shUser.plan ?? null,
      onboardingDone: !!shUser.onboarding_done,
      productCount,
      registeredCount,
      recentFailures,
      pendingOrders,
      pendingInquiries,
      stockMonitorCount,
      connectedChannels,
      desktopHelper: desktop,
    };

    if (!connectedChannels.includes('coupang')) {
      warnings.push('쿠팡 채널이 연동돼 있지 않습니다. 채널관리에서 API 키를 등록하세요.');
    }
    if (!desktop.online) {
      warnings.push('메가로드 도우미가 오프라인입니다. 소싱 수집과 품질 체크가 동작하지 않습니다.');
    }
    if (pendingOrders > 0) {
      warnings.push(`처리 대기 주문 ${pendingOrders}건 — 발주/송장 입력이 필요합니다.`);
    }
    if (pendingInquiries > 0) {
      warnings.push(`미답변 고객문의 ${pendingInquiries}건 — 방치하면 판매자 점수가 깎입니다.`);
    }
    if (recentFailures > 0) {
      warnings.push(`최근 7일 등록 실패 ${recentFailures}건이 있습니다.`);
    }
    if (productCount > 0 && productCount < 1000) {
      warnings.push(
        `등록 상품 ${productCount.toLocaleString()}개 — 매출이 도는 구간(1,000개 이상)에 아직 못 미칩니다. 지금은 등록에 집중할 단계입니다.`,
      );
    }
    if (stockMonitorCount === 0 && productCount > 0) {
      warnings.push('품절동기화에 등록된 상품이 없습니다. 품절 주문 사고가 날 수 있습니다.');
    }
  }

  return snapshot;
}

/** 봇 프롬프트에 넣을 짧은 텍스트로 변환 */
export function formatStatus(s: UserStatusSnapshot): string {
  if (!s.loggedIn) return '비로그인 방문자입니다. 계정 상태를 조회할 수 없습니다.';

  const lines: string[] = [];
  lines.push(`이름: ${s.name || '(미등록)'} / 역할: ${s.role || 'pt_user'}`);

  if (s.pt) {
    lines.push(
      `PT 회원: 가입 ${s.pt.daysSinceJoin ?? '?'}일차 · 쿠팡 API ${s.pt.coupangApiConnected ? '연동됨' : '미연동'}` +
        ` · 결제잠금 ${s.pt.paymentLockLevel}단계 · 카드 ${s.pt.hasPaymentCard ? '등록됨' : '없음'}`,
    );
  }
  if (s.settlement) {
    lines.push(
      `정산: ${s.settlement.targetMonth} 대상 · D-${s.settlement.dday} · 보고서 ${s.settlement.reportStatus ?? '미제출'}`,
    );
  }
  if (s.megaload) {
    const m = s.megaload;
    lines.push(
      `메가로드: 플랜 ${m.plan ?? 'free'} · 온보딩 ${m.onboardingDone ? '완료' : '미완료'}` +
        ` · 등록상품 ${m.productCount.toLocaleString()}개 (쿠팡 연결 ${m.registeredCount.toLocaleString()}개)`,
    );
    lines.push(
      `연동 채널: ${m.connectedChannels.length ? m.connectedChannels.join(', ') : '없음'}` +
        ` · 도우미 ${m.desktopHelper.online ? `온라인(v${m.desktopHelper.version ?? '?'})` : '오프라인'}`,
    );
    lines.push(
      `대기 주문 ${m.pendingOrders}건 · 미답변 문의 ${m.pendingInquiries}건 · 최근7일 등록실패 ${m.recentFailures}건 · 품절감시 ${m.stockMonitorCount}건`,
    );
  }
  if (s.penalty) {
    lines.push(`페널티: 위험점수 ${s.penalty.score ?? 0} · 진행 중 ${s.penalty.openIncidents}건`);
  }
  if (s.warnings.length) {
    lines.push('', '지금 짚어야 할 것:');
    for (const w of s.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n');
}
