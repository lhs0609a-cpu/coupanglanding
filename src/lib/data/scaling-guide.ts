export interface StaffMember {
  role: string;
  count: string;
  cost: string;
  note?: string;
}

export interface FixedCostItem {
  category: string;
  amount: string;
  amountNum: number; // 비율 바 계산용
}

export interface ScalingStage {
  id: number;
  title: string;
  subtitle: string;
  revenueRange: string;
  emoji: string;
  staffing: StaffMember[];
  fixedCosts: FixedCostItem[];
  totalFixedCost: string;
  costRatio: string;
  checklist: string[];
  nextStageSignals: string[];
}

export const scalingStages: ScalingStage[] = [
  {
    id: 1,
    title: '1인 운영기',
    subtitle: '혼자 모든 것 처리',
    revenueRange: '~500만원',
    emoji: '🏠',
    staffing: [
      { role: '대표(본인)', count: '1명', cost: '-', note: '모든 업무 직접 수행' },
    ],
    fixedCosts: [
      { category: '인건비', amount: '0원', amountNum: 0 },
      { category: '물류(택배비)', amount: '10~20만원', amountNum: 15 },
      { category: '세무(신고대행)', amount: '5~10만원', amountNum: 7 },
      { category: '툴/서비스', amount: '3~5만원', amountNum: 4 },
    ],
    totalFixedCost: '18~35만원',
    costRatio: '매출의 4~7%',
    checklist: [
      '사업자등록 완료',
      '통신판매업 신고',
      '쿠팡 마켓플레이스 입점',
      '기장 세무사 계약 (종합소득세 대비)',
      '상품 소싱 루트 확보 (도매매, 위탁 등)',
      '기본 CS 응대 매뉴얼 작성',
    ],
    nextStageSignals: [
      '하루 주문 10건 이상 꾸준히 발생',
      '포장·발송에 하루 2시간 이상 소요',
      'CS 응대로 상품 리서치 시간 부족',
      '월매출 500만원 2개월 연속 달성',
    ],
  },
  {
    id: 2,
    title: '알바 투입기',
    subtitle: 'CS·포장 알바 1명',
    revenueRange: '500~1,500만원',
    emoji: '👥',
    staffing: [
      { role: '대표(본인)', count: '1명', cost: '-', note: '소싱·마케팅·전략 집중' },
      { role: 'CS/포장 알바', count: '1명', cost: '100~130만원', note: '시급 1만원 기준, 주 5일 4~5h' },
    ],
    fixedCosts: [
      { category: '인건비(알바)', amount: '100~130만원', amountNum: 115 },
      { category: '물류(택배비)', amount: '30~50만원', amountNum: 40 },
      { category: '세무(기장료)', amount: '10~15만원', amountNum: 12 },
      { category: '툴/서비스', amount: '5~10만원', amountNum: 7 },
    ],
    totalFixedCost: '145~205만원',
    costRatio: '매출의 10~15%',
    checklist: [
      '알바 채용 및 4대보험 처리',
      'CS 응대 매뉴얼 고도화',
      '포장·발송 프로세스 매뉴얼화',
      '발주 자동화 시스템 도입 검토',
      '재고 관리 스프레드시트 운영',
      '상품 카테고리 확장 (3~5개 카테고리)',
    ],
    nextStageSignals: [
      '하루 CS 20건 이상 처리하기 벅참',
      '포장·발송에 하루 4시간 이상 소요',
      '알바 1명으로 업무 커버 불가',
      '월매출 1,500만원 3개월 연속 달성',
    ],
  },
  {
    id: 3,
    title: '첫 직원 채용기',
    subtitle: '풀타임 직원 or 물류 외주',
    revenueRange: '1,500~3,000만원',
    emoji: '🏢',
    staffing: [
      { role: '대표(본인)', count: '1명', cost: '-', note: '전략·소싱·마케팅' },
      { role: 'CS/운영 직원', count: '1명', cost: '220~260만원', note: '풀타임, 4대보험 포함' },
      { role: '포장/물류 알바', count: '1명', cost: '100~130만원', note: '또는 3PL 물류 외주' },
    ],
    fixedCosts: [
      { category: '인건비', amount: '320~390만원', amountNum: 355 },
      { category: '사무실/작업공간', amount: '30~50만원', amountNum: 40 },
      { category: '물류(택배+포장재)', amount: '50~80만원', amountNum: 65 },
      { category: '세무(기장료)', amount: '15~20만원', amountNum: 17 },
      { category: '툴/서비스', amount: '10~20만원', amountNum: 15 },
    ],
    totalFixedCost: '425~560만원',
    costRatio: '매출의 15~20%',
    checklist: [
      '풀타임 직원 채용 (CS/운영 담당)',
      '근로계약서 작성 및 4대보험 가입',
      '업무 매뉴얼 체계화 (인수인계 가능한 수준)',
      '3PL 물류 외주 비교 견적 (쿠팡 로켓그로스 포함)',
      '소규모 사무실/작업공간 확보',
      '세무사 월 기장 계약 (부가세·원천세)',
      '상품 라인업 10개+ 카테고리 확장',
    ],
    nextStageSignals: [
      '직원 1명으로 CS+운영 처리 한계',
      '대표가 여전히 물류에 시간 투입',
      '신규 카테고리 진출 여력 부족',
      '월매출 3,000만원 3개월 연속 달성',
    ],
  },
  {
    id: 4,
    title: '팀 빌딩기',
    subtitle: '2~3명 팀, 사무실 운영',
    revenueRange: '3,000~5,000만원',
    emoji: '🏗️',
    staffing: [
      { role: '대표(본인)', count: '1명', cost: '-', note: '경영·전략·핵심 소싱' },
      { role: 'MD/상품 담당', count: '1명', cost: '250~300만원', note: '소싱·상품등록·가격관리' },
      { role: 'CS/운영 담당', count: '1명', cost: '220~260만원', note: 'CS·주문관리·리뷰관리' },
      { role: '물류 담당/외주', count: '1명', cost: '150~200만원', note: '3PL 또는 파트타임' },
    ],
    fixedCosts: [
      { category: '인건비', amount: '620~760만원', amountNum: 690 },
      { category: '사무실 임대', amount: '50~100만원', amountNum: 75 },
      { category: '물류(3PL+택배)', amount: '80~150만원', amountNum: 115 },
      { category: '세무(기장+급여)', amount: '25~35만원', amountNum: 30 },
      { category: '툴/서비스/광고', amount: '30~50만원', amountNum: 40 },
    ],
    totalFixedCost: '805~1,095만원',
    costRatio: '매출의 20~25%',
    checklist: [
      'MD(상품기획) 담당자 채용',
      '팀 업무 분장표 작성 (R&R 명확화)',
      '주간 미팅 체계 수립',
      '사무실 계약 (직원 3~4명 규모)',
      '3PL 물류 계약 체결',
      'ERP 또는 주문관리 시스템 도입',
      '쿠팡 광고(CPC) 체계적 운영 시작',
      '법인 전환 검토 시작',
    ],
    nextStageSignals: [
      '인건비 부담으로 수익률 하락 체감',
      '세금 부담 급증 (종합소득세 35%+ 구간)',
      '거래처에서 법인 거래 요구',
      '월매출 5,000만원 3개월 연속 달성',
    ],
  },
  {
    id: 5,
    title: '법인 전환기',
    subtitle: '법인 설립, 전문 인력 확보',
    revenueRange: '5,000만~1억',
    emoji: '🏛️',
    staffing: [
      { role: '대표이사', count: '1명', cost: '급여 설정', note: '경영 전반, 전략 의사결정' },
      { role: 'MD팀', count: '2명', cost: '500~600만원', note: '카테고리별 담당' },
      { role: 'CS/운영팀', count: '1~2명', cost: '220~520만원', note: 'CS·정산·주문관리' },
      { role: '물류 매니저', count: '1명', cost: '250~300만원', note: '3PL 관리, 재고 최적화' },
      { role: '마케팅/디자인', count: '1명', cost: '250~300만원', note: '상세페이지·광고 운영' },
    ],
    fixedCosts: [
      { category: '인건비', amount: '1,220~1,720만원', amountNum: 1470 },
      { category: '사무실 임대', amount: '100~200만원', amountNum: 150 },
      { category: '물류(3PL)', amount: '150~300만원', amountNum: 225 },
      { category: '세무/법무', amount: '50~80만원', amountNum: 65 },
      { category: '툴/서비스/광고', amount: '50~100만원', amountNum: 75 },
    ],
    totalFixedCost: '1,570~2,400만원',
    costRatio: '매출의 25~30%',
    checklist: [
      '법인 설립 (법무사 통해 등기)',
      '법인 사업자등록 및 통신판매업 재신고',
      '법인 통장·카드·공인인증 세팅',
      '대표이사 급여 설정 (4대보험)',
      '취업규칙·복무규정 작성',
      '전문 세무법인 계약 (법인세·부가세·원천세)',
      '마케팅/디자인 인력 채용',
      '쿠팡 로켓그로스·로켓배송 입점 검토',
    ],
    nextStageSignals: [
      '카테고리별 전담 MD 필요',
      '마케팅 채널 다각화 필요 (네이버·자사몰)',
      '물류 볼륨으로 3PL 단가 협상 가능',
      '월매출 1억 3개월 연속 달성',
    ],
  },
  {
    id: 6,
    title: '조직화 단계',
    subtitle: '부서별 운영, 시스템화',
    revenueRange: '1억 이상',
    emoji: '🚀',
    staffing: [
      { role: '대표이사', count: '1명', cost: '급여 설정', note: '경영·투자·신사업' },
      { role: 'MD팀', count: '3~5명', cost: '750~1,500만원', note: '카테고리별 팀 운영' },
      { role: 'CS/운영팀', count: '2~3명', cost: '440~780만원', note: '팀장 + 담당자' },
      { role: '물류팀', count: '1~2명', cost: '250~600만원', note: '물류센터 관리' },
      { role: '마케팅팀', count: '2~3명', cost: '500~900만원', note: '광고·콘텐츠·SNS' },
      { role: '경영지원', count: '1명', cost: '250~300만원', note: '인사·총무·재무 보조' },
    ],
    fixedCosts: [
      { category: '인건비', amount: '2,190~4,080만원', amountNum: 3135 },
      { category: '사무실 임대', amount: '200~400만원', amountNum: 300 },
      { category: '물류(3PL/자체)', amount: '300~600만원', amountNum: 450 },
      { category: '세무/법무/노무', amount: '80~150만원', amountNum: 115 },
      { category: '툴/서비스/광고', amount: '100~300만원', amountNum: 200 },
    ],
    totalFixedCost: '2,870~5,530만원',
    costRatio: '매출의 25~35%',
    checklist: [
      '부서별 팀장 선임 및 위임 체계 구축',
      '인사·평가 제도 수립',
      'KPI 기반 성과관리 시스템 도입',
      'ERP 시스템 고도화',
      '자체 물류센터 vs 대형 3PL 비교 검토',
      '멀티채널 판매 (네이버·11번가·자사몰)',
      'PB(자체브랜드) 상품 개발 검토',
      '노무사 자문 계약 (근로기준법 준수)',
    ],
    nextStageSignals: [
      '이 단계에서는 지속적인 시스템 고도화가 핵심',
      '자체 브랜드(PB) 런칭으로 마진율 개선',
      '해외 소싱·수출 등 신규 사업 확장',
      '투자 유치 또는 M&A 검토',
    ],
  },
];
