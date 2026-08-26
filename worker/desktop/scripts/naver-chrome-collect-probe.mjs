/**
 * 진짜 크롬 + 진짜 클릭으로 목록이 실제로 늘어나는지 실측한다.
 * ---------------------------------------------------------------------------
 * 비교 대상(둘 다 실측됨, 2026-08-25):
 *   · Electron 창 + 합성 클릭(isTrusted=false) → 카드가 스켈레톤에 머물고 47개에서 멈춤
 *   · 크롬 + 주소 직행(Page.navigate)          → "쇼핑 서비스 접속이 일시적으로 제한되었습니다"
 * 이 탐침이 확인할 것:
 *   · 크롬 + 진짜 클릭(Input.dispatchMouseEvent) → 스크롤할수록 계속 늘어나는가
 *
 * 실행:
 *   cd worker/desktop
 *   node scripts/naver-chrome-collect-probe.mjs 10007229 --target=300
 *   (로그인이 필요하면 크롬 창이 뜬 채로 기다린다 — 직접 로그인하면 이어서 진행)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';
import { collectCategoryViaChrome } from '../main/modules/naver-ingest/collect-list-chrome.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007229';
const TARGET = Number((process.argv.find((a) => a.startsWith('--target=')) || '').slice(9)) || 300;
const PACE = Number((process.argv.find((a) => a.startsWith('--pace=')) || '').slice(7)) || 0;
const NO_SWEEP = process.argv.includes('--no-sweep');
const LOGIN_WAIT_MS = Number((process.argv.find((a) => a.startsWith('--login-wait=')) || '').slice(13) || 300) * 1000;

/** 로그인이 남아야 다음 실행이 편하다 — 프로덕션과 같은 자리를 쓴다. */
const PROFILE = process.env.MEGALOAD_CHROME_PROFILE
  || join(process.env.APPDATA || process.env.HOME || '.', 'megaload-desktop', 'chrome-profile');
const OUT = process.env.NAVER_PROBE_OUT || join(process.env.TEMP || '/tmp', 'naver-chrome-probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(m);

const report = { at: new Date().toISOString(), catId: CAT };
const seen = new Map();

async function snap(page, label) {
  const m = await page.evaluateJson(METRICS);
  let cards = [];
  try { cards = (await page.evaluateJson(collectCardsJs)) || []; } catch { /* ignore */ }
  for (const c of cards) if (c?.productNo) seen.set(String(c.productNo), c);
  const row = { label, ...m, cardsThisRound: cards.length, uniqueTotal: seen.size };
  report.rounds.push(row);
  log(`[${String(label).padEnd(12)}] 누적=${String(seen.size).padStart(4)} 이번=${String(cards.length).padStart(4)}`
    + ` 상품링크=${String(m?.productLinks ?? 0).padStart(4)} 카드DOM=${String(m?.cardDom ?? 0).padStart(4)}`
    + ` 스켈레톤=${String(m?.skeleton ?? 0).padStart(3)} docH=${String(m?.docH ?? 0).padStart(6)}`);
  return row;
}

const browser = new ChromeBrowser({ profileDir: PROFILE, onLog: log });

try {
  mkdirSync(OUT, { recursive: true });
  await browser.launch();
  const page = await browser.newPage();
  await page.send('Network.enable');

  // ── 로그인 먼저 ─────────────────────────────────────────────────────
  // 목록 페이지는 로그인 없이 열리지 않는데, 로그인 화면이 아니라 "오류 + 새로고침" 처럼
  // 보인다(실측 2026-08-25: buttons=[새로고침,새로고침,확인]). 먼저 쿠키로 확인하지 않으면
  // 엉뚱한 데서 원인을 찾게 된다.
  let li = await page.naverLogin();
  if (!li.loggedIn) {
    log('\n네이버에 로그인되어 있지 않습니다 — 열려 있는 크롬 창에서 직접 로그인해 주세요.');
    await page.goto('https://nid.naver.com/nidlogin.login', { settleMs: 1500 });
    const d0 = await page.describe().catch(() => null);
    log(`   로그인 창 상태: ${d0?.title || '?'} / ${d0?.url || '?'}`);
    log(`   "로그인 상태 유지"를 켜 두면 다음부터는 자동입니다. 최대 ${Math.round(LOGIN_WAIT_MS / 1000)}초 대기…`);
    const until = Date.now() + LOGIN_WAIT_MS;
    let ticks = 0;
    while (Date.now() < until) {
      await sleep(4000);
      li = await page.naverLogin().catch(() => li);
      if (li.loggedIn) { log('   ✅ 로그인 확인됨'); break; }
      // 30초마다 한 번씩만 알린다 — 조용히 기다리면 멈춘 줄 안다.
      if (++ticks % 8 === 0) log(`   …대기 중 (${Math.round((until - Date.now()) / 1000)}초 남음)`);
    }
  } else {
    log('네이버 로그인 상태 — 이어서 진행합니다.');
  }
  if (!li.loggedIn) throw new Error('네이버 로그인이 확인되지 않아 중단합니다.');

  // ★ 탐침이 **프로덕션 코드 그대로**를 돌린다. 탐침용 사본을 따로 두면 "탐침은 되는데
  //   앱은 안 된다"가 생기고, 그때 뭘 믿어야 할지 알 수 없다.
  log(`\n카테고리 ${CAT} 로 눌러서 내려갑니다 (목표 ${TARGET}개)…`);
  const res = await collectCategoryViaChrome(page, CAT, {
    target: TARGET,
    sweepSiblings: !NO_SWEEP,
    ...(PACE ? { pace: [PACE * 1000, PACE * 1500] } : {}),
    onLog: log,
    onProgress: (p) => {
      if (p.scrolls % 3 === 0 || p.gained > 0) {
        log(`   스크롤 ${String(p.scrolls).padStart(3)} · 누적 ${String(p.collected).padStart(4)} (+${p.gained})`);
      }
    },
  });

  report.result = { stopped: res.stopped, count: res.items.length, visited: res.visited };
  for (const it of res.items) if (it?.productNo) seen.set(String(it.productNo), it);

  if (!res.items.length) {
    log(`\n❌ 수집 0건 — ${res.stopped}`);
    const d = await page.describe().catch(() => null);
    report.failDescribe = d;
    log(`   화면: ${JSON.stringify(d || {}).slice(0, 700)}`);
  } else {
    log(`\n결과: ${res.items.length}개 (${res.stopped})`);
    log(`훑은 카테고리: ${(res.visited || []).map((v) => `${v.name || v.id}+${v.gained}`).join(' · ')}`);
    log(res.items.length >= 200
      ? '✅ 진짜 클릭으로 들어가니 계속 나온다 — 합성클릭/주소직행이 원인이었다'
      : '⚠️ 목표에 못 미쳤다 — 위 카테고리별 수치로 어디서 막혔는지 본다');
  }

  report.items = [...seen.values()];
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log(`\n산출물: ${join(OUT, 'report.json')}  (상품 ${seen.size}건)`);
} catch (e) {
  console.error('❌ 탐침 실패:', e?.stack || e);
  try { writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2)); } catch { /* ignore */ }
} finally {
  await browser.close();
  process.exit(0);
}
