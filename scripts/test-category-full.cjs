// ============================================================
// 전체 카테고리 매칭 테스트 (52개 카테고리 × 30개 상품 = 1,560건)
// category-matcher.ts의 Tier 0 (DIRECT_CODE_MAP) 로직 검증
// ============================================================

// ── DIRECT_CODE_MAP (category-matcher.ts와 동일) ──
const DIRECT_CODE_MAP = {
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
  '오메가3': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '오메가': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '밀크씨슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '밀크시슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '루테인': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '유산균': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '프로바이오틱스': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '프로바이오틱': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
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
  '홍삼': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  '홍삼정': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  '프로틴': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '프로틴파우더': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '크레아틴': { code: '73145', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>크레아틴' },
  '아르기닌': { code: '102545', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>L-아르기닌' },
  '가르시니아': { code: '102537', path: '식품>건강식품>헬스/다이어트식품>가르시니아' },
  'bcaa': { code: '102541', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>BCAA' },
  '타우린': { code: '102542', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>타우린' },
  '화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '주방세제': { code: '63961', path: '생활용품>세제>주방세제>일반주방세제' },
  '섬유유연제': { code: '63950', path: '생활용품>세제>섬유유연제>일반 섬유유연제' },
  '와이퍼': { code: '78710', path: '자동차용품>실외용품>와이퍼>플랫와이퍼' },
  '접이식테이블': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  '접이식': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  '꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  '벌꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  '충전케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  '데이터케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  '레티놀': { code: '56171', path: '뷰티>스킨>에센스/세럼/앰플>에센스/세럼' },
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
  '비타민d3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민b2': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b6': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b12': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '오메가369': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '롤화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '롤휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '두루마리': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '미용티슈': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '루테인지아잔틴': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '비타민b컴플렉스': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
};

const SYNONYM_MAP = {
  '비오틴': ['비오틴', '바이오틴'],
  '바이오틴': ['바이오틴', '비오틴'],
  '비타민b': ['비타민b', '비타민b군'],
  '오메가3': ['오메가3', '오메가'],
  '프로바이오틱스': ['프로바이오틱스', '유산균'],
  '프로바이오틱': ['프로바이오틱', '프로바이오틱스', '유산균'],
  '유산균': ['유산균', '프로바이오틱스'],
  '락토바실러스': ['락토바실러스', '유산균'],
  '맥주효모': ['맥주효모', '바이오틴'],
  '화장지': ['화장지', '두루마리'],
};

const PRODUCT_TO_CATEGORY_ALIAS = {
  '비오틴': ['바이오틴'],
  '맥주효모': ['바이오틴'],
  '프로바이오틱스': ['유산균'],
  '프로바이오틱': ['유산균'],
  '락토바실러스': ['유산균'],
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
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/,
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
    if (!seen.has(lower)) { seen.add(lower); unique.push(w); }
  }
  return unique.join(' ');
}

function tokenize(productName) {
  const cleaned = cleanProductName(productName);
  const words = cleaned.split(/\s+/).map(w => w.toLowerCase());
  const result = [];
  for (const w of words) {
    if (w.length === 0) continue;
    if (w.length === 1) {
      if (/[가-힣]/.test(w)) { result.push(w); }
      else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length - 1])) {
        result[result.length - 1] += w;
      }
      continue;
    }
    if (NOISE_WORDS.has(w)) continue;
    if (NOISE_PATTERNS.some(p => p.test(w))) continue;
    result.push(w);
  }
  return result;
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
        if (!expanded.includes(syn)) expanded.push(syn);
      }
    }
  }
  const withAliases = [...expanded];
  for (const t of expanded) {
    const aliases = PRODUCT_TO_CATEGORY_ALIAS[t];
    if (aliases) {
      for (const alias of aliases) {
        if (!withAliases.includes(alias)) withAliases.push(alias);
      }
    }
  }
  return withAliases;
}

function matchDirect(name) {
  const tokens = tokenize(name);
  // Pass 1: 원본 토큰 + 2-gram 복합어 우선
  const baseComps = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    baseComps.push(tokens[i] + tokens[i + 1]);
  }
  const sortedBase = [...baseComps].sort((a, b) => b.length - a.length);
  for (const t of sortedBase) {
    const direct = DIRECT_CODE_MAP[t];
    if (direct) return { categoryCode: direct.code, categoryPath: direct.path, matchedToken: t, tokens };
  }
  // Pass 2: 동의어/별칭 확장 토큰
  const compounds = buildCompoundTokens(tokens);
  const baseSet = new Set(baseComps);
  const sortedExpanded = [...compounds].filter(t => !baseSet.has(t)).sort((a, b) => b.length - a.length);
  for (const t of sortedExpanded) {
    const direct = DIRECT_CODE_MAP[t];
    if (direct) return { categoryCode: direct.code, categoryPath: direct.path, matchedToken: t, tokens };
  }
  return null;
}

// ── 테스트 데이터 로드 ──
const { generateAll } = require('./test-full-data.cjs');
const TEST_CASES = generateAll();

// ── 테스트 실행 ──
function runTests() {
  console.log('='.repeat(80));
  console.log('전체 카테고리 매칭 테스트 — 52개 카테고리 × 30개 상품');
  console.log('='.repeat(80));
  console.log('');

  let total = 0, passed = 0;
  const failures = [];
  const catResults = [];

  for (const [catLabel, data] of Object.entries(TEST_CASES)) {
    let catPassed = 0;

    for (const p of data.products) {
      total++;
      const result = matchDirect(p);

      if (result && result.categoryCode === data.code) {
        catPassed++;
        passed++;
      } else {
        const tokens = tokenize(p);
        const compounds = buildCompoundTokens(tokens);
        failures.push({
          category: catLabel,
          expected: data.code,
          product: p,
          actual: result ? result.categoryCode : 'NO_MATCH',
          matchedToken: result ? result.matchedToken : '-',
          tokens,
          compounds: compounds.slice(0, 15),
        });
      }
    }

    const status = catPassed === data.products.length ? '✅' : '❌';
    catResults.push({ label: catLabel, passed: catPassed, total: data.products.length, status });
    console.log(`${status} ${catLabel}: ${catPassed}/${data.products.length}`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log(`SUMMARY: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}%)`);
  console.log('='.repeat(80));

  // 실패 카테고리 상세
  const failedCats = catResults.filter(c => c.passed < c.total);
  if (failedCats.length > 0) {
    console.log(`\n실패 카테고리: ${failedCats.length}개`);
    for (const c of failedCats) {
      console.log(`  ${c.label}: ${c.passed}/${c.total}`);
    }
  }

  // 실패 상세 (최대 50개까지 출력)
  if (failures.length > 0) {
    console.log(`\nFAILURES: ${failures.length}건`);
    console.log('-'.repeat(80));
    const showCount = Math.min(failures.length, 50);
    for (let i = 0; i < showCount; i++) {
      const f = failures[i];
      console.log(`[${f.category}] ${f.product}`);
      console.log(`  tokens: [${f.tokens.join(', ')}]`);
      console.log(`  expected: ${f.expected}, got: ${f.actual} (via: ${f.matchedToken})`);
    }
    if (failures.length > 50) {
      console.log(`\n... 외 ${failures.length - 50}건 생략`);
    }
  }
}

runTests();
