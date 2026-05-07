// ============================================================
// 시스템 로그 헬퍼 — 모든 catch 블록에서 사용
//
// 사용:
//   try { ... } catch (err) {
//     await logSystemError({ source: 'megaload/bulk-register', error: err, context: { productId } });
//     return NextResponse.json({ error: '...' }, { status: 500 });
//   }
//
// 자동 처리:
//   - 카테고리 자동 추론 (source path 기반)
//   - 알려진 패턴별 resolution_hint 자동 매칭
//   - fingerprint 자동 생성 (동일 오류 dedup)
//   - silently fails — 로깅 실패가 본 요청을 막으면 안 됨
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';

// 모듈 싱글톤 — fire-and-forget 로깅이 매번 새 client 생성하면 cold init 비용 폭증.
// 같은 process 안에서는 재사용. createServiceClient 가 비동기이므로 promise 캐시.
let _cachedClient: Promise<SupabaseClient> | null = null;
function getSharedServiceClient(): Promise<SupabaseClient> {
  if (!_cachedClient) _cachedClient = createServiceClient();
  return _cachedClient;
}

export type LogLevel = 'error' | 'warn' | 'info';

export type LogCategory =
  | 'coupang_api'      // 쿠팡 Wing API
  | 'naver_api'        // 네이버 커머스 API
  | 'supabase'         // DB / Storage 관련
  | 'payment'          // 결제 흐름
  | 'auth'             // 인증/권한
  | 'cron'             // Vercel cron
  | 'megaload'         // 메가로드 일반
  | 'build'            // 빌드/타입
  | 'network'          // 네트워크 일반
  | 'admin'            // 관리자 작업
  | 'other';

interface LogParams {
  source: string;                              // API 라우트 path 또는 module 이름
  error?: unknown;                              // catch 받은 에러
  message?: string;                             // 명시적 메시지 (error 없을 때)
  context?: Record<string, unknown>;            // 추가 디버그 정보
  level?: LogLevel;                             // 기본 'error'
  category?: LogCategory;                       // 미지정 시 source 로 자동 추론
  userId?: string;
  requestId?: string;
  client?: SupabaseClient;                      // 이미 있으면 재사용 (없으면 service client 생성)
}

// ── 카테고리 자동 추론 ────────────────────────────────────────
function inferCategory(source: string, errMsg: string): LogCategory {
  const s = source.toLowerCase();
  const m = errMsg.toLowerCase();
  if (s.includes('coupang') || s.includes('wing')) return 'coupang_api';
  if (s.includes('naver') || s.includes('smartstore')) return 'naver_api';
  if (s.includes('payment') || s.includes('billing') || s.includes('toss')) return 'payment';
  if (s.includes('cron')) return 'cron';
  if (s.includes('megaload') || s.includes('bulk-register')) return 'megaload';
  if (s.includes('auth') || s.includes('login') || s.includes('admin')) return 'auth';
  if (m.includes('supabase') || m.includes('postgres') || m.includes('rls') || m.includes('jwt')) return 'supabase';
  if (m.includes('fetch failed') || m.includes('econnrefused') || m.includes('timeout') || m.includes('etimedout')) return 'network';
  return 'other';
}

// ── 알려진 패턴별 해결 가이드 ──────────────────────────────────
const RESOLUTION_PATTERNS: { re: RegExp; hint: string }[] = [
  { re: /coupang.+(?:hang|timeout|abort)/i,      hint: '쿠팡 Wing API timeout. (1) Fly.io NRT egress IP `209.71.88.111` 가 쿠팡 허용 IP 인지 확인 (2) coupang-proxy 로그 확인.' },
  { re: /(?:fetch|request).+abort/i,             hint: 'Fetch가 AbortSignal 로 중단됨 (timeout). 클라이언트 timeout 또는 서버 응답 지연. fetch에 AbortSignal.timeout(N) 추가했는지 확인.' },
  { re: /econnrefused|connection refused/i,      hint: 'TCP 연결 거부. 대상 서버 다운/방화벽. 외부 서비스(Supabase / Coupang / Toss / Naver)인 경우 해당 status page 확인.' },
  { re: /etimedout|connection.+timeout/i,        hint: 'TCP 연결 timeout. 네트워크 경로 문제이거나 서버 과부하. 잠시 후 재시도. 반복되면 status page 확인.' },
  { re: /econnreset|socket.+(?:hang up|reset)/i, hint: '연결이 끊어짐 (peer reset). 외부 API 일시 장애. 재시도 또는 status page 확인.' },
  { re: /bad gateway|502/i,                      hint: '502 Bad Gateway. 업스트림 서비스(Supabase / Vercel / Coupang) 일시 장애. 재시도.' },
  { re: /service unavailable|503/i,              hint: '503 Service Unavailable. 업스트림 일시 장애. 재시도 또는 status page 확인.' },
  { re: /gateway timeout|504/i,                  hint: '504 Gateway Timeout. 업스트림 응답 지연. fetch timeout 늘리거나 비동기 분리 검토.' },
  { re: /rate.?limit|429/i,                      hint: '429 Rate Limit. 외부 API 호출 빈도 초과. backoff 추가 또는 쿠팡/Toss 콘솔 quota 확인.' },
  { re: /unauthorized|401/i,                     hint: '401 Unauthorized. 토큰 만료 또는 인증 헤더 누락. 채널 연결 재인증 또는 cookie 확인.' },
  { re: /forbidden|403/i,                        hint: '403 Forbidden. 권한 부족 (RLS / 채널 권한 / API key scope). 정책 또는 키 권한 확인.' },
  { re: /not found|404/i,                        hint: '404 Not Found. 경로 또는 리소스 ID 오타. 클라이언트 호출과 라우트 정의 확인.' },
  { re: /violates.+(?:row.level.security|rls)/i, hint: 'Postgres RLS 정책 위반. 사용자 role 과 RLS USING/WITH CHECK 조건 확인.' },
  { re: /violates.+(?:check|foreign.key|unique)/i, hint: 'Postgres CHECK / FK / UNIQUE 제약 위반. 마이그레이션과 입력값 매칭 확인.' },
  { re: /column.+does not exist/i,               hint: '컬럼 없음. 마이그레이션 미실행 또는 코드-스키마 불일치. supabase/migration_*.sql 적용 상태 확인.' },
  { re: /relation.+does not exist/i,             hint: '테이블 없음. 마이그레이션 미실행. supabase/migration_*.sql 적용 상태 확인.' },
  { re: /jwt expired|token.+expired/i,           hint: '토큰 만료. 사용자에게 재로그인 안내 또는 refresh token 흐름 점검.' },
  { re: /storage.+(?:limit|quota)/i,             hint: 'Supabase Storage 용량 한도. 청구 발생 가능. /api/cron/storage-gc 실행하거나 수동 정리.' },
  { re: /cannot find module|module not found/i,  hint: 'Node 모듈 미설치 또는 경로 오타. npm install / import 경로 확인.' },
];

function inferResolutionHint(message: string): string | null {
  for (const { re, hint } of RESOLUTION_PATTERNS) {
    if (re.test(message)) return hint;
  }
  return null;
}

// ── fingerprint — source + 정규화한 메시지 ────────────────────
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h | 0).toString(36);
}

function normalizeMessage(msg: string): string {
  // UUID / 숫자 / hex / 따옴표 안 텍스트 → placeholder 로 치환해서 동일 오류는 동일 fingerprint 가 되도록
  let n = msg;
  n = n.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
  n = n.replace(/\b\d{4,}\b/g, '<num>');
  n = n.replace(/0x[0-9a-f]+/gi, '<hex>');
  n = n.replace(/"[^"]*"/g, '"<str>"');
  n = n.replace(/'[^']*'/g, "'<str>'");
  n = n.replace(/\s+/g, ' ').trim();
  return n.slice(0, 200);
}

function makeFingerprint(source: string, message: string): string {
  return djb2(source + '|' + normalizeMessage(message));
}

// ── 서버사이드 circuit breaker ────────────────────────────────
// Supabase RPC 가 실패 누적 시 30초간 RPC 시도 자체를 정지 (cost 폭증 방지).
// 로깅 인프라 자체가 다운돼도 본 요청을 안 막고, GB-Hrs 도 안 잡아먹음.
let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;

// ── 메인 헬퍼 ──────────────────────────────────────────────────
async function logSystem(level: LogLevel, params: LogParams): Promise<void> {
  // 회로 열려 있으면 silent skip
  if (Date.now() < _circuitOpenUntil) return;
  try {
    const errMsg = params.error instanceof Error
      ? params.error.message
      : params.error
        ? String(params.error)
        : params.message || '(no message)';
    const stack = params.error instanceof Error ? params.error.stack : undefined;

    const category: LogCategory = params.category || inferCategory(params.source, errMsg);
    const fingerprint = makeFingerprint(params.source, errMsg);
    const resolutionHint = inferResolutionHint(errMsg);

    const context: Record<string, unknown> = {
      ...(params.context || {}),
    };
    if (stack) context.stack = stack.split('\n').slice(0, 10).join('\n');
    if (params.error instanceof Error && params.error.name) context.errorName = params.error.name;

    const client = params.client || (await getSharedServiceClient());

    // upsert_system_log RPC — 동일 fingerprint 24시간 내면 occurrences 증가, 아니면 신규 row
    await client.rpc('upsert_system_log', {
      p_level: level,
      p_category: category,
      p_source: params.source,
      p_message: errMsg.slice(0, 1000),
      p_context: context as never,
      p_fingerprint: fingerprint,
      p_resolution_hint: resolutionHint,
      p_user_id: params.userId || null,
      p_request_id: params.requestId || null,
    });
    _consecutiveFailures = 0; // 성공 → 카운터 리셋
  } catch (logErr) {
    _consecutiveFailures += 1;
    if (_consecutiveFailures >= CIRCUIT_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      _consecutiveFailures = 0;
    }
    // 로깅 실패는 본 요청 흐름을 막으면 안 됨 — console 만 출력
    console.error('[system-log] logging failed:', logErr instanceof Error ? logErr.message : logErr);
  }
}

export async function logSystemError(params: LogParams): Promise<void> {
  return logSystem('error', params);
}
export async function logSystemWarn(params: LogParams): Promise<void> {
  return logSystem('warn', params);
}
export async function logSystemInfo(params: LogParams): Promise<void> {
  return logSystem('info', params);
}
