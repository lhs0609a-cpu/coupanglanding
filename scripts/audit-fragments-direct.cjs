/* eslint-disable */
// ============================================================
// Fragment 풀 직접 전수 검사
//
// 카테고리 generation 샘플링이 아니라 fragment 풀 자체를 열어 모든 통문장에 어조 패턴 적용.
// V2_GLOBAL_FRAGMENTS, V2_TEMPLATES, V1 persuasion-fragments, story-templates 전부.
// ============================================================

const fs = require('fs');
const path = require('path');

// 정중 종결 패턴 (audit-content-tone.cjs와 동일)
const POLITE_END = /(?:습니다|합니다|입니다|예요|이에요|이죠|이지요|군요|이군요|세요|어요|아요|해요|네요|지요|드립니다|드려요|봅니다|봐요|드세요|되세요|보세요|있어요|없어요|대요|래요|할까요|일까요|죠|쥬|시죠|시지요)\s*[.!?]?$/;
const PLAIN_DA_END = /(?:[가-힣])(?:는다|한다|이다|있다|없다|된다|간다|온다|좋다|많다|적다|쉽다|어렵다|크다|작다|길다|짧다)\s*[.!?]$/;
const CASUAL_END = /(?:야|지|잖아|군|다니까|구나|네|걸|는걸|니까)\s*[.!?]$/;
const COMMAND_RE = /(?:사지\s*마|하지\s*마|쓰지\s*마|먹지\s*마)(?![\s가-힣])|(?:안\s*돼요?|안돼요?|금물입니다)\s*[.!]?$/;

function isShort(sent) {
  const trimmed = sent.replace(/[.!?]/g, '').trim();
  const hangulCount = (trimmed.match(/[가-힣]/g) || []).length;
  return hangulCount > 0 && hangulCount <= 3;
}

function isNounEnding(sent) {
  if (!/[.!?]\s*$/.test(sent)) return false; // truncation 제외
  const trimmed = sent.replace(/[.!?]/g, '').trim();
  const hangulCount = (trimmed.match(/[가-힣]/g) || []).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (hangulCount < 12 || wordCount < 3) return false;
  if (POLITE_END.test(sent)) return false;
  if (PLAIN_DA_END.test(sent)) return false;
  if (CASUAL_END.test(sent)) return false;
  const m = sent.match(/([가-힣]+)\s*[.!?]?$/);
  if (!m) return false;
  const last = m[1];
  if (/(?:다|요|까|네|지|구나|예요|이에요|어요|아요|해요|봐요|입니다|습니다|드려요|드립니다)$/.test(last)) return false;
  return true;
}

function classify(sent) {
  if (!sent || typeof sent !== 'string') return null;
  // 너무 짧은 구절(15자 미만)은 검사 제외 — items 가능
  if (sent.length < 15) return null;
  if (!/[.!?]\s*$/.test(sent)) return null;
  // {variable} 자리는 임시 단어로 채워서 패턴 매칭이 안정적이게
  const filled = sent.replace(/\{[^}]+\}/g, '제품');
  if (POLITE_END.test(filled)) return null; // OK
  if (CASUAL_END.test(filled)) return 'CASUAL';
  if (PLAIN_DA_END.test(filled)) return 'PLAIN';
  if (COMMAND_RE.test(filled)) return 'COMMAND';
  if (isNounEnding(filled)) return 'NOUN_END';
  return null;
}

const violations = []; // {kind, source, key, raw}
let totalChecked = 0;

function walk(obj, sourcePath) {
  if (typeof obj === 'string') {
    totalChecked++;
    const kind = classify(obj);
    if (kind) violations.push({ kind, source: sourcePath, raw: obj });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${sourcePath}[${i}]`));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) walk(v, `${sourcePath}.${k}`);
  }
}

// 1. V2 templates
const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'story-templates-v2.json'), 'utf-8'));
walk(v2.templates, 'v2.templates');

// 2. V1 story-templates (variable pools — string 값만)
const v1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'story-templates.json'), 'utf-8'));
walk(v1, 'v1');

// 3. persuasion-fragments
const pf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'persuasion-fragments.json'), 'utf-8'));
walk(pf.fragments, 'persuasion-fragments');

// 4. fragment-composer.ts 안의 V2_GLOBAL_FRAGMENTS, GLOBAL_*, FOOD_*, GENERIC pools — 코드 내 문자열이라 직접 추출 어려움.
//    JSON 파일 외 코드 안의 문자열 풀은 별도 스캔.
const fcContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'megaload', 'services', 'fragment-composer.ts'), 'utf-8');
// 작은따옴표/큰따옴표로 감싸진 한글 문장 추출
const codeStrings = fcContent.match(/['"`]([^'"`\n]{15,200})['"`]/g) || [];
for (const s of codeStrings) {
  const inner = s.slice(1, -1);
  // 한글 문장 + 종결 부호 있는 것만
  if (/[가-힣]{5,}/.test(inner) && /[.!?]\s*$/.test(inner)) {
    totalChecked++;
    const kind = classify(inner);
    if (kind) violations.push({ kind, source: 'fragment-composer.ts', raw: inner });
  }
}

// 통계
const byKind = {};
for (const v of violations) byKind[v.kind] = (byKind[v.kind] || 0) + 1;

console.log('=== Fragment 풀 직접 전수 검사 ===');
console.log(`Total strings checked: ${totalChecked.toLocaleString()}`);
console.log(`Violations: ${violations.length}`);
console.log('By kind:', byKind);
console.log('\nBy source:');
const bySource = {};
for (const v of violations) bySource[v.source.split(/[.[]/)[0]] = (bySource[v.source.split(/[.[]/)[0]] || 0) + 1;
for (const [k, n] of Object.entries(bySource).sort((a,b)=>b[1]-a[1])) console.log(`  ${n}: ${k}`);

// 위반 sample 100개 저장
const outPath = path.join(__dirname, '..', '.test-out', 'fragment-direct-audit.json');
fs.writeFileSync(outPath, JSON.stringify({
  totalChecked,
  violationCount: violations.length,
  byKind,
  bySource,
  violations: violations.slice(0, 500),
}, null, 2));

console.log('\n=== Sample violations (15) ===');
const seen = new Set();
let i = 0;
for (const v of violations) {
  const key = v.raw.slice(0, 50);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  [${v.kind}] (${v.source.split('.')[0]}) ${v.raw}`);
  if (++i >= 15) break;
}

console.log(`\nReport: ${outPath}`);
