/**
 * 완벽 상세페이지 생성 (로컬 LLM) — "한 번 호출 = 완벽한 결과" 보장.
 * ---------------------------------------------------------------------------
 * 전략: 생성 → 자동 검증(카테고리 정합·순한국어·SEO·구매욕 구조·금지어·반복·길이)
 *       → 실패 시 "직전 문제"를 교정 지시로 주입해 재생성. 통과할 때까지(최대 maxAttempts).
 * 호출자(runContent / 오프라인 16k 사전생성)는 이 함수만 부르면 된다.
 */

import { generate } from './local-llm.mjs';
import { buildDetailPrompt, pickPersona, categoryKind, leafForms, specTokens } from './ai-prompts.mjs';

// 카테고리에 맞지 않는 감각 표현 = 환각(실측: 발아현미에 "과즙 같은 촉촉함"·"베어 물면 아삭",
//   혼합곡에 "고급 포도"·"꽉 찬 과육"·"한 방울"·"향긋한 캡슐"). 먹는 상품 아닌데 맛·식감을,
//   과일/즙류가 아닌데 과일명·과즙·과육·방울·캡슐을 쓰면 하드 재생성.
const EATING_WORDS = ['과즙', '베어 물', '베어물', '아삭', '사각거', '새콤', '달큰', '먹어보', '한 입', '한입', '씹어', '베어 무'];
// 생과일/액체 특유 표현 + 대표 과일명 — 마른 곡물·건조식품 등에 나오면 환각.
const FRUIT_WORDS = ['과즙', '과육', '베어 물', '베어물', '베어 무', '사각거', '한 방울', '방울로', '방울이', '캡슐', '즙이 흘', '포도', '사과', '딸기', '수박', '참외', '복숭아', '자두', '체리', '블루베리', '망고', '오렌지', '자몽'];
// 즙·주스·잼·청 등 액체/과일가공 카테고리면 과일 표현이 정상 → 예외.
function isJuiceLike(categoryPath, leaf) {
  return /음료|주스|과즙|즙\b|청\b|잼|시럽|스무디|에이드|과일가공|생과일|과일\b/.test(`${leaf} ${categoryPath}`);
}
/** @returns {string[]} 감각 불일치 이슈(하드) */
function detectSensoryMismatch(text, kind, categoryPath = '', leaf = '') {
  const t = String(text || '');
  const out = [];
  const eating = new Set(['fruit', 'food', 'pet']); // 먹는 상품 계열
  if (!eating.has(kind)) {
    const hit = EATING_WORDS.filter((w) => t.includes(w));
    if (hit.length) out.push(`먹는 상품이 아닌데 맛·식감 표현(${[...new Set(hit)].slice(0, 3).join(', ')})이 들어갔다. 이 상품 종류에 맞는 감각(촉감·무게·향·사용감 등)으로 바꿔라.`);
  } else if (kind !== 'fruit' && !isJuiceLike(categoryPath, leaf)) {
    const hit = FRUIT_WORDS.filter((w) => t.includes(w));
    if (hit.length) out.push(`이 상품은 과일·즙류가 아닌데 생과일 표현(${[...new Set(hit)].slice(0, 3).join(', ')})이 들어갔다. 실제 이 상품의 냄새·씹는 식감·풍미로 바꿔라(없는 과일·과즙을 지어내지 말 것).`);
  }
  return out;
}

// ── 딴 물건 환각 검출 ────────────────────────────────────────────────────
//   실측 사고(2026-08-21): "기능성 쌀 혼합곡 18곡 4kg" 상세글이 처음부터 끝까지
//   **물통 후기**로 나갔다 — "냉수통 1L", "냉수통을 손질하려면 물로 한번 헹구는 것만으로도".
//   카테고리 판정(food)도, 금지어도, 과일어휘 검사도 전부 통과했다. 잡을 규칙이 없었던 것이다.
//   원인은 둘: ① 핵심 특징이 비어 있어 모델이 근거 없이 자유연상했고 ② 문체 예시(home)의
//   "올려놓고 써보니 / 물로 헹구면 끝" 장면이 통째로 옮겨오면서 주어까지 갈아치웠다.
//
//   → 일반 규칙으로 잡는다: **본문에서 가장 자주 불리는 물건이 이 상품이 아니면 환각이다.**
//     상품 어휘(상품명·특징·판매자 사실·카테고리)에 없는 한글 명사가, 상품 이름보다 더 자주
//     주어·목적어로 등장하면 그건 다른 상품 이야기다.

/** 조사 — 어절 끝에서 떼어내 명사 원형을 얻는다. 긴 것부터 떼야 '보다는'이 '보'로 안 남는다. */
const JOSA = [
  '에서는', '에게는', '으로는', '이라는', '이라도', '까지는', '부터는', '에서도', '으로도',
  '에서', '에게', '으로', '이라', '라는', '까지', '부터', '보다', '처럼', '조차', '마저',
  '밖에', '이나', '이란', '한테', '든지',
  '을', '를', '이', '가', '은', '는', '의', '에', '도', '와', '과', '만', '나', '랑', '로',
];
/** 주어·목적어 표지 — 이게 붙어야 "이야기의 대상"이다(부사구는 제외). */
const SUBJ_OBJ = new Set(['을', '를', '이', '가', '은', '는']);

/**
 * 후기 글에 자연스럽게 나오는 배경어 — 상품으로 오인하면 안 된다.
 * 넉넉하게 잡는다: 헛돈 재생성 한 번보다 환각 한 건 놓치는 편이 낫다는 뜻이 아니라,
 * 진짜 환각(냉수통)은 이 목록에 없기 때문에 넉넉해도 검출력이 안 떨어진다.
 */
const AMBIENT_NOUNS = new Set([
  // 거래·배송
  '상품', '제품', '물건', '가격', '배송', '택배', '상자', '박스', '포장', '봉지', '비닐', '지퍼백',
  '구매', '재구매', '주문', '선물', '판매자', '업체', '브랜드', '회사', '고객', '서비스', '문의', '답변',
  // 사람·시간
  '우리', '아이', '애들', '엄마', '아빠', '가족', '친구', '남편', '아내', '사람', '손님', '어른',
  '아침', '점심', '저녁', '하루', '시간', '요즘', '예전', '나중', '지금', '매일', '며칠', '한번', '처음',
  // 장소·가구
  '집안', '주방', '부엌', '냉장고', '냉동실', '식탁', '테이블', '선반', '서랍', '거실', '베란다', '싱크대',
  // 추상·평가
  '생각', '느낌', '정도', '부분', '경우', '때문', '다음', '이번', '마음', '만족', '후기', '리뷰',
  '문제', '방법', '필요', '이유', '자리', '공간', '크기', '무게', '색상', '모양', '냄새', '향기',
  '식감', '종류', '가지', '하나', '여러', '얼마', '그것', '이것', '저것', '기분', '걱정', '고민',
  '실패', '성공', '차이', '장점', '단점', '효과', '결과', '상태', '품질', '가성비', '온도', '습도',
  '소리', '소음', '촉감', '질감', '두께', '길이', '높이', '너비', '디자인', '스타일', '사진', '화면',
  // 행위
  '사용', '요리', '반찬', '식사', '간식', '손질', '세척', '보관', '청소', '관리', '준비', '정리',
  '마무리', '확인', '설명', '기대', '추천', '가족들', '물기', '한컵', '한줌',
]);

/** 어절에서 조사를 떼어 명사 원형을 얻는다. @returns {[stem, josa]|null} */
function stripJosa(word) {
  let w = String(word || '').replace(/[^가-힣]/g, '');
  if (!w) return null;
  for (const j of JOSA) {
    if (w.length > j.length + 1 && w.endsWith(j)) return [w.slice(0, -j.length), j];
  }
  return [w, ''];
}

/**
 * 본문의 "주인공"이 이 상품이 아니면 환각으로 본다.
 * @param {string} text
 * @param {{leafCount:number, vocab:string, leafVariants:string[]}} o
 *   leafCount  상품 이름이 본문에 나온 횟수(countLeaf 결과)
 *   vocab      이 상품이 아는 말 전부(상품명·원본명·특징·판매자 사실·카테고리)
 * @returns {string[]} 하드 이슈(0개 또는 1개 — 가장 심한 것 하나만 지적해 교정지시를 흐리지 않는다)
 */
function detectForeignSubject(text, { leafCount = 0, vocab = '', leafVariants = [] } = {}) {
  const t = String(text || '');
  const flatVocab = String(vocab || '').replace(/\s+/g, '');
  const counts = new Map();   // stem → {n, so}  (so = 주어/목적어로 쓰인 횟수)

  for (const word of t.split(/[\s,.!?~…"'()\[\]-]+/)) {
    const r = stripJosa(word);
    if (!r) continue;
    const [stem, josa] = r;
    if (stem.length < 2 || stem.length > 7) continue;
    if (AMBIENT_NOUNS.has(stem)) continue;
    // 이 상품이 아는 말이면 환각이 아니다(부분 포함 양방향 — '혼합곡'/'곡물' 처럼 걸쳐 있어도 통과)
    if (flatVocab.includes(stem)) continue;
    if (leafVariants.some((v) => v && (stem.includes(v) || v.includes(stem)))) continue;
    const c = counts.get(stem) || { n: 0, so: 0 };
    c.n += 1;
    if (SUBJ_OBJ.has(josa)) c.so += 1;
    counts.set(stem, c);
  }

  // 판정: 상품 이름보다 자주 불리고(> leafCount), 세 번 이상 나오고, 주어·목적어로 두 번 이상 쓰인 말.
  //   셋을 다 넘겨야 "글의 주인공"이다 — 스쳐 지나가는 소품은 여기까지 오지 않는다.
  //
  // ⭐ + "상품이 제대로 불린 글은 봐준다" (실측 2026-08-25, 코퍼스 24건).
  //    바디로션 글의 "피부", 차량 거치대 글의 "스마트폰"이 딴 물건으로 찍혀 3회 재생성을
  //    유발했다. 둘 다 딴 물건이 아니라 **그 상품이 작용하는 대상**이다 — 로션 후기가 피부
  //    얘기를, 거치대 후기가 스마트폰 얘기를 안 할 수는 없다. 어휘 목록으로 막으면 카테고리마다
  //    끝없이 늘어나므로, 원래의 사고(냉수통)와 구분되는 **구조적 차이**로 가른다:
  //      · 진짜 환각(냉수통) = 상품 이름이 본문에 거의 안 나온다(글이 통째로 남의 물건 후기).
  //      · 대상 명사(피부·스마트폰) = 상품 이름이 4~7회 멀쩡히 나온다.
  //    그래서 상품 이름이 3회 이상 제대로 불린 글은 이 검사에서 빼 준다.
  //    ⚠️ "몇 배 이상 압도하면 그래도 잡는다" 식의 배수 안전망은 두지 않았다 — 로션 글에서
  //       피부가 상품명보다 네 배 나오는 건 정상이라 배수로는 정상글과 환각을 못 가른다.
  //       내용이 딴 데로 새는 경우는 스펙 조작·과일 어휘·카테고리 어휘 검사가 따로 잡는다.
  let worst = null;
  for (const [stem, c] of counts) {
    if (c.n < 3 || c.so < 2 || c.n <= leafCount) continue;
    if (leafCount >= 3) continue;
    if (!worst || c.n > worst.c.n) worst = { stem, c };
  }
  if (!worst) return [];
  return [`이 상품이 아닌 다른 물건("${worst.stem}")을 상품인 것처럼 ${worst.c.n}번 썼다. `
    + `이 글의 주인공은 오직 이 상품 하나다 — "${worst.stem}"를 전부 지우고, 이 상품 자체를 쓴 경험만 다시 써라.`];
}

/**
 * 스펙 단위 — ai-prompts.specTokens 의 목록과 같아야 한다(같은 문자열을 양쪽에서 판정한다).
 * ⚠️ 이 상수가 **없어서** detectFabricatedSpecs 가 호출되는 순간 ReferenceError 로 죽었다.
 *    validateDetail → generatePerfectDetail → generateAllFields 사이에 try 가 없어, 상품명에
 *    숫자+단위가 있는 상품(식품 대부분)은 **생성이 통째로 실패**했고 3건 연속이면 배치가
 *    중단됐다(ai-batch ABORT_AFTER_CONSECUTIVE). 긴 단위를 앞에 둬야 '개입'이 '개'로 잘리지 않는다.
 */
const UNITS = 'kg|g|ml|l|리터|개입|개|입|팩|곡|매|정|포|구|병|캔|봉|세트|장|인용|단|겹|칸|권|족|미';

/**
 * 지어낸 스펙 검출 — 상품명에 있는 단위와 **같은 단위인데 값이 다른** 수치를 잡는다.
 * ---------------------------------------------------------------------------
 * 실측 사고: 4kg 상품 상세글에 "15kg를 시켜도 무르지 않아서"가 실렸다. 프롬프트에 예로 들어둔
 *   숫자를 모델이 그대로 베낀 것이다(문체 예시를 베껴 냉수통을 지어낸 것과 같은 사고).
 *   중량·용량은 틀리면 허위표시라 그냥 넘길 수 없다.
 *
 * 왜 "같은 단위, 다른 값"만 잡나:
 *   "4kg을 500g씩 소분했어요" 처럼 단위가 다른 수치는 실제 후기에서 자연스럽게 나온다.
 *   반면 같은 단위로 다른 값을 말하면 그건 이 상품의 스펙을 잘못 말한 것이다 — 오탐이 거의 없다.
 *
 * @param {string} text
 * @param {string[]} specs   상품명에서 뽑은 스펙 토큰(specTokens 결과: ["18곡","4kg"])
 * @param {string} vocab     판매자가 밝힌 사실까지 포함한 이 상품의 말(여기 있는 수치는 근거가 있다)
 * @returns {string[]} 하드 이슈(최대 1개)
 */
function detectFabricatedSpecs(text, specs = [], vocab = '') {
  const parse = (s) => {
    const m = String(s).match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
    return m ? { v: m[1], u: m[2].toLowerCase() } : null;
  };
  // 상품명 스펙을 단위별로 모은다: kg → {"4"}
  const allowed = new Map();
  for (const sp of specs) {
    const p = parse(sp);
    if (!p) continue;
    if (!allowed.has(p.u)) allowed.set(p.u, new Set());
    allowed.get(p.u).add(p.v);
  }
  if (allowed.size === 0) return [];

  const flatVocab = String(vocab || '').replace(/\s+/g, '').toLowerCase();
  // ⚠️ 단위 뒤에 조사가 붙는다("15kg를"). 단위를 명시하지 않으면 'kg를'까지 단위로 먹어
  // ⚠️ 뒤따르는 한글 조사("15kg를")를 lookahead 로 막으면 **아무것도 안 잡힌다** — 한국어는
  //    수치 뒤에 늘 조사가 붙기 때문이다. 영문자만 막아 kg 가 kgf 로 이어지는 것만 걸러낸다.
  //   ⚠️ 정규식은 **문자열 리터럴**로 만든다 — '\d' 는 작은따옴표 안에서 그냥 'd' 라서
  //      \\d 로 써야 한다(예전 코드는 'd+' 를 찾고 있었다).
  const found = String(text || '').match(new RegExp('\\d+(?:\\.\\d+)?\\s*(?:' + UNITS + ')(?![a-zA-Z])', 'gi')) || [];
  for (const raw of found) {
    const p = parse(raw.replace(/\s+/g, ''));
    if (!p || !allowed.has(p.u)) continue;              // 상품명에 없는 단위는 보지 않는다
    if (allowed.get(p.u).has(p.v)) continue;            // 상품명에 그대로 있는 값 → 정상
    if (flatVocab.includes(`${p.v}${p.u}`)) continue;   // 판매자가 밝힌 사실에 있으면 정상
    // ⭐ **상품 스펙보다 큰 값만** 잡는다. 같은 단위의 더 작은 수치는 실제 후기에서 자연스럽다
    //    ("4kg을 1kg씩 소분했어요"). 반면 더 큰 값은 이 상품에 없는 용량을 말한 것이다
    //    (실측 사고: 4kg 상품 상세글의 "15kg를 시켜도"). 이 구분이 없으면 소분 문장마다
    //    헛돈 재생성이 걸린다 — 재생성 1회는 상세글 1개 값(800토큰)이다.
    const maxAllowed = Math.max(...[...allowed.get(p.u)].map(Number).filter(Number.isFinite));
    if (Number.isFinite(maxAllowed) && Number(p.v) < maxAllowed) continue;
    const right = [...allowed.get(p.u)].map((v) => `${v}${p.u}`).join(', ');
    return [`이 상품에 없는 수치("${p.v}${p.u}")를 썼다. 이 상품은 ${right}다 — 상품명에 적힌 수치만 쓰고, `
      + `예시에 있던 숫자를 베끼지 마라(중량·용량을 다르게 쓰면 허위표시가 된다).`];
  }
  return [];
}

const BLOCK_TYPE_ORDER = [
  'hook', 'problem', 'agitation', 'solution', 'benefits_grid',
  'feature_detail', 'usage_guide', 'social_proof', 'urgency', 'cta',
];

// 표준 단위/약어 — 영어 문장 검사에서 면제
const ALLOWED_LATIN = new Set([
  'usb', 'led', 'hdmi', 'lcd', 'oled', 'ml', 'kg', 'cm', 'mm', 'wifi', 'wi', 'fi',
  'bt', 'tv', 'pc', 'ssd', 'hdd', 'ai', 'uv', 'pd', 'qc', 'ip', 'ips', 'rgb', 'pet',
  'ph', 'spf', 'abs', 'pp', 'pvc', 'kf', 'kc',
]);

// 재시도를 유발하는 "심각 금지어" — 의학적 단정·허위인증·근거없는 절대 표현.
const HARD_BANNED = [
  '치료', '완치', '항암', '면역력 증진', '면역력증진', '부작용 없', '부작용없',
  '100% 효과', '100%효과', '1위', '넘버원', 'NO.1', '유일무이', '의학적', '임상시험',
  'FDA', '식약처 인증', '효과만점', '완벽 보장', '평생 ', '디톡스', '만병',
];

// 계정 리스크 어휘(2026-07-29 셀러 제보) — 광고법 위반 누적 → 계정 정지.
//   상세글은 "지우면 비문"이 되므로 삭제가 아니라 **재생성**으로 없앤다.
//   ⚠️ HARD_BANNED 는 단순 includes 라 여기에 넣으면 "중국산"·"고로쇠수액" 까지 걸려 재생성이 헛돈다.
//      앞에 한글이 붙지 않은 단독 표기만 잡도록 정규식으로 분리한다(웹 compliance-filter 와 동일 규칙).
const HARD_BANNED_RE = [
  [/(?<![가-힣])유기농/, '유기농'],
  [/(?<![가-힣])국산/, '국산'],
  [/(?<![가-힣])국내산/, '국내산'],
  [/(?<![가-힣])포도당/, '포도당'],
  [/(?<![가-힣])수액/, '수액'],
];

// 광고체 최상급 — 재시도 대신 자동 순화(쿠팡 표시광고 안전 + 카피 에너지 유지).
// 광고 상투구 중 **명사구 자리만 바꾸면 문법이 그대로인 것**만 치환한다.
//   문장 구조를 건드리는 상투구("활력을 불어넣", "그 이상의 가치")는 여기서 손대면 비문이 되므로
//   soft 경고로만 남긴다 — 기계가 확실히 고칠 수 있는 것만 기계가 고친다는 원칙.
function softenAdCliches(text) {
  return String(text || '')
    .replace(/풍성한 식탁/g, '든든한 밥상')
    .replace(/(완벽한|탁월한|소중한|현명한) 선택/g, '괜찮은 선택')
    .replace(/후회하지 않으실/g, '만족하실')
    .replace(/후회 없으실/g, '만족하실');
}

function softenSuperlatives(text) {
  return String(text || '')
    .replace(/최상의/g, '뛰어난').replace(/최고의/g, '뛰어난').replace(/최강의/g, '강력한')
    .replace(/최상급/g, '고급').replace(/최고급/g, '고급').replace(/최첨단/g, '첨단')
    .replace(/업계\s*최고/g, '믿을 수 있는').replace(/세계\s*최고/g, '뛰어난')
    .replace(/최상/g, '우수').replace(/최강/g, '강력').replace(/최고/g, '우수')
    .replace(/최저가/g, '합리적인 가격').replace(/가장 저렴/g, '합리적인 가격');
}

/** 1글자 한글 leaf 는 독립 토큰으로, 2글자+ 는 부분문자열로 존재 판정. */
function leafInText(leaf, text) {
  if (!leaf) return true;
  if (leaf.length >= 2) return text.includes(leaf);
  if (/[가-힣]/.test(leaf)) {
    const esc = leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}([^가-힣A-Za-z0-9]|$)`).test(text);
  }
  return text.includes(leaf);
}

/** leaf 노출 횟수 — SEO 검사용. */
function countLeaf(leaf, text) {
  if (!leaf) return 0;
  if (leaf.length === 1 && /[가-힣]/.test(leaf)) {
    // ⚠️ 1글자 leaf(배·굴·감·무…)를 "독립 토큰"으로만 세면 사실상 0 이 나온다 —
    //    한국어는 '나주배', '생굴', '단감' 처럼 합성어로 쓰고 조사가 붙기 때문이다.
    //    그래서 매번 SEO 미달로 판정돼 쓸데없이 3회 재생성하고 검수필요로 찍혔다(실측).
    //    합성어 안에 들어간 것도 노출로 인정한다(느슨한 하한 1회).
    const esc = leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const strict = text.match(new RegExp(`(^|[^가-힣A-Za-z0-9])${esc}([^가-힣A-Za-z0-9]|$)`, 'g'));
    if (strict && strict.length) return strict.length;
    let c = 0, i = 0;
    while ((i = text.indexOf(leaf, i)) >= 0) { c++; i += 1; }
    return c;
  }
  let c = 0, i = 0;
  while ((i = text.indexOf(leaf, i)) >= 0) { c++; i += leaf.length; }
  // ⚠️ 붙여 쓴 합성 분류어(무알콜맥주·바디로션·차량용거치대)는 **사람이 그렇게 안 쓴다**.
  //    실측(2026-08-25): "하이네켄 논알콜릭 330ml 24캔" 상세글이 무알콜·논알콜릭·맥주를
  //    일곱 번 말하고도 "무알콜맥주" 라는 글자뭉치가 1회뿐이라 매번 SEO 미달로 재생성됐다.
  //    더 나쁜 건 재생성이 모델을 몰아붙여 『"무알콜맥주" 고민하시는 분들』처럼 키워드를
  //    따옴표째 박아 넣게 만든 것이다 — 규칙이 글을 망치고 있었다.
  //    → 합성어는 **머리명사(맥주·로션·거치대)** 노출도 상품 노출로 인정한다.
  //      머리명사가 곧 사람이 부르는 이름이라, 통과시켜도 "상품을 안 부른 글"은 통과 못 한다.
  //    ⚠️ 띄어 쓴 분류어("비알콜 맥주", "남성 스포츠 맨투맨")도 같은 병이다 — 이때 머리명사는
  //       **마지막 어절**이다. 붙여쓴 것만 봐주면 절반은 그대로 재생성을 유발한다(실측).
  if (c < 2 && /[가-힣]/.test(leaf)) {
    const words = leaf.trim().split(/\s+/);
    const heads = words.length > 1
      ? [words[words.length - 1]]                       // 띄어쓴 분류어 → 마지막 어절
      : (leaf.length >= 4 ? [leaf.slice(-3), leaf.slice(-2)] : []); // 붙여쓴 합성어 → 꼬리 2~3글자
    for (const head of heads) {
      if (!head || head.length < 2) continue;
      let hc = 0, j = 0;
      while ((j = text.indexOf(head, j)) >= 0) { hc++; j += head.length; }
      if (hc > c) c = hc;
    }
  }
  return c;
}

// 프롬프트(지시문) 고유 어휘 — 본문에 나오면 모델이 제 할 일을 되뇐 것이다.
//   짧은 "제목줄"을 통째로 버리는 용도(cleanDetailOutput). 본문 문장은 어미 검사로 살린다.
const PROMPT_ECHO_LINE = /후기\s*처럼|후기\s*글\s*처럼|블로그\s*후기|상세\s*페이지\s*(?:카피|본문|글|문구)|카피\s*라이터|작성\s*대상|문체\s*참고|감각\s*묘사|검색\s*키워드|상위\s*노출/i;
// 문장 한가운데 박혀도 명백히 지시문인 것 — 재생성 트리거(validateDetail).
//   ⚠️ '상세페이지 카피'는 여기서 뺀다 — "상세페이지 카피만 보고 샀다가…" 처럼 구매자가
//      실제로 쓸 수 있는 문장이라 오탐이 된다. 제목줄 형태는 위 라인 필터가 이미 걷어낸다.
const PROMPT_ECHO_HARD = /카피\s*라이터|작성\s*대상|문체\s*참고|블로그\s*후기\s*글\s*처럼/i;

/** LLM 원문 정리 — 코드펜스/선두 지시라인 제거, 공백 정규화. */
export function cleanDetailOutput(raw) {
  let t = String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  // 선두에 모델이 붙이는 머리말 제거 ("물론입니다", "아래는 ...입니다:" 등)
  t = t.replace(/^\s*(물론입니다|네[,.]?|알겠습니다|아래는[^\n]*[:：]|다음은[^\n]*[:：])\s*\n+/i, '');
  // ⚠️ 마크다운 헤더(###)를 **먼저** 벗긴다 — 나중에 벗기면 "### 마무리" 가 라벨 필터를
  //    빠져나간 뒤 "마무리" 로 남는다(실측).
  t = t.replace(/^\s*#{1,6}\s*/gm, '');
  // 모델이 첫 줄에 다는 제목 접두("후기 글: …", "리뷰: …") — 상세페이지 본문에 제목은 없다.
  t = t.replace(new RegExp(`^\\s*(?:후기|리뷰|사용기)\\s*(?:글|내용)?\\s*[:：]\\s*`, 'i'), '');
  // ⚠️ 프롬프트의 "뼈대 단계 이름"을 모델이 그대로 소제목으로 출력하는 일이 잦다
  //    ("후킹 한 문장:", "문제 증폭:", "망설임 해소:", "추천 대상:", "마무리:").
  //    글의 설계도가 본문에 새는 것이므로 라인 통째/앞머리 라벨을 모두 걷어낸다.
  //    ('상세페이지 본문' 만 막았더니 모델이 '상세페이지 카피'로 새어나왔다 → 뒷말을 넓힌다.)
  const SCAFFOLD = '헤드라인|불릿|추천\\s*대상|핵심\\s*장점|핵심\\s*특징\\s*\\d?|상세\\s*페이지(\\s*(본문|카피|글|문구))?|카피\\s*라이터|후킹(\\s*한\\s*문장)?|문제\\s*증폭|해결(\\s*:.*)?|망설임(\\s*해소)?|마무리|도입부|결론|본문|감각\\s*묘사|구매\\s*권유|cta';
  t = t.split('\n')
    .filter((line) => !new RegExp(`^\\s*\\[?(${SCAFFOLD})\\]?\\s*[:：]?\\s*$`, 'i').test(line))
    // "핵심 장점- 노이즈캔슬링 기능: …" 처럼 라벨 뒤에 불릿이 곧바로 붙는 형태(실측 누출)
    .map((line) => line.replace(new RegExp(`^(\\s*)(?:${SCAFFOLD})\\s*[-*•]\\s+`, 'i'), '$1- '))
    .map((line) => line.replace(new RegExp(`^(\\s*(?:[-*•]\\s*)?)\\[?(?:${SCAFFOLD})\\]?\\s*[:：]\\s*`, 'i'), '$1'))
    .join('\n');
  // 말미에 붙는 부록(구분선 + "SEO 키워드:" 목록 등) 잘라내기 — 본문이 아니다.
  t = t.replace(/\n\s*-{3,}\s*\n[\s\S]*$/i, '\n');
  t = t.replace(/\n\s*(seo[^\n]*|키워드[^\n]*)[:：][\s\S]*$/i, '\n');
  // ⚠️ 프롬프트 문구가 "제목줄"로 새는 사고 — 실측: 본문 맨 앞에 "후기처럼 혼합곡/기타곡류",
  //    "상세페이지 카피" 두 줄이 그대로 실렸다(시스템 프롬프트의 "…상세페이지 카피라이터다",
  //    "진짜 후기처럼:", "블로그 후기 글처럼" 이 합쳐진 것). 위 SCAFFOLD 는 "라벨 한 단어" 줄만
  //    잡아서 뒤에 카테고리명이 붙은 이런 줄은 통과했다. → "짧고 완결 서술어가 없는 줄 +
  //    프롬프트 어휘" 조합을 통째로 버린다(본문 문장은 어미로 끝나므로 건드리지 않는다).
  t = t.split('\n').filter((line) => {
    const s = line.trim();
    if (!s || s.length > 40) return true;                 // 긴 줄 = 본문 문장
    if (/(요|다|죠|까|네|답|함)[.!?~…]*$/.test(s)) return true; // 어미로 끝나면 본문
    return !PROMPT_ECHO_LINE.test(s);
  }).join('\n');
  // ⚠️ 설계도(뼈대) 줄이 **뒷말을 달고** 새어 나온다 — 실측 코퍼스: "문제 증폭 한두 문장",
  //    "해결 — 비타민을 만나고 뭐가 달라졌는지", "어떤 사람에게 좋은지", "마무리 한 문장"이
  //    소제목처럼 본문에 실렸다. 위 SCAFFOLD 필터는 "라벨만 있는 줄"($ 앵커)만 잡아 이런 줄을
  //    전부 통과시켰다. 프롬프트에 "단계 이름을 쓰지 마라"고 적어 둬도 모델은 계속 베낀다
  //    → 기계로 지울 수 있는 결함에 재생성을 태우지 않는다(generatePerfectDetail 주석).
  //    판정: **짧고 + 어미로 끝나지 않고 + 단계 이름으로 시작하는** 줄만 버린다.
  //    본문 문장은 어미(~요/~다/~죠…)로 끝나므로 걸리지 않는다.
  const SCAFFOLD_HEAD = new RegExp(
    `^\\s*(?:\\d[).]|[-*•])?\\s*\\[?(?:${SCAFFOLD}|어떤\\s*사람|누구\\s*에게|어떤\\s*순간|위험\\s*제거)`, 'i');
  t = t.split('\n').filter((line) => {
    const s = line.trim();
    if (!s || s.length > 45) return true;                        // 긴 줄 = 본문 문장
    if (/(요|다|죠|까|네|답|함)[.!?~…]*$/.test(s)) return true;   // 어미로 끝나면 본문
    return !SCAFFOLD_HEAD.test(s);
  }).join('\n');
  t = t.replace(/\*\*\s*-\s*/g, '- ');          // "**- " 깨진 불릿 마커 정리
  // ⭐ 마크다운 볼드/밑줄/별표 전면 제거 — 상세글에 '**' 리터럴이 그대로 보인다는 실사용 지적.
  //    렌더러(detail-page-builder)가 <strong> 으로 바꿔주긴 하지만, 편집 화면·미리보기·
  //    다른 채널(네이버 등)에서는 별표가 날것으로 노출된다 → 애초에 만들지 않는다.
  t = t.replace(/\*\*([^\n]*?)\*\*/g, '$1');    // **볼드** → 알맹이만
  t = t.replace(/__([^\n]*?)__/g, '$1');        // __밑줄__ → 알맹이만
  t = t.replace(/^\s*\*\s+/gm, '- ');           // '* 불릿' → '- 불릿'
  t = t.replace(/\*/g, '');                     // 짝 안 맞는 잔여 별표까지 제거(리터럴 노출 0 보장)
  // 문장 종결 직후 같은 줄에 붙은 불릿("…했어요.- **☀️")을 새 단락의 불릿 줄로 분리.
  // [ \t]만 허용 → 줄바꿈은 넘지 않으므로 이미 분리된/연속된 불릿은 건드리지 않는다.
  t = t.replace(/([^\n\t ])[ \t]*-[ \t]+(\*\*)/g, '$1\n\n- $2');
  // ⚠️ 위 규칙은 뒤에 '**' 가 붙은 형태만 잡는다 — 별표를 안 쓰면 그대로 붙어 버린다.
  //    실측: "핵심 장점들을 몇 가지 꼽아보면요:- 긴 기간 사용 가능: …" 처럼 **첫 불릿이
  //    도입 문장에 들러붙어** 불릿으로 세어지지도, 목록으로 렌더되지도 않았다(그래서
  //    "불릿이 없다"로 재생성까지 갔다). 콜론·문장부호 뒤의 "- " 는 불릿 시작으로 본다.
  //    앞을 문장부호로 한정해 "5 - 10분" 같은 범위 표기는 건드리지 않는다.
  t = t.replace(/([:：.!?])[ \t]*-[ \t]+(?=\S)/g, '$1\n- ');
  t = softenSuperlatives(t);
  t = softenAdCliches(t);
  t = fixAdjCopula(t);                          // "달콤함이 우수입니다" 류 비문 교정
  return normalizeParagraphs(t.replace(/\n{3,}/g, '\n\n').trim());
}

/**
 * 빈 줄 없이 한 줄씩 쓴 글을 **문단으로 승격**한다.
 *
 * 왜: 모델은 후킹·증폭·해결·불릿·마무리를 제대로 나눠 쓰면서도 그 사이를 **홑 줄바꿈**으로만
 * 띄운다. 그런데 검증(validateDetail)은 문단을 `\n{2,}` 로 세기 때문에, 구조가 멀쩡한 14줄짜리
 * 글이 "문단 1개"로 집계돼 "문단 구성이 부족하다"로 재생성됐다. 실측(코퍼스 24건, 2026-08-25):
 * 재생성 사유 1위가 이것이었다(7건 = 전체의 29%). 글이 아니라 **집계가 틀린 것**이라 다시
 * 쓰게 할 이유가 없다 — 상세글 한 편(≈800토큰, 25초)을 통째로 버리는 값이 붙는다.
 *
 * 규칙: 이미 문단이 3개 이상이면 손대지 않는다. 아니면 홑 줄바꿈을 문단 경계로 올리되,
 * **연달아 붙은 불릿은 한 덩어리로 유지**한다(목록이 문단마다 쪼개지면 렌더가 깨진다).
 */
function normalizeParagraphs(text) {
  const t = String(text || '');
  const already = t.split(/\n{2,}/).filter((s) => s.trim().length >= 10).length;
  if (already >= 3) return t;
  const lines = t.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length < 3) return t;
  const isBullet = (l) => /^[-*•]\s*\S/.test(l);
  const blocks = [];
  for (const line of lines) {
    const prev = blocks[blocks.length - 1];
    if (prev && isBullet(line) && isBullet(prev.split('\n')[0])) blocks[blocks.length - 1] = `${prev}\n${line}`;
    else blocks.push(line);
  }
  return blocks.join('\n\n');
}

// 도서/외국도서 — "치료·장애" 등이 책 주제어일 수 있고, 외국도서는 영어가 정상.
function isBookCategory(categoryPath = '') { return /도서|음반|DVD/.test(categoryPath); }
function isForeignBook(categoryPath = '') { return /외국도서|수입도서|원서/.test(categoryPath); }
// 도서에서 의약 단정으로 오판되기 쉬운, 책 주제로는 정상인 단어
const BOOK_EXEMPT = new Set(['치료', '항암', '완치', '면역력 증진', '면역력증진', '디톡스']);

// 카테고리 불일치 "활동어" 누출 검출 — 홈 카테고리(경로)가 아니면 부적합.
// (server output-sanitizer.detectCrossLeafContamination 와 동일 사상의 워커 포팅판.
//  LLM 이 드물게 인접 카테고리 어휘를 끌어와도 regen 루프가 잡아 재생성하게 한다.)
const ACTIVITY_LEAK_GUARDS = [
  { word: '세차/왁스/광택', re: /세차|셀프\s*세차|왁스로|광택나는|외관개선|발수코팅/, home: /세차|왁스|광택|코팅제|디테일링|익스테리어|카샴푸/ },
  { word: '빨래/세탁', re: /빨래|세탁할|세탁세제|섬유유연제|표백제/, home: /세탁|세제|빨래|섬유유연|표백|얼룩/ },
  // ⚠️ '요리에 활용·식사로 즐' 은 식품 전반에서 지극히 자연스러운 표현이라 오탐이었다
  //    (실측: 배 상세글이 "요리에 활용" 때문에 매번 재생성 + 검수필요로 찍힘).
  //    진짜 누출 신호(면발·국물)만 남기고, home 도 식품 카테고리 전반으로 넓힌다.
  { word: '면/끓이기', re: /면의\s*식감|면발|여러\s*번\s*끓여|국물이\s|끓여\s*드시/, home: /면|국수|라면|즉석|찌개|탕|국\b|밀키트|만두|떡국|식품|과일|채소|수산|정육|축산|잡곡|건어물|반찬|간식|음료|가공/ },
  { word: '조립', re: /조립\s*(정밀도|편의|이\s*간편)/, home: /가구|선반|책상|침대|옷장|수납|조립|완구|diy|렉|행거|프레임|거치/ },
];
/** @returns {string[]} 누출 이슈(교정지시) */
function detectCategoryLeak(text, categoryPath = '', leaf = '') {
  const out = [];
  const ctx = `${leaf} ${categoryPath}`;
  for (const g of ACTIVITY_LEAK_GUARDS) {
    if (g.re.test(text) && !g.home.test(ctx)) {
      out.push(`"${leaf}"와 무관한 ${g.word} 어휘가 들어갔다. "${leaf}" 자체의 사용 경험만 써라.`);
    }
  }
  return out;
}

/**
 * 결정론적 교정 — 재생성 없이 고칠 수 있는 결함을 직접 고친다.
 * ---------------------------------------------------------------------------
 * 왜: 재생성 루프는 결함을 못 줄인다(실측 8상품 3회차 hard 합계 10 → 11 → 10 = 난수 재추첨).
 *     "검색 키워드 2개를 넣어라" 하나 때문에 900자 본문을 통째로 다시 쓰는 건 낭비다.
 *     전수 재검증(56건)에서 자기 검증기 통과율이 0% 였다 = 매 상품이 매번 전 회차를 소진했다.
 * → 기계적으로 고칠 수 있는 것은 여기서 고치고, LLM 은 "정말 다시 써야 하는 것"에만 쓴다.
 *
 * 여기서 고치는 것(실측 상위 결함):
 *   ① 분류 라벨("혼합곡/기타곡류")이 본문에 그대로 박힘 (29%) → 사람 이름("혼합곡")으로 치환
 *   ② 카테고리 경로 문자열이 그대로 박힘                    → 상품 이름으로 치환
 *   ③ 마크다운 강조기호(**, __)                            → 제거
 *   ④ SEO 검색 키워드 미달                                 → 마무리 문장 한 줄로 자연스럽게 보강
 * 못 고치는 것(재생성이 답): 길이 미달, 한자/일본어 혼입, 지시문 잔존, 감각 환각.
 *
 * @returns {{text:string, fixed:string[]}} 교정된 본문 + 적용한 항목
 */
export function repairDetail(text, { leaf, categoryPath = '', seoKeywords = [] } = {}) {
  let t = String(text || '');
  const fixed = [];
  const lf = leafForms(leaf);

  // ① 슬래시 분류 라벨 → 사람이 부르는 이름
  const rawLeaf = String(leaf || '').trim();
  if (lf.isMulti && rawLeaf && lf.display && t.includes(rawLeaf)) {
    t = t.split(rawLeaf).join(lf.display);
    fixed.push('분류 라벨 치환');
  }
  // ② 카테고리 경로 문자열 → 상품 이름
  const catStr = String(categoryPath || '').trim();
  if (catStr.length >= 8 && t.includes(catStr)) {
    t = t.split(catStr).join(lf.display || rawLeaf);
    fixed.push('카테고리 경로 치환');
  }
  // ③ 마크다운 강조기호 제거(문장은 그대로 두고 기호만)
  if (/\*\*|__/.test(t)) {
    t = t.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/\*\*|__/g, '');
    fixed.push('강조기호 제거');
  }
  // ④ SEO 검색 키워드 보강 — 부족한 키워드를 마무리 한 줄로 자연스럽게 넣는다.
  //    본문을 다시 쓰지 않고 문장 하나를 더한다(검증 기준은 "2개 이상 등장").
  const kws = (seoKeywords || []).filter((k) => typeof k === 'string' && k.trim().length >= 2).slice(0, 4);
  if (kws.length >= 2) {
    const flat = t.replace(/\s/g, '');
    const missing = kws.filter((k) => !flat.includes(k.trim().replace(/\s/g, '')));
    const have = kws.length - missing.length;
    if (have < 2) {
      const need = missing.slice(0, 2 - have);
      if (need.length) {
        t = `${t.replace(/\s+$/, '')}\n\n${need.join(', ')} 찾으시는 분들께도 잘 맞을 거예요.`;
        fixed.push(`검색 키워드 보강(${need.join(', ')})`);
      }
    }
  }
  // ⑤ 제목줄 제거 — 모델이 첫 줄에 "상품명 + 후기" 같은 제목을 단다(실측: "기능성 쌀 혼합곡
  //    18곡 4kg 후기"). 상세페이지 본문에 제목은 필요 없고, 상품명이 통째로 박히면 비문이다.
  {
    const lines = t.split('\n');
    const first = (lines[0] || '').trim();
    const isTitle = first.length > 0 && first.length <= 45
      && !/[.!?~…]$/.test(first)
      && /(후기|리뷰|사용기|추천|솔직)\s*$/.test(first);
    if (isTitle) { lines.shift(); t = lines.join('\n').replace(/^\s+/, ''); fixed.push('제목줄 제거'); }
  }

  // ⑥ 불릿 마커 중복 정리 — "- - 조용한 환경" 처럼 마커가 두 번 붙어 나온다(실측).
  if (/^\s*[-*•]\s+[-*•]\s+/m.test(t)) {
    t = t.replace(/^(\s*)[-*•]\s+[-*•]\s+/gm, '$1- ');
    fixed.push('불릿 마커 중복 정리');
  }

  // ⑦ 라벨식 불릿 → 문장 불릿. "- 다양한 요리 활용 가능: 샐러드나 볶음밥에도 훌륭했어요."
  //    는 후기가 아니라 카탈로그다. 라벨만 떼면 뒤가 완결된 문장이라 그대로 읽힌다.
  //    ⚠️ 라벨이 어미로 끝나면(= 이미 문장이면) 건드리지 않는다.
  {
    const before = t;
    t = t.replace(/^(\s*[-*•]\s*)([가-힣A-Za-z0-9 ]{2,18}?)\s*:\s*(?=\S)/gm,
      (m, mark, label) => (/(요|다|죠|까|네|음|함)$/.test(label.trim()) ? m : mark));
    if (t !== before) fixed.push('라벨식 불릿 → 문장');
  }

  // ⑧ 광고 CTA 마무리 제거 — 프롬프트가 금지하는데도 "지금 바로 ~하세요", "놓치지 마세요"로
  //    끝맺는다. 후기 글에 판매 멘트가 붙는 순간 신뢰가 깨지므로 그 문장만 들어낸다.
  {
    //   ⚠️ "드셔 보세요"·"한번 써보세요" 같은 자연스러운 권유는 남긴다 — 마케팅 명령형만 잡는다.
    const CTA = /[^.!?~…\n]*(?:지금\s*바로|놓치지\s*마|서둘러|주문하세요|구매하세요|만나\s*보세요|만들어\s*보세요|시작해\s*보세요|경험해\s*보세요)[^.!?~…\n]*[.!?~…]*/g;
    const before = t;
    t = t.split('\n').map((line) => {
      if (!CTA.test(line)) { CTA.lastIndex = 0; return line; }
      CTA.lastIndex = 0;
      const cut = line.replace(CTA, '').replace(/\s{2,}/g, ' ').trim();
      // 문장을 들어내고 남은 게 없으면 줄째로 버린다(빈 줄은 아래 공백 정규화가 정리한다).
      return cut.length >= 6 ? cut : '';
    }).join('\n');
    if (t !== before) { t = t.replace(/\n{3,}/g, '\n\n').trim(); fixed.push('광고 CTA 문장 제거'); }
  }
  return { text: t, fixed };
}

/**
 * 생성 결과 검증 — 통과 못 한 이유(한국어)를 배열로 반환.
 * @param {string} text
 * @param {{leaf?:string, categoryPath?:string, seoKeywords?:string[], allowLatin?:string[]}} o
 *   allowLatin: 상품 자신의 브랜드/모델 영문명(원본 상품명에서 추출). 이걸 "영어 누출"로
 *   잡으면 영원히 못 고치는 결함이 된다(실측: bebeone 기저귀커버 4/56, 자기 브랜드명).
 * @returns {{ok:boolean, issues:string[]}}
 */
export function validateDetail(text, { leaf, categoryPath = '', seoKeywords = [], allowLatin = [], vocab = '', specs = [] } = {}) {
  const issues = [];
  // ── soft = "재생성 지시로는 쓰되 최종 판정(검수필요)에는 넣지 않는 것" ────────────
  //   ⚠️ 예전엔 이 선언이 함수 중간(불릿 검사 아래)에 있었는데 **위쪽 불릿 검사가 이미
  //      soft.push 를 호출**하고 있었다 → 불릿이 정확히 2개인 글마다
  //      "Cannot access 'soft' before initialization" 로 검증기가 죽었고, 그 상품은
  //      생성 자체가 실패했다(호출 경로에 try 가 없다). 선언을 맨 위로 올린다.
  const soft = [];
  const t = String(text || '');
  const book = isBookCategory(categoryPath);
  const foreignBook = isForeignBook(categoryPath);

  if (/[一-鿿]/.test(t)) issues.push('한자(漢字)가 섞였다. 순한국어로만 다시 써라.');
  if (/[぀-ヿ]/.test(t)) issues.push('일본어 문자가 섞였다. 순한국어로만 써라.');

  // 영어 누출 금지(표준 단위/약어 제외). 외국도서는 영어가 정상이라 면제.
  if (!foreignBook) {
    // (a) 단독 영어 단어 4글자+ — "trench코트" 같은 누출
    // 상품 자신의 영문 브랜드/모델명은 누출이 아니다 — 원본 상품명에 있는 단어는 면제한다.
    const own = new Set((allowLatin || []).map((w) => String(w).toLowerCase()));
    const latinWords = (t.match(/[A-Za-z]{2,}/g) || [])
      .filter((w) => w.length >= 4 && !ALLOWED_LATIN.has(w.toLowerCase()) && !own.has(w.toLowerCase()));
    if (latinWords.length) issues.push(`영어 단어(${[...new Set(latinWords)].slice(0, 3).join(', ')})를 한국어로 바꿔라.`);
    // (b) 영어 단어 3개 이상 연속 = 영어 문장
    else {
      const engRuns = t.match(/[A-Za-z]{2,}(?:[\s-]+[A-Za-z]{2,}){2,}/g) || [];
      for (const run of engRuns) {
        const words = run.split(/[\s-]+/).filter((w) => !ALLOWED_LATIN.has(w.toLowerCase()));
        if (words.length >= 3) { issues.push('영어 문장이 들어갔다. 한국어로 바꿔라.'); break; }
      }
    }
  }

  // leaf 노출 횟수 — SEO. 외국도서(영어 leaf)는 한국어 소개라 강제 안 함. 다글자 2회+, 1글자 1회+.
  //   ⚠️ leaf 가 '혼합곡/기타곡류' 같은 **슬래시 분류 라벨**이면 그 문자열 자체는 자연스러운
  //      문장에 넣을 수 없다. 예전엔 라벨 원문만 세서 영원히 미달 → 매번 3회 재생성하고,
  //      교정지시("이 문자열을 2회 넣어라")에 모델이 굴복해 본문 맨 앞에 라벨 제목줄을
  //      박는 사고로 이어졌다(실측: "후기처럼 혼합곡/기타곡류"). → 구성 토큰 중 아무거나 인정.
  const lf = leafForms(leaf);
  if (lf.display && !foreignBook) {
    const cnt = Math.max(0, ...lf.variants.map((v) => countLeaf(v, t)));
    const need = lf.display.length >= 2 ? 2 : 1;
    if (cnt < need) issues.push(`SEO: 상품 키워드 "${lf.display}"가 본문에 ${need}회 이상 자연스럽게 나와야 한다(현재 ${cnt}회).`);
  }
  // 슬래시 분류 라벨이 본문에 그대로 박히면 비문 — 카테고리 경로 검사(아래)와 같은 사상.
  if (lf.isMulti && t.includes(String(leaf).trim())) {
    issues.push(`분류 라벨("${String(leaf).trim()}")을 본문에 그대로 쓰지 마라. 사람이 부르는 이름("${lf.display}")으로만 표현하라.`);
  }

  for (const b of HARD_BANNED) {
    if (book && BOOK_EXEMPT.has(b.trim())) continue; // 책 주제어 면제
    if (t.includes(b)) { issues.push(`금지 표현 "${b.trim()}"를 빼라(의학적 단정·허위 인증·근거없는 절대표현 금지).`); break; }
  }
  // 계정 리스크 어휘 — 도서(제목·주제어)는 면제, 그 외에는 재생성으로 없앤다.
  if (!book) {
    for (const [re, label] of HARD_BANNED_RE) {
      if (re.test(t)) {
        issues.push(`"${label}"을(를) 본문에서 빼라(광고법 위반 누적 대상). 원산지·성분 주장 없이 제품 특징으로만 표현하라.`);
        break;
      }
    }
  }

  // SEO 키워드 실제 반영 — 예전엔 leaf 1개만 봤다(키워드는 프롬프트에 넣기만 하고 검사 안 함).
  //   상위 4개 중 2개 이상이 본문에 자연스럽게 들어가야 검색 유입이 붙는다.
  const kws = (seoKeywords || []).filter((k) => typeof k === 'string' && k.trim().length >= 2).slice(0, 4);
  if (kws.length >= 2) {
    // ⚠️ 띄어쓰기를 무시하고 대조한다 — 키워드는 붙여쓰기('과일선물')인데 본문은 자연스럽게
    //    띄어 쓴다('과일 선물'). 예전엔 exact 매칭이라 멀쩡히 들어간 키워드를 못 찾고
    //    "SEO 미달"로 검수필요를 찍었다(실측). 쿠팡 검색도 공백을 무시한다.
    const flat = t.replace(/\s/g, '');
    const inText = kws.filter((k) => flat.includes(k.trim().replace(/\s/g, '')));
    if (inText.length < 2) {
      issues.push(`SEO: 검색 키워드(${kws.join(', ')}) 중 최소 2개를 본문에 자연스럽게 녹여라(현재 ${inText.length}개).`);
    }
  }

  const compact = t.replace(/\s/g, '').length;
  // 목표는 600~1200자. 예전 하한(480)은 목표보다 낮아 "짧은 글"이 그냥 통과했다 → 550 으로 올림
  //   (600 정확히 걸면 경계에서 재생성이 잦아 느려진다 — 목표 근처까지만 강제).
  if (compact < 550) issues.push('SEO: 본문이 너무 짧다. 공백 제외 600자 이상으로 후기톤·불릿 포함해 더 풍부하게 작성하라.');
  if (compact > 1700) issues.push('본문이 너무 길다. 1200자 내외로 핵심만.');
  if (/\*\*|__/.test(t)) issues.push('마크다운 강조기호(**, __)를 쓰지 마라. 기호 없이 문장으로 강조하라.');
  // 카테고리 경로 문자열이 본문에 그대로 박히는 비문 차단("식품 신선식품 과일류 과일 중에서도…")
  const catStr = String(categoryPath || '').trim();
  if (catStr.length >= 8 && t.includes(catStr)) {
    issues.push(`카테고리 분류 문자열("${catStr}")을 본문에 그대로 쓰지 마라. 상품 이름("${leaf}")으로만 표현하라.`);
  }

  const lines = t.split('\n').map((s) => s.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]\s*\S/.test(l)).length;
  const paras = t.split(/\n{2,}/).filter((s) => s.trim().length >= 10).length;
  // ⚠️ 예전 조건(bullets < 2 && paras < 3)은 **문단만 많으면 통과**라, 불릿 0개짜리 벽글이
  //    그대로 나갔다(실측 사고 글이 정확히 그랬다 — 6문단 0불릿). 쿠팡 상세는 모바일에서
  //    훑어 읽히므로 스캔 가능한 불릿이 없으면 전환이 안 된다.
  if (bullets < 2) issues.push(`핵심 장점 불릿이 없다. 스펙 나열이 아니라 "그래서 생활이 어떻게 편해졌는지"를 담은 불릿(- 로 시작하는 줄)을 3~5개 넣어라.`);
  else if (bullets < 3) soft.push('불릿이 부족하다. 핵심 장점 불릿을 3~5개로 늘려라.');
  if (paras < 3) issues.push('문단 구성이 부족하다. 고민 → 장면·감각 → 핵심 장점 → 마무리로 나눠 써라.');

  // ── 후기 글다움 4종(soft) ──────────────────────────────────────────────
  //   ⚠️ soft = "재생성은 시키되, 끝까지 못 고쳐도 검수필요로는 안 찍는다".
  //      문체는 취향의 영역이라 hard 로 걸면 전 상품이 검수필요로 도배되고, 매번 3회
  //      재생성해서 느려진다. 재생성 지시로는 쓰되 최종 판정은 내용 결함(hard)으로만 한다.
  //   (soft 배열 선언은 이 함수 맨 위로 옮겼다 — 위쪽 불릿 검사가 먼저 쓴다.)
  const cliches = AD_CLICHES.filter((c) => t.includes(c));
  if (cliches.length >= 2) {
    soft.push(`광고 상투구(${cliches.slice(0, 3).join(', ')})를 빼고, 실제 겪은 장면과 구체적인 이득으로 바꿔라.`);
  }
  if (labelBulletCount(t) >= 3) {
    soft.push('불릿을 "라벨: 설명" 형태(카탈로그체)로 쓰지 마라. 각 불릿을 "그래서 생활이 어떻게 편해졌는지" 완결된 문장으로 다시 써라.');
  }
  const sensoryHits = new Set(SENSORY.filter((w) => t.includes(w)));
  if (sensoryHits.size < 2) {
    soft.push('써본 사람의 글이 아니다. 택배를 열었을 때/처음 써봤을 때의 장면과 감각(소리·식감·촉감·향·무게 등)을 최소 두 가지 구체적으로 넣어라.');
  }
  // 후킹 — 첫머리가 고민/질문/장면이어야 한다(칭찬으로 시작하면 후기가 아니라 광고).
  const firstBlock = `${t.split(/\n{2,}/)[0] || ''} ${t.split(/\n{2,}/)[1] || ''}`;
  if (!/\?|적 있|하시죠|해보셨|아니신가요|난감|고민|버린 적|망설|실패|아쉬웠|귀찮|불편/.test(firstBlock)) {
    soft.push('첫머리가 후킹이 아니다. 구매자가 실제로 겪는 실패·불편·불안을 콕 집는 문장으로 시작하라(칭찬·소개로 시작 금지).');
  }
  // 문어체(~했다/~이다/~된다) 과다 = 엄마 후기가 아니라 설명문. 친근한 해요체로 유도(soft).
  const daEnds = (t.match(/(?:았|었|였|한|인|된|이|하)다[.!]/g) || []).length
    + (t.match(/[가-힣]다[.!](?=\s|$|\n)/g) || []).length;
  const yoEnds = (t.match(/(?:요|어요|아요|에요|예요|더라구요|더라고요|네요|같아요|좋아요)[.!~]?(?=\s|$|\n)/g) || []).length;
  if (daEnds >= 4 && yoEnds < 2) {
    soft.push('문어체(~했다/~이다) 위주다. 실제 엄마가 쓰듯 친근한 해요체(~했어요/~더라구요/~좋아요/~같아요)로 바꿔라.');
  }

  if (/(^|\n)\s*(\[?헤드라인|\[?불릿|\[?추천\s*대상|핵심\s*특징\s*\d|상세\s*페이지\s*(본문|카피|글|문구)|\(\d\))/.test(t)) {
    issues.push('지시문/라벨/번호가 출력에 남았다. 완성된 카피만 써라.');
  }
  // 문장 한가운데 박힌 지시문 어휘("…상세페이지 카피라이터", "작성 대상") — 정리 필터가 못 걷어낸 잔여.
  if (PROMPT_ECHO_HARD.test(t)) {
    issues.push('지시문 어휘(상세페이지 카피/카피라이터/작성 대상 등)가 본문에 남았다. 글쓰기 지시를 되뇌지 말고 구매자에게 하는 후기 본문만 써라.');
  }
  if (/\{[^}\n]{1,20}\}/.test(t)) issues.push('치환 안 된 변수({...})가 남았다.');

  // 동일 문장 반복
  const sents = t.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 10);
  const seen = new Set();
  for (const s of sents) { if (seen.has(s)) { issues.push('같은 문장이 반복된다.'); break; } seen.add(s); }

  // 카테고리 불일치 활동어 누출(세차/빨래/면/조립 등) — 인접 카테고리 어휘 끌어옴 차단
  for (const msg of detectCategoryLeak(t, categoryPath, leaf)) issues.push(msg);

  // 카테고리 불일치 감각어(먹는 것 아닌데 과즙·아삭, 곡물인데 포도·과육·캡슐) = 환각 → 하드 재생성
  for (const msg of detectSensoryMismatch(t, categoryKind(categoryPath, leaf), categoryPath, leaf)) issues.push(msg);

  // ⭐ 딴 물건 환각 — 상세글 사고 중 가장 치명적이다(곡물 상세글이 통째로 물통 후기가 된 실측 사고).
  //    "본문의 주인공이 이 상품이 아니다"는 카테고리·금지어·감각어 검사로는 안 잡힌다.
  const leafCnt = lf.display ? Math.max(0, ...lf.variants.map((v) => countLeaf(v, t))) : 0;
  for (const msg of detectForeignSubject(t, { leafCount: leafCnt, vocab, leafVariants: lf.variants })) {
    issues.push(msg);
  }

  // ⭐ 지어낸 수치 — 중량·용량을 다르게 쓰면 허위표시다(실측: 4kg 상품에 "15kg").
  for (const msg of detectFabricatedSpecs(t, specs, vocab)) issues.push(msg);

  // ⭐ 상품명에 적힌 스펙 숫자("4kg","18곡")가 본문에 하나도 없으면 팔리지 않는다.
  //    구매자는 "얼마나 되는지"로 결심하고, 그 숫자 자체가 쿠팡 검색어이기도 하다.
  //    ⚠️ soft 다 — 기계로 자연스럽게 끼워 넣을 수 없고, 이것 때문에 전 상품을 검수필요로
  //       도배하면 검수 화면이 무의미해진다. 재생성 지시로만 쓴다.
  const specList = (specs || []).filter((x) => typeof x === 'string' && x.trim());
  if (specList.length) {
    const flatT = t.replace(/\s/g, '').toLowerCase();
    if (!specList.some((sp) => flatT.includes(sp.replace(/\s/g, '').toLowerCase()))) {
      soft.push(`상품명에 적힌 스펙(${specList.join(', ')}) 중 최소 하나를 본문에 그대로 써라 — 구매자는 양·크기를 알아야 결심한다.`);
    }
  }
  // 첫 문단에 상품 이름 — 쿠팡도 구매자도 맨 위부터 읽는다(soft).
  if (lf.display && !foreignBook) {
    // 첫 두 문단까지 본다 — 뼈대상 1문단은 고민 후킹이라 상품 이름이 안 나오는 게 정상이다
    //   (1문단만 강제하면 "칭찬으로 시작하지 마라" 지시와 정면으로 부딪힌다).
    const head = t.split(new RegExp(`\\n{2,}`)).slice(0, 2).join(" ");
    if (!lf.variants.some((v) => countLeaf(v, head) > 0)) {
      soft.push(`글 첫머리(1~2문단)에 상품 이름("${lf.display}")이 한 번은 나와야 한다.`);
    }
  }

  return { ok: issues.length === 0, issues, soft };
}

// ── "후기 글다움" 검사 ────────────────────────────────────────────────────
//   광고 카탈로그와 블로그 후기를 가르는 건 세 가지다: ① 상투구를 안 쓴다
//   ② 라벨식("- 다양한 활용법: …")이 아니라 문장으로 말한다 ③ 감각·장면이 있다.
//   프롬프트로 부탁만 해서는 모델이 금방 광고체로 돌아가므로 여기서 되돌려보낸다.

/** 광고 관용구 — 2개 이상이면 재생성(1개는 허용, 완벽주의로 무한 재생성 방지). */
const AD_CLICHES = [
  '풍성한 식탁', '행복을 더하', '완벽한 선택', '소중한 선택', '탁월한 선택', '손색이 없',
  '활력을 불어넣', '후회하지 않으실', '후회 없으실', '정성스러운 선물', '만족도를 높여',
  '그 이상의 가치', '지금 바로 만나보', '일상에 활력', '삶의 질을 높여', '새로운 경험을 선사',
];

/** 감각·장면 어휘 — 최소 2종류가 있어야 "써본 사람의 글"로 읽힌다(전 카테고리 공통). */
const SENSORY = [
  '아삭', '사각', '바삭', '쫀득', '촉촉', '부드럽', '진하', '고소', '새콤', '달큰', '시원',
  '향이', '냄새', '묵직', '가볍', '매끈', '폭신', '따뜻', '차갑', '소리', '손에 잡', '들어보니',
  '열어보니', '열자마자', '한 입', '처음 켜', '만져보', '눌러보', '써보니', '먹어보니', '박스',
];

/** 라벨식 불릿("- 무엇무엇: 설명") 개수 — 후기가 아니라 카탈로그 신호. */
function labelBulletCount(t) {
  return (t.match(/^\s*[-*•]\s*[^:\n]{2,18}\s*:/gm) || []).length;
}

/** 형용사 어간 + '입니다' 비문 자동 교정("달콤함이 우수입니다" → "우수합니다"). */
function fixAdjCopula(t) {
  return String(t || '')
    .replace(/(우수|뛰어난|훌륭|탁월|충분|간편|편리|풍부|깔끔|신선|저렴|넉넉|든든|튼튼)입니다/g,
      (m, w) => `${w === '뛰어난' ? '뛰어납' : `${w}합`}니다`)
    .replace(/(뛰어난)합니다/g, '뛰어납니다')
    // '…하기에 우수였어요' 류 — '입니다' 형만 고치고 있어서 해요체 후기에서 그대로 새어나갔다(실측).
    .replace(/(우수|훌륭|탁월|충분|간편|편리|풍부|깔끔|신선|저렴|넉넉|든든|튼튼)(?:였|이었)(어요|습니다|다)/g,
      (m, w, e) => w + '했' + e);
}

/** 단락 → 블록 시퀀스(쿠팡 렌더러용). */
function paragraphsToBlocks(paras) {
  return paras.map((content, i) => ({
    type: BLOCK_TYPE_ORDER[Math.min(i, BLOCK_TYPE_ORDER.length - 1)],
    content,
  }));
}

/**
 * 완벽 상세글 생성 (검증 통과까지 자동 재생성).
 * @param {object} o
 * @param {string} o.model
 * @param {string} o.originalName
 * @param {string} o.categoryPath
 * @param {string} [o.leaf]            없으면 categoryPath 의 마지막 세그먼트
 * @param {string[]} [o.features]
 * @param {string[]} [o.seoKeywords]
 * @param {string} [o.seed]            페르소나 시드(셀러별 톤 다양화)
 * @param {number} [o.maxTokens=900]
 * @param {number} [o.maxAttempts=4]
 * @param {(info:object)=>void} [o.onAttempt]
 * @returns {Promise<{text:string, paragraphs:string[], blocks:object[], attempts:number, ok:boolean, issues:string[]}>}
 */
export async function generatePerfectDetail({
  model, originalName, categoryPath, leaf, features = [], seoKeywords = [], sourceFacts = [],
  // ⭐ 기본 2회 — 재생성은 결함을 못 줄인다(실측). 결정론적 교정으로 못 고치는 것
  //    (길이 미달·한자 혼입·지시문 잔존·감각 환각)에만 1회 더 기회를 준다.
  seed, maxTokens = 1300, maxAttempts = 3, onAttempt = () => {},
}) {
  const realLeaf = (leaf || (categoryPath || '').split('>').pop() || originalName || '').trim();
  const persona = pickPersona(seed || originalName || categoryPath || 'seed');
  const p = { originalName, categoryPath, features, leaf: realLeaf, seoKeywords, sourceFacts };
  // 상품 자신의 영문 브랜드/모델명 — "영어 누출"로 잡히면 재생성해도 영원히 안 고쳐진다.
  const allowLatin = (String(originalName || '').match(/[A-Za-z]{2,}/g) || []);
  // 이 상품이 "아는 말" 전부 — 여기에 없는 명사가 본문의 주인공이면 딴 물건 환각이다.
  const vocab = [originalName, categoryPath, realLeaf, ...features, ...sourceFacts, ...seoKeywords]
    .filter(Boolean).join(' ');
  const vctx = { leaf: realLeaf, categoryPath, seoKeywords, allowLatin, vocab, specs: specTokens(originalName) };

  let best = null;
  let fixNote = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { system, prompt, options } = buildDetailPrompt(p, persona, { maxTokens, fixNote });
    // 재시도일수록 temperature 살짝 낮춰 안정화
    const temperature = Math.max(0.45, (options.temperature ?? 0.75) - (attempt - 1) * 0.12);
    const { text: raw, ms } = await generate({ model, system, prompt, options: { ...options, temperature } });
    // 생성 → **결정론적 교정** → 검증. 기계로 고칠 수 있는 결함에 LLM 을 쓰지 않는다.
    const { text, fixed } = repairDetail(cleanDetailOutput(raw), vctx);
    const { ok, issues, soft } = validateDetail(text, vctx);
    onAttempt({ attempt, ok, issues, soft, ms, chars: text.length, fixed });

    // ⭐ 채택 기준은 **hard 결함 0**. 문체(soft)로는 재생성하지 않는다.
    //    실측 근거: soft "첫머리가 후킹이 아니다"가 70%(39/56)에서 발화해 사실상 전량
    //    재생성을 유발했는데, 회차를 거듭해도 결함이 줄지 않았다(hard 합계 10 → 11 → 10).
    //    재생성은 교정이 아니라 난수 재추첨이었다. soft 는 검수 화면 경고로만 쓴다.
    if (ok) {
      const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 8);
      return { text, paragraphs: paras, blocks: paragraphsToBlocks(paras), attempts: attempt, ok: true, issues: [], soft };
    }
    // 더 나은 후보 선정: hard 결함이 우선, 같으면 soft 가 적은 쪽.
    const rank = (h, s) => h.length * 10 + s.length;
    if (!best || rank(issues, soft) < rank(best.issues, best.soft)) best = { text, issues, soft };
    // 교정지시는 **내용 결함(hard) 먼저, 문체(soft)는 두 개까지**. 예전엔 전부 이어 붙여서
    //   지시가 길어지고 초점이 흐려졌다(재생성이 난수 재추첨이 된 이유 중 하나다).
    fixNote = [...issues, ...soft.slice(0, 2)].join(' ');
  }

  // 통과 못 함 — 가장 결함 적은 결과 반환.
  //   ok 는 **hard 결함 기준**이다: 문체(soft)만 남았으면 통과로 본다(검수 도배 방지).
  const paras = best.text.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 8);
  return {
    text: best.text, paragraphs: paras, blocks: paragraphsToBlocks(paras),
    attempts: maxAttempts, ok: best.issues.length === 0, issues: best.issues, soft: best.soft,
  };
}
