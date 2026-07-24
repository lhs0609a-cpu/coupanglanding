'use client';

/**
 * 도우미 로컬 서버(pair-server) 직독 클라이언트.
 *
 * ⭐ 왜 localhost 인가
 *   올인원 생성 결과(_allinone.generated.jsonl)와 상품 이미지는 이미 사용자 PC 에 있다.
 *   그걸 Storage 에 올렸다가 웹이 도로 내려받는 건 순수 낭비다 — 등록도 안 할 상품
 *   이미지까지 올라가고(생성 100개 중 승인 20개), storage-gc 가 치우기 전 7일간 자리를 먹는다.
 *   같은 PC 이므로 웹이 127.0.0.1 에서 직접 읽으면 추가 비용이 0 이고,
 *   폴더를 다시 고를 필요도 없다(경로를 도우미가 알고 있으니).
 *
 * ⚠️ 브라우저는 폴더 핸들만 줄 뿐 절대경로를 주지 않는다. 그래서 "웹이 경로를 앱에 넘기는"
 *    방향은 원리적으로 불가능하고, 앱이 알고 있는 경로를 웹이 읽어가는 이 방향만 성립한다.
 *
 * 포트·nonce 는 하트비트(worker-status.local_endpoint)로 발견한다 — 앱 실행마다 랜덤이라
 * 웹이 미리 알 수 없기 때문. HTTPS→127.0.0.1 fetch 는 /worker/activate 페어링에서
 * 이미 프로덕션 검증된 경로다(Private Network Access 프리플라이트 포함).
 */

export interface LocalEndpoint {
  port: number;
  nonce: string;
}

/** 워커 하트비트 1건 — worker-status 응답 형태. */
interface WorkerRow {
  worker_id: string;
  hostname: string | null;
  last_seen: string;
  app_version?: string | null;
  local_endpoint?: LocalEndpoint | null;
}

/**
 * 토큰(64자 인증코드)으로만 도는 워커 id. 서버 desktop-heartbeat.ts 의 TOKEN_WORKER_ID 와 같은 값
 * (두 값이 갈라지면 아래 판정이 조용히 틀리므로, 바꿀 땐 반드시 함께 바꿀 것).
 */
export const TOKEN_ONLY_WORKER_ID = 'desktop-monitor';

/**
 * 도우미 연결 등급 — "연결됨/미연결" 2단계가 거짓말을 했기 때문에 3단계로 나눈다.
 * ---------------------------------------------------------------------------
 * 배경(실측): 앱의 로그인 세션이 만료되면 세션 하트비트(<host>-app)만 멈추는데,
 *   품절 모니터는 만료 없는 토큰 인증이라 계속 살아 'desktop-monitor' 행을 갱신한다.
 *   그런데 배지는 `workers.length > 0` 만 봐서 10시간 내내 🟢 "도우미 연결됨" 이었다
 *   — 정작 올인원·썸네일·재생성은 전부 죽어 있는데도.
 *
 * 그렇다고 🔴 로 내리면 실제로 돌고 있는 모니터링까지 "끊김"이라 또 다른 거짓말이 된다.
 * 그래서 중간 등급을 둔다:
 *   'online'       — 세션 워커가 살아 있음(전 기능 정상)
 *   'monitor-only' — 모니터링만 살아 있음(세션 만료 → 올인원·썸네일·재생성 불가)
 *   'offline'      — 아무 하트비트도 없음
 */
export type HelperLink = 'online' | 'monitor-only' | 'offline';

export function classifyHelperLink(
  workers: { worker_id: string }[] | null | undefined,
): HelperLink {
  if (!workers || workers.length === 0) return 'offline';
  // 세션 워커는 '<host>-app' / '-llm' / '-<uuid8>' 로 이름이 제각각이라, 토큰 워커가
  // 아닌 것을 세션 워커로 본다(새 워커가 생겨도 자동으로 맞는 방향).
  return workers.some((w) => w.worker_id !== TOKEN_ONLY_WORKER_ID) ? 'online' : 'monitor-only';
}

export interface AllinoneManifest {
  /** 도우미가 생성을 끝낸 폴더의 절대경로(표시용). */
  folder: string;
  generatedAt: string;
  /** _allinone.generated.jsonl 의 레코드들(형태는 패널의 GenRecord 와 동일). */
  records: unknown[];
}

const base = (ep: LocalEndpoint) => `http://127.0.0.1:${ep.port}`;

/** 하트비트에서 도우미의 로컬 서버 주소를 찾는다. 없으면 null(구버전이거나 미접속). */
export async function discoverLocalEndpoint(): Promise<LocalEndpoint | null> {
  try {
    const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
    if (!res.ok) return null;
    const json = (await res.json()) as { online: boolean; workers: WorkerRow[] };
    // 여러 워커가 붙어 있을 수 있다(셸·썸네일·LLM). local_endpoint 를 보내는 첫 놈이면 된다
    // — 모두 같은 PC 의 같은 pair-server 를 가리킨다.
    for (const w of json.workers ?? []) {
      const ep = w.local_endpoint;
      if (ep && typeof ep.port === 'number' && typeof ep.nonce === 'string') return ep;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 도우미가 마지막으로 생성한 폴더의 결과. 아직 생성한 적 없으면 null.
 * 도우미가 꺼져 있거나 구버전이면 fetch 자체가 실패 → null(웹은 기존 폴더 선택으로 폴백).
 */
export async function fetchLocalManifest(ep: LocalEndpoint): Promise<AllinoneManifest | null> {
  try {
    const res = await fetch(`${base(ep)}/allinone/manifest?nonce=${encodeURIComponent(ep.nonce)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as AllinoneManifest;
    return Array.isArray(json.records) ? json : null;
  } catch {
    return null;
  }
}

/**
 * 진단용 — 도우미 연결을 단계별로 시도하고 "어디서 끊겼는지"를 그대로 돌려준다.
 * 위 두 함수는 실패를 전부 null 로 삼켜서(폴백이 목적) 사용자에게 보여줄 근거가 남지 않는다.
 * 카드가 비어 있을 때 원인이 ①서버 하트비트 ②로컬 서버 ③생성이력 중 무엇인지 갈라준다.
 */
export interface HelperDiag {
  stage: 'worker-status' | 'endpoint' | 'manifest' | 'ok';
  ok: boolean;
  message: string;
  workerCount?: number;
  port?: number;
  folder?: string;
  records?: number;
  /** stage==='ok' 일 때만 — 패널이 그대로 소비하는 생성 레코드(다시 받지 않도록) */
  raw?: unknown[];
}

export async function diagnoseLocalHelper(): Promise<HelperDiag> {
  let workers: WorkerRow[] = [];
  try {
    const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
    if (!res.ok) {
      return { stage: 'worker-status', ok: false, message: `워커 상태 조회 실패(HTTP ${res.status}) — 로그인/세션을 확인하세요.` };
    }
    const json = (await res.json()) as { online: boolean; workers: WorkerRow[] };
    workers = json.workers ?? [];
  } catch (e) {
    return { stage: 'worker-status', ok: false, message: `워커 상태 조회 실패: ${e instanceof Error ? e.message : '네트워크 오류'}` };
  }
  if (workers.length === 0) {
    return { stage: 'worker-status', ok: false, workerCount: 0, message: '접속 중인 도우미가 없습니다. 데스크탑 앱 "메가로드 도우미"를 실행하세요.' };
  }

  const ep = workers.map((w) => w.local_endpoint).find((x) => x && typeof x.port === 'number' && typeof x.nonce === 'string');
  if (!ep) {
    // ⚠️ 예전엔 여기서 무조건 "구버전이니 업데이트하세요"라고 했는데 그건 오진이었다.
    //    실제로 가장 흔한 원인은 앱의 로그인 세션 만료다 — 로컬 서버 주소는 세션 하트비트로
    //    전달되는데, 세션이 죽으면 앱은 켜져 있고 "연결됨"으로 보이는데도 주소만 안 온다
    //    (모니터링은 별도 토큰 인증이라 멀쩡히 돌아가서 더 헷갈린다).
    //    그래서 접속 중인 워커 이름을 그대로 보여주고, 재연결을 먼저 안내한다.
    const ids = workers.map((w) => w.worker_id).join(', ');
    // 배지(DesktopStatusIndicator·WorkerInstallNotice)와 같은 판정을 쓴다 — 갈라지면
    // "배지는 초록인데 여기선 실패" 같은 모순이 다시 생긴다.
    const monitorOnly = classifyHelperLink(workers) === 'monitor-only';
    return {
      stage: 'endpoint', ok: false, workerCount: workers.length,
      message: monitorOnly
        ? `도우미가 모니터링만 연결돼 있습니다(${ids}). 앱 로그인 세션이 만료됐거나 통합 도우미가 연결되지 않은 상태입니다 — 도우미 앱에서 "로그아웃 · 다른 계정 연결" → "메가로드 연결"로 다시 연결하면 바로 됩니다.`
        : `도우미 ${workers.length}대(${ids})가 접속 중이지만 로컬 서버 주소를 알리지 않습니다. 앱에서 메가로드 재연결을 해보고, 그래도 안 되면 도우미를 최신으로 업데이트하세요.`,
    };
  }

  const mf = await fetchLocalManifest(ep);
  if (!mf) {
    return {
      stage: 'manifest', ok: false, workerCount: workers.length, port: ep.port,
      message: `127.0.0.1:${ep.port} 에서 생성결과를 받지 못했습니다. 도우미에서 올인원 폴더 생성을 아직 완료하지 않았거나 앱이 재시작된 상태입니다.`,
    };
  }
  return {
    stage: 'ok', ok: true, workerCount: workers.length, port: ep.port,
    folder: mf.folder, records: mf.records.length, raw: mf.records,
    message: `도우미 연결 정상 — ${mf.records.length}건 보유`,
  };
}

/** 폴더 기준 상대경로의 로컬 이미지 URL. <img src> 에 그대로 쓰거나 fetch 로 Blob 을 얻는다. */
export function localFileUrl(ep: LocalEndpoint, relPath: string): string {
  return `${base(ep)}/allinone/file?nonce=${encodeURIComponent(ep.nonce)}&p=${encodeURIComponent(relPath)}`;
}

/** 등록 시 업로드용 — 로컬 이미지를 File 로 읽어온다. 실패 시 null(그 장만 건너뜀). */
export async function fetchLocalFile(ep: LocalEndpoint, relPath: string): Promise<File | null> {
  try {
    const res = await fetch(localFileUrl(ep, relPath), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    const name = relPath.split(/[/\\]/).pop() || 'image.png';
    return new File([blob], name, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
}

/**
 * 도우미에 "지금 업데이트 확인/적용" 명령 — electron-updater checkForUpdatesNow 를 킥한다.
 * 성공(true) = 명령이 앱에 전달됨(다운로드→다음 실행 시 적용, 또는 즉시). 실패 시 false.
 * ⚠️ /update 엔드포인트가 없는 구버전 도우미(≤0.2.42)는 false → 웹이 다운로드 폴백을 안내.
 */
export async function triggerLocalUpdate(ep: LocalEndpoint): Promise<boolean> {
  try {
    const res = await fetch(`${base(ep)}/update?nonce=${encodeURIComponent(ep.nonce)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── 웹 업로드 생성 ──────────────────────────────────────────────────────────
// 웹이 폴더 경로를 못 받으므로(브라우저 보안), 폴더 "내용"을 도우미로 올려 생성시킨다.
//   폴더 선택 → 파일 트리 업로드 → 도우미가 임시폴더에서 run-folder 생성 → 완료 시 결과 로드.

/** 업로드 대상 파일 1개. path 는 세션(폴더) 기준 상대경로(슬래시 구분). */
export interface UploadFile {
  path: string;
  file: File;
}

export type GenPhase = 'uploading' | 'generating' | 'done' | 'error' | 'unknown';

/** 생성 진행 단계(러너 stdout 파싱) — 순서: recognize → text → image */
export type GenStep = 'recognize' | 'text' | 'image';
export interface GenProgress { phase: GenStep; done: number; total: number }
export interface GenStatus {
  state: GenPhase;
  error?: string | null;
  progress?: GenProgress | null;
  startedAt?: number | null;
  updatedAt?: number | null;
}

/** FileSystemDirectoryHandle 을 재귀 순회해 업로드할 파일 목록으로 편다(이미지+product.json 등). */
export async function collectFolderFiles(
  root: FileSystemDirectoryHandle,
  onProgress?: (n: number) => void,
): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    // @ts-expect-error - values() 는 표준이지만 lib.dom 타입에 아직 얇다
    for await (const entry of dir.values()) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const f = await (entry as FileSystemFileHandle).getFile();
        out.push({ path: rel, file: f });
        onProgress?.(out.length);
      } else {
        await walk(entry as FileSystemDirectoryHandle, rel);
      }
    }
  };
  await walk(root, '');
  return out;
}

/** 파일 1장 업로드. 세션 기준 상대경로로 도우미 임시폴더에 기록된다. */
async function uploadOne(ep: LocalEndpoint, session: string, f: UploadFile): Promise<boolean> {
  try {
    const res = await fetch(
      `${base(ep)}/allinone/upload?nonce=${encodeURIComponent(ep.nonce)}&session=${session}&p=${encodeURIComponent(f.path)}`,
      { method: 'POST', body: f.file, signal: AbortSignal.timeout(120_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 파일 목록을 동시 4개씩 업로드. 진행 콜백으로 완료 수를 알린다. */
export async function uploadFolderFiles(
  ep: LocalEndpoint,
  session: string,
  files: UploadFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; fail: number }> {
  let done = 0, ok = 0, fail = 0, next = 0;
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      const good = await uploadOne(ep, session, f);
      good ? ok++ : fail++;
      done++;
      onProgress?.(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  return { ok, fail };
}

/** 업로드 끝난 세션으로 생성 시작. */
export async function startLocalGenerate(ep: LocalEndpoint, session: string, noThumb: boolean): Promise<boolean> {
  try {
    const res = await fetch(
      `${base(ep)}/allinone/generate?nonce=${encodeURIComponent(ep.nonce)}&session=${session}&noThumb=${noThumb ? 1 : 0}`,
      { method: 'POST', signal: AbortSignal.timeout(30_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 생성 진행 상태 폴링. */
export async function pollGenStatus(ep: LocalEndpoint, session: string): Promise<GenStatus> {
  try {
    const res = await fetch(
      `${base(ep)}/allinone/gen-status?nonce=${encodeURIComponent(ep.nonce)}&session=${session}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return { state: 'unknown' };
    return (await res.json()) as GenStatus;
  } catch {
    return { state: 'unknown' };
  }
}

/** 폴더 하위 이미지 파일 목록(생성 폴더 기준 상대경로). 실패 시 빈 배열. */
export async function fetchLocalList(ep: LocalEndpoint, dirRel: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${base(ep)}/allinone/list?nonce=${encodeURIComponent(ep.nonce)}&p=${encodeURIComponent(dirRel)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { files?: string[] };
    return Array.isArray(json.files) ? json.files : [];
  } catch {
    return [];
  }
}

/** 생성 폴더(root) 기준으로 절대경로가 속한 최상위 상품 폴더명을 뽑는다. */
export function productDirOf(root: string, absPath: string | null | undefined): string | null {
  if (!absPath) return null;
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root);
  const a = norm(absPath);
  if (!a.toLowerCase().startsWith(r.toLowerCase() + '/')) return null;
  const rest = a.slice(r.length + 1); // "product_1/main_images/a.jpg"
  const first = rest.split('/')[0];
  return first || null;
}

// 스캐너와 동일한 서브폴더 분류 규칙(client-folder-scanner pickDir 후보와 일치).
const REVIEW_DIRS = ['review_images', 'reviews', 'review', '리뷰이미지', '리뷰 이미지', '리뷰', 'customer_reviews'];
const DETAIL_DIRS = ['detail_images', 'details', 'detail', 'detail-images', 'detailimages', '상세이미지', '상세 이미지', '상세', 'description_images'];
const INFO_DIRS = ['product_info', 'info', 'product-info', 'productinfo', '상품정보', '정보', 'info_images'];

export interface ClassifiedLocalImages {
  /** 상대경로. main 은 누끼본(main_images_regen) 이 앞. */
  main: string[];
  /** main 앞쪽 몇 장이 누끼 가공본인지(대표컷 뱃지·업로드 판정용). */
  regenCount: number;
  detail: string[];
  review: string[];
  info: string[];
}

/**
 * /allinone/list 결과(root 기준 상대경로)를 대표/상세/리뷰/정보로 분류.
 * 폴더 핸들이 없는 로컬 직독에서 스캐너와 같은 결과를 내기 위한 규칙 일치 버전.
 */
export function classifyLocalImages(files: string[], productDir: string): ClassifiedLocalImages {
  const out: ClassifiedLocalImages = { main: [], regenCount: 0, detail: [], review: [], info: [] };
  const regen: string[] = [];
  const prefix = productDir.replace(/\\/g, '/').toLowerCase() + '/';
  for (const f of files) {
    const nf = f.replace(/\\/g, '/');
    const low = nf.toLowerCase();
    if (!low.startsWith(prefix)) continue;
    const sub = low.slice(prefix.length).split('/')[0]; // 상품폴더 바로 아래 서브폴더명
    if (sub === 'main_images_regen') regen.push(nf);
    else if (sub === 'main_images') out.main.push(nf);
    else if (REVIEW_DIRS.includes(sub)) out.review.push(nf);
    else if (DETAIL_DIRS.includes(sub)) out.detail.push(nf);
    else if (INFO_DIRS.includes(sub)) out.info.push(nf);
    // 그 외 서브폴더(광고/배송 등)는 무시 — 스캐너도 안 담는다.
  }
  // 누끼 가공본을 대표 후보 맨 앞에(원본 main 보다 우선). 상세가 비면 리뷰를 상세로(스캐너 폴백과 동일).
  out.regenCount = regen.length;
  out.main = [...regen, ...out.main];
  if (out.detail.length === 0 && out.review.length > 0) out.detail = [...out.review];
  return out;
}
