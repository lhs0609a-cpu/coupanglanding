/**
 * 완벽 상세페이지 생성 (로컬 LLM) — "한 번 호출 = 완벽한 결과" 보장.
 * ---------------------------------------------------------------------------
 * 전략: 생성 → 자동 검증(카테고리 정합·순한국어·SEO·구매욕 구조·금지어·반복·길이)
 *       → 실패 시 "직전 문제"를 교정 지시로 주입해 재생성. 통과할 때까지(최대 maxAttempts).
 * 호출자(runContent / 오프라인 16k 사전생성)는 이 함수만 부르면 된다.
 */

import { generate } from './local-llm.mjs';
import { buildDetailPrompt, pickPersona } from './ai-prompts.mjs';

const BLOCK_TYPE_ORDER = [
  'hook', 'problem', 'agitation', 'solution', 'benefits_grid',
  'feature_detail', 'usage_guide', 'social_proof', 'urgency', 'cta',
];

// 표준 단위/약어 — 영어 문장 검사에서 면제
const ALLOWED_LATIN = new Set([
  'usb', 'led', 'hdmi', 'lcd', 'oled', 'ml', 'kg', 'cm', 'mm', 'wifi', 'wi', 'fi',
  'bt', 'tv', 'pc', 'ssd', 'hdd', 'ai', 'uv', 'pd', 'qc', 'ip', 'ips', 'rgb', 'pet',
  'ph', 'spf', 'abs', 'pp', 'pvc', 'kf', 'kc',
]);

// 재시도를 유발하는 "심각 금지어" — 의학적 단정·허위인증·근거없는 절대 표현.
const HARD_BANNED = [
  '치료', '완치', '항암', '면역력 증진', '면역력증진', '부작용 없', '부작용없',
  '100% 효과', '100%효과', '1위', '넘버원', 'NO.1', '유일무이', '의학적', '임상시험',
  'FDA', '식약처 인증', '효과만점', '완벽 보장', '평생 ', '디톡스', '만병',
];

// 광고체 최상급 — 재시도 대신 자동 순화(쿠팡 표시광고 안전 + 카피 에너지 유지).
function softenSuperlatives(text) {
  return String(text || '')
    .replace(/최상의/g, '뛰어난').replace(/최고의/g, '뛰어난').replace(/최강의/g, '강력한')
    .replace(/최상급/g, '고급').replace(/최고급/g, '고급').replace(/최첨단/g, '첨단')
    .replace(/업계\s*최고/g, '믿을 수 있는').replace(/세계\s*최고/g, '뛰어난')
    .replace(/최상/g, '우수').replace(/최강/g, '강력').replace(/최고/g, '우수')
    .replace(/최저가/g, '합리적인 가격').replace(/가장 저렴/g, '합리적인 가격');
}

/** 1글자 한글 leaf 는 독립 토큰으로, 2글자+ 는 부분문자열로 존재 판정. */
function leafInText(leaf, text) {
  if (!leaf) return true;
  if (leaf.length >= 2) return text.includes(leaf);
  if (/[가-힣]/.test(leaf)) {
    const esc = leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}([^가-힣A-Za-z0-9]|$)`).test(text);
  }
  return text.includes(leaf);
}

/** leaf 노출 횟수 — SEO 검사용(1글자는 독립 토큰 기준). */
function countLeaf(leaf, text) {
  if (!leaf) return 0;
  if (leaf.length === 1 && /[가-힣]/.test(leaf)) {
    const esc = leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}([^가-힣A-Za-z0-9]|$)`, 'g'));
    return m ? m.length : 0;
  }
  let c = 0, i = 0;
  while ((i = text.indexOf(leaf, i)) >= 0) { c++; i += leaf.length; }
  return c;
}

/** LLM 원문 정리 — 코드펜스/선두 지시라인 제거, 공백 정규화. */
export function cleanDetailOutput(raw) {
  let t = String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  // 선두에 모델이 붙이는 머리말 제거 ("물론입니다", "아래는 ...입니다:" 등)
  t = t.replace(/^\s*(물론입니다|네[,.]?|알겠습니다|아래는[^\n]*[:：]|다음은[^\n]*[:：])\s*\n+/i, '');
  // 라벨 라인 통째 제거
  t = t.split('\n')
    .filter((line) => !/^\s*(\[?헤드라인\]?|\[?불릿\]?|\[?추천\s*대상\]?|핵심\s*특징\s*\d|상세페이지\s*본문)\s*[:：]?\s*$/.test(line))
    .join('\n');
  t = t.replace(/^\s*#{1,6}\s*/gm, '');        // 마크다운 헤더(###) 제거 — 텍스트는 유지
  t = t.replace(/\*\*\s*-\s*/g, '- ');          // "**- " 깨진 불릿 마커 정리
  // 문장 종결 직후 같은 줄에 붙은 불릿("…했어요.- **☀️")을 새 단락의 불릿 줄로 분리.
  // [ \t]만 허용 → 줄바꿈은 넘지 않으므로 이미 분리된/연속된 불릿은 건드리지 않는다.
  t = t.replace(/([^\n\t ])[ \t]*-[ \t]+(\*\*)/g, '$1\n\n- $2');
  t = softenSuperlatives(t);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

// 도서/외국도서 — "치료·장애" 등이 책 주제어일 수 있고, 외국도서는 영어가 정상.
function isBookCategory(categoryPath = '') { return /도서|음반|DVD/.test(categoryPath); }
function isForeignBook(categoryPath = '') { return /외국도서|수입도서|원서/.test(categoryPath); }
// 도서에서 의약 단정으로 오판되기 쉬운, 책 주제로는 정상인 단어
const BOOK_EXEMPT = new Set(['치료', '항암', '완치', '면역력 증진', '면역력증진', '디톡스']);

/**
 * 생성 결과 검증 — 통과 못 한 이유(한국어)를 배열로 반환.
 * @returns {{ok:boolean, issues:string[]}}
 */
export function validateDetail(text, { leaf, categoryPath = '' } = {}) {
  const issues = [];
  const t = String(text || '');
  const book = isBookCategory(categoryPath);
  const foreignBook = isForeignBook(categoryPath);

  if (/[一-鿿]/.test(t)) issues.push('한자(漢字)가 섞였다. 순한국어로만 다시 써라.');
  if (/[぀-ヿ]/.test(t)) issues.push('일본어 문자가 섞였다. 순한국어로만 써라.');

  // 영어 누출 금지(표준 단위/약어 제외). 외국도서는 영어가 정상이라 면제.
  if (!foreignBook) {
    // (a) 단독 영어 단어 4글자+ — "trench코트" 같은 누출
    const latinWords = (t.match(/[A-Za-z]{2,}/g) || []).filter((w) => w.length >= 4 && !ALLOWED_LATIN.has(w.toLowerCase()));
    if (latinWords.length) issues.push(`영어 단어(${[...new Set(latinWords)].slice(0, 3).join(', ')})를 한국어로 바꿔라.`);
    // (b) 영어 단어 3개 이상 연속 = 영어 문장
    else {
      const engRuns = t.match(/[A-Za-z]{2,}(?:[\s-]+[A-Za-z]{2,}){2,}/g) || [];
      for (const run of engRuns) {
        const words = run.split(/[\s-]+/).filter((w) => !ALLOWED_LATIN.has(w.toLowerCase()));
        if (words.length >= 3) { issues.push('영어 문장이 들어갔다. 한국어로 바꿔라.'); break; }
      }
    }
  }

  // leaf 노출 횟수 — SEO. 외국도서(영어 leaf)는 한국어 소개라 강제 안 함. 다글자 2회+, 1글자 1회+.
  if (leaf && !foreignBook) {
    const cnt = countLeaf(leaf, t);
    const need = leaf.length >= 2 ? 2 : 1;
    if (cnt < need) issues.push(`SEO: 상품 키워드 "${leaf}"가 본문에 ${need}회 이상 자연스럽게 나와야 한다(현재 ${cnt}회).`);
  }

  for (const b of HARD_BANNED) {
    if (book && BOOK_EXEMPT.has(b.trim())) continue; // 책 주제어 면제
    if (t.includes(b)) { issues.push(`금지 표현 "${b.trim()}"를 빼라(의학적 단정·허위 인증·근거없는 절대표현 금지).`); break; }
  }

  const compact = t.replace(/\s/g, '').length;
  if (compact < 480) issues.push('SEO: 본문이 너무 짧다. 공백 제외 600자 이상으로 후기톤·불릿 포함해 더 풍부하게 작성하라.');
  if (compact > 1700) issues.push('본문이 너무 길다. 1200자 내외로 핵심만.');

  const lines = t.split('\n').map((s) => s.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]\s*\S/.test(l)).length;
  const paras = t.split(/\n{2,}/).filter((s) => s.trim().length >= 10).length;
  if (bullets < 2 && paras < 3) issues.push('구조가 부족하다. 헤드라인 + 핵심 장점 불릿 3~5개 + 마무리로 구성하라.');

  if (/(^|\n)\s*(\[?헤드라인|\[?불릿|\[?추천\s*대상|핵심\s*특징\s*\d|상세페이지\s*본문|\(\d\))/.test(t)) {
    issues.push('지시문/라벨/번호가 출력에 남았다. 완성된 카피만 써라.');
  }
  if (/\{[^}\n]{1,20}\}/.test(t)) issues.push('치환 안 된 변수({...})가 남았다.');

  // 동일 문장 반복
  const sents = t.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 10);
  const seen = new Set();
  for (const s of sents) { if (seen.has(s)) { issues.push('같은 문장이 반복된다.'); break; } seen.add(s); }

  return { ok: issues.length === 0, issues };
}

/** 단락 → 블록 시퀀스(쿠팡 렌더러용). */
function paragraphsToBlocks(paras) {
  return paras.map((content, i) => ({
    type: BLOCK_TYPE_ORDER[Math.min(i, BLOCK_TYPE_ORDER.length - 1)],
    content,
  }));
}

/**
 * 완벽 상세글 생성 (검증 통과까지 자동 재생성).
 * @param {object} o
 * @param {string} o.model
 * @param {string} o.originalName
 * @param {string} o.categoryPath
 * @param {string} [o.leaf]            없으면 categoryPath 의 마지막 세그먼트
 * @param {string[]} [o.features]
 * @param {string[]} [o.seoKeywords]
 * @param {string} [o.seed]            페르소나 시드(셀러별 톤 다양화)
 * @param {number} [o.maxTokens=900]
 * @param {number} [o.maxAttempts=4]
 * @param {(info:object)=>void} [o.onAttempt]
 * @returns {Promise<{text:string, paragraphs:string[], blocks:object[], attempts:number, ok:boolean, issues:string[]}>}
 */
export async function generatePerfectDetail({
  model, originalName, categoryPath, leaf, features = [], seoKeywords = [],
  seed, maxTokens = 1300, maxAttempts = 4, onAttempt = () => {},
}) {
  const realLeaf = (leaf || (categoryPath || '').split('>').pop() || originalName || '').trim();
  const persona = pickPersona(seed || originalName || categoryPath || 'seed');
  const p = { originalName, categoryPath, features, leaf: realLeaf, seoKeywords };

  let best = null;
  let fixNote = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, prompt, options } = buildDetailPrompt(p, persona, { maxTokens, fixNote });
    // 재시도일수록 temperature 살짝 낮춰 안정화
    const temperature = Math.max(0.45, (options.temperature ?? 0.75) - (attempt - 1) * 0.12);
    const { text: raw, ms } = await generate({ model, system, prompt, options: { ...options, temperature } });
    const text = cleanDetailOutput(raw);
    const { ok, issues } = validateDetail(text, { leaf: realLeaf, categoryPath });
    onAttempt({ attempt, ok, issues, ms, chars: text.length });

    if (ok) {
      const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 8);
      return { text, paragraphs: paras, blocks: paragraphsToBlocks(paras), attempts: attempt, ok: true, issues: [] };
    }
    if (!best || issues.length < best.issues.length) best = { text, issues };
    fixNote = issues.join(' ');
  }

  // 통과 못 함 — 가장 결함 적은 결과 반환(호출자가 ok=false 로 판단)
  const paras = best.text.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 8);
  return { text: best.text, paragraphs: paras, blocks: paragraphsToBlocks(paras), attempts: maxAttempts, ok: false, issues: best.issues };
}
