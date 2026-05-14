// 사용자 보고 케이스 직접 재현/검증 — 가드 적용 후
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const DG = await jiti.import('../src/lib/megaload/services/display-name-generator.ts');
const PE = await jiti.import('../src/lib/megaload/services/persuasion-engine.ts');
const RR = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');
const Guard = await jiti.import('../src/lib/megaload/services/cross-category-guard.ts');

const cases = [
  // 사용자 보고 1: 사과
  { name: '사과', sellerName: '경북 부사 사과 5kg 가정용', brand: '경북농협', cat: '식품>신선식품>과일류>과일>사과' },
  // 사용자 보고 2: 블루베리 (식품>신선식품)
  { name: '블루베리 (신선)', sellerName: '블루베리 1kg', brand: '', cat: '식품>신선식품>과일류>과일>블루베리' },
  // 사용자 보고 2': 블루베리 (식품>건강식품)
  { name: '블루베리 (건강식품)', sellerName: '블루베리 추출물 60정', brand: '', cat: '식품>건강식품>건강식품>기타건강식품>블루베리' },
  // 사용자 보고 3: 선크림
  { name: '선크림', sellerName: '사계절 톤업 1+1 네이처리퍼블릭 캘리포니아 알로에 데일리 선블럭 57ml SPF50 PA++++ 선크림 선로션', brand: '네이처리퍼블릭', cat: '뷰티>스킨케어>선케어/태닝>선크림' },
  // 사용자 보고 첫 케이스: 오렌지
  { name: '오렌지', sellerName: '미국 블랙라벨 고당도 오렌지 17kg 한박스', brand: '미국', cat: '식품>신선식품>과일류>과일>오렌지' },
];

console.log('=== 가드 적용 후 사용자 보고 케이스 검증 ===\n');

for (const c of cases) {
  console.log('━'.repeat(70));
  console.log(`[${c.name}] ${c.cat}`);
  console.log(`group: ${Guard.classifyCategoryGroup(c.cat)}`);

  // 5시드 display name
  console.log('\n노출상품명 (5시드):');
  const dnTokens = new Set();
  for (let s = 0; s < 5; s++) {
    const dn = DG.generateDisplayName(c.sellerName, c.brand, c.cat, s);
    console.log(`  s=${s}: ${dn}`);
    dn.split(/[\s/]+/).forEach(t => dnTokens.add(t));
  }
  const dnBad = Guard.detectCrossCategory([...dnTokens].join(' '), c.cat);
  console.log(`  ▶ cross-pollution 검출: ${dnBad.length > 0 ? `⚠ [${dnBad.join(', ')}]` : '✅ 없음'}`);

  // 1시드 detail page
  console.log('\n상세페이지 (sample):');
  const r = PE.generatePersuasionContent(c.sellerName, c.cat, 'verify', 0);
  const persuasion = PE.contentBlocksToParagraphs(r.blocks || [], c.cat);
  const review = RR.generateRealReview(c.sellerName, c.cat, 'verify', 0);
  const detail = [...persuasion, ...review.paragraphs];
  console.log(`  설득형 첫 문단: ${(persuasion[0] || '').slice(0, 150)}...`);
  console.log(`  리뷰 첫 문단: ${(review.paragraphs[0] || '').slice(0, 150)}...`);

  const detailBad = Guard.detectCrossCategory(detail.join('\n'), c.cat);
  console.log(`  ▶ cross-pollution 검출: ${detailBad.length > 0 ? `⚠ [${detailBad.join(', ')}]` : '✅ 없음'}`);
  console.log();
}
