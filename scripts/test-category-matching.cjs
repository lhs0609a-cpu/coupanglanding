// ============================================================
// 카테고리 매칭 테스트 스크립트
// category-matcher.ts의 Tier 0 (DIRECT_CODE_MAP) 로직 검증
// ============================================================

const DIRECT_CODE_MAP = {
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
  // ── 영문 키워드 ──
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
  // ── 숫자 결합형 ──
  '비타민d3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민b2': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b6': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b12': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '오메가369': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  // ── 한글 복합어 ──
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
      if (/[가-힣]/.test(w)) {
        result.push(w);
      } else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length - 1])) {
        // Merge single English letter into previous English token
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

// ── Test Data: 10 categories x 10 products ──
const TEST_CASES = {
  "바이오틴 (73132)": { code: "73132", products: [
    "[종근당] 비오틴 5000mcg 90정 3개월분",
    "네이처메이드 바이오틴 구미 60정 2박스",
    "맥주효모 비오틴 플러스 1000mg x 60정",
    "GNM자연의품격 고함량 비오틴 120캡슐",
    "[닥터스베스트] 바이오틴 10000mcg 120베지캡",
    "뉴트리디데이 맥주효모 바이오틴 비타민B 복합 180정",
    "솔가 비오틴 5mg 50베지캡슐 모발영양",
    "[라이프익스텐션] 바이오틴 600mcg 100캡슐",
    "맥주효모 비오틴 아연 복합 건강기능식품 90정",
    "비오틴 5000 프리미엄 고함량 3개월분 대용량",
  ]},
  "비타민A (58907)": { code: "58907", products: [
    "[솔가] 비타민A 1500mcg 100소프트젤",
    "네이처스웨이 비타민A 10000IU 120캡슐",
    "[GNM자연의품격] 비타민A 눈건강 베타카로틴 180정",
    "나우푸드 비타민A 25000IU 100소프트젤",
    "[뉴트리디데이] 비타민A 5000IU 90캡슐",
    "비타민A 레티닐팔미테이트 고함량 60정",
    "[라이프익스텐션] 비타민A 3000mcg 90소프트젤",
    "닥터스베스트 비타민A 베타카로틴 60캡슐",
    "[종근당건강] 비타민A 눈건강 시력개선 120정",
    "Vitamin A 10000 고함량 180정 대용량",
  ]},
  "비타민B (58908)": { code: "58908", products: [
    "[종근당건강] 비타민B 컴플렉스 90정 3개월",
    "솔가 비타민B 콤플렉스 100베지캡슐",
    "[GNM] 비타민B군 고함량 활성형 120정",
    "나우푸드 비타민B-100 100베지캡",
    "[뉴트리디데이] 비타민B 복합 에너지 활력 180정",
    "비타민B컴플렉스 50 타임릴리즈 서방형 60정",
    "[네이처스웨이] 비타민B군 스트레스 피로개선 90캡슐",
    "라이프익스텐션 비타민B Complex 활성형 120캡슐",
    "[닥터스베스트] 비타민B 플러스 고함량 60베지캡",
    "Vitamin B-Complex 100 에너지부스트 180정",
  ]},
  "비타민C (58909)": { code: "58909", products: [
    "[종근당] 비타민C 1000mg 180정 6개월분",
    "솔가 에스터C 플러스 비타민C 1000mg 90정",
    "[GNM자연의품격] 비타민C 고함량 면역력 120정",
    "나우푸드 비타민C 크리스탈 파우더 454g",
    "[뉴트리디데이] 비타민C 1000 츄어블 레몬맛 90정",
    "비타민C 리포좀 고흡수 1000mg 60캡슐",
    "[라이프익스텐션] 비타민C 2000mg 서방형 120정",
    "닥터스베스트 비타민C 퀄리C 1000mg 120베지캡",
    "[네이처스웨이] 비타민C 아연 면역강화 180정",
    "Vitamin C 1000 타임릴리즈 대용량 240정",
  ]},
  "비타민D (58910)": { code: "58910", products: [
    "[종근당건강] 비타민D 2000IU 120정 뼈건강",
    "솔가 비타민D3 5000IU 100소프트젤",
    "[GNM] 비타민D 4000IU 고함량 180정",
    "나우푸드 비타민D-3 10000IU 120소프트젤",
    "[뉴트리디데이] 비타민D 어린이 구미 60정",
    "비타민D3 25mcg 1000IU 면역력 90캡슐",
    "[라이프익스텐션] 비타민D 5000IU 125mcg 120소프트젤",
    "닥터스베스트 비타민D3 5000 180소프트젤",
    "[네이처스웨이] 비타민D 칼슘 마그네슘 복합 120정",
    "Vitamin D3 10000 고함량 대용량 240소프트젤",
  ]},
  "오메가3 (73134)": { code: "73134", products: [
    "[종근당건강] 오메가3 rTG 1200mg 180캡슐",
    "솔가 오메가3 EPA DHA 700 120소프트젤",
    "[GNM자연의품격] 알티지 오메가3 골드 180캡슐",
    "나우푸드 오메가-3 180 EPA 120mg DHA 90소프트젤",
    "[뉴트리디데이] 초임계 알티지 오메가3 90캡슐",
    "오메가3 트리플스트렝스 1400mg 60소프트젤",
    "[라이프익스텐션] 오메가 파운데이션 Mega EPA/DHA 120소프트젤",
    "닥터스베스트 오메가3 피쉬오일 180소프트젤",
    "[네이처스웨이] 오메가369 복합 1200mg 90소프트젤",
    "Omega-3 2000mg 초고함량 rTG 대용량 240캡슐",
  ]},
  "루테인 (58920)": { code: "58920", products: [
    "[종근당건강] 루테인지아잔틴 20mg 90캡슐",
    "솔가 루테인 40mg 30소프트젤",
    "[GNM자연의품격] 루테인 눈건강 180정",
    "나우푸드 루테인 25mg 90베지캡",
    "[뉴트리디데이] 루테인 지아잔틴 빌베리 복합 120캡슐",
    "루테인 플로라글로 20mg 60소프트젤",
    "[라이프익스텐션] 루테인 MacuGuard 아스타잔틴 복합 60소프트젤",
    "닥터스베스트 루테인 플러스 20mg 180베지캡",
    "[네이처스웨이] 루테인 지아잔틴 10:1 비율 90정",
    "Lutein 40mg 초고함량 눈건강 대용량 180소프트젤",
  ]},
  "유산균 (58991)": { code: "58991", products: [
    "[종근당건강] 프로바이오틱스 락토핏 100억 90포",
    "솔가 프로바이오틱 400억 30베지캡슐",
    "[GNM자연의품격] 유산균 장건강 180캡슐",
    "나우푸드 프로바이오틱-10 250억 50베지캡",
    "[뉴트리디데이] 락토바실러스 19종 복합 유산균 90포",
    "유산균 프로바이오틱스 1000억 고함량 60캡슐",
    "[라이프익스텐션] 프로바이오틱 Florassist 30억 30캡슐",
    "닥터스베스트 프로바이오틱 200억 30베지캡",
    "[네이처스웨이] 유산균 프리바이오틱스 복합 120정",
    "Probiotics 500억 19종 유산균 대용량 90포",
  ]},
  "화장지 (63900)": { code: "63900", products: [
    "[깨끗한나라] 순수소프트 화장지 30롤 3겹",
    "크리넥스 마이비데 롤화장지 27m 30롤",
    "[유한킴벌리] 스카트 롤 화장지 25m 48롤",
    "좋은느낌 데일리 화장지 30롤 대용량",
    "[모나리자] 순수 롤화장지 25m 30롤",
    "깨끗한나라 미용티슈 화장지 250매 6갑",
    "[크리넥스] 두루마리 화장지 30롤 3겹",
    "유한킴벌리 화이트 롤휴지 30m 48롤",
    "[이마트] 노브랜드 화장지 30롤 3겹",
    "두루마리 화장지 25m 30롤 대용량",
  ]},
  "레티놀 (56171)": { code: "56171", products: [
    "[닥터지] 레티놀 리프팅 세럼 50ml",
    "더오디너리 레티놀 1% in 스쿠알란 30ml",
    "[토리든] 레티놀 0.5 세럼 50ml",
    "메디큐브 에이지알 레티놀 세럼 50ml",
    "[이니스프리] 레티놀 시카 리페어 세럼 30ml",
    "레티놀 앰플 주름개선 에센스 50ml",
    "[닥터펩티드] 레티놀 포어 세럼 30ml",
    "CeraVe 레티놀 세럼 30ml",
    "[라로슈포제] 레티놀 B3 세럼 30ml",
    "고농축 레티놀 0.5% 주름 세럼 50ml",
  ]},
};

// ── Run Tests ──
function runTests() {
  console.log('='.repeat(80));
  console.log('카테고리 매칭 테스트 — Tier 0 (DIRECT_CODE_MAP) 검증');
  console.log('='.repeat(80));
  console.log('');

  let total = 0, passed = 0;
  const failures = [];

  for (const [catLabel, data] of Object.entries(TEST_CASES)) {
    let catPassed = 0;
    console.log(`=== ${catLabel} ===`);

    for (const p of data.products) {
      total++;
      const result = matchDirect(p);

      if (result && result.categoryCode === data.code) {
        catPassed++;
        passed++;
        console.log(`  ✅ ${p}`);
        console.log(`     → ${result.matchedToken} → ${result.categoryCode}`);
      } else {
        const tokens = tokenize(p);
        const compounds = buildCompoundTokens(tokens);
        failures.push({
          category: catLabel,
          expected: data.code,
          product: p,
          actual: result ? result.categoryCode : 'NO_MATCH',
          tokens,
          compounds: compounds.slice(0, 15),
        });
        console.log(`  ❌ ${p}`);
        console.log(`     tokens: [${tokens.join(', ')}]`);
        if (result) {
          console.log(`     → ${result.matchedToken} → ${result.categoryCode} (EXPECTED: ${data.code})`);
        } else {
          console.log(`     → NO MATCH (EXPECTED: ${data.code})`);
        }
      }
    }
    console.log(`  결과: ${catPassed}/${data.products.length}`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`SUMMARY: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}%)`);
  console.log('='.repeat(80));

  if (failures.length > 0) {
    console.log('');
    console.log(`FAILURES: ${failures.length}건`);
    console.log('-'.repeat(80));
    for (const f of failures) {
      console.log(`[${f.category}] ${f.product}`);
      console.log(`  tokens: [${f.tokens.join(', ')}]`);
      console.log(`  compounds: [${f.compounds.join(', ')}]`);
      console.log(`  expected: ${f.expected}, got: ${f.actual}`);
      console.log('');
    }
  }
}

runTests();
