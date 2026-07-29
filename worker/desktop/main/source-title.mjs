/**
 * 소싱 링크에서 "원본 상품명"을 직접 가져온다 — 올인원 생성 전 단계.
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 소싱 폴더의 `product.json.name` 이 실제 판매 제목과 다른 경우가 흔하다.
 *   실측(2026-07-29, 8상품): "혼합곡/기타곡류 혼합곡/기타곡류 혼합곡/기타곡류"(분류 라벨 반복),
 *   "에서 정성스럽게 재배한 기능성 쌀 입니다 안심하고 드셔도 된답니다"(설명 문장) 같은 값이 들어온다.
 *   원본명은 노출상품명·옵션추출·카테고리 매칭의 **1차 입력**이라, 여기가 오염되면 전부 망가진다
 *   (예: 노출명에만 "4kg" 이 있고 원본명엔 없어 개당 중량 추출 실패).
 *
 * 왜 여기(Electron 메인)인가: 네이버 안티봇이 Node fetch 를 진짜 크롬과 구분해 즉시 막는다
 *   (실측: 직접 HTTP 429 / 구글 번역 우회 HTTP 403). 내장 크롬(BrowserWindow)으로 실제 로드하는
 *   stock-monitor 의 fetchNaverPage 파이프라인만 통과한다. run-folder 는 순수 Node 프로세스라
 *   그 경로를 쓸 수 없으므로, 생성 시작 전에 메인 프로세스가 제목을 받아 파일로 남긴다.
 *
 * 산출물: <생성폴더>/_source-titles.json  = { "<상품코드>": "원본 상품명" }
 *   folder-scanner 가 이 파일을 읽어 originalName 으로 쓴다(없으면 기존 product.json 폴백).
 *   한 번 받은 제목은 캐시로 남아 재생성 시 다시 요청하지 않는다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchNaverPage } from './modules/stock-monitor/naver-fetch.mjs';

export const TITLES_FILE = '_source-titles.json';

/** 요청 간 간격 — 안티봇 자극 최소화(연속 요청이 429 를 부른다). */
const PACE_MS = 4000;
/** 429 를 맞았을 때 한 번만 쉬고 재시도하는 간격. */
const RETRY_MS = 8000;
/**
 * 전체 시간 상한 — 이 시간을 넘기면 남은 상품은 기존 이름으로 진행한다.
 *   상품이 많을수록(100개면 요청만 400초) 생성 시작이 한없이 밀린다. 제목은 "있으면 좋은 것"이지
 *   생성을 막을 이유가 아니다. 못 받은 건 다음 실행에서 캐시를 채우며 조금씩 메운다.
 */
const BUDGET_MS = 120_000;
/** 429/실패가 이만큼 연속되면 중단하고 나머지는 기존 이름으로 진행(생성 자체는 막지 않는다). */
const FAIL_STREAK_STOP = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** product_summary.txt 에서 원본 URL 추출(folder-scanner 와 동일 규칙). */
function readSummaryUrl(dir) {
  const p = join(dir, 'product_summary.txt');
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8').match(/URL:\s*(https?:\/\/\S+)/i)?.[1]?.trim() || null; }
  catch { return null; }
}

function readJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

/**
 * HTML 에서 상품명 추출 — 난독화 CSS 클래스에 의존하지 않는 순서로 시도한다.
 *   ① __PRELOADED_STATE__ 의 product.name (권위값, 클래스 변경에 영향 없음)
 *   ② `_copyable` 컨테이너 안의 h3 (사용자가 확인한 실제 마크업. 해시 클래스는 안 쓴다)
 *   ③ og:title 메타
 *   ④ <title> 에서 스토어명 꼬리 제거
 */
/**
 * 제목처럼 보이지만 상품명이 아닌 값 — 이게 저장되면 상품명이 통째로 오염된다.
 *   네이버가 안티봇으로 막을 때 `<title>[에러] 에러페이지 - 시스템오류</title>` 를 준다(실측).
 *   HTTP 상태로 대부분 걸러지지만, 200 으로 내려오는 경우까지 방어한다.
 */
function looksLikeErrorTitle(s) {
  return /^\[?에러|시스템\s*오류|에러\s*페이지|접근이?\s*(제한|차단)|잠시\s*후\s*다시|not\s*found|error|forbidden|429|503/i.test(s);
}

export function extractTitle(html) {
  if (!html) return null;
  const clean = (s) => String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const ok = (v) => (v && v.length >= 2 && !looksLikeErrorTitle(v) ? v : null);

  // ① 권위값 — 도우미는 페이지 HTML 대신 window.__PRELOADED_STATE__ 를 직렬화해 넘긴다(실측 68KB).
  //    그래서 이 전략이 실제 운영 경로에서 거의 항상 적중한다(아래 ②~④는 상태가 없을 때의 보험).
  const st = html.match(/"product"\s*:\s*\{[\s\S]{0,4000}?"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (st) {
    try {
      const v = ok(clean(JSON.parse(`"${st[1]}"`)));
      if (v) return v;
    } catch { /* 다음 전략 */ }
  }

  // ② _copyable > h3 (클래스 해시는 매칭에 쓰지 않는다 — 수시로 바뀐다)
  const cp = html.match(/_copyable[^>]*>\s*(?:<[^h][^>]*>\s*)*<h3[^>]*>([^<]{2,300})<\/h3>/);
  if (cp) { const v = ok(clean(cp[1])); if (v) return v; }

  // ③ og:title
  //    ⚠️ 실측(아로마티카): og:title 은 "에코서트 인증 알로에 베라 96% …" 로 **판매 제목이 아니다**
  //       (소싱 크롤러가 이걸 긁어서 원본명이 오염됐다). 그래서 ①② 다음의 보험으로만 쓴다.
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{2,300})["']/i)
    || html.match(/<meta[^>]+content=["']([^"']{2,300})["'][^>]+property=["']og:title["']/i);
  if (og) { const v = ok(clean(og[1])); if (v) return v; }

  // ④ <title> — "상품명 : 스토어명" / "상품명 - 네이버쇼핑" 꼬리 제거
  const t = html.match(/<title[^>]*>([^<]{2,300})<\/title>/i);
  if (t) {
    const v = clean(t[1]).replace(/\s*[:\-|]\s*(네이버\s*(스마트스토어|쇼핑|브랜드스토어)|smartstore|naver).*$/i, '').trim();
    if (ok(v)) return v;
  }
  return null;
}

/**
 * 생성 폴더의 상품들에 대해 원본 제목을 채운다(캐시 우선).
 * @param {string} folder 생성 대상 루트(product_* 들이 있는 폴더)
 * @param {(m:string)=>void} [onLog]
 * @returns {Promise<{filled:number, cached:number, failed:number, skipped:number}>}
 */
export async function resolveSourceTitles(folder, onLog = () => {}) {
  const out = { filled: 0, cached: 0, failed: 0, skipped: 0 };
  let dirs;
  try {
    dirs = readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('product_'))
      .map((e) => e.name);
  } catch { return out; }
  if (dirs.length === 0) return out;

  const cachePath = join(folder, TITLES_FILE);
  const cache = readJson(cachePath, {});
  let streak = 0;
  let stopped = false;
  const startedAt = Date.now();

  for (let i = 0; i < dirs.length; i++) {
    const name = dirs[i];
    const code = name.replace(/^product_/, '');
    if (typeof cache[code] === 'string' && cache[code].trim()) { out.cached++; continue; }

    const dir = join(folder, name);
    const pj = readJson(join(dir, 'product.json'), {});
    const url = (typeof pj.url === 'string' && pj.url) || readSummaryUrl(dir);
    if (!url) { out.skipped++; continue; }
    if (stopped) { out.skipped++; continue; }
    if (Date.now() - startedAt > BUDGET_MS) {
      stopped = true;
      out.skipped++;
      onLog(`[원본명] ${Math.round(BUDGET_MS / 1000)}초 상한 도달 — 남은 ${dirs.length - i}건은 기존 상품명으로 진행합니다.`);
      continue;
    }

    onLog(`[원본명] ${i + 1}/${dirs.length} 조회 중…`);
    let title = null;
    try {
      let { status, body } = await fetchNaverPage(url);
      // 429(속도제한)는 일시적이다 — 조금 쉬고 한 번만 다시 본다.
      if (status === 429) {
        onLog(`[원본명] ${code}: HTTP 429 — ${Math.round(RETRY_MS / 1000)}초 후 1회 재시도`);
        await sleep(RETRY_MS);
        ({ status, body } = await fetchNaverPage(url));
      }
      if (status >= 200 && status < 400 && body) {
        title = extractTitle(body);
        // ⚠️ 여기서 아무 로그도 안 남기면 "0건 확보"의 원인이 응답 실패인지 파싱 실패인지 알 수 없다.
        //    (실제로 그래서 한 번 헛돌았다.) 본문 특징을 같이 남겨 다음 실행에서 바로 판별되게 한다.
        if (!title) {
          onLog(`[원본명] ${code}: 제목 추출 실패 — 본문 ${Math.round(body.length / 1024)}KB`
            + ` · 상태JSON ${/__PRELOADED_STATE__|"productStatusType"/.test(body) ? '있음' : '없음'}`
            + ` · copyable ${body.includes('_copyable') ? '있음' : '없음'}`
            + ` · og:title ${/property=["']og:title["']/.test(body) ? '있음' : '없음'}`);
        }
      } else {
        onLog(`[원본명] ${code}: HTTP ${status}${status === 429 ? ' (재시도도 실패)' : ''}`);
      }
    } catch (e) {
      onLog(`[원본명] ${code}: 조회 실패(${String(e?.message || e).slice(0, 80)})`);
    }

    if (title) {
      cache[code] = title;
      out.filled++;
      streak = 0;
      onLog(`[원본명] ${code} → ${title.slice(0, 60)}`);
      try { writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8'); } catch { /* best-effort */ }
    } else {
      out.failed++;
      streak++;
      if (streak >= FAIL_STREAK_STOP) {
        stopped = true;
        onLog(`[원본명] 연속 ${streak}건 실패 — 나머지는 기존 상품명으로 진행합니다(생성은 계속).`);
      }
    }
    if (i < dirs.length - 1 && !stopped) await sleep(PACE_MS);
  }

  try { writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8'); } catch { /* best-effort */ }
  return out;
}
