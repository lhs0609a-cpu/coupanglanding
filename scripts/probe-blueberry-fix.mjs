// 블루베리 fix 검증 — 오메가3/루테인 등 부적합 성분이 더 이상 나오지 않는지 확인
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const rrc = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');
const { generateRealReview } = rrc;

// 카테고리 후보들
const TEST_CASES = [
  { code: '102526', path: '식품>건강식품>기타건강식품>블루베리', leaf: '블루베리', product: '블루베리 라이트 클래식 1개' },
  { code: '58961',  path: '식품>건강식품>전통건강식품>건강즙>블루베리즙', leaf: '블루베리즙', product: '블루베리즙 100ml x 30포' },
  { code: '59383',  path: '식품>신선식품>과일류>과일>블루베리', leaf: '블루베리', product: '블루베리 1kg, 1개' },
];

const FORBIDDEN_TOKENS = /루테인|오메가3|콘드로이친|글루코사민|밀크씨슬|유산균|프로바이오|콜라겐|EPA|DHA|크릴|코엔자임|쏘팔|엽산|가르시니아|흑마늘|프로틴|스피루리나|클로렐라|쏘팔메토/i;

let totalReviews = 0, leakedReviews = 0;
const leakedSamples = [];

for (const { code, path, leaf, product } of TEST_CASES) {
  console.log(`\n=== ${code} ${path} | ${product} ===`);
  for (let i = 0; i < 10; i++) {  // 10 generations per case (different seeds)
    const review = generateRealReview(product, path, `seed_${i}`, i, code);
    totalReviews++;
    const text = review?.html || review?.paragraphs?.join('\n') || JSON.stringify(review);
    const m = text.match(FORBIDDEN_TOKENS);
    if (m) {
      leakedReviews++;
      if (leakedSamples.length < 6) leakedSamples.push({ code, leaf, leak: m[0], snippet: text.slice(text.indexOf(m[0]) - 30, text.indexOf(m[0]) + 60) });
    }
  }
}

console.log(`\nTotal reviews: ${totalReviews}, leaked (영양제 토큰): ${leakedReviews}`);
console.log(`\nLeak samples:`);
for (const s of leakedSamples) console.log(' ', s);
