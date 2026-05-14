// 사용자 보고 블루베리 케이스 직접 재현 — 새 가드 적용 후
import fs from 'node:fs';
const DG = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const Guard = await import('../.build-test/lib/megaload/services/cross-category-guard.js');

const cases = [
  // Image 1: 박사마을, "박사마을 416080562"
  { name: '박사마을 블루베리 (식품>신선)', sellerName: '박사마을 블루베리 블루베리 블루베리 100g', brand: '박사', cat: '식품>신선식품>과일류>과일>블루베리' },
  // Image 2: 건해몽, "건해몽 4844935515"
  { name: '건해몽 블루베리 (식품>건강)', sellerName: '건해몽 블루베리 블루베리 블루베리 블루베리 1kg', brand: '건해', cat: '식품>건강식품>건강식품>기타건강식품>블루베리' },
  // Image 3: USA, "USA 253368898"
  { name: 'USA 프로즌 블루베리', sellerName: 'USA 프로즌 블루베리 3kg(1kg X 3팩)/자연미가듬뿍 세계10대 수퍼푸드과일 블루베리 블루베리 블루베리', brand: 'US', cat: '식품>신선식품>과일류>과일>블루베리' },
];

console.log('=== 사용자 보고 블루베리 케이스 — 가드 강화 후 검증 ===\n');

for (const c of cases) {
  console.log('━'.repeat(70));
  console.log(`[${c.name}]`);
  console.log(`path: ${c.cat}`);
  console.log(`group: ${Guard.classifyCategoryGroup(c.cat)}`);
  console.log(`seller: ${c.sellerName}`);
  console.log('\n노출상품명 (5시드):');
  let totalCross = 0;
  for (let s = 0; s < 5; s++) {
    const dn = DG.generateDisplayName(c.sellerName, c.brand, c.cat, 'seller1', s);
    const det = Guard.detectCrossCategory(dn, c.cat);
    const mark = det.length > 0 ? `⚠ [${det.join(',')}]` : '✅';
    console.log(`  s=${s} ${mark}: ${dn}`);
    if (det.length > 0) totalCross++;
  }
  console.log(`\n→ 5시드 중 부적합: ${totalCross}/5`);
  console.log();
}
