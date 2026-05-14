// 블루베리 카테고리에서 review composer 가 영양제 fragment 끌어오는지 audit
import { readFileSync } from 'fs';
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });

// 다양한 블루베리 카테고리 후보들 — 신선과일 vs 건강식품 vs 음료
const idx = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf-8'));
const blueberry = idx.filter(([code, fullSpace, leaf]) =>
  /블루베리/.test(leaf) || /블루베리/.test(fullSpace)
);
console.log('블루베리 관련 카테고리:');
for (const [code, fullSpace, leaf] of blueberry) {
  console.log(`  ${code} | ${fullSpace} | leaf=${leaf}`);
}

// real-review-composer.ts 의 getReviewCategoryKey 재현
function getReviewCategoryKey(categoryPath, productName) {
  const top = (categoryPath.split(/[>\s]/)[0] || '').trim();
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) {
    const path = categoryPath;
    if (path.includes('생수/음료') || path.includes('음료') || path.includes('주류')
        || path.includes('전통주') || path.includes('차/원두') || path.includes('커피/차')
        || path.includes('우유/두유') || path.includes('생수')) return '식품>가공식품';
    if (path.includes('건강식품') || path.includes('영양제') || path.includes('비타민/미네랄')
        || path.includes('비타민제') || path.includes('홍삼>') || path.endsWith('홍삼')) return '식품';
    if (path.includes('신선식품') || path.includes('과일') || path.includes('채소') || path.includes('축산')
        || path.includes('수산') || path.includes('정육') || path.includes('농산')) return '식품>신선식품';
    if (path.includes('가공') || path.includes('즉석') || path.includes('스낵') || path.includes('간식')
        || path.includes('김치') || path.includes('반찬') || path.includes('젓갈') || path.includes('면류')
        || path.includes('소스') || path.includes('장') || path.includes('조미료') || path.includes('향신료')
        || path.includes('빵') || path.includes('베이커리') || path.includes('유제품') || path.includes('아이스크림')) return '식품>가공식품';
    if (productName) {
      if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|캡슐|정제|영양제|글루코사민|콜라겐|비오틴|마그네슘|쏘팔메토|엽산|가르시니아|스피루리나|클로렐라|크릴|코엔자임|MSM|쏘팔|프로폴리스/.test(productName)) return '식품';
      if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|블루베리|포도|수박|참외|복숭아|자두|체리|키위|망고|바나나|오렌지|레몬|자몽|귤|쌀|잡곡|정육|한우|돼지|닭|소고기|수산물|생선|새우|오징어|갈비|등심|안심|삼겹살|연어|광어/.test(productName)) return '식품>신선식품';
      if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|장류|김치|반찬|밀키트|간편식|스낵|젓갈/.test(productName)) return '식품>가공식품';
    }
    return '식품>가공식품';
  }
  return 'DEFAULT';
}

// 블루베리 path × 다양한 productName 으로 매핑 결과 확인
console.log('\n=== 카테고리 매핑 결과 ===');
for (const [code, fullSpace, leaf] of blueberry) {
  const pathDot = fullSpace.replace(/\s+/g, '>');
  console.log(`\n[${code}] path="${pathDot}"`);
  for (const pn of ['블루베리 1kg, 1개', '블루베리즙 100ml x 30포', '블루베리 캡슐 60정', '블루베리 라이트 클래식']) {
    const key = getReviewCategoryKey(pathDot, pn);
    console.log(`  "${pn}" → '${key}'`);
  }
}
