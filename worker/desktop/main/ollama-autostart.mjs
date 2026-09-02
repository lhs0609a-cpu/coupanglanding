/**
 * ollama 트레이 앱의 "시작 시 실행"을 도우미가 대신 꺼 준다.
 * ===========================================================================
 * 왜 필요한가(실측 2026-09-02)
 * ---------------------------------------------------------------------------
 * 도우미는 할 일이 없으면 AI 엔진을 내려 메모리(5GB 안팎)를 돌려준다. 그런데 이 PC 에
 * ollama 를 따로 설치해 두면 트레이 앱('ollama app.exe')이 **로그인 때 자동 실행**되고,
 * 우리가 내리는 즉시 포트를 물려받아 모델을 다시 올린다 —— 실측으로 1초도 안 걸렸다.
 * 그러면 유휴 정리가 1분마다 그놈을 다시 죽이고, 그놈은 다시 뜨고… 이 싸움이 끝나지 않는다.
 * (그 부작용으로 검은 콘솔 창이 1분마다 깜빡였다 — v0.5.7 에서 창은 숨겼지만 **싸움 자체는
 * 그대로**였다. 원인을 놔두고 증상만 가린 셈이라 여기서 뿌리를 끊는다.)
 *
 * 그래서 **자동 실행 항목을 우리가 끈다.** 사용자에게 "설정에서 꺼 주세요"라고 부탁하지 않는다 —
 * 그 부탁을 실행하는 사람은 거의 없고, 못 지키면 도우미가 계속 이상하게 동작한다.
 *
 * 안전 규칙(지키는 것)
 * ---------------------------------------------------------------------------
 *  ① **원래 값을 반드시 보관한다.** 지우기 전에 레지스트리 값을 그대로 store 에 적어 둔다.
 *     보관에 실패하면 지우지 않는다 — 되돌릴 수 없는 변경은 하지 않는다.
 *  ② **되돌릴 수 있다.** restore() 하나로 원래대로 돌아간다(트레이 메뉴에 항목이 생긴다).
 *  ③ **ollama 를 지우지 않는다.** 자동 실행만 끈다. 엔진이 필요하면 도우미가 그때 띄운다.
 *  ④ 우리가 끄지 않은 것은 건드리지 않는다(saved 가 있을 때만 restore 가 동작한다).
 *
 * Windows 전용이다. 다른 OS 에서는 조용히 아무 일도 하지 않는다.
 */

import { execFile } from 'node:child_process';

/** ollama 설치기가 만드는 자동 실행 항목. 값 이름은 설치기 버전과 무관하게 'Ollama' 다. */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'Ollama';
/** store 에 원래 값을 적어 두는 자리. */
const STORE_KEY = 'ollamaAutostartSaved';

const isWin = process.platform === 'win32';

/** reg.exe 한 발. windowsHide 필수 — 없으면 검은 콘솔 창이 깜빡인다. */
function reg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || '') });
    });
  });
}

/**
 * 지금 등록돼 있는 자동 실행 명령. 없으면 null.
 * reg query 출력 예: "    Ollama    REG_SZ    C:\\Users\\me\\AppData\\Local\\Programs\\Ollama\\ollama app.exe"
 */
export async function readEntry() {
  if (!isWin) return null;
  const r = await reg(['query', RUN_KEY, '/v', RUN_VALUE]);
  if (!r.ok) return null;
  const m = r.out.match(/\s+Ollama\s+(REG_[A-Z_]+)\s+(.+)/);
  if (!m) return null;
  return { type: m[1], value: m[2].trim() };
}

/**
 * 자동 실행을 끈다(원래 값은 보관).
 * @returns {Promise<{changed:boolean, reason?:string, saved?:string}>}
 *   changed=true 면 이번에 실제로 껐다는 뜻 — 호출부가 그때만 사용자에게 알린다.
 */
export async function disable(store, { onLog = () => {} } = {}) {
  if (!isWin) return { changed: false, reason: 'not-windows' };
  const entry = await readEntry();
  if (!entry) {
    // 이미 없다. 우리가 끈 기록이 있으면 그대로 두고(사용자가 직접 지웠을 수도 있다) 조용히 끝낸다.
    return { changed: false, reason: 'absent' };
  }
  // ① 먼저 보관한다. 보관에 실패하면 **지우지 않는다** — 되돌릴 수 없는 변경은 하지 않는다.
  try {
    store?.set?.(STORE_KEY, { type: entry.type, value: entry.value, at: Date.now() });
    if (store?.get && !store.get(STORE_KEY, null)) throw new Error('보관 확인 실패');
  } catch (e) {
    onLog(`[엔진] ollama 자동 실행 설정을 보관하지 못해 그대로 둡니다 — ${e?.message || e}`);
    return { changed: false, reason: 'save-failed' };
  }
  const del = await reg(['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);
  if (!del.ok) {
    onLog('[엔진] ollama 자동 실행을 끄지 못했습니다 — 메모리 반납이 일부만 될 수 있습니다.');
    return { changed: false, reason: 'delete-failed' };
  }
  onLog('[엔진] 이 PC 에 따로 설치된 ollama 의 "시작 시 실행"을 껐습니다 — '
    + '엔진은 도우미가 필요할 때만 띄웁니다(안 쓸 때 메모리가 온전히 돌아옵니다). '
    + '되돌리려면 트레이 아이콘 메뉴에서 "ollama 자동 실행 되돌리기"를 누르세요.');
  return { changed: true, saved: entry.value };
}

/**
 * 우리가 껐던 자동 실행을 원래대로 되돌린다.
 * 우리가 끈 기록(saved)이 없으면 아무 일도 하지 않는다 — 남이 설정한 것을 우리가 만들어 내지 않는다.
 */
export async function restore(store, { onLog = () => {} } = {}) {
  if (!isWin) return { changed: false, reason: 'not-windows' };
  const saved = store?.get?.(STORE_KEY, null);
  if (!saved || !saved.value) return { changed: false, reason: 'nothing-saved' };
  const add = await reg(['add', RUN_KEY, '/v', RUN_VALUE, '/t', saved.type || 'REG_SZ', '/d', saved.value, '/f']);
  if (!add.ok) {
    onLog('[엔진] ollama 자동 실행을 되돌리지 못했습니다.');
    return { changed: false, reason: 'add-failed' };
  }
  try { store?.set?.(STORE_KEY, null); } catch { /* 기록 삭제 실패는 무해 */ }
  onLog('[엔진] ollama 의 "시작 시 실행"을 원래대로 되돌렸습니다 — 다음 로그인부터 다시 자동 실행됩니다.');
  return { changed: true };
}

/** 우리가 꺼 둔 상태인가 — 트레이 메뉴에 "되돌리기" 를 보일지 정하는 데 쓴다. */
export function isDisabledByUs(store) {
  try { return !!store?.get?.(STORE_KEY, null)?.value; } catch { return false; }
}
