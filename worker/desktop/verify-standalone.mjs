/**
 * 광고 자동화 — 독립 검증 실행기 (개발용)
 * ---------------------------------------------------------------------------
 * 전체 워커 앱(썸네일/ComfyUI/자동업데이트)을 띄우지 않고, 광고 DOM 함수만
 * 안전 점검한다. npm 의존성 0 (electron + runtime/ad-automation.mjs 만 사용).
 *
 * 실행: electron.exe <이 파일>  (또는 worker/desktop 디렉터리에서)
 * 동작: 윙 로그인 창을 띄움 → 로그인되면 verifyDomActions 자동 실행 → 결과를
 *       콘솔 + userData/ads-verify-result.txt 에 기록. (돈/삭제/생성 안 함)
 */
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureWingSession, verifyDomActions } from './runtime/ad-automation.mjs';

const log = (...a) => console.log('[verify]', ...a);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 900, show: true,
    title: '광고 자동화 점검 (안전 — 돈/삭제 없음)',
    webPreferences: { partition: 'persist:wing' },
  });

  log('윙 로그인 창을 엽니다. 쿠팡 윙에 로그인하면 자동으로 점검을 시작합니다… (최대 5분 대기)');
  let loggedIn = false;
  try { loggedIn = await ensureWingSession(win, { timeoutMs: 300000 }); }
  catch (e) { log('ensureWingSession 오류:', e.message); }

  if (!loggedIn) { log('로그인 확인 실패(시간초과). 창에서 로그인 후 다시 실행해 주세요.'); return; }

  log('로그인 확인됨 — 5개 기능 DOM 점검 시작 (제출/삭제/생성 안 함)');
  let out = '광고 자동화 안전 점검 결과\n';
  try {
    const { steps } = await verifyDomActions(win);
    for (const s of steps) {
      const line = `${s.ok ? '✅ PASS' : '❌ FAIL'} | ${s.name}${s.detail ? ' — ' + s.detail : ''}`;
      log(line); out += line + '\n';
    }
    const ok = steps.filter((s) => s.ok).length;
    const sum = `=== 결과 ${ok}/${steps.length} 통과 ===`;
    log(sum); out += sum + '\n';
  } catch (e) {
    log('점검 중 오류:', e.message); out += '점검 중 오류: ' + e.message + '\n';
  }
  try {
    const fp = join(app.getPath('userData'), 'ads-verify-result.txt');
    await writeFile(fp, out, 'utf8');
    log('결과 저장:', fp);
  } catch { /* ignore */ }
  log('점검 종료. 창은 열어둡니다(닫으면 종료).');
});

app.on('window-all-closed', () => app.quit());
