/**
 * 1부 개업(7단계) · 2부 등록(8단계) 의 화면 목업.
 *
 * 문구 규칙: 필드 이름·버튼 이름·경고 문장은 아카데미 howto 와 **같은 말**을 쓴다.
 * 목업이 "확인하기" 라고 쓰고 체크리스트가 "검증하기" 라고 쓰면, 사용자는 화면에서
 * 그 버튼을 못 찾고 거기서 멈춘다.
 */

import type { MockupScreen } from './types';

export const ACT12_MOCKUPS: Record<string, MockupScreen[]> = {
  // ── 1 사업자등록 ─────────────────────────────────────────
  'act1-01-biz-registration': [
    {
      tab: '토스 신청서',
      chrome: 'browser',
      brand: '토스페이먼츠',
      url: 'onboarding.tosspayments.com/business-registration',
      accent: 'blue',
      caption:
        '토스 바로신청 화면. 왼쪽 번호가 아래 체크리스트 번호와 같습니다. 이 화면에서 실제로 고민할 칸은 과세유형·업태·종목 세 개뿐입니다.',
      blocks: [
        {
          k: 'heading',
          text: '사업자등록 바로신청',
          sub: '입력 3분 · 대행 수수료 0원 · 공동인증서 없음 · 증빙서류 없음',
          pin: 'br-2',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '접수는 결국 정부24를 거칩니다. 가입이 안 돼 있으면 신청 도중에 막혀서 처음부터 다시 하게 됩니다.',
          pin: 'br-1',
        },
        {
          k: 'radio',
          label: '사업자 유형',
          options: [
            { text: '개인사업자', note: '위탁판매는 여기로 시작합니다', on: true },
            { text: '법인사업자', note: '토스 바로신청 대상이 아닙니다 — 홈택스로' },
          ],
          pin: 'br-3',
        },
        {
          k: 'radio',
          label: '과세 유형',
          options: [
            { text: '일반과세자', note: '매입세액 공제 — 도매로 매입하는 위탁판매에 유리', on: true },
            { text: '간이과세자', note: '나중에 바꿀 수 있습니다. 여기서 오래 고민하지 마세요.' },
          ],
        },
        { k: 'select', label: '업태', value: '도매 및 소매업', pin: 'br-4' },
        { k: 'select', label: '종목', value: '전자상거래 소매업' },
        {
          k: 'field',
          label: '국세청 업종코드',
          value: '525101',
          state: 'lock',
          hint: '검색하면 한국표준산업분류 47911 이 같이 나옵니다. 신청서에 들어가는 값은 525101 입니다.',
        },
        {
          k: 'field',
          label: '사업장 주소',
          value: '서울 강남구 ○○로 12, 3층 301호  (자택)',
          state: 'ok',
          hint: '통신판매업은 사업장 실사가 없습니다. 사무실을 구할 필요가 없습니다.',
          pin: 'br-5',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '임대차 계약서에 전대 금지 조항이 있으면 집주인 동의가 필요할 수 있습니다. 계약서를 한 번 확인해보세요.',
        },
        { k: 'btn', label: '신청하기', variant: 'primary', align: 'full', pin: 'br-6' },
      ],
    },
    {
      tab: '알림톡 · 등록증',
      chrome: 'phone',
      brand: '알림톡',
      accent: 'blue',
      caption:
        '신청 3영업일쯤 뒤에 오는 알림톡. 사업자등록증을 여기서 바로 내려받고, 번호 10자리를 메모해두면 다음 두 단계가 한 번에 풀립니다.',
      blocks: [
        { k: 'text', text: '국세청 사업자등록 신청이 완료되었습니다.', strong: true },
        {
          k: 'kv',
          items: [
            { k: '상호', v: '○○커머스' },
            { k: '사업자등록번호', v: '123-45-67890', tone: 'ok', copy: true },
            { k: '과세유형', v: '일반과세자' },
            { k: '업종코드', v: '525101' },
            { k: '개업일', v: '2026-09-28' },
          ],
          pin: 'br-7',
        },
        { k: 'btn', label: '사업자등록증 내려받기', variant: 'primary', align: 'full' },
        {
          k: 'notice',
          tone: 'info',
          text: '보통 3영업일. 급하면 관할 세무서에 직접 가면 당일에도 나옵니다.',
        },
      ],
    },
  ],

  // ── 2 통신판매업 신고 ────────────────────────────────────
  'act1-02-online-sales': [
    {
      tab: '신고서 · 납부',
      chrome: 'browser',
      brand: '토스페이먼츠',
      url: 'onboarding.tosspayments.com/business-registration',
      accent: 'blue',
      caption:
        '통신판매업 신고 화면. 앞 단계를 토스로 했다면 사업자등록번호가 이미 채워져 있습니다. 여기서 실제로 하는 일은 등록면허세 납부 하나입니다.',
      blocks: [
        { k: 'heading', text: '통신판매업 신고', sub: '구매안전서비스 이용 확인증까지 한 자리에서' },
        {
          k: 'field',
          label: '사업자등록번호',
          value: '123-45-67890',
          state: 'lock',
          hint: '앞 단계에서 받은 번호입니다. 등록증이 안 나왔으면 이 신고는 아직 시작할 수 없습니다.',
          pin: 'ts-1',
        },
        { k: 'field', label: '상호', value: '○○커머스', state: 'ok', pin: 'ts-2' },
        { k: 'select', label: '판매 방식', value: '인터넷' },
        { k: 'select', label: '취급 품목', value: '종합몰' },
        {
          k: 'check',
          label: '첨부 서류',
          options: [
            {
              text: '구매안전서비스 이용 확인증',
              note: '토스가 발급과 신고를 같이 처리합니다 — 은행에 갈 일이 없습니다',
              on: true,
            },
            { text: '사업자등록증 사본', note: '자동 첨부', on: true },
          ],
          pin: 'ts-3',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '정부24에서 직접 하실 거라면, 사업자 통장을 만든 은행 앱에서 "구매안전서비스"로 검색해 확인증을 먼저 발급받으세요.',
        },
        {
          k: 'kv',
          items: [
            { k: '대행 수수료', v: '0원', tone: 'ok' },
            { k: '등록면허세', v: '45,000원  (지역에 따라 4~6만원)', tone: 'warn' },
          ],
          pin: 'ts-4',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '무료인 것은 대행 수수료입니다. 등록면허세는 구청에 내는 세금이라 누가 대행해도 똑같이 냅니다. 게다가 매년 1월에 한 번씩 더 나옵니다.',
        },
        { k: 'btn', label: '등록면허세 납부하고 신고하기', variant: 'primary', align: 'full' },
      ],
    },
    {
      tab: '신고증',
      chrome: 'paper',
      brand: '관할 구청',
      accent: 'gray',
      caption:
        '구청에서 3~5영업일 뒤에 나오는 신고증. 신고번호는 2026-서울강남-01234 모양이고, 쿠팡 윙 가입 화면에 이 번호가 그대로 들어갑니다.',
      blocks: [
        {
          k: 'flow',
          items: [
            { text: '신고 접수', state: 'done' },
            { text: '관할 구청 처리 3~5영업일', state: 'now' },
            { text: '신고증 발급', state: 'todo' },
          ],
          pin: 'ts-5',
        },
        {
          k: 'doc',
          title: '통신판매업 신고증',
          lines: [
            '상호 · ○○커머스',
            '대표자 · 홍길동',
            '소재지 · 서울 강남구 ○○로 12, 3층 301호',
            '신고번호 · 2026-서울강남-01234',
          ],
          stamp: '강남구청장',
          pin: 'ts-6',
        },
      ],
    },
  ],

  // ── 3 건강기능식품 ──────────────────────────────────────
  'act1-03-health-cert': [
    {
      tab: '팔까 · 말까',
      chrome: 'browser',
      brand: '메가로드',
      accent: 'red',
      caption:
        '이 단계는 "하는 일"이 아니라 "정하는 일"입니다. 안 팔기로 하면 그대로 건너뛰세요 — 나중에 언제든 추가할 수 있습니다.',
      blocks: [
        { k: 'heading', text: '건강기능식품을 팔 것인가', sub: '비타민 · 유산균 · 홍삼 같은 것들' },
        {
          k: 'radio',
          options: [
            { text: '아니요 — 지금은 안 팝니다', note: '이 단계를 건너뜁니다. 처음이라면 이쪽을 권합니다.', on: true },
            { text: '예 — 팔 계획입니다', note: '온라인 교육 수료 + 보건소 영업신고가 필요합니다.' },
          ],
          pin: 'hf-1',
        },
        {
          k: 'table',
          cols: ['', '안 팔기', '팔기'],
          rows: [
            ['지금 할 일', { t: '없음', tone: 'ok' }, { t: '교육 + 영업신고', tone: 'warn' }],
            ['드는 돈', { t: '0원', tone: 'ok' }, '신고 수수료 2~3만원'],
            ['마진', '보통', { t: '좋음', tone: 'ok' }],
            ['위험', '없음', { t: '규제가 자주 바뀐다', tone: 'bad' }],
          ],
        },
        {
          k: 'notice',
          tone: 'info',
          text: '마진은 좋지만 규제가 자주 바뀝니다. 실제로 규제가 바뀌어 갑자기 못 팔게 된 상품도 있었습니다.',
        },
      ],
    },
    {
      tab: '교육 · 영업신고',
      chrome: 'browser',
      brand: '식품안전나라',
      url: 'foodsafetykorea.go.kr',
      accent: 'green',
      caption:
        '팔기로 했다면 순서는 하나입니다 — 온라인 교육 → 수료증 → 보건소 영업신고. 수료증은 준비물이고, 자격을 만드는 건 영업신고입니다.',
      blocks: [
        { k: 'heading', text: '건강기능식품 일반판매업 영업자 교육', sub: '온라인 수강 가능' },
        {
          k: 'flow',
          items: [
            { text: '온라인 교육 수강', state: 'now' },
            { text: '수료증 발급', state: 'todo' },
            { text: '보건소 영업신고', state: 'todo' },
          ],
          pin: 'hf-2',
        },
        {
          k: 'upload',
          label: '관할 보건소에 가져갈 것',
          files: ['교육 수료증.pdf', '사업자등록증.pdf'],
          pin: 'hf-3',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '교육만 듣고 영업신고를 안 하면 무신고 영업입니다. 수료증은 신고를 위한 준비물이지 그 자체가 자격이 아닙니다.',
        },
        {
          k: 'check',
          label: '이게 건기식인지 구분하는 법',
          options: [
            { text: '포장이나 상세페이지에 "건강기능식품" 표기가 있다', on: true },
            { text: '인증 도안(마크)이 찍혀 있다', on: true },
            { text: '애매하면 올리지 않는다', on: true },
          ],
          pin: 'hf-4',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '이미 올렸는데 신고가 안 돼 있다면, 먼저 내리고 신고를 마친 뒤 다시 올리는 게 훨씬 쌉니다.',
        },
      ],
    },
  ],

  // ── 4 쿠팡 윙 입점 ──────────────────────────────────────
  'act1-04-wing-signup': [
    {
      kind: 'shot',
      tab: '① 계정 만들기',
      src: '/onboarding/coupang/step-1.png',
      alt: '쿠팡 마켓플레이스 판매자 회원가입 화면 — 아이디·비밀번호·이름·이메일·휴대폰 인증과 약관 동의',
      source: '쿠팡 마켓플레이스 판매자 가입',
      caption:
        '첫 화면은 사업자 정보가 아니라 그냥 계정 만들기입니다. 아이디·비밀번호·휴대폰 인증까지 하면 끝이고, 사업자 서류는 다음 화면들에서 들어갑니다.',
      hotspots: [
        { pin: 'cw-1', x: 50, y: 27, label: 'PC 브라우저로 여세요. 모바일로 시작하면 중간에 막힙니다.' },
        { pin: 'cw-1', x: 43, y: 49, label: '필수 항목만 체크해도 가입됩니다. 광고 수신은 선택입니다.' },
        { pin: 'cw-3', x: 50, y: 87.5, label: '[약관 동의하고 가입하기] — 여기까지가 계정 만들기입니다.' },
      ],
    },
    {
      kind: 'shot',
      tab: '② 대표 카테고리',
      src: '/onboarding/coupang/step-2.png',
      alt: '쿠팡 판매자 가입 완료 후 대표 카테고리를 고르는 화면',
      source: '쿠팡 마켓플레이스 판매자 가입',
      caption:
        '가입 직후 대표 카테고리를 묻습니다. 아직 뭘 팔지 안 정했으면 건너뛰어도 됩니다 — 나중에 바꿀 수 있고, 이 값이 판매 가능 범위를 제한하지도 않습니다.',
      hotspots: [
        { pin: 'cw-3', x: 49.8, y: 56.5, label: '대표 카테고리. 위탁판매로 여러 종류를 팔 거면 아무거나 골라도 됩니다.' },
        { pin: 'cw-3', x: 39.7, y: 69, label: '[건너뛰기] 로 넘어가도 가입에는 지장이 없습니다.' },
      ],
    },
    {
      kind: 'shot',
      tab: '③ 사업자 인증 시작',
      src: '/onboarding/coupang/step-3.png',
      alt: '쿠팡 윙 첫 화면 — 입점 대기 상태에서 사업자 인증하기 버튼이 보이는 대시보드',
      source: '쿠팡 윙 대시보드',
      caption:
        '가입만 하면 "입점 대기" 상태입니다. 오른쪽 점선 상자의 [사업자 인증하기] 를 눌러야 실제 입점 절차가 시작됩니다.',
      hotspots: [
        { pin: 'cw-5', x: 49.8, y: 43.3, label: '[사업자 인증하기] — 이걸 눌러야 사업자 정보 입력 화면으로 갑니다.' },
        { pin: 'cw-5', x: 3.3, y: 52.5, label: '왼쪽 [판매자정보] 메뉴. 인증이 끝나면 여기가 다음 단계들의 출발점이 됩니다.' },
      ],
    },
    {
      kind: 'shot',
      tab: '④ 사업자 정보입력',
      src: '/onboarding/coupang/step-4.png',
      alt: '쿠팡 윙 사업자 정보입력 화면 — 사업자등록번호, 사업장 주소, 통신판매업신고번호, 정산계좌',
      source: '쿠팡 윙 판매자 회원가입',
      caption:
        '1·2단계에서 받은 번호 두 개가 실제로 들어가는 화면입니다. 사업장 주소는 통신판매업 신고증에 적힌 주소와 같아야 하고(화면에도 그렇게 경고가 붙어 있습니다), 정산계좌는 사업자 명의여야 합니다.',
      hotspots: [
        {
          pin: 'cw-2',
          x: 35,
          y: 12.5,
          label: '"입점 전에 준비해주세요" — 사업자등록증과 통신판매업 신고증을 파일로 미리 꺼내두세요.',
        },
        { pin: 'cw-3', x: 17.4, y: 25.4, label: '사업자등록번호를 "-" 없이 넣고 [인증하기] 를 누릅니다.' },
        {
          pin: 'cw-3',
          x: 17.4,
          y: 59.8,
          label: '통신판매업신고번호. 사업장 주소는 이 신고증의 주소와 같아야 합니다.',
        },
        {
          pin: 'cw-4',
          x: 20,
          y: 80,
          label: '정산계좌 — 예금주가 사업자 명의여야 합니다. 개인 명의를 넣으면 정산이 보류됩니다.',
        },
      ],
    },
    {
      tab: '판매자 가입',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      accent: 'red',
      caption:
        '쿠팡 윙 판매자 가입 화면. 앞 두 단계에서 받은 번호 두 개와 파일 두 개가 여기서 전부 쓰입니다. 미리 꺼내두지 않으면 찾는 동안 세션이 끊깁니다.',
      blocks: [
        {
          k: 'notice',
          tone: 'warn',
          text: '쿠팡 윙은 PC 기준으로 만들어져 있습니다. 모바일로 가입을 시도하면 중간에 막힙니다.',
          pin: 'cw-1',
        },
        { k: 'upload', label: '첨부 파일', files: ['사업자등록증.pdf', '통장사본.jpg'], pin: 'cw-2' },
        { k: 'field', label: '사업자등록번호', value: '123-45-67890', state: 'ok', pin: 'cw-3' },
        { k: 'field', label: '통신판매업 신고번호', value: '2026-서울강남-01234', state: 'ok' },
        {
          k: 'field',
          label: '정산 계좌 예금주',
          value: '○○커머스',
          state: 'ok',
          hint: '사업자 명의여야 합니다.',
          pin: 'cw-4',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '개인 명의 계좌를 넣으면 정산이 보류됩니다. 돈이 안 들어오고 나서야 알게 되는 실수라 여기서 확실히 해두세요.',
        },
        { k: 'btn', label: '가입 신청', variant: 'primary', align: 'full' },
      ],
    },
    {
      tab: '인증 심사',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      path: '마이페이지 > 판매자 정보',
      accent: 'red',
      caption:
        '다음 단계에서 "API 키 발급 메뉴가 없다"고 헤매는 사람은 거의 여기가 덜 끝난 경우입니다. 인증이 완료로 바뀌어야 메뉴 자체가 나타납니다.',
      blocks: [
        {
          k: 'flow',
          items: [
            { text: '가입 신청', state: 'done' },
            { text: '사업자 인증 심사 (보통 하루)', state: 'now' },
            { text: '인증 완료', state: 'todo' },
          ],
          pin: 'cw-5',
        },
        {
          k: 'table',
          cols: ['인증 상태', '추가판매정보 메뉴', 'API 키 발급'],
          rows: [
            [{ t: '심사중', tone: 'warn' }, { t: '안 보인다', tone: 'bad' }, { t: '불가', tone: 'bad' }],
            [{ t: '완료', tone: 'ok' }, { t: '보인다', tone: 'ok' }, { t: '가능', tone: 'ok' }],
          ],
        },
        {
          k: 'notice',
          tone: 'info',
          text: '보통 하루 안에 끝납니다. 심사중인 동안에는 다음 단계를 열어도 할 수 있는 게 없습니다.',
        },
      ],
    },
  ],

  // ── 5 API 연동 ─────────────────────────────────────────
  'act1-05-api': [
    {
      kind: 'shot',
      tab: '① 업체코드 · 메뉴',
      src: '/onboarding/coupang/api-vendor.png',
      alt: '쿠팡 윙 오른쪽 위 판매자 이름을 눌러 연 드롭다운 — 업체코드와 추가판매정보 메뉴',
      source: '쿠팡 윙 · 내 계정 드롭다운',
      caption:
        '업체코드는 따로 찾아 헤맬 필요가 없습니다. 오른쪽 위 판매자 이름을 누르면 드롭다운 맨 위에 바로 보이고, API 키 발급 메뉴도 같은 드롭다운 안에 있습니다.',
      hotspots: [
        { pin: 'api-1', x: 76, y: 6, label: '오른쪽 위 판매자 이름을 눌러 드롭다운을 엽니다.' },
        { pin: 'api-3', x: 55, y: 30, label: '업체코드(vendorId) — A 또는 C + 숫자. 지금 복사해 두세요.' },
        { pin: 'api-1', x: 48, y: 80, label: '[추가판매정보] — 여기로 들어가 페이지 맨 아래로 내립니다.' },
      ],
    },
    {
      kind: 'shot',
      tab: '② 키 발급 화면',
      src: '/onboarding/coupang/api-key.png',
      alt: '쿠팡 윙 추가판매정보의 OPEN API 키 발급 영역 — 동의 상태, 발급 버튼, 업체코드·유효기간·Access Key·Secret Key 표',
      source: '쿠팡 윙 · 추가판매정보',
      caption:
        '키 세 값이 실제로 나오는 표입니다. 발급 전에 동의 2종이 "완료"여야 하고, 시크릿 키는 이때 한 번만 보입니다. 표에 남은 유효기간(180일)도 같이 나오니 만료 전에 재발급하세요.',
      hotspots: [
        { pin: 'api-2', x: 11, y: 17, label: '카테고리 자동매칭 이용동의·약관동의가 둘 다 "완료"여야 발급됩니다.' },
        { pin: 'api-2', x: 45, y: 17, label: '[발급] 을 누르면 아래 표에 키가 생성됩니다. 팝업에서는 "오픈 API" 를 고르세요.' },
        { pin: 'api-3', x: 20, y: 50, label: '업체코드 — 메가로드 채널관리에 넣을 첫 번째 값.' },
        { pin: 'api-3', x: 34, y: 45, label: '유효기간과 남은 일수. 만료되면 연동이 끊기니 재발급으로 갱신합니다.' },
        { pin: 'api-3', x: 66, y: 50, label: 'Access Key — 두 번째 값.' },
        { pin: 'api-3', x: 86, y: 50, label: 'Secret Key — 세 번째 값. 이 화면을 나가면 다시 볼 수 없습니다.' },
      ],
    },
    {
      tab: '윙 · 키 발급',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      menu: { items: ['상품관리', '주문/배송', '정산', '마이페이지'], active: 3 },
      path: '마이페이지 > 추가판매정보 > 페이지 맨 아래',
      accent: 'red',
      caption:
        'API 키 세 값이 나오는 화면. 시크릿 키는 이 화면을 나가면 다시 볼 수 없고, 아래 "연동 정보" 한 칸을 빠뜨리는 것이 연동 실패의 1순위 원인입니다.',
      blocks: [
        {
          k: 'text',
          text: '윙 오른쪽 위 "내 계정" → 마이페이지 → 추가판매정보. 이 메뉴가 안 보이면 앞 단계의 사업자 인증이 아직 완료가 아닙니다.',
          pin: 'api-1',
        },
        { k: 'btn', label: 'API Key 발급 받기', variant: 'sec', align: 'left', pin: 'api-2' },
        {
          k: 'radio',
          label: '팝업에서 고르는 것',
          options: [{ text: '오픈 API', on: true }, { text: '그 외' }],
        },
        {
          k: 'kv',
          items: [
            { k: '업체코드 (vendorId)', v: 'A00123456', copy: true },
            { k: 'Access Key', v: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890', copy: true },
            { k: 'Secret Key', v: '9f8e7d6c5b4a………  ← 지금 복사하지 않으면 끝', tone: 'bad', copy: true },
          ],
          pin: 'api-3',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '시크릿 키는 이 화면을 나가면 다시 볼 수 없습니다. 나중에 복사하려고 미루면 키를 삭제하고 재발급받아야 합니다.',
        },
        { k: 'heading', text: '연동 정보', sub: '같은 페이지 · "수정" 버튼' },
        {
          k: 'field',
          label: '접속 IP  (콤마로 구분해 10개 전부)',
          value: '76.76.21.21, 76.76.21.22, 76.76.21.61, …',
          state: 'ok',
          pin: 'api-4',
        },
        { k: 'field', label: '서비스 URL', value: 'https://coupanglanding.vercel.app/', state: 'ok' },
        {
          k: 'notice',
          tone: 'bad',
          text: '이걸 빠뜨리면 키는 발급됐는데 호출이 전부 막힙니다. API 연동이 실패하는 가장 흔한 원인이 바로 이 한 칸입니다.',
        },
      ],
    },
    {
      tab: '메가로드 · 저장',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/channels',
      accent: 'red',
      caption:
        '받아온 세 값을 붙여넣고 저장한 다음 확인하기를 누릅니다. 이건 자기신고가 아니라, 쿠팡에 실제로 요청을 한 번 보내보는 것입니다.',
      blocks: [
        { k: 'field', label: '업체코드', value: 'A00123456', state: 'ok', pin: 'api-5' },
        { k: 'field', label: 'Access Key', value: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890', state: 'ok' },
        { k: 'field', label: 'Secret Key', value: '••••••••••••••••••••••••', state: 'ok' },
        { k: 'btn', label: '저장', variant: 'primary', align: 'left' },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'api-6' },
        {
          k: 'notice',
          tone: 'ok',
          title: '연결 성공',
          text: '쿠팡에 요청을 보냈습니다 — 판매자 A00123456 으로 응답했습니다. 이제 상품 등록과 주문 수집이 전부 열립니다.',
        },
      ],
    },
  ],

  // ── 6 출고지·반품지 ─────────────────────────────────────
  'act1-06-shipping': [
    {
      kind: 'shot',
      tab: '① 주소록 관리',
      src: '/onboarding/coupang/step-6.png',
      alt: '쿠팡 윙 판매자정보 > 주소록/배송정보 관리 화면 — 등록된 주소지가 없는 상태와 새 주소지 등록 버튼',
      source: '쿠팡 윙 · 판매자정보 > 주소록/배송정보 관리',
      caption:
        '처음 열면 "등록된 주소지가 없습니다" 만 떠 있습니다. 여기서 출고지와 반품지를 각각 하나씩 만들면 이 단계는 끝입니다.',
      hotspots: [
        {
          pin: 'sp-1',
          x: 5.2,
          y: 61.6,
          label: '왼쪽 [판매자정보] → [주소록/배송정보 관리]. 이 메뉴가 출발점입니다.',
        },
        { pin: 'sp-2', x: 14.1, y: 34.4, label: '[새 주소지 등록] — 먼저 출고지를 하나 만듭니다.' },
        { pin: 'sp-3', x: 50.1, y: 63.8, label: '같은 버튼으로 반품지도 하나 더 만듭니다. 구분 값만 다릅니다.' },
      ],
    },
    {
      tab: '윙 · 배송지 관리',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      menu: { items: ['상품관리', '주문/배송', '정산', '판매자정보'], active: 3 },
      path: '판매자정보 > 배송지 관리',
      accent: 'red',
      caption:
        '출고지는 물건이 나가는 주소, 반품지는 고객이 돌려보내는 주소입니다. 위탁판매라면 둘 다 소싱처 주소를 넣습니다.',
      blocks: [
        { k: 'tabs', items: ['출고지', '반품지'], active: 0, pin: 'sp-1' },
        { k: 'field', label: '출고지명', value: '소싱처 출고지', state: 'ok', pin: 'sp-2' },
        {
          k: 'field',
          label: '주소',
          value: '경기 부천시 ○○로 45, 1층  (공급사 창고)',
          state: 'ok',
          hint: '내 집이 아니라 물건이 실제로 나가는 곳입니다.',
        },
        { k: 'field', label: '반품지명', value: '소싱처 반품지', state: 'ok', pin: 'sp-3' },
        {
          k: 'field',
          label: '반품지 주소',
          value: '경기 부천시 ○○로 45, 1층',
          state: 'ok',
          hint: '자체 수거를 할 생각이면 반품지만 내 주소로 두세요.',
        },
        {
          k: 'field',
          label: '반품 배송비 (편도)',
          value: '3,000원',
          state: 'ok',
          hint: '여기 넣은 값이 나중에 반품 정산에 그대로 쓰입니다.',
          pin: 'sp-4',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '대충 넣으면 반품이 생길 때마다 손해가 고정됩니다. 소싱처의 실제 반품비를 확인해서 넣으세요.',
        },
      ],
    },
    {
      tab: '확인하기',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/my/academy',
      accent: 'red',
      caption: '출고지·반품지가 각각 1개 이상이어야 통과입니다. 저장 직후에는 쿠팡 쪽 반영이 조금 늦습니다.',
      blocks: [
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'sp-5' },
        {
          k: 'notice',
          tone: 'ok',
          title: '통과',
          text: '쿠팡 조회 결과 — 출고지 1개, 반품지 1개가 등록되어 있습니다.',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '저장 직후에는 반영에 2~3분 걸릴 수 있습니다. 0개로 나오면 잠시 뒤 다시 눌러보세요.',
        },
      ],
    },
  ],

  // ── 7 소싱 카탈로그 ─────────────────────────────────────
  'act1-07-catalog': [
    {
      kind: 'shot',
      tab: '① 실제 카탈로그',
      src: '/academy/mockups/catalog-grid.jpg',
      alt: '메가로드 네이버 소싱 카탈로그 화면 — 상품 격자, 카드 체크박스, 상세 확보 배지, 등록 방식 카드 두 장',
      source: '메가로드 · 네이버 소싱 카탈로그',
      caption:
        '실제 카탈로그 화면입니다. 상품이 이미 모여 있고, 각 카드에는 지금 올릴 수 있는지를 알려주는 배지가 붙어 있습니다. 설치할 프로그램도, 연결할 드라이브도 없습니다.',
      hotspots: [
        { pin: 'cat-1', x: 5.1, y: 52.4, label: '왼쪽 메뉴 [네이버 소싱 카탈로그] 로 들어갑니다.' },
        { pin: 'cat-5', x: 36.2, y: 50.1, label: '선택은 카드 사진 왼쪽 위의 이 작은 체크박스로 합니다.' },
        { pin: 'cat-2', x: 37.1, y: 70.5, label: '초록색 [상세 확보] 배지 — 지금 바로 올릴 수 있는 상품입니다.' },
        { pin: 'cat-6', x: 39.5, y: 43.6, label: '[이 페이지 전체 선택] 은 올릴 수 있는 것만 골라줍니다. 처음에는 5개만.' },
        { pin: 'cat-4', x: 63.5, y: 28.1, label: '[이미 올린 것 숨기기] 를 켜두면 중복 등록을 스스로 걸러낼 수 있습니다.' },
      ],
    },
    {
      tab: '소싱 카탈로그',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/sourcing/naver',
      accent: 'red',
      caption:
        '카탈로그는 배지 색으로 읽습니다. 초록만 지금 올릴 수 있고, 회색은 체크박스 자체가 안 눌리고, 파란색은 내가 이미 올린 상품입니다.',
      blocks: [
        {
          k: 'text',
          text: '이미 모아둔 상품이 격자로 깔려 있습니다. 내 PC에 설치할 것도, 구글드라이브를 연결할 일도 없습니다.',
          pin: 'cat-1',
        },
        {
          k: 'cards',
          items: [
            { name: '유산균 180정 1박스', price: '12,900원', badge: { t: '상세 확보', tone: 'ok' }, checked: true },
            { name: '실리콘 주방장갑 2p', price: '6,400원', badge: { t: '상세 확보', tone: 'ok' }, checked: true },
            { name: '호텔수건 10장 세트', price: '8,900원', badge: { t: '상세 미지원', tone: 'mute' }, lock: true },
            { name: '스테인리스 텀블러', price: '11,500원', badge: { t: '이미 올림', tone: 'info' } },
          ],
          pin: 'cat-2',
        },
        {
          k: 'table',
          cols: ['배지', '뜻', '지금 올릴 수 있나'],
          rows: [
            [{ t: '상세 확보', tone: 'ok' }, '옵션과 상세까지 받아둔 상품', { t: '가능', tone: 'ok' }],
            [
              { t: '상세 미지원', tone: 'mute' },
              '네이버 마켓·쇼핑윈도라 상세를 못 가져온다',
              { t: '체크박스가 안 눌린다', tone: 'bad' },
            ],
            [{ t: '이미 올림', tone: 'info' }, '내 쿠팡 계정에 벌써 올린 상품', { t: '올리면 중복', tone: 'warn' }],
          ],
          pin: 'cat-3',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '"이미 올림"을 또 올리면 같은 상품이 둘로 올라갑니다. 시스템이 막지는 않으니 스스로 걸러야 합니다.',
          pin: 'cat-4',
        },
        {
          k: 'text',
          text: '선택은 카드 사진 왼쪽 위의 작은 체크박스로 합니다. 카드 본문을 눌러도 선택되지 않고, 오른쪽 아래 화살표는 네이버 원본을 여는 버튼이라 또 다릅니다.',
          pin: 'cat-5',
        },
        {
          k: 'btnrow',
          items: [
            { label: '이 페이지 전체 선택', variant: 'sec' },
            { label: '선택 2개', variant: 'off' },
          ],
        },
        {
          k: 'notice',
          tone: 'info',
          text: '처음에는 5개만 고르세요. 뒤에 검수 단계가 있습니다 — 많이 고르면 검수가 벅차서 대충 넘기게 되고, 그게 반품으로 돌아옵니다.',
          pin: 'cat-6',
        },
      ],
    },
  ],

  // ── 8 카탈로그 → 검수 화면 ──────────────────────────────
  'act2-10-load': [
    {
      kind: 'shot',
      tab: '① 등록 카드 두 장',
      src: '/academy/mockups/catalog-grid.jpg',
      alt: '메가로드 소싱 카탈로그 상단의 등록 방식 카드 두 장 — 올인원으로 등록(빨강), 직접 검수해서 등록(파랑)',
      source: '메가로드 · 네이버 소싱 카탈로그',
      caption:
        '상품을 체크하면 위쪽 카드 두 장의 숫자가 올라갑니다. 빨간 카드는 도우미 앱이 필요하고, 파란 카드는 설치가 하나도 없습니다.',
      hotspots: [
        { pin: 'ld-1', x: 36.2, y: 50.1, label: '카드 사진 왼쪽 위 체크박스로 "상세 확보" 상품을 고릅니다.' },
        { pin: 'ld-2', x: 45.6, y: 35.5, label: '빨간 카드 [올인원으로 등록] — 상세페이지까지 자동, 대신 도우미 앱 설치.' },
        { pin: 'ld-2', x: 65.7, y: 35.5, label: '파란 카드 [직접 검수해서 등록] — 설치 0. 처음에는 이쪽입니다.' },
      ],
    },
    {
      tab: '등록 방식 고르기',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/sourcing/naver',
      accent: 'red',
      caption:
        '상품을 고르면 위쪽에 카드 두 장이 나옵니다. 처음이라면 파란 카드입니다 — 설치가 0이고, 내가 눈으로 보고 올립니다.',
      blocks: [
        {
          k: 'text',
          text: '"상세 확보" 상품 5개를 체크한 상태. 체크박스는 카드 사진 왼쪽 위에 있습니다.',
          pin: 'ld-1',
        },
        {
          k: 'radio',
          label: '어떻게 등록할까',
          options: [
            { text: '직접 검수해서 등록  (파란 카드)', note: '설치 0 · 내가 하나씩 보고 올린다 · 처음에는 이쪽', on: true },
            { text: '올인원 등록  (빨간 카드)', note: '상세페이지까지 자동 생성 · 도우미 앱 설치 필요' },
          ],
          pin: 'ld-2',
        },
      ],
    },
    {
      tab: '대량 등록 화면',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption:
        '불러오기 버튼이 안 눌려서 막히는 사람이 많습니다. 원인은 거의 항상 이것 — 출고지와 반품지를 아직 안 골랐습니다.',
      blocks: [
        { k: 'select', label: '출고지', value: '소싱처 출고지', pin: 'ld-3' },
        { k: 'select', label: '반품지', value: '소싱처 반품지' },
        {
          k: 'notice',
          tone: 'warn',
          text: '이 두 칸이 채워져야 아래 불러오기 버튼이 열립니다. 바로 불러오려다 버튼이 안 눌려서 막히는 사람이 많습니다.',
        },
        { k: 'btn', label: '선택 상품 불러와서 수동 검수', variant: 'primary', align: 'full', pin: 'ld-4' },
        {
          k: 'notice',
          tone: 'info',
          title: '상세가 없는 상품이 2개 있습니다',
          text: '"준비된 것만 검수"로 진행하세요. 나머지는 상세 요청을 걸어두면 나중에 받을 수 있습니다.',
          pin: 'ld-5',
        },
        {
          k: 'btnrow',
          items: [
            { label: '준비된 것만 검수', variant: 'primary' },
            { label: '상세 요청 걸어두기', variant: 'sec' },
          ],
        },
      ],
    },
  ],

  // ── 9 프리플라이트 ──────────────────────────────────────
  'act2-20-preflight': [
    {
      tab: '기다리는 구간',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption:
        '이 단계에서 배워야 할 것은 누르는 법이 아니라 기다리는 법입니다. 매칭이 도는 중에 등록을 누르면 반드시 오류가 납니다.',
      blocks: [
        { k: 'gauges', items: [{ label: '카테고리 자동 매칭 중', pct: 64, tone: 'warn' }], pin: 'pf-1' },
        {
          k: 'notice',
          tone: 'bad',
          text: '이게 끝나기 전에 등록을 누르면 반드시 오류가 납니다. 게이지가 사라질 때까지 손을 떼고 기다리세요.',
        },
        { k: 'btn', label: '전체 검증 + 이미지 사전 업로드', variant: 'sec', align: 'right', pin: 'pf-2' },
        {
          k: 'text',
          text: '미리 쿠팡 쪽으로 테스트 요청을 쏴보는 것입니다. 실제 등록 전에 막힐 곳을 먼저 찾아냅니다.',
        },
        {
          k: 'gauges',
          items: [
            { label: '필수값 검증', pct: 100, tone: 'ok' },
            { label: '카테고리 확정', pct: 100, tone: 'ok' },
            { label: '이미지 사전 업로드', pct: 100, tone: 'ok' },
            { label: '이미지 다양성 분석', pct: 72, tone: 'warn' },
          ],
          pin: 'pf-3',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '안 차거나 오류가 뜨면 쿠팡으로 가는 길에 뭔가 걸려 있다는 뜻입니다. 계정 키가 잘못됐거나, 매칭이 안 끝났는데 누른 경우가 대부분입니다. 이미지 다양성은 이미지가 많으면 잘 안 차니 한 번 더 눌러보세요.',
        },
      ],
    },
  ],

  // ── 10 상품명·옵션 ─────────────────────────────────────
  'act2-30-options': [
    {
      tab: '검수 · 상품정보',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption:
        '여기서 틀리면 뒤가 전부 틀립니다. 원본을 열어 실제 구성을 눈으로 본 다음, 상품명과 옵션을 그 구성에 맞춥니다.',
      blocks: [
        { k: 'tabs', items: ['상품정보', '상세페이지'], active: 0 },
        {
          k: 'kv',
          items: [{ k: '상품 번호', v: '8123456789   ↗ 원본 소싱처 열기', tone: 'info' }],
          pin: 'op-1',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '180정 1개짜리인지, 90정 2개짜리인지를 먼저 눈으로 봅니다. 원본을 안 열고 짐작으로 적는 순간 뒤가 전부 어긋납니다.',
        },
        {
          k: 'field',
          label: '노출 상품명  (고객에게 보이는 이름)',
          value: '○○ 유산균 180정, 1개',
          state: 'ok',
          hint: '뒤에 구성을 적습니다. "30일분"처럼 기간으로 적어도 됩니다.',
          pin: 'op-2',
        },
        {
          k: 'field',
          label: '판매자 상품명  (나만 보는 이름)',
          value: 'LB-180-1',
          state: 'plain',
          hint: '고객에게 안 보입니다. 신경 쓰지 않아도 됩니다.',
        },
        {
          k: 'table',
          cols: ['중량', '용량', '수량'],
          rows: [[{ t: '0  (모르면 0)' }, { t: '0  (모르면 0)' }, { t: '1', tone: 'ok' }]],
          pin: 'op-3',
        },
        {
          k: 'table',
          cols: ['원본의 실제 구성', '내가 적은 것', '맞나'],
          rows: [
            ['180정 × 1박스', '180정, 1개 / 수량 1', { t: '맞다', tone: 'ok' }],
            ['180정 × 1박스', '180정, 2개 / 수량 2', { t: '반품 사유', tone: 'bad' }],
          ],
          pin: 'op-4',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '상품명·옵션·이미지 셋 중 하나만 어긋나도 "두 개인 줄 알았다"는 반품이 들어옵니다. 그 택배비는 판매자 부담입니다.',
        },
      ],
    },
  ],

  // ── 11 대표 이미지 ─────────────────────────────────────
  'act2-40-main-image': [
    {
      tab: '대표 이미지',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption:
        '대표로 무엇을 고르냐에 따라 AI 광고가 돌아가는지가 갈립니다. 그리고 사진 속 수량이 실제와 다르면 그게 그대로 반품이 됩니다.',
      blocks: [
        {
          k: 'imgpair',
          items: [
            {
              src: '/guide/ip-safe-nukki.jpg',
              alt: '흰 배경에 제품만 있는 누끼 이미지 — 대표 이미지로 안전한 예',
              cap: '누끼 (흰 배경)',
              note: 'AI 광고가 돌아갑니다. 지재권 시비도 적습니다.',
              verdict: 'ok',
            },
            {
              src: '/guide/ip-risk-vendor.jpg',
              alt: '제조사가 만든 배경 연출 스튜디오 이미지 — 지식재산권 위험이 있는 예',
              cap: '업체(제조사) 연출컷',
              note: '예쁘지만 남이 만든 사진입니다. 신고가 들어오면 그 상품부터 내려갑니다.',
              verdict: 'bad',
            },
          ],
          pin: 'mi-1',
        },
        {
          k: 'thumbs',
          items: [
            { cap: '누끼(흰 배경)', kind: 'white', pick: true },
            { cap: '연출컷', kind: 'photo' },
            { cap: '리뷰 사진', kind: 'review' },
            { cap: '박스 사진', kind: 'box' },
            { cap: '2개가 찍힌 사진', kind: 'photo', del: true },
          ],
          pin: 'mi-1',
        },
        {
          k: 'table',
          cols: ['대표로 고른 것', '상품 종류', 'AI 광고'],
          rows: [
            [{ t: '누끼(흰 배경)', tone: 'ok' }, '전부', { t: '돌아간다', tone: 'ok' }],
            [{ t: '리뷰 이미지', tone: 'warn' }, '일반 상품', { t: '안 돌아간다', tone: 'bad' }],
            [{ t: '리뷰 이미지', tone: 'ok' }, '쌀·채소·과일 등 신선식품', { t: '예외로 돌아간다', tone: 'ok' }],
          ],
          pin: 'mi-2',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '리뷰 이미지는 지식재산권 문제를 피할 수 있어 좋지만, 일반 상품은 리뷰 이미지로 AI 광고가 안 돌아갑니다.',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '180정 1개짜리인데 두 개가 찍힌 사진을 대표로 쓰면, 두 개인 줄 알고 주문했다며 반품이 들어옵니다. 트집 잡힐 여지를 미리 없애는 게 낫습니다.',
          pin: 'mi-3',
        },
        {
          k: 'text',
          text: '썸네일 하나와 쓸 만한 사진 한두 장만 남기고 나머지는 ×로 지웁니다. 원물이 안 보이는 사진뿐이라면 박스 사진을 한 장 남겨두면 좋습니다.',
          pin: 'mi-4',
        },
      ],
    },
  ],

  // ── 12 상세페이지 이미지 ────────────────────────────────
  'act2-50-detail-image': [
    {
      tab: '상세페이지 탭',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption: '글은 이미 어느 정도 만들어져 있습니다. 여기서 할 일은 이미지를 3~5장으로 추리는 것 하나입니다.',
      blocks: [
        { k: 'tabs', items: ['상품정보', '상세페이지'], active: 1, pin: 'di-1' },
        {
          k: 'thumbs',
          items: [
            { cap: '제품 정면', kind: 'white', pick: true },
            { cap: '성분표', kind: 'photo', pick: true },
            { cap: '손에 든 사진', kind: 'review', pick: true },
            { cap: '흐린 사진', kind: 'photo', del: true },
            { cap: '2개 구성 사진', kind: 'photo', del: true },
          ],
          pin: 'di-2',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '사실 사람들이 글을 다 읽지 않습니다. 이미지를 고르는 쪽이 더 중요합니다. 마땅한 게 없으면 두 장만 써도 됩니다 — 억지로 채우지 마세요.',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '한 개짜리 상품이면 한 개가 찍힌 사진으로. 대표 이미지에서 맞춰놓고 상세에서 어긋나면 똑같이 반품 사유가 됩니다.',
          pin: 'di-3',
        },
      ],
    },
  ],

  // ── 13 등록 제외 · 선택 ─────────────────────────────────
  'act2-60-select': [
    {
      tab: '검수 목록',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption: '체크한 만큼만 올라갑니다. 그래서 전부 해제하고, 검수를 마친 것만 다시 체크하는 편이 확실합니다.',
      blocks: [
        {
          k: 'table',
          cols: ['선택', '상품', '검수', '등록'],
          rows: [
            [{ t: '☑', tone: 'ok' }, '유산균 180정 1박스', { t: '완료', tone: 'ok' }, { t: '포함', tone: 'ok' }],
            [{ t: '☑', tone: 'ok' }, '실리콘 주방장갑 2p', { t: '완료', tone: 'ok' }, { t: '포함', tone: 'ok' }],
            [{ t: '☐' }, '호텔수건 10장', { t: '미검수', tone: 'warn' }, { t: '빠짐', tone: 'mute' }],
            [{ t: '—', tone: 'mute' }, '스테인리스 텀블러', { t: '등록 제외', tone: 'bad' }, { t: '제외', tone: 'bad' }],
          ],
          pin: 'sel-1',
        },
        {
          k: 'text',
          text: '올리면 안 되는 상품은 열었을 때 오른쪽 위의 통행금지처럼 생긴 아이콘(동그라미에 대각선)을 누릅니다. 누르면 목록에 흰 줄이 그어집니다. 중요한 기능인데 아이콘이 작아서 잘 못 찾습니다 — 여기서 한 번 눌러보고 넘어가세요.',
          pin: 'sel-2',
        },
        { k: 'btn', label: '맨 위 전체 체크박스 → 전부 해제', variant: 'sec', align: 'left', pin: 'sel-3' },
        {
          k: 'text',
          text: '불러온 것 전부가 체크된 상태입니다. 한 번 비우고, 검수를 마친 것만 다시 체크합니다.',
          pin: 'sel-4',
        },
        { k: 'btn', label: '2개 등록하기', variant: 'primary', align: 'right', pin: 'sel-5' },
        {
          k: 'notice',
          tone: 'warn',
          text: '이 숫자가 생각한 것과 다르면 아직 누르지 마세요. 숙련되면 상품 하나에 20~30초면 충분합니다 — 처음이 오래 걸리는 게 정상입니다.',
        },
      ],
    },
  ],

  // ── 14 등록 실행 ───────────────────────────────────────
  'act2-08-register': [
    {
      tab: '등록 실행',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/products/bulk-register',
      accent: 'red',
      caption: '마지막 확인 지점입니다. 게이지가 전부 찼는지 한 번 더 보고 누릅니다.',
      blocks: [
        {
          k: 'gauges',
          items: [
            { label: '전체 검증', pct: 100, tone: 'ok' },
            { label: '이미지 사전 업로드', pct: 100, tone: 'ok' },
            { label: '카테고리 매칭', pct: 100, tone: 'ok' },
          ],
          pin: 'rg-1',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '카테고리 매칭이 도는 중에 누르면 반드시 오류가 납니다. 여기가 마지막 확인 지점입니다.',
        },
        { k: 'btn', label: '2개 등록하기', variant: 'primary', align: 'right', pin: 'rg-2' },
        {
          k: 'flow',
          items: [
            { text: '등록 요청 전송', state: 'done' },
            { text: '쿠팡 접수 대기 5~10분', state: 'now' },
            { text: '등록 완료', state: 'todo' },
          ],
          pin: 'rg-3',
        },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'rg-4' },
        {
          k: 'notice',
          tone: 'ok',
          title: '통과',
          text: '쿠팡에 직접 물어본 결과 — 등록된 상품 2건. 1건 이상이면 통과입니다.',
        },
      ],
    },
  ],

  // ── 15 승인 확인 ───────────────────────────────────────
  'act2-09-approved': [
    {
      tab: '등록됨 ≠ 판매중',
      chrome: 'browser',
      brand: '메가로드',
      accent: 'red',
      caption: '등록에 성공했다고 팔리는 게 아닙니다. 쿠팡은 올라온 상품을 심사한 뒤에야 판매 상태로 바꿔줍니다.',
      blocks: [
        {
          k: 'table',
          cols: ['상태', '뜻', '팔리나'],
          rows: [
            [{ t: '등록됨', tone: 'warn' }, '쿠팡이 받았다', { t: '아니오', tone: 'bad' }],
            [{ t: '승인대기', tone: 'warn' }, '심사 중', { t: '아니오', tone: 'bad' }],
            [{ t: '판매중', tone: 'ok' }, '심사 통과', { t: '예', tone: 'ok' }],
            [{ t: '반려', tone: 'bad' }, '사유가 목록에 적혀 있다', { t: '아니오', tone: 'bad' }],
          ],
          pin: 'ap-1',
        },
      ],
    },
    {
      tab: '윙 상품 목록',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      menu: { items: ['상품관리', '주문/배송', '정산', '마이페이지'], active: 0 },
      path: '상품관리 > 상품 조회/수정',
      accent: 'red',
      caption: '반려 사유는 목록에 그대로 적혀 있습니다. 추측하지 말고 적힌 것을 고쳐서 다시 올립니다.',
      blocks: [
        {
          k: 'table',
          cols: ['상품', '상태', '사유'],
          rows: [
            ['유산균 180정 1박스', { t: '판매중', tone: 'ok' }, '—'],
            ['실리콘 주방장갑 2p', { t: '반려', tone: 'bad' }, { t: '대표 이미지에 텍스트 삽입', tone: 'bad' }],
          ],
          pin: 'ap-2',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '심사에서 걸리는 건 대부분 이미지, 금지어, 카테고리 오배치 셋 중 하나입니다.',
          pin: 'ap-3',
        },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'ap-4' },
        {
          k: 'notice',
          tone: 'ok',
          title: '통과',
          text: '판매중 상품 1건이 조회됩니다. 여기까지 통과하면 "팔 수 있는 상태"가 진짜로 된 겁니다.',
        },
      ],
    },
  ],
};
