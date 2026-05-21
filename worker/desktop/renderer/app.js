const $ = (id) => document.getElementById(id);
const api = window.api;

function logLine(msg) {
  const el = $('log');
  el.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function setBadge(running) {
  const b = $('badge');
  b.textContent = running ? '실행 중' : '정지됨';
  b.className = 'badge ' + (running ? 'on' : 'off');
}

async function refresh() {
  const s = await api.invoke('state:get');
  $('install-status').textContent = s.installed ? '✅ 설치됨' : '미설치';
  $('pair-status').textContent = s.loggedIn ? '✅ 연결됨' : '미연결';
  $('btn-pair').disabled = s.loggedIn;
  $('btn-pair').textContent = s.loggedIn ? '✅ 메가로드 연결됨' : '메가로드 자동 연결';
  $('btn-start').disabled = !(s.installed && s.loggedIn) || s.running;
  $('btn-stop').disabled = !s.running;
  $('auto-hint').textContent = (s.installed && s.loggedIn && !s.running) ? '— 자동 시작 가능' : '';
  setBadge(s.running);
  $('st-processed').textContent = s.stats.processed;
  $('st-ok').textContent = s.stats.ok;
  $('st-fail').textContent = s.stats.fail;
}

// ── GPU 점검 ──
$('btn-gpu').onclick = async () => {
  $('gpu-result').textContent = '점검 중...';
  const r = await api.invoke('gpu:check');
  $('gpu-result').textContent = r.ok ? `✅ ${r.name}` : '❌ NVIDIA GPU/드라이버 미감지 (CPU는 매우 느림)';
};

// ── 설치 ──
$('btn-install').onclick = async () => {
  $('btn-install').disabled = true;
  $('install-progress').classList.remove('hidden');
  try {
    await api.invoke('install:start');
    $('install-detail').textContent = '✅ 설치 완료';
    await refresh();
  } catch (e) {
    $('install-detail').textContent = '❌ ' + e.message;
  } finally {
    $('btn-install').disabled = false;
  }
};
api.on('install:progress', (p) => {
  const bar = $(`p-${p.phase}`);
  if (bar) bar.style.width = (p.pct ?? 0) + '%';
  if (p.detail) $('install-detail').textContent = `${p.detail} (${p.pct ?? 0}%)`;
});

// ── 메가로드 자동 연결 ──
$('btn-pair').onclick = async () => {
  $('pair-msg').textContent = '브라우저를 여는 중... 메가로드 페이지에서 자동 처리됩니다.';
  try {
    await api.invoke('pair:open');
  } catch (e) {
    $('pair-msg').textContent = '❌ ' + e.message;
  }
};
api.on('pair:done', async () => {
  $('pair-msg').textContent = '✅ 메가로드 연결 완료';
  logLine('메가로드 자동 연결 성공');
  await refresh();
});

// ── 워커 ──
$('btn-start').onclick = async () => {
  try { await api.invoke('worker:start'); logLine('워커 시작'); await refresh(); }
  catch (e) { logLine('시작 실패: ' + e.message); }
};
$('btn-stop').onclick = async () => { await api.invoke('worker:stop'); logLine('워커 정지'); await refresh(); };
$('btn-logs').onclick = () => api.invoke('logs:openData');

api.on('auto:started', async (ok) => {
  if (ok) { logLine('🚀 자동 시작됨'); await refresh(); }
});

api.on('worker:event', (e) => {
  switch (e.type) {
    case 'idle': logLine('대기 중 — pending 잡 없음'); break;
    case 'claimed': $('current').textContent = `작업 중: ${e.label}`; logLine(`▶ ${e.label}`); break;
    case 'done': $('st-ok').textContent = e.ok; $('st-processed').textContent = e.processed; $('current').textContent = ''; logLine(`✅ ${e.label} (${e.sizeKb}KB)`); break;
    case 'error': $('st-fail').textContent = e.fail; $('st-processed').textContent = e.processed; logLine(`❌ ${e.label} — ${e.message}`); break;
    case 'warn': logLine('⚠ ' + e.message); break;
    case 'finished': setBadge(false); logLine(`종료: 처리 ${e.processed} · 성공 ${e.ok} · 실패 ${e.fail}`); break;
  }
});
api.on('comfy:log', (m) => logLine('[ComfyUI] ' + m));

refresh();
setInterval(refresh, 5000);
