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
  //
  // ⚠️ nv.loggedIn 을 그대로 믿으면 안 된다 — "로그인 버튼이 안 눌린다"의 정체였다(2026-09-05).
  //    크롬이 안 떠 있으면 main 은 쿠키를 못 읽어 **마지막으로 확인한 값**을 stale 로 돌려준다.
  //    그런데 셀러 PC 에서는 크롬이 뜰 일이 사실상 없다(keep-alive 는 일부러 안 깨우고, 큐 워커는
  //    요청이 걸렸을 때만 띄운다). 그래서 한 번 로그인한 뒤 네이버 세션이 만료되면 캐시는 영원히
  //    "로그인됨"에 멈추고, 화면은 ✅ 를 띄운 채 로그인 버튼을 잠가 버렸다 — 셀러에게는 다시
  //    로그인할 문이 아예 없었다. 관리자만 멀쩡했던 건 권한 때문이 아니라, 관리자 도우미는
  //    크롬이 늘 떠 있어 이 값이 실측이었기 때문이다.
  const nv = s.naverLogin || {};
  const confirmed = !!nv.loggedIn && !nv.stale;   // 지금 쿠키를 실제로 보고 확인한 것만
  // 로그인한 적은 있는데 그 확인이 너무 오래됐다 = **모름**. 한 번도 로그인 안 한 사람과는 다르다.
  const unknown = !!nv.aged && !!(nv.lastKnown && nv.lastKnown.loggedIn);
  $('sm-naver').textContent = nv.waiting ? '창에서 로그인해 주세요…'
    : unknown ? '❔ 로그인 상태를 확인하지 못했습니다 — 필요하면 다시 로그인해 주세요'
    : !nv.loggedIn ? '⚠️ 로그인 안 됨 — 스마트스토어 건너뜀'
    : nv.stale ? '✅ 마지막 확인: 로그인됨 (브라우저가 꺼져 있어 지금은 미확인)'
    : nv.persistent ? '✅ 로그인됨 (앱을 껐다 켜도, 재부팅해도 유지)'
    : '✅ 로그인됨 — 유지 처리 중…';
  // ★ 이 버튼은 **어떤 경우에도 잠그지 않는다.**
  //   ① 잠그면 위의 stale 캐시에 걸린 사람이 다시 로그인할 방법이 없다.
  //   ② waiting 일 때 잠그면 main 의 "멈춘 대기 털어내기"(naver-session.openLoginWindow)를
  //      부를 창구가 사라진다 — 크롬 창을 닫아 버린 사람은 10분 동안 죽은 버튼만 봤다.
  //      그 복구 코드는 이미 있었는데, 누를 수가 없어서 한 번도 못 썼다.
  $('sm-naver-login').disabled = false;
  $('sm-naver-login').textContent = nv.waiting ? '로그인 창 다시 띄우기'
    : confirmed ? '다시 로그인' : '네이버 로그인';
  // 위쪽 빨간 버튼도 같은 원칙 — 누르면 항상 무언가 일어나고, 그 결과가 로그에 남는다.
  const needBtn = $('sm-need-login-btn');
  if (needBtn) {
    needBtn.disabled = false;
    needBtn.textContent = nv.waiting ? '로그인 창 다시 띄우기' : '지금 네이버 로그인';
  }
  $('sm-naver-logout').disabled = !nv.loggedIn;
  // 자동 로그인 — 계정이 저장돼 있으면 세션이 끊겨도 알아서 다시 로그인한다.
  const cd = s.naverCredential || {};
  $('sm-cred').textContent = !cd.encryption ? '⛔ 이 PC 는 OS 암호저장소를 못 써 저장 불가'
    : cd.has ? `✅ ${cd.idMasked} 저장됨 — 자동 로그인 켜짐`
    : '⚪ 계정 미저장 — 로그인이 풀리면 직접 다시 해야 합니다';
  $('sm-cred-save').disabled = !cd.encryption;
  $('sm-cred-clear').disabled = !cd.has;
  // 맨 위 경고 — **로그인이 확인되지 않는 동안에는 계속 띄운다.**
  //   예전엔 waiting 이면 감췄다(중복 안내를 피하려고). 그런데 크롬 창을 닫아 버린 사람에게는
  //   그게 곧 "돌아갈 문이 사라진 화면"이었다 — 배너도 없고 아래 버튼도 잠겨 있었다.
  //   이제 대기 중에는 문구만 바꾸고 배너와 버튼은 그대로 둔다.
  //   단, 마지막 확인이 로그인이고 아직 오래되지 않았으면 띄우지 않는다 — 멀쩡한 사람에게
  //   빨간 배너를 상시 띄우는 건 방향만 반대인 또 다른 거짓말이다.
  $('sm-need-login').style.display = nv.loggedIn ? 'none' : '';
  const needTitle = $('sm-need-login-title');
  if (needTitle) {
    needTitle.textContent = unknown
      ? '네이버 로그인 상태를 확인하지 못했습니다'
      : '네이버 로그인이 필요합니다';
  }
  const needMsg = $('sm-need-login-msg');
  if (needMsg) {
    needMsg.textContent = nv.waiting
      ? '로그인 창에서 진행해 주세요. 창이 안 보이면 아래 버튼을 다시 눌러 띄울 수 있습니다.'
      : unknown
        ? '마지막 확인이 오래돼 지금 로그인이 살아 있는지 알 수 없습니다. 스마트스토어 품절 확인이 안 되면 다시 로그인해 주세요.'
        : '스마트스토어 상품은 네이버에 로그인해야 품절 확인이 됩니다.';
  }
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
/**
 * 네이버 로그인 요청 — 위 배너 버튼과 2번 섹션 버튼이 **같은 일**을 한다.
 * ---------------------------------------------------------------------------
 * ★ 누른 결과는 반드시 로그 한 줄로 남는다. 성공 경로의 안내(이미 로그인됨 / 창이 이미 떠
 *   있음 / 멈춘 대기를 털고 다시 시작 / 창을 엽니다)는 main 이 stock-monitor:log 로 보내므로
 *   여기서 또 찍지 않는다 — 예전엔 양쪽이 각자 찍어 같은 말이 두 줄로 나왔다.
 * ★ 버튼을 잠그는 건 **이 호출이 오가는 순간뿐**이다. 상태(waiting/loggedIn)로는 절대 잠그지
 *   않는다 — 그게 "버튼이 안 눌린다"의 원인이었다.
 */
async function requestNaverLogin(btn) {
  const prev = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '창을 여는 중…'; }
  try {
    await api.invoke('stock-monitor:naver-login');
  } catch (e) {
    logLine('로그인 창을 열지 못했습니다: ' + (e && e.message ? e.message : e));
  } finally {
    // refresh() 가 곧 라벨을 상태에 맞게 다시 잡지만, 그게 실패하더라도 버튼이 잠긴 채
    // 남지 않도록 여기서 먼저 되돌린다.
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
  await refresh();
}
$('sm-naver-login').onclick = () => requestNaverLogin($('sm-naver-login'));
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
$('sm-need-login-btn').onclick = () => requestNaverLogin($('sm-need-login-btn'));
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
