/**
 * 네이버 계정 보관함 — 자동 로그인용.
 * ---------------------------------------------------------------------------
 * 왜 저장하나: 목록 페이지는 로그인 없이 안 열린다. 그런데 로그인은 사람이 손으로 하는
 * 유일한 단계라, 세션이 끊길 때마다 수집이 통째로 멈춘다(실측: NID 쿠키가 세션 쿠키로
 * 발급돼 앱 재시작마다 로그아웃). "한 번 넣어 두면 알아서 돈다"가 되려면 계정이 필요하다.
 *
 * 어떻게 지키나 (이 파일의 규칙 4가지):
 *   ① 비밀번호는 **OS 암호저장소**(Windows DPAPI / macOS 키체인)로만 저장한다.
 *      safeStorage 를 못 쓰면 **저장을 거부한다** — 평문으로 남기느니 기능을 포기한다.
 *   ② 복호화한 값은 로그인 순간에만 메모리에 있고, 어디에도 로그로 남기지 않는다.
 *   ③ 밖(웹 화면·서버)으로는 **가린 아이디만** 나간다. 비밀번호는 읽어가는 경로가 없다.
 *   ④ 이 PC 를 벗어나지 않는다 — 저장 위치는 이 앱의 설정 파일 하나뿐이다.
 */

const KEY = 'naverCredential';

let store = null;

export function initCredentials(s) { store = s; }

async function safe() {
  const { safeStorage } = await import('electron');
  return safeStorage;
}

/** OS 암호저장소를 쓸 수 있는지 — 못 쓰면 저장 자체를 안 한다(위 규칙 ①). */
export async function encryptionAvailable() {
  try { return (await safe()).isEncryptionAvailable(); } catch { return false; }
}

/** 아이디를 가려서 보여준다 — 화면에는 "어느 계정인지" 만 알면 충분하다. */
export function maskId(id) {
  const s = String(id || '');
  if (!s) return '';
  const [name, domain] = s.includes('@') ? s.split('@') : [s, ''];
  const head = name.slice(0, 2);
  const masked = head + '*'.repeat(Math.max(1, name.length - 2));
  return domain ? `${masked}@${domain}` : masked;
}

export async function saveCredentials(id, pw) {
  if (!id || !pw) throw new Error('아이디와 비밀번호를 모두 입력하세요.');
  if (!(await encryptionAvailable())) {
    throw new Error('이 PC 에서는 OS 암호저장소를 쓸 수 없어 비밀번호를 안전하게 보관할 수 없습니다 — 자동 로그인을 켤 수 없습니다.');
  }
  const ss = await safe();
  store?.set(KEY, {
    id: String(id),
    pw: ss.encryptString(String(pw)).toString('base64'),
    at: Date.now(),
  });
  return credentialInfo();
}

export function clearCredentials() {
  store?.set(KEY, null);
  return { has: false };
}

/** 화면에 내보내도 되는 정보만. 비밀번호는 여기서 절대 안 나간다(규칙 ③). */
export function credentialInfo() {
  const c = store?.get(KEY, null);
  return c?.id
    ? { has: true, idMasked: maskId(c.id), savedAt: c.at || 0 }
    : { has: false, idMasked: '', savedAt: 0 };
}

export function hasCredentials() { return !!store?.get(KEY, null)?.id; }

/** 로그인 순간에만 부른다. 반환값을 로그·상태·응답 어디에도 싣지 말 것. */
export async function loadCredentials() {
  const c = store?.get(KEY, null);
  if (!c?.id || !c?.pw) return null;
  try {
    const ss = await safe();
    return { id: c.id, pw: ss.decryptString(Buffer.from(c.pw, 'base64')) };
  } catch {
    // 복호화 실패 = 다른 PC/계정에서 만들어진 값. 남겨 두면 매번 실패하므로 버린다.
    clearCredentials();
    return null;
  }
}
