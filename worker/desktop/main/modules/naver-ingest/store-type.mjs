/**
 * 네이버 상품 URL 의 스토어 유형 — 웹의 src/lib/megaload/naver-store-type.ts 와 **같은 규칙**이다.
 * (도우미는 ESM, 웹은 TS 라 파일을 공유할 수 없다 — 고칠 때 둘 다 고칠 것.)
 *
 * 실측 2026-08-20: 추출기는 스마트스토어·브랜드스토어만 안다. 마켓·윈도는 채널ID 를 못 잡아
 * 재시도 6회 × 캡차 대기까지 매달린 끝에 실패한다 → 여기서 미리 걸러 **즉시 실패**시킨다.
 */

export function naverStoreType(url) {
  const u = String(url || '');
  if (/(?:^|\/\/|\.)smartstore\.naver\.com\//.test(u)) return 'smartstore';
  if (/(?:^|\/\/|\.)brand\.naver\.com\//.test(u)) return 'brand';
  if (/shopping\.naver\.com\/window-products\//.test(u)) return 'window';
  if (/shopping\.naver\.com\/market\//.test(u)) return 'market';
  return 'unknown';
}

export const STORE_TYPE_LABEL = {
  smartstore: '스마트스토어',
  brand: '브랜드스토어',
  market: '네이버 마켓',
  window: '쇼핑윈도',
  unknown: '알 수 없는 유형',
};

export function isDetailExtractable(url) {
  const t = naverStoreType(url);
  return t === 'smartstore' || t === 'brand';
}

export function unsupportedReason(url) {
  if (isDetailExtractable(url)) return '';
  const t = naverStoreType(url);
  return t === 'unknown'
    ? '상품 주소 형식을 알 수 없음(상세 추출 불가)'
    : `${STORE_TYPE_LABEL[t]} 상품은 상세 추출 미지원`;
}
