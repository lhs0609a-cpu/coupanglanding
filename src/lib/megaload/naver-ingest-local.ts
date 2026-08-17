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

export interface NaverCategory { id: string; name: string }

export interface CategoryPage {
  parentId: string | null;
  /** @deprecated 경로는 웹이 클릭 경로로 안다 — 도우미는 항상 빈 배열을 준다. */
  trail: NaverCategory[];
  children: NaverCategory[];
  /**
   * 도우미가 **지금까지 발견한 트리 전체** { 부모id → 자식들 }.
   * 대분류 한 곳만 열어도 네이버 메뉴에서 25개 대분류의 중분류가 통째로 복원되므로,
   * 화면은 이걸 받아 클릭 없이 가지를 펼쳐 보여줄 수 있다(v0.2.92+).
   */
  map?: Record<string, NaverCategory[]>;
  cached: boolean;
}

/** 목록 페이지에서 긁은 상품 카드 — 상세를 열지 않고도 리스팅이 되는 최소 단위. */
export interface ProductCard {
  productNo: string;
  storeId: string;
  url: string;
  title: string;
  price: number;
  thumb: string;
  reviewCount: number;
}

export interface CollectState {
  catId: string | null;
  catName: string;
  running: boolean;
  stopped: string | null;
  count: number;
  progress: { collected: number; scrolls: number; gained?: number } | null;
  at: number;
}

export interface Collection extends Omit<CollectState, 'count'> {
  items: ProductCard[];
}

/**
 * 카테고리 미리 읽기 진행 상태.
 * 트리는 하루에도 안 바뀌는 정적인 것이라 **미리 다 읽어 두고** 클릭은 즉답이어야 한다.
 * 게이트가 요청 간 3~7초를 강제하므로(품절 모니터와 예산 공유) 소분류까지 20~40분 걸린다.
 */
export interface PrewarmState {
  running: boolean;
  /** 실제로 연 페이지 수 */
  read: number;
  failed: number;
  /** 지금 읽고 있는 깊이(2=중분류, 3=소분류) */
  level: number;
  /** 남은 대상 수(발견하면서 늘어난다) */
  pending: number;
  current: string;
  stopped: string | null;
  depth: number;
  /** 완주한 시각 — 0 이면 아직 전체를 읽은 적이 없다. */
  completedAt: number;
  completedDepth: number;
  /** 캐시에 들어 있는 카테고리 수 */
  nodes: number;
}

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
  collect?: CollectState;
  prewarm?: PrewarmState;
  /**
   * 네이버 로그인 상태 — 상품 목록 페이지(search.shopping.naver.com)는 로그인 없이 열리지 않는다.
   * 로그인 전에는 무엇을 눌러도 0건이므로 화면 맨 앞에서 이걸 먼저 보여준다.
   */
  naverLogin?: { loggedIn: boolean; checkedAt: number; waiting: boolean };
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

/** 이 PC 의 도우미 — 접속 정보와 **설치된 버전**. 버전은 구버전 안내에 그대로 쓴다. */
export interface HelperInfo {
  ep: LocalEndpoint;
  version: string | null;
}

/**
 * 도우미 찾기 — 앱이 안 떠 있으면 null.
 * 발견은 /health 로 하는데 그 엔드포인트는 **모든 버전에 있다**. 즉 "찾았다"와 "네이버 소싱을
 * 지원한다"는 별개이므로, 여기서 버전을 함께 읽어 두고 화면이 정확히 구분해 안내하게 한다.
 */
export async function findHelper(): Promise<HelperInfo | null> {
  const ep = await discoverLocalEndpoint();
  if (!ep) return null;
  let version: string | null = null;
  try {
    const r = await fetch(`http://127.0.0.1:${ep.port}/health`, {
      cache: 'no-store', signal: AbortSignal.timeout(2000),
    });
    if (r.ok) version = ((await r.json()) as { version?: string }).version ?? null;
  } catch { /* 버전은 안내 문구용일 뿐 — 못 읽어도 동작에 지장 없다 */ }
  return { ep, version };
}

/**
 * 상태 + 최근 로그. since 이후의 로그만 받아 누적한다(폴링 중복 방지).
 *
 * ★ 404 와 501 을 모두 'unsupported' 로 본다.
 *   도우미는 찾았는데 그 버전에 /naver-ingest 라우트가 없으면 pair-server 의 마지막 핸들러가
 *   **404** 를 준다(501 은 라우트는 있으나 기능이 주입되지 않은 경우). 예전엔 404 를 null 로
 *   흘려 화면이 "도우미를 찾지 못했습니다" 라고 했는데, 실제로는 찾았고 구버전이었을 뿐이라
 *   사용자를 엉뚱한 곳(재설치)으로 보냈다. 두 경우 모두 필요한 조치는 **업데이트**다.
 */
export async function fetchStatus(
  ep: LocalEndpoint,
  since = 0,
): Promise<IngestStatus | 'unsupported' | null> {
  try {
    const res = await fetch(qs(ep, 'status', `&since=${since}`));
    if (res.status === 404 || res.status === 501) return 'unsupported';
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

/**
 * 네이버 로그인 창 띄우기 — 도우미가 창을 띄우고 **사람이 직접** 로그인한다.
 * 계정 정보는 이 화면에도, 서버에도 오지 않는다(창 안에서 네이버로 바로 간다).
 * 완료 여부는 status.naverLogin.loggedIn 폴링으로 본다.
 */
export async function naverLogin(ep: LocalEndpoint): Promise<void> {
  await post(ep, 'login', {});
}

/** 로그인 세션 삭제 — 다른 네이버 계정으로 바꿀 때. */
export async function naverLogout(ep: LocalEndpoint): Promise<void> {
  await post(ep, 'logout', {});
}

/**
 * 하위 카테고리 목록.
 *   parentId 없음 → 대분류(상수, 네트워크 사용 안 함)
 *   있음 → 캐시에 없으면 도우미가 그 카테고리 페이지를 한 번 열어 발견한다(수 초 소요)
 */
export async function fetchCategories(
  ep: LocalEndpoint,
  parentId?: string | null,
  force = false,
): Promise<CategoryPage> {
  const extra = `${parentId ? `&parent=${encodeURIComponent(parentId)}` : ''}${force ? '&force=1' : ''}`;
  const res = await fetch(qs(ep, 'categories', extra));
  const text = await res.text();
  if (!res.ok) {
    // 구버전 도우미엔 이 라우트가 없어 pair-server 가 평문 'not found' 를 준다.
    // 그대로 노출하면 원인을 알 수 없으므로 필요한 조치로 바꿔서 알린다.
    if (res.status === 404) throw new Error('도우미 업데이트가 필요합니다 (카테고리 기능은 v0.2.91 이상)');
    let msg = text;
    try { msg = (JSON.parse(text) as { error?: string }).error || text; } catch { /* 원문 사용 */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as CategoryPage;
}

/**
 * 트리 전체 미리 읽기 시작 — 20~40분 걸리므로 시작만 하고 즉시 돌아온다(진행은 status.prewarm).
 * 이미 읽은 가지는 건너뛰므로 중단 후 다시 부르면 이어서 한다.
 */
export async function startPrewarm(ep: LocalEndpoint, depth = 3): Promise<void> {
  await post(ep, 'categories/prewarm', { depth });
}

export async function stopPrewarm(ep: LocalEndpoint): Promise<void> {
  await post(ep, 'categories/prewarm/stop');
}

/** 수집 시작 — 몇 분 걸리므로 시작만 하고 즉시 돌아온다. 진행은 status, 결과는 fetchCollection. */
export async function startCollect(
  ep: LocalEndpoint,
  args: { catId: string; catName?: string; target?: number },
): Promise<void> {
  await post(ep, 'collect', args);
}

export async function stopCollect(ep: LocalEndpoint): Promise<void> {
  await post(ep, 'collect/stop');
}

/**
 * 페이지 진단 — 수집이 0건일 때 실제 페이지 구조를 떠서 도우미 폴더에 파일로 남긴다.
 * (링크 모양 분포·상품 링크 표본·본문 앞부분. 페이지 1장만 연다)
 */
export async function probePage(ep: LocalEndpoint, catId: string): Promise<{ path?: string }> {
  return (await post(ep, 'probe', { catId })) as { path?: string };
}

/** 수집 결과(수백 건). status 폴링과 분리돼 있어 필요할 때만 부른다. */
export async function fetchCollection(ep: LocalEndpoint): Promise<Collection | null> {
  try {
    const res = await fetch(qs(ep, 'collection'));
    if (!res.ok) return null;
    return (await res.json()) as Collection;
  } catch {
    return null;
  }
}
