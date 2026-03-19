// 15개 카테고리 튜토리얼 데이터
export interface TutorialStep {
  emoji: string;
  title: string;
  description: string;
  proTip?: string;
  relatedLink?: { label: string; href: string };
}

export interface FeatureTutorialData {
  featureKey: string;
  name: string;
  icon: string;
  xp: number;
  steps: TutorialStep[];
}

export const FEATURE_TUTORIALS: FeatureTutorialData[] = [
  {
    featureKey: 'dashboard',
    name: '대시보드',
    icon: '📊',
    xp: 20,
    steps: [
      {
        emoji: '🏠',
        title: '대시보드에 오신 것을 환영합니다!',
        description: '대시보드는 쿠팡 셀러 활동의 핵심 허브입니다. 매출 현황, 교육 진행률, 긴급 알림 등 중요한 정보를 한눈에 확인하세요.',
      },
      {
        emoji: '📈',
        title: '매출 정산 현황',
        description: 'D-Day 카운트다운으로 정산 마감일을 놓치지 마세요. API를 연동하면 매출이 자동으로 검증됩니다.',
        proTip: 'API 연동 시 정산 처리가 최대 3일 빨라집니다!',
        relatedLink: { label: '매출 정산 바로가기', href: '/my/report' },
      },
      {
        emoji: '🎯',
        title: '위젯으로 빠른 확인',
        description: '긴급 대응, 셀러 아레나, 성장 로드맵, 트렌드 키워드 위젯으로 중요한 업데이트를 놓치지 마세요.',
      },
      {
        emoji: '🎓',
        title: '교육 진행률',
        description: '하단의 교육 진행률 위젯에서 현재 학습 상태를 확인하고, 다음 교육을 바로 시작할 수 있습니다.',
        relatedLink: { label: '교육 센터 바로가기', href: '/my/education' },
      },
    ],
  },
  {
    featureKey: 'report',
    name: '매출 정산',
    icon: '💰',
    xp: 30,
    steps: [
      {
        emoji: '📋',
        title: '매출 정산이란?',
        description: '매월 쿠팡에서 발생한 매출을 보고하고, 코칭 비용을 정산하는 페이지입니다. 매월 25일까지 제출해야 합니다.',
      },
      {
        emoji: '🔗',
        title: 'API 자동 검증',
        description: '쿠팡 API를 연동하면 매출 데이터가 자동으로 가져와지고, 수동 입력 없이 정확한 정산이 가능합니다.',
        proTip: '계정 설정에서 API 키를 등록하면 자동 검증이 활성화됩니다!',
        relatedLink: { label: 'API 설정하기', href: '/my/settings' },
      },
      {
        emoji: '📸',
        title: '스크린샷 첨부',
        description: 'API 미연동 시 쿠팡 메가로드 매출 스크린샷을 첨부하여 수동으로 보고할 수 있습니다. EXIF 정보로 위변조를 감지합니다.',
        proTip: '스크린샷은 해당 월의 정산 화면을 캡처하세요.',
      },
      {
        emoji: '💳',
        title: '비용 구조',
        description: '매출에서 상품원가, 수수료, 광고비, 반품비, 배송비, 세금을 차감한 순이익을 기반으로 정산됩니다.',
      },
      {
        emoji: '✅',
        title: '정산 프로세스',
        description: '보고 → 관리자 검토 → 입금 → 확인 순서로 진행됩니다. 각 단계별 상태를 실시간으로 확인하세요.',
      },
    ],
  },
  {
    featureKey: 'history',
    name: '보고 내역',
    icon: '📜',
    xp: 15,
    steps: [
      {
        emoji: '📊',
        title: '보고 내역 확인',
        description: '과거 매월 제출한 정산 보고서를 한눈에 확인할 수 있습니다. 매출 추이와 정산 상태를 모니터링하세요.',
      },
      {
        emoji: '🔍',
        title: '상세 보기',
        description: '각 월의 보고서를 클릭하면 매출, 비용 구조, 순이익, 정산 상태 등 상세 정보를 확인할 수 있습니다.',
        proTip: '매출 추이를 분석하여 성장 패턴을 파악하세요!',
      },
      {
        emoji: '📈',
        title: '상태별 관리',
        description: '대기중, 검토중, 입금완료, 확인완료 등 각 상태에 따라 필요한 조치를 안내받을 수 있습니다.',
      },
    ],
  },
  {
    featureKey: 'trends',
    name: '트렌드',
    icon: '🔥',
    xp: 25,
    steps: [
      {
        emoji: '📈',
        title: '트렌드 키워드란?',
        description: '쿠팡에서 인기 있는 검색 키워드와 상품 트렌드를 분석합니다. 시장 흐름을 파악하여 상품 전략을 세우세요.',
      },
      {
        emoji: '🏷️',
        title: '카테고리별 필터',
        description: '식품, 뷰티, 생활, 패션 등 카테고리별로 트렌드 키워드를 확인할 수 있습니다.',
        proTip: '자신의 판매 카테고리와 관련된 키워드를 우선 확인하세요!',
      },
      {
        emoji: '🔎',
        title: '키워드 분석',
        description: '개별 키워드를 클릭하면 검색량, 경쟁 강도, 시즌성, 추천 전략 등 상세 분석을 확인할 수 있습니다.',
      },
      {
        emoji: '💡',
        title: '활용 방법',
        description: '트렌드 키워드를 상품명, 검색 태그에 반영하여 노출을 높이세요. 시즌 키워드는 미리 준비하는 것이 중요합니다.',
      },
    ],
  },
  {
    featureKey: 'contract',
    name: '계약서',
    icon: '📝',
    xp: 20,
    steps: [
      {
        emoji: '📄',
        title: '전자 계약서',
        description: 'PT 코칭 계약서를 확인하고 전자 서명으로 계약을 체결할 수 있습니다. 총 16조의 계약 조항을 꼼꼼히 확인하세요.',
      },
      {
        emoji: '✍️',
        title: '서명 및 제출',
        description: '계약 내용을 확인한 후 전자 서명으로 간편하게 계약을 체결합니다. 사업자등록증도 함께 업로드해주세요.',
        proTip: '서명 전 계약 조건(수수료율, 계약 기간)을 꼭 확인하세요.',
      },
      {
        emoji: '📋',
        title: '계약 관리',
        description: '계약 상태(대기중/서명완료/해지)를 확인하고, 해지 신청도 이 페이지에서 할 수 있습니다.',
      },
    ],
  },
  {
    featureKey: 'emergency',
    name: '긴급 대응',
    icon: '🚨',
    xp: 25,
    steps: [
      {
        emoji: '⚠️',
        title: '긴급 대응 센터',
        description: '쿠팡에서 발생하는 긴급 상황(상품 삭제, 판매 중지, 계정 경고 등)에 빠르게 대응할 수 있는 가이드를 제공합니다.',
      },
      {
        emoji: '📋',
        title: '상황별 대응 매뉴얼',
        description: '각 긴급 상황에 대한 단계별 대응 방법과 필요한 서류, 연락처 등을 안내합니다.',
        proTip: '긴급 상황 발생 시 24시간 이내에 대응하는 것이 중요합니다!',
      },
      {
        emoji: '📞',
        title: '도움 요청',
        description: '자체적으로 해결이 어려운 경우, 관리자에게 즉시 도움을 요청할 수 있습니다.',
      },
      {
        emoji: '🛡️',
        title: '예방 가이드',
        description: '자주 발생하는 문제의 예방법을 미리 숙지하여 리스크를 최소화하세요.',
      },
    ],
  },
  {
    featureKey: 'violations',
    name: '계약위반',
    icon: '⚖️',
    xp: 20,
    steps: [
      {
        emoji: '📜',
        title: '계약위반 관리',
        description: '계약 위반 사항이 있을 경우 이 페이지에서 내역을 확인할 수 있습니다. 위반 유형, 일시, 상태 등을 추적합니다.',
      },
      {
        emoji: '🔍',
        title: '위반 유형 확인',
        description: '정산 지연, 허위 보고, 무단 해지 등 각 위반 유형별 세부 내용과 패널티를 확인할 수 있습니다.',
        proTip: '위반이 발생하면 빠른 시정이 패널티 감경에 도움됩니다.',
      },
      {
        emoji: '✅',
        title: '시정 조치',
        description: '위반 사항에 대한 시정 조치 방법을 안내받고, 이의 신청도 할 수 있습니다.',
      },
    ],
  },
  {
    featureKey: 'tax-invoices',
    name: '세금계산서',
    icon: '🧾',
    xp: 20,
    steps: [
      {
        emoji: '📄',
        title: '세금계산서 관리',
        description: '정산 완료된 건에 대해 세금계산서를 발행하고 관리합니다. 사업자 정보가 등록되어 있어야 합니다.',
        relatedLink: { label: '사업자 정보 등록', href: '/my/settings' },
      },
      {
        emoji: '🏢',
        title: '사업자 정보',
        description: '세금계산서 발행을 위해 사업자명, 사업자등록번호, 대표자명, 업종 등의 정보가 필요합니다.',
        proTip: '계정 설정에서 사업자 정보를 미리 등록해두세요!',
      },
      {
        emoji: '📊',
        title: '발행 내역',
        description: '발행된 세금계산서 목록을 확인하고, 각 건의 상태(대기/발행/완료)를 추적할 수 있습니다.',
      },
    ],
  },
  {
    featureKey: 'cs-templates',
    name: 'CS 템플릿',
    icon: '💬',
    xp: 25,
    steps: [
      {
        emoji: '📝',
        title: 'CS 템플릿이란?',
        description: '고객 문의에 빠르고 전문적으로 응답할 수 있는 사전 작성된 답변 템플릿입니다. 상황별 최적의 응답을 제공합니다.',
      },
      {
        emoji: '📂',
        title: '카테고리별 템플릿',
        description: '배송 문의, 반품/교환, 상품 문의, 불만 처리 등 상황별로 최적화된 템플릿을 제공합니다.',
        proTip: '자주 사용하는 템플릿은 복사하여 빠르게 활용하세요!',
      },
      {
        emoji: '✏️',
        title: '맞춤 수정',
        description: '기본 템플릿을 참고하여 자신만의 스타일로 수정할 수 있습니다. 고객명, 상품명 등을 변경하세요.',
      },
      {
        emoji: '⭐',
        title: '응답 품질 향상',
        description: '전문적인 CS 응답은 판매자 등급에 긍정적인 영향을 줍니다. 빠르고 정확한 응답을 지향하세요.',
      },
    ],
  },
  {
    featureKey: 'growth',
    name: '성장 로드맵',
    icon: '🗺️',
    xp: 25,
    steps: [
      {
        emoji: '📍',
        title: '성장 로드맵',
        description: '쿠팡 셀러로서의 성장 단계를 시각적으로 보여줍니다. 현재 위치와 다음 목표를 확인하세요.',
      },
      {
        emoji: '🏆',
        title: '레벨 시스템',
        description: '교육 완료, 매출 달성, 상품 등록 등 다양한 활동으로 레벨을 올릴 수 있습니다.',
        proTip: '혜택은 레벨이 올라갈수록 더 좋아집니다!',
      },
      {
        emoji: '🎁',
        title: '레벨별 혜택',
        description: '각 레벨에 따라 수수료 할인, 우선 지원, 특별 교육 등 다양한 혜택이 제공됩니다.',
      },
      {
        emoji: '📊',
        title: '성장 분석',
        description: '매출 추이, 상품 등록 현황, 고객 평점 등 핵심 성과 지표를 분석하여 개선점을 파악하세요.',
        relatedLink: { label: '매출 분석 보기', href: '/my/report' },
      },
    ],
  },
  {
    featureKey: 'penalty',
    name: '페널티 트래커',
    icon: '🛡️',
    xp: 25,
    steps: [
      {
        emoji: '📊',
        title: '페널티 트래커란?',
        description: '쿠팡 판매자 페널티를 실시간으로 추적하고 관리합니다. 페널티 점수, 유형, 조치 사항을 확인하세요.',
      },
      {
        emoji: '⚠️',
        title: '페널티 유형',
        description: '배송 지연, 품질 문제, 고객 불만 등 다양한 페널티 유형과 각각의 점수를 확인할 수 있습니다.',
        proTip: '페널티 점수가 높아지면 판매 제한이 될 수 있으니 주의하세요!',
      },
      {
        emoji: '📈',
        title: '추이 분석',
        description: '월별 페널티 추이를 그래프로 확인하여 개선 여부를 모니터링하세요.',
      },
      {
        emoji: '✅',
        title: '개선 가이드',
        description: '페널티를 줄이기 위한 구체적인 개선 방법과 모범 사례를 안내합니다.',
      },
    ],
  },
  {
    featureKey: 'arena',
    name: '상품등록 랭킹',
    icon: '🏆',
    xp: 25,
    steps: [
      {
        emoji: '🎮',
        title: '셀러 아레나',
        description: '상품 등록 수로 다른 셀러들과 경쟁하는 랭킹 시스템입니다. 순위를 올리고 보상을 받으세요!',
      },
      {
        emoji: '📊',
        title: '랭킹 시스템',
        description: '주간/월간 상품 등록 수 기준으로 순위가 매겨집니다. 상위 랭커에게는 특별 혜택이 제공됩니다.',
        proTip: '꾸준한 상품 등록이 랭킹 유지의 핵심입니다!',
      },
      {
        emoji: '🎁',
        title: '보상 시스템',
        description: '상위 랭킹 달성 시 수수료 할인, 노출 가산점 등 다양한 인센티브가 주어집니다.',
      },
      {
        emoji: '📈',
        title: '내 현황',
        description: '현재 등록 상품 수, 순위 변동, 목표 달성률 등 나의 아레나 현황을 확인하세요.',
      },
    ],
  },
  {
    featureKey: 'education',
    name: '교육',
    icon: '🎓',
    xp: 15,
    steps: [
      {
        emoji: '📚',
        title: '교육 센터',
        description: '쿠팡 셀러가 되기 위한 12단계 교육 과정입니다. 단계별로 학습하며 셀러 역량을 키워나가세요.',
      },
      {
        emoji: '🎯',
        title: '단계별 학습',
        description: '상품 등록, 재고 관리, CS 대응 등 필수 역량을 체계적으로 학습합니다. 이전 단계를 완료해야 다음 단계가 열립니다.',
        proTip: '하루 1개씩 교육을 완료하면 2주 안에 모든 과정을 마칠 수 있어요!',
      },
      {
        emoji: '🏅',
        title: '레벨과 보상',
        description: '교육 완료 수에 따라 레벨이 올라가고, 마스터 레벨 달성 시 특별 혜택이 주어집니다.',
      },
    ],
  },
  {
    featureKey: 'guides',
    name: '운영 가이드',
    icon: '📖',
    xp: 15,
    steps: [
      {
        emoji: '📘',
        title: '운영 가이드',
        description: '쿠팡 셀러 운영에 필요한 실전 가이드를 제공합니다. 자주 묻는 질문과 팁을 확인하세요.',
      },
      {
        emoji: '🔍',
        title: '주제별 가이드',
        description: '상품 등록, 재고 관리, 배송, CS, 광고 등 주제별로 정리된 실전 가이드를 활용하세요.',
        proTip: '문제가 생기면 먼저 가이드를 확인해보세요!',
      },
      {
        emoji: '💡',
        title: '실전 팁',
        description: '경험 많은 셀러들의 노하우와 실전 팁을 공유합니다. 매출 향상에 바로 적용할 수 있는 전략을 배우세요.',
      },
    ],
  },
  {
    featureKey: 'settings',
    name: '계정 설정',
    icon: '⚙️',
    xp: 30,
    steps: [
      {
        emoji: '👤',
        title: '계정 설정',
        description: '셀러 계정 정보, API 연동, 사업자 정보를 관리하는 페이지입니다.',
      },
      {
        emoji: '🔑',
        title: '쿠팡 셀러 계정',
        description: '쿠팡 메가로드 로그인 정보를 등록하면 관리자가 필요한 지원을 빠르게 제공할 수 있습니다.',
        proTip: '정보는 암호화되어 안전하게 저장됩니다.',
      },
      {
        emoji: '🔗',
        title: 'Open API 연동',
        description: '쿠팡 Open API 키를 등록하면 매출 데이터가 자동으로 검증되어 정산이 빨라집니다. 5단계 가이드를 따라 쉽게 설정하세요.',
        proTip: 'API 키는 180일마다 갱신이 필요합니다.',
      },
      {
        emoji: '🏢',
        title: '사업자 정보',
        description: '세금계산서 발행을 위한 사업자 정보를 등록합니다. 사업자등록번호, 대표자명, 업종 등을 입력하세요.',
        relatedLink: { label: '세금계산서 관리', href: '/my/tax-invoices' },
      },
    ],
  },
];

export function getTutorialByKey(featureKey: string): FeatureTutorialData | undefined {
  return FEATURE_TUTORIALS.find((t) => t.featureKey === featureKey);
}

export const TOTAL_TUTORIAL_XP = FEATURE_TUTORIALS.reduce((sum, t) => sum + t.xp, 0);
