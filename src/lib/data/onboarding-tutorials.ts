export interface TutorialSubStep {
  title: string;
  description: string;
  detailedInstructions: string[];
  externalLink?: { url: string; label: string };
  tip?: string;
  warning?: string;
}

export interface TutorialStepContent {
  stepKey: string;
  icon: string;
  tagline: string;
  overview: string;
  estimatedTotalTime: string;
  subSteps: TutorialSubStep[];
  completionMessage: string;
}

export const TUTORIAL_CONTENT: TutorialStepContent[] = [
  // ── Step 1: 오리엔테이션 영상 ──
  {
    stepKey: 'orientation_video',
    icon: '🎬',
    tagline: '시작이 반! 먼저 영상을 봐요',
    overview: '쿠팡 셀러 활동이 어떤 건지 쉽게 알려드리는 영상이에요. 편하게 시청해주세요!',
    estimatedTotalTime: '약 10분',
    subSteps: [
      {
        title: '안내 영상 시청하기',
        description: '쿠팡 셀러 활동에 대한 기본 안내 영상을 시청해주세요.',
        detailedInstructions: [
          '아래 영상을 끝까지 시청해주세요.',
          '영상에서 전체 과정의 흐름을 설명해드립니다.',
          '메모할 필요 없어요. 나중에 다시 볼 수 있습니다.',
        ],
        tip: '영상은 약 5~10분 분량이에요. Wi-Fi 환경에서 시청하시는 걸 추천해요!',
      },
      {
        title: '시청 완료 확인',
        description: '영상을 끝까지 보셨다면 확인 버튼을 눌러주세요.',
        detailedInstructions: [
          '영상 시청을 마치셨으면 아래 "확인 완료" 버튼을 눌러주세요.',
          '다음 단계로 넘어갈 수 있어요!',
        ],
      },
    ],
    completionMessage: '영상 시청 완료! 이제 본격적으로 시작해볼까요?',
  },

  // ── Step 2: 사업자등록 ──
  {
    stepKey: 'business_registration',
    icon: '📋',
    tagline: '사업자등록, 토스에서 무료로!',
    overview: '온라인 판매를 하려면 사업자등록이 필요해요. 토스에서 무료로 간편하게 신청할 수 있어요!',
    estimatedTotalTime: '신청 10분 + 발급 1~3일',
    subSteps: [
      {
        title: '사업자등록이란?',
        description: '온라인에서 물건을 판매하려면 국세청에 사업자로 등록해야 해요.',
        detailedInstructions: [
          '사업자등록은 "나는 사업을 합니다"라고 국가에 알리는 거예요.',
          '쿠팡에 입점하려면 반드시 필요합니다.',
          '개인사업자로 등록하면 되고, 법인을 만들 필요는 없어요.',
          '비용은 무료! 토스에서 대행해주면 더 간편해요.',
        ],
        tip: '이미 사업자등록증이 있다면 이 단계를 건너뛰고 바로 업로드해도 돼요!',
      },
      {
        title: '토스에서 무료로 신청하기',
        description: '토스 사업자등록 페이지에 접속해서 신청을 시작해요.',
        detailedInstructions: [
          '아래 버튼을 눌러 토스 사업자등록 페이지로 이동하세요.',
          '"무료로 사업자등록 시작하기" 버튼을 클릭하세요.',
          '토스 로그인 (또는 회원가입) 후 안내에 따라 진행하세요.',
          '중간에 막히더라도 걱정 마세요. 토스 고객센터가 도와줍니다!',
        ],
        externalLink: {
          url: 'https://onboarding.tosspayments.com/business-registration/intro',
          label: '토스에서 사업자등록 신청하기',
        },
      },
      {
        title: '필요한 정보 준비하기',
        description: '신청 시 필요한 서류와 정보를 미리 준비해두세요.',
        detailedInstructions: [
          '공동인증서 (구 공인인증서) — 은행에서 무료 발급 가능',
          '임대사업장인 경우: 임대차계약서 사본',
          '자택 사업장인 경우: 별도 서류 불필요',
          '본인 명의 휴대폰 (본인인증용)',
        ],
        tip: '자택을 사업장 주소로 등록해도 괜찮아요. 대부분의 온라인 셀러가 그렇게 해요!',
      },
      {
        title: '업종 선택하기',
        description: '사업자등록 시 업종을 선택하는 화면이 나와요.',
        detailedInstructions: [
          '업태: "소매업" 선택',
          '종목: "전자상거래 소매업" 또는 "통신판매업" 선택',
          '과세유형: "간이과세자" 선택 (연매출 8,000만원 이하)',
          '토스에서 안내해주니까 그대로 따라하면 돼요!',
        ],
        warning: '간이과세자를 선택하세요! 일반과세자보다 세금이 훨씬 적어요.',
      },
      {
        title: '등록증 발급 후 업로드',
        description: '사업자등록증이 발급되면 여기에 업로드해주세요.',
        detailedInstructions: [
          '신청 후 1~3 영업일 내에 사업자등록증이 발급돼요.',
          '토스 앱 또는 이메일로 알림을 받을 수 있어요.',
          '발급된 사업자등록증을 사진 찍거나 PDF로 저장하세요.',
          '아래 업로드 버튼을 눌러 파일을 제출해주세요!',
        ],
        tip: '사업자등록증은 나중에도 필요하니 사진을 잘 보관해두세요!',
      },
    ],
    completionMessage: '사업자등록 완료! 이제 진짜 사장님이에요!',
  },

  // ── Step 3: 통신판매업 신고 ──
  {
    stepKey: 'online_sales_report',
    icon: '📝',
    tagline: '온라인 판매의 필수 신고!',
    overview: '인터넷으로 물건을 팔려면 통신판매업 신고가 필요해요. 토스에서 역시 무료로 가능!',
    estimatedTotalTime: '신청 5분 + 발급 1~3일',
    subSteps: [
      {
        title: '통신판매업 신고란?',
        description: '온라인으로 상품을 판매하기 위해 반드시 해야 하는 신고예요.',
        detailedInstructions: [
          '통신판매업 신고는 "온라인으로 물건을 팔겠습니다"라고 관할 구청에 알리는 거예요.',
          '사업자등록과는 별개로, 온라인 판매를 위해 추가로 필요한 절차예요.',
          '쿠팡 입점 시 반드시 필요합니다.',
          '미신고 시 과태료가 부과될 수 있으니 꼭 하세요!',
        ],
        tip: '사업자등록 다음에 바로 하는 게 좋아요. 순서를 지켜주세요!',
      },
      {
        title: '토스에서 무료 신청하기',
        description: '토스 통신판매업 신고 페이지에서 간편하게 신청하세요.',
        detailedInstructions: [
          '아래 버튼을 눌러 토스 통신판매업 신고 페이지로 이동하세요.',
          '사업자등록 때 만든 토스 계정으로 로그인하세요.',
          '안내에 따라 정보를 입력하면 끝!',
          '사업자등록증이 필요하니 미리 준비해두세요.',
        ],
        externalLink: {
          url: 'https://onboarding.tosspayments.com/mail-order-business/intro',
          label: '토스에서 통신판매업 신고하기',
        },
      },
      {
        title: '신고 시 참고사항',
        description: '신고에 필요한 정보와 비용을 알아두세요.',
        detailedInstructions: [
          '필요 서류: 사업자등록증 사본',
          '처리 기간: 1~3 영업일 소요',
          '면허세: 약 12,000원 ~ 45,000원 (지역에 따라 다름)',
          '면허세는 매년 1월에 납부해야 해요 (자동이체 가능)',
        ],
        warning: '면허세가 발생해요! 지역에 따라 12,000~45,000원이에요. 연 1회 납부합니다.',
      },
      {
        title: '신고증 발급 후 업로드',
        description: '통신판매업 신고증이 발급되면 여기에 업로드해주세요.',
        detailedInstructions: [
          '신청 후 1~3 영업일 내에 신고증이 발급돼요.',
          '정부24(gov.kr) 또는 토스에서 확인할 수 있어요.',
          '발급된 신고증을 사진 찍거나 PDF로 저장하세요.',
          '아래 업로드 버튼을 눌러 파일을 제출해주세요!',
        ],
        tip: '통신판매업 신고증도 나중에 쿠팡 가입할 때 필요해요. 잘 보관하세요!',
      },
    ],
    completionMessage: '통신판매업 신고 완료! 이제 합법적으로 온라인 판매가 가능해요!',
  },

  // ── Step 4: 쿠팡 입점 회원가입 ── ★ 가장 상세
  {
    stepKey: 'coupang_seller_signup',
    icon: '🛒',
    tagline: '드디어 쿠팡에 입점해요!',
    overview: '사업자등록과 통신판매업 신고가 끝났으니, 이제 쿠팡 판매자센터(Wing)에 가입할 차례예요!',
    estimatedTotalTime: '가입 15분 + 승인 1~3일',
    subSteps: [
      {
        title: '쿠팡 판매자센터 접속',
        description: '쿠팡 Wing(판매자센터) 사이트에 접속하세요.',
        detailedInstructions: [
          '아래 버튼을 눌러 쿠팡 Wing 사이트로 이동하세요.',
          '처음 방문이라면 화면 중앙의 "회원가입" 버튼이 보일 거예요.',
          '이미 계정이 있다면 로그인해주세요.',
        ],
        externalLink: {
          url: 'https://wing.coupang.com',
          label: '쿠팡 Wing 바로가기',
        },
      },
      {
        title: '판매자 회원가입 클릭',
        description: '쿠팡 Wing 메인 페이지에서 회원가입을 시작하세요.',
        detailedInstructions: [
          '쿠팡 Wing 메인 페이지에서 "판매자 회원가입" 버튼을 클릭하세요.',
          '"입점 신청" 또는 "판매 시작하기" 버튼일 수도 있어요.',
          '일반 쿠팡 쇼핑 회원이 아닌 "판매자" 회원가입이에요!',
        ],
        warning: '일반 쿠팡 로그인이 아닌 "판매자 회원가입"을 눌러야 해요!',
      },
      {
        title: '회원 정보 입력',
        description: '기본 회원 정보를 입력하세요.',
        detailedInstructions: [
          '이메일 주소 입력 (자주 쓰는 이메일 추천)',
          '비밀번호 설정 (영문+숫자+특수문자 조합)',
          '이름 입력 (실명)',
          '휴대폰 번호 입력 후 인증번호 확인',
        ],
        tip: '이메일은 쿠팡에서 중요한 알림을 보내니, 자주 확인하는 이메일을 사용하세요!',
      },
      {
        title: '약관 동의하고 가입하기',
        description: '이용약관에 동의하고 가입을 완료하세요.',
        detailedInstructions: [
          '판매자 이용약관을 확인하세요.',
          '"전체 동의" 체크박스를 클릭하면 편해요.',
          '"가입하기" 버튼을 클릭하면 기본 회원가입이 완료돼요.',
        ],
      },
      {
        title: '사업자 인증하기',
        description: '가입 후 사업자 정보를 입력하고 인증하세요.',
        detailedInstructions: [
          '사업자등록번호 입력 (사업자등록증에 있는 10자리 번호)',
          '사업장 주소 입력',
          '비즈니스 형태: "위탁판매" 선택',
          '대표자명, 업종 등 기본 정보 입력',
        ],
        warning: '비즈니스 형태에서 반드시 "위탁판매"를 선택하세요!',
      },
      {
        title: '서류 첨부하기',
        description: '필요한 서류를 업로드하세요.',
        detailedInstructions: [
          '사업자등록증 사본 업로드 (2단계에서 발급받은 것)',
          '통신판매업 신고증 사본 업로드 (3단계에서 발급받은 것)',
          '통장 사본 업로드 (정산금 받을 통장)',
          '파일 형식: JPG 또는 PNG만 가능해요!',
        ],
        warning: 'PDF는 안 돼요! 반드시 JPG 또는 PNG 이미지 파일로 업로드하세요.',
        tip: '서류 사진을 찍을 때 글씨가 잘 보이게 밝은 곳에서 찍어주세요.',
      },
      {
        title: '승인 대기',
        description: '쿠팡에서 서류를 검토하는 시간이 필요해요.',
        detailedInstructions: [
          '서류 제출 후 쿠팡에서 검토해요.',
          '보통 1~3 영업일이 소요됩니다.',
          '승인되면 이메일 또는 문자로 알림이 와요.',
          '혹시 반려되면 사유를 확인하고 수정해서 다시 제출하면 돼요.',
        ],
        tip: '주말, 공휴일은 영업일에 포함되지 않아요. 금요일에 신청하면 다음 주에 승인돼요!',
      },
      {
        title: '가입 완료 화면 캡처 후 업로드',
        description: '쿠팡 승인 완료 화면을 캡처해서 업로드해주세요.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인해서 승인 완료 상태를 확인하세요.',
          '판매자 대시보드가 정상적으로 보이면 성공이에요!',
          '화면을 캡처 (스크린샷) 하세요.',
          '아래 업로드 버튼을 눌러 파일을 제출해주세요!',
        ],
      },
    ],
    completionMessage: '쿠팡 셀러 가입 완료! 이제 진짜 쿠팡 판매자에요!',
  },

  // ── Step 5: 쿠팡 Wing 연동 ──
  {
    stepKey: 'coupang_wing_integration',
    icon: '⚙️',
    tagline: 'Wing 설정으로 마무리!',
    overview: '쿠팡 Wing에서 배송/반품 주소 등 기본 설정을 완료하세요.',
    estimatedTotalTime: '약 15분',
    subSteps: [
      {
        title: 'Wing 로그인',
        description: '쿠팡 Wing에 로그인하세요.',
        detailedInstructions: [
          '아래 버튼을 눌러 쿠팡 Wing에 접속하세요.',
          '4단계에서 만든 계정으로 로그인하세요.',
          '판매자 대시보드가 보이면 성공!',
        ],
        externalLink: {
          url: 'https://wing.coupang.com',
          label: '쿠팡 Wing 로그인',
        },
      },
      {
        title: '판매자 정보 설정',
        description: '판매자 정보 메뉴에서 주소록/배송정보를 관리하세요.',
        detailedInstructions: [
          '좌측 메뉴에서 "판매자 정보" 클릭',
          '"주소록/배송정보 관리" 메뉴를 찾으세요.',
          '이곳에서 출고지와 반품지 주소를 등록해요.',
        ],
      },
      {
        title: '출고지 주소 등록',
        description: '상품을 보낼 출고지(사업장) 주소를 등록하세요.',
        detailedInstructions: [
          '"출고지 추가" 버튼을 클릭하세요.',
          '사업장 주소를 입력하세요 (사업자등록증에 적힌 주소).',
          '연락처(휴대폰 번호)를 입력하세요.',
          '"저장" 버튼을 클릭하면 완료!',
        ],
        tip: '자택이 사업장이면 자택 주소를 입력하면 돼요.',
      },
      {
        title: '반품지 주소 등록',
        description: '고객이 반품할 때 보낼 반품지 주소를 등록하세요.',
        detailedInstructions: [
          '"반품지 추가" 버튼을 클릭하세요.',
          '반품 받을 주소를 입력하세요 (보통 출고지와 같은 주소).',
          '연락처를 입력하세요.',
          '"저장" 버튼을 클릭하세요.',
        ],
        tip: '출고지와 같은 주소로 설정해도 괜찮아요!',
      },
      {
        title: '추가 판매 정보 설정',
        description: '해외직구 셀러라면 추가 설정이 필요해요.',
        detailedInstructions: [
          '"판매자 정보" → "추가판매정보" 메뉴를 확인하세요.',
          '해외직구 상품을 판매할 경우 추가 정보를 입력해야 해요.',
          '국내 상품만 판매한다면 건너뛰어도 괜찮습니다.',
        ],
        tip: '처음에는 국내 상품부터 시작하는 걸 추천해요!',
      },
      {
        title: '설정 완료 화면 캡처 후 업로드',
        description: 'Wing 설정이 완료된 화면을 캡처해서 업로드하세요.',
        detailedInstructions: [
          '주소록/배송정보 관리 페이지에서 출고지와 반품지가 등록된 화면을 캡처하세요.',
          '또는 판매자 정보 요약 페이지를 캡처해도 돼요.',
          '아래 업로드 버튼을 눌러 파일을 제출해주세요!',
        ],
      },
    ],
    completionMessage: 'Wing 설정 완료! 이제 상품을 등록할 준비가 됐어요!',
  },

  // ── Step 6: 첫 상품 등록 ──
  {
    stepKey: 'first_product_listing',
    icon: '📦',
    tagline: '드디어 첫 상품을 올려요!',
    overview: '쿠팡 Wing에서 첫 번째 상품을 등록해보세요. 생각보다 쉬워요!',
    estimatedTotalTime: '약 20분',
    subSteps: [
      {
        title: '상품등록 메뉴 접속',
        description: '쿠팡 Wing에서 상품등록 메뉴로 이동하세요.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인하세요.',
          '좌측 메뉴에서 "상품관리" → "상품등록"을 클릭하세요.',
          '"새 상품 등록" 또는 "상품 등록하기" 버튼을 클릭하세요.',
        ],
        externalLink: {
          url: 'https://wing.coupang.com',
          label: '쿠팡 Wing 바로가기',
        },
      },
      {
        title: '상품 정보 입력',
        description: '카테고리, 상품명, 가격 등 기본 정보를 입력하세요.',
        detailedInstructions: [
          '카테고리 선택: 판매할 상품에 맞는 카테고리를 찾아 선택하세요.',
          '상품명 입력: 검색에 잘 걸리도록 키워드를 포함해서 작성하세요.',
          '판매가격 입력: 경쟁 상품을 참고해서 설정하세요.',
          '상품 이미지 업로드: 깔끔하고 밝은 사진을 사용하세요.',
          '상품 상세 설명: 구매자가 궁금해할 정보를 자세히 적어주세요.',
        ],
        tip: '처음에는 연습 삼아 간단한 상품부터 등록해보세요!',
      },
      {
        title: '판매 요청 클릭',
        description: '모든 정보를 입력한 후 판매 요청을 클릭하세요.',
        detailedInstructions: [
          '입력한 정보를 한번 더 확인하세요.',
          '"판매 요청" 또는 "상품 등록" 버튼을 클릭하세요.',
          '쿠팡에서 상품을 검토한 후 승인되면 판매가 시작돼요!',
        ],
      },
      {
        title: '등록 완료 화면 캡처 후 업로드',
        description: '상품 등록 완료 화면을 캡처해서 업로드하세요.',
        detailedInstructions: [
          '"상품 등록이 완료되었습니다" 또는 상품 목록에 등록된 상품이 보이는 화면을 캡처하세요.',
          '아래 업로드 버튼을 눌러 파일을 제출해주세요!',
          '축하해요! 첫 상품 등록을 해냈어요!',
        ],
      },
    ],
    completionMessage: '첫 상품 등록 완료! 판매가 시작되면 매출이 들어올 거예요!',
  },

  // ── Step 7: 계약서 서명 (자동 연동) ──
  {
    stepKey: 'contract_signing',
    icon: '✍️',
    tagline: '계약서 서명으로 공식 시작!',
    overview: '관리자가 보내드리는 계약서에 서명하면 자동으로 완료됩니다.',
    estimatedTotalTime: '자동 연동',
    subSteps: [],
    completionMessage: '계약서 서명 완료!',
  },

  // ── Step 8: 첫 매출 보고 (자동 연동) ──
  {
    stepKey: 'first_revenue_report',
    icon: '💰',
    tagline: '첫 매출을 보고해요!',
    overview: '첫 매출 보고를 제출하면 자동으로 완료됩니다. 대시보드에서 매출 보고를 작성해주세요.',
    estimatedTotalTime: '자동 연동',
    subSteps: [],
    completionMessage: '첫 매출 보고 완료! 쿠팡 셀러 마스터가 되셨어요!',
  },
];

export function getTutorialForStep(stepKey: string): TutorialStepContent | undefined {
  return TUTORIAL_CONTENT.find((t) => t.stepKey === stepKey);
}
