// ─────────────────────────────────────────────────────────────────────────────
// 실측 시뮬레이션: 16,259 카테고리 × 100 랜덤 상품명 → 상세페이지 콘텐츠 무결점 검증
//
// 프로덕션 경로 그대로 재현:
//   generateStoryV2(name, categoryPath, seed, i, ctx)  → story.paragraphs (sanitize+CTA+leaf 주입 끝낸 최종)
//   → 각 문단 checkCompliance(removeErrors, categoryContext)  (coupang-product-builder 와 동일)
//   = 유저가 실제 등록하는 상세페이지 본문
//
// 검증(객관적·자동탐지 결함):
//   D_CRASH       : 생성 중 예외
//   D_PLACEHOLDER : 미치환 템플릿 토큰({x}, ${, [[ ]], __x__), 빈 괄호, 치환실패문자(U+FFFD)
//   D_LEAF        : 카테고리 정체성(leaf) 토큰이 본문에 없음
//   D_CROSSCAT    : 타 카테고리 시그니처 토큰 누출 (detectCrossCategory)
//   D_FORBIDDEN   : compliance 클린 후에도 남은 표시광고법 금칙어 (클리너 실패)
//   D_DUP         : 동일 문장 중복 / 인접 단어 반복("엄선한 엄선한")
//   D_LEN         : 본문 과소(<400자) — 생성 실패/절단 신호
//   D_BROKEN      : 고립 자모, 치환실패문자, 깨진 합성 흔적
//   D_TONE        : 종결어미 톤 혼합(소프트 지표) — 보고만, 하드 실패 아님
//
// 실행: SHARDS=6 SHARD=0 node scripts/audit-detail-100x16k.mjs   (LIMIT=200 스모크)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const story = await jiti.import('../src/lib/megaload/services/story-generator.ts');
const compliance = await jiti.import('../src/lib/megaload/services/compliance-filter.ts');
const guard = await jiti.import('../src/lib/megaload/services/cross-category-guard.ts');

const SHARDS = parseInt(process.env.SHARDS || '1', 10);
const SHARD = parseInt(process.env.SHARD || '0', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const NAMES_PER_CAT = parseInt(process.env.VARIANTS || '100', 10);
const CLEAN_RATIO = 0.7;

const details = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json'), 'utf-8'));
const codes = Object.keys(details);

function makeRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// 토큰 충돌 회피(예: prefix "인기" + suffix "인기상품" → "인기 인기" 인접반복) — 겹치지 않는 풀
const PREFIX = ['', '', '프리미엄', '국내산', '신상', '정품', '명품', '가성비', '고급'];
const BRAND = ['', '', '메가로드', '코멤버스', '오가닉', '데일리', '내추럴'];
const FEATURE = ['', '', '튼튼한', '편안한', '실용적인', '고급스러운', '깔끔한', '슬림한', '대용량', '미니'];
const SUFFIX = ['', '', '베스트셀러', '강력추천', '선물용', '당일발송'];
const NOISE = ['2024년형', '2025신상', 'MX-7', 'V2', 'No.5', '1+1', 'PRO', '4K', 'XL', '한정판'];

// leaf 정체성 토큰 (production story-generator 와 동일 규칙)
function leafIdentity(categoryPath) {
  const leafRaw = categoryPath.split('>').pop()?.trim() || '';
  if (!leafRaw) return '';
  const tok = leafRaw.split(/[\s/,()\[\]]+/).filter(t => t.length >= 2)[0] || '';
  return tok.replace(/^(여성|남성|키즈|아동|유아|어른|성인)/, '').trim();
}

function genName(rng, leaf, clean) {
  const leafNoun = leaf.split(/[\s/,()\[\]]+/).filter(Boolean)[0] || leaf;
  const parts = [pick(rng, PREFIX), pick(rng, BRAND), pick(rng, FEATURE), leafNoun, pick(rng, SUFFIX)];
  let name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!clean) name += ' ' + pick(rng, NOISE);
  return name;
}

// ── 검증기 ──
const PLACEHOLDER_RE = /\{[^}]*\}|\$\{|\[\[|\]\]|__[A-Za-z가-힣]+__|\(\s*\)|（\s*）|�/;
const ISOLATED_JAMO_RE = /(^|\s)[ㄱ-ㅎㅏ-ㅣ]+(\s|$)/;
const ADJ_DUP_RE = /([가-힣]{2,})\s+\1(?=[\s.,!?]|$)/;
const CTA_RE = /(담아두|구매|주문|장바구니|선택|소장|만나보|경험해|준비하세요|후회 없)/;
const FORMAL_RE = /(습니다|입니다|됩니다|합니다|니다[.!]|다[.!])/g;
const CASUAL_RE = /(에요|예요|어요|아요|해요|네요|세요|요[.!])/g;

function splitSentences(text) {
  return text.split(/(?<=[.!?다])\s+/).map(s => s.trim()).filter(s => s.length > 8);
}
function normSent(s) { return s.replace(/[\s.,!?~()[\]"']/g, ''); }

// 문법 깨짐: 형용사 관형형(한/운/던) + 목적격 조사(을/를) 직결 ("편리한을 체감")
const GRAMMAR_RE = /(한|운|던)[을를](?=\s|$)/;

// 본문을 절(clause) 단위로 분해 — 문장부호/접속 경계
function splitClauses(text) {
  return text.split(/[.!?,]\s*|\s+(?=막상|그리고|하지만|또한)/).map(s => s.trim()).filter(s => s.length >= 10);
}

const stats = {
  cats: 0, calls: 0, clean: 0, noisy: 0, charSum: 0,
  D: { CRASH: 0, PLACEHOLDER: 0, LEAF: 0, CROSSCAT: 0, FORBIDDEN: 0, DUP: 0, CLAUSEDUP: 0, CROSSDUP: 0, GRAMMAR: 0, LEN: 0, BROKEN: 0, TONE: 0 },
  failCats: {}, samples: {},
};
for (const k of Object.keys(stats.D)) { stats.failCats[k] = new Set(); stats.samples[k] = []; }
function fail(k, sample) {
  stats.D[k]++; stats.failCats[k].add(sample.code);
  if (stats.samples[k].length < 30) stats.samples[k].push(sample);
}

async function run() {
  const t0 = Date.now();
  let cats = codes.filter((_, i) => i % SHARDS === SHARD);
  if (LIMIT > 0) cats = cats.slice(0, LIMIT);
  console.log(`[shard ${SHARD}/${SHARDS}] ${cats.length} cats × ${NAMES_PER_CAT}`);

  for (let ci = 0; ci < cats.length; ci++) {
    const code = cats[ci];
    const path = details[code]?.p;
    if (!path) continue;
    const leaf = path.split('>').pop() || '';
    const ident = leafIdentity(path);
    // 카테고리 leaf 토큰 — compliance 가 카테고리 자체 명칭("탈모관리기"의 "탈모")을 금칙어로 제거하지 않도록 보호
    const safeWords = new Set([leaf, ...leaf.split(/[\s/,()\[\]]+/).filter(t => t.length >= 2)]);
    stats.cats++;
    const rng = makeRng((parseInt(code, 10) || ci) + 104729);
    const cleanN = Math.round(NAMES_PER_CAT * CLEAN_RATIO);

    for (let k = 0; k < NAMES_PER_CAT; k++) {
      const clean = k < cleanN;
      clean ? stats.clean++ : stats.noisy++;
      stats.calls++;
      const name = genName(rng, leaf, clean);

      let body, paras;
      try {
        const s = story.generateStoryV2(name, path, `seller_audit_${SHARD}`, k, { tags: [], brand: '' });
        paras = (s.paragraphs || []).map(p => {
          const r = compliance.checkCompliance(p, { removeErrors: true, categoryContext: path, categorySafeWords: safeWords });
          return r.cleanedText || p;
        });
        body = paras.join(' ');
      } catch (e) {
        fail('CRASH', { code, leaf, name, err: String(e.message || e).slice(0, 200) });
        continue;
      }
      stats.charSum += body.length;

      // D_LEN
      if (body.length < 400) fail('LEN', { code, leaf, name, len: body.length });

      // D_PLACEHOLDER
      const ph = body.match(PLACEHOLDER_RE);
      if (ph) fail('PLACEHOLDER', { code, leaf, name, hit: ph[0], ctx: body.slice(Math.max(0, ph.index - 20), ph.index + 30) });

      // D_BROKEN (고립 자모)
      const jm = body.match(ISOLATED_JAMO_RE);
      if (jm) fail('BROKEN', { code, leaf, name, hit: JSON.stringify(jm[0]), ctx: body.slice(Math.max(0, jm.index - 20), jm.index + 25) });

      // D_LEAF (정체성 토큰 부재)
      if (ident && ident.length >= 2 && !body.includes(ident)) fail('LEAF', { code, leaf, name, ident, head: body.slice(0, 80) });

      // D_CROSSCAT
      const cc = guard.detectCrossCategory(body, path);
      if (cc.length > 0) fail('CROSSCAT', { code, leaf, name, tokens: [...new Set(cc)].slice(0, 6) });

      // D_FORBIDDEN (클린 후 잔존) — 프로덕션과 동일하게 문단별로 재검사.
      //   join 된 본문에서 재검사하면 greedy 패턴(\d+개월...효과)이 문단 경계를 넘어
      //   거짓양성을 내므로(프로덕션은 문단별 정리), 문단 단위로 hasErrors 를 본다.
      let fbLabels = null;
      for (const p of paras) {
        const r = compliance.checkCompliance(p, { categoryContext: path, categorySafeWords: safeWords });
        if (r.hasErrors) { fbLabels = r.violations.filter(v => v.severity === 'error').map(v => v.label).slice(0, 6); break; }
      }
      if (fbLabels) fail('FORBIDDEN', { code, leaf, name, labels: fbLabels });

      // D_DUP (문장 전체 중복 + 인접 단어 반복)
      let dupHit = null;
      const sents = splitSentences(body);
      const seen = new Set();
      for (const s of sents) { const n = normSent(s); if (n.length > 12) { if (seen.has(n)) { dupHit = s.slice(0, 50); break; } seen.add(n); } }
      const adj = body.match(ADJ_DUP_RE);
      if (dupHit || adj) fail('DUP', { code, leaf, name, dupSent: dupHit, adjWord: adj ? adj[0] : null });

      // D_CLAUSEDUP (문단 내 동일 절 2회+ — 명백한 결함) / D_CROSSDUP (문단 간 — 경미)
      {
        // 문단 내(intra): 한 문단 안에서 같은 절이 반복
        let intraHit = null;
        for (const p of paras) {
          const seenC = new Set();
          for (const c of splitClauses(p)) {
            const n = normSent(c);
            if (n.length >= 10) { if (seenC.has(n)) { intraHit = c.slice(0, 45); break; } seenC.add(n); }
          }
          if (intraHit) break;
        }
        if (intraHit) fail('CLAUSEDUP', { code, leaf, name, clause: intraHit });
        // 문단 간(cross): 본문 전체에서 같은 절이 2회+ (intra 미발생 시에만 별도 집계)
        else {
          const cc = new Map();
          let crossHit = null;
          for (const c of splitClauses(body)) { const n = normSent(c); if (n.length >= 10) { const v = (cc.get(n) || 0) + 1; cc.set(n, v); if (v >= 2 && !crossHit) crossHit = c.slice(0, 45); } }
          if (crossHit) fail('CROSSDUP', { code, leaf, name, clause: crossHit });
        }
      }

      // D_GRAMMAR (형용사 관형형 + 목적격 조사 직결)
      const gm = body.match(GRAMMAR_RE);
      if (gm) fail('GRAMMAR', { code, leaf, name, hit: gm[0], ctx: body.slice(Math.max(0, gm.index - 15), gm.index + 20) });

      // D_TONE (소프트)
      const fm = (body.match(FORMAL_RE) || []).length;
      const cm = (body.match(CASUAL_RE) || []).length;
      const tot = fm + cm;
      if (tot >= 6) { const minor = Math.min(fm, cm) / tot; if (minor > 0.3) fail('TONE', { code, leaf, name, formal: fm, casual: cm, minorPct: +(minor * 100).toFixed(0) }); }
    }

    if ((ci + 1) % 500 === 0) {
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const d = stats.D;
      console.log(`[shard ${SHARD}] ${ci + 1}/${cats.length} ${el}s | calls=${stats.calls} crash=${d.CRASH} ph=${d.PLACEHOLDER} leaf=${d.LEAF} xcat=${d.CROSSCAT} forb=${d.FORBIDDEN} dup=${d.DUP} len=${d.LEN} broken=${d.BROKEN} tone=${d.TONE}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const out = {
    shard: SHARD, shards: SHARDS, elapsedSec: +elapsed,
    cats: stats.cats, calls: stats.calls, clean: stats.clean, noisy: stats.noisy,
    avgChars: Math.round(stats.charSum / Math.max(1, stats.calls)),
    defects: stats.D,
    failCats: Object.fromEntries(Object.entries(stats.failCats).map(([k, v]) => [k, v.size])),
    samples: stats.samples,
  };
  const fn = `audit-detail-shard${SHARD}-of-${SHARDS}.json`;
  writeFileSync(fn, JSON.stringify(out, null, 2));
  console.log(`\n[shard ${SHARD}] done ${elapsed}s → ${fn}`);
  console.log(`  calls=${stats.calls} avgChars=${out.avgChars} | ` + Object.entries(stats.D).map(([k, v]) => `${k}=${v}`).join(' '));
}
run();
