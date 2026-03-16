/**
 * 쿠팡 광고 아카데미 - 7개 스테이지 데이터
 * 게임형 튜토리얼: 스토리 → 개념카드 → 미니게임 → 퀴즈 → 클리어
 */

export interface ConceptCard {
  emoji: string;
  title: string;
  content: string;
  bonusTip?: { id: string; text: string; points: number };
}

export interface QuizQuestion {
  id: string;
  type: 'ox' | 'multiple';
  question: string;
  correctAnswer: string;
  options?: { key: string; label: string }[];
  explanation: string;
}

export interface OXItem {
  statement: string;
  answer: boolean;
  explanation: string;
}

export interface KeywordItem {
  word: string;
  isGood: boolean;
  reason: string;
}

export interface BidScenario {
  productName: string;
  price: number;
  marginRate: number;
  optimalBidRange: [number, number];
  dailyBudget: number;
}

export interface ROASScenario {
  adSpend: number;
  revenue: number;
  targetROAS: number;
}

export interface StrategyScenario {
  situation: string;
  options: { key: string; label: string; isCorrect: boolean; explanation: string }[];
}

export interface AdAcademyStage {
  id: string;
  stageNumber: number;
  title: string;
  subtitle: string;
  emoji: string;
  themeColor: string;
  bgGradient: string;
  storyIntro: {
    title: string;
    lines: string[];
  };
  conceptCards: ConceptCard[];
  miniGameType: 'ox' | 'keyword' | 'bid-slider' | 'roas-calc' | 'strategy' | 'comprehensive';
  miniGameData: OXItem[] | KeywordItem[] | BidScenario | ROASScenario[] | StrategyScenario[] | QuizQuestion[];
  checkpointQuiz: QuizQuestion[];
  rewards: {
    basePoints: number;
    perfectBonus: number;
    badge?: string;
    badgeLabel?: string;
  };
  starThresholds: { one: number; two: number; three: number };
}

export const AD_ACADEMY_POINTS = {
  perStage: 20,
  bossStage: 50,
  perfectBonus: 10,
  bonusTip: 5,
  allClearBonus: 100,
  allPerfectBonus: 50,
};

export const AD_ACADEMY_STAGES: AdAcademyStage[] = [
  // ═══════════════════════════════════════
  // Stage 1: 광고란 뭘까?
  // ═══════════════════════════════════════
  {
    id: 'stage-1',
    stageNumber: 1,
    title: '광고란 뭘까?',
    subtitle: '쿠팡 광고의 기본 개념을 배워요',
    emoji: '💡',
    themeColor: '#3B82F6',
    bgGradient: 'from-blue-500 to-blue-600',
    storyIntro: {
      title: '광고, 왜 해야 할까?',
      lines: [
        '상품을 등록했는데 조회수가 안 나온다면?',
        '쿠팡에는 수백만 개 상품이 있어요.',
        '광고를 하면 검색 상단에 노출되어 클릭과 매출이 올라갑니다.',
        '이번 스테이지에서 광고의 기본 개념을 알아봐요!',
      ],
    },
    conceptCards: [
      {
        emoji: '📢',
        title: 'CPC 광고란?',
        content: 'CPC = Cost Per Click\n클릭할 때만 돈을 내는 광고예요.\n\n고객이 내 광고를 "클릭"하면 그때 비용이 발생!\n보기만 하고 지나가면? 공짜!',
        bonusTip: { id: 'tip-1-1', text: '쿠팡 광고는 100원부터 시작할 수 있어요. 부담없이 시작해보세요!', points: 5 },
      },
      {
        emoji: '🔍',
        title: '광고는 어디에 보여요?',
        content: '고객이 쿠팡에서 검색하면\n검색 결과 상단에 "광고" 배지와 함께\n내 상품이 나타나요!\n\n검색 → 광고 클릭 → 상품 페이지 → 구매!',
      },
      {
        emoji: '💰',
        title: '왜 광고를 해야 하나요?',
        content: '쿠팡에는 수백만 개 상품이 있어요.\n광고 없이는 내 상품을 찾기가 매우 어려워요.\n\n광고를 하면:\n✅ 검색 상단에 노출\n✅ 더 많은 클릭\n✅ 더 많은 매출!',
      },
      {
        emoji: '🎯',
        title: '광고의 목표',
        content: '광고의 최종 목표는 단순해요:\n\n"광고비보다 더 많이 벌기!"\n\n광고비 1만원 → 매출 3만원이면\n아주 잘하고 있는 거예요! 👏',
        bonusTip: { id: 'tip-1-2', text: '광고비 대비 매출 비율을 ROAS라고 해요. Stage 5에서 자세히 배워요!', points: 5 },
      },
    ],
    miniGameType: 'ox',
    miniGameData: [
      { statement: '쿠팡 광고는 고객이 클릭할 때만 비용이 발생한다', answer: true, explanation: 'CPC(클릭당 과금) 방식이라 클릭해야 비용이 발생해요!' },
      { statement: '광고를 하면 무조건 1등으로 노출된다', answer: false, explanation: '입찰가, 상품 품질, 리뷰 등 여러 요소가 순위에 영향을 줘요.' },
      { statement: '광고비가 매출보다 많으면 손해다', answer: true, explanation: '광고비 > 매출이면 적자! 항상 ROAS를 체크해야 해요.' },
      { statement: '쿠팡 광고는 사업자만 할 수 있다', answer: true, explanation: '쿠팡 마켓플레이스에 입점한 사업자만 광고할 수 있어요.' },
      { statement: '광고 한 번 시작하면 멈출 수 없다', answer: false, explanation: '언제든 자유롭게 시작하고 멈출 수 있어요!' },
    ] as OXItem[],
    checkpointQuiz: [
      { id: 'q1-1', type: 'multiple', question: 'CPC 광고에서 비용이 발생하는 시점은?', correctAnswer: 'b', options: [{ key: 'a', label: '광고가 보여질 때' }, { key: 'b', label: '고객이 클릭할 때' }, { key: 'c', label: '고객이 구매할 때' }], explanation: 'CPC = Click당 과금이에요. 클릭해야 비용이 발생해요!' },
      { id: 'q1-2', type: 'ox', question: '쿠팡 광고의 목표는 "광고비보다 더 많이 버는 것"이다', correctAnswer: 'O', explanation: '광고비 < 매출이면 수익이 나는 거예요!' },
      { id: 'q1-3', type: 'multiple', question: '쿠팡 광고는 주로 어디에 노출되나요?', correctAnswer: 'a', options: [{ key: 'a', label: '검색 결과 상단' }, { key: 'b', label: '쿠팡 로그인 화면' }, { key: 'c', label: '배송 추적 페이지' }], explanation: '고객이 키워드를 검색하면 상단에 광고 상품이 노출돼요!' },
    ],
    rewards: { basePoints: 20, perfectBonus: 10, badge: 'ad_first_stage', badgeLabel: '광고 입문자' },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Stage 2: 첫 광고 만들어보기
  // ═══════════════════════════════════════
  {
    id: 'stage-2',
    stageNumber: 2,
    title: '첫 광고 만들어보기',
    subtitle: '실제 광고 세팅 과정을 체험해요',
    emoji: '🚀',
    themeColor: '#8B5CF6',
    bgGradient: 'from-purple-500 to-purple-600',
    storyIntro: {
      title: '직접 광고를 만들어봐요',
      lines: [
        '광고의 기본 개념을 배웠으니, 이제 직접 만들어볼 차례!',
        '캠페인 생성 → 상품 선택 → 예산 설정, 3단계면 끝입니다.',
        '하나씩 따라하면 누구나 할 수 있어요.',
      ],
    },
    conceptCards: [
      {
        emoji: '📋',
        title: '광고 만들기 3단계',
        content: '쿠팡 광고는 3단계로 만들어요:\n\n1️⃣ 캠페인 만들기 (광고 묶음)\n2️⃣ 상품 선택하기\n3️⃣ 예산 & 입찰가 설정\n\n이 3가지만 하면 끝!',
      },
      {
        emoji: '🏷️',
        title: '광고 유형 2가지',
        content: '① AI스마트광고\n→ 쿠팡이 알아서 키워드를 잡아줘요\n→ 초보자에게 추천! 👍\n\n② 수동 키워드 광고\n→ 내가 직접 키워드를 정해요\n→ 경험이 쌓이면 도전!',
        bonusTip: { id: 'tip-2-1', text: '처음엔 AI스마트로 시작하고, 2주 뒤 데이터를 보고 수동으로 전환하세요!', points: 5 },
      },
      {
        emoji: '💵',
        title: '일예산이란?',
        content: '하루에 최대 얼마까지 쓸지 정하는 거예요.\n\n예) 일예산 1만원 설정\n→ 오늘 광고비가 1만원에 도달하면\n→ 자동으로 광고가 멈춤! ⏸️\n\n초보자는 일예산 1~3만원 추천!',
      },
      {
        emoji: '🎯',
        title: '입찰가란?',
        content: '클릭 1번에 최대 얼마까지 낼 수 있는지 정하는 거예요.\n\n입찰가 500원 설정\n→ 고객이 클릭하면 최대 500원 과금\n→ 실제로는 더 싸게 과금되기도 해요!\n\n경쟁이 심한 키워드 = 입찰가 높아야 노출',
        bonusTip: { id: 'tip-2-2', text: '입찰가를 너무 낮게 잡으면 노출이 안 될 수 있어요. 쿠팡 추천 입찰가를 참고하세요!', points: 5 },
      },
    ],
    miniGameType: 'ox',
    miniGameData: [
      { statement: 'AI스마트광고는 쿠팡이 자동으로 키워드를 정해준다', answer: true, explanation: 'AI가 상품에 맞는 키워드를 자동으로 배정해요!' },
      { statement: '일예산을 설정하면 그 금액을 초과해도 광고가 계속 된다', answer: false, explanation: '일예산에 도달하면 자동으로 광고가 중단돼요. 안심하세요!' },
      { statement: '초보 셀러는 일예산 1~3만원으로 시작하는 것이 좋다', answer: true, explanation: '적은 예산으로 시작해서 데이터를 모으는 게 좋아요!' },
      { statement: '입찰가가 높을수록 무조건 1등으로 노출된다', answer: false, explanation: '입찰가 외에 상품 품질, 리뷰, 전환율도 순위에 영향을 줘요.' },
    ] as OXItem[],
    checkpointQuiz: [
      { id: 'q2-1', type: 'multiple', question: '초보 셀러에게 추천하는 광고 유형은?', correctAnswer: 'a', options: [{ key: 'a', label: 'AI스마트광고' }, { key: 'b', label: '수동 키워드 광고' }, { key: 'c', label: 'TV 광고' }], explanation: 'AI스마트광고는 쿠팡이 키워드를 자동으로 잡아주니까 초보자에게 딱!' },
      { id: 'q2-2', type: 'multiple', question: '일예산 1만원을 설정했는데 광고비가 1만원에 도달하면?', correctAnswer: 'b', options: [{ key: 'a', label: '추가 요금이 발생한다' }, { key: 'b', label: '자동으로 광고가 중단된다' }, { key: 'c', label: '다음날 예산이 줄어든다' }], explanation: '일예산에 도달하면 자동 중단! 초과 과금 걱정 없어요.' },
      { id: 'q2-3', type: 'ox', question: '광고 만들기는 캠페인 생성 → 상품 선택 → 예산 설정 3단계이다', correctAnswer: 'O', explanation: '맞아요! 3단계만 따라하면 누구나 광고를 만들 수 있어요.' },
    ],
    rewards: { basePoints: 30, perfectBonus: 10, badge: 'ad_first_campaign', badgeLabel: '첫 광고' },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Stage 3: 키워드의 비밀
  // ═══════════════════════════════════════
  {
    id: 'stage-3',
    stageNumber: 3,
    title: '키워드의 비밀',
    subtitle: '좋은 키워드 vs 나쁜 키워드를 구별해요',
    emoji: '🔑',
    themeColor: '#F59E0B',
    bgGradient: 'from-amber-500 to-amber-600',
    storyIntro: {
      title: '키워드가 매출을 좌우한다',
      lines: [
        '같은 광고비를 써도 키워드에 따라 결과가 달라져요.',
        '구매 의도가 높은 키워드 vs 돈만 나가는 키워드를 구별해봐요!',
      ],
    },
    conceptCards: [
      {
        emoji: '🎯',
        title: '좋은 키워드란?',
        content: '좋은 키워드 = 구매 의도가 높은 키워드\n\n✅ "여름 원피스 추천" → 사려는 사람!\n✅ "무선 이어폰 가성비" → 비교 중!\n❌ "옷" → 너무 광범위!\n❌ "이어폰 원리" → 사려는 게 아님!',
      },
      {
        emoji: '📊',
        title: '키워드 데이터 읽기',
        content: '키워드마다 중요한 숫자가 있어요:\n\n• 검색량: 얼마나 많이 검색하나\n• 클릭률(CTR): 얼마나 클릭하나\n• 전환율(CVR): 얼마나 구매하나\n\n검색량 ↑ + 전환율 ↑ = 최고의 키워드! ⭐',
        bonusTip: { id: 'tip-3-1', text: '쿠팡 자동완성에 뜨는 키워드가 검색량 높은 인기 키워드예요!', points: 5 },
      },
      {
        emoji: '🏷️',
        title: '롱테일 키워드의 힘',
        content: '"이어폰" → 경쟁 치열, 비용 높음\n"블루투스 이어폰 운동용 방수" → 경쟁 낮음, 구매 의도 높음!\n\n이렇게 구체적인 키워드를 "롱테일 키워드"라고 해요.\n초보자에게 강력 추천! 💪',
      },
      {
        emoji: '🚫',
        title: '제외 키워드 활용',
        content: '쓸모없는 클릭에 돈을 낭비하지 마세요!\n\n예) "무선 이어폰" 판매 중인데\n"유선 이어폰"으로 검색한 사람이 클릭하면?\n→ 돈만 나가고 구매 안 함!\n\n"유선"을 제외 키워드로 등록! ✂️',
        bonusTip: { id: 'tip-3-2', text: '매주 광고 리포트에서 전환 없는 키워드를 제외 키워드로 등록하세요!', points: 5 },
      },
    ],
    miniGameType: 'keyword',
    miniGameData: [
      { word: '여름 원피스 추천', isGood: true, reason: '구매 의도가 높은 키워드!' },
      { word: '원피스', isGood: false, reason: '너무 광범위해서 경쟁이 치열하고 전환율이 낮아요.' },
      { word: '무선 이어폰 가성비 추천', isGood: true, reason: '구체적이고 구매 의도가 높아요!' },
      { word: '이어폰 원리', isGood: false, reason: '정보를 찾는 사람이지, 구매할 사람이 아니에요.' },
      { word: '캠핑 의자 접이식 경량', isGood: true, reason: '구체적인 롱테일 키워드! 구매 의도 높음.' },
      { word: '의자', isGood: false, reason: '사무용? 캠핑용? 너무 광범위해요.' },
      { word: '아이폰15 케이스 투명', isGood: true, reason: '정확한 상품을 찾는 구매 의도 높은 키워드!' },
      { word: '핸드폰 액세서리', isGood: false, reason: '범위가 넓어서 내 상품과 안 맞는 클릭이 많아요.' },
    ] as KeywordItem[],
    checkpointQuiz: [
      { id: 'q3-1', type: 'multiple', question: '다음 중 구매 의도가 가장 높은 키워드는?', correctAnswer: 'c', options: [{ key: 'a', label: '운동화' }, { key: 'b', label: '운동화 브랜드 종류' }, { key: 'c', label: '나이키 운동화 270 블랙' }], explanation: '구체적일수록 구매 의도가 높아요! 사이즈와 색상까지 정한 사람은 살 준비가 된 거예요.' },
      { id: 'q3-2', type: 'ox', question: '롱테일 키워드는 경쟁이 낮고 전환율이 높다', correctAnswer: 'O', explanation: '구체적인 롱테일 키워드는 경쟁자가 적고, 검색하는 사람의 구매 의도도 높아요!' },
      { id: 'q3-3', type: 'multiple', question: '제외 키워드의 역할은?', correctAnswer: 'b', options: [{ key: 'a', label: '더 많은 사람에게 광고를 보여주기' }, { key: 'b', label: '불필요한 클릭을 줄여 광고비 절감' }, { key: 'c', label: '광고 예산을 늘리기' }], explanation: '관련 없는 검색어에서 내 광고가 안 나오게 해서 광고비 낭비를 막아요!' },
    ],
    rewards: { basePoints: 30, perfectBonus: 10 },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Stage 4: 입찰가 시뮬레이터
  // ═══════════════════════════════════════
  {
    id: 'stage-4',
    stageNumber: 4,
    title: '입찰가 시뮬레이터',
    subtitle: '최적의 입찰가를 찾아보세요',
    emoji: '🎰',
    themeColor: '#10B981',
    bgGradient: 'from-emerald-500 to-emerald-600',
    storyIntro: {
      title: '입찰가, 얼마가 적당할까?',
      lines: [
        '너무 높으면 마진이 깎이고, 너무 낮으면 노출이 안 돼요.',
        '딱 좋은 "스위트 스팟"을 찾는 방법을 배워봐요!',
      ],
    },
    conceptCards: [
      {
        emoji: '⚖️',
        title: '입찰가의 원리',
        content: '입찰가 = 내가 클릭 1번에 낼 수 있는 최대 금액\n\n다른 셀러보다 입찰가가 높으면\n→ 더 좋은 위치에 노출!\n\n하지만 너무 높으면?\n→ 마진이 깎여요! 💸',
      },
      {
        emoji: '🧮',
        title: '적정 입찰가 공식',
        content: '최대 입찰가 = 상품 마진 × 전환율\n\n예시:\n• 상품 마진: 5,000원\n• 전환율: 10% (10명 중 1명 구매)\n• 최대 CPC = 5,000 × 0.1 = 500원\n\n500원 이하로 입찰하면 수익 확보!',
        bonusTip: { id: 'tip-4-1', text: '처음에는 추천 입찰가의 70~80%로 시작해서 점진적으로 조정하세요!', points: 5 },
      },
      {
        emoji: '📈',
        title: '입찰가와 노출의 관계',
        content: '입찰가 낮음 → 노출 적음 → 데이터 부족\n입찰가 적정 → 적절한 노출 → 데이터 축적 가능\n입찰가 높음 → 노출 많음 → 비용 과다\n\n핵심: 데이터를 모을 수 있는 최소한의 입찰가로 시작!',
      },
      {
        emoji: '🔄',
        title: '입찰가 조정 전략',
        content: '1주일 데이터를 모은 후 조정해요:\n\n• 클릭 많은데 구매 없음 → 입찰가 낮추기\n• 노출이 너무 적음 → 입찰가 올리기\n• ROAS 좋음 → 예산 늘리기\n\n한 번에 10~20%씩 점진적으로! 📊',
        bonusTip: { id: 'tip-4-2', text: '입찰가 조정은 월/금 오전에 하는 것이 좋아요. 주말 데이터를 반영할 수 있거든요!', points: 5 },
      },
    ],
    miniGameType: 'bid-slider',
    miniGameData: {
      productName: '블루투스 무선 이어폰',
      price: 29900,
      marginRate: 0.3,
      optimalBidRange: [300, 600],
      dailyBudget: 30000,
    } as BidScenario,
    checkpointQuiz: [
      { id: 'q4-1', type: 'multiple', question: '상품 마진이 5,000원이고 전환율이 10%일 때 적정 최대 입찰가는?', correctAnswer: 'b', options: [{ key: 'a', label: '5,000원' }, { key: 'b', label: '500원' }, { key: 'c', label: '50원' }], explanation: '최대 CPC = 마진(5,000) × 전환율(0.1) = 500원!' },
      { id: 'q4-2', type: 'ox', question: '입찰가는 한 번에 크게 바꾸는 것보다 10~20%씩 점진적으로 조정하는 것이 좋다', correctAnswer: 'O', explanation: '급격한 변경은 데이터를 왜곡해요. 천천히 조정하면서 최적점을 찾으세요!' },
      { id: 'q4-3', type: 'multiple', question: '클릭은 많은데 구매가 없다면 어떻게 해야 하나요?', correctAnswer: 'a', options: [{ key: 'a', label: '입찰가를 낮추거나 키워드를 바꾼다' }, { key: 'b', label: '입찰가를 더 올린다' }, { key: 'c', label: '광고를 끈다' }], explanation: '클릭만 있고 구매가 없으면 키워드가 맞지 않거나 상세페이지 개선이 필요해요.' },
    ],
    rewards: { basePoints: 40, perfectBonus: 10, badge: 'ad_bid_master', badgeLabel: '입찰 마스터' },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Stage 5: ROAS 계산기
  // ═══════════════════════════════════════
  {
    id: 'stage-5',
    stageNumber: 5,
    title: 'ROAS 계산기',
    subtitle: '광고 수익률을 계산하고 판단해요',
    emoji: '📊',
    themeColor: '#EF4444',
    bgGradient: 'from-red-500 to-red-600',
    storyIntro: {
      title: '내 광고, 잘 되고 있을까?',
      lines: [
        '광고를 돌리고 있는데 이게 이익인지 손해인지 모르겠다면?',
        'ROAS(광고비 대비 매출)를 계산해서 판단하는 법을 배워봐요!',
      ],
    },
    conceptCards: [
      {
        emoji: '📐',
        title: 'ROAS란?',
        content: 'ROAS = Return On Ad Spend\n광고비 대비 매출 비율이에요.\n\nROAS = (매출 ÷ 광고비) × 100%\n\n예) 광고비 1만원, 매출 3만원\n→ ROAS = 300% ✅ 좋아요!',
      },
      {
        emoji: '🚦',
        title: 'ROAS 등급표',
        content: '🔴 100% 미만 → 적자! 즉시 개선 필요\n🟡 100~200% → 보통, 개선 필요\n🟢 200~300% → 좋아요!\n⭐ 300% 이상 → 훌륭해요!\n💎 500% 이상 → 최고! 예산 늘려도 OK',
        bonusTip: { id: 'tip-5-1', text: '마진율 30% 상품은 최소 ROAS 300% 이상이어야 실제 이익이 나요!', points: 5 },
      },
      {
        emoji: '🧮',
        title: '손익분기 ROAS 계산',
        content: '손익분기 ROAS = 1 ÷ 마진율 × 100%\n\n마진율 30% → 손익분기 ROAS = 333%\n마진율 20% → 손익분기 ROAS = 500%\n마진율 40% → 손익분기 ROAS = 250%\n\n이 이상이면 이익, 이하면 적자!',
      },
      {
        emoji: '🔧',
        title: 'ROAS 높이는 3가지 방법',
        content: '1️⃣ 전환율 올리기\n→ 상세페이지 개선, 리뷰 확보\n\n2️⃣ 비효율 키워드 제거\n→ 클릭만 많고 구매 없는 키워드 삭제\n\n3️⃣ 입찰가 최적화\n→ 고전환 키워드에 집중 투자',
        bonusTip: { id: 'tip-5-2', text: 'ROAS가 낮다면 광고 문제가 아니라 상세페이지 문제일 수도 있어요!', points: 5 },
      },
    ],
    miniGameType: 'roas-calc',
    miniGameData: [
      { adSpend: 10000, revenue: 30000, targetROAS: 300 },
      { adSpend: 50000, revenue: 100000, targetROAS: 300 },
      { adSpend: 20000, revenue: 15000, targetROAS: 300 },
      { adSpend: 30000, revenue: 150000, targetROAS: 300 },
    ] as ROASScenario[],
    checkpointQuiz: [
      { id: 'q5-1', type: 'multiple', question: '광고비 5만원, 매출 15만원일 때 ROAS는?', correctAnswer: 'b', options: [{ key: 'a', label: '200%' }, { key: 'b', label: '300%' }, { key: 'c', label: '150%' }], explanation: 'ROAS = (15만 ÷ 5만) × 100% = 300%!' },
      { id: 'q5-2', type: 'multiple', question: '마진율 30% 상품의 손익분기 ROAS는?', correctAnswer: 'c', options: [{ key: 'a', label: '100%' }, { key: 'b', label: '200%' }, { key: 'c', label: '약 333%' }], explanation: '손익분기 ROAS = 1 ÷ 0.3 × 100% ≈ 333%' },
      { id: 'q5-3', type: 'ox', question: 'ROAS가 낮을 때 무조건 광고를 끄는 것이 최선이다', correctAnswer: 'X', explanation: '상세페이지 개선, 키워드 최적화 등으로 ROAS를 올릴 수 있어요! 바로 끄면 기회를 놓칠 수 있어요.' },
    ],
    rewards: { basePoints: 40, perfectBonus: 10 },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Stage 6: 광고 최적화 전략
  // ═══════════════════════════════════════
  {
    id: 'stage-6',
    stageNumber: 6,
    title: '광고 최적화 전략',
    subtitle: '실전에서 바로 쓸 수 있는 전략을 배워요',
    emoji: '🛡️',
    themeColor: '#6366F1',
    bgGradient: 'from-indigo-500 to-indigo-600',
    storyIntro: {
      title: '실전 최적화 전략',
      lines: [
        '기초를 모두 배웠으니, 이제 실전 상황에 대응해봐요.',
        '시간대별 전략, 주간 루틴, AI+수동 병행까지!',
      ],
    },
    conceptCards: [
      {
        emoji: '⏰',
        title: '시간대별 전략',
        content: '모든 시간이 같지 않아요!\n\n🌅 오전 9~11시: 검색 활발 → 입찰가 올리기\n🌙 오후 8~10시: 골든타임! → 예산 집중\n🌃 새벽 1~6시: 검색 적음 → 입찰가 낮추기\n\n골든타임에 예산이 남아있어야 해요!',
        bonusTip: { id: 'tip-6-1', text: '일예산이 오전에 다 소진되면 골든타임에 노출 못 해요! 예산 분배에 주의하세요.', points: 5 },
      },
      {
        emoji: '🔄',
        title: '주간 점검 루틴',
        content: '매주 월요일, 이것만 체크하세요:\n\n1️⃣ 지난 주 ROAS 확인\n2️⃣ 전환 없는 키워드 제외 처리\n3️⃣ 고전환 키워드 입찰가 상향\n4️⃣ 예산 재분배\n\n이 루틴만 지켜도 ROAS가 올라가요!',
      },
      {
        emoji: '🎯',
        title: 'AI + 수동 병행 전략',
        content: '가장 효과적인 방법:\n\nAI스마트 (40%) → 새 키워드 발굴용\n수동 광고 (60%) → 검증된 키워드 집중\n\n1단계: AI로 2주 운영\n2단계: 고전환 키워드 발굴\n3단계: 수동 광고로 이관\n4단계: AI는 발굴용으로 유지',
      },
      {
        emoji: '🚨',
        title: '이럴 때 광고를 멈추세요!',
        content: '❌ 재고가 떨어졌을 때 → 품절 시 순위 급락\n❌ ROAS가 2주 이상 100% 미만일 때\n❌ 상세페이지를 크게 수정 중일 때\n❌ 시즌 종료 상품일 때\n\n광고를 멈추는 것도 전략이에요! 🧠',
        bonusTip: { id: 'tip-6-2', text: '광고를 완전히 끄지 말고 일예산을 최소(1,000원)로 낮추면 순위 하락을 방지할 수 있어요!', points: 5 },
      },
    ],
    miniGameType: 'strategy',
    miniGameData: [
      {
        situation: '광고를 2주째 운영 중인데, 클릭은 많지만 구매가 거의 없어요. 어떻게 해야 할까요?',
        options: [
          { key: 'a', label: '입찰가를 2배로 올린다', isCorrect: false, explanation: '클릭이 이미 많으므로 입찰가를 올려도 효과 없어요.' },
          { key: 'b', label: '상세페이지를 개선하고, 비효율 키워드를 제외한다', isCorrect: true, explanation: '클릭은 많지만 구매가 없으면 상세페이지나 키워드에 문제가 있어요!' },
          { key: 'c', label: '광고를 바로 끈다', isCorrect: false, explanation: '데이터를 분석하고 개선할 기회를 놓치게 돼요.' },
        ],
      },
      {
        situation: '오전 10시에 이미 일예산의 80%를 소진했어요. 어떻게 해야 할까요?',
        options: [
          { key: 'a', label: '그대로 둔다', isCorrect: false, explanation: '오후 골든타임(8~10시)에 예산이 없으면 매출 기회를 놓쳐요!' },
          { key: 'b', label: '일예산을 늘린다', isCorrect: false, explanation: '예산을 늘리기보다 시간대별 입찰가 조정이 먼저예요.' },
          { key: 'c', label: '새벽~오전 입찰가를 낮추고 저녁에 입찰가를 높인다', isCorrect: true, explanation: '시간대별 입찰가 조정으로 골든타임에 예산을 집중하세요!' },
        ],
      },
      {
        situation: 'ROAS가 500%인 키워드를 발견했어요! 다음 행동은?',
        options: [
          { key: 'a', label: '해당 키워드의 입찰가와 예산을 확대한다', isCorrect: true, explanation: '고효율 키워드는 과감하게 투자를 늘려서 매출을 극대화하세요!' },
          { key: 'b', label: '혹시 모르니 그대로 둔다', isCorrect: false, explanation: '기회를 놓치게 돼요! 잘 되는 곳에 더 투자하는 게 맞아요.' },
          { key: 'c', label: '다른 키워드에 집중한다', isCorrect: false, explanation: 'ROAS 500%짜리를 두고 다른 곳에 갈 이유가 없어요!' },
        ],
      },
    ] as StrategyScenario[],
    checkpointQuiz: [
      { id: 'q6-1', type: 'multiple', question: '쿠팡 광고의 골든타임(구매가 가장 많은 시간)은?', correctAnswer: 'c', options: [{ key: 'a', label: '새벽 2~4시' }, { key: 'b', label: '오전 6~8시' }, { key: 'c', label: '오후 8~10시' }], explanation: '대부분의 고객이 퇴근 후 저녁에 쇼핑해요!' },
      { id: 'q6-2', type: 'multiple', question: 'AI스마트와 수동 광고의 최적 비율은?', correctAnswer: 'b', options: [{ key: 'a', label: 'AI 100%' }, { key: 'b', label: 'AI 40% + 수동 60%' }, { key: 'c', label: '수동 100%' }], explanation: 'AI로 새 키워드를 발굴하고, 검증된 키워드는 수동으로 집중 관리!' },
      { id: 'q6-3', type: 'ox', question: '재고가 떨어지기 직전에도 광고는 계속하는 것이 좋다', correctAnswer: 'X', explanation: '품절 시 검색 순위가 급락하므로, 재고가 부족하면 광고를 줄이거나 멈춰야 해요!' },
    ],
    rewards: { basePoints: 50, perfectBonus: 10, badge: 'ad_strategist', badgeLabel: '광고 전략가' },
    starThresholds: { one: 34, two: 67, three: 100 },
  },

  // ═══════════════════════════════════════
  // Boss Stage: 종합 실전 테스트
  // ═══════════════════════════════════════
  {
    id: 'boss',
    stageNumber: 7,
    title: '종합 실전 테스트',
    subtitle: '지금까지 배운 모든 내용을 종합 테스트!',
    emoji: '👑',
    themeColor: '#DC2626',
    bgGradient: 'from-red-600 to-red-700',
    storyIntro: {
      title: '최종 테스트',
      lines: [
        '마지막 관문이에요!',
        '지금까지 배운 모든 내용을 10문제로 테스트합니다.',
        '통과하면 광고 마스터 뱃지 획득!',
      ],
    },
    conceptCards: [
      {
        emoji: '📝',
        title: '최종 점검 체크리스트',
        content: '지금까지 배운 핵심을 정리해요:\n\n✅ CPC = 클릭당 과금\n✅ AI스마트 → 초보에게 추천\n✅ 롱테일 키워드 → 높은 전환율\n✅ 입찰가 = 마진 × 전환율\n✅ ROAS = (매출 ÷ 광고비) × 100%\n✅ 골든타임 = 오후 8~10시',
      },
    ],
    miniGameType: 'comprehensive',
    miniGameData: [] as QuizQuestion[],
    checkpointQuiz: [
      { id: 'qb-1', type: 'multiple', question: 'CPC 광고에서 비용이 발생하는 시점은?', correctAnswer: 'b', options: [{ key: 'a', label: '광고가 노출될 때' }, { key: 'b', label: '고객이 클릭할 때' }, { key: 'c', label: '고객이 결제할 때' }], explanation: 'CPC = Cost Per Click. 클릭해야 비용 발생!' },
      { id: 'qb-2', type: 'multiple', question: '초보 셀러의 광고 시작 추천 방법은?', correctAnswer: 'a', options: [{ key: 'a', label: 'AI스마트광고 + 일예산 1~3만원' }, { key: 'b', label: '수동 광고 + 일예산 100만원' }, { key: 'c', label: '광고 안 하기' }], explanation: '적은 예산의 AI스마트로 시작해서 데이터를 모으세요!' },
      { id: 'qb-3', type: 'multiple', question: '"블루투스 이어폰 운동용 방수"는 어떤 유형의 키워드?', correctAnswer: 'c', options: [{ key: 'a', label: '빅 키워드' }, { key: 'b', label: '제외 키워드' }, { key: 'c', label: '롱테일 키워드' }], explanation: '구체적이고 상세한 키워드 = 롱테일 키워드!' },
      { id: 'qb-4', type: 'multiple', question: '마진 5,000원, 전환율 10%일 때 최대 입찰가는?', correctAnswer: 'b', options: [{ key: 'a', label: '5,000원' }, { key: 'b', label: '500원' }, { key: 'c', label: '50원' }], explanation: '최대 CPC = 5,000 × 0.1 = 500원' },
      { id: 'qb-5', type: 'multiple', question: '광고비 2만원, 매출 8만원일 때 ROAS는?', correctAnswer: 'c', options: [{ key: 'a', label: '200%' }, { key: 'b', label: '250%' }, { key: 'c', label: '400%' }], explanation: 'ROAS = (8만 ÷ 2만) × 100% = 400%' },
      { id: 'qb-6', type: 'ox', question: '골든타임(오후 8~10시)에 예산이 남아있어야 한다', correctAnswer: 'O', explanation: '가장 많은 고객이 쇼핑하는 시간에 광고가 나가야 해요!' },
      { id: 'qb-7', type: 'multiple', question: 'ROAS를 높이는 방법이 아닌 것은?', correctAnswer: 'c', options: [{ key: 'a', label: '비효율 키워드 제거' }, { key: 'b', label: '상세페이지 개선' }, { key: 'c', label: '입찰가를 무한정 올리기' }], explanation: '입찰가를 무한정 올리면 비용만 늘어나고 ROAS는 오히려 떨어져요!' },
      { id: 'qb-8', type: 'ox', question: '재고가 부족할 때는 광고를 줄이거나 멈추는 것이 좋다', correctAnswer: 'O', explanation: '품절 시 순위가 급락하므로 재고 관리와 광고를 연동해야 해요!' },
      { id: 'qb-9', type: 'multiple', question: 'AI스마트와 수동 광고의 추천 예산 비율은?', correctAnswer: 'b', options: [{ key: 'a', label: 'AI 80% : 수동 20%' }, { key: 'b', label: 'AI 40% : 수동 60%' }, { key: 'c', label: 'AI 10% : 수동 90%' }], explanation: 'AI로 새 키워드 발굴(40%), 검증된 키워드는 수동으로 집중(60%)!' },
      { id: 'qb-10', type: 'multiple', question: '마진율 30% 상품의 손익분기 ROAS는 약 얼마?', correctAnswer: 'c', options: [{ key: 'a', label: '100%' }, { key: 'b', label: '200%' }, { key: 'c', label: '333%' }], explanation: '손익분기 ROAS = 1 ÷ 0.3 × 100% ≈ 333%' },
    ],
    rewards: { basePoints: 100, perfectBonus: 30, badge: 'ad_master', badgeLabel: '광고 마스터' },
    starThresholds: { one: 40, two: 70, three: 90 },
  },
];

export const STAGE_IDS = AD_ACADEMY_STAGES.map(s => s.id);
