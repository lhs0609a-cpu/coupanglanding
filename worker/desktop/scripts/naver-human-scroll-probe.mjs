/**
 * "사람처럼 내리면 끝까지 무한스크롤된다" 를 실측한다.
 * ---------------------------------------------------------------------------
 * 지금까지 우리 수집기는 사람처럼 안 굴렸다.
 *   · 7번을 2초 안에 확 내리고 → **10초 쉬고** → 또 7번
 *   · 그 7번이 목록 더받기 요청을 한꺼번에 여러 개 밀어 넣는다 → 418
 * 사람은 한두 화면씩 조금 내리고 잠깐 보고 또 내린다. 요청도 한 번에 하나씩 나간다.
 *
 * 그래서 여기서는 **작게, 자주, 끊지 않고** 내리면서 어디까지 가는지 본다.
 * 판단 근거는 화면 숫자가 아니라 `paged-composite-cards` 응답 상태다(cursor 와 status 를 전부 찍는다).
 *
 * 실행:
 *   cd worker/desktop
 *   node scripts/naver-human-scroll-probe.mjs 10007233 --max=600
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChromeBrowser } from '../main/modules/naver-ingest/chrome-cdp.mjs';
import { descendToCategory } from '../main/modules/naver-ingest/chrome-navigate.mjs';
import { collectCardsJs } from '../main/modules/naver-ingest/inject.mjs';

const CAT = process.argv.find((a) => /^\d{6,}$/.test(a)) || '10007233';
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '').slice(6)) || 600;
/** 한 번에 내리는 픽셀 — 사람은 휠 한 칸에 100~120px, 서너 칸씩 굴린다. */
const STEP_PX = Number((process.argv.find((a) => a.startsWith('--step=')) || '').slice(7)) || 420;
const PROFILE = join(process.env.APPDATA || '.', 'megaload-desktop', 'chrome-profile');
const OUT = join(process.env.TEMP || '/tmp', 'naver-human-scroll-probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const log = (m) => console.log(m);

const report = { at: new Date().toISOString(), catId: CAT, paged: [], samples: [] };
const seen = new Map();
const browser = new ChromeBrowser({ profileDir: PROFILE, onLog: log });

try {
  mkdirSync(OUT, { recursive: true });
  await browser.launch();
  const page = await browser.newPage();
  await page.send('Network.enable');

  const li = await page.naverLogin();
  if (!li.loggedIn) throw new Error('네이버 로그인이 필요합니다 — 크롬 프로필에 로그인해 두세요.');

  // 더받기 응답을 **전부** 기록한다. cursor 가 어디까지 갔는지가 핵심 증거다.
  let ok200 = 0; let blocked = 0; let lastStatus = null;
  page.watchResponses(({ status, url }) => {
    if (!/paged-composite-cards/.test(url)) return;
    const cur = (url.match(/cursor=(\d+)/) || [])[1] || '?';
    report.paged.push({ status, cursor: cur });
    lastStatus = status;
    if (status === 200) { ok200 += 1; log(`      ← 더받기 200 (cursor=${cur})`); }
    else { blocked += 1; log(`      ← 더받기 ${status} (cursor=${cur})  ★차단`); }
  });

  log(`\n카테고리 ${CAT} 로 눌러서 내려갑니다…`);
  const nav = await descendToCategory(page, CAT, { onLog: log });
  if (!nav.ok) throw new Error(`목록 도달 실패 — ${nav.error}`);

  const grab = async () => {
    try {
      for (const c of (await page.evaluateJson(collectCardsJs)) || []) {
        if (c?.productNo) seen.set(String(c.productNo), c);
      }
    } catch { /* ignore */ }
    return seen.size;
  };

  const metrics = () => page.evaluateJson(`(() => {
    const se = document.scrollingElement;
    return { y: Math.round(window.scrollY), h: se ? se.scrollHeight : 0, vh: window.innerHeight };
  })()`);

  await grab();
  let m = await metrics();
  log(`\n[시작] 상품 ${seen.size}개 · 문서 ${m.h}px`);
  log(`사람처럼 ${STEP_PX}px 씩 끊지 않고 내립니다 (10초씩 쉬지 않습니다)…\n`);

  let flat = 0;          // 문서 높이가 안 늘어난 연속 횟수
  let lastCount = seen.size;
  const t0 = Date.now();

  for (let i = 1; i <= 400; i++) {
    if (seen.size >= MAX) { log(`\n목표 ${MAX}개 도달 — 여기서 멈춥니다.`); break; }
    if (blocked) { log(`\n★ 차단(${lastStatus}) — ${seen.size}개에서 멈춥니다.`); break; }

    // 사람처럼: 작게 내리고 잠깐 쉰다. 가끔 멈춰서 구경하고, 가끔 위로 조금 되돌아간다.
    // ★ 이 '사람다움'이 그대로 성적이 된다(실측 2026-08-26):
    //     마우스 안 움직임 → cursor=101 에서 418 (더받기 1회)
    //     굴리기 전 몇 픽셀 움직임 → cursor=251 에서 418 (더받기 4회)
    const up = Math.random() < 0.12;
    await page.wheel({
      steps: 1,
      deltaY: up ? -Math.round(rand(120, 300)) : Math.round(rand(STEP_PX * 0.7, STEP_PX * 1.3)),
      pauseMs: [40, 90],
    });
    await sleep(rand(350, 900));
    // 멈춰서 구경하는 시간 — 그동안에도 손은 움직인다.
    if (i % 7 === 0) {
      const dwell = rand(1500, 3500);
      const until = Date.now() + dwell;
      while (Date.now() < until) {
        await page.jiggle().catch(() => {});
        await sleep(rand(120, 320));
      }
    }

    const prev = m;
    m = await metrics();
    if (m.h <= prev.h) flat += 1; else flat = 0;

    if (i % 4 === 0) {
      const n = await grab();
      const secs = Math.round((Date.now() - t0) / 1000);
      log(`  ${String(i).padStart(3)}회 · 상품 ${String(n).padStart(4)} (+${n - lastCount})`
        + ` · scrollY ${String(m.y).padStart(6)}/${String(m.h).padStart(6)} · ${secs}초`);
      report.samples.push({ i, count: n, y: m.y, h: m.h, secs });
      lastCount = n;
    }

    // 바닥에 닿았는데 문서가 20회 연속 안 늘면 진짜 끝이다.
    if (flat >= 20 && m.y + m.vh >= m.h - 50) { log('\n문서가 더 안 늘어납니다 — 목록 끝.'); break; }
  }

  await grab();
  report.total = seen.size;
  report.paged200 = ok200;
  report.pagedBlocked = blocked;
  report.items = [...seen.values()];
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  log(`\n────────── 결과 ──────────`);
  log(`상품 ${seen.size}개 · 더받기 성공 ${ok200}회 · 차단 ${blocked}회 · ${Math.round((Date.now() - t0) / 1000)}초`);
  log(report.paged.length
    ? `더받기 이력: ${report.paged.map((p) => `${p.cursor}:${p.status}`).join(' ')}`
    : '더받기 요청이 한 번도 안 나갔습니다.');
  log(`\n산출물: ${join(OUT, 'report.json')}`);
} catch (e) {
  console.error('❌', e?.message || e);
  try { writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2)); } catch { /* ignore */ }
} finally {
  await browser.close();
  process.exit(0);
}
