/**
 * 쿠팡 페널티 실전 대응 가이드
 * 실제 셀러 경험 + 공식 정책 기반
 *
 * Sources:
 * - windly.cc, brunch.co.kr, pinepat.com, revertface.com, oscsnm.com
 * - marketplace.coupang.com, percenty.co.kr, sarangip.com
 */

export type SeverityLevel = 'normal' | 'high' | 'critical';
export type PenaltyGroup = 'brand_claim' | 'account_penalty';

export interface ResponseStep {
  step: number;
  title: string;
  description: string;
  deadline?: string;
}

export interface RequiredDocument {
  name: string;
  description: string;
  required: boolean;
}

export interface PenaltyGuide {
  id: string;
  group: PenaltyGroup;
  label: string;
  severity: SeverityLevel;
  severityLabel: string;
  scoreImpact: number;
  shortDescription: string;
  detailedDescription: string;
  responseSteps: ResponseStep[];
  requiredDocuments: RequiredDocument[];
  commonMistakes: string[];
  proTips: string[];
  deadline: string;
  contactInfo: {
    channel: string;
    value: string;
  }[];
  realCases: {
    title: string;
    result: 'success' | 'failure';
    summary: string;
  }[];
  badgeColor: string;
  severityColor: string;
}

export const PENALTY_GROUPS: Record<PenaltyGroup, { label: string; icon: string }> = {
  brand_claim: { label: '브랜드 클레임', icon: 'Shield' },
  account_penalty: { label: '계정 페널티', icon: 'AlertTriangle' },
};

export const PENALTY_GUIDES: PenaltyGuide[] = [
  // ── 브랜드 클레임 ──────────────────────────────────────
  {
    id: 'trademark_infringement',
    group: 'brand_claim',
    label: '상표권 침해',
    severity: 'high',
    severityLabel: '높음',
    scoreImpact: 30,
    shortDescription: '브랜드 소유자가 쿠팡 신뢰관리센터를 통해 상표권 침해 신고를 접수한 경우입니다.',
    detailedDescription:
      '3건 누적 시 계정 영구정지될 수 있으므로 반드시 소명서를 제출해야 합니다. 무재고 리셀 모델에서는 "정품 증빙"이 어려우므로, KIPRIS 비침해 소명 또는 인정+개선계획서 루트로 대응합니다.',
    responseSteps: [
      {
        step: 1,
        title: '판매정지 메일 확인',
        description:
          '쿠팡 CM112@coupang.com으로부터 수신한 메일에서 위반 항목, 상품번호, 상표등록번호를 정확히 확인합니다.',
      },
      {
        step: 2,
        title: 'KIPRIS 상표 상태 확인',
        description:
          'KIPRIS(www.kipris.or.kr)에 접속 → 상표 탭 → 등록번호 검색. "소멸/출원/거절" 상태라면 상표권 부존재로 소명 가능합니다. "등록" 상태면 변리사 비침해 의견서가 필요합니다.',
      },
      {
        step: 3,
        title: '해당 상품 즉시 판매 중지',
        description:
          'WING 판매자센터에서 해당 상품을 "판매중지" 처리하고, 판매상태 스크린샷을 캡처합니다.',
      },
      {
        step: 4,
        title: '소명서 작성 (Word 파일)',
        description:
          '반드시 Word(.docx) 파일로 작성합니다. HWP는 반려됩니다.\n\n① 판매자 정보 (업체명, 판매자 ID)\n② 소명 대상 상품 정보 (상품번호, 상품명)\n③ 위반 내용 설명 (객관적 서술)\n④ 문제 해결 방안 및 조치 결과 (판매중지 캡처 첨부)\n⑤ 향후 재발방지 계획 (3가지, 각각 다른 내용)',
      },
      {
        step: 5,
        title: '변리사 비침해 의견서 확보 (등록 상표인 경우)',
        description:
          '상표가 "등록" 상태라면 변리사 비침해 의견서를 첨부해야 신빙성이 인정됩니다. 단순히 "침해 아닙니다"만 주장하면 반려됩니다.',
      },
      {
        step: 6,
        title: 'CM112@coupang.com으로 제출',
        description:
          '기존 쿠팡 안내 메일에 답장 형태로 소명서 + 증빙자료를 첨부하여 발송합니다.',
        deadline: '소명서 제출 후 검토까지 약 8영업일',
      },
    ],
    requiredDocuments: [
      { name: '소명서 (Word 파일)', description: '쿠팡 제공 양식에 맞춘 .docx 파일', required: true },
      { name: 'KIPRIS 검색 결과 캡처', description: '해당 상표의 등록 상태 확인 스크린샷', required: true },
      { name: '판매중지 처리 캡처', description: 'WING에서 해당 상품 판매중지 상태 스크린샷', required: true },
      { name: '변리사 비침해 의견서', description: '상표가 등록 상태인 경우 필수', required: false },
      { name: 'IP 교육 수료증', description: '국가지식재산교육포털(ipacademy.net) 수료증', required: false },
    ],
    commonMistakes: [
      'Word가 아닌 HWP 파일로 제출 → 즉시 반려',
      '여러 건의 소명을 지재권 유형별로 분리하지 않고 통합 작성 → 반려',
      '변리사 의견서 없이 "침해 아닙니다"만 주장 → 반려',
      '문제 상품만 삭제하고 소명서를 제출하지 않음 → 반복 위반으로 간주',
      '향후 예방 계획 3가지를 비슷한 내용으로 작성 → 반려',
    ],
    proTips: [
      '상품 등록 전 KIPRIS에서 상표 사전 검색하는 습관을 들이세요',
      '국가지식재산교육포털(ipacademy.net)에서 "지식재산개론" 10시간 이상 수료 후 수료증을 소명서에 첨부하면 승인률 상승',
      '3가지 향후 예방 계획은 반드시 각각 완전히 다른 내용 + 별도 엑셀/PDF 증빙 첨부',
      '소명서 파일명을 명확하게 설정 (예: [증거1] KIPRIS_상표조회결과.pdf)',
      '5번째 시도에서 승인받은 셀러 사례 있음 — 반려되어도 포기하지 말고 보완 제출',
    ],
    deadline: '소명 미제출 시 해당 상품 영구 중단 / 3회 적발 시 계정 정지',
    contactInfo: [
      { channel: '신뢰관리센터 이메일', value: 'CM112@coupang.com' },
      { channel: '판매자 콜센터', value: '1600-9879' },
      { channel: 'KIPRIS', value: 'www.kipris.or.kr' },
    ],
    realCases: [
      {
        title: '5차 시도 끝에 승인 (블로거 revertface)',
        result: 'success',
        summary:
          '1~4차 모두 반려됨. 5차에서 3가지 예방 방법을 완전히 다른 내용으로 작성 + 각각 엑셀/PDF 별도 첨부 + IP 교육 수료증 첨부 → 승인',
      },
      {
        title: '변리사 소견서로 수일 내 해결',
        result: 'success',
        summary:
          '디자인권/상표권 침해로 판매 정지 → 변리사에게 비침해 3가지 사유 분석 소견서 확보 → 수일 만에 해제',
      },
      {
        title: '10회 소명 실패 후 플랫폼 전환 (ohline1998)',
        result: 'failure',
        summary:
          '5개 계정 전부 정지, 월 매출 1,500만원 소멸. 소명 10번 거절 후 스마트스토어로 전환하여 월 8,000만원 달성',
      },
    ],
    badgeColor: 'bg-red-100 text-red-700',
    severityColor: 'bg-red-500',
  },

  {
    id: 'copyright_infringement',
    group: 'brand_claim',
    label: '저작권 침해',
    severity: 'high',
    severityLabel: '높음',
    scoreImpact: 25,
    shortDescription:
      '상품 이미지, 상세페이지, 설명 텍스트 등에 대한 저작권 침해 신고가 접수된 경우입니다.',
    detailedDescription:
      '저작권은 등록 없이 창작 시점에 자동 발생합니다 (저작권법 제136조). 무재고 셀러는 실물을 직접 촬영할 수 없어 도매처 이미지에 의존하는데, 도매처가 저작권을 갖고 있지 않은 이미지를 제공하는 경우가 많으므로 특히 주의가 필요합니다.',
    responseSteps: [
      {
        step: 1,
        title: '침해 내용 확인',
        description:
          '쿠팡 안내 메일에서 어떤 이미지/콘텐츠가 문제인지 정확히 확인합니다.',
      },
      {
        step: 2,
        title: '해당 상품 이미지/상세페이지 즉시 교체 또는 삭제',
        description:
          '문제가 된 이미지를 즉시 삭제하고, 자체 촬영 이미지 또는 저작권 프리 이미지로 교체합니다.',
      },
      {
        step: 3,
        title: '소명서 작성 (Word 파일)',
        description:
          '자체 제작인 경우: 원본 PSD/AI 파일, 촬영 원본 RAW 파일, 제작 일시 증명을 첨부합니다.\n도매처 이미지 사용인 경우: 도매처로부터 이미지 사용 허가 증빙을 확보합니다.',
      },
      {
        step: 4,
        title: '쿠팡 온라인 문의로 제출',
        description:
          '쿠팡 헬프센터(helpcenter.coupangcorp.com) 또는 CM112@coupang.com으로 소명서를 제출합니다.',
      },
    ],
    requiredDocuments: [
      { name: '소명서 (Word 파일)', description: '침해 경위 및 해결 조치 서술', required: true },
      { name: '원본 파일 (PSD/AI/RAW)', description: '자체 제작 증빙 (해당 시)', required: false },
      { name: '이미지 사용 허가서', description: '도매처/공급자로부터의 이미지 사용 허가 증빙', required: false },
      { name: '저작권 등록증', description: '한국저작권위원회 등록증 (있는 경우)', required: false },
    ],
    commonMistakes: [
      '도매처가 제공한 이미지를 무조건 사용 가능하다고 판단',
      '문제 이미지만 삭제하고 소명서를 제출하지 않음',
      '원본 파일을 보관하지 않아 자체 제작 증빙 불가',
    ],
    proTips: [
      '상세페이지 제작 시 원본 파일(PSD, RAW 등)을 반드시 보관하세요',
      '도매처 이미지 사용 전 이미지 사용 허가 여부를 확인하세요',
      '저작권 등록을 먼저 완료한 후 소명하면 효과적',
      '침해 발견 즉시 지체 없이 대응 — 빠른 조치가 유리',
    ],
    deadline: '소명 미제출 시 상품 영구 중단',
    contactInfo: [
      { channel: '신뢰관리센터 이메일', value: 'CM112@coupang.com' },
      { channel: '헬프센터', value: 'helpcenter.coupangcorp.com' },
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [
      {
        title: '저작권 등록 후 역신고로 해결',
        result: 'success',
        summary:
          '한 셀러가 자신의 상세페이지를 한국저작권위원회에 먼저 등록 → 도용자에 대해 역신고 → 플랫폼 차원 판매 정지 이끌어냄',
      },
    ],
    badgeColor: 'bg-purple-100 text-purple-700',
    severityColor: 'bg-red-500',
  },

  {
    id: 'authenticity_request',
    group: 'brand_claim',
    label: '정품 인증 요구',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 15,
    shortDescription: '쿠팡 또는 브랜드 측에서 정품 인증(유통경로 확인) 서류를 요구한 경우입니다.',
    detailedDescription:
      '무재고 리셀 모델에서는 재고를 미리 사두지 않으므로 정품 증빙이 매우 어렵습니다. 증빙 제출이 불가하면 해당 상품을 삭제하고 개선계획서를 제출하는 것이 현실적 대응입니다. 2025년부터 서류 미비 시 즉시 반려(보완 기회 없음) 정책으로 강화되었습니다.',
    responseSteps: [
      {
        step: 1,
        title: '소명 요청 메일 확인',
        description: 'CM112@coupang.com에서 수신한 유통경로 소명 요청 메일에서 필요 서류를 확인합니다.',
      },
      {
        step: 2,
        title: '증빙 서류 준비',
        description:
          '세금계산서(6개월 이내 발행분), 수입신고필증(해외 제품), 거래증빙자료를 준비합니다.\n\n중요: 가격 관련 정보는 반드시 전부 블러처리 후 제출합니다.',
      },
      {
        step: 3,
        title: '증빙 불가 시 — 상품 삭제 + 개선계획서',
        description:
          '무재고 셀러로서 정품 증빙이 불가한 경우, 해당 상품을 삭제하고 개선계획서(향후 브랜드 상품 미취급 계획)를 제출합니다.',
      },
      {
        step: 4,
        title: '안내 메일에 답장으로 제출',
        description: '기존 쿠팡 메일에 답장 형태로 서류를 첨부하여 발송합니다.',
      },
    ],
    requiredDocuments: [
      { name: '세금계산서', description: '6개월 이내 발행, 상품명과 실제 판매 상품명 일치 필수', required: true },
      { name: '수입신고필증', description: '해외 제품인 경우 필수', required: false },
      { name: '거래증빙자료', description: '공급자~판매자 유통경로 (공급자, 거래일자, 품목, 직인/서명)', required: true },
      { name: '정품취급처 확인서', description: '수입자가 공식 유통 채널임을 증명하는 자료', required: false },
      { name: '영업신고증', description: '식품, 의약외품 등 특정 업종', required: false },
    ],
    commonMistakes: [
      '가격 정보를 블러처리하지 않고 제출 → 자발적 정보제공으로 간주',
      '개인 간 거래나 비공식 채널 매입 서류 제출 → 2025년부터 불인정',
      '서류 미비 상태로 제출 → 2025년부터 보완 기회 없이 즉시 반려',
    ],
    proTips: [
      '식품, 유아용품, 전자제품은 더 엄격한 기준이 적용됩니다',
      '수입신고필증/인보이스의 단가, 가격, 수량은 반드시 블러처리',
      '정품 증빙이 어려운 브랜드 상품은 애초에 취급하지 않는 것이 안전',
      '도매처에 세금계산서 발행 가능 여부를 사전에 확인하세요',
    ],
    deadline: '서류 미제출 시 해당 상품 영구 중단',
    contactInfo: [
      { channel: '신뢰관리센터 이메일', value: 'CM112@coupang.com' },
      { channel: '헬프센터', value: 'helpcenter.coupangcorp.com' },
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-yellow-100 text-yellow-700',
    severityColor: 'bg-yellow-500',
  },

  {
    id: 'parallel_import',
    group: 'brand_claim',
    label: '병행수입 제한',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 15,
    shortDescription:
      '브랜드의 국내 공식 유통업체(전용사용권자)가 병행수입 제한을 주장한 경우입니다.',
    detailedDescription:
      '병행수입 자체는 합법이지만(국제소진 이론), 3가지 요건을 충족해야 합니다. 무재고 셀러는 직접 수입하지 않고 국내 도매처를 통해 소싱하므로 이 경우가 드물지만, 해외 브랜드 상품을 취급하면 도매처의 유통경로 문제로 연루될 수 있습니다.',
    responseSteps: [
      {
        step: 1,
        title: '병행수입 제한 통지 확인',
        description: '쿠팡 메일에서 어떤 브랜드/상품에 대한 제한인지 확인합니다.',
      },
      {
        step: 2,
        title: '유통경로 증빙 준비',
        description:
          '수입신고필증, 인보이스(단가/가격 블러처리), 수입자→판매자 거래증빙, 정품취급처 확인서를 준비합니다.',
      },
      {
        step: 3,
        title: '소명서 제출',
        description:
          '정식 통관 기록(수입신고필증)이 가장 강력한 증빙입니다. 유통구조의 정당성을 증명하는 데 집중합니다.',
      },
    ],
    requiredDocuments: [
      { name: '수입신고필증 또는 인보이스', description: '단가/가격/수량 블러처리 필수', required: true },
      { name: '거래증빙자료', description: '수입자~판매자 유통경로 (직인/서명 포함)', required: true },
      { name: '정품취급처 확인서', description: '공식 디스트리뷰터 계약서 등', required: false },
      { name: '세금계산서', description: '6개월 이내 발행분', required: true },
    ],
    commonMistakes: [
      '가격 정보를 블러처리하지 않은 서류 제출',
      '도매처의 유통경로를 확인하지 않고 판매 → 연루 위험',
    ],
    proTips: [
      '병행수입 제품도 정품이므로, 유통구조의 정당성 증명이 핵심',
      '정식 통관 기록(수입신고필증)이 가장 강력한 증빙',
      '해외 브랜드 상품 취급 시 도매처에 수입 경로를 사전 확인',
    ],
    deadline: '서류 미제출 시 해당 상품 판매 중단',
    contactInfo: [
      { channel: '신뢰관리센터 이메일', value: 'CM112@coupang.com' },
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-blue-100 text-blue-700',
    severityColor: 'bg-yellow-500',
  },

  {
    id: 'price_policy_violation',
    group: 'brand_claim',
    label: '가격 정책 위반',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 10,
    shortDescription:
      '브랜드에서 지정한 최소 광고 가격(MAP) 이하로 판매하여 경고를 받은 경우입니다.',
    detailedDescription:
      '쿠팡의 다이나믹 프라이싱(자동 최저가 매칭)으로 인해 의도치 않게 MAP 위반이 발생할 수 있습니다. 가격 관련 노출 제한은 내부 알고리즘으로 처리됩니다.',
    responseSteps: [
      {
        step: 1,
        title: '위반 경고 확인',
        description: '쿠팡 메일 또는 판매자센터에서 어떤 상품의 가격 정책 위반인지 확인합니다.',
      },
      {
        step: 2,
        title: '해당 상품 가격 즉시 조정',
        description: '브랜드 MAP 이상으로 가격을 조정합니다. 다이나믹 프라이싱을 사용 중이라면 해제합니다.',
      },
      {
        step: 3,
        title: '브랜드 MAP 확인 후 재등록',
        description:
          '해당 브랜드의 공식 MAP 가격을 확인하고, 준수하여 재판매합니다.',
      },
    ],
    requiredDocuments: [],
    commonMistakes: [
      '다이나믹 프라이싱 설정을 해제하지 않아 반복 위반',
      '브랜드 MAP 가격을 확인하지 않고 최저가로 등록',
    ],
    proTips: [
      'MAP 정책이 있는 브랜드를 취급할 때는 다이나믹 프라이싱을 비활성화하세요',
      'MAP 위반이 반복되면 브랜드 측에서 상표권 침해 신고로 이어질 수 있습니다',
    ],
    deadline: '즉시 가격 조정 권고',
    contactInfo: [
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-orange-100 text-orange-700',
    severityColor: 'bg-yellow-500',
  },

  // ── 계정 페널티 ──────────────────────────────────────
  {
    id: 'delivery_delay',
    group: 'account_penalty',
    label: '배송 지연',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 10,
    shortDescription:
      '출고예정일을 경과하여 미배송되거나, 배송예정일 7일 초과 미배송 시 페널티가 부과됩니다.',
    detailedDescription:
      '정시출고완료 점수는 참고지표이나, 미준수 비중이 높으면 정산 지연 및 노출 제한 조치를 받습니다. 무재고 셀러는 도매처 재고/출고에 100% 의존하므로 배송 지연 리스크가 가장 높은 유형입니다. 택배사 사정에 따른 배송 지연도 판매자 점수에 반영됩니다.',
    responseSteps: [
      {
        step: 1,
        title: '배송지연 안내 문자 발송',
        description:
          'WING > 주문/배송 > 배송관리에서 해당 주문에 대한 배송지연 안내 문자를 발송합니다. 단, 정시배송완료 항목에는 여전히 반영됩니다.',
      },
      {
        step: 2,
        title: '고객 직접 연락',
        description:
          '고객에게 직접 전화하여 사유를 설명합니다. "판매자직접배송"으로 전환을 유도하면 쿠팡 무지성 반품도 회피 가능합니다.',
      },
      {
        step: 3,
        title: '출고 소요일 재설정',
        description:
          '향후 지연 방지를 위해 출고 소요일을 넉넉히 재설정합니다 (2~3일 권장). 단, 기존 주문에는 소급 적용되지 않습니다.',
      },
    ],
    requiredDocuments: [],
    commonMistakes: [
      '출고 소요일을 1일로 설정하여 지연 빈발',
      '품절 시 고객 취소 유도 없이 방치',
      '배송지연 안내만 보내고 고객 직접 연락을 하지 않음',
    ],
    proTips: [
      '초보 셀러는 출고 소요일을 여유 있게 2~3일로 설정하세요',
      '재고가 없으면 반드시 "판매중지" 처리 — 품절 주문 접수는 페널티 대상',
      '도매처 재고 확인 주기를 1일 1회 이상으로 설정',
      '폭설 등 자연재해 시에는 페널티 면제 공지가 별도 발송됩니다',
      '배송달력에서 휴무일을 설정하면 출고 소요일 계산에서 제외됩니다',
    ],
    deadline: '출고예정일 기준, 배송예정일 7일 초과 시 자동 페널티',
    contactInfo: [
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-blue-100 text-blue-700',
    severityColor: 'bg-yellow-500',
  },

  {
    id: 'cs_nonresponse',
    group: 'account_penalty',
    label: 'CS 미응답',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 15,
    shortDescription:
      '고객 문의에 24시간 내 응답하지 않아 페널티가 부과된 경우입니다.',
    detailedDescription:
      '24시간 내 답변율 95% 이상 유지가 필수입니다. 30일간 접수된 모든 문의를 기준으로 산정됩니다. 의미 없는 단답형 응답도 부실 응답으로 페널티 대상입니다.',
    responseSteps: [
      {
        step: 1,
        title: '미응답 문의 즉시 확인',
        description:
          'WING 판매자센터 > 고객응대 > 상품문의에서 미답변 문의를 확인합니다.',
      },
      {
        step: 2,
        title: '성의 있는 답변 작성',
        description:
          '단순 "확인하겠습니다"가 아닌, 고객 질문에 구체적으로 답변합니다. 부실 응답도 페널티 대상입니다.',
      },
      {
        step: 3,
        title: '모바일 앱 알림 설정',
        description:
          'WING 판매자센터 앱을 설치하여 실시간 푸시 알림을 활성화합니다. 주말/휴일에도 응대 체계를 유지하세요.',
      },
    ],
    requiredDocuments: [],
    commonMistakes: [
      '"확인하겠습니다" 등 의미 없는 단답형 응답 → 부실 응답 페널티',
      '주말/공휴일 응답 체계 부재',
      '문의 알림을 확인하지 않음',
    ],
    proTips: [
      'WING 판매자센터 앱으로 실시간 알림을 받으세요',
      '주말/공휴일에도 24시간 내 응답해야 합니다',
      '자주 묻는 질문에 대한 답변 템플릿을 미리 준비해 두세요',
      '24시간 내 답변율 95% 이상을 목표로 관리하세요',
    ],
    deadline: '문의 접수 후 24시간 이내 응답 필수',
    contactInfo: [
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-orange-100 text-orange-700',
    severityColor: 'bg-yellow-500',
  },

  {
    id: 'false_advertising',
    group: 'account_penalty',
    label: '허위/과장 광고',
    severity: 'high',
    severityLabel: '높음',
    scoreImpact: 25,
    shortDescription:
      '상품 설명이 실제와 다르거나, 과장 표현/불공정 키워드 사용으로 경고/페널티를 받은 경우입니다.',
    detailedDescription:
      '2024년 7월 쿠팡은 상품명 정책 위반 판매자에게 대규모 판매 중단 조치를 시행했습니다. "100% 천연 성분" 등 허위 표기, 과장된 효능/효과 표시, 타 브랜드명 키워드 도용 등이 해당됩니다.',
    responseSteps: [
      {
        step: 1,
        title: '위반 사유 정확히 확인',
        description: '쿠팡 안내 메일에서 정확한 위반 사유(허위 표기, 과장 표현, 불공정 키워드 등)를 확인합니다.',
      },
      {
        step: 2,
        title: '위반 상품 즉시 수정',
        description:
          '상품명, 상세페이지에서 문제가 된 표현을 삭제/수정합니다. 타 브랜드명이 포함된 키워드를 모두 제거합니다.',
      },
      {
        step: 3,
        title: '정확한 기준으로 재등록',
        description:
          '쿠팡의 상품 등록 기준에 맞춰 정확한 정보로 재등록하면 판매 재개가 가능합니다.',
      },
      {
        step: 4,
        title: '반복 시 개선계획서 제출',
        description: '반복 위반으로 계정 정지 시 개선계획서를 Word 파일로 작성하여 제출합니다.',
      },
    ],
    requiredDocuments: [
      { name: '수정 완료 캡처', description: '위반 내용 수정 전/후 비교 스크린샷', required: true },
      { name: '개선계획서 (반복 시)', description: 'Word 파일로 재발방지 계획 작성', required: false },
    ],
    commonMistakes: [
      '"최고", "최저", "1위" 등 비교 표현을 근거 없이 사용',
      '타 브랜드 이름을 검색 키워드에 포함',
      '과장된 효능/효과 표시 (건강기능식품 등)',
    ],
    proTips: [
      '상품 등록 시 금칙어 리스트를 미리 확인하세요',
      '"Highlight This" 등 브라우저 확장 프로그램으로 금칙어 필터링 가능',
      '2024년 7월 대규모 제재 이후 기준이 매우 엄격해졌습니다',
    ],
    deadline: '즉시 수정 필요, 반복 시 계정 정지',
    contactInfo: [
      { channel: '판매자 콜센터', value: '1600-9879' },
      { channel: '헬프센터', value: 'helpcenter.coupangcorp.com' },
    ],
    realCases: [],
    badgeColor: 'bg-purple-100 text-purple-700',
    severityColor: 'bg-red-500',
  },

  {
    id: 'product_info_mismatch',
    group: 'account_penalty',
    label: '상품 정보 불일치',
    severity: 'normal',
    severityLabel: '보통',
    scoreImpact: 15,
    shortDescription:
      '등록된 상품 정보가 실제 상품과 일치하지 않는 경우입니다.',
    detailedDescription:
      '단위 용량/개수 부정확, 카테고리 잘못 등록, 배송방법 어뷰징 등이 포함됩니다. 무재고 셀러는 실물을 직접 보지 않고 등록하므로 정보 불일치 발생 확률이 높습니다.',
    responseSteps: [
      {
        step: 1,
        title: '불일치 항목 확인',
        description: '쿠팡 안내에서 어떤 정보가 불일치하는지 확인합니다 (단위, 용량, 카테고리 등).',
      },
      {
        step: 2,
        title: '상품 정보 정확히 수정',
        description:
          'WING > 상품관리 > 상품조회/수정에서 실제 상품과 일치하도록 정보를 수정합니다.',
      },
      {
        step: 3,
        title: '전체 상품 점검',
        description:
          '다른 상품에도 동일 문제가 없는지 일괄 점검합니다. 카테고리, 단위, 배송방법을 중점 확인합니다.',
      },
    ],
    requiredDocuments: [],
    commonMistakes: [
      '도매처 정보를 검증 없이 그대로 복사하여 등록',
      '카테고리를 노출 목적으로 의도적으로 잘못 설정',
      '단위(개, 세트, g, ml)를 부정확하게 입력',
    ],
    proTips: [
      '도매처 상품 정보를 등록 전 반드시 실제 상품과 대조하세요',
      '검수용 엑셀 양식을 만들어 등록 전 체크리스트로 활용',
      '상표권 문제: 상표권자 측 신고 시 셀러 고의 여부 불문하고 즉시 판매 정지',
    ],
    deadline: '수정 즉시 판매 재개 가능',
    contactInfo: [
      { channel: '판매자 콜센터', value: '1600-9879' },
    ],
    realCases: [],
    badgeColor: 'bg-yellow-100 text-yellow-700',
    severityColor: 'bg-yellow-500',
  },

  {
    id: 'account_suspension',
    group: 'account_penalty',
    label: '계정 일시 정지',
    severity: 'critical',
    severityLabel: '긴급',
    scoreImpact: 50,
    shortDescription: '쿠팡 판매자 계정이 일시 정지(1개월)된 상태입니다.',
    detailedDescription:
      '주요 사유: 가품 판매, 반복적 약관 위반, 소비자 보호 정책 위반 등. 개선계획서를 Word(.docx)로 작성하여 소명 메일에 전체 회신해야 합니다. 정지 기간은 1개월이며, 기간 내 개선계획서를 준비해 정지 해제 즉시 제출합니다.',
    responseSteps: [
      {
        step: 1,
        title: '정확한 정지 사유 확인',
        description:
          '판매자센터(1577-7011) 또는 helpseller@coupang.com에 연락하여 상세 정지 사유를 확인합니다. 메일보다 전화 문의가 더 상세한 정보를 얻을 수 있습니다.',
      },
      {
        step: 2,
        title: '문제 상품 전수 조사 및 삭제',
        description:
          '위반 상품뿐 아니라 유사 위험이 있는 상품까지 전수 조사하여 삭제합니다. 구체적 숫자를 기록합니다 (예: "15개 삭제 완료, 추가 8개 검토 삭제").',
      },
      {
        step: 3,
        title: '개선계획서 작성 (Word 파일)',
        description:
          '반드시 Word(.docx) 파일로 3개 섹션 구성:\n\n[섹션1] 문제 발생의 근본 원인\n- 위반일자, 상품번호, 위반항목 + 판매 경위/침해 배경\n- 간결하게 솔직히 작성\n\n[섹션2] 현재 문제 해결 방안 및 조치 결과\n- 삭제 상품 수 등 구체적 숫자 + 판매중지 캡처\n- 증빙 PDF/엑셀 별도 첨부 (이미지 캡처 불가)\n\n[섹션3] 향후 예방 계획 3가지\n- 각각 완전히 다른 내용으로 작성\n- 각 방법마다 별도 엑셀/PDF 증빙 첨부',
      },
      {
        step: 4,
        title: 'IP 교육 수료증 확보',
        description:
          '국가지식재산교육포털(ipacademy.net)에서 "지식재산개론" 최소 10시간 이상 수료하고 수료증을 소명서에 첨부합니다 (시험 없음, 무료).',
      },
      {
        step: 5,
        title: '기존 쿠팡 메일에 답장으로 제출',
        description:
          '제목: [상점코드명] 소명서 재제출\n기존 쿠팡 안내 메일에 답장 형태로 발송합니다.\n검토 소요: 보통 3~7영업일',
        deadline: '정지 기간(1개월) 내 준비, 해제 즉시 발송',
      },
    ],
    requiredDocuments: [
      { name: '개선계획서 (Word 파일)', description: '3개 섹션 구성, .docx 형식 필수 (HWP 불가)', required: true },
      { name: '판매중지/삭제 증빙', description: 'WING에서 상품 삭제/판매중지 상태 PDF 또는 엑셀', required: true },
      { name: 'IP 교육 수료증', description: 'ipacademy.net 지식재산개론 수료증', required: true },
      { name: '검수용 엑셀 양식', description: '금칙어 필터링 리스트 등 예방 체계 증빙', required: true },
      { name: '변리사 의견서 (지재권 관련 시)', description: '상표/디자인 비침해 소견서', required: false },
    ],
    commonMistakes: [
      'HWP 파일로 작성 → 즉시 반려',
      '데이터/증빙 자료 부족 (구체적 숫자와 증거 필수)',
      '원인과 대책 간 논리적 불일치',
      '예방 계획 3가지를 비슷한 내용으로 작성 → 반려',
      '지재권 유형별로 분리하지 않고 통합 작성 → 반려',
      '감정적 표현/변명 위주 작성',
    ],
    proTips: [
      '정지 기간(1개월) 동안 개선계획서를 미리 완벽하게 준비',
      '파일명을 명확하게 설정 (예: [증거1] 상품삭제내역.pdf)',
      '첫 번째 거절 후 두 번째 제출이 "마지막 기회"일 수 있음',
      '전문 컨설팅 서비스 이용 시 소명 성공률 90% 이상 (크몽 등)',
      '소명서 작성 시 자신이 직접 작성한 입증 자료는 쿠팡에서 인정하지 않음 — 객관적 증빙 필수',
    ],
    deadline: '정지 기간 1개월 / 1년 내 경고 3회 → 영구정지',
    contactInfo: [
      { channel: '판매자센터', value: '1577-7011' },
      { channel: '판매자 이메일', value: 'helpseller@coupang.com' },
      { channel: '판매자 콜센터', value: '1600-9879 (365일 9:00-19:00)' },
      { channel: 'IP 교육', value: 'ipacademy.net' },
    ],
    realCases: [
      {
        title: '5차 시도 끝에 승인 (revertface 블로그)',
        result: 'success',
        summary:
          '1~4차 모두 반려. 5차에서 성공 포인트: 예방 방법 3가지를 완전히 다른 내용으로 + 각각 엑셀/PDF 별도 첨부 + IP 교육 수료증. 메일 제목: [상점코드명] 소명서 재제출, 기존 메일 답장 형태로 발송.',
      },
      {
        title: 'PDF 형식 의견서로 2개 계정 동시 해제',
        result: 'success',
        summary:
          '쿠팡 정책의 문제점을 체계적으로 기술한 PDF 의견서 제출 → 본 계정 + 2번째 계정 모두 정지 해제. 공식 소명 절차 외 성의 있는 소통이 영향.',
      },
    ],
    badgeColor: 'bg-red-100 text-red-700',
    severityColor: 'bg-red-600',
  },

  {
    id: 'account_permanent_ban',
    group: 'account_penalty',
    label: '계정 영구 정지',
    severity: 'critical',
    severityLabel: '긴급',
    scoreImpact: 100,
    shortDescription: '쿠팡 판매자 계정이 영구 정지된 최악의 상황입니다.',
    detailedDescription:
      '주요 사유: 1년 내 경고 3회 이상 누적, 가품 판매 확인, 반복적 약관 위반. 2025년 3월 24일부터 연관계정 제재가 시행되어, 정지된 판매자와 동일 전화번호/주소 사용 시 연관 계정도 자동 정지됩니다.',
    responseSteps: [
      {
        step: 1,
        title: '정확한 정지 사유 전화 확인',
        description:
          '판매자센터(1577-7011)에 전화하여 상세 사유를 확인합니다. 메일보다 전화가 더 상세한 정보를 얻을 수 있습니다.',
      },
      {
        step: 2,
        title: '침해 유형별 소명서 분리 작성',
        description:
          '상표권/디자인권/저작권 각각 별도로 소명서를 작성합니다.\n\n상표권: 진정상품 증명(공급계약서, 세금계산서, 통관신고서) 또는 상표 비유사성 주장\n저작권: 자체 제작 증명(PSD/AI 원본, EXIF 정보) 또는 라이선스 증빙\n디자인/특허: 변리사 비침해 소견서 필수',
      },
      {
        step: 3,
        title: '변리사 의견서 확보 (필수)',
        description:
          '영구 정지 시에는 변리사 소견서가 사실상 필수입니다. 쿠팡 제출 경험이 있는 변리사를 선택하세요.',
      },
      {
        step: 4,
        title: '개선계획서 제출',
        description:
          '계정 일시 정지와 동일한 3섹션 구조의 개선계획서를 Word로 작성합니다.\n\n중요: 첫 번째 거절 후 두 번째 제출이 "마지막 기회"입니다. 최대한 완벽하게 준비하세요.',
      },
      {
        step: 5,
        title: '복구 실패 시 대안 검토',
        description:
          '복구가 불가하다고 판단되면 네이버 스마트스토어 등 다른 플랫폼으로의 전환을 검토합니다.',
      },
    ],
    requiredDocuments: [
      { name: '개선계획서 (Word 파일)', description: '3개 섹션 구성, 지재권 유형별 분리 작성', required: true },
      { name: '변리사 비침해 소견서', description: '쿠팡 제출 경험 있는 변리사의 의견서', required: true },
      { name: '정품 증빙 (해당 시)', description: '공급계약서, 세금계산서, 통관신고서', required: false },
      { name: 'IP 교육 수료증', description: 'ipacademy.net 지식재산개론 수료증', required: true },
      { name: '전체 상품 삭제/점검 내역', description: 'PDF/엑셀로 삭제 내역 및 점검 결과 정리', required: true },
    ],
    commonMistakes: [
      '첫 번째 제출을 대충 작성 → 두 번째가 마지막 기회인데 첫 번째에서 소진',
      '변리사 없이 셀러 본인이 직접 비침해 주장 → 인정 불가',
      '연관계정 문제 간과 → 복수 계정 운영 시 전부 정지 위험',
      '감정적/변명 위주 작성',
    ],
    proTips: [
      '첫 번째 제출이 가장 중요 — 최대한 완벽하게 준비하세요',
      '연관계정 제재 주의: 동일 전화번호/주소 사용 시 연관 계정도 자동 정지 (2025.3.24~)',
      '복구에 매달리는 시간 vs 다른 플랫폼 투자 — 냉정하게 판단하세요',
      '소명 성공 시 스트라이크가 누적되지 않습니다',
      '전문 컨설팅 서비스 비용: 10~50만원 (크몽 등)',
    ],
    deadline: '영구 정지 — 소명 기회 1~2회',
    contactInfo: [
      { channel: '판매자센터', value: '1577-7011' },
      { channel: '판매자 이메일', value: 'helpseller@coupang.com' },
      { channel: '판매자 콜센터', value: '1600-9879 (365일 9:00-19:00)' },
    ],
    realCases: [
      {
        title: '10회 소명 실패 → 플랫폼 전환 성공 (ohline1998)',
        result: 'failure',
        summary:
          '5개 계정 전부 정지, 월 매출 1,500만원 소멸. 소명 10번 거절 후 네이버 스마트스토어로 전환 → 월 8,000만원 매출 달성. "안 되면 과감하게 버리자"',
      },
      {
        title: 'PDF 의견서로 영구정지 해제',
        result: 'success',
        summary:
          '쿠팡 정책 문제점을 체계적으로 기술한 PDF + 변리사 소견서 + IP 교육 수료증 제출 → 본 계정 + 연관 계정 모두 해제',
      },
    ],
    badgeColor: 'bg-gray-800 text-white',
    severityColor: 'bg-gray-800',
  },
];

// ── Helper functions ──

export function getGuideById(id: string): PenaltyGuide | undefined {
  return PENALTY_GUIDES.find((g) => g.id === id);
}

export function getGuidesByGroup(group: PenaltyGroup): PenaltyGuide[] {
  return PENALTY_GUIDES.filter((g) => g.group === group);
}

export function getSeverityColor(severity: SeverityLevel) {
  switch (severity) {
    case 'critical':
      return { bg: 'bg-red-600', text: 'text-white', badge: 'bg-red-100 text-red-700' };
    case 'high':
      return { bg: 'bg-orange-500', text: 'text-white', badge: 'bg-orange-100 text-orange-700' };
    case 'normal':
      return { bg: 'bg-yellow-500', text: 'text-white', badge: 'bg-yellow-100 text-yellow-700' };
  }
}

// API route 에서 사용할 유효 카테고리 목록
export const VALID_PENALTY_CATEGORIES = PENALTY_GUIDES.map((g) => g.id);

// 카테고리별 기본 점수
export const DEFAULT_SCORE_IMPACTS: Record<string, number> = Object.fromEntries(
  PENALTY_GUIDES.map((g) => [g.id, g.scoreImpact])
);
