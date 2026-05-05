// seller-name-sanitizer 동작 검증
// 1) SEO 반복 spam — 1회 보존 (이전엔 전부 제거)
// 2) 가격/마커 제거
// 3) 정상 phrase 보존

import { sanitizeSellerName } from '../src/lib/megaload/services/seller-name-sanitizer.ts';

const cases = [
  // 카테고리 매칭 실패 케이스 — 사용자 스크린샷에서 발췌
  '초신선 프리미엄 레드자몽 10과 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트 레드자몽 S10개(개당240g내외)',
  '완숙찰토마토 대저 짭짤이토마토 5kg 10kg 2.5kg 못난이 주스용 쥬스용 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트',
  '나주배 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트',
  '정품 선물용, 쥬스용, 멋난이 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트 완숙 최상품 5kg(소과)',
  '진짜 제주의 맛_파운드제주 사과/배 과일세트 사과/배 과일세트 사과/배 과일세트 ★19900원★소과 벌크 카라향2kg',
  // 정상 케이스 — 변형 안 되어야
  '싱싱한 사과 5kg',
  '나주배 5kg 선물세트',
];

for (const c of cases) {
  console.log('IN :', c);
  console.log('OUT:', sanitizeSellerName(c));
  console.log('');
}
