import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError, logSystemWarn, logSystemInfo, type LogLevel, type LogCategory } from '@/lib/utils/system-log';

export const maxDuration = 10;

// IP 별 throttle — 봇/외부 트래픽이 무한 증폭으로 cost 폭증시키는 사고 차단.
// 같은 IP 가 30초 안에 5건 넘기면 silent drop (200 OK 로 응답해 클라가 재시도 안 함).
const _ipBuckets = new Map<string, { count: number; windowStart: number }>();
const THROTTLE_WINDOW_MS = 30_000;
const THROTTLE_MAX_PER_WINDOW = 5;

function shouldThrottle(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  const now = Date.now();
  const b = _ipBuckets.get(ip);
  if (!b || now - b.windowStart > THROTTLE_WINDOW_MS) {
    _ipBuckets.set(ip, { count: 1, windowStart: now });
    // 메모리 누수 방지 — 1000개 넘으면 만료된 것 정리
    if (_ipBuckets.size > 1000) {
      const cutoff = now - THROTTLE_WINDOW_MS;
      for (const [k, v] of _ipBuckets.entries()) {
        if (v.windowStart < cutoff) _ipBuckets.delete(k);
      }
    }
    return false;
  }
  b.count += 1;
  return b.count > THROTTLE_MAX_PER_WINDOW;
}

/**
 * POST — 클라이언트 사이드 에러를 시스템 로그에 기록.
 *
 * 인증: 로그인 사용자 또는 비로그인. 비로그인은 user-agent + IP 만 context 에 기록.
 * 라우트는 의도적으로 throttling 하지 않음 — system_logs.upsert 가 24h 내 동일
 * fingerprint dedup 하므로 자연스럽게 묶임.
 *
 * 본문:
 *   level: 'error' | 'warn' | 'info'
 *   category?: LogCategory
 *   source: string                        // page path 또는 component 이름
 *   message: string
 *   context?: Record<string, unknown>
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 });
    }

    const level = (body.level === 'warn' || body.level === 'info') ? body.level : 'error';
    const source = String(body.source || 'client').slice(0, 200);
    const rawMessage = String(body.message || '').slice(0, 1000);
    if (!rawMessage) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent') || 'unknown';
    const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const ip = ipHeader.split(',')[0].trim() || 'unknown';

    // 같은 IP 가 30s 안에 5건 넘으면 silent drop — cost 폭증 차단
    if (shouldThrottle(ip)) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      // 비로그인 OK
    }

    const context: Record<string, unknown> = {
      ...(body.context && typeof body.context === 'object' ? body.context : {}),
      _client: true,
      _ua: userAgent.slice(0, 200),
      _ip: ip,
      _path: typeof body.path === 'string' ? body.path.slice(0, 200) : undefined,
    };

    const params = {
      source,
      message: rawMessage,
      context,
      userId,
      category: (body.category as LogCategory | undefined) || undefined,
    };

    if (level === 'error') await logSystemError(params);
    else if (level === 'warn') await logSystemWarn(params);
    else await logSystemInfo(params);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[client-report] error:', err);
    return NextResponse.json({ error: 'logging failed' }, { status: 500 });
  }
}

// 헬퍼 export — 컴파일 시 trimmed (사용 안 하면 트리쉐이킹)
export type { LogLevel as _LogLevel };
