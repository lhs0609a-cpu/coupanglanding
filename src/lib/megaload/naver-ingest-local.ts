'use client';

/**
 * 네이버 소싱 수집 — 도우미 로컬 서버 조종 클라이언트.
 *
 * ⭐ 왜 서버가 아니라 localhost 인가
 *   네이버는 datacenter IP(Vercel·크론)를 차단한다. 실제로 페이지를 열 수 있는 건 관리자 PC 의
 *   도우미(Electron 내장 크롬)뿐이다. 그래서 웹 화면은 "조종석"이고 실행 주체는 도우미다.
 *   서버 잡 큐를 거치면 왕복 지연 때문에 창 상태·캡차 알림이 늦어져서, 올인원이 이미 쓰고 있는
 *   localhost 직결 통로(pair-server)를 그대로 쓴다.
 *
 * 인증: 포트·nonce 는 앱 실행마다 랜덤이라 discoverLocalEndpoint() 로 발견한다.
 *   관리자 판정은 **도우미에 로그인된 계정의 role** 로 도우미가 직접 한다 — 웹에서 화면을
 *   숨기는 건 표시용이고, 실제 차단은 도우미(그리고 나중엔 서버 API)가 한다.
 */

import { discoverLocalEndpoint, type LocalEndpoint } from './allinone-local';

export type { LocalEndpoint };

export interface WindowInfo {
  index: number;
  no: number;
  busy: boolean;
  role: 'list' | 'detail' | null;
  status: 'idle' | 'warming' | 'navigating' | 'working' | 'captcha' | 'closed';
  detail: string;
  url: string;
}

export interface GateState {
  cooldownMsLeft: number;
  cooling: boolean;
  blockStreak: number;
  level: number;
  successStreak: number;
  waiting: number;
  waitingMonitor: number;
  stats: { granted: number; monitorGranted: number; ingestGranted: number; blocks: number; blocks429: number };
}

export interface IngestLog { at: number; message: string }

export interface IngestStatus {
  isAdmin: boolean;
  account: { email: string | null; userId: string | null; role: string | null } | null;
  limits: { min: number; max: number; default: number };
  running: boolean;
  /** 관리자가 설정한 창 개수 */
  configured: number;
  /** 차단 신호로 감축된 실효 창 개수 */
  effective: number;
  active: number;
  waiting: number;
  windows: WindowInfo[];
  gate: GateState;
  logs?: IngestLog[];
}

const qs = (ep: LocalEndpoint, path: string, extra = '') =>
  `http://127.0.0.1:${ep.port}/naver-ingest/${path}?nonce=${encodeURIComponent(ep.nonce)}${extra}`;

async function post(ep: LocalEndpoint, path: string, body?: unknown) {
  const res = await fetch(qs(ep, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* 비 JSON 응답은 아래에서 에러로 */ }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/** 도우미 찾기 — 앱이 안 떠 있으면 null. */
export async function findHelper(): Promise<LocalEndpoint | null> {
  return discoverLocalEndpoint();
}

/**
 * 상태 + 최근 로그. since 이후의 로그만 받아 누적한다(폴링 중복 방지).
 * 도우미가 구버전이면 501 이 오므로 'unsupported' 로 구분해 안내한다.
 */
export async function fetchStatus(
  ep: LocalEndpoint,
  since = 0,
): Promise<IngestStatus | 'unsupported' | null> {
  try {
    const res = await fetch(qs(ep, 'status', `&since=${since}`));
    if (res.status === 501) return 'unsupported';
    if (!res.ok) return null;
    return (await res.json()) as IngestStatus;
  } catch {
    return null;
  }
}

export async function setWindows(ep: LocalEndpoint, count: number): Promise<number> {
  const r = (await post(ep, 'windows', { count })) as { count: number };
  return r.count;
}

export async function startPool(ep: LocalEndpoint): Promise<IngestStatus> {
  return (await post(ep, 'start')) as IngestStatus;
}

export async function stopPool(ep: LocalEndpoint): Promise<void> {
  await post(ep, 'stop');
}

/**
 * 상품 1건 테스트. 도우미는 **기다리지 않고 즉시** 200 을 준다 —
 * 캡차를 사람이 푸는 경우 몇 분이 걸려 웹 fetch 가 먼저 끊기기 때문이다.
 * 결과는 로그 스트림(fetchStatus().logs)으로 들어온다.
 */
export async function testOne(ep: LocalEndpoint, url: string): Promise<void> {
  await post(ep, 'test', { url });
}

/** 캡차가 뜬 창을 화면에 띄운다(사람이 직접 풀도록). */
export async function showWindow(ep: LocalEndpoint, index: number): Promise<void> {
  await post(ep, 'show', { index });
}
