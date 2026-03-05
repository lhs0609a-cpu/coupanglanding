import type { QuizQuestion } from './quiz-registry';

export const ESSENTIAL_TIPS_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '상품명에 자신의 상호명을 넣으면 아이템위너에 합산된다.',
    correctAnswer: 'X',
    explanation:
      '상품명 앞에 상호명을 넣으면 오히려 아이템위너 합산이 방지됩니다. 상호명이 들어가면 다른 셀러 상품과 구분되어 독립적인 상품 페이지가 유지돼요.',
  },
  {
    id: 2,
    type: 'multiple_choice',
    question: '구매전환율을 가장 높이는 요소는 무엇인가요?',
    correctAnswer: 'a',
    options: [
      { key: 'a', label: '무료배송' },
      { key: 'b', label: '상품 설명 길이' },
      { key: 'c', label: '브랜드 인지도' },
      { key: 'd', label: '리뷰 개수' },
    ],
    explanation:
      '무료배송은 구매전환율을 가장 크게 높이는 요소입니다. 쿠팡 데이터에 따르면 무료배송 상품의 전환율이 최대 7배까지 높아요.',
  },
  {
    id: 3,
    type: 'ox',
    question: '쿠팡 고객의 80% 이상이 모바일로 쇼핑한다.',
    correctAnswer: 'O',
    explanation:
      '쿠팡 고객의 80% 이상이 모바일 앱으로 쇼핑합니다. 상세페이지 이미지와 글자 크기를 모바일에 맞춰 크게 만들어야 해요.',
  },
  {
    id: 4,
    type: 'multiple_choice',
    question: '상세페이지에서 가장 중요한 요소는 무엇인가요?',
    correctAnswer: 'a',
    options: [
      { key: 'a', label: '첫 번째 대표 이미지' },
      { key: 'b', label: '상세한 텍스트 설명' },
      { key: 'c', label: '할인율 표시' },
      { key: 'd', label: '배송 안내 문구' },
    ],
    explanation:
      '첫 번째 대표 이미지가 가장 중요합니다. 고객은 검색 결과에서 대표 이미지를 보고 클릭 여부를 결정하며, 상세페이지 진입 후에도 첫 이미지가 구매 결정에 가장 큰 영향을 줘요.',
  },
  {
    id: 5,
    type: 'ox',
    question: '경쟁이 많은 카테고리는 초보 셀러가 무조건 피해야 한다.',
    correctAnswer: 'X',
    explanation:
      '경쟁이 많다는 것은 그만큼 수요도 크다는 의미입니다. 경쟁 카테고리에서도 차별화 포인트(가격, 구성, 배송)를 찾으면 충분히 진입할 수 있어요.',
  },
];
