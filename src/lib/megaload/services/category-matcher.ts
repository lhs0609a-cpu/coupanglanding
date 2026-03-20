// ============================================================
// 카테고리 자동 매칭 서비스 (로컬 DB 우선 3-tier)
// Tier 1: 로컬 DB 토큰 매칭 (coupang-cat-index.json)
// Tier 2: 쿠팡 Predict API
// Tier 3: AI 키워드 추출 → 로컬 DB 재검색
// ============================================================

import { CoupangAdapter } from '../adapters/coupang.adapter';
import { mapCategory } from './ai.service';

// ─── Types ───────────────────────────────────────────────────

export interface CategoryMatchResult {
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  confidence: number;
  source: 'local_db' | 'coupang_api' | 'ai';
}

/** Index entry: [code, tokensString, leafName, depth] */
type IndexEntry = [string, string, string, number];

/** Details entry from coupang-cat-details.json */
interface CategoryDetailRaw {
  p: string;       // full path
  r: number;       // commission rate
  b: { n: string; r: boolean; u?: string; c1?: boolean }[];  // buy options
  s: { n: string; r: boolean; u?: string }[];                 // search options
  nc: string | null; // notice category
}

export interface CategoryDetails {
  path: string;
  commission: number;
  buyOptions: { name: string; required: boolean; unit?: string; choose1?: boolean }[];
  searchOptions: { name: string; required: boolean; unit?: string }[];
  noticeCategory: string | null;
}

// ─── Lazy-loaded data singletons ─────────────────────────────

// JSON 직접 import (Vercel 서버리스 번들링 보장)
import indexJson from '../data/coupang-cat-index.json';
import detailsJson from '../data/coupang-cat-details.json';

let _indexData: IndexEntry[] | null = null;
let _detailsData: Record<string, CategoryDetailRaw> | null = null;

function loadIndex(): IndexEntry[] {
  if (_indexData) return _indexData;
  _indexData = indexJson as IndexEntry[];
  return _indexData;
}

function loadDetails(): Record<string, CategoryDetailRaw> {
  if (_detailsData) return _detailsData;
  _detailsData = detailsJson as unknown as Record<string, CategoryDetailRaw>;
  return _detailsData;
}

// ─── 직접 카테고리 코드 매핑 (최고 우선순위) ─────────────────
// 상품명 토큰 → 쿠팡 displayCategoryCode 직접 매핑
// 토큰 점수 계산 없이 바로 정확한 카테고리로 연결
const DIRECT_CODE_MAP: Record<string, { code: string; path: string }> = {
  // ── 건강식품 > 비타민/미네랄 ──
  '비오틴': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '바이오틴': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '비타민a': { code: '58907', path: '식품>건강식품>비타민/미네랄>비타민A' },
  '비타민b': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b군': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민c': { code: '58909', path: '식품>건강식품>비타민/미네랄>비타민C' },
  '비타민d': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민e': { code: '58911', path: '식품>건강식품>비타민/미네랄>비타민E' },
  '비타민k': { code: '58912', path: '식품>건강식품>비타민/미네랄>비타민K' },
  '멀티비타민': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  '종합비타민': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  '마그네슘': { code: '58931', path: '식품>건강식품>비타민/미네랄>마그네슘' },
  '아연': { code: '58930', path: '식품>건강식품>비타민/미네랄>아연' },
  '셀레늄': { code: '58934', path: '식품>건강식품>비타민/미네랄>셀레늄' },
  '엽산': { code: '102535', path: '식품>건강식품>비타민/미네랄>엽산' },
  '철분': { code: '58922', path: '식품>건강식품>비타민/미네랄>철분' },
  '칼슘': { code: '58921', path: '식품>건강식품>비타민/미네랄>칼슘' },
  '요오드': { code: '58933', path: '식품>건강식품>비타민/미네랄>요오드' },
  '크롬': { code: '102536', path: '식품>건강식품>비타민/미네랄>크롬' },
  // ── 건강식품 > 기타건강식품 ──
  '오메가3': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '오메가': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '밀크씨슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '밀크시슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '루테인': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '유산균': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '프로바이오틱스': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '락토바실러스': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '글루코사민': { code: '58927', path: '식품>건강식품>기타건강식품>글루코사민' },
  '콜라겐': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  '히알루론산': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  '코큐텐': { code: '58972', path: '식품>건강식품>기타건강식품>코엔자임Q10/코큐텐' },
  '코엔자임': { code: '58972', path: '식품>건강식품>기타건강식품>코엔자임Q10/코큐텐' },
  '프로폴리스': { code: '58905', path: '식품>건강식품>기타건강식품>프로폴리스' },
  '스피루리나': { code: '58902', path: '식품>건강식품>기타건강식품>스피루리나' },
  '클로렐라': { code: '58901', path: '식품>건강식품>기타건강식품>클로렐라' },
  '쏘팔메토': { code: '58924', path: '식품>건강식품>기타건강식품>쏘팔메토' },
  '마카': { code: '102530', path: '식품>건강식품>기타건강식품>마카' },
  '보스웰리아': { code: '112304', path: '식품>건강식품>기타건강식품>보스웰리아' },
  '크릴오일': { code: '112307', path: '식품>건강식품>기타건강식품>크릴오일' },
  '폴리코사놀': { code: '58929', path: '식품>건강식품>기타건강식품>폴리코사놀' },
  '알로에': { code: '58938', path: '식품>건강식품>기타건강식품>알로에정/알로에겔' },
  '토코페롤': { code: '58982', path: '식품>건강식품>기타건강식품>토코페롤' },
  '맥주효모': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '감마리놀렌산': { code: '58925', path: '식품>건강식품>기타건강식품>감마리놀렌산' },
  '초록입홍합': { code: '112306', path: '식품>건강식품>기타건강식품>초록입홍합' },
  '레시틴': { code: '102522', path: '식품>건강식품>기타건강식품>레시틴' },
  '레스베라트롤': { code: '102519', path: '식품>건강식품>기타건강식품>레스베라트롤' },
  // ── 건강식품 > 전통건강식품 ──
  '홍삼': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  '홍삼정': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  // ── 건강식품 > 헬스/다이어트 ──
  '프로틴': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '프로틴파우더': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '크레아틴': { code: '73145', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>크레아틴' },
  '아르기닌': { code: '102545', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>L-아르기닌' },
  '가르시니아': { code: '102537', path: '식품>건강식품>헬스/다이어트식품>가르시니아' },
  'bcaa': { code: '102541', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>BCAA' },
  '타우린': { code: '102542', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>타우린' },
  // ── 생활용품 ──
  '화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '주방세제': { code: '63961', path: '생활용품>세제>주방세제>일반주방세제' },
  '섬유유연제': { code: '63950', path: '생활용품>세제>섬유유연제>일반 섬유유연제' },
  // ── 자동차 ──
  '와이퍼': { code: '78710', path: '자동차용품>실외용품>와이퍼>플랫와이퍼' },
  // ── 가구 ──
  '접이식테이블': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  '접이식': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  // ── 식품 ──
  '꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  '벌꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  // ── 가전/디지털 ──
  '충전케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  '데이터케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  // ── 뷰티 ──
  '레티놀': { code: '56171', path: '뷰티>스킨>에센스/세럼/앰플>에센스/세럼' },
  // ── 영문 키워드 (해외직구/영문 상품명 대응) ──
  'vitamin': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  'vitamina': { code: '58907', path: '식품>건강식품>비타민/미네랄>비타민A' },
  'vitaminb': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  'vitaminc': { code: '58909', path: '식품>건강식품>비타민/미네랄>비타민C' },
  'vitamind': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  'vitamind3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  'vitamine': { code: '58911', path: '식품>건강식품>비타민/미네랄>비타민E' },
  'vitamink': { code: '58912', path: '식품>건강식품>비타민/미네랄>비타민K' },
  'omega': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  'lutein': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  'probiotics': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  'collagen': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  'retinol': { code: '56171', path: '뷰티>스킨>에센스/세럼/앰플>에센스/세럼' },
  // ── 숫자 결합형 변형 ──
  '비타민d3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민b2': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b6': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b12': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '오메가369': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  // ── 한글 복합어 (띄어쓰기 없이 붙어서 쓰는 경우) ──
  '프로바이오틱': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '롤화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '롤휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '두루마리': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '미용티슈': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '루테인지아잔틴': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '비타민b컴플렉스': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
};

// ─── 동의어/별칭 사전 (토큰 확장) ────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  // 뷰티
  '선크림': ['선크림', '선로션', '자외선차단'],
  '수분크림': ['수분크림', '데이크림'],
  '레티놀': ['레티놀', '주름개선', '에센스', '세럼'],
  '마스크팩': ['마스크팩', '시트마스크', '시트'],
  '세럼': ['세럼', '에센스'],
  '에센스': ['에센스', '세럼'],
  '린스': ['린스', '컨디셔너'],
  '립밤': ['립밤', '보습', '케어'],
  '파운데이션': ['파운데이션', '리퀴드'],
  '쿠션': ['쿠션', '쿠션파운데이션'],
  // 건강식품 — 비타민/미네랄
  '비오틴': ['비오틴', '바이오틴'],
  '바이오틴': ['바이오틴', '비오틴'],
  '비타민b': ['비타민b', '비타민b군'],
  '오메가3': ['오메가3', '오메가3지방산', '오메가'],
  '프로바이오틱스': ['프로바이오틱스', '유산균'],
  '유산균': ['유산균', '프로바이오틱스'],
  '프로바이오틱': ['프로바이오틱', '프로바이오틱스', '유산균'],
  '락토바실러스': ['락토바실러스', '유산균', '프로바이오틱스'],
  '종합비타민': ['종합비타민', '멀티비타민'],
  '멀티비타민': ['멀티비타민', '종합비타민'],
  '콜라겐': ['콜라겐', '히알루론산', '피쉬콜라겐'],
  '밀크씨슬': ['밀크씨슬', '밀크시슬', '간건강'],
  '프로틴': ['프로틴', '프로틴파우더'],
  '단백질': ['단백질', '프로틴', '프로틴파우더'],
  '코큐텐': ['코큐텐', '코엔자임q10', '코엔자임'],
  '코엔자임': ['코엔자임', '코큐텐', '코엔자임q10'],
  '맥주효모': ['맥주효모', '바이오틴', '비오틴'],
  // 식품
  '아몬드': ['아몬드', '견과류', '일반아몬드'],
  '견과': ['견과류', '견과', '혼합견과', '믹스넛'],
  '꿀': ['벌꿀', '꿀', '일반꿀', '아카시아꿀'],
  '라면': ['라면', '봉지라면'],
  '과자': ['과자', '과자쿠키'],
  // 생활용품
  '화장지': ['화장지', '두루마리', '롤화장지'],
  '휴지': ['화장지', '휴지', '두루마리', '롤화장지'],
  '주방세제': ['주방세제', '식기세척', '일반주방세제'],
  '섬유유연제': ['섬유유연제', '유연제', '일반섬유유연제'],
  '충전케이블': ['충전케이블', '데이터케이블', '충전'],
  // 패션
  '양말': ['양말', '남성양말', '여성양말', '스포츠양말'],
  '슬랙스': ['슬랙스', '정장바지', '팬츠'],
  '청바지': ['청바지', '데님팬츠'],
  // 주방
  '도마': ['도마', '나무도마', '항균도마'],
  '텀블러': ['텀블러', '보온텀블러', '보냉텀블러', '보온보냉텀블러'],
  '냄비': ['냄비', '양수냄비'],
  '프라이팬': ['프라이팬', '일반프라이팬'],
  // 가전
  '보조배터리': ['보조배터리', '휴대용배터리'],
  // 가구/홈
  '이불': ['이불', '차렵이불', '극세사이불'],
  '극세사': ['극세사', '극세사이불', '차렵이불'],
  '커튼': ['커튼', '실커튼', '암막커튼'],
  '카펫': ['카펫', '카페트', '러그'],
  '러그': ['러그', '카페트', '카펫'],
  // 스포츠
  '아령': ['아령', '덤벨', '아령덤벨'],
  '덤벨': ['덤벨', '아령', '아령덤벨'],
  // 자동차
  '와이퍼': ['와이퍼', '와이퍼블레이드', '플랫와이퍼'],
  // 유아동
  '기저귀': ['기저귀', '일회용기저귀'],
  '분유': ['분유', '조제분유'],
};

// ─── 상품명→카테고리명 별칭 (토큰 레벨) ─────────────────────
// 상품명에서 자주 쓰이는 단어 → 쿠팡 카테고리 인덱스의 대응 토큰
// SYNONYM_MAP은 양방향이지만, 여기는 "상품명 토큰 → 카테고리 검색용 토큰"
const PRODUCT_TO_CATEGORY_ALIAS: Record<string, string[]> = {
  '비오틴': ['바이오틴'],
  '맥주효모': ['바이오틴'],
  '밀크씨슬': ['밀크시슬'],
  '코큐텐': ['코엔자임q10'],
  '코엔자임q10': ['코큐텐'],
  '프로바이오틱스': ['유산균'],
  '락토바실러스': ['유산균'],
  '락토바실루스': ['유산균'],
  '멀티비타민': ['종합비타민'],
  '종합비타민': ['멀티비타민'],
  '히알루론산': ['콜라겐'],
  '피쉬콜라겐': ['콜라겐'],
  '어골칼슘': ['칼슘'],
  '헴철': ['철분'],
  '눈건강': ['루테인'],
  '관절': ['글루코사민', '보스웰리아'],
  '간건강': ['밀크시슬'],
  '장건강': ['유산균'],
  '뼈건강': ['칼슘'],
};


// ─── Product name cleaning ───────────────────────────────────

const NOISE_WORDS = new Set([
  // 단위
  'mg', 'mcg', 'iu', 'ml', 'g', 'kg', 'l',
  '정', '개', '병', '통', '캡슐', '포', '박스', '봉', '팩', '세트', '매', '장', '알',
  'ea', 'pcs',
  // 수식어
  '프리미엄', '고함량', '저분자', '먹는', '국내', '해외',
  '추천', '인기', '베스트', '대용량', '소용량', '순수', '천연', '식물성',
  // 프로모션
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  // 일반 서술어
  '함유', '효능', '효과', '예방', '개선', '상품상세참조', '풍성한',
  'new', 'box', 'haccp',
]);

const NOISE_PATTERNS = [
  /^\d+$/, // 순수 숫자
  /^\d+\+\d+$/, // 1+1, 2+1
  /^\d+(개월|일|주)분?$/, // 3개월분
  /^\d+(ml|g|kg|mg|l|ea)$/i, // 500ml, 100g
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/, // 60정, 80개, 30캡슐, 30롤
  /^\d+x\d+$/i, // 3x5, 2X3
  /^\d+%$/, // 3000%
];

/**
 * 상품명을 정리한다:
 * - 중복 단어 제거
 * - 괄호 안 브랜드/판매자명 제거
 * - 단위, 프로모션 텍스트 제거
 */
function cleanProductName(name: string): string {
  let cleaned = name;

  // 괄호 안 텍스트 제거 (브랜드명 등)
  cleaned = cleaned.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');

  // 특수문자 → 공백 (한글, 영문, 숫자 유지)
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  // 단어 분리
  const words = cleaned.split(/\s+/).filter(Boolean);

  // 중복 제거 (순서 유지)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(w);
    }
  }

  return unique.join(' ');
}

/**
 * 상품명에서 의미있는 검색 토큰을 추출한다.
 * 한글 1글자("넥", "목" 등)도 유지 — 복합어 생성에 필요
 * 영문 단일문자는 이전 영문 토큰에 병합 ("Vitamin" + "A" → "vitamina")
 */
function tokenize(productName: string): string[] {
  const cleaned = cleanProductName(productName);
  const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
  const result: string[] = [];

  for (const w of words) {
    if (w.length === 0) continue;

    if (w.length === 1) {
      // 한글 1글자는 유지 (넥, 목, 잇 등 — 복합어 생성에 필요)
      if (/[가-힣]/.test(w)) {
        result.push(w);
      } else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length - 1])) {
        // 영문 단일문자 → 이전 영문 토큰에 병합 ("vitamin" + "a" → "vitamina")
        result[result.length - 1] += w;
      }
      continue;
    }

    if (NOISE_WORDS.has(w)) continue;
    if (NOISE_PATTERNS.some((p) => p.test(w))) continue;
    result.push(w);
  }

  return result;
}

// ─── Tier 1: Local DB matching ──────────────────────────────

const LOCAL_MATCH_THRESHOLD = 12;

interface ScoredEntry {
  entry: IndexEntry;
  score: number;
}

/**
 * 상품 토큰에서 2-gram 복합어 + 동의어 확장을 생성한다.
 * ["넥", "크림"] → ["넥", "크림", "넥크림"]
 * ["선크림"] → ["선크림", "선로션", "자외선차단"] (동의어 확장)
 */
function buildCompoundTokens(tokens: string[]): string[] {
  const compounds = [...tokens];

  // 2-gram 복합어
  for (let i = 0; i < tokens.length - 1; i++) {
    compounds.push(tokens[i] + tokens[i + 1]);
  }

  // 동의어 확장: 토큰과 복합어 모두에서 동의어 검색
  const expanded = [...compounds];
  for (const t of compounds) {
    const synonyms = SYNONYM_MAP[t];
    if (synonyms) {
      for (const syn of synonyms) {
        if (!expanded.includes(syn)) {
          expanded.push(syn);
        }
      }
    }
  }

  // 상품명→카테고리명 별칭 확장 (비오틴→바이오틴 등)
  const withAliases = [...expanded];
  for (const t of expanded) {
    const aliases = PRODUCT_TO_CATEGORY_ALIAS[t];
    if (aliases) {
      for (const alias of aliases) {
        if (!withAliases.includes(alias)) {
          withAliases.push(alias);
        }
      }
    }
  }

  return withAliases;
}

/**
 * 로컬 인덱스에서 토큰 기반 카테고리 매칭.
 *
 * 핵심 개선:
 * 1. 한글 1글자 토큰 유지 ("넥" → "넥크림" 복합어 생성)
 * 2. 카테고리 전체 경로(path) 매칭 — leaf뿐 아니라 부모 카테고리도 봄
 * 3. 다중 경로 레벨 일치 시 가산점 (leaf+parent 모두 매칭 → 훨씬 높은 점수)
 * 4. 2-char 이상 의미 토큰만 leaf 매칭에 사용 (1-char는 복합어 생성용)
 */
async function localMatch(tokens: string[]): Promise<ScoredEntry | null> {
  if (tokens.length === 0) return null;

  const index = loadIndex();
  const tokenSet = new Set(tokens);
  const compoundTokens = buildCompoundTokens(tokens);
  const compoundSet = new Set(compoundTokens);
  // 2글자 이상 의미 토큰
  const meaningfulTokens = tokens.filter(t => t.length >= 2);
  const meaningfulSet = new Set(meaningfulTokens);

  let best: ScoredEntry | null = null;

  for (const entry of index) {
    const [, catTokensStr, leafName, depth] = entry;
    const catTokenList = catTokensStr.split(' ');
    const leafLower = leafName.toLowerCase();
    let score = 0;

    // === 1. Leaf matching ===
    let leafScore = 0;

    // 1a. 정확 일치 (compound 포함): "넥크림" === "넥크림"
    for (const t of compoundTokens) {
      if (t.length >= 2 && t === leafLower) {
        leafScore = 20;
        break;
      }
    }

    if (leafScore === 0) {
      // 1b. "/" 구분 단어 정확 일치
      const leafWords = leafLower.split(/[\/\s]/).map(s => s.trim()).filter(Boolean);
      let wordMatchCount = 0;
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafWords.some(lw => lw === t)) {
          wordMatchCount++;
        }
      }
      if (wordMatchCount > 0) {
        // 여러 leaf 단어 매칭 시 보너스
        leafScore = 6 + wordMatchCount * 3;
      }
    }

    if (leafScore === 0) {
      // 1c. leaf에 토큰 포함 (부분 매칭, 2글자 이상)
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafLower.includes(t)) {
          // 토큰 길이에 따라 점수 차등
          leafScore = Math.min(6, t.length + 1);
          break;
        }
      }
    }

    score += leafScore;

    // === 2. Path token overlap (경로 전체 매칭) ===
    // catTokenList는 경로의 모든 단어 (e.g. ["뷰티", "스킨", "크림", "넥크림"])
    let matchedCatTokens = 0;
    for (const catToken of catTokenList) {
      if (compoundSet.has(catToken) || meaningfulSet.has(catToken)) {
        score += 3;
        matchedCatTokens++;
      }
    }

    // === 3. 다중 레벨 매칭 보너스 (핵심 — 컨텍스트 확인) ===
    // "강아지"+"사료" 둘 다 경로에 있으면 거의 확실한 매칭
    // "사료"만 있고 "강아지"가 없으면 약한 매칭
    if (matchedCatTokens >= 4) {
      score += 25; // 4개 이상 토큰 매칭 = 거의 확실
    } else if (matchedCatTokens >= 3) {
      score += 18;
    } else if (matchedCatTokens >= 2) {
      score += 10;
    }

    // 커버리지: 카테고리 토큰 중 몇 %를 커버하는지
    if (catTokenList.length > 0 && matchedCatTokens > 0) {
      const coverage = matchedCatTokens / catTokenList.length;
      score += Math.round(coverage * 5);
    }

    // Leaf-only match penalty: leaf만 매칭되고 부모 경로는 전혀 안 맞으면 감점
    // (동음이의어 방지: "사료"가 조류/강아지 양쪽에 있을 때 구분)
    if (leafScore > 0 && matchedCatTokens <= 1) {
      score -= 3; // 컨텍스트 없이 leaf만 매칭 = 약한 신호
    }

    // Depth 보너스 (다중 매칭일 때만, 매우 약하게)
    if (matchedCatTokens >= 2) {
      score += Math.round(depth * 0.5);
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best && best.score >= LOCAL_MATCH_THRESHOLD ? best : null;
}

async function buildResultFromIndex(entry: IndexEntry, score: number, maxScore: number): Promise<CategoryMatchResult> {
  const [code, , leafName] = entry;
  const details = loadDetails();
  const detail = details[code];

  return {
    categoryCode: code,
    categoryName: leafName,
    categoryPath: detail?.p || leafName,
    confidence: Math.min(0.95, 0.5 + (score / maxScore) * 0.45),
    source: 'local_db',
  };
}

// ─── Tier 3: AI keyword extraction → Local DB ───────────────

async function aiKeywordMatch(productName: string): Promise<CategoryMatchResult | null> {
  try {
    const aiResult = await mapCategory(productName, '', 'coupang');
    if (aiResult.categoryId) {
      // Verify this category exists in our DB
      const details = loadDetails();
      const detail = details[aiResult.categoryId];
      return {
        categoryCode: aiResult.categoryId,
        categoryName: aiResult.categoryName,
        categoryPath: detail?.p || aiResult.categoryName,
        confidence: aiResult.confidence,
        source: 'ai',
      };
    }
  } catch (err) {
    console.warn('[category-matcher] AI mapping failed:', err instanceof Error ? err.message : err);
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * 상품명으로 쿠팡 카테고리를 자동 매칭한다.
 * 3단계 폴백: 로컬 DB → 쿠팡 Predict API → AI
 */
export async function matchCategory(
  productName: string,
  adapter?: CoupangAdapter,
): Promise<CategoryMatchResult | null> {
  const cleaned = cleanProductName(productName);
  const tokens = tokenize(productName);
  const compoundTokens = buildCompoundTokens(tokens);

  // ── Tier 0: 직접 코드 매핑 (최고 우선순위) ──
  // Pass 1: 원본 토큰 + 2-gram 복합어 우선 (상품명에 직접 등장한 키워드)
  const baseCompounds = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    baseCompounds.push(tokens[i] + tokens[i + 1]);
  }
  const sortedBase = [...baseCompounds].sort((a, b) => b.length - a.length);
  for (const t of sortedBase) {
    const direct = DIRECT_CODE_MAP[t];
    if (direct) {
      return {
        categoryCode: direct.code,
        categoryName: direct.path.split('>').pop() || '',
        categoryPath: direct.path,
        confidence: 0.95,
        source: 'local_db',
      };
    }
  }
  // Pass 2: 동의어/별칭 확장 토큰 (원본에서 못 찾은 경우만)
  const baseSet = new Set(baseCompounds);
  const sortedExpanded = [...compoundTokens]
    .filter((t) => !baseSet.has(t))
    .sort((a, b) => b.length - a.length);
  for (const t of sortedExpanded) {
    const direct = DIRECT_CODE_MAP[t];
    if (direct) {
      return {
        categoryCode: direct.code,
        categoryName: direct.path.split('>').pop() || '',
        categoryPath: direct.path,
        confidence: 0.95,
        source: 'local_db',
      };
    }
  }

  // ── Tier 1: Local DB matching ──
  const localResult = await localMatch(tokens);
  if (localResult) {
    // High-confidence local match
    const result = await buildResultFromIndex(
      localResult.entry,
      localResult.score,
      Math.max(localResult.score, 20),
    );
    return result;
  }

  // ── Tier 1.5: Coupang Category Search API ──
  // 의미있는 토큰으로 쿠팡 카테고리 검색 (Predict API보다 키워드 검색이 더 정확)
  if (adapter) {
    const searchTokens = tokens.filter(t => t.length >= 2 && !NOISE_WORDS.has(t));
    // 가장 의미있는 토큰(길이 기준) 최대 2개로 검색
    const sortedByLen = [...searchTokens].sort((a, b) => b.length - a.length);
    const searchKeywords = sortedByLen.slice(0, 2);

    for (const keyword of searchKeywords) {
      try {
        const searchResult = await adapter.searchCategory(keyword);
        if (searchResult.items.length > 0) {
          const bestMatch = searchResult.items[0];
          const details = loadDetails();
          const detail = details[bestMatch.id];
          if (detail) {
            return {
              categoryCode: bestMatch.id,
              categoryName: bestMatch.name,
              categoryPath: detail.p || bestMatch.path || bestMatch.name,
              confidence: 0.88,
              source: 'coupang_api',
            };
          }
        }
      } catch (err) {
        console.warn('[category-matcher] Coupang Search API failed for keyword:', keyword, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Tier 2: Coupang Predict API ──
  if (adapter) {
    try {
      const apiResult = await adapter.autoCategorize(cleaned);
      if (apiResult?.predictedCategoryId) {
        const details = loadDetails();
        const detail = details[apiResult.predictedCategoryId];
        return {
          categoryCode: apiResult.predictedCategoryId,
          categoryName: apiResult.predictedCategoryName,
          categoryPath: detail?.p || apiResult.predictedCategoryName,
          confidence: 0.85,
          source: 'coupang_api',
        };
      }
    } catch (err) {
      console.warn('[category-matcher] Coupang Predict API failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── Tier 3: AI keyword extraction → Local DB ──
  const aiResult = await aiKeywordMatch(productName);
  if (aiResult) return aiResult;

  return null;
}

/**
 * 배치 카테고리 매칭 — 로컬 DB 우선 + 교차 상품 빈도 분석
 *
 * 1. 전체 상품을 로컬 DB로 먼저 매칭 (API 호출 0)
 * 2. 미매칭 상품만 배치 키워드 분석 → Coupang API
 * 3. 나머지 개별 폴백
 */
export async function matchCategoryBatch(
  productNames: string[],
  adapter?: CoupangAdapter,
): Promise<(CategoryMatchResult | null)[]> {
  const results: (CategoryMatchResult | null)[] = new Array(productNames.length).fill(null);
  const cache = new Map<string, CategoryMatchResult | null>();

  // === Phase 1: Tier 0 (DIRECT_CODE_MAP) + 로컬 DB 일괄 매칭 ===
  const productTokensList: string[][] = productNames.map((name) => tokenize(name));
  const unmatchedIndices: number[] = [];

  for (let i = 0; i < productNames.length; i++) {
    // Tier 0: 직접 코드 매핑 (배치에서도 최우선 적용)
    // Pass 1: 원본 토큰 + 2-gram 복합어 우선
    const toks = productTokensList[i];
    const baseComps: string[] = [...toks];
    for (let j = 0; j < toks.length - 1; j++) {
      baseComps.push(toks[j] + toks[j + 1]);
    }
    let directMatched = false;
    const sortedBase = [...baseComps].sort((a, b) => b.length - a.length);
    for (const t of sortedBase) {
      const direct = DIRECT_CODE_MAP[t];
      if (direct) {
        results[i] = {
          categoryCode: direct.code,
          categoryName: direct.path.split('>').pop() || '',
          categoryPath: direct.path,
          confidence: 0.95,
          source: 'local_db',
        };
        directMatched = true;
        break;
      }
    }
    // Pass 2: 동의어/별칭 확장 토큰
    if (!directMatched) {
      const compoundTokens = buildCompoundTokens(toks);
      const baseSet = new Set(baseComps);
      const sortedExpanded = [...compoundTokens]
        .filter((t) => !baseSet.has(t))
        .sort((a, b) => b.length - a.length);
      for (const t of sortedExpanded) {
        const direct = DIRECT_CODE_MAP[t];
        if (direct) {
          results[i] = {
            categoryCode: direct.code,
            categoryName: direct.path.split('>').pop() || '',
            categoryPath: direct.path,
            confidence: 0.95,
            source: 'local_db',
          };
          directMatched = true;
          break;
        }
      }
    }
    if (directMatched) continue;

    // Tier 1: 로컬 DB 토큰 매칭
    const localResult = await localMatch(productTokensList[i]);
    if (localResult) {
      results[i] = await buildResultFromIndex(
        localResult.entry,
        localResult.score,
        Math.max(localResult.score, 20),
      );
    } else {
      unmatchedIndices.push(i);
    }
  }

  // 전부 로컬 매칭 완료 시 바로 반환
  if (unmatchedIndices.length === 0) return results;

  // === Phase 2: 미매칭 상품 — 교차 Document Frequency 분석 → API ===
  if (adapter && unmatchedIndices.length > 0) {
    // 미매칭 상품의 토큰 DF 분석
    const docFreq = new Map<string, number>();
    for (const idx of unmatchedIndices) {
      const unique = new Set(productTokensList[idx]);
      for (const w of unique) {
        docFreq.set(w, (docFreq.get(w) || 0) + 1);
      }
    }

    const sortedByDF = [...docFreq.entries()].sort((a, b) => b[1] - a[1]);

    // DF >= 30% (최소 2개)인 단어 = 배치 레벨 카테고리 키워드
    const threshold = Math.max(2, Math.floor(unmatchedIndices.length * 0.3));
    const batchKeywords = sortedByDF
      .filter(([, count]) => count >= threshold)
      .map(([word]) => word);

    // 각 배치 키워드의 대표 상품으로 API 호출
    for (const batchKw of batchKeywords) {
      if (cache.has(batchKw)) continue;

      // 대표 상품 선택
      let bestIdx = -1;
      let bestPos = Infinity;
      for (const idx of unmatchedIndices) {
        const pos = productTokensList[idx].indexOf(batchKw);
        if (pos >= 0 && pos < bestPos) {
          bestPos = pos;
          bestIdx = idx;
        }
      }
      if (bestIdx < 0) continue;

      try {
        const result = await matchCategory(productNames[bestIdx], adapter);
        cache.set(batchKw, result);
      } catch (err) {
        console.warn('[category-matcher] Batch keyword match failed:', batchKw, err instanceof Error ? err.message : err);
        cache.set(batchKw, null);
      }

      await delay(300);
    }

    // 배치 키워드 결과를 해당 미매칭 상품에 분배
    for (const idx of unmatchedIndices) {
      if (results[idx]) continue; // 이미 매칭됨

      const tokens = new Set(productTokensList[idx]);
      for (const batchKw of batchKeywords) {
        if (tokens.has(batchKw) && cache.has(batchKw) && cache.get(batchKw)) {
          results[idx] = cache.get(batchKw)!;
          break;
        }
      }
    }
  }

  // === Phase 3: 여전히 미매칭인 상품 — 개별 폴백 ===
  for (let i = 0; i < results.length; i++) {
    if (results[i]) continue;

    const keywords = extractKeywords(productNames[i]);
    const primaryKey = keywords[0];

    if (cache.has(primaryKey)) {
      results[i] = cache.get(primaryKey) ?? null;
      continue;
    }

    try {
      const result = await matchCategory(productNames[i], adapter);
      cache.set(primaryKey, result);
      results[i] = result;
    } catch (err) {
      console.warn('[category-matcher] Individual match failed:', productNames[i], err instanceof Error ? err.message : err);
      cache.set(primaryKey, null);
    }

    await delay(300);
  }

  return results;
}

/**
 * 카테고리 코드로 상세 정보를 조회한다 (옵션 채우기용).
 * coupang-cat-details.json에서 조회.
 */
export async function getCategoryDetails(code: string): Promise<CategoryDetails | null> {
  const details = loadDetails();
  const raw = details[code];
  if (!raw) return null;

  return {
    path: raw.p,
    commission: raw.r,
    buyOptions: raw.b.map((o) => ({
      name: o.n,
      required: o.r,
      unit: o.u,
      choose1: o.c1,
    })),
    searchOptions: raw.s.map((o) => ({
      name: o.n,
      required: o.r,
      unit: o.u,
    })),
    noticeCategory: raw.nc,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 상품명에서 검색용 키워드를 빈도 기반으로 추출한다 (단일 상품용).
 */
function extractKeywords(productName: string): string[] {
  const meaningful = tokenize(productName);

  if (meaningful.length === 0) {
    const words = productName
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 2);
    return words.length > 0 ? [words.join(' ')] : [productName.slice(0, 10)];
  }

  // 빈도 계산
  const freq = new Map<string, number>();
  for (const w of meaningful) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // 빈도순 정렬
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  const top = sorted[0];
  const second = sorted[1];
  const keywords: string[] = [top];

  if (second) {
    keywords.push(`${top} ${second}`);
  }

  const koreanOther = sorted.find((w) => w !== top && /[가-힣]/.test(w));
  if (koreanOther) {
    const combo = `${koreanOther} ${top}`;
    if (!keywords.includes(combo)) {
      keywords.push(combo);
    }
  }

  return keywords;
}
