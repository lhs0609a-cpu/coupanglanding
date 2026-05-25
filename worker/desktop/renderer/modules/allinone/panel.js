// 올인원 생성 패널 — 셸이 new Function('root','api', this) 로 실행. root, api 주입됨.
const $ = (id) => root.querySelector('#' + id);
const logEl = $('ai-log');
const logLine = (m) => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };
const setBadge = (t, on) => { const b = $('ai-badge'); b.textContent = t; b.className = 'badge ' + (on ? 'on' : 'off'); };
let folder = null;
let running = false;

function setRunning(on) {
  running = on;
  $('ai-run').disabled = on || !folder;
  $('ai-stop').disabled = !on;
  $('ai-pick').disabled = on;
  setBadge(on ? '생성 중' : '대기', on);
}

$('ai-pick').onclick = async () => {
  const f = await api.invoke('allinone:pick-folder');
  if (!f) return;
  folder = f;
  $('ai-folder').textContent = f;
  $('ai-run').disabled = running;
  $('ai-open').disabled = false;
};
$('ai-run').onclick = async () => {
  if (!folder) return;
  logEl.textContent = '';
  $('ai-text-bar').style.width = '0%'; $('ai-image-bar').style.width = '0%';
  $('ai-text-n').textContent = ''; $('ai-image-n').textContent = '';
  setRunning(true);
  try { await api.invoke('allinone:run', { folder, noThumb: $('ai-nothumb').checked }); }
  catch (e) { logLine('❌ ' + e.message); setRunning(false); }
};
$('ai-stop').onclick = async () => { await api.invoke('allinone:stop'); logLine('⏹ 정지 요청'); };
$('ai-open').onclick = () => api.invoke('allinone:open-folder', { folder });

api.on('allinone:log', (line) => logLine(line));
api.on('allinone:progress', (p) => {
  const bar = $(`ai-${p.phase}-bar`); const n = $(`ai-${p.phase}-n`);
  if (bar) bar.style.width = Math.round((p.done / p.total) * 100) + '%';
  if (n) n.textContent = `${p.done}/${p.total}`;
});
api.on('allinone:done', (r) => {
  setRunning(false);
  logLine(r.code === 0 ? '✅ 생성 완료 — 웹 "올인원 등록(폴더)"에서 이 폴더를 불러와 검수·등록하세요.' : `⚠️ 종료(code ${r.code})`);
});
