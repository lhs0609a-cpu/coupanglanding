// Known protected brands (partial list — expand as needed)
const PROTECTED_BRANDS = [
  // Global
  'Nike', 'Adidas', 'Gucci', 'Louis Vuitton', 'Chanel', 'Prada', 'Hermes',
  'Apple', 'Samsung', 'Sony', 'Nintendo', 'Disney', 'Marvel', 'Lego',
  'Rolex', 'Omega', 'Cartier', 'Tiffany', 'Burberry', 'Dior', 'Fendi',
  'Balenciaga', 'Versace', 'Armani', 'Valentino', 'YSL', 'Celine',
  'Under Armour', 'New Balance', 'Converse', 'Vans', 'Puma', 'Reebok',
  'North Face', 'Columbia', 'Patagonia', 'Canada Goose', 'Moncler',
  // Korean
  '나이키', '아디다스', '구찌', '루이비통', '샤넬', '프라다', '에르메스',
  '삼성', '애플', '소니', '닌텐도', '디즈니', '마블', '레고',
  '롤렉스', '오메가', '까르띠에', '티파니', '버버리', '디올',
  '발렌시아가', '베르사체', '아르마니', '발렌티노',
  '노스페이스', '컬럼비아', '파타고니아', '캐나다구스', '몽클레르',
];

// 쿠팡 brand 필드에 brandId 없이 보내면 거부되는 등록 보호 브랜드.
// (위 PROTECTED_BRANDS 는 지재권 침해 탐지용 — 여기엔 등록 거부를 유발하는
//  한국 대기업/제조사 브랜드를 추가로 모음. slice(0,2) 충돌 케이스 포함:
//  "현대농산"→"현대", "삼성전자"→"삼성", "엘지생건"→"엘지" 등.)
const COUPANG_BRANDID_REQUIRED = [
  '현대', '기아', '삼성', '엘지', 'lg', 'sk', 'gs', '롯데', '한화', '두산',
  '농심', '오뚜기', '풀무원', 'cj', '청정원', '대상', '동원', '해태', '오리온',
  '빙그레', '매일', '남양', '서울우유', '하림', '동서', '광동', '정관장',
  '아모레', '아모레퍼시픽', 'lg생활건강', '애경', '유한양행', '한미',
  '코카콜라', '펩시', '나이키', '아디다스', '애플', '소니',
];

/**
 * 쿠팡 등록 시 brandId 없이는 사용할 수 없는(거부되는) 브랜드명인지 판별.
 * brand 필드 전송 직전 가드용. 대소문자 무시 + 토큰 정확/접두 매칭.
 */
export function isProtectedCoupangBrand(name?: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (!n) return false;
  for (const b of COUPANG_BRANDID_REQUIRED) {
    const bl = b.toLowerCase();
    // 정확 일치 또는 "현대" + 비한글경계 시작(예: "현대농산"은 위에서 slice 되지만, 원문도 차단)
    if (n === bl || n.startsWith(bl)) return true;
  }
  for (const b of PROTECTED_BRANDS) {
    if (n === b.toLowerCase()) return true;
  }
  return false;
}

export interface BrandCheckResult {
  result: 'safe' | 'warning' | 'blocked';
  matchedBrands: string[];
  message: string;
}

export function checkBrandProtection(
  title: string,
  description?: string
): BrandCheckResult {
  const textToCheck = `${title} ${description || ''}`.toLowerCase();
  const matchedBrands: string[] = [];

  for (const brand of PROTECTED_BRANDS) {
    if (textToCheck.includes(brand.toLowerCase())) {
      matchedBrands.push(brand);
    }
  }

  if (matchedBrands.length === 0) {
    return { result: 'safe', matchedBrands: [], message: '브랜드 침해 위험 없음' };
  }

  // Check if it's high-risk (luxury brands)
  const highRiskBrands = ['Gucci', 'Louis Vuitton', 'Chanel', 'Prada', 'Hermes', 'Rolex', 'Dior', 'Balenciaga'];
  const isHighRisk = matchedBrands.some((b) =>
    highRiskBrands.some((hr) => b.toLowerCase() === hr.toLowerCase())
  );

  if (isHighRisk) {
    return {
      result: 'blocked',
      matchedBrands,
      message: `지재권 보호 브랜드 감지: ${matchedBrands.join(', ')}. 등록이 차단되었습니다.`,
    };
  }

  return {
    result: 'warning',
    matchedBrands,
    message: `브랜드 감지: ${matchedBrands.join(', ')}. 정품 인증 없이 판매 시 법적 문제가 발생할 수 있습니다.`,
  };
}
