/**
 * Act 1 · 개업 — "팔 수 있는 상태 만들기"
 *
 * 접근: public (로그인한 전원). Act 0~2 는 무료 공개다.
 *
 * ★ 스텝을 추가할 때 지켜야 하는 것:
 *   9칸(goal/why/estimatedSec/narration/actions/verify/troubleshoot/xp + 목업or영상)을
 *   다 채우지 못하면 발행하지 않는다. 특히 verify — "됐는지 봐주는 것"이 이 시스템의 전부다.
 */

import type { AcademyStep } from './types';

export const ACT1_STEPS: AcademyStep[] = [
  // ──────────────────────────────────────────────────────────
  {
    key: 'act1-01-biz-registration',
    act: 1,
    order: 10,
    access: 'public',
    moduleKey: 'business_registration',
    title: '사업자등록',
    goal: '사업자등록증을 손에 넣는다.',
    why:
      '쿠팡은 개인에게 판매 권한을 주지 않습니다. 사업자등록 없이는 윙 가입 자체가 안 되고, ' +
      '뒤에 나오는 통신판매업 신고도 사업자등록번호가 있어야 시작할 수 있습니다. 여기가 막히면 아무것도 못 합니다.',
    estimatedSec: 1200,
    narration: [
      '첫 단추는 사업자등록입니다.',
      '국세청 홈택스에서 온라인으로 신청할 수 있고, 수수료는 없습니다.',
      '업종은 전자상거래 소매업으로 잡으시면 됩니다. 코드는 525101입니다.',
      '사업장 주소는 집 주소로도 됩니다. 별도 사무실을 구할 필요 없습니다.',
      '신청하면 보통 하루에서 사흘 안에 나옵니다. 급하면 세무서에 직접 가면 당일에도 됩니다.',
      '등록증이 나오면 이 화면에 사진이나 PDF로 올려주세요. 사업자등록번호를 확인하고 다음으로 넘어갑니다.',
    ],
    actions: [
      { label: '홈택스 사업자등록 신청', href: 'https://www.hometax.go.kr', external: true },
      { label: '자세한 절차 보기', href: '/guide/coupang-side-job' },
    ],
    verify: {
      level: 2,
      accept: 'image',
      extract: 'bizNumber',
      hint: '사업자등록증을 올려주세요. 사업자등록번호만 확인하고 파일은 보관 기간이 지나면 지웁니다.',
      retentionDays: 90,
    },
    troubleshoot: [
      {
        symptom: '업종 코드를 뭘로 해야 할지 모르겠습니다',
        cause: '전자상거래 소매업(525101)이 표준입니다.',
        fix: '업태는 "도매 및 소매업", 종목은 "전자상거래 소매업"으로 고르세요. 나중에 추가·변경도 됩니다.',
      },
      {
        symptom: '집 주소로 해도 되나요',
        cause: '통신판매업은 사업장 실사가 없습니다.',
        fix: '집 주소로 등록해도 문제없습니다. 다만 임대차 계약서상 전대 금지 조항이 있으면 집주인 동의가 필요할 수 있습니다.',
      },
    ],
    xp: 50,
  },

  // ──────────────────────────────────────────────────────────
  {
    key: 'act1-04-wing-signup',
    act: 1,
    order: 40,
    access: 'public',
    moduleKey: 'coupang_wing_signup',
    title: '쿠팡 윙 입점',
    goal: '쿠팡 윙에 판매자로 가입하고 사업자 인증까지 끝낸다.',
    why:
      '윙 계정이 있어야 API 키가 나옵니다. 그리고 사업자 인증이 끝나지 않은 계정은 ' +
      'API 키 발급 메뉴 자체가 보이지 않습니다. 다음 스텝에서 "메뉴가 없다"고 헤매는 사람은 거의 여기서 덜 끝낸 경우입니다.',
    estimatedSec: 900,
    narration: [
      '쿠팡 윙에 판매자로 가입할 차례입니다.',
      '윙은 PC에서만 제대로 동작합니다. 모바일로 하면 중간에 막힙니다.',
      '가입할 때 사업자등록증과 통장 사본이 필요합니다. 미리 파일로 준비해두세요.',
      '정산 계좌는 반드시 사업자 명의여야 합니다. 개인 명의 계좌를 넣으면 정산이 보류됩니다.',
      '가입을 마치면 사업자 인증 심사가 걸립니다. 보통 하루 안에 끝납니다.',
      '인증이 완료되어야 다음 스텝의 API 키 발급 메뉴가 보입니다.',
    ],
    actions: [
      { label: '쿠팡 윙 열기', href: 'https://wing.coupang.com', external: true },
    ],
    verify: {
      level: 3,
      checklist: [
        '쿠팡 윙에 로그인할 수 있다',
        '사업자 인증이 "완료" 상태다',
        '정산 계좌를 사업자 명의로 등록했다',
      ],
      quiz: [
        {
          q: '정산 계좌를 개인 명의로 등록하면 어떻게 되나요?',
          choices: [
            '아무 문제 없다',
            '정산이 보류된다',
            '수수료가 올라간다',
          ],
          answer: 1,
          why: '쿠팡은 사업자 명의 계좌로만 정산합니다. 명의가 다르면 정산이 보류되고, 바꿀 때까지 돈이 묶입니다.',
        },
        {
          q: 'API 키 발급 메뉴가 안 보이는 가장 흔한 이유는?',
          choices: [
            '사업자 인증이 아직 안 끝났다',
            '상품을 아직 안 올렸다',
            '모바일로 접속했다',
          ],
          answer: 0,
          why: '인증이 끝나야 OPEN API 메뉴가 열립니다. (모바일 접속도 문제지만, 메뉴가 아예 없는 건 대부분 인증 미완료입니다.)',
        },
      ],
    },
    troubleshoot: [
      {
        symptom: '사업자 인증이 며칠째 안 끝납니다',
        cause: '제출 서류가 흐리거나 사업자등록증 정보와 입력값이 다른 경우입니다.',
        fix: '윙 알림함을 확인하세요. 보완 요청이 와 있는 경우가 대부분입니다. 상호·대표자명·주소를 등록증과 한 글자도 다르지 않게 맞추세요.',
      },
    ],
    xp: 50,
  },

  // ──────────────────────────────────────────────────────────
  {
    key: 'act1-05-api',
    act: 1,
    order: 50,
    access: 'public',
    moduleKey: 'api_integration',
    title: 'API 연동',
    goal: '메가로드가 내 쿠팡 계정에 실제로 접속된다.',
    why:
      '이게 안 되면 이 뒤의 모든 자동화가 통째로 멈춥니다. 상품 등록도, 주문 수집도, ' +
      '심지어 이 아카데미의 자동 판정도 전부 이 연결 위에서 돕니다. ' +
      '가장 중요한 스텝이고, 가장 많이 막히는 스텝입니다.',
    estimatedSec: 900,
    narration: [
      'API 키를 발급받아 연결할 차례입니다.',
      '쿠팡 윙에 로그인한 다음, 오른쪽 위 내 계정에서 마이페이지로 들어갑니다.',
      '추가판매정보 항목을 찾아 누르고, 페이지 맨 아래 오픈 API 키 발급 섹션으로 내려갑니다.',
      'API Key 발급 받기를 누르고, 팝업에서 오픈 API를 고릅니다.',
      '발급이 끝나면 업체코드, 액세스 키, 시크릿 키 세 가지가 나옵니다.',
      '시크릿 키는 이 화면을 나가면 다시 볼 수 없습니다. 지금 바로 복사해서 메모장에 붙여 넣으세요.',
      '그다음 연동 정보에서 수정을 눌러, 안내된 아이피 주소 열 개와 주소를 넣고 확인을 누릅니다.',
      '이걸 빠뜨리면 키는 발급됐는데 호출이 전부 막힙니다. 가장 흔한 실패 원인입니다.',
      '마지막으로 채널관리 화면에 세 값을 붙여 넣고, 아래 확인하기를 눌러주세요.',
      '제가 실제로 쿠팡에 한 번 물어봐서 연결이 됐는지 확인해드리겠습니다.',
    ],
    actions: [
      { label: '쿠팡 윙에서 API 키 발급', href: 'https://wing.coupang.com', external: true },
      { label: '채널관리에서 키 입력하기', href: '/megaload/channels' },
      { label: '화면별 상세 가이드 (IP 목록 포함)', href: '/my/guides?article=coupang-api-setup' },
    ],
    verify: {
      level: 1,
      probe: 'coupang.connection',
      hint: '입력한 키로 쿠팡에 실제 요청을 한 번 보내 봅니다.',
      pass: (r) => {
        if (!r.ok) {
          return { passed: false, detail: r.error || '쿠팡에 연결하지 못했습니다.' };
        }
        const connected = r.data.connected === true;
        return connected
          ? { passed: true, detail: '쿠팡 API 연결을 확인했습니다.' }
          : { passed: false, detail: String(r.data.message || '쿠팡이 인증을 거부했습니다. 키 세 값과 연동 정보(IP·URL)를 다시 확인해주세요.') };
      },
    },
    troubleshoot: [
      {
        symptom: '키를 다 넣었는데 인증에 실패합니다',
        cause: '연동 정보의 IP 주소·URL을 저장하지 않은 경우가 가장 많습니다.',
        fix: '윙 → 마이페이지 → 추가판매정보 → OPEN API 키 발급 → 연동 정보 "수정"에서 안내된 IP 10개와 URL을 넣고 확인을 누르세요.',
      },
      {
        symptom: '시크릿 키를 못 봤습니다 / 잃어버렸습니다',
        cause: '시크릿 키는 발급 직후 한 번만 보입니다.',
        fix: '기존 키를 삭제하고 새로 발급받으세요. 재발급해도 기존 상품·주문에는 영향이 없습니다.',
      },
      {
        symptom: '어제까지 되던 게 갑자기 안 됩니다',
        cause: '시크릿 키는 최대 6개월 유효합니다.',
        fix: '만료됐을 가능성이 큽니다. 윙에서 재발급받아 채널관리에 다시 입력하세요.',
      },
    ],
    xp: 100,
    badgeKey: 'first_connect',
  },

  // ──────────────────────────────────────────────────────────
  {
    key: 'act1-06-shipping',
    act: 1,
    order: 60,
    access: 'public',
    title: '출고지·반품지 등록',
    goal: '쿠팡에 출고지와 반품지가 각각 하나 이상 등록된다.',
    why:
      '상품을 등록하려면 출고지와 반품지 코드가 반드시 들어갑니다. 둘 중 하나라도 없으면 ' +
      '상품 등록이 통째로 실패합니다. 상품을 만들다가 막히지 말고 여기서 미리 끝내둡니다.',
    estimatedSec: 420,
    narration: [
      '출고지와 반품지를 등록할 차례입니다.',
      '출고지는 물건이 나가는 주소, 반품지는 고객이 돌려보내는 주소입니다.',
      '위탁판매라면 둘 다 소싱처 주소로 넣는 게 보통입니다.',
      '쿠팡 윙에서 판매자정보, 배송지 관리로 들어가 각각 하나씩 등록하세요.',
      '반품지에는 반품 택배비도 같이 설정합니다. 이 값이 나중에 반품 정산에 그대로 쓰입니다.',
      '등록을 마치면 아래 확인하기를 눌러주세요. 쿠팡에 몇 개가 등록됐는지 직접 물어보겠습니다.',
    ],
    actions: [
      { label: '쿠팡 윙 배송지 관리', href: 'https://wing.coupang.com', external: true },
    ],
    verify: {
      level: 1,
      probe: 'coupang.shippingPlaces',
      hint: '쿠팡에 등록된 출고지·반품지 목록을 조회합니다.',
      pass: (r) => {
        if (!r.ok) return { passed: false, detail: r.error || '쿠팡에서 배송지 목록을 가져오지 못했습니다.' };
        const out = Number(r.data.outboundCount || 0);
        const ret = Number(r.data.returnCount || 0);
        if (out > 0 && ret > 0) {
          return { passed: true, detail: `출고지 ${out}개, 반품지 ${ret}개를 확인했습니다.` };
        }
        const missing = [out === 0 ? '출고지' : null, ret === 0 ? '반품지' : null].filter(Boolean).join('·');
        return { passed: false, detail: `${missing}가 0개로 조회됩니다. 윙 배송지 관리에서 등록한 뒤 다시 확인해주세요.` };
      },
    },
    troubleshoot: [
      {
        symptom: '등록했는데 0개로 나옵니다',
        cause: '저장 직후에는 쿠팡 쪽 반영에 몇 분 걸릴 수 있습니다.',
        fix: '2~3분 뒤 다시 확인해보세요. 그래도 0개면 윙 화면에서 실제로 목록에 보이는지 먼저 확인하세요.',
      },
      {
        symptom: '주소를 뭘로 넣어야 할지 모르겠습니다',
        cause: '위탁판매는 내가 물건을 만지지 않습니다.',
        fix: '출고지·반품지 모두 소싱처(공급사) 주소로 넣습니다. 자체 수거를 할 생각이면 반품지만 내 주소로 두세요.',
      },
    ],
    xp: 60,
  },
];
