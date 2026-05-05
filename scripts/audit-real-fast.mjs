#!/usr/bin/env node
/**
 * 실측 audit FAST 버전 — 즉시 stdout flush + 결과는 JSON으로만 저장.
 * 카테고리 다양성 확보: 16k 중 균등 샘플링 1000개 × 5 = 5000 페이지.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);
const { generatePersuasionContent, contentBlocksToParagraphs } = require(join(root, '.audit-build/services/persuasion-engine.js'));
const catIndex = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/coupang-cat-index.json'), 'utf-8'));

// 균등 샘플링
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const N_CATS = parseInt(getArg('cats', '1000'));
const N_SAMPLES = parseInt(getArg('samples', '5'));
const stride = Math.max(1, Math.floor(catIndex.length / N_CATS));
const sampledCats = [];
for (let i = 0; i < catIndex.length; i += stride) sampledCats.push(catIndex[i]);
console.error(`[audit-fast] sampled ${sampledCats.length} cats × ${N_SAMPLES} = ${sampledCats.length * N_SAMPLES} pages`);

const QUALIFIERS = ['프리미엄', '특A급', '명품', '대용량', '소포장', '가정용', '선물용', '국내산', '직배송', '신선'];
const UNITS = ['1kg', '2kg', '5kg', '10개입', '20개입', '500g', '1박스', '대용량', '소용량', '실속'];
const productName = (leaf, idx) =>
  `${QUALIFIERS[idx % QUALIFIERS.length]} ${leaf} ${UNITS[(idx + 3) % UNITS.length]} ${1000 + idx}`;

// 15개 룰 (간소화 — 모두 단일 카운트)
const RULES = [
  ['1_category_pollution', (p, t) => {
    const m = [];
    if (p.startsWith('식품') && /\b(립스틱|파운데이션|마스카라|에센스|세럼)\b/.test(t)) m.push('식품→뷰티 어휘');
    if (p.startsWith('식품') && /\b(노트북|냉장고|세탁기|에어컨)\b/.test(t)) m.push('식품→가전 어휘');
    if (p.startsWith('뷰티') && /\b(HACCP|GMP|건강기능식품)\b/.test(t)) m.push('뷰티→식품');
    if (p.startsWith('가전') && /\b(영양제|섭취|복용)\b/.test(t)) m.push('가전→영양제');
    if (p.startsWith('반려') && /\b(피부탄력|혈관건강|장건강)\b/.test(t)) m.push('반려→인간효능');
    return m;
  }],
  ['2_legal_violation', (p, t) => {
    const m = [];
    if (!p.includes('의약품') && /\b(치료한다|예방한다|완치|병이 낫|질병 치료|의약품 효과)/.test(t)) m.push('의약효능 단정');
    if (!p.includes('건강식품') && /\b(혈압이 떨어진다|당뇨가 낫|암 예방)/.test(t)) m.push('건기식효능 단정');
    return m;
  }],
  ['3_identity_collapse', (p, t) => {
    const m = [];
    if (p.startsWith('식품 신선식품') && /조작법|작동 방법|전원|배터리|충전/.test(t)) m.push('생식품에 전자제품 표현');
    if (p.startsWith('가전') && /\b(복용|섭취)\b/.test(t)) m.push('가전에 섭취 표현');
    return m;
  }],
  ['4_unit_contradiction', (p, t) => {
    const m = [];
    const kg = (t.match(/\b\d+\s*kg\b/g) || []).length;
    const ml = (t.match(/\b\d+\s*ml\b/g) || []).length;
    const l = (t.match(/\b\d+\s*L\b/g) || []).length;
    if (kg > 0 && ml > 0) m.push('kg + ml 동시');
    if (kg > 0 && l > 0 && !p.includes('음료')) m.push('kg + L 동시');
    return m;
  }],
  ['5_empty_review_slots', (p, t) => /리뷰\s*:\s*$|""\s*"|''\s*'/m.test(t) ? ['빈 리뷰 슬롯'] : []],
  ['6_word_repetition', (p, t, leafName) => {
    const w = t.match(/[가-힣]{2,}/g) || [];
    const c = {};
    for (const x of w) c[x] = (c[x] || 0) + 1;
    // 카테고리 leaf 이름의 단어는 자연스러운 반복 — 제외
    const leafWords = new Set((leafName || '').match(/[가-힣]{2,}/g) || []);
    const ignored = new Set([
      '상품','제품','있습니다','있어요','있는','있고','있을','있게',
      '드세요','드시면','드셔','드시는','드실','드시기','드시고',
      '풍미가','첫맛부터','가족이','이라면','이시라면','이시면',
      '쓰시면','쓰시는','쓰시기','쓰실','쓰는',
      '필요한','필요하','필요해','필요',
      '하루','이상','정도','비교','관련',
    ]);
    return Object.entries(c)
      .filter(([x, n]) => n >= 12 && !ignored.has(x) && !leafWords.has(x))
      .map(([x, n]) => `"${x}" ${n}회`).slice(0, 3);
  }],
  ['7_unresolved_variables', (p, t) => {
    const m = t.match(/\{[^}]+\}/g);
    return m ? [`{${m.slice(0, 2).join(',')}}`] : [];
  }],
  ['8_seo_leak', (p, t) => /사과\/배 과일세트|과일세트.*과일세트.*과일세트/.test(t) ? ['SEO stuffing'] : []],
  ['9_purchase_hyperbole', (p, t) => {
    const m = [];
    for (const r of [/이건 진짜/g, /시간 투자할/g, /투자 가치/g]) {
      const x = t.match(r);
      if (x && x.length >= 2) m.push(`${x[0]} ${x.length}회`);
    }
    return m;
  }],
  ['10_verb_misuse', (p, t) => {
    const m = [];
    if (p.startsWith('식품 신선식품') && /(써봤|쓰는 동안|오래 쓴|사용하니까|사용해보면)/.test(t)) m.push('생식품 "쓴다"');
    if ((p.startsWith('가전') || p.startsWith('자동차용품')) && /(드셔보세요|섭취하세요|복용하세요)/.test(t)) m.push('비식품 "먹는다"');
    return m;
  }],
  ['11_wrong_category_lexicon', (p, t) => {
    if (!p.startsWith('식품 신선식품')) return [];
    const banned = ['마감', '사양', '모델', '스펙', 'HACCP', '체감', '함량', '비타민 엄선', '표준편차', '동급에', '분야', '정육'];
    const f = banned.filter(b => t.includes(b));
    return f.length > 0 ? [f.join(',')] : [];
  }],
  ['12_factual_contradiction', (p, t) => {
    const m = [];
    if (p.startsWith('식품 신선식품 과일류')) {
      const tex = ['고소한','시원한','부담없는','쫄깃한'].filter(x => t.includes(x));
      if (tex.length >= 2) m.push(`식감 모순: ${tex.join('+')}`);
      const o = [];
      if (/국내산|한국산/.test(t)) o.push('국내');
      if (/태국산|베트남산|필리핀산|중국산|미국산/.test(t)) o.push('외국');
      if (o.length === 2) m.push(`원산지 모순: ${o.join('+')}`);
    }
    return m;
  }],
  ['13_excessive_hype', (p, t) => {
    const x = ['시간 투자할','투자 가치','체감이 확실','진짜예요'].filter(h => t.includes(h));
    return x.length > 0 ? [x.join(',')] : [];
  }],
  ['14_korean_grammar', (p, t) => {
    const m = [];
    if (/선물으로/.test(t)) m.push('선물으로');
    if (/활용 드실 때/.test(t)) m.push('활용 드실 때');
    if (/이를를|을을|를를/.test(t)) m.push('이중조사');
    if (/(\b\S+)으로/.test(t)) {
      const re = /(\b[가-힣a-zA-Z]+)\s*으로/g;
      let mm;
      while ((mm = re.exec(t)) !== null) {
        const w = mm[1];
        // 받침 없는 단어에 "으로" 붙은 경우 (간단 휴리스틱: 마지막 글자 분석)
        const last = w.charCodeAt(w.length - 1);
        if (last >= 0xAC00 && last <= 0xD7A3) {
          const jong = (last - 0xAC00) % 28;
          if (jong === 0) m.push(`"${w}으로" → "${w}로"`);
        }
      }
    }
    return m.slice(0, 3);
  }],
  ['15_duplicate_sentences', (p, t) => {
    const sent = t.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 25);
    const seen = new Map();
    for (const s of sent) {
      const k = s.replace(/[가-힣]+상품|이 (상품|제품)/g, '').slice(0, 60);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const dup = [...seen.entries()].filter(([s, c]) => c >= 2);
    return dup.length > 0 ? [`${dup.length}건 (예:"${dup[0][0].slice(0, 30)}" ${dup[0][1]}회)`] : [];
  }],
];

const stats = {
  totalSamples: 0,
  totalErrors: 0,
  byRule: {},
  byL1: {},
  worstSamples: [],
};
for (const [r] of RULES) stats.byRule[r] = 0;

const startedAt = Date.now();
let processed = 0;
const flush = (msg) => { process.stderr.write(msg + '\n'); };

for (const [code, fullPath, leafName] of sampledCats) {
  processed++;
  if (processed % 50 === 0) {
    const e = ((Date.now() - startedAt) / 1000).toFixed(1);
    flush(`  ${processed}/${sampledCats.length} (${e}s, errors:${stats.totalErrors}, viol:${Object.values(stats.byRule).reduce((a,b)=>a+b,0)})`);
  }
  const categoryPath = fullPath.replace(/ /g, '>');
  const l1 = fullPath.split(' ')[0];
  for (let s = 0; s < N_SAMPLES; s++) {
    const pn = productName(leafName, s);
    let text;
    try {
      const r = generatePersuasionContent(pn, categoryPath, `audit:${code}`, s, [leafName], code);
      text = contentBlocksToParagraphs(r.blocks).join('\n');
    } catch (e) {
      stats.totalErrors++;
      continue;
    }
    stats.totalSamples++;
    const hits = [];
    for (const [rid, fn] of RULES) {
      const h = fn(fullPath, text, leafName);
      if (h.length > 0) {
        stats.byRule[rid] += h.length;
        hits.push({ rid, h });
      }
    }
    if (hits.length > 0) {
      stats.byL1[l1] = (stats.byL1[l1] || 0) + 1;
      if (hits.length >= 3 && stats.worstSamples.length < 50) {
        stats.worstSamples.push({ code, catPath: fullPath, productName: pn, hits, textPreview: text.slice(0, 500) });
      }
    }
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
flush(`\n[audit-fast] DONE ${stats.totalSamples} samples, errors:${stats.totalErrors}, ${elapsed}s\n`);
flush('━━━ 룰별 위반 ━━━');
for (const [r, c] of Object.entries(stats.byRule).sort((a,b)=>b[1]-a[1])) if (c > 0) flush(`  ${c.toString().padStart(7)}  ${r}`);
flush('\n━━━ L1별 위반 샘플 수 ━━━');
for (const [l1, c] of Object.entries(stats.byL1).sort((a,b)=>b[1]-a[1])) flush(`  ${c.toString().padStart(7)}  ${l1}`);

const reportPath = join(root, 'scripts/audit-fast-result.json');
writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf-8');
flush(`\n상세: ${reportPath}`);
