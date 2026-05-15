// ============================================================
// Megaload API Client — Vercel /api/megaload/desktop/* 호출
// ============================================================

import { getStore } from './store';

// 프로덕션 도메인 우선 (www.megaload.co.kr) — Vercel 내부 URL은 폴백.
// 사용자 사이트가 커스텀 도메인이라 vercel.app 직접 호출 시 DNS/SSL/배포 차이로 fetch 실패 가능.
const DEFAULT_API_BASE = 'https://www.megaload.co.kr';
const FALLBACK_API_BASE = 'https://coupanglanding.vercel.app';

export interface MonitorTask {
  id: string;
  coupang_product_id: string;
  source_url: string;
  source_status: string;
  registered_option_name: string | null;
  last_checked_at: string | null;
}

export interface ResultPayload {
  monitorId: string;
  status: 'in_stock' | 'sold_out' | 'unknown' | 'removed' | 'error';
  mainPrice?: number;
  options?: { name: string; soldOut: boolean; price?: number }[];
  matchedPattern?: string;
  errorClass?: 'infra' | 'transient' | 'naver';
  fetchedAt: string;
}

function getApiBase(): string {
  const store = getStore();
  return (store.get('apiBase') as string | undefined) || DEFAULT_API_BASE;
}

function getToken(): string | null {
  const store = getStore();
  return (store.get('authToken') as string | undefined) || null;
}

async function verifyTokenAtBase(token: string, base: string): Promise<{ valid: boolean; megaloadUserId?: string; expired?: boolean; error?: string }> {
  try {
    const res = await fetch(`${base}/api/megaload/desktop/auth`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as { valid: boolean; megaloadUserId: string };
      return { valid: true, megaloadUserId: data.megaloadUserId };
    }
    if (res.status === 401) {
      const data = await res.json().catch(() => ({})) as { expired?: boolean; error?: string };
      return { valid: false, expired: data.expired, error: `401 ${data.error || ''}` };
    }
    return { valid: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: `네트워크: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** 토큰 검증 — 프로덕션 도메인 우선, 실패 시 fallback Vercel URL 시도 */
export async function verifyToken(): Promise<{ valid: boolean; megaloadUserId?: string; expired?: boolean; error?: string; usedBase?: string }> {
  const token = getToken();
  if (!token) return { valid: false, error: 'no token saved' };

  // 1차: 프로덕션 도메인 (또는 store 설정값)
  const primaryBase = getApiBase();
  const primary = await verifyTokenAtBase(token, primaryBase);
  if (primary.valid) {
    // 다음 호출부터 같은 base 재사용
    const store = getStore();
    if (store.get('apiBase') !== primaryBase) store.set('apiBase', primaryBase);
    return { ...primary, usedBase: primaryBase };
  }

  // 401(서버가 명시적으로 거부)이면 폴백 시도 안 함
  if (primary.error?.startsWith('401')) {
    console.warn('[api-client] verifyToken 401:', primary.error);
    return { ...primary, usedBase: primaryBase };
  }

  // 2차: Vercel 내부 URL 폴백
  if (primaryBase !== FALLBACK_API_BASE) {
    console.warn(`[api-client] primary 실패 (${primary.error}) — fallback ${FALLBACK_API_BASE} 시도`);
    const fallback = await verifyTokenAtBase(token, FALLBACK_API_BASE);
    if (fallback.valid) {
      const store = getStore();
      store.set('apiBase', FALLBACK_API_BASE);
      return { ...fallback, usedBase: FALLBACK_API_BASE };
    }
    return { ...fallback, usedBase: FALLBACK_API_BASE, error: `primary: ${primary.error} | fallback: ${fallback.error}` };
  }

  return { ...primary, usedBase: primaryBase };
}

/** 처리할 모니터 목록 fetch */
export async function fetchMonitors(limit = 50, minIntervalSec = 21600): Promise<MonitorTask[]> {
  const token = getToken();
  if (!token) return [];
  const url = `${getApiBase()}/api/megaload/desktop/monitors?limit=${limit}&minIntervalSec=${minIntervalSec}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`[api-client] fetchMonitors HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { monitors: MonitorTask[] };
  return data.monitors || [];
}

/** 결과 일괄 전송 (최대 100개) */
export async function postResults(results: ResultPayload[]): Promise<{ updated: number; skipped: number }> {
  const token = getToken();
  if (!token || results.length === 0) return { updated: 0, skipped: 0 };
  const res = await fetch(`${getApiBase()}/api/megaload/desktop/results`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) {
    console.warn(`[api-client] postResults HTTP ${res.status}`);
    return { updated: 0, skipped: 0 };
  }
  return await res.json() as { updated: number; skipped: number };
}

/** 토큰 저장 (renderer 에서 입력 후 호출) */
export function saveToken(token: string, megaloadUserId?: string): void {
  const store = getStore();
  store.set('authToken', token);
  store.set('isLoggedIn', true);
  if (megaloadUserId) store.set('megaloadUserId', megaloadUserId);
}

/** 토큰 제거 (로그아웃) */
export function clearToken(): void {
  const store = getStore();
  store.delete('authToken');
  store.set('isLoggedIn', false);
  store.delete('megaloadUserId');
}
