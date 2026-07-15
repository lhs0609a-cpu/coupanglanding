import type { Channel } from '@/lib/megaload/types';

export interface ChannelGuideStep {
  stepNumber: number;
  title: string;
  description: string;
  detailedInstructions: string[];
  url?: string;
  tip?: string;
  warning?: string;
  inputFields?: string[];
  /** 실제 화면 예시 이미지(외부). 로드 실패 시 마법사가 자동 목업으로 폴백. */
  imageUrl?: string;
}

export interface ChannelSetupGuide {
  channel: Channel;
  title: string;
  estimatedTime: string;
  prerequisites: string[];
  steps: ChannelGuideStep[];
  finalNote: string;
}

/**
 * 채널별 입점 + API 키 발급 튜토리얼 (딥리서치 2026-07 기준, 실측 절차).
 *
 * ⚠️ 채널마다 절차가 크게 다르다:
 *  - 쿠팡/네이버/11번가/롯데온: 셀러 포털에서 셀프 발급.
 *  - G마켓/옥션(ESM): 셀프 발급 메뉴 없음 → 이메일 신청만 가능(특이).
 *  - 11번가/롯데온/네이버/ESM: IP 화이트리스트 필수(메가로드 호출 서버 IP 등록).
 *
 * inputFields 가 있는 단계는 마법사가 "키 복사" 목업을, 권한/✅ 텍스트가 있으면 체크박스 목업을 자동 렌더.
 */
export const CHANNEL_SETUP_GUIDES: Record<Channel, ChannelSetupGuide> = {
  // ── 쿠팡 ──
  coupang: {
    channel: 'coupang',
    title: '쿠팡 Wing API 연동 가이드',
    estimatedTime: '약 5분',
    prerequisites: [
      '쿠팡 Wing 판매자 계정 (wing.coupang.com)',
      '사업자 인증 완료 (미인증 일반회원은 API Key 발급 불가)',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '쿠팡 Wing 로그인',
        description: '쿠팡 판매자 센터에 로그인합니다.',
        detailedInstructions: [
          'wing.coupang.com에 접속해 로그인하세요.',
          '⚠️ API Key는 "사업자 인증"을 마친 판매자만 발급됩니다 (일반회원 불가).',
        ],
        url: 'https://wing.coupang.com',
        tip: '로그인 후 판매자 대시보드가 보이면 정상입니다.',
      },
      {
        stepNumber: 2,
        title: '판매자 코드(Vendor ID) 확인',
        description: '내 판매자 고유 코드를 확인합니다.',
        detailedInstructions: [
          '우측 상단 판매자 이름 → "판매자정보"(또는 "추가판매정보")를 클릭하세요.',
          '"업체코드(VendorID)" 항목의 값을 복사해두세요.',
        ],
        tip: '업체코드는 "A" 또는 "C" + 숫자 형태입니다 (예: A00012345).',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_02.png',
        inputFields: ['Vendor ID (업체코드)'],
      },
      {
        stepNumber: 3,
        title: 'Open API 키 발급',
        description: 'Access Key와 Secret Key를 발급받습니다.',
        detailedInstructions: [
          '"판매자정보"(또는 "추가판매정보") 화면의 "API Key 발급 받기" 버튼을 클릭하세요.',
          '용도로 "OPEN API"를 선택하고 확인합니다 (웹솔루션 연동 키가 아님).',
          '약관에 동의하고 "약관 동의 및 Key 발급받기"를 클릭합니다.',
          '업체코드 · Access Key · Secret Key가 함께 표시됩니다.',
        ],
        warning: 'Secret Key는 발급 시 한 번만 표시됩니다. 즉시 복사하세요. 분실 시 기존 키를 삭제 후 재발급하며, 키는 유효기간(약 180일)이 있어 만료 전 재발급이 필요합니다.',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/cpg_setting_08.png',
        inputFields: ['Access Key', 'Secret Key'],
      },
      {
        stepNumber: 4,
        title: '키 입력하기',
        description: '복사한 값을 메가로드에 입력합니다.',
        detailedInstructions: [
          'Vendor ID, Access Key, Secret Key를 각 필드에 붙여넣으세요.',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
          '연결 성공 메시지가 뜨면 완료!',
        ],
        tip: '붙여넣을 때 앞뒤 공백이 들어가지 않도록 주의하세요.',
      },
    ],
    finalNote: '쿠팡 연동이 완료되면 상품/주문/송장 자동화가 모두 켜집니다. 여기 등록한 상품이 다른 채널로 복제되는 기준(마스터)이 됩니다.',
  },

  // ── 네이버 스마트스토어 ──
  naver: {
    channel: 'naver',
    title: '네이버 커머스 API 연동 가이드',
    estimatedTime: '약 10분 (스토어 심사 1~3영업일 별도)',
    prerequisites: [
      '네이버 스마트스토어 (개인/사업자 모두 가능)',
      '스토어 대표(통합매니저) 계정 — 부매니저 불가',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '스마트스토어 입점(가입)',
        description: '판매자센터에서 스토어를 개설합니다.',
        detailedInstructions: [
          'sell.smartstore.naver.com → "판매자 가입하기"를 클릭하세요.',
          '유형 선택: 개인 / 사업자 / 해외 (개인은 사업자등록 없이 가능).',
          '대표자 휴대폰 인증 + 정산 계좌 등록. 통신판매업은 "미신고"로 두고 나중에 신고 가능.',
          '심사는 통상 1~3영업일(식품·화장품 등은 카테고리 별도 심사). 스토어 승인 후 API 발급 가능.',
        ],
        url: 'https://sell.smartstore.naver.com',
        tip: '이미 스토어가 있으면 이 단계는 건너뛰세요.',
      },
      {
        stepNumber: 2,
        title: '커머스 API 센터 계정 생성',
        description: 'API 발급용 센터에 가입합니다.',
        detailedInstructions: [
          'apicenter.commerce.naver.com에 접속하세요.',
          '반드시 스토어 대표(통합매니저) 계정으로 로그인합니다.',
          '우측 상단 "계정 생성" → 개발업체명(스토어명 권장) + 연락처 입력 → 가입.',
        ],
        url: 'https://apicenter.commerce.naver.com',
        warning: '부매니저/직원 계정으로는 발급이 안 됩니다. 반드시 스토어 대표 계정으로 로그인하세요.',
      },
      {
        stepNumber: 3,
        title: '내스토어 애플리케이션 등록',
        description: '내 스토어용 앱을 만듭니다.',
        detailedInstructions: [
          '"애플리케이션 등록" → "등록하기"로 새 앱을 만듭니다.',
          '애플리케이션 이름 입력(스토어명 권장). 등록 후 관리·인증은 "내 스토어 애플리케이션"에서 합니다.',
        ],
        tip: '솔루션 개발사가 아니라 내 스토어용이므로 "내 스토어 애플리케이션" 경로를 사용하세요.',
      },
      {
        stepNumber: 4,
        title: 'API 호출 IP 등록 + 권한 추가',
        description: 'IP 화이트리스트와 API 권한을 설정합니다.',
        detailedInstructions: [
          'API 호출 IP에 메가로드 호출 서버 IP를 등록하세요 (최대 3개).',
          '아래 API 권한(그룹)을 모두 추가하세요:',
          '✅ 상품 관리   ✅ 주문 관리(필수)   ✅ 클레임 관리   ✅ 정산 관리',
          '앱 상세에서 "인증" 버튼으로 앱을 활성화합니다 (IP가 비어있으면 인증 불가).',
        ],
        warning: '"주문" 권한을 빠뜨리면 주문 연동이 막힙니다. IP 미등록 시 인증도 실패합니다. IP는 메가로드가 안내하는 값을 넣으세요.',
      },
      {
        stepNumber: 5,
        title: 'Client ID / Secret 확인',
        description: '발급된 인증 값을 복사합니다.',
        detailedInstructions: [
          '앱 상세에서 "애플리케이션 ID"(Client ID)를 복사하세요.',
          '"애플리케이션 시크릿"(Client Secret)은 [보기] → 본인확인 → [복사]로 정확히 복사합니다.',
          'Client Secret은 $2a$ 로 시작하는 긴 문자열입니다.',
        ],
        tip: '시크릿은 눈으로 옮겨적지 말고 반드시 [복사] 버튼을 쓰세요 (오타 위험).',
        inputFields: ['애플리케이션 ID (Client ID)', '애플리케이션 시크릿 (Client Secret)'],
      },
      {
        stepNumber: 6,
        title: '키 입력하기',
        description: '복사한 값을 메가로드에 입력합니다.',
        detailedInstructions: [
          'Client ID와 Client Secret을 각 필드에 붙여넣으세요.',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '네이버 토큰은 주기적으로 만료되지만(응답 expires_in 기준) 메가로드가 자동 재발급합니다. 서버 시각 기반 bcrypt 서명이라 별도 만료일 관리는 필요 없습니다.',
  },

  // ── 11번가 ──
  elevenst: {
    channel: 'elevenst',
    title: '11번가 Open API 연동 가이드',
    estimatedTime: '약 7분',
    prerequisites: [
      '11번가 셀러오피스 계정 (개인/사업자 모두 가능)',
      '판매자 승인 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '셀러오피스 가입/로그인',
        description: '11번가 판매자로 가입합니다.',
        detailedInstructions: [
          'soffice.11st.co.kr에 접속해 "판매회원 가입하기".',
          '유형 선택(개인/사업자/글로벌) 후 정보·정산계좌 입력.',
          '증빙서류 업로드(신청 후 90일 이내). 심사는 영업일 2일 내.',
        ],
        url: 'https://soffice.11st.co.kr',
        tip: '이미 셀러 계정이 있으면 이 단계는 건너뛰세요.',
      },
      {
        stepNumber: 2,
        title: 'OPEN API CENTER 서비스 등록',
        description: 'API 사용을 위한 서비스를 등록합니다.',
        detailedInstructions: [
          '셀러오피스 로그인 → "OPEN API CENTER"(또는 대시보드의 [OPENAPI] 버튼) 진입.',
          '이용약관 동의 → "서비스등록" → 담당업무 "개발", 사용용도 "주문 통합관리" 등 입력 후 등록.',
        ],
        url: 'https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/st11_selleroffcie_02.png',
      },
      {
        stepNumber: 3,
        title: 'IP 화이트리스트 등록 (필수)',
        description: '호출 서버 IP를 등록합니다.',
        detailedInstructions: [
          '"Seller API 정보 수정"에서 IP 등록 화면으로 이동하세요.',
          '메가로드 호출 서버 IP를 입력합니다 (여러 개면 세미콜론 ; 로 구분).',
          '개발/PC/상용 IP 필드가 나뉘어 있으면 안내된 IP를 모두 넣고 저장하세요.',
        ],
        warning: 'IP를 등록하지 않으면 모든 API 호출이 거부됩니다. 가장 흔한 실패 원인이에요. IP는 메가로드가 안내하는 값을 넣으세요.',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/st11_selleroffcie_03.png',
      },
      {
        stepNumber: 4,
        title: 'openapikey 확인',
        description: '발급된 API 키를 복사합니다.',
        detailedInstructions: [
          '"서비스 등록·확인" → "확인(서비스확인)" 화면으로 이동하세요.',
          '"11ST OPEN API KEY"를 "복사하기"로 복사합니다.',
        ],
        tip: '이 키 하나로 상품/주문 API를 모두 사용합니다 (API별 개별신청 불필요).',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/st11_selleroffcie_05.png',
        inputFields: ['API Key (openapikey)'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '복사한 키를 메가로드에 입력합니다.',
        detailedInstructions: [
          'API Key(openapikey) 필드에 붙여넣으세요. (SK Open API Key는 선택 — 비워도 됨)',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '11번가는 XML 기반이며 상품 등록에 일일 한도가 있을 수 있습니다(최신 기준은 공식 문서 확인). IP가 바뀌면 화이트리스트를 갱신하세요.',
  },

  // ── G마켓 (ESM) ──
  gmarket: {
    channel: 'gmarket',
    title: 'G마켓(ESM) API 연동 가이드',
    estimatedTime: '이메일 승인 약 1~3일',
    prerequisites: [
      'ESM+ 판매자 계정 + 마스터ID',
      'G마켓 판매자 승인 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'ESM+ 가입 + 마스터ID 생성',
        description: 'G마켓/옥션 통합 셀러 계정을 만듭니다.',
        detailedInstructions: [
          'signup.esmplus.com 에서 판매회원 가입 (사업자 인증 + 대표자 휴대폰 인증).',
          '서류 제출 후 통상 1~3영업일 내 승인.',
          'ESM+ 로그인 → "마스터ID"를 신규 발급합니다 (API 연동에 필수).',
        ],
        url: 'https://signup.esmplus.com/',
        tip: 'ESM+는 G마켓과 옥션을 하나로 묶는 통합 시스템입니다. 마스터ID가 상위 계정이에요.',
      },
      {
        stepNumber: 2,
        title: '마스터ID / G마켓 셀러ID 확인',
        description: '연동에 필요한 ID를 수집합니다.',
        detailedInstructions: [
          'ESM+ → "계정(ID)관리" → "판매자 계정(ID) 관리"로 이동하세요.',
          'ESM 마스터ID와 G마켓 판매자 ID를 확인해 복사해두세요.',
        ],
        imageUrl: 'https://winselling.co.kr/img/guide/seller/api_setting/esm/esm_api_setting04.jpg',
        inputFields: ['ESM+ 마스터ID', 'G마켓 셀러ID'],
      },
      {
        stepNumber: 3,
        title: 'API 키 이메일 신청 (★특이)',
        description: 'ESM은 셀프 발급 메뉴가 없어 이메일로 신청합니다.',
        detailedInstructions: [
          'et_api@ebay.co.kr 로 키 발급 신청 메일을 보내세요 (일반 문의는 etapihelp@gmail.com).',
          '메일에 포함: ① ESM 마스터ID  ② 사용 API 목록(상품·주문·클레임)  ③ 호출 IP(메가로드 서버 IP)  ④ 서비스 URL  ⑤ 최근 3개월 매출  ⑥ 개발 기간.',
          '이베이코리아 검토 후 Access Key + Secret Key를 회신해줍니다.',
        ],
        url: 'https://etapi.gmarket.com/',
        warning: '개발자가 직접 Secret Key를 발급받는 메뉴는 없습니다(이메일 신청만 가능). ESM+의 "ESM API 관리/셀링툴 관리"는 이미 등록된 솔루션 연동용이라 별개입니다.',
        tip: '회신에 며칠 걸릴 수 있어요. 신청 메일 보낸 뒤 네이버·11번가 등 다른 채널을 먼저 연동하세요.',
      },
      {
        stepNumber: 4,
        title: 'Secret Key 수령',
        description: '회신받은 인증 키를 확인합니다.',
        detailedInstructions: [
          '이메일로 받은 HMAC Secret Key를 복사해두세요.',
          '이 키로 JWT 서명을 만들어 API를 호출합니다 (메가로드가 자동 처리).',
        ],
        inputFields: ['HMAC Secret Key'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '수집한 값을 메가로드에 입력합니다.',
        detailedInstructions: [
          '마스터ID, G마켓 셀러ID, HMAC Secret Key를 각 필드에 입력하세요.',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: 'G마켓과 옥션은 같은 ESM 시스템입니다. 한 번의 이메일 신청으로 옥션 키도 함께 받을 수 있어요(옥션은 같은 Secret Key + 옥션 셀러ID).',
  },

  // ── 옥션 (ESM) ──
  auction: {
    channel: 'auction',
    title: '옥션(ESM) API 연동 가이드',
    estimatedTime: '이메일 승인 약 1~3일',
    prerequisites: [
      'ESM+ 판매자 계정 + 마스터ID',
      '옥션 판매자 승인 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'ESM+ 가입 + 마스터ID',
        description: 'G마켓/옥션 통합 셀러 계정을 확인합니다.',
        detailedInstructions: [
          '이미 G마켓용으로 ESM+ 마스터ID를 만들었다면 그대로 사용합니다.',
          '없다면 signup.esmplus.com 에서 가입 후 마스터ID를 발급하세요.',
        ],
        url: 'https://signup.esmplus.com/',
        tip: '옥션과 G마켓은 같은 ESM+ 마스터ID 아래에서 관리됩니다.',
      },
      {
        stepNumber: 2,
        title: '마스터ID / 옥션 셀러ID 확인',
        description: '연동에 필요한 ID를 수집합니다.',
        detailedInstructions: [
          'ESM+ → "계정(ID)관리" → "판매자 계정(ID) 관리"로 이동하세요.',
          'ESM 마스터ID와 옥션 판매자 ID를 확인해 복사해두세요.',
        ],
        imageUrl: 'https://winselling.co.kr/img/guide/seller/api_setting/esm/esm_api_setting04.jpg',
        inputFields: ['ESM+ 마스터ID', '옥션 셀러ID'],
      },
      {
        stepNumber: 3,
        title: 'API 키 이메일 신청 (★특이)',
        description: 'ESM은 셀프 발급 메뉴가 없어 이메일로 신청합니다.',
        detailedInstructions: [
          'et_api@ebay.co.kr 로 키 발급 신청 메일을 보내세요 (일반 문의는 etapihelp@gmail.com).',
          '메일에 포함: 마스터ID · 사용 API 목록 · 호출 IP(메가로드 서버 IP) · 서비스 URL · 최근 3개월 매출 · 개발 기간.',
          'G마켓과 함께 신청하면 하나의 Secret Key로 옥션(A)·G마켓(G)을 모두 씁니다.',
        ],
        url: 'https://etapi.gmarket.com/',
        warning: '개발자용 셀프 발급 메뉴는 없습니다(이메일 신청만). ESM+의 "셀링툴 관리" 메뉴는 ISV 연동용이라 별개입니다.',
        tip: 'G마켓을 이미 신청했다면 같은 Secret Key를 옥션 셀러ID와 함께 쓰면 됩니다.',
      },
      {
        stepNumber: 4,
        title: 'Secret Key 수령',
        description: '회신받은 인증 키를 확인합니다.',
        detailedInstructions: [
          '이메일로 받은 HMAC Secret Key를 복사해두세요.',
          'G마켓과 동일한 키를 공유합니다.',
        ],
        inputFields: ['HMAC Secret Key'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '수집한 값을 메가로드에 입력합니다.',
        detailedInstructions: [
          '마스터ID, 옥션 셀러ID, HMAC Secret Key를 각 필드에 입력하세요.',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '옥션 연동이 끝나면 G마켓과 동일하게 상품/주문 자동화가 켜집니다. 카테고리 코드는 G마켓과 다르므로 메가로드가 사이트별로 매핑합니다.',
  },

  // ── 롯데온 ──
  lotteon: {
    channel: 'lotteon',
    title: '롯데온 OpenAPI 연동 가이드',
    estimatedTime: '약 7분 (입점 심사 1~2영업일 별도)',
    prerequisites: [
      '롯데온 스토어센터 입점 승인 (사업자 필수)',
      '거래처번호 확인 가능 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '롯데온 입점 신청',
        description: '스토어센터에 판매자로 입점합니다.',
        detailedInstructions: [
          'support.lotteon.com/entry 에서 입점 신청 (사업자 인증 → 기본정보 → 스토어센터 ID 발급).',
          '필수서류(사업자등록증·통신판매업신고증·통장사본 등) 업로드 → 심사(영업일 1~2일).',
          '승인 후 store.lotteon.com 스토어센터에 로그인합니다.',
        ],
        url: 'https://support.lotteon.com/entry',
        tip: '이미 입점돼 있으면 이 단계는 건너뛰세요. 롯데온은 사업자만 입점 가능합니다.',
      },
      {
        stepNumber: 2,
        title: 'OpenAPI 관리 진입',
        description: 'API 설정 화면으로 이동합니다.',
        detailedInstructions: [
          '스토어센터 → "판매자정보" → "OpenAPI관리" → "정보설정" 탭으로 이동하세요.',
        ],
        url: 'https://store.lotteon.com',
        tip: 'store.lotteon.com이 판매자 스토어센터입니다. partner.b2b.lotteon.com은 별도 B2B 포털이니 혼동하지 마세요.',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/lott_setting_03.png',
      },
      {
        stepNumber: 3,
        title: '서버 API 등록 (IP 화이트리스트)',
        description: '호출 서버 IP를 등록합니다.',
        detailedInstructions: [
          '"1단계. 서버 API 등록"에서 연동 방법을 "직접입력"으로 선택하세요.',
          '메가로드 호출 서버 IP를 입력하고 저장합니다 (여러 개면 세미콜론 ; 구분).',
        ],
        warning: 'IP 미등록 시 호출이 거부됩니다. IP는 메가로드가 안내하는 값을 넣으세요.',
      },
      {
        stepNumber: 4,
        title: '인증키 발급 + 거래처번호 확인',
        description: 'API 키와 거래처번호를 확보합니다.',
        detailedInstructions: [
          '"2단계. 인증키 정보"에서 "키발급"을 클릭해 API 인증키를 생성하고 즉시 복사·보관하세요.',
          '거래처번호는 "판매자정보" → "기본정보관리"에서 확인 (상호명 옆 괄호 코드, 예: LO10011111).',
        ],
        warning: '인증키는 발급 시 한 번만 표시됩니다. 인증키와 거래처번호가 서로 맞지 않으면 작업이 실패합니다.',
        imageUrl: 'https://winselling.co.kr/img/guide/seller/setting/lott_setting_05.png',
        inputFields: ['판매자 ID', 'API Key', '거래처번호'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '수집한 값을 메가로드에 입력합니다.',
        detailedInstructions: [
          '판매자 ID, API Key, 거래처번호를 각 필드에 입력하세요.',
          '"연결 테스트 & 저장"으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '롯데온 API 인증키는 1년 유효(연 1회 재발급)입니다. 메가로드가 만료 30일 전에 알려드립니다. IP가 바뀌면 화이트리스트를 갱신하세요.',
  },

  // ── 토스쇼핑 (스텁 — 공식 셀러 API 미공개) ──
  toss: {
    channel: 'toss',
    title: '토스쇼핑 — 준비 중',
    estimatedTime: '-',
    prerequisites: [
      '공식 셀러 API 미공개 — 현재 등록 불가',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '준비 중',
        description: '토스쇼핑은 현재 셀러 직접 등록용 공식 Open API가 공개되지 않았습니다.',
        detailedInstructions: [
          '공식 API 공개 시 자동으로 활성화됩니다.',
          '대안 1: 쿠팡 등록 상품의 피드를 토스에 노출 (제휴사 전용).',
          '대안 2: 토스 알림톡으로 상품 홍보.',
        ],
        warning: '공식 API 공개 전까지 모든 쓰기 작업이 차단됩니다.',
      },
    ],
    finalNote: '토스 셀러 API 공개 시 알림 후 자동 활성화됩니다.',
  },

  // ── 카카오쇼핑 (스텁 — 공식 셀러 API 미공개) ──
  kakao: {
    channel: 'kakao',
    title: '카카오쇼핑 — 준비 중',
    estimatedTime: '-',
    prerequisites: [
      '공식 셀러 Open API 미공개 — 일반 셀러 등록 불가',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '준비 중',
        description: '카카오쇼핑/카카오 선물하기는 파트너센터 직접 입점 심사가 필요하며 일반 셀러용 Open API가 없습니다.',
        detailedInstructions: [
          '대형 셀러는 카카오 파트너센터에서 별도 협의가 필요합니다.',
          '공식 Open API 공개 시 자동으로 활성화됩니다.',
        ],
        warning: '공식 API 공개 전까지 모든 쓰기 작업이 차단됩니다.',
      },
    ],
    finalNote: '카카오 셀러 API 공개 시 알림 후 자동 활성화됩니다.',
  },
};
