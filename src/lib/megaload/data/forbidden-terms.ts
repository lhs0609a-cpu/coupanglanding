// ============================================================
// 상품명 규제 금지어 데이터베이스
// 건기식법, 화장품법, 식품표시광고법, 약사법, 표시광고법, 쿠팡정책
//
// severity:
//   'error'   → 자동 제거 (법적 위반 확실)
//   'warning' → 경고만 (맥락에 따라 위반 가능)
// ============================================================

export type ForbiddenSeverity = 'error' | 'warning';

export interface ForbiddenTerm {
  pattern: RegExp;
  label: string;
  severity: ForbiddenSeverity;
  category: string;
}

export interface ForbiddenCategory {
  name: string;
  law: string;
  terms: ForbiddenTerm[];
}

// 생활용품/세제 카테고리 키워드 — "항균", "살균" 등은 이 카테고리에서 허용
const HOUSEHOLD_KEYWORDS = ['세제', '세탁', '세정', '살균제', '소독', '청소', '주방', '욕실', '화장실'];

export function isHouseholdCategory(categoryContext?: string): boolean {
  if (!categoryContext) return false;
  const lower = categoryContext.toLowerCase();
  return HOUSEHOLD_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---- 건기식법 (건강기능식품에 관한 법률) ----
const HEALTH_FOOD_LAW: ForbiddenCategory = {
  name: '건기식법',
  law: '건강기능식품에 관한 법률',
  terms: [
    // error: 질병 치료/예방 표현
    { pattern: /치료/g, label: '치료', severity: 'error', category: '건기식법' },
    { pattern: /완치/g, label: '완치', severity: 'error', category: '건기식법' },
    { pattern: /항암/g, label: '항암', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])당뇨(?![식기계])/g, label: '당뇨', severity: 'error', category: '건기식법' },
    { pattern: /고혈압/g, label: '고혈압', severity: 'error', category: '건기식법' },
    { pattern: /치매/g, label: '치매', severity: 'error', category: '건기식법' },
    { pattern: /골다공증/g, label: '골다공증', severity: 'error', category: '건기식법' },
    { pattern: /아토피/g, label: '아토피', severity: 'error', category: '건기식법' },
    { pattern: /해독/g, label: '해독', severity: 'error', category: '건기식법' },
    { pattern: /디톡스/g, label: '디톡스', severity: 'error', category: '건기식법' },
    { pattern: /만병통치/g, label: '만병통치', severity: 'error', category: '건기식법' },
    { pattern: /약효/g, label: '약효', severity: 'error', category: '건기식법' },
    { pattern: /진통/g, label: '진통', severity: 'error', category: '건기식법' },
    { pattern: /소염/g, label: '소염', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])암(?!막|밴드|벽|석|면|판|호|퇘|기와|회색|청색|갈색|적색|녹색|흑색)/g, label: '암(질병)', severity: 'error', category: '건기식법' },
    { pattern: /질병예방/g, label: '질병예방', severity: 'error', category: '건기식법' },
    // error: 추가 질병명 (상세페이지 AI 검수 대응)
    { pattern: /간경화/g, label: '간경화', severity: 'error', category: '건기식법' },
    { pattern: /관절염/g, label: '관절염', severity: 'error', category: '건기식법' },
    { pattern: /위장병/g, label: '위장병', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])변비(?!약)/g, label: '변비', severity: 'error', category: '건기식법' },
    { pattern: /불면증/g, label: '불면증', severity: 'error', category: '건기식법' },
    { pattern: /우울증/g, label: '우울증', severity: 'error', category: '건기식법' },
    { pattern: /빈혈/g, label: '빈혈', severity: 'error', category: '건기식법' },
    { pattern: /동맥경화/g, label: '동맥경화', severity: 'error', category: '건기식법' },
    { pattern: /뇌졸중/g, label: '뇌졸중', severity: 'error', category: '건기식법' },
    { pattern: /심근경색/g, label: '심근경색', severity: 'error', category: '건기식법' },
    { pattern: /부정맥/g, label: '부정맥', severity: 'error', category: '건기식법' },
    { pattern: /전립선/g, label: '전립선', severity: 'error', category: '건기식법' },
    { pattern: /갱년기/g, label: '갱년기', severity: 'error', category: '건기식법' },
    // error: 의약품 혼동 표현
    { pattern: /처방/g, label: '처방', severity: 'error', category: '건기식법' },
    { pattern: /투여/g, label: '투여', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])즉효/g, label: '즉효', severity: 'error', category: '건기식법' },
    { pattern: /특효/g, label: '특효', severity: 'error', category: '건기식법' },
    { pattern: /명약/g, label: '명약', severity: 'error', category: '건기식법' },
    { pattern: /신약/g, label: '신약', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])탈모(?!케어|방지|샴푸)/g, label: '탈모', severity: 'error', category: '건기식법' },
    // warning: 기능성 과장 가능 표현 + 의료 암시 (심의 필요)
    { pattern: /혈행개선/g, label: '혈행개선', severity: 'warning', category: '건기식법' },
    { pattern: /면역력강화/g, label: '면역력강화', severity: 'warning', category: '건기식법' },
    { pattern: /콜레스테롤\s*관리/g, label: '콜레스테롤관리', severity: 'warning', category: '건기식법' },
    { pattern: /혈당\s*관리/g, label: '혈당관리', severity: 'warning', category: '건기식법' },
    { pattern: /체지방\s*감소/g, label: '체지방감소', severity: 'warning', category: '건기식법' },

    // error: 건기식 효능 단정 광고 (식품표시광고법 위반 — 인정 표현은 "...에 도움을 줄 수 있음")
    { pattern: /확실히\s*(줄었|달라졌|좋아졌|개선됐|효과)/g, label: '효능단정-확실히', severity: 'error', category: '건기식법' },
    { pattern: /피로감이?\s*(줄|사라|없어)/g, label: '피로감 효능단정', severity: 'error', category: '건기식법' },
    { pattern: /변화가?\s*눈에\s*보(여|입니)/g, label: '변화눈에보임-효능단정', severity: 'error', category: '건기식법' },
    { pattern: /체감이?\s*(빠른|좋|있)/g, label: '체감-효능단정', severity: 'error', category: '건기식법' },
    { pattern: /진작\s*(먹|드)/g, label: '진작먹을걸-효능단정', severity: 'error', category: '건기식법' },
    { pattern: /이건?\s*진짜(예요|입니다|에요)/g, label: '진짜-단정과장', severity: 'error', category: '건기식법' },
    { pattern: /이거\s*먹고\s*나서/g, label: '이거먹고나서-효능단정', severity: 'error', category: '건기식법' },
    { pattern: /꾸준히\s*(먹|드시)고\s*나서\s*(확실히|달라)/g, label: '꾸준히먹고달라짐', severity: 'error', category: '건기식법' },
    { pattern: /임산부라면\s*특히/g, label: '임산부 효능광고', severity: 'error', category: '건기식법' },

    // error: 미인정 기능성 (성분과 무관한 효능 표시 — 데이터 누수에서 자주 발생)
    { pattern: /에너지충전/g, label: '에너지충전-미인정', severity: 'error', category: '건기식법' },
    { pattern: /체력증진/g, label: '체력증진-미인정', severity: 'error', category: '건기식법' },
    { pattern: /건강\s*챙기고\s*싶/g, label: '건강챙기고싶-권유', severity: 'warning', category: '건기식법' },

    // error: 식품/과일에 대한 성분 효능 단정 (LLM 환각으로 자주 등장)
    { pattern: /(안토시아닌|폴리페놀|플라보노이드|카테킨|레스베라트롤|루테올린|쿼세틴|클로로겐산|오메가3?|EPA|DHA|식이섬유|비타민\s*[A-Z]|미네랄)이?\s*좋다/g, label: '성분효능단정', severity: 'error', category: '건기식법' },
    { pattern: /(안토시아닌|폴리페놀|플라보노이드|카테킨|식이섬유)이?\s*풍부.*효과/g, label: '성분풍부효능시사', severity: 'error', category: '건기식법' },
    { pattern: /다이어트(에게|하시는|하는|중인|러)\s*(잘\s*맞|좋|딱|특히|적합|추천)/g, label: '다이어트-효능광고', severity: 'error', category: '건기식법' },
    { pattern: /다이어트.*[과음간식]에\s*특히/g, label: '다이어트-효능광고', severity: 'error', category: '건기식법' },
    { pattern: /자기\s*전에\s*\d+초.*건강/g, label: '취침전건강-효능시사', severity: 'error', category: '건기식법' },
    { pattern: /\d+\s*개월\s*(꾸준|먹|드시).*(효과|변화|차이)/g, label: '기간효능단정', severity: 'error', category: '건기식법' },
    { pattern: /이\s*가격에\s*이\s*함량/g, label: '함량과장-건기식용어오용', severity: 'warning', category: '건기식법' },
    { pattern: /건강\s*챙기기/g, label: '건강챙기기-건기식오인', severity: 'warning', category: '건기식법' },
    { pattern: /뉴스에서\s*.*좋다고/g, label: '뉴스인용효능단정', severity: 'error', category: '건기식법' },

    // error: 막연한 인증 표시 (구체적 인증번호 없이 "식약처 검증" 등은 위반)
    { pattern: /식약처\s*안전성\s*검증/g, label: '식약처막연인증', severity: 'error', category: '건기식법' },
    { pattern: /식약처\s*인정\s*완료/g, label: '식약처막연인증', severity: 'error', category: '건기식법' },
    { pattern: /(?<![가-힣])천연(?!분|색소)\s*(분야|원료|성분).*관심/g, label: '천연-막연표시', severity: 'warning', category: '건기식법' },
  ],
};

// ---- 화장품법 ----
const COSMETICS_LAW: ForbiddenCategory = {
  name: '화장품법',
  law: '화장품법',
  terms: [
    { pattern: /세포재생/g, label: '세포재생', severity: 'error', category: '화장품법' },
    { pattern: /보톡스/g, label: '보톡스', severity: 'error', category: '화장품법' },
    { pattern: /피부재생/g, label: '피부재생', severity: 'error', category: '화장품법' },
    { pattern: /DNA복구/g, label: 'DNA복구', severity: 'error', category: '화장품법' },
    { pattern: /줄기세포배양/g, label: '줄기세포배양', severity: 'error', category: '화장품법' },
    // warning
    { pattern: /주름제거/g, label: '주름제거', severity: 'warning', category: '화장품법' },
    { pattern: /기미제거/g, label: '기미제거', severity: 'warning', category: '화장품법' },
  ],
};

// ---- 식품표시광고법 ----
const FOOD_AD_LAW: ForbiddenCategory = {
  name: '식품표시광고법',
  law: '식품 등의 표시·광고에 관한 법률',
  terms: [
    { pattern: /체질개선/g, label: '체질개선', severity: 'error', category: '식품표시광고법' },
    // warning
    { pattern: /지방분해/g, label: '지방분해', severity: 'warning', category: '식품표시광고법' },
    { pattern: /식욕억제/g, label: '식욕억제', severity: 'warning', category: '식품표시광고법' },
  ],
};

// ---- 약사법 ----
const PHARMA_LAW: ForbiddenCategory = {
  name: '약사법',
  law: '약사법',
  terms: [
    { pattern: /의료기기/g, label: '의료기기', severity: 'error', category: '약사법' },
    { pattern: /의사추천/g, label: '의사추천', severity: 'error', category: '약사법' },
    { pattern: /FDA인증/g, label: 'FDA인증', severity: 'error', category: '약사법' },
    { pattern: /임상시험/g, label: '임상시험', severity: 'error', category: '약사법' },
  ],
};

// ---- 표시광고법 ----
const AD_LAW: ForbiddenCategory = {
  name: '표시광고법',
  law: '표시·광고의 공정화에 관한 법률',
  terms: [
    { pattern: /최고/g, label: '최고', severity: 'error', category: '표시광고법' },
    { pattern: /(?<![가-힣])1위/g, label: '1위', severity: 'error', category: '표시광고법' },
    { pattern: /기적/g, label: '기적', severity: 'error', category: '표시광고법' },
    { pattern: /완벽/g, label: '완벽', severity: 'error', category: '표시광고법' },
    { pattern: /100%보장/g, label: '100%보장', severity: 'error', category: '표시광고법' },
    { pattern: /놀라운/g, label: '놀라운', severity: 'error', category: '표시광고법' },
    { pattern: /충격/g, label: '충격', severity: 'error', category: '표시광고법' },
    { pattern: /폭발적/g, label: '폭발적', severity: 'error', category: '표시광고법' },
    // warning
    { pattern: /특허/g, label: '특허', severity: 'warning', category: '표시광고법' },
    { pattern: /(?<![가-힣])인증(?![서번])/g, label: '인증', severity: 'warning', category: '표시광고법' },
    { pattern: /검증된/g, label: '검증된', severity: 'warning', category: '표시광고법' },
  ],
};

// ---- 쿠팡정책 ----
const COUPANG_POLICY: ForbiddenCategory = {
  name: '쿠팡정책',
  law: '쿠팡 마켓플레이스 상품명 가이드',
  terms: [
    { pattern: /무료배송/g, label: '무료배송', severity: 'error', category: '쿠팡정책' },
    { pattern: /할인/g, label: '할인', severity: 'error', category: '쿠팡정책' },
    { pattern: /세일/g, label: '세일', severity: 'error', category: '쿠팡정책' },
    { pattern: /특가/g, label: '특가', severity: 'error', category: '쿠팡정책' },
    { pattern: /이벤트/g, label: '이벤트', severity: 'error', category: '쿠팡정책' },
    { pattern: /핫딜/g, label: '핫딜', severity: 'error', category: '쿠팡정책' },
    { pattern: /당일발송/g, label: '당일발송', severity: 'error', category: '쿠팡정책' },
    { pattern: /최저가/g, label: '최저가', severity: 'error', category: '쿠팡정책' },
    { pattern: /한정/g, label: '한정', severity: 'error', category: '쿠팡정책' },
    { pattern: /베스트/g, label: '베스트', severity: 'error', category: '쿠팡정책' },
    { pattern: /(?<![가-힣])1등/g, label: '1등', severity: 'error', category: '쿠팡정책' },
    { pattern: /추천/g, label: '추천', severity: 'error', category: '쿠팡정책' },
    { pattern: /[★☆♥♡▶▷◀◁●○■□◆◇△▽♠♣♦♬♪♩⊙◎]/g, label: '특수문자', severity: 'error', category: '쿠팡정책' },
    { pattern: /\b(?:SALE|HOT|BEST|NEW|EVENT|FREE)\b/gi, label: '영문 마케팅 금지어', severity: 'error', category: '쿠팡정책' },
    { pattern: /로켓배송/g, label: '로켓배송', severity: 'error', category: '쿠팡정책' },
    { pattern: /타임세일/g, label: '타임세일', severity: 'error', category: '쿠팡정책' },
    { pattern: /끝판왕/g, label: '끝판왕', severity: 'error', category: '쿠팡정책' },
    // warning
    { pattern: /정품/g, label: '정품', severity: 'warning', category: '쿠팡정책' },
    { pattern: /공식/g, label: '공식', severity: 'warning', category: '쿠팡정책' },
  ],
};

// ---- 전체 카테고리 모음 ----
export const FORBIDDEN_CATEGORIES: ForbiddenCategory[] = [
  HEALTH_FOOD_LAW,
  COSMETICS_LAW,
  FOOD_AD_LAW,
  PHARMA_LAW,
  AD_LAW,
  COUPANG_POLICY,
];

/**
 * AI 프롬프트에 주입할 금지어 목록 텍스트 반환
 */
export function getForbiddenTermsForPrompt(): string {
  const lines: string[] = [];
  for (const cat of FORBIDDEN_CATEGORIES) {
    const errorLabels = cat.terms.filter((t) => t.severity === 'error').map((t) => t.label);
    if (errorLabels.length > 0) {
      lines.push(`[${cat.name}] ${errorLabels.join('/')}`);
    }
  }
  return lines.join('\n');
}

/**
 * 모든 금지어 라벨을 플랫 배열로 반환 (SEO 풀 정리 등에 활용)
 */
export function getForbiddenKeywordsFlat(): string[] {
  const keywords: string[] = [];
  for (const cat of FORBIDDEN_CATEGORIES) {
    for (const term of cat.terms) {
      if (!keywords.includes(term.label)) {
        keywords.push(term.label);
      }
    }
  }
  return keywords;
}
