// 상품 모니터링 패널 — 셸이 new Function('root','api', this) 로 실행. root, api 주입됨.
const $ = (id) => root.querySelector('#' + id);
const logEl = $('sm-log');
const logLine = (m) => { logEl.textContent += `${new Date().toLocaleTimeString()}  ${m}\n`; logEl.scrollTop = logEl.scrollHeight; };
const setBadge = (on) => { const b = $('sm-badge'); b.textContent = on ? '실행 중' : '정지'; b.className = 'badge ' + (on ? 'on' : 'off'); };

async function refresh() {
  const s = await api.invoke('stock-monitor:state');
  $('sm-conn').textContent = s.hasToken ? '🔑 코드 저장됨' : '⚪ 코드 없음';
  $('sm-start').disabled = !s.hasToken || s.running;
  $('sm-stop').disabled = !s.running;
  setBadge(s.running);
  $('sm-checked').textContent = s.stats.checked;
  $('sm-last').textContent = s.stats.lastCheckAt ? `${Math.round((Date.now() - s.stats.lastCheckAt) / 1000)}초 전` : '-';
}

$('sm-web').onclick = (e) => { e.preventDefault(); api.invoke('stock-monitor:open-web'); };
$('sm-save').onclick = async () => {
  await api.invoke('stock-monitor:set-token', { token: $('sm-token').value });
  $('sm-token').value = '';
  logLine('인증코드 저장됨');
  await refresh();
};
$('sm-verify').onclick = async () => {
  $('sm-conn').textContent = '확인 중…';
  const v = await api.invoke('stock-monitor:verify');
  $('sm-conn').textContent = v.valid ? '✅ 연결됨' : '❌ ' + (v.error || '실패');
};
$('sm-start').onclick = async () => { await api.invoke('stock-monitor:start'); logLine('모니터링 시작'); await refresh(); };
$('sm-stop').onclick = async () => { await api.invoke('stock-monitor:stop'); logLine('모니터링 정지'); await refresh(); };

api.on('stock-monitor:log', (m) => logLine(m));
api.on('stock-monitor:stats', (s) => {
  setBadge(s.online);
  $('sm-checked').textContent = s.checked;
  $('sm-last').textContent = s.lastCheckAt ? `${Math.round((Date.now() - s.lastCheckAt) / 1000)}초 전` : '-';
});

refresh();
setInterval(refresh, 5000);
