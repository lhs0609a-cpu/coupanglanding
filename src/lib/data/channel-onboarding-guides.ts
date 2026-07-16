import type { Channel } from '@/lib/megaload/types';
import type { MockScreen } from '@/components/megaload/OnboardingMockup';

/**
 * 채널별 "입점(판매자 회원가입) 가이드" — API 연동보다 먼저 보여주는 단계.
 *
 * 목적: 아직 해당 마켓의 셀러가 아닌 사용자에게 "어떻게 판매자가 되는지"를
 * 실제 화면 흐름대로 단계별로 안내한다. (연동/키 발급은 그 다음 단계)
 *
 * 각 스텝은 screen(선언형 목업)으로 실제 가입 화면을 재현하고,
 * imageUrl(실제 스크린샷)이 있으면 그 이미지를 우선 표시(로드 실패 시 목업 폴백).
 *
 * ── 이미지 정책 ──
 * 딥리서치(2026-07) 결과, 온라인의 "가이드 스크린샷" 상당수가 ①AI 생성 목업(SynthID 워터마크),
 * ②만료되는 서명 URL(예: 네이버 blog.kakaocdn 서명 ~2주 만료), ③http 핫링크(https 앱에서 혼합콘텐츠 차단)
 * 여서 그대로 임베드하면 깨지거나 저작권 문제가 생긴다.
 * 따라서 기본값은 "실제 화면을 그대로 재현한 목업"을 쓰고, 자체 캡처한 실제 스크린샷을
 * 확보하면 각 스텝의 imageUrl에 넣으면 자동으로 대체된다.
 *
 * 절차/문구/주의사항은 각 마켓 공식 셀러센터 + 실제 가입 후기(2026-07 기준)를 교차 확인.
 * 마켓 UI 개편으로 메뉴명이 바뀔 수 있어 warning/tip에 대안 경로를 병기.
 */

export interface OnboardingStep {
  stepNumber: number;
  title: string;
  description: string;
  detailedInstructions: string[];
  url?: string;
  tip?: string;
  warning?: string;
  /** 실제 화면 재현 목업 스펙 */
  screen?: MockScreen;
  /** 실제 스크린샷 URL(외부/자체호스팅). 로드 실패 시 screen 목업으로 자동 폴백. */
  imageUrl?: string;
  imageSource?: string;
}

export interface OnboardingGuide {
  channel: Channel;
  /** 한 줄 요약 배지 */
  headline: string;
  /** 입점 가능 대상 */
  eligibility: string;
  /** 예상 소요(심사 포함) */
  estimatedTime: string;
  /** 비용 */
  cost: string;
  /** 준비물(서류) */
  documents: string[];
  /** 정산/수수료 한 줄 요약 */
  settlementSummary: string;
  steps: OnboardingStep[];
  /** 이 채널이 셀프 입점 가능한지 (false면 준비중/협의 안내만) */
  available: boolean;
  finalNote: string;
}

// ────────────────────────────────────────────────────────────
// 쿠팡
// ────────────────────────────────────────────────────────────
const coupang: OnboardingGuide = {
  channel: 'coupang',
  headline: '회원가입은 몇 분, 사업자 인증 승인까지 1~3영업일이면 판매 시작',
  eligibility: '사업자 (2026.6 간이과세자 간소화 — 통신판매업신고 면제자는 서류 축소)',
  estimatedTime: '가입 5분 + 승인 1~3영업일',
  cost: '입점 무료 · 월 이용료 55,000원(카테고리별 매출 기준)',
  documents: ['사업자등록증', '통신판매업신고증(일반과세자)', '대표자 명의 통장사본'],
  settlementSummary: '정산: 주정산(마감+15영업일, 70%) + 월정산(나머지 30%). 판매수수료 약 4~10.9% + 결제수수료 약 2.9%.',
  available: true,
  finalNote: '쿠팡은 입점 시점부터 사업자등록이 필수라 순수 개인 판매는 불가해요. 승인 후 여기서 등록한 상품이 다른 채널로 복제되는 기준(마스터)이 됩니다.',
  steps: [
    {
      stepNumber: 1,
      title: '판매자 회원가입',
      description: '이메일·휴대폰 본인인증만으로 계정을 먼저 만듭니다.',
      url: 'https://marketplace.coupang.com/apply',
      detailedInstructions: [
        'marketplace.coupang.com 접속 → [판매자 가입하기] 클릭',
        '이메일(로그인 ID)·비밀번호·이름·휴대전화번호 등 필수항목 입력',
        '휴대폰 본인인증 진행',
        '[약관 동의하고 가입하기] → 간편 가입 완료',
      ],
      tip: '여기까지는 서류 없이 됩니다. 단, 가입만으로는 판매 불가 — 다음 사업자 인증까지 마쳐야 판매가 열려요.',
      screen: {
        variant: 'form',
        screenTitle: '판매자 회원가입',
        fields: [
          { label: '이메일 (로그인 ID)', value: 'seller@example.com', filled: true },
          { label: '비밀번호', value: '••••••••', filled: true },
          { label: '이름 / 휴대전화', value: '홍길동 / 010-1234-5678', filled: true, active: true },
        ],
        cta: '약관 동의하고 가입하기',
      },
    },
    {
      stepNumber: 2,
      title: '대표 카테고리 선택 (건너뛰기 가능)',
      description: '주력 판매 카테고리를 고르는 화면. 몰라도 넘어가면 됩니다.',
      detailedInstructions: [
        '가입 직후 나타나는 카테고리 선택 화면 확인',
        '주력 판매 카테고리 선택 (예: 생활용품)',
        '정하지 않았으면 [건너뛰기] 클릭',
        '쿠팡윙(WING) 메인 화면으로 이동',
      ],
      tip: '상품 등록 때 카테고리는 상품별로 다시 지정하니 여기서 몰라도 무방해요.',
      screen: {
        variant: 'choice',
        screenTitle: '주로 어떤 상품을 파시나요?',
        choices: [
          { label: '생활/주방', selected: true },
          { label: '패션/잡화' },
          { label: '가전/디지털' },
          { label: '식품' },
        ],
        cta: '건너뛰기',
      },
    },
    {
      stepNumber: 3,
      title: '사업자 인증 — 정보 입력',
      description: '쿠팡윙 메인의 [사업자 인증하기]로 사업자 정보를 입력합니다.',
      url: 'https://wing.coupang.com',
      detailedInstructions: [
        '쿠팡윙 메인에서 [사업자 인증하기] 클릭',
        '상호명·사업자등록번호·대표자명·사업장주소·업태/종목 입력',
        '사업장주소는 통신판매업신고증 주소와 동일하게 입력',
        '비즈니스 형태 선택 (위탁판매면 "위탁판매")',
      ],
      warning: '사업자등록증과 통신판매업신고증의 주소·상호가 서로 다르면 반려됩니다. 문서 글자 그대로 일치시키세요.',
      screen: {
        variant: 'form',
        screenTitle: '사업자 정보 입력',
        fields: [
          { label: '상호명', value: '길동상사', filled: true },
          { label: '사업자등록번호', value: '123-45-67890', filled: true },
          { label: '대표자명', value: '홍길동', filled: true },
          { label: '사업장 주소', value: '서울시 ...', filled: true, active: true },
          { label: '업태 / 종목', value: '도소매 / 전자상거래', filled: true },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 4,
      title: '필수 서류 첨부 및 제출',
      description: '사업자등록증·통신판매업신고증·통장사본을 올리고 승인 요청.',
      detailedInstructions: [
        '사업자등록증 사본 업로드',
        '통신판매업신고증 업로드 (간이과세 면제자는 생략 가능)',
        '대표자 명의 통장 사본(정산계좌) 업로드',
        '파일은 JPG/PNG, 최신 발급본·선명한 이미지로 → 제출',
      ],
      warning: '정산계좌는 반드시 대표자 명의. 서류 이미지가 흐리면 반려돼요. (반려 1위 사유: 구매안전서비스 이용확인증 문제)',
      screen: {
        variant: 'upload',
        screenTitle: '필수 서류 제출',
        docs: [
          { label: '사업자등록증', done: true },
          { label: '통신판매업신고증', done: true },
          { label: '대표자 통장사본', done: false },
        ],
        cta: '승인 요청하기',
      },
    },
    {
      stepNumber: 5,
      title: '승인 대기 → 완료',
      description: '제출 후 영업일 기준 1~3일 내 입점 승인됩니다.',
      url: 'https://wing.coupang.com',
      detailedInstructions: [
        '쿠팡윙에서 심사 상태 조회',
        '영업일 1~3일 대기 (지연 시 판매자 고객센터 문의)',
        '승인 완료되면 상품 등록 가능 상태로 전환',
      ],
      tip: '승인 대기 중에도 네이버·11번가 등 다른 채널을 미리 입점해 두면 시간을 아낄 수 있어요.',
      screen: {
        variant: 'status',
        status: 'pending',
        statusTitle: '입점 심사 진행 중',
        statusText: '서류 검토 중입니다. 영업일 1~3일 내 결과를 알려드려요.',
      },
    },
    {
      stepNumber: 6,
      title: '출고지·반품지 등 배송정보 설정',
      description: '판매 시작 전 주소록/배송정보를 등록합니다.',
      detailedInstructions: [
        '[판매자 정보] → [주소록/배송정보 관리] → [새 주소지 등록]',
        '출고지 등록 (국내 위탁=자택/사업장, 해외구매대행=배송대행지)',
        '반품지 주소 등록',
        '제주/도서산간 배송비 설정',
      ],
      tip: '해외구매대행은 [추가판매정보]에서 해외 상품 배송 "있음" 설정을 추가하세요.',
      screen: {
        variant: 'menu',
        screenTitle: '주소록/배송정보',
        menu: [
          { label: '판매자 정보' },
          { label: '주소록/배송정보', active: true },
          { label: '추가판매정보' },
        ],
        fields: [
          { label: '출고지', value: '서울 물류창고', filled: true },
          { label: '반품/교환지', value: '동일', filled: true },
        ],
        cta: '저장',
      },
    },
  ],
};

// ────────────────────────────────────────────────────────────
// 네이버 스마트스토어
// ────────────────────────────────────────────────────────────
const naver: OnboardingGuide = {
  channel: 'naver',
  headline: '개인도 사업자 없이 시작 가능 · 서류 완비 시 1~2시간 내 승인되기도',
  eligibility: '개인 / 개인사업자 / 법인 / 해외거주 (개인은 사업자등록 없이 가능)',
  estimatedTime: '가입 10분 + 승인 빠르면 몇 시간~1영업일',
  cost: '가입·월 이용료 무료 (판매 시 수수료만)',
  documents: ['(개인) 본인 명의 통장사본', '(사업자) 사업자등록증·통신판매업신고증·통장사본'],
  settlementSummary: '정산: 구매확정 +1영업일 입금(빠른정산 별도). 결제수수료 약 2~3.63%, 판매수수료 약 2.73%(조건 시 0.91%).',
  available: true,
  finalNote: '스토어 URL은 수정 불가, 스토어명은 딱 1회만 변경 가능해요 — 급조하지 마세요. 개인으로 시작해도 나중에 [판매자정보]에서 사업자 전환이 됩니다.',
  steps: [
    {
      stepNumber: 1,
      title: '판매자센터 접속 · 가입 시작',
      description: '스마트스토어 판매자센터에서 "판매자 가입하기"를 누릅니다.',
      url: 'https://sell.smartstore.naver.com',
      detailedInstructions: [
        'sell.smartstore.naver.com 접속',
        '우측 [판매자 가입하기] 클릭',
        '네이버 아이디가 있으면 "네이버 아이디로 가입하기" 선택 가능',
        '개인용과 섞이지 않게 사업 전용 아이디 생성 권장',
      ],
      tip: '관리 편의를 위해 네이버 아이디 가입을 추천하되, 개인 SNS 계정과 분리된 사업 전용 아이디를 새로 만드는 게 좋아요.',
      screen: {
        variant: 'dashboard',
        screenTitle: '스마트스토어 판매자센터',
        menu: [{ label: '판매자 가입하기', active: true }, { label: '로그인' }],
      },
    },
    {
      stepNumber: 2,
      title: '판매자 유형 선택',
      description: '개인 / 사업자 / 해외거주 중 내 상황에 맞게 고릅니다.',
      detailedInstructions: [
        '개인 판매자: 사업자등록증 없이 휴대폰 본인인증만으로 가능',
        '사업자 판매자: 사업자등록증 보유(개인/법인)',
        '해외거주 판매자: 해외 사업자',
        '개인으로 시작 후 [판매자정보 > 사업자 전환]으로 승격 가능',
      ],
      warning: 'URL·스토어명 등 뒤에서 정하는 값 일부가 "1회만 수정" 또는 "수정 불가"라 처음부터 신중히 진행하세요.',
      screen: {
        variant: 'choice',
        screenTitle: '판매자 유형을 선택하세요',
        choices: [
          { label: '개인', desc: '사업자등록 없이', selected: true },
          { label: '사업자', desc: '개인/법인사업자' },
          { label: '해외거주', desc: '해외 사업자' },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 3,
      title: '사업자등록번호 인증 (사업자 유형)',
      description: '사업자등록번호를 입력해 국세청 조회로 인증합니다.',
      detailedInstructions: [
        '10자리 사업자등록번호 입력 후 [인증]',
        '국세청과 실시간 조회로 상호·개업일 자동 매칭',
        '업종에 "통신판매/전자상거래"가 포함돼야 판매에 문제없음',
        '개인 판매자는 이 단계 없이 통과',
      ],
      warning: '업종에 전자상거래/통신판매가 없으면 홈택스에서 업종을 먼저 추가하는 게 안전해요.',
      screen: {
        variant: 'form',
        screenTitle: '사업자 정보 인증',
        fields: [
          { label: '사업자등록번호', value: '123-45-67890', filled: true, active: true },
          { label: '상호 (자동)', value: '길동상사', filled: true },
          { label: '개업일 (자동)', value: '2024.01.02', filled: true },
        ],
        cta: '인증',
      },
    },
    {
      stepNumber: 4,
      title: '네이버 아이디 연결 · 휴대폰 인증',
      description: '커머스ID를 연결하고 본인 명의 휴대폰으로 인증합니다.',
      detailedInstructions: [
        '"네이버 아이디로 가입하기" 또는 이메일 가입 선택',
        '네이버 커머스ID/아이디 연결 동의',
        '본인 명의 휴대폰으로 인증번호 받아 인증',
        '인증 완료 화면 확인',
      ],
      screen: {
        variant: 'form',
        screenTitle: '본인 인증',
        fields: [
          { label: '커머스ID 연결', value: 'naver_id 연결됨', filled: true },
          { label: '휴대폰 번호', value: '010-1234-5678', filled: true },
          { label: '인증번호', value: '••••••', filled: true, active: true },
        ],
        cta: '인증 확인',
      },
    },
    {
      stepNumber: 5,
      title: '비즈니스 서비스 연결 + 약관 동의',
      description: '네이버 쇼핑·톡톡 연결을 설정하고 필수 약관에 동의합니다.',
      detailedInstructions: [
        '네이버 쇼핑 연동 설정 (검색 노출을 위해 사실상 필수)',
        '네이버 톡톡(고객 상담) 연결 여부 선택',
        '이용약관·전자금융거래·개인정보 수집 등 필수 전체 동의',
        '선택 항목(마케팅 수신 등)은 원하는 대로',
      ],
      tip: '네이버 쇼핑을 연동하지 않으면 검색 유입이 크게 줄어요 — 연동을 권장합니다.',
      screen: {
        variant: 'form',
        screenTitle: '서비스 연결 · 약관 동의',
        fields: [
          { label: '네이버 쇼핑 연동', type: 'toggle', filled: true },
          { label: '네이버 톡톡 연결', type: 'toggle', filled: true },
          { label: '[필수] 이용약관 전체 동의', type: 'checkbox', filled: true },
          { label: '[선택] 마케팅 수신', type: 'checkbox', filled: false },
        ],
        cta: '동의하고 계속',
      },
    },
    {
      stepNumber: 6,
      title: '사업장 정보 · 대표자 정보',
      description: '상호·주소·업태/업종·통신판매업 신고 여부와 대표자 정보를 입력.',
      detailedInstructions: [
        '상호·사업장 주소·업태/업종·개업일 입력(등록증과 일치)',
        '통신판매업: "신고완료(번호 입력)" 또는 "미신고" 선택 — 미신고도 일단 진행 가능',
        '대표자 정보에서 "대표자 명의 휴대전화 인증"을 고르면 인감증명서 불필요',
        '귀금속·환전·대부업 등 특수업종 해당 여부 체크',
      ],
      warning: '사업장 주소가 임차면 상황에 따라 임대차계약서 사본을 추가로 요구할 수 있어요.',
      screen: {
        variant: 'form',
        screenTitle: '사업장 · 대표자 정보',
        fields: [
          { label: '상호 / 주소', value: '길동상사 / 서울 ...', filled: true },
          { label: '통신판매업', type: 'radio', options: ['신고완료', '미신고'], selected: '미신고' },
          { label: '대표자 인증', value: '휴대전화 인증', filled: true, active: true },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 7,
      title: '스토어 정보 · 배송/정산 정보',
      description: '스토어명·URL·소개, 출고/반품지, 정산계좌를 입력합니다.',
      detailedInstructions: [
        '스토어 이름(가입 후 1회만 수정), 스토어 URL(수정 불가), 소개글, 고객센터 번호 입력',
        '출고지·반품/교환지 주소 입력',
        '정산계좌: 개인은 본인 명의, 사업자는 대표자/사업자 명의 통장',
        '담당자 이메일 인증번호 입력으로 마무리',
      ],
      warning: '스토어 URL은 절대 변경 불가, 스토어명은 딱 1회만 변경 가능 — 오타·급조 금지!',
      screen: {
        variant: 'form',
        screenTitle: '스토어 정보',
        fields: [
          { label: '스토어 이름 (1회 수정)', value: '길동상점', filled: true },
          { label: '스토어 URL (수정 불가)', value: 'smartstore.naver.com/gildong', filled: true, active: true },
          { label: '정산 계좌', value: '○○은행 ***', filled: true },
        ],
        cta: '가입 신청',
      },
    },
    {
      stepNumber: 8,
      title: '서류 제출 · 통신판매업 신고 · 심사',
      description: '서류를 첨부하고 통신판매업 신고번호까지 등록하면 최종 승인.',
      detailedInstructions: [
        '사업자등록증·통장 사본 등 첨부 (신청 후 14일 이내 제출)',
        '통신판매업 미신고면 [판매자정보]에서 "구매안전서비스 이용확인증" 발급 → 정부24 신고',
        '발급된 통신판매업 신고번호를 입력하고 신고증 첨부',
        '심사 진행 → 승인되면 가입 완료 메일 수신',
      ],
      tip: '서류가 완비되면 1~2시간 내 승인되기도 해요. 통신판매업 신고증만 늦게 올려도 나머지 판매 준비는 병행 가능합니다.',
      screen: {
        variant: 'upload',
        screenTitle: '서류 제출 & 심사',
        docs: [
          { label: '사업자등록증', done: true },
          { label: '통장 사본', done: true },
          { label: '통신판매업신고증', done: false },
        ],
        cta: '제출하고 심사 요청',
      },
    },
  ],
};

// ────────────────────────────────────────────────────────────
// 11번가
// ────────────────────────────────────────────────────────────
const elevenst: OnboardingGuide = {
  channel: 'elevenst',
  headline: '셀러오피스에서 가입 → 서류 업로드 후 영업일 2일 내 승인',
  eligibility: '개인 / 사업자 / 글로벌 (개인은 본인인증만)',
  estimatedTime: '가입 10분 + 승인 영업일 약 2일',
  cost: '가입·연회비 무료 · 서버이용료 월 77,000원(월 구매확정 500만원↑)',
  documents: ['사업자등록증', '통신판매업신고증', '대표자 명의 통장사본', '인감증명서 또는 본인서명사실확인서'],
  settlementSummary: '정산: 월 1회(구매확정 후 약 7일), 빠른정산 주 1회. 판매수수료 약 7~13%. 신규셀러 12개월 6% 할인 혜택.',
  available: true,
  finalNote: '가입 신청 후 90일 이내에 증빙서류를 업로드하지 않으면 신청정보가 자동 삭제돼 처음부터 다시 가입해야 해요. 서류부터 준비하고 가입하면 승인이 빨라집니다.',
  steps: [
    {
      stepNumber: 1,
      title: '셀러오피스 접속 → 가입 시작',
      description: '11번가 판매자센터 "셀러오피스"에서 판매회원 가입을 시작합니다.',
      url: 'https://soffice.11st.co.kr',
      detailedInstructions: [
        'soffice.11st.co.kr 접속',
        '인트로 화면에서 [판매회원 가입하기] 클릭',
        '구매용 11번가 아이디가 있어도 판매회원은 별도 가입 필요',
        '회원가입 폼(member.11st.co.kr/register/seller)으로 이동',
      ],
      tip: '구매용 계정과 판매용 셀러 계정은 별개예요. 판매는 반드시 셀러오피스에서 신규 가입하세요.',
      screen: {
        variant: 'dashboard',
        screenTitle: '11번가 셀러오피스',
        menu: [{ label: '판매회원 가입하기', active: true }, { label: '로그인' }],
      },
    },
    {
      stepNumber: 2,
      title: '판매자 유형 선택 (개인/사업자/글로벌)',
      description: '본인 상황에 맞는 회원 유형을 고릅니다.',
      detailedInstructions: [
        '개인 셀러: 사업자등록 없이 개인 물품 판매(사업 목적 아님)',
        '사업자 셀러: 사업자등록증 보유(간이/일반/법인)',
        '글로벌 셀러: 국내거주 개인/사업자, 해외거주 사업자로 세분',
        '해외구매대행은 보통 "글로벌 → 국내거주 사업자"로 가입',
      ],
      warning: '간이과세자라도 사업성이 있으면 통신판매업 신고 후 사업자 셀러로 가입해야 합니다.',
      screen: {
        variant: 'choice',
        screenTitle: '판매회원 유형 선택',
        choices: [
          { label: '개인', desc: '본인인증만' },
          { label: '사업자', desc: '사업자등록증', selected: true },
          { label: '글로벌', desc: '구매대행 등' },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 3,
      title: '약관 동의 + 사업자번호 인증',
      description: '판매자 약관에 동의하고 사업자등록번호로 인증합니다.',
      detailedInstructions: [
        '판매자 이용약관·개인정보 수집·이용 동의 체크',
        '사업자등록번호 입력 후 진위 확인(국세청 조회)',
        '개인 셀러는 휴대폰/아이핀 본인인증으로 대체',
        '인증 통과해야 다음 정보입력 단계로 진행',
      ],
      warning: '폐업/휴업 사업자번호, 조회 불가 번호는 이 단계에서 막힙니다.',
      screen: {
        variant: 'form',
        screenTitle: '약관 동의 · 사업자 인증',
        fields: [
          { label: '[필수] 판매자 이용약관', type: 'checkbox', filled: true },
          { label: '[필수] 개인정보 수집·이용', type: 'checkbox', filled: true },
          { label: '사업자등록번호', value: '123-45-67890', filled: true, active: true },
        ],
        cta: '진위 확인',
      },
    },
    {
      stepNumber: 4,
      title: '계정정보 · 기본정보 입력',
      description: '로그인 계정과 사업자 기본정보를 입력합니다.',
      detailedInstructions: [
        '계정정보: 아이디·비밀번호·이메일·휴대폰',
        '과세구분: 간이과세자/일반 개인사업자/법인 선택',
        '상호명(등록증상 명칭)·사업자등록번호·업종·업태 입력',
        '해외구매대행은 업종을 "상품 중개업"으로 선택하는 게 관행',
      ],
      tip: '상호·업종은 사업자등록증과 100% 일치시켜야 서류심사 반려를 피해요.',
      screen: {
        variant: 'form',
        screenTitle: '계정 · 기본정보',
        fields: [
          { label: '아이디 / 비밀번호', value: 'gildong11 / ••••••', filled: true },
          { label: '과세구분', type: 'radio', options: ['간이', '일반', '법인'], selected: '일반' },
          { label: '상호 / 업태·종목', value: '길동상사 / 도소매', filled: true },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 5,
      title: '판매자정보 · 주소 · 정산계좌',
      description: '대표자/스토어명/배송·반품지/정산계좌를 등록합니다.',
      detailedInstructions: [
        '대표자명·사업장주소·통신판매업신고번호 입력',
        '스토어명(11번가 노출 판매자명) 설정',
        '출고지·반품/교환지 주소 각각 입력',
        '정산받을 대표자(사업자) 명의 계좌 등록',
      ],
      warning: '정산계좌 예금주는 사업자/대표자 명의여야 하고 통장사본과 일치해야 합니다.',
      screen: {
        variant: 'form',
        screenTitle: '판매자 정보',
        fields: [
          { label: '스토어명', value: '길동몰', filled: true },
          { label: '통신판매업 신고번호', value: '2026-서울...', filled: true },
          { label: '출고지 / 반품지', value: '서울 창고 / 동일', filled: true },
          { label: '정산계좌', value: '○○은행 ***', filled: true, active: true },
        ],
        cta: '가입 신청',
      },
    },
    {
      stepNumber: 6,
      title: '가입 신청 완료',
      description: '정보 입력을 마치면 가입 신청 완료 화면이 뜹니다.',
      detailedInstructions: [
        '입력 내용 최종 확인 후 [가입 신청] 제출',
        '가입완료 안내 화면 노출(이 시점엔 아직 "서류 미제출" 상태)',
        '이후 셀러오피스 로그인은 가능하나 판매개시는 서류 승인 후',
        '증빙서류 업로드 안내로 이동',
      ],
      screen: {
        variant: 'status',
        status: 'approved',
        statusTitle: '가입 신청 완료',
        statusText: '아직 "서류 미제출" 상태예요. 다음 단계에서 증빙서류를 올려야 판매가 열립니다.',
        cta: '서류 업로드하러 가기',
      },
    },
    {
      stepNumber: 7,
      title: '증빙서류 업로드 (90일 이내)',
      description: '셀러오피스에서 증빙서류를 온라인으로 업로드합니다.',
      url: 'https://soffice.11st.co.kr',
      detailedInstructions: [
        '셀러오피스 내 증빙서류 등록 메뉴에서 파일 업로드',
        '파일 형식 JPG/GIF/PNG, 합계 100MB 미만',
        '회원가입 신청일로부터 90일 이내 반드시 업로드',
        '서류 제출 완료 → 심사 대기 → 승인 후 판매 시작',
      ],
      warning: '90일 내 미업로드 시 판매자 신청 정보가 자동 삭제됩니다. 서류만 미리 준비하면 업로드 후 영업일 2일 내 승인되는 경우가 많아요.',
      screen: {
        variant: 'upload',
        screenTitle: '증빙서류 등록',
        docs: [
          { label: '사업자등록증', done: true },
          { label: '통신판매업신고증', done: true },
          { label: '통장사본', done: true },
          { label: '인감증명서/본인서명확인서', done: false },
        ],
        cta: '제출',
      },
    },
  ],
};

// ────────────────────────────────────────────────────────────
// G마켓 / 옥션 공통 ESM+ 플로우 빌더
// ────────────────────────────────────────────────────────────
function esmSteps(site: 'gmarket' | 'auction'): OnboardingStep[] {
  const siteLabel = site === 'gmarket' ? 'G마켓' : '옥션';
  const shopWord = site === 'gmarket' ? '미니샵' : '스토어';
  const shopUrl = site === 'gmarket' ? 'minishop.gmarket.co.kr/' : 'stores.auction.co.kr/';
  return [
    {
      stepNumber: 1,
      title: 'ESM PLUS 접속 → 회원가입 시작',
      description: 'G마켓·옥션은 ESM PLUS 통합 계정 하나로 가입합니다.',
      url: 'https://signin.esmplus.com/login',
      detailedInstructions: [
        'signin.esmplus.com/login 접속',
        '로그인 버튼 아래 [회원가입] 클릭 (가입 URL: signup.esmplus.com)',
        '로그인 탭은 ESM PLUS(마스터/매니저)·Gmarket·Auction 3종',
        `${siteLabel} 사이트에서 따로 가입하지 말고 여기서 한 번에 진행`,
      ],
      tip: 'ESM PLUS는 "마스터 ID" 1개 아래 G마켓·옥션 판매자ID가 연동되는 구조예요. 가입 1회로 두 마켓이 동시에 열립니다.',
      screen: {
        variant: 'dashboard',
        screenTitle: 'ESM PLUS',
        menu: [{ label: 'ESM PLUS 로그인' }, { label: '회원가입', active: true }],
      },
    },
    {
      stepNumber: 2,
      title: '판매자 유형 선택',
      description: '개인 / 사업자 / 해외직구 판매회원 중 선택합니다.',
      detailedInstructions: [
        '개인 판매회원: 사업자등록증 불필요(휴대폰 본인인증만)',
        '사업자 판매회원: 사업자등록번호 인증 + 통신판매업 신고 필요',
        '해외직구(구매대행): 사업자등록번호 인증 + 통신판매업 신고 필요',
        '선택 후 [다음]',
      ],
      tip: '구매대행이면 반드시 "해외직구 판매회원"을 선택하세요(카테고리·수수료 처리가 달라집니다).',
      screen: {
        variant: 'choice',
        screenTitle: `${siteLabel}에 오신 것을 환영해요`,
        choices: [
          { label: '개인', desc: '본인인증만' },
          { label: '사업자', desc: '사업자등록', selected: true },
          { label: '해외직구', desc: '구매대행' },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 3,
      title: '사업자 인증 (사업자등록번호 확인)',
      description: '국내/해외/중국 사업자 선택 후 등록번호로 인증합니다.',
      url: 'https://signup.esmplus.com/',
      detailedInstructions: [
        '"사업자 등록 정보를 확인할게요" 화면',
        '국내사업자 선택 → 사업자등록번호 10자리(- 없이) 입력 → [인증하기]',
        '인증 성공하면 실명(본인)확인 완료 처리',
        '법인은 인증 불가 시 인감증명서 제출이 요구될 수 있음',
      ],
      warning: '"유효한 사업자가 아닙니다" 오류가 뜨면 사업자등록증 사본+연락처를 NICE평가정보(biz_submit@nice.co.kr)로 보내고 1~2일 뒤 재시도하세요. (도용 가입은 형사처벌 경고 있음)',
      screen: {
        variant: 'form',
        screenTitle: '사업자 정보 확인',
        fields: [
          { label: '사업자 구분', type: 'radio', options: ['국내', '해외', '중국'], selected: '국내' },
          { label: '사업자등록번호 (- 없이 10자리)', value: '1234567890', filled: true, active: true },
        ],
        cta: '인증하기',
      },
    },
    {
      stepNumber: 4,
      title: '가입 쇼핑몰 선택 + 마스터 ID 연동',
      description: 'G마켓·옥션을 둘 다 체크하면 한 번에 개설됩니다.',
      detailedInstructions: [
        '"하나의 계정으로 모든 서비스를 한 번에!" 화면',
        'G마켓 ✓ / 옥션 ✓ 둘 다 체크 (하나만도 가능)',
        '"필수 ESM PLUS 마스터 ID 연동 동의" 체크 — 마스터ID↔판매자ID 연동의 핵심',
        '휴대폰번호 확인 후 [다음 단계로]',
      ],
      tip: '둘 다 체크해야 가입 1회로 G마켓ID·옥션ID가 함께 생성돼 마스터ID에 자동 연동됩니다. 나중에 한쪽만 추가/해제도 가능해요.',
      screen: {
        variant: 'form',
        screenTitle: '가입하실 서비스를 골라주세요',
        fields: [
          { label: 'G마켓 판매자 개설', type: 'checkbox', filled: true },
          { label: '옥션 판매자 개설', type: 'checkbox', filled: true },
          { label: '[필수] ESM PLUS 마스터 ID 연동 동의', type: 'checkbox', filled: true },
        ],
        cta: '다음 단계로',
      },
    },
    {
      stepNumber: 5,
      title: '기본정보 입력 (ID/PW/이메일)',
      description: '이 아이디가 마스터/판매자 로그인 ID가 됩니다.',
      detailedInstructions: [
        'ID: 띄어쓰기 없이 영문 소문자+숫자 6~10자',
        '비밀번호: 영문+숫자+특수문자 8~15자, 확인 일치',
        '이메일 입력 → [다음 단계로]',
        '이름·휴대폰번호는 본인인증값이 자동 입력',
      ],
      tip: 'ID/PW는 이후 계속 쓰므로 반드시 따로 기록하세요(분실 잦음). 아이디는 변경 불가입니다.',
      screen: {
        variant: 'form',
        screenTitle: '기본정보 입력',
        fields: [
          { label: '아이디 (영문+숫자 6~10)', value: 'gildongshop', filled: true, active: true },
          { label: '비밀번호 (8~15)', value: '••••••••', filled: true },
          { label: '이메일', value: 'seller@example.com', filled: true },
        ],
        cta: '다음 단계로',
      },
    },
    {
      stepNumber: 6,
      title: `판매정보 입력 (주소·${shopWord}·서류)`,
      description: `사업장 주소와 ${siteLabel} ${shopWord} 이름·URL·소개글을 입력합니다.`,
      detailedInstructions: [
        '[주소 찾기]로 사업자등록증과 동일 주소 입력',
        `${shopWord} 이름: 한글 3~10자 또는 영문·숫자 6~20자`,
        `${shopWord} 주소(URL): 영문·숫자 6~20자 → ${shopUrl} 뒤에 사용`,
        '사업자 회원은 사업자등록증 사본 업로드 + 업태/종목 + 통신판매업 신고번호',
      ],
      warning: `업태·종목·주소는 사업자등록증과 100% 동일하게. ${shopWord}명은 등록 후 변경이 까다로우니 신중히 정하세요.`,
      screen: {
        variant: 'form',
        screenTitle: `${siteLabel} 판매정보`,
        fields: [
          { label: '사업장 주소', value: '서울시 ...', filled: true },
          { label: `${shopWord} 이름`, value: '길동샵', filled: true },
          { label: `${shopWord} URL`, value: `${shopUrl}gildong`, filled: true, active: true },
          { label: '사업자등록증 첨부', type: 'file', value: '길동상사.jpg', filled: true },
        ],
        cta: '다음 단계로',
      },
    },
    {
      stepNumber: 7,
      title: '정산정보 입력 → 가입 완료',
      description: '정산 계좌 등록, 정산방법 선택 후 가입을 마칩니다.',
      detailedInstructions: [
        '[계좌 등록하기]로 정산 계좌 인증',
        '정산방법: "계좌로 송금받기" 또는 "판매예치금으로 적립하기" 택1',
        'G통장 비밀번호(8~15자) 설정',
        '[가입하기] → 신청 완료, 이후 판매자 심사(승인) 대기',
      ],
      tip: '계좌 인증이 실패하면 가입 직후 약 10분 경과 뒤 재시도하세요. 심사는 평균 3~5영업일로 다른 마켓보다 조금 깁니다.',
      screen: {
        variant: 'form',
        screenTitle: '정산정보',
        fields: [
          { label: '정산 계좌', value: '○○은행 *** 인증완료', filled: true },
          { label: '정산방법', type: 'radio', options: ['계좌송금', '판매예치금'], selected: '계좌송금' },
          { label: 'G통장 비밀번호', value: '••••••••', filled: true, active: true },
        ],
        cta: '가입하기',
      },
    },
  ];
}

const gmarket: OnboardingGuide = {
  channel: 'gmarket',
  headline: 'ESM PLUS 가입 1회로 G마켓·옥션 동시 개설 (마스터 ID 통합)',
  eligibility: '개인 / 사업자 / 해외직구 (구매대행은 해외직구 유형)',
  estimatedTime: '가입 15분 + 승인 평균 3~5영업일(최대 7일)',
  cost: '가입 무료 · 서버이용료 월 55,000원(월 판매 500만원↑)',
  documents: ['사업자등록증', '통신판매업신고증', '정산계좌(대표자 명의)', '(법인) 인감증명서'],
  settlementSummary: '정산: 구매결정 +1영업일 100% 지급(빠른 편). 판매수수료 카테고리별 약 4~15% + 선결제배송비 3.3%.',
  available: true,
  finalNote: 'G마켓과 옥션은 같은 ESM PLUS 마스터 ID 아래에서 함께 관리돼요. 4단계에서 둘 다 체크하면 한 번의 가입으로 두 마켓이 열립니다.',
  steps: esmSteps('gmarket'),
};

const auction: OnboardingGuide = {
  channel: 'auction',
  headline: 'G마켓과 동일한 ESM PLUS 가입 — 옥션 스토어가 함께 열립니다',
  eligibility: '개인 / 사업자 / 해외직구 (구매대행은 해외직구 유형)',
  estimatedTime: '가입 15분 + 승인 평균 3~5영업일(최대 7일)',
  cost: '가입 무료 · 서버이용료 월 55,000원(월 판매 500만원↑)',
  documents: ['사업자등록증', '통신판매업신고증', '정산계좌(대표자 명의)', '(법인) 인감증명서'],
  settlementSummary: '정산: 옥션은 판매예치금 적립을 구매결정 즉시 수령 가능(계좌송금은 +1영업일). 판매수수료 약 4~15%.',
  available: true,
  finalNote: '이미 G마켓용으로 ESM PLUS에 가입했다면 옥션은 [계정관리]에서 옥션 판매자ID만 추가하면 돼요. 카테고리 코드는 G마켓과 달라 메가로드가 사이트별로 매핑합니다.',
  steps: esmSteps('auction'),
};

// ────────────────────────────────────────────────────────────
// 롯데온
// ────────────────────────────────────────────────────────────
const lotteon: OnboardingGuide = {
  channel: 'lotteon',
  headline: '사업자만 입점 가능 · 입점신청 → 서류등록 → 최종승인 3단계',
  eligibility: '국내/해외 사업자 (개인·비사업자 불가)',
  estimatedTime: '입력 15분 + 승인 영업일 약 1~2일',
  cost: '입점/등록비 없음 (판매 시 수수료만)',
  documents: ['사업자등록증', '통신판매업신고증', '대표자 명의 통장사본', '인감증명서/본인서명확인서', '대표자 신분증 사본'],
  settlementSummary: '정산: 구매확정 다음 날 자동 지급(배송완료+8일 자동확정, 통상 10일 내). 판매수수료 카테고리별 약 4~13%(+PG수수료).',
  available: true,
  finalNote: '롯데온은 사업자만 입점할 수 있어요(개인 판매 불가). 해외직구(구매대행) 상품을 팔려면 입점 후 croosborder@lotte.net으로 해외판매권한을 별도로 신청해야 합니다.',
  steps: [
    {
      stepNumber: 1,
      title: '판매자센터 접속 & 사업자 유형 선택',
      description: '롯데온 스토어센터에서 입점신청을 시작합니다.',
      url: 'https://store.lotteon.com/',
      detailedInstructions: [
        '스토어센터 접속 후 상단 [입점신청] 클릭',
        '사업자 유형에서 [국내사업자] 선택 (해외사업자는 별도 매뉴얼)',
        '제출 서류를 미리 JPG로 촬영/스캔해 준비',
        '[전체동의] 체크 후 진행',
      ],
      warning: '개인(비사업자)은 입점 불가. 사업자등록·통신판매업 신고가 먼저 완료돼야 합니다.',
      screen: {
        variant: 'choice',
        screenTitle: '입점신청 · 사업자 유형',
        choices: [
          { label: '국내사업자', selected: true },
          { label: '해외사업자', desc: '별도 매뉴얼' },
        ],
        cta: '전체동의 후 시작',
      },
    },
    {
      stepNumber: 2,
      title: '사업자 인증',
      description: '사업자등록번호를 입력하고 인증해 실체를 확인합니다.',
      detailedInstructions: [
        '사업자등록번호 입력',
        '이용약관 [전체동의] 체크',
        '[사업자 인증] 버튼 클릭',
        '대표자명 불일치 경고가 떠도 확인 후 진행 가능(표기 차이일 수 있음)',
      ],
      tip: '사업자등록증·통신판매업신고증상 상호/대표자명이 일치하도록 준비하면 인증이 매끄러워요.',
      screen: {
        variant: 'form',
        screenTitle: '사업자 인증',
        fields: [
          { label: '사업자등록번호', value: '123-45-67890', filled: true, active: true },
          { label: '[필수] 이용약관 전체동의', type: 'checkbox', filled: true },
        ],
        cta: '사업자 인증',
      },
    },
    {
      stepNumber: 3,
      title: '기초정보 입력 (인적사항·담당자·계정)',
      description: '상호·대표/담당자·로그인 계정 정보를 입력합니다.',
      detailedInstructions: [
        '기본 인적사항(상호명·대표자) 입력',
        '대표/담당자 정보(이름·연락처·이메일) 입력',
        '스토어센터 로그인용 계정정보(ID/PW) 설정',
        '입력값이 사업자등록증 정보와 일치하는지 확인',
      ],
      screen: {
        variant: 'form',
        screenTitle: '기초정보 입력',
        fields: [
          { label: '상호 / 대표자', value: '길동상사 / 홍길동', filled: true },
          { label: '담당자 연락처·이메일', value: '010··· / ···@···', filled: true },
          { label: '로그인 ID / PW', value: 'gildong / ••••••', filled: true, active: true },
        ],
        cta: '다음',
      },
    },
    {
      stepNumber: 4,
      title: '추가정보 입력 (통신판매업·정산계좌·실소유자)',
      description: '통신판매업 신고번호·정산계좌·실소유자 정보를 입력합니다.',
      detailedInstructions: [
        '통신판매업 신고번호 입력',
        '정산계좌 정보(대표자 명의 통장) 입력',
        '대표자 주민등록번호 및 추가정보 입력',
        '실소유자 정보 입력 후 선택항목은 건너뛰고 [입점신청] 제출',
      ],
      warning: '통신판매업 신고번호가 없으면 이 단계에서 막힙니다. 관할 시·군·구청에 먼저 신고하세요.',
      screen: {
        variant: 'form',
        screenTitle: '추가정보 입력',
        fields: [
          { label: '통신판매업 신고번호', value: '2026-서울...', filled: true, active: true },
          { label: '정산계좌(대표자 명의)', value: '○○은행 ***', filled: true },
          { label: '실소유자 정보', value: '홍길동', filled: true },
        ],
        cta: '입점신청',
      },
    },
    {
      stepNumber: 5,
      title: '입점신청 완료',
      description: '신청 제출이 완료되고 서류등록 단계로 넘어갑니다.',
      detailedInstructions: [
        '신청 완료 화면 확인',
        '방금 만든 계정으로 스토어센터 로그인',
        '서류등록(다음 단계) 진행',
      ],
      screen: {
        variant: 'status',
        status: 'approved',
        statusTitle: '입점신청 완료',
        statusText: '이제 서류를 등록하면 심사가 시작됩니다.',
        cta: '서류 등록하러 가기',
      },
    },
    {
      stepNumber: 6,
      title: '서류 등록 (제출)',
      description: '필수 서류 파일을 업로드합니다.',
      detailedInstructions: [
        '사업자등록증 업로드',
        '통신판매업신고증 업로드',
        '통장사본·인감증명서(또는 본인서명확인서)·신분증 사본 업로드',
        '업로드 후 [임시저장], 모든 "미등록"을 "등록"으로 바꿔야 함',
      ],
      warning: '서류는 선명한 JPG로. 모든 항목이 "등록" 상태여야 심사가 시작돼요("미등록"이 남으면 진행 안 됨).',
      screen: {
        variant: 'upload',
        screenTitle: '서류 등록',
        docs: [
          { label: '사업자등록증', done: true },
          { label: '통신판매업신고증', done: true },
          { label: '통장사본', done: true },
          { label: '인감증명서 / 신분증', done: false },
        ],
        cta: '임시저장 후 등록',
      },
    },
    {
      stepNumber: 7,
      title: '이용약관 동의 (할인프로그램 등)',
      description: '판매·할인 프로그램 등 추가 약관에 동의합니다.',
      detailedInstructions: [
        '할인 프로그램 등 이용약관 확인',
        '항목별 동의 체크',
        '다음 검토 단계로 이동',
      ],
      screen: {
        variant: 'form',
        screenTitle: '이용약관 동의',
        fields: [
          { label: '[필수] 판매 이용약관', type: 'checkbox', filled: true },
          { label: '[필수] 할인프로그램 약관', type: 'checkbox', filled: true },
          { label: '[선택] 프로모션 참여', type: 'checkbox', filled: false },
        ],
        cta: '동의하고 다음',
      },
    },
    {
      stepNumber: 8,
      title: '정보 검토 & 최종 제출',
      description: '자동 기입된 기본/추가정보를 검토하고 최종 제출합니다.',
      detailedInstructions: [
        '기본정보 검토(자동 기입 값 확인)',
        '추가정보 검토(정산계좌·통신판매업 등)',
        '오타/불일치 수정 후 최종 제출',
      ],
      screen: {
        variant: 'form',
        screenTitle: '최종 검토',
        fields: [
          { label: '기본정보', value: '길동상사 · 확인', filled: true },
          { label: '추가정보', value: '정산계좌·통신판매업 확인', filled: true },
        ],
        cta: '최종 제출',
      },
    },
    {
      stepNumber: 9,
      title: '최종 승인 (심사)',
      description: '서류·정보 심사 후 승인되면 즉시 판매 시작 가능합니다.',
      detailedInstructions: [
        '롯데온 서류/정보 심사 대기 (영업일 약 1~2일)',
        '승인 시 상품 등록·판매 시작',
        '해외직구 상품 판매 예정이면 croosborder@lotte.net으로 해외판매권한 별도 신청',
      ],
      tip: '해외판매권한 신청 시 거래처명·거래처번호·사업자등록번호·타사판매 URL을 함께 보내면 빨라요.',
      screen: {
        variant: 'status',
        status: 'pending',
        statusTitle: '최종 승인 심사 중',
        statusText: '영업일 약 1~2일 내 승인 결과를 알려드려요.',
      },
    },
  ],
};

// ────────────────────────────────────────────────────────────
// 토스쇼핑 / 카카오쇼핑 (셀프 입점 준비 중)
// ────────────────────────────────────────────────────────────
const toss: OnboardingGuide = {
  channel: 'toss',
  headline: '토스쇼핑은 아직 셀러가 직접 입점하는 공식 창구가 열려 있지 않아요.',
  eligibility: '제휴/협의 기반 (일반 셀프 입점 미공개)',
  estimatedTime: '-',
  cost: '-',
  documents: [],
  settlementSummary: '공식 셀러 정책 공개 시 안내됩니다.',
  available: false,
  finalNote: '토스쇼핑 셀러 입점/연동이 열리면 알림 후 자동으로 활성화됩니다.',
  steps: [
    {
      stepNumber: 1,
      title: '준비 중',
      description: '토스쇼핑은 현재 셀러 직접 입점·연동용 공식 채널이 공개되지 않았습니다.',
      detailedInstructions: [
        '대안 1: 쿠팡 등 주력 채널에 먼저 안정적으로 입점',
        '대안 2: 토스 제휴/광고 상품으로 노출 검토',
        '공식 셀러 창구 공개 시 이 화면에서 바로 입점 절차가 열립니다.',
      ],
    },
  ],
};

const kakao: OnboardingGuide = {
  channel: 'kakao',
  headline: '카카오쇼핑/선물하기는 파트너센터 심사형이라 일반 셀프 입점 창구가 제한적이에요.',
  eligibility: '카카오 파트너센터 심사·협의 기반',
  estimatedTime: '-',
  cost: '-',
  documents: [],
  settlementSummary: '카카오 파트너 정책에 따릅니다.',
  available: false,
  finalNote: '카카오 셀러 입점/연동이 열리면 알림 후 자동으로 활성화됩니다.',
  steps: [
    {
      stepNumber: 1,
      title: '준비 중',
      description: '카카오쇼핑은 파트너센터 직접 입점 심사가 필요하며 일반 셀러 셀프 입점 창구가 제한적입니다.',
      detailedInstructions: [
        '대형 셀러는 카카오 파트너센터에서 별도 협의가 필요합니다.',
        '대안: 쿠팡·네이버 등 주력 채널을 먼저 안정화',
        '공식 셀프 입점 공개 시 이 화면에서 바로 절차가 열립니다.',
      ],
    },
  ],
};

/**
 * 자체 호스팅한 실제 스크린샷(public/onboarding/<dir>/step-N.<ext>)을 각 스텝에 1:1 연결.
 * 파일이 있는 스텝만 imageUrl이 채워지고, 없는 스텝은 screen 목업으로 표시된다.
 * (모두 각 마켓 실제 가입 화면을 브라우저로 캡처한 것으로 육안 검증됨)
 */
function attachImages(g: OnboardingGuide, dir: string, ext: string, steps: number[], source: string) {
  for (const s of g.steps) {
    if (steps.includes(s.stepNumber)) {
      s.imageUrl = `/onboarding/${dir}/step-${s.stepNumber}.${ext}`;
      s.imageSource = source;
    }
  }
}

// 쿠팡: step-5(승인 대기)는 셀러 화면이 없어 목업 유지
attachImages(coupang, 'coupang', 'png', [1, 2, 3, 4, 6], '윈들리 셀러가이드');
// G마켓/옥션: 동일한 ESM PLUS 통합 가입 화면 → gmarket 캡처 공유
attachImages(gmarket, 'gmarket', 'jpg', [1, 2, 3, 4, 5, 6, 7], '윈들리 셀러가이드');
attachImages(auction, 'gmarket', 'jpg', [1, 2, 3, 4, 5, 6, 7], '윈들리 셀러가이드');
// 롯데온: step-9(서버 심사)는 셀러 화면이 없어 목업 유지
attachImages(lotteon, 'lotteon', 'png', [1, 2, 3, 4, 5, 6, 7, 8], '윈들리 셀러가이드');
// 네이버: step-1(가입 진입)은 실제 캡처가 없어 목업 유지, step-2~8은 실제 화면 1:1
attachImages(naver, 'naver', 'png', [2, 3, 4, 5, 6, 7, 8], '리치웨이 블로그');
// 11번가: step-1~7 실제 화면 1:1 (Brunch 가입 후기 캡처)
attachImages(elevenst, 'elevenst', 'png', [1, 2, 3, 4, 5, 6, 7], '11번가 가입 후기(Brunch)');

export const CHANNEL_ONBOARDING_GUIDES: Record<Channel, OnboardingGuide> = {
  coupang,
  naver,
  elevenst,
  gmarket,
  auction,
  lotteon,
  toss,
  kakao,
};
