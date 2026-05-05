#!/usr/bin/env node
/**
 * 실측 audit — 카테고리당 10개 가짜 상품 생성 후 엔진 돌려서 15개 이슈 카테고리 검사.
 *
 * 사용:
 *   node scripts/audit-real.mjs                   # 전체 (16k × 10 = 160k)
 *   node scripts/audit-real.mjs --limit 500       # 처음 500 카테고리만
 *   node scripts/audit-real.mjs --filter 신선식품 # 식품 카테고리만
 *   node scripts/audit-real.mjs --samples 3       # 카테고리당 3개씩만
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);

// 컴파일된 엔진 로드
const enginePath = join(root, '.audit-build/services/persuasion-engine.js');
const { generatePersuasionContent, contentBlocksToParagraphs } = require(enginePath);

// 카테고리 인덱스
const catIndex = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/coupang-cat-index.json'), 'utf-8'));

// CLI args
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const limit = parseInt(getArg('limit', '0')) || catIndex.length;
const filter = getArg('filter', null);
const samplesPerCat = parseInt(getArg('samples', '10'));

const targetCats = filter ? catIndex.filter(c => c[1].includes(filter)) : catIndex;
const limitedCats = targetCats.slice(0, limit);
console.log(`[audit-real] 카테고리: ${limitedCats.length} × 샘플 ${samplesPerCat} = ${limitedCats.length * samplesPerCat}개 페이지`);

// ── 가짜 상품명 생성기 ──
const PRODUCT_QUALIFIERS = ['프리미엄', '특A급', '명품', '대용량', '소포장', '가정용', '선물용', '국내산', '직배송', '신선'];
const PRODUCT_UNITS = ['1kg', '2kg', '5kg', '10개입', '20개입', '500g', '1박스', '대용량', '소용량', '실속'];

function generateProductName(leafName, sampleIdx) {
  const q = PRODUCT_QUALIFIERS[sampleIdx % PRODUCT_QUALIFIERS.length];
  const u = PRODUCT_UNITS[(sampleIdx + 3) % PRODUCT_UNITS.length];
  return `${q} ${leafName} ${u} ${1000 + sampleIdx}`;
}

// ── 15개 이슈 검사 룰 ──
//
// 각 룰: (categoryPath, fullText) → string[]  (위반 메시지 배열)
//
// 카테고리별 적용 룰이 다르므로 path-aware하게 작성.

const RULES = {
  // 1. 카테고리 오염 — 다른 L1 어휘가 잘못 들어감
  '1_category_pollution': (catPath, text) => {
    const violations = [];
    const isFood = catPath.startsWith('식품');
    const isBeauty = catPath.startsWith('뷰티');
    const isElectronics = catPath.startsWith('가전/디지털');
    const isPet = catPath.startsWith('반려/애완용품');
    if (isFood && /\b(립스틱|파운데이션|마스카라|에센스|세럼)\b/.test(text)) violations.push('식품에 뷰티 어휘');
    if (isFood && /\b(노트북|냉장고|세탁기|에어컨)\b/.test(text)) violations.push('식품에 가전 어휘');
    if (isBeauty && /\b(HACCP|GMP|건강기능식품)\b/.test(text)) violations.push('뷰티에 식품 어휘');
    if (isElectronics && /\b(영양제|섭취|복용)\b/.test(text)) violations.push('가전에 영양제 어휘');
    if (isPet && /\b(피부탄력|혈관건강|장건강)\b/.test(text)) violations.push('반려에 인간 효능');
    return violations;
  },

  // 2. 법위반 표현 — 의약 효능 단정 (식약처 광고 가이드 위반)
  '2_legal_violation': (catPath, text) => {
    const violations = [];
    // 일반 식품/생활용품에 "치료/예방/완치/진단" 단정
    if (!catPath.includes('의약품') && /\b(치료한다|예방한다|완치|병이 낫|질병 치료|의약품 효과)/.test(text)) {
      violations.push('의약 효능 단정');
    }
    if (!catPath.includes('건강식품') && /\b(혈압이 떨어진다|당뇨가 낫|암 예방)/.test(text)) {
      violations.push('건기식 효능 단정');
    }
    return violations;
  },

  // 3. 정체성 붕괴 — 카테고리와 본문 불일치
  '3_identity_collapse': (catPath, text) => {
    const violations = [];
    // 신선식품에 "사용법/조작법" 같은 공산품 표현
    if (catPath.startsWith('식품 신선식품')) {
      if (/조작법|작동 방법|전원|배터리|충전/.test(text)) violations.push('생식품에 전자제품 표현');
    }
    // 가전에 "복용/섭취"
    if (catPath.startsWith('가전') && /\b(복용|섭취)\b/.test(text)) violations.push('가전에 섭취 표현');
    return violations;
  },

  // 4. 옵션/단위/중량 모순
  '4_unit_contradiction': (catPath, text) => {
    const violations = [];
    // 같은 페이지에 다른 무게 단위
    const kgMatches = text.match(/\b\d+\s*kg\b/g) || [];
    const gMatches = text.match(/\b\d+\s*g\b/g) || [];
    const mlMatches = text.match(/\b\d+\s*ml\b/g) || [];
    const lMatches = text.match(/\b\d+\s*L\b/g) || [];
    if ((kgMatches.length > 0 && mlMatches.length > 0)) violations.push('kg + ml 동시 등장');
    if (kgMatches.length > 0 && lMatches.length > 0 && !catPath.includes('음료')) violations.push('kg + L 동시 등장');
    return violations;
  },

  // 5. 빈 리뷰 슬롯 — 리뷰 텍스트 자리에 빈 문자열
  '5_empty_review_slots': (catPath, text) => {
    const violations = [];
    // "" 인접 발견 또는 빈 따옴표 페어
    if (/리뷰\s*:\s*$|""\s*"|''\s*'|"\s+"$/m.test(text)) violations.push('빈 리뷰 슬롯 마커');
    return violations;
  },

  // 6. 단어 반복 — 같은 단어가 한 문단에 5+회
  '6_word_repetition': (catPath, text) => {
    const violations = [];
    const words = text.match(/[가-힣]{2,}/g) || [];
    const counts = {};
    for (const w of words) counts[w] = (counts[w] || 0) + 1;
    const repeated = Object.entries(counts).filter(([w, c]) => c >= 12 && !['상품', '제품', '있습니다', '드세요', '드시면'].includes(w));
    for (const [w, c] of repeated) violations.push(`단어 "${w}" ${c}회 반복`);
    return violations;
  },

  // 7. 미치환 변수 — {효과1} {성분} 같은 미해결 placeholder
  '7_unresolved_variables': (catPath, text) => {
    const violations = [];
    const m = text.match(/\{[^}]+\}/g);
    if (m && m.length > 0) violations.push(`미치환 변수: ${m.slice(0, 3).join(', ')}`);
    return violations;
  },

  // 8. 쿠팡 SEO 누출 — "사과/배 과일세트" 같은 카테고리 묶음 표현
  '8_seo_leak': (catPath, text) => {
    const violations = [];
    if (/사과\/배 과일세트|과일세트.*과일세트.*과일세트/.test(text)) violations.push('SEO 묶음 표현 누출');
    return violations;
  },

  // 9. 구매욕 폭발 — 과도한 강조/허세 표현 (3+회 등장 시 위반)
  '9_purchase_hyperbole': (catPath, text) => {
    const violations = [];
    const hypePatterns = [/이건 진짜/, /시간 투자할/, /투자 가치/];
    for (const p of hypePatterns) {
      const m = text.match(new RegExp(p.source, 'g'));
      if (m && m.length >= 2) violations.push(`허세 표현 "${m[0]}" ${m.length}회`);
    }
    return violations;
  },

  // 10. 동사 오용 — 식품에 "사용/쓴다", 공구에 "먹는다"
  '10_verb_misuse': (catPath, text) => {
    const violations = [];
    if (catPath.startsWith('식품 신선식품')) {
      if (/(써봤|쓰는 동안|오래 쓴|사용하니까|사용해보면)/.test(text)) violations.push('생식품에 "쓴다" 동사');
    }
    if (catPath.startsWith('가전') || catPath.startsWith('자동차용품')) {
      if (/(드셔보세요|섭취하세요|복용하세요)/.test(text)) violations.push('비식품에 "먹는다" 동사');
    }
    return violations;
  },

  // 11. 카테고리 자체가 틀림 — 망고에 "마감/사양/모델"
  '11_wrong_category_lexicon': (catPath, text) => {
    const violations = [];
    if (catPath.startsWith('식품 신선식품')) {
      const banned = ['마감', '사양', '모델', '스펙', 'HACCP', '체감', '함량', '비타민 엄선', '표준편차', '동급'];
      const found = banned.filter(b => text.includes(b));
      if (found.length > 0) violations.push(`공산품/영양제 어휘: ${found.join(',')}`);
    }
    return violations;
  },

  // 12. 모순/사실 오류 — 같은 페이지에 다른 식감/원산지
  '12_factual_contradiction': (catPath, text) => {
    const violations = [];
    if (catPath.startsWith('식품 신선식품 과일류')) {
      // 식감 동시 주장
      const textures = ['고소한', '시원한', '부담없는', '쫄깃한'].filter(t => text.includes(t));
      if (textures.length >= 2) violations.push(`식감 동시 주장: ${textures.join(',')}`);
      // 원산지 모순 (한국 + 외국)
      const origins = [];
      if (/국내산|한국산/.test(text)) origins.push('국내');
      if (/태국산|베트남산|필리핀산|중국산|미국산/.test(text)) origins.push('외국');
      if (origins.length === 2) violations.push(`원산지 모순: ${origins.join('+')}`);
    }
    return violations;
  },

  // 13. 과장/허세 표현 — "시간 투자/진짜예요/체감"
  '13_excessive_hype': (catPath, text) => {
    const violations = [];
    const hyped = ['시간 투자할', '투자 가치', '체감이 확실', '진짜예요'];
    const found = hyped.filter(h => text.includes(h));
    if (found.length > 0) violations.push(`허세: ${found.join(',')}`);
    return violations;
  },

  // 14. 한국어 오류 — 비문/조사 오용
  '14_korean_grammar': (catPath, text) => {
    const violations = [];
    if (/선물으로/.test(text)) violations.push('"선물으로" → "선물로"');
    if (/활용 드실 때/.test(text)) violations.push('"활용 드실 때" 비문');
    if (/이를를|을을|를를/.test(text)) violations.push('이중 조사');
    return violations;
  },

  // 15. 거의 동일 문장 반복
  '15_duplicate_sentences': (catPath, text) => {
    const violations = [];
    const sentences = text.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 20);
    const seen = new Map();
    for (const s of sentences) {
      // 정규화: 상품명 토큰 제거
      const normalized = s.replace(/[가-힣]+상품|이 (상품|제품)/g, '').slice(0, 60);
      seen.set(normalized, (seen.get(normalized) || 0) + 1);
    }
    const dups = [...seen.entries()].filter(([s, c]) => c >= 2);
    if (dups.length > 0) violations.push(`동일문장 ${dups.length}건 (예: "${dups[0][0].slice(0, 30)}..." ${dups[0][1]}회)`);
    return violations;
  },
};

// ── 실행 ──
const startedAt = Date.now();
const stats = {
  totalSamples: 0,
  totalViolations: 0,
  byRule: {},   // rule → count
  byCategory: {}, // L1 → count
  worstSamples: [], // 위반 5+개 샘플 상위 50개
};

for (const ruleId of Object.keys(RULES)) stats.byRule[ruleId] = 0;

let processed = 0;
for (const [code, fullPath, leafName, depth] of limitedCats) {
  processed++;
  if (processed % 200 === 0) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[audit-real] ${processed}/${limitedCats.length} (${elapsed}s, 누적 위반 ${stats.totalViolations})`);
  }
  const categoryPath = fullPath.replace(/ /g, '>');
  const l1 = fullPath.split(' ')[0];

  for (let s = 0; s < samplesPerCat; s++) {
    const productName = generateProductName(leafName, s);
    let result, paragraphs, fullText;
    try {
      // 시그니처: (productName, categoryPath, sellerSeed, productIndex, seoKeywords?, categoryCode?)
      result = generatePersuasionContent(
        productName,
        categoryPath,
        `audit:${code}`,
        s,
        [leafName],
        code,
      );
      paragraphs = contentBlocksToParagraphs(result.blocks);
      fullText = paragraphs.join('\n');
    } catch (err) {
      stats.totalViolations++;
      stats.byRule['_engine_error'] = (stats.byRule['_engine_error'] || 0) + 1;
      if (!stats.firstError) stats.firstError = err.message;
      continue;
    }

    stats.totalSamples++;
    const ruleHits = [];
    for (const [ruleId, ruleFn] of Object.entries(RULES)) {
      const hits = ruleFn(fullPath, fullText);
      if (hits.length > 0) {
        stats.byRule[ruleId] += hits.length;
        ruleHits.push({ ruleId, hits });
      }
    }
    if (ruleHits.length > 0) {
      stats.totalViolations++;
      stats.byCategory[l1] = (stats.byCategory[l1] || 0) + 1;
      if (ruleHits.length >= 3 && stats.worstSamples.length < 50) {
        stats.worstSamples.push({
          code, catPath: fullPath, productName,
          textPreview: fullText.slice(0, 400),
          ruleHits,
        });
      }
    }
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n[audit-real] 완료 — 총 ${stats.totalSamples}개 샘플, ${stats.totalViolations}개 위반 샘플, ${elapsed}s\n`);

console.log('━━━ 룰별 위반 카운트 ━━━');
for (const [r, c] of Object.entries(stats.byRule).sort((a, b) => b[1] - a[1])) {
  if (c > 0) console.log(`  ${c.toString().padStart(8)}  ${r}`);
}

console.log('\n━━━ L1 카테고리별 위반 샘플 수 ━━━');
for (const [l1, c] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.toString().padStart(8)}  ${l1}`);
}

const reportPath = join(root, 'scripts/audit-real-result.json');
writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf-8');
console.log(`\n상세 리포트: ${reportPath}`);
