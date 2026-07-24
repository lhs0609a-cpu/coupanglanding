// 셸 렌더러 — 모듈 목록으로 탭 생성, 클릭 시 해당 모듈 패널(panel.html + panel.js) 동적 로드.
// 새 모듈은 main/modules + renderer/modules 에 추가하면 자동으로 탭이 생긴다.
// ⚠️ contextBridge 가 노출한 전역 `api` 를 "그대로" 사용한다.
//    `const api = window.api` 로 재선언하면 비구성(non-configurable) 전역과 충돌해
//    "Identifier 'api' has already been declared" SyntaxError → shell.js 전체가 안 돈다(탭/연결 멈춤).
//    절대 재선언 금지.
if (typeof api === 'undefined' || !api || !api.manifest) {
  document.getElementById('panel').innerHTML =
    '<div style="padding:24px;color:#ef4444;font-size:13px;line-height:1.6">앱 내부 연결(preload)이 로드되지 않았습니다.<br>앱을 완전히 종료(트레이 우클릭→종료) 후 다시 실행하거나, 최신 버전으로 재설치해 주세요.</div>';
  throw new Error('window.api(preload) 미로드');
}
const manifest = api.manifest;

const $tabs = document.getElementById('tabs');
const $panel = document.getElementById('panel');
const $conn = document.getElementById('conn');
const $ver = document.getElementById('ver');
const $pair = document.getElementById('btn-pair');
const $account = document.getElementById('account');
const $connErr = document.getElementById('conn-error');
const $logout = document.getElementById('btn-logout');

const loaded = {};      // id -> { root, mod }
let activeId = null;

function makeTab(m) {
  const li = document.createElement('li');
  li.className = 'tab';
  li.dataset.id = m.id;
  li.innerHTML = `<span class="tab-icon">${m.icon}</span><span>${m.label}</span>`;
  li.onclick = () => selectTab(m.id);
  return li;
}

async function selectTab(id) {
  if (activeId === id) return;
  activeId = id;
  [...$tabs.children].forEach((li) => li.classList.toggle('active', li.dataset.id === id));

  // 패널 컨테이너 (모듈별 1개 생성·캐시)
  for (const el of $panel.children) el.style.display = 'none';
  if (!loaded[id]) {
    const root = document.createElement('section');
    root.className = 'module-root';
    $panel.appendChild(root);
    try {
      // file:// 에서 fetch/import 는 막히므로 IPC 로 자산을 읽어 주입 + 실행.
      root.innerHTML = await api.invoke('shell:asset', { id, file: 'panel.html' });
      const js = await api.invoke('shell:asset', { id, file: 'panel.js' });
      // panel.js 는 root, api 를 인자로 받는 스크립트 본문(모듈 문법 아님).
      new Function('root', 'api', js)(root, api);
      loaded[id] = { root };
    } catch (e) {
      root.innerHTML = `<div class="err">모듈 로드 실패: ${e.message}</div>`;
      loaded[id] = { root };
    }
  }
  loaded[id].root.style.display = 'block';
}

async function refreshConn() {
  try {
    const s = await api.invoke('shell:state');
    // 연결의 진짜 근거는 로그인(세션) 여부. paired 는 이번 세션에 페어 POST 가 왔었는지라
    // 로그아웃 후 stale 일 수 있어 loggedIn 을 우선한다.
    const ok = s.loggedIn;
    $conn.textContent = ok ? '✅ 메가로드 연결됨' : '⚪ 미연결';
    $conn.className = 'conn ' + (ok ? 'on' : 'off');
    $pair.style.display = ok ? 'none' : 'block';
    $pair.textContent = '메가로드 연결';
    // 어느 계정으로 연결됐는지 표시(이메일). 로그아웃 버튼은 연결됐을 때만.
    if ($account) {
      const email = ok && s.account ? s.account.email : null;
      if (email) { $account.textContent = `👤 ${email}`; $account.style.display = 'block'; }
      else if (ok) { $account.textContent = '👤 연결된 계정'; $account.style.display = 'block'; }
      else { $account.style.display = 'none'; }
    }
    if ($logout) $logout.style.display = ok ? 'block' : 'none';
    // 세션이 서버에서 끊긴 경우(만료·폐기) 이유를 그대로 보여준다.
    // 예전엔 하트비트가 조용히 죽어도 "연결됨"이 유지돼, 웹에선 올인원 폴더 선택이
    // 막혔는데 앱만 보면 멀쩡해 보였다 — 그 무음 구간을 없애는 표시다.
    if ($connErr) {
      if (!ok && s.sessionError) { $connErr.textContent = `⚠ ${s.sessionError}`; $connErr.style.display = 'block'; }
      else $connErr.style.display = 'none';
    }
    if ($ver && s.appVersion) $ver.textContent = `v${s.appVersion}`;
  } catch { /* skip */ }
}

$pair.onclick = async () => {
  $pair.textContent = '브라우저 여는 중…';
  try { await api.invoke('shell:pair-open'); } catch (e) { $pair.textContent = '연결 실패: ' + e.message; }
};

if ($logout) $logout.onclick = async () => {
  const who = $account?.textContent?.replace(/^👤\s*/, '') || '현재 계정';
  if (!confirm(`${who} 에서 로그아웃할까요?\n\n로그아웃 후 "메가로드 연결"을 눌러 다른 계정으로 연결할 수 있습니다.`)) return;
  $logout.disabled = true; const t = $logout.textContent; $logout.textContent = '로그아웃 중…';
  try { await api.invoke('shell:logout'); } catch (e) { alert('로그아웃 실패: ' + e.message); }
  $logout.disabled = false; $logout.textContent = t;
  await refreshConn();
};
document.getElementById('btn-data').onclick = () => api.invoke('shell:open-data');
const $log = document.getElementById('btn-log');
if ($log) $log.onclick = () => api.invoke('shell:open-update-log');
const $upd = document.getElementById('btn-update');
if ($upd) $upd.onclick = async () => {
  $upd.disabled = true; const t = $upd.textContent; $upd.textContent = '확인 중…';
  try { await api.invoke('shell:check-update'); } catch { /* ignore */ }
  setTimeout(() => { $upd.disabled = false; $upd.textContent = t; }, 2500);
};
api.on('shell:pair-done', refreshConn);

// 탭 생성 + 첫 탭 활성화
manifest.modules.forEach((m) => $tabs.appendChild(makeTab(m)));
if (manifest.modules[0]) selectTab(manifest.modules[0].id);
refreshConn();
setInterval(refreshConn, 10_000);

// 자가진단 보고 — healthcheck 가 이 결과(탭 수/api)를 읽어 "UI 실제 렌더"를 검증한다.
setTimeout(() => {
  try {
    api.invoke('shell:selftest', {
      hasApi: true,
      tabs: $tabs.querySelectorAll('.tab').length,
      conn: $conn ? $conn.textContent : '',
      ver: $ver ? $ver.textContent : '',
    });
  } catch { /* ignore */ }
}, 2500);
