/**
 * 채널ID 폴백 검증 — performance 리소스 버퍼가 비어도 추출이 되는가.
 * 버퍼 소실은 리소스가 250개를 넘으면 실제로 일어나고, 그때 추출이 통째로 실패했다.
 * clearResourceTimings() 로 그 상황을 그대로 만든 뒤 추출을 돌린다.
 */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
const say = (s) => { try { appendFileSync(process.env.CF_OUT, s + '\n'); } catch {} };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { NAVER_PARTITION } = await import('../main/naver-session.mjs');
  const { extractDetailJs } = await import('../main/modules/naver-ingest/detail-extract.mjs');
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: NAVER_PARTITION } });
  await w.loadURL(URL_ARG, { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 3000));

  for (const mode of ['정상(버퍼 있음)', '버퍼 비움(장애 재현)']) {
    if (mode.startsWith('버퍼')) {
      await w.webContents.executeJavaScript('(()=>{performance.clearResourceTimings();return performance.getEntriesByType("resource").length})()', true)
        .then((n) => say(`\n[${mode}] 리소스 엔트리 ${n}개로 비움`))
        .catch((e) => say('clear err ' + e));
    } else { say(`[${mode}]`); }
    const d = await w.webContents.executeJavaScript(extractDetailJs, true).catch((e) => ({ error: String(e) }));
    if (d.error) { say('  ❌ ' + d.error); continue; }
    say(`  ✅ ${String(d.title || '').slice(0, 30)} | 채널 ${d.channelId} | 옵션 ${(d.options || []).length} · 상세 ${(d.detailImages || []).length}장 · 리뷰 ${(d.reviewImages || []).length}장 · 고시 ${d.notice ? 'O' : 'X'}`);
  }
  app.exit(0);
});
