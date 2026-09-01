/**
 * 쿠팡 검색어(searchTags) 빌더 — 상품 노출의 직접 레버.
 * ===========================================================================
 * 쿠팡 검색은 **카테고리 · 상품명 · 구매옵션 · 검색어(태그)** 네 필드의 단어를 조합해
 * 결과를 만든다(쿠팡 공식 안내). 앞의 셋은 자동으로 태그가 되지만, `searchTags` 는
 * "상품명에 다 못 넣은 검색어"를 추가로 알고리즘에 인식시키는 유일한 수단이다.
 *
 * ⚠️ 지금까지 이 필드를 **아예 보내지 않았다**(payload 에 키 자체가 없었다).
 *    상품명에 키워드를 욱여넣어 길이를 늘리는 방식으로 SEO 를 시도했는데, 쿠팡 가이드는
 *    반대다 — 상품명은 메인 키워드 + 속성어 3~5개로 간결하게, 나머지는 태그로 보낸다.
 *    (키워드 5개 이상 나열은 스터핑으로 역효과)
 *
 * ⭐ 20개는 **채운다**(사용자 확정 2026-09-01). 태그는 상품명 밖의 검색어를 알고리즘에 넣는
 *    유일한 통로라, 6개만 보내면 나머지 14칸은 그냥 버리는 노출이다. 후보는 세 겹으로 온다:
 *      ① 로컬 에이전트(도우미 GPU)가 뽑은 **쿠팡 연관검색어** — 사람이 실제로 치는 말
 *      ② 생성기 키워드·소싱 태그·옵션값
 *      ③ 그래도 모자라면 아래 조합 폴백(핵심어 × 일반 수식어) — 마지막 안전망
 *    ③ 은 규칙(금지어·타사 브랜드·특수문자)을 똑같이 통과한 것만 쓴다. 채우려고 규칙을 풀지 않는다.
 *
 * 규칙(쿠팡 공식 + 판매자 가이드):
 *   · 최대 20개
 *   · 카테고리·상품명에 이미 있는 단어는 제외(중복은 낭비 — 이미 검색 대상이다)
 *   · 띄어쓰기만 다른 변형 중복 금지("노루 페인트" / "노루페인트" 중 하나만)
 *   · 타사 브랜드명 금지, 배송 관련어 금지, 기능성/효능 주장 금지
 *   · 특수문자 금지(검색 오류 유발)
 */

/** 태그로 쓰면 안 되는 말 — 검색 노이즈·광고성·배송·과장. */
const BANNED = [
  '무료배송', '당일배송', '당일발송', '빠른배송', '오늘출발', '로켓배송', '총알배송', '새벽배송',
  '최저가', '특가', '할인', '세일', '쿠폰', '증정', '사은품', '이벤트', '리뷰이벤트',
  '베스트', '인기', '추천', '순위', '1위', '최고', '최상', '프리미엄', '명품', '정품',
  '후기', '리뷰', '강추', '득템', '가성비갑', '필수템',
  '효능', '효과', '치료', '완치', '예방', '개선', '항암', '면역력',
];
const BANNED_RE = new RegExp(BANNED.join('|'));

/** 계정정지 누적 대상(광고법) — 상품명과 동일 기준으로 태그에서도 뺀다. */
const RISK_RE = /(?<![가-힣])(유기농|국산|국내산|포도당|수액)(?![가-힣])/;

/** 한글/영문/숫자/공백만. 그 외 특수문자는 검색 오류를 만든다. */
const CLEAN_RE = /^[가-힣a-zA-Z0-9 .%]+$/;

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const tokens = (s: string) =>
  (String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || []).filter((t) => t.length >= 2);

export interface BuildSearchTagsInput {
  /** 노출상품명 — 여기 있는 단어는 태그에서 뺀다. */
  productName: string;
  /** 카테고리 경로 — 여기 있는 단어도 이미 검색 대상이다. */
  categoryPath?: string;
  /** 후보 검색어(LLM 키워드 · 실제 연관검색어 · 옵션값 등). 앞쪽이 우선순위 높다. */
  candidates: (string | null | undefined)[];
  /** 상품 브랜드 — 자사 브랜드는 허용, 그 외 고유명은 후보에서 걸러진다. */
  brand?: string;
  /**
   * 후보가 모자랄 때 **핵심어 × 수식어**로 채울지(기본 true).
   * 20칸을 비워 두는 것보다 안전한 조합 검색어라도 채우는 편이 노출에 이롭다는 판단.
   * 채운 것도 다른 후보와 똑같은 규칙 검사를 통과한다.
   */
  pad?: boolean;
  /** 원본 상품명 — 후보에 등장한 고유명이 이 상품의 것인지 판정하는 근거. */
  sourceName?: string;
  max?: number;
}

/**
 * 후보 목록에서 쿠팡 검색어 태그를 만든다.
 * @returns 최대 max 개(기본 20)의 태그. 규칙 위반·중복은 전부 제거된 상태.
 */
export function buildSearchTags(input: BuildSearchTagsInput): string[] {
  const { productName, categoryPath = '', candidates, brand = '', sourceName = '', max = 20, pad = true } = input;

  // 상품명·카테고리의 단어는 이미 검색 대상 → 태그에 또 넣지 않는다.
  const covered = new Set<string>([...tokens(productName), ...tokens(categoryPath)]);
  // "아는 어휘" = 이 상품 자신의 말(상품명·카테고리·브랜드·원본명) + 일반 속성어.
  //   여기에 없는 한글 덩어리가 남으면 타사 고유명으로 본다.
  const known = [
    ...tokens(productName), ...tokens(categoryPath), ...tokens(brand), ...tokens(sourceName),
    ...ATTR_WORDS,
  ].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);   // 긴 어휘부터 지운다

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (out.length >= max) break;
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 20) continue;
    if (!CLEAN_RE.test(s)) continue;
    if (BANNED_RE.test(s) || RISK_RE.test(s)) continue;

    // 띄어쓰기 변형까지 포함한 중복 제거
    const key = squash(s);
    if (seen.has(key)) continue;

    // 상품명/카테고리에 이미 있는 단어 그대로면 제외(부분 포함은 허용 — 조합어는 별개 검색어다)
    if (covered.has(key)) continue;

    // ⚠️ 타사 브랜드 차단 — 쿠팡 가이드가 태그에 타사 브랜드명을 금지한다. 실측한 연관검색어에는
    //    다른 회사 제품이 섞여 있었다(바디로션 → "세타필바디로션", 현미유 → "한살림 현미유").
    //    한국어는 합성어가 한 덩어리라("선물용과일") 토큰 단위 비교로는 못 가른다.
    //    → **아는 어휘를 부분문자열로 지워내고, 남는 한글 덩어리가 있으면 낯선 고유명으로 본다.**
    //      "선물용과일" → 선물/과일 제거 → 잔여 "용"(1자) → 통과
    //      "세타필바디로션" → 바디로션 제거 → 잔여 "세타필"(3자) → 차단
    if (hasUnknownProperNoun(s, known)) continue;

    seen.add(key);
    out.push(s);
  }

  // ── 마지막 안전망 — 20칸을 비워 두지 않는다 ────────────────────────────────
  // 실측: 생성기 키워드가 상품명과 겹쳐 6/20 에서 멈추는 카드가 흔했다. 남는 칸은 그냥 버리는
  // 노출이라, **핵심어 × 일반 수식어** 조합으로 채운다. 채운 것도 위와 같은 검사를 통과한다
  // (금지어·타사 브랜드·특수문자·중복). 통과 못 하면 채우지 않는다 — 규칙이 개수보다 위다.
  if (pad && out.length < max) {
    for (const cand of padCandidates(categoryPath)) {
      if (out.length >= max) break;
      if (cand.length < 2 || cand.length > 20) continue;
      if (!CLEAN_RE.test(cand)) continue;
      if (BANNED_RE.test(cand) || RISK_RE.test(cand)) continue;
      const key = squash(cand);
      if (seen.has(key) || covered.has(key)) continue;
      if (hasUnknownProperNoun(cand, known)) continue;
      seen.add(key);
      out.push(cand);
    }
  }
  return out;
}

/**
 * 채움 후보 — **이 상품의 핵심어**(카테고리 최말단·상품명 첫 낱말)에 일반 수식어를 붙인다.
 * 지어낸 고유명이 절대 섞이지 않도록 재료를 상품 자신의 말과 화이트리스트로만 한정한다.
 * 순서 = 우선순위: 쓸모 있는 조합(용도·규격)을 앞에 둔다.
 */
/** 어느 카테고리에나 말이 되는 수식어 10개 — 앞뒤 두 방향으로 20칸이 정확히 찬다. */
const PAD_COMMON = ['대용량', '세트', '선물용', '가정용', '업소용', '묶음', '대량', '실속', '휴대용', '사계절'];
/** 식품 계열에서만 쓰는 수식어 — 안 가르면 "요리용청소기" 같은 말이 태그로 나간다. */
const PAD_FOOD = ['한박스', '박스', '제철', '간식용', '요리용'];
const FOOD_RE = /식품|과일|채소|정육|수산|건어물|간식|음료|커피|차류|건강|농산|축산|쌀|곡물|반찬|delicacy/i;

function padCandidates(categoryPath: string): string[] {
  // ⚠️ 핵심어는 **카테고리에서만** 뽑는다. 상품명에서 뽑으면 타사 브랜드가 그대로 실린다 —
  //    실측 2026-09-01: "썬키스트 오렌지 대용량…" 에서 "대용량썬키스트" 가 만들어졌다.
  //    쿠팡은 태그에 타사 브랜드명을 금지한다(계정 위험). 카테고리에는 브랜드가 없다.
  //    같은 이유로 "소용량·미니·대형" 같은 규격어도 뺐다 — 대용량 상품에 "소용량" 태그가
  //    붙으면 검색어와 상품이 어긋나 클릭 후 이탈만 만든다.
  const parts = String(categoryPath || '').split(/[>/]/).map((x) => x.trim()).filter(Boolean);
  // 최말단 하나만 쓴다 — 상위 가지("가전")를 붙이면 "대용량가전" 처럼 아무도 안 치는 말이 된다.
  //   수식어 15개 × 앞뒤 2가지 = 30 후보라 최말단 하나로도 20칸은 넉넉히 찬다.
  const cores = [...new Set(
    parts.slice(-1).map((c) => c.replace(/s+/g, '')).filter((c) => c.length >= 2),
  )];
  if (cores.length === 0 && parts.length > 1) {
    const up = parts[parts.length - 2].replace(/s+/g, '');
    if (up.length >= 2) cores.push(up);
  }
  const outs: string[] = [];
  // 수식어를 바깥 루프로 — 핵심어가 둘이면 "대용량X, 대용량Y, 세트X…" 로 고르게 섞인다.
  const mods = FOOD_RE.test(categoryPath) ? [...PAD_FOOD, ...PAD_COMMON] : PAD_COMMON;
  for (const m of mods) {
    for (const core of cores) {
      outs.push(`${m}${core}`);
      outs.push(`${core}${m}`);
    }
  }
  return outs;
}

/**
 * 아는 어휘를 부분문자열로 지운 뒤, 남는 한글 덩어리(2자 이상)가 있으면 낯선 고유명으로 본다.
 *   한국어 합성 검색어를 토큰 단위로 못 가르기 때문에 필요한 방식이다.
 * @param s 후보 검색어
 * @param known 이 상품이 아는 어휘(긴 것부터 정렬돼 있어야 한다)
 */
function hasUnknownProperNoun(s: string, known: string[]): boolean {
  let rest = s.toLowerCase().replace(/\s+/g, '');
  for (const w of known) {
    if (!w) continue;
    rest = rest.split(w).join(' ');           // 아는 어휘 제거
    if (!rest.replace(/\s+/g, '')) return false;
  }
  // 숫자·단위·영문은 고유명으로 보지 않는다(150ml, 2봉, XL 등).
  rest = rest.replace(/[0-9a-z.%]+/g, ' ');
  return /[가-힣]{2,}/.test(rest);
}

/**
 * 상품 속성을 나타내는 일반 명사 — 고유명(브랜드)과 구분하기 위한 화이트리스트.
 * 여기 없는 낯선 한글 토큰이 후보에 들어 있으면 타사 브랜드로 보고 버린다(보수적 판정).
 */
const ATTR_WORDS = new Set<string>([
  // 용량·구성
  '대용량', '소용량', '중량', '용량', '세트', '묶음', '낱개', '개별포장', '벌크', '리필', '기획',
  '대형', '소형', '미니', '중형', '슬림', '경량', '초경량', '휴대용', '업소용', '가정용', '사무실',
  // 대상
  '남자', '여자', '남성', '여성', '아기', '유아', '아동', '어린이', '성인', '임산부', '노인', '반려',
  '커플', '가족', '학생', '신생아',
  // 계절·시기
  '여름', '겨울', '봄', '가을', '사계절', '여름용', '겨울용', '선물', '선물용', '명절', '추석', '설날',
  // 형태·상태
  '무선', '유선', '충전식', '접이식', '방수', '방한', '방풍', '분리형', '일체형', '스탠드', '벽걸이',
  '냉동', '냉장', '건조', '생', '볶은', '구운', '삶은', '분말', '가루', '액상', '스프레이', '스틱',
  '뿌리는', '바르는', '먹는', '짜먹는', '끓이는',
  // 감각·특성
  '향좋은', '향기좋은', '무향', '퍼퓸', '고보습', '보습', '수분', '저자극', '민감', '민감성', '순한',
  '약산성', '무첨가', '무설탕', '저염', '저당', '고단백', '식이섬유', '통', '거친', '부드러운',
  // 용도
  '요리', '요리용', '반찬', '간식', '간식용', '아침', '식사', '캠핑', '등산', '운동', '헬스', '홈트',
  // 채움 조합(padCandidates)이 쓰는 일반어 — 여기 없으면 제 조합이 '낯선 고유명'으로 걸린다.
  '박스', '한박스', '실속', '아이', '어른', '대량', '제철',
  '청소', '세척', '수납', '정리', '인테리어', '주방', '욕실', '거실', '침실', '차량', '차량용',
]);
