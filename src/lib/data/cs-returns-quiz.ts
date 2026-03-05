import type { QuizQuestion } from './quiz-registry';

export const CS_RETURNS_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '반품률 5~10%는 비정상적으로 높은 수치이다.',
    correctAnswer: 'X',
    explanation:
      '온라인 쇼핑에서 반품률 5~10%는 업계 평균 수준입니다. 의류는 더 높을 수 있어요. 반품은 정상적인 비즈니스 과정의 일부이니 너무 걱정하지 마세요.',
  },
  {
    id: 2,
    type: 'multiple_choice',
    question: '고객 불만 접수 시 가장 먼저 해야 할 첫 대응은?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '즉시 환불 처리' },
      { key: 'b', label: '공감 표현 ("불편을 드려 죄송합니다")' },
      { key: 'c', label: '상품 설명을 다시 안내' },
      { key: 'd', label: '반품 절차 안내' },
    ],
    explanation:
      '고객 불만 시 가장 먼저 공감을 표현해야 합니다. "불편을 드려 죄송합니다"라는 한마디가 고객의 감정을 누그러뜨리고 원만한 해결로 이어져요.',
  },
  {
    id: 3,
    type: 'ox',
    question: '악성 리뷰에는 감정적으로 강하게 반박하는 것이 효과적이다.',
    correctAnswer: 'X',
    explanation:
      '감정적 반박은 오히려 상황을 악화시킵니다. 정중하고 전문적인 톤으로 사실 관계를 설명하고, 해결 방안을 제시하는 것이 다른 잠재 고객에게도 좋은 인상을 줍니다.',
  },
  {
    id: 4,
    type: 'multiple_choice',
    question: '고객의 단순 변심으로 인한 반품 시 배송비는 누가 부담하나요?',
    correctAnswer: 'c',
    options: [
      { key: 'a', label: '판매자가 전액 부담' },
      { key: 'b', label: '쿠팡이 부담' },
      { key: 'c', label: '구매자가 부담' },
      { key: 'd', label: '판매자와 구매자가 반반 부담' },
    ],
    explanation:
      '단순 변심에 의한 반품은 구매자가 배송비를 부담합니다. 다만 상품 하자나 오배송의 경우에는 판매자가 배송비를 부담해야 해요.',
  },
  {
    id: 5,
    type: 'ox',
    question: '고객이 반품을 요청하면 모든 경우에 무조건 수락해야 한다.',
    correctAnswer: 'X',
    explanation:
      '모든 반품을 무조건 수락할 필요는 없습니다. 반품 기한 초과, 사용 흔적이 있는 상품, 위생용품 등은 반품을 거부할 수 있는 정당한 사유가 됩니다.',
  },
];
