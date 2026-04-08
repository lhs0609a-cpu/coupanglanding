/**
 * 품절 동기화 엔진 — 배치 모니터링 처리
 *
 * 1. 네이버 원본 페이지 크롤링 (stock-check 로직 재사용)
 * 2. 등록한 옵션(registered_option_name)이 품절이면 → 해당 상품 품절 판정
 * 3. 상태 변경 감지 시 쿠팡 suspend/resume 호출
 * 4. unknown 연속 3회 → 네이버 구조 변경 의심 알림
 * 5. DB 업데이트 + 로그 기록 + 알림 생성
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { CoupangAdapter } from '../adapters/coupang.adapter';
import type { OptionStockStatus } from './option-name-matcher';
import { normalizeOptionName, detectOptionChanges } from './option-name-matcher';

type StockStatus = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error';

const SOLDOUT_PATTERNS = [
  /품절/, /일시\s*품절/, /매진/, /구매\s*불가/, /판매\s*종료/, /판매\s*중지/,
  /재입고\s*알림/, /soldout/i, /sold[\s-]*out/i, /out[\s-]*of[\s-]*stock/i,
  /SOLD_OUT/, /"soldOut"\s*:\s*true/i, /not_sale/i, /data-soldout="?true"?/i,
];

const REMOVED_PATTERNS = [
  /존재하지\s*않는\s*상품/, /삭제된\s*상품/, /페이지를?\s*찾을\s*수\s*없/,
  /This item is no longer available/i, /요청하신\s*페이지를?\s*찾을\s*수/,
  /더\s*이상\s*판매하지\s*않/,
];

const IN_STOCK_PATTERNS = [
  /"inStock"\s*:\s*true/i, /availability.*InStock/i,
  /add[\s-]?to[\s-]?cart/i, /장바구니/, /바로\s*구매/,
];

interface CheckResult {
  status: StockStatus;
  options?: OptionStockStatus[];
  matchedPattern?: string;
}

async function checkUrl(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (res.status === 404 || res.status === 410) return { status: 'removed', matchedPattern: `HTTP ${res.status}` };
    if (!res.ok) return { status: 'error', matchedPattern: `HTTP ${res.status}` };

    const html = (await res.text()).slice(0, 500_000);

    for (const p of REMOVED_PATTERNS) {
      if (p.test(html)) return { status: 'removed', matchedPattern: p.source };
    }

    // 옵션 파싱 (네이버)
    let options: OptionStockStatus[] | undefined;
    if (/smartstore\.naver|shop\.naver/i.test(url)) {
      options = parseNaverOptionsInline(html) ?? undefined;
      // 전체 옵션 품절은 여기서 판정하지 않음 — 등록 옵션 기준으로 아래에서 판정
    }

    let soldOut: string | null = null;
    for (const p of SOLDOUT_PATTERNS) {
      if (p.test(html)) { soldOut = p.source; break; }
    }

    let inStock = false;
    for (const p of IN_STOCK_PATTERNS) {
      if (p.test(html)) { inStock = true; break; }
    }

    if (soldOut && !inStock) return { status: 'sold_out', matchedPattern: soldOut, options };
    if (inStock) return { status: 'in_stock', options };
    return { status: 'unknown', options };

  } catch (err) {
    clearTimeout(timeout);
    return { status: 'error', matchedPattern: (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message?.slice(0, 80) };
  }
}

function parseNaverOptionsInline(html: string): OptionStockStatus[] | null {
  const preloadMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (preloadMatch) {
    try {
      const optCombMatch = preloadMatch[1].match(/"optionCombinations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (optCombMatch) {
        const combos = JSON.parse(optCombMatch[1]) as { optionName1?: string; optionName2?: string; stockQuantity?: number; usable?: boolean }[];
        if (combos.length > 0) {
          return combos.map(c => {
            const name = [c.optionName1, c.optionName2].filter(Boolean).join(' / ');
            return { optionName: name || '기본', status: (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false ? 'sold_out' : 'in_stock' };
          });
        }
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * 등록한 옵션의 품절 상태 판정
 * - registered_option_name이 있으면: 해당 옵션의 품절 여부로 판정
 * - registered_option_name이 없으면: 전체 상품 상태로 판정 (단일 상품)
 */
function determineEffectiveStatus(
  pageStatus: StockStatus,
  options: OptionStockStatus[] | undefined,
  registeredOptionName: string | null,
): { status: StockStatus; matchedOption?: string } {
  // 삭제/에러/unknown은 그대로
  if (pageStatus === 'removed' || pageStatus === 'error' || pageStatus === 'unknown') {
    return { status: pageStatus };
  }

  // 등록 옵션명이 없으면 = 단일 상품 → 페이지 전체 상태 사용
  if (!registeredOptionName) {
    // 단, 옵션이 파싱되고 전부 품절이면 품절
    if (options && options.length > 0 && options.every(o => o.status === 'sold_out')) {
      return { status: 'sold_out' };
    }
    return { status: pageStatus };
  }

  // 등록 옵션명이 있는데 옵션 파싱 실패 → 페이지 전체 상태로 폴백
  if (!options || options.length === 0) {
    return { status: pageStatus };
  }

  // 등록한 옵션 찾기 (정규화 매칭 + 부분포함)
  const regNorm = normalizeOptionName(registeredOptionName);
  const matched = options.find(o => {
    const optNorm = normalizeOptionName(o.optionName);
    return optNorm === regNorm || optNorm.includes(regNorm) || regNorm.includes(optNorm);
  });

  if (matched) {
    return {
      status: matched.status === 'sold_out' ? 'sold_out' : 'in_stock',
      matchedOption: matched.optionName,
    };
  }

  // 매칭 실패 → 페이지 전체 상태로 폴백
  return { status: pageStatus };
}

export interface MonitorRecord {
  id: string;
  megaload_user_id: string;
  product_id: string;
  coupang_product_id: string;
  source_url: string;
  source_status: StockStatus;
  coupang_status: 'active' | 'suspended';
  option_statuses: OptionStockStatus[];
  consecutive_errors: number;
  consecutive_unknowns: number;
  registered_option_name: string | null;
}

export interface ProcessResult {
  monitorId: string;
  checked: boolean;
  changed: boolean;
  action?: string;
  error?: string;
}

/**
 * 배치 모니터링 처리 — cron에서 호출
 */
export async function processMonitorBatch(
  monitors: MonitorRecord[],
  supabase: SupabaseClient,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  // 사용자별 그룹화
  const byUser = new Map<string, MonitorRecord[]>();
  for (const m of monitors) {
    const list = byUser.get(m.megaload_user_id) || [];
    list.push(m);
    byUser.set(m.megaload_user_id, list);
  }

  for (const [userId, userMonitors] of byUser) {
    // auth user_id 조회 (알림용)
    let authUserId: string | null = null;
    try {
      const { data: muData } = await supabase
        .from('megaload_users')
        .select('user_id')
        .eq('id', userId)
        .single();
      authUserId = (muData as Record<string, unknown>)?.user_id as string | null;
    } catch { /* 알림 실패해도 모니터링은 계속 */ }

    // 사용자별 쿠팡 어댑터 획득
    let adapter: CoupangAdapter | null = null;
    try {
      adapter = (await getAuthenticatedAdapter(supabase, userId, 'coupang')) as CoupangAdapter;
    } catch {
      for (const m of userMonitors) {
        results.push({ monitorId: m.id, checked: false, changed: false, error: 'API 키 없음' });
      }
      continue;
    }

    // 3개씩 동시 처리
    const CONCURRENCY = 3;
    for (let i = 0; i < userMonitors.length; i += CONCURRENCY) {
      const chunk = userMonitors.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map(m => processSingleMonitor(m, adapter!, supabase, authUserId)),
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const r = chunkResults[j];
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          results.push({
            monitorId: chunk[j].id,
            checked: false,
            changed: false,
            error: r.reason instanceof Error ? r.reason.message : '처리 실패',
          });
        }
      }
    }
  }

  return results;
}

async function processSingleMonitor(
  monitor: MonitorRecord,
  adapter: CoupangAdapter,
  supabase: SupabaseClient,
  authUserId: string | null,
): Promise<ProcessResult> {
  const now = new Date().toISOString();

  // 1. 원본 URL 체크
  const check = await checkUrl(monitor.source_url);

  // 에러 처리
  if (check.status === 'error') {
    const newErrors = monitor.consecutive_errors + 1;
    await supabase.from('sh_stock_monitors').update({
      source_status: 'error',
      last_checked_at: now,
      consecutive_errors: newErrors,
      is_active: newErrors >= 10 ? false : true,
      updated_at: now,
    }).eq('id', monitor.id);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'check_error',
      source_status_before: monitor.source_status,
      source_status_after: 'error',
      error_message: check.matchedPattern || 'check failed',
    });

    return { monitorId: monitor.id, checked: true, changed: false, error: check.matchedPattern };
  }

  // 2. 구조 변경 감지 (unknown 연속 3회 → 알림)
  if (check.status === 'unknown') {
    const newUnknowns = (monitor.consecutive_unknowns || 0) + 1;
    await supabase.from('sh_stock_monitors').update({
      source_status: 'unknown',
      last_checked_at: now,
      consecutive_unknowns: newUnknowns,
      consecutive_errors: 0,
      updated_at: now,
    }).eq('id', monitor.id);

    // 3회 연속 unknown → 구조 변경 의심 알림 (1번만)
    if (newUnknowns === 3 && authUserId) {
      await supabase.from('notifications').insert({
        user_id: authUserId,
        type: 'system',
        title: '네이버 페이지 구조 변경 의심',
        message: `품절 체크가 3회 연속 "확인불가"입니다. 네이버 페이지 구조가 변경되었을 수 있습니다. 원본 URL을 확인해주세요.`,
        link: '/megaload/stock-monitor',
      });

      await supabase.from('sh_stock_monitor_logs').insert({
        monitor_id: monitor.id,
        megaload_user_id: monitor.megaload_user_id,
        event_type: 'check_error',
        source_status_before: monitor.source_status,
        source_status_after: 'unknown',
        error_message: '구조 변경 의심 — 3회 연속 unknown',
      });
    }

    return { monitorId: monitor.id, checked: true, changed: false };
  }

  // 3. 옵션별 품절 판정 — 등록한 옵션 기준
  const { status: effectiveStatus, matchedOption } = determineEffectiveStatus(
    check.status,
    check.options,
    monitor.registered_option_name,
  );

  const prevStatus = monitor.source_status;
  const statusChanged = prevStatus !== effectiveStatus;

  // 4. 상태 변경 시 쿠팡 액션 실행
  let actionTaken: string | undefined;
  let actionSuccess = true;

  if (statusChanged) {
    // 품절/삭제 → 쿠팡 판매중지
    if ((effectiveStatus === 'sold_out' || effectiveStatus === 'removed') && monitor.coupang_status === 'active') {
      try {
        await adapter.suspendProduct(monitor.coupang_product_id);
        actionTaken = 'coupang_suspended';

        await supabase.from('sh_product_channels')
          .update({ status: 'suspended' })
          .eq('product_id', monitor.product_id)
          .eq('channel', 'coupang');
      } catch (e) {
        actionTaken = 'coupang_suspend_failed';
        actionSuccess = false;
        console.error(`[stock-monitor] suspend failed for ${monitor.coupang_product_id}:`, e);
      }
    }

    // 재입고 → 쿠팡 판매재개
    if (effectiveStatus === 'in_stock' && (prevStatus === 'sold_out' || prevStatus === 'removed') && monitor.coupang_status === 'suspended') {
      try {
        await adapter.resumeProduct(monitor.coupang_product_id);
        actionTaken = 'coupang_resumed';

        await supabase.from('sh_product_channels')
          .update({ status: 'active' })
          .eq('product_id', monitor.product_id)
          .eq('channel', 'coupang');
      } catch (e) {
        actionTaken = 'coupang_resume_failed';
        actionSuccess = false;
        console.error(`[stock-monitor] resume failed for ${monitor.coupang_product_id}:`, e);
      }
    }
  }

  // 옵션 변경 감지
  let optionChanges: ReturnType<typeof detectOptionChanges> = [];
  if (check.options && monitor.option_statuses?.length > 0) {
    optionChanges = detectOptionChanges(monitor.option_statuses, check.options);
  }

  // 5. DB 업데이트
  const coupangStatus = actionTaken === 'coupang_suspended' ? 'suspended'
    : actionTaken === 'coupang_resumed' ? 'active'
    : monitor.coupang_status;

  await supabase.from('sh_stock_monitors').update({
    source_status: effectiveStatus,
    coupang_status: coupangStatus,
    option_statuses: check.options || monitor.option_statuses,
    last_checked_at: now,
    consecutive_errors: 0,
    consecutive_unknowns: 0, // 정상 응답이면 리셋
    updated_at: now,
    ...(statusChanged && { last_changed_at: now }),
    ...(actionTaken && { last_action_at: now }),
  }).eq('id', monitor.id);

  // 6. 로그 + 알림
  if (statusChanged || actionTaken) {
    const eventType = effectiveStatus === 'sold_out' ? 'source_sold_out'
      : effectiveStatus === 'removed' ? 'source_removed'
      : effectiveStatus === 'in_stock' && (prevStatus === 'sold_out' || prevStatus === 'removed') ? 'source_restocked'
      : 'check_ok';

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: eventType,
      source_status_before: prevStatus,
      source_status_after: effectiveStatus,
      coupang_status_before: monitor.coupang_status,
      coupang_status_after: coupangStatus,
      action_taken: actionTaken || null,
      action_success: actionSuccess,
      option_name: matchedOption || monitor.registered_option_name || null,
    });

    // 옵션별 변경 로그
    for (const change of optionChanges) {
      await supabase.from('sh_stock_monitor_logs').insert({
        monitor_id: monitor.id,
        megaload_user_id: monitor.megaload_user_id,
        event_type: change.after === 'sold_out' ? 'source_sold_out' : 'source_restocked',
        source_status_before: change.before,
        source_status_after: change.after,
        option_name: change.optionName,
      });
    }

    // 알림 (auth user_id가 있을 때만)
    if (authUserId) {
      const optionLabel = monitor.registered_option_name ? ` (옵션: ${monitor.registered_option_name})` : '';
      if (effectiveStatus === 'sold_out' || effectiveStatus === 'removed') {
        await supabase.from('notifications').insert({
          user_id: authUserId,
          type: 'system',
          title: '원본 상품 품절 감지',
          message: `원본 상품이 ${effectiveStatus === 'sold_out' ? '품절' : '삭제'}되어 쿠팡 상품을 판매중지했습니다.${optionLabel}`,
          link: '/megaload/stock-monitor',
        });
      } else if (effectiveStatus === 'in_stock' && (prevStatus === 'sold_out' || prevStatus === 'removed')) {
        await supabase.from('notifications').insert({
          user_id: authUserId,
          type: 'system',
          title: '원본 상품 재입고 감지',
          message: `원본 상품이 재입고되어 쿠팡 상품 판매를 재개했습니다.${optionLabel}`,
          link: '/megaload/stock-monitor',
        });
      }
    }
  }

  return {
    monitorId: monitor.id,
    checked: true,
    changed: statusChanged || optionChanges.length > 0,
    action: actionTaken,
  };
}
