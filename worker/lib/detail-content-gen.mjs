/**
 * 완벽 상세페이지 생성 (로컬 LLM) — "한 번 호출 = 완벽한 결과" 보장.
 * ---------------------------------------------------------------------------
 * 전략: 생성 → 자동 검증(카테고리 정합·순한국어·SEO·구매욕 구조·금지어·반복·길이)
 *       → 실패 시 "직전 문제"를 교정 지시로 주입해 재생성. 통과할 때까지(최대 maxAttempts).
 * 호출자(runContent / 오프라인 16k 사전생성)는 이 함수만 부르면 된다.
 */

import { generate } from './local-llm.mjs';
import { buildDetailPrompt, pickPersona, categoryKind, leafForms } from './ai-prompts.mjs';

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
  // ⚠️ 프롬프트의 "뼈대 단계 이름"을 모델이 그대로 소제목으로 출력하는 일이 잦다
  //    ("후킹 한 문장:", "문제 증폭:", "망설임 해소:", "추천 대상:", "마무리:").
  //    글의 설계도가 본문에 새는 것이므로 라인 통째/앞머리 라벨을 모두 걷어낸다.
  //    ('상세페이지 본문' 만 막았더니 모델이 '상세페이지 카피'로 새어나왔다 → 뒷말을 넓힌다.)
  const SCAFFOLD = '헤드라인|불릿|추천\\s*대상|핵심\\s*장점|핵심\\s*특징\\s*\\d?|상세\\s*페이지(\\s*(본문|카피|글|문구))?|카피\\s*라이터|후킹(\\s*한\\s*문장)?|문제\\s*증폭|해결(\\s*:.*)?|망설임(\\s*해소)?|마무리|도입부|결론|본문|감각\\s*묘사|구매\\s*권유|cta';
  t = t.split('\n')
    .filter((line) => !new RegExp(`^\\s*\\[?(${SCAFFOLD})\\]?\\s*[:：]?\\s*$`, 'i').test(line))
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
  t = softenSuperlatives(t);
  t = fixAdjCopula(t);                          // "달콤함이 우수입니다" 류 비문 교정
  return t.replace(/\n{3,}/g, '\n\n').trim();
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
export function validateDetail(text, { leaf, categoryPath = '', seoKeywords = [], allowLatin = [] } = {}) {
  const issues = [];
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
  if (bullets < 2 && paras < 3) issues.push('구조가 부족하다. 헤드라인 + 핵심 장점 불릿 3~5개 + 마무리로 구성하라.');

  // ── 후기 글다움 4종(soft) ──────────────────────────────────────────────
  //   ⚠️ soft = "재생성은 시키되, 끝까지 못 고쳐도 검수필요로는 안 찍는다".
  //      문체는 취향의 영역이라 hard 로 걸면 전 상품이 검수필요로 도배되고, 매번 3회
  //      재생성해서 느려진다. 재생성 지시로는 쓰되 최종 판정은 내용 결함(hard)으로만 한다.
  const soft = [];
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
    .replace(/(뛰어난)합니다/g, '뛰어납니다');
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
  seed, maxTokens = 1300, maxAttempts = 2, onAttempt = () => {},
}) {
  const realLeaf = (leaf || (categoryPath || '').split('>').pop() || originalName || '').trim();
  const persona = pickPersona(seed || originalName || categoryPath || 'seed');
  const p = { originalName, categoryPath, features, leaf: realLeaf, seoKeywords, sourceFacts };
  // 상품 자신의 영문 브랜드/모델명 — "영어 누출"로 잡히면 재생성해도 영원히 안 고쳐진다.
  const allowLatin = (String(originalName || '').match(/[A-Za-z]{2,}/g) || []);
  const vctx = { leaf: realLeaf, categoryPath, seoKeywords, allowLatin };

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
    fixNote = [...issues, ...soft].join(' ');
  }

  // 통과 못 함 — 가장 결함 적은 결과 반환.
  //   ok 는 **hard 결함 기준**이다: 문체(soft)만 남았으면 통과로 본다(검수 도배 방지).
  const paras = best.text.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 8);
  return {
    text: best.text, paragraphs: paras, blocks: paragraphsToBlocks(paras),
    attempts: maxAttempts, ok: best.issues.length === 0, issues: best.issues, soft: best.soft,
  };
}
