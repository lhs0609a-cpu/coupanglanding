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
];

// ── 가이드 콘텐츠 (9개) ──

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
    relatedArticleIds: ['coupang-invoice', 'coupang-settlement'],
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
    relatedArticleIds: ['naver-resale-order', 'coupang-return', 'seller-grade-penalty'],
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
        tip: '자주 리셀하는 상품은 즐겨찾기에 저장해두면 빠르게 찾을 수 있어요.',
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
      },
      {
        title: '배송 완료 확인 및 정산',
        description: '배송 완료 여부를 확인하고 수익을 정리합니다.',
        detailedInstructions: [
          '배송이 완료되면 네이버에서 구매 확정이 진행됩니다.',
          '네이버 판매 금액 - 쿠팡 구매 금액 = 순수익!',
          '수익을 기록해두면 월별 정산할 때 편해요.',
        ],
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
    ],
    relatedArticleIds: ['coupang-invoice', 'coupang-return'],
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
        warning: '고객 개인정보는 반품 처리 용도로만 사용하세요. 다른 목적으로 사용하면 안 돼요!',
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
      },
      {
        title: 'Wing에서 반품 승인 처리',
        description: '쿠팡 Wing에서 반품 완료 처리를 합니다.',
        detailedInstructions: [
          '쿠팡 Wing의 "주문/배송" → "반품관리" 메뉴로 이동하세요.',
          '해당 반품 건을 찾아 "입고완료" 처리를 하세요.',
          '검수 결과에 따라 "전액 환불" 또는 "부분 환불"을 선택하세요.',
        ],
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
      },
      {
        title: '기록 정리',
        description: '수거 건에 대한 기록을 정리합니다.',
        detailedInstructions: [
          '수거 날짜, 상품, 상태, 환불 금액을 기록하세요.',
          '자주 반품되는 상품이 있다면 원인을 분석해보세요.',
          '불량률이 높은 상품은 판매 중단을 고려해보세요.',
        ],
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
    ],
    relatedArticleIds: ['coupang-return', 'coupang-invoice'],
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
      },
      {
        title: '상품 검수',
        description: '수거된 상품의 상태를 확인합니다.',
        detailedInstructions: [
          '반품 상품이 도착하면 상태를 꼼꼼히 확인하세요.',
          '포장, 구성품, 상품 상태를 점검하세요.',
          '검수 결과를 사진으로 기록해두면 분쟁 시 증거가 돼요.',
        ],
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
    relatedArticleIds: ['self-pickup-return', 'difficult-customer'],
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
    relatedArticleIds: ['coupang-return', 'ip-issue-handling'],
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
    relatedArticleIds: ['ip-issue-handling', 'difficult-customer'],
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
    relatedArticleIds: ['vat-filing', 'coupang-invoice'],
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
    title: '판매자 등급 & 페널티',
    subtitle: '쿠팡 판매자 평가 기준과 페널티 방지법',
    icon: '⭐',
    estimatedTime: '약 15분',
    overview:
      '쿠팡은 판매자의 서비스 품질을 평가하여 등급을 부여하고, 기준 미달 시 페널티를 적용해요. 좋은 등급을 유지하면 검색 노출이 유리하고, 낮은 등급은 판매 제한까지 갈 수 있어요. 평가 기준과 관리 방법을 알려드려요!',
    steps: [
      {
        title: '판매자 등급 체계 이해',
        description: '쿠팡의 판매자 등급이 어떻게 구성되어 있는지 알아봅니다.',
        detailedInstructions: [
          '쿠팡 판매자 등급은 크게 4단계로 나뉩니다:',
          '- 골드(Gold): 최우수 등급, 검색 노출 최우선',
          '- 실버(Silver): 우수 등급, 안정적 판매 가능',
          '- 브론즈(Bronze): 보통 등급, 개선 필요',
          '- 옐로(Yellow): 경고 등급, 판매 제한 가능',
          '등급은 최근 60일간의 판매 활동을 기준으로 매주 월요일에 갱신됩니다.',
          'Wing "판매자 정보" → "판매자 점수"에서 현재 등급을 확인할 수 있어요.',
        ],
        tip: '골드 등급을 유지하면 쿠팡 검색 결과에서 상위 노출에 유리해요. 매출에 직접적인 영향을 줍니다!',
      },
      {
        title: '평가 항목별 기준',
        description: '판매자 등급에 영향을 주는 핵심 평가 항목을 알아봅니다.',
        detailedInstructions: [
          '① 24시간 내 출고율: 주문 접수 후 24시간 이내 출고한 비율',
          '- 목표: 95% 이상 유지',
          '② 배송 지연율: 약속된 배송일보다 늦게 배송된 비율',
          '- 목표: 3% 이하 유지',
          '③ 주문 취소율: 판매자 사유로 취소된 주문 비율',
          '- 목표: 1.5% 이하 유지 (품절 취소 포함!)',
          '④ 고객 응답 시간: 고객 문의에 대한 평균 응답 시간',
          '- 목표: 24시간 이내 응답',
          '⑤ 반품률: 전체 주문 대비 반품 비율',
          '- 목표: 5% 이하 유지',
          '⑥ 고객 리뷰 평점: 상품 리뷰 평균 점수',
          '- 목표: 4.0 이상 유지',
        ],
        warning: '주문 취소율이 가장 치명적이에요! 재고 없는 상품은 즉시 판매 중지하세요.',
      },
      {
        title: '판매자 점수 확인 방법',
        description: 'Wing에서 현재 판매자 점수와 상세 지표를 확인합니다.',
        detailedInstructions: [
          '쿠팡 Wing에 로그인하세요.',
          '"판매자 정보" → "판매자 점수" 메뉴를 클릭하세요.',
          '전체 점수와 항목별 세부 점수를 확인할 수 있어요.',
          '각 항목의 추이(지난 주 대비)도 표시됩니다.',
          '점수가 떨어지고 있는 항목을 집중적으로 관리하세요.',
        ],
        images: [
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/--------.png', alt: '노출점수 관리 화면', caption: '쿠팡윙 > 상품관리 > 노출점수 관리' },
          { src: 'https://abear-corp.ghost.io/content/images/2025/05/-----------.png', alt: '상품 주요정보 개선 화면', caption: '상품점수 향상을 위한 주요정보 개선' },
        ],
        tip: '매주 월요일에 점수가 갱신되니 주 초에 확인하는 습관을 들이세요.',
      },
      {
        title: '페널티 종류와 단계',
        description: '쿠팡에서 적용하는 페널티의 종류와 단계를 알아봅니다.',
        detailedInstructions: [
          '1단계 - 경고: 개선 요청 알림 발송',
          '2단계 - 검색 노출 제한: 상품이 검색 결과 하단으로 밀림',
          '3단계 - 신규 상품 등록 제한: 새 상품을 올릴 수 없음',
          '4단계 - 판매 일시 중지: 모든 상품 판매가 중지됨',
          '5단계 - 계정 영구 정지: 더 이상 판매 불가 (최악의 경우)',
          '추가 과징금: 반복 위반 시 판매 대금에서 과징금 차감 가능',
        ],
        warning: '한 번 계정이 영구 정지되면 같은 사업자번호로 재가입이 불가능해요. 절대 이 단계까지 가지 않도록 주의하세요!',
      },
      {
        title: '자주 발생하는 페널티 사유',
        description: '초보 셀러가 자주 받는 페널티 사유를 알아봅니다.',
        detailedInstructions: [
          '① 품절 취소 반복: 재고 관리를 안 해서 주문 취소가 잦은 경우',
          '→ 대응: 재고 없는 상품 즉시 판매 중지, 재고 수량 보수적으로 설정',
          '② 출고 지연: 약속된 시간 내에 출고하지 못하는 경우',
          '→ 대응: 출고 소요일을 여유 있게 설정 (2~3일), 하루 2~3회 주문 확인',
          '③ 허위/과장 상품 정보: 실물과 다른 이미지, 과장된 설명',
          '→ 대응: 정확한 상품 정보 기재, 실제 사진 사용',
          '④ 고객 문의 미응답: 24시간 이상 답변하지 않는 경우',
          '→ 대응: 하루 2번 이상 문의 확인, 최소 24시간 내 응답',
          '⑤ 지재권 침해: 위조품 판매, 타 브랜드 도용',
          '→ 대응: 정품만 판매, 구매 증빙 보관',
        ],
      },
      {
        title: '등급 올리기 실전 전략',
        description: '판매자 등급을 올리거나 유지하기 위한 실전 전략입니다.',
        detailedInstructions: [
          '전략 1 - 빠른 출고: 오전에 들어온 주문은 당일 처리하세요.',
          '전략 2 - 재고 안전 관리: 실제 재고보다 적게 등록하세요 (여유분 확보).',
          '전략 3 - 고객 응대 자동화: 자주 묻는 질문 답변 템플릿을 준비하세요.',
          '전략 4 - 상품 설명 정확하게: 사이즈, 색상, 소재 등을 정확히 기재하여 반품 감소.',
          '전략 5 - 포장 꼼꼼하게: 파손 방지 포장으로 불량 반품을 줄이세요.',
          '전략 6 - 리뷰 관리: 구매 확정 후 리뷰 요청, 불만 리뷰에 빠른 대응.',
          '전략 7 - 문제 상품 빠른 제거: 반품률 높은 상품은 과감히 판매 중지.',
        ],
        tip: '매출 규모를 키우는 것보다 등급을 유지하는 게 더 중요해요. 등급이 떨어지면 노출이 줄어 매출도 함께 떨어집니다.',
      },
      {
        title: '페널티 받았을 때 대처법',
        description: '페널티를 받았을 때 해결하는 방법입니다.',
        detailedInstructions: [
          '1. 페널티 사유를 정확히 파악하세요 (Wing 알림 확인).',
          '2. 해당 문제를 즉시 시정하세요 (재고 정리, 상품 정보 수정 등).',
          '3. 부당한 페널티라면 이의제기를 하세요:',
          '   - Wing "판매자 지원" → "이의제기" 접수',
          '   - 증빙 자료를 첨부하여 제출',
          '4. 판매자콜센터(1600-9879)에 전화 상담도 가능해요.',
          '5. 시정 후 보통 1~2주 내에 페널티가 해제됩니다.',
          '6. 같은 사유로 반복 페널티를 받지 않도록 근본적으로 개선하세요.',
        ],
      },
      {
        title: '계정 건강 체크리스트',
        description: '매주 확인해야 할 계정 건강 체크 항목입니다.',
        detailedInstructions: [
          '매주 월요일 체크 항목:',
          '- 판매자 점수/등급 확인',
          '- 미처리 주문 0건인지 확인',
          '- 미응답 고객 문의 0건인지 확인',
          '- 재고 부족 상품 없는지 확인',
          '- 반품/교환 요청 처리 상태 확인',
          '매월 체크 항목:',
          '- 반품률 5% 이하인지 확인',
          '- 주문 취소율 1.5% 이하인지 확인',
          '- 고객 리뷰 평점 4.0 이상인지 확인',
          '- 판매 중지된 상품 없는지 확인',
        ],
        tip: '이 체크리스트를 매주 습관적으로 확인하면 페널티를 미리 방지할 수 있어요!',
      },
    ],
    faqs: [
      {
        question: '등급이 갑자기 떨어졌어요. 왜 그런 건가요?',
        answer:
          '최근 60일간의 데이터로 매주 갱신되기 때문에, 특정 기간에 주문 취소나 반품이 몰리면 갑자기 떨어질 수 있어요. Wing에서 항목별 점수를 확인하여 어떤 지표가 나빠졌는지 파악하세요.',
      },
      {
        question: '페널티가 해제되는 데 얼마나 걸리나요?',
        answer:
          '경고 수준은 문제 시정 후 보통 1~2주 내에 자동 해제돼요. 판매 중지 수준은 이의제기 후 검토 기간(5~10영업일)이 필요하고, 시정 확인 후 해제됩니다.',
      },
      {
        question: '주문이 적어도 등급에 영향을 받나요?',
        answer:
          '네, 주문 수가 적으면 한두 건의 취소/반품이 비율에 크게 영향을 줄 수 있어요. 초기에는 소량이라도 품질 높은 판매를 유지하는 게 중요해요.',
      },
      {
        question: '계정이 정지되면 정산금은 어떻게 되나요?',
        answer:
          '계정 정지 시 미정산 금액은 일정 기간 보류 후 지급됩니다. 다만 위반 과징금이 차감될 수 있어요. 상세한 내용은 쿠팡 판매자 지원에 문의하세요.',
      },
    ],
    relatedArticleIds: ['coupang-settlement', 'coupang-invoice', 'difficult-customer'],
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
