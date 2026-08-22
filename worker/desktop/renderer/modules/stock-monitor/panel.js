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
  // 네이버 로그인 — 스마트스토어 확인의 전제 조건이라 상태를 늘 보여준다.
  const nv = s.naverLogin || {};
  $('sm-naver').textContent = nv.waiting ? '창에서 로그인해 주세요…'
    : !nv.loggedIn ? '⚠️ 로그인 안 됨 — 스마트스토어 건너뜀'
    : nv.persistent ? '✅ 로그인됨 (앱을 껐다 켜도, 재부팅해도 유지)'
    : '✅ 로그인됨 — 유지 처리 중…';
  $('sm-naver-login').disabled = !!nv.waiting || !!nv.loggedIn;
  $('sm-naver-logout').disabled = !nv.loggedIn;
  // 자동 로그인 — 계정이 저장돼 있으면 세션이 끊겨도 알아서 다시 로그인한다.
  const cd = s.naverCredential || {};
  $('sm-cred').textContent = !cd.encryption ? '⛔ 이 PC 는 OS 암호저장소를 못 써 저장 불가'
    : cd.has ? `✅ ${cd.idMasked} 저장됨 — 자동 로그인 켜짐`
    : '⚪ 계정 미저장 — 로그인이 풀리면 직접 다시 해야 합니다';
  $('sm-cred-save').disabled = !cd.encryption;
  $('sm-cred-clear').disabled = !cd.has;
  // 맨 위 경고 — 로그인이 없을 때만. 창에서 로그인 중이면 감춘다(중복 안내가 더 헷갈린다).
  $('sm-need-login').style.display = (!nv.loggedIn && !nv.waiting) ? '' : 'none';
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
$('sm-naver-login').onclick = async () => { await api.invoke('stock-monitor:naver-login'); await refresh(); };
$('sm-naver-logout').onclick = async () => { await api.invoke('stock-monitor:naver-logout'); await refresh(); };
$('sm-cred-save').onclick = async () => {
  const id = $('sm-nid').value.trim();
  const pw = $('sm-npw').value;
  if (!id || !pw) { logLine('아이디와 비밀번호를 모두 입력하세요.'); return; }
  $('sm-npw').value = '';            // 화면에 남겨 두지 않는다
  $('sm-cred-save').disabled = true;
  try {
    const r = await api.invoke('stock-monitor:naver-cred-save', { id, pw });
    if (r && r.ok === false) logLine('자동 로그인 실패: ' + (r.reason || '사유미상'));
  } catch (e) {
    logLine('계정 저장 실패: ' + (e && e.message ? e.message : e));
  }
  await refresh();
};
$('sm-need-login-btn').onclick = async () => { await api.invoke('stock-monitor:naver-login'); await refresh(); };
$('sm-cred-clear').onclick = async () => {
  await api.invoke('stock-monitor:naver-cred-clear');
  logLine('저장된 네이버 계정을 지웠습니다.');
  await refresh();
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
