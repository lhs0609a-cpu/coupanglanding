/**
 * AES-256 기반 쿠팡 비밀번호 암호화/복호화
 * 서버 사이드에서만 사용 (Web Crypto API)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  return key;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('coupang-seller-pw-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 평문을 AES-256-GCM으로 암호화하여 base64 문자열 반환 */
export async function encryptPassword(plaintext: string): Promise<string> {
  const key = await deriveKey(getEncryptionKey());
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext),
  );

  // iv + ciphertext를 합쳐서 base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/** AES-256-GCM 암호화된 base64 문자열을 복호화 */
export async function decryptPassword(ciphertext: string): Promise<string> {
  const key = await deriveKey(getEncryptionKey());

  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * 기존 base64 인코딩인지 AES 암호화인지 판별.
 * AES 암호화된 값은 IV(12) + ciphertext로 구성되어 항상 더 긴 base64 문자열.
 * 간단한 휴리스틱: base64 디코딩 후 길이 > 원래 문자열이면 AES로 간주.
 */
export function isAesEncrypted(value: string): boolean {
  try {
    const decoded = atob(value);
    // AES-GCM: 최소 IV(12) + tag(16) = 28바이트 이상
    return decoded.length >= 28;
  } catch {
    return false;
  }
}
