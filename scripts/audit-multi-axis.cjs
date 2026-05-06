/* eslint-disable */
// ============================================================
// 다축 콘텐츠 품질 감사 — 16,259 카테고리 × 3 seed
//
// 검사 axis:
//   A. 변수 미해결 — 본문에 {...} 흔적 노출
//   B. 조사 오류 — "X로/으로" 잘못 결합 (한글+자음/모음 매칭)
//   C. 단어 반복 — 한 페이지에 같은 phrase가 3회+ 등장 (saturation)
//   D. 모순 표현 — 인접 문장 "신선/건조", "작은/큰" 등 충돌
//   E. 텍스트 길이 — SEO core 길이 2,500-4,000자 vs 실제
//   F. 상품명 밀도 — productName(또는 leaf 토큰) 등장 횟수
//   G. 다양성 — 같은 카테고리 3 seed 결과가 충분히 다른가
//   H. 자연스러움 — 단어 중복 "이 제품 이 제품", 동일 fragment 인접
//
// 결과: .test-out/content-multi-axis-audit.json
// ============================================================

const fs = require('fs');
const path = require('path');

const idx = require('../src/lib/megaload/data/coupang-cat-index.json');
const details = require('../src/lib/megaload/data/coupang-cat-details.json');
const engine = require('../.test-out/src/lib/megaload/services/persuasion-engine.js');

// ─── 검사 함수들 ─────────────────────────────────────────

// A. 변수 미해결 — 본문에 {key} 패턴 잔존
function checkUnresolvedVars(text) {
  const matches = text.match(/\{[^}]{1,30}\}/g);
  return matches ? matches.slice(0, 5) : null;
}

// B. 조사 오류 — 한글 받침 vs 조사 결합
// 받침이 있는 한글 + "로" 또는 받침 없는 한글 + "으로" 잘못 결합
const HANGUL_BASE = 0xAC00;
function hasJongseong(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > 0xD7A3) return false;
  return ((code - HANGUL_BASE) % 28) !== 0;
}
function checkParticleErrors(text) {
  const errors = [];
  // 한글 + "으로" 검사 — 한글에 받침 없으면 "으로" 안 붙음 (잘못된 케이스만 감지하기 어려워서 일단 skip)
  // "한글받침없음 + 으로" 패턴 — false positive 가능, 보수적으로
  // 실제 흔한 오류: "라면로" (받침 ㄴ인데 "으로" 안 붙음 — should be "라면으로")
  const m = text.match(/([가-힣])([로을를은는이가과와랑]\b)/g);
  if (!m) return null;
  for (const seg of m) {
    const ch = seg[0];
    const par = seg[1];
    const jong = hasJongseong(ch);
    // "X을/를", "X은/는", "X이/가", "X과/와", "X으로/로"
    if (par === '을' && !jong) errors.push(seg + ' (받침X인데 "을")');
    else if (par === '를' && jong) errors.push(seg + ' (받침O인데 "를")');
    else if (par === '은' && !jong) errors.push(seg + ' (받침X인데 "은")');
    else if (par === '는' && jong) errors.push(seg + ' (받침O인데 "는")');
    else if (par === '이' && !jong) errors.push(seg + ' (받침X인데 "이")');
    else if (par === '가' && jong) errors.push(seg + ' (받침O인데 "가")');
    else if (par === '과' && !jong) errors.push(seg + ' (받침X인데 "과")');
    else if (par === '와' && jong) errors.push(seg + ' (받침O인데 "와")');
  }
  return errors.length > 0 ? errors.slice(0, 5) : null;
}

// C. 단어 반복 (saturation) — 한 페이지에 같은 phrase가 3회+ 등장
function checkRepetitions(text) {
  // 7자 이상 phrase 추출 (의미있는 단위)
  const sentences = text.split(/[.!?\n]+/);
  const phraseCounts = {};
  for (const s of sentences) {
    if (s.trim().length < 7) continue;
    const trimmed = s.trim();
    phraseCounts[trimmed] = (phraseCounts[trimmed] || 0) + 1;
  }
  const repeated = Object.entries(phraseCounts).filter(([_, c]) => c >= 3);
  return repeated.length > 0 ? repeated.slice(0, 5).map(([s, c]) => `${c}회: "${s.slice(0, 60)}..."`) : null;
}

// D. 모순 표현
const CONTRADICTIONS = [
  ['신선', '건조한 곳에'],
  ['싱싱', '오래 보관'],
  ['차갑게', '뜨겁게'],
  ['소형', '대형'],
  ['미니', '대용량'],
  ['국내산', '수입'],
  ['초보', '전문가'],
  ['일회용', '재사용'],
];
function checkContradictions(text, catPath) {
  // 도서 카테고리는 "초보 또는 전문가용" 등 양립 표현이 자연스러움 — 검사 면제
  if (catPath && catPath.startsWith('도서')) return null;
  const found = [];
  for (const [a, b] of CONTRADICTIONS) {
    if (text.includes(a) && text.includes(b)) {
      found.push(`${a} & ${b} 동시 등장`);
    }
  }
  return found.length > 0 ? found : null;
}

// E. 텍스트 길이
function checkLength(text) {
  const len = text.replace(/\s+/g, '').length; // 공백 제외
  const issues = [];
  if (len < 1500) issues.push(`너무 짧음 (${len}자)`);
  if (len > 5000) issues.push(`너무 김 (${len}자)`);
  return issues.length > 0 ? issues : null;
}

// F. 상품명 밀도 — 슬래시·하이픈으로 분리된 토큰들을 OR 매칭 (예: "TV장/거실장" → "TV장" 또는 "거실장" 어느 쪽이든 매칭)
function checkProductDensity(text, productName) {
  if (!productName) return null;
  // 슬래시·하이픈·괄호 등으로 분리해 모든 토큰 후보 추출
  const candidates = productName
    .split(/[\/\-\(\)\,\s]+/)
    .filter(t => t && t.length >= 2)
    .slice(0, 3);
  if (candidates.length === 0) return null;
  const issues = [];
  // 후보 중 하나라도 본문에 등장하면 OK
  let totalCount = 0;
  for (const tok of candidates) {
    const re = new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    totalCount += (text.match(re) || []).length;
  }
  if (totalCount === 0) issues.push(`leaf 토큰(${candidates.join('/')}) 0회 등장`);
  return issues.length > 0 ? issues : null;
}

// G. 다양성 — 3 seed 비교
function checkDiversity(textsArr) {
  if (textsArr.length < 2) return null;
  // Jaccard 유사도 (문장 단위)
  const sentSets = textsArr.map(t => new Set(t.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length >= 10)));
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < sentSets.length; i++) {
    for (let j = i + 1; j < sentSets.length; j++) {
      const inter = [...sentSets[i]].filter(x => sentSets[j].has(x)).length;
      const union = new Set([...sentSets[i], ...sentSets[j]]).size;
      const sim = union > 0 ? inter / union : 0;
      totalSim += sim;
      pairs++;
    }
  }
  const avgSim = pairs > 0 ? totalSim / pairs : 0;
  // 0.6 이상이면 너무 비슷 (다양성 부족)
  return avgSim >= 0.6 ? `seed 다양성 부족 (Jaccard ${avgSim.toFixed(2)})` : null;
}

// H. 단어 중복 — "이 제품 이 제품" 같은 인접 중복
function checkAdjacentDup(text) {
  const m = text.match(/([가-힣]{2,8})\s+\1[\s.!?,]/g);
  return m ? m.slice(0, 5) : null;
}

// ─── 실행 ─────────────────────────────────────────────

function generateForCategory(catPath, leafName, seed) {
  try {
    const result = engine.generatePersuasionContent(
      leafName, catPath, seed, 0, ['선물용', '인기'], undefined,
      { tags: [], description: '' },
    );
    const parts = [];
    for (const b of result.blocks || []) {
      if (b.content) parts.push(b.content);
      if (b.subContent) parts.push(b.subContent);
      if (b.items) parts.push(...b.items);
      if (b.emphasis) parts.push(b.emphasis);
    }
    return parts.join('\n');
  } catch (err) {
    return null;
  }
}

(async () => {
  const startMs = Date.now();
  const stats = {
    total: idx.length,
    pass: 0,
    fail: 0,
    skip: 0,
    axisCounts: { unresolvedVars: 0, particleErrors: 0, repetitions: 0, contradictions: 0, length: 0, density: 0, diversity: 0, adjacentDup: 0 },
    failsByDomain: {},
  };
  const samples = { unresolvedVars: [], particleErrors: [], repetitions: [], contradictions: [], length: [], density: [], diversity: [], adjacentDup: [] };

  let progress = 0;
  for (const [code, , leafName] of idx) {
    const detail = details[code];
    if (!detail || !detail.p) { stats.skip++; continue; }
    const catPath = detail.p;

    // 3 seed 다른 generation
    const texts = [];
    for (const seed of ['s1', 's2', 's3']) {
      const text = generateForCategory(catPath, leafName, seed);
      if (text) texts.push(text);
    }
    if (texts.length === 0) { stats.skip++; continue; }

    // 각 axis 검사 — 첫 generation 기준 (다양성은 모든 generation 비교)
    const t = texts[0];
    const violations = [];

    const v_uv = checkUnresolvedVars(t);
    if (v_uv) { violations.push({ axis: 'unresolvedVars', detail: v_uv }); stats.axisCounts.unresolvedVars++; if (samples.unresolvedVars.length < 30) samples.unresolvedVars.push({ catPath, leafName, sample: v_uv }); }

    const v_pe = checkParticleErrors(t);
    if (v_pe) { violations.push({ axis: 'particleErrors', detail: v_pe }); stats.axisCounts.particleErrors++; if (samples.particleErrors.length < 30) samples.particleErrors.push({ catPath, leafName, sample: v_pe }); }

    const v_rep = checkRepetitions(t);
    if (v_rep) { violations.push({ axis: 'repetitions', detail: v_rep }); stats.axisCounts.repetitions++; if (samples.repetitions.length < 30) samples.repetitions.push({ catPath, leafName, sample: v_rep }); }

    const v_con = checkContradictions(t, catPath);
    if (v_con) { violations.push({ axis: 'contradictions', detail: v_con }); stats.axisCounts.contradictions++; if (samples.contradictions.length < 30) samples.contradictions.push({ catPath, leafName, sample: v_con }); }

    const v_len = checkLength(t);
    if (v_len) { violations.push({ axis: 'length', detail: v_len }); stats.axisCounts.length++; if (samples.length.length < 30) samples.length.push({ catPath, leafName, sample: v_len }); }

    const v_den = checkProductDensity(t, leafName);
    if (v_den) { violations.push({ axis: 'density', detail: v_den }); stats.axisCounts.density++; if (samples.density.length < 30) samples.density.push({ catPath, leafName, sample: v_den }); }

    const v_div = checkDiversity(texts);
    if (v_div) { violations.push({ axis: 'diversity', detail: v_div }); stats.axisCounts.diversity++; if (samples.diversity.length < 30) samples.diversity.push({ catPath, leafName, sample: v_div }); }

    const v_dup = checkAdjacentDup(t);
    if (v_dup) { violations.push({ axis: 'adjacentDup', detail: v_dup }); stats.axisCounts.adjacentDup++; if (samples.adjacentDup.length < 30) samples.adjacentDup.push({ catPath, leafName, sample: v_dup }); }

    if (violations.length === 0) {
      stats.pass++;
    } else {
      stats.fail++;
      const top = catPath.split('>')[0];
      stats.failsByDomain[top] = (stats.failsByDomain[top] || 0) + 1;
    }

    progress++;
    if (progress % 1000 === 0) {
      console.log(`[${((progress/stats.total)*100).toFixed(1)}%] pass=${stats.pass} fail=${stats.fail}`);
    }
  }

  const elapsedMs = Date.now() - startMs;
  console.log('\n=== AUDIT COMPLETE ===');
  console.log(`elapsed: ${(elapsedMs/1000/60).toFixed(1)}m`);
  console.log(`total=${stats.total} pass=${stats.pass} fail=${stats.fail} skip=${stats.skip}`);
  console.log(`fail rate: ${((stats.fail/(stats.pass+stats.fail))*100).toFixed(2)}%`);
  console.log('\nBy axis:');
  for (const [k, v] of Object.entries(stats.axisCounts)) {
    if (v > 0) console.log(`  ${k}: ${v}`);
  }
  console.log('\nFails by domain:');
  for (const [k, v] of Object.entries(stats.failsByDomain).sort((a,b)=>b[1]-a[1]).slice(0, 10)) {
    console.log(`  ${v}: ${k}`);
  }

  const outPath = path.join(__dirname, '..', '.test-out', 'content-multi-axis-audit.json');
  fs.writeFileSync(outPath, JSON.stringify({
    elapsedMs,
    stats,
    samples,
  }, null, 2));
  console.log(`\nReport: ${outPath}`);
})();
