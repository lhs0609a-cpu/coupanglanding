// 대리 등록 차별화 검증 — 같은 카탈로그 상품을 여러 셀러에게 올릴 때
// 제목 / 상세본문 / 대표이미지가 실제로 서로 달라지는지 확인한다.
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const ROOT = 'D:/developer/coupanglanding/src/lib/megaload/services';

const { generateDisplayName } = await jiti.import(`${ROOT}/display-name-generator.ts`);
const { generateStoryV2 } = await jiti.import(`${ROOT}/story-generator.ts`);
const { shuffleWithSeed } = await jiti.import(`${ROOT}/item-winner-prevention.ts`);

// 관리자가 올린 카탈로그 상품 1건 (모든 셀러가 공유하는 원본)
const CATALOG = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  name: '유기농 국내산 건조 표고버섯 슬라이스 100g',
  brand: '',
  categoryPath: '식품>농산물>버섯>표고버섯',
  categoryCode: '63955',
  images: ['main_01.jpg', 'main_02.jpg', 'detail_01.jpg', 'detail_02.jpg', 'detail_03.jpg'],
};

function stableIndex(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

// 실제 프로덕션 megaload_user_id 형태의 서로 다른 셀러 5명
const SELLERS = [
  '52e8a71d-1111-4aaa-8000-000000000001',
  '865c6164-2222-4bbb-8000-000000000002',
  '99d6b288-3333-4ccc-8000-000000000003',
  'd6900d2d-4444-4ddd-8000-000000000004',
  'ea9d0da6-5555-4eee-8000-000000000005',
];

const productIndex = stableIndex(CATALOG.id);
const names = [];
const mains = [];
const stories = [];

console.log(`원본 상품명: ${CATALOG.name}`);
console.log(`카테고리: ${CATALOG.categoryPath}\n`);
console.log('='.repeat(78));

for (const uid of SELLERS) {
  const sellerSeed = `seller_${uid}`;
  const displayName = generateDisplayName(CATALOG.name, CATALOG.brand, CATALOG.categoryPath, sellerSeed, productIndex);
  const story = generateStoryV2(displayName, CATALOG.categoryPath, sellerSeed, productIndex, { brand: CATALOG.brand }, CATALOG.categoryCode);
  // 캠페인과 동일한 방식: 후보 순서는 상품 기준 고정, 대표는 셀러 순번(라운드로빈)으로 배정
  const pool = shuffleWithSeed(CATALOG.images, `catalog_${CATALOG.id}`);
  const main = pool[SELLERS.indexOf(uid) % pool.length];

  names.push(displayName);
  mains.push(main);
  stories.push((story.paragraphs || []).join('\n'));

  console.log(`\n[셀러 ${uid.slice(0, 8)}]`);
  console.log(`  제목     : ${displayName}`);
  console.log(`  대표이미지: ${main}`);
  console.log(`  상세 첫줄 : ${(story.paragraphs?.[0] || '(없음)').slice(0, 68)}`);
  console.log(`  상세 길이 : ${(story.paragraphs || []).join('').length}자, 문단 ${(story.paragraphs || []).length}개`);
}

console.log('\n' + '='.repeat(78));
const uniq = (a) => new Set(a).size;
console.log(`\n고유 제목      : ${uniq(names)} / ${SELLERS.length}`);
console.log(`고유 대표이미지: ${uniq(mains)} / ${SELLERS.length}`);
console.log(`고유 상세본문  : ${uniq(stories)} / ${SELLERS.length}`);

// 재실행 안정성 — 같은 셀러는 몇 번 돌려도 같은 결과여야 재등록이 꼬이지 않는다.
const again = generateDisplayName(CATALOG.name, CATALOG.brand, CATALOG.categoryPath, `seller_${SELLERS[0]}`, productIndex);
console.log(`결정적 재현    : ${again === names[0] ? 'OK (동일 셀러 = 동일 결과)' : 'FAIL'}`);

const pass = uniq(names) === SELLERS.length && uniq(stories) === SELLERS.length && again === names[0];
console.log(`\n판정: ${pass ? '통과' : '실패'}`);
