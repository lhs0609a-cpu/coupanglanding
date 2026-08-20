/** 리뷰 갤러리 API 응답 구조 실측 — 이미지 URL 이 어느 필드에 있는지 확정한다. */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
const say = (s) => { try { appendFileSync(process.env.RV_OUT, s + '\n'); } catch {} };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

const CALL = `
(async () => {
  // ★ 주소를 재구성하지 않는다 — 파라미터 하나만 달라도 400 이 온다(실측: pageSize 를 20 으로
  //   바꿨더니 400). 페이지가 실제로 부른 주소를 그대로 재생한다.
  const mark = '/n/v1/contents/reviews/gallery-attaches/';
  let full = null;
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    if (u.indexOf(mark) >= 0) { full = u; break; }
  }
  if (!full) return { error: 'gallery-attaches 호출을 못 봄(스크롤 부족?)' };

  const res = await fetch(full, { credentials: 'include', headers: { accept: 'application/json' } });
  if (!res.ok) return { error: 'HTTP ' + res.status, full };
  const j = await res.json();

  const shape = (o, d) => {
    if (Array.isArray(o)) return 'array[' + o.length + ']' + (o.length ? ' of ' + JSON.stringify(shape(o[0], d - 1)).slice(0, 400) : '');
    if (o && typeof o === 'object') {
      if (d <= 0) return Object.keys(o).slice(0, 20);
      const r = {};
      for (const k of Object.keys(o).slice(0, 20)) r[k] = shape(o[k], d - 1);
      return r;
    }
    return typeof o === 'string' ? String(o).slice(0, 80) : typeof o;
  };
  const sample = (j.contents || []).slice(0, 4).map((c) => ({
    attachPath: c.representAttach && c.representAttach.attachPath,
    attachType: c.representAttach && c.representAttach.attachType,
    totalAttachCount: c.totalAttachCount,
  }));
  return { full, total: j.totalElements, sample };
})()`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { NAVER_PARTITION } = await import('../main/naver-session.mjs');
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: NAVER_PARTITION } });
  await w.loadURL(URL_ARG, { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 2500));
  await w.webContents.executeJavaScript(`(async()=>{for(let i=0;i<10;i++){window.scrollBy(0,window.innerHeight);await new Promise(r=>setTimeout(r,500));}return 1})()`, true).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  const d = await w.webContents.executeJavaScript(CALL, true).catch((e) => ({ error: String(e) }));
  say(JSON.stringify(d, null, 1).slice(0, 4000));
  app.exit(0);
});
