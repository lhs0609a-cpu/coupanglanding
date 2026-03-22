// ============================================================
// 노출상품명(displayProductName) 랜덤 템플릿 생성기
//
// 아이템 위너 방지: 같은 상품이라도 셀러마다 다른 노출상품명.
// 쿠팡 SEO 최적화: 카테고리별 검색 키워드 + 형용사 조합.
// AI 없이 로컬에서 즉시 생성, 결정적 (같은 시드 → 같은 결과).
// ============================================================

import { createSeededRandom, stringToSeed } from './seeded-random';
import poolsData from '../data/display-name-pools.json';

// ─── 카테고리별 형용사/수식어 + 효능/특징 풀 (JSON에서 로드) ──
// 카테고리당 100개씩, 총 1,400+ 형용사 / 1,000+ 효능 키워드

const ADJECTIVE_POOL: Record<string, string[]> = poolsData.adjectives;
const FEATURE_POOL: Record<string, string[]> = poolsData.features;

// ─── 템플릿 패턴 ─────────────────────────────────────────────

type TemplateSlot = 'adj' | 'brand' | 'type' | 'spec' | 'kw' | 'feat';

const TEMPLATES: TemplateSlot[][] = [
  ['adj', 'brand', 'type', 'spec', 'feat'],           // 촉촉한 브랜드 넥크림 200ml 수분충전
  ['brand', 'adj', 'type', 'spec', 'kw'],              // 브랜드 촉촉한 넥크림 200ml 넥케어
  ['type', 'spec', 'brand', 'adj', 'feat'],             // 넥크림 200ml 브랜드 촉촉한 수분충전
  ['adj', 'type', 'spec', 'kw', 'brand'],               // 촉촉한 넥크림 200ml 넥케어 브랜드
  ['brand', 'type', 'adj', 'feat', 'spec'],             // 브랜드 넥크림 촉촉한 수분충전 200ml
  ['kw', 'adj', 'brand', 'type', 'spec'],               // 넥케어 촉촉한 브랜드 넥크림 200ml
  ['adj', 'kw', 'type', 'brand', 'spec'],               // 촉촉한 넥케어 넥크림 브랜드 200ml
  ['spec', 'brand', 'adj', 'type', 'feat'],             // 200ml 브랜드 촉촉한 넥크림 수분충전
];

// ─── 상품명 파서 ─────────────────────────────────────────────

interface ParsedName {
  brand: string;
  productType: string;
  specs: string[];
  keywords: string[];
}

const SPEC_PATTERN = /\d+\s*(ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE_WORDS = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '국내', '해외', '추천', '인기', '베스트', '상품상세참조',
]);

function parseName(originalName: string, brand: string): ParsedName {
  // 괄호 제거
  let cleaned = originalName.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  // 특수문자 제거
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  // spec 추출
  const specs: string[] = [];
  const specMatches = cleaned.match(SPEC_PATTERN);
  if (specMatches) specs.push(...specMatches.map(s => s.trim()));

  // spec 제거한 나머지
  const withoutSpecs = cleaned.replace(SPEC_PATTERN, ' ');
  const words = withoutSpecs.split(/\s+/).filter(w => w.length >= 2 && !NOISE_WORDS.has(w.toLowerCase()));

  // 브랜드 제거
  const brandLower = brand.toLowerCase();
  const filtered = words.filter(w => w.toLowerCase() !== brandLower);

  // 중복 제거
  const seen = new Set<string>();
  const unique = filtered.filter(w => {
    const l = w.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  // 첫 번째 단어를 productType으로, 나머지를 keywords로
  const productType = unique[0] || '';
  const keywords = unique.slice(1);

  return { brand: brand || '', productType, specs: specs.slice(0, 2), keywords };
}

// ─── 카테고리 대분류 추출 ────────────────────────────────────

function getCategoryTop(categoryPath: string): string {
  const top = categoryPath.split('>')[0]?.trim() || '';
  // 풀에 있는 키로 매핑
  for (const key of Object.keys(ADJECTIVE_POOL)) {
    if (top === key || top.includes(key.split('/')[0])) return key;
  }
  return '생활용품'; // 기본값
}

// ─── 공개 API ────────────────────────────────────────────────

/**
 * 랜덤 노출상품명 생성
 * @param originalName 원본 상품명
 * @param brand 브랜드
 * @param categoryPath 쿠팡 카테고리 경로
 * @param sellerSeed 셀러 고유 시드 (같은 시드 → 같은 결과)
 * @param productIndex 상품 인덱스 (배치 내 순번)
 */
export function generateDisplayName(
  originalName: string,
  brand: string,
  categoryPath: string,
  sellerSeed: string,
  productIndex: number,
): string {
  const parsed = parseName(originalName, brand);
  const catTop = getCategoryTop(categoryPath);
  const adjectives = ADJECTIVE_POOL[catTop] || ADJECTIVE_POOL['생활용품'];
  const features = FEATURE_POOL[catTop] || FEATURE_POOL['생활용품'] || [];

  // 시드 기반 RNG
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);

  // 템플릿 선택
  const template = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];

  // 형용사 2개 선택 (서로 다른 것)
  const adjIdx1 = Math.floor(rng() * adjectives.length);
  let adjIdx2 = Math.floor(rng() * (adjectives.length - 1));
  if (adjIdx2 >= adjIdx1) adjIdx2++;
  const adj1 = adjectives[adjIdx1];
  const adj2 = adjectives[adjIdx2];

  // 효능 1개 선택
  const feat = features.length > 0 ? features[Math.floor(rng() * features.length)] : '';
  // 키워드 1개 선택
  const kw = parsed.keywords.length > 0 ? parsed.keywords[Math.floor(rng() * parsed.keywords.length)] : '';

  // 템플릿 조합 — adj 슬롯에 형용사 2개 조합
  const parts: string[] = [];
  for (const slot of template) {
    switch (slot) {
      case 'adj': parts.push(adj1); parts.push(adj2); break;
      case 'brand': if (parsed.brand) parts.push(parsed.brand); break;
      case 'type': if (parsed.productType) parts.push(parsed.productType); break;
      case 'spec': if (parsed.specs.length > 0) parts.push(parsed.specs.join(' ')); break;
      case 'kw': if (kw) parts.push(kw); break;
      case 'feat': if (feat) parts.push(feat); break;
    }
  }

  // 빈 슬롯 제거 + 중복 제거 + 100자 제한
  const seen = new Set<string>();
  const deduplicated = parts.filter(p => {
    const l = p.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  let result = deduplicated.join(' ').trim();

  // 100자 초과 시 마지막 단어부터 제거
  while (result.length > 100 && deduplicated.length > 2) {
    deduplicated.pop();
    result = deduplicated.join(' ').trim();
  }

  return result || originalName.slice(0, 100);
}

/**
 * 배치 노출상품명 생성
 */
export function generateDisplayNameBatch(
  products: { originalName: string; brand: string; categoryPath: string }[],
  sellerSeed: string,
): string[] {
  return products.map((p, i) => generateDisplayName(p.originalName, p.brand, p.categoryPath, sellerSeed, i));
}
