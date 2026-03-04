// ── 인터페이스 ──

export interface GuideCopyableTemplate {
  label: string;
  text: string;
}

export interface GuideStepImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface GuideStep {
  title: string;
  description: string;
  detailedInstructions: string[];
  images?: GuideStepImage[];
  externalLink?: { url: string; label: string };
  tip?: string;
  warning?: string;
  copyableTemplates?: GuideCopyableTemplate[];
}

export interface GuideFAQ {
  question: string;
  answer: string;
}

export interface GuideArticle {
  articleId: string;
  categoryId: string;
  title: string;
  subtitle: string;
  icon: string;
  estimatedTime: string;
  overview: string;
  steps: GuideStep[];
  faqs: GuideFAQ[];
  relatedArticleIds: string[];
}

export interface GuideCategory {
  categoryId: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  color: string;
}

// ── 카테고리 (6개) ──

export const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    categoryId: 'getting-started',
    title: '시작하기',
    description: '쿠팡 셀러 활동을 위한 첫걸음',
    icon: '🚀',
    order: 1,
    color: 'bg-blue-50',
  },
  {
    categoryId: 'qualifications',
    title: '자격/인증',
    description: '판매에 필요한 자격증과 인증 취득 방법',
    icon: '📋',
    order: 2,
    color: 'bg-green-50',
  },
  {
    categoryId: 'orders-shipping',
    title: '주문/배송',
    description: '주문 접수부터 배송 완료까지',
    icon: '📦',
    order: 3,
    color: 'bg-purple-50',
  },
  {
    categoryId: 'returns-cs',
    title: '반품/CS',
    description: '반품 처리와 고객 응대 노하우',
    icon: '🔄',
    order: 4,
    color: 'bg-orange-50',
  },
  {
    categoryId: 'legal-ip',
    title: '법률/권리',
    description: '지식재산권 및 법적 이슈 대응',
    icon: '⚖️',
    order: 5,
    color: 'bg-red-50',
  },
  {
    categoryId: 'revenue-settlement',
    title: '매출/정산',
    description: '정산 구조 이해와 세금 신고 방법',
    icon: '💰',
    order: 6,
    color: 'bg-yellow-50',
  },
  {
    categoryId: 'account-management',
    title: '계정관리',
    description: '판매자 등급 관리와 페널티 방지',
    icon: '👤',
    order: 7,
    color: 'bg-indigo-50',
  },
  {
    categoryId: 'extra-benefits',
    title: '부가 혜택',
    description: '쇼핑 적립, 카드 혜택, 리뷰 수익으로 추가 수입 올리기',
    icon: '🎁',
    order: 8,
    color: 'bg-pink-50',
  },
  {
    categoryId: 'advertising',
    title: '광고/마케팅',
    description: '쿠팡 광고 운영과 상품 최적화 전략',
    icon: '📢',
    order: 9,
    color: 'bg-teal-50',
  },
];

// ── 가이드 콘텐츠 (26개) ──

export const GUIDE_ARTICLES: GuideArticle[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━
  // 1. 시작하기 - 쿠팡 API 연동 방법
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-api-setup',
    categoryId: 'getting-started',
    title: '쿠팡 API 연동 방법',
    subtitle: 'Wing에서 API 키를 발급받고 프로그램과 연동하세요',
    icon: '🔑',
    estimatedTime: '약 15분',
    overview:
      '쿠팡 Wing에서 OPEN API 키(업체코드, Access Key, Secret Key)를 발급받고, 우리 프로그램에 입력하여 자동 연동하는 방법을 알려드려요. 한 번만 설정하면 주문·송장·재고가 자동으로 연동됩니다.',
    steps: [
      {
        title: '쿠팡 Wing 로그인',
        description: '쿠팡 Wing 사이트에 접속하여 셀러 계정으로 로그인합니다.',
        detailedInstructions: [
          '아래 버튼을 클릭하여 쿠팡 Wing에 접속하세요.',
          '셀러 아이디와 비밀번호를 입력하고 로그인합니다.',
          '처음 접속하시는 분은 쿠팡 셀러 가입이 먼저 필요해요.',
          '사업자 인증이 완료된 계정이어야 API 키를 발급받을 수 있어요.',
        ],
        images: [
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_01.png', alt: '쿠팡 Wing 로그인 화면', caption: '쿠팡 Wing 로그인 페이지' },
        ],
        externalLink: { url: 'https://wing.coupang.com', label: '쿠팡 Wing 바로가기' },
        tip: '쿠팡 Wing은 PC에서만 정상 동작해요. 모바일 브라우저에서는 일부 기능이 안 될 수 있어요.',
      },
      {
        title: 'OPEN API 페이지 이동',
        description: '마이페이지에서 OPEN API 키 발급 메뉴로 이동합니다.',
        detailedInstructions: [
          '로그인 후 우측 상단의 사용자 이름(내 계정)을 클릭하세요.',
          '"마이페이지"를 클릭하세요.',
          '"추가판매정보" 항목을 찾아 클릭하세요.',
          '페이지 하단의 "OPEN API 키 발급" 섹션이 보이면 성공!',
        ],
        images: [
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_02.png', alt: '마이페이지 추가판매정보 메뉴', caption: '마이페이지 > 추가판매정보 메뉴 위치' },
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_03.png', alt: 'OPEN API 키 발급 메뉴', caption: '하단의 "OPEN API 키 발급" 섹션' },
        ],
        tip: '판매자 유형에 따라 메뉴 위치가 다를 수 있어요. "추가판매정보"에서 안 보이면 왼쪽 메뉴 "판매자 정보" 아래에서 찾아보세요.',
      },
      {
        title: 'API 키 신규 발급',
        description: '새로운 OPEN API Key를 발급받습니다.',
        detailedInstructions: [
          '"API Key 발급 받기" 버튼을 클릭하세요.',
          '팝업 창에서 "OPEN API"를 선택하고 확인을 누르세요.',
          '발급이 완료되면 3가지 값이 화면에 표시됩니다:',
          '① 업체코드 (Vendor Code) ② Access Key ③ Secret Key',
        ],
        images: [
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_04.png', alt: 'API 키 사용 목적 선택', caption: '"OPEN API" 선택 화면' },
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_06.png', alt: '연동 업체 선택 화면', caption: '연동 업체 선택 / 자체개발 입력' },
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_07.png', alt: 'API 키 발급 완료', caption: 'API 키 발급 완료 팝업' },
        ],
        warning: 'Secret Key는 발급 직후에만 확인할 수 있어요! 반드시 바로 복사해두세요. 또한 Secret Key는 최대 6개월 유효하므로 만료 시 재발급이 필요해요.',
      },
      {
        title: 'API Key 복사하기',
        description: '발급된 업체코드, Access Key, Secret Key를 모두 복사합니다.',
        detailedInstructions: [
          '업체코드 옆의 "복사" 버튼을 클릭하여 메모장에 저장하세요.',
          'Access Key도 같은 방법으로 복사해주세요.',
          'Secret Key도 반드시 복사해주세요 (이 화면을 나가면 다시 볼 수 없어요!).',
          '세 가지 값 모두 복사했는지 다시 한 번 확인!',
        ],
        images: [
          { src: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_08.png', alt: '발급된 OPEN API KEY 확인 화면', caption: '업체코드 / Access Key / Secret Key 확인' },
        ],
        tip: '이미 다른 서비스(사방넷, 이지어드민 등)에서 API 키를 사용 중이면 추가 발급이 안 될 수 있어요. 기존 연동 서비스를 확인해주세요.',
      },
      {
        title: '프로그램에 API Key 입력',
        description: '복사한 키를 우리 프로그램 설정에 입력합니다.',
        detailedInstructions: [
          '우리 프로그램의 "계정 설정" 페이지로 이동하세요.',
          '"쿠팡 API 연동" 섹션을 찾아주세요.',
          'Access Key 입력란에 복사한 Access Key를 붙여넣으세요.',
          'Secret Key 입력란에 복사한 Secret Key를 붙여넣으세요.',
          '"저장" 버튼을 클릭하세요.',
        ],
      },
      {
        title: '연동 테스트',
        description: '키가 올바르게 입력되었는지 테스트합니다.',
        detailedInstructions: [
          '"연동 테스트" 버튼을 클릭하세요.',
          '"연동 성공" 메시지가 나오면 완료!',
          '만약 실패 메시지가 나오면 키를 다시 확인해주세요.',
        ],
        tip: '테스트에 실패하면 키를 복사할 때 앞뒤에 공백이 포함되지 않았는지 확인해보세요.',
      },
      {
        title: '연동 완료 확인',
        description: '모든 설정이 정상적으로 완료되었는지 최종 확인합니다.',
        detailedInstructions: [
          '대시보드로 돌아가서 쿠팡 연동 상태가 "연동됨"으로 표시되는지 확인하세요.',
          '주문 목록에 쿠팡 주문이 자동으로 불러와지면 성공!',
          '이제 주문·송장 처리를 자동으로 할 수 있어요.',
        ],
      },
    ],
    faqs: [
      {
        question: 'API Key를 잃어버리면 어떻게 하나요?',
        answer:
          'Access Key는 Wing 마이페이지 > 추가판매정보에서 다시 확인할 수 있어요. 하지만 Secret Key는 재발급이 필요합니다. 기존 키를 삭제하고 새로 발급받으세요.',
      },
      {
        question: 'Secret Key 유효기간이 만료됐어요.',
        answer: 'Secret Key는 최대 6개월 유효해요. 만료되면 Wing에서 기존 키를 삭제하고 새로 발급받은 후, 프로그램 설정에서도 업데이트해주세요.',
      },
      {
        question: '연동 테스트에서 계속 실패해요.',
        answer:
          '① 키 앞뒤에 공백이 없는지 확인, ② Access Key와 Secret Key가 바뀌지 않았는지 확인, ③ Wing에서 키 상태가 "활성"인지 확인, ④ 다른 서비스에서 이미 키를 사용 중이 아닌지 확인해보세요.',
      },
    ],
    relatedArticleIds: ['coupang-invoice', 'coupang-settlement', 'product-photography'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 2. 자격/인증 - 건기식 수료증 취득
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'health-supplement-cert',
    categoryId: 'qualifications',
    title: '건기식 수료증 취득',
    subtitle: '건강기능식품 판매를 위한 필수 교육 이수 방법',
    icon: '🏥',
    estimatedTime: '교육 약 2시간 + 시험',
    overview:
      '건강기능식품을 온라인에서 판매하려면 한국건강기능식품협회 교육센터에서 위생교육(약 2시간)을 이수하고 수료증을 받아야 해요. 온라인으로 교육받고 시험까지 볼 수 있어서 집에서 편하게 할 수 있어요!',
    steps: [
      {
        title: '한국건강기능식품협회 교육센터 접속',
        description: '교육 신청을 위해 건기식협회 교육센터 사이트에 접속합니다.',
        detailedInstructions: [
          '아래 버튼을 클릭하여 한국건강기능식품협회 교육센터에 접속하세요.',
          '회원가입이 안 되어 있다면 먼저 회원가입을 진행해주세요.',
          '실명인증이 필요하니 본인 명의 휴대폰을 준비해주세요.',
          '문의 전화: 1661-2371',
        ],
        images: [
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_1.jpg', alt: '교육센터 교육신청 버튼', caption: 'STEP 1 - 교육신청 버튼 위치' },
        ],
        externalLink: { url: 'https://edu.khff.or.kr', label: '건기식 교육센터 바로가기' },
      },
      {
        title: '교육 과정 선택',
        description: '건강기능식품 일반판매업 신규 교육 과정을 찾아 신청합니다.',
        detailedInstructions: [
          '로그인 후 "법정교육" 메뉴를 클릭하세요.',
          '"신규" 교육을 선택하세요 (처음 받는 분은 신규, 갱신은 "보수").',
          '"일반판매업" 과정을 선택하세요 (온라인 셀러는 이 과정이에요).',
          '정보를 확인하고 "신청하기"를 클릭하세요.',
        ],
        images: [
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_2.jpg', alt: '신규 교육 선택 화면', caption: 'STEP 2 - 신규 교육 과정 선택' },
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_3.jpg', alt: '교육안내 및 신청', caption: 'STEP 3 - 교육안내 확인 후 신청' },
        ],
        tip: '교육은 연중 상시 수강 가능해요. 원하는 때에 신청하시면 됩니다.',
      },
      {
        title: '교육비 결제',
        description: '온라인 교육 수강료를 결제합니다.',
        detailedInstructions: [
          '교육비는 약 2만원이에요 (변동될 수 있음).',
          '카드결제 또는 계좌이체 중 선택하세요.',
          '결제 완료 후 바로 수강할 수 있어요.',
        ],
        images: [
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_9.jpg', alt: '결제 방법 선택 화면', caption: '결제 방법 선택 화면' },
        ],
      },
      {
        title: '온라인 교육 수강',
        description: '동영상 강의를 시청하며 교육을 이수합니다.',
        detailedInstructions: [
          '교육 목록에서 "수강하기" 버튼을 클릭하세요.',
          '총 약 2시간 분량의 동영상 강의를 시청합니다.',
          '각 차시를 순서대로 끝까지 들어야 다음 차시가 열려요.',
          '중간에 멈춰도 이어서 들을 수 있어요.',
        ],
        tip: '2시간이면 한 번에 끝낼 수 있어요! 집중해서 들으면 시험도 쉬워요.',
        warning: '영상을 빨리 감기하면 수강 인정이 안 될 수 있어요. 정상 속도로 재생해주세요.',
      },
      {
        title: '최종평가(시험) 응시',
        description: '교육 수강 완료 후 최종평가를 봅니다.',
        detailedInstructions: [
          '모든 차시 수강 완료 후 "최종평가" 버튼이 활성화됩니다.',
          '시험은 O/X(참/거짓) 5문항이에요. 각 문항 20점!',
          '60점 이상(3문제 이상 정답)이면 합격!',
          '불합격 시 재시험이 가능하니 부담 없이 응시하세요.',
        ],
        tip: '교육 내용을 잘 들으셨다면 매우 쉬워요. O/X 5문제라 금방 끝나요!',
      },
      {
        title: '수료증 발급',
        description: '시험 합격 후 수료증을 다운로드합니다.',
        detailedInstructions: [
          '합격 확인 후 "수료증 출력" 버튼을 클릭하세요.',
          'PDF 파일로 다운로드하세요.',
          '출력해서 보관하시면 더 좋아요.',
          '수료증은 발급일로부터 2년 이내에 영업신고를 해야 유효해요.',
        ],
        images: [
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_8.jpg', alt: '수료증 확인 화면', caption: '수료증 발급 확인' },
          { src: 'https://edu.khff.or.kr/assets/images/user/guide/guide_22_1_11.jpg', alt: '교육 완료 화면', caption: '교육 이수 완료' },
        ],
      },
      {
        title: '영업신고증 발급',
        description: '수료증을 가지고 관할 시/군/구청 또는 정부24에서 영업신고를 합니다.',
        detailedInstructions: [
          '관할 시/군/구청에 방문하거나 정부24에서 온라인 신청하세요.',
          '온라인 신청 수수료: 25,000원 / 방문 신청: 28,000원',
          '필요 서류: 수료증, 사업자등록증 사본, 신분증, 임대차계약서',
          '건강기능식품 판매업 영업신고서를 작성하세요.',
          '신고 완료까지 약 3일 소요, 영업신고증을 발급받으세요.',
        ],
        externalLink: { url: 'https://www.gov.kr', label: '정부24 바로가기' },
      },
      {
        title: '쿠팡 Wing에 서류 등록',
        description: '발급받은 서류를 쿠팡 Wing에 업로드합니다.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인하세요.',
          '"판매자 정보" → "서류 관리"로 이동하세요.',
          '"건강기능식품 판매업 신고증"을 업로드하세요.',
          '승인까지 1~3영업일 정도 걸려요.',
          '승인 완료 후 건기식 카테고리에 상품 등록이 가능해요!',
        ],
        tip: '서류는 스캔본 또는 선명한 사진으로 올려주세요. 흐릿하면 반려될 수 있어요.',
      },
    ],
    faqs: [
      {
        question: '건기식 수료증 없이도 판매할 수 있나요?',
        answer:
          '아니요, 건강기능식품을 판매하려면 반드시 위생교육 이수 + 영업신고가 필요해요. 미신고 판매 시 과태료가 부과될 수 있습니다.',
      },
      {
        question: '수료증 유효기간이 있나요?',
        answer: '네, 매년 보수교육(2시간)을 재이수해야 해요. 매년 12월 31일까지 이수해야 하며, 미이수 시 과태료 20만원이 부과돼요. 한국건강기능식품협회에서 안내가 옵니다.',
      },
      {
        question: '시험에 떨어지면 어떡하나요?',
        answer: '걱정 마세요! 재시험이 가능해요. O/X 5문제라 교육 내용만 잘 들으시면 쉽게 합격할 수 있어요.',
      },
    ],
    relatedArticleIds: ['coupang-api-setup'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 3. 주문/배송 - 쿠팡 주문 송장처리
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-invoice',
    categoryId: 'orders-shipping',
    title: '쿠팡 주문 송장처리',
    subtitle: '주문 확인부터 발송 완료까지 전체 과정',
    icon: '🚚',
    estimatedTime: '건당 약 5분',
    overview:
      '쿠팡에서 주문이 들어오면 확인 → 도매처 발주 → 운송장 번호 입력 → 발송 처리까지의 전체 과정을 알려드려요. 빠른 처리가 셀러 점수에 유리해요!',
    steps: [
      {
        title: '신규 주문 확인',
        description: '쿠팡 Wing에서 새로 들어온 주문을 확인합니다.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인하세요.',
          '왼쪽 메뉴에서 "주문/배송" → "주문조회"를 클릭하세요.',
          '새로 들어온 주문 목록이 표시됩니다.',
          '주문 상품명, 수량, 배송지를 확인하세요.',
        ],
        images: [
          { src: 'https://globalsellers.coupang.com/wp-content/uploads/2022/03/Screenshot-2022-03-10-at-10.10.49-PM.png', alt: 'Wing 주문 확인 화면', caption: 'Wing 포털 메인 - 결제 완료 주문 목록' },
          { src: 'https://globalsellers.coupang.com/wp-content/uploads/2022/03/Screenshot-2022-03-10-at-10.17.25-PM.png', alt: '주문 상세 조회', caption: '주문 목록 상세 조회 화면' },
        ],
        tip: '하루에 2~3번은 새 주문을 확인하는 습관을 들이세요. 처리가 늦으면 패널티가 있어요.',
      },
      {
        title: '상품 재고 확인',
        description: '주문받은 상품의 재고를 확인합니다.',
        detailedInstructions: [
          '도매처(공급사)에 해당 상품의 재고가 있는지 확인하세요.',
          '재고가 있으면 다음 단계로 진행!',
          '재고가 없으면 고객에게 안내 후 주문 취소 처리가 필요해요.',
        ],
        warning: '재고 없이 주문을 방치하면 쿠팡 셀러 점수가 크게 떨어져요. 없으면 빨리 취소 처리하세요!',
      },
      {
        title: '도매처에 발주',
        description: '도매처(공급사)에 상품을 발주합니다.',
        detailedInstructions: [
          '도매처 사이트나 연락처를 통해 주문하세요.',
          '배송지를 고객의 배송지로 입력하세요 (직배송의 경우).',
          '주문자 정보에 쿠팡 주문번호를 메모해두면 추적이 편해요.',
          '결제를 완료하세요.',
        ],
        tip: '도매처가 여러 곳이라면, 엑셀에 주문번호-도매처를 정리해두면 관리가 편해요.',
      },
      {
        title: '운송장 번호 확인',
        description: '도매처에서 발송 후 운송장 번호를 확인합니다.',
        detailedInstructions: [
          '도매처에서 발송 처리되면 운송장 번호를 알려줘요.',
          '카톡, 문자, 이메일 등으로 받을 수 있어요.',
          '택배사명과 운송장 번호를 메모해두세요.',
        ],
      },
      {
        title: 'Wing에 송장 입력',
        description: '쿠팡 Wing에 운송장 정보를 입력합니다.',
        detailedInstructions: [
          '"주문/배송" → 해당 주문을 클릭하세요.',
          '"발송 처리" 버튼을 클릭하세요.',
          '택배사를 선택하세요 (CJ대한통운, 한진택배, 롯데택배 등).',
          '운송장 번호를 입력하세요.',
          '"확인" 버튼을 클릭하면 송장 등록 완료!',
        ],
        images: [
          { src: 'https://globalsellers.coupang.com/wp-content/uploads/2022/03/Screenshot-2022-03-10-at-10.21.12-PM.png', alt: '발주 확인 처리', caption: '발주 확인 처리 버튼' },
          { src: 'https://globalsellers.coupang.com/wp-content/uploads/2022/03/Screenshot-2022-03-10-at-10.30.15-PM.png', alt: '택배사 선택 화면', caption: '택배사 선택' },
          { src: 'https://globalsellers.coupang.com/wp-content/uploads/2022/03/Screenshot-2022-03-10-at-10.45.53-PM-1024x386.png', alt: '송장번호 입력 화면', caption: '송장번호 입력 및 적용' },
        ],
        warning: '운송장 번호를 잘못 입력하면 배송 추적이 안 돼요. 꼭 다시 한 번 확인해주세요!',
      },
      {
        title: '발송 확인',
        description: '발송 처리가 정상적으로 되었는지 확인합니다.',
        detailedInstructions: [
          '"주문/배송" → "발송 완료" 탭을 확인하세요.',
          '방금 처리한 주문이 "발송 완료" 상태로 바뀌었는지 확인!',
          '배송 추적 번호를 클릭하면 택배 위치를 추적할 수 있어요.',
        ],
      },
      {
        title: '배송 추적 모니터링',
        description: '배송이 정상적으로 진행되는지 모니터링합니다.',
        detailedInstructions: [
          '발송 후 1~2일 내에 "배송 중" 상태가 되는지 확인하세요.',
          '배송 지연이 되면 택배사에 문의하세요.',
          '고객이 배송 문의를 하면 운송장 번호로 안내해주세요.',
        ],
      },
      {
        title: '배송 완료 확인',
        description: '고객에게 정상 배달되었는지 최종 확인합니다.',
        detailedInstructions: [
          '"배송 완료" 상태가 되면 처리 끝!',
          '고객이 수취 확인을 하면 정산이 진행됩니다.',
          '만약 배송 사고(분실, 파손)가 발생하면 CS 처리로 넘어가세요.',
        ],
        tip: '배송 완료 후에도 2~3일간은 반품/교환 요청이 올 수 있으니 모니터링해주세요.',
      },
    ],
    faqs: [
      {
        question: '송장을 잘못 입력했어요. 수정할 수 있나요?',
        answer:
          '네, "발송 완료" 상태에서 해당 주문을 클릭하면 "송장 수정" 버튼이 있어요. 수정 후 저장하면 됩니다.',
      },
      {
        question: '주문 접수 후 얼마 안에 발송해야 하나요?',
        answer:
          '쿠팡 기준으로 주문 확인 후 2영업일 이내에 발송해야 해요. 늦으면 셀러 점수에 영향이 있어요.',
      },
      {
        question: '도매처에서 품절이라고 해요. 어떡하나요?',
        answer:
          '고객에게 정중하게 안내하고 주문 취소 처리하세요. "판매자 사유 취소"로 처리하면 됩니다. 다만 잦은 취소는 셀러 점수에 영향을 줘요.',
      },
    ],
    relatedArticleIds: ['naver-resale-order', 'coupang-return', 'seller-grade-penalty', 'inventory-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 4. 주문/배송 - 네이버 리셀 주문처리
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'naver-resale-order',
    categoryId: 'orders-shipping',
    title: '네이버 리셀 주문처리',
    subtitle: '네이버 주문을 쿠팡으로 연동하는 방법',
    icon: '🔗',
    estimatedTime: '건당 약 10분',
    overview:
      '네이버 스마트스토어에서 들어온 주문을 쿠팡에서 상품을 구매하여 직배송하는 방법이에요. 네이버 주문 확인 → 쿠팡에서 해당 상품 구매 → 송장을 네이버에 입력하는 순서로 진행합니다.',
    steps: [
      {
        title: '네이버 스마트스토어 주문 확인',
        description: '네이버 스마트스토어 센터에서 새 주문을 확인합니다.',
        detailedInstructions: [
          '네이버 스마트스토어 센터에 로그인하세요.',
          '"판매관리" → "신규 주문" 확인하세요.',
          '주문 상품명, 옵션, 수량, 수취인 정보를 메모하세요.',
        ],
        images: [
          { src: 'https://www.sellingkok.com/data/file/guide/1948486138_m2eLKP3l_9b6718e5713adde5be64dcd6ff394ae98a3fcf93.png', alt: '스마트스토어 주문관리 화면', caption: '스마트스토어 주문관리 페이지' },
        ],
        externalLink: { url: 'https://sell.smartstore.naver.com', label: '스마트스토어 센터' },
      },
      {
        title: '쿠팡에서 해당 상품 검색',
        description: '네이버에서 주문받은 동일 상품을 쿠팡에서 찾습니다.',
        detailedInstructions: [
          '쿠팡 앱 또는 웹사이트에서 동일한 상품을 검색하세요.',
          '가격, 옵션, 배송일을 비교하여 가장 적합한 상품을 선택하세요.',
          '마진이 남는지 반드시 확인하세요!',
        ],
        images: [
          { src: 'https://infoflex.net/wp-content/uploads/2023/12/%EC%8A%A4%EB%A7%88%ED%8A%B8%EC%8A%A4%ED%86%A0%EC%96%B4-%ED%8C%90%EB%A7%A4%EC%9E%90%EC%84%BC%ED%84%B0-1.jpg', alt: '네이버 스마트스토어 판매자센터 화면', caption: '스마트스토어 판매자센터 - 주문 확인 후 쿠팡에서 상품 검색' },
        ],
        tip: '자주 리셀하는 상품은 즐겨찾기에 저장해두면 빠르게 찾을 수 있어요.',
        warning: '네이버 판매가와 쿠팡 구매가의 차이(마진)를 반드시 확인하세요! 쿠팡 가격이 수시로 변동되므로 구매 직전에 다시 확인해야 해요.',
      },
      {
        title: '쿠팡에서 구매하기',
        description: '고객의 배송지로 직접 배송되도록 주문합니다.',
        detailedInstructions: [
          '쿠팡에서 해당 상품의 "구매하기"를 클릭하세요.',
          '배송지를 네이버 주문의 수취인 주소로 입력하세요.',
          '수취인 이름과 연락처도 네이버 주문 정보와 동일하게 입력하세요.',
          '결제를 완료하세요.',
        ],
        warning: '배송지를 반드시 고객(수취인) 주소로 입력하세요! 본인 주소로 하면 안 돼요.',
        copyableTemplates: [
          {
            label: '배송지 확인 체크리스트',
            text: '✅ 배송지 확인 체크리스트\n\n□ 수취인 이름: 네이버 주문 정보와 동일한가?\n□ 연락처: 정확히 입력했는가?\n□ 주소: 도로명주소를 정확히 입력했는가?\n□ 상세주소: 동/호수까지 빠짐없이 입력했는가?\n□ 배송 메모: 고객 요청사항을 반영했는가?\n□ 공동현관 비밀번호: 필요한 경우 확인했는가?',
          },
        ],
      },
      {
        title: '쿠팡 주문번호 기록',
        description: '쿠팡에서의 주문번호를 기록해둡니다.',
        detailedInstructions: [
          '쿠팡에서 결제 완료 후 나오는 주문번호를 메모하세요.',
          '네이버 주문번호와 쿠팡 주문번호를 매칭하여 기록해두세요.',
          '엑셀이나 메모장에 정리하면 관리가 편해요.',
        ],
      },
      {
        title: '쿠팡 송장번호 확인',
        description: '쿠팡에서 발송 후 송장번호를 확인합니다.',
        detailedInstructions: [
          '쿠팡 "마이쿠팡" → "주문 목록"에서 해당 주문을 확인하세요.',
          '발송이 시작되면 택배사와 송장번호가 표시됩니다.',
          '보통 주문 후 당일~다음 날에 발송돼요 (로켓배송 제외).',
        ],
        tip: '로켓배송 상품은 송장번호가 "쿠팡 자체 배송"으로 표시될 수 있어요. 이 경우 쿠팡 배송 번호를 그대로 사용하세요.',
      },
      {
        title: '네이버에 송장 입력',
        description: '쿠팡 송장번호를 네이버 스마트스토어에 입력합니다.',
        detailedInstructions: [
          '스마트스토어 센터의 해당 주문을 클릭하세요.',
          '"발송 처리" 버튼을 클릭하세요.',
          '택배사를 선택하고 쿠팡에서 확인한 송장번호를 입력하세요.',
          '"발송 처리 완료"를 클릭하면 끝!',
        ],
        images: [
          { src: 'https://www.sellingkok.com/data/file/guide/1948486138_3dBJc8i7_854b4c1220849b174c71458e52486c84c923d746.png', alt: '주문 수집~발송 추적 워크플로우', caption: '주문 수집 → 발송 처리 → 추적 흐름' },
        ],
        warning: '택배사 선택이 매우 중요해요! 쿠팡 로켓배송이면 "쿠팡 자체배송"을, 일반 택배면 해당 택배사를 정확히 선택하세요. 잘못 선택하면 배송 추적이 안 돼요.',
      },
      {
        title: '배송 완료 확인 및 정산',
        description: '배송 완료 여부를 확인하고 수익을 정리합니다.',
        detailedInstructions: [
          '배송이 완료되면 네이버에서 구매 확정이 진행됩니다.',
          '네이버 판매 금액 - 쿠팡 구매 금액 = 순수익!',
          '수익을 기록해두면 월별 정산할 때 편해요.',
        ],
        tip: '매건 수익을 기록하세요! 네이버 판매가 - 쿠팡 구매가 - 수수료 = 순수익. 엑셀에 일별로 정리하면 월말 정산이 편해요.',
      },
    ],
    faqs: [
      {
        question: '쿠팡 로켓배송 상품도 리셀할 수 있나요?',
        answer:
          '네, 가능해요. 다만 로켓배송은 송장번호 형태가 다를 수 있으니 택배사를 "쿠팡 자체배송"으로 선택해주세요.',
      },
      {
        question: '고객이 네이버에서 반품 요청하면 어떡하나요?',
        answer:
          '네이버에서 반품을 수락하고, 쿠팡에서도 반품/환불 처리해야 해요. 양쪽 모두 처리해야 합니다.',
      },
      {
        question: '마진 계산은 어떻게 하나요?',
        answer:
          '순마진 = 네이버 판매가 - 네이버 수수료(약 5.5%) - 쿠팡 구매가. 예를 들어 네이버 20,000원에 팔고 쿠팡에서 16,000원에 샀다면: 20,000 - 1,100(수수료) - 16,000 = 2,900원이 순마진이에요.',
      },
      {
        question: '쿠팡에서 주문이 취소되면 네이버 주문은 어떻게 하나요?',
        answer:
          '쿠팡 주문이 품절 등으로 취소되면, 즉시 네이버 주문도 취소 처리해야 해요. 네이버 스마트스토어 > 판매관리에서 해당 주문을 "판매자 취소"하고, 고객에게 사과 메시지를 보내세요. 다른 쿠팡 셀러 상품으로 대체 구매가 가능한지도 확인해보세요.',
      },
    ],
    relatedArticleIds: ['coupang-invoice', 'coupang-return', 'cs-daily-management', 'inventory-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 5. 주문/배송 - 자체 수거 방법
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'self-pickup-return',
    categoryId: 'orders-shipping',
    title: '자체 수거 방법',
    subtitle: '반품 상품을 직접 수거하는 전체 과정',
    icon: '📥',
    estimatedTime: '약 30분~1시간',
    overview:
      '고객의 반품 상품을 택배 반송 대신 직접 방문하여 수거하는 방법이에요. 택배 반송이 어려운 경우나 빠른 처리가 필요할 때 유용해요.',
    steps: [
      {
        title: '반품 수거 필요 여부 판단',
        description: '직접 수거가 필요한 상황인지 확인합니다.',
        detailedInstructions: [
          '고객이 택배 반송을 원하지 않거나 어려운 상황인지 확인하세요.',
          '상품이 대형이거나 특수 포장이 필요한 경우 직접 수거가 나을 수 있어요.',
          '수거 가능한 거리인지 확인하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/---------1.jpg', alt: '주문취소와 반품 차이 비교표', caption: '주문취소와 반품의 차이점 - 반품 유형 판단 기준' },
        ],
        tip: '대부분의 경우 택배 반품이 더 효율적이에요. 직접 수거는 정말 필요할 때만!',
      },
      {
        title: '고객과 수거 일정 협의',
        description: '고객에게 연락하여 수거 날짜와 시간을 정합니다.',
        detailedInstructions: [
          '쿠팡 Wing에서 고객 연락처를 확인하세요.',
          '전화 또는 메시지로 수거 가능한 날짜와 시간을 조율하세요.',
          '고객의 상세 주소와 만남 장소를 확인하세요.',
          '방문 전 미리 연락드리겠다고 안내해주세요.',
        ],
        images: [
          { src: 'https://returneeds.com/blog/wp-content/uploads/2024/02/69.png', alt: '택배사 반품 접수 화면', caption: 'CJ대한통운/한진택배 반품 접수 화면 - 자체 수거 대신 택배 회수도 가능' },
        ],
        warning: '고객 개인정보는 반품 처리 용도로만 사용하세요. 다른 목적으로 사용하면 안 돼요!',
        copyableTemplates: [
          {
            label: '수거 일정 조율 메시지',
            text: '안녕하세요 고객님, [상품명] 반품 관련하여 연락드립니다.\n\n직접 방문 수거를 도와드리겠습니다. 아래 일정 중 편하신 시간을 알려주세요.\n\n① [날짜] 오전 10시~12시\n② [날짜] 오후 2시~4시\n③ 고객님 희망 시간\n\n방문 30분 전에 다시 연락드리겠습니다.\n감사합니다.',
          },
          {
            label: '방문 전 안내 메시지',
            text: '고객님 안녕하세요.\n\n오늘 [시간]에 [상품명] 수거를 위해 방문 예정입니다.\n약 30분 후 도착 예정이오니, 상품을 미리 준비해주시면 감사하겠습니다.\n\n📦 준비사항:\n- 상품 및 구성품 일체\n- 가능하면 원래 포장 상태\n\n곧 뵙겠습니다!',
          },
          {
            label: '수거 완료 감사 메시지',
            text: '고객님 안녕하세요.\n\n오늘 [상품명] 수거가 완료되었습니다.\n\n상품 검수 후 [환불예정일]까지 환불 처리해드리겠습니다.\n처리 완료 시 다시 안내드리겠습니다.\n\n불편을 드려 죄송하며, 앞으로 더 좋은 상품으로 보답하겠습니다.\n감사합니다.',
          },
        ],
      },
      {
        title: '방문 수거',
        description: '약속된 일시에 고객을 방문하여 상품을 수거합니다.',
        detailedInstructions: [
          '약속 시간 30분 전에 고객에게 도착 예정 안내를 드리세요.',
          '상품 상태를 현장에서 간단히 확인하세요 (파손, 사용 흔적 등).',
          '수거 확인서나 사진을 남겨두면 분쟁 예방에 좋아요.',
          '고객에게 처리 예정 일정을 안내해드리세요.',
        ],
        tip: '수거 전에 반품 상품의 사진/영상을 고객에게 미리 찍어달라고 요청하면, 방문 전에 상태를 파악할 수 있어요.',
      },
      {
        title: '상품 상태 검수',
        description: '수거한 상품의 상태를 꼼꼼히 확인합니다.',
        detailedInstructions: [
          '포장 상태, 구성품 포함 여부를 확인하세요.',
          '상품에 손상이나 사용 흔적이 있는지 점검하세요.',
          '검수 결과를 사진으로 기록해두세요.',
          '재판매 가능 여부를 판단하세요.',
        ],
        warning: '검수 결과는 반드시 고객 앞에서 확인하거나, 사진·영상으로 기록하세요. 나중에 "원래 이런 상태가 아니었다"는 분쟁이 발생할 수 있어요.',
      },
      {
        title: 'Wing에서 반품 승인 처리',
        description: '쿠팡 Wing에서 반품 완료 처리를 합니다.',
        detailedInstructions: [
          '쿠팡 Wing의 "주문/배송" → "반품관리" 메뉴로 이동하세요.',
          '해당 반품 건을 찾아 "입고완료" 처리를 하세요.',
          '검수 결과에 따라 "전액 환불" 또는 "부분 환불"을 선택하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/---------1-.png', alt: '반품접수 입고완료 처리 화면', caption: 'Wing 반품관리 > 입고완료 상태 변경 처리' },
        ],
        tip: '입고완료 처리는 상품 검수 후 가능한 빨리 하세요. 지연되면 고객 불만과 셀러 점수에 영향을 줄 수 있어요.',
      },
      {
        title: '환불 처리',
        description: '고객에게 환불을 진행합니다.',
        detailedInstructions: [
          '반품 승인 후 환불 처리를 진행하세요.',
          '전액 환불 또는 부분 환불(배송비 차감 등)을 선택하세요.',
          '환불은 보통 영업일 기준 3~5일 내에 처리됩니다.',
          '환불 완료 후 고객에게 안내 메시지를 보내면 좋아요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/---------.jpg', alt: '반품 배송비 부담주체 안내', caption: '반품 사유별 배송비 부담 주체 정리' },
        ],
        tip: '환불 완료 안내 메시지를 보내면 고객 만족도가 크게 올라가요. 작은 배려가 좋은 리뷰로 이어집니다.',
      },
      {
        title: '기록 정리',
        description: '수거 건에 대한 기록을 정리합니다.',
        detailedInstructions: [
          '수거 날짜, 상품, 상태, 환불 금액을 기록하세요.',
          '자주 반품되는 상품이 있다면 원인을 분석해보세요.',
          '불량률이 높은 상품은 판매 중단을 고려해보세요.',
        ],
        warning: '같은 상품의 반품이 3건 이상 반복되면 해당 상품의 품질이나 상세페이지 설명에 문제가 있을 수 있어요. 즉시 점검하세요.',
      },
    ],
    faqs: [
      {
        question: '수거 비용은 누가 부담하나요?',
        answer:
          '고객 변심에 의한 반품이면 고객 부담, 상품 불량이면 판매자 부담이에요. 직접 수거 시 교통비 등은 판매자가 부담합니다.',
      },
      {
        question: '수거한 상품을 재판매할 수 있나요?',
        answer:
          '상품 상태가 양호하고 미개봉이라면 재판매 가능해요. 하지만 사용 흔적이 있으면 재판매가 어려울 수 있어요.',
      },
      {
        question: '고객이 수거를 거부하거나 연락이 안 되면 어떡하나요?',
        answer:
          '3회 이상 연락 시도 후에도 연락이 안 되면, 쿠팡 Wing에서 해당 내용을 기록하고 "고객 미응답"으로 처리하세요. 쿠팡 판매자 지원(1600-9879)에 상황을 알리면 추가 안내를 받을 수 있어요.',
      },
    ],
    relatedArticleIds: ['coupang-return', 'coupang-invoice', 'cs-daily-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 6. 반품/CS - 쿠팡 반품처리
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-return',
    categoryId: 'returns-cs',
    title: '쿠팡 반품처리',
    subtitle: '반품 요청부터 환불 완료까지',
    icon: '📋',
    estimatedTime: '건당 약 10분',
    overview:
      '고객이 반품을 요청했을 때 처리하는 전체 과정이에요. 반품 사유를 확인하고, 승인 또는 거부를 판단하고, 검수 후 환불까지의 과정을 알려드려요.',
    steps: [
      {
        title: '반품 요청 확인',
        description: 'Wing에서 반품 요청을 확인합니다.',
        detailedInstructions: [
          '쿠팡 Wing의 "주문/배송" → "반품관리" 메뉴로 이동하세요.',
          '신규 반품 요청 목록을 확인하세요.',
          '반품 사유, 상품명, 주문번호를 확인하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/-------------1-.png', alt: '반품요청 건 확인 화면', caption: 'Wing > 주문/배송 > 반품관리 화면' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/------------1.jpg', alt: '반품 프로세스 전체 플로우', caption: '판매자 반품 처리 프로세스 흐름도' },
        ],
        tip: '반품 요청이 들어오면 최대한 빨리 확인하세요. 방치하면 자동 승인될 수 있어요.',
      },
      {
        title: '반품 사유 분석',
        description: '고객이 선택한 반품 사유를 분석합니다.',
        detailedInstructions: [
          '고객 변심인지, 상품 불량인지 구분하세요.',
          '고객 변심: 반품 배송비 고객 부담',
          '상품 불량/오배송: 반품 배송비 판매자 부담',
          '사유가 불명확하면 고객에게 추가 확인을 요청하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/-----------------------1.jpg', alt: '반품 사유와 배송비 부담주체', caption: '반품 사유별 배송비 부담주체 - 고객 변심 vs 상품 불량' },
        ],
        tip: '고객이 "상품 불량"으로 신청했지만 실제로는 변심인 경우가 많아요. 사유를 꼼꼼히 확인하고, 필요시 고객에게 추가 확인을 요청하세요.',
      },
      {
        title: '반품 승인/거부 결정',
        description: '반품을 승인할지 거부할지 판단합니다.',
        detailedInstructions: [
          '대부분의 반품은 승인하는 것이 좋아요 (셀러 점수 관리).',
          '거부 가능한 경우: 사용 흔적이 명확한 경우, 반품 기한 초과 등.',
          '승인하면 "반품 수거" 절차가 시작됩니다.',
          '거부 시에는 거부 사유를 명확히 작성하세요.',
        ],
        warning: '무분별한 반품 거부는 쿠팡 패널티의 원인이 돼요. 신중하게 결정하세요!',
      },
      {
        title: '반품 수거 진행',
        description: '택배사가 고객에게서 상품을 수거합니다.',
        detailedInstructions: [
          '반품 승인 후 자동으로 수거 택배가 배정됩니다.',
          '고객이 수거 일시를 선택하면 택배기사가 방문해요.',
          '수거 완료까지 보통 2~3일 소요됩니다.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/11/-------------------------------------.png', alt: '반품 배송비 상한가 기준', caption: '상품 가격대별 반품 배송비 상한가 기준표' },
        ],
        tip: '수거가 지연되면 고객에게 진행 상황을 안내해주세요. "택배사에 확인한 결과 [날짜]에 수거 예정입니다"와 같은 메시지만으로도 고객 불만이 크게 줄어요.',
      },
      {
        title: '상품 검수',
        description: '수거된 상품의 상태를 확인합니다.',
        detailedInstructions: [
          '반품 상품이 도착하면 상태를 꼼꼼히 확인하세요.',
          '포장, 구성품, 상품 상태를 점검하세요.',
          '검수 결과를 사진으로 기록해두면 분쟁 시 증거가 돼요.',
        ],
        warning: '검수 사진은 반드시 남기세요! 반품 상품 도착 즉시 포장 개봉 과정부터 사진을 찍어두면 나중에 분쟁 시 강력한 증거가 됩니다.',
      },
      {
        title: '환불 처리',
        description: '검수 완료 후 환불을 진행합니다.',
        detailedInstructions: [
          'Wing의 반품 관리에서 "환불 처리" 버튼을 클릭하세요.',
          '전액 환불 또는 부분 환불을 선택하세요.',
          '부분 환불 시 사유를 명확히 작성하세요.',
          '환불 완료!',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/---------1-.png', alt: '반품접수 입고완료 처리', caption: '반품접수 → 입고완료 상태 변경' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/--------1.png', alt: '환불완료 정산금 차감', caption: '환불 완료 및 정산금 차감 처리' },
        ],
      },
      {
        title: '부분 환불 시 고객 안내',
        description: '부분 환불의 경우 고객에게 사유를 안내합니다.',
        detailedInstructions: [
          '부분 환불 사유를 정중하게 안내하세요.',
          '증거 사진이 있으면 함께 첨부하면 좋아요.',
          '고객이 이의를 제기하면 쿠팡 "확인요청" 제도를 이용할 수 있어요.',
        ],
        copyableTemplates: [
          {
            label: '부분환불 안내 메시지',
            text: '고객님 안녕하세요.\n\n반품하신 [상품명]의 검수가 완료되었습니다.\n\n검수 결과, [사유: 예-사용 흔적 확인/구성품 누락 등]으로 인해 부분 환불로 처리되었습니다.\n\n- 상품 금액: [원래 금액]원\n- 차감 금액: [차감 금액]원 (사유: [구체적 사유])\n- 환불 금액: [환불 금액]원\n\n환불은 영업일 기준 3~5일 내 처리됩니다.\n\n이의가 있으시면 말씀해주세요. 증빙 사진도 함께 안내드릴 수 있습니다.\n\n감사합니다.',
          },
        ],
      },
      {
        title: '반품 이력 관리',
        description: '반품 이력을 정리하고 패턴을 분석합니다.',
        detailedInstructions: [
          '반품 사유별 통계를 정리해보세요.',
          '특정 상품의 반품률이 높다면 상품 설명을 보완하세요.',
          '포장 문제라면 포장 방법을 개선하세요.',
          '반복되는 문제를 찾아 미리 예방하는 것이 중요해요!',
        ],
        tip: '반품률을 5% 이하로 유지하면 셀러 등급에 유리해요.',
      },
    ],
    faqs: [
      {
        question: '반품 기한은 얼마나 되나요?',
        answer: '마켓플레이스 셀러 상품은 수령 후 7일 이내 단순 변심 반품이 가능해요. 상품 불량/오배송은 3개월 이내에 반품 가능합니다. (로켓배송 상품은 30일)',
      },
      {
        question: '고객이 사용한 상품을 반품하면요?',
        answer:
          '사용 흔적이 명확하다면 부분 환불 처리할 수 있어요. 증거 사진을 남겨두고 사유를 명확히 작성하세요.',
      },
      {
        question: '반품 배송비는 어떻게 처리하나요?',
        answer:
          '고객 변심은 고객 부담, 상품 불량/오배송은 판매자 부담이에요. 쿠팡 시스템에서 자동으로 처리됩니다.',
      },
    ],
    relatedArticleIds: ['self-pickup-return', 'difficult-customer', 'cs-daily-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 7. 반품/CS - 진상소비자 응대
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'difficult-customer',
    categoryId: 'returns-cs',
    title: '진상소비자 응대',
    subtitle: '어려운 고객 상황별 대응 매뉴얼',
    icon: '🛡️',
    estimatedTime: '상황별 5~15분',
    overview:
      '판매 활동 중 만날 수 있는 어려운 고객 상황에 대한 대응 방법을 알려드려요. 감정적으로 대응하지 않고, 전문적으로 처리하는 것이 핵심이에요. 각 상황별 복사해서 바로 쓸 수 있는 응대 템플릿도 준비했어요!',
    steps: [
      {
        title: '기본 원칙: 감정 분리',
        description: '어떤 상황에서든 지켜야 할 기본 원칙입니다.',
        detailedInstructions: [
          '고객의 감정과 나의 감정을 분리하세요.',
          '욕설이나 폭언에도 같은 수준으로 대응하지 마세요.',
          '모든 대화는 텍스트(채팅/이메일)로 기록을 남기세요.',
          '통화 시에도 주요 내용을 메모해두세요.',
          '해결이 안 되면 혼자 끙끙대지 말고 에스컬레이션(상위 보고)하세요.',
        ],
        images: [
          { src: 'https://cdn.prod.website-files.com/688086d2f2905e7871b39fbc/689066c3d6a08ad4a2df9c0a_MCNETSRJ24TRE53GSYL7F3VWK6QU.jpg', alt: '쿠팡 판매자 점수 개요', caption: '판매자 점수 - 고객 응대 품질이 점수에 직접 영향' },
        ],
        tip: '"이 고객은 나를 공격하는 게 아니라 상황에 화가 난 것"이라고 생각하면 대응이 편해져요.',
      },
      {
        title: '상황1: 과도한 보상 요구',
        description: '상품가 이상의 보상이나 과도한 요구를 하는 경우',
        detailedInstructions: [
          '고객의 요구사항을 정확히 파악하세요.',
          '쿠팡 정책에 따른 보상 범위를 안내하세요.',
          '정책 범위 내에서 최대한의 해결책을 제시하세요.',
          '정책 초과 요구 시 정중히 불가 안내하세요.',
        ],
        copyableTemplates: [
          {
            label: '과도한 보상 요구 응대',
            text: '고객님, 불편을 드려 정말 죄송합니다.\n\n말씀하신 상황에 대해 충분히 이해하고 있습니다. 현재 쿠팡 정책에 따라 [환불/교환/부분보상] 처리가 가능합니다.\n\n추가 보상에 대해서는 쿠팡 고객센터를 통해 검토가 필요한 부분이라, 쿠팡 고객센터로 문의해주시면 더 자세한 안내를 받으실 수 있습니다.\n\n빠른 해결을 위해 최선을 다하겠습니다.',
          },
        ],
      },
      {
        title: '상황2: 욕설/폭언 고객',
        description: '감정적으로 폭발하며 욕설하는 경우',
        detailedInstructions: [
          '절대 감정적으로 대응하지 마세요.',
          '1차: 정중하게 정상 대화를 요청하세요.',
          '2차: 계속되면 대화 중단을 경고하세요.',
          '3차: 그래도 계속되면 쿠팡 판매자 지원(1600-9879)에 문의하세요.',
          '모든 대화 기록을 캡처해서 보관하세요.',
        ],
        copyableTemplates: [
          {
            label: '1차 정중한 요청',
            text: '고객님, 불편하신 마음 충분히 이해합니다.\n\n원활한 문제 해결을 위해 존중하는 말씀으로 대화 부탁드립니다. 고객님의 문제를 빠르게 해결해드리고 싶습니다.',
          },
          {
            label: '2차 경고',
            text: '고객님, 문제 해결을 위해 최선을 다하고 있으나 과도한 표현이 지속되면 원활한 상담이 어렵습니다.\n\n쿠팡 고객센터를 통해 별도로 문의하실 수도 있습니다. 정상적인 대화를 통해 빠르게 해결해드리겠습니다.',
          },
        ],
        warning: '욕설·폭언 기록은 반드시 캡처해서 보관하세요. 나중에 쿠팡 확인요청이나 분쟁 시 증거로 필요해요.',
      },
      {
        title: '상황3: 허위 불량 주장',
        description: '정상 상품인데 불량이라고 주장하는 경우',
        detailedInstructions: [
          '고객에게 불량 부분의 사진/영상을 요청하세요.',
          '판매 전 상품 사진이 있다면 비교 자료로 활용하세요.',
          '명확한 증거 없이는 고객 주장을 먼저 수용하되, 기록을 남기세요.',
          '반복되는 경우 쿠팡에 패턴 신고할 수 있어요.',
        ],
        copyableTemplates: [
          {
            label: '불량 증거 요청',
            text: '고객님, 상품에 문제가 있다니 정말 죄송합니다.\n\n정확한 확인과 빠른 처리를 위해 불량 부분의 사진을 보내주시면 감사하겠습니다.\n\n확인 후 즉시 교환 또는 환불 처리해드리겠습니다.',
          },
        ],
      },
      {
        title: '상황4: 배송 지연 항의',
        description: '배송이 늦어서 강하게 항의하는 경우',
        detailedInstructions: [
          '먼저 진심으로 사과하세요.',
          '택배사에 연락하여 정확한 배송 상황을 파악하세요.',
          '구체적인 도착 예정일을 안내하세요.',
          '도착 예정일도 모를 경우 택배사 확인 후 재연락 약속하세요.',
        ],
        copyableTemplates: [
          {
            label: '배송 지연 사과',
            text: '고객님, 배송이 지연되어 정말 죄송합니다.\n\n현재 택배사에 확인한 결과, [예상 도착일]까지 배송될 예정입니다.\n\n만약 [날짜]까지 도착하지 않으면 즉시 재발송 또는 전액 환불 처리해드리겠습니다.\n\n다시 한번 죄송합니다.',
          },
        ],
      },
      {
        title: '상황5: 반복 악성 반품',
        description: '같은 고객이 반복적으로 악의적인 반품을 하는 경우',
        detailedInstructions: [
          '해당 고객의 주문·반품 이력을 정리하세요.',
          '패턴이 명확하다면 쿠팡에 신고하세요.',
          '"반품관리" 메뉴에서 특이 고객을 메모해두세요.',
          '증거(대화 기록, 반품 상품 사진 등)를 모두 보관하세요.',
        ],
        images: [
          { src: 'https://cdn.prod.website-files.com/688086d2f2905e7871b39fbc/689066e5aad2740bcc341303_MCKB34R6FIJNFDDACL2WKNTPOVEY.png', alt: '쿠팡 패널티 항목 기준', caption: '반품률·고객불만 등 패널티 항목 기준 - 악성 반품이 셀러 점수에 미치는 영향' },
        ],
        tip: '쿠팡에서는 반복 악성 반품 고객에 대해 패널티를 부여할 수 있어요. 증거가 핵심이에요!',
      },
      {
        title: '에스컬레이션: 쿠팡 확인요청 및 판매자 지원',
        description: '직접 해결이 어려울 때 쿠팡의 분쟁 해결 제도를 활용하는 방법',
        detailedInstructions: [
          '반품 분쟁: Wing "주문/배송" → "반품관리"에서 해당 건에 "확인요청"을 접수하세요.',
          '확인요청은 "입고완료" 처리 후 7영업일(168시간) 이내에 해야 해요.',
          '상황을 객관적으로 작성하고, 출고 시 상품 사진 등 증거를 첨부하세요.',
          '쿠팡 담당자 판단까지 약 5영업일 소요, 재신청은 1회만 가능해요.',
          '기타 문의는 판매자콜센터(1600-9879) 또는 helpseller@coupang.com으로 연락하세요.',
        ],
        images: [
          { src: 'https://cdn.prod.website-files.com/688086d2f2905e7871b39fbc/6890671d6539990d4a7707ed_MCNRA7XLMTZ5DWZJM2D7RURJQ35Y.png', alt: '쿠팡 평가 단계 및 조치', caption: '주의 → 경고 → 이용정지 단계별 조치 - 심각한 경우 에스컬레이션 필수' },
        ],
      },
      {
        title: '사후 관리 및 멘탈 케어',
        description: '어려운 고객 응대 후 스스로를 챙기세요.',
        detailedInstructions: [
          '어려운 고객 대응 후에는 잠시 휴식을 취하세요.',
          '동료나 커뮤니티에 경험을 공유하면 도움이 돼요.',
          '이런 경우는 전체 고객의 극소수(1~2%)라는 걸 기억하세요.',
          '대부분의 고객은 좋은 분들이에요!',
        ],
        tip: '진상 고객 때문에 지치지 마세요. 99%의 좋은 고객분들을 위해 힘내세요! 💪',
      },
    ],
    faqs: [
      {
        question: '고객이 법적 조치를 하겠다고 위협해요.',
        answer:
          '당황하지 마세요. 정당한 거래 활동에 대해서는 법적으로 문제가 없어요. 차분하게 기록을 보관하고, 필요시 쿠팡 판매자 지원(1600-9879)에 문의하세요.',
      },
      {
        question: '고객이 SNS에 악성 리뷰를 쓰겠다고 협박해요.',
        answer:
          '협박에 굴복하지 마세요. 정당한 정책 내에서 처리하고, 허위 사실이 게시되면 쿠팡이나 해당 플랫폼에 신고할 수 있어요.',
      },
      {
        question: '혼자 대응하기 너무 힘들어요.',
        answer:
          '그럴 때는 쿠팡 확인요청이나 판매자콜센터(1600-9879)를 적극 활용하세요. 또한 셀러 커뮤니티에서 비슷한 경험을 나누면 도움이 됩니다. 절대 혼자 고민하지 마세요!',
      },
    ],
    relatedArticleIds: ['coupang-return', 'ip-issue-handling', 'cs-daily-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 8. 법률/권리 - 지재권 대응
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'ip-issue-handling',
    categoryId: 'legal-ip',
    title: '지재권 대응',
    subtitle: '지식재산권 경고를 받았을 때 대응하는 방법',
    icon: '⚠️',
    estimatedTime: '약 30분~1시간',
    overview:
      '상품 판매 중 상표권, 디자인권, 특허권 관련 경고나 판매 중지를 받았을 때 어떻게 대응해야 하는지 알려드려요. 당황하지 말고 차근차근 따라하세요!',
    steps: [
      {
        title: '경고 내용 정확히 파악',
        description: '받은 경고의 내용과 종류를 파악합니다.',
        detailedInstructions: [
          '경고 메일/알림의 전체 내용을 꼼꼼히 읽으세요.',
          '어떤 권리(상표권/디자인권/특허권)에 대한 경고인지 확인하세요.',
          '경고를 보낸 주체가 누구인지 확인하세요 (권리자 본인? 대리인? 쿠팡?).',
          '해당 상품이 정확히 어떤 상품인지 확인하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/11/------_------------.png', alt: '쿠팡 지재권 소명 가이드', caption: '쿠팡 지식재산권 침해 소명 절차 안내' },
        ],
        tip: '경고 메일은 삭제하지 말고 반드시 보관하세요. 향후 대응의 기초 자료가 됩니다.',
      },
      {
        title: '판매 일시 중지',
        description: '경고를 받은 상품의 판매를 우선 중지합니다.',
        detailedInstructions: [
          '해당 상품을 Wing에서 "판매 중지" 처리하세요.',
          '쿠팡에서 이미 자동 중지된 경우도 있어요.',
          '판매 중지는 상황 파악 후 대응하기 위한 것이니 당황하지 마세요.',
        ],
        warning: '경고를 무시하고 계속 판매하면 계정 정지까지 갈 수 있어요! 일단 중지하세요.',
      },
      {
        title: '정당성 판단',
        description: '내 판매가 정당한지 판단합니다.',
        detailedInstructions: [
          '정품을 정식 유통 경로로 구매한 건지 확인하세요.',
          '상품 설명에 타 브랜드 이름을 부당하게 사용하지 않았는지 확인하세요.',
          '이미지에 타인의 저작물을 무단 사용하지 않았는지 확인하세요.',
          '구매 증빙(영수증, 거래명세서 등)이 있는지 확인하세요.',
        ],
        tip: '정품을 정식으로 구매해서 되파는 것(리셀)은 기본적으로 합법이에요 (병행수입, 권리소진 원칙).',
      },
      {
        title: '이의제기서 작성',
        description: '정당한 판매인 경우 이의제기서를 작성합니다.',
        detailedInstructions: [
          '아래 템플릿을 참고하여 이의제기서를 작성하세요.',
          '객관적 사실 위주로 작성하세요.',
          '구매 증빙, 정품 인증서 등 증거 자료를 첨부하세요.',
          '감정적 표현은 자제하고 논리적으로 작성하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/1.-----------------------------------------------------.png', alt: '개선계획서 원인 분석 예시', caption: '개선계획서 - 문제 원인 분석 작성 예시' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/2.---------------------------------------------------------------------------.png', alt: '개선계획서 해결방안 예시', caption: '개선계획서 - 해결방안 및 결과 작성 예시' },
        ],
        copyableTemplates: [
          {
            label: '지재권 이의제기서 템플릿',
            text: '[이의제기서]\n\n안녕하세요. 쿠팡 마켓플레이스 판매자 [업체명]입니다.\n\n1. 대상 상품: [상품명] (상품번호: [번호])\n2. 경고 내용: [경고 내용 요약]\n\n3. 이의제기 사유:\n본 상품은 정식 유통 경로를 통해 정품을 구매하여 판매하고 있으며, 이를 증빙할 수 있는 자료를 첨부합니다.\n\n- 구매 영수증/거래명세서: [첨부]\n- 정품 인증: [해당 시 첨부]\n\n상표법 제108조에 따른 권리소진 원칙에 의거, 정당하게 유통된 정품의 재판매는 상표권 침해에 해당하지 않습니다.\n\n4. 요청사항:\n위 증빙 자료 확인 후 판매 재개 조치를 요청드립니다.\n\n감사합니다.\n[업체명] / [대표자명] / [연락처]',
          },
        ],
      },
      {
        title: '이의제기 제출',
        description: '작성한 이의제기서를 제출합니다.',
        detailedInstructions: [
          '쿠팡 Wing의 "판매자 지원" 메뉴에서 이의제기를 제출하세요.',
          '이메일로 경고를 받았다면 답장으로 이의제기서를 보내세요.',
          '증빙 자료를 빠짐없이 첨부하세요.',
          '제출 후 접수 확인 메일이 오는지 확인하세요.',
        ],
      },
      {
        title: '대응 결과 확인',
        description: '이의제기에 대한 결과를 확인합니다.',
        detailedInstructions: [
          '보통 5~10영업일 내에 결과가 나와요.',
          '판매 재개가 승인되면 상품을 다시 활성화하세요.',
          '거부된 경우, 추가 증빙이 필요한지 확인하세요.',
          '필요시 법률 전문가 상담을 고려하세요.',
        ],
      },
      {
        title: '재발 방지 조치',
        description: '같은 문제가 다시 발생하지 않도록 예방합니다.',
        detailedInstructions: [
          '구매 증빙을 항상 보관하는 습관을 들이세요.',
          '상품 설명에 타 브랜드명을 불필요하게 사용하지 마세요.',
          '이미지는 직접 촬영하거나 사용 허가된 것만 사용하세요.',
          '민감한 브랜드(명품, 유명 브랜드) 상품은 더욱 주의하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/3-1.-------------------------------.png', alt: '지식재산권 교육 수강 화면', caption: '단기 대책: 지식재산권 관련 교육 이수' },
        ],
      },
      {
        title: '법률 상담 필요 시',
        description: '전문 법률 상담이 필요한 경우의 대응 방법입니다.',
        detailedInstructions: [
          '대한법률구조공단(132)에서 무료 법률 상담이 가능해요.',
          '지식재산 전문 변호사에게 상담받을 수도 있어요.',
          '소상공인시장진흥공단에서 법률 지원 프로그램도 있어요.',
          '비용이 걱정되면 무료 상담부터 시작하세요.',
        ],
        externalLink: { url: 'https://www.klac.or.kr', label: '대한법률구조공단' },
      },
    ],
    faqs: [
      {
        question: '이의제기를 해도 거부되면 어떡하나요?',
        answer:
          '추가 증빙을 보강하여 재이의 가능하고, 쿠팡 분쟁 조정 절차를 이용할 수 있어요. 최후 수단으로 법률 상담을 받으세요.',
      },
      {
        question: '리셀(되팔기)은 합법인가요?',
        answer:
          '정품을 정당하게 구매한 경우 재판매는 합법이에요 (권리소진 원칙). 다만, 상품 상태를 위조하거나 허위 광고를 하면 안 돼요.',
      },
      {
        question: '경고를 받으면 바로 계정이 정지되나요?',
        answer:
          '보통 첫 경고에서 바로 정지되지는 않아요. 하지만 반복되거나 대응하지 않으면 정지될 수 있으니 빠르게 대응하세요.',
      },
    ],
    relatedArticleIds: ['supplier-takedown', 'difficult-customer'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 9. 법률/권리 - 리셀 삭제 요청 대응
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'supplier-takedown',
    categoryId: 'legal-ip',
    title: '리셀 삭제 요청 대응',
    subtitle: '공급업체가 판매 중단을 요구할 때 대처법',
    icon: '🚫',
    estimatedTime: '약 20분',
    overview:
      '도매처나 브랜드 측에서 "우리 제품을 팔지 말라"고 요구할 때 어떻게 대응해야 하는지 알려드려요. 법적으로 정당한 리셀인 경우 무조건 따를 필요는 없어요.',
    steps: [
      {
        title: '요구 내용 정확히 파악',
        description: '상대방이 어떤 근거로 삭제를 요구하는지 파악합니다.',
        detailedInstructions: [
          '삭제 요구 메일/메시지의 전체 내용을 읽으세요.',
          '요구의 법적 근거가 있는지 확인하세요.',
          '요구자가 실제 권리자인지 확인하세요.',
          '요구 사항이 구체적으로 무엇인지 정리하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/1.---------------------------------------------------------------------.jpg', alt: '지식재산권 침해 사례 유형', caption: '상표권·디자인권·특허권 침해 유형별 사례 - 삭제 요구 근거 파악에 활용' },
        ],
        tip: '"판매하지 마세요"라는 단순 요청만으로는 법적 강제력이 없어요. 근거를 확인하세요.',
      },
      {
        title: '내 판매의 정당성 확인',
        description: '내가 해당 상품을 판매할 권리가 있는지 확인합니다.',
        detailedInstructions: [
          '상품을 정당한 경로로 구매했는지 확인하세요.',
          '독점 판매 계약에 서명한 적이 없는지 확인하세요.',
          '상품 설명에 오해 소지가 없는지 점검하세요.',
          '구매 증빙을 확보하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/2-1.------------------------------------------------.png', alt: '쿠팡 상품번호 검색 화면', caption: '쿠팡 Wing에서 해당 상품의 판매 상태 확인하기' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/2-2.---------------------------------------------------1-.png', alt: '상품 판매 상태 확인', caption: '상품 판매중지/삭제 여부 확인 화면' },
        ],
        tip: 'KIPRIS(특허정보검색서비스)에서 해당 브랜드의 상표권·디자인권 등록 여부를 미리 확인하면 내 판매의 정당성을 판단하는 데 도움이 돼요.',
      },
      {
        title: '대응 방침 결정',
        description: '상황에 따라 대응 방향을 정합니다.',
        detailedInstructions: [
          '법적 근거가 있는 경우 (진짜 상표권 침해 등): 판매 중단 고려',
          '단순 요청인 경우 (독점 계약 없이 "팔지 말라"): 정중히 거절 가능',
          '애매한 경우: 추가 확인 또는 전문가 상담',
          '도매처와의 관계를 고려하여 최종 결정하세요.',
        ],
        warning: '법적 근거 없이 무조건 따를 필요는 없지만, 도매처와의 관계도 고려해야 해요.',
      },
      {
        title: '답변 작성',
        description: '상황에 맞는 답변을 작성합니다.',
        detailedInstructions: [
          '아래 상황별 템플릿을 참고하여 답변을 작성하세요.',
          '항상 정중하고 전문적인 톤을 유지하세요.',
          '감정적 대응은 절대 하지 마세요.',
        ],
        copyableTemplates: [
          {
            label: '정중한 거절 (법적 근거 없는 경우)',
            text: '안녕하세요.\n\n연락 주신 내용 확인했습니다.\n\n저희는 해당 상품을 정식 유통 경로를 통해 정당하게 구매한 후 판매하고 있습니다. 상표법상 권리소진 원칙에 따라 정품의 재판매는 적법한 상행위입니다.\n\n별도의 법적 근거가 있으시다면 관련 자료를 보내주시면 검토하겠습니다.\n\n감사합니다.',
          },
          {
            label: '추가 확인 요청',
            text: '안녕하세요.\n\n연락 주신 내용 확인했습니다.\n\n판매 중단 요청의 구체적인 법적 근거를 보내주시면 검토 후 답변드리겠습니다.\n\n아래 자료를 부탁드립니다:\n1. 권리 보유를 증명하는 서류\n2. 침해 내용의 구체적 설명\n3. 관련 법령 조항\n\n확인 후 빠르게 답변드리겠습니다.\n감사합니다.',
          },
          {
            label: '판매 중단 수용',
            text: '안녕하세요.\n\n연락 주신 내용 확인했습니다.\n\n말씀하신 사항을 검토한 결과, 해당 상품의 판매를 중단하기로 결정했습니다. [날짜]까지 판매 목록에서 제거하겠습니다.\n\n향후 다른 문의사항이 있으시면 말씀해 주세요.\n\n감사합니다.',
          },
        ],
      },
      {
        title: '답변 발송 및 기록 보관',
        description: '작성한 답변을 발송하고 모든 기록을 보관합니다.',
        detailedInstructions: [
          '이메일 또는 공식 채널을 통해 답변을 발송하세요.',
          '발송한 내용과 날짜를 기록해두세요.',
          '상대방의 요구서와 내 답변을 함께 보관하세요.',
          '향후 분쟁에 대비하여 최소 3년간 보관하세요.',
        ],
        tip: '이메일로 답변을 보낼 때 "읽음 확인" 기능을 켜두면 상대방이 언제 확인했는지 기록이 남아요.',
      },
      {
        title: '쿠팡 측 대응',
        description: '쿠팡을 통해 요구가 온 경우의 대응 방법입니다.',
        detailedInstructions: [
          '쿠팡에서 직접 삭제 요청이 온 경우 Wing에서 확인하세요.',
          '이의가 있으면 쿠팡 판매자 지원에 이의제기를 접수하세요.',
          '정당한 판매임을 증명하는 자료를 첨부하세요.',
          '쿠팡의 결정을 확인하고 따르세요.',
        ],
        tip: '쿠팡 판매자 지원센터(1600-9709)에 전화하면 담당자 배정이 빠를 수 있어요. 긴급한 경우 전화와 Wing 문의를 동시에 접수하세요.',
      },
      {
        title: '재발 방지 및 대안 마련',
        description: '향후 같은 문제를 방지하고 대안을 마련합니다.',
        detailedInstructions: [
          '민감한 브랜드 리스트를 만들어 관리하세요.',
          '같은 상품을 다른 공급 경로로 확보할 수 있는지 알아보세요.',
          '구매 증빙을 항상 체계적으로 관리하세요.',
          '필요시 다른 상품으로 대체하는 것도 방법이에요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/07/3-2.--------------------------------------------------------------.png', alt: 'KIPRIS 특허 검색 시스템', caption: 'KIPRIS(한국특허정보원) - 상품 등록 전 상표·특허 검색으로 재발 방지' },
        ],
      },
    ],
    faqs: [
      {
        question: '도매처가 "다시 사지 마라"고 하면요?',
        answer:
          '도매처가 더 이상 판매하지 않겠다고 하면 어쩔 수 없어요. 하지만 이미 구매한 재고를 판매하는 것까지 막을 수는 없습니다.',
      },
      {
        question: '독점 판매 계약이 있는 경우는요?',
        answer:
          '독점 판매 계약이 당사자 간에 존재한다면 법적 효력이 있을 수 있어요. 다만, 제3자인 내가 그 계약에 구속되지는 않아요. 법률 상담을 받아보세요.',
      },
      {
        question: '너무 스트레스받아요. 그냥 판매를 중단할까요?',
        answer:
          '법적 근거 없는 단순 요구라면 굳이 중단할 필요는 없어요. 하지만 스트레스가 크다면 다른 상품으로 전환하는 것도 현명한 선택이에요.',
      },
    ],
    relatedArticleIds: ['ip-issue-handling', 'difficult-customer', 'supplier-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 10. 매출/정산 - 쿠팡 정산 구조 이해
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-settlement',
    categoryId: 'revenue-settlement',
    title: '쿠팡 정산 구조 이해',
    subtitle: '판매 대금이 내 통장에 들어오기까지 전체 흐름',
    icon: '🏦',
    estimatedTime: '약 15분',
    overview:
      '쿠팡에서 상품을 팔면 언제, 얼마가 정산되는지 궁금하셨죠? 정산 주기, 수수료 구조, 정산금 확인 방법, 세금계산서 처리까지 정산의 모든 것을 알려드려요.',
    steps: [
      {
        title: '쿠팡 정산 주기 이해',
        description: '판매 대금이 언제 입금되는지 정산 주기를 알아봅니다.',
        detailedInstructions: [
          '쿠팡 마켓플레이스 정산은 월 2회 진행됩니다.',
          '1차 정산: 1일~15일 구매확정 건 → 익월 1일 입금',
          '2차 정산: 16일~말일 구매확정 건 → 익월 16일 입금',
          '구매확정은 배송완료 후 자동 확정(7일) 또는 고객 수동 확정 시점이에요.',
          '즉, 판매 → 배송완료 → 구매확정 → 정산 순서로 진행됩니다.',
        ],
        images: [
          { src: 'https://allraproduct.s3.ap-northeast-2.amazonaws.com/blog/img1_1712426591369.webp', alt: '정산 주기 설명', caption: '정산 유형 (월정산/주정산) 안내' },
          { src: 'https://allraproduct.s3.ap-northeast-2.amazonaws.com/blog/img3_1712426591650.webp', alt: '정산 반영 기간', caption: '배송완료 → 구매확정 → 정산 반영 기간' },
        ],
        tip: '구매확정이 빨리 될수록 정산도 빨라져요. 빠른 배송이 정산에도 유리합니다!',
        warning: '반품·환불이 발생하면 해당 금액은 정산에서 차감돼요. 반품이 많으면 마이너스 정산도 가능하니 주의하세요.',
      },
      {
        title: '수수료 구조 파악',
        description: '쿠팡이 가져가는 수수료 항목을 이해합니다.',
        detailedInstructions: [
          '판매 수수료: 카테고리별로 다릅니다 (보통 7.8%~10.8%).',
          '주요 카테고리별 수수료율:',
          '- 식품: 7.8% / 생활용품: 8.8% / 패션: 10.8% / 전자기기: 7.8%',
          '- 뷰티: 9.8% / 스포츠: 10.8% / 도서: 5.8%',
          '결제 수수료: 판매 수수료에 포함되어 별도 없음.',
          '배송비: 유료 배송 설정 시 고객이 부담, 무료배송이면 판매자 부담.',
          '실제 정산금 = 판매가 - 판매수수료 - 반품/환불 차감액',
        ],
        tip: '카테고리를 잘 선택하면 수수료를 절약할 수 있어요. 같은 상품도 카테고리에 따라 수수료가 달라질 수 있습니다.',
      },
      {
        title: 'Wing에서 정산 내역 확인',
        description: '쿠팡 Wing에서 정산 상세 내역을 확인하는 방법입니다.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인하세요.',
          '"정산관리" → "정산내역" 메뉴를 클릭하세요.',
          '정산 기간별로 상세 내역을 확인할 수 있어요.',
          '각 항목별로 판매금액, 수수료, 반품 차감, 최종 정산금이 표시됩니다.',
          '"정산내역 다운로드"로 엑셀 파일을 받을 수 있어요.',
        ],
        externalLink: { url: 'https://wing.coupang.com', label: '쿠팡 Wing 바로가기' },
      },
      {
        title: '정산 상세 항목 분석',
        description: '정산 내역의 각 항목이 무엇을 의미하는지 알아봅니다.',
        detailedInstructions: [
          '상품판매대금: 고객이 결제한 총 금액',
          '배송비 수입: 유료 배송 시 고객이 낸 배송비',
          '판매수수료: 카테고리별 수수료 (마이너스 항목)',
          '반품/환불 차감: 정산 기간 내 반품된 금액 (마이너스 항목)',
          '기타 차감: 광고비, 과오납 조정 등',
          '최종정산금: 실제 입금되는 금액',
        ],
        images: [
          { src: 'https://allraproduct.s3.ap-northeast-2.amazonaws.com/blog/img2_1712426591487.webp', alt: '정산 금액 계산 방식', caption: '매출액 - 공제금액 = 정산액 계산 구조' },
        ],
        tip: '매번 정산 내역을 꼼꼼히 확인하세요. 간혹 누락이나 오류가 있을 수 있고, 이의제기 기한이 있어요.',
      },
      {
        title: '정산 대금 입금 확인',
        description: '정산금이 실제로 입금되었는지 확인합니다.',
        detailedInstructions: [
          '정산일(1일 또는 16일)에 등록된 은행 계좌를 확인하세요.',
          '입금자명은 "쿠팡(주)" 또는 "COUPANG"으로 표시됩니다.',
          '정산 금액과 Wing의 정산내역 금액이 일치하는지 확인하세요.',
          '불일치 시 "정산관리" → "정산문의"에서 문의하세요.',
        ],
        warning: '계좌 정보가 변경되면 반드시 Wing에서 업데이트하세요. 잘못된 계좌로 입금되면 처리가 복잡해져요.',
      },
      {
        title: '세금계산서 확인 및 처리',
        description: '부가세 신고를 위한 세금계산서를 확인합니다.',
        detailedInstructions: [
          '쿠팡은 판매수수료에 대해 세금계산서를 발행합니다.',
          'Wing "정산관리" → "세금계산서"에서 확인 가능해요.',
          '매월 초에 전월분 세금계산서가 발행됩니다.',
          '국세청 홈택스에서도 전자세금계산서를 조회할 수 있어요.',
          '부가세 신고 시 매입세액 공제를 위해 반드시 확인하세요!',
        ],
        externalLink: { url: 'https://www.hometax.go.kr', label: '국세청 홈택스' },
      },
      {
        title: '정산 관련 주의사항',
        description: '정산 시 자주 발생하는 문제와 주의사항입니다.',
        detailedInstructions: [
          '정산 보류: 서류 미비, 사기 의심 등으로 정산이 보류될 수 있어요.',
          '마이너스 정산: 반품이 많으면 정산금이 마이너스가 될 수 있어요.',
          '마이너스 정산 시 다음 정산에서 차감되거나, 쿠팡에서 별도 청구할 수 있어요.',
          '정산 이의제기는 정산일로부터 6개월 이내에 해야 해요.',
          '월별 정산 내역을 엑셀로 다운받아 보관하는 습관을 들이세요.',
        ],
      },
      {
        title: '수익성 분석 방법',
        description: '실제로 얼마를 벌고 있는지 정확히 파악하는 방법입니다.',
        detailedInstructions: [
          '순이익 = 정산금 - 상품 매입비 - 배송비(판매자 부담) - 기타 비용',
          '상품별 수익률을 정기적으로 계산하세요.',
          '수익률이 낮은 상품은 가격 조정이나 판매 중단을 고려하세요.',
          '월별로 매출, 비용, 순이익을 정리하면 사업 방향이 보여요.',
          '엑셀이나 가계부 앱을 활용하면 편해요.',
        ],
        tip: '매출이 높아도 순이익이 낮으면 의미가 없어요. 반드시 순이익 기준으로 분석하세요!',
      },
    ],
    faqs: [
      {
        question: '정산일인데 입금이 안 돼요.',
        answer:
          '정산일이 주말·공휴일이면 다음 영업일에 입금됩니다. 그래도 입금이 안 되면 Wing "정산관리" → "정산문의"에서 문의하세요. 서류 미비로 보류된 경우도 있어요.',
      },
      {
        question: '정산 금액이 예상보다 적어요.',
        answer:
          '판매수수료, 반품 차감, 배송비 정산 등을 확인해보세요. Wing "정산내역"에서 항목별 상세 내역을 다운받으면 정확히 파악할 수 있어요.',
      },
      {
        question: '계좌를 변경하고 싶어요.',
        answer:
          'Wing "판매자정보" → "정산정보"에서 변경 가능해요. 사업자 명의의 계좌만 등록할 수 있고, 변경 후 다음 정산부터 적용됩니다.',
      },
      {
        question: '마이너스 정산이 되면 어떡하나요?',
        answer:
          '다음 정산에서 자동으로 차감되거나, 쿠팡에서 별도 청구서를 보낼 수 있어요. 반품률 관리가 중요한 이유이기도 해요.',
      },
    ],
    relatedArticleIds: ['vat-filing', 'coupang-invoice', 'seasonal-event-prep'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 11. 매출/정산 - 부가세 신고 방법
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'vat-filing',
    categoryId: 'revenue-settlement',
    title: '부가세 신고 방법',
    subtitle: '분기별 부가가치세 신고의 모든 것',
    icon: '📊',
    estimatedTime: '약 30분~1시간',
    overview:
      '사업자라면 반드시 해야 하는 부가가치세(부가세) 신고! 언제, 어떻게, 무엇을 신고해야 하는지 초보자도 따라할 수 있도록 단계별로 알려드려요. 홈택스에서 직접 하는 방법과 세무사에게 맡기는 방법 모두 안내합니다.',
    steps: [
      {
        title: '부가세 신고란?',
        description: '부가가치세 신고의 기본 개념을 이해합니다.',
        detailedInstructions: [
          '부가세는 상품을 팔 때 받은 세금(매출세액)에서 물건을 살 때 낸 세금(매입세액)을 뺀 차액을 납부하는 세금이에요.',
          '납부 세액 = 매출세액(판매 시 받은 부가세) - 매입세액(구매 시 낸 부가세)',
          '일반과세자는 매출의 10%가 부가세예요.',
          '부가세는 별도로 모아둬야 하는 돈이에요! 매출에 포함되어 있어서 내 수익이 아닙니다.',
        ],
        warning: '부가세를 매출과 혼동하면 안 돼요! 판매 대금의 약 10%는 나중에 세금으로 내야 할 돈이에요. 미리 별도로 관리하세요.',
      },
      {
        title: '신고 시기 확인',
        description: '부가세 신고 기한을 확인합니다.',
        detailedInstructions: [
          '일반과세자는 1년에 2번 확정 신고 + 2번 예정 신고가 있어요.',
          '1기 예정: 1~3월분 → 4월 25일까지 신고·납부',
          '1기 확정: 4~6월분 → 7월 25일까지 신고·납부',
          '2기 예정: 7~9월분 → 10월 25일까지 신고·납부',
          '2기 확정: 10~12월분 → 다음 해 1월 25일까지 신고·납부',
          '개인사업자 예정신고는 보통 세무서에서 고지서로 대체해요 (직접 신고 안 해도 됨).',
          '실질적으로 개인사업자는 1월, 7월 2번만 신고하면 됩니다!',
        ],
        tip: '신고 기한을 절대 놓치지 마세요! 캘린더에 미리 등록해두세요. 늦으면 가산세(무신고 20%, 납부지연 연 8.76%)가 붙어요.',
      },
      {
        title: '신고에 필요한 자료 준비',
        description: '부가세 신고를 위해 미리 준비해야 할 자료를 정리합니다.',
        detailedInstructions: [
          '매출 자료:',
          '- 쿠팡 Wing "정산관리" → 분기별 매출 내역 다운로드',
          '- 네이버 스마트스토어 등 다른 채널 매출 내역',
          '- 현금영수증 발행 내역',
          '매입 자료:',
          '- 도매처 구매 세금계산서/신용카드 매입 내역',
          '- 사업용 지출 영수증 (포장재, 사무용품 등)',
          '- 쿠팡 판매수수료 세금계산서 (매입세액 공제 가능!)',
          '기타: 사업자등록증 사본, 통장 사본',
        ],
        images: [
          { src: 'https://jjongsemusa.com/weapon/2025/05/%EB%B6%80%EA%B0%80%EA%B0%80%EC%B9%98%EC%84%B8%EC%8B%A0%EA%B3%A0%EC%A1%B0%ED%9A%8C%EB%A1%9C%EA%B7%B8%EC%9D%B8_2024%EA%B7%80%EC%86%8D.jpg', alt: '홈택스 부가가치세 신고 조회 화면', caption: '홈택스 로그인 후 부가가치세 신고 조회 메뉴' },
        ],
        tip: '쿠팡 판매수수료에 대한 세금계산서는 매입세액 공제가 가능해요! 꼭 챙기세요.',
      },
      {
        title: '홈택스에서 직접 신고하기',
        description: '국세청 홈택스에서 부가세를 직접 신고하는 방법입니다.',
        detailedInstructions: [
          '국세청 홈택스(hometax.go.kr)에 공인인증서로 로그인하세요.',
          '"신고/납부" → "부가가치세" → "일반과세자 정기신고"를 클릭하세요.',
          '기본정보(사업자번호, 신고기간)를 확인하세요.',
          '매출 내역 입력: 과세 매출 금액을 입력하세요.',
          '매입 내역 입력: 세금계산서, 신용카드 매입액을 입력하세요.',
          '전자세금계산서는 자동으로 불러와져요. 수기 세금계산서는 직접 입력!',
          '납부세액을 확인하고 "신고서 제출"을 클릭하세요.',
          '납부서를 출력하거나 전자납부하세요.',
        ],
        images: [
          { src: 'https://www.korea.kr/newsWeb/resources/attaches/2025.01/21/8e1f64ec3e44dfcf812d73f9bd62c476.jpg', alt: '홈택스 부가세 신고 안내', caption: '홈택스 부가가치세 신고 화면 안내' },
          { src: 'https://www.korea.kr/newsWeb/resources/attaches/2025.01/21/66529c5a72d90b807fb77a97b1236d48.jpg', alt: '부가세 신고 절차', caption: '부가세 신고 절차 카드뉴스' },
          { src: 'https://www.korea.kr/newsWeb/resources/attaches/2025.01/21/e8be3094d07dc9a6a5103c5e43400d0b.jpg', alt: '부가세 신고 팁', caption: '신고 시 유의사항' },
        ],
        externalLink: { url: 'https://www.hometax.go.kr', label: '국세청 홈택스' },
        warning: '매출 누락은 가산세 대상이에요! 쿠팡뿐 아니라 모든 판매 채널의 매출을 합산해야 해요.',
      },
      {
        title: '세무사에게 맡기기',
        description: '직접 하기 어려우면 세무사에게 위임하는 방법입니다.',
        detailedInstructions: [
          '세무대리 비용: 월 5~15만원 (기장료) + 신고 대리 비용',
          '초보 셀러나 매출이 커지면 세무사 이용을 강력 추천해요!',
          '세무사에게 맡기면: 기장(장부 작성) + 부가세 신고 + 종소세 신고까지 해줘요.',
          '세무사 찾는 방법: 지인 추천, 국세청 세무사 검색, 세무 플랫폼(삼쩜삼, 세이브택스 등)',
          '세무사에게 매월 매출·매입 자료를 보내주세요.',
        ],
        tip: '연 매출 4,800만원 이상이면 세무사 이용을 추천해요. 절세 효과가 세무사 비용보다 훨씬 클 수 있어요!',
      },
      {
        title: '매입세액 공제 챙기기',
        description: '사업 관련 지출에서 부가세를 돌려받는 방법입니다.',
        detailedInstructions: [
          '사업 관련 물품 구매 시 꼭 세금계산서를 받으세요!',
          '공제 가능 항목:',
          '- 상품 매입비 (도매처 구매)',
          '- 쿠팡/네이버 판매수수료',
          '- 포장재, 택배비',
          '- 사무용품, 장비 구매',
          '- 사업용 차량 유류비',
          '공제 불가 항목: 개인 용도 지출, 접대비(한도 초과분)',
          '사업용 신용카드를 등록하면 매입세액이 자동으로 집계돼요.',
        ],
        tip: '사업용 신용카드를 홈택스에 등록해두면 매입세액이 자동 집계되어 편리해요!',
      },
      {
        title: '부가세 납부하기',
        description: '계산된 부가세를 납부하는 방법입니다.',
        detailedInstructions: [
          '홈택스에서 바로 전자납부 가능 (계좌이체, 신용카드).',
          '은행 방문 납부도 가능해요 (납부서 출력 필요).',
          '신용카드 납부: 납부대행 수수료 0.8% 추가 발생.',
          '납부 기한: 신고 기한과 동일 (1월 25일, 7월 25일).',
          '한꺼번에 내기 어려우면 분납 신청도 가능해요 (1,000만원 초과 시).',
        ],
        warning: '납부 기한을 넘기면 납부지연 가산세(연 8.76%)가 붙어요. 자금을 미리 준비해두세요!',
      },
      {
        title: '자주 하는 실수 방지',
        description: '초보 셀러들이 부가세 신고 시 자주 하는 실수를 알아봅니다.',
        detailedInstructions: [
          '실수 1: 매출 누락 → 쿠팡 외 다른 채널 매출도 반드시 포함!',
          '실수 2: 부가세 미적립 → 매출의 약 3~5%를 별도 통장에 적립하세요.',
          '실수 3: 매입 증빙 미보관 → 세금계산서, 영수증을 꼭 모아두세요.',
          '실수 4: 기한 초과 → 캘린더에 신고 기한 알림을 설정하세요.',
          '실수 5: 사업용·개인용 혼용 → 사업용 통장/카드를 따로 쓰세요.',
        ],
      },
    ],
    faqs: [
      {
        question: '매출이 적어도 신고해야 하나요?',
        answer:
          '네, 매출이 0원이어도 무실적 신고를 해야 해요. 미신고 시 가산세가 부과될 수 있어요. 홈택스에서 "무실적 신고"를 선택하면 간단히 처리됩니다.',
      },
      {
        question: '부가세를 얼마나 준비해둬야 하나요?',
        answer:
          '일반적으로 매출의 3~5% 정도를 별도로 적립해두면 안전해요. 매입이 많으면 실제 납부액은 더 줄어듭니다. 정확한 금액은 "매출세액 - 매입세액"으로 계산하세요.',
      },
      {
        question: '세무사 비용이 부담돼요.',
        answer:
          '매출이 적을 때는 홈택스에서 직접 신고해도 괜찮아요. 또는 삼쩜삼 같은 저렴한 세무 플랫폼을 이용할 수도 있어요. 매출이 커지면 세무사 비용보다 절세 효과가 더 크니 투자라고 생각하세요.',
      },
      {
        question: '간이과세자인데 부가세 신고를 어떻게 하나요?',
        answer:
          '쿠팡 셀러는 일반과세자여야 해요. 만약 간이과세자라면 일반과세자로 전환 신청을 하셔야 합니다. 홈택스 또는 관할 세무서에서 전환 가능해요.',
      },
    ],
    relatedArticleIds: ['coupang-settlement', 'seller-grade-penalty'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 12. 계정관리 - 판매자 등급 & 페널티
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'seller-grade-penalty',
    categoryId: 'account-management',
    title: '판매자 점수 완전 정복',
    subtitle: '쿠팡 판매자 점수 체계와 99점 이상 유지 전략',
    icon: '⭐',
    estimatedTime: '약 20분',
    overview:
      '쿠팡은 판매자의 주문·배송·서비스 품질을 4가지 핵심 지표로 평가하여 점수를 부여해요. 최저 기준은 99점 이상이며, 최근 7일간의 데이터로 산정됩니다. 점수가 기준 미달이면 주의→경고→정지 순으로 제재가 올라가요. 이 가이드에서 정확한 기준과 관리법을 모두 알려드릴게요!',
    steps: [
      {
        title: '판매자 점수 4대 핵심 지표',
        description: '쿠팡이 실제로 평가하는 4가지 항목과 정확한 기준점수를 알아봅니다.',
        detailedInstructions: [
          '쿠팡 판매자 점수는 4가지 핵심 항목으로 구성됩니다:',
          '',
          '① 정시출고완료 (가장 중요!)',
          '- 출고 예정일 내에 출고한 주문 비율',
          '- 패널티 기준: 85점 미만 시 주의',
          '- 목표: 99점 이상 유지',
          '',
          '② 정시배송완료 (참고 지표)',
          '- 배송 예정일 내에 배송 완료한 주문 비율',
          '- 패널티 기준: 75점 미만 시 주의 (국내배송은 직접 패널티 없음)',
          '- 단, 미준수 시 정산 지연 + 고객 CS 부담 증가',
          '',
          '③ 주문이행',
          '- 판매자 귀책 취소 없이 배송 완료한 주문 비율',
          '- 패널티 기준: 기준 미달 시 주의',
          '- 목표: 95% 이상 유지',
          '',
          '④ 24시간 내 답변',
          '- 고객 상품문의를 24시간 내 답변한 비율',
          '- 주말/공휴일/판매자 휴무일은 제외',
          '- 패널티 기준: 50점 미만 시 주의',
          '- 목표: 95% 이상 유지',
        ],
        images: [
          { src: 'https://online-financer.com/wp-content/uploads/2024/10/%EB%82%B4-%EC%BF%A0%ED%8C%A1-%ED%8C%90%EB%A7%A4%EC%9E%90-%EC%A0%90%EC%88%98-1600x548.webp', alt: '쿠팡윙 판매자 점수 대시보드', caption: '쿠팡윙 판매자 점수 확인 화면' },
          { src: 'https://online-financer.com/wp-content/uploads/2024/10/%EC%BF%A0%ED%8C%A1-%ED%8C%90%EB%A7%A4%EC%9E%90-%EC%A0%90%EC%88%98-%ED%8F%89%EA%B0%80%ED%95%AD%EB%AA%A9-1600x527.webp', alt: '판매자 점수 4대 평가항목', caption: '4가지 핵심 평가항목 상세 기준' },
        ],
        tip: '모든 항목의 최저 기준은 99점 이상! 점수 산정은 최근 7일간 데이터 기준이에요.',
        warning: '정시출고완료가 가장 치명적! 85점 미만이면 즉시 주의 단계에 진입합니다.',
      },
      {
        title: '점수 확인 방법 & 모니터링',
        description: 'Wing에서 판매자 점수를 확인하고 추이를 모니터링하는 방법입니다.',
        detailedInstructions: [
          '쿠팡 Wing(wing.coupang.com)에 로그인하세요.',
          '"판매자 정보" → "판매자 점수" 메뉴를 클릭하세요.',
          '전체 점수와 항목별 세부 점수를 확인할 수 있어요.',
          '',
          '확인해야 할 핵심 정보:',
          '- 각 항목별 현재 점수 (7일 기준)',
          '- 지난 주 대비 변화 추이',
          '- 기준 미달 항목 알림',
          '',
          '점수가 떨어지는 항목이 보이면 즉시 원인을 파악하세요:',
          '- 정시출고 낮음 → 출고 소요일 설정 확인, 미처리 주문 확인',
          '- 주문이행 낮음 → 품절 취소 내역 확인, 재고 관리 점검',
          '- 24시간 답변 낮음 → 미응답 문의 확인, 답변 루틴 점검',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/--------.png', alt: '노출점수 관리 화면', caption: '쿠팡윙 > 상품관리 > 노출점수 관리' },
        ],
        tip: '매일 아침 출근하자마자 판매자 점수부터 확인하는 습관을 들이세요!',
      },
      {
        title: '정시출고완료 올리기 전략',
        description: '가장 중요한 정시출고 점수를 99점 이상 유지하는 방법입니다.',
        detailedInstructions: [
          '전략 1 - 출고 소요일 여유 있게 설정',
          '- 당일 출고가 어렵다면 2~3일로 설정 (안전마진 확보)',
          '- 실제 출고 능력보다 여유 있게 설정하되, 너무 길면 노출 불이익',
          '',
          '전략 2 - 하루 최소 2~3회 주문 확인',
          '- 오전 9시, 오후 2시, 오후 6시 정기 확인',
          '- 쿠팡 알림 설정으로 주문 즉시 확인 가능',
          '',
          '전략 3 - 재고 없는 상품 즉시 판매 중지',
          '- 품절 상태에서 주문이 들어오면 취소할 수밖에 없음',
          '- 재고 0 → 즉시 "판매 일시중지" 처리',
          '',
          '전략 4 - 오전 주문은 당일 처리 원칙',
          '- 오전에 들어온 주문은 반드시 당일 출고',
          '- 오후 늦은 주문은 익일 오전 최우선 처리',
          '',
          '전략 5 - 사전 포장 준비',
          '- 인기 상품은 미리 포장해두기',
          '- 송장 출력~부착~택배 접수까지 프로세스 최적화',
        ],
        tip: '출고 소요일을 1일 더 여유 있게 설정하면 정시출고율이 크게 올라요. 단, 3일 이상이면 노출점수에 불이익이 있어요.',
        warning: '가송장(허위 송장) 입력은 절대 금지! 적발 시 즉시 제재 대상입니다.',
      },
      {
        title: '주문이행률 올리기 전략',
        description: '판매자 귀책 취소를 최소화하여 주문이행률을 높이는 방법입니다.',
        detailedInstructions: [
          '핵심 원칙: 한 번 받은 주문은 반드시 이행한다!',
          '',
          '전략 1 - 재고 보수적 관리',
          '- 실제 재고보다 80~90%만 등록 (안전재고 확보)',
          '- 여러 플랫폼 동시 판매 시 재고 이중 차감 주의',
          '',
          '전략 2 - 품절 취소 방지 시스템',
          '- 재고 5개 이하 시 알림 설정',
          '- 재고 0이면 자동 판매중지 (API 연동 시 자동화 가능)',
          '',
          '전략 3 - 상품 준비 프로세스 표준화',
          '- 주문 접수 → 재고 확인 → 포장 → 송장 입력 → 택배 접수',
          '- 각 단계 체크리스트 활용',
          '',
          '전략 4 - 문제 상품 즉시 조치',
          '- 반복 취소되는 상품 → 원인 분석 후 판매 중지 or 개선',
          '- 공급 불안정 상품 → 대체 공급처 확보',
        ],
        warning: '품절 취소가 반복되면 "주의" 단계에서 바로 "경고"로 올라갈 수 있어요!',
      },
      {
        title: '24시간 내 답변율 올리기 전략',
        description: '고객 문의에 빠르게 응답하여 답변율을 높이는 방법입니다.',
        detailedInstructions: [
          '전략 1 - 하루 3회 문의 확인 루틴',
          '- 오전 9시: 전날 저녁~밤 사이 들어온 문의 처리',
          '- 오후 2시: 오전 문의 처리',
          '- 오후 7시: 오후 문의 처리 (주말/공휴일은 제외되지만 빠른 응답이 유리)',
          '',
          '전략 2 - 자주 묻는 질문 답변 템플릿',
          '- 배송 문의, 교환/반품 문의, 상품 상세 문의 등 유형별 템플릿 준비',
          '- 복사-붙여넣기로 빠르게 응답 (단, 고객별 맞춤 수정 필수)',
          '',
          '전략 3 - 무의미한 답변 절대 금지',
          '- "네", "확인", "." 같은 단답형은 제재 대상!',
          '- 최소 2문장 이상의 성의 있는 답변 작성',
          '',
          '전략 4 - 쿠팡 판매자 앱 활용',
          '- 모바일에서도 문의 알림 받기',
          '- 이동 중에도 빠르게 답변 가능',
        ],
        tip: '주말/공휴일은 측정에서 제외되지만, 빠른 응답은 고객 만족도와 리뷰에 직접 영향을 줘요.',
        copyableTemplates: [
          {
            label: '배송 문의 답변 템플릿',
            text: '안녕하세요, 고객님. 문의 주셔서 감사합니다.\n\n주문하신 상품은 영업일 기준 1~2일 내 출고 예정이며, 출고 후 1~2일 내 배송됩니다. 출고 시 송장번호가 자동으로 안내됩니다.\n\n추가 문의사항이 있으시면 편하게 말씀해주세요. 감사합니다!',
          },
          {
            label: '교환/반품 문의 답변 템플릿',
            text: '안녕하세요, 고객님. 불편을 드려 죄송합니다.\n\n교환/반품은 상품 수령 후 7일 이내 신청 가능합니다. 쿠팡 앱 > 마이쿠팡 > 주문내역에서 "교환/반품 신청"을 눌러주세요.\n\n단순 변심의 경우 반품 배송비가 발생할 수 있습니다. 상품 불량의 경우 무료로 처리해드립니다. 도움이 필요하시면 말씀해주세요!',
          },
        ],
      },
      {
        title: '페널티 체계 & 제재 단계',
        description: '쿠팡의 판매자 제재 체계와 각 단계별 대응 방법입니다.',
        detailedInstructions: [
          '쿠팡 제재는 3단계로 진행됩니다:',
          '',
          '1단계 - 주의(Caution)',
          '- 판매자 대표 메일로 안내 메일 발송',
          '- 개선 기회 부여 (보통 1~2주)',
          '',
          '2단계 - 경고(Warning)',
          '- 검색 노출 제한, 신규 상품 등록 제한 가능',
          '- 개선 계획서 제출 요구',
          '',
          '3단계 - 정지(Suspension)',
          '- 모든 상품 판매 중지',
          '- 심각한 경우 계정 영구 정지',
          '- 동일 사업자번호 재가입 불가',
          '',
          '주요 위반 유형:',
          '- 상품 관리: 품절취소, 상품 불량, 가격 오류',
          '- 배송 관리: 장기 미출고, 배송방법 어뷰징, 가송장',
          '- 응대 관리: 지연 응답, 무의미한 응답, 부적절한 행동',
          '- 비용 관리: 과도한 배송비/반품비 청구',
        ],
        warning: '가품 판매, 상표권 침해, 가송장은 즉시 계정 정지 사유예요! 절대 하지 마세요.',
      },
      {
        title: '계정 정지 8대 사유',
        description: '계정이 영구 정지될 수 있는 8가지 심각한 위반 사유입니다.',
        detailedInstructions: [
          '다음 8가지는 즉시 계정 정지까지 갈 수 있는 심각한 위반입니다:',
          '',
          '① 가품(위조품) 판매 - 가장 심각! 즉시 정지 가능',
          '② 상표권 침해 - 등록 상표 무단 사용',
          '③ 디자인권 침해 - 타인의 디자인 무단 사용',
          '④ 저작권 침해 - 무단 이미지 사용 등',
          '⑤ 허위 상품정보 - 실제와 다른 오해 유발 정보',
          '⑥ 불공정 키워드 사용 - 상품명과 무관한 상표권/키워드 기재',
          '⑦ 단위 용량/개수 부정확 - 정확한 수량 미기입',
          '⑧ 반복적 이용약관 위반 - 누적 시 영구 정지',
          '',
          '지재권 침해 신고 접수 시 처리 절차:',
          '- 해당 상품 즉시 판매 중지',
          '- 심한 경우 다른 상품까지 판매 중지',
          '- 반복 위반 시 계정 자체 제한',
          '- 소명서 제출로 해결 가능 (정품 증빙 자료 필요)',
        ],
        tip: '정품 구매 영수증, 정식 유통 계약서 등 증빙을 항상 보관하세요. 문제 발생 시 소명의 핵심 근거가 됩니다.',
      },
      {
        title: '매주 계정 건강 체크리스트',
        description: '매주 반드시 확인해야 할 계정 건강 관리 체크 항목입니다.',
        detailedInstructions: [
          '매일 체크 (필수):',
          '- 미처리 주문 0건인지 확인',
          '- 미응답 고객 문의 0건인지 확인',
          '- 재고 부족 알림 확인',
          '',
          '매주 체크 (월요일):',
          '- 판매자 점수 4대 항목 확인 (7일 기준)',
          '- 정시출고완료 99% 이상인지',
          '- 주문이행 95% 이상인지',
          '- 24시간 답변율 95% 이상인지',
          '- 반품/교환 요청 처리 상태 확인',
          '',
          '매월 체크:',
          '- 판매 중지된 상품 없는지 확인',
          '- 페널티 알림 메일 확인',
          '- 노출 제한 상품 확인',
          '- 리뷰 평점 추이 확인',
          '- 전월 대비 점수 변화 분석',
        ],
        tip: '이 체크리스트를 캘린더에 반복 일정으로 등록해두면 놓치지 않아요!',
      },
    ],
    faqs: [
      {
        question: '판매자 점수 산정 기간이 어떻게 되나요?',
        answer:
          '최근 7일간의 데이터를 기준으로 산정됩니다. 과거 30일이었으나 7일로 단축되었어요. 따라서 최근 1주일만 잘 관리해도 점수 회복이 빠릅니다.',
      },
      {
        question: '정시배송완료 점수가 낮으면 어떻게 되나요?',
        answer:
          '국내배송의 경우 정시배송완료는 참고 지표예요. 점수 하락으로 인한 직접적인 패널티는 없지만, 정산처리 지연이나 고객 CS 부담 증가가 발생할 수 있으니 관리하는 게 좋아요.',
      },
      {
        question: '페널티를 받으면 어떻게 해결하나요?',
        answer:
          '1) Wing 알림에서 페널티 사유를 정확히 확인하세요. 2) 해당 문제를 즉시 시정하세요. 3) 부당하다면 Wing "판매자 지원" → "이의제기"에서 증빙 자료를 첨부하여 제출하세요. 4) 판매자콜센터(1600-9879)에 전화 상담도 가능해요.',
      },
      {
        question: '주문이 적어도 등급에 영향을 받나요?',
        answer:
          '네, 주문 수가 적으면 한두 건의 취소/반품이 비율에 크게 영향을 줄 수 있어요. 초기에는 소량이라도 품질 높은 판매를 유지하는 게 중요합니다.',
      },
      {
        question: '계정이 정지되면 정산금은 어떻게 되나요?',
        answer:
          '계정 정지 시 미정산 금액은 일정 기간 보류 후 지급됩니다. 다만 위반 과징금이 차감될 수 있어요. 상세한 내용은 쿠팡 판매자 지원에 문의하세요.',
      },
    ],
    relatedArticleIds: ['item-winner-strategy', 'product-exposure-optimization', 'coupang-api-pt-tools', 'coupang-settlement', 'cs-daily-management', 'review-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 부가 혜택 - 네이버 현대카드 발급받기
    // ━━━━━━━━━━━━━━━━━━━━━━
  // 부가 혜택 - 네이버 현대카드 발급받기
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'naver-hyundai-card',
    categoryId: 'extra-benefits',
    title: '네이버 현대카드 발급받기',
    subtitle: '소싱 구매 시 최대 적립 혜택을 누리세요',
    icon: '💳',
    estimatedTime: '약 10분',
    overview:
      '네이버 현대카드는 네이버쇼핑에서 결제 시 최대 적립 혜택을 받을 수 있는 카드예요. 셀러 소싱 구매에 활용하면 매달 상당한 적립금을 돌려받을 수 있습니다.',
    steps: [
      {
        title: '네이버 현대카드 혜택 알아보기',
        description: '카드 발급 전 어떤 혜택이 있는지 확인하세요.',
        detailedInstructions: [
          '네이버 현대카드는 네이버페이 결제 시 추가 적립을 제공하는 제휴 카드입니다.',
          '네이버쇼핑, 네이버페이 가맹점에서 결제 시 기본 적립 외에 추가 적립을 받을 수 있어요.',
          '적립 혜택은 카드 종류(신용/체크)와 전월 실적에 따라 달라집니다.',
        ],
        images: [
          { src: 'https://thumb.mt.co.kr/cdn-cgi/image/w=1024,h=768,f=auto,fit=crop,g=face/21/2025/01/2025012310210587551_1.jpg', alt: '네이버 현대카드 Edition2', caption: '네이버 현대카드 Edition2 - 네이버쇼핑 최대 12% 적립' },
        ],
        tip: '핵심 혜택: 네이버쇼핑 최대 1% 추가 적립 + 네이버페이 가맹점 0.5% 추가 적립. 전월 실적 30만원 이상이면 최대 혜택을 받을 수 있어요.',
      },
      {
        title: '카드 신청 페이지 접속',
        description: '현대카드 홈페이지에서 네이버 현대카드를 신청하세요.',
        detailedInstructions: [
          '아래 링크를 클릭하면 네이버 현대카드 신청 페이지로 이동합니다.',
          '신용카드와 체크카드 중 선택할 수 있어요.',
          '소싱 규모가 크다면 신용카드가, 소규모라면 체크카드가 유리합니다.',
        ],
        images: [
          { src: 'https://d1c5n4ri2guedi.cloudfront.net/card/2794/card_img/39286/2794card_1.png', alt: '네이버 현대카드 Edition2 카드 디자인', caption: '네이버 현대카드 Edition2 카드 실물 이미지' },
        ],
        externalLink: {
          url: 'https://www.hyundaicard.com/cpc/cr/CPCCR0201_01.hc',
          label: '네이버 현대카드 신청 페이지',
        },
      },
      {
        title: '본인인증 및 카드 신청',
        description: '신청서를 작성하고 본인인증을 완료하세요.',
        detailedInstructions: [
          '카드 신청 시 본인인증(휴대폰 인증 또는 공동인증서)이 필요합니다.',
          '직업, 소득, 주소 등 기본 정보를 입력합니다.',
          '신용카드의 경우 심사가 진행되며, 보통 1~3 영업일 내에 결과가 나옵니다.',
          '체크카드는 현대카드 계좌가 있으면 즉시 발급 가능합니다.',
        ],
      },
      {
        title: '카드 수령 후 활성화',
        description: '카드를 받으면 활성화 절차를 진행하세요.',
        detailedInstructions: [
          '카드는 보통 신청 후 5~7 영업일 내에 등기우편으로 배송됩니다.',
          '카드 수령 후 ARS(1577-6000) 또는 현대카드 앱에서 카드를 활성화하세요.',
          '활성화 시 결제 비밀번호와 해외 결제 설정을 함께 진행합니다.',
        ],
      },
      {
        title: '네이버페이에 카드 등록',
        description: '네이버페이 결제수단에 발급받은 카드를 등록하세요.',
        detailedInstructions: [
          '네이버 앱 또는 네이버페이 웹사이트에 접속합니다.',
          '결제수단 관리 → 카드 추가에서 현대카드를 등록합니다.',
          '카드번호, 유효기간, CVC를 입력하고 본인인증을 완료합니다.',
          '등록이 완료되면 네이버쇼핑 결제 시 해당 카드를 선택할 수 있어요.',
        ],
      },
      {
        title: '셀러 소싱에 활용하기',
        description: '상품 구매 시 적립을 극대화하는 방법을 알아보세요.',
        detailedInstructions: [
          '네이버쇼핑에서 소싱 상품을 구매할 때 네이버 현대카드로 결제하세요.',
          '네이버페이 결제 → 현대카드 선택으로 최대 적립을 받을 수 있습니다.',
          '월 소싱 금액이 100만원이면 최대 1만원 이상의 추가 적립이 가능해요.',
          '적립된 네이버페이 포인트는 다음 소싱 구매에 다시 사용할 수 있습니다.',
        ],
        tip: '소싱 구매 전 네이버쇼핑 이벤트 페이지를 확인하세요. 카드사 추가 할인 쿠폰이 있으면 적립과 중복으로 더 큰 혜택을 받을 수 있어요.',
      },
    ],
    faqs: [
      {
        question: '연회비가 있나요?',
        answer:
          '신용카드는 연회비가 1~2만원 정도이며, 전년도 이용 실적에 따라 면제될 수 있어요. 체크카드는 연회비가 없습니다.',
      },
      {
        question: '적립 한도가 있나요?',
        answer:
          '네, 월별 추가 적립 한도가 있어요. 카드 종류에 따라 다르지만 보통 월 1만~5만 포인트 사이입니다. 상세 한도는 카드 상품 안내에서 확인하세요.',
      },
      {
        question: '기존에 쓰던 카드와 비교하면 어떤가요?',
        answer:
          '네이버쇼핑에서 소싱을 많이 한다면 네이버 현대카드가 가장 유리해요. 다른 카드는 네이버 추가 적립이 없기 때문에, 같은 금액을 써도 돌려받는 적립금이 다릅니다.',
      },
    ],
    relatedArticleIds: ['naver-membership', 'naver-review-income'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 부가 혜택 - 네이버 멤버십 가입하기
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'naver-membership',
    categoryId: 'extra-benefits',
    title: '네이버 멤버십 가입하기',
    subtitle: '월 4,900원으로 쇼핑 적립률 극대화',
    icon: '🏷️',
    estimatedTime: '약 5분',
    overview:
      '네이버 멤버십(네이버플러스 멤버십)에 가입하면 네이버쇼핑에서 최대 5% 적립 혜택을 받을 수 있어요. 월 4,900원의 구독료 대비 소싱 구매 적립으로 훨씬 많은 혜택을 돌려받을 수 있습니다.',
    steps: [
      {
        title: '네이버 멤버십 혜택 확인',
        description: '가입 전 멤버십으로 받을 수 있는 혜택을 확인하세요.',
        detailedInstructions: [
          '네이버플러스 멤버십은 월 4,900원의 구독 서비스입니다.',
          '네이버쇼핑에서 결제 시 최대 5% 적립 혜택을 받을 수 있어요.',
          '네이버 시리즈, VIBE 등 디지털 콘텐츠 이용권도 포함됩니다.',
          '네이버쇼핑 일부 상품에서 멤버십 회원 전용 무료배송 혜택도 있어요.',
        ],
        images: [
          { src: 'https://fssblog.com/wp-content/uploads/2025/12/image-722x900.png', alt: '네이버플러스 멤버십 혜택 요약', caption: '네이버플러스 멤버십 주요 혜택 안내' },
          { src: 'https://fssblog.com/wp-content/uploads/2025/12/image-1-598x900.png', alt: '네이버플러스 멤버십 상세 혜택', caption: '멤버십 적립률 및 부가 혜택 상세' },
        ],
      },
      {
        title: '멤버십 가입 페이지 접속',
        description: '네이버 멤버십 가입 페이지에서 가입을 시작하세요.',
        detailedInstructions: [
          '아래 링크를 클릭하면 네이버플러스 멤버십 가입 페이지로 이동합니다.',
          '네이버 계정으로 로그인이 필요합니다.',
          '이미 네이버 계정이 있다면 바로 가입 가능해요.',
        ],
        externalLink: {
          url: 'https://nid.naver.com/membership/join',
          label: '네이버 멤버십 가입 페이지',
        },
      },
      {
        title: '플랜 선택 및 결제',
        description: '월간 또는 연간 플랜을 선택하고 결제하세요.',
        detailedInstructions: [
          '월간 플랜(4,900원/월)과 연간 플랜(할인 적용) 중 선택할 수 있어요.',
          '장기간 이용할 계획이라면 연간 플랜이 더 경제적입니다.',
          '결제 수단으로 네이버 현대카드를 등록하면 결제 자체에서도 적립을 받을 수 있어요.',
          '첫 달 무료 체험이 제공되는 경우도 있으니 확인해보세요.',
        ],
      },
      {
        title: '멤버십 적립 활용법',
        description: '네이버쇼핑에서 추가 적립받는 방법을 알아보세요.',
        detailedInstructions: [
          '멤버십 가입 후 네이버쇼핑에서 결제하면 자동으로 추가 적립이 됩니다.',
          '멤버십 적립은 기본 적립과 별도로 추가 적용돼요.',
          '적립률은 상품 카테고리에 따라 다를 수 있어요 (최대 5%).',
          '적립된 포인트는 네이버페이 포인트로 지급되며, 다음 구매에 바로 사용 가능합니다.',
        ],
        images: [
          { src: 'https://benefitshub.co.kr/wp-content/uploads/2024/10/%EB%84%A4%EC%9D%B4%EB%B2%84-%ED%94%8C%EB%9F%AC%EC%8A%A4-%EB%A9%A4%EB%B2%84%EC%8B%AD-%EC%A0%81%EB%A6%BD-optimized.jpeg', alt: '네이버 플러스 멤버십 적립 혜택', caption: '네이버 플러스 멤버십 포인트 적립률 안내' },
        ],
      },
      {
        title: '셀러 소싱 시 절약 효과 계산',
        description: '월 소싱 금액 대비 얼마나 아끼는지 계산해보세요.',
        detailedInstructions: [
          '월 소싱 금액이 50만원이면: 50만원 × 5% = 25,000원 적립 (구독료 4,900원 차감해도 20,100원 이득)',
          '월 소싱 금액이 100만원이면: 100만원 × 5% = 50,000원 적립 (45,100원 이득)',
          '네이버 현대카드 추가 적립까지 합하면 더 큰 혜택을 받을 수 있어요.',
          '적립 포인트로 다시 소싱 상품을 구매하면 복리 효과도 기대할 수 있습니다.',
        ],
        tip: '월 소싱 금액이 10만원 이상이면 멤버십 구독료 대비 충분한 혜택을 받을 수 있어요. 네이버 현대카드와 함께 사용하면 적립 효과가 극대화됩니다.',
      },
    ],
    faqs: [
      {
        question: '멤버십을 해지하면 어떻게 되나요?',
        answer:
          '해지는 언제든 가능하며, 해지 후에도 남은 구독 기간까지는 혜택이 유지됩니다. 미사용 적립 포인트는 유효기간까지 사용 가능해요.',
      },
      {
        question: '모든 상품에서 적립이 되나요?',
        answer:
          '네이버쇼핑 내 대부분의 상품에서 적립이 가능하지만, 일부 카테고리(예: 여행, 공연 등)는 적립 대상에서 제외될 수 있어요. 구매 전 적립 여부를 확인하세요.',
      },
      {
        question: '네이버 현대카드와 중복 적립이 되나요?',
        answer:
          '네, 멤버십 적립과 카드 적립은 별도로 적용돼요. 네이버 멤버십(최대 5%) + 네이버 현대카드(최대 1%) = 최대 6% 적립이 가능합니다.',
      },
    ],
    relatedArticleIds: ['naver-hyundai-card', 'naver-review-income'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 부가 혜택 - 네이버 리뷰 작성으로 추가 수익 내기
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'naver-review-income',
    categoryId: 'extra-benefits',
    title: '네이버 리뷰 작성으로 추가 수익 내기',
    subtitle: '구매한 상품에 리뷰 쓰고 포인트 적립받으세요',
    icon: '✍️',
    estimatedTime: '건당 약 5분',
    overview:
      '네이버쇼핑에서 구매한 상품에 리뷰를 작성하면 네이버페이 포인트를 적립받을 수 있어요. 소싱으로 구매한 상품에 직접 사용 후기를 남기면 추가 수익을 창출할 수 있습니다.',
    steps: [
      {
        title: '네이버 리뷰 수익 구조 이해',
        description: '리뷰 종류별 적립금을 확인하세요.',
        detailedInstructions: [
          '텍스트 리뷰: 기본 적립금(보통 50~100원)이 지급됩니다.',
          '포토 리뷰: 사진 첨부 시 추가 적립(보통 150~200원)을 받을 수 있어요.',
          '동영상 리뷰: 영상 첨부 시 최대 적립(보통 300~500원)이 가능합니다.',
          '프리미엄 리뷰(500자 이상 + 사진 3장 이상)는 최대 적립금을 받을 수 있어요.',
        ],
        images: [
          { src: 'https://seedmoa.com/wp-content/uploads/2023/09/Naver-Pay-point-accumulation-review-7-512x1024.jpg', alt: '네이버페이 포인트 적립 현황', caption: '리뷰 작성 시 포인트 적립 현황 예시' },
        ],
      },
      {
        title: '리뷰 작성 가능한 상품 확인',
        description: '네이버쇼핑 주문내역에서 리뷰 작성 가능 상품을 확인하세요.',
        detailedInstructions: [
          '네이버쇼핑 → 마이쇼핑 → 주문/배송 내역에서 리뷰 작성 가능한 상품을 확인합니다.',
          '상품 수령 후 리뷰 작성 가능 기간은 보통 90일입니다.',
          '이미 리뷰를 작성한 상품은 "리뷰 작성 완료"로 표시됩니다.',
          '한 주문에 여러 상품이 있으면 각각 리뷰를 작성할 수 있어요.',
        ],
        images: [
          { src: 'https://seedmoa.com/wp-content/uploads/2023/09/Naver-Pay-point-accumulation-review-1-551x1024.jpg', alt: '네이버 주문내역 리뷰 작성 버튼', caption: '마이쇼핑 > 주문내역에서 리뷰 작성 가능 상품 확인' },
          { src: 'https://seedmoa.com/wp-content/uploads/2023/09/Naver-Pay-point-accumulation-review-2-554x1024.jpg', alt: '리뷰 작성 가능 목록', caption: '리뷰 작성 가능한 상품 목록' },
        ],
      },
      {
        title: '효과적인 리뷰 작성법',
        description: '최대 적립을 받기 위한 리뷰 작성 요령을 알아보세요.',
        detailedInstructions: [
          '리뷰 텍스트는 500자 이상 작성하면 프리미엄 리뷰로 인정돼요.',
          '사진은 3장 이상 첨부하세요. 상품 전체 사진, 디테일 사진, 사용 사진을 포함하면 좋아요.',
          '실제 사용 경험을 솔직하게 작성하면 도움이 됩니다.',
          '상품의 장단점, 배송 상태, 가성비 등을 구체적으로 언급하세요.',
        ],
        images: [
          { src: 'https://seedmoa.com/wp-content/uploads/2023/09/Naver-Pay-point-accumulation-review-3-552x1024.jpg', alt: '리뷰 작성 화면', caption: '네이버 쇼핑 리뷰 작성 화면' },
          { src: 'https://seedmoa.com/wp-content/uploads/2023/09/Naver-Pay-point-accumulation-review-4-552x1024.jpg', alt: '사진 첨부 리뷰 작성', caption: '사진/동영상 첨부로 추가 적립 받기' },
        ],
      },
      {
        title: '한달 리뷰 수익 시뮬레이션',
        description: '매달 리뷰 작성으로 얼마를 벌 수 있는지 계산해보세요.',
        detailedInstructions: [
          '프리미엄 리뷰 1건당 평균 300~500원 적립 가능',
          '월 20건 작성 시: 20 × 400원 = 약 8,000원',
          '월 50건 작성 시: 50 × 400원 = 약 20,000원',
          '소싱 상품이 다양할수록 리뷰 작성 건수를 늘릴 수 있어요.',
        ],
        tip: '소싱 상품을 직접 사용해보고 리뷰를 작성하면, 상품 품질도 확인하고 적립금도 받는 일석이조 효과를 얻을 수 있어요.',
      },
      {
        title: '셀러 소싱 상품 리뷰 활용',
        description: '소싱한 상품의 직접 사용 후기로 이중 수익을 올리세요.',
        detailedInstructions: [
          '소싱 구매한 상품 중 일부를 직접 사용해보세요.',
          '실제 사용 경험을 바탕으로 리뷰를 작성하면 고품질 리뷰가 됩니다.',
          '이 리뷰는 다른 구매자에게 도움이 되어 해당 상품의 판매에도 긍정적 영향을 줍니다.',
          '적립된 포인트는 다시 소싱 구매에 활용할 수 있어요.',
        ],
      },
      {
        title: '리뷰 작성 시 주의사항',
        description: '계정 제재를 방지하기 위해 반드시 알아야 할 규정입니다.',
        detailedInstructions: [
          '허위 리뷰나 과장된 리뷰는 네이버 규정 위반으로 제재받을 수 있어요.',
          '같은 내용을 복사·붙여넣기하는 반복 리뷰는 삭제 처리될 수 있습니다.',
          '타인의 사진을 도용하거나 AI로 생성한 리뷰는 금지입니다.',
          '적립금을 목적으로 한 대량 허위 리뷰 작성은 계정 정지 사유가 됩니다.',
        ],
        warning: '네이버는 리뷰 어뷰징을 강력하게 단속하고 있어요. 실제 구매·사용 경험을 바탕으로 솔직한 리뷰만 작성하세요. 규정 위반 시 적립금 회수 및 계정 제재를 받을 수 있습니다.',
      },
    ],
    faqs: [
      {
        question: '적립금은 언제 지급되나요?',
        answer:
          '리뷰 작성 후 보통 1~3일 내에 네이버페이 포인트로 지급됩니다. 프리미엄 리뷰의 경우 검수 후 지급되므로 조금 더 걸릴 수 있어요.',
      },
      {
        question: '리뷰를 삭제하면 적립금은 어떻게 되나요?',
        answer:
          '리뷰를 삭제하면 지급된 적립금이 회수될 수 있어요. 한번 작성한 리뷰는 가급적 유지하는 것이 좋습니다.',
      },
      {
        question: '월 최대 적립 한도가 있나요?',
        answer:
          '네이버쇼핑 리뷰 적립금은 월별 한도가 있을 수 있어요. 상세한 한도는 네이버 쇼핑 리뷰 정책 페이지에서 확인하세요.',
      },
    ],
    relatedArticleIds: ['naver-hyundai-card', 'naver-membership'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 16. 광고/마케팅 - 쿠팡 광고 운영 기초
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-ad-basics',
    categoryId: 'advertising',
    title: '쿠팡 광고 운영 기초',
    subtitle: '첫 광고 캠페인부터 ROAS 분석까지',
    icon: '📢',
    estimatedTime: '약 25분',
    overview:
      '쿠팡에서 광고를 집행하면 상품 노출이 크게 늘어나요. 광고 유형별 특징, 캠페인 만들기, 키워드·입찰가 설정, 예산 관리, ROAS 분석, 자동광고 활용까지 초보자도 따라할 수 있도록 안내합니다.',
    steps: [
      {
        title: '쿠팡 광고 유형 이해',
        description: '쿠팡에서 사용할 수 있는 광고 종류를 파악합니다.',
        detailedInstructions: [
          '쿠팡 광고센터(ads.coupang.com)에 접속하세요.',
          '쿠팡 광고는 크게 3가지 유형이 있어요:',
          '1. 검색광고(CPC): 고객이 키워드 검색 시 상단에 노출. 클릭당 과금.',
          '2. 디스플레이광고: 메인/카테고리 페이지 배너. 노출당 과금(CPM).',
          '3. 브랜드광고: 브랜드 전용 영역. 브랜드 등록 판매자만 가능.',
          '초보 셀러는 검색광고(CPC)부터 시작하는 것을 추천해요!',
        ],
        tip: '처음에는 검색광고(CPC)만 집중하세요. 클릭할 때만 비용이 들어 예산 관리가 쉬워요.',
      },
      {
        title: '광고 캠페인 만들기',
        description: '첫 번째 광고 캠페인을 생성합니다.',
        detailedInstructions: [
          '쿠팡 광고센터 → "캠페인 관리" → "새 캠페인 만들기"를 클릭하세요.',
          '캠페인 유형에서 "검색광고"를 선택하세요.',
          '캠페인 이름을 알아보기 쉽게 설정하세요 (예: "주방용품_검색광고_01월").',
          '광고할 상품을 선택하세요. 처음에는 1~3개 상품으로 시작하세요.',
          '일 예산을 설정하세요 (처음에는 5,000~10,000원 추천).',
          '캠페인 시작일과 종료일을 설정하세요 (종료일 없음도 가능).',
        ],
        warning: '처음부터 많은 상품에 큰 예산을 걸지 마세요. 소액으로 테스트 후 효과 좋은 상품에 집중 투자하세요.',
      },
      {
        title: '키워드 설정',
        description: '광고가 노출될 검색 키워드를 설정합니다.',
        detailedInstructions: [
          '캠페인 생성 후 "키워드 추가" 단계로 이동하세요.',
          '쿠팡이 추천하는 키워드를 먼저 확인하세요.',
          '상품과 관련된 키워드를 직접 입력해서 추가할 수도 있어요.',
          '키워드 매칭 유형을 선택하세요:',
          '- 일치: 정확히 해당 키워드를 검색할 때만 노출',
          '- 구문: 해당 키워드가 포함된 검색어에 노출',
          '- 확장: 관련 검색어에도 폭넓게 노출',
          '처음에는 "구문" 매칭으로 시작하는 것을 추천해요.',
        ],
        tip: '너무 넓은 키워드(예: "주방")보다 구체적 키워드(예: "스테인리스 텀블러 500ml")가 전환율이 높아요.',
      },
      {
        title: '입찰가 설정',
        description: '클릭당 비용(CPC)을 설정합니다.',
        detailedInstructions: [
          '키워드별로 입찰가를 설정하세요.',
          '쿠팡이 추천하는 입찰가를 참고하되, 처음에는 추천가의 80~100% 수준으로 시작하세요.',
          '입찰가가 높을수록 상위에 노출되지만 비용도 증가해요.',
          '키워드별 예상 순위를 확인할 수 있어요.',
          '경쟁이 심한 키워드는 입찰가가 높아지니 주의하세요.',
        ],
        warning: '입찰가 전쟁에 빠지지 마세요. 상품 마진의 10~15% 이내로 입찰가를 유지하는 것이 안전해요.',
      },
      {
        title: '예산 관리',
        description: '광고 예산을 효율적으로 관리합니다.',
        detailedInstructions: [
          '일 예산: 하루에 쓸 수 있는 최대 금액을 설정하세요.',
          '총 예산: 캠페인 전체 기간의 최대 예산을 설정할 수 있어요.',
          '일 예산이 소진되면 해당 날은 광고가 자동 중지됩니다.',
          '예산 소진 속도를 매일 확인하세요.',
          '효과가 좋으면 예산을 점진적으로 늘리세요 (한 번에 50% 이내 증가).',
        ],
        tip: '주말/월초/월말에 검색량이 달라요. 매출이 높은 시간대에 맞춰 예산을 조절하면 효율이 올라가요.',
      },
      {
        title: 'ROAS 분석',
        description: '광고 수익률을 분석하고 판단합니다.',
        detailedInstructions: [
          'ROAS = (광고를 통한 매출 ÷ 광고비) × 100%',
          '예: 광고비 10,000원으로 50,000원 매출 → ROAS 500%',
          '쿠팡 광고센터 → "리포트"에서 캠페인별 ROAS를 확인하세요.',
          '일반적으로 ROAS 300% 이상이면 수익성이 있다고 봐요.',
          'ROAS가 낮은 키워드는 입찰가를 낮추거나 중단하세요.',
          'ROAS가 높은 키워드는 입찰가를 올려 더 많은 노출을 확보하세요.',
        ],
        tip: 'ROAS만 보지 말고 실제 순이익도 계산하세요. 매출이 높아도 마진이 낮으면 광고비를 감당하기 어려워요.',
      },
      {
        title: '광고 최적화',
        description: '데이터를 기반으로 광고 성과를 개선합니다.',
        detailedInstructions: [
          '최소 1~2주 데이터를 모은 후 최적화를 시작하세요.',
          '클릭률(CTR)이 낮은 키워드: 키워드가 상품과 맞는지 확인하세요.',
          '전환율이 낮은 키워드: 상품 상세페이지, 가격, 리뷰를 점검하세요.',
          '비용 대비 효율이 낮은 키워드: 입찰가를 낮추거나 삭제하세요.',
          '성과 좋은 키워드를 발견하면 별도 캠페인으로 분리하여 집중 운영하세요.',
          '주 1회 이상 정기적으로 성과를 점검하세요.',
        ],
      },
      {
        title: '자동광고 활용',
        description: '쿠팡 자동광고로 손쉽게 광고를 운영합니다.',
        detailedInstructions: [
          '자동광고는 쿠팡 AI가 키워드와 입찰가를 자동으로 설정해줘요.',
          '"캠페인 관리" → "자동 캠페인 만들기"에서 시작하세요.',
          '상품만 선택하면 쿠팡이 알아서 최적의 키워드에 광고를 노출해요.',
          '수동 키워드 설정이 어렵거나 시간이 부족할 때 유용해요.',
          '자동광고 리포트에서 성과 좋은 키워드를 발견하면 수동 캠페인에 추가하세요.',
          '자동광고와 수동광고를 병행하면 최적의 성과를 낼 수 있어요.',
        ],
        tip: '자동광고는 "키워드 발굴 도구"로도 활용할 수 있어요. 자동광고에서 전환이 잘 되는 키워드를 찾아 수동 캠페인에 추가하세요.',
      },
    ],
    faqs: [
      {
        question: '광고비가 많이 들까봐 걱정돼요.',
        answer:
          '일 예산을 설정하면 그 이상은 절대 과금되지 않아요. 처음에는 하루 5,000원부터 시작해서 데이터를 보며 조절하세요.',
      },
      {
        question: '광고 효과가 없으면 어떡하나요?',
        answer:
          '최소 1~2주는 운영해봐야 판단할 수 있어요. 효과가 없다면 키워드, 입찰가, 상품 상세페이지를 점검해보세요. 그래도 안 되면 다른 상품으로 테스트하세요.',
      },
      {
        question: '광고를 하면 무조건 매출이 오르나요?',
        answer:
          '광고는 노출을 늘려줄 뿐이에요. 상품 경쟁력(가격, 리뷰, 이미지)이 부족하면 클릭이나 구매로 이어지지 않을 수 있어요. 상품력을 먼저 갖추는 것이 중요해요.',
      },
    ],
    relatedArticleIds: ['product-listing-seo', 'coupang-settlement', 'seller-grade-penalty'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 17. 광고/마케팅 - 상품 등록 & SEO 최적화
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'product-listing-seo',
    categoryId: 'advertising',
    title: '상품 등록 & SEO 최적화',
    subtitle: '검색 상위 노출을 위한 상품 등록 전략',
    icon: '🔍',
    estimatedTime: '약 25분',
    overview:
      '쿠팡에서 상품이 검색 상위에 노출되려면 상품명, 키워드, 이미지, 상세페이지를 전략적으로 구성해야 해요. 카테고리 선택부터 등록 후 확인까지 SEO 관점에서 최적화하는 방법을 알려드립니다.',
    steps: [
      {
        title: '카테고리 선택',
        description: '상품에 가장 적합한 카테고리를 선택합니다.',
        detailedInstructions: [
          '쿠팡 Wing → "상품관리" → "상품 등록"으로 이동하세요.',
          '카테고리 검색에서 상품명을 입력하면 추천 카테고리가 나와요.',
          '경쟁 상품이 어느 카테고리에 등록되어 있는지 확인하세요.',
          '같은 상품도 카테고리에 따라 검색 노출이 달라질 수 있어요.',
          '수수료율도 카테고리마다 다르니 함께 고려하세요.',
        ],
        tip: '경쟁이 너무 치열한 대분류보다 정확한 소분류를 선택하면 상위 노출 확률이 높아져요.',
      },
      {
        title: '상품명 키워드 최적화',
        description: '검색에 잘 걸리는 상품명을 작성합니다.',
        detailedInstructions: [
          '상품명 공식: [브랜드명] + [핵심 키워드] + [상품 특징] + [규격/용량]',
          '예: "모던홈 스테인리스 진공 텀블러 500ml 보온보냉"',
          '고객이 실제로 검색할 만한 단어를 넣으세요.',
          '쿠팡 검색창에 키워드를 입력하면 자동완성으로 인기 검색어를 확인할 수 있어요.',
          '상품명은 최대 100자까지 가능하지만, 핵심 키워드를 앞에 배치하세요.',
          '특수문자, 과도한 수식어는 피하세요 (검색 페널티 가능).',
        ],
        warning: '"최저가", "무료배송", "1+1" 같은 프로모션 문구를 상품명에 넣으면 쿠팡 정책 위반이에요.',
      },
      {
        title: '검색태그 설정',
        description: '상품의 검색 노출을 높이는 태그를 설정합니다.',
        detailedInstructions: [
          '검색태그는 상품명에 넣지 못한 관련 키워드를 추가하는 공간이에요.',
          '동의어, 유사어, 줄임말을 검색태그에 넣으세요.',
          '예: 텀블러 → "보온컵", "보냉컵", "머그컵", "물병"',
          '경쟁 상품의 상품명에서 힌트를 얻을 수 있어요.',
          '최대 허용 개수까지 채우는 것이 좋아요.',
          '관련 없는 키워드를 넣으면 오히려 검색 품질이 떨어져요.',
        ],
        tip: '쿠팡 검색창 자동완성과 연관검색어를 참고하면 고객이 실제로 쓰는 키워드를 파악할 수 있어요.',
      },
      {
        title: '대표이미지 최적화',
        description: '클릭률을 높이는 대표이미지를 등록합니다.',
        detailedInstructions: [
          '쿠팡 권장 이미지 규격: 500×500px 이상, 정사각형(1:1 비율)',
          '흰색 배경에 상품만 깔끔하게 촬영하세요.',
          '상품이 이미지의 70~80%를 차지하도록 크기를 맞추세요.',
          '밝고 선명한 사진이 클릭률이 높아요.',
          '워터마크, 텍스트, 과도한 효과는 넣지 마세요.',
          '최소 5장 이상의 추가 이미지(다양한 각도, 사용 장면)를 등록하세요.',
        ],
        warning: '다른 셀러의 이미지를 무단으로 사용하면 저작권 문제가 발생할 수 있어요. 반드시 직접 촬영하거나 사용 허가를 받으세요.',
      },
      {
        title: '상세페이지 구성',
        description: '구매 전환율을 높이는 상세페이지를 만듭니다.',
        detailedInstructions: [
          '상세페이지 구성 순서 (추천):',
          '1. 핵심 장점 (한눈에 파악)',
          '2. 상품 실물 사진 (다양한 각도)',
          '3. 사용 장면 / 활용법',
          '4. 규격·소재·인증 정보',
          '5. 배송·교환·반품 안내',
          '텍스트보다 이미지 위주로 구성하세요 (모바일 최적화).',
          '이미지 가로 폭은 860px로 통일하면 깔끔해요.',
          '쿠팡에서 제공하는 상세페이지 템플릿도 활용해보세요.',
        ],
        tip: '모바일에서 보는 고객이 80% 이상이에요. 반드시 모바일 화면에서 미리보기를 확인하세요.',
      },
      {
        title: '가격 전략',
        description: '경쟁력 있는 가격을 설정합니다.',
        detailedInstructions: [
          '같은 상품을 판매하는 경쟁 셀러들의 가격을 조사하세요.',
          '최저가보다 조금 높더라도 배송, 리뷰, 상세페이지로 차별화할 수 있어요.',
          '쿠팡 로켓배송 상품이 있다면 가격 경쟁이 어려울 수 있어요.',
          '판매가에서 수수료, 배송비, 매입비를 뺀 순이익을 반드시 계산하세요.',
          '할인가를 설정할 때는 원래 가격 대비 적절한 할인율을 유지하세요.',
        ],
        warning: '마진이 0원이거나 마이너스인 가격으로 설정하면 팔수록 손해에요. 반드시 수수료와 배송비를 포함해 계산하세요.',
      },
      {
        title: '옵션 설정',
        description: '색상, 사이즈 등 옵션을 효율적으로 구성합니다.',
        detailedInstructions: [
          '옵션이 있는 상품은 하나의 상품 페이지에 옵션을 묶어 등록하세요.',
          '옵션명을 고객이 이해하기 쉽게 작성하세요 (예: "색상: 블랙", "사이즈: L").',
          '옵션별로 재고와 가격을 정확하게 설정하세요.',
          '인기 옵션을 첫 번째로 배치하세요.',
          '옵션이 많으면 대표 옵션만 남기고, 비인기 옵션은 제거하는 것도 방법이에요.',
        ],
      },
      {
        title: '등록 후 확인',
        description: '상품 등록 후 정상적으로 노출되는지 확인합니다.',
        detailedInstructions: [
          '등록 후 "판매승인 대기" → "판매중" 상태가 되어야 검색에 노출돼요.',
          '쿠팡 앱/웹에서 직접 상품명을 검색하여 노출 여부를 확인하세요.',
          '상품 상세페이지가 의도대로 표시되는지 확인하세요.',
          '모바일과 PC 양쪽에서 모두 확인하세요.',
          '등록 후 1~2일 내에 검색에 반영되는 것이 일반적이에요.',
          '검색에 잘 안 잡히면 상품명과 태그를 수정해보세요.',
        ],
        tip: '등록 직후에는 검색 순위가 낮을 수 있어요. 초기 판매량과 리뷰를 쌓으면 점차 순위가 올라가요.',
      },
    ],
    faqs: [
      {
        question: '상품명을 자주 변경해도 되나요?',
        answer:
          '가능하지만 너무 자주 변경하면 검색 순위에 일시적으로 영향을 줄 수 있어요. 변경 후 1~2일 내에 다시 반영되니 큰 문제는 없어요.',
      },
      {
        question: '같은 상품을 여러 번 등록해도 되나요?',
        answer:
          '같은 상품을 중복 등록하면 쿠팡 정책 위반이에요. 발견 시 상품이 삭제되거나 페널티를 받을 수 있어요. 하나의 상품 페이지에 옵션으로 구분하세요.',
      },
      {
        question: '검색 상위 노출에 가장 중요한 요소가 뭔가요?',
        answer:
          '판매량, 전환율, 리뷰 수·평점, 배송 만족도가 종합적으로 반영돼요. 단기적으로는 상품명 키워드가 중요하고, 장기적으로는 판매 실적과 고객 만족도가 핵심이에요.',
      },
    ],
    relatedArticleIds: ['coupang-ad-basics', 'product-photography', 'seller-grade-penalty'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 18. 반품/CS - CS 문의 일상 관리
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'cs-daily-management',
    categoryId: 'returns-cs',
    title: 'CS 문의 일상 관리',
    subtitle: '매일 문의를 체계적으로 처리하는 방법',
    icon: '💬',
    estimatedTime: '약 20분',
    overview:
      '고객 문의를 빠르고 정확하게 처리하는 것은 셀러 등급과 매출에 직결돼요. Wing에서 문의를 확인하고, 유형별로 분류하고, 적절한 답변을 보내는 일일 CS 루틴을 만들어 보세요.',
    steps: [
      {
        title: 'Wing 문의 확인',
        description: '매일 문의를 확인하는 루틴을 만듭니다.',
        detailedInstructions: [
          '쿠팡 Wing → "고객문의관리" → "문의목록"을 클릭하세요.',
          '미답변 문의를 우선 확인하세요.',
          '최소 하루 2~3회 (오전/오후/저녁) 확인하는 습관을 만드세요.',
          '새 문의 알림을 놓치지 않도록 Wing 알림을 활성화하세요.',
          '응답 기한(24시간 이내)을 반드시 지키세요. 미응답은 페널티 대상이에요.',
        ],
        warning: '24시간 이내 미답변 시 셀러 등급에 직접적인 불이익이 있어요. 주말·공휴일에도 반드시 확인하세요.',
      },
      {
        title: '문의 유형별 분류',
        description: '문의를 유형별로 나눠 효율적으로 처리합니다.',
        detailedInstructions: [
          '주요 문의 유형:',
          '1. 배송 관련: "언제 오나요?", "배송이 늦어요"',
          '2. 상품 관련: "사이즈가 어떻게 되나요?", "재질이 뭔가요?"',
          '3. 교환/반품: "교환하고 싶어요", "환불해주세요"',
          '4. 불만/클레임: "상품이 불량이에요", "설명과 달라요"',
          '유형별로 미리 준비한 템플릿으로 빠르게 대응하세요.',
          '복잡한 문의는 따로 표시해두고 나중에 상세 답변하세요.',
        ],
        tip: '자주 오는 문의는 패턴이 있어요. 상위 5가지 문의에 대한 답변 템플릿을 미리 만들어두세요.',
      },
      {
        title: '답변 작성 및 발송',
        description: '적절한 답변을 작성하여 발송합니다.',
        detailedInstructions: [
          '아래 상황별 답변 템플릿을 활용하세요.',
          '항상 인사로 시작하고 감사 인사로 마무리하세요.',
          '문제가 있을 때는 먼저 사과하고 해결책을 제시하세요.',
          '구체적인 정보(택배사, 송장번호, 예상 도착일)를 포함하세요.',
          '감정적 표현을 자제하고 전문적인 톤을 유지하세요.',
        ],
        copyableTemplates: [
          {
            label: '배송 상태 안내',
            text: '안녕하세요, 고객님!\n\n문의 주신 상품의 배송 현황 안내드립니다.\n\n택배사: [택배사명]\n송장번호: [송장번호]\n현재 상태: [배송중/배송완료]\n예상 도착일: [날짜]\n\n배송 관련 추가 문의가 있으시면 언제든 말씀해 주세요.\n감사합니다.',
          },
          {
            label: '배송 지연 사과',
            text: '안녕하세요, 고객님!\n\n배송이 지연되어 불편을 드려 진심으로 죄송합니다.\n\n현재 [사유: 물량 증가/택배사 사정/기상악화] 로 인해 배송이 지연되고 있습니다.\n예상 도착일은 [날짜]입니다.\n\n빠르게 받아보실 수 있도록 최선을 다하겠습니다.\n다시 한번 양해 부탁드립니다.\n감사합니다.',
          },
          {
            label: '상품 문의 답변',
            text: '안녕하세요, 고객님!\n\n문의해 주신 내용에 대해 답변드립니다.\n\n[상세 답변 내용]\n\n추가로 궁금하신 점이 있으시면 편하게 문의해 주세요.\n감사합니다.',
          },
          {
            label: '교환 안내',
            text: '안녕하세요, 고객님!\n\n교환 요청 확인했습니다.\n\n교환 절차를 안내드립니다:\n1. 상품을 원래 포장 상태로 다시 포장해 주세요.\n2. 택배 수거는 [날짜]에 방문 예정입니다.\n3. 수거 후 교환 상품을 바로 발송해 드리겠습니다.\n\n수거 시 부재 중이시면 문 앞에 놓아주시면 됩니다.\n감사합니다.',
          },
          {
            label: '반품/환불 안내',
            text: '안녕하세요, 고객님!\n\n반품 요청 확인했습니다.\n\n반품 절차를 안내드립니다:\n1. 상품을 원래 포장 상태로 포장해 주세요.\n2. 택배 수거일: [날짜]\n3. 상품 수거 확인 후 [영업일 기준 X일] 이내 환불 처리됩니다.\n\n환불은 결제하신 수단으로 동일하게 진행됩니다.\n감사합니다.',
          },
          {
            label: '부분환불 안내',
            text: '안녕하세요, 고객님!\n\n불편을 드려 죄송합니다.\n\n확인 결과 [사유]로 인해 부분환불을 진행해 드리겠습니다.\n환불 금액: [금액]원\n환불 방법: 결제하신 수단으로 [영업일 기준 X일] 이내 환불\n\n상품은 그대로 사용하셔도 됩니다.\n다시 한번 불편 드려 죄송합니다.\n감사합니다.',
          },
          {
            label: '재입고 안내',
            text: '안녕하세요, 고객님!\n\n문의해 주신 상품은 현재 일시 품절 상태입니다.\n\n재입고 예정일: [날짜]\n재입고 시 알림을 받으시려면 상품 페이지에서 "재입고 알림" 버튼을 눌러주세요.\n\n불편을 드려 죄송하며, 빠른 재입고를 위해 노력하겠습니다.\n감사합니다.',
          },
          {
            label: '감사 인사',
            text: '안녕하세요, 고객님!\n\n소중한 구매 감사드립니다.\n상품을 잘 받으셨다니 다행이에요!\n\n혹시 사용 중 궁금하신 점이 있으시면 언제든 문의해 주세요.\n\n만족스러우셨다면 리뷰 한 줄 남겨주시면 큰 힘이 됩니다.\n좋은 하루 보내세요!\n감사합니다.',
          },
        ],
      },
      {
        title: '응답 시간 관리',
        description: '응답 시간을 체계적으로 관리합니다.',
        detailedInstructions: [
          '쿠팡 기준: 24시간 이내 답변이 필요합니다.',
          '이상적 응답시간: 2~4시간 이내 (고객 만족도 급상승).',
          '자동 응답 설정은 불가능하지만, 미리 준비한 템플릿으로 빠르게 대응하세요.',
          '바로 해결이 어려운 문의도 "확인 중"이라고 먼저 답변하세요.',
          '주말/공휴일에도 반드시 확인하는 체계를 만드세요.',
        ],
        tip: '바로 해결이 어려운 복잡한 문의도 "확인 중입니다. 빠르게 답변드리겠습니다."라고 먼저 답변하면 고객 불만을 줄일 수 있어요.',
      },
      {
        title: 'FAQ 대응',
        description: '반복되는 질문을 효율적으로 처리합니다.',
        detailedInstructions: [
          '자주 오는 문의 TOP 10을 정리하세요.',
          '각 질문에 대한 표준 답변을 만들어 저장해두세요.',
          '상품 설명에 FAQ를 미리 안내하면 문의 자체를 줄일 수 있어요.',
          '같은 질문이 반복되면 상세페이지를 보강하세요.',
          '메모장이나 스프레드시트에 답변 템플릿을 관리하세요.',
        ],
        tip: '상품 상세페이지에 자주 묻는 질문과 답변을 미리 넣어두면 문의가 30~50% 줄어들어요.',
      },
      {
        title: '에스컬레이션',
        description: '직접 해결이 어려운 문의를 처리하는 방법입니다.',
        detailedInstructions: [
          '직접 해결이 어려운 경우:',
          '- 고객이 과도한 보상을 요구하는 경우',
          '- 법적 문제가 될 수 있는 경우',
          '- 쿠팡 시스템 오류인 경우',
          '쿠팡 판매자 지원센터(1600-9709)에 문의하세요.',
          'Wing → "도움말" → "1:1 문의"에서 접수하세요.',
          '고객에게는 "관련 부서와 확인 중"이라고 안내하세요.',
        ],
        warning: '고객과 감정적으로 대립하지 마세요. 해결이 어려운 상황일수록 차분하게 대응하고, 쿠팡 지원을 활용하세요.',
      },
      {
        title: '고객 만족도 관리',
        description: '장기적인 CS 품질을 관리합니다.',
        detailedInstructions: [
          '고객 평가/리뷰에서 CS 관련 언급을 모니터링하세요.',
          '"응대가 좋았다", "빠른 답변 감사" 같은 긍정 리뷰가 나오면 잘하고 있는 거예요.',
          'CS 불만 리뷰가 있으면 원인을 파악하고 개선하세요.',
          '월 1회 CS 응대 현황을 정리하세요 (문의 수, 응답시간, 해결률).',
          '개선된 내용을 상품 상세페이지나 배송에 반영하세요.',
        ],
        tip: 'CS를 잘 하면 부정 리뷰를 긍정 리뷰로 바꿀 수 있어요. 문제 해결 후 만족스러운 경험을 만들어주세요.',
      },
    ],
    faqs: [
      {
        question: '문의가 너무 많아서 감당이 안 돼요.',
        answer:
          '상세페이지를 보강하면 반복 문의를 줄일 수 있어요. FAQ 섹션 추가, 사이즈표 명시, 배송 안내 강화 등으로 30~50% 문의를 줄인 사례가 많아요.',
      },
      {
        question: '악의적인 문의에는 어떻게 대응하나요?',
        answer:
          '감정적 대응은 절대 하지 마세요. 사실 기반으로 정중하게 답변하고, 과도한 요구는 쿠팡 고객센터를 통해 중재를 요청하세요.',
      },
      {
        question: '주말에도 문의를 확인해야 하나요?',
        answer:
          '네, 24시간 응답 기한은 주말에도 적용돼요. 최소한 모바일로 간단히 확인하고, 급한 문의에는 간단한 답변이라도 보내세요.',
      },
      {
        question: '답변을 잘못 보냈을 때 수정할 수 있나요?',
        answer:
          '이미 보낸 답변은 수정이 안 돼요. 새로운 답변을 추가로 보내면서 "앞서 보내드린 안내에 오류가 있어 정정합니다"라고 안내하세요.',
      },
    ],
    relatedArticleIds: ['difficult-customer', 'coupang-return', 'seller-grade-penalty'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 19. 주문/배송 - 재고 관리 & 품절 방지
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'inventory-management',
    categoryId: 'orders-shipping',
    title: '재고 관리 & 품절 방지',
    subtitle: '품절 없는 안정적인 재고 운영 방법',
    icon: '📦',
    estimatedTime: '약 20분',
    overview:
      '품절은 매출 손실뿐 아니라 셀러 등급 하락까지 이어질 수 있어요. 재고 현황 파악, 안전재고 설정, 발주 타이밍, 품절 시 대응까지 안정적인 재고 운영 방법을 알려드려요.',
    steps: [
      {
        title: '재고 현황 파악',
        description: '현재 보유 재고를 정확하게 파악합니다.',
        detailedInstructions: [
          '쿠팡 Wing → "상품관리" → "재고관리"에서 전체 재고를 확인하세요.',
          '상품별 재고 수량, 판매 속도, 남은 예상 판매일을 파악하세요.',
          '재고가 5개 이하인 상품을 즉시 표시하세요.',
          '엑셀로 재고 현황표를 만들어 매일 업데이트하세요.',
          '여러 플랫폼에서 판매한다면 각 채널별 재고를 합산해서 관리하세요.',
        ],
        tip: '매일 아침 가장 먼저 재고 현황을 확인하는 습관을 만드세요. 5분만 투자하면 품절을 방지할 수 있어요.',
      },
      {
        title: '안전재고 설정',
        description: '품절을 방지하기 위한 최소 재고 수준을 정합니다.',
        detailedInstructions: [
          '안전재고 = 일 평균 판매량 × 발주~입고 소요일 × 1.5 (여유 계수)',
          '예: 하루 5개 판매, 발주~입고 3일 → 안전재고 = 5 × 3 × 1.5 = 23개',
          '재고가 안전재고 수준에 도달하면 즉시 발주하세요.',
          '시즌이나 이벤트 기간에는 안전재고를 2~3배로 늘리세요.',
          '잘 팔리는 상위 20% 상품에 특히 신경 쓰세요.',
        ],
        warning: '안전재고 없이 운영하면 주말이나 공급업체 휴무 시 품절이 발생해요. 반드시 여유분을 확보하세요.',
      },
      {
        title: '발주 타이밍 결정',
        description: '언제 발주해야 하는지 타이밍을 정합니다.',
        detailedInstructions: [
          '재고가 안전재고 수준에 도달하면 발주하세요.',
          '도매처의 배송 소요일을 정확히 파악해두세요.',
          '주말/공휴일 전에는 미리 발주하세요.',
          '도매처의 재고도 확인하세요 (도매처도 품절될 수 있어요).',
          '정기 발주 일정을 정해두면 관리가 편해요 (예: 매주 월/목 발주).',
          '대량 발주 시 도매처와 사전 협의하세요.',
        ],
        tip: '도매처에 "재고 부족 시 미리 알려주세요"라고 요청해두면 급작스러운 품절을 방지할 수 있어요.',
      },
      {
        title: '품절 시 대응',
        description: '품절이 발생했을 때 빠르게 대응합니다.',
        detailedInstructions: [
          '품절 시 쿠팡에서 "일시품절" 처리를 하세요 (상품 삭제하지 마세요!).',
          '이미 주문된 건이 있으면 고객에게 즉시 연락하세요.',
          '대체 상품이 있으면 고객에게 안내하세요.',
          '재입고 예정일을 확인하고 상품 페이지에 안내하세요.',
          '반복 품절되는 상품은 안전재고를 상향 조정하세요.',
        ],
        copyableTemplates: [
          {
            label: '품절 안내',
            text: '안녕하세요, 고객님!\n\n주문해 주신 [상품명]이 예상보다 빠르게 판매되어 현재 일시 품절 상태입니다.\n\n재입고 예정일: [날짜]\n\n재입고 즉시 발송 처리해 드리겠습니다.\n기다리기 어려우시면 주문 취소도 가능합니다.\n\n불편을 드려 진심으로 죄송합니다.\n감사합니다.',
          },
          {
            label: '재입고 안내',
            text: '안녕하세요, 고객님!\n\n이전에 품절로 불편을 드렸던 [상품명]이 재입고되었습니다!\n\n재고가 한정되어 있으니 서둘러 주문해 주세요.\n\n감사합니다.',
          },
        ],
        warning: '품절 상태에서 주문이 들어오면 강제 취소가 발생하고, 이는 셀러 페널티의 주요 원인이에요.',
      },
      {
        title: '다채널 재고 동기화',
        description: '여러 판매 채널의 재고를 통합 관리합니다.',
        detailedInstructions: [
          '쿠팡, 네이버, 11번가 등 여러 채널에서 판매하면 재고 동기화가 필수예요.',
          '한 채널에서 판매되면 다른 채널 재고도 즉시 차감해야 해요.',
          '수동 관리: 판매 즉시 다른 채널 재고 수정 (소량일 때 가능).',
          '자동 관리: 셀러 통합 관리 툴 사용 (사방넷, 셀러허브, 플레이오토 등).',
          '재고 불일치로 품절 주문이 발생하면 강제 취소 → 페널티가 돼요.',
        ],
        tip: '상품 수가 10개 이상이면 재고 통합 관리 툴 사용을 강력 추천해요. 수동 관리의 실수를 방지할 수 있어요.',
      },
      {
        title: '시즌별 재고 계획',
        description: '시즌과 이벤트에 맞춘 재고 계획을 세웁니다.',
        detailedInstructions: [
          '주요 시즌/이벤트: 명절(설/추석), 블랙프라이데이, 11월 쇼핑 시즌, 여름/겨울 시즌',
          '시즌 2~3주 전에 재고를 미리 확보하세요.',
          '작년 같은 기간의 판매 데이터를 참고하세요.',
          '시즌 상품은 시즌 종료 후 재고 처리 계획도 세우세요.',
          '이벤트 후 반품률 증가도 고려하세요.',
        ],
      },
      {
        title: '재고 데이터 분석',
        description: '재고 데이터를 분석하여 운영을 최적화합니다.',
        detailedInstructions: [
          '주간/월간 판매량 추이를 분석하세요.',
          '재고 회전율 = 판매량 ÷ 평균 재고 (높을수록 효율적).',
          '회전율이 낮은 상품: 가격 인하 또는 판매 중단 고려.',
          '회전율이 높은 상품: 발주량 증가 및 안전재고 상향.',
          '재고 보유 비용(보관료, 자금 묶임)도 고려하세요.',
          '월 1회 전체 재고 점검을 실시하세요.',
        ],
        tip: '매출의 80%는 보통 상위 20% 상품에서 나와요. 핵심 상품의 재고 관리에 집중하세요.',
      },
    ],
    faqs: [
      {
        question: '적정 재고는 얼마나 보유해야 하나요?',
        answer:
          '일 판매량 × 발주~입고 소요일 × 1.5배가 기본 공식이에요. 예를 들어 하루 10개 팔리고 입고까지 5일 걸리면, 최소 75개는 보유하세요.',
      },
      {
        question: '재고가 남으면 어떡하나요?',
        answer:
          '가격을 조금 낮추거나 묶음 판매로 소진하세요. 시즌 상품은 다음 시즌까지 보관할 수 있지만, 보관 비용도 고려해야 해요.',
      },
      {
        question: '도매처가 갑자기 품절이면 어떡하나요?',
        answer:
          '대체 도매처를 1~2곳 미리 확보해두세요. 한 도매처에만 의존하면 리스크가 커요. 여러 도매처의 가격과 품질을 비교해서 관리하세요.',
      },
    ],
    relatedArticleIds: ['coupang-invoice', 'seasonal-event-prep', 'seller-grade-penalty'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 20. 계정/등급 - 리뷰 관리 & 대응
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'review-management',
    categoryId: 'account-management',
    title: '리뷰 관리 & 대응',
    subtitle: '긍정 리뷰 늘리고 부정 리뷰에 현명하게 대응하기',
    icon: '⭐',
    estimatedTime: '약 15분',
    overview:
      '리뷰는 상품 판매에 가장 큰 영향을 미치는 요소 중 하나예요. 긍정 리뷰를 늘리고, 부정 리뷰에 현명하게 대응하고, 허위 리뷰를 신고하는 방법까지 체계적인 리뷰 관리법을 알려드려요.',
    steps: [
      {
        title: '리뷰 모니터링',
        description: '새로운 리뷰를 놓치지 않고 확인합니다.',
        detailedInstructions: [
          '매일 쿠팡 Wing → "상품관리"에서 상품별 리뷰를 확인하세요.',
          '쿠팡 앱에서도 직접 내 상품 리뷰를 확인할 수 있어요.',
          '별점 3점 이하 리뷰는 즉시 대응하세요.',
          '리뷰에 사진이 포함된 경우 상품 상태를 꼼꼼히 확인하세요.',
          '주간 리뷰 현황을 정리하세요 (총 리뷰 수, 평균 별점, 부정 비율).',
        ],
        tip: '부정 리뷰는 빠르게 대응할수록 효과적이에요. 24시간 이내에 답변하는 것을 목표로 하세요.',
      },
      {
        title: '긍정 리뷰 감사 답변',
        description: '긍정 리뷰에 감사를 표현합니다.',
        detailedInstructions: [
          '4~5점 리뷰에는 꼭 감사 답변을 남기세요.',
          '형식적이지 않고 진심을 담아 작성하세요.',
          '리뷰에서 언급한 구체적인 장점을 다시 언급하면 좋아요.',
          '재구매를 유도하는 한 마디를 추가하세요.',
          '모든 리뷰에 같은 답변을 복붙하지 마세요. 약간씩 다르게 작성하세요.',
        ],
        copyableTemplates: [
          {
            label: '긍정 리뷰 감사 (일반)',
            text: '고객님, 좋은 리뷰 남겨주셔서 정말 감사합니다! 😊\n\n만족스럽게 사용하고 계신다니 기쁩니다.\n앞으로도 좋은 상품으로 찾아뵙겠습니다.\n\n다음에 또 만나요!',
          },
          {
            label: '긍정 리뷰 감사 (상세)',
            text: '고객님, 정성스러운 리뷰 감사합니다!\n\n[리뷰에서 언급한 장점]에 대해 말씀해 주셔서 저희도 보람을 느낍니다.\n\n상품 사용 중 궁금한 점이 있으시면 언제든 문의해 주세요.\n항상 최선을 다하겠습니다!\n\n감사합니다.',
          },
        ],
      },
      {
        title: '부정 리뷰 대응',
        description: '부정 리뷰에 전문적으로 대응합니다.',
        detailedInstructions: [
          '먼저 고객의 불만에 공감하고 사과하세요.',
          '문제의 원인을 파악하고 해결책을 제시하세요.',
          '개인 연락처 공유는 피하고, 문의 채널을 안내하세요.',
          '감정적이거나 방어적인 답변은 절대 하지 마세요.',
          '다른 고객들도 읽는다는 점을 기억하세요 — 답변이 곧 브랜드 이미지예요.',
          '문제가 해결된 후 고객이 리뷰를 수정하면 가장 좋은 결과예요.',
        ],
        copyableTemplates: [
          {
            label: '배송 불만 대응',
            text: '고객님, 배송 과정에서 불편을 드려 진심으로 죄송합니다.\n\n말씀하신 내용을 확인하여 택배사와 함께 재발 방지를 위해 조치하겠습니다.\n\n보상 또는 재발송이 필요하시면 고객문의로 연락주시면 즉시 처리해 드리겠습니다.\n\n다시 한번 불편 드려 죄송합니다.',
          },
          {
            label: '품질 불만 대응',
            text: '고객님, 상품 품질에 실망을 드려 정말 죄송합니다.\n\n말씀하신 문제를 심각하게 받아들이고 있으며, 품질 관리를 더욱 강화하겠습니다.\n\n교환 또는 환불을 원하시면 고객문의를 통해 접수해 주시면 신속하게 처리해 드리겠습니다.\n\n소중한 의견 감사드리며, 더 좋은 상품으로 보답하겠습니다.',
          },
          {
            label: '기대와 다름 대응',
            text: '고객님, 상품이 기대와 달라 실망하셨다니 죄송합니다.\n\n상품 설명을 더 정확하게 개선하도록 하겠습니다.\n\n반품 또는 교환을 원하시면 고객문의로 연락 주시면 안내드리겠습니다.\n\n고객님의 솔직한 리뷰 감사드리며, 개선에 반영하겠습니다.',
          },
        ],
        warning: '부정 리뷰에 감정적으로 대응하면 오히려 상황이 악화돼요. 항상 차분하고 전문적으로 대응하세요.',
      },
      {
        title: '허위/악의적 리뷰 신고',
        description: '부당한 리뷰에 대해 신고합니다.',
        detailedInstructions: [
          '다음의 경우 쿠팡에 리뷰 삭제를 요청할 수 있어요:',
          '- 구매한 적 없는 사람의 리뷰 (구매 미인증)',
          '- 욕설, 비방, 인신공격이 포함된 리뷰',
          '- 경쟁 셀러의 악의적 리뷰',
          '- 상품과 무관한 내용의 리뷰',
          'Wing → 해당 리뷰 → "신고" 버튼을 클릭하세요.',
          '신고 사유를 구체적으로 작성하면 처리 확률이 높아져요.',
          '결과는 보통 1~3일 내에 통보됩니다.',
        ],
        tip: '신고 시 구체적인 근거(스크린샷, 주문 내역 등)를 첨부하면 처리 속도가 빨라져요.',
      },
      {
        title: '리뷰 유도 전략',
        description: '자연스럽게 리뷰를 늘리는 방법입니다.',
        detailedInstructions: [
          '배송 시 작은 감사 카드를 동봉하면 리뷰 작성률이 올라가요.',
          '감사 카드 내용: "감사합니다. 리뷰를 남겨주시면 큰 힘이 됩니다."',
          '상품 품질과 배송 만족도가 높으면 자연스럽게 리뷰가 늘어나요.',
          '리뷰에 대한 보상을 직접 제안하는 것은 쿠팡 정책 위반이에요.',
          '부정 리뷰를 해결한 후 고객이 자발적으로 수정하는 것이 최선이에요.',
        ],
        warning: '리뷰 대가로 금전·상품을 제공하는 것은 쿠팡 정책 위반이에요. 적발 시 계정 정지 등 강력한 제재를 받을 수 있어요.',
      },
      {
        title: '리뷰 데이터 활용',
        description: '리뷰에서 사업 개선 인사이트를 얻습니다.',
        detailedInstructions: [
          '반복되는 불만 사항을 정리하세요 → 상품 개선 또는 상세페이지 보강에 반영.',
          '고객이 좋아하는 포인트를 파악하세요 → 광고·상세페이지에서 강조.',
          '경쟁 상품의 리뷰도 분석하세요 → 나에게 없는 장점, 경쟁사의 약점을 파악.',
          '별점 추이를 월별로 관리하세요 → 평점 하락 시 즉시 원인 분석.',
          '리뷰 키워드를 분석하면 고객이 진짜 원하는 것이 보여요.',
        ],
        tip: '부정 리뷰는 불만이 아니라 "무료 컨설팅"으로 생각하세요. 고객의 솔직한 피드백이 사업 개선의 핵심 자산이에요.',
      },
    ],
    faqs: [
      {
        question: '부정 리뷰를 삭제할 수 있나요?',
        answer:
          '정당한 리뷰는 셀러가 직접 삭제할 수 없어요. 단, 욕설·비방·허위 등 정책 위반 리뷰는 신고하여 삭제를 요청할 수 있어요.',
      },
      {
        question: '별점 1점 리뷰를 받으면 어떡하나요?',
        answer:
          '당황하지 마세요! 진심으로 사과하고 문제 해결책을 제시하세요. 잘 대응하면 고객이 리뷰를 수정하거나, 다른 고객들이 판매자의 성의를 보고 신뢰할 수 있어요.',
      },
      {
        question: '리뷰가 하나도 없는 신상품은 어떻게 하나요?',
        answer:
          '초기에는 가격 경쟁력, 빠른 배송, 상세한 상품 설명으로 첫 구매를 유도하세요. 감사 카드를 동봉하면 첫 리뷰 작성 확률이 높아져요.',
      },
    ],
    relatedArticleIds: ['seller-grade-penalty', 'difficult-customer', 'cs-daily-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 21. 시작하기 - 상품 사진 & 상세페이지
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'product-photography',
    categoryId: 'getting-started',
    title: '상품 사진 & 상세페이지',
    subtitle: '스마트폰만으로 전문가급 상품 사진 촬영하기',
    icon: '📸',
    estimatedTime: '약 20분',
    overview:
      '상품 사진은 온라인 판매의 첫인상이에요. 비싼 장비 없이 스마트폰만으로도 충분히 좋은 사진을 찍을 수 있어요. 촬영 준비부터 상세페이지 완성까지 단계별로 알려드립니다.',
    steps: [
      {
        title: '장비 준비',
        description: '촬영에 필요한 기본 장비를 준비합니다.',
        detailedInstructions: [
          '스마트폰: 최근 2~3년 내 출시 모델이면 충분해요.',
          '삼각대: 스마트폰 거치 가능한 미니 삼각대 (1~2만원).',
          '배경지: 흰색 A1 또는 A0 종이 (문구점에서 1,000원).',
          '조명: 자연광이 가장 좋고, 없으면 LED 조명 1~2개.',
          '소품: 상품 크기를 가늠할 수 있는 소품 (손, 컵 등).',
        ],
        tip: '처음에는 고가 장비에 투자하지 마세요. 자연광 + 흰 종이 + 스마트폰만으로도 시작할 수 있어요.',
      },
      {
        title: '배경 및 조명 세팅',
        description: '깔끔한 사진을 위한 촬영 환경을 만듭니다.',
        detailedInstructions: [
          '흰색 배경지를 벽에 세우고 바닥으로 자연스럽게 이어지게 놓으세요.',
          '곡면이 생기도록 구부려야 이음새가 안 보여요.',
          '자연광 촬영: 창문 옆에서 촬영하세요 (오전 10시~오후 3시가 최적).',
          '직사광선은 그림자가 강해서 피하고, 커튼으로 빛을 분산하세요.',
          'LED 조명: 상품 좌우 45도 각도에서 비추면 그림자가 줄어요.',
          '상품 아래에 흰 종이를 깔면 반사광 효과로 더 밝아져요.',
        ],
        warning: '형광등 아래에서 촬영하면 색감이 실제와 다르게 나올 수 있어요. 자연광이나 LED 조명을 사용하세요.',
      },
      {
        title: '대표이미지 촬영',
        description: '검색 결과에 보이는 대표 사진을 촬영합니다.',
        detailedInstructions: [
          '쿠팡 권장: 500×500px 이상, 정사각형(1:1) 비율.',
          '상품이 화면의 70~80%를 차지하도록 크기를 맞추세요.',
          '정면에서 약간 위(30도)에서 촬영하면 자연스러워요.',
          '배경은 순백색이 가장 클릭률이 높아요.',
          '상품의 가장 매력적인 각도를 찾으세요.',
          '여러 장 촬영 후 가장 좋은 것을 선택하세요.',
        ],
        tip: '스마트폰 카메라 설정에서 그리드(격자선)를 켜면 상품을 정중앙에 배치하기 쉬워요.',
      },
      {
        title: '추가 상세 컷 촬영',
        description: '다양한 각도와 디테일 사진을 촬영합니다.',
        detailedInstructions: [
          '최소 5장 이상 다양한 컷을 촬영하세요:',
          '1. 전체 정면 (대표이미지와 같은 구도)',
          '2. 측면/후면 (다른 각도에서의 모습)',
          '3. 상세/디테일 (소재, 마감, 로고 등 클로즈업)',
          '4. 크기 비교 (손에 든 모습, 일상 소품과 비교)',
          '5. 사용 장면 (실제 활용 모습)',
          '비교 사진(Before/After, 포함구성품)도 효과적이에요.',
        ],
      },
      {
        title: '사진 편집',
        description: '촬영한 사진을 보정합니다.',
        detailedInstructions: [
          '무료 편집 앱: SNOW, Snapseed, 포토디렉터 등.',
          '기본 보정: 밝기 ↑, 대비 ↑, 채도 약간 ↑',
          '배경 제거: 앱에서 배경을 흰색으로 교체할 수 있어요.',
          '크기 조절: 쿠팡 권장 사이즈(500×500 이상)에 맞추세요.',
          '과도한 필터는 피하세요. 실물과 다르면 반품·클레임이 늘어요.',
          '밝고 선명한 사진이 가장 좋아요.',
        ],
        warning: '사진을 과도하게 보정하면 실물과 차이가 나서 반품·부정 리뷰의 원인이 돼요. 자연스러운 보정만 하세요.',
      },
      {
        title: '상세페이지 구성',
        description: '구매 전환율을 높이는 상세페이지를 만듭니다.',
        detailedInstructions: [
          '상세페이지 추천 구성 순서:',
          '1. 핵심 장점/혜택 (한 줄 임팩트)',
          '2. 실물 사진 (다양한 각도)',
          '3. 사용 장면 (라이프스타일 이미지)',
          '4. 상세 스펙 (크기, 소재, 중량, 인증)',
          '5. 구성품 안내',
          '6. 배송/교환/반품 안내',
          '무료 디자인 툴: 미리캔버스, Canva 등으로 제작 가능해요.',
          '이미지 가로 폭은 860px로 통일하면 깔끔해요.',
        ],
        tip: '모바일에서 보는 고객이 80% 이상이에요. 텍스트보다 이미지 위주로 구성하고, 글자는 크게 넣으세요.',
      },
      {
        title: '쿠팡 이미지 규격 확인',
        description: '쿠팡의 이미지 업로드 규격을 확인합니다.',
        detailedInstructions: [
          '대표이미지: 500×500px 이상, 최대 10MB, JPG/PNG',
          '추가이미지: 최대 9장, 같은 규격',
          '상세페이지 이미지: 가로 860px 권장, JPG/PNG',
          '이미지에 워터마크, 연락처, 홍보 문구를 넣으면 안 돼요.',
          '타사 로고나 비교 광고 이미지도 금지예요.',
          '업로드 전 최종 확인: 화질, 크기, 규격 위반 사항이 없는지 체크하세요.',
        ],
        externalLink: { url: 'https://wing.coupang.com', label: '쿠팡 Wing에서 이미지 등록하기' },
      },
    ],
    faqs: [
      {
        question: '스마트폰 사진으로도 충분한가요?',
        answer:
          '네, 최근 스마트폰 카메라 성능이면 충분해요. 조명과 배경만 잘 세팅하면 DSLR 못지않은 결과를 얻을 수 있어요.',
      },
      {
        question: '상세페이지 디자인을 외주 줄 수 있나요?',
        answer:
          '크몽, 숨고 등에서 상세페이지 디자인 외주를 맡길 수 있어요. 비용은 보통 3~10만원 수준이에요. 상품 사진만 잘 찍어서 전달하면 돼요.',
      },
      {
        question: '다른 셀러의 사진을 참고해도 되나요?',
        answer:
          '참고는 괜찮지만 절대 복사하면 안 돼요! 저작권 침해로 법적 문제가 생길 수 있어요. 같은 상품이더라도 반드시 직접 촬영하세요.',
      },
    ],
    relatedArticleIds: ['product-listing-seo', 'coupang-api-setup', 'supplier-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 22. 매출/정산 - 시즌 & 이벤트 대비
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'seasonal-event-prep',
    categoryId: 'revenue-settlement',
    title: '시즌 & 이벤트 대비',
    subtitle: '대박 매출을 만드는 시즌 전략',
    icon: '🎉',
    estimatedTime: '약 15분',
    overview:
      '명절, 블랙프라이데이, 쿠팡 로켓세일 등 대형 이벤트는 평소의 3~5배 매출을 올릴 수 있는 기회예요. 이벤트 캘린더 파악부터 재고 확보, 가격 전략, 사후 분석까지 시즌 대비 전략을 알려드려요.',
    steps: [
      {
        title: '이벤트 캘린더 파악',
        description: '연간 주요 이벤트 일정을 파악합니다.',
        detailedInstructions: [
          '주요 이벤트 일정:',
          '- 1월: 신년 세일, 겨울용품 시즌',
          '- 2~3월: 개학/신학기, 봄맞이 세일',
          '- 5월: 어버이날/어린이날 선물 시즌',
          '- 6~8월: 여름 시즌 (캠핑, 물놀이, 냉감 용품)',
          '- 9월: 추석, 가을 시즌',
          '- 11월: 블랙프라이데이, 쿠팡 로켓세일',
          '- 12월: 크리스마스, 연말 선물 시즌',
          '쿠팡 공지사항에서 프로모션 참여 일정을 확인하세요.',
        ],
        tip: '이벤트 최소 3~4주 전부터 준비를 시작하세요. 재고 확보와 가격 설정에 시간이 필요해요.',
      },
      {
        title: '시즌 상품 선정',
        description: '시즌에 맞는 인기 상품을 선정합니다.',
        detailedInstructions: [
          '작년 같은 시즌의 인기 상품을 분석하세요.',
          '쿠팡 트렌드 검색어를 확인하세요.',
          '경쟁이 너무 심한 대형 카테고리보다 틈새 시장을 노리세요.',
          '선물용 상품은 세트/패키지 구성이 효과적이에요.',
          '시즌 종료 후 재고 처리가 용이한 상품을 우선 선택하세요.',
        ],
        warning: '시즌 상품에 과도하게 올인하면 시즌 후 재고 부담이 커요. 연중 판매 가능한 상품과 시즌 상품의 비율을 7:3 정도로 유지하세요.',
      },
      {
        title: '재고 확보',
        description: '시즌 수요에 맞는 재고를 미리 확보합니다.',
        detailedInstructions: [
          '예상 판매량 = 평소 판매량 × 3~5배 (시즌 상품).',
          '이벤트 2~3주 전에 재고를 확보하세요.',
          '도매처에 시즌 물량을 미리 예약하세요.',
          '경쟁 심화로 도매처도 품절될 수 있으니 서두르세요.',
          '예비 도매처를 1~2곳 더 확보해두세요.',
          '과잉 재고 리스크: 확실한 물량만 선확보, 추가는 상황 보며 발주.',
        ],
        tip: '첫 시즌에는 보수적으로 시작하세요. 데이터가 쌓이면 다음 시즌에 더 정확한 예측이 가능해요.',
      },
      {
        title: '가격 & 프로모션 전략',
        description: '시즌에 맞는 가격과 프로모션을 설정합니다.',
        detailedInstructions: [
          '할인가를 설정하되 마진은 반드시 확보하세요.',
          '쿠팡 프로모션 참여: Wing → "프로모션" → 진행 중인 이벤트 확인.',
          '묶음 판매: "2+1", "세트 할인" 등으로 객단가를 높이세요.',
          '이벤트 시작 전날까지 가격 변경을 완료하세요.',
          '경쟁 셀러의 가격 변동을 모니터링하세요.',
          '이벤트 종료 후 원래 가격으로 복귀하세요.',
        ],
      },
      {
        title: '광고 예산 조정',
        description: '시즌에 맞게 광고 예산을 조정합니다.',
        detailedInstructions: [
          '이벤트 기간에는 검색량이 증가하므로 광고 효율이 올라가요.',
          '이벤트 1주 전부터 광고 예산을 평소의 2~3배로 늘리세요.',
          '시즌 키워드를 추가하세요 (예: "추석 선물", "크리스마스 선물").',
          '하루 예산을 점진적으로 늘리며 성과를 확인하세요.',
          '이벤트 종료 후 예산을 원래대로 조절하세요.',
        ],
        tip: '이벤트 기간에는 입찰 경쟁이 치열해져요. ROAS를 매일 확인하며 비효율 키워드는 빠르게 중단하세요.',
      },
      {
        title: '사후 분석',
        description: '이벤트 성과를 분석하고 다음에 반영합니다.',
        detailedInstructions: [
          '이벤트 종료 후 1주일 이내에 분석하세요.',
          '분석 항목: 매출, 판매량, 광고비, ROAS, 반품률, 순이익.',
          '잘 된 점과 개선할 점을 정리하세요.',
          '어떤 상품이 가장 잘 팔렸는지 파악하세요.',
          '남은 재고 처리 계획을 세우세요.',
          '다음 이벤트에 활용할 인사이트를 기록해두세요.',
        ],
        tip: '이벤트 성과 분석 자료를 꼭 저장해두세요. 다음 해 같은 이벤트 준비 시 가장 중요한 참고 자료가 돼요.',
      },
    ],
    faqs: [
      {
        question: '시즌 상품은 어디서 찾나요?',
        answer:
          '쿠팡 인기 검색어, 네이버 쇼핑 트렌드, 작년 판매 데이터를 참고하세요. 도매 사이트(도매꾹, 사입삼촌 등)의 시즌 특집 코너도 확인해보세요.',
      },
      {
        question: '이벤트 후 남은 재고는 어떻게 하나요?',
        answer:
          '가격 인하, 묶음 판매, 다른 채널 판매 등으로 소진하세요. 다음 시즌까지 보관할 수 있지만 보관 비용과 상품 상태를 고려하세요.',
      },
      {
        question: '쿠팡 프로모션에 참여하려면 어떻게 하나요?',
        answer:
          'Wing → "프로모션" 메뉴에서 진행 중인 프로모션을 확인하고 참여 신청하세요. 프로모션별로 참여 조건(최소 할인율, 배송 조건 등)이 다르니 잘 확인하세요.',
      },
    ],
    relatedArticleIds: ['inventory-management', 'coupang-ad-basics', 'coupang-settlement'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 23. 시작하기 - 도매처 발굴 & 관리
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'supplier-management',
    categoryId: 'getting-started',
    title: '도매처 발굴 & 관리',
    subtitle: '좋은 도매처를 찾고 장기 관계를 만드는 방법',
    icon: '🤝',
    estimatedTime: '약 20분',
    overview:
      '성공적인 리셀링의 핵심은 좋은 도매처를 확보하는 것이에요. 도매처 유형부터 플랫폼 활용, 평가 기준, 협상 방법, 장기 관계 구축까지 도매처 관리의 모든 것을 알려드려요.',
    steps: [
      {
        title: '도매처 유형 이해',
        description: '다양한 도매처 유형의 특징을 이해합니다.',
        detailedInstructions: [
          '1. 온라인 도매 플랫폼: 도매꾹, 사입삼촌, 오너클랜 등',
          '2. 오프라인 도매시장: 남대문, 동대문, 중부시장 등',
          '3. 제조사 직거래: 공장이나 제조사에서 직접 사입',
          '4. 해외 직구: 알리바바, 1688, 타오바오 등',
          '5. 폐업/이월 상품: 땡처리닷컴, 재고처분 전문 업체',
          '각 유형별 장단점이 달라요. 처음에는 온라인 도매 플랫폼이 가장 쉬워요.',
        ],
        tip: '처음에는 온라인 도매 플랫폼에서 시작하고, 경험이 쌓이면 오프라인 도매시장이나 제조사 직거래로 확장하세요.',
      },
      {
        title: '도매 플랫폼 활용법',
        description: '주요 온라인 도매 플랫폼을 활용합니다.',
        detailedInstructions: [
          '도매꾹(domeggook.com): 국내 최대 도매 플랫폼. 회원가입 후 이용 가능.',
          '사입삼촌(sabsamchon.com): 중국 소싱 전문. 1688 상품 대행.',
          '오너클랜(ownerclan.com): 소자본 셀러 전용. 무재고 위탁판매 가능.',
          '각 플랫폼에서 카테고리별 인기 상품을 확인하세요.',
          '도매가와 쿠팡 판매가를 비교하여 마진을 계산하세요.',
          '최소 주문 수량(MOQ)과 배송 조건을 확인하세요.',
        ],
        externalLink: { url: 'https://domeggook.com', label: '도매꾹 바로가기' },
      },
      {
        title: '도매처 평가 기준',
        description: '좋은 도매처를 판별하는 기준을 알아봅니다.',
        detailedInstructions: [
          '필수 확인 항목:',
          '1. 사업자등록증 보유 여부 (세금계산서 발행 가능한지)',
          '2. 상품 품질 일관성 (매번 같은 품질인지)',
          '3. 재고 안정성 (자주 품절되지 않는지)',
          '4. 발송 속도 (주문 후 몇 일 만에 출고하는지)',
          '5. 반품/교환 대응 (불량 시 교환이 가능한지)',
          '6. 가격 경쟁력 (다른 도매처 대비 합리적인지)',
          '여러 도매처를 비교한 후 최적의 파트너를 선택하세요.',
        ],
        warning: '너무 싼 가격만 보고 선택하면 안 돼요. 품질, 안정성, A/S 대응을 종합적으로 판단하세요.',
      },
      {
        title: '거래 조건 협상',
        description: '유리한 거래 조건을 만들어갑니다.',
        detailedInstructions: [
          '첫 거래: 소량으로 시작하며 품질과 배송을 테스트하세요.',
          '거래량이 늘면 단가 인하를 요청하세요.',
          '결제 조건: 초기에는 선결제, 신뢰가 쌓이면 후결제(월 정산) 협상.',
          '무료 배송 조건, 반품 정책을 미리 확인하세요.',
          '독점 거래 제안: 특정 상품을 나만 판매할 수 있는 조건을 협상하세요.',
          '모든 조건은 문서(카톡, 이메일)로 기록하세요.',
        ],
        tip: '좋은 도매처를 발견하면 장기 거래를 제안하세요. "매달 XX개 이상 주문할게요" 같은 확약이 단가 인하에 효과적이에요.',
      },
      {
        title: '샘플 주문 및 테스트',
        description: '본격 사입 전에 샘플로 검증합니다.',
        detailedInstructions: [
          '반드시 소량(1~5개)을 먼저 주문하세요.',
          '받은 상품의 품질, 포장 상태, 배송 속도를 체크하세요.',
          '상품 사진과 실물이 일치하는지 확인하세요.',
          '쿠팡에서 실제로 판매가 되는지 소량으로 테스트하세요.',
          '테스트 판매 후 마진, 반품률, 고객 반응을 확인하세요.',
          '문제가 없으면 발주량을 늘리세요.',
        ],
      },
      {
        title: '장기 관계 구축',
        description: '도매처와 win-win 관계를 만듭니다.',
        detailedInstructions: [
          '정기적으로 주문하여 안정적인 거래처임을 보여주세요.',
          '결제 기한을 지키세요. 빠른 결제는 신뢰를 쌓아요.',
          '불만이 있어도 감정적으로 대하지 말고, 건설적으로 피드백하세요.',
          '명절, 연말에 간단한 인사를 전하세요.',
          '시장 정보나 트렌드를 공유하면 도매처도 고마워해요.',
          '한 도매처에만 의존하지 말고, 2~3곳과 관계를 유지하세요.',
        ],
        tip: '좋은 도매처와의 관계는 사업의 가장 큰 자산이에요. 단기 이익보다 장기 파트너십을 우선하세요.',
      },
      {
        title: '도매처 정보 기록 관리',
        description: '도매처 정보를 체계적으로 관리합니다.',
        detailedInstructions: [
          '스프레드시트에 도매처 정보를 정리하세요:',
          '- 업체명, 연락처, 담당자, 거래 시작일',
          '- 주요 취급 상품, 최소주문수량(MOQ)',
          '- 결제 조건, 배송 소요일',
          '- 품질 평가 (A/B/C 등급)',
          '- 특이사항 (강점, 주의점)',
          '거래 내역(날짜, 수량, 금액)도 함께 기록하세요.',
          '정기적으로 업데이트하고, 비활성 도매처도 기록은 보관하세요.',
        ],
      },
    ],
    faqs: [
      {
        question: '도매처를 어떻게 찾나요?',
        answer:
          '온라인 도매 플랫폼(도매꾹, 사입삼촌)이 가장 쉬운 시작점이에요. 오프라인은 남대문, 동대문 도매시장을 방문해보세요. 네이버에서 "○○ 도매"로 검색해도 많이 나와요.',
      },
      {
        question: '최소 주문 수량(MOQ)이 부담돼요.',
        answer:
          'MOQ가 높은 도매처는 처음엔 피하세요. 도매꾹 같은 플랫폼에서는 소량(1~5개)부터 구매 가능한 상품도 많아요. 다른 셀러와 공동구매하는 방법도 있어요.',
      },
      {
        question: '해외(중국) 도매는 어떤가요?',
        answer:
          '1688, 알리바바 등을 통해 중국 도매가 가능해요. 가격이 매우 저렴하지만, 배송 시간(2~4주), 품질 편차, 통관 문제가 있을 수 있어요. 사입삼촌 같은 대행 서비스를 이용하면 편해요.',
      },
    ],
    relatedArticleIds: ['inventory-management', 'product-photography', 'coupang-invoice'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 광고/마케팅 - 아이템위너 완전 정복
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'item-winner-strategy',
    categoryId: 'advertising',
    title: '아이템위너 완전 정복',
    subtitle: '쿠팡 아이템위너 선정 기준과 유지 전략',
    icon: '🏆',
    estimatedTime: '약 15분',
    overview:
      '동일 상품을 여러 판매자가 판매할 때, 쿠팡이 대표로 노출하는 판매자를 아이템위너라고 해요. 아이템위너가 되면 해당 상품 페이지의 "장바구니" 버튼 옆에 내 가격이 표시됩니다. 아이템위너 선정 6가지 기준과 전략을 완벽하게 알려드릴게요!',
    steps: [
      {
        title: '아이템위너란 무엇인가',
        description: '아이템위너의 개념과 매출에 미치는 영향을 이해합니다.',
        detailedInstructions: [
          '아이템위너(Item Winner)란?',
          '- 동일 상품을 여러 판매자가 판매할 때 쿠팡이 선정하는 "대표 판매자"',
          '- 상품 페이지에서 "장바구니 담기" 버튼에 내 가격이 직접 노출됨',
          '- 아이템위너가 아닌 판매자는 "다른 판매자 보기"를 눌러야 보임',
          '',
          '아이템위너의 매출 영향:',
          '- 아이템위너 = 해당 상품 주문의 70~90%를 차지',
          '- 아이템위너가 아니면 거의 판매가 이루어지지 않음',
          '- 실시간 경쟁에 따라 언제든 변경될 수 있음',
        ],
        tip: '같은 상품을 파는 경쟁자가 있다면 아이템위너 확보가 매출의 핵심이에요!',
      },
      {
        title: '아이템위너 선정 6대 기준',
        description: '쿠팡이 아이템위너를 선정할 때 보는 6가지 기준입니다.',
        detailedInstructions: [
          '쿠팡은 다음 6가지 요소를 종합적으로 평가합니다:',
          '',
          '① 판매가 - 낮을수록 유리',
          '- 가장 결정적인 요소',
          '- 경쟁자 대비 가격이 높으면 아이템위너 불가',
          '',
          '② 단위당 판매가격 - 낮을수록 유리 (2024.07.28 신설)',
          '- 용량/수량 단위(ml, kg, 개 등)로 정해진 가격',
          '- 예: 500ml 물 10개 → 100ml당 200원이 단위가격',
          '- 묶음 상품일수록 단위가격이 낮아져 유리',
          '',
          '③ 배송비 - 낮을수록 유리',
          '- [판매가 + 배송비] 합산이 핵심!',
          '- 무료배송이 가장 유리',
          '',
          '④ 재고현황 - 충분할수록 유리',
          '- 재고 부족 시 아이템위너에서 탈락 가능',
          '- 안정적 재고 유지가 중요',
          '',
          '⑤ 출고소요기간 - 짧을수록 유리',
          '- 당일/익일 출고가 가장 유리',
          '- 3일 이상이면 불리',
          '',
          '⑥ 판매자점수 - 높을수록 유리',
          '- 동일 조건이라면 판매자 점수로 결정',
          '- 99점 이상을 유지하면 경쟁 우위',
        ],
        warning: '핵심 공식: [판매가 + 배송비] 합산이 가장 낮은 판매자가 아이템위너! 동일 조건이면 판매자 점수 순.',
      },
      {
        title: '단위가격 기준 완벽 이해',
        description: '2024년 7월에 신설된 단위가격 기준을 자세히 알아봅니다.',
        detailedInstructions: [
          '단위가격이란?',
          '- 상품의 용량/수량 단위로 환산한 가격',
          '- ml, g, kg, L, 개 등의 단위로 계산',
          '',
          '예시:',
          '- A 판매자: 500ml 물 10개 = 5,000원 → 100ml당 100원',
          '- B 판매자: 500ml 물 5개 = 3,000원 → 100ml당 120원',
          '- → A 판매자의 단위가격이 더 낮아 아이템위너에 유리',
          '',
          '전략적 활용법:',
          '- 묶음 상품(세트 구성)으로 단위가격 낮추기',
          '- 대용량 옵션 제공으로 단위가격 경쟁력 확보',
          '- 쿠팡윙 > 가격관리 > "내 상품가"에서 단위가격 확인 가능',
          '',
          '주의사항:',
          '- 단위가격이 기존 옵션보다 높아지면 노출 제한 발생 가능',
          '- 쿠팡이 제안하는 "추천가"를 참고하여 조정',
        ],
        tip: '묶음 판매는 단위가격을 낮추는 가장 효과적인 전략이에요. 5+1 같은 구성도 고려해보세요!',
      },
      {
        title: '아이템위너 확보 실전 전략',
        description: '아이템위너를 확보하고 유지하기 위한 구체적인 전략입니다.',
        detailedInstructions: [
          '전략 1 - 가격 경쟁력 확보',
          '- 경쟁자 가격을 주 2~3회 모니터링',
          '- [판매가 + 배송비] 합산을 경쟁자보다 낮게 유지',
          '- 무료배송 설정으로 합산 가격 경쟁력 확보',
          '',
          '전략 2 - 묶음/세트 상품 전략',
          '- 단위가격을 낮추는 묶음 구성 (예: 3+1, 5팩 세트)',
          '- 소비자도 묶음 구매를 선호하는 카테고리에서 효과적',
          '',
          '전략 3 - 출고 속도 최적화',
          '- 출고소요일 1~2일로 설정',
          '- 당일출고 가능한 상품은 당일출고 설정',
          '',
          '전략 4 - 재고 안정적 유지',
          '- 아이템위너인 상품은 재고 품절 방지 최우선',
          '- 품절 시 즉시 아이템위너 탈락 → 경쟁자에게 넘어감',
          '',
          '전략 5 - 판매자 점수 99점 유지',
          '- 가격이 같으면 점수가 높은 판매자가 유리',
          '- 앞서 배운 점수 관리법 활용',
        ],
      },
      {
        title: '아이템위너 모니터링 & 대응',
        description: '아이템위너 상태를 모니터링하고 탈락 시 빠르게 대응하는 방법입니다.',
        detailedInstructions: [
          '모니터링 방법:',
          '- 내 상품 페이지에서 "장바구니 담기" 옆에 내 가격이 표시되는지 확인',
          '- "다른 판매자 보기"를 눌러 경쟁자 가격 확인',
          '- 쿠팡윙 > 가격관리 페이지에서 아이템위너 상태 확인',
          '',
          '아이템위너 탈락 시 대응:',
          '1. 경쟁자 가격 확인 → 누가 아이템위너인지 파악',
          '2. 가격 조정 가능 여부 판단',
          '3. 마진이 남는다면 가격 인하',
          '4. 마진이 안 남으면 묶음/세트 구성으로 차별화',
          '5. 무료배송으로 합산 가격 경쟁력 확보',
          '',
          '주의: 지나친 가격 경쟁은 마진을 잃는 출혈 경쟁으로 이어질 수 있어요.',
          '수익성을 유지하면서 경쟁하는 균형이 중요합니다.',
        ],
        tip: '아이템위너를 뺏겼다고 무조건 가격을 내리지 마세요. 마진 없는 판매보다 다른 상품에서 아이템위너를 확보하는 게 나을 수 있어요.',
      },
    ],
    faqs: [
      {
        question: '아이템위너가 수시로 바뀌나요?',
        answer:
          '네, 실시간 경쟁에 따라 언제든 변경될 수 있어요. 경쟁자가 가격을 내리면 바로 넘어갈 수 있고, 재고가 떨어져도 탈락합니다. 주기적으로 모니터링하세요.',
      },
      {
        question: '로켓배송 상품과 마켓플레이스 상품도 경쟁하나요?',
        answer:
          '네, 같은 상품이라면 로켓배송과 마켓플레이스 판매자가 함께 경쟁합니다. 다만 로켓배송은 쿠팡이 직접 판매하므로 가격과 배송에서 유리한 경우가 많아요.',
      },
      {
        question: '아이템위너 없이도 판매가 가능한가요?',
        answer:
          '가능하지만 매우 어려워요. 아이템위너가 아니면 "다른 판매자 보기"를 눌러야 노출되기 때문에 주문이 크게 줄어듭니다. 독자적인 상품(자체 브랜드 등)이라면 아이템위너 경쟁 자체가 없어 유리해요.',
      },
    ],
    relatedArticleIds: ['seller-grade-penalty', 'product-exposure-optimization', 'product-listing-seo', 'inventory-management'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 광고/마케팅 - 상품 노출 최적화 & SEO
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'product-exposure-optimization',
    categoryId: 'advertising',
    title: '상품 노출 최적화 & 검색 SEO',
    subtitle: '쿠팡 검색 알고리즘을 이해하고 상위 노출 달성하기',
    icon: '🔍',
    estimatedTime: '약 20분',
    overview:
      '쿠팡은 셀러에게 100점 만점의 노출점수를 부여하며, 80점 이상이면 상위노출이 가능해요. 검색 순위 1단계 상승 시 매출이 약 23% 증가하고, 상위 노출 제품은 재구매율이 2.7배 높습니다. 노출점수 체계, 검색 알고리즘 핵심 요인, 상품명 SEO 최적화 전략을 완벽 정리했어요!',
    steps: [
      {
        title: '노출점수 100점 체계 이해',
        description: '쿠팡의 100점 만점 노출점수 구성 요소를 알아봅니다.',
        detailedInstructions: [
          '쿠팡은 셀러에게 100점 만점 기준으로 노출점수를 부여합니다.',
          '80점 이상이면 상위노출이 가능해요.',
          '',
          '노출점수 구성 3요소:',
          '',
          '① 출고일 점수',
          '- 짧을수록 높은 점수',
          '- 설정: 쿠팡윙 > 상품관리 > 상품조회/수정 > 배송',
          '- 당일출고 > 1일 > 2일 > 3일 순으로 유리',
          '',
          '② 상품점수',
          '- 브랜드명, 부가세, 필수항목을 정확히 입력할수록 높은 점수',
          '- 설정: 쿠팡윙 > 상품관리 > 상품조회/수정 > 상품주요정보',
          '- 카테고리별 필수 속성을 빠짐없이 입력',
          '',
          '③ 가격경쟁력',
          '- 유사 상품 대비 저렴할수록 유리',
          '- 직접 가격 관리 필요',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/--------.png', alt: '노출점수 관리 화면', caption: '쿠팡윙 > 상품관리 > 노출점수 관리에서 확인' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/-----------.png', alt: '상품 주요정보 개선 화면', caption: '상품점수 향상을 위한 주요정보 개선' },
        ],
        tip: '노출점수 관리 메뉴에서 각 상품의 점수와 개선 포인트를 바로 확인할 수 있어요!',
      },
      {
        title: '쿠팡 검색 알고리즘 8대 요인',
        description: '쿠팡 검색 엔진이 상품 순위를 결정할 때 고려하는 8가지 핵심 요인입니다.',
        detailedInstructions: [
          '쿠팡 검색 알고리즘이 고려하는 8가지 핵심 요인:',
          '',
          '① 검색 정확도',
          '- 검색어와 상품명/설명의 일치도',
          '- 핵심 키워드를 상품명 앞쪽에 배치',
          '',
          '② 사용자 선호도 (CTR - 클릭률)',
          '- 검색 결과에서 고객이 얼마나 많이 클릭하는지',
          '- 매력적인 썸네일 이미지가 핵심',
          '',
          '③ 상품정보 충실도',
          '- 상세 설명, 이미지, 속성 정보가 얼마나 충실한지',
          '- 필수 속성 100% 입력이 기본',
          '',
          '④ 판매실적',
          '- 최근 판매량이 많은 상품에 가산점',
          '- 초기에는 광고로 판매 실적 축적 필요',
          '',
          '⑤ 전환율 (CVR)',
          '- 상품 페이지 방문 후 실제 구매한 비율',
          '- 가격, 리뷰, 상세페이지 품질이 영향',
          '',
          '⑥ 찜수 증가율',
          '- 고객의 관심도를 나타내는 지표',
          '- 급격한 찜수 증가 = 트렌드 상품으로 인식',
          '',
          '⑦ 고객 리뷰',
          '- 리뷰 수와 평점이 높을수록 유리',
          '- 별점 4.0 이상 유지 권장',
          '',
          '⑧ 판매자 신뢰도',
          '- 판매자 점수가 검색 순위에도 반영',
          '- 99점 이상 유지가 노출에도 중요',
        ],
        tip: '순위 1단계 상승 시 매출이 약 23% 증가해요. 상위 노출 제품은 재구매율이 평균 2.7배 높습니다!',
      },
      {
        title: '상품명 SEO 최적화 (황금 공식)',
        description: '검색에 잘 잡히는 상품명을 작성하는 핵심 공식입니다.',
        detailedInstructions: [
          '상품명 작성 황금 공식:',
          '[브랜드명] - [제품명] - [핵심 기능] - [용량/규격] - [차별화 포인트]',
          '',
          '핵심 규칙:',
          '- 총 길이: 80자 이내 유지',
          '- 핵심 키워드: 앞쪽 40자 안에 배치 (모바일 잘림 고려)',
          '- 키워드 수: 3~5개의 핵심 키워드를 자연스럽게 배치',
          '- 태그: 10~15개 정도가 적당',
          '',
          '좋은 예시:',
          '- "[브랜드] 프리미엄 견과류 믹스 1kg 대용량 무첨가 무염"',
          '- "[브랜드] 남성 기능성 반팔 티셔츠 쿨링 속건 여름용"',
          '',
          '나쁜 예시:',
          '- "최고 인기 1위 대박 핫딜 세일 견과류" (과도한 키워드 반복)',
          '- "[브랜드명][브랜드명][브랜드명] 견과류" (브랜드명 반복)',
          '',
          '절대 하면 안 되는 것:',
          '- 과도한 키워드 반복 → 노출 제한 위험!',
          '- 상품과 무관한 인기 키워드 삽입 → 불공정 키워드로 제재',
          '- 특수문자 남용 (★, ♥, ◆ 등)',
        ],
        copyableTemplates: [
          {
            label: '상품명 작성 공식',
            text: '[브랜드명] [제품 카테고리] [핵심 특징/기능] [용량/규격/수량] [차별화 포인트]',
          },
        ],
        warning: '과도한 키워드 반복은 노출 제한 사유! 자연스러운 상품명이 가장 좋아요.',
      },
      {
        title: '키워드 리서치 방법',
        description: '검색량 높은 키워드를 찾아 상품명과 태그에 반영하는 방법입니다.',
        detailedInstructions: [
          '방법 1 - 쿠팡 검색창 자동완성 활용',
          '- 쿠팡 앱/웹에서 핵심 키워드를 입력',
          '- 자동완성으로 뜨는 연관 키워드 = 실제 검색량 높은 키워드',
          '- 주 2회 모니터링하여 신규 트렌드 키워드 반영',
          '',
          '방법 2 - 경쟁 상품 분석',
          '- 같은 카테고리 상위 노출 상품의 상품명 분석',
          '- 공통적으로 사용하는 키워드 파악',
          '- 차별화 키워드 추가 (소재, 특징, 용도 등)',
          '',
          '방법 3 - 네이버 키워드 도구 활용',
          '- 네이버 키워드 플래너(searchad.naver.com)에서 검색량 확인',
          '- 쿠팡과 네이버의 검색 트렌드가 비슷한 경우가 많음',
          '',
          '태그 작성 팁:',
          '- 태그는 10~15개가 적당',
          '- 상품명에 포함하지 못한 연관 키워드를 태그로 보완',
          '- 띄어쓰기 없는 복합어도 태그에 포함 (예: "남성반팔", "여름티셔츠")',
        ],
        tip: '매주 쿠팡 검색창 자동완성을 체크하면 시즌별 인기 키워드를 빠르게 캐치할 수 있어요!',
      },
      {
        title: '상품 상세페이지 최적화',
        description: '전환율(CVR)을 높이는 상세페이지 작성 전략입니다.',
        detailedInstructions: [
          '전환율을 높이는 상세페이지 핵심 요소:',
          '',
          '1. 대표 이미지 (썸네일)',
          '- 흰 배경, 고화질, 상품이 80% 이상 차지',
          '- 첫 번째 이미지가 클릭률(CTR)을 결정',
          '',
          '2. 상세 이미지 구성 (권장 순서)',
          '- ① 핵심 혜택/차별점 1장',
          '- ② 상품 상세 스펙 1장',
          '- ③ 사용 장면/활용법 1~2장',
          '- ④ 크기/수량 비교 1장',
          '- ⑤ 배송/교환/반품 안내 1장',
          '',
          '3. 필수 속성 100% 입력',
          '- 카테고리별 필수 속성을 빠짐없이 입력',
          '- 소재, 크기, 색상, 원산지 등',
          '- 누락된 속성 = 상품점수 감소 = 노출 불이익',
          '',
          '4. 배송 관련 설정',
          '- 당일출고 + 무료배송 + 무료반품 설정 시 배송 뱃지 부착',
          '- 뱃지 부착 시 구매 전환율 최대 7배 증가!',
        ],
        tip: '배송 뱃지(당일출고/무료배송/무료반품)를 설정하면 구매 전환율이 최대 7배까지 올라요!',
      },
      {
        title: '노출 제한 방지 체크리스트',
        description: '상품 노출이 제한되는 주요 사유와 방지법입니다.',
        detailedInstructions: [
          '노출이 제한되는 주요 사유:',
          '',
          '① 판매부적합 상품',
          '- 현행법상 판매 불가/온라인 판매 불가 품목',
          '- 쿠팡 정책상 금지 품목',
          '',
          '② 중복상품 등록',
          '- 동일 판매자가 같은 상품을 중복 등록',
          '- 옵션(색상/사이즈)은 하나의 상품에서 관리',
          '',
          '③ 가격 관련',
          '- 단위당 판매가격이 기존 옵션보다 높은 경우',
          '- 비합리적으로 높은 가격 설정',
          '',
          '④ 구매대행 사전심의 식품',
          '- 건강기능식품, 건강보조식품, 특수영양식품',
          '- 사전 심의가 필요한 품목',
          '',
          '⑤ 상품 정보 위반',
          '- 허위/과장 상품정보',
          '- 불공정 키워드 사용',
          '',
          '방지 체크리스트:',
          '- 중복 등록 상품 없는지 확인',
          '- 모든 필수 속성이 입력되어 있는지 확인',
          '- 상품명에 과도한 키워드가 없는지 확인',
          '- 가격이 시장 가격 범위 내인지 확인',
        ],
        warning: '노출 제한이 걸리면 검색 결과에서 아예 보이지 않아요. 정기적으로 노출 제한 상품이 없는지 확인하세요!',
      },
    ],
    faqs: [
      {
        question: '노출점수가 80점 미만이면 어떻게 되나요?',
        answer:
          '80점 미만이면 상위 노출에서 제외되어 검색 결과 하단에 밀려요. 노출점수가 높을수록 검색 결과 상위에 노출됩니다. 쿠팡윙 > 상품관리 > 노출점수 관리에서 개선 포인트를 확인하세요.',
      },
      {
        question: '신규 상품인데 판매 실적이 없어서 노출이 안 돼요.',
        answer:
          '초기에는 쿠팡 광고(키워드 광고)를 활용하여 초기 판매 실적을 쌓는 것이 효과적이에요. 광고로 판매가 일어나면 자연 검색 순위도 함께 올라갑니다.',
      },
      {
        question: '로켓그로스 뱃지가 노출에 얼마나 도움이 되나요?',
        answer:
          '판매자로켓(로켓그로스) 뱃지는 검색 노출 우선권과 소비자 신뢰도를 높여줘요. 뱃지 해제 시 평균 40~60% 매출이 감소한다는 데이터가 있을 정도로 영향이 큽니다.',
      },
    ],
    relatedArticleIds: ['item-winner-strategy', 'seller-grade-penalty', 'product-listing-seo', 'product-photography', 'coupang-ad-basics'],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━
  // 계정관리 - 쿠팡 API 활용 가이드 (PT 회원용)
  // ━━━━━━━━━━━━━━━━━━━━━━
  {
    articleId: 'coupang-api-pt-tools',
    categoryId: 'account-management',
    title: '쿠팡 API 활용 (자동화)',
    subtitle: 'API를 연동하여 매출/주문/재고를 자동으로 관리하기',
    icon: '🤖',
    estimatedTime: '약 25분',
    overview:
      '쿠팡 Open API를 활용하면 매출 데이터 자동 수집, 주문 모니터링, 재고 관리 자동화, CS 응대 추적 등을 자동화할 수 있어요. 수동으로 하던 작업을 API로 자동화하면 시간을 절약하고 실수도 줄일 수 있습니다. PT 코칭에서 활용할 수 있는 API 기능들을 알려드릴게요!',
    steps: [
      {
        title: '쿠팡 API 생태계 이해',
        description: '쿠팡이 제공하는 API 플랫폼 3가지를 이해합니다.',
        detailedInstructions: [
          '쿠팡은 3가지 API 플랫폼을 제공합니다:',
          '',
          '① 쿠팡 Open API (판매자/WING API)',
          '- 대상: 마켓플레이스 판매자',
          '- 기능: 상품 관리, 주문/배송, 반품/교환, CS, 정산, 쿠폰',
          '- 포털: developers.coupangcorp.com',
          '- 비용: 무료!',
          '',
          '② 쿠팡 파트너스 API (제휴 API)',
          '- 대상: 제휴 마케터',
          '- 기능: 상품 검색, 딥링크 생성',
          '- 포털: partners.coupang.com',
          '',
          '③ 쿠팡 Partner Integration API',
          '- 대상: 판매자 도구 제공 업체',
          '- 포털: partner-developers.coupangcorp.com',
          '',
          'PT 회원에게 가장 유용한 것은 ①번 Open API입니다!',
        ],
        externalLink: { url: 'https://developers.coupangcorp.com/hc/en-us', label: '쿠팡 Open API 공식 문서' },
      },
      {
        title: 'API 키 발급 받기',
        description: '쿠팡 Wing에서 API 키를 발급받는 방법입니다.',
        detailedInstructions: [
          'API 연동에 필요한 3가지 정보:',
          '- 업체코드 (vendorId): 회사/판매자 코드',
          '- Access Key: API 식별용 공개 키',
          '- Secret Key: HMAC 서명용 비밀 키',
          '',
          '발급 방법:',
          '1. 쿠팡 Wing(wing.coupang.com)에 로그인',
          '2. "판매자 정보" → "추가판매정보" 클릭',
          '3. "OPEN API 키 발급" 버튼 클릭',
          '4. 발급된 Access Key와 Secret Key를 안전하게 보관',
          '',
          '주의사항:',
          '- API 키 유효기간: 최대 6개월 (만료 후 재발급 필요)',
          '- 판매자 1명당 API 키 1개만 발급 가능',
          '- 사업자 인증이 완료된 판매자만 발급 가능',
          '- Secret Key는 발급 시 한 번만 표시되므로 반드시 저장!',
        ],
        warning: 'Secret Key는 발급 시 한 번만 보여줘요! 반드시 안전한 곳에 저장하고, 절대 다른 사람과 공유하지 마세요.',
      },
      {
        title: 'API로 할 수 있는 핵심 기능 8가지',
        description: '쿠팡 API의 8가지 주요 기능 카테고리와 활용법입니다.',
        detailedInstructions: [
          '① 상품 API (약 15개 엔드포인트)',
          '- 상품 등록/수정/조회/삭제',
          '- 가격 변경, 재고 수량 변경',
          '- 판매 일시중지/재개',
          '- 활용: 다수 상품 가격/재고 일괄 관리',
          '',
          '② 배송/환불 API (12개 엔드포인트)',
          '- 주문(PO) 목록 조회 (일별/분별)',
          '- 송장번호 업로드',
          '- 배송 상태 변경 이력 조회',
          '- 활용: 주문 자동 확인, 송장 자동 입력',
          '',
          '③ 반품 API (약 8개 엔드포인트)',
          '- 반품/취소 요청 목록 조회',
          '- 반품 승인/확인 처리',
          '- 활용: 반품율 자동 분석, 문제 상품 파악',
          '',
          '④ 교환 API',
          '- 교환 요청 목록 조회',
          '- 교환 상품 수령 확인',
          '- 활용: 교환 현황 모니터링',
          '',
          '⑤ CS API (5개 엔드포인트)',
          '- 고객 문의 조회 (상품별)',
          '- 쿠팡 CS센터 문의 조회',
          '- 활용: 미답변 문의 자동 알림, 응대 품질 분석',
          '',
          '⑥ 정산 API',
          '- 정산 내역 조회 (월별)',
          '- 매출 상세 조회 (일별)',
          '- 활용: 매출 자동 기록, 정산 예측',
          '',
          '⑦ 쿠폰 API',
          '- 즉시 할인 쿠폰 생성/조회',
          '- 다운로드 쿠폰 생성/만료',
          '- 활용: 프로모션 자동화',
          '',
          '⑧ 물류/카테고리 API',
          '- 카테고리 목록/상세 조회',
          '- AI 카테고리 추천',
          '- 배송/반품 센터 관리',
          '- 활용: 상품 등록 시 정확한 카테고리 매핑',
        ],
        tip: 'PT 코칭에서 가장 활용도가 높은 건 정산 API(매출 자동 수집)와 배송 API(주문 모니터링)예요!',
      },
      {
        title: 'PT 코칭에서 API 활용하기',
        description: '셀러 코칭(PT)에서 API를 활용하여 효과적으로 관리하는 방법입니다.',
        detailedInstructions: [
          '활용 1 - 매출 자동 트래킹',
          '- 정산 API로 일별/월별 매출 데이터 자동 수집',
          '- 수동 입력 없이 정확한 매출 현황 파악',
          '- 성장 추이 그래프 자동 생성',
          '',
          '활용 2 - 주문 모니터링 대시보드',
          '- 배송 API로 일별 주문량 자동 집계',
          '- 미처리 주문 알림 → 정시출고 점수 관리',
          '- 주간/월간 주문 트렌드 분석',
          '',
          '활용 3 - 반품율 분석',
          '- 반품 API로 반품 사유 자동 분류',
          '- 반품율 높은 상품 자동 식별',
          '- 개선 우선순위 도출',
          '',
          '활용 4 - 재고 관리 자동화',
          '- 상품 API로 재고 수량 실시간 모니터링',
          '- 재고 부족 상품 자동 알림',
          '- 재고 0 시 자동 판매중지 처리 가능',
          '',
          '활용 5 - CS 응대 품질 관리',
          '- CS API로 미답변 문의 자동 체크',
          '- 24시간 내 답변율 자동 계산',
          '- 응대 품질 점수 추적',
          '',
          '활용 6 - 정산 예측',
          '- 정산 API로 향후 정산금 예측',
          '- 현금 흐름 관리에 활용',
        ],
      },
      {
        title: 'API 연동 기술 사양',
        description: 'API 연동 시 알아야 할 기술적인 사양입니다.',
        detailedInstructions: [
          '인증 방식: HMAC-SHA256',
          '- Authorization 헤더와 X-Requested-By 헤더 필요',
          '- 형식: CEA algorithm=HmacSHA256, access-key=[KEY], signed-date=[TIMESTAMP], signature=[SIGNATURE]',
          '',
          '서명 생성 과정:',
          '1. datetime(yyMMddTHHmmssZ) + HTTP method + path + query string 결합',
          '2. Secret Key로 HMAC-SHA256 해시 생성',
          '3. 16진수 변환',
          '',
          'Rate Limit (호출 제한):',
          '- 기본: 초당 10회 (vendorId당)',
          '- 초과 시: HTTP 429 Too Many Requests 응답',
          '- 상품 API는 더 엄격한 제한 적용 (2023.10~)',
          '',
          '지원 언어: Java, Python, PHP, C#, Node.js',
          '',
          '주요 Base URL:',
          '- 상품: /v2/providers/seller_api/apis/api/v1/marketplace/',
          '- 배송: /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/',
          '- 정산: /v2/providers/marketplace_openapi/apis/api/v1/',
        ],
        externalLink: { url: 'https://developers.coupangcorp.com/hc/en-us/articles/360033461914-Creating-HMAC-Signature', label: 'HMAC 서명 생성 공식 문서' },
      },
      {
        title: 'API로 가져올 수 없는 데이터',
        description: '쿠팡 API에서 제공하지 않는 데이터와 대안을 알아봅니다.',
        detailedInstructions: [
          '현재 쿠팡 API에서 제공하지 않는 데이터:',
          '',
          '❌ 상품 리뷰/평점 (reviews/ratings)',
          '- API 엔드포인트 없음',
          '- 대안: 수동 확인 또는 웹 크롤링 (정책 주의)',
          '',
          '❌ 검색 순위/노출 데이터',
          '- 내 상품이 몇 번째에 노출되는지 API로 확인 불가',
          '- 대안: 직접 검색하여 확인',
          '',
          '❌ 트래픽/방문자/전환율 데이터',
          '- 상품 페이지 조회수, CTR, CVR 등',
          '- 대안: 쿠팡윙 대시보드에서 수동 확인',
          '',
          '❌ 경쟁사 분석 데이터',
          '- 경쟁 판매자의 가격, 판매량 등',
          '- 대안: 수동 모니터링',
          '',
          '❌ 광고(쿠팡 광고) 성과 데이터',
          '- 광고 노출수, 클릭수, ROAS 등',
          '- 대안: 쿠팡 광고 대시보드에서 확인',
        ],
        tip: 'API로 가져올 수 없는 데이터는 정기적으로 수동 확인하는 루틴을 만들어 보완하세요!',
      },
    ],
    faqs: [
      {
        question: 'API 키 발급은 무료인가요?',
        answer:
          '네, 쿠팡 Open API는 모든 등록된 판매자에게 무료로 제공됩니다. 별도의 비용 없이 사용할 수 있어요.',
      },
      {
        question: 'API 키가 만료되면 어떻게 하나요?',
        answer:
          'API 키는 최대 6개월 유효해요. 만료 전에 Wing > 판매자 정보 > 추가판매정보에서 새 키를 재발급 받으세요. 만료되면 모든 API 연동이 중단됩니다.',
      },
      {
        question: '프로그래밍을 모르는데 API를 사용할 수 있나요?',
        answer:
          '직접 코딩이 어려우시다면 걱정 마세요! 저희 PT 프로그램에서 API 연동 기능을 제공하고 있어요. Wing에서 API 키만 발급받아 입력하시면 자동으로 데이터를 수집합니다.',
      },
      {
        question: '파트너스 API는 셀러에게도 도움이 되나요?',
        answer:
          '쿠팡 파트너스(제휴) API는 직접 판매보다는 블로그나 SNS를 통한 제휴 마케팅용이에요. 셀러 관리에는 Open API(판매자 API)를 사용하세요. 단, 부수입으로 파트너스 활동을 병행하는 것도 좋은 전략이에요!',
      },
    ],
    relatedArticleIds: ['coupang-api-setup', 'seller-grade-penalty', 'inventory-management', 'cs-daily-management'],
  },

];

// ── 헬퍼 함수 ──

export function getArticlesByCategory(categoryId: string): GuideArticle[] {
  return GUIDE_ARTICLES.filter((a) => a.categoryId === categoryId);
}

export function getArticleById(articleId: string): GuideArticle | undefined {
  return GUIDE_ARTICLES.find((a) => a.articleId === articleId);
}

export function getCategoryById(categoryId: string): GuideCategory | undefined {
  return GUIDE_CATEGORIES.find((c) => c.categoryId === categoryId);
}

export function searchArticles(query: string): GuideArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return GUIDE_ARTICLES.filter((article) => {
    if (article.title.toLowerCase().includes(q)) return true;
    if (article.subtitle.toLowerCase().includes(q)) return true;
    if (article.overview.toLowerCase().includes(q)) return true;
    if (article.steps.some((s) => s.title.toLowerCase().includes(q))) return true;
    if (article.faqs.some((f) => f.question.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function getRelatedArticles(articleId: string): GuideArticle[] {
  const article = getArticleById(articleId);
  if (!article) return [];
  return article.relatedArticleIds
    .map((id) => getArticleById(id))
    .filter((a): a is GuideArticle => !!a);
}
