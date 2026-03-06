export interface GrowthAction {
  id: string;
  label: string;
  description: string;
}

export interface GrowthTier {
  tier: number;
  revenueMin: number;
  revenueMax: number | null;
  label: string;
  badgeEmoji: string;
  badgeColor: string;
  actions: GrowthAction[];
  tips: string[];
  estimatedTimeMonths: string;
}

export const GROWTH_TIERS: GrowthTier[] = [
  {
    tier: 0,
    revenueMin: 0,
    revenueMax: 1_000_000,
    label: '입문 셀러',
    badgeEmoji: '🌱',
    badgeColor: 'bg-green-100 text-green-700',
    actions: [
      { id: 'tier0-1', label: '쿠팡 Wing 기본 설정 완료', description: '셀러 프로필, 배송 설정, 반품 주소 등 기본 설정' },
      { id: 'tier0-2', label: '첫 상품 5개 등록', description: '도매매 등에서 소싱한 상품 5개 이상 등록' },
      { id: 'tier0-3', label: '상품 이미지 최적화 학습', description: '쿠팡 상품 이미지 가이드라인 숙지' },
      { id: 'tier0-4', label: '가격 경쟁력 분석', description: '경쟁 상품 대비 가격 포지셔닝 확인' },
    ],
    tips: [
      '처음에는 수량보다 품질에 집중하세요',
      '반품률이 낮은 카테고리부터 시작하세요',
      '매일 1개 이상 상품을 등록하는 습관을 들이세요',
    ],
    estimatedTimeMonths: '1~2개월',
  },
  {
    tier: 1,
    revenueMin: 1_000_000,
    revenueMax: 5_000_000,
    label: '성장 셀러',
    badgeEmoji: '🌿',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    actions: [
      { id: 'tier1-1', label: '상품 30개 이상 확보', description: '다양한 카테고리에서 소싱하여 상품 라인업 확장' },
      { id: 'tier1-2', label: '키워드 최적화 적용', description: '검색 상위 노출을 위한 상품명, 태그 키워드 최적화' },
      { id: 'tier1-3', label: '로켓배송 입점 검토', description: '로켓배송 자격 요건 확인 및 입점 신청 준비' },
      { id: 'tier1-4', label: 'CS 응대 체계 구축', description: '고객 문의 템플릿 작성 및 24시간 내 응대 체계 마련' },
    ],
    tips: [
      '잘 팔리는 상품 1~2개를 찾아 집중 육성하세요',
      '고객 리뷰 관리에 신경 쓰면 전환율이 크게 올라갑니다',
      '재고 관리를 위해 엑셀이나 간단한 툴을 활용하세요',
    ],
    estimatedTimeMonths: '2~4개월',
  },
  {
    tier: 2,
    revenueMin: 5_000_000,
    revenueMax: 10_000_000,
    label: '실력 셀러',
    badgeEmoji: '🌳',
    badgeColor: 'bg-teal-100 text-teal-700',
    actions: [
      { id: 'tier2-1', label: '쿠팡 광고(CPA) 시작', description: '쿠팡 애드 가입 후 주력 상품 광고 캠페인 운영' },
      { id: 'tier2-2', label: '마진율 분석 및 개선', description: '상품별 실질 마진율 계산 및 저마진 상품 정리' },
      { id: 'tier2-3', label: '도매처 다변화', description: '도매매 외 신규 도매처 2곳 이상 확보하여 소싱 안정화' },
      { id: 'tier2-4', label: '상세페이지 품질 개선', description: '전환율 높이기 위한 상세페이지 디자인 및 카피 개선' },
    ],
    tips: [
      '광고비는 매출의 5~10% 이내로 시작하세요',
      '마진이 15% 이상인 상품 위주로 포트폴리오를 구성하세요',
      '시즌 상품을 미리 준비하면 큰 매출을 올릴 수 있습니다',
    ],
    estimatedTimeMonths: '3~6개월',
  },
  {
    tier: 3,
    revenueMin: 10_000_000,
    revenueMax: 30_000_000,
    label: '프로 셀러',
    badgeEmoji: '⭐',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    actions: [
      { id: 'tier3-1', label: '사업자 전환 및 세금 관리', description: '간이과세에서 일반과세 전환, 세금계산서 발행 체계 구축' },
      { id: 'tier3-2', label: '로켓그로스 입점', description: '로켓그로스 자격 충족 및 입점으로 노출 극대화' },
      { id: 'tier3-3', label: '재고 자동화 시스템 도입', description: 'ERP 또는 재고관리 솔루션 도입으로 효율화' },
      { id: 'tier3-4', label: '경쟁사 모니터링 체계화', description: '주요 경쟁 셀러 가격/상품 변동 주간 모니터링' },
    ],
    tips: [
      '매출이 커지면 세무사를 통한 세금 관리가 필수입니다',
      '로켓그로스 입점 시 매출이 2~3배 상승하는 경우가 많습니다',
      '상위 20% 상품이 80% 매출을 만드는 법칙을 활용하세요',
    ],
    estimatedTimeMonths: '4~8개월',
  },
  {
    tier: 4,
    revenueMin: 30_000_000,
    revenueMax: 50_000_000,
    label: '마스터 셀러',
    badgeEmoji: '💎',
    badgeColor: 'bg-blue-100 text-blue-700',
    actions: [
      { id: 'tier4-1', label: 'PB(자체 브랜드) 상품 기획', description: 'OEM/ODM 제조사 컨택 및 자체 브랜드 상품 개발 착수' },
      { id: 'tier4-2', label: '직원 채용 또는 외주 체계화', description: 'CS, 상품 등록, 배송 등 업무별 인력 배치' },
      { id: 'tier4-3', label: '광고 ROI 최적화', description: '광고 캠페인별 ROAS 분석 및 비효율 광고 제거' },
      { id: 'tier4-4', label: '물류 효율화', description: '3PL 업체 활용 또는 쿠팡 풀필먼트 서비스 검토' },
    ],
    tips: [
      'PB 상품 하나가 도매 상품 수십 개의 마진을 대체할 수 있습니다',
      '혼자 모든 걸 하려 하지 말고 시스템화에 투자하세요',
      '광고는 데이터 기반으로 의사결정하세요',
    ],
    estimatedTimeMonths: '6~12개월',
  },
  {
    tier: 5,
    revenueMin: 50_000_000,
    revenueMax: 100_000_000,
    label: '엘리트 셀러',
    badgeEmoji: '👑',
    badgeColor: 'bg-purple-100 text-purple-700',
    actions: [
      { id: 'tier5-1', label: '멀티 채널 확장', description: '네이버 스마트스토어, 11번가 등 타 플랫폼 동시 운영' },
      { id: 'tier5-2', label: '브랜드 스토어 개설', description: '쿠팡 브랜드 스토어 개설로 브랜드 인지도 강화' },
      { id: 'tier5-3', label: '해외 소싱 루트 확보', description: '알리바바, 1688 등 해외 직소싱으로 원가 절감' },
      { id: 'tier5-4', label: '데이터 분석 고도화', description: '매출/트래픽/전환율 대시보드 구축 및 주간 리뷰 체계' },
    ],
    tips: [
      '하나의 플랫폼에 의존하지 말고 리스크를 분산하세요',
      '브랜드 가치를 높이면 가격 경쟁에서 벗어날 수 있습니다',
      '해외 소싱 시 통관, 인증 등 법적 요건을 반드시 확인하세요',
    ],
    estimatedTimeMonths: '8~18개월',
  },
  {
    tier: 6,
    revenueMin: 100_000_000,
    revenueMax: null,
    label: '레전드 셀러',
    badgeEmoji: '🏆',
    badgeColor: 'bg-red-100 text-red-700',
    actions: [
      { id: 'tier6-1', label: '법인 전환 및 조직 구축', description: '법인 설립, 팀 구성(MD, 마케팅, 물류, CS) 체계화' },
      { id: 'tier6-2', label: '자체 물류센터 운영 검토', description: '물류 비용 절감을 위한 자체 물류 시스템 구축' },
      { id: 'tier6-3', label: '브랜드 마케팅 투자', description: 'SNS, 인플루언서 마케팅 등 브랜드 인지도 확대 투자' },
      { id: 'tier6-4', label: '카테고리 1위 달성 전략', description: '주력 카테고리 내 점유율 1위 목표 전략 수립 및 실행' },
    ],
    tips: [
      '매출 규모가 커지면 현금 흐름 관리가 가장 중요합니다',
      '조직 문화와 시스템을 만들어 대표 없이도 돌아가는 구조를 만드세요',
      '장기적 브랜드 가치에 투자하면 안정적인 성장이 가능합니다',
    ],
    estimatedTimeMonths: '12개월 이상',
  },
];

export function getCurrentTier(monthlyRevenue: number): GrowthTier {
  for (let i = GROWTH_TIERS.length - 1; i >= 0; i--) {
    if (monthlyRevenue >= GROWTH_TIERS[i].revenueMin) {
      return GROWTH_TIERS[i];
    }
  }
  return GROWTH_TIERS[0];
}

export function getProgressToNextTier(monthlyRevenue: number): {
  current: GrowthTier;
  next: GrowthTier | null;
  progress: number;
} {
  const current = getCurrentTier(monthlyRevenue);
  const nextIndex = current.tier + 1;
  const next = nextIndex < GROWTH_TIERS.length ? GROWTH_TIERS[nextIndex] : null;

  if (!next) return { current, next: null, progress: 100 };

  const range = next.revenueMin - current.revenueMin;
  const progress = Math.min(
    100,
    Math.round(((monthlyRevenue - current.revenueMin) / range) * 100)
  );
  return { current, next, progress };
}

export function formatRevenue(amount: number): string {
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(0)}억`;
  if (amount >= 10_000) return `${(amount / 10_000).toFixed(0)}만`;
  return amount.toLocaleString();
}
