import type { QuizQuestion } from './quiz-registry';

export const PENALTY_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    type: 'ox',
    question: '쿠팡에 소명서를 제출할 때 HWP 파일로 작성해도 된다.',
    correctAnswer: 'X',
    explanation:
      'HWP 파일은 즉시 반려됩니다. 반드시 Word(.docx) 파일로 작성해야 합니다. 이는 쿠팡 신뢰관리센터의 공식 요구사항입니다.',
  },
  {
    id: 2,
    type: 'multiple_choice',
    question: '상표권 침해 소명 시 KIPRIS에서 해당 상표가 "소멸" 상태라면 어떻게 해야 할까요?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '변리사 비침해 의견서를 반드시 받아야 한다' },
      { key: 'b', label: 'KIPRIS 검색 결과 캡처로 "상표권 부존재" 소명이 가능하다' },
      { key: 'c', label: '소명이 불가능하므로 상품을 삭제해야 한다' },
      { key: 'd', label: '쿠팡 콜센터에 전화해서 해결해야 한다' },
    ],
    explanation:
      'KIPRIS에서 상표 상태가 "소멸", "출원", "거절"이면 상표권이 존재하지 않습니다. 검색 결과 캡처를 첨부하여 "상표권 부존재"로 소명하면 해결 가능합니다. "등록" 상태일 때만 변리사 의견서가 필요합니다.',
  },
  {
    id: 3,
    type: 'ox',
    question: '개선계획서의 향후 예방 계획 3가지는 비슷한 내용으로 작성해도 괜찮다.',
    correctAnswer: 'X',
    explanation:
      '향후 예방 계획 3가지는 반드시 각각 완전히 다른 내용으로 작성해야 합니다. 비슷한 내용으로 작성하면 반려됩니다. 각 방법마다 별도 엑셀/PDF 증빙을 첨부하세요.',
  },
  {
    id: 4,
    type: 'multiple_choice',
    question: '쿠팡 계정 영구정지 시 소명 기회는 몇 회인가요?',
    correctAnswer: 'b',
    options: [
      { key: 'a', label: '무제한 (계속 재제출 가능)' },
      { key: 'b', label: '1~2회 (첫 번째 거절 후 두 번째가 마지막 기회)' },
      { key: 'c', label: '3회' },
      { key: 'd', label: '소명 기회가 없다' },
    ],
    explanation:
      '영구정지 시 첫 번째 거절 후 두 번째 제출이 "마지막 기회"입니다. 첫 번째 제출을 최대한 완벽하게 준비하세요. 실제로 5차까지 승인받은 일시정지 사례도 있지만, 영구정지는 기회가 매우 제한적입니다.',
  },
  {
    id: 5,
    type: 'ox',
    question: '정품 인증 요구 시 세금계산서의 가격 정보는 그대로 제출해야 한다.',
    correctAnswer: 'X',
    explanation:
      '가격 관련 정보(단가, 수량 등)는 반드시 전부 블러처리 후 제출해야 합니다. 미삭제 시 자발적 정보제공으로 간주됩니다. 수입신고필증, 인보이스의 가격 정보도 마찬가지입니다.',
  },
  {
    id: 6,
    type: 'multiple_choice',
    question: '쿠팡 고객 문의 24시간 내 답변율은 최소 몇 % 이상을 유지해야 할까요?',
    correctAnswer: 'c',
    options: [
      { key: 'a', label: '80%' },
      { key: 'b', label: '90%' },
      { key: 'c', label: '95%' },
      { key: 'd', label: '100%' },
    ],
    explanation:
      '24시간 내 답변율 95% 이상을 유지해야 합니다. 30일간 접수된 모든 문의를 기준으로 산정되며, 의미 없는 단답형 응답도 부실 응답으로 페널티 대상입니다.',
  },
  {
    id: 7,
    type: 'ox',
    question: '2025년 3월 24일부터 쿠팡 연관계정 제재가 시행되어, 정지된 판매자와 동일 전화번호 사용 시 연관 계정도 자동 정지된다.',
    correctAnswer: 'O',
    explanation:
      '2025년 3월 24일부터 연관계정 제재가 시행됩니다. 약관 위반으로 정지된 판매자와 동일 전화번호/주소를 사용하면 연관 계정으로 간주되어 자동 정지됩니다. 복수 계정 운영 시 반드시 정보를 분리하세요.',
  },
  {
    id: 8,
    type: 'multiple_choice',
    question: '소명서에 첨부할 증빙자료로 가장 적절한 형식은?',
    correctAnswer: 'c',
    options: [
      { key: 'a', label: '이미지 캡처 (JPG/PNG)' },
      { key: 'b', label: 'HWP 문서' },
      { key: 'c', label: 'PDF 또는 엑셀 파일' },
      { key: 'd', label: '구두 설명 (전화)' },
    ],
    explanation:
      '증빙자료는 PDF 또는 엑셀 파일로 별도 첨부해야 합니다. 단순 이미지 캡처는 증빙으로 인정되지 않을 수 있으며, 각 증빙마다 직관적인 파일명을 설정하세요 (예: [증거1] 상품삭제내역.pdf).',
  },
];
