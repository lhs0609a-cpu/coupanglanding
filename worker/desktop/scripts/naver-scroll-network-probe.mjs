/**
 * 스크롤할 때 **네이버로 요청이 나가는지**를 본다 — 추측을 끝내는 계측.
 * ---------------------------------------------------------------------------
 * 지금까지 세 번 추측했고 세 번 틀렸다(큐레이션 천장 / isTrusted / 창 포커스).
 * 갈라야 하는 것은 딱 둘이다.
 *
 *   ① 로더가 아예 안 돈다        → 스크롤해도 XHR/fetch 가 0건
 *   ② 네이버가 더 안 준다        → 요청은 나가는데 응답이 비었거나 4xx/418
 *
 * CDP Network 도메인으로 듣기 때문에 페이지에 아무것도 주입하지 않는다(관찰이 대상을
 * 바꾸지 않는다). 회차마다 문서높이·카드수·요청목록을 같이 찍는다.
 *
 * 실행:  cd worker/desktop && node scripts/naver-scroll-network-probe.mjs 10007229
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';
import { descendToCategory } from '../main/modules/naver-ingest/chrome-navigate.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007229';
const ROUNDS = Number((process.argv.find((a) => a.startsWith('--rounds=')) || '').slice(9)) || 8;
const PROFILE = join(process.env.APPDATA || '.', 'megaload-desktop', 'chrome-profile');
const OUT = join(process.env.TEMP || '/tmp', 'naver-scroll-network-probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(m);

const report = { at: new Date().toISOString(), catId: CAT, rounds: [] };
const browser = new ChromeBrowser({ profileDir: PROFILE, onLog: log });

/** 이번 회차에 오간 요청. 라운드마다 비운다. */
let bucket = [];
const requests = new Map();   // requestId → url

try {
  mkdirSync(OUT, { recursive: true });
  await browser.launch();
  const page = await browser.newPage();
  await page.send('Network.enable');

  const li = await page.naverLogin();
  if (!li.loggedIn) throw new Error('네이버 로그인이 필요합니다 — 수집 탐침을 먼저 돌려 로그인하세요.');

  // 모든 요청/응답을 듣는다. 이미지·폰트는 시끄러우니 뺀다.
  browser.on('Network.requestWillBeSent', (p) => {
    if (p?.request?.url) requests.set(p.requestId, p.request.url);
  }, page.sessionId);
  browser.on('Network.responseReceived', (p) => {
    const url = p?.response?.url || requests.get(p?.requestId) || '';
    const type = p?.type || '';
    if (!/naver/.test(url)) return;
    if (['Image', 'Font', 'Media', 'Stylesheet'].includes(type)) return;
    bucket.push({ type, status: p.response.status, url: url.split('?')[0].slice(0, 95), qs: (url.split('?')[1] || '').slice(0, 90) });
  }, page.sessionId);

  log(`\n카테고리 ${CAT} 로 눌러서 내려갑니다…`);
  const nav = await descendToCategory(page, CAT, { onLog: log });
  if (!nav.ok) throw new Error(`목록 도달 실패 — ${nav.error}`);

  const METRICS = `(() => {
    const a = [...document.querySelectorAll('a[href]')];
    const se = document.scrollingElement;
    return {
      scrollY: Math.round(window.scrollY), innerH: window.innerHeight,
      docH: se ? se.scrollHeight : 0,
      products: new Set(a.map(x => (x.href.match(/\\/products\\/(\\d+)/)||[])[1]).filter(Boolean)).size,
      cardDom: document.querySelectorAll('[class*="basicProductCard"]').length,
      skeleton: document.querySelectorAll('[class*="keleton"]').length,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
    };
  })()`;

  bucket = [];
  let m = await page.evaluateJson(METRICS);
  log(`\n[도착] 상품=${m.products} 카드=${m.cardDom} 스켈레톤=${m.skeleton} docH=${m.docH} vis=${m.visibility} focus=${m.hasFocus}`);
  log(`  도착 직후 요청 ${bucket.length}건`);

  for (let i = 1; i <= ROUNDS; i++) {
    bucket = [];
    // ★ 진짜 휠 입력으로 내린다(window.scrollBy 가 아니다).
    await page.wheel({ steps: 8, deltaY: 520 });
    await sleep(3000);

    const prev = m;
    m = await page.evaluateJson(METRICS);
    const row = { round: i, ...m, requests: bucket.slice(0, 12), requestCount: bucket.length };
    report.rounds.push(row);

    log(`\n[${i}회] 상품=${m.products}(${m.products - prev.products >= 0 ? '+' : ''}${m.products - prev.products})`
      + ` 카드=${m.cardDom} 스켈레톤=${m.skeleton} docH=${m.docH} scrollY=${m.scrollY}`);
    log(`  네이버 요청 ${bucket.length}건`);
    for (const r of bucket.slice(0, 6)) log(`    ${r.status} ${r.type.padEnd(5)} ${r.url}${r.qs ? '?' + r.qs : ''}`);
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const totalReq = report.rounds.reduce((s, r) => s + r.requestCount, 0);
  const grew = report.rounds[report.rounds.length - 1].products > report.rounds[0].products;
  log(`\n────────── 판정 ──────────`);
  log(`스크롤 ${ROUNDS}회 동안 네이버 요청 총 ${totalReq}건, 상품 ${grew ? '늘어남' : '안 늘어남'}`);
  log(totalReq === 0
    ? '→ ① 로더가 아예 안 돈다 (요청 0건). 페이지가 더 불러올 생각이 없다.'
    : (grew ? '→ 정상 동작' : '→ ② 요청은 나가는데 더 안 준다. 위 status/주소를 볼 것.'));
  log(`\n산출물: ${join(OUT, 'report.json')}`);
} catch (e) {
  console.error('❌', e?.message || e);
  try { writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2)); } catch { /* ignore */ }
} finally {
  await browser.close();
  process.exit(0);
}
