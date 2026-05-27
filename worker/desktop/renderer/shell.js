// 셸 렌더러 — 모듈 목록으로 탭 생성, 클릭 시 해당 모듈 패널(panel.html + panel.js) 동적 로드.
// 새 모듈은 main/modules + renderer/modules 에 추가하면 자동으로 탭이 생긴다.
const api = window.api;
// 방어: preload 가 api 를 노출 못 하면(과거 ESM preload 타이밍 버그 등) 빈 화면으로 멈추지 말고 원인 표시.
if (!api || !api.manifest) {
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
    const ok = s.loggedIn || s.paired;
    $conn.textContent = ok ? '✅ 메가로드 연결됨' : '⚪ 미연결';
    $conn.className = 'conn ' + (ok ? 'on' : 'off');
    $pair.style.display = ok ? 'none' : 'block';
    if ($ver && s.appVersion) $ver.textContent = `v${s.appVersion}`;
  } catch { /* skip */ }
}

$pair.onclick = async () => {
  $pair.textContent = '브라우저 여는 중…';
  try { await api.invoke('shell:pair-open'); } catch (e) { $pair.textContent = '연결 실패: ' + e.message; }
};
document.getElementById('btn-data').onclick = () => api.invoke('shell:open-data');
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
