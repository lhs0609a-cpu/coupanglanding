/**
 * 3부 주문(6단계) · 4부 CS(5단계) 의 화면 목업.
 *
 * 1·2부와 다른 점: 여기는 **글로 쓰는 일**이 많다. 고객에게 뭐라고 쓸지가 곧 결과를 바꾼다.
 * 그래서 이 구간의 목업은 입력 폼보다 **말풍선(chat)과 문서(doc)** 를 더 많이 쓴다.
 * 그대로 복사해서 쓸 수 있는 문장을 넣어둔다 — "정중하게 쓰세요" 는 아무도 못 따라한다.
 */

import type { MockupScreen } from './types';

export const ACT34_MOCKUPS: Record<string, MockupScreen[]> = {
  // ── 16 첫 주문 읽기 ─────────────────────────────────────
  'act3-10-first-order': [
    {
      tab: '주문관리',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/orders',
      accent: 'red',
      caption:
        '고객은 쿠팡에 돈을 냈고, 물건은 아직 소싱처에 있습니다. 그 사이를 잇는 게 내 일이고, 그 일은 세 가지뿐입니다.',
      blocks: [
        {
          k: 'table',
          cols: ['주문번호', '상품', '수량', '상태'],
          rows: [
            ['3000012345678', '○○ 유산균 180정, 1개', '1', { t: '결제완료', tone: 'warn' }],
          ],
          pin: 'fo-1',
        },
        { k: 'btn', label: '주문번호를 눌러 상세 열기', variant: 'sec', align: 'left', pin: 'fo-1' },
        {
          k: 'flow',
          items: [
            { text: '① 주문 확인', state: 'now' },
            { text: '② 소싱처에 발주', state: 'todo' },
            { text: '③ 운송장 등록', state: 'todo' },
          ],
          pin: 'fo-2',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '이 셋만 기억하면 주문 처리는 끝입니다. 나머지는 쿠팡과 택배사가 합니다. 처음에 복잡해 보이는 건 순서를 모르기 때문입니다.',
        },
        {
          k: 'kv',
          items: [
            { k: '주문 상태', v: '결제완료 (ACCEPT)', tone: 'warn' },
            { k: '뜻', v: '아직 아무도 손대지 않은 주문' },
          ],
          pin: 'fo-3',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '윙에는 주문이 있는데 여기 없으면 쿠팡 API 연동이 끊긴 것입니다. 채널관리부터 확인하세요.',
        },
      ],
    },
  ],

  // ── 17 주문 확인 · 배송지 ───────────────────────────────
  'act3-20-confirm': [
    {
      tab: '주문 확인',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/orders',
      accent: 'red',
      caption:
        '확인 처리는 "이 주문을 받았고 준비를 시작한다"고 쿠팡에 알리는 절차입니다. 누르면 상태가 상품준비중으로 바뀝니다.',
      blocks: [
        { k: 'btn', label: '주문 확인 처리', variant: 'primary', align: 'left', pin: 'cf-1' },
        {
          k: 'kv',
          items: [{ k: '주문 상태', v: '결제완료  →  상품준비중', tone: 'ok' }],
        },
      ],
    },
    {
      tab: '배송지 읽기',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/orders',
      accent: 'red',
      caption:
        '여기서 읽은 그대로가 소싱처 주문서로 넘어갑니다. 전화번호 앞 세 자리와 요청사항 한 줄이 배송의 성패를 가릅니다.',
      blocks: [
        {
          k: 'kv',
          items: [
            { k: '받는 사람', v: '김○○', copy: true },
            { k: '주소', v: '서울 마포구 ○○로 5, 101동 1202호', copy: true },
            { k: '전화번호', v: '0504-1234-5678', tone: 'warn', copy: true },
          ],
          pin: 'cf-2',
        },
        {
          k: 'notice',
          tone: 'bad',
          title: '050으로 시작하면 안심번호입니다',
          text: '고객의 진짜 번호를 가려주는 임시 번호라 기간이 지나면 끊깁니다. 번호가 죽은 뒤에 보내면 택배기사가 연락을 못 해서 배송이 통째로 막힙니다. 그래서 발주를 미루면 안 됩니다.',
          pin: 'cf-3',
        },
        {
          k: 'text',
          text: '주소는 손으로 치지 말고 복사(⧉) 버튼으로 옮깁니다. 다시 타이핑하면 오타가 나고, 주소 오타는 오배송이고, 오배송은 전부 판매자 부담입니다.',
          pin: 'cf-4',
        },
        {
          k: 'field',
          label: '배송 요청사항',
          value: '공동현관 비밀번호 #1234 / 부재시 문 앞',
          state: 'ok',
          hint: '이 메모가 빠지면 배송이 실패합니다. 소싱처 주문서에 같이 넘기세요.',
          pin: 'cf-5',
        },
      ],
    },
  ],

  // ── 18 발주 ────────────────────────────────────────────
  'act3-30-purchase': [
    {
      tab: '소싱처 주문서',
      chrome: 'browser',
      brand: '소싱처 (공급사)',
      accent: 'gray',
      caption:
        '위탁판매의 핵심이 이 화면 한 장입니다. 주문자는 나, 받는 사람은 고객 — 이걸 직배송이라고 합니다.',
      blocks: [
        { k: 'btn', label: '같은 상품 주문하기', variant: 'primary', align: 'left', pin: 'pc-1' },
        {
          k: 'field',
          label: '받는 사람',
          value: '김○○  (고객)',
          state: 'ok',
          pin: 'pc-2',
        },
        {
          k: 'field',
          label: '배송 주소',
          value: '서울 마포구 ○○로 5, 101동 1202호',
          state: 'ok',
          hint: '내 주소가 아닙니다. 쿠팡에서 복사한 고객 주소 그대로입니다.',
        },
        {
          k: 'notice',
          tone: 'bad',
          title: '가장 비싼 실수',
          text: '여기에 내 주소를 넣으면 물건이 나에게 옵니다. 다시 보내야 하니 배송이 며칠 늦고, 그 사이 클레임이 들어옵니다.',
        },
        {
          k: 'field',
          label: '주문자',
          value: '○○커머스  (나 또는 내 상호)',
          state: 'ok',
          hint: '받는 사람만 고객이면 됩니다. 주문자까지 고객 이름일 필요는 없습니다.',
          pin: 'pc-3',
        },
        {
          k: 'field',
          label: '요청사항',
          value: '무지 박스로 발송 / 상호 미표기 / 거래명세서·영수증 동봉 금지',
          state: 'ok',
          pin: 'pc-4',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '보내는 사람 정보에 소싱처 상호가 찍히면 고객이 다른 가게 이름을 보고 문의합니다. 금액이 적힌 명세서가 들어가면 원가가 그대로 노출됩니다.',
        },
      ],
    },
    {
      tab: '운송장 받기',
      chrome: 'phone',
      brand: '소싱처 알림',
      accent: 'gray',
      caption: '이 번호가 있어야 다음 단계를 할 수 있습니다. 보통 몇 시간에서 하루 안에 나옵니다.',
      blocks: [
        { k: 'text', text: '주문하신 상품이 발송되었습니다.', strong: true },
        {
          k: 'kv',
          items: [
            { k: '택배사', v: 'CJ대한통운' },
            { k: '운송장 번호', v: '123456789012', tone: 'ok', copy: true },
          ],
          pin: 'pc-5',
        },
      ],
    },
  ],

  // ── 19 송장 등록 ───────────────────────────────────────
  'act3-40-invoice': [
    {
      tab: '송장 등록',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/orders',
      accent: 'red',
      caption:
        '주문 처리의 끝입니다. 택배사와 번호 둘 중 하나만 틀려도 조회가 끊기고, 조회가 끊기면 그대로 문의가 됩니다.',
      blocks: [
        { k: 'btn', label: '송장등록', variant: 'sec', align: 'left', pin: 'iv-1' },
        { k: 'select', label: '택배사', value: 'CJ대한통운', pin: 'iv-2' },
        {
          k: 'notice',
          tone: 'warn',
          text: '택배사를 잘못 고르면 조회가 안 돼서 배송 추적이 끊깁니다. 고객은 물건이 어디 있는지 모르게 되고, 그게 바로 문의로 옵니다.',
        },
        {
          k: 'field',
          label: '운송장 번호',
          value: '123456789012',
          state: 'ok',
          hint: '손으로 치지 마세요. 한 자리만 틀려도 조회가 안 됩니다. 복사해서 붙여 넣습니다.',
          pin: 'iv-3',
        },
        { k: 'btn', label: '등록', variant: 'primary', align: 'left' },
        {
          k: 'kv',
          items: [{ k: '주문 상태', v: '상품준비중  →  배송중', tone: 'ok' }],
          pin: 'iv-4',
        },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'iv-5' },
        {
          k: 'notice',
          tone: 'ok',
          title: '통과',
          text: '쿠팡 조회 결과 배송중 1건. 여기까지가 주문 처리의 끝이고, 이 뒤는 쿠팡과 택배사가 합니다.',
        },
      ],
    },
  ],

  // ── 20 품절 대응 ───────────────────────────────────────
  'act3-50-stockout': [
    {
      tab: '다른 소싱처 먼저',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/sourcing/naver',
      accent: 'red',
      caption:
        '취소가 첫 수단이 아닙니다. 같은 상품이 다른 소싱처에 있으면 거기서 발주하면 끝이고, 고객은 아무것도 모르고 물건을 받습니다.',
      blocks: [
        {
          k: 'table',
          cols: ['소싱처', '재고', '단가'],
          rows: [
            ['A 공급사 (원래 쓰던 곳)', { t: '품절', tone: 'bad' }, '9,200원'],
            ['B 공급사', { t: '재고 있음', tone: 'ok' }, '9,800원'],
          ],
          pin: 'so-1',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '단가가 조금 비싸도 취소보다 쌉니다. 취소는 판매자 점수에 남고, 쌓이면 계정 제재로 갑니다.',
        },
      ],
    },
    {
      tab: '고객 연락 · 취소',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/orders',
      accent: 'red',
      caption:
        '순서가 중요합니다. 연락이 먼저, 취소가 나중입니다. 취소를 먼저 눌러버리면 고객은 이유도 모른 채 취소 알림만 받습니다.',
      blocks: [
        {
          k: 'chat',
          items: [
            {
              who: 'me',
              text: '안녕하세요, 주문하신 상품이 공급처 품절로 발송이 어렵게 되었습니다. 불편을 드려 죄송합니다. 부득이하게 주문을 취소해 드리며, 결제 금액은 취소 후 3~5영업일 안에 환불됩니다.',
            },
          ],
          pin: 'so-2',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '통보가 아니라 사과와 안내입니다. 문장 하나 차이로 별점 1점이 남을지가 갈립니다.',
        },
        { k: 'select', label: '취소 사유', value: '품절', pin: 'so-3' },
        { k: 'btn', label: '주문 취소', variant: 'danger', align: 'left' },
        { k: 'btn', label: '이 상품 판매 중지', variant: 'danger', align: 'left', pin: 'so-4' },
        {
          k: 'notice',
          tone: 'bad',
          text: '판매 중지를 빠뜨리면 같은 품절 주문이 계속 들어옵니다. 사고가 복리로 불어나고 취소율이 쌓여 계정 제재로 갑니다.',
        },
        {
          k: 'check',
          label: '재고 감시',
          options: [{ text: '소싱처가 품절되면 미리 알림 받기', note: '사고를 막는 쪽이 수습보다 훨씬 쌉니다', on: true }],
          pin: 'so-5',
        },
      ],
    },
  ],

  // ── 21 배송 지연 ───────────────────────────────────────
  'act3-60-delay': [
    {
      tab: '출고 예정일',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      menu: { items: ['상품관리', '주문/배송', '정산', '마이페이지'], active: 1 },
      path: '주문/배송 > 출고 예정일 변경',
      accent: 'red',
      caption: '먼저 볼 것은 예정일을 바꿀 수 있는지입니다. 바꿀 수 있으면 점수 손실이 훨씬 작습니다.',
      blocks: [
        { k: 'field', label: '출고 예정일', value: '2026-10-02  →  2026-10-06', state: 'ok', pin: 'dl-1' },
      ],
    },
    {
      tab: '고객 연락',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/cs',
      accent: 'red',
      caption:
        '고객은 늦는 것보다 모르는 걸 더 싫어합니다. 먼저 연락하면 클레임이 실제로 줄어듭니다.',
      blocks: [
        {
          k: 'chat',
          items: [
            {
              who: 'me',
              text: '안녕하세요, 주문하신 상품이 공급처 사정으로 출고가 2일 정도 늦어질 예정입니다. 새 출고 예정일은 10월 6일이며, 발송되면 바로 운송장을 등록해 안내드리겠습니다. 기다려주셔서 감사합니다.',
            },
          ],
          pin: 'dl-2',
        },
        {
          k: 'table',
          cols: ['선택', '판매자 점수', '클레임'],
          rows: [
            [{ t: '먼저 알린다', tone: 'ok' }, { t: '조금 깎인다', tone: 'warn' }, { t: '줄어든다', tone: 'ok' }],
            [{ t: '말 없이 늦는다', tone: 'bad' }, { t: '깎인다', tone: 'bad' }, { t: '온다', tone: 'bad' }],
          ],
          pin: 'dl-3',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '지연 자체보다 침묵이 더 비쌉니다. 아무 말 없이 늦는 선택은 하지 않습니다.',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '같은 소싱처가 반복해서 늦으면 소싱처를 바꾸세요. 늦는 건 소싱처인데 점수는 내가 물게 됩니다.',
          pin: 'dl-4',
        },
      ],
    },
  ],

  // ── 22 고객 문의 ───────────────────────────────────────
  'act4-10-inquiry': [
    {
      tab: '미답변 목록',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/cs',
      accent: 'red',
      caption: '쌓아두면 판매자 점수에 바로 들어갑니다. 목표는 하나 — 미답변 0건.',
      blocks: [
        {
          k: 'table',
          cols: ['문의', '경과', '상태'],
          rows: [
            ['언제 도착하나요?', '6시간', { t: '미답변', tone: 'bad' }],
            ['교환 되나요?', '2시간', { t: '미답변', tone: 'bad' }],
          ],
          pin: 'iq-1',
        },
      ],
    },
    {
      tab: '답변 쓰기',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/cs',
      accent: 'red',
      caption:
        '가장 나쁜 답변은 추측입니다. 모르면 모른다고 쓰되, 반드시 "언제까지 알아보겠다"를 같이 적습니다.',
      blocks: [
        {
          k: 'chat',
          items: [
            { who: 'cs', text: '주문한 지 3일 됐는데 언제 오나요?' },
            {
              who: 'me',
              text: '문의 주셔서 감사합니다. 현재 공급처에 출고 일정을 확인 중이며, 오늘 저녁 6시까지 정확한 출고일을 다시 안내드리겠습니다.',
            },
          ],
          pin: 'iq-2',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '확인 안 된 배송일을 말했다가 어기면 그게 그대로 클레임이 됩니다. 지킬 수 있는 시간만 적으세요.',
        },
        {
          k: 'check',
          label: '템플릿으로 만들어둘 것 — 이 셋이 대부분입니다',
          options: [
            { text: '언제 오나요', on: true },
            { text: '교환 되나요', on: true },
            { text: '정품 맞나요', on: true },
          ],
          pin: 'iq-3',
        },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'iq-4' },
        {
          k: 'notice',
          tone: 'ok',
          title: '통과',
          text: '쿠팡에 직접 물어본 결과 — 미답변 0건.',
        },
      ],
    },
  ],

  // ── 23 반품 처리 ───────────────────────────────────────
  'act4-20-return': [
    {
      tab: '사유 · 비용',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/returns',
      accent: 'red',
      caption: '사유에 따라 택배비를 누가 내는지가 정해집니다. 그래서 사유부터 봅니다.',
      blocks: [
        {
          k: 'table',
          cols: ['반품 사유', '반품 택배비'],
          rows: [
            ['단순 변심', { t: '고객 부담', tone: 'ok' }],
            [{ t: '상품 하자', tone: 'warn' }, { t: '판매자 부담', tone: 'bad' }],
            [{ t: '오배송', tone: 'warn' }, { t: '판매자 부담', tone: 'bad' }],
          ],
          pin: 'rt-1',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '하자·오배송인데 고객과 다투면 대부분 손해입니다. 시간도 비용이고 점수도 깎입니다.',
        },
      ],
    },
    {
      tab: '회수 · 운송장',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/returns',
      accent: 'red',
      caption:
        '어느 쪽을 골랐든 끝은 같습니다 — 회수 운송장을 등록해야 처리가 닫힙니다. 안 닫으면 정산이 묶입니다.',
      blocks: [
        {
          k: 'radio',
          label: '회수 방법',
          options: [
            { text: '쿠팡 회수 신청', note: '쿠팡이 택배를 보내 가져온다 · 편하지만 비용이 정해져 있다' },
            {
              text: '자체 수거',
              note: '내가 택배를 불러 소싱처로 바로 보낸다 · 소싱처가 반품을 받아주면 대체로 싸고 빠르다',
              on: true,
            },
          ],
          pin: 'rt-2',
        },
        { k: 'field', label: '회수 운송장 번호', value: '987654321098', state: 'ok', pin: 'rt-3' },
        {
          k: 'notice',
          tone: 'bad',
          text: '등록을 안 하면 반품이 계속 열린 상태로 남아 정산이 묶이고 점수도 깎입니다.',
        },
        { k: 'btn', label: '확인하기', variant: 'sec', align: 'left', pin: 'rt-4' },
        { k: 'notice', tone: 'ok', title: '통과', text: '미처리 반품 0건.' },
      ],
    },
  ],

  // ── 24 막무가내 고객 ────────────────────────────────────
  'act4-30-difficult': [
    {
      tab: '기록으로 대응',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/megaload/cs',
      accent: 'red',
      caption:
        '이 단계의 요령은 하나입니다 — 감정이 아니라 기록. 전화로 하면 기록이 남지 않고, 기록이 없으면 나중에 아무것도 증명할 수 없습니다.',
      blocks: [
        {
          k: 'notice',
          tone: 'warn',
          text: '모든 대화를 쿠팡 안에서 글로 합니다. 전화로 하면 기록이 남지 않습니다.',
          pin: 'df-1',
        },
        {
          k: 'chat',
          items: [
            { who: 'cs', text: '당장 전화해요. 안 그러면 가만 안 있을 겁니다.' },
            {
              who: 'me',
              text: '문의는 쿠팡 메시지로 도와드리고 있습니다. 확인된 사실을 안내드립니다. 10월 2일 발송, 10월 4일 배송완료로 조회됩니다. 반품을 원하시면 반품 신청 절차를 안내드리겠습니다.',
            },
          ],
          pin: 'df-2',
        },
        {
          k: 'field',
          label: '답변 입력',
          value: '확인된 사실은 다음과 같습니다. 10월 2일 발송, 10월 4일 배송완료로 조회됩니다.',
          state: 'ok',
          hint: '감정은 빼고 사실과 절차만. 이 글이 나중에 그대로 기록으로 남습니다.',
          pin: 'df-2',
        },
        { k: 'btn', label: '답변 등록', variant: 'primary', align: 'left', pin: 'df-2' },
        {
          k: 'table',
          cols: ['이렇게 쓰지 말고', '이렇게 쓴다'],
          rows: [
            [
              { t: '그건 안 됩니다', tone: 'bad' },
              { t: '쿠팡 반품 규정상 단순 변심은 왕복 배송비 5,000원이 발생합니다', tone: 'ok' },
            ],
            [
              { t: '저희 잘못 아닙니다', tone: 'bad' },
              { t: '조회된 배송 기록은 다음과 같습니다', tone: 'ok' },
            ],
          ],
          pin: 'df-3',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '안 된다고 쓰는 것과 규정이 이렇다고 쓰는 것은 같은 결론이지만 전혀 다르게 읽힙니다.',
        },
        {
          k: 'notice',
          tone: 'bad',
          text: '욕설·협박이 오면 캡처하고 쿠팡 고객센터에 신고하세요. 혼자 감당하지 마세요. 신고는 정당한 절차입니다.',
          pin: 'df-4',
        },
        { k: 'btn', label: '이 대화 신고하기', variant: 'danger', align: 'left', pin: 'df-4' },
        {
          k: 'table',
          cols: ['분쟁 금액', '권하는 선택'],
          rows: [
            ['1~2만원', { t: '받아주고 끝낸다 — 시간도 비용이다', tone: 'ok' }],
            ['큰 금액', { t: '기록을 모아 절차대로', tone: 'warn' }],
          ],
          pin: 'df-5',
        },
      ],
    },
  ],

  // ── 25 내용증명 ────────────────────────────────────────
  'act4-40-brand-notice': [
    {
      tab: '받은 문서',
      chrome: 'paper',
      brand: '내용증명',
      accent: 'gray',
      caption:
        '내용증명은 소송이 아니라 "이렇게 주장한다"는 편지입니다. 받았다고 해서 진 것이 아닙니다.',
      blocks: [
        {
          k: 'doc',
          title: '내용증명',
          lines: [
            '수신 · ○○커머스',
            '발신 · △△브랜드 법무팀',
            '귀사가 판매 중인 상품은 당사의 등록상표를 무단으로 사용한 것으로 판단됩니다.',
            '본 서면 수령일로부터 7일 내 판매 중단 및 회신을 요구합니다.',
          ],
          stamp: '△△브랜드',
          pin: 'bn-1',
        },
        {
          k: 'notice',
          tone: 'bad',
          title: '가장 하면 안 되는 행동',
          text: '놀라서 잘못을 인정하는 답장을 보내는 것입니다. 그 답장이 그대로 증거가 됩니다. 먼저 사실관계부터 정리하세요.',
          pin: 'bn-2',
        },
      ],
    },
    {
      tab: '사실관계 · 회신',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/my/guides/legal-ip/ip-issue-handling',
      accent: 'red',
      caption:
        '정품을 사서 되판 것이라면 상표권 침해가 아닐 수 있습니다(대법원 2002다42322 취지). 금지되는 것은 공식 대리점·독점 총판 같은 표현으로 사칭하는 행위입니다.',
      blocks: [
        {
          k: 'check',
          label: '먼저 확인할 것',
          options: [
            { text: '정식 유통 경로에서 구매한 진정상품(진짜)인가', on: true },
            { text: '구매 영수증·거래명세서가 남아 있는가', on: true },
            { text: '"공식 대리점"·"독점 총판" 같은 표현을 쓴 적이 있는가', note: '썼다면 이건 별개의 문제입니다' },
          ],
          pin: 'bn-3',
        },
        {
          k: 'doc',
          title: '회신문 (초안)',
          lines: [
            '당사는 정식 유통 경로에서 구매한 진정상품을 판매하였습니다.',
            '따라서 귀사의 주장을 인정하지 않습니다.',
            '다만 분쟁을 확대하지 않기 위한 선의의 조치로, 해당 상품의 판매를 잠정 중단하였습니다.',
          ],
          pin: 'bn-4',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '행동은 빠르게, 인정은 하지 않는 것입니다. 중단이 잘못을 인정하는 뜻이 아니라는 점을 문서에 분명히 적습니다.',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '금액이 크거나 형사 고소가 언급되면 변호사에게 확인하세요. 사건마다 사실관계가 다릅니다 — 위 판례가 내 사건에 그대로 적용된다고 단정하지 마세요.',
          pin: 'bn-5',
        },
      ],
    },
  ],

  // ── 26 쿠팡 제재 ───────────────────────────────────────
  'act4-50-coupang-penalty': [
    {
      tab: '범위부터 구분',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      accent: 'red',
      caption:
        '상품 단위인지 계정 단위인지에 따라 할 일이 완전히 달라집니다. 통보 화면에서 이것부터 읽습니다.',
      blocks: [
        {
          k: 'table',
          cols: ['범위', '흔한 원인', '할 일'],
          rows: [
            [
              { t: '상품 단위', tone: 'warn' },
              '지식재산권 신고 · 금지어 · 인증서류 미비',
              '그 상품만 내리고 고친다 (다른 상품은 영향 없음)',
            ],
            [
              { t: '계정 단위', tone: 'bad' },
              '판매자 점수 · 반복 취소 · 배송 지연 누적',
              '소명 + 원인 제거',
            ],
          ],
          pin: 'cp-1',
        },
        {
          k: 'notice',
          tone: 'info',
          text: '계정 단위는 하루아침에 생기지 않습니다. 쌓인 점수가 원인이고, 경고가 먼저 옵니다.',
          pin: 'cp-2',
        },
      ],
    },
    {
      tab: '소명서',
      chrome: 'browser',
      brand: '쿠팡 윙',
      url: 'wing.coupang.com',
      accent: 'red',
      caption: '내용을 고민하기 전에 날짜부터 봅니다. 기한을 넘기면 소명 기회 자체가 사라집니다.',
      blocks: [
        {
          k: 'kv',
          items: [{ k: '소명 기한', v: '2026-10-05  (3일 남음)', tone: 'bad' }],
          pin: 'cp-3',
        },
        {
          k: 'doc',
          title: '소명서',
          lines: [
            '1. 사실 — 9월 중 2건의 주문이 공급처 품절로 취소되었습니다.',
            '2. 개선 — 해당 상품의 판매를 중지하고 재고 감시를 설정했습니다.',
            '3. 재발방지 — 발주 전 재고 확인을 절차에 넣고, 품절 알림을 받도록 했습니다.',
          ],
          pin: 'cp-4',
        },
        { k: 'btn', label: '소명서 제출', variant: 'primary', align: 'left', pin: 'cp-4' },
        {
          k: 'notice',
          tone: 'info',
          text: '무엇이 잘못됐고, 어떻게 고쳤고, 재발을 어떻게 막을지. 이 셋만 적습니다 — 감정은 넣지 않습니다.',
        },
      ],
    },
    {
      tab: '페널티 트래커',
      chrome: 'browser',
      brand: '메가로드',
      url: 'megaload.co.kr/my/penalty',
      accent: 'red',
      caption: '계정 제재에는 예고가 있습니다. 보고 있으면 오기 전에 막을 수 있습니다.',
      blocks: [
        { k: 'btn', label: '페널티 트래커 열기', variant: 'sec', align: 'left', pin: 'cp-5' },
        {
          k: 'gauges',
          items: [
            { label: '주문이행 점수', pct: 92, tone: 'ok' },
            { label: '정시출고율', pct: 78, tone: 'warn' },
            { label: '취소율 (낮을수록 좋음)', pct: 41, tone: 'bad' },
          ],
          pin: 'cp-5',
        },
        {
          k: 'notice',
          tone: 'warn',
          text: '빨간 게이지가 제재로 가는 길입니다. 여기를 정기적으로 보는 것이 소명서를 쓰는 것보다 싸게 끝납니다.',
        },
      ],
    },
  ],
};
