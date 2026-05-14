// 전 카테고리 cross-pollution 종합 audit
// 각 product form 별로 부적합한 어휘가 누출되는지 검사
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
const jiti = createJiti(import.meta.url, { interopDefault: true });

const PE = await jiti.import('../src/lib/megaload/services/persuasion-engine.ts');
const RR = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');

// 카테고리/상품 타입별 부적합 어휘 (cross-pollution 시그니처)
const POLLUTION_SIGNATURES = {
  // ── 영양제 어휘 (신선식품/가공식품/뷰티/생활/가전 등에 누출되면 안 됨) ──
  supplement: [
    /한\s*포\s*[뜯드]/, /한\s*포\s*용량/, /한\s*포\s*먹/, /한\s*포\s*드/,
    /\d+정/, /캡슐/, /알약/, /정제/,
    /부원료/, /원재료\s*(까지|꼼꼼)/, /함량\s*비교/,
    /하루\s*권장량/, /\{?성분\}?\s*\{?용량\}?\s*함량/,
    /수치가\s*정상/, /수치가\s*안\s*좋게/, /건강검진/,
    /효도\s*제대로/, /효도\s*선물/,
    /정기배송/,
    /삼키/, /넘기기/, /목에\s*안/,
  ],
  // ── 뷰티/스킨 어휘 (식품/가전/생활 등에 누출 X) ──
  beauty: [
    /바르[고면는기]/, /발라[보주]/, /발라요/, /도포/,
    /피부에\s*좋/, /피부\s*결/, /진정\s*효과/,
    /속건조/, /피부톤/, /겉피부/,
    /토너/, /세럼/, /크림\s*(바르|발라|타입)/,
  ],
  // ── 가전/디지털 어휘 (식품/뷰티/생활 등에 누출 X) ──
  electronics: [
    /충전\s*(시간|단자)/, /배터리\s*(용량|수명|지속)/,
    /와트|W\s*소비전력/, /해상도/, /Hz\s*주사율/,
    /펌웨어/, /업데이트\s*(가능|버전)/,
  ],
  // ── 자동차 어휘 (식품/뷰티 등에 누출 X) ──
  automotive: [
    /세차\s*(용|할)/, /광택\s*(코팅|작업)/, /발수\s*(코팅|효과)/,
    /타이어\s*(마모|공기압)/, /엔진오일/, /브레이크\s*(패드|디스크)/,
  ],
  // ── 반려/사료 어휘 ──
  pet: [
    /반려\s*동물/, /강아지\s*간식/, /고양이\s*캣/,
    /기호성/, /사료\s*(섭취|급여)/,
  ],
  // ── 출산/유아 어휘 ──
  baby: [
    /기저귀/, /이유식\s*단계/, /신생아\s*피부/,
    /흡수력\s*(만점|좋아)/, /발진\s*(없|예방)/,
  ],
};

// product form 정의: 카테고리 → 허용 시그니처 (다른 시그니처는 부적합)
const TEST_CATEGORIES = [
  // ── 식품 ──
  { name: '오렌지', pn: '미국 블랙라벨 고당도 오렌지 17kg', cat: '식품>신선식품>과일류>과일>오렌지', allowed: [] },
  { name: '사과', pn: '경북 부사 사과 5kg', cat: '식품>신선식품>과일류>과일>사과', allowed: [] },
  { name: '한우 등심', pn: '1++ 한우 등심 500g', cat: '식품>신선식품>축산>소고기>등심', allowed: [] },
  { name: '연어회', pn: '노르웨이 생연어 회용 500g', cat: '식품>신선식품>수산>연어', allowed: [] },
  { name: '라면', pn: '신라면 5개입', cat: '식품>가공/즉석식품>면류>라면', allowed: [] },
  { name: '김치', pn: '종가집 포기김치 5kg', cat: '식품>김치/반찬/젓갈>김치>포기김치', allowed: [] },
  { name: '비타민C', pn: '프리미엄 비타민C 1000mg 60정', cat: '식품>건강식품>비타민/미네랄>비타민C', allowed: ['supplement'] },
  { name: '오메가3', pn: 'rTG 오메가3 60캡슐', cat: '식품>건강식품>오메가3>일반', allowed: ['supplement'] },
  { name: '홍삼', pn: '정관장 홍삼정 100ml 30포', cat: '식품>건강식품>홍삼>홍삼정', allowed: ['supplement'] },

  // ── 뷰티 ──
  { name: '토너', pn: '닥터지 토너 200ml', cat: '뷰티>스킨케어>토너/스킨>토너', allowed: ['beauty'] },
  { name: '립스틱', pn: '맥 립스틱 루비우', cat: '뷰티>메이크업>립메이크업>립스틱', allowed: ['beauty'] },
  { name: '샴푸', pn: '려 흑운 샴푸 750ml', cat: '뷰티>헤어케어>샴푸/린스>샴푸', allowed: ['beauty'] },

  // ── 가전 ──
  { name: '청소기', pn: '다이슨 V15 무선청소기', cat: '가전/디지털>생활가전>청소기>핸디/스틱청소기', allowed: ['electronics'] },
  { name: '노트북', pn: 'LG 그램 17인치', cat: '가전/디지털>컴퓨터/게임/SW>노트북', allowed: ['electronics'] },
  { name: '에어컨', pn: '삼성 무풍 에어컨 17평', cat: '가전/디지털>계절환경가전>에어컨>스탠드형', allowed: ['electronics'] },

  // ── 자동차 ──
  { name: '워셔액', pn: '불스원 워셔액 1.8L', cat: '자동차용품>오일/정비/소모품>워셔액', allowed: ['automotive'] },
  { name: '카샴푸', pn: '소낙스 카샴푸 1L', cat: '자동차용품>세차/관리용품>세차샴푸', allowed: ['automotive'] },

  // ── 반려 ──
  { name: '강아지 사료', pn: '로얄캐닌 강아지 건사료 7kg', cat: '반려/애완용품>강아지 사료/간식/영양제>건식사료', allowed: ['pet'] },
  { name: '고양이 캣타워', pn: '캣잇 캣타워 대형', cat: '반려/애완용품>고양이용품>캣타워/스크래쳐', allowed: ['pet'] },

  // ── 출산/유아 ──
  { name: '기저귀', pn: '하기스 매직팬티 4단계', cat: '출산/유아동>기저귀/교체용품>팬티형기저귀', allowed: ['baby'] },
  { name: '이유식', pn: '베베쿡 이유식 6단계', cat: '출산/유아동>분유/유아식품>이유식', allowed: ['baby', 'supplement'] },

  // ── 패션 ──
  { name: '운동화', pn: '나이키 에어맥스 270mm', cat: '패션의류잡화>여성패션>여성화>스포츠화>러닝화', allowed: [] },
  { name: '맨투맨', pn: '유니클로 크루넥 맨투맨 L', cat: '패션의류잡화>남성패션>상의>맨투맨/스웨트셔츠', allowed: [] },

  // ── 생활 ──
  { name: '세제', pn: '퍼실 액체세제 5L', cat: '생활용품>세제>일반세제', allowed: [] },
  { name: '화장지', pn: '깨끗한나라 휴지 30롤', cat: '생활용품>화장지/물티슈>두루마리', allowed: [] },

  // ── 가구 ──
  { name: '소파', pn: '한샘 3인 가죽 소파', cat: '가구/홈데코>가구>소파>가죽소파', allowed: [] },
  { name: '침대', pn: '시몬스 퀸 매트리스', cat: '가구/홈데코>가구>침대>매트리스', allowed: [] },

  // ── 스포츠 ──
  { name: '요가매트', pn: '리복 요가매트 6mm', cat: '스포츠/레져>헬스/요가>요가용품>요가매트', allowed: [] },
  { name: '캠핑의자', pn: '헬리녹스 체어원', cat: '스포츠/레져>캠핑>캠핑의자/테이블>캠핑의자', allowed: [] },

  // ── 주방 ──
  { name: '프라이팬', pn: '테팔 프라이팬 28cm', cat: '주방용품>조리용품>프라이팬', allowed: [] },
  { name: '도마', pn: '대나무 도마 대형', cat: '주방용품>칼/가위/도마>도마', allowed: [] },

  // ── 문구 ──
  { name: '볼펜', pn: '모나미 153 흑색 12자루', cat: '문구/오피스>문구/학용품>필기구>볼펜', allowed: [] },
];

console.log('=== 전 카테고리 Cross-Pollution Audit ===\n');

const summary = {};

for (const tc of TEST_CATEGORIES) {
  // 5번 시드 다르게 실행 — 충분한 샘플 확보
  const allText = [];
  for (let i = 0; i < 5; i++) {
    const r = PE.generatePersuasionContent(tc.pn, tc.cat, `seed-${i}`, i);
    const persuasionParas = PE.contentBlocksToParagraphs(r.blocks || [], tc.cat);
    const review = RR.generateRealReview(tc.pn, tc.cat, `seed-${i}`, i);
    allText.push(...persuasionParas, ...review.paragraphs);
  }
  const fullText = allText.join('\n');

  // 각 시그니처 검사
  const detected = {};
  let totalIssues = 0;
  for (const [sigName, patterns] of Object.entries(POLLUTION_SIGNATURES)) {
    if (tc.allowed.includes(sigName)) continue; // 허용된 시그니처는 스킵
    let count = 0;
    const examples = [];
    for (const re of patterns) {
      const matches = fullText.match(new RegExp(re.source, 'g'));
      if (matches) {
        count += matches.length;
        if (examples.length < 2) examples.push(matches[0]);
      }
    }
    if (count > 0) {
      detected[sigName] = { count, examples };
      totalIssues += count;
    }
  }

  summary[tc.name] = totalIssues;

  if (totalIssues > 0) {
    console.log(`[${tc.name}] ${tc.cat}`);
    for (const [sig, info] of Object.entries(detected)) {
      console.log(`  ⚠ ${sig}: ${info.count}건 (예: ${info.examples.join(', ')})`);
    }
    console.log('');
  } else {
    console.log(`[${tc.name}] ✅ clean`);
  }
}

console.log('\n=== 요약 (5회 시드 합산) ===');
const sorted = Object.entries(summary).sort((a, b) => b[1] - a[1]);
for (const [name, count] of sorted) {
  console.log(`  ${count.toString().padStart(4)} ${name}`);
}
const totalCases = sorted.length;
const cleanCases = sorted.filter(([_, c]) => c === 0).length;
console.log(`\nclean: ${cleanCases}/${totalCases} (${(100 * cleanCases / totalCases).toFixed(1)}%)`);
