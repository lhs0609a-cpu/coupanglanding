/**
 * 50개 임의 상품 상세페이지 전수 검증
 *
 * - 카테고리 13종 × 약 4건씩 (50건)
 * - 알려진 비문/오염 패턴 + 의심 패턴 검출
 * - 발견된 모든 문제를 카테고리별/패턴별로 집계
 */
import { generateStoryV2 } from '../src/lib/megaload/services/story-generator';

interface TestCase {
  label: string;
  productName: string;
  categoryPath: string;
  brand?: string;
  description?: string;
  tags?: string[];
}

const CASES: TestCase[] = [
  // 뷰티 (5)
  { label: '뷰티/넥크림', productName: '셀라비뷰 나이트 넥리프트 크림 50ml', categoryPath: '뷰티>스킨케어>크림>넥크림', brand: '셀라비뷰', tags: ['넥크림','목주름'] },
  { label: '뷰티/세럼', productName: '오라클 비타민C 세럼 30ml', categoryPath: '뷰티>스킨케어>에센스/세럼>세럼', brand: '오라클', tags: ['비타민C','세럼'] },
  { label: '뷰티/선크림', productName: '데일리선 무기자차 선크림 SPF50+ PA++++', categoryPath: '뷰티>스킨케어>선케어>선크림', brand: '데일리선', tags: ['선크림','무기자차'] },
  { label: '뷰티/립틴트', productName: '루즈블룸 워터 립틴트 코랄 #04', categoryPath: '뷰티>메이크업>립>립틴트', brand: '루즈블룸', tags: ['립틴트','코랄'] },
  { label: '뷰티/샴푸', productName: '허벌리프 멘톨 두피 샴푸 500ml', categoryPath: '뷰티>헤어>샴푸>두피케어샴푸', brand: '허벌리프', tags: ['샴푸','두피'] },

  // 식품 신선식품 (4)
  { label: '식품/망고', productName: '태국산 알폰소 생망고 1kg 박스', categoryPath: '식품>과일>열대과일>망고' },
  { label: '식품/감자', productName: '국산 햇감자 5kg', categoryPath: '식품>채소>감자/고구마/당근>감자' },
  { label: '식품/한우', productName: '강원도 한우 등심 구이용 500g', categoryPath: '식품>축산>한우>등심' },
  { label: '식품/연어', productName: '노르웨이산 생연어 회용 슬라이스 300g', categoryPath: '식품>수산>연어/송어>연어' },

  // 식품 가공식품 (3)
  { label: '식품/밀키트', productName: '오늘의 밀키트 부대찌개 2인분', categoryPath: '식품>가공/즉석식품>밀키트', brand: '오늘의' },
  { label: '식품/김치', productName: '종가집 포기김치 5kg', categoryPath: '식품>가공/즉석식품>김치/장아찌>포기김치', brand: '종가집' },
  { label: '식품/라면', productName: '신라면 블랙 컵 5개입', categoryPath: '식품>가공/즉석식품>라면>봉지라면', brand: '신라면' },

  // 건강식품 (4) — 성분별 다양화
  { label: '건강식품/비타민D', productName: '라이프케어 비타민D 2000IU 120정', categoryPath: '식품>건강식품>비타민>비타민D', brand: '라이프케어' },
  { label: '건강식품/유산균', productName: '바이오뮨 19종 프로바이오틱스 60포', categoryPath: '식품>건강식품>유산균>일반유산균', brand: '바이오뮨' },
  { label: '건강식품/오메가3', productName: '딥씨 알티지 오메가3 1100mg 60캡슐', categoryPath: '식품>건강식품>오메가/혈행>오메가3', brand: '딥씨' },
  { label: '건강식품/홍삼', productName: '정관장 홍삼정 240g', categoryPath: '식품>건강식품>홍삼/인삼>홍삼정', brand: '정관장' },

  // 생활용품 (4)
  { label: '생활/세제', productName: '퍼실 디스크 액체세제 2.5L', categoryPath: '생활용품>세제>액체세제', brand: '퍼실' },
  { label: '생활/욕실', productName: '클린업 핸드워시 500ml 리필', categoryPath: '생활용품>욕실용품>핸드워시', brand: '클린업' },
  { label: '생활/공구', productName: '보쉬 임팩트 드릴 18V 무선', categoryPath: '생활용품>공구>전동공구>임팩트드릴', brand: '보쉬' },
  { label: '생활/수납', productName: '리빙박스 옷장정리함 60L 3개입', categoryPath: '생활용품>수납/정리>의류수납', brand: '리빙박스' },

  // 가전/디지털 (5)
  { label: '가전/무선청소기', productName: '에어플로 듀얼파워 무선청소기 30000Pa', categoryPath: '가전/디지털>생활가전>청소기>무선청소기', brand: '에어플로' },
  { label: '가전/공기청정기', productName: '클린에어 4단계 HEPA 공기청정기 30평형', categoryPath: '가전/디지털>계절환경가전>공기청정기', brand: '클린에어' },
  { label: '가전/에어프라이어', productName: '쿠치나 디지털 에어프라이어 5L 6인용', categoryPath: '가전/디지털>냉장고/밥솥/주방가전>에어프라이어', brand: '쿠치나' },
  { label: '가전/모니터', productName: '뷰소닉 27인치 4K UHD 게이밍 모니터 165Hz', categoryPath: '가전/디지털>컴퓨터/게임/SW>모니터', brand: '뷰소닉' },
  { label: '가전/이어폰', productName: '소니 WF-1000XM5 노이즈캔슬링 이어폰', categoryPath: '가전/디지털>음향기기/이어폰/스피커>무선이어폰', brand: '소니' },

  // 패션의류잡화 (5)
  { label: '패션/가디건', productName: '오버핏 울 카라넥 가디건 베이지 M', categoryPath: '패션의류잡화>여성패션>니트>가디건' },
  { label: '패션/원피스', productName: '플로럴 셔츠 미디 원피스 네이비 S', categoryPath: '패션의류잡화>여성패션>원피스>셔츠원피스' },
  { label: '패션/맨자켓', productName: '프리미엄 캐시미어 블레이저 자켓 그레이 100', categoryPath: '패션의류잡화>남성패션>자켓>블레이저' },
  { label: '패션/운동화', productName: '나이키 에어맥스 270 블랙 270mm', categoryPath: '패션의류잡화>여성패션>신발>운동화', brand: '나이키' },
  { label: '패션/가방', productName: '코치 시그니처 토트백 베이지', categoryPath: '패션의류잡화>잡화>가방>토트백', brand: '코치' },

  // 가구/홈데코 (3)
  { label: '가구/소파', productName: '리바트 4인용 가죽 카우치 소파', categoryPath: '가구/홈데코>소파', brand: '리바트' },
  { label: '가구/침대', productName: '에이스 라텍스 매트리스 퀸 사이즈', categoryPath: '가구/홈데코>매트리스>라텍스매트', brand: '에이스' },
  { label: '가구/조명', productName: '필립스 휴 LED 무드등 컬러', categoryPath: '가구/홈데코>인테리어용품>조명', brand: '필립스' },

  // 출산/유아동 (4)
  { label: '출산유아/분유', productName: '맘스케어 산양분유 3단계 800g', categoryPath: '출산/유아동>분유/이유식>분유', brand: '맘스케어' },
  { label: '출산유아/기저귀', productName: '하기스 매직팬티 4단계 56매', categoryPath: '출산/유아동>기저귀/교체용품>팬티형기저귀', brand: '하기스' },
  { label: '출산유아/이유식', productName: '베베쿡 한우 야채 이유식 100g 10팩', categoryPath: '출산/유아동>분유/이유식>이유식', brand: '베베쿡' },
  { label: '출산유아/카시트', productName: '브라이택스 듀얼픽스 i-Size 카시트', categoryPath: '출산/유아동>외출용품>카시트', brand: '브라이택스' },

  // 스포츠/레져 (3)
  { label: '스포츠/요가매트', productName: '리퀴드 PU 요가매트 6mm 핑크', categoryPath: '스포츠/레져>헬스/요가>요가매트' },
  { label: '스포츠/캠핑', productName: '코베아 4인용 자동 텐트 방수 캠핑', categoryPath: '스포츠/레져>캠핑>텐트', brand: '코베아' },
  { label: '스포츠/자전거', productName: '삼천리 하이브리드 자전거 700C 21단', categoryPath: '스포츠/레져>자전거>하이브리드', brand: '삼천리' },

  // 반려/애완용품 (3)
  { label: '반려/사료', productName: '퓨어퍼피 연어&고구마 강아지 사료 2kg', categoryPath: '반려/애완용품>강아지>사료>건사료', brand: '퓨어퍼피' },
  { label: '반려/고양이간식', productName: '챠오츄르 참치맛 14g 20개입', categoryPath: '반려/애완용품>고양이>간식>스틱간식', brand: '챠오츄르' },
  { label: '반려/배변패드', productName: '프리오 강아지 배변패드 100매', categoryPath: '반려/애완용품>강아지>위생용품>배변패드', brand: '프리오' },

  // 주방용품 (3)
  { label: '주방/프라이팬', productName: '데일리쿡 인덕션 IH 28cm 논스틱 프라이팬', categoryPath: '주방용품>조리도구>팬>프라이팬', brand: '데일리쿡' },
  { label: '주방/냄비세트', productName: '키친아트 통3중 스테인리스 냄비세트 5종', categoryPath: '주방용품>조리도구>냄비>냄비세트', brand: '키친아트' },
  { label: '주방/도시락', productName: '락앤락 비스프리 모듈러 도시락통 4종 세트', categoryPath: '주방용품>보관/밀폐용기>도시락', brand: '락앤락' },

  // 문구/오피스 (2)
  { label: '문구/노트', productName: '플레인노트 무지 A5 도트노트 5권 세트', categoryPath: '문구/오피스>노트/메모>노트', brand: '플레인노트' },
  { label: '문구/볼펜', productName: '제트스트림 4&1 멀티펜 0.5mm 블랙', categoryPath: '문구/오피스>문구/학용품>필기구', brand: '제트스트림' },

  // 자동차용품 (2)
  { label: '자동차/블랙박스', productName: '카비전 4K UHD 2채널 블랙박스 256GB', categoryPath: '자동차용품>안전/관리>블랙박스', brand: '카비전' },
  { label: '자동차/방향제', productName: '리프레셔 컵홀더 차량용 방향제 상큼한 시트러스', categoryPath: '자동차용품>실내용품>방향제', brand: '리프레셔' },
];

// ────────── 검증 패턴 ──────────

interface ViolationCheck {
  name: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  re: RegExp;
  exemptIfCategoryHas?: string[];
  exemptIfProductHas?: string[];
}

const VIOLATIONS: ViolationCheck[] = [
  // 한국어 조사·활용 비문
  { name: '선물으로/이걸으로 (ㄹ받침 오류)', severity: 'CRITICAL', re: /선물으로|이걸으로/ },
  { name: '없은/있은 (불규칙 관형형)', severity: 'CRITICAL', re: /[가-힣\s](없|있)은(?=[\s가-힣])/ },
  { name: '드심+어미 (합성 깨짐)', severity: 'CRITICAL', re: /드심하/ },
  { name: '단계에했/때간이 (변수 누락 합성)', severity: 'CRITICAL', re: /단계에했|때간이|때시간(?!이)/ },
  { name: '한이라/운이라/은이라 (관형형+이라)', severity: 'CRITICAL', re: /[가-힣](한|운|은|인)이라\s/ },
  { name: '가까가 (오타/조사 오류)', severity: 'MAJOR', re: /가까가\s/ },
  { name: '추상명사+한테/에게', severity: 'MAJOR', re: /(고민|식단|루틴|일상)(한테|에게)/ },
  { name: '는은/는는/은은 (조사 충돌)', severity: 'CRITICAL', re: /[가-힣]는은\s|[가-힣]는는\s|[가-힣]은은\s/ },

  // 변수 빈치환
  { name: '미치환 placeholder', severity: 'CRITICAL', re: /\{[가-힣A-Za-z_][^}]*\}/ },
  { name: '문장 중간 ". "', severity: 'CRITICAL', re: /\s\.\s+[가-힣]/ },
  { name: '문장 끝 " ."', severity: 'CRITICAL', re: /[가-힣]\s+\.\s*$/m },
  { name: '"수 ." 어미 잘림', severity: 'CRITICAL', re: /[가-힣]\s+수\s*\.\s/ },
  { name: '빈 괄호/꺾쇠', severity: 'CRITICAL', re: /\(\s*\)|\[\s*\]|<\s*>/ },

  // fallback 명사 노출
  { name: '바로 상품/제품입니다', severity: 'CRITICAL', re: /바로\s+(상품|제품)입니다/ },
  { name: ', 상품/제품 + 조사', severity: 'CRITICAL', re: /[,，]\s*(상품|제품)\s*(은|는|을|를|이|가|에|의|으로|로)\s/ },
  { name: '"이건 상품 써봐"', severity: 'CRITICAL', re: /'\s*이건\s+상품\s+써봐/ },
  { name: '이제 (이) 제품으로 바꿔', severity: 'CRITICAL', re: /이제\s+(이\s+)?(상품|제품)\s*(으로|로)\s+바꿔/ },
  { name: '오래 망설인 끝에 상품을', severity: 'CRITICAL', re: /(끝에|망설인 끝에)\s+(상품|제품)\s*(을|를|이|가)\s/ },
  { name: '유명해진 상품의 진짜', severity: 'CRITICAL', re: /(유명해진|언급하는|들어본)\s+(상품|제품)\s*(의|에서|를|을)\s/ },

  // 카테고리 cross-leaf 오염
  { name: '분유→유아식예요', severity: 'CRITICAL', re: /유아식이?예요/, exemptIfProductHas: ['유아식','이유식'] },
  { name: '분유→물티슈예요', severity: 'CRITICAL', re: /물티슈이?예요/, exemptIfProductHas: ['물티슈'] },
  { name: '분유→카시트예요', severity: 'CRITICAL', re: /카시트이?예요/, exemptIfProductHas: ['카시트'] },
  { name: '분유→이유식예요', severity: 'CRITICAL', re: /이유식이?예요/, exemptIfProductHas: ['이유식','유아식'] },
  { name: '분유→유아세제예요', severity: 'CRITICAL', re: /유아세제이?예요/, exemptIfProductHas: ['세제'] },
  { name: '분유→젖병예요', severity: 'CRITICAL', re: /젖병이?예요/, exemptIfProductHas: ['젖병'] },
  { name: '노트→다이어리/만년필/필통', severity: 'MAJOR', re: /(다이어리|만년필|필통|점착메모)이?예요/, exemptIfProductHas: ['다이어리','만년필','필통','점착메모'] },
  { name: '블랙박스→왁스', severity: 'CRITICAL', re: /왁스(가|는|를|이|로|예요|로 유명)/, exemptIfProductHas: ['왁스','코팅'] },
  { name: '블랙박스→발수/광택나는', severity: 'MAJOR', re: /광택나는|발수가\s/, exemptIfProductHas: ['왁스','코팅','광택'] },
  { name: '뷰티크림→박스 leaf', severity: 'MAJOR', re: /박스(가|는|이|을|예요)/, exemptIfCategoryHas: ['식품','과일','채소','신선','자동차','블랙박스','수납','가구'], exemptIfProductHas: ['블랙박스','박스'] },
  { name: '식품 leaf 노출', severity: 'MAJOR', re: /(타고 있는|꾸준히 달리는)\s+식품(이|입|예)/, exemptIfCategoryHas: [] },
  { name: '신선식품→함량/캡슐', severity: 'MAJOR', re: /이\s+함량/, exemptIfCategoryHas: ['건강식품','비타민','영양제','홍삼','오메가','유산균'] },
  { name: '신선식품→10초 컷', severity: 'MAJOR', re: /10초\s*컷/, exemptIfCategoryHas: ['주방','조리','즉석','밀키트','건강식품','비타민','홍삼','오메가','유산균','영양제'] },

  // 빈도/시간 모순
  { name: '주말에+매일 (빈도 모순)', severity: 'MAJOR', re: /주말에.*매일\s*빠지지/ },

  // 영문/숫자 + 받침 조사 오류
  { name: '영문/숫자 + 을 (받침 오류)', severity: 'MAJOR', re: /[A-Za-z0-9]을\s/ },
  { name: '영문/숫자 + 이 (받침 오류)', severity: 'MAJOR', re: /(?<![가-힣])[A-Za-z0-9]이\s/ },

  // 문장 미완 / fragment
  { name: '"거의 필요 처음" (어미 잘림)', severity: 'MAJOR', re: /거의\s+필요\s+처음/ },
  { name: '"수 있어요." 단독 미완', severity: 'MINOR', re: /^[가-힣]+\s+수\s+있어요\.$/ },
  { name: '동일 단어 인접 중복(2자+)', severity: 'MAJOR', re: /(\S{2,}) \1(?=[\s.,!?])/ },

  // 특수: 진짜 빈 인용만 — '"' 안에 텍스트 없음
  { name: '진짜 빈 인용 ""', severity: 'MAJOR', re: /'[\s,]*'(?![가-힣A-Za-z])|"[\s,]*"(?![가-힣A-Za-z])/ },
  // 3개 이상 마침표 (말줄임표는 ... 표현 OK이므로 4개 이상)
  { name: '4점 이상 연속 마침표', severity: 'MINOR', re: /\.{4,}/ },
  // 문장 시작 — 명백한 조사 ("을/를/은") 만 (이/가/는 은 관형사 가능성)
  { name: '문장 시작 "을/를"', severity: 'MAJOR', re: /(?:^|\.\s+|\?\s+|!\s+)(을|를)\s/ },
];

interface Hit {
  caseLabel: string;
  caseIndex: number;
  paragraphIndex: number;
  violation: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  excerpt: string;
}

const allHits: Hit[] = [];

for (let ci = 0; ci < CASES.length; ci++) {
  const c = CASES[ci];
  let result;
  try {
    result = generateStoryV2(c.productName, c.categoryPath, 'seller_AUDIT_50_FIXED', ci, {
      description: c.description,
      tags: c.tags,
      brand: c.brand,
    });
  } catch (e) {
    allHits.push({
      caseLabel: c.label,
      caseIndex: ci,
      paragraphIndex: 0,
      violation: '예외 발생',
      severity: 'CRITICAL',
      excerpt: e instanceof Error ? e.message : String(e),
    });
    continue;
  }
  const all = [...result.paragraphs, ...result.reviewTexts];
  for (let i = 0; i < all.length; i++) {
    const para = all[i];
    for (const v of VIOLATIONS) {
      if (v.exemptIfCategoryHas?.some(k => c.categoryPath.includes(k))) continue;
      if (v.exemptIfProductHas?.some(k => c.productName.includes(k))) continue;
      const m = para.match(v.re);
      if (m) {
        const idx = m.index ?? 0;
        const excerpt = para.slice(Math.max(0, idx - 25), idx + (m[0]?.length ?? 0) + 35);
        allHits.push({
          caseLabel: c.label,
          caseIndex: ci,
          paragraphIndex: i + 1,
          violation: v.name,
          severity: v.severity,
          excerpt,
        });
      }
    }
  }
}

console.log(`🔍 ${CASES.length}개 케이스 검증 완료\n`);

if (allHits.length === 0) {
  console.log('✅ 0건 검출 — 모든 패턴 통과');
} else {
  // 패턴별 집계
  const byViolation = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  const byCase = new Map<string, number>();
  for (const h of allHits) {
    byViolation.set(h.violation, (byViolation.get(h.violation) ?? 0) + 1);
    bySeverity.set(h.severity, (bySeverity.get(h.severity) ?? 0) + 1);
    byCase.set(h.caseLabel, (byCase.get(h.caseLabel) ?? 0) + 1);
  }

  console.log(`총 ${allHits.length}건 검출\n`);
  console.log('━━━ 심각도별 ━━━');
  for (const sev of ['CRITICAL', 'MAJOR', 'MINOR']) {
    const cnt = bySeverity.get(sev) ?? 0;
    if (cnt) console.log(`  ${sev.padEnd(8)}: ${cnt}건`);
  }

  console.log('\n━━━ 패턴별 (Top) ━━━');
  const sortedByViolation = [...byViolation.entries()].sort((a, b) => b[1] - a[1]);
  for (const [v, c] of sortedByViolation) {
    console.log(`  ${c.toString().padStart(3)}건 — ${v}`);
  }

  console.log('\n━━━ 케이스별 ━━━');
  const sortedByCase = [...byCase.entries()].sort((a, b) => b[1] - a[1]);
  for (const [l, c] of sortedByCase) {
    console.log(`  ${c.toString().padStart(3)}건 — ${l}`);
  }

  console.log('\n━━━ 발견 사례 (전체) ━━━');
  for (const h of allHits) {
    console.log(`  [${h.severity}] [${h.caseLabel}] §${h.paragraphIndex} (${h.violation})`);
    console.log(`    "${h.excerpt}"`);
  }
}
