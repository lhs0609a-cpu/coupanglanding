// 파트너 스크리닝 질문 & 채점 설정

// ─── 타입 정의 ───

export type ScreeningCategoryId =
  | 'trust'
  | 'compliance'
  | 'community'
  | 'desperation'
  | 'readiness'
  | 'coachability'
  | 'vision';

export type FlagType = 'red' | 'yellow' | 'green';
export type FlagSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ScreeningFlag {
  type: FlagType;
  severity: FlagSeverity;
  label: string;
  description: string;
}

export interface ScreeningOption {
  id: string;
  text: string;
  score: number; // 1~5
  flags?: ScreeningFlag[];
}

export interface ScreeningQuestion {
  id: string; // e.g. 'trust_1'
  category: ScreeningCategoryId;
  title: string;
  scenario: string;
  options: ScreeningOption[];
}

export interface ScreeningCategory {
  id: ScreeningCategoryId;
  label: string;
  weight: number;
  description: string;
}

export interface ScoringConfig {
  categories: ScreeningCategory[];
  maxRawScore: number; // 285
  gradeThresholds: { grade: string; min: number }[];
  knockoutRules: {
    criticalFlagLimit: number;
    redFlagLimit: number;
    trustMinScore: number;
  };
  minTimeSeconds: number;
}

// ─── 카테고리 정의 ───

export const SCREENING_CATEGORIES: ScreeningCategory[] = [
  { id: 'trust', label: '신뢰도', weight: 2.0, description: '약속 이행, 투명성, 정직함' },
  { id: 'compliance', label: '지재권/컴플라이언스', weight: 1.5, description: '지식재산권 존중, 규정 준수 의지' },
  { id: 'community', label: '커뮤니티 적합성', weight: 1.5, description: '협업 태도, 타인 존중, 분쟁 해결 능력' },
  { id: 'desperation', label: '절실함', weight: 1.2, description: '성공에 대한 간절함, 투자 의지' },
  { id: 'readiness', label: '준비도', weight: 1.0, description: '사전 조사, 실행 계획, 현실 인식' },
  { id: 'coachability', label: '학습 태도', weight: 1.0, description: '피드백 수용, 교육 참여 의지' },
  { id: 'vision', label: '비전', weight: 1.3, description: '장기적 사업 관점, 성장 지향' },
];

// ─── 21개 시나리오 질문 ───

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  // ── trust (신뢰도) ×3 ──
  {
    id: 'trust_1',
    category: 'trust',
    title: '매출 보고 상황',
    scenario: '코칭 프로그램 참여 중, 이번 달 매출이 목표의 30%에 그쳤습니다. 트레이너에게 매출 보고를 해야 하는 상황입니다.',
    options: [
      { id: 'trust_1_a', text: '솔직하게 30%라고 보고하고 원인을 함께 분석하자고 한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '투명한 소통', description: '어려운 상황도 솔직하게 공유' }] },
      { id: 'trust_1_b', text: '70% 정도라고 약간 부풀려서 보고한다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '허위 보고 성향', description: '불리한 상황에서 사실을 왜곡' }] },
      { id: 'trust_1_c', text: '이번 달은 보고를 미루고 다음 달에 만회한 후 보고한다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '보고 회피', description: '불리한 정보 공유를 회피하는 경향' }] },
      { id: 'trust_1_d', text: '30%라고 보고하되, 외부 요인(시장 상황 등)을 강조한다', score: 3 },
    ],
  },
  {
    id: 'trust_2',
    category: 'trust',
    title: '정산금 오류 상황',
    scenario: '정산 과정에서 실제보다 50만원이 더 입금된 것을 발견했습니다.',
    options: [
      { id: 'trust_2_a', text: '즉시 관리자에게 알리고 반환 절차를 진행한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '높은 정직성', description: '금전적 이익보다 신뢰를 우선' }] },
      { id: 'trust_2_b', text: '일단 모른 척하고 나중에 알아서 정리되겠지 생각한다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '소극적 부정직', description: '적극적이진 않지만 정직하지 못한 태도' }] },
      { id: 'trust_2_c', text: '실수인 걸 알지만 그냥 넘어간다. 내가 손해 본 적도 있으니까', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '부정직 합리화', description: '부당이득을 자기합리화' }] },
      { id: 'trust_2_d', text: '확인은 하되, 상대방이 먼저 연락하면 그때 반환한다', score: 3 },
    ],
  },
  {
    id: 'trust_3',
    category: 'trust',
    title: '약속 이행 상황',
    scenario: '트레이너와 주 3회 상품 등록을 약속했는데, 이번 주에 개인 사정으로 1회밖에 못 했습니다.',
    options: [
      { id: 'trust_3_a', text: '미리 연락해서 사정을 알리고 다음 주 보충 계획을 제안한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '책임감 있는 소통', description: '약속 미이행 시 선제적 대응' }] },
      { id: 'trust_3_b', text: '연락 없이 넘기고, 물어보면 바빴다고 한다', score: 1, flags: [{ type: 'red', severity: 'WARNING', label: '약속 불이행', description: '약속을 가볍게 여기고 소통 없이 넘김' }] },
      { id: 'trust_3_c', text: '다음 주부터 열심히 해서 만회하면 된다고 생각한다', score: 2 },
      { id: 'trust_3_d', text: '사정을 설명하되, 보충은 어려울 것 같다고 한다', score: 3 },
    ],
  },

  // ── compliance (지재권/컴플라이언스) ×3 ──
  {
    id: 'compliance_1',
    category: 'compliance',
    title: '상품 이미지 사용',
    scenario: '경쟁사 상품 페이지에 매우 잘 만든 상세 이미지가 있습니다. 내 상품과 비슷한데, 이 이미지를 활용하면 매출이 오를 것 같습니다.',
    options: [
      { id: 'compliance_1_a', text: '저작권 침해이므로 절대 사용하지 않고, 직접 제작한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '지재권 존중', description: '타인의 창작물에 대한 존중' }] },
      { id: 'compliance_1_b', text: '약간 수정해서 사용한다. 어차피 모를 것이다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '저작권 침해 의도', description: '지재권 침해를 가볍게 인식' }] },
      { id: 'compliance_1_c', text: '레이아웃만 참고하고 내용은 직접 만든다', score: 4 },
      { id: 'compliance_1_d', text: '해당 셀러에게 연락해서 사용 허가를 요청한다', score: 4 },
    ],
  },
  {
    id: 'compliance_2',
    category: 'compliance',
    title: '허위 원산지 표기',
    scenario: '중국산 제품인데 "Made in Korea" 라벨을 붙이면 가격을 2배로 올릴 수 있다는 제안을 받았습니다.',
    options: [
      { id: 'compliance_2_a', text: '즉시 거절한다. 원산지 허위표기는 범죄다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '강한 윤리 의식', description: '불법 행위에 대한 명확한 거부' }] },
      { id: 'compliance_2_b', text: '다른 셀러들도 다 하는데 나만 안 하면 손해라고 생각한다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '불법 행위 용인', description: '위법 행위를 합리화하는 사고방식' }] },
      { id: 'compliance_2_c', text: '일단 보류하고, 적발 사례가 있는지 먼저 알아본다', score: 2, flags: [{ type: 'red', severity: 'WARNING', label: '위험 인식 부족', description: '법적 문제보다 적발 위험을 먼저 따짐' }] },
      { id: 'compliance_2_d', text: '거절하되, 합법적으로 가격을 올릴 방법을 찾아본다', score: 5 },
    ],
  },
  {
    id: 'compliance_3',
    category: 'compliance',
    title: '리뷰 조작 제안',
    scenario: '지인이 "가짜 리뷰를 대량으로 올려주는 서비스"를 소개해 줬습니다. 비용도 저렴합니다.',
    options: [
      { id: 'compliance_3_a', text: '거절한다. 리뷰 조작은 플랫폼 정책 위반이고 신뢰를 해친다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '정책 준수 의지', description: '단기 이익보다 정책 준수 우선' }] },
      { id: 'compliance_3_b', text: '저렴하니까 한번 해본다. 다른 셀러도 다 한다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '리뷰 조작 의향', description: '플랫폼 정책 위반을 가볍게 인식' }] },
      { id: 'compliance_3_c', text: '소량만 시도해보고 반응을 본다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '정책 위반 경계선', description: '규모만 조절하면 된다는 인식' }] },
      { id: 'compliance_3_d', text: '거절하고, 정상적인 리뷰 확보 전략을 세운다', score: 5 },
    ],
  },

  // ── community (커뮤니티 적합성) ×3 ──
  {
    id: 'community_1',
    category: 'community',
    title: '단체 채팅방 갈등',
    scenario: '파트너 단체 채팅방에서 다른 파트너가 내 의견을 무시하고 비꼬는 말을 했습니다.',
    options: [
      { id: 'community_1_a', text: '감정적으로 대응하지 않고, 필요하면 1:1로 대화를 시도한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '성숙한 갈등 해결', description: '감정 조절과 적절한 대처' }] },
      { id: 'community_1_b', text: '채팅방에서 바로 강하게 반박하고 상대를 공격한다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '공격적 성향', description: '공개적 갈등 조장, 커뮤니티 분위기 해침' }] },
      { id: 'community_1_c', text: '무시하고 넘어간다. 시간이 해결해 줄 것이다', score: 3 },
      { id: 'community_1_d', text: '관리자에게 바로 신고한다', score: 3 },
    ],
  },
  {
    id: 'community_2',
    category: 'community',
    title: '동료 파트너 어려움',
    scenario: '같은 프로그램에 참여 중인 다른 파트너가 상품 등록에 어려움을 겪고 있어 도움을 요청합니다. 하지만 나도 바쁜 상황입니다.',
    options: [
      { id: 'community_2_a', text: '잠깐이라도 시간을 내서 내가 아는 범위에서 도움을 준다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '협력적 태도', description: '바쁜 상황에서도 동료를 돕는 자세' }] },
      { id: 'community_2_b', text: '나도 바쁘니까 모른 척한다. 각자 알아서 해야 한다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '개인주의 성향', description: '협업보다 개인 성과를 우선' }] },
      { id: 'community_2_c', text: '도움은 주되, 나중에 나한테도 도움을 달라고 조건을 건다', score: 3 },
      { id: 'community_2_d', text: '직접 도움은 어렵지만, 도움될 자료나 채널을 안내해 준다', score: 4 },
    ],
  },
  {
    id: 'community_3',
    category: 'community',
    title: '불만 표출 방식',
    scenario: '프로그램 운영 방식에 불만이 생겼습니다. 정산이 늦어지고 있습니다.',
    options: [
      { id: 'community_3_a', text: '관리자에게 직접 건설적으로 의견을 전달한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '건설적 소통', description: '불만을 적절한 채널로 전달' }] },
      { id: 'community_3_b', text: '단체 채팅방에 불만을 터뜨리고 다른 파트너들을 선동한다', score: 1, flags: [{ type: 'red', severity: 'CRITICAL', label: '선동 성향', description: '불만을 공개적으로 확산시키는 행동' }] },
      { id: 'community_3_c', text: '아무 말 안 하고 속으로만 삭인다', score: 3 },
      { id: 'community_3_d', text: '다른 파트너와 사석에서 불만을 나눈다', score: 2 },
    ],
  },

  // ── desperation (절실함) ×3 ──
  {
    id: 'desperation_1',
    category: 'desperation',
    title: '초기 투자 상황',
    scenario: '프로그램 시작을 위해 초기 비용(교육비, 사업자 등록, 초기 상품 구매비)이 필요합니다.',
    options: [
      { id: 'desperation_1_a', text: '이미 준비해 둔 자금이 있고, 사업 계획에 반영되어 있다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '사전 준비 완료', description: '재정적 준비가 되어 있음' }] },
      { id: 'desperation_1_b', text: '돈은 없지만 어떻게든 될 거라고 생각한다', score: 1, flags: [{ type: 'red', severity: 'WARNING', label: '재정 준비 부족', description: '현실적 준비 없이 낙관적' }] },
      { id: 'desperation_1_c', text: '대출을 받아서라도 시작하겠다', score: 4, flags: [{ type: 'yellow', severity: 'WARNING', label: '대출 의존', description: '절실하지만 재정 리스크 존재' }] },
      { id: 'desperation_1_d', text: '비용이 부담되니 좀 더 알아보고 결정하겠다', score: 2 },
    ],
  },
  {
    id: 'desperation_2',
    category: 'desperation',
    title: '시간 투자 의지',
    scenario: '현재 직장을 다니면서 부업으로 시작해야 합니다. 평일 저녁과 주말에 하루 최소 3시간은 투자해야 한다고 들었습니다.',
    options: [
      { id: 'desperation_2_a', text: '이미 생활 패턴을 조정했고, 구체적 시간표도 만들었다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '구체적 실행 계획', description: '시간 관리에 대한 구체적 준비' }] },
      { id: 'desperation_2_b', text: '일단 시작하면 시간은 어떻게든 만들 수 있다', score: 3 },
      { id: 'desperation_2_c', text: '3시간은 좀 많은 것 같다. 1시간 정도는 가능하다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '투자 시간 부족', description: '필요한 시간 투자에 대한 인식 부족' }] },
      { id: 'desperation_2_d', text: '퇴직 후 전업으로 할 계획이라 시간은 충분하다', score: 4 },
    ],
  },
  {
    id: 'desperation_3',
    category: 'desperation',
    title: '첫 3개월 수익 없음',
    scenario: '처음 3개월간은 수익이 거의 없을 수 있다고 들었습니다.',
    options: [
      { id: 'desperation_3_a', text: '각오하고 있다. 3개월 이상 버틸 생활비가 준비되어 있다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '현실적 각오', description: '초기 수익 없음을 이해하고 준비됨' }] },
      { id: 'desperation_3_b', text: '3개월이나? 그건 좀 힘들 것 같다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '인내심 부족', description: '장기적 투자에 대한 각오 부족' }] },
      { id: 'desperation_3_c', text: '다른 수입원이 있어서 괜찮다', score: 4 },
      { id: 'desperation_3_d', text: '빨리 수익을 내는 방법을 찾아보겠다', score: 3 },
    ],
  },

  // ── readiness (준비도) ×3 ──
  {
    id: 'readiness_1',
    category: 'readiness',
    title: '이커머스 사전 조사',
    scenario: '쿠팡 로켓그로스나 오픈마켓 입점에 대해 얼마나 알고 계신가요?',
    options: [
      { id: 'readiness_1_a', text: '입점 절차, 수수료 구조, 카테고리별 특성까지 조사했다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '철저한 사전조사', description: '구체적인 사전 학습 완료' }] },
      { id: 'readiness_1_b', text: '유튜브 영상 몇 개 봤다', score: 2 },
      { id: 'readiness_1_c', text: '잘 모르지만, 교육받으면서 배우면 된다고 생각한다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '사전 준비 미흡', description: '기본적인 사전 조사도 하지 않음' }] },
      { id: 'readiness_1_d', text: '쿠팡 셀러 등록은 해봤고, 기본 구조는 이해하고 있다', score: 4 },
    ],
  },
  {
    id: 'readiness_2',
    category: 'readiness',
    title: '사업자 등록 상태',
    scenario: '프로그램 참여를 위해 사업자 등록이 필요합니다.',
    options: [
      { id: 'readiness_2_a', text: '이미 사업자 등록이 되어 있다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '즉시 시작 가능', description: '행정적 준비 완료' }] },
      { id: 'readiness_2_b', text: '등록 절차를 알아봤고, 바로 진행할 예정이다', score: 4 },
      { id: 'readiness_2_c', text: '사업자 등록이 뭔지 잘 모르겠다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '기본 준비 미흡', description: '사업 시작을 위한 기본 사항도 미파악' }] },
      { id: 'readiness_2_d', text: '필요하면 하겠지만 아직 안 알아봤다', score: 2 },
    ],
  },
  {
    id: 'readiness_3',
    category: 'readiness',
    title: '취급 상품 계획',
    scenario: '어떤 상품을 판매할 계획이신가요?',
    options: [
      { id: 'readiness_3_a', text: '카테고리, 소싱처, 마진율까지 구체적으로 조사했다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '구체적 상품 계획', description: '판매 전략이 수립되어 있음' }] },
      { id: 'readiness_3_b', text: '대략적인 카테고리는 정했지만 구체적이진 않다', score: 3 },
      { id: 'readiness_3_c', text: '아직 정하지 않았다. 추천해 주면 좋겠다', score: 2 },
      { id: 'readiness_3_d', text: '잘 모르겠다. 돈 되는 걸 하고 싶다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '무계획', description: '구체적인 사업 계획이 없음' }] },
    ],
  },

  // ── coachability (학습 태도) ×3 ──
  {
    id: 'coachability_1',
    category: 'coachability',
    title: '트레이너 피드백 수용',
    scenario: '트레이너가 내가 만든 상품 상세 페이지에 대해 "전면 수정이 필요하다"고 피드백을 줬습니다. 나름 공들여 만든 것인데 좀 속상합니다.',
    options: [
      { id: 'coachability_1_a', text: '구체적으로 어떤 부분을 어떻게 수정해야 하는지 질문한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '적극적 학습 자세', description: '피드백을 성장 기회로 활용' }] },
      { id: 'coachability_1_b', text: '내 방식이 더 낫다고 생각하지만, 일단 따른다', score: 3 },
      { id: 'coachability_1_c', text: '전면 수정은 너무하다. 내 의견도 반영해 달라고 한다', score: 3 },
      { id: 'coachability_1_d', text: '트레이너의 역량을 의심하고 다른 사람의 의견을 구한다', score: 1, flags: [{ type: 'red', severity: 'WARNING', label: '코칭 거부 성향', description: '전문가 피드백을 불신하는 태도' }] },
    ],
  },
  {
    id: 'coachability_2',
    category: 'coachability',
    title: '새로운 방법론',
    scenario: '교육에서 기존에 알던 것과 다른 새로운 마케팅 방법론을 배웠습니다.',
    options: [
      { id: 'coachability_2_a', text: '열린 마음으로 배우고, 실제로 적용해 본다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '열린 학습 태도', description: '새로운 방법을 적극 시도' }] },
      { id: 'coachability_2_b', text: '이론은 들어보고, 내 방식과 병행한다', score: 3 },
      { id: 'coachability_2_c', text: '기존 방법이 더 나으니까 내 방식대로 한다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '변화 거부', description: '새로운 방법을 받아들이지 않는 경향' }] },
      { id: 'coachability_2_d', text: '효과가 검증된 건지 먼저 확인한다', score: 4 },
    ],
  },
  {
    id: 'coachability_3',
    category: 'coachability',
    title: '실패 후 태도',
    scenario: '트레이너의 조언대로 했는데 첫 번째 상품이 실패했습니다.',
    options: [
      { id: 'coachability_3_a', text: '실패 원인을 분석하고 트레이너와 다음 전략을 논의한다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '성장형 마인드셋', description: '실패를 학습 기회로 전환' }] },
      { id: 'coachability_3_b', text: '트레이너 탓을 하며 다른 방법을 찾는다', score: 1, flags: [{ type: 'red', severity: 'WARNING', label: '책임 전가', description: '실패의 원인을 외부로 돌림' }] },
      { id: 'coachability_3_c', text: '포기하고 싶은 마음이 크다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '회복력 부족', description: '실패 시 쉽게 포기하는 경향' }] },
      { id: 'coachability_3_d', text: '혼자 원인을 분석해 보고 다시 시도한다', score: 4 },
    ],
  },

  // ── vision (비전) ×3 ──
  {
    id: 'vision_1',
    category: 'vision',
    title: '1년 후 목표',
    scenario: '1년 후 이커머스 사업이 어떻게 되어 있길 바라시나요?',
    options: [
      { id: 'vision_1_a', text: '월 매출 1,000만원 이상, 자체 브랜드 1개 런칭이 목표다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '구체적 비전', description: '수치화된 명확한 목표' }] },
      { id: 'vision_1_b', text: '생활비 정도 벌 수 있으면 좋겠다', score: 3 },
      { id: 'vision_1_c', text: '잘 모르겠다. 되는 대로 하겠다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '비전 부재', description: '목표 없이 시작하려는 태도' }] },
      { id: 'vision_1_d', text: '부업으로 월 200~300만원 추가 수입이 목표다', score: 4 },
    ],
  },
  {
    id: 'vision_2',
    category: 'vision',
    title: '장기적 방향',
    scenario: '이커머스 사업을 어떤 관점으로 보고 계신가요?',
    options: [
      { id: 'vision_2_a', text: '장기적으로 브랜드를 만들고, 사업을 확장할 계획이다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '장기 성장 지향', description: '지속 가능한 사업으로 인식' }] },
      { id: 'vision_2_b', text: '당장 돈이 필요해서 시작하는 것이다', score: 2, flags: [{ type: 'yellow', severity: 'WARNING', label: '단기 수익 집착', description: '장기적 관점 부족' }] },
      { id: 'vision_2_c', text: '3~5년 안에 독립적인 이커머스 기업을 운영하고 싶다', score: 5 },
      { id: 'vision_2_d', text: '일단 해보고, 맞으면 계속하고 아니면 그만둘 것이다', score: 2 },
    ],
  },
  {
    id: 'vision_3',
    category: 'vision',
    title: '위기 대응 자세',
    scenario: '사업 중 예상치 못한 큰 어려움(재고 손실, 정책 변경 등)이 발생했습니다.',
    options: [
      { id: 'vision_3_a', text: '위기를 분석하고, 피봇(방향 전환) 가능성을 포함해 대안을 찾는다', score: 5, flags: [{ type: 'green', severity: 'INFO', label: '위기 대응 능력', description: '어려움에 유연하게 대처' }] },
      { id: 'vision_3_b', text: '운이 나빴다고 생각하고 포기한다', score: 1, flags: [{ type: 'red', severity: 'WARNING', label: '쉬운 포기', description: '어려움에 쉽게 굴복하는 경향' }] },
      { id: 'vision_3_c', text: '누군가가 해결해 주길 기다린다', score: 1, flags: [{ type: 'yellow', severity: 'WARNING', label: '의존적 태도', description: '주도적 문제 해결 의지 부족' }] },
      { id: 'vision_3_d', text: '트레이너에게 조언을 구하고 함께 해결 방법을 찾는다', score: 4 },
    ],
  },
];

// ─── 자유 서술 질문 ───

export const FREE_TEXT_QUESTION = {
  id: 'free_text',
  title: '마지막 질문',
  question: '이 프로그램에 참여하고 싶은 이유와, 본인이 이 프로그램에 적합한 파트너라고 생각하는 이유를 자유롭게 작성해 주세요.',
  placeholder: '최소 50자 이상 작성해 주세요...',
  minLength: 50,
};

// ─── 채점 설정 ───

export const SCORING_CONFIG: ScoringConfig = {
  categories: SCREENING_CATEGORIES,
  // 각 카테고리 3문항 × 5점 × 가중치 합: trust(30), compliance(22.5), community(22.5), desperation(18), readiness(15), coachability(15), vision(19.5) = 142.5 → 가중합 방식이므로 maxRawScore는 가중합 최대값
  // (15×2.0) + (15×1.5) + (15×1.5) + (15×1.2) + (15×1.0) + (15×1.0) + (15×1.3) = 30+22.5+22.5+18+15+15+19.5 = 142.5
  // → 100점 만점 변환: (가중합 / 142.5) × 100
  maxRawScore: 142.5,
  gradeThresholds: [
    { grade: 'S', min: 90 },
    { grade: 'A', min: 75 },
    { grade: 'B', min: 60 },
    { grade: 'C', min: 40 },
    { grade: 'D', min: 0 },
  ],
  knockoutRules: {
    criticalFlagLimit: 1, // CRITICAL 1개 이상 → D
    redFlagLimit: 3,      // RED 3개 이상 → D
    trustMinScore: 15,    // trust 가중 점수 15 이하 → D (raw 7.5 이하, 즉 평균 2.5점 이하)
  },
  minTimeSeconds: 120,
};
