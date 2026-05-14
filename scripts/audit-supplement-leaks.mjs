// 건강식품 카테고리 leaf 들이 영양제 fragment 오염되지 않는지 전수 검증
import { readFileSync, writeFileSync } from 'fs';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const rrc = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');
const { generateRealReview } = rrc;

const idx = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf-8'));

// 건강식품/식품 카테고리만 추출
const cats = idx
  .filter(([, fullSpace]) => /건강식품|식품/.test(fullSpace))
  .map(([code, fullSpace, leaf]) => ({
    code,
    path: fullSpace.replace(/\s+/g, '>'),
    leaf,
  }));

console.log(`총 ${cats.length} 식품 카테고리`);

// FORBIDDEN: 영양제 일반 성분/토큰. 베리/과일 카테고리에 이게 나오면 contamination.
const FORBIDDEN = /루테인|오메가3|콘드로이친|글루코사민|밀크씨슬|유산균|프로바이오|콜라겐|EPA|DHA|크릴|코엔자임|쏘팔메토|엽산|가르시니아|흑마늘|프로틴|스피루리나|클로렐라/i;

// 신선식품, 가공식품 leaf 는 영양제 토큰 절대 금지
// 건강식품 leaf 는 그 자체가 영양제이므로 일반 영양제 토큰 허용 — 단, leaf 종류와 무관한 토큰만 차단

let totalReviews = 0;
const leakedCats = new Map();  // code → {path, leaks: [...]}

const SAMPLES_PER_CAT = 5;

for (let i = 0; i < cats.length; i++) {
  const { code, path, leaf } = cats[i];

  // 신선/가공식품: 영양제 토큰 금지
  // 건강식품: leaf 와 무관한 영양제 토큰만 금지 (예: 블루베리에 루테인 X)
  const isSupplement = /건강식품|영양제|건강식품제품군/.test(path);
  const isFreshFood = path.includes('신선식품');
  const isProcessed = path.includes('가공식품') || /음료|주류|차|커피/.test(path);

  // 신선식품, 가공식품 → 영양제 토큰 모두 금지
  // 건강식품 leaf == FORBIDDEN keyword 이면 그 keyword 허용 (예: leaf=오메가3 이면 오메가3 허용)
  for (let j = 0; j < SAMPLES_PER_CAT; j++) {
    const productName = `${leaf} 1개`;
    let result;
    try {
      result = generateRealReview(productName, path, `seed_${j}`, j, code);
    } catch { continue; }
    totalReviews++;
    const text = result?.paragraphs?.join('\n') || result?.html || '';
    const m = text.match(FORBIDDEN);
    if (!m) continue;
    const leak = m[0];

    // leaf 가 leak token 을 포함하면 false positive (예: 오메가3 leaf → 오메가3 OK)
    if (leaf.toLowerCase().includes(leak.toLowerCase()) || leak.toLowerCase().includes(leaf.toLowerCase())) continue;
    // 신선/가공/건강식품 모두에서 leaf 무관 토큰은 contamination
    const entry = leakedCats.get(code) || { code, path, leaf, leaks: [] };
    if (entry.leaks.length < 3) entry.leaks.push({ leak, snippet: text.slice(Math.max(0, text.indexOf(leak) - 30), text.indexOf(leak) + 60) });
    leakedCats.set(code, entry);
  }
}

const summary = {
  totalReviews,
  totalCats: cats.length,
  leakedCats: leakedCats.size,
  leakRate: +(leakedCats.size / cats.length * 100).toFixed(2),
  leaks: [...leakedCats.values()].slice(0, 50),
};

writeFileSync('audit-supplement-leaks-result.json', JSON.stringify(summary, null, 2));
console.log(`\n=== 식품 카테고리 영양제 오염 audit ===`);
console.log(`Total cats: ${cats.length}, leaks: ${leakedCats.size} cats (${summary.leakRate}%)`);
console.log(`Total reviews generated: ${totalReviews}`);
console.log(`\nTop leaked cats:`);
for (const e of [...leakedCats.values()].slice(0, 20)) {
  console.log(`  ${e.code} ${e.path} | leaf=${e.leaf}`);
  for (const l of e.leaks) console.log(`    "${l.leak}" → "${l.snippet}"`);
}
console.log('\n결과: audit-supplement-leaks-result.json');
