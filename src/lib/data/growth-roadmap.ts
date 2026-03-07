export interface GrowthAction {
  id: string;
  label: string;
  description: string;
}

export type BenefitCategory = 'coaching' | 'tools' | 'content' | 'commission' | 'business' | 'community';

export interface TierBenefit {
  category: BenefitCategory;
  label: string;
  description: string;
  isNew?: boolean; // 이전 단계 대비 신규 혜택
}

export const BENEFIT_CATEGORY_META: Record<BenefitCategory, { label: string; icon: string; color: string }> = {
  coaching:    { label: '코칭',     icon: 'GraduationCap', color: 'text-blue-600' },
  tools:       { label: '도구',     icon: 'Wrench',        color: 'text-purple-600' },
  content:     { label: '콘텐츠',   icon: 'BookOpen',      color: 'text-amber-600' },
  commission:  { label: '수수료',   icon: 'Percent',       color: 'text-green-600' },
  business:    { label: '비즈니스', icon: 'Briefcase',     color: 'text-indigo-600' },
  community:   { label: '커뮤니티', icon: 'Users',         color: 'text-pink-600' },
};

export interface GrowthTier {
  tier: number;
  revenueMin: number;
  revenueMax: number | null;
  label: string;
  badgeEmoji: string;
  badgeColor: string;
  actions: GrowthAction[];
  tips: string[];
  benefits: TierBenefit[];
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
    benefits: [
      { category: 'coaching',   label: '온보딩 가이드', description: '셀러 시작을 위한 단계별 온보딩 가이드 제공' },
      { category: 'coaching',   label: '그룹 Q&A 참여', description: '주간 그룹 Q&A 세션 참여 가능' },
      { category: 'tools',      label: '키워드 분석 일 3회', description: '네이버 키워드 트렌드 분석 하루 3회 이용' },
      { category: 'tools',      label: 'CS 템플릿 기본 팩', description: '고객 응대용 기본 CS 템플릿 제공' },
      { category: 'content',    label: '기초 교육 커리큘럼', description: '쿠팡 셀러 기초 교육 영상 및 자료 접근' },
      { category: 'commission', label: '기본 정산 수수료율', description: '표준 정산 수수료율 적용' },
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
    benefits: [
      { category: 'coaching',   label: '월 1회 그룹 코칭', description: '전문 코치의 월 1회 그룹 코칭 세션 참여', isNew: true },
      { category: 'tools',      label: '키워드 분석 일 10회', description: '키워드 분석 하루 10회로 확대', isNew: true },
      { category: 'tools',      label: '트렌드 알림 주 1회', description: '카테고리별 트렌드 키워드 주간 알림 수신', isNew: true },
      { category: 'content',    label: '중급 교육 콘텐츠', description: '키워드 최적화, 상세페이지 작성 등 중급 교육 해금', isNew: true },
      { category: 'community',  label: '셀러 아레나 참여', description: '셀러 아레나에서 다른 셀러와 성과 비교 가능', isNew: true },
      { category: 'community',  label: '성장 셀러 배지', description: '프로필에 성장 셀러 배지 표시' },
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
    benefits: [
      { category: 'coaching',   label: '월 1회 1:1 코칭', description: '전문 코치와 월 1회 1:1 맞춤 코칭 세션', isNew: true },
      { category: 'tools',      label: '키워드 분석 무제한', description: '키워드 트렌드 분석 횟수 제한 해제', isNew: true },
      { category: 'tools',      label: '경쟁사 모니터링 3개', description: '경쟁 키워드 3개 실시간 모니터링', isNew: true },
      { category: 'content',    label: '프리미엄 교육 콘텐츠', description: '광고 운영, 마진 분석 등 프리미엄 교육 해금', isNew: true },
      { category: 'content',    label: '성공 셀러 사례 분석', description: '월 매출 1천만 이상 달성 셀러들의 성공 사례 자료', isNew: true },
      { category: 'commission', label: '정산 수수료 0.5% 인하', description: '기본 대비 정산 수수료율 0.5%p 할인 적용', isNew: true },
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
    benefits: [
      { category: 'coaching',   label: '월 2회 1:1 코칭', description: '전문 코치와 월 2회 1:1 심화 코칭', isNew: true },
      { category: 'coaching',   label: '분기 1회 세무 상담', description: '제휴 세무사를 통한 분기별 세무 상담 무료 제공', isNew: true },
      { category: 'tools',      label: '경쟁사 모니터링 10개', description: '경쟁 키워드 10개로 모니터링 확대', isNew: true },
      { category: 'business',   label: '소싱처 추천 리스트', description: '검증된 도매처 및 제조사 추천 리스트 제공', isNew: true },
      { category: 'content',    label: '광고 최적화 가이드', description: 'CPA/CPC 광고 운영 고급 전략 가이드', isNew: true },
      { category: 'commission', label: '정산 수수료 1% 인하', description: '기본 대비 정산 수수료율 1%p 할인 적용', isNew: true },
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
    benefits: [
      { category: 'coaching',   label: '월 4회 1:1 코칭', description: '주 1회 전문 코치 1:1 밀착 코칭', isNew: true },
      { category: 'coaching',   label: 'PB 기획 컨설팅', description: '자체 브랜드 상품 기획부터 출시까지 전문 컨설팅', isNew: true },
      { category: 'business',   label: '물류 파트너 할인', description: '제휴 3PL 업체 이용 시 특별 할인 적용', isNew: true },
      { category: 'business',   label: '도매처 직접 연결', description: '검증된 제조사/도매처 1:1 직접 연결', isNew: true },
      { category: 'community',  label: '마스터 전용 세미나', description: '월 1회 마스터 등급 이상 전용 전략 세미나', isNew: true },
      { category: 'commission', label: '정산 수수료 2% 인하', description: '기본 대비 정산 수수료율 2%p 할인 적용', isNew: true },
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
    benefits: [
      { category: 'coaching',   label: '전담 컨설턴트 배정', description: '전담 성장 컨설턴트가 1:1로 전략 수립 및 실행 지원', isNew: true },
      { category: 'business',   label: '해외 소싱 지원', description: '알리바바/1688 해외 소싱 통역, 샘플 검수, 통관 지원', isNew: true },
      { category: 'business',   label: '브랜딩 컨설팅', description: '브랜드 네이밍, 패키지 디자인, 스토어 기획 전문 컨설팅', isNew: true },
      { category: 'community',  label: '프로 셀러 네트워크', description: '월 매출 5천만 이상 셀러들의 비공개 네트워크 초대', isNew: true },
      { category: 'commission', label: '정산 수수료 3% 인하', description: '기본 대비 정산 수수료율 3%p 할인 적용', isNew: true },
      { category: 'content',    label: '멀티채널 전략 가이드', description: '타 플랫폼 동시 운영을 위한 전략 및 운영 가이드', isNew: true },
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
    benefits: [
      { category: 'coaching',   label: 'VIP 전담 매니저', description: '전담 VIP 매니저가 경영 전반을 밀착 서포트', isNew: true },
      { category: 'coaching',   label: '법인화 지원', description: '법인 설립, 법무/세무 자문 원스톱 지원', isNew: true },
      { category: 'business',   label: '연간 성과 보너스', description: '연매출 목표 달성 시 성과 보너스 지급', isNew: true },
      { category: 'business',   label: '투자 연결', description: '사업 확장을 위한 투자자/VC 네트워크 연결', isNew: true },
      { category: 'community',  label: '레전드 네트워크', description: '월 매출 1억 이상 셀러들의 최상위 비공개 네트워크', isNew: true },
      { category: 'commission', label: '최저 수수료율 적용', description: '플랫폼 내 최저 정산 수수료율 적용', isNew: true },
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
