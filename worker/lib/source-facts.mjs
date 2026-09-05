/**
 * 판매자가 밝힌 **사실**만 뽑아 상세글 생성 재료로 만든다.
 * ---------------------------------------------------------------------------
 * 왜 필요한가(2026-08-19 진단): 상세글 프롬프트는 "이 상품만의 차별점을 구체적으로 써라"고
 * 강하게 지시하는데, 정작 넣어주는 재료는 **상품명·카테고리·옵션명**뿐이었다. 쓸 재료가
 * 없으니 모델은 카테고리 일반론("신선하고 맛있어요")으로 흐를 수밖에 없다. 그런데 소싱
 * 단계에서 이미 받아 둔 것이 있다 — 판매자 상세글 원문(573~4,536자)과 고시정보(품목·원산지·
 * 중량·소비기한). 이게 통째로 버려지고 있었다.
 *
 * 설계 원칙 셋:
 *   ① **베끼지 않는다.** 원문을 그대로 넘기면 모델이 문장을 가져다 쓴다 — 저작권 문제이고,
 *      대량 등록 시 상품 간 문서가 비슷해져 채널 정책에도 걸린다. 그래서 문장이 아니라
 *      **사실 조각**(숫자·산지·보관법·인증)만 뽑아 짧은 목록으로 준다.
 *   ② **LLM 을 쓰지 않는다.** 요약에 모델을 부르면 상품당 1콜이 늘어 생성이 느려진다.
 *      규칙 기반 추출이라 비용이 0 이다.
 *   ③ **압축한다.** 원문을 통째로 넣으면 입력 토큰이 커져 로컬 GPU 에서 눈에 띄게 느려진다.
 *      상한을 두고 정보 밀도가 높은 문장만 고른다.
 */

/** 사실이 담겼을 확률이 높은 신호 — 숫자·단위·산지·보관·인증. */
const FACT_HINTS = [
  'kg', 'g)', 'ml', 'L)', '개입', '과', '봉', '박스', '팩', '세트',
  '산지', '원산지', '국내', '수확', '재배', '농장', '직송', '당도', 'brix', '브릭스',
  '보관', '냉장', '냉동', '실온', '유통기한', '소비기한', '신선',
  '인증', 'HACCP', 'GAP', '무농약', '친환경', '특허',
  '포장', '아이스', '스티로폼', '완충', '택배', '배송',
];

/** 사실이 아니라 판매자 홍보·안내인 문장 — 재료로 쓰면 글이 광고가 된다. */
const NOISE_HINTS = [
  '이벤트', '할인', '쿠폰', '적립', '리뷰 작성', '포토리뷰', '문의', '톡톡', '고객센터',
  '카카오', '네이버페이', '단골', '찜', '알림받기', '구매하기', '클릭', '바로가기',
  '주문폭주', '품절임박', '마감', '한정', '무료배송', '당일발송', '누적판매',
  // 판매자 자기소개·수상 홍보 — 사실처럼 보이지만 상품 얘기가 아니다(실측: "2025KCIA
  // 한국소비자산업평가 …", "총 5가지 항목을 기준으로 평가", 스토어 주소가 그대로 딸려 왔다).
  '안녕하세요', '입니다~', '스토어', 'smartstore', 'naver.com', '전문점', '브랜드입니다',
  '평가', '선정', '수상', '대상', '1위', '인기상품', '베스트', '추천상품',
  '감사합니다', '드립니다', '문의주', '카톡', '전화', '상담',
];

/** 고시정보 값이 사실상 비어 있는 경우 — 넣어 봐야 글감이 안 된다. */
const EMPTY_NOTICE = [
  '상세페이지', '상세 페이지', '상품상세', '참조', '표기', '고지', '해당사항 없음', '해당없음',
  '확인어려움', '확인 어려움', '별도표기', '기재', '없음', '미표기',
];

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * 상세글 원문에서 사실 문장만 골라낸다.
 * 문장을 그대로 쓰는 게 아니라 **모델에게 줄 힌트 목록**이라, 짧게 자르는 편이 낫다.
 */
function factsFromDescription(text, { max = 8, maxLen = 60 } = {}) {
  const body = clean(text);
  if (body.length < 20) return [];

  // 판매자 글은 줄바꿈이 사라진 채로 오는 경우가 많아 마침표만으로는 안 갈린다.
  // 문장부호와 함께 "숫자+단위 앞" 같은 자연 경계도 쓴다.
  const parts = body
    .split(/(?<=[.!?])\s+|[·▶■◆●※]|\s{2,}/)
    .map(clean)
    .filter((s) => s.length >= 6 && s.length <= 120);

  const picked = [];
  const seen = new Set();
  for (const s of parts) {
    const low = s.toLowerCase();
    if (NOISE_HINTS.some((n) => s.includes(n))) continue;
    const hits = FACT_HINTS.filter((h) => low.includes(h.toLowerCase())).length;
    // ★ "숫자가 있으면 사실"은 너무 헐거웠다 — 수상 연도·평가 항목 수까지 통과했다(실측).
    //   **숫자에 단위가 붙어 있을 때**만 스펙으로 본다(2kg, 500ml, 20과, 3~5kg).
    const hasSpec = /\d+\s*(kg|g|ml|l|개|과|봉|박스|팩|입|미|cm|mm|brix|브릭스|도)/i.test(s)
      || /\d+\s*~\s*\d+\s*(kg|g|개|과)/i.test(s);
    if (!hasSpec && hits < 2) continue;
    // 마케팅 형용사만 있는 문장은 사실이 아니다.
    if (!hasSpec && /^[[(]|맛있|최고|최상|프리미엄|명품|특별한|완벽/.test(s)) continue;
    const key = s.slice(0, 18);
    if (seen.has(key)) continue;      // 판매자 글은 같은 문구를 여러 번 반복한다
    seen.add(key);
    picked.push(s.length > maxLen ? `${s.slice(0, maxLen)}…` : s);
    if (picked.length >= max) break;
  }
  return picked;
}

/** 고시정보 — 이미 검증된 사실이라 가장 신뢰도가 높다. */
function factsFromNotice(notice, { max = 6 } = {}) {
  const view = notice?.productInfoProvidedNoticeView;
  const basic = view?.basic;
  if (!basic || typeof basic !== 'object') return [];

  // 상세글에 쓸 만한 항목만 — 반품주소·판매자정보 같은 건 글감이 아니다.
  const USEFUL = ['품목', '명칭', '용량', '중량', '수량', '크기', '원산지', '생산자',
    '소비기한', '유통기한', '보관', '포장', '등급', '당도'];
  const out = [];
  for (const [k, v] of Object.entries(basic)) {
    if (!USEFUL.some((u) => k.includes(u))) continue;
    let val = v;
    if (val && typeof val === 'object') {
      // 중첩된 경우(포장단위별 …)는 값이 있는 첫 항목만.
      val = Object.values(val).find((x) => typeof x === 'string' && x.trim());
    }
    const s = clean(val);
    // "상세페이지 참조" 류는 값이 아니라 **값이 없다는 말**이다.
    if (!s || EMPTY_NOTICE.some((e) => s.includes(e))) continue;
    out.push(`${clean(k).slice(0, 24)}: ${s.slice(0, 40)}`);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 상세글 생성에 넣을 사실 목록.
 * @param {object} pj  product.json (description / providedNotice 를 들고 있다)
 * @returns {string[]} 짧은 사실 조각들. 없으면 빈 배열 — 그때는 예전과 똑같이 동작한다.
 */
/**
 * 구매자 후기에서 **자주 나오는 포인트**만 뽑는다.
 * ★ 문장을 그대로 쓰지 않는다 — 남의 글이고, 그대로 옮기면 후기 도용이다. 여러 후기에
 *   반복 등장하는 짧은 표현만 골라 "사람들이 이런 말을 자주 한다"는 힌트로 넘긴다.
 */
export function reviewPoints(reviews = [], { max = 5 } = {}) {
  const list = (reviews || []).filter((r) => r && typeof r.text === 'string');
  if (!list.length) return [];
  // 좋은 후기 위주 — 낮은 별점은 상세글 재료로 쓰면 역효과다(불만은 판매자가 답할 영역).
  const good = list.filter((r) => (r.score || 5) >= 4);
  const sentences = [];
  for (const r of (good.length ? good : list)) {
    const flat = String(r.text).split(String.fromCharCode(10)).join(' ');
    // 후기는 마침표를 잘 안 쓴다 — 한국어 종결어미 뒤에서도 끊는다.
    //   "알이 굵고 신선해요 포장도 꼼꼼해요" → 두 문장으로. 안 그러면 통째로 길어져
    //   길이 제한에 걸리고, 반복 표현을 영영 못 찾는다(실측: 추출 0건).
    for (const s of flat.split(/[.!?~]|(?<=[요죠])\s+/)) {
      const t = clean(s);
      if (t.length >= 6 && t.length <= 30) sentences.push(t);
    }
  }
  // 같은 말이 여러 후기에 나오면 그게 이 상품의 진짜 강점이다.
  const freq = new Map();
  for (const t of sentences) {
    const key = t.replace(/[^가-힣0-9]/g, '').slice(0, 8);
    if (key.length < 4) continue;
    const cur = freq.get(key) || { n: 0, sample: t };
    cur.n += 1;
    freq.set(key, cur);
  }
  return [...freq.values()]
    .filter((v) => v.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((v) => `후기에 자주 나오는 말: "${v.sample}"`);
}

export function buildSourceFacts(pj = {}) {
  const facts = [
    ...factsFromNotice(pj.providedNotice),
    ...factsFromDescription(pj.description),
    ...reviewPoints(pj.sourceReviews),
  ];
  // 중복 제거 + 총량 제한. 여기가 길어지면 입력 토큰이 늘어 생성이 느려진다.
  const seen = new Set();
  const out = [];
  for (const f of facts) {
    const key = f.slice(0, 16);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= 10) break;
  }
  return out;
}
