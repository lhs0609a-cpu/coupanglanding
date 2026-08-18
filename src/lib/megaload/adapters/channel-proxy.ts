/**
 * 채널 API 고정 IP 경유 호출 (11번가·ESM·롯데온·네이버 커머스API 공용)
 *
 * 왜 필요한가:
 *   국내 오픈마켓 오픈API 는 대부분 "호출 서버 IP" 를 판매자/솔루션사 화이트리스트에
 *   등록해야 호출이 허용된다. Vercel 서버리스는 고정 IP 가 없어 등록 자체가 불가능하다.
 *   → Fly.io 프록시(coupang-api-proxy)를 단일 출구로 삼고, 그 IP 하나만 등록한다.
 *
 * 동작:
 *   - CHANNEL_PROXY_URL(없으면 COUPANG_PROXY_URL) 이 설정되어 있으면 프록시 /fwd 경유
 *   - 설정이 없으면 직접 호출로 폴백 — 로컬 개발용(개발자 PC IP 를 등록해 둔 경우)
 *
 * 응답을 text 로 받는 이유:
 *   11번가 셀러 API 는 XML 이 기본이라 JSON 으로 파싱하면 깨진다. 파싱은 호출측 책임.
 */

const PROXY_URL = process.env.CHANNEL_PROXY_URL || process.env.COUPANG_PROXY_URL || '';
const PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';

export interface ChannelResponse {
  status: number;
  contentType: string;
  body: string;
}

export function isChannelProxyConfigured(): boolean {
  return Boolean(PROXY_URL && PROXY_SECRET);
}

/** 프록시 출구 IP — 셀러에게 안내할 값. 미설정이면 null. */
export function channelProxyOrigin(): string | null {
  return PROXY_URL || null;
}

/**
 * 채널 API 1회 호출. 상태코드는 그대로 돌려주며 예외를 던지지 않는다(4xx/5xx 판단은 호출측).
 * 네트워크/프록시 자체 실패만 throw.
 */
export async function channelFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  timeoutMs = 30_000,
): Promise<ChannelResponse> {
  const method = init.method || 'GET';

  if (!isChannelProxyConfigured()) {
    // 폴백: 직접 호출 (로컬 개발). 프로덕션에서는 IP 화이트리스트에 걸려 실패한다.
    const res = await fetch(url, {
      method,
      headers: init.headers,
      ...(init.body != null && method !== 'GET' && method !== 'HEAD' ? { body: init.body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      body: await res.text(),
    };
  }

  const res = await fetch(`${PROXY_URL.replace(/\/$/, '')}/fwd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Secret': PROXY_SECRET,
    },
    body: JSON.stringify({ url, method, headers: init.headers, body: init.body }),
    signal: AbortSignal.timeout(timeoutMs + 5_000), // 프록시 자체 타임아웃(30s)보다 여유
  });

  const text = await res.text();
  let parsed: Partial<ChannelResponse> & { error?: string; transient?: boolean };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`채널 프록시 응답 파싱 실패 (${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok || parsed.error) {
    const tag = parsed.transient ? '[transient] ' : '';
    throw new Error(`${tag}채널 프록시 오류 ${res.status}: ${parsed.error || text.slice(0, 300)}`);
  }

  return {
    status: parsed.status ?? res.status,
    contentType: parsed.contentType ?? '',
    body: parsed.body ?? '',
  };
}

/**
 * XML 응답에서 단일 태그 값 추출 — 11번가 셀러 API 용 최소 파서.
 * 의존성 추가 없이 성공/실패 판정과 식별자 추출만 처리한다.
 * 중첩·반복 구조가 필요해지면 그때 정식 파서를 도입할 것.
 */
export function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}
