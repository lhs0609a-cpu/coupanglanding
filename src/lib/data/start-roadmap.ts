// 왕초보 셀러 시작 로드맵 데이터

export interface SubStep {
  id: string;
  label: string;
  description?: string;
  tip?: string;
  warning?: string;
  link?: { url: string; label: string };
  imagePlaceholder?: string;
}

export interface RoadmapStep {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: string; // lucide icon name
  estimatedTime: string;
  estimatedDays: number; // 영업일 기준
  cost: string;
  required: boolean; // false면 선택(건너뛰기 가능)
  subSteps: SubStep[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export const ROADMAP_STEPS: RoadmapStep[] = [
  {
    id: 'business-registration',
    number: 1,
    title: '사업자등록',
    subtitle: '온라인 판매의 첫 걸음, 사업자등록증 발급',
    icon: 'FileText',
    estimatedTime: '신청 5분 + 처리 3영업일',
    estimatedDays: 3,
    cost: '무료',
    required: true,
    subSteps: [
      {
        id: 'br-1',
        label: '사업자등록 유형 결정',
        description: '개인사업자(간이과세자)로 시작하는 것을 추천합니다. 연 매출 8,000만원 이하면 부가세 혜택이 있습니다.',
        tip: '처음 시작이라면 간이과세자가 유리합니다. 매출이 커지면 일반과세자로 자동 전환됩니다.',
      },
      {
        id: 'br-2',
        label: '업종코드 확인',
        description: '전자상거래 소매업(47911)을 선택합니다. 건강기능식품도 판매하려면 추가 업종이 필요합니다.',
        tip: '업종코드 47911 (전자상거래 소매업)이 기본입니다.',
      },
      {
        id: 'br-3',
        label: '사업장 주소 결정',
        description: '자택 주소를 사업장으로 등록할 수 있습니다. 별도 사무실이 필요하지 않습니다.',
        tip: '자택 주소로 등록 가능합니다. 임대차계약서 없이도 신청할 수 있어요.',
      },
      {
        id: 'br-4',
        label: '토스페이먼츠에서 간편 신청',
        description: '토스페이먼츠 사업자등록 바로신청 서비스를 이용하면 세무서 방문 없이 5분 만에 온라인으로 간편 신청이 가능합니다.',
        link: {
          url: 'https://onboarding.tosspayments.com/business-registration/intro',
          label: '토스페이먼츠 바로 신청하기',
        },
      },
      {
        id: 'br-5',
        label: '사업자등록증 수령 확인',
        description: '신청 후 약 3영업일 이내에 발급됩니다. 국세청 홈택스에서 조회할 수 있습니다.',
        tip: '발급 후 홈택스(hometax.go.kr)에서 PDF 다운로드 가능합니다.',
      },
    ],
  },
  {
    id: 'telecom-sales',
    number: 2,
    title: '통신판매업 신고',
    subtitle: '온라인 판매에 필수인 통신판매업 신고',
    icon: 'Shield',
    estimatedTime: '신청 5분 + 처리 5영업일',
    estimatedDays: 5,
    cost: '면허세 4~6만원',
    required: true,
    subSteps: [
      {
        id: 'ts-1',
        label: '사업자등록증 준비',
        description: '1단계에서 발급받은 사업자등록증이 필요합니다.',
        warning: '사업자등록증이 아직 없다면 1단계를 먼저 완료해주세요.',
      },
      {
        id: 'ts-2',
        label: '구비서류 확인',
        description: '사업자등록증 사본, 신분증 사본이 필요합니다. 구매안전서비스 이용확인증은 쿠팡 입점 후 발급받을 수 있습니다.',
        tip: '구매안전서비스 이용확인증은 나중에 보완 가능합니다. 먼저 신고부터 하세요.',
      },
      {
        id: 'ts-3',
        label: '토스페이먼츠에서 간편 신고',
        description: '토스페이먼츠 통신판매업 바로신청 서비스를 통해 온라인으로 간편하게 신고할 수 있습니다.',
        link: {
          url: 'https://onboarding.tosspayments.com/mail-order-business/intro',
          label: '토스페이먼츠 바로 신청하기',
        },
      },
      {
        id: 'ts-4',
        label: '면허세 납부',
        description: '관할 구청에서 면허세 고지서가 발급됩니다. 약 4~6만원이며 위택스에서 온라인 납부 가능합니다.',
        tip: '위택스(wetax.go.kr)에서 편리하게 납부할 수 있습니다.',
      },
      {
        id: 'ts-5',
        label: '통신판매업 신고번호 수령',
        description: '처리 완료 후 통신판매업 신고번호를 받게 됩니다. 쿠팡 입점 시 필요하니 보관하세요.',
      },
    ],
  },
  {
    id: 'health-food',
    number: 3,
    title: '건강기능식품 판매업 신고',
    subtitle: '건기식 판매 시 필수 — 해당 없으면 건너뛰기',
    icon: 'Heart',
    estimatedTime: '신청 30분 + 처리 7영업일',
    estimatedDays: 7,
    cost: '~28,000원',
    required: false,
    subSteps: [
      {
        id: 'hf-1',
        label: '건기식 판매 필요 여부 확인',
        description: '건강기능식품(비타민, 유산균, 오메가3 등)을 판매할 계획이 있는 경우에만 필요합니다.',
        tip: '일반 식품(과자, 음료 등)은 건기식이 아닙니다. 건기식 판매 계획이 없으면 건너뛰세요.',
      },
      {
        id: 'hf-2',
        label: '영업장 요건 확인',
        description: '건기식 판매업은 별도 영업장이 필요하지 않습니다. 인터넷 판매의 경우 자택도 가능합니다.',
      },
      {
        id: 'hf-3',
        label: '위생교육 수료 (선교육 필수)',
        description: '건강기능식품교육센터에서 신규영업자 교육을 수료해야 합니다. 일반판매업(온라인 판매) 기준 2시간, 수강료 약 28,000원. 영업신고 전에 반드시 먼저 수료해야 합니다.',
        link: {
          url: 'https://edu.khff.or.kr',
          label: '건강기능식품교육센터 바로가기',
        },
        tip: '접속 → "건강기능식품 법정교육" → "신규영업자 교육" → "일반판매업" 선택 → 신청/결제 → 온라인 수강 → 최종평가 합격 후 수료증 출력. PC/모바일 수강 가능. 문의: 1661-2371',
      },
      {
        id: 'hf-4',
        label: '정부24에서 영업 신고',
        description: '정부24 포털에서 건강기능식품 판매업 영업신고를 진행합니다.',
        link: {
          url: 'https://www.gov.kr',
          label: '정부24 바로가기',
        },
      },
      {
        id: 'hf-5',
        label: '영업신고증 수령',
        description: '처리 완료 후 건강기능식품 판매업 영업신고증을 수령합니다. 쿠팡 입점 시 첨부 서류로 필요합니다.',
      },
    ],
  },
  {
    id: 'coupang-wing',
    number: 4,
    title: '쿠팡 윙 파트너 가입',
    subtitle: '쿠팡 셀러 계정 만들고 판매 시작 준비',
    icon: 'ShoppingBag',
    estimatedTime: '신청 15분 + 승인 3영업일',
    estimatedDays: 3,
    cost: '무료',
    required: true,
    subSteps: [
      {
        id: 'cw-1',
        label: '쿠팡 윙 회원가입',
        description: '쿠팡 윙(wing.coupang.com)에서 판매자 회원가입을 진행합니다.',
        link: {
          url: 'https://wing.coupang.com',
          label: '쿠팡 윙 바로가기',
        },
      },
      {
        id: 'cw-2',
        label: '사업자 정보 입력',
        description: '사업자등록번호, 통신판매업 신고번호, 대표자 정보를 입력합니다.',
        warning: '1단계(사업자등록)와 2단계(통신판매업)를 먼저 완료해야 합니다.',
      },
      {
        id: 'cw-3',
        label: '정산 계좌 등록',
        description: '판매 대금을 받을 은행 계좌를 등록합니다. 사업자 명의 계좌가 필요합니다.',
        tip: '개인사업자는 대표자 개인 명의 계좌도 사용 가능합니다.',
      },
      {
        id: 'cw-4',
        label: '서류 업로드',
        description: '사업자등록증, 통신판매업 신고증, 통장 사본 등 필요 서류를 업로드합니다.',
      },
      {
        id: 'cw-5',
        label: '입점 승인 확인',
        description: '서류 검토 후 약 3영업일 이내에 승인됩니다. 승인 완료 후 상품 등록이 가능합니다.',
        tip: '승인 대기 중에 판매할 상품을 미리 준비해두면 시간을 절약할 수 있습니다.',
      },
    ],
  },
];

export const ROADMAP_FAQS: FAQItem[] = [
  {
    question: '사업자등록 없이 쿠팡에서 판매할 수 있나요?',
    answer: '아니요, 쿠팡을 포함한 모든 오픈마켓에서 판매하려면 사업자등록이 필수입니다. 다만 간이과세자로 등록하면 세금 부담을 최소화할 수 있습니다.',
  },
  {
    question: '간이과세자와 일반과세자 중 어떤 걸 선택해야 하나요?',
    answer: '처음 시작하는 경우 간이과세자를 추천합니다. 연 매출 8,000만원 이하면 부가세 혜택이 있고, 매출이 커지면 자동으로 일반과세자로 전환됩니다.',
  },
  {
    question: '통신판매업 신고는 왜 필요한가요?',
    answer: '전자상거래법에 따라 온라인으로 상품을 판매하려면 통신판매업 신고가 의무입니다. 미신고 시 과태료가 부과될 수 있습니다.',
  },
  {
    question: '건강기능식품 판매업 신고는 꼭 해야 하나요?',
    answer: '건강기능식품(비타민, 유산균, 프로바이오틱스 등)을 판매할 계획이 있는 경우에만 필요합니다. 일반 식품이나 다른 카테고리만 판매한다면 건너뛰어도 됩니다.',
  },
  {
    question: '전체 과정에 비용이 얼마나 드나요?',
    answer: '사업자등록(무료) + 통신판매업 면허세(4~6만원)만 필수 비용입니다. 건기식 판매업 신고 시 위생교육비(약 28,000원)가 추가됩니다. 총 5~9만원 내외로 시작할 수 있습니다.',
  },
  {
    question: '쿠팡 입점 승인까지 전체 기간은 얼마나 걸리나요?',
    answer: '사업자등록(3일) → 통신판매업(5일) → 쿠팡 윙 승인(3일)으로, 순차적으로 진행하면 약 2~3주 정도 소요됩니다. 건기식 판매업 포함 시 1주일 추가됩니다.',
  },
  {
    question: '쿠팡 외에 다른 마켓(네이버, 11번가 등)도 같은 절차인가요?',
    answer: '사업자등록과 통신판매업 신고는 모든 마켓 공통입니다. 각 마켓별 입점 절차만 다를 뿐, 기본 자격요건은 동일합니다.',
  },
];
