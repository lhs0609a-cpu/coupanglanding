/**
 * product.json brand 필드가 실제 브랜드인지 검증.
 * 제외 대상: 프로모션 태그, UI 링크 텍스트("본문으로 바로가기" 등), 문장류.
 *
 * ⚠️ 단일 출처: 클라(대량등록 스캔)와 서버(고시정보 제조자/브랜드 필드)가 같은 기준을 써야 한다.
 *    예전엔 클라에만 있어서, 서버 고시정보 필러가 오염된 brand("본문으로 바로가기")를
 *    제조자(수입자) 필드에 그대로 넣는 문제가 있었다.
 */
export function isValidBrand(brand: string | undefined | null): boolean {
  if (!brand) return false;
  const trimmed = String(brand).trim();
  if (trimmed.length < 2 || trimmed.length > 15) return false; // 너무 길면 UI 문구/설명일 가능성
  // "1+1", "2+1" 등 프로모션 태그 제외
  if (/^\d+\+\d+$/.test(trimmed)) return false;
  // 숫자/특수문자만으로 구성된 것 제외
  if (!/[가-힣a-zA-Z]/.test(trimmed)) return false;
  // UI/네비게이션 문구 블랙리스트 (크롤러가 페이지 링크 텍스트를 잘못 수집하는 케이스)
  const UI_KEYWORDS = [
    '본문', '바로가기', '상세', '페이지', '참조', '뒤로', '메뉴',
    '카테고리', '바로', '이동', '열기', '닫기', '더보기', '보기',
    '홈으로', '처음으로', '목록', '전체', '선택', '장바구니', '구매',
    '공지', '안내', '이벤트', '검색', '로그인', '회원', '주문',
  ];
  if (UI_KEYWORDS.some((w) => trimmed.includes(w))) return false;
  // 공백 2개 이상 = 문장/UI 문구일 가능성 큼 (정상 브랜드는 대부분 공백 0~1개)
  if ((trimmed.match(/\s/g) || []).length >= 2) return false;
  return true;
}
