/**
 * 광고 자동화 — 안전 "끝까지" 실행 테스트 (개발용)
 * ---------------------------------------------------------------------------
 * 실제 변경 경로를 끝까지 돌리되 결과적으로 계정 상태는 그대로 둔다:
 *   1) 예산 무변경 저장(10,000→10,000) — applyBidChange 완료+검토모달까지 실제 수행
 *   2) OFF 토글 → 즉시 ON 복구 — toggleCampaign 양방향
 *   3) 상품 검색·선택 dryRun — registerItem(dryRun) (검색+첫 결과 선택, 생성/완료 안 함)
 * 삭제(deleteCampaign)와 실제 캠페인 생성은 하지 않는다.
 */
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureWingSession, collectMetrics, applyBidChange, toggleCampaign, registerItem, WING } from './runtime/ad-automation.mjs';

const TARGET = '새 캠페인';        // 점검 대상(유일 캠페인)
const SEARCH = '크림';            // dryRun 상품 검색어(카탈로그에 다수 존재)
const log = (...a) => console.log('[live]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitRow(win) {
  for (let i = 0; i < 40; i++) {
    const ok = await win.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(WING.table.row)})`).catch(() => false);
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 900, show: true,
    title: '광고 안전 끝까지 테스트 (무변경 — 삭제/생성 없음)',
    webPreferences: { partition: 'persist:wing' },
  });

  const out = [];
  const rec = (name, res) => {
    const ok = !!res && res.ok !== false && !res.error;
    const extra = res && (res.error || res.detail) ? ' — ' + (res.error || res.detail) : '';
    const line = `${ok ? '✅ PASS' : '❌ FAIL'} | ${name}${extra}`;
    log(line); out.push(line);
  };

  log('윙 로그인 확인 중… (이미 로그인돼 있으면 바로 진행)');
  let loggedIn = false;
  try { loggedIn = await ensureWingSession(win, { timeoutMs: 600000 }); }
  catch (e) { log('login err', e.message); }
  if (!loggedIn) { log('로그인 필요 — 창에서 로그인 후 다시 실행'); return; }

  // 0) 현재 상태
  let rows = [];
  try { rows = await collectMetrics(win); } catch { /* ignore */ }
  log('현재 캠페인:', rows.map((r) => `${r.campaignName}(ON=${r.on})`).join(', ') || '(없음)');
  out.push('대상: ' + TARGET + ' / 현재 ' + (rows.find((r) => r.campaignName === TARGET)?.on ? 'ON' : '상태미상'));

  // 1) 예산 무변경 저장 — 완료+검토모달까지 실제 수행 (값 동일이라 실질 변화 없음)
  try { rec('예산 무변경 저장(applyBidChange 완료까지)', await applyBidChange(win, { campaignId: TARGET, newBid: 10000 })); }
  catch (e) { rec('예산 무변경 저장', { error: e.message }); }

  // 2) OFF 토글 → 즉시 ON 복구
  await win.loadURL(WING.adsUrl).catch(() => {});
  await waitRow(win);
  try { rec('OFF 토글(toggleCampaign off)', await toggleCampaign(win, { campaignId: TARGET, on: false })); }
  catch (e) { rec('OFF 토글', { error: e.message }); }
  await sleep(2500);
  try { rec('ON 복구 토글(toggleCampaign on)', await toggleCampaign(win, { campaignId: TARGET, on: true })); }
  catch (e) { rec('ON 복구 토글', { error: e.message }); }

  // 3) 상품 검색·선택 dryRun — 생성/완료 안 함 (availableRow 셀렉터 실증)
  try {
    const r = await registerItem(win, { productName: SEARCH, dailyBudget: 5000, dryRun: true });
    rec('상품 검색·선택 dryRun(생성 안 함)', r.ok ? { ok: true, detail: `'${SEARCH}' 검색 후 선택수=${r.selected}` } : { error: r.error });
  } catch (e) { rec('상품 검색·선택 dryRun', { error: e.message }); }

  const okN = out.filter((l) => l.startsWith('✅')).length;
  const passable = out.filter((l) => l.startsWith('✅') || l.startsWith('❌')).length;
  const sum = `=== 안전 실행 테스트 ${okN}/${passable} 통과 ===`;
  log(sum); out.push(sum);
  try {
    const fp = join(app.getPath('userData'), 'ads-live-result.txt');
    await writeFile(fp, out.join('\n') + '\n', 'utf8');
    log('결과 저장:', fp);
  } catch { /* ignore */ }
  // 안전: 마지막에 광고화면으로 복귀(생성폼 잔여 상태 폐기)
  await win.loadURL(WING.adsUrl).catch(() => {});
  log('테스트 종료. 창은 열어둡니다(닫으면 종료).');
});

app.on('window-all-closed', () => app.quit());
