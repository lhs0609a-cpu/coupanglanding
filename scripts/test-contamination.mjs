// 카테고리 매처 contamination 감지 테스트 스크립트.
//
// 목적:
//   다양한 SEO 스터핑 패턴의 임의 상품명을 생성해 contamination 감지율 검증.
//   사용자가 실제로 마주칠 새 SEO 변종이 잡히는지 확인.
//
// 실행:
//   node scripts/test-contamination.mjs

// ─── L1_TOKEN_SIGNALS — category-matcher.ts 와 동일한 시그널 (테스트용 복제) ─────
const L1_TOKEN_SIGNALS = {
  '식품': ['다시마','미역','김','파래','매생이','황태','멸치','오징어','문어','새우','조개','굴','전복','연어','고등어','참치','삼치','갈치','홍어','명태','명란','대구','쭈꾸미','낙지','꽃게','대게','킹크랩',
    '망고','사과','배','감','포도','딸기','복숭아','자두','수박','참외','메론','블루베리','오렌지','자몽','체리','파인애플','키위','석류','복분자','대추','곶감','밤','잣','호두','아몬드',
    '쌀','잡곡','보리','귀리','콩','팥','녹두','참깨','들깨','옥수수','감자','고구마','당근','양파','마늘','생강','파','부추','시금치','상추','깻잎','배추','무','오이','호박','토마토','가지','버섯','콩나물','숙주',
    '소고기','돼지고기','닭고기','오리고기','한우','삼겹살','목살','등심','안심','갈비','베이컨','소시지','햄','계란','달걀','우유','요거트','치즈','버터',
    '신선','산지','국산','농산','수산','축산','해조류','건어물','제철','원물','HACCP','GMP','당도','등급','5kg','1kg','3kg','10kg',
    '염장','완도','자른','뿌리','신선도','신선함','싱싱한','해풍','토종','유기농','무농약','친환경','GAP','이력제','직거래','산지직송','저온','냉장','냉동','말린','건조','반건조','훈제','절단','손질','자연산','양식','노지','하우스','수경','노지재배','일조량','당도계','브릭스','과당','수분함량','수분','식이섬유','단백질','지방','탄수화물','칼로리','영양성분','원산지','품종','수확','재배','가족용','대용량','소포장','소분','진공포장',
    '간장','된장','고추장','쌈장','액젓','젓갈','김치','장아찌','반찬','소금','설탕','식초','후추','참기름','들기름','꿀','잼','시럽',
    '라면','즉석밥','즉석국','국수','파스타','떡','만두','피자','치킨','볶음밥','김밥','샐러드','과자','초콜릿','사탕','젤리','쿠키','크래커',
    '비타민','오메가3','홍삼','녹용','루테인','프로폴리스','콜라겐','마그네슘','칼슘','철분','아연','유산균','프로바이오틱스','글루코사민','MSM','커큐민','코엔자임',
    '커피','차','녹차','홍차','보이차','우롱차','보리차','옥수수수염차','둥굴레차','대추차','유자차','생강차','쌍화차','음료','주스','탄산음료','이온음료','맥주','와인','막걸리','소주'],
  '뷰티': ['안티에이징','수분','진정','뷰티','염색','파마','퍼머','헤어','샴푸','린스','트리트먼트','두피','모발','펌','드라이','컬링','스타일링',
    '크림','에센스','세럼','로션','토너','앰플','마스크팩','시트팩','클렌징','클렌저','폼클렌징','폼','오일클렌징','립스틱','립밤','립글로스','립틴트','립스','마스카라','아이라이너','아이섀도우','블러셔','파운데이션','쿠션','컨실러','BB','CC','선크림','자외선차단','선스틱','쉐도우','네일','매니큐어','젤네일','향수','퍼퓸','오드뚜왈렛',
    '미백','주름개선','보습','각질','블랙헤드','모공','피부','피지','잡티','다크써클','탄력','리프팅','히알루론','펩타이드','레티놀','비타민C','나이아신아마이드','시카','병풀','스네일','연어알'],
  '가전/디지털': ['노트북','데스크탑','모니터','마우스','키보드','이어폰','헤드폰','이어셋','마이크','스피커','웹캠','프린터','스캐너','HDD','SSD','USB','메모리','RAM','CPU','그래픽카드','VGA','SD카드','외장하드','공유기','라우터','허브',
    '스마트폰','휴대폰','갤럭시','아이폰','태블릿','아이패드','갤럭시탭','노트10','갤럭시버즈','에어팟','애플워치','갤럭시워치','스마트워치',
    '냉장고','김치냉장고','세탁기','건조기','에어컨','전기레인지','인덕션','전자레인지','오븐','에어프라이어','커피머신','정수기','공기청정기','선풍기','가습기','제습기','히터','전기장판',
    'TV','스마트TV','OLED','QLED','UHD','4K','셋톱박스','블루레이','홈시어터','사운드바','빔프로젝터','프로젝터','스피커'],
  '패션의류잡화': ['티셔츠','셔츠','블라우스','니트','스웨터','자켓','코트','패딩','후드','맨투맨','원피스','스커트','치마','바지','청바지','데님','반바지','양말','속옷','팬티','브라','잠옷','파자마','수영복','비키니','드레스','턱시도','정장','수트',
    '운동화','스니커즈','구두','부츠','샌들','슬리퍼','로퍼','단화','하이힐','플랫슈즈',
    '가방','백팩','크로스백','숄더백','토트백','클러치','지갑','벨트','모자','캡','비니','버킷햇','선글라스','안경','시계','목걸이','반지','귀걸이','팔찌','브로치','스카프','머플러','장갑','넥타이'],
  '가구/홈데코': ['소파','침대','매트리스','책상','의자','테이블','식탁','책장','옷장','서랍장','수납장','선반','거울','커튼','블라인드','러그','카펫','쿠션','베개','이불','요','담요','커버',
    '조명','전등','스탠드','샹들리에','LED등','꽃병','액자','시계','가습기','디퓨저','인센스','캔들'],
  '생활용품': ['화장지','휴지','물티슈','기저귀','생리대','수건','걸레','대걸레','빗자루','쓰레기통','쓰레기봉투','탈취제','방향제','섬유유연제','세탁세제','주방세제','세정제','락스','곰팡이제거제','살충제',
    '비누','샤워젤','바디워시','바디로션','치약','칫솔','구강청결제','면도기','면도크림','면봉','반창고','밴드','연고','파스'],
  '주방용품': ['프라이팬','냄비','전골냄비','웍','국자','뒤집개','집게','주걱','칼','도마','가위','강판','채반','체','조리기구','후라이팬','압력솥','냉면기','뚝배기',
    '식기','그릇','접시','컵','머그컵','텀블러','보온병','수저','젓가락','포크','나이프','냅킨','앞치마','오븐장갑','행주','수세미'],
  '반려/애완용품': ['강아지','고양이','개','애묘','애견','반려견','반려묘','사료','간식','츄르','캣닢','캣타워','스크래쳐','목줄','하네스','리드줄','켄넬','이동장','캐리어','매트','개껌','오리저키','동결건조','펫','펫푸드','캣','도그'],
  '스포츠/레져': ['요가매트','폼롤러','덤벨','케틀벨','짐볼','복근운동기구','런닝머신','자전거','킥보드','전기자전거','MTB','로드자전거','헬멧','보호대','스케이트','스케이트보드','스키','보드','등산','등산복','등산화','캠핑','텐트','침낭','코펠','버너','랜턴','쿨러','아이스박스','낚시','낚시대','릴','루어','웜','골프','골프채','골프공','골프화','수영','수영복','물안경'],
  '자동차용품': ['타이어','휠','오일','엔진오일','워셔액','부동액','와이퍼','블랙박스','네비게이션','후방카메라','LED램프','전조등','범퍼','휠캡','시트커버','핸들커버','선바이저','왁스','광택제','코팅제','정비공구'],
  '문구/오피스': ['볼펜','연필','샤프','지우개','형광펜','마커','색연필','크레용','노트','다이어리','포스트잇','스티커','파일','클리어파일','바인더','펜꽂이','수첩','메모지','테이프','풀','가위','커터칼','자','컴퍼스','각도기','계산기','복사기','파쇄기'],
  '완구/취미': ['장난감','블록','레고','퍼즐','보드게임','카드게임','RC','드론','피규어','인형','곰인형','봉제인형','게임기','닌텐도','플레이스테이션','PS','XBOX','악기','기타','피아노','드럼','바이올린','우쿨렐레','하모니카'],
  '도서': ['책','도서','소설','수필','자기계발','경제경영','만화','참고서','문제집','교재','어학','외국어','영어','일본어','중국어','어린이','유아','동화','그림책','전집','시리즈'],
};

const SEO_NOISE_TOKENS = new Set([
  '추천','비교','후기','리뷰','할인','특가','무료배송','당일발송','로켓배송','정품','무료',
  '가성비','만족','베스트','신상','신상품','한정','특별','선물','선물용','선물세트',
  '인기','대박','최고','최저가','최저','득템','쟁여','꿀템','갓성비','명품',
  '정식','한국','한국어','국산','국내산','수입','직배송','직수입','직접','전용',
]);

// ─── 테스트 케이스 생성기 ─────────────────────────────────
//
// 각 케이스는 { name, expectedDominantL1, expectedContamination }.
//   expectedContamination = true → 감지되어야 함
//   expectedContamination = false → 통과되어야 함

function pickN(arr, n, rng) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function seedRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function buildTestCases(seed = 42) {
  const rng = seedRng(seed);
  const cases = [];

  // ─── 클린 케이스 (단일 카테고리 토큰만) — contamination=false 기대 ───
  // 각 L1 별 5건 — 더 다양한 토큰 조합 검증
  for (const [l1, signals] of Object.entries(L1_TOKEN_SIGNALS)) {
    for (let i = 0; i < 5; i++) {
      const tokens = pickN(signals, 4 + Math.floor(rng() * 4), rng);
      cases.push({
        name: tokens.join(' '),
        expectedDominantL1: l1,
        expectedContamination: false,
      });
    }
  }

  // ─── SEO 스터핑 케이스 (주 L1 + 다른 L1 토큰 섞음) ───
  // 100건 — 많이
  const l1Keys = Object.keys(L1_TOKEN_SIGNALS);
  for (let i = 0; i < 100; i++) {
    const mainIdx = Math.floor(rng() * l1Keys.length);
    const seoIdx = (mainIdx + 1 + Math.floor(rng() * (l1Keys.length - 1))) % l1Keys.length;
    const mainL1 = l1Keys[mainIdx];
    const seoL1 = l1Keys[seoIdx];
    const mainTokens = pickN(L1_TOKEN_SIGNALS[mainL1], 3 + Math.floor(rng() * 4), rng);
    const seoTokens = pickN(L1_TOKEN_SIGNALS[seoL1], 3 + Math.floor(rng() * 5), rng);
    cases.push({
      name: [...mainTokens, ...seoTokens].join(' '),
      expectedDominantL1: mainL1,
      expectedContamination: true,
    });
  }

  // ─── 3-카테고리 SEO 스터핑 (극심한 케이스) ───
  for (let i = 0; i < 30; i++) {
    const indices = pickN(l1Keys.map((_, k) => k), 3, rng);
    const tokens = indices.flatMap(idx => pickN(L1_TOKEN_SIGNALS[l1Keys[idx]], 2 + Math.floor(rng() * 3), rng));
    cases.push({
      name: tokens.join(' '),
      expectedDominantL1: l1Keys[indices[0]],
      expectedContamination: true,
    });
  }

  // ─── 사용자 실제 신고 케이스 ───
  cases.push({
    name: '파지 염장 완도 다시마 자른 뿌리 안티에이징 수분 진정 뷰티 염색 파마용품 헤어소품',
    expectedDominantL1: '식품',
    expectedContamination: true,
  });
  cases.push({
    name: '멸치 염장 뿌리 파자 다시마 자른 황태 신선도 가족용 국산 식품 수산물 건어물 식이섬유 1kg',
    expectedDominantL1: '식품',
    expectedContamination: false,
  });
  // 다양한 해조류/수산물 SEO 스터핑 변종
  cases.push({
    name: '미역 자연산 건조 완도 신선 안티에이징 미백 보습 헤어트리트먼트',
    expectedDominantL1: '식품',
    expectedContamination: true,
  });
  cases.push({
    name: '김 광천 무염 자연 갓 김치 반찬 쌀밥 무료배송 가성비 베스트',
    expectedDominantL1: '식품',
    expectedContamination: false,
  });
  cases.push({
    name: '한우 1++ 등심 200g 진공포장 산지직송 다이어트 키토 단백질 헬스 운동',
    expectedDominantL1: '식품',
    expectedContamination: false, // 다이어트/키토 등은 SEO 노이즈로 처리되거나 보호됨
  });
  cases.push({
    name: '강아지 사료 연어 30kg 닭고기 소고기 한우 등심 갈비',
    expectedDominantL1: '반려/애완용품',
    expectedContamination: true,
  });
  cases.push({
    name: '비타민C 콜라겐 셔츠 데님 청바지 후드 패션',
    expectedDominantL1: '식품',
    expectedContamination: true,
  });
  cases.push({
    name: '노트북 갤럭시 아이폰 프라이팬 냄비 칼 도마 청바지',
    expectedDominantL1: '가전/디지털',
    expectedContamination: true,
  });

  return cases;
}

// ─── 감지 로직 (matcher 와 동일) ─────────────────────────
function tokenize(name) {
  return name.toLowerCase().split(/\s+/).filter(t => t.length >= 2 && !SEO_NOISE_TOKENS.has(t));
}

function detectL1Contamination(tokens) {
  const counts = {};
  const tokenSet = new Set(tokens);
  for (const [l1, signals] of Object.entries(L1_TOKEN_SIGNALS)) {
    let n = 0;
    for (const s of signals) {
      if (tokenSet.has(s)) n++;
    }
    if (n > 0) counts[l1] = n;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { contaminated: false, dominantL1: null, signalCounts: counts };
  if (sorted.length === 1) return { contaminated: false, dominantL1: sorted[0][0], signalCounts: counts };

  const [l1a, ca] = sorted[0];
  const [, cb] = sorted[1];
  const ratio = cb / Math.max(ca, 1);
  return {
    contaminated: (ratio >= 0.2 && cb >= 1) || cb >= 2,
    dominantL1: l1a,
    signalCounts: counts,
  };
}

// ─── 테스트 실행 ─────────────────────────────────────────
function runTests() {
  const cases = buildTestCases(42);
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const tc of cases) {
    const tokens = tokenize(tc.name);
    const result = detectL1Contamination(tokens);
    const isCorrect = result.contaminated === tc.expectedContamination;
    if (isCorrect) {
      passed++;
    } else {
      failed++;
      failures.push({
        name: tc.name.slice(0, 80),
        expected: tc.expectedContamination,
        actual: result.contaminated,
        dominantL1: result.dominantL1,
        signalCounts: result.signalCounts,
      });
    }
  }

  console.log(`\n=== Contamination 감지 테스트 결과 ===`);
  console.log(`총 케이스: ${cases.length}`);
  console.log(`통과:     ${passed} (${(passed / cases.length * 100).toFixed(1)}%)`);
  console.log(`실패:     ${failed} (${(failed / cases.length * 100).toFixed(1)}%)`);

  if (failures.length > 0) {
    console.log(`\n실패 케이스 (최대 10건):`);
    for (const f of failures.slice(0, 10)) {
      console.log(`  - "${f.name}"`);
      console.log(`    expected contaminated=${f.expected}, actual=${f.actual}`);
      console.log(`    dominantL1=${f.dominantL1}, signals=${JSON.stringify(f.signalCounts)}`);
    }
  }

  // 분류별 통계
  const cleanCases = cases.filter(c => !c.expectedContamination);
  const contamCases = cases.filter(c => c.expectedContamination);
  const cleanCorrect = cleanCases.filter(c => {
    const tokens = tokenize(c.name);
    return !detectL1Contamination(tokens).contaminated;
  }).length;
  const contamCorrect = contamCases.filter(c => {
    const tokens = tokenize(c.name);
    return detectL1Contamination(tokens).contaminated;
  }).length;

  console.log(`\n=== 분류별 정확도 ===`);
  console.log(`클린 케이스 정확도(false positive 회피): ${cleanCorrect}/${cleanCases.length} (${(cleanCorrect / cleanCases.length * 100).toFixed(1)}%)`);
  console.log(`오염 케이스 감지율(true positive):     ${contamCorrect}/${contamCases.length} (${(contamCorrect / contamCases.length * 100).toFixed(1)}%)`);

  return { passed, failed, total: cases.length };
}

runTests();
