/** 상세 추출기 실측 — 옵션·상세본문·고시정보·리뷰사진이 실제로 몇 개 나오는지. */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
const say = (s) => { try { appendFileSync(process.env.DX_OUT, s + '\n'); } catch {} };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { NAVER_PARTITION } = await import('../main/naver-session.mjs');
  const { extractDetailJs } = await import('../main/modules/naver-ingest/detail-extract.mjs');
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: NAVER_PARTITION } });
  await w.loadURL(URL_ARG, { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 3000));
  // 리뷰 위젯은 스크롤해야 뜬다 — 머천트번호를 그 호출에서 줍기 때문에 실제 추출도 이래야 한다.
  // ★ 스크롤하지 않는다 — 실전 경로(runOne)와 같은 조건에서 재야 의미가 있다.

  const d = await w.webContents.executeJavaScript(extractDetailJs, true).catch((e) => ({ error: String(e) }));
  if (d.error) { say('❌ ' + d.error); return app.exit(1); }
  say('상품명     : ' + String(d.title || '').slice(0, 50));
  say('가격       : ' + d.price);
  say('브랜드     : ' + (d.brand || '-'));
  say('카테고리   : ' + (d.categoryPath || '-'));
  say('채널/원상품: ' + d.channelId + ' / ' + d.originProductNo);
  say('');
  say('옵션       : ' + (d.options || []).length + '개   ' + JSON.stringify((d.options || []).slice(0, 2)));
  say('상세 본문  : ' + (d.detailText || '').length + '자');
  say('상세 이미지: ' + (d.detailImages || []).length + '장');
  say('대표 이미지: ' + (d.mainImages || []).length + '장');
  say('리뷰 사진  : ' + (d.reviewImages || []).length + '장  ' + ((d.reviewImages || [])[0] || ''));
  say('고시정보   : ' + (d.notice ? (d.notice.productInfoProvidedNoticeType || 'O') : '없음'));
  app.exit(0);
});
