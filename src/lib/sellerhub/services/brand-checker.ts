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
