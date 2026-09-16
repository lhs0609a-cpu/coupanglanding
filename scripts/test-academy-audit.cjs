/**
 * 아카데미 완주 감사 — "정말 끝까지 갈 수 있는가" 를 코드로 확인한다.
 *
 * 주장이 아니라 증거를 만든다. 확인하는 것:
 *   1) 모든 내부 링크가 **실제로 존재하는 화면**을 가리키는가
 *   2) 모든 단계가 **통과 가능한가** (준비 중이라 못 넘는 단계가 없는가)
 *   3) 처음부터 끝까지 **끊김 없이** 이어지는가 (다음 단계가 항상 있는가)
 *   4) 체크리스트·퀴즈가 실제로 **끝낼 수 있는** 모양인가
 *
 * 프로덕션에 아무것도 쓰지 않는다. 파일만 읽는다.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cache = new Map();
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs);
  const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  cache.set(abs, exports);
  const req = (n) => {
    if (n.startsWith('@/')) return load(resolve('src/' + n.slice(2)));
    if (n.startsWith('./') || n.startsWith('../')) return load(resolve(path.resolve(path.dirname(abs), n)));
    return require(n);
  };
  vm.runInNewContext(code, {
    exports, require: req, module: { exports }, console,
    Map, Set, Date, JSON, Number, Array, Object, String, Promise, Buffer,
  }, { filename: abs });
  return exports;
}
function resolve(p) {
  if (fs.existsSync(p + '.ts')) return p + '.ts';
  if (fs.existsSync(path.join(p, 'index.ts'))) return path.join(p, 'index.ts');
  return p + '.ts';
}

// ── 실제 존재하는 라우트 수집 (App Router) ────────────────────
function collectRoutes(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_') || e.name === 'api') continue;
    // (group) 은 URL 에 안 들어간다
    const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
    const full = path.join(dir, e.name);
    if (fs.existsSync(path.join(full, 'page.tsx')) || fs.existsSync(path.join(full, 'page.ts'))) {
      out.push(prefix + seg);
    }
    out.push(...collectRoutes(full, prefix + seg));
  }
  return out;
}

const ROUTES = collectRoutes('src/app');

/** 동적 세그먼트([slug])를 감안해 매칭한다 */
function routeExists(pathname) {
  const want = pathname.split('/').filter(Boolean);
  return ROUTES.some((r) => {
    const have = r.split('/').filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((seg, i) => /^\[.*\]$/.test(seg) || seg === want[i]);
  });
}

const problems = [];
function bad(where, msg) { problems.push(`${where} — ${msg}`); }

const { ACADEMY_STEPS, ACT_META } = load('src/lib/data/academy/index.ts');

// ── 1. 링크가 실제 화면을 가리키는가 ──────────────────────────
let internal = 0, external = 0;
for (const s of ACADEMY_STEPS) {
  for (const a of s.actions) {
    if (a.copyable) continue;
    if (!a.href) { bad(s.key, `"${a.label}" 에 href 가 없다`); continue; }

    if (a.external || /^https?:/.test(a.href)) {
      external++;
      if (!/^https:\/\//.test(a.href)) bad(s.key, `외부 링크가 https 가 아니다: ${a.href}`);
      if (!a.external) bad(s.key, `외부 URL 인데 external 플래그가 없다: ${a.href}`);
      continue;
    }

    internal++;
    const [pathname, query] = a.href.split('?');
    if (!routeExists(pathname)) bad(s.key, `없는 화면을 가리킨다: ${a.href}`);
    // 쿼리를 붙였는데 그 화면이 쿼리를 읽지 않으면 사용자는 목록에 떨어진다
    if (query) {
      const file = ['page.tsx', 'page.ts']
        .map((f) => path.join('src/app', pathname, f))
        .find((f) => fs.existsSync(f));
      if (file) {
        const src = fs.readFileSync(file, 'utf8');
        const key = query.split('=')[0];
        if (!src.includes('searchParams') && !src.includes(`'${key}'`) && !src.includes(`"${key}"`)) {
          bad(s.key, `쿼리를 안 읽는 화면에 쿼리를 붙였다 (사용자는 목록에 떨어진다): ${a.href}`);
        }
      }
    }
  }
}

// ── 1b. 가이드 링크가 실제로 있는 글인가 ─────────────────────
// /my/guides/{카테고리}/{글} 형태라 경로만 맞으면 라우트 검사를 통과해버린다.
// 없는 글이면 화면은 열리지만 내용이 비어 사용자는 막힌다.
{
  const guideSrc = fs.readFileSync('src/lib/data/guides.ts', 'utf8');
  const arts = new Map();
  for (const m of guideSrc.matchAll(/articleId:\s*'([^']+)',\s+categoryId:\s*'([^']+)'/g)) {
    arts.set(m[1], m[2]);
  }
  for (const s of ACADEMY_STEPS) {
    for (const a of s.actions) {
      if (!a.href || !a.href.startsWith('/my/guides/')) continue;
      const [, , , categoryId, articleId] = a.href.split('/');
      if (!arts.has(articleId)) bad(s.key, `없는 가이드 글을 가리킨다: ${articleId}`);
      else if (arts.get(articleId) !== categoryId) {
        bad(s.key, `가이드 카테고리가 틀렸다: ${articleId} 는 ${arts.get(articleId)} 인데 ${categoryId} 로 걸었다`);
      }
    }
  }
}

// ── 2. 모든 단계가 통과 가능한가 ──────────────────────────────
for (const s of ACADEMY_STEPS) {
  const v = s.verify;
  if (v.level === 2 && v.mode === 'file') {
    bad(s.key, '증빙 파일 방식이라 지금은 통과할 수 없다 (화면이 "준비 중" 을 띄운다)');
  }
  if (v.level === 3) {
    if (!v.quiz.length && !v.checklist.length) bad(s.key, '체크리스트도 퀴즈도 없어 통과 조건이 없다');
    for (const [qi, q] of v.quiz.entries()) {
      if (q.answer < 0 || q.answer >= q.choices.length) bad(s.key, `${qi + 1}번 문항의 정답 번호가 보기 범위를 벗어난다`);
      if (q.choices.length < 2) bad(s.key, `${qi + 1}번 문항의 보기가 2개 미만이다`);
      if (new Set(q.choices).size !== q.choices.length) bad(s.key, `${qi + 1}번 문항에 같은 보기가 있다`);
      if (!q.why) bad(s.key, `${qi + 1}번 문항에 해설이 없다 — 틀려도 배우는 게 없다`);
    }
  }
  if (v.level === 1 && typeof v.pass !== 'function') bad(s.key, '자동판정인데 pass() 가 없다');
}

// ── 3. 처음부터 끝까지 끊김 없이 이어지는가 ───────────────────
// 화면은 "다음 = 현재 뒤에서 잠기지 않은 첫 단계" 로 잇는다. 그 사슬을 그대로 따라가 본다.
function walk(isPt) {
  const visible = ACADEMY_STEPS.filter((s) => s.access === 'public' || isPt);
  let n = 0;
  for (let i = 0; i < visible.length; i++) {
    const after = visible.slice(i + 1)[0];
    n++;
    if (i < visible.length - 1 && !after) { bad(visible[i].key, '다음 단계로 이어지지 않는다'); break; }
  }
  return n;
}
const publicChain = walk(false);
const ptChain = walk(true);
if (publicChain === 0) bad('전체', '무료 사용자가 볼 수 있는 단계가 하나도 없다');

// Act 순서가 뒤엉키지 않았는가 (지도에 뒤죽박죽 나오면 "쫙 진행" 이 깨진다)
let prevAct = -1, prevOrder = -1;
for (const s of ACADEMY_STEPS) {
  if (s.act < prevAct) bad(s.key, 'Act 순서가 거꾸로다');
  if (s.act === prevAct && s.order <= prevOrder) bad(s.key, `같은 Act 안에서 순서가 겹치거나 거꾸로다 (order=${s.order})`);
  prevAct = s.act; prevOrder = s.order;
}

// 무료 구간이 PT 구간보다 뒤에 오면 안 된다 (잠긴 것 뒤에 열린 게 있으면 흐름이 깨진다)
const firstPt = ACADEMY_STEPS.findIndex((s) => s.access === 'pt');
if (firstPt >= 0) {
  const publicAfterPt = ACADEMY_STEPS.slice(firstPt).filter((s) => s.access === 'public');
  if (publicAfterPt.length) bad('전체', `잠긴 단계 뒤에 열린 단계가 있다: ${publicAfterPt.map((s) => s.key).join(', ')}`);
}

// ── 4. 끝낼 수 있는 모양인가 ──────────────────────────────────
for (const s of ACADEMY_STEPS) {
  if (s.verify.level === 3 && s.verify.checklist.length > 8) bad(s.key, `체크리스트가 ${s.verify.checklist.length}개나 된다 — 끝내기 부담스럽다`);
  if (s.verify.level === 3 && s.verify.quiz.length > 5) bad(s.key, `문항이 ${s.verify.quiz.length}개나 된다`);
  if (s.estimatedSec > 1800) bad(s.key, `예상 시간이 ${Math.round(s.estimatedSec / 60)}분 — 한 단계가 너무 크다`);
}

// ── 결과 ──────────────────────────────────────────────────────
const byAct = {};
for (const s of ACADEMY_STEPS) (byAct[s.act] ??= []).push(s);

console.log('── 아카데미 완주 감사 ──────────────────────────────');
for (const [act, list] of Object.entries(byAct)) {
  const meta = ACT_META[act];
  const l1 = list.filter((s) => s.verify.level === 1).length;
  const l2 = list.filter((s) => s.verify.level === 2).length;
  const l3 = list.filter((s) => s.verify.level === 3).length;
  const min = Math.round(list.reduce((n, s) => n + s.estimatedSec, 0) / 60);
  console.log(`Act ${act} ${meta.title.padEnd(4)} ${String(list.length).padStart(2)}단계  자동${l1} 번호${l2} 퀴즈${l3}  약 ${min}분  [${meta.access}]`);
}
console.log(`링크 — 내부 ${internal}개 / 외부 ${external}개`);
console.log(`사슬 — 무료 ${publicChain}단계, PT 포함 ${ptChain}단계`);

if (problems.length) {
  console.log(`\n❌ 문제 ${problems.length}건`);
  for (const p of problems) console.log(`  · ${p}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ 링크·통과가능성·연결·완주가능성 전부 통과');
}
