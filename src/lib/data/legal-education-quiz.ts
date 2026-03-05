import type { QuizQuestion } from './quiz-registry';

export type { QuizQuestion };

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '구매한 정품 상품을 다른 사람에게 되파는 것(리셀)은 불법이다.',
    correctAnswer: 'X',
    explanation:
      '최초판매의 원칙(소진이론)에 의해, 적법하게 구매한 상품의 소유권은 구매자에게 이전되므로 재판매는 합법입니다.',
  },
  {
    id: 2,
    type: 'ox',
    question: '쿠팡에서 상품을 구매해서 다른 플랫폼에서 판매하는 것은 합법이다.',
    correctAnswer: 'O',
    explanation:
      '구매대행·리셀은 합법적인 유통 활동입니다. 실제로 많은 오픈마켓 셀러가 이 방식으로 사업합니다.',
  },
  {
    id: 3,
    type: 'multiple_choice',
    question: '리셀이 합법인 법적 근거는?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '소비자보호법' },
      { key: 'b', label: '최초판매의 원칙(소진이론)' },
      { key: 'c', label: '전자상거래법' },
      { key: 'd', label: '공정거래법' },
    ],
    explanation:
      '최초판매의 원칙(소진이론)에 따라, 적법하게 유통된 상품은 권리자의 허락 없이도 자유롭게 재판매할 수 있습니다.',
  },
  {
    id: 4,
    type: 'ox',
    question: '대법원 판례에서 정품의 재판매(리셀)를 불법으로 판결한 적이 있다.',
    correctAnswer: 'X',
    explanation:
      '대법원 2002다66946 판결 등에서 적법하게 취득한 상품의 재판매는 상표권 침해가 아니라고 판시했습니다.',
  },
  {
    id: 5,
    type: 'multiple_choice',
    question: '다음 중 리셀이 불법이 되는 경우는?',
    correctAnswer: 'c',
    options: [
      { key: 'a', label: '정품을 할인가에 대량 구매하여 판매' },
      { key: 'b', label: '온라인에서 구매한 상품을 오프라인에서 판매' },
      { key: 'c', label: '위조품/짝퉁을 판매하는 경우' },
      { key: 'd', label: '해외 직구 상품을 국내에서 판매' },
    ],
    explanation:
      '위조품(짝퉁) 판매는 상표법 위반으로 형사처벌 대상입니다. 정품의 재판매는 방식에 관계없이 합법입니다.',
  },
  {
    id: 6,
    type: 'ox',
    question: '브랜드에서 "판매를 중지하라"는 내용증명을 보내면 법적으로 반드시 따라야 한다.',
    correctAnswer: 'X',
    explanation:
      '내용증명은 상대방에게 의사를 전달하는 편지일 뿐, 법적 강제력이 없습니다. 법원 명령이 아니므로 따르지 않아도 법적 불이익은 없어요.',
  },
  {
    id: 7,
    type: 'multiple_choice',
    question: '브랜드 경고 메일을 받았을 때 가장 올바른 대응은?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '겁이 나서 바로 판매를 중지한다' },
      { key: 'b', label: '감정적 대응 없이 대응 템플릿으로 회신한다' },
      { key: 'c', label: '전화로 항의하며 강하게 대응한다' },
      { key: 'd', label: '무조건 변호사를 선임한다' },
    ],
    explanation:
      '감정적 대응이나 자진 판매 중지는 불필요합니다. 정품 리셀은 합법이므로 침착하게 대응 템플릿으로 회신하고, 필요 시 코치와 상의하면 됩니다.',
  },
];
