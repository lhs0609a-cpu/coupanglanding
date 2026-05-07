import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError, logSystemWarn, logSystemInfo, type LogLevel, type LogCategory } from '@/lib/utils/system-log';

export const maxDuration = 10;

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
