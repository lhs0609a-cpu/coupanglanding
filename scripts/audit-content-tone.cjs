/* eslint-disable */
// ============================================================
// 카테고리 전수 어조(tone) 감사 (16,259개)
//
// 검출 대상:
//   1. PLAIN — 평서 종결 ~다/~네/~지/~군 (문어체·반말)
//      예: "이거 진짜다.", "꾸준히 쓰는 게 답이야.", "체감이 확실해네."
//   2. CASUAL — 명백한 반말 ~야/~지/~잖아/~다니까/~군
//   3. SHORT — 5자 이하 단독 문장 ("좋아요.", "최고다.")
//   4. COMMAND — 명령조/배타적 단정 ("사지 마", "하지 마", "안 돼")
//   5. COLD — 차가운 평가 ("부족하다", "별로다", "그저 그렇다")
//
// 정중 종결 (PASS):
//   ~습니다, ~합니다, ~입니다, ~예요, ~이에요,
//   ~세요, ~으세요, ~으세요, ~어요, ~아요, ~해요, ~네요, ~지요
//
// 결과: .test-out/content-tone-audit.json
// ============================================================

const fs = require('fs');
const path = require('path');

const idx = require('../src/lib/megaload/data/coupang-cat-index.json');
const details = require('../src/lib/megaload/data/coupang-cat-details.json');
const engine = require('../.test-out/src/lib/megaload/services/persuasion-engine.js');

// 정중 종결 패턴 — ~요/~다 변형 광범위 인식
const POLITE_END = /(?:습니다|합니다|입니다|예요|이에요|이죠|이지요|군요|이군요|세요|어요|아요|해요|네요|지요|드립니다|드려요|봅니다|봐요|드세요|되세요|보세요|있어요|없어요|대요|래요|할까요|일까요|죠|쥬|시죠|시지요)\s*[.!?]?$/;

// 문어체 ~다 종결 (평서) — 광고에선 단정적/차갑게 들릴 수 있음
const PLAIN_DA_END = /(?:[가-힣])(?:는다|한다|이다|있다|없다|된다|간다|온다|좋다|많다|적다|쉽다|어렵다|크다|작다|길다|짧다)\s*[.!?]$/;

// 진짜 반말 어미
const CASUAL_END = /(?:야|지|잖아|군|다니까|구나|네|걸|는걸|니까)\s*[.!?]$/;
// 단, ~네요/~지요/~군요는 정중. 검사 시 polite 우선 적용.

// 명령/배타 어조 — "~하지 마시고/마세요/말아주세요" 같은 정중한 권유는 제외
// 진짜 명령조는 종결 패턴이 "마.", "마!", "안돼." 처럼 종결되는 경우만.
const COMMAND_RE = /(?:사지\s*마|하지\s*마|쓰지\s*마|먹지\s*마)(?![\s가-힣])|^(?:절대\s*안)|(?:안\s*돼요?|안돼요?|금물입니다)\s*[.!]?$/;

// 차가운 평가
const COLD_RE = /(?:부족하다|별로다|그저\s*그렇|모자라다|허술하다|어설프다|허접|쓸모없|쓸데없)/;

// 너무 짧은 단독 문장 — 한글 글자 ≤ 3 (예: "좋아요." "최고.")
function isShort(sent) {
  const trimmed = sent.replace(/[.!?]/g, '').trim();
  const hangulCount = (trimmed.match(/[가-힣]/g) || []).length;
  // 너무 엄격하면 false positive 많음 — 한글 3자 이하만 SHORT
  return hangulCount > 0 && hangulCount <= 3;
}

// 체언(명사)종결 — 광고체이지만 정중하지 않음
// 예: "쟁여두고 싶은 마음이 드는 초배지.", "한 번 사봤다가 단골 된 망고."
// 패턴: 마지막 어절이 명사(가-힣) + 마침표 (어미 없음)
const NOUN_END = /(?:[가-힣]{2,})\s*[.!?]?$/;
function isNounEnding(sent) {
  // 정중·~다·~야/~지 종결은 위에서 이미 처리됐으므로 여기 도달했다는 건
  // "체언 + 마침표"로 끝나는 통문장일 가능성이 높음.
  // 단, 짧은 구절(명사구 단독, 글머리 항목으로 자주 사용)은 자연스러우므로 제외.
  // 한글 글자 12자 이상 + 어절 3개 이상 = "통문장" 으로 간주.
  const trimmed = sent.replace(/[.!?]/g, '').trim();
  const hangulCount = (trimmed.match(/[가-힣]/g) || []).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (hangulCount < 12 || wordCount < 3) return false;
  // 마지막 어절이 명사인지 — 정중 종결 어미가 마지막에 없으면 명사구로 판정.
  const m = sent.match(/([가-힣]+)\s*[.!?]?$/);
  if (!m) return false;
  // 끝 단어가 "다/요/까/네/지/구나" 등 동사 종결사로 끝나면 false
  const last = m[1];
  if (/(?:다|요|까|네|지|구나|예요|이에요|어요|아요|해요|봐요|입니다|습니다|드려요|드립니다)$/.test(last)) return false;
  return true;
}

function splitSentences(text) {
  // 한국어 문장 분리 — 마침표/물음표/느낌표 + 줄바꿈
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function analyzeSentence(sent) {
  const violations = [];
  // 종결부호 없이 끝난 문장은 truncation artifact — audit 대상에서 제외
  if (!/[.!?]\s*$/.test(sent)) return violations;
  // 정중 종결이면 OK 우선
  if (POLITE_END.test(sent)) {
    if (isShort(sent)) violations.push({ kind: 'SHORT', sample: sent });
    return violations;
  }
  // 명령조 / 차가운 평가
  if (COMMAND_RE.test(sent)) violations.push({ kind: 'COMMAND', sample: sent });
  if (COLD_RE.test(sent)) violations.push({ kind: 'COLD', sample: sent });
  if (isShort(sent)) {
    violations.push({ kind: 'SHORT', sample: sent });
    return violations;
  }
  // 반말
  if (CASUAL_END.test(sent)) {
    violations.push({ kind: 'CASUAL', sample: sent });
    return violations;
  }
  // 평서 ~다
  if (PLAIN_DA_END.test(sent)) {
    violations.push({ kind: 'PLAIN', sample: sent });
    return violations;
  }
  // 체언 종결 (정중 X, ~다 X, ~야 X, 명사로만 끝) — 친절성 부족
  if (isNounEnding(sent)) {
    violations.push({ kind: 'NOUN_END', sample: sent });
    return violations;
  }
  return violations;
}

function generateForCategory(catPath, leafName) {
  try {
    const result = engine.generatePersuasionContent(
      leafName, catPath, 'audit-tone', 0, [], undefined,
      { tags: [], description: '' },
    );
    const parts = [];
    for (const b of result.blocks || []) {
      // benefits_grid의 content는 헤딩 (예: "{product}을 선택해야 하는 이유")이라
      // 명사구 종결이 자연스러움 — 검사 제외.
      const isHeading = b.type === 'benefits_grid';
      if (b.content && !isHeading) parts.push(b.content);
      if (b.subContent) parts.push(b.subContent);
      // ⚠️ b.items는 benefits_grid의 글머리 항목이라 명사구가 자연스러움 — 검사 제외
      if (b.emphasis) parts.push(b.emphasis);
    }
    return parts.join('\n');
  } catch (err) {
    return null;
  }
}

(async () => {
  const startMs = Date.now();
  const total = idx.length;
  const stats = {
    total,
    pass: 0,
    fail: 0,
    skip: 0,
    sentenceTotal: 0,
    violationCounts: { PLAIN: 0, CASUAL: 0, SHORT: 0, COMMAND: 0, COLD: 0, NOUN_END: 0 },
    violationsByCategory: {},
  };
  const failures = [];
  let progress = 0;

  for (const [code, , leafName, depth] of idx) {
    const detail = details[code];
    if (!detail || !detail.p) { stats.skip++; continue; }
    const catPath = detail.p;

    const text = generateForCategory(catPath, leafName);
    if (!text) { stats.skip++; continue; }

    const sentences = splitSentences(text);
    stats.sentenceTotal += sentences.length;

    const allViolations = [];
    for (const s of sentences) {
      const v = analyzeSentence(s);
      for (const item of v) allViolations.push(item);
    }

    if (allViolations.length === 0) {
      stats.pass++;
    } else {
      stats.fail++;
      const top = catPath.split('>')[0];
      stats.violationsByCategory[top] = (stats.violationsByCategory[top] || 0) + 1;
      for (const v of allViolations) stats.violationCounts[v.kind]++;
      if (failures.length < 400 && (catPath.startsWith('도서') ? failures.length < 50 : true)) {
        failures.push({
          code, leafName, catPath,
          violations: allViolations.slice(0, 5),
          totalViolations: allViolations.length,
          sentenceCount: sentences.length,
        });
      }
    }

    progress++;
    if (progress % 1000 === 0) {
      console.log(`[${((progress/total)*100).toFixed(1)}%] ${progress}/${total} pass=${stats.pass} fail=${stats.fail}`);
    }
  }

  const outPath = path.join(__dirname, '..', '.test-out', 'content-tone-audit.json');
  const summary = {
    elapsedMs: Date.now() - startMs,
    stats,
    sampleFailures: failures,
  };
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log('\n=== AUDIT COMPLETE ===');
  console.log(`pass=${stats.pass} fail=${stats.fail} skip=${stats.skip} total=${total}`);
  console.log(`fail rate: ${((stats.fail/(stats.pass+stats.fail))*100).toFixed(2)}%`);
  console.log(`sentences scanned: ${stats.sentenceTotal.toLocaleString()}`);
  console.log('\nViolation counts:', stats.violationCounts);
  console.log('\nFails by top category:');
  const byCat = Object.entries(stats.violationsByCategory).sort((a,b)=>b[1]-a[1]);
  for (const [k,v] of byCat.slice(0, 15)) console.log(`  ${v}: ${k}`);
  console.log(`\nReport: ${outPath}`);
})();
