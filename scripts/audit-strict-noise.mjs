// scripts/audit-strict-noise.mjs
// 16,259 카테고리 × 다중 noisy input × family cross-leak 정밀 측정.
// 진짜 "100% 무결점" 검증 — 각 결과의 모든 토큰이 카테고리에 적합한지 검사.

import fs from 'node:fs';

const m = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const { generateDisplayName } = m;

const CAT_DETAILS = JSON.parse(fs.readFileSync('src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// MUTUALLY_EXCLUSIVE_FAMILIES (display-name-generator와 동일 — sync)
const FAMILIES = [
  { name: '과일', tokens: ['사과', '배', '감', '귤', '오렌지', '레몬', '자몽', '바나나', '파인애플', '망고', '딸기', '블루베리', '포도', '복숭아', '체리', '키위', '아보카도', '수박', '멜론', '두리안', '석류', '용과', '리치', '망고스틴', '한라봉', '천혜향', '참외', '자두', '살구', '매실', '단감', '대추', '무화과'] },
  { name: '사과품종', tokens: ['부사', '홍로', '아오리', '시나노골드', '감홍', '양광', '미얀마', '청사과', '빨간사과', '대과', '소과', '중과', '못난이', '못난이사과', '햇사과', '10과', '20과', '30과'] },
  { name: '채소', tokens: ['배추', '무', '당근', '양파', '대파', '마늘', '감자', '고구마', '오이', '토마토', '호박', '가지', '시금치', '브로콜리', '상추', '깻잎', '파프리카', '피망', '아스파라거스', '연근', '우엉', '도라지'] },
  { name: '곡물', tokens: ['쌀', '현미', '찹쌀', '보리', '귀리', '퀴노아', '메밀', '수수', '조', '잡곡', '백미'] },
  { name: '육류', tokens: ['소고기', '돼지고기', '닭고기', '오리고기', '양고기', '한우', '한돈', '한닭', '삼겹살', '목살', '등심', '안심', '갈비', '베이컨', '햄'] },
  { name: '유제품', tokens: ['유산균', '프로바이오틱스', '발효유', '요거트', '치즈', '버터', '우유', '연유', '생크림'] },
  { name: '음료', tokens: ['콜라', '사이다', '탄산수', '미네랄워터', '생수', '에너지드링크', '커피', '아메리카노', '라떼'] },
  { name: '차종', tokens: ['녹차', '홍차', '우롱차', '보이차', '결명자차', '율무차', '둥굴레차', '메밀차', '옥수수차'] },
  { name: '견과류', tokens: ['아몬드', '호두', '땅콩', '캐슈넛', '잣', '피스타치오', '헤이즐넛', '마카다미아', '브라질너트'] },
  { name: '모듬세트', tokens: ['과일세트', '모듬세트', '혼합세트', '모둠세트', '선물세트'] },
  { name: '보충제', tokens: ['오메가3', '오메가-3', '홍삼', '녹용', '비타민D', '비타민C', '비타민E', '글루코사민', '콘드로이틴', '루테인', '코엔자임Q10', '밀크씨슬'] },
];

// 다양한 noisy input — 다른 카테고리 토큰이 섞임
const NOISY_INPUTS = [
  '사과 과일세트 레드자몽 프리미엄 10과 산지직송 아오리 대과 쌀 유산균 식품 10개 240g',
  '블루베리 한라봉 망고 모듬 프리미엄 산지직송 100g',
  '한우 1++ 등심 자몽 사과 유산균 명절 선물세트 1kg',
  '시금치 유기농 무농약 새벽배송 사과 자몽 200g',
  '아메리카노 원두 자몽 쌀 100% 200ml',
  '비타민C 1000mg 60정 자몽향 90캡슐',
  '닭가슴살 한우 돼지고기 단백질 닭고기 100g 10팩',
  '치즈 모듬 요거트 우유 발효유 자몽 300g',
];

const ALL_CATS = [];
for (const [code, v] of Object.entries(CAT_DETAILS)) {
  if (v && v.p && typeof v.p === 'string') {
    ALL_CATS.push({ code, path: v.p });
  }
}

console.log(`총 카테고리: ${ALL_CATS.length}, 입력 시나리오: ${NOISY_INPUTS.length}`);
console.log(`총 검증 케이스: ${ALL_CATS.length * NOISY_INPUTS.length}`);

const stats = {
  total: 0,
  cleanResults: 0,
  noiseFound: 0,
  leafMissing: 0,
  // family별 leak count
  leakByFamily: {},
  // category별 leak (top 30)
  leakByCategory: new Map(),
  samples: [], // 잡음 발견 샘플
};

for (const f of FAMILIES) stats.leakByFamily[f.name] = 0;

function leafTokens(leaf) {
  return leaf
    .toLowerCase()
    .split(/[\/·\s\(\)\[\],+&\-._'']+/)
    .map(s => s.trim())
    .filter(s => s.length >= 1);
}

function findCrossFamilyTokens(displayName, leaf, path) {
  // displayName 단어 단위로 분할 (token boundary 검사)
  const dnWords = displayName
    .toLowerCase()
    .split(/[\s\/·\(\)\[\],+&]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 1);
  const dnWordSet = new Set(dnWords);
  const pathSegs = path.toLowerCase().split('>').map(s => s.trim());
  const leafLower = leaf.toLowerCase();
  const noises = [];

  for (const family of FAMILIES) {
    for (const tok of family.tokens) {
      const tokLower = tok.toLowerCase();
      // 1글자 토큰은 substring false positive 위험 → word boundary 매칭만
      if (tokLower.length < 2) continue;
      // displayName 단어 중에 정확 매칭 또는 word가 토큰을 포함하는 경우만
      const hit = dnWords.some(w => w === tokLower || w.includes(tokLower));
      if (!hit) continue;
      // path segment 어디에라도 token이 포함되면 카테고리 적합 → 잡음 아님
      const tokInPath = pathSegs.some(seg => seg.includes(tokLower));
      if (tokInPath) continue;
      noises.push({ token: tok, family: family.name });
    }
  }
  return noises;
}

for (const { code, path } of ALL_CATS) {
  const segs = path.split('>');
  const leaf = segs[segs.length - 1];
  for (const input of NOISY_INPUTS) {
    stats.total++;
    let dn;
    try {
      dn = generateDisplayName(input, '', path, 'audit-strict', 0);
    } catch (e) { continue; }
    if (!dn) continue;

    // leaf 포함 검증
    const leafLower = leaf.toLowerCase();
    const leafTok = leafTokens(leaf);
    const dnLower = dn.toLowerCase();
    const leafIn = dnLower.includes(leafLower) || leafTok.some(lt => lt.length >= 2 && dnLower.includes(lt));
    if (!leafIn) stats.leafMissing++;

    // cross-family 잡음 검증
    const noises = findCrossFamilyTokens(dn, leaf, path);
    if (noises.length === 0) {
      stats.cleanResults++;
    } else {
      stats.noiseFound++;
      for (const n of noises) {
        stats.leakByFamily[n.family]++;
      }
      const catLeaks = stats.leakByCategory.get(path) || 0;
      stats.leakByCategory.set(path, catLeaks + noises.length);
      if (stats.samples.length < 50) {
        stats.samples.push({ path, input: input.slice(0, 40) + '...', dn, noises: noises.slice(0, 5) });
      }
    }
  }
}

const cleanPct = (stats.cleanResults / stats.total * 100).toFixed(2);
const noisePct = (stats.noiseFound / stats.total * 100).toFixed(2);

console.log(`\n=== 결과 ===`);
console.log(`총 케이스:                   ${stats.total.toLocaleString()}`);
console.log(`✅ 잡음 0건 (무결점):          ${stats.cleanResults.toLocaleString()} (${cleanPct}%)`);
console.log(`🚨 cross-family 잡음 발견:     ${stats.noiseFound.toLocaleString()} (${noisePct}%)`);
console.log(`❌ leaf 누락:                 ${stats.leafMissing.toLocaleString()}`);

console.log(`\n=== family별 leak count ===`);
const sortedFamilies = Object.entries(stats.leakByFamily).sort((a, b) => b[1] - a[1]);
for (const [name, cnt] of sortedFamilies) {
  if (cnt > 0) console.log(`  ${name}: ${cnt.toLocaleString()}`);
}

console.log(`\n=== Top 잡음 발생 카테고리 (worst 20) ===`);
const sortedCats = [...stats.leakByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [path, cnt] of sortedCats) {
  console.log(`  ${cnt}건 [${path}]`);
}

console.log(`\n=== 잡음 sample (first 30) ===`);
for (const s of stats.samples.slice(0, 30)) {
  console.log(`[${s.path}]`);
  console.log(`  input: ${s.input}`);
  console.log(`  → ${s.dn}`);
  console.log(`  잡음: ${s.noises.map(n => `${n.token}(${n.family})`).join(', ')}`);
}
