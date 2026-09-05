/**
 * 네이버 상품 URL 의 스토어 유형 — "이 주소에서 상세를 뽑을 수 있는가"를 한 곳에서 판정한다.
 *
 * ★ 왜 필요한가(실측 2026-08-20, 프로덕션 59건):
 *     smartstore.naver.com/main/...            done 5 · failed 0
 *     shopping.naver.com/market/...            done 0 · running 1 (7분째 멈춤)
 *     shopping.naver.com/window-products/...   done 0 · failed 2
 *   추출기는 채널ID 와 API 접두사를 **스마트스토어·브랜드스토어 두 호스트 기준으로만** 찾는다
 *   (worker/desktop/main/modules/naver-ingest/detail-extract.mjs). 마켓·윈도는 그 규칙에 없어
 *   채널ID 를 못 잡고, 재시도 6회 × 캡차 대기까지 겹쳐 몇 분씩 매달린 끝에 실패한다.
 *   그동안 화면은 "상세 준비 중"만 보여 줘서, 셀러는 몇 번을 눌러도 같은 안내만 받았다.
 *
 * 지원 범위가 넓어지면 **이 파일만** 고치면 된다(웹·서버·도우미가 같은 판정을 쓴다.
 * 도우미는 ESM 이라 같은 규칙을 store-type.mjs 에 그대로 둔다 — 고칠 때 둘 다 고칠 것).
 */

export type NaverStoreType = 'smartstore' | 'brand' | 'market' | 'window' | 'unknown';

export const STORE_TYPE_LABEL: Record<NaverStoreType, string> = {
  smartstore: '스마트스토어',
  brand: '브랜드스토어',
  market: '네이버 마켓',
  window: '쇼핑윈도',
  unknown: '알 수 없는 유형',
};

/** URL 파싱 실패(빈 값·상대경로)도 흔하므로 new URL 대신 문자열 규칙으로 본다. */
export function naverStoreType(url: string | null | undefined): NaverStoreType {
  const u = String(url || '');
  if (/(?:^|\/\/|\.)smartstore\.naver\.com\//.test(u)) return 'smartstore';
  if (/(?:^|\/\/|\.)brand\.naver\.com\//.test(u)) return 'brand';
  if (/shopping\.naver\.com\/window-products\//.test(u)) return 'window';
  if (/shopping\.naver\.com\/market\//.test(u)) return 'market';
  return 'unknown';
}

/** 상세(옵션·상세글·고시정보·이미지)를 뽑을 수 있는 주소인가. */
export function isDetailExtractable(url: string | null | undefined): boolean {
  const t = naverStoreType(url);
  return t === 'smartstore' || t === 'brand';
}

/** 왜 못 뽑는지 — 화면에 그대로 띄우는 문구다(빈 문자열이면 뽑을 수 있다는 뜻). */
export function unsupportedReason(url: string | null | undefined): string {
  if (isDetailExtractable(url)) return '';
  const t = naverStoreType(url);
  return t === 'unknown'
    ? '상품 주소 형식을 알 수 없어 상세를 가져올 수 없습니다.'
    : `${STORE_TYPE_LABEL[t]} 상품은 아직 상세를 가져올 수 없습니다.`;
}
