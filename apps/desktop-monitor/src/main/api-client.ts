// ============================================================
// Megaload API Client — Vercel /api/megaload/desktop/* 호출
// ============================================================

import { getStore } from './store';

const DEFAULT_API_BASE = 'https://coupanglanding.vercel.app';

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

/** 토큰 검증 + heartbeat 갱신 */
export async function verifyToken(): Promise<{ valid: boolean; megaloadUserId?: string; expired?: boolean }> {
  const token = getToken();
  if (!token) return { valid: false };
  try {
    const res = await fetch(`${getApiBase()}/api/megaload/desktop/auth`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as { valid: boolean; megaloadUserId: string };
      return { valid: true, megaloadUserId: data.megaloadUserId };
    }
    if (res.status === 401) {
      const data = await res.json().catch(() => ({})) as { expired?: boolean };
      return { valid: false, expired: data.expired };
    }
    return { valid: false };
  } catch (err) {
    console.warn('[api-client] verifyToken 실패:', err);
    return { valid: false };
  }
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
