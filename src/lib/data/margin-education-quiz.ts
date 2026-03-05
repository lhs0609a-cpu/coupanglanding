import type { QuizQuestion } from './quiz-registry';

export const MARGIN_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '매출 100만원이 발생하면 순이익도 100만원이다.',
    correctAnswer: 'X',
    explanation:
      '매출에서 상품원가, 쿠팡 수수료, 배송비, 반품비, 광고비 등을 제외해야 순이익이 됩니다. 실제 순이익은 매출의 20~30% 수준이에요.',
  },
  {
    id: 2,
    type: 'multiple_choice',
    question: '쿠팡 판매 수수료율은 대략 어느 범위인가요?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '카테고리 무관 일률 5%' },
      { key: 'b', label: '카테고리별 약 7~11%' },
      { key: 'c', label: '카테고리별 약 15~25%' },
      { key: 'd', label: '수수료 없음 (월정액제)' },
    ],
    explanation:
      '쿠팡은 카테고리에 따라 약 7~11%의 판매 수수료를 부과합니다. 카테고리 선택 시 수수료율도 꼭 확인하세요.',
  },
  {
    id: 3,
    type: 'ox',
    question: '마진율을 계산할 때 배송비와 반품비도 비용에 포함해야 한다.',
    correctAnswer: 'O',
    explanation:
      '배송비와 반품비는 실제 발생하는 비용이므로 마진 계산 시 반드시 포함해야 정확한 수익을 파악할 수 있습니다.',
  },
  {
    id: 4,
    type: 'multiple_choice',
    question: '다음 중 마진 계산에 포함되지 않는 비용은?',
    correctAnswer: 'a',
    options: [
      { key: 'a', label: '쿠팡 가입비 (무료)' },
      { key: 'b', label: '쿠팡 판매 수수료' },
      { key: 'c', label: '배송비' },
      { key: 'd', label: '광고비' },
    ],
    explanation:
      '쿠팡은 가입비가 무료이므로 마진 계산에 포함되지 않습니다. 판매 수수료, 배송비, 광고비 등은 실제 비용이므로 반드시 포함해야 해요.',
  },
  {
    id: 5,
    type: 'ox',
    question: '광고비를 제외한 마진율이 20% 이상이면 초보 셀러에게 적합한 상품이다.',
    correctAnswer: 'O',
    explanation:
      '초보 셀러는 광고비 제외 마진율 20% 이상인 상품을 선택하는 것이 안전합니다. 마진이 너무 낮으면 광고비나 예상치 못한 비용 발생 시 적자가 될 수 있어요.',
  },
];
