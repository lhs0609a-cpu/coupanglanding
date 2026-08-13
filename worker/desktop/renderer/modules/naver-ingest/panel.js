// 네이버 소싱 패널 — 셸이 new Function('root','api', this) 로 실행. root, api 주입됨.
const $ = (id) => root.querySelector('#' + id);
const logEl = $('ni-log');
const logLine = (m) => {
  logEl.textContent += `${new Date().toLocaleTimeString()}  ${m}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};
const setBadge = (on) => {
  const b = $('ni-badge');
  b.textContent = on ? '실행 중' : '정지';
  b.className = 'badge ' + (on ? 'on' : 'off');
};

const ROLE_LABEL = { list: '목록 수집', detail: '상세 추출' };
const STATUS_LABEL = {
  idle: '대기', warming: '준비 중', navigating: '이동 중',
  working: '작업 중', captcha: '⚠️ 캡차 대기', closed: '닫힘',
};

let applying = false;

function renderWindows(s) {
  const el = $('ni-windows-list');
  if (!s.windows || !s.windows.length) {
    el.textContent = s.running ? '창을 준비하는 중입니다…' : '창이 없습니다. "창 준비"를 누르세요.';
    return;
  }
  el.innerHTML = s.windows.map((w) => {
    const role = w.role ? ROLE_LABEL[w.role] || w.role : '대기';
    const st = STATUS_LABEL[w.status] || w.status;
    // 캡차가 뜬 창은 눌러서 바로 띄울 수 있게 한다.
    const btn = w.status === 'captcha'
      ? ` <a href="#" data-show="${w.index}" style="color:var(--brand);">창 열기</a>`
      : '';
    return `창 ${w.no} · ${role} · ${st}${w.detail ? ' · ' + w.detail : ''}${btn}`;
  }).join('<br>');
  el.querySelectorAll('[data-show]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      api.invoke('naver-ingest:show-window', { index: Number(a.dataset.show) });
    };
  });
}

function renderWindowNote(configured, effective) {
  const note = $('ni-windows-note');
  if (effective < configured) {
    note.textContent = `⚠️ 차단 신호가 있어 지금은 ${effective}개로 줄여서 돌고 있습니다. 회복되면 ${configured}개로 돌아갑니다.`;
  } else if (configured > 4) {
    note.textContent = '4개를 넘으면 처리량은 거의 안 늘고 메모리만 더 씁니다.';
  } else {
    note.textContent = '';
  }
}

async function refresh() {
  const s = await api.invoke('naver-ingest:status');

  // 관리자가 아니면 본문을 아예 감춘다(실제 차단은 서버가 한다 — 이건 표시용).
  const allowed = s.isAdmin;
  $('ni-denied').style.display = allowed ? 'none' : '';
  $('ni-body').style.display = allowed ? '' : 'none';
  if (!allowed) {
    $('ni-denied-msg').textContent = s.loggedIn
      ? `현재 연결된 계정(${s.account?.email || '알 수 없음'})은 관리자가 아닙니다.`
      : '메가로드에 먼저 연결하세요. 관리자 계정만 사용할 수 있습니다.';
    return;
  }

  if (!applying) {
    $('ni-windows').value = s.configured;
    $('ni-windows-val').textContent = `${s.configured}개`;
  }
  renderWindowNote(s.configured, s.effective);

  setBadge(s.running);
  $('ni-active').textContent = s.active;
  $('ni-level').textContent = s.gate?.level ?? 1;
  const cd = s.gate?.cooldownMsLeft || 0;
  const cdEl = $('ni-cool');
  cdEl.textContent = cd > 0 ? `${Math.ceil(cd / 1000)}초` : '-';
  cdEl.className = cd > 0 ? 'fail' : 'ok';   // style.css 의 .stats .fail = 빨강

  $('ni-start').disabled = s.running;
  $('ni-stop').disabled = !s.running;
  renderWindows(s);
}

// ── 창 개수 ──
const slider = $('ni-windows');
slider.oninput = () => {
  applying = true;
  $('ni-windows-val').textContent = `${slider.value}개`;
};
slider.onchange = async () => {
  try {
    await api.invoke('naver-ingest:set-windows', { count: Number(slider.value) });
  } catch (e) {
    logLine('설정 실패: ' + e.message);
  } finally {
    applying = false;
    await refresh();
  }
};
const preset = async (n) => {
  slider.value = n;
  $('ni-windows-val').textContent = `${n}개`;
  await slider.onchange();
};
$('ni-preset-safe').onclick = () => preset(1);
$('ni-preset-std').onclick = () => preset(3);
$('ni-preset-max').onclick = () => preset(4);

// ── 실행 ──
$('ni-start').onclick = async () => {
  $('ni-start').disabled = true;
  try { await api.invoke('naver-ingest:start'); }
  catch (e) { logLine('시작 실패: ' + e.message); }
  await refresh();
};
$('ni-stop').onclick = async () => {
  try { await api.invoke('naver-ingest:stop'); }
  catch (e) { logLine('정지 실패: ' + e.message); }
  await refresh();
};

$('ni-test').onclick = async () => {
  const url = $('ni-url').value.trim();
  if (!url) return logLine('상품 URL 을 입력하세요.');
  $('ni-test').disabled = true;
  try { await api.invoke('naver-ingest:test-one', { url }); }
  catch (e) { logLine('테스트 실패: ' + e.message); }
  finally { $('ni-test').disabled = false; await refresh(); }
};

api.on('naver-ingest:log', (m) => logLine(m));
api.on('naver-ingest:status', (s) => {
  setBadge(s.running);
  $('ni-active').textContent = s.active;
  renderWindows(s);
  renderWindowNote(s.configured, s.effective);
});

refresh();
setInterval(refresh, 3000);
