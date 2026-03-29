const fs = require('fs');
const path = require('path');

// Read the category-matcher source to extract the maps
const matcherPath = path.join(__dirname, '../src/lib/megaload/services/category-matcher.ts');
const matcherContent = fs.readFileSync(matcherPath, 'utf8');

// Extract DIRECT_CODE_MAP
const directMapMatch = matcherContent.match(/const DIRECT_CODE_MAP[^=]*=\s*{([\s\S]*?)^};/m);
if (!directMapMatch) {
  console.error('Could not find DIRECT_CODE_MAP');
  process.exit(1);
}

console.log('Found DIRECT_CODE_MAP, generating test script...');

// Generate test script
const testScript = `/**
 * 카테고리 매칭 테스트 스크립트
 * 
 * DIRECT_CODE_MAP의 모든 카테고리에 대해 실제 상품명처럼 생성된 테스트 케이스를 검증한다.
 */

// DIRECT_CODE_MAP extracted from category-matcher.ts
const DIRECT_CODE_MAP = {${directMapMatch[1]}};

// SYNONYM_MAP
const SYNONYM_MAP = {
  '비오틴': ['비오틴', '바이오틴'],
  '바이오틴': ['바이오틴', '비오틴'],
  '비타민b': ['비타민b', '비타민b군'],
  '오메가3': ['오메가3', '오메가3지방산', '오메가'],
  '프로바이오틱스': ['프로바이오틱스', '유산균'],
  '유산균': ['유산균', '프로바이오틱스'],
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
  '화장지': ['화장지', '두루마리', '롤화장지'],
  '휴지': ['화장지', '휴지', '두루마리', '롤화장지'],
  '주방세제': ['주방세제', '식기세척', '일반주방세제'],
  '섬유유연제': ['섬유유연제', '유연제', '일반섬유유연제'],
  '충전케이블': ['충전케이블', '데이터케이블', '충전'],
  '꿀': ['벌꿀', '꿀', '일반꿀', '아카시아꿀'],
};

const PRODUCT_TO_CATEGORY_ALIAS = {
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
};

const NOISE_WORDS = new Set([
  'mg', 'mcg', 'iu', 'ml', 'g', 'kg', 'l',
  '정', '개', '병', '통', '캡슐', '포', '박스', '봉', '팩', '세트', '매', '장', '알',
  'ea', 'pcs',
  '프리미엄', '고함량', '저분자', '먹는', '국내', '해외',
  '추천', '인기', '베스트', '대용량', '소용량', '순수', '천연', '식물성',
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '함유', '효능', '효과', '예방', '개선', '상품상세참조', '풍성한',
  'new', 'box', 'haccp',
]);

const NOISE_PATTERNS = [
  /^\d+$/,
  /^\d+\+\d+$/,
  /^\d+(개월|일|주)분?$/,
  /^\d+(ml|g|kg|mg|l|ea)$/i,
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레)$/,
  /^\d+x\d+$/i,
  /^\d+%$/,
];

function cleanProductName(name) {
  let cleaned = name;
  cleaned = cleaned.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(w);
    }
  }
  return unique.join(' ');
}

function tokenize(productName) {
  const cleaned = cleanProductName(productName);
  return cleaned
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => {
      if (w.length === 0) return false;
      if (w.length === 1) return /[가-힣]/.test(w);
      if (NOISE_WORDS.has(w)) return false;
      if (NOISE_PATTERNS.some((p) => p.test(w))) return false;
      return true;
    });
}

function buildCompoundTokens(tokens) {
  const compounds = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    compounds.push(tokens[i] + tokens[i + 1]);
  }
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

function matchDirect(productName) {
  const tokens = tokenize(productName);
  const compoundTokens = buildCompoundTokens(tokens);
  for (const t of compoundTokens) {
    const direct = DIRECT_CODE_MAP[t];
    if (direct) {
      return {
        categoryCode: direct.code,
        categoryPath: direct.path,
        matchedToken: t,
      };
    }
  }
  return null;
}

console.log('Test script loaded successfully');
console.log('Total categories in DIRECT_CODE_MAP:', Object.keys(DIRECT_CODE_MAP).length);
`;

fs.writeFileSync('test-category-matching.cjs', testScript, 'utf8');
console.log('Generated test-category-matching.cjs');
