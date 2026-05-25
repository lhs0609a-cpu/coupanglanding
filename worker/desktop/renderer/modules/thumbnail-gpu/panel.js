// 썸네일 GPU 패널 — 셸이 new Function('root','api', this) 로 실행. root, api 가 주입됨.
const $ = (id) => root.querySelector('#' + id);
const logEl = $('tg-log');
const logLine = (m) => { logEl.textContent += `${new Date().toLocaleTimeString()}  ${m}\n`; logEl.scrollTop = logEl.scrollHeight; };
const setBadge = (running) => { const b = $('tg-badge'); b.textContent = running ? '실행 중' : '대기 중'; b.className = 'badge ' + (running ? 'on' : 'off'); };

async function refresh() {
  const s = await api.invoke('thumbnail-gpu:state');
  $('tg-install-status').textContent = s.installed ? '✅ 설치됨' : '미설치';
  $('tg-btn-start').disabled = !(s.installed && s.loggedIn) || s.running;
  $('tg-btn-stop').disabled = !s.running;
  $('tg-auto-hint').textContent = (s.installed && s.loggedIn && !s.running) ? '— 자동 시작 가능' : '';
  setBadge(s.running);
  $('tg-st-processed').textContent = s.stats.processed;
  $('tg-st-ok').textContent = s.stats.ok;
  $('tg-st-fail').textContent = s.stats.fail;
}

$('tg-btn-gpu').onclick = async () => {
  $('tg-gpu-result').textContent = '점검 중...';
  const r = await api.invoke('thumbnail-gpu:gpu-check');
  $('tg-gpu-result').textContent = r.ok ? `✅ ${r.name}` : '❌ NVIDIA GPU/드라이버 미감지 (CPU는 매우 느림)';
};
$('tg-btn-install').onclick = async () => {
  $('tg-btn-install').disabled = true;
  $('tg-install-progress').classList.remove('hidden');
  try { await api.invoke('thumbnail-gpu:install'); $('tg-install-detail').textContent = '✅ 설치 완료'; await refresh(); }
  catch (e) { $('tg-install-detail').textContent = '❌ ' + e.message; }
  finally { $('tg-btn-install').disabled = false; }
};
$('tg-btn-start').onclick = async () => {
  try { await api.invoke('thumbnail-gpu:start'); logLine('워커 시작'); await refresh(); }
  catch (e) { logLine('시작 실패: ' + e.message); }
};
$('tg-btn-stop').onclick = async () => { await api.invoke('thumbnail-gpu:stop'); logLine('워커 정지'); await refresh(); };

api.on('thumbnail-gpu:install-progress', (p) => {
  const bar = $(`tg-p-${p.phase}`);
  if (bar) bar.style.width = (p.pct ?? 0) + '%';
  if (p.detail) $('tg-install-detail').textContent = `${p.detail} (${p.pct ?? 0}%)`;
});
api.on('thumbnail-gpu:auto-started', async (ok) => { if (ok) { logLine('🚀 자동 시작됨'); await refresh(); } });
api.on('thumbnail-gpu:comfy-log', (m) => logLine('[ComfyUI] ' + m));
api.on('thumbnail-gpu:worker-event', (e) => {
  switch (e.type) {
    case 'idle': logLine('대기 중 — pending 잡 없음'); break;
    case 'claimed': $('tg-current').textContent = `작업 중: ${e.label}`; logLine(`▶ ${e.label}`); break;
    case 'done': $('tg-st-ok').textContent = e.ok; $('tg-st-processed').textContent = e.processed; $('tg-current').textContent = ''; logLine(`✅ ${e.label} (${e.sizeKb}KB)`); break;
    case 'error': $('tg-st-fail').textContent = e.fail; $('tg-st-processed').textContent = e.processed; logLine(`❌ ${e.label} — ${e.message}`); break;
    case 'warn': logLine('⚠ ' + e.message); break;
    case 'finished': setBadge(false); logLine(`종료: 처리 ${e.processed} · 성공 ${e.ok} · 실패 ${e.fail}`); break;
  }
});

refresh();
setInterval(refresh, 5000);
