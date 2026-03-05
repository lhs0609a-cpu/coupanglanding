import type { QuizQuestion } from './quiz-registry';

export const PENALTY_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '배송 지연 1회만으로 즉시 판매 정지를 당한다.',
    correctAnswer: 'X',
    explanation:
      '배송 지연 1회로 즉시 판매 정지가 되지는 않습니다. 다만 반복적인 지연은 페널티 점수가 누적되어 판매 제한으로 이어질 수 있어요.',
  },
  {
    id: 2,
    type: 'multiple_choice',
    question: '쿠팡에서 가장 흔한 페널티 원인은 무엇인가요?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '상품 이미지 품질 불량' },
      { key: 'b', label: '출고 지연 (배송 지연)' },
      { key: 'c', label: '가격을 너무 높게 설정' },
      { key: 'd', label: '상품 설명이 너무 짧음' },
    ],
    explanation:
      '출고 지연(배송 지연)은 쿠팡에서 가장 흔한 페널티 원인입니다. 주문 후 약속한 출고소요일 내에 발송하지 못하면 페널티를 받아요.',
  },
  {
    id: 3,
    type: 'ox',
    question: '쿠팡에서 페널티를 받으면 소명(해명)이 불가능하다.',
    correctAnswer: 'X',
    explanation:
      '페널티를 받아도 소명 절차를 통해 해명할 수 있습니다. 정당한 사유가 있으면 페널티가 취소되거나 감경될 수 있어요.',
  },
  {
    id: 4,
    type: 'multiple_choice',
    question: '페널티 예방을 위한 출고소요일 설정은 어떻게 하는 것이 좋을까요?',
    correctAnswer: 'c',
    options: [
      { key: 'a', label: '가능한 짧게 (1일)' },
      { key: 'b', label: '정확히 1~2일' },
      { key: 'c', label: '여유 있게 2~3일' },
      { key: 'd', label: '최대한 길게 (7일 이상)' },
    ],
    explanation:
      '초보 셀러는 출고소요일을 여유 있게 2~3일로 설정하는 것이 안전합니다. 너무 짧으면 지연 위험이 크고, 너무 길면 고객 이탈이 생겨요.',
  },
  {
    id: 5,
    type: 'ox',
    question: '재고가 0인 상품에 주문이 들어오면 페널티를 받을 수 있다.',
    correctAnswer: 'O',
    explanation:
      '재고 관리를 하지 않아 품절 상품에 주문이 들어오면 주문 취소 사유가 되어 페널티를 받을 수 있습니다. 재고가 없으면 반드시 "판매중지" 처리를 하세요.',
  },
];
