/**
 * 리뷰 API 실측 — 리뷰 이미지를 어디서 가져오는지 **재서** 확정한다.
 * 소싱 상세추출이 리뷰컷을 못 채우고 있는데, 올인원은 리뷰컷을 본문 교차 1순위로 쓴다
 * (folder-scanner 의 review_images/). 주소를 추측해서 짜면 조용히 0장이 되므로 먼저 잰다.
 *
 * 실행: npx --yes electron@33 scripts/naver-review-probe.mjs <상품URL>
 */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
const say = (s) => { try { appendFileSync(process.env.RV_OUT, s + '\n'); } catch {} };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

// 페이지가 실제로 부른 주소 중 리뷰 관련만 추린다 + 채널/상품번호도 같이 얻는다.
const DUMP = `
(() => {
  const out = { url: location.href, reviewUrls: [], channelId: null, originProductNo: null };
  const marker = '/n/v2/channels/';
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    if (u.toLowerCase().indexOf('review') >= 0) out.reviewUrls.push(u.slice(0, 200));
    const i = u.indexOf(marker);
    if (i >= 0 && !out.channelId) out.channelId = u.slice(i + marker.length).split('/')[0].split('?')[0];
  }
  try {
    const s = window.__PRELOADED_STATE__;
    if (s) {
      const j = JSON.stringify(s);
      const k = j.indexOf('"originProductNo"');
      if (k >= 0) out.originProductNo = j.slice(k + 19, k + 40).split(',')[0].split('}')[0].split('"').join('');
    }
  } catch (e) { out.stateErr = String(e && e.message); }
  return out;
})()`;

const SCROLL = `(async () => {
  for (let i = 0; i < 12; i++) {
    window.scrollBy(0, window.innerHeight);
    await new Promise(r => setTimeout(r, 600));
  }
  return document.body.scrollHeight;
})()`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { NAVER_PARTITION } = await import('../main/naver-session.mjs');
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: NAVER_PARTITION } });
  await w.loadURL(URL_ARG, { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 3000));
  say('스크롤로 리뷰 위젯을 띄웁니다…');
  await w.webContents.executeJavaScript(SCROLL, true).catch((e) => say('scroll err ' + e));
  await new Promise((r) => setTimeout(r, 2500));

  const d = await w.webContents.executeJavaScript(DUMP, true).catch((e) => ({ error: String(e) }));
  say('URL            : ' + d.url);
  say('channelId      : ' + d.channelId);
  say('originProductNo: ' + d.originProductNo);
  say('\n--- 리뷰 관련 호출 ---');
  const seen = new Set();
  for (const u of (d.reviewUrls || [])) {
    const key = u.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    say('  ' + u);
  }
  if (!d.reviewUrls?.length) say('  (없음 — 위젯이 안 떴거나 다른 이름을 씁니다)');
  app.exit(0);
});
