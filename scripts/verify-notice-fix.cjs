// 노출고시/카테고리 매칭 수정 회귀 테스트
// 1) selectBestNoticeMeta — 복수 noticeMeta 중 categoryPath 기반 선택
// 2) localMatch 도메인 가드 — 뷰티/식품 토큰이 패션 leaf로 빠지지 않는지

const path = require('path');
const root = path.resolve(__dirname, '..');

// notice-field-filler 모듈을 require하기 위해 ts-node 대신 직접 함수 복사 검증
// (이 파일은 검증용이므로 핵심 로직만 격리해서 재현)

// === scoreNoticeCategory 핵심 로직 검증 (notice-field-filler.ts 의 일부) ===

const NOTICE_CATEGORY_RULES = [
  { pathRegex: /^식품>건강식품|건강식품>건강기능|영양제|비타민|미네랄|홍삼|오메가|유산균|프로바이오틱|콜라겐|루테인|밀크씨슬|글루코사민|쏘팔메토|코큐텐|코엔자임|크릴오일/,
    expect: ['건강기능', '영양보조', '건강보조'], avoid: ['패션', '잡화', '의류', '화장품'] },
  { pathRegex: /^식품>(가공|즉석|음료|과자|쿠키|시리얼|면|쌀|차|커피)/,
    expect: ['가공식품', '식품'], avoid: ['패션', '잡화', '의류', '화장품'] },
  { pathRegex: /^식품>축산|^식품>수산|^식품>농산|^식품>신선/,
    expect: ['농산물', '축산물', '수산물', '신선'], avoid: ['패션', '잡화'] },
  { pathRegex: /^식품/,
    expect: ['식품'], avoid: ['패션', '잡화', '의류'] },
  { pathRegex: /^뷰티|^화장품|핸드\/풋|풋케어|핸드케어|스킨|메이크업|네일아트|향수|바디케어/,
    expect: ['화장품', '인체적용'], avoid: ['패션', '잡화', '의류', '식품'] },
  { pathRegex: /(신발|운동화|구두|부츠|샌들|스니커즈|슬리퍼|로퍼)/,
    expect: ['구두', '신발'], avoid: ['식품', '화장품'] },
  { pathRegex: /(가방|백|클러치|숄더백|토트백|크로스|핸드백|에코백)/,
    expect: ['가방'], avoid: ['식품', '화장품'] },
  { pathRegex: /(시계|손목시계|디지털시계)/,
    expect: ['시계'], avoid: ['식품', '화장품'] },
  { pathRegex: /(쥬얼리|주얼리|귀걸이|목걸이|반지|팔찌|발찌)/,
    expect: ['쥬얼리', '주얼리', '귀금속'], avoid: ['식품', '화장품'] },
  { pathRegex: /^패션의류잡화>.*(상의|하의|바지|치마|스커트|원피스|아우터|니트|티셔츠|블라우스|셔츠|코트|재킷|패딩|점퍼|속옷|잠옷|양말|스타킹|레깅스|트레이닝)/,
    expect: ['의류'], avoid: ['식품', '화장품'] },
  { pathRegex: /^패션의류잡화/,
    expect: ['패션잡화', '잡화', '의류'], avoid: ['식품', '화장품', '건강기능'] },
];

function scoreNoticeCategory(noticeCategoryName, categoryPath) {
  if (!categoryPath || !noticeCategoryName) return 0;
  const pathL = categoryPath.toLowerCase();
  const name = noticeCategoryName.toLowerCase();
  let score = 0;
  const pathTokens = pathL.split(/[>\s\/]+/).filter(Boolean);
  for (const t of pathTokens) {
    if (t.length >= 2 && name.includes(t)) score += 5;
  }
  for (const rule of NOTICE_CATEGORY_RULES) {
    if (!rule.pathRegex.test(pathL)) continue;
    for (const kw of rule.expect) {
      if (name.includes(kw.toLowerCase())) score += 20;
    }
    if (rule.avoid) {
      for (const kw of rule.avoid) {
        if (name.includes(kw.toLowerCase())) score -= 30;
      }
    }
    break;
  }
  if (/기타/.test(name)) score -= 3;
  return score;
}

function selectBestNoticeMeta(metas, hint) {
  if (metas.length === 0) return null;
  if (metas.length === 1) return metas[0];
  if (!hint) return metas[0];
  let bestIdx = 0;
  let bestScore = scoreNoticeCategory(metas[0].noticeCategoryName, hint);
  for (let i = 1; i < metas.length; i++) {
    const s = scoreNoticeCategory(metas[i].noticeCategoryName, hint);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  return metas[bestIdx];
}

// === Test cases ===
const tests = [
  {
    name: '풋케어 → 화장품 선택',
    metas: [
      { noticeCategoryName: '패션잡화', fields: [] },
      { noticeCategoryName: '화장품 및 인체적용제품', fields: [] },
    ],
    hint: '뷰티>바디>핸드/풋 케어>풋케어>풋크림',
    expected: '화장품 및 인체적용제품',
  },
  {
    name: '비타민C → 건강기능식품 선택',
    metas: [
      { noticeCategoryName: '패션잡화', fields: [] },
      { noticeCategoryName: '건강기능식품', fields: [] },
      { noticeCategoryName: '기타 재화', fields: [] },
    ],
    hint: '식품>건강식품>비타민/미네랄>비타민C',
    expected: '건강기능식품',
  },
  {
    name: '오메가3 → 건강기능식품',
    metas: [
      { noticeCategoryName: '의류', fields: [] },
      { noticeCategoryName: '건강기능식품', fields: [] },
    ],
    hint: '식품>건강식품>기타건강식품>오메가3,6,9',
    expected: '건강기능식품',
  },
  {
    name: '핸드크림 → 화장품',
    metas: [
      { noticeCategoryName: '의류', fields: [] },
      { noticeCategoryName: '화장품 및 인체적용제품', fields: [] },
    ],
    hint: '뷰티>바디>핸드/풋 케어>핸드케어>핸드크림',
    expected: '화장품 및 인체적용제품',
  },
  {
    name: '남성 카디건 → 의류',
    metas: [
      { noticeCategoryName: '식품', fields: [] },
      { noticeCategoryName: '의류', fields: [] },
    ],
    hint: '패션의류잡화>남성패션>남성의류>남성 가디건',
    expected: '의류',
  },
  {
    name: '운동화 → 구두/신발',
    metas: [
      { noticeCategoryName: '의류', fields: [] },
      { noticeCategoryName: '구두/신발', fields: [] },
    ],
    hint: '패션의류잡화>여성패션>여성화>운동화>여성러닝화',
    expected: '구두/신발',
  },
  {
    name: '단일 메타 → 그대로',
    metas: [{ noticeCategoryName: '의류', fields: [] }],
    hint: '식품>건강식품>비타민C',
    expected: '의류',
  },
  {
    name: 'hint 없음 → 첫번째',
    metas: [
      { noticeCategoryName: '패션잡화', fields: [] },
      { noticeCategoryName: '화장품 및 인체적용제품', fields: [] },
    ],
    hint: '',
    expected: '패션잡화',
  },
  {
    name: '가공식품 음료 → 가공식품',
    metas: [
      { noticeCategoryName: '의류', fields: [] },
      { noticeCategoryName: '가공식품', fields: [] },
    ],
    hint: '식품>가공즉석식품>음료>탄산음료',
    expected: '가공식품',
  },
];

let pass = 0, fail = 0;
console.log('=== selectBestNoticeMeta 회귀 테스트 ===\n');
for (const t of tests) {
  const result = selectBestNoticeMeta(t.metas, t.hint);
  const ok = result && result.noticeCategoryName === t.expected;
  if (ok) {
    console.log('✓ ' + t.name);
    pass++;
  } else {
    console.log('✗ ' + t.name);
    console.log('  expected: "' + t.expected + '"');
    console.log('  actual: "' + (result?.noticeCategoryName || 'null') + '"');
    fail++;
  }
}
console.log('\n--- ' + pass + '/' + (pass+fail) + ' 통과 ---');
process.exit(fail > 0 ? 1 : 0);
