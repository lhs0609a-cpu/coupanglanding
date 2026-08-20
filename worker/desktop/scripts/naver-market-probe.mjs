/**
 * 네이버 마켓·쇼핑윈도 상품 페이지 탐침.
 *
 * 왜 필요한가(실측 2026-08-20): 상세 추출은 스마트스토어·브랜드스토어에서만 성공한다.
 *   smartstore.naver.com/main/...            done 5 · failed 0
 *   shopping.naver.com/market/...            0/3 (1건은 7분 넘게 매달린 끝에 실패)
 *   shopping.naver.com/window-products/...   0/3
 * 추출기가 채널ID 를 '/n/v2/channels/' · '/i/v2/channels/' 두 접두사로만 찾기 때문이다.
 * 마켓·윈도가 **어떤 주소로 무엇을 부르는지 실물을 보기 전에는** 지원을 추가할 수 없다.
 * 추측으로 접두사를 늘리면 조용히 틀린 값을 집는다(과거 '/n/' 단독 가정이 그랬다).
 *
 * 쓰는 법 (도우미 소스 폴더에서, 네이버 로그인 세션을 그대로 쓴다):
 *   set PP_OUT=%TEMP%\market-probe.txt
 *   npx electron scripts/naver-market-probe.mjs "https://shopping.naver.com/market/gsthefresh/products/8930600653"
 *   type %TEMP%\market-probe.txt
 *
 * 뽑는 것: 최종 URL(리다이렉트 여부) · 페이지가 실제로 부른 API 주소 · 상태 객체의 후보 키.
 * 이 결과가 나오면 store-type.mjs 와 detail-extract.mjs 의 MARKERS 를 **근거를 갖고** 넓힌다.
 */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';

const say = (s) => { try { appendFileSync(process.env.PP_OUT, s + '\n'); } catch { console.log(s); } };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  if (!URL_ARG) { say('상품 URL 을 인자로 주세요.'); return app.exit(1); }
  const { NAVER_PARTITION } = await import('../main/naver-session.mjs');

  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: NAVER_PARTITION } });

  // 페이지가 부른 주소를 전부 받아 둔다 — performance 버퍼는 250개에서 넘치면 오래된 것부터
  // 조용히 버리므로(실측), 정작 필요한 API 호출이 사라진 채 "없다"는 결론이 나올 수 있다.
  const seen = [];
  w.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*.naver.com/*'] }, (d, cb) => {
    if (/\/v\d\/|api|graphql|channels|products/.test(d.url)) seen.push(d.url);
    cb({});
  });

  await w.loadURL(URL_ARG, { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 6000));

  say('요청 URL : ' + URL_ARG);
  say('최종 URL : ' + w.webContents.getURL());
  say('제목     : ' + w.webContents.getTitle());

  const info = await w.webContents.executeJavaScript(`(() => {
    const out = { stateKeys: [], channelHints: [], hasPreloaded: false };
    try {
      const st = window.__PRELOADED_STATE__ || window.__NEXT_DATA__ || null;
      out.hasPreloaded = !!st;
      if (st) {
        const j = JSON.stringify(st);
        out.len = j.length;
        for (const key of ['channelUid','channelNo','originProductNo','productNo','merchantNo','storeId','channelId']) {
          const i = j.indexOf('"' + key + '"');
          if (i >= 0) out.channelHints.push(key + '=' + j.slice(i, i + 60));
        }
        out.stateKeys = Object.keys(st).slice(0, 20);
      }
    } catch (e) { out.error = String(e); }
    return out;
  })()`, true).catch((e) => ({ error: String(e) }));

  say('상태객체 : ' + (info.hasPreloaded ? `있음(${info.len ?? '?'}자) 키=${(info.stateKeys || []).join(',')}` : '없음'));
  for (const h of info.channelHints || []) say('  힌트   : ' + h);
  if (info.error) say('  오류   : ' + info.error);

  say('\n── 페이지가 부른 주소(중복 제거, 앞 40개) ──');
  for (const u of [...new Set(seen)].slice(0, 40)) say('  ' + u);

  say('\n판단 재료: 위 주소에 /v2/channels/ 형태가 있으면 그 접두사를 MARKERS 에 추가하면 되고,');
  say('           전혀 다른 API 라면 마켓·윈도 전용 추출 경로가 따로 필요하다는 뜻이다.');
  app.exit(0);
});
