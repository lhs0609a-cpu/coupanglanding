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
}

export interface ChannelSetupGuide {
  channel: Channel;
  title: string;
  estimatedTime: string;
  prerequisites: string[];
  steps: ChannelGuideStep[];
  finalNote: string;
}

export const CHANNEL_SETUP_GUIDES: Record<Channel, ChannelSetupGuide> = {
  // ── 쿠팡 ──
  coupang: {
    channel: 'coupang',
    title: '쿠팡 Wing API 연동 가이드',
    estimatedTime: '약 5분',
    prerequisites: [
      '쿠팡 Wing 판매자 계정 (wing.coupang.com)',
      '사업자등록증이 승인된 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '쿠팡 Wing 로그인',
        description: '쿠팡 판매자 센터에 로그인합니다.',
        detailedInstructions: [
          'wing.coupang.com에 접속하세요.',
          '판매자 아이디와 비밀번호로 로그인합니다.',
          '처음 가입하는 경우, 사업자등록 후 승인까지 1~2영업일 소요됩니다.',
        ],
        url: 'https://wing.coupang.com',
        tip: '로그인 후 메인 대시보드가 보이면 정상입니다.',
      },
      {
        stepNumber: 2,
        title: '판매자 코드(Vendor ID) 확인',
        description: '내 판매자 고유 코드를 확인합니다.',
        detailedInstructions: [
          '로그인 후 우측 상단의 판매자 이름을 클릭하세요.',
          '"판매자 정보"를 클릭합니다.',
          '"업체코드" 항목의 숫자가 Vendor ID입니다.',
          '이 숫자를 메모장에 복사해두세요.',
        ],
        tip: '업체코드는 보통 "A" + 숫자 형태 (예: A00123456)입니다.',
        inputFields: ['Vendor ID (업체코드)'],
      },
      {
        stepNumber: 3,
        title: 'Open API 메뉴 이동',
        description: 'API 키 발급 메뉴로 이동합니다.',
        detailedInstructions: [
          '좌측 메뉴에서 "판매자 정보" > "Open API"를 클릭하세요.',
          '또는 상단 검색바에 "Open API"를 검색하세요.',
          'Open API 관리 페이지가 나타납니다.',
        ],
      },
      {
        stepNumber: 4,
        title: 'API 키 발급',
        description: 'Access Key와 Secret Key를 발급받습니다.',
        detailedInstructions: [
          '"키 생성" 또는 "API Key 발급" 버튼을 클릭하세요.',
          'Access Key와 Secret Key가 생성됩니다.',
          '⚠️ Secret Key는 이 화면에서만 확인 가능합니다!',
          '반드시 두 키를 모두 메모장에 복사해두세요.',
        ],
        warning: 'Secret Key는 발급 시 한 번만 표시됩니다. 분실하면 재발급해야 합니다.',
        inputFields: ['Access Key', 'Secret Key'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '복사한 키를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          'Vendor ID, Access Key, Secret Key를 각 필드에 붙여넣기하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
          '연결 성공 메시지가 뜨면 완료!',
        ],
        tip: '복사-붙여넣기 시 앞뒤 공백이 포함되지 않도록 주의하세요.',
      },
    ],
    finalNote: '쿠팡 API 연동이 완료되면 상품 자동 가져오기, 주문 자동 확인, 송장 자동 등록 등 모든 자동화 기능을 사용할 수 있습니다.',
  },

  // ── 네이버 스마트스토어 ──
  naver: {
    channel: 'naver',
    title: '네이버 커머스 API 연동 가이드',
    estimatedTime: '약 7분',
    prerequisites: [
      '네이버 스마트스토어 판매자 계정',
      '스마트스토어 개설 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '네이버 커머스 API 센터 접속',
        description: 'API 발급을 위한 커머스 API 센터에 접속합니다.',
        detailedInstructions: [
          'apicenter.commerce.naver.com에 접속하세요.',
          '네이버 계정으로 로그인합니다.',
          '스마트스토어에서 사용하는 계정과 동일한 계정으로 로그인해야 합니다.',
        ],
        url: 'https://apicenter.commerce.naver.com',
      },
      {
        stepNumber: 2,
        title: '애플리케이션 등록',
        description: '새 애플리케이션을 등록합니다.',
        detailedInstructions: [
          '"내 애플리케이션" 메뉴로 이동합니다.',
          '"애플리케이션 등록" 버튼을 클릭하세요.',
          '애플리케이션 이름: "Megaload" 또는 원하는 이름 입력',
          '애플리케이션 유형: "서비스형" 선택',
        ],
        tip: '이름은 본인이 알아볼 수 있는 이름이면 됩니다.',
      },
      {
        stepNumber: 3,
        title: 'API 권한 설정',
        description: '필요한 API 권한을 선택합니다.',
        detailedInstructions: [
          '아래 권한들을 모두 체크하세요:',
          '✅ 상품 관리 (상품 조회/등록/수정)',
          '✅ 주문 관리 (주문 조회/발주확인/배송)',
          '✅ 클레임 관리 (취소/반품/교환 처리)',
          '✅ 정산 관리 (정산내역 조회)',
          '"저장" 또는 "등록" 버튼을 클릭합니다.',
        ],
        warning: '권한을 빠뜨리면 해당 기능 연동이 되지 않습니다. 모두 체크하세요.',
      },
      {
        stepNumber: 4,
        title: 'Client ID / Client Secret 확인',
        description: '발급된 인증 키를 확인합니다.',
        detailedInstructions: [
          '애플리케이션 등록이 완료되면 상세 페이지가 나타납니다.',
          'Client ID (Application ID)를 메모장에 복사하세요.',
          'Client Secret을 메모장에 복사하세요.',
          'Secret은 "보기" 버튼을 클릭해야 확인할 수 있습니다.',
        ],
        inputFields: ['Client ID', 'Client Secret'],
      },
      {
        stepNumber: 5,
        title: '판매자 인증 완료',
        description: '해당 스마트스토어 계정과 앱을 연결합니다.',
        detailedInstructions: [
          '"인증 관리" 메뉴에서 판매자 인증을 진행하세요.',
          '스마트스토어 계정과 방금 만든 애플리케이션을 연결합니다.',
          '인증이 완료되면 API를 통해 스마트스토어 데이터에 접근할 수 있습니다.',
        ],
        tip: '인증은 1회만 하면 되며, 이후 자동으로 갱신됩니다.',
      },
      {
        stepNumber: 6,
        title: '키 입력하기',
        description: '복사한 키를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          'Client ID와 Client Secret을 각 필드에 붙여넣기하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '네이버 API는 별도 만료일 없이 지속적으로 사용 가능합니다. 권한 변경이 필요하면 API 센터에서 수정하세요.',
  },

  // ── 11번가 ──
  elevenst: {
    channel: 'elevenst',
    title: '11번가 Open API 연동 가이드',
    estimatedTime: '약 3분',
    prerequisites: [
      '11번가 셀러오피스 계정',
      '판매자 승인 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '11번가 셀러오피스 로그인',
        description: '셀러오피스에 접속하여 로그인합니다.',
        detailedInstructions: [
          'selleroffice.11st.co.kr에 접속하세요.',
          '셀러 아이디와 비밀번호로 로그인합니다.',
        ],
        url: 'https://selleroffice.11st.co.kr',
      },
      {
        stepNumber: 2,
        title: 'Open API 메뉴 이동',
        description: 'API 키 관리 페이지로 이동합니다.',
        detailedInstructions: [
          '상단 또는 좌측 메뉴에서 "기본설정"을 찾으세요.',
          '"기본설정" > "Open API" 메뉴를 클릭합니다.',
          'Open API 관리 페이지가 열립니다.',
        ],
        tip: '메뉴 위치가 변경될 수 있습니다. 검색 기능을 활용하세요.',
      },
      {
        stepNumber: 3,
        title: 'API Key 발급',
        description: 'Open API 키를 발급받습니다.',
        detailedInstructions: [
          '"API Key 발급" 또는 "키 생성" 버튼을 클릭하세요.',
          '사용 목적: "외부 시스템 연동" 선택',
          'API Key가 생성되면 화면에 표시됩니다.',
          'API Key를 메모장에 복사해두세요.',
        ],
        inputFields: ['API Key'],
      },
      {
        stepNumber: 4,
        title: '키 입력하기',
        description: '복사한 키를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          'API Key 필드에 복사한 키를 붙여넣기하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '11번가 API Key는 별도 만료 없이 사용 가능합니다. 키 분실 시 셀러오피스에서 재발급할 수 있습니다.',
  },

  // ── G마켓 ──
  gmarket: {
    channel: 'gmarket',
    title: 'G마켓 ESMPlus API 연동 가이드',
    estimatedTime: '약 5분',
    prerequisites: [
      'G마켓 판매자 계정',
      'ESMPlus 가입 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'ESMPlus 로그인',
        description: 'G마켓 통합관리 시스템에 로그인합니다.',
        detailedInstructions: [
          'esmplus.com에 접속하세요.',
          'G마켓 판매자 아이디로 로그인합니다.',
          'ESMPlus는 G마켓/옥션 통합 관리 시스템입니다.',
        ],
        url: 'https://www.esmplus.com',
      },
      {
        stepNumber: 2,
        title: 'Open API 설정 메뉴',
        description: 'API 관리 페이지로 이동합니다.',
        detailedInstructions: [
          '상단 메뉴에서 "기본설정"을 클릭하세요.',
          '"Open API 설정" 메뉴를 클릭합니다.',
          'API 관리 화면이 나타납니다.',
        ],
      },
      {
        stepNumber: 3,
        title: 'API 사용 신청',
        description: 'Open API 사용을 신청하고 승인받습니다.',
        detailedInstructions: [
          '"API 사용 신청" 버튼을 클릭하세요.',
          '사용 목적: "외부 솔루션 연동" 선택',
          '신청 후 자동 승인되는 경우가 많습니다.',
          '수동 승인인 경우 1~2영업일 소요될 수 있습니다.',
        ],
        tip: '대부분 즉시 승인됩니다. 승인 대기 시 다른 채널 먼저 연동하세요.',
      },
      {
        stepNumber: 4,
        title: '판매자 ID / API Key 확인',
        description: '발급된 인증 정보를 확인합니다.',
        detailedInstructions: [
          '승인이 완료되면 API Key가 표시됩니다.',
          '판매자 ID (ESMPlus 로그인 ID)를 확인하세요.',
          'API Key를 메모장에 복사해두세요.',
        ],
        inputFields: ['판매자 ID', 'API Key'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '복사한 정보를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          '판매자 ID와 API Key를 각 필드에 입력하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: 'G마켓과 옥션은 같은 ESMPlus 시스템을 사용합니다. G마켓 연동 후 옥션도 같은 방식으로 연동하세요.',
  },

  // ── 옥션 ──
  auction: {
    channel: 'auction',
    title: '옥션 ESMPlus API 연동 가이드',
    estimatedTime: '약 5분',
    prerequisites: [
      '옥션 판매자 계정',
      'ESMPlus 가입 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'ESMPlus 로그인',
        description: '옥션 계정으로 ESMPlus에 로그인합니다.',
        detailedInstructions: [
          'esmplus.com에 접속하세요.',
          '⚠️ 반드시 "옥션" 판매자 아이디로 로그인하세요.',
          'G마켓 아이디와 옥션 아이디가 다를 수 있습니다.',
        ],
        url: 'https://www.esmplus.com',
        warning: 'G마켓과 옥션은 같은 사이트지만 별도의 판매자 ID로 관리됩니다. 옥션 계정으로 로그인하세요.',
      },
      {
        stepNumber: 2,
        title: 'Open API 설정 메뉴',
        description: 'API 관리 페이지로 이동합니다.',
        detailedInstructions: [
          '상단 메뉴에서 "기본설정"을 클릭하세요.',
          '"Open API 설정" 메뉴를 클릭합니다.',
        ],
      },
      {
        stepNumber: 3,
        title: 'API 사용 신청',
        description: 'Open API 사용을 신청합니다.',
        detailedInstructions: [
          '"API 사용 신청" 버튼을 클릭하세요.',
          '사용 목적: "외부 솔루션 연동" 선택',
          '신청 후 승인을 기다립니다.',
        ],
        tip: 'G마켓에서 이미 승인받았더라도 옥션은 별도로 신청해야 합니다.',
      },
      {
        stepNumber: 4,
        title: '판매자 ID / API Key 확인',
        description: '발급된 인증 정보를 확인합니다.',
        detailedInstructions: [
          '승인 완료 후 API Key가 표시됩니다.',
          '옥션 판매자 ID를 확인하세요.',
          'API Key를 메모장에 복사해두세요.',
        ],
        inputFields: ['판매자 ID', 'API Key'],
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '복사한 정보를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          '판매자 ID와 API Key를 각 필드에 입력하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '옥션 연동이 완료되면 G마켓과 동일하게 주문/상품 자동화가 가능합니다.',
  },

  // ── 롯데온 ──
  lotteon: {
    channel: 'lotteon',
    title: '롯데온 파트너 API 연동 가이드',
    estimatedTime: '약 5분',
    prerequisites: [
      '롯데온 파트너 계정 (partner.lotteon.com)',
      '판매자 승인 완료 상태',
    ],
    steps: [
      {
        stepNumber: 1,
        title: '롯데온 파트너 로그인',
        description: '롯데온 판매자 센터에 로그인합니다.',
        detailedInstructions: [
          'partner.lotteon.com에 접속하세요.',
          '판매자 아이디와 비밀번호로 로그인합니다.',
        ],
        url: 'https://partner.lotteon.com',
      },
      {
        stepNumber: 2,
        title: 'API 관리 메뉴 이동',
        description: 'API 키 발급 페이지로 이동합니다.',
        detailedInstructions: [
          '좌측 메뉴에서 "설정" > "API 관리"를 클릭하세요.',
          'API 관리 페이지가 열립니다.',
        ],
      },
      {
        stepNumber: 3,
        title: 'API Key / Secret 발급',
        description: 'API 인증 키를 발급받습니다.',
        detailedInstructions: [
          '"API Key 발급" 버튼을 클릭하세요.',
          'API Key와 API Secret이 생성됩니다.',
          '두 값을 모두 메모장에 복사해두세요.',
        ],
        warning: '롯데온 API Key는 발급일로부터 1년 후 만료됩니다. 만료 전에 갱신이 필요합니다.',
        inputFields: ['API Key', 'API Secret'],
      },
      {
        stepNumber: 4,
        title: 'IP 등록 (필요한 경우)',
        description: '서버 IP를 화이트리스트에 등록합니다.',
        detailedInstructions: [
          'API 관리 페이지에서 "IP 등록" 항목이 있는 경우:',
          '서버 IP를 등록해야 API 호출이 가능합니다.',
          '설정 페이지에서 안내하는 IP 주소를 등록하세요.',
          'IP 등록이 없는 경우 이 단계는 건너뛰세요.',
        ],
        tip: 'IP 등록이 필요한 경우 Megaload 설정 페이지에서 서버 IP를 확인할 수 있습니다.',
      },
      {
        stepNumber: 5,
        title: '키 입력하기',
        description: '복사한 키를 Megaload에 입력합니다.',
        detailedInstructions: [
          '아래 "연동하러 가기" 버튼을 클릭하세요.',
          'API Key와 API Secret을 각 필드에 입력하세요.',
          '"연결 테스트" 버튼으로 연동을 확인합니다.',
        ],
      },
    ],
    finalNote: '롯데온 API Key는 1년 만료입니다. Megaload에서 만료 30일 전 알림을 보내드립니다.',
  },
};
