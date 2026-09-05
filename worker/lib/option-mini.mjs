/**
 * 구매옵션 결정론 추출 (LLM 없음)
 * ===========================================================================
 * 왜 LLM 을 안 쓰는가 — **워커가 만든 옵션은 쿠팡 등록에 단 한 번도 쓰이지 않는다.**
 *   웹 검수 패널은 레코드의 options 를 카드 초기값으로 한 번 읽고
 *   (AllInOneRegisterPanel.initEdit), 곧바로 서버 `/api/megaload/products/option-preview`
 *   가 **원본 상품명 + 카테고리 buyOption 스키마**로 다시 뽑은 값으로 통째로 덮는다.
 *   등록 페이로드도 preflight-builder 가 원본명에서 다시 추출한다. 즉 이 필드는
 *   "미리보기가 뜨기 전 잠깐 보이는 자리표"일 뿐이다.
 *   (option-preview 라우트 주석도 같은 말을 한다: 로컬 LLM 옵션은 "무알콜=무알콜" 같은
 *    쓸모없는 값이라 등록 경로에서는 무시한다.)
 *
 * 그런데 그 자리표 하나 때문에 상품마다 LLM 호출 1회(출력 ~200토큰 + 프롬프트 프리필)를
 * 태우고 있었다. 4콜 중 1콜, 출력 토큰의 약 17% 다. GPU 가 포화 상태면 그 17% 가 곧
 * 17% 의 시간이고, GPU 가 없는 PC 에서는 프리필까지 더해져 그보다 크다.
 * → 자리표는 자리표답게, 상품명에서 **확실한 것만** 규칙으로 뽑는다. 지어내지 않는다.
 *
 * 품질: LLM 이 하던 일보다 나빠지지 않는다. 프롬프트가 요구하던 것이 정확히
 *   "상품명/특징에 실제로 드러난 정보(용량·수량 등)만, 없는 스펙은 지어내지 말 것" 이었다.
 */

/** 단위 → 옵션명. 긴 단위를 먼저 둬야 '개입'이 '개'로 잘리지 않는다. */
const UNIT_RULES = [
  { re: 'mcg|㎍', name: '함량', unit: 'mcg' },
  { re: 'mg|㎎', name: '함량', unit: 'mg' },
  { re: 'kg|㎏', name: '중량', unit: 'kg' },
  { re: 'ml|㎖', name: '용량', unit: 'ml' },
  { re: '리터', name: '용량', unit: 'L' },
  { re: 'g|그램', name: '중량', unit: 'g' },
  { re: 'l|L', name: '용량', unit: 'L' },
  { re: 'w|W', name: '출력', unit: 'W' },
  { re: '개입', name: '수량', unit: '개' },
  { re: '정|캡슐', name: '수량', unit: '정' },
  { re: '매', name: '수량', unit: '매' },
  { re: '팩', name: '수량', unit: '팩' },
  { re: '포', name: '수량', unit: '포' },
  { re: '병', name: '수량', unit: '병' },
  { re: '캔', name: '수량', unit: '캔' },
  { re: '봉', name: '수량', unit: '봉' },
  { re: '장', name: '수량', unit: '장' },
  { re: '세트', name: '수량', unit: '세트' },
  { re: '곡', name: '구성', unit: '곡' },
  { re: '개|입', name: '수량', unit: '개' },
];

// 전체 매칭용 — 숫자 + (단위). 단위 목록 순서를 그대로 유지해 긴 것부터 시도한다.
const UNIT_ALT = UNIT_RULES.map((r) => r.re).join('|');
const SPEC_RE = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(' + UNIT_ALT + ')(?![a-zA-Z가-힣])', 'g');

/** 상품명에 흔히 붙는 색상어 — 있으면 색상 옵션으로. 없으면 만들지 않는다. */
const COLORS = ['블랙', '화이트', '검정', '흰색', '아이보리', '베이지', '그레이', '네이비',
  '브라운', '핑크', '레드', '블루', '그린', '옐로우', '퍼플', '민트', '카키', '실버', '골드'];

/**
 * 상품명(+특징)에서 구매옵션을 규칙으로 뽑는다.
 * ---------------------------------------------------------------------------
 * ⚠️ **지어내지 않는다** — 상품명 문자열에 실제로 있는 것만 옮긴다.
 *    같은 옵션명(중량 등)이 여러 번 나오면 첫 번째만 쓴다(상품명 앞쪽이 대표 스펙이다).
 * @param {{originalName?:string, features?:string[]}} p
 * @param {number} [max=4]  쿠팡 구매옵션 상한에 맞춘 개수 제한(기존 프롬프트와 동일하게 1~4개)
 * @returns {{name:string, value:string, unit?:string}[]}
 */
export function deriveOptions(p, max = 4) {
  const name = String(p?.originalName || '');
  // 특징은 상품명에 없는 스펙을 담고 있을 때가 있다(소싱처가 따로 준 값) → 뒤에 이어 붙여 함께 훑는다.
  const feats = (Array.isArray(p?.features) ? p.features : []).filter((f) => typeof f === 'string').join(' ');
  const hay = `${name} ${feats}`;

  const out = [];
  const usedNames = new Set();
  SPEC_RE.lastIndex = 0;
  for (let m; (m = SPEC_RE.exec(hay)); ) {
    const [, value, rawUnit] = m;
    const rule = UNIT_RULES.find((r) => new RegExp(`^(?:${r.re})$`).test(rawUnit));
    if (!rule || usedNames.has(rule.name)) continue;
    usedNames.add(rule.name);
    out.push({ name: rule.name, value, unit: rule.unit });
    if (out.length >= max) return out;
  }

  // ⚠️ 부분문자열로 찾으면 안 된다 — '블루투스 이어폰'이 색상 "블루"가 된다(실측).
  //    앞뒤가 한글로 이어지지 않는 **단독 표기**일 때만 색상으로 인정한다.
  const color = COLORS.find((c) => new RegExp(`(?<![가-힣])${c}(?![가-힣])`).test(hay));
  if (color && !usedNames.has('색상') && out.length < max) out.push({ name: '색상', value: color });

  return out;
}
