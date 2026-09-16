import type { NextRequest } from 'next/server';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 상담 레이트 리밋.
 *
 * 비로그인도 상담이 가능하므로(공개 랜딩), 제한이 없으면 LLM 토큰 비용이 무방비다.
 * anon_key 는 클라이언트가 만드는 값이라 얼마든지 새로 발급할 수 있어 제한 키로 쓸 수 없다.
 * 로그인 사용자는 profile_id, 비로그인은 IP 로 센다.
 *
 * DB RPC(assistant_rate_bump)로 원자적으로 증가 + 판정한다 —
 * 서버리스라 인스턴스 메모리 카운터는 의미가 없다.
 *
 * RPC 가 없거나(마이그레이션 전) 실패하면 **통과시킨다.** 레이트 리밋 장애로
 * 상담 자체가 막히는 게 더 나쁘다.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  minuteCount: number;
  dayCount: number;
  /** 제한 검사를 실제로 수행했는지 (false = RPC 미적용/실패로 통과시킴) */
  enforced: boolean;
}

/** 로그인 사용자 — 정상 상담 사용량은 충분히 덮는다. */
const LOGGED_IN = { perMinute: 10, perDay: 150 };
/** 비로그인 — 공개 랜딩 문의 수준. 남용 비용을 여기서 막는다. */
const ANON = { perMinute: 5, perDay: 30 };

/** Vercel 환경에서 클라이언트 IP. 프록시 체인의 첫 번째가 원 주소다. */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function checkRateLimit(
  serviceClient: any,
  opts: { profileId: string | null; ip: string },
): Promise<RateLimitResult> {
  const pass: RateLimitResult = {
    allowed: true,
    retryAfter: 0,
    minuteCount: 0,
    dayCount: 0,
    enforced: false,
  };
  if (!serviceClient) return pass;

  const subject = opts.profileId ? `p:${opts.profileId}` : `i:${opts.ip}`;
  const limits = opts.profileId ? LOGGED_IN : ANON;

  try {
    const { data, error } = await serviceClient.rpc('assistant_rate_bump', {
      p_subject: subject,
      p_minute_limit: limits.perMinute,
      p_day_limit: limits.perDay,
    });
    if (error) return pass; // 마이그레이션 전이면 함수가 없다 — 막지 않는다
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return pass;
    return {
      allowed: !!row.allowed,
      retryAfter: Number(row.retry_after) || 0,
      minuteCount: Number(row.minute_count) || 0,
      dayCount: Number(row.day_count) || 0,
      enforced: true,
    };
  } catch {
    return pass;
  }
}

/** 한도 초과 시 사용자에게 보여줄 문구 — 막혔다는 사실과 대안을 같이 준다. */
export function rateLimitMessage(r: RateLimitResult, loggedIn: boolean): string {
  if (r.retryAfter <= 90) {
    return `조금 빠르게 여러 번 보내셨습니다. ${r.retryAfter}초 뒤에 다시 시도해 주세요.`;
  }
  const hours = Math.ceil(r.retryAfter / 3600);
  return loggedIn
    ? `오늘 상담 가능 횟수를 다 쓰셨습니다. 약 ${hours}시간 뒤에 초기화됩니다.\n\n급한 건이면 [1:1 문의](/my/support)나 카카오톡 상담으로 남겨주세요. 바로 확인합니다.`
    : `오늘 상담 가능 횟수를 다 쓰셨습니다. 약 ${hours}시간 뒤에 초기화됩니다.\n\n로그인하시면 더 많이 이용하실 수 있고, 급한 건이면 카카오톡 상담으로 바로 문의해 주세요.`;
}
