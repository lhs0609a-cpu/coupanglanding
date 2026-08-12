/**
 * 테무 L2L(국내배송) 상품 식별 필드 탐침 — 일회성 검증 스크립트.
 * ---------------------------------------------------------------------------
 * 목적: "테무 상품 중 한국에서 발송되는 것만" 을 프로그램이 골라낼 수 있는지 판정한다.
 *   소싱 파이프라인 전체가 이 판정 하나에 달려 있어서, 본체를 만들기 전에 여기서 먼저 끝낸다.
 *
 * 왜 이렇게까지 하나 (실측 2026-08-11):
 *   완전한 Chrome UA 로 https://www.temu.com/kr/search_result.html 을 직접 받으면
 *   HTTP 200 · 312KB 가 오는데 goodsId / priceStr / linkUrl 이 **전부 0건**이다.
 *   상품은 JS 실행 후 XHR 로 들어온다 → 서버측 fetch 로는 영원히 못 본다.
 *   그래서 실브라우저(Electron Chromium)로 실제 렌더해야 한다.
 *
 * 왜 DOM 이 아니라 XHR 을 캡처하나:
 *   화면에 그려지는 건 필드의 일부다. 로컬 창고 여부가 배지로 안 보이고 플래그로만
 *   내려올 수 있으므로, CDP(Network.getResponseBody)로 응답 원문을 통째로 잡아 분석한다.
 *   DOM 도 같이 덤프해서 배지 텍스트("현지 물류센터")가 붙는 위치를 교차 확인한다.
 *
 * 실행:
 *   cd worker/desktop
 *   npx electron@33 scripts/temu-probe.mjs                  # 기본 검색어
 *   npx electron@33 scripts/temu-probe.mjs "무선 이어폰"     # 검색어 지정
 *   TEMU_PROBE_OUT=D:/probe npx electron@33 scripts/temu-probe.mjs
 *
 * 산출물(기본 <임시폴더>/temu-probe/):
 *   xhr-NNN__<host><path>.json   캡처된 JSON 응답 원문
 *   rendered.html                렌더 완료 시점의 DOM
 *   summary.txt                  후보 필드 자동 분석 결과  ← 먼저 이걸 본다
 *
 * ⚠️ 읽기 전용 탐침이다. 로그인·주문·장바구니 등 어떤 쓰기 동작도 하지 않는다.
 */
import { app, BrowserWindow, session } from 'electron';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const SEARCH_KEY = process.argv.slice(2).find((a) => !a.startsWith('-')) || '컵라면';
const OUT_DIR = process.env.TEMU_PROBE_OUT || join(app.getPath('temp'), 'temu-probe');
const PARTITION = 'persist:temuprobe';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HOME_URL = 'https://www.temu.com/kr';
const SEARCH_URL = `https://www.temu.com/kr/search_result.html?search_key=${encodeURIComponent(SEARCH_KEY)}`;

/** 상품이 실제로 그려졌는지 판정하는 폴링 상한 */
const RENDER_WAIT_MS = 45_000;
const POLL_MS = 1_000;
/** 상품 수가 이만큼 연속 동일하면 로딩이 끝난 것으로 본다 */
const STABLE_TICKS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 진행 로그 — 콘솔과 파일에 동시에 남긴다.
 * 파일에도 남기는 이유: 첫 실행이 중단됐을 때 stdout 이 통째로 사라져 어디까지 갔는지
 * 전혀 알 수 없었다. 중단되더라도 progress.log 는 디스크에 남아 있어야 진단이 된다.
 */
function log(...a) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`;
  console.log('[temu-probe]', line);
  try { appendFileSync(join(OUT_DIR, 'progress.log'), line + '\n', 'utf8'); } catch { /* 폴더 생성 전 */ }
}

// ─────────────────────────────────────────────────────────────
// 로컬(국내발송) 신호 후보 — 캡처된 JSON 에서 이 흔적을 찾는다.
// 한국어 배지 문구는 홈 i18n 번들에서 실제로 확인된 값이다:
//   "LocalMallRecommendPopup": { "localWarehouse": "현지 물류센터" }
// ─────────────────────────────────────────────────────────────
const VALUE_HINTS = ['현지 물류센터', '현지', '한국에서', '국내', '빠른 배송', 'local warehouse', 'ships from'];
const KEY_HINTS = [
  'local', 'warehouse', 'shipfrom', 'ship_from', 'shipping', 'delivery',
  'oversea', 'overseas', 'crossborder', 'cross_border', 'region', 'country',
  'mall', 'sellertype', 'seller_type', 'fulfill', 'logistic', 'site',
];

/** 중첩 객체를 평탄화해 (경로, 값) 쌍으로 만든다 — 어떤 필드가 로컬 여부를 담는지 찾기 위함 */
function* walk(node, path = '') {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    // 배열은 처음 3개만 — 상품 목록이 수백 개라 전수 순회하면 요약이 무의미해진다
    for (let i = 0; i < Math.min(node.length, 3); i++) yield* walk(node[i], `${path}[${i}]`);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* walk(v, path ? `${path}.${k}` : k);
    return;
  }
  yield [path, node];
}

function analyze(url, json) {
  const keyHits = [];
  const valueHits = [];
  for (const [path, value] of walk(json)) {
    const leaf = path.split('.').pop().replace(/\[\d+\]/g, '').toLowerCase();
    const sval = String(value);
    if (KEY_HINTS.some((h) => leaf.includes(h))) keyHits.push(`${path} = ${sval.slice(0, 80)}`);
    if (VALUE_HINTS.some((h) => sval.includes(h))) valueHits.push(`${path} = ${sval.slice(0, 80)}`);
  }
  return { url, keyHits, valueHits };
}

function safeName(url, idx) {
  let tail = url;
  try { const u = new URL(url); tail = u.host + u.pathname; } catch { /* 원문 사용 */ }
  return `xhr-${String(idx).padStart(3, '0')}__${tail.replace(/[^\w.-]+/g, '_')}.json`.slice(0, 150);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  log('출력 폴더:', OUT_DIR);
  log('검색어:', SEARCH_KEY);

  // 이미지/폰트/미디어 차단 — 렌더 속도만 올린다(상품 데이터는 XHR 이라 영향 없음).
  try {
    session.fromPartition(PARTITION).webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) =>
      cb({ cancel: ['image', 'media', 'font'].includes(d.resourceType) }));
  } catch { /* best-effort */ }

  // 창을 보이게 띄운다(TEMU_PROBE_SHOW=0 이면 숨김).
  // 진단 중에는 눈으로 봐야 한다 — 지역 선택 팝업/쿠키 배너/캡차 같은 게 막고 있으면
  // 로그만으로는 "상품 0개"의 원인을 구분할 수 없다.
  const win = new BrowserWindow({
    show: process.env.TEMU_PROBE_SHOW !== '0',
    width: 1440,
    height: 1000,
    webPreferences: { partition: PARTITION, javascript: true, backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);

  // ── CDP 로 응답 본문 캡처 ──
  // webRequest 로는 본문을 못 본다. Network.getResponseBody 는 loadingFinished 시점에만
  // 안전하게 읽히므로(그 전엔 미완성, 한참 뒤엔 evict) 그 이벤트에 붙인다.
  const pending = new Map(); // requestId -> { url, mimeType }
  const captured = [];       // { url, json }
  let saveIdx = 0;

  try {
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Network.enable');
  } catch (e) {
    log('⚠️ CDP 연결 실패 — DOM 덤프만 진행합니다:', e?.message || e);
  }

  wc.debugger.on('message', async (_evt, method, params) => {
    try {
      if (method === 'Network.responseReceived') {
        const { requestId, response, type } = params;
        const mime = response?.mimeType || '';
        // 문서/스크립트/스타일은 제외. JSON 응답과 XHR/Fetch 만 본다.
        if (!/json/i.test(mime) && !['XHR', 'Fetch'].includes(type)) return;
        pending.set(requestId, { url: response.url, mimeType: mime });
        return;
      }
      if (method === 'Network.loadingFinished') {
        const meta = pending.get(params.requestId);
        if (!meta) return;
        pending.delete(params.requestId);

        const res = await wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId });
        const body = res?.base64Encoded ? Buffer.from(res.body, 'base64').toString('utf8') : res?.body;
        if (!body || body.length < 40) return;

        let json;
        try { json = JSON.parse(body); } catch { return; } // JSON 아니면 관심 없음

        const name = safeName(meta.url, saveIdx++);
        writeFileSync(join(OUT_DIR, name), JSON.stringify({ __url: meta.url, ...json }, null, 2), 'utf8');
        captured.push({ url: meta.url, file: name, json });
      }
    } catch { /* 개별 응답 실패는 무시 — 탐침이 죽으면 안 된다 */ }
  });

  // ── 1) 세션 시드 ──
  // 네이버에서 쓰는 것과 같은 패턴. 지역(KR)/통화 쿠키가 잡혀야 검색이 한국 결과로 나온다.
  log('세션 시드 중…', HOME_URL);
  try { await wc.loadURL(HOME_URL, { userAgent: UA }); } catch (e) { log('홈 로드 실패:', e?.message || e); }
  await sleep(3000);

  // ── 2) 검색결과 로드 ──
  log('검색결과 로드 중…', SEARCH_URL);
  try { await wc.loadURL(SEARCH_URL, { userAgent: UA }); } catch (e) { log('검색 로드 실패:', e?.message || e); }

  // ── 3) 상품이 그려질 때까지 폴링 ──
  // 정적 fetch 로는 0건이었으니, 여기서 0 이 아니게 되는 순간이 "JS 실행이 필요하다"의 증명이기도 하다.
  const countJs = `(function(){
    var sel = 'a[href*="goods_id"], a[href*="-g-"], a[href*="/kr/"][href*=".html"]';
    return { links: document.querySelectorAll(sel).length,
             textLen: (document.body ? document.body.innerText.length : 0) };
  })()`;

  let last = -1, stable = 0, stat = { links: 0, textLen: 0 };
  const deadline = Date.now() + RENDER_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    try { stat = await wc.executeJavaScript(countJs); } catch { /* 렌더 중 */ }
    if (stat.links > 0 && stat.links === last) {
      if (++stable >= STABLE_TICKS) break;
    } else {
      stable = 0;
    }
    last = stat.links;
    log(`대기… 상품링크 ${stat.links}개 · 본문 ${stat.textLen}자 · XHR ${captured.length}건`);
  }

  // 지연 로딩(무한스크롤) 상품까지 받기 위해 조금 스크롤한다.
  try {
    await wc.executeJavaScript('window.scrollTo(0, document.body.scrollHeight*0.6); true');
    await sleep(4000);
  } catch { /* best-effort */ }

  // ── 4) DOM 덤프 + 배지 위치 확인 ──
  let rendered = '';
  try { rendered = await wc.executeJavaScript('document.documentElement.outerHTML'); } catch { /* ignore */ }
  if (rendered) writeFileSync(join(OUT_DIR, 'rendered.html'), rendered, 'utf8');

  let badgeSnippets = [];
  try {
    badgeSnippets = await wc.executeJavaScript(`(function(){
      var hints = ${JSON.stringify(VALUE_HINTS)};
      var out = [];
      var all = document.querySelectorAll('body *');
      for (var i=0; i<all.length && out.length<8; i++) {
        var el = all[i];
        if (el.children.length) continue;                 // 잎 노드만
        var t = (el.textContent||'').trim();
        if (!t || t.length > 40) continue;
        if (!hints.some(function(h){ return t.indexOf(h) >= 0; })) continue;
        var card = el.closest('a') || el.parentElement;
        out.push({ text: t, card: card ? card.outerHTML.slice(0, 1200) : '' });
      }
      return out;
    })()`);
  } catch { /* ignore */ }

  // ── 5) 자동 분석 ──
  const reports = captured.map((c) => analyze(c.url, c.json)).filter((r) => r.keyHits.length || r.valueHits.length);

  const lines = [];
  lines.push('테무 L2L 식별 탐침 결과');
  lines.push('='.repeat(60));
  lines.push(`검색어      : ${SEARCH_KEY}`);
  lines.push(`검색 URL    : ${SEARCH_URL}`);
  lines.push(`상품 링크   : ${stat.links}개  (정적 fetch 로는 0개였음)`);
  lines.push(`본문 길이   : ${stat.textLen}자`);
  lines.push(`XHR JSON    : ${captured.length}건 캡처`);
  lines.push(`렌더 DOM    : ${rendered ? Math.round(rendered.length / 1024) + 'KB' : '실패'}`);
  lines.push('');

  lines.push('── 판정 1: 실브라우저가 필요한가 ──');
  lines.push(stat.links > 0
    ? `  ✅ 렌더 후 상품 ${stat.links}개 확보. 정적 fetch(0개)와 대비되므로 Electron 경로가 유효하다.`
    : '  ❌ 렌더 후에도 상품 0개. 지역/주소 선택 게이트에 막혔거나 셀렉터가 틀렸다. rendered.html 확인 필요.');
  lines.push('');

  lines.push('── 판정 2: 로컬(국내발송) 배지가 DOM 에 있는가 ──');
  if (badgeSnippets.length) {
    lines.push(`  ✅ 후보 ${badgeSnippets.length}건`);
    badgeSnippets.forEach((b, i) => {
      lines.push(`  [${i}] "${b.text}"`);
      lines.push(`      ${b.card.replace(/\s+/g, ' ').slice(0, 400)}`);
    });
  } else {
    lines.push('  ⚠️ 배지 텍스트 미발견. 검색결과 카드에는 안 붙고 상세페이지에만 있을 수 있다.');
    lines.push('     → 상품 상세 URL 로 이 스크립트를 다시 돌려볼 것.');
  }
  lines.push('');

  lines.push('── 판정 3: XHR 응답에 로컬 플래그 필드가 있는가 ── ★ 핵심');
  if (reports.length) {
    for (const r of reports) {
      lines.push(`  ▸ ${r.url.slice(0, 130)}`);
      if (r.valueHits.length) {
        lines.push('     [값 일치 — 가장 유력]');
        r.valueHits.slice(0, 15).forEach((h) => lines.push(`       ${h}`));
      }
      if (r.keyHits.length) {
        lines.push('     [키 이름 일치 — 후보]');
        r.keyHits.slice(0, 25).forEach((h) => lines.push(`       ${h}`));
      }
      lines.push('');
    }
  } else {
    lines.push('  ❌ 후보 필드 없음. 캡처된 JSON 을 직접 열어 확인해야 한다.');
    lines.push('     (배열은 앞 3개만 순회하므로, 상품 목록 깊은 곳은 요약에서 빠질 수 있다)');
  }
  lines.push('');

  lines.push('── 캡처 목록 ──');
  captured.forEach((c) => lines.push(`  ${c.file}  ←  ${c.url.slice(0, 120)}`));

  const summary = lines.join('\n');
  writeFileSync(join(OUT_DIR, 'summary.txt'), summary, 'utf8');
  console.log('\n' + summary + '\n');
  log('완료 →', OUT_DIR);

  try { wc.debugger.detach(); } catch { /* ignore */ }
  win.destroy();
  app.quit();
}

app.disableHardwareAcceleration();
app.whenReady().then(() => {
  main().catch((e) => {
    console.error('[temu-probe] 치명적 오류:', e);
    app.exit(1);
  });
});
app.on('window-all-closed', () => app.quit());
