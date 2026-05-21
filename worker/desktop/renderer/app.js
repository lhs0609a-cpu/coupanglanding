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
  // settings 채우기
  $('supabaseUrl').value = s.settings.supabaseUrl || '';
  $('anonKey').value = s.settings.anonKey || '';
  $('email').value = s.settings.email || '';
  $('install-status').textContent = s.installed ? '✅ 설치됨' : '미설치';
  $('login-status').textContent = s.loggedIn ? '✅ 로그인됨' : '미로그인';
  $('btn-start').disabled = !(s.installed && s.loggedIn) || s.running;
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

// ── 로그인 ──
$('btn-login').onclick = async () => {
  $('login-msg').textContent = '로그인 중...';
  try {
    await api.invoke('auth:login', {
      supabaseUrl: $('supabaseUrl').value.trim(),
      anonKey: $('anonKey').value.trim(),
      email: $('email').value.trim(),
      password: $('password').value,
    });
    $('password').value = '';
    $('login-msg').textContent = '✅ 로그인 성공';
    await refresh();
  } catch (e) {
    $('login-msg').textContent = '❌ ' + e.message;
  }
};

// ── 워커 ──
$('btn-start').onclick = async () => {
  try { await api.invoke('worker:start'); logLine('워커 시작'); await refresh(); }
  catch (e) { logLine('시작 실패: ' + e.message); }
};
$('btn-stop').onclick = async () => { await api.invoke('worker:stop'); logLine('워커 정지'); await refresh(); };
$('btn-logs').onclick = () => api.invoke('logs:openData');

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
