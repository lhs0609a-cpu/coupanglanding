// ============================================================
// 상품정보제공고시(notices) 필드 자동채움
// 규칙기반 + 안전한 기본값 ("상세페이지 참조")
// ============================================================

import type { LocalProductJson } from './local-product-reader';

export interface NoticeFieldMeta {
  name: string;
  required: boolean;
}

export interface NoticeCategoryMeta {
  noticeCategoryName: string;
  fields: NoticeFieldMeta[];
}

export interface FilledNoticeCategory {
  noticeCategoryName: string;
  noticeCategoryDetailName: { noticeCategoryDetailName: string; content: string }[];
}

/**
 * 카테고리별 notices 메타데이터와 상품 정보를 조합하여 필드를 자동 채운다.
 *
 * 규칙:
 * 1. 패턴 매칭으로 알려진 필드 자동 입력
 * 2. 나머지는 "상세페이지 참조" (쿠팡이 대부분 허용)
 */
/** 옵션 추출 결과 (option-extractor에서 전달) */
export interface ExtractedNoticeHints {
  volume?: string;    // "50ml"
  weight?: string;    // "500g"
  color?: string;     // "블랙"
  size?: string;      // "M"
  count?: string;     // "3개"
  material?: string;  // 소재 (향후 확장)
}

// ─── 노출고시 카테고리 선택 규칙 ──────────────────────────────
// 쿠팡 API는 한 displayCategoryCode에 대해 복수의 noticeCategory를 반환할 수 있음
// 예: 풋케어 카테고리 → ["화장품 및 인체적용제품", "패션잡화"] 둘 다 반환되어
//      noticeMeta[0] 무조건 채택 시 패션잡화로 잘못 들어감
//
// categoryPath / 상품명을 보고 가장 적합한 noticeCategory를 점수화하여 선택.
// 룰 매칭은 L1 고정 anchor 우선 — 첫 매칭만 적용 (break).
interface NoticeCategoryRule {
  /** categoryPath 매칭 정규식 (lowercase, > 구분 path 전체) */
  pathRegex: RegExp;
  /** 노출고시 카테고리명에 포함되어야 할 키워드 (있으면 가산점) */
  expect: string[];
  /** 노출고시 카테고리명에 포함되면 안 되는 키워드 (있으면 강한 감점) */
  avoid?: string[];
}

// ⚠️ 룰 순서 = 우선순위. L1 고정 anchor 룰이 위, 일반 키워드 룰은 그 다음.
//    잘못된 leak 방지를 위해 도메인별 명시 avoid를 강하게 둠.
const NOTICE_CATEGORY_RULES: NoticeCategoryRule[] = [
  // ── L1 고정 앵커 룰 (최우선) ──
  // 도서/음반: leaf에 침구/시계 등 동음이의어가 와도 도서로 강제
  { pathRegex: /^도서|^음반|^영상저작|^dvd|^cd/i,
    expect: ['도서', '음반', '영상저작'],
    avoid: ['식품', '화장품', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '의약', '의료', '생활화학', '욕실', '농산', '축산', '수산'] },

  // 반려/애완: 사료/영양제도 식품/건강기능식품 아님 — 보통 "기타 재화"
  { pathRegex: /^반려|^애완/,
    expect: ['반려', '애완', '기타 재화'],
    avoid: ['건강기능', '가공식품', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '의약', '주방', '문구'] },

  // 자동차: 동음이의어(시계/온도계/커튼/부츠) 강력 차단
  { pathRegex: /^자동차/,
    expect: ['자동차', '부품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '완구', '문구', '의약', '의료', '도서'] },

  // 출산/유아동: 의류/식품 동음이의 차단 → 보통 "기타 재화" or 의류(베이비)
  { pathRegex: /^출산\/유아동|^출산\/육아|^유아동/,
    expect: ['유아', '아동', '출산', '기저귀', '기타'],
    avoid: ['패션의류', '패션잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '축산', '수산'] },

  // 완구/취미: 가방/시계/주방 동음이의 차단
  { pathRegex: /^완구|^장난감|^취미/,
    expect: ['완구', '장난감'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '문구', '도서', '의약', '의료'] },

  // 문구/오피스
  { pathRegex: /^문구\/오피스|^문구|^오피스/,
    expect: ['문구', '사무'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '도서', '의약', '의료'] },

  // 스포츠/레저
  { pathRegex: /^스포츠\/레져|^스포츠|^레져|^레저/,
    expect: ['스포츠', '레저', '레져'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 주방용품
  { pathRegex: /^주방용품/,
    expect: ['주방'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '가전', '디지털', '자동차', '완구', '문구', '도서', '의약', '의료'] },

  // 가전/디지털 — 영상/디지털/가전 세분
  // expect: 명확한 부분문자열만 사용 (substring match가 다른 카테고리에 누설되지 않게)
  { pathRegex: /^가전\/?디지털>.*(tv|티비|모니터|디스플레이|영상|프로젝터|블루레이|dvd)/i,
    expect: ['영상가전'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '디지털기기'] },
  { pathRegex: /^가전\/?디지털>.*(스마트폰|핸드폰|휴대폰|태블릿|노트북|컴퓨터|키보드|마우스|이어폰|헤드폰|블루투스|카메라|캠코더)/,
    expect: ['디지털기기'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '영상가전'] },
  { pathRegex: /^가전\/?디지털/,
    expect: ['가전제품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '영상가전', '디지털기기'] },

  // 가구/홈데코 — 침구류는 별도
  { pathRegex: /^가구\/홈데코>.*(침구|이불|베개|매트리스|커튼|카페트|러그|블라인드|침장)/,
    expect: ['침구', '커튼', '카페트'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^가구\/홈데코|^가구|^홈데코/,
    expect: ['가구'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // ── 식품 / 건강식품 (L1 anchor + 농수축산 별도) ──
  { pathRegex: /^식품>건강식품/,
    expect: ['건강기능', '영양보조', '건강보조'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^식품>(축산|.*>축산)/,
    expect: ['축산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '수산', '건강기능', '가공식품'] },
  { pathRegex: /^식품>(수산|.*>수산)/,
    expect: ['수산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '축산', '건강기능', '가공식품'] },
  { pathRegex: /^식품>(농산|과일|채소|쌀|잡곡|.*>(농산|과일|채소|쌀|잡곡|건과|견과))/,
    expect: ['농산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '축산', '수산', '건강기능', '가공식품'] },
  { pathRegex: /^식품/,
    expect: ['가공식품'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '축산', '수산', '건강기능'] },

  // ── 뷰티 / 화장품 (L1 anchor + 핸드/풋 케어 포함) ──
  { pathRegex: /^뷰티|^화장품/,
    expect: ['화장품', '인체적용'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '식품', '건강기능', '농산', '축산', '수산', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // ── 패션 (L1 anchor) — 세분류 우선 ──
  { pathRegex: /^패션의류잡화>.*(가방|백팩|클러치|숄더백|토트백|크로스백|핸드백|에코백|메신저백|힙색|허리색)/,
    expect: ['가방'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '구두', '신발', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^패션의류잡화>.*(시계|손목시계|디지털시계)/,
    expect: ['시계'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '구두', '신발', '가방', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^패션의류잡화>.*(쥬얼리|주얼리|귀걸이|목걸이|반지|팔찌|발찌|귀금속|반지)/,
    expect: ['쥬얼리', '주얼리', '귀금속'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '구두', '신발', '가방', '시계', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^패션의류잡화>.*(신발|운동화|구두|부츠|샌들|스니커즈|슬리퍼|로퍼|러닝화|워킹화|보행기화)/,
    expect: ['구두', '신발'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^패션의류잡화>.*(상의|하의|바지|치마|스커트|원피스|아우터|니트|티셔츠|블라우스|셔츠|코트|재킷|패딩|점퍼|속옷|잠옷|양말|스타킹|레깅스|트레이닝|발열내의|언더웨어)/,
    expect: ['의류'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^패션의류잡화/,
    expect: ['패션잡화', '잡화'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // ── 생활용품 — 세분 ──
  { pathRegex: /^생활용품>.*(세제|섬유유연제|살균제|소독제|살충제|방향제|탈취제|미백제|제습제|공기청정)/,
    expect: ['생활화학', '화학제품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^생활용품>욕실|^생활용품>.*(샤워|욕조|변기|세면)/,
    expect: ['욕실'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^생활용품>건강용품>.*(혈압|혈당|체온|온도계|마사지|보호대|교정용품|찜질|온열|적외선)/,
    expect: ['의료기기', '건강'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^생활용품>건강용품/,
    expect: ['건강', '의약', '의료'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },
  { pathRegex: /^생활용품/,
    expect: ['기타 재화'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '생활화학', '욕실', '의약', '의료기기'] },
];

// ─── 상품명 토큰 → 노출고시 매핑 (categoryPath 미제공 시 폴백) ──────────
// hint가 categoryPath가 아닌 상품명만 들어올 때 (예: "풋크림 30ml"),
// L1 anchor 룰이 매칭되지 않아 모든 후보가 score=0 → "의류"로 빠지는 버그 방지.
// 토큰 매칭은 위 NOTICE_CATEGORY_RULES가 매칭 안 됐을 때만 적용.
//
// ⚠️ 우선순위: 화장품 토큰 → 건강기능 토큰 → 농수축산 토큰 → 가전/가구/자동차/완구/문구/스포츠 토큰 → 패션 토큰 → 식품 토큰
//    "비타민크림" 같은 모호 케이스는 화장품(앞)이 우선.
interface TokenRule {
  /** hint 안에서 찾을 토큰 정규식 */
  tokenRegex: RegExp;
  expect: string[];
  avoid?: string[];
}

const PRODUCT_NAME_TOKEN_RULES: TokenRule[] = [
  // 1. 화장품/뷰티 (크림/로션/세럼 등 — '비타민크림' 같은 모호 케이스 화장품 우선)
  { tokenRegex: /(크림|로션|세럼|에센스|앰플|토너|클렌저|클렌징|마스크팩|시트마스크|마스카라|아이라이너|아이섀도|립스틱|립틴트|립글로스|쿠션|파운데이션|컨실러|블러셔|네일|향수|샴푸|린스|컨디셔너|트리트먼트|바디워시|바디로션|바디오일|바디미스트|폼클렌징|선크림|선로션|선블록|자외선차단|선스프레이|애프터쉐이브|왁스|포마드|헤어오일|헤어팩)/,
    expect: ['화장품', '인체적용'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '식품', '건강기능', '농산', '축산', '수산', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 2. 건강기능식품 (비타민/오메가/유산균 등 — 화장품 토큰 없을 때만 매칭)
  { tokenRegex: /(비타민|오메가|유산균|프로바이오틱스|프로바이오틱|콜라겐|루테인|밀크씨슬|밀크시슬|글루코사민|쏘팔메토|코큐텐|코엔자임|크릴오일|비오틴|바이오틴|마그네슘|아연|칼슘|철분|엽산|셀레늄|요오드|크롬|프로폴리스|스피루리나|클로렐라|히알루론산|레시틴|레스베라트롤|보스웰리아|폴리코사놀|감마리놀렌산|초록입홍합|토코페롤|맥주효모|가르시니아|아르기닌|타우린|크레아틴|bcaa|단백질|프로틴|홍삼정|홍삼환|홍삼캡슐|영양제)/i,
    expect: ['건강기능', '영양보조', '건강보조'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 3. 축산물 (한우/돼지/닭 등)
  { tokenRegex: /(한우|소고기|쇠고기|등심|안심|갈비살|차돌박이|우삼겹|돼지고기|삼겹살|목살|항정살|닭고기|닭다리|닭가슴살|오리고기|양고기|계란|달걀|메추리알)/,
    expect: ['축산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '수산', '건강기능', '가공식품'] },

  // 4. 수산물 (생선/조개 등)
  { tokenRegex: /(연어|고등어|갈치|꽁치|삼치|광어|우럭|돔|장어|새우|랍스터|오징어|문어|낙지|쭈꾸미|미역|다시마|김|김자반|건어물|굴|전복|홍합|바지락)/,
    expect: ['수산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '축산', '건강기능', '가공식품'] },

  // 5. 농산물 (과일/채소/곡물)
  { tokenRegex: /(사과|배|귤|오렌지|레몬|라임|바나나|딸기|블루베리|체리|포도|샤인머스캣|복숭아|자두|망고|파인애플|키위|수박|참외|토마토|아보카도|당근|양파|마늘|생강|감자|고구마|호박|오이|상추|배추|시금치|브로콜리|콩나물|숙주|버섯|대파|쪽파|쌀|현미|찹쌀|보리|콩|팥|땅콩|호두|아몬드|밤|잣)/,
    expect: ['농산물'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '축산', '수산', '건강기능', '가공식품'] },

  // 6. 영상가전 (TV/모니터/프로젝터)
  { tokenRegex: /(tv|티비|모니터|디스플레이|프로젝터|빔프로젝터|블루레이|스크린)/i,
    expect: ['영상가전'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '디지털기기'] },

  // 7. 디지털기기 (스마트폰/노트북/카메라 등)
  { tokenRegex: /(스마트폰|아이폰|갤럭시|핸드폰|휴대폰|태블릿|아이패드|노트북|맥북|키보드|마우스|이어폰|에어팟|헤드폰|블루투스|스피커|카메라|캠코더|드론|usb|보조배터리|충전케이블|충전기|iphone|ipad|airpods|galaxy|macbook|surface|kindle|ps5|xbox|nintendo)/i,
    expect: ['디지털기기'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '영상가전'] },

  // 8. 가전제품 (냉장고/세탁기 등)
  { tokenRegex: /(냉장고|세탁기|건조기|에어컨|전자레인지|밥솥|오븐|토스터|믹서|블렌더|선풍기|히터|가습기|제습기|공기청정기|청소기|로봇청소기|정수기|식기세척기|커피머신|와인셀러|김치냉장고|드라이기|고데기|면도기|이발기)/,
    expect: ['가전제품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '자동차', '완구', '문구', '도서', '영상가전', '디지털기기'] },

  // 9. 침구/커튼/카페트
  { tokenRegex: /(이불|차렵이불|극세사이불|패딩이불|베개|쿠션|매트리스|토퍼|침대시트|침대패드|커튼|블라인드|카페트|러그|카페트|매트)/,
    expect: ['침구', '커튼', '카페트'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 10. 가구
  { tokenRegex: /(소파|식탁|책상|의자|침대|옷장|서랍장|책장|선반|행거|화장대|콘솔|장식장|티테이블|스툴|벤치)/,
    expect: ['가구'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 11. 자동차용품
  { tokenRegex: /(와이퍼|타이어|블랙박스|네비게이션|차량용|엔진오일|미션오일|부동액|와셔액|자동차배터리|차량용방향제|차량용탈취제|핸들커버|시트커버|차량용청소|썬바이저|선쉐이드|루프박스)/,
    expect: ['자동차', '부품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '완구', '문구', '도서'] },

  // 12. 완구
  { tokenRegex: /(레고|블록|장난감|인형|피규어|프라모델|보드게임|퍼즐|큐브|rc카|키덕|모형)/,
    expect: ['완구', '장난감'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '문구', '도서'] },

  // 13. 문구
  { tokenRegex: /(볼펜|연필|샤프|지우개|노트|수첩|메모지|다이어리|파일|클립|스테이플러|호치케스|가위|풀|스카치테이프|마스킹테이프|색종이|크레파스|색연필|물감|붓|화이트|형광펜|네임펜)/,
    expect: ['문구', '사무'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '도서'] },

  // 14. 스포츠/레저
  { tokenRegex: /(골프채|골프공|골프장갑|골프티|덤벨|아령|바벨|요가매트|필라테스|런닝머신|자전거|헬멧|등산|캠핑|텐트|침낭|낚싯대|낚시|수영복|수경|보드|스키|스노우보드|배드민턴|탁구|축구공|농구공|야구공)/,
    expect: ['스포츠', '레저', '레져'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 15. 패션 — 가방
  { tokenRegex: /(백팩|클러치백|숄더백|토트백|크로스백|핸드백|에코백|메신저백|힙색|허리색|보스턴백|미니백|쇼퍼백)/,
    expect: ['가방'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '구두', '신발', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 16. 패션 — 시계
  { tokenRegex: /(손목시계|디지털시계|아날로그시계|메탈시계|가죽시계|스마트워치)/,
    expect: ['시계'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '구두', '신발', '가방', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 17. 패션 — 쥬얼리
  { tokenRegex: /(쥬얼리|주얼리|귀걸이|목걸이|반지|팔찌|발찌|귀금속|순금|18k|14k|실버목걸이|실버반지|실버팔찌|진주|다이아몬드)/,
    expect: ['쥬얼리', '주얼리', '귀금속'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '구두', '신발', '가방', '시계', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 18. 패션 — 신발
  { tokenRegex: /(운동화|스니커즈|구두|로퍼|부츠|샌들|슬리퍼|단화|워킹화|러닝화|등산화|작업화|장화)/,
    expect: ['구두', '신발'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 19. 패션 — 의류
  { tokenRegex: /(카디건|니트|스웨터|티셔츠|블라우스|셔츠|남방|와이셔츠|원피스|치마|스커트|바지|청바지|슬랙스|반바지|레깅스|트레이닝복|파자마|잠옷|속옷|팬티|브라|러닝셔츠|아우터|코트|재킷|점퍼|패딩|무스탕|후드집업|조끼|베스트|양말|스타킹)/,
    expect: ['의류'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 20. 생활화학 (세제/방향제 등)
  { tokenRegex: /(세제|섬유유연제|살균제|소독제|살충제|방향제|디퓨저|탈취제|미백제|제습제|공기청정제|표백제)/,
    expect: ['생활화학', '화학제품'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 21. 가공식품 (라면/과자/음료 등 — 주방 룰 위에 둠: '컵라면'이 '컵'에 먼저 잡히는 것 방지)
  { tokenRegex: /(라면|컵라면|봉지라면|과자|쿠키|초콜릿|사탕|젤리|아이스크림|음료|탄산음료|주스|생수|커피|믹스커피|티백|차|시리얼|즉석밥|즉석국|레토르트|간장|된장|고추장|올리고당|식초|소금|설탕|꿀|잼|소스|드레싱|마요네즈|케첩)/,
    expect: ['가공식품'],
    avoid: ['패션', '잡화', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '화장품', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '농산', '축산', '수산', '건강기능'] },

  // 22. 주방용품
  { tokenRegex: /(냄비|프라이팬|웍|밥그릇|국그릇|접시|볼|컵|머그|텀블러|보온병|도시락|보관용기|밀폐용기|지퍼백|위생장갑|행주|수세미|식기건조대|커트러리|숟가락|젓가락|포크|나이프|도마)/,
    expect: ['주방'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '잡화', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '가전', '디지털', '자동차', '완구', '문구', '도서'] },

  // 23. 생활용품 일반 (치약/칫솔/휴지 등)
  { tokenRegex: /(치약|칫솔|구강청결제|치실|면도기|면도날|화장지|롤화장지|두루마리|물티슈|키친타올|기저귀|생리대|팬티라이너|탐폰|면봉|반창고|밴드|마스크)/,
    expect: ['기타 재화'],
    avoid: ['식품', '건강기능', '농산', '축산', '수산', '화장품', '의류', '패션', '구두', '신발', '가방', '시계', '쥬얼리', '주얼리', '침구', '커튼', '카페트', '가구', '주방', '가전', '디지털', '자동차', '완구', '문구', '도서', '생활화학', '욕실', '의약', '의료기기'] },
];

/** noticeCategoryName이 hint(categoryPath 또는 상품명)에 적합한지 점수화 */
function scoreNoticeCategory(noticeCategoryName: string, hint: string): number {
  if (!hint || !noticeCategoryName) return 0;

  const path = hint.toLowerCase();
  const name = noticeCategoryName.toLowerCase();
  let score = 0;
  let matched = false;

  // 1) categoryPath 기반 룰 (L1 anchor)
  for (const rule of NOTICE_CATEGORY_RULES) {
    if (!rule.pathRegex.test(path)) continue;
    matched = true;
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

  // 2) categoryPath 룰 미매칭 시 → 상품명 토큰 룰 폴백
  //    (hint가 "비타민C 1000mg" 처럼 path가 아닌 상품명일 때)
  if (!matched) {
    for (const rule of PRODUCT_NAME_TOKEN_RULES) {
      if (!rule.tokenRegex.test(path)) continue;
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
  }

  // "기타" 범용 카테고리는 약한 감점 — 단, 룰이 expect로 '기타'를 명시한 경우는 위에서 가산되어 있음
  if (/기타/.test(name) && score < 20) score -= 3;

  return score;
}

/**
 * 복수의 noticeMeta 후보 중 categoryPath에 가장 적합한 것을 선택.
 * 동점이면 첫 번째 (API 반환 순서) 유지.
 */
export function selectBestNoticeMeta(
  noticeMeta: NoticeCategoryMeta[],
  categoryHint?: string,
): NoticeCategoryMeta | null {
  if (noticeMeta.length === 0) return null;
  if (noticeMeta.length === 1) return noticeMeta[0];
  if (!categoryHint) return noticeMeta[0];

  let bestIdx = 0;
  let bestScore = scoreNoticeCategory(noticeMeta[0].noticeCategoryName, categoryHint);
  for (let i = 1; i < noticeMeta.length; i++) {
    const s = scoreNoticeCategory(noticeMeta[i].noticeCategoryName, categoryHint);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  if (bestIdx !== 0) {
    console.log(`[fillNoticeFields] noticeMeta 재선택: [0]"${noticeMeta[0].noticeCategoryName}"(score=${scoreNoticeCategory(noticeMeta[0].noticeCategoryName, categoryHint)}) → [${bestIdx}]"${noticeMeta[bestIdx].noticeCategoryName}"(score=${bestScore}) | path="${categoryHint}"`);
  }
  return noticeMeta[bestIdx];
}

export function fillNoticeFields(
  noticeMeta: NoticeCategoryMeta[],
  product: LocalProductJson,
  contactNumber?: string,
  overrides?: Record<string, string>,
  extractedHints?: ExtractedNoticeHints,
  categoryHint?: string,
): FilledNoticeCategory[] {
  // 쿠팡 API는 notices 필수 — 생략하면 내부 기본값이 oneOf 다중 매칭 에러 유발
  // 반드시 1개 카테고리만 전송해야 함 (oneOf 스키마)

  if (noticeMeta.length > 0) {
    // categoryPath와 가장 적합한 noticeMeta 선택 (단일이면 그대로, 복수면 점수화)
    const selected = selectBestNoticeMeta(noticeMeta, categoryHint) || noticeMeta[0];
    console.log(`[fillNoticeFields] API 메타 사용: "${selected.noticeCategoryName}" (${selected.fields.length}개 필드, 전체 ${noticeMeta.length}개 카테고리, hint="${categoryHint || ''}")`);

    // 도메인 미스매치 soft 경고 — 명백한 잘못된 매칭이면 로깅 (블로킹 X, 모니터링용)
    if (categoryHint) {
      const mismatch = detectDomainMismatch(selected.noticeCategoryName, categoryHint);
      if (mismatch) {
        console.error(`[fillNoticeFields] 🚨 도메인 미스매치 감지: ${mismatch} | path="${categoryHint}" | 후보=${noticeMeta.map(m => m.noticeCategoryName).join(',')}`);
      }
    }

    return [{
      noticeCategoryName: selected.noticeCategoryName,
      noticeCategoryDetailName: selected.fields.map((field) => ({
        noticeCategoryDetailName: field.name,
        content: resolveFieldValue(field.name, product, contactNumber, overrides, extractedHints, categoryHint, selected.noticeCategoryName),
      })),
    }];
  }

  // API 메타 없음 → 빈 배열 반환 (폴백으로 추측하지 않음)
  // "기타 재화" 등 범용 카테고리가 허용되지 않는 display category가 있으므로
  // 잘못된 카테고리 전송보다 빈 배열이 안전 → 빌더에서 notices 키 생략 처리
  console.warn(`[fillNoticeFields] API 메타 없음 → notices 빈 배열 반환 (카테고리별 허용 목록 불명)`);
  return [];
}

/**
 * 도메인 명백한 미스매치 감지 (soft warning, not blocking).
 * 식품 path → 패션 notice 같은 명백한 오매핑만 식별.
 * 회색 영역(베이비 화장품 등)은 비워둠 — 합법 등록 막으면 안 됨.
 */
function detectDomainMismatch(noticeCategoryName: string, categoryPath: string): string | null {
  const path = categoryPath.toLowerCase();
  const notice = noticeCategoryName.toLowerCase();

  // 명백한 미스매치만 — false positive 위험을 감수하더라도 잡아야 할 케이스
  const HARD_RULES: { pathRegex: RegExp; forbidNoticeIncludes: string[]; label: string }[] = [
    { pathRegex: /^식품>건강식품/, forbidNoticeIncludes: ['패션', '의류', '구두', '신발', '가방', '시계', '쥬얼리'], label: '건강식품→패션' },
    { pathRegex: /^식품/, forbidNoticeIncludes: ['패션', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '화장품'], label: '식품→패션/화장품' },
    { pathRegex: /^뷰티/, forbidNoticeIncludes: ['패션', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '식품', '건강기능', '농산', '축산', '수산'], label: '뷰티→패션/식품' },
    { pathRegex: /^자동차/, forbidNoticeIncludes: ['패션', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '화장품', '식품', '건강기능'], label: '자동차→패션/뷰티/식품' },
    { pathRegex: /^도서/, forbidNoticeIncludes: ['패션', '의류', '구두', '신발', '가방', '시계', '쥬얼리', '화장품', '식품', '건강기능', '농산', '축산', '수산', '생활화학', '의약'], label: '도서→타도메인' },
  ];

  for (const rule of HARD_RULES) {
    if (rule.pathRegex.test(path)) {
      for (const forbid of rule.forbidNoticeIncludes) {
        if (notice.includes(forbid)) return rule.label + ` (notice="${noticeCategoryName}")`;
      }
      return null;
    }
  }
  return null;
}

/**
 * 상품정보제공고시의 품명/모델명 필드에 들어갈 상품명 정제.
 *
 * SEO stuffing 누출 방지:
 *   - "사과/배 과일세트 사과/배 과일세트" 같은 반복 표현 제거
 *   - 동일 단어 3회 이상 반복 → 1회로 축약
 *   - 50자 이내로 자름
 *
 * 예: "망고 태국망고 골드망고 남독마이 망고선물 사과/배 과일세트 사과/배 과일세트 사과/배 과일"
 *  → "망고 태국망고 골드망고 남독마이 망고선물"
 */
function sanitizeProductNameForNotice(name: string): string {
  if (!name) return '';
  let s = name;
  // 카테고리 묶음 SEO 패턴 제거 (특정 단어 조합)
  s = s.replace(/사과\/배\s*과일세트/g, '');
  s = s.replace(/과일\s*세트(\s*과일\s*세트)+/g, '과일세트');
  // 강조 마커 제거
  s = s.replace(/[★☆◆◇■□●○▶▷※♥♡♠♣]/g, ' ');
  // 가격 토큰 제거
  s = s.replace(/\d+\s*원(?!료|두|산|어)/g, ' ');
  // 같은 단어 2+회 연속 반복 → 1회 (예: "사과 사과 사과" → "사과")
  s = s.replace(/(\b\S+\b)(\s+\1){1,}/g, '$1');
  // 다중 공백 정규화
  s = s.replace(/\s+/g, ' ').trim();
  // 50자 컷
  return s.slice(0, 50);
}

/**
 * 필드명 패턴으로 적절한 값을 매칭
 */
function resolveFieldValue(
  fieldName: string,
  product: LocalProductJson,
  contactNumber?: string,
  overrides?: Record<string, string>,
  hints?: ExtractedNoticeHints,
  categoryHint?: string,
  noticeCategoryName?: string,
): string {
  // 사용자가 수동으로 지정한 값 우선
  // 프론트엔드는 "카테고리명::필드명" 형식으로 키를 보내므로 양쪽 모두 매칭
  if (overrides) {
    if (overrides[fieldName]) return overrides[fieldName];
    // "카테고리명::필드명" 형식 키에서 필드명 매칭
    for (const key of Object.keys(overrides)) {
      if (key.includes('::')) {
        const afterSep = key.split('::')[1];
        if (afterSep === fieldName && overrides[key]) return overrides[key];
      }
    }
  }

  const normalized = fieldName.toLowerCase().replace(/\s/g, '');
  const productName = (product.name || product.title || '').slice(0, 50);
  const brand = product.brand || '';

  // ⚠️ 건기식(건강기능식품) 카테고리 감지 — 필수 표시사항이 많아 별도 처리.
  //    노출고시 카테고리명에 "건강기능식품"이 들어가면 건기식으로 판단.
  //    이 카테고리에선 "상세페이지 참조" 대신 명시값을 줘야 식약처 적발 회피.
  const productNameLower = (product.name || '').toLowerCase();
  const isHealthFunctionalFood = /비타민|미네랄|오메가|유산균|프로바이오틱|콜라겐|루테인|밀크씨슬|글루코사민|쏘팔메토|코큐텐|코엔자임|크릴오일|비오틴|바이오틴|마그네슘|아연|칼슘|철분|엽산|셀레늄|프로폴리스|스피루리나|클로렐라|히알루론산|레시틴|보스웰리아|폴리코사놀|영양제|건강기능|홍삼정|홍삼환|홍삼캡슐/.test(productNameLower);

  // ⚠️ 일반 식품(과일/채소/곡물/축수산/가공식품) — 식품표시광고법 §4 필수 표시사항 충족용.
  //    "상세페이지 참조"는 일반 식품에서도 위반이라 명시값 보강.
  const _categoryStr = `${categoryHint || ''} ${noticeCategoryName || ''}`;
  const isGeneralFood =
    /식품|농산|과일|채소|곡물|수산|축산|가공식품|신선식품|음료|차류|간식|스낵|냉동식품|조미료|장류|발효|양념|식자재|즉석식품|즉석조리|반찬|김치|건어물|곡류|두부|면류|국수|라면|떡|빵|과자|초콜릿/.test(_categoryStr)
    || /^(사과|배|감|귤|오렌지|레몬|자몽|바나나|파인애플|망고|딸기|블루베리|포도|복숭아|체리|키위|아보카도|수박|멜론|호박|토마토|오이|당근|감자|고구마|양파|마늘|쌀|현미|찹쌀|보리|밀가루|식초|간장|된장|고추장|꿀|소금|설탕|기름|참기름|들기름|올리브유)/.test(productNameLower);

  // 패턴 매칭 규칙 (추출된 옵션값 hints 활용)
  if (normalized.includes('품명') || normalized.includes('모델명') || normalized.includes('제품명')) {
    // 상품명에 SEO stuffing("사과/배 과일세트" 반복 등) 누출 방지 — 정제 후 사용
    return sanitizeProductNameForNotice(productName) || '상세페이지 참조';
  }
  if (normalized.includes('브랜드') || normalized.includes('상호')) {
    return brand || '상세페이지 참조';
  }
  if (normalized.includes('제조국') || normalized.includes('원산지')) {
    if (isHealthFunctionalFood) return '대한민국';  // 건기식은 명시 의무
    if (isGeneralFood) return '대한민국';  // 일반 식품도 식품표시광고법상 명시 필수
    return '상세페이지 참조';
  }
  // 건기식 의약품 여부 — "의약품 아님" 명시
  if (normalized.includes('의약품여부') || (normalized.includes('의약품') && !normalized.includes('의약품여부'))) {
    return '의약품 아님';
  }
  // 건기식 유전자변형 표시 — "해당사항 없음" 명시
  if (normalized.includes('유전자변형') || normalized.includes('gmo')) {
    return '해당사항 없음';
  }
  // 건기식 수입 여부 — 국내 GMP 인증 제품이라고 명시 (사용자가 변경 가능)
  if (normalized.includes('수입') && (normalized.includes('건강기능식품') || normalized.includes('문구') || isHealthFunctionalFood)) {
    return '해당사항 없음 (국내 제조)';
  }
  // 건기식 소비기한/유통기한
  if (normalized.includes('소비기한') || normalized.includes('유통기한')) {
    if (isHealthFunctionalFood) return '제조일로부터 24개월';
    if (isGeneralFood) {
      // 신선식품(과일/채소)은 짧음, 가공식품은 김
      if (/과일|채소|농산|신선식품|수산|축산/.test(_categoryStr)) return '수령 후 가능한 빠른 시일 내 섭취 권장';
      return '제품 라벨 표기일까지';
    }
    return '상세페이지 참조';
  }
  // 건기식 보관방법
  if (normalized.includes('보관방법')) {
    if (isHealthFunctionalFood) return '직사광선을 피해 서늘하고 건조한 곳에 보관';
    if (isGeneralFood) {
      if (/과일|채소|신선식품|냉장|냉동/.test(_categoryStr)) return '냉장 보관 (0~10℃)';
      return '직사광선을 피해 서늘하고 건조한 곳에 보관';
    }
    return '상세페이지 참조';
  }
  // 섭취량/섭취방법
  if (normalized.includes('섭취량') || normalized.includes('섭취방법')) {
    if (isHealthFunctionalFood) return '1일 1~2회, 1회 1정 식후 섭취';
    return '상세페이지 참조';
  }
  // 영양정보/기능정보 — 사용자가 직접 입력 필요한 영역, 안전한 default
  if (normalized.includes('영양정보') || normalized.includes('기능정보') || normalized.includes('영양성분')) {
    if (isHealthFunctionalFood) return '제품 라벨 표기사항 참고';
    return '상세페이지 참조';
  }
  // 원료명 및 함량 — 건기식 핵심 필드
  if (normalized.includes('원료') && normalized.includes('함량')) {
    if (isHealthFunctionalFood) return '제품 라벨 표기사항 참고';
    return '상세페이지 참조';
  }
  // 소비자 안전 주의사항
  if (normalized.includes('안전') && normalized.includes('주의')) {
    if (isHealthFunctionalFood) return '알레르기 체질, 임산부, 의약품 복용자는 의사와 상담 후 섭취';
    return '상세페이지 참조';
  }
  // 소비자상담 전화번호 — 식품/건기식은 필수, 미입력 시 안내 문구
  if (normalized.includes('소비자상담') || normalized.includes('상담관련')) {
    if (contactNumber) return contactNumber;
    if (isHealthFunctionalFood || isGeneralFood) return '판매자 고객센터로 문의';
    return '상세페이지 참조';
  }
  if (normalized.includes('제조자') || normalized.includes('수입자') || normalized.includes('제조업자')) {
    if (brand) return brand;
    if (isHealthFunctionalFood || isGeneralFood) return '제품 라벨 표기사항 참고';
    return '상세페이지 참조';
  }
  if (normalized.includes('a/s') || normalized.includes('as') || normalized.includes('책임자') || normalized.includes('전화번호')) {
    if (contactNumber) return contactNumber;
    if (isHealthFunctionalFood || isGeneralFood) return '판매자 고객센터로 문의';
    return '상세페이지 참조';
  }
  if (normalized.includes('인증') || normalized.includes('허가')) {
    return '해당사항 없음';
  }
  // 크기/중량/용량: 추출된 값이 있으면 우선 사용
  if (normalized.includes('용량') || normalized.includes('내용량')) {
    if (hints?.volume) return hints.volume;
    return '상세페이지 참조';
  }
  if (normalized.includes('중량') || normalized.includes('무게') || normalized.includes('순중량')) {
    if (hints?.weight) return hints.weight;
    return '상세페이지 참조';
  }
  if (normalized.includes('크기') || normalized.includes('치수')) {
    if (hints?.size) return hints.size;
    return '상세페이지 참조';
  }
  if (normalized.includes('색상') || normalized.includes('컬러')) {
    if (hints?.color) return hints.color;
    return '상세페이지 참조';
  }
  if (normalized.includes('수량') || normalized.includes('구성')) {
    if (hints?.count) return hints.count;
    return '상세페이지 참조';
  }
  if (normalized.includes('소재') || normalized.includes('재질') || normalized.includes('성분')) {
    if (hints?.material) return hints.material;
    return '상세페이지 참조';
  }
  if (normalized.includes('주의사항') || normalized.includes('취급')) {
    return '상세페이지 참조';
  }
  if (normalized.includes('품질보증') || normalized.includes('보증기간')) {
    return '제조사 기준';
  }
  if (normalized.includes('제조연월') || normalized.includes('생산일') || normalized.includes('날짜')) {
    return '상세페이지 참조';
  }

  // 기본값: 안전한 "상세페이지 참조"
  return '상세페이지 참조';
}

// ─── AI fallback (GPT-4o-mini) ───────────────────────────────────
// 룰베이스 매칭이 "상세페이지 참조" 폴백한 필드만 모아서 GPT 에 일괄 query.
// 카테고리/상품명/브랜드 컨텍스트를 줘서 합리적 default 값을 추론.
//
// 비용: 카테고리 path + 상품명 + 필드 목록 ≈ 300 토큰 input + ~100 토큰 output
//   → 상품 1개당 ≈ $0.00012 (gpt-4o-mini 기준). 1만 건 = $1.2.
// 룰베이스가 잡지 못한 필드만 진입하므로 실제 호출 빈도는 더 낮음.

const AI_FILLABLE_PLACEHOLDER = '상세페이지 참조';

/**
 * filled 결과에서 "상세페이지 참조"로 남은 필드를 GPT-4o-mini 로 보강한다.
 *
 * 원칙:
 *   - 룰베이스가 답한 값(브랜드/원산지/유통기한 등)은 절대 덮어쓰지 않음
 *   - AI 답이 비합리적이면 원본 placeholder 유지 (안전 fallback)
 *   - 한 상품 = 한 번의 GPT 호출 (필드 묶음 처리)
 *   - OPENAI_API_KEY 미설정 시 silently skip
 */
export async function aiFillRemainingNotices(
  filled: FilledNoticeCategory[],
  productName: string,
  categoryHint?: string,
  brand?: string,
): Promise<FilledNoticeCategory[]> {
  if (filled.length === 0) return filled;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return filled;

  // 1. 채워야 할 필드 추출
  const emptyFields: string[] = [];
  for (const cat of filled) {
    for (const f of cat.noticeCategoryDetailName) {
      if (f.content === AI_FILLABLE_PLACEHOLDER) emptyFields.push(f.noticeCategoryDetailName);
    }
  }
  if (emptyFields.length === 0) return filled;

  // 2. GPT-4o-mini 호출
  const systemPrompt = `당신은 쿠팡 상품 등록 전문가입니다. 카테고리와 상품명에 적합한 상품정보제공고시 필드 값을 한국어로 합리적인 default 값을 추측해 채워주세요.
규칙:
- 모르면 "상세페이지 참조"로 남겨주세요 (확실치 않은 값보다 안전).
- 식약처/공정거래위원회 표시 의무 항목은 보수적으로 답하세요 ("의약품 아님", "해당사항 없음" 등).
- 길이는 50자 이내로 간결하게.
- 응답은 JSON 객체로만 답하세요. 설명/마크다운 없이.`;

  const userPrompt = `카테고리: ${categoryHint || '미지정'}
상품명: ${productName.slice(0, 100)}
브랜드: ${brand || '미지정'}

채워야 할 필드 목록 (JSON key 로 그대로 사용):
${emptyFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}

응답 예시:
{"제조국": "대한민국", "용량(중량)": "500g"}`;

  let aiAnswers: Record<string, string> = {};
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      console.warn(`[aiFillRemainingNotices] OpenAI HTTP ${res.status} — fallback 유지`);
      return filled;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        aiAnswers = parsed as Record<string, string>;
      }
    }
  } catch (err) {
    console.warn('[aiFillRemainingNotices] AI 호출 실패 — placeholder 유지:', err instanceof Error ? err.message : err);
    return filled;
  }

  // 3. 결과 병합 — 비어있던 필드만 AI 값으로 교체. AI 답이 비합리(빈 문자열/너무 김)이면 원본 유지.
  let filledCount = 0;
  const out = filled.map((cat) => ({
    noticeCategoryName: cat.noticeCategoryName,
    noticeCategoryDetailName: cat.noticeCategoryDetailName.map((f) => {
      if (f.content !== AI_FILLABLE_PLACEHOLDER) return f;
      const aiVal = aiAnswers[f.noticeCategoryDetailName];
      if (typeof aiVal !== 'string') return f;
      const trimmed = aiVal.trim();
      if (trimmed.length === 0 || trimmed.length > 100) return f;
      // AI 가 placeholder 그대로 답했으면 보존 — 불필요한 substitution 방지
      if (trimmed === AI_FILLABLE_PLACEHOLDER) return f;
      filledCount++;
      return { noticeCategoryDetailName: f.noticeCategoryDetailName, content: trimmed };
    }),
  }));
  console.log(`[aiFillRemainingNotices] ${filledCount}/${emptyFields.length} 필드 AI 채움 — productName="${productName.slice(0, 30)}", category="${categoryHint || '?'}"`);
  return out;
}
