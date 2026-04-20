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
import type { PriceFollowRule, PendingPriceChange } from '@/lib/supabase/types';

type StockStatus = 'in_stock' | 'sold_out' | 'removed' | 'unknown' | 'error';

/**
 * DRY_RUN 모드 — 환경변수로 실제 쿠팡 updatePrice 호출을 차단하고 로그만 기록
 * 롤아웃 초기 검증용. 기본 false (해제).
 */
const PRICE_FOLLOW_DRY_RUN = process.env.PRICE_FOLLOW_DRY_RUN === '1';

/**
 * 긴급 전체 정지 킬스위치. 1이면 모든 가격 추종 로직을 건너뜀.
 */
const PRICE_FOLLOW_KILLSWITCH = process.env.PRICE_FOLLOW_KILLSWITCH === '1';

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
  /** 네이버 메인 상품 판매가 (옵션 조합 기준가) */
  mainPrice?: number;
  matchedPattern?: string;
}

const NAVER_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
// Fly.io 측의 PROXY_SECRET은 COUPANG_PROXY_SECRET과 동일 값 — coupang-api-client와 같은 fallback 규칙 사용
const NAVER_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';

async function checkUrl(url: string, retryCount = 0): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    let statusCode: number;
    let html: string;

    // 네이버 URL이고 프록시가 설정돼 있으면 Fly.io 프록시 경유 (Vercel 직접 fetch 시 403 차단 방지)
    const isNaverUrl = /smartstore\.naver|shop\.naver|brand\.naver|shopping\.naver/.test(url);
    if (isNaverUrl && NAVER_PROXY_URL) {
      const proxyBase = NAVER_PROXY_URL.replace(/\/proxy\/?$/, '');
      const proxyRes = await fetch(`${proxyBase}/naver-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Secret': NAVER_PROXY_SECRET,
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!proxyRes.ok) {
        const errData = await proxyRes.json().catch(() => ({}));
        return { status: 'error', matchedPattern: `proxy ${proxyRes.status}: ${(errData as Record<string, string>).error || ''}` };
      }
      const data = await proxyRes.json() as { statusCode: number; html: string };
      statusCode = data.statusCode;
      html = data.html || '';
    } else {
      // 직접 fetch (프록시 미설정 or 비네이버 URL)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
        redirect: 'follow',
        cache: 'no-store',
      });
      clearTimeout(timeout);
      statusCode = res.status;
      html = (await res.text()).slice(0, 500_000);
    }

    if (statusCode === 404 || statusCode === 410) return { status: 'removed', matchedPattern: `HTTP ${statusCode}` };
    if (statusCode === 429 && retryCount < 1) {
      await sleep(8000);
      return checkUrl(url, retryCount + 1);
    }
    if (statusCode === 403) return { status: 'error', matchedPattern: 'HTTP 403 (접근 차단)' };
    if (statusCode < 200 || statusCode >= 400) return { status: 'error', matchedPattern: `HTTP ${statusCode}` };

    for (const p of REMOVED_PATTERNS) {
      if (p.test(html)) return { status: 'removed', matchedPattern: p.source };
    }

    // 옵션 + 메인가 파싱 (네이버)
    let options: OptionStockStatus[] | undefined;
    let mainPrice: number | undefined;
    if (/smartstore\.naver|shop\.naver/i.test(url)) {
      options = parseNaverOptionsInline(html) ?? undefined;
      mainPrice = parseNaverMainPrice(html) ?? undefined;
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

    if (soldOut && !inStock) return { status: 'sold_out', matchedPattern: soldOut, options, mainPrice };
    if (inStock) return { status: 'in_stock', options, mainPrice };
    return { status: 'unknown', options, mainPrice };

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
        const combos = JSON.parse(optCombMatch[1]) as {
          optionName1?: string; optionName2?: string;
          stockQuantity?: number; usable?: boolean;
          price?: number; priceRelative?: number;
        }[];
        if (combos.length > 0) {
          return combos.map(c => {
            const name = [c.optionName1, c.optionName2].filter(Boolean).join(' / ');
            const soldOut = (c.stockQuantity !== undefined && c.stockQuantity <= 0) || c.usable === false;
            const result: OptionStockStatus = {
              optionName: name || '기본',
              status: soldOut ? 'sold_out' : 'in_stock',
            };
            if (typeof c.price === 'number' && c.price > 0) result.price = c.price;
            if (typeof c.priceRelative === 'number') result.priceRelative = c.priceRelative;
            return result;
          });
        }
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * 네이버 스마트스토어 메인 상품 판매가 파싱
 *  - __PRELOADED_STATE__ JSON 내 salePrice / dispPrice / productPrice / price 순차 시도
 *  - JSON-LD "price":"12345" fallback
 *  - <meta property="product:price:amount"> fallback
 *  - 실패 시 null
 *
 * NOTE: 초기 롤아웃 시 실제 필드명이 다를 수 있음. DEBUG_NAVER_PRICE=1 환경변수로 preload state 앞부분을 로깅.
 */
function parseNaverMainPrice(html: string): number | null {
  const preloadMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (preloadMatch) {
    const preload = preloadMatch[1];

    if (process.env.DEBUG_NAVER_PRICE === '1') {
      console.log('[parseNaverMainPrice] preload head:', preload.slice(0, 2000));
    }

    // salePrice → dispPrice → productPrice → discountedSalePrice → price
    const fieldCandidates = [
      'salePrice', 'dispSalePrice', 'dispPrice',
      'productSalePrice', 'productPrice',
      'discountedSalePrice', 'discountedPrice',
      'price',
    ];
    for (const field of fieldCandidates) {
      const re = new RegExp(`"${field}"\\s*:\\s*(\\d{2,10})`);
      const m = preload.match(re);
      if (m) {
        const v = parseInt(m[1], 10);
        if (!Number.isNaN(v) && v > 0) return v;
      }
    }
  }

  // JSON-LD fallback
  const ldMatch = html.match(/"@type"\s*:\s*"Product"[\s\S]*?"price"\s*:\s*"?(\d{2,10})/);
  if (ldMatch) {
    const v = parseInt(ldMatch[1], 10);
    if (!Number.isNaN(v) && v > 0) return v;
  }

  // Open Graph meta
  const ogMatch = html.match(/<meta\s+property="product:price:amount"\s+content="(\d+(?:\.\d+)?)"/i);
  if (ogMatch) {
    const v = Math.round(parseFloat(ogMatch[1]));
    if (!Number.isNaN(v) && v > 0) return v;
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

/**
 * 쿠팡 API로 실제 상품 상태 + 판매가를 조회하여 DB 반영
 * - statusName: APPROVE → 'active', SUSPEND/기타 → 'suspended'
 * - our_price_last: 첫 번째 item의 salePrice
 */
async function fetchAndUpdateCoupangStatus(
  monitor: { id: string; coupang_product_id: string; coupang_status: 'active' | 'suspended'; our_price_last: number | null },
  adapter: CoupangAdapter,
  supabase: SupabaseClient,
  now: string,
): Promise<{ coupangApiStatus: 'active' | 'suspended'; coupangApiPrice: number | null } | null> {
  try {
    const detail = await adapter.getProductDetail(monitor.coupang_product_id);
    if (!detail) return null;

    const ACTIVE_STATUSES = new Set(['APPROVE', 'PARTIAL_APPROVAL', 'WAITING_FOR_APPROVAL', 'REGISTRATION']);
    const coupangApiStatus: 'active' | 'suspended' = ACTIVE_STATUSES.has(String(detail.statusName || '').toUpperCase()) ? 'active' : 'suspended';
    const coupangApiPrice = detail.items?.[0]?.salePrice ?? null;

    // DB 업데이트 — 변경분만
    const updates: Record<string, unknown> = { updated_at: now };
    if (coupangApiStatus !== monitor.coupang_status) {
      updates.coupang_status = coupangApiStatus;
      console.log(`[stock-monitor] coupang status mismatch: monitor=${monitor.id} DB=${monitor.coupang_status} API=${coupangApiStatus}`);
    }
    if (coupangApiPrice != null && coupangApiPrice > 0) {
      updates.our_price_last = coupangApiPrice;
    }

    if (Object.keys(updates).length > 1) { // updated_at 외에 변경이 있을 때만
      await supabase.from('sh_stock_monitors').update(updates).eq('id', monitor.id);
    }

    return { coupangApiStatus, coupangApiPrice };
  } catch (err) {
    console.warn(`[stock-monitor] fetchAndUpdateCoupangStatus failed for ${monitor.coupang_product_id}:`, err);
    return null;
  }
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
  // 가격 추종
  price_follow_rule: PriceFollowRule | null;
  source_price_last: number | null;
  our_price_last: number | null;
  price_last_updated_at: string | null;
  price_last_applied_at: string | null;
  pending_price_change: PendingPriceChange | null;
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
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

    // 1개씩 순차 처리 + 4초 딜레이 (네이버 429 방지)
    // 429 circuit breaker: 2연속 429 → 나머지 스킵
    let consecutive429 = 0;
    for (let i = 0; i < userMonitors.length; i++) {
      if (i > 0) await sleep(1500);

      // Circuit breaker: 429 연속 2회 → 배치 중단
      if (consecutive429 >= 2) {
        console.log(`[stock-monitor] 429 circuit breaker at ${i}/${userMonitors.length}`);
        for (let j = i; j < userMonitors.length; j++) {
          results.push({
            monitorId: userMonitors[j].id,
            checked: false,
            changed: false,
            error: '429 속도제한 — 다음 크론에서 재시도',
          });
        }
        break;
      }

      try {
        const result = await processSingleMonitor(userMonitors[i], adapter!, supabase, authUserId);
        results.push(result);

        if (result.error?.includes('429')) {
          consecutive429++;
          // 429 발생 시 추가 대기
          await sleep(5000);
        } else {
          consecutive429 = 0;
        }
      } catch (err) {
        results.push({
          monitorId: userMonitors[i].id,
          checked: false,
          changed: false,
          error: err instanceof Error ? err.message : '처리 실패',
        });
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

  // source_url 미설정 모니터 — 소스 체크는 불가하지만 쿠팡 실제 상태/가격은 조회
  if (!monitor.source_url) {
    // 쿠팡 API로 실제 상태 + 판매가 조회
    await fetchAndUpdateCoupangStatus(monitor, adapter, supabase, now);

    // last_checked_at 갱신
    await supabase.from('sh_stock_monitors').update({
      last_checked_at: now,
      updated_at: now,
    }).eq('id', monitor.id);

    return { monitorId: monitor.id, checked: true, changed: false };
  }

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

  // 4. 쿠팡 액션 실행
  let actionTaken: string | undefined;
  let actionSuccess = true;

  // 4-a. 품절/삭제 감지 → 쿠팡 판매중지 (상태 변경 시만)
  if (statusChanged && (effectiveStatus === 'sold_out' || effectiveStatus === 'removed') && monitor.coupang_status === 'active') {
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

  // 4-b. 원본 판매중인데 쿠팡 중지됨 → 재개 (상태 변경 여부와 무관)
  //  기존 버그: sold_out/removed → in_stock 전환만 resume했음
  //  수정: error/unknown → in_stock, 또는 in_stock 유지 중 쿠팡만 suspended인 경우도 resume
  if (effectiveStatus === 'in_stock' && monitor.coupang_status === 'suspended') {
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

  // 옵션 변경 감지
  let optionChanges: ReturnType<typeof detectOptionChanges> = [];
  if (check.options && monitor.option_statuses?.length > 0) {
    optionChanges = detectOptionChanges(monitor.option_statuses, check.options);
  }

  // 5. DB 업데이트
  const coupangStatus = actionTaken === 'coupang_suspended' ? 'suspended'
    : actionTaken === 'coupang_resumed' ? 'active'
    : monitor.coupang_status;

  // 5-a. 소스 가격 관찰값 계산 (등록 옵션 매칭 우선, 아니면 메인가)
  let observedSourcePrice: number | null = null;
  if (monitor.registered_option_name && check.options) {
    const regNorm = normalizeOptionName(monitor.registered_option_name);
    const matched = check.options.find(o => {
      const optNorm = normalizeOptionName(o.optionName);
      return optNorm === regNorm || optNorm.includes(regNorm) || regNorm.includes(optNorm);
    });
    if (matched?.price) observedSourcePrice = matched.price;
    else if (matched?.priceRelative != null && check.mainPrice != null) {
      observedSourcePrice = check.mainPrice + matched.priceRelative;
    }
  }
  if (observedSourcePrice == null) observedSourcePrice = check.mainPrice ?? null;

  const sourcePriceChanged = observedSourcePrice != null && observedSourcePrice !== monitor.source_price_last;

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
    // 소스 가격 항상 저장 (가격추종 룰 유무와 무관)
    ...(observedSourcePrice != null && { source_price_last: observedSourcePrice }),
    ...(sourcePriceChanged && { price_last_updated_at: now }),
  }).eq('id', monitor.id);

  // 5-a2. 소스 가격 변동 로그 (가격추종 룰 유무와 무관)
  if (sourcePriceChanged) {
    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_changed_source',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
    });
  }

  // 5-a3. 쿠팡 API로 실제 상태/판매가 조회 (our_price_last + coupang_status 갱신)
  const coupangDetail = await fetchAndUpdateCoupangStatus(monitor, adapter, supabase, now);
  if (coupangDetail?.coupangApiPrice != null && coupangDetail.coupangApiPrice > 0) {
    monitor.our_price_last = coupangDetail.coupangApiPrice;
  } else if (monitor.our_price_last == null) {
    // 쿠팡 API 실패 시 DB 폴백
    try {
      const cachedOurPrice = await fetchCurrentOurPrice(supabase, monitor.product_id);
      if (cachedOurPrice != null) {
        await supabase.from('sh_stock_monitors').update({
          our_price_last: cachedOurPrice,
          updated_at: now,
        }).eq('id', monitor.id);
        monitor.our_price_last = cachedOurPrice;
      }
    } catch { /* 캐시 실패해도 진행 */ }
  }

  // 5-b. 가격 자동 추종 — 재고가 정상이고 이번 사이클에 suspend/resume 액션이 없을 때만
  let priceAction: PriceFollowActionResult | undefined;
  const safeForPrice =
    !PRICE_FOLLOW_KILLSWITCH
    && effectiveStatus === 'in_stock'
    && actionTaken !== 'coupang_suspended'
    && actionTaken !== 'coupang_suspend_failed'
    && actionTaken !== 'coupang_resumed'
    && actionTaken !== 'coupang_resume_failed';

  if (safeForPrice) {
    try {
      priceAction = await processPriceFollow({
        monitor,
        observedSourcePrice,
        adapter,
        supabase,
        authUserId,
        now,
      });
    } catch (e) {
      console.error(`[stock-monitor] processPriceFollow error for ${monitor.id}:`, e);
    }
  }

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
    changed: statusChanged || optionChanges.length > 0 || (priceAction?.action === 'applied' || priceAction?.action === 'pending'),
    action: actionTaken || (priceAction && priceAction.action !== 'none' ? `price_${priceAction.action}` : undefined),
  };
}

// ================================================================
// 가격 자동 추종
// ================================================================

type PriceFollowActionResult =
  | { action: 'none'; reason?: string }
  | { action: 'applied'; oldPrice: number; newPrice: number; sourcePrice: number }
  | { action: 'skipped'; reason: string; targetPrice?: number }
  | { action: 'flagged'; reason: string; targetPrice: number }
  | { action: 'pending'; targetPrice: number }
  | { action: 'failed'; reason: string; targetPrice: number };

const DEFAULT_MIN_CHANGE_PCT = 1;
const DEFAULT_MAX_CHANGE_PCT = 30;
const DEFAULT_COOLDOWN_MINUTES = 60;

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10;
}

function computeTargetPrice(
  rule: PriceFollowRule,
  sourcePrice: number,
  currentOurPrice: number,
): { target: number; updatedRule?: PriceFollowRule } {
  let target = sourcePrice;
  let updatedRule: PriceFollowRule | undefined;

  switch (rule.type) {
    case 'exact':
      target = sourcePrice;
      break;
    case 'markup_amount':
      target = sourcePrice + (rule.amount ?? 0);
      break;
    case 'markup_percent':
      target = Math.round(sourcePrice * (1 + (rule.percent ?? 0) / 100));
      break;
    case 'fixed_margin': {
      if (typeof rule.captured_margin === 'number') {
        target = sourcePrice + rule.captured_margin;
      } else {
        // 첫 활성화 — 현재가 - 소스가 로 마진 캡처
        const margin = currentOurPrice - sourcePrice;
        updatedRule = { ...rule, captured_margin: margin };
        target = currentOurPrice; // 첫 실행은 변경 없음
      }
      break;
    }
  }

  return { target: roundTo10(target), updatedRule };
}

async function fetchCurrentOurPrice(
  supabase: SupabaseClient,
  productId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('sh_product_options')
    .select('sale_price')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();
  const price = (data as { sale_price?: number } | null)?.sale_price;
  return typeof price === 'number' && price > 0 ? price : null;
}

async function processPriceFollow(input: {
  monitor: MonitorRecord;
  observedSourcePrice: number | null;
  adapter: CoupangAdapter;
  supabase: SupabaseClient;
  authUserId: string | null;
  now: string;
}): Promise<PriceFollowActionResult> {
  const { monitor, observedSourcePrice, adapter, supabase, authUserId, now } = input;
  const rule = monitor.price_follow_rule;

  // 0. 규칙 비활성 → no-op
  if (!rule || rule.enabled !== true) return { action: 'none' };

  // 1. 관찰 가격 없음 → no-op
  if (observedSourcePrice == null || observedSourcePrice <= 0) {
    return { action: 'none', reason: 'no source price observed' };
  }

  // 2. 소스 가격 저장 + 로그는 메인 루프(processSingleMonitor)에서 처리 완료

  // 3. 현재 우리가 해석 (24h 이내 our_price_last 우선)
  let ourPrice: number | null = null;
  if (
    monitor.our_price_last != null &&
    monitor.price_last_applied_at &&
    Date.now() - new Date(monitor.price_last_applied_at).getTime() < 24 * 60 * 60 * 1000
  ) {
    ourPrice = monitor.our_price_last;
  }
  if (ourPrice == null) {
    ourPrice = await fetchCurrentOurPrice(supabase, monitor.product_id);
    // 캐시
    if (ourPrice != null) {
      await supabase.from('sh_stock_monitors').update({
        our_price_last: ourPrice,
        updated_at: now,
      }).eq('id', monitor.id);
    }
  }
  if (ourPrice == null) {
    return { action: 'none', reason: 'our price unknown' };
  }

  // 4. 목표가 계산
  const { target: targetPrice, updatedRule } = computeTargetPrice(rule, observedSourcePrice, ourPrice);
  if (updatedRule) {
    await supabase.from('sh_stock_monitors').update({
      price_follow_rule: updatedRule,
      updated_at: now,
    }).eq('id', monitor.id);
  }

  // 변동 없음
  if (targetPrice === ourPrice) {
    return { action: 'none', reason: 'target equals current' };
  }

  // 5. 가드레일 — min/max price
  if (typeof rule.min_price === 'number' && targetPrice < rule.min_price) {
    await logPriceSkip(supabase, monitor, 'below min_price', observedSourcePrice, ourPrice, targetPrice);
    return { action: 'skipped', reason: 'below min_price', targetPrice };
  }
  if (typeof rule.max_price === 'number' && targetPrice > rule.max_price) {
    await logPriceSkip(supabase, monitor, 'above max_price', observedSourcePrice, ourPrice, targetPrice);
    return { action: 'skipped', reason: 'above max_price', targetPrice };
  }

  // 6. 방향 체크
  const followDown = rule.follow_down !== false;
  if (targetPrice < ourPrice && !followDown) {
    await logPriceSkip(supabase, monitor, 'downward disabled', observedSourcePrice, ourPrice, targetPrice);
    return { action: 'skipped', reason: 'downward disabled', targetPrice };
  }

  // 7. 변동폭 체크
  const changePct = Math.abs((targetPrice - ourPrice) / ourPrice) * 100;
  const minChange = rule.min_change_pct ?? DEFAULT_MIN_CHANGE_PCT;
  const maxChange = rule.max_change_pct ?? DEFAULT_MAX_CHANGE_PCT;

  if (changePct < minChange) {
    await logPriceSkip(supabase, monitor, `below min_change_pct (${changePct.toFixed(2)}%)`, observedSourcePrice, ourPrice, targetPrice);
    return { action: 'skipped', reason: 'below min_change_pct', targetPrice };
  }

  if (changePct > maxChange) {
    // flagged → pending 기록
    const pending: PendingPriceChange = {
      newPrice: targetPrice,
      oldPrice: ourPrice,
      sourcePrice: observedSourcePrice,
      reason: `변동폭 초과(${changePct.toFixed(1)}%) — 자동 보류`,
      detectedAt: now,
    };
    await supabase.from('sh_stock_monitors').update({
      pending_price_change: pending,
      updated_at: now,
    }).eq('id', monitor.id);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_update_flagged',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
      our_price_before: ourPrice,
      our_price_after: targetPrice,
      price_skip_reason: `above max_change_pct (${changePct.toFixed(2)}%)`,
    });

    if (authUserId) {
      await supabase.from('notifications').insert({
        user_id: authUserId,
        type: 'system',
        title: '가격 변동 이상치 감지',
        message: `소스 가격이 ${changePct.toFixed(1)}% 변동했습니다. 검토 후 승인해주세요.`,
        link: '/megaload/stock-monitor',
      });
    }

    return { action: 'flagged', reason: 'above max_change_pct', targetPrice };
  }

  // 8. 쿨다운 체크
  const cooldown = rule.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES;
  if (monitor.price_last_applied_at) {
    const sinceMs = Date.now() - new Date(monitor.price_last_applied_at).getTime();
    if (sinceMs < cooldown * 60 * 1000) {
      await logPriceSkip(supabase, monitor, `cooldown (${Math.round((cooldown * 60 * 1000 - sinceMs) / 60000)}m 남음)`, observedSourcePrice, ourPrice, targetPrice);
      return { action: 'skipped', reason: 'cooldown', targetPrice };
    }
  }

  // 9. 모드 분기
  if (rule.mode === 'manual_approval') {
    const pending: PendingPriceChange = {
      newPrice: targetPrice,
      oldPrice: ourPrice,
      sourcePrice: observedSourcePrice,
      reason: `수동 승인 대기 (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`,
      detectedAt: now,
    };
    await supabase.from('sh_stock_monitors').update({
      pending_price_change: pending,
      updated_at: now,
    }).eq('id', monitor.id);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_update_pending',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
      our_price_before: ourPrice,
      our_price_after: targetPrice,
    });

    if (authUserId) {
      await supabase.from('notifications').insert({
        user_id: authUserId,
        type: 'system',
        title: '가격 변경 승인 대기',
        message: `소스가격 변동으로 ₩${ourPrice.toLocaleString()} → ₩${targetPrice.toLocaleString()} 변경이 제안되었습니다.`,
        link: '/megaload/stock-monitor',
      });
    }

    return { action: 'pending', targetPrice };
  }

  // 10. auto 모드 — 실제 쿠팡 API 호출
  if (PRICE_FOLLOW_DRY_RUN) {
    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_update_skipped',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
      our_price_before: ourPrice,
      our_price_after: targetPrice,
      price_skip_reason: 'DRY_RUN',
    });
    return { action: 'skipped', reason: 'DRY_RUN', targetPrice };
  }

  try {
    await adapter.updatePrice(monitor.coupang_product_id, targetPrice);

    // DB 동기화
    await supabase.from('sh_stock_monitors').update({
      our_price_last: targetPrice,
      price_last_applied_at: now,
      updated_at: now,
    }).eq('id', monitor.id);

    await supabase.from('sh_product_options')
      .update({ sale_price: targetPrice })
      .eq('product_id', monitor.product_id);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_updated_coupang',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
      our_price_before: ourPrice,
      our_price_after: targetPrice,
      action_taken: 'coupang_price_updated',
      action_success: true,
    });

    if (authUserId) {
      await supabase.from('notifications').insert({
        user_id: authUserId,
        type: 'system',
        title: '가격 자동 업데이트 완료',
        message: `소스가격 변동에 따라 ₩${ourPrice.toLocaleString()} → ₩${targetPrice.toLocaleString()}로 자동 변경했습니다.`,
        link: '/megaload/stock-monitor',
      });
    }

    return { action: 'applied', oldPrice: ourPrice, newPrice: targetPrice, sourcePrice: observedSourcePrice };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'updatePrice failed';
    console.error(`[stock-monitor] price update failed for ${monitor.coupang_product_id}:`, e);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'price_update_failed',
      source_price_before: monitor.source_price_last ?? null,
      source_price_after: observedSourcePrice,
      our_price_before: ourPrice,
      our_price_after: targetPrice,
      action_taken: 'coupang_price_updated',
      action_success: false,
      error_message: msg.slice(0, 500),
    });
    return { action: 'failed', reason: msg, targetPrice };
  }
}

async function logPriceSkip(
  supabase: SupabaseClient,
  monitor: MonitorRecord,
  reason: string,
  sourcePrice: number,
  ourPrice: number,
  targetPrice: number,
) {
  await supabase.from('sh_stock_monitor_logs').insert({
    monitor_id: monitor.id,
    megaload_user_id: monitor.megaload_user_id,
    event_type: 'price_update_skipped',
    source_price_before: monitor.source_price_last ?? null,
    source_price_after: sourcePrice,
    our_price_before: ourPrice,
    our_price_after: targetPrice,
    price_skip_reason: reason,
  });
}
