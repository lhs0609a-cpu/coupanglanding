/**
 * 쿠팡 Open API HMAC-SHA256 서명 유틸리티
 * 서버 사이드에서만 사용 (Web Crypto API)
 */

/** yyMMdd'T'HHmmss'Z' 포맷으로 현재 시간 반환 */
export function formatSignedDate(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getUTCFullYear().toString().slice(2);
  const M = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const H = pad(date.getUTCHours());
  const m = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${M}${d}T${H}${m}${s}Z`;
}

/** HMAC-SHA256 서명 생성 */
export async function generateSignature(
  secretKey: string,
  method: string,
  path: string,
  datetime: string,
): Promise<string> {
  // 쿠팡 HMAC 스펙: message = datetime + method + path + query (? 제거)
  const [pathPart, ...queryParts] = path.split('?');
  const message = queryParts.length > 0
    ? `${datetime}${method}${pathPart}${queryParts.join('?')}`
    : `${datetime}${method}${pathPart}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** CEA 인증 헤더 조합 */
export async function buildAuthorizationHeader(
  accessKey: string,
  secretKey: string,
  method: string,
  path: string,
  datetime: string,
): Promise<string> {
  const signature = await generateSignature(secretKey, method, path, datetime);
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}
