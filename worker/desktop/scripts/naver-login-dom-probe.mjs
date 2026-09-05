/**
 * 네이버 로그인 화면의 실제 DOM 을 찍어 온다 — 자동 로그인 'submit-not-found' 의 원인 규명용.
 * 선택자를 추측해서 고치면 다음에 또 깨진다. 실제로 뭐가 있는지 보고 고른다.
 */
import { app, BrowserWindow } from 'electron';
import { appendFileSync } from 'node:fs';
const say = (s) => { try { appendFileSync(process.env.DOM_OUT, s + '\n'); } catch {} };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DUMP = `
(() => {
  const out = { url: location.href, title: document.title, inputs: [], buttons: [], forms: [] };
  const desc = (e) => ({
    tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '',
    name: e.name || '', cls: (e.className || '').toString().slice(0, 60),
    text: (e.innerText || e.value || '').trim().slice(0, 20),
    visible: !!(e.offsetWidth || e.offsetHeight),
  });
  document.querySelectorAll('input').forEach((e) => out.inputs.push(desc(e)));
  document.querySelectorAll('button, [role=button], input[type=submit], a.btn_login').forEach((e) => out.buttons.push(desc(e)));
  document.querySelectorAll('form').forEach((f) => out.forms.push({ id: f.id, action: f.action, method: f.method }));
  return out;
})()`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'persist:domprobe' } });
  await w.loadURL('https://nid.naver.com/nidlogin.login', { userAgent: UA }).catch((e) => say('load err ' + e));
  await new Promise((r) => setTimeout(r, 2500));
  const d = await w.webContents.executeJavaScript(DUMP, true).catch((e) => ({ error: String(e) }));
  say('URL   : ' + d.url);
  say('TITLE : ' + d.title);
  say('FORMS : ' + JSON.stringify(d.forms));
  say('\n--- INPUT ---');
  for (const i of d.inputs || []) say(`  ${i.type.padEnd(9)} id=${(i.id||'-').padEnd(14)} name=${(i.name||'-').padEnd(12)} vis=${i.visible} cls=${i.cls}`);
  say('\n--- BUTTON ---');
  for (const b of d.buttons || []) say(`  ${b.tag}/${b.type.padEnd(7)} id=${(b.id||'-').padEnd(14)} vis=${b.visible} text="${b.text}" cls=${b.cls}`);
  app.exit(0);
});
