export const BUSINESS_INFO = {
  companyName: '플라트마케팅',
  representative: '이현석',
  businessNumber: '451-22-01529',
  address: '경기도 용인시 기흥구 강남서로 9, 7층 703호-b721(구갈동)',
  businessType: '서비스업, 정보통신업',
  businessItems: '광고 대행업, 통신판매 및 기타 인터넷 판매 대행',
  // TODO: 통신판매업신고 완료 후 업데이트
  ecommerceRegistration: '[미정]',
  // TODO: 고객 문의 이메일 확정 후 업데이트
  email: '[미정]',
  // TODO: 고객 문의 전화번호 확정 후 업데이트
  phone: '[미정]',
  serviceName: '메가로드',
  serviceNameEn: 'Megaload',
  domain: 'megaload.kr',
  effectiveDate: '2025년 1월 1일',
} as const;

export type BusinessInfo = typeof BUSINESS_INFO;
