/**
 * 품절 동기화 엔진 — 배치 모니터링 처리
 *
 * 1. 네이버 원본 페이지 크롤링 (stock-check 로직 재사용)
 * 2. 등록한 옵션(registered_option_name)이 품절이면 → 해당 상품 품절 판정
 * 3. 상태 변경 감지 시 쿠팡 suspend/resume 호출
 * 3-c. 멀티채널 전파 — 쿠팡 외 전 채널 재고 0/복구 (오버셀 방지)
 * 4. unknown 연속 3회 → 네이버 구조 변경 의심 알림
 * 5. DB 업데이트 + 로그 기록 + 알림 생성
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedAdapter } from '../adapters/factory';
import type { CoupangAdapter } from '../adapters/coupang.adapter';
import type { BaseAdapter } from '../adapters/base.adapter';
import type { Channel } from '../types';
import type { OptionStockStatus } from './option-name-matcher';
import { normalizeOptionName, detectOptionChanges } from './option-name-matcher';
import { propagateStockToOtherChannels } from './multichannel-stock-sync';
import { DEFAULT_PRICE_FOLLOW_RULE } from '../price-follow-default';
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

/**
 * 판매 on/off(중지·재개) 안전장치.
 *  - SALE_TOGGLE_DRY_RUN=1: 실제 쿠팡 호출 없이 로그만 (롤아웃 초기 검증)
 *  - SALE_TOGGLE_KILLSWITCH=1: 모든 판매중지/재개 건너뜀 (긴급 정지)
 */
const SALE_TOGGLE_DRY_RUN = process.env.SALE_TOGGLE_DRY_RUN === '1';
const SALE_TOGGLE_KILLSWITCH = process.env.SALE_TOGGLE_KILLSWITCH === '1';

/**
 * 쿠팡 승인 라이프사이클 분류.
 * ⚠️ status/statusName 은 "승인 상태"이지 "판매중/중지"가 아니다 — 판매 on/off 토글 가능 여부 판정용.
 *   - live: 승인완료/부분승인 → 판매 on/off 토글 가능
 *   - removed: 상품삭제 → 더 이상 토글 불가, 모니터 비활성화
 *   - rejected: 승인반려 → 토글 불가, 사용자 조치 필요
 *   - pending: 임시저장/심사중/승인대기 → 이번 사이클 토글 스킵(다음에 재시도)
 * 영문 status(APPROVED 등)와 한글 statusName(승인완료 등) 둘 다로 판정 — 쿠팡 응답 변형 대비.
 */
type CoupangLifecycle = 'live' | 'removed' | 'rejected' | 'pending' | 'unknown';
function classifyCoupangLifecycle(status: string, statusName: string): CoupangLifecycle {
  const s = (status || '').toUpperCase();
  const n = statusName || '';
  if (s === 'DELETED' || n.includes('삭제')) return 'removed';
  if (s === 'DENIED' || s === 'REJECTED' || n.includes('반려')) return 'rejected';
  if (s === 'APPROVED' || s === 'PARTIAL_APPROVED' || s === 'PARTIAL_APPROVAL' || n.includes('승인완료')) return 'live';
  if (s === 'SAVED' || s === 'IN_REVIEW' || s === 'APPROVING' || n.includes('심사') || n.includes('임시') || n.includes('승인대기')) return 'pending';
  return 'unknown';
}

/** 쿠팡 재개/중지 호출이 "이미 그 상태"라서 거부된 경우 — 목표 상태는 이미 달성된 것이므로 성공으로 간주 */
function isAlreadyInTargetState(msg: string): boolean {
  return /이미|already|판매\s*중|중지\s*상태|SUCCESS/i.test(msg || '');
}

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
  /**
   * 에러 분류 — status='error'일 때만 사용
   *  - 'infra': 프록시/네트워크 설정 문제 (프록시 400/401/502, DNS 실패 등). 상품별 문제 아님 → consecutive_errors 증가 금지
   *  - 'transient': 재시도 가능 (HTTP 429, 타임아웃 1회차 등). 기존 circuit breaker로 처리
   *  - 'naver': 네이버 응답 문제 (HTTP 403/404/500, 페이지 파싱 실패 등). consecutive_errors 증가
   */
  errorClass?: 'infra' | 'transient' | 'naver';
}

const NAVER_PROXY_URL = process.env.COUPANG_PROXY_URL || '';
// Fly.io 측의 PROXY_SECRET은 COUPANG_PROXY_SECRET과 동일 값 — coupang-api-client와 같은 fallback 규칙 사용
const NAVER_PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';

/**
 * 네이버 데스크탑 URL → 모바일 URL 변환.
 * 모바일 페이지는 anti-scraping 검사가 약한 경우가 많아 1차 차단 시 폴백으로 시도.
 *   smartstore.naver.com/STORE/products/ID → m.smartstore.naver.com/STORE/products/ID
 *   shopping.naver.com/... → m.shopping.naver.com/...
 */
function toMobileUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'smartstore.naver.com') {
      u.hostname = 'm.smartstore.naver.com';
      return u.toString();
    }
    if (u.hostname === 'shopping.naver.com') {
      u.hostname = 'm.shopping.naver.com';
      return u.toString();
    }
    if (u.hostname === 'brand.naver.com') {
      u.hostname = 'm.brand.naver.com';
      return u.toString();
    }
    return null;
  } catch { return null; }
}

/**
 * Google Translate proxy URL 변환.
 * 구글 서버가 페이지 fetch + iframe → 네이버에 구글 IP 노출 (우리 IP 숨김).
 *   smartstore.naver.com/STORE/products/ID
 *   → smartstore-naver-com.translate.goog/STORE/products/ID?_x_tr_sl=ko&_x_tr_tl=en
 * 마지막 폴백 — 캐시 지연/HTML 변형 가능하나 차단 회피용.
 */
function toGoogleTranslateUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const translatedHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
    u.hostname = translatedHost;
    u.searchParams.set('_x_tr_sl', 'ko');
    u.searchParams.set('_x_tr_tl', 'en');
    u.searchParams.set('_x_tr_hl', 'en');
    return u.toString();
  } catch { return null; }
}

async function checkUrl(url: string, retryCount = 0): Promise<CheckResult> {
  // ── 다단계 폴백 시퀀스 (IP 변경 X, 비용 X) ──
  // 1차: Google Translate proxy — 구글 IP 경유 (우리/Fly IP 차단 회피), 안정적
  // 2차: 원본 URL (Fly.io 프록시 → 직접 fetch 폴백)
  // 3차: 모바일 URL
  // 우선순위: GT가 실패해도 본진 시도 → 시간 낭비 방지

  // 1차: Google Translate (네이버 URL인 경우만)
  const isNaverUrl = /smartstore\.naver|shop\.naver|brand\.naver|shopping\.naver|naver\.com/.test(url);
  if (isNaverUrl) {
    const gtUrl = toGoogleTranslateUrl(url);
    if (gtUrl) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(1000);
        const resultGt = await checkUrlSingle(gtUrl, 0);
        if (resultGt.status !== 'error') {
          if (attempt > 0) console.log(`[stock-monitor] GT 1차 성공 (attempt ${attempt + 1}): ${url.slice(0, 60)}`);
          return resultGt;
        }
        if (!/region|translation\s*service/i.test(resultGt.matchedPattern || '')) break;
      }
    }
  }

  // 2차: 원본 URL (GT 실패 시 폴백 — 비네이버 URL은 항상 여기로)
  const result1 = await checkUrlSingle(url, retryCount);
  if (result1.status !== 'error') return result1;

  // 1차가 429/403 차단인 경우만 추가 폴백 시도 (404/500 등은 진짜 에러로 간주)
  const isBlocked = /429|403|차단|속도제한/.test(result1.matchedPattern || '');
  if (!isBlocked) return result1;

  // 3차: 모바일 URL
  const mobileUrl = toMobileUrl(url);
  if (mobileUrl) {
    const result2 = await checkUrlSingle(mobileUrl, 0);
    if (result2.status !== 'error') {
      console.log(`[stock-monitor] 모바일 폴백 성공: ${url.slice(0, 60)}`);
      return result2;
    }
  }

  // 모두 실패 — 1차 결과 반환 (transient 으로 분류되어 consecutive_errors 누적 X)
  return result1;
}

async function checkUrlSingle(url: string, retryCount = 0, forceDirect = false): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    let statusCode = 0;
    let html = '';

    // Google Translate URL은 절대 Fly 프록시 경유 X — Fly IP가 네이버에 차단된 상태이고,
    // translate.goog는 Vercel에서 직접 fetch해도 Google IP 경유라 안전.
    const isGoogleTranslate = /translate\.goog/.test(url);
    // 네이버 URL이고 프록시가 설정돼 있으면 Fly.io 프록시 경유 (Vercel 직접 fetch 시 403 차단 방지)
    const isNaverUrl = !isGoogleTranslate && !forceDirect
      && /smartstore\.naver|shop\.naver|brand\.naver|shopping\.naver|naver\.com/.test(url);
    let proxyTried = false;
    let proxySucceeded = false;
    let proxyError: string | null = null;
    if (isNaverUrl && NAVER_PROXY_URL) {
      proxyTried = true;
      const proxyBase = NAVER_PROXY_URL.replace(/\/proxy\/?$/, '');
      try {
        const proxyRes = await fetch(`${proxyBase}/naver-check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Proxy-Secret': NAVER_PROXY_SECRET,
          },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        if (proxyRes.ok) {
          const data = await proxyRes.json() as { statusCode: number; html: string };
          statusCode = data.statusCode;
          html = data.html || '';
          proxySucceeded = true;
        } else {
          // 프록시 실패 — 인프라 에러로 분류 (프록시 미배포/키 불일치/5xx 모두 상품별 이슈 아님)
          const errData = await proxyRes.json().catch(() => ({}));
          proxyError = `proxy ${proxyRes.status}: ${(errData as Record<string, string>).error || ''}`;
          // 폴백: 프록시가 naver-check 핸들러 없음(400 Missing Coupang...)이거나 5xx → 직접 fetch 시도
          //   Vercel 직접 fetch는 403일 확률 높지만, 시도 자체는 값어치 있음 (프록시 장애 중 일부라도 통과)
          console.warn(`[stock-monitor] proxy naver-check 실패 — 직접 fetch 폴백 시도: ${proxyError}`);
        }
      } catch (proxyErr) {
        proxyError = `proxy exception: ${proxyErr instanceof Error ? proxyErr.message.slice(0, 80) : 'unknown'}`;
        console.warn(`[stock-monitor] proxy 호출 예외 — 직접 fetch 폴백:`, proxyError);
      }
    }
    if (!proxySucceeded) {
      // 직접 fetch (프록시 미설정 or 비네이버 URL or 프록시 실패 폴백)
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
      statusCode = res.status;
      // 본문 캡 2.5MB — 네이버 상품 페이지가 커서(리뷰/추천/SVG 등) __PRELOADED_STATE__ 가
      // 뒤쪽에 위치한다. 과거 500KB 캡은 state JSON 을 잘라 가격/품절 파싱 실패를 유발.
      // (워커 naver-fetch.mjs 의 MAX_BODY 와 동일.)
      html = (await res.text()).slice(0, 2_500_000);
    }
    clearTimeout(timeout);

    // 프록시 실패 + 직접 fetch도 차단 상태(403/5xx 등) → 인프라 에러
    //   이 경우 consecutive_errors 누적 금지(상품별 문제 아님) — processSingleMonitor에서 errorClass로 분기
    const proxyFellThroughToFail = proxyTried && !proxySucceeded;

    if (statusCode === 404 || statusCode === 410) {
      // 404는 삭제로 확정 (프록시 실패 여부와 무관)
      return { status: 'removed', matchedPattern: `HTTP ${statusCode}` };
    }
    if (statusCode === 429 && retryCount < 1) {
      await sleep(8000);
      return checkUrlSingle(url, retryCount + 1);
    }
    if (statusCode === 429) {
      return { status: 'error', matchedPattern: 'HTTP 429 (속도제한)', errorClass: 'transient' };
    }
    if (statusCode === 403) {
      // 네이버는 상품 단위로 403 을 주지 않음 — IP/User-Agent 차단. 모든 모니터 공통 이슈이므로
      // 항상 'infra' 로 분류해 consecutive_errors 누적 차단. (이전엔 proxy 성공·실패에 따라
      // 'naver' 도 섞여 들어와서 10회 누적 후 모니터가 영구 비활성화되는 부작용이 있었음.)
      return {
        status: 'error',
        matchedPattern: proxyFellThroughToFail ? `${proxyError} → 직접 fetch 403` : 'HTTP 403 (접근 차단)',
        errorClass: 'infra',
      };
    }
    // 502/503/504 도 네이버 서버 또는 프록시 인프라 문제 — naver 가 상품별로 게이트웨이 에러 안 줌
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
      return {
        status: 'error',
        matchedPattern: `HTTP ${statusCode} (게이트웨이/서버 일시 오류)`,
        errorClass: 'infra',
      };
    }
    if (statusCode < 200 || statusCode >= 400) {
      return {
        status: 'error',
        matchedPattern: proxyFellThroughToFail ? `${proxyError} → 직접 fetch HTTP ${statusCode}` : `HTTP ${statusCode}`,
        errorClass: proxyFellThroughToFail ? 'infra' : 'naver',
      };
    }

    // Google Translate region block 감지 — 본문에 region 안내만 있고 네이버 데이터 없음
    if (/translation\s*service\s*isn'?t\s*available\s*in\s*your\s*region/i.test(html)
        && !/__PRELOADED_STATE__|productId|smartstore-content/i.test(html)) {
      return { status: 'error', matchedPattern: 'region block (translation service)', errorClass: 'transient' };
    }

    for (const p of REMOVED_PATTERNS) {
      if (p.test(html)) return { status: 'removed', matchedPattern: p.source };
    }

    // 옵션 + 메인가 파싱 (네이버)
    // GT 프록시 경유 시 hostname 이 smartstore-naver-com.translate.goog 로 바뀌므로
    // dash variant 까지 매칭 — 이전 dot-only 패턴은 GT 경로에서 price 파싱을 통째로 스킵하던 버그.
    let options: OptionStockStatus[] | undefined;
    let mainPrice: number | undefined;
    let state: 'in_stock' | 'sold_out' | 'removed' | undefined;
    if (/(?:smartstore[.\-]naver|shop[.\-]naver|brand[.\-]naver)/i.test(url)) {
      options = parseNaverOptionsInline(html) ?? undefined;
      mainPrice = parseNaverMainPrice(html) ?? undefined;
      state = parseNaverState(html);
      // 전체 옵션 품절은 여기서 판정하지 않음 — 등록 옵션 기준으로 아래에서 판정
    }

    // 권위있는 __PRELOADED_STATE__ 상태 최우선 (텍스트 패턴은 폴백)
    if (state) return { status: state, matchedPattern: 'PRELOADED_STATE', options, mainPrice };

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
    const isTimeout = (err as Error).name === 'AbortError';
    return {
      status: 'error',
      matchedPattern: isTimeout ? 'timeout' : (err as Error).message?.slice(0, 80),
      errorClass: isTimeout ? 'transient' : 'naver',
    };
  }
}

/**
 * __PRELOADED_STATE__ 의 권위있는 판매 상태 — 난독화 CSS 클래스에 의존하지 않음.
 * 네이버는 품절이어도 "구매하기" 버튼을 렌더링하므로 텍스트 패턴보다 이 필드가 정확.
 *   productStatusType: SALE(판매중)/OUTOFSTOCK·EXHAUSTION(품절)/그 외(중지·삭제)
 *   channelProductDisplayStatusType: ON(노출)/그 외(미노출 → 사실상 내려감)
 * (product.A 빈 블록은 값이 null → 정규식이 "문자열" 값만 잡아 실제 상품 값을 집음)
 */
function parseNaverState(html: string): 'in_stock' | 'sold_out' | 'removed' | undefined {
  const disp = html.match(/"channelProductDisplayStatusType"\s*:\s*"([A-Z_]+)"/)?.[1];
  if (disp && disp !== 'ON') return 'removed';
  const st = html.match(/"productStatusType"\s*:\s*"([A-Z_]+)"/)?.[1];
  if (!st) return undefined;
  if (st === 'SALE') return 'in_stock';
  if (st === 'OUTOFSTOCK' || st === 'EXHAUSTION') return 'sold_out';
  return 'removed';
}

function parseNaverOptionsInline(html: string): OptionStockStatus[] | null {
  // HTML 전체에서 optionCombinations 배열 검색 — PRELOADED_STATE 가 사라져도(NEXT_DATA로 이전 등)
  // 인라인 JSON 어디에 있든 매칭. 첫 매칭만 사용.
  const optCombMatch = html.match(/"optionCombinations"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (!optCombMatch) return null;
  try {
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
  } catch { /* skip */ }
  return null;
}

/**
 * 네이버 스마트스토어 메인 상품 판매가 파싱
 *  - JSON 필드 검색 (PRELOADED_STATE 한정 X — Naver 가 __NEXT_DATA__ 등으로 옮겨도 동작하도록 HTML 전체에서 검색)
 *  - DOM "상품 가격" 라벨 (GT 번역 시 "Product price" 도 매칭)
 *  - JSON-LD / Open Graph fallback
 *  - 실패 시 null
 *
 * dispDiscountedSalePrice 가 최우선 — desktop-monitor 에서 검증된 가장 신뢰도 높은 필드.
 * DEBUG_NAVER_PRICE=1 환경변수로 preload state 앞부분을 로깅.
 */
export interface PriceParseTrace {
  method: 'json-field' | 'dom-label' | 'json-ld' | 'og-meta' | 'none';
  value: number | null;
  matchedField?: string;
  matchedSnippet?: string;
  attempted: { name: string; matched: boolean; value?: number | null }[];
}

function parseNaverMainPrice(html: string, trace?: PriceParseTrace): number | null {
  if (process.env.DEBUG_NAVER_PRICE === '1') {
    const preloadMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    console.log('[parseNaverMainPrice] preload head:', preloadMatch ? preloadMatch[1].slice(0, 2000) : '(no preload state)');
  }

  // 1) JSON 필드 — HTML 전체 검색 (PRELOADED_STATE / __NEXT_DATA__ / 인라인 JSON 어디에 있든)
  //    dispDiscountedSalePrice → salePrice → 나머지 순.
  //    값은 정수 또는 문자열(따옴표 + 콤마 포맷팅) 둘 다 허용.
  const fieldCandidates = [
    'dispDiscountedSalePrice',
    'salePrice', 'dispSalePrice', 'dispPrice',
    'productSalePrice', 'productPrice',
    'discountedSalePrice', 'discountedPrice',
    'price',
  ];
  for (const field of fieldCandidates) {
    // 콤마 포맷팅("12,345") + 정수(12345) + 문자열("12345") 모두 매칭
    const re = new RegExp(`"${field}"\\s*:\\s*"?([\\d,]{2,15})"?`);
    const m = html.match(re);
    if (m) {
      const cleaned = m[1].replace(/,/g, '');
      const v = parseInt(cleaned, 10);
      if (!Number.isNaN(v) && v >= 100) {
        if (trace) {
          trace.method = 'json-field';
          trace.value = v;
          trace.matchedField = field;
          trace.matchedSnippet = m[0];
          trace.attempted.push({ name: `json:${field}`, matched: true, value: v });
        }
        return v;
      }
      if (trace) trace.attempted.push({ name: `json:${field}`, matched: false, value: v });
    } else if (trace) {
      trace.attempted.push({ name: `json:${field}`, matched: false });
    }
  }

  // 2) HTML DOM 폴백 — <span class="blind">상품 가격</span><span>25,900</span><span>원</span>
  const domMatch = html.match(
    /<span[^>]*>[\s\S]{0,200}?(?:상품\s*가격|Product\s*price|Product\s*amount)[\s\S]{0,200}?<\/span>\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*<span[^>]*>\s*(?:원|won|KRW)/i,
  );
  if (domMatch) {
    const v = parseInt(domMatch[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(v) && v >= 100) {
      if (trace) {
        trace.method = 'dom-label';
        trace.value = v;
        trace.matchedSnippet = domMatch[0].slice(0, 200);
        trace.attempted.push({ name: 'dom-label', matched: true, value: v });
      }
      return v;
    }
  }
  if (trace) trace.attempted.push({ name: 'dom-label', matched: !!domMatch });

  // 3) JSON-LD fallback — 콤마 포맷팅도 허용
  const ldMatch = html.match(/"@type"\s*:\s*"Product"[\s\S]*?"price"\s*:\s*"?([\d,]+)/);
  if (ldMatch) {
    const v = parseInt(ldMatch[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(v) && v >= 100) {
      if (trace) {
        trace.method = 'json-ld';
        trace.value = v;
        trace.attempted.push({ name: 'json-ld', matched: true, value: v });
      }
      return v;
    }
  }
  if (trace) trace.attempted.push({ name: 'json-ld', matched: !!ldMatch });

  // 4) Open Graph meta
  const ogMatch = html.match(/<meta\s+property="product:price:amount"\s+content="([\d.,]+)"/i);
  if (ogMatch) {
    const v = Math.round(parseFloat(ogMatch[1].replace(/,/g, '')));
    if (!Number.isNaN(v) && v >= 100) {
      if (trace) {
        trace.method = 'og-meta';
        trace.value = v;
        trace.attempted.push({ name: 'og-meta', matched: true, value: v });
      }
      return v;
    }
  }
  if (trace) trace.attempted.push({ name: 'og-meta', matched: !!ogMatch });

  // 모든 폴백 실패 — 진단용 로깅 (env-flag 무관)
  // PRELOADED_STATE 가 있긴 한지, 가격 관련 키워드가 페이지에 있는지만 짧게 기록.
  const hasPreload = /__PRELOADED_STATE__|__NEXT_DATA__/.test(html);
  const hasPriceKeyword = /salePrice|상품\s*가격|product:price/i.test(html);
  const htmlLen = html.length;
  console.warn(`[parseNaverMainPrice] FAILED — all 4 fallbacks empty. htmlLen=${htmlLen}, hasPreload=${hasPreload}, hasPriceKeyword=${hasPriceKeyword}`);

  if (trace) trace.method = 'none';
  return null;
}

export { parseNaverMainPrice as parseNaverMainPriceForDiag };

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
 * 쿠팡 상세를 조회해 라이프사이클 + 옵션(vendorItemId) + 현재 판매가를 반환.
 * ⚠️ coupang_status(판매 on/off) 는 절대 여기서 덮어쓰지 않는다.
 *    승인상태(APPROVED 등)는 판매중/중지와 무관하므로, 과거처럼 status→coupang_status 로
 *    매핑하면 멀쩡히 팔리는 상품이 전부 'suspended'로 오기록되어 재개 무한실패가 났다.
 *    coupang_status 는 오직 우리가 실제로 stop/resume 를 호출했을 때만 바뀐다.
 * 반환:
 *   - lifecycle: live/removed/rejected/pending/unknown
 *   - vendorItemIds: 옵션 단위 판매토글/가격변경 대상
 *   - coupangPrice: 첫 옵션 salePrice (our_price_last 갱신용)
 * 조회 실패(403/네트워크 등)면 null → 호출측은 이번 사이클 토글 스킵.
 */
async function fetchCoupangState(
  monitor: { id: string; coupang_product_id: string },
  adapter: CoupangAdapter,
): Promise<{ lifecycle: CoupangLifecycle; vendorItemIds: string[]; coupangPrice: number | null } | null> {
  try {
    const detail = await adapter.getProductDetail(monitor.coupang_product_id);
    if (!detail) return null;
    return {
      lifecycle: classifyCoupangLifecycle(detail.status, detail.statusName),
      vendorItemIds: detail.items.map(i => i.vendorItemId).filter(Boolean),
      coupangPrice: detail.items?.[0]?.salePrice ?? null,
    };
  } catch (err) {
    console.warn(`[stock-monitor] fetchCoupangState failed for ${monitor.coupang_product_id}:`, err);
    return null;
  }
}

/**
 * 쿠팡에서 삭제(또는 영구 반려)된 상품 — 모니터를 비활성화해 무한 재시도를 멈춘다.
 */
async function deactivateMonitor(
  supabase: SupabaseClient,
  monitor: { id: string; megaload_user_id: string; product_id: string; source_status: StockStatus },
  authUserId: string | null,
  reason: 'removed' | 'rejected',
  now: string,
): Promise<void> {
  await supabase.from('sh_stock_monitors').update({
    is_active: false,
    coupang_status: 'suspended',
    last_checked_at: now,
    updated_at: now,
  }).eq('id', monitor.id);

  await supabase.from('sh_stock_monitor_logs').insert({
    monitor_id: monitor.id,
    megaload_user_id: monitor.megaload_user_id,
    event_type: 'check_ok',
    coupang_status_before: 'suspended',
    coupang_status_after: 'suspended',
    notes: reason === 'removed'
      ? '쿠팡에서 상품삭제 감지 — 모니터 자동 비활성화'
      : '쿠팡 승인반려 상태 — 모니터 자동 비활성화(조치 필요)',
  });

  if (authUserId) {
    await supabase.from('notifications').insert({
      user_id: authUserId,
      type: 'system',
      title: reason === 'removed' ? '쿠팡 상품 삭제됨' : '쿠팡 상품 승인반려',
      message: reason === 'removed'
        ? '쿠팡에서 삭제된 상품이라 품절 동기화를 중단했습니다.'
        : '쿠팡 승인반려 상태라 판매 재개가 불가합니다. 상품을 확인해주세요.',
      link: '/megaload/stock-monitor',
    });
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

    // 멀티채널 재고 전파용 어댑터 캐시 (이 유저 배치 내 채널별 1회만 인증)
    const channelAdapterCache = new Map<Channel, BaseAdapter>();

    // 1개씩 순차 처리 + jitter 딜레이 (네이버 429 방지)
    // ⚠️ 2026-05-14: 1.5초 고정 → 5~9초 랜덤 jitter 로 변경. burst 패턴 (1.5초 정확 간격)
    //    이 봇으로 인식되어 NRT IP 차단 발생. 사람 패턴(랜덤 간격) 으로 위장 + 절대 시간 ↑.
    // 429 발생 시 backoff하지만 배치 중단하지 않음 — 일부가 막혀도 나머지는 진행
    const BASE_DELAY_MS = 5000;
    const JITTER_MS = 4000; // 5~9초 랜덤
    let consecutive429 = 0;
    for (let i = 0; i < userMonitors.length; i++) {
      if (i > 0) await sleep(BASE_DELAY_MS + Math.random() * JITTER_MS);

      // 429 연속 2회 — 60초 휴식 후 계속 (이전 30초 → IP cool-down 강화)
      if (consecutive429 >= 2) {
        console.log(`[stock-monitor] 429 backoff at ${i}/${userMonitors.length} — 60s 휴식 후 계속`);
        await sleep(60000);
        consecutive429 = 0;
      }

      try {
        const result = await processSingleMonitor(userMonitors[i], adapter!, supabase, authUserId, channelAdapterCache);
        results.push(result);

        if (result.error?.includes('429')) {
          consecutive429++;
          await sleep(15000); // 5초 → 15초 (IP throttling 회복 시간 ↑)
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
  channelAdapterCache?: Map<Channel, BaseAdapter>,
): Promise<ProcessResult> {
  const now = new Date().toISOString();

  // source_url 미설정 모니터 — 소스 체크는 불가하지만 쿠팡 현재가/삭제여부는 조회
  if (!monitor.source_url) {
    const cstate = await fetchCoupangState(monitor, adapter);
    if (cstate?.lifecycle === 'removed') {
      await deactivateMonitor(supabase, monitor, authUserId, 'removed', now);
      return { monitorId: monitor.id, checked: true, changed: true, action: 'deactivated_removed' };
    }
    await supabase.from('sh_stock_monitors').update({
      last_checked_at: now,
      updated_at: now,
      ...(cstate?.coupangPrice != null && cstate.coupangPrice > 0 && { our_price_last: cstate.coupangPrice }),
    }).eq('id', monitor.id);

    return { monitorId: monitor.id, checked: true, changed: false };
  }

  // 1. 원본 URL 체크
  const check = await checkUrl(monitor.source_url);

  // 에러 처리
  if (check.status === 'error') {
    // 인프라 에러(프록시 미배포/키 불일치 등)는 전체 시스템 문제 — consecutive_errors 누적 금지
    //   누적하면 10회 후 is_active=false로 모니터가 영구 비활성화되는 부작용.
    //   대신 source_status='error'만 기록하고 last_checked_at 갱신, 다음 크론에서 재시도.
    const isInfra = check.errorClass === 'infra';
    const isTransient = check.errorClass === 'transient';
    const shouldAccumulate = !isInfra && !isTransient;
    // 카운터는 10에서 캡 — 무한 증가 막아 메트릭/대시보드 표시값 일관성 유지.
    // ⚠️ 자동 is_active=false 처리는 제거 (사용자 동의 없이 모니터 영구 비활성화 차단).
    //   IP 차단(naver→infra 분류 후에도 회복 안 됨) 같은 *일시 인프라 이슈*가 user 의 모니터를
    //   영구 OFF 시키는 회귀를 막는다. 회복은 data 들어오면 자동(consecutive_errors=0 리셋).
    const newErrors = shouldAccumulate
      ? Math.min(monitor.consecutive_errors + 1, 10)
      : monitor.consecutive_errors;

    await supabase.from('sh_stock_monitors').update({
      source_status: 'error',
      last_checked_at: now,
      consecutive_errors: newErrors,
      updated_at: now,
    }).eq('id', monitor.id);

    await supabase.from('sh_stock_monitor_logs').insert({
      monitor_id: monitor.id,
      megaload_user_id: monitor.megaload_user_id,
      event_type: 'check_error',
      source_status_before: monitor.source_status,
      source_status_after: 'error',
      error_message: `${check.errorClass || 'naver'}: ${check.matchedPattern || 'check failed'}`,
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

  // 3-b. 쿠팡 라이프사이클 + 옵션(vendorItemId) + 현재가 조회 (토글 전에 필요)
  const cstate = await fetchCoupangState(monitor, adapter);
  const lifecycle: CoupangLifecycle = cstate?.lifecycle ?? 'unknown';
  const vendorItemIds = cstate?.vendorItemIds ?? [];
  if (cstate?.coupangPrice != null && cstate.coupangPrice > 0) monitor.our_price_last = cstate.coupangPrice;

  // 삭제/반려 → 토글 무한재시도 중단 (모니터 비활성화)
  if (lifecycle === 'removed' || lifecycle === 'rejected') {
    // 소스 상태/가격은 기록해두고 비활성화
    await supabase.from('sh_stock_monitors').update({
      source_status: effectiveStatus,
      option_statuses: check.options || monitor.option_statuses,
      consecutive_errors: 0,
      consecutive_unknowns: 0,
    }).eq('id', monitor.id);
    await deactivateMonitor(supabase, monitor, authUserId, lifecycle, now);
    return { monitorId: monitor.id, checked: true, changed: true, action: `deactivated_${lifecycle}` };
  }

  // 판매 on/off 토글 가능 여부 — 승인완료(live) + 킬스위치 OFF + vendorItemId 존재
  const canToggle = lifecycle === 'live' && !SALE_TOGGLE_KILLSWITCH && vendorItemIds.length > 0;

  // 4. 쿠팡 액션 실행
  let actionTaken: string | undefined;
  let actionSuccess = true;
  let actionError: string | undefined;

  // 4-a. 품절/삭제 감지 → 쿠팡 판매중지
  //  statusChanged 무관 — (sold_out, coupang active) 불일치를 reconcile 쿼리로 끌어왔을 때도
  //  중지해 정합성 회복(4-b resume 과 대칭). suspendProduct 는 멱등이고 isAlreadyInTargetState 가
  //  "이미 중지됨"을 흡수. 성공하면 coupang_status='suspended' 라 다음 사이클부터 조건 미충족 → 자기제한.
  if (canToggle && (effectiveStatus === 'sold_out' || effectiveStatus === 'removed') && monitor.coupang_status === 'active') {
    if (SALE_TOGGLE_DRY_RUN) {
      actionTaken = 'coupang_suspend_dryrun';
    } else try {
      await adapter.suspendProduct(monitor.coupang_product_id, vendorItemIds);
      actionTaken = 'coupang_suspended';

      await supabase.from('sh_product_channels')
        .update({ status: 'suspended' })
        .eq('product_id', monitor.product_id)
        .eq('channel', 'coupang');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'suspend failed';
      if (isAlreadyInTargetState(msg)) {
        actionTaken = 'coupang_suspended'; // 이미 중지 상태 — 목표 달성
      } else {
        actionTaken = 'coupang_suspend_failed';
        actionSuccess = false;
        actionError = msg.slice(0, 480);
        console.error(`[stock-monitor] suspend failed for ${monitor.coupang_product_id}:`, msg);
      }
    }
  }

  // 4-b. 원본 판매중인데 쿠팡 중지됨 → 재개 (상태 변경 여부와 무관)
  //  in_stock 유지 중 쿠팡만 suspended인 경우(과거 오기록 포함)도 재개해 정합성 회복.
  if (canToggle && effectiveStatus === 'in_stock' && monitor.coupang_status === 'suspended') {
    if (SALE_TOGGLE_DRY_RUN) {
      actionTaken = 'coupang_resume_dryrun';
    } else try {
      await adapter.resumeProduct(monitor.coupang_product_id, vendorItemIds);
      actionTaken = 'coupang_resumed';

      await supabase.from('sh_product_channels')
        .update({ status: 'active' })
        .eq('product_id', monitor.product_id)
        .eq('channel', 'coupang');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'resume failed';
      if (isAlreadyInTargetState(msg)) {
        actionTaken = 'coupang_resumed'; // 이미 판매중 — 목표 달성(정합성 회복)
      } else {
        actionTaken = 'coupang_resume_failed';
        actionSuccess = false;
        actionError = msg.slice(0, 480);
        console.error(`[stock-monitor] resume failed for ${monitor.coupang_product_id}:`, msg);
      }
    }
  }

  // 옵션 변경 감지
  let optionChanges: ReturnType<typeof detectOptionChanges> = [];
  if (check.options && monitor.option_statuses?.length > 0) {
    optionChanges = detectOptionChanges(monitor.option_statuses, check.options);
  }

  // 4-c. 멀티채널 전파 — 쿠팡 외 전 채널 재고 0/복구 (오버셀 방지)
  //   쿠팡 토글(canToggle/lifecycle)과 무관하게 다른 채널은 독립적으로 처리한다.
  //   상태 전이가 일어난 경우에만 호출 → 마켓 API 과호출 방지.
  //   품절/삭제 → 재고 0, 재입고(품절/삭제→판매중) → 재고 복구.
  let multichannelSummary: string | undefined;
  if (statusChanged) {
    const goingDown = effectiveStatus === 'sold_out' || effectiveStatus === 'removed';
    const comingUp = effectiveStatus === 'in_stock' && (prevStatus === 'sold_out' || prevStatus === 'removed');
    if (goingDown || comingUp) {
      try {
        const mc = await propagateStockToOtherChannels(supabase, {
          productId: monitor.product_id,
          megaloadUserId: monitor.megaload_user_id,
          soldOut: goingDown,
          adapterCache: channelAdapterCache,
        });
        if (mc.attempted > 0) {
          multichannelSummary = `mc_${goingDown ? 'zeroed' : 'restocked'} ${mc.succeeded}/${mc.attempted}ch${mc.failed ? ` (fail ${mc.failed})` : ''}`;
        } else if (mc.skippedReason) {
          multichannelSummary = `mc_skip:${mc.skippedReason}`;
        }
      } catch (e) {
        console.error(`[stock-monitor] multichannel propagate error for ${monitor.id}:`, e);
        multichannelSummary = 'mc_error';
      }
    }
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
    // 쿠팡 현재 판매가 (위 3-b에서 조회한 값)
    ...(monitor.our_price_last != null && monitor.our_price_last > 0 && { our_price_last: monitor.our_price_last }),
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

  // 5-a3. our_price_last 가 여전히 없으면 DB(sh_product_options) 폴백
  //   (쿠팡 현재가는 위 3-b fetchCoupangState 에서 이미 monitor.our_price_last 에 반영됨)
  if (monitor.our_price_last == null) {
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

  // 5-b. 가격 자동 추종 — 재고가 정상이고, 토글 가능(live)하며, 이번 사이클에 suspend/resume 액션이 없을 때만
  let priceAction: PriceFollowActionResult | undefined;
  const safeForPrice =
    !PRICE_FOLLOW_KILLSWITCH
    && lifecycle === 'live'
    && effectiveStatus === 'in_stock'
    && actionTaken == null;

  if (safeForPrice) {
    try {
      priceAction = await processPriceFollow({
        monitor,
        observedSourcePrice,
        vendorItemIds,
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
      action_taken: [actionTaken, multichannelSummary].filter(Boolean).join(' | ') || null,
      action_success: actionSuccess,
      option_name: matchedOption || monitor.registered_option_name || null,
      ...(actionError && { error_message: actionError }),
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
  vendorItemIds: string[];
  adapter: CoupangAdapter;
  supabase: SupabaseClient;
  authUserId: string | null;
  now: string;
}): Promise<PriceFollowActionResult> {
  const { monitor, observedSourcePrice, vendorItemIds, adapter, supabase, authUserId, now } = input;
  // 규칙 미설정(null) → 기본 자동추종 규칙 적용. 명시적 규칙이 있으면 그대로 존중.
  const rule = monitor.price_follow_rule ?? DEFAULT_PRICE_FOLLOW_RULE;

  // 0. 규칙이 명시적으로 비활성 → no-op
  if (rule.enabled !== true) return { action: 'none' };

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
    // 옵션(vendorItem) 단위로 가격 변경 — vendorItemId 가 있으면 옵션별, 없으면 상품단위 폴백
    if (vendorItemIds.length > 0) {
      const failures: string[] = [];
      for (const vid of vendorItemIds) {
        try {
          await adapter.updateItemPrice(vid, targetPrice);
        } catch (e) {
          failures.push(`${vid}: ${e instanceof Error ? e.message.slice(0, 100) : 'fail'}`);
        }
      }
      if (failures.length === vendorItemIds.length) {
        throw new Error(`전 옵션 가격변경 실패 — ${failures.join(' | ').slice(0, 400)}`);
      }
    } else {
      await adapter.updatePrice(monitor.coupang_product_id, targetPrice);
    }

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
