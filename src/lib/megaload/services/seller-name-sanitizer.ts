// ============================================================
// 셀러 키워드 스터핑 / 가격 마커 제거 — 원본상품명 1차 정제
//
// 카테고리 매처 / 노출상품명 생성기 모두 동일한 오염원을 받고 있어
// 진입 직전 공통 sanitize 통과시킨다.
//
// 처리 항목:
//   1) 가격 토큰 제거: "★19900원★", "19,900원", "9900 원" 등
//   2) 강조 마커 제거: ★ ☆ ◆ ◇ ■ □ ● ○ ▶ ▷ ※ 등
//   3) 반복 phrase dedup: 동일 phrase가 3회 이상 연속/근접 반복되면 1회로
//   4) 광고 상수 제거: "무료배송", "당일발송", "특가" 등은 다른 모듈에서 처리하므로 유지
// ============================================================

// 가격 토큰 — "19900원", "19,900원", "★19,900원★" 등.
// "원료/원두/원산지/원어" 등 "원"으로 시작하는 다른 단어 보호 위해 lookahead 사용.
const PRICE_PATTERN = /[★☆◆◇■□●○▶▷※]?\s*\d+(?:,\d{3})*\s*원(?!료|두|산|어|료대|가)\s*[★☆◆◇■□●○▶▷※]?/g;
const EMPHASIS_MARKERS = /[★☆◆◇■□●○▶▷※♥♡♠♣]/g;

/**
 * 다단어 phrase(2단어 이상)가 연속 2회 이상 반복되면 SEO 스팸으로 간주하고 **전부 제거**.
 * 예: "사과/배 과일세트 사과/배 과일세트 사과/배 과일세트" → ""
 *
 * "1회 보존"으로 둘 경우, 셀러가 박은 "사과/배" 같은 스팸 키워드가 토큰으로 살아남아
 * 위치 가중치에서 진짜 상품 키워드(자몽/토마토/참외/망고)를 압도하는 부작용 발생.
 * 정상 상품명은 카테고리 키워드를 1번 이상 반복하지 않으므로 전부 제거가 안전.
 *
 * 단어 1개 반복(win=1)은 정상 어조("싱싱한 싱싱한")일 수 있으므로 dedup 안 함 —
 * 이건 cleanProductName 의 단어 레벨 dedup 이 처리.
 */
function collapseRepeatedPhrases(input: string): string {
  const words = input.split(/\s+/).filter(Boolean);
  if (words.length < 4) return input;

  const result: string[] = [];
  let i = 0;
  while (i < words.length) {
    let collapsed = false;
    // 윈도우 길이는 길수록 우선 (긴 phrase 먼저 감지)
    const maxWin = Math.min(6, Math.floor((words.length - i) / 2));
    for (let win = maxWin; win >= 2; win--) {
      const slice = words.slice(i, i + win);
      let repeats = 1;
      let j = i + win;
      while (j + win <= words.length) {
        let match = true;
        for (let k = 0; k < win; k++) {
          if (words[j + k] !== slice[k]) { match = false; break; }
        }
        if (!match) break;
        repeats++;
        j += win;
      }
      // 2회 이상 반복 = SEO 스팸 → 전부 제거 (push 없이 i 만 점프)
      if (repeats >= 2) {
        i = j;
        collapsed = true;
        break;
      }
    }
    if (!collapsed) {
      result.push(words[i]);
      i++;
    }
  }
  return result.join(' ');
}

/**
 * 셀러가 박은 SEO 오염을 1차 정제한다.
 * 결과는 카테고리 매처 / 노출상품명 생성기 입력으로 그대로 사용 가능.
 */
export function sanitizeSellerName(input: string): string {
  if (!input) return '';

  let s = input;

  // 1) 가격 토큰 제거 (★마커 포함 형태 우선 처리)
  s = s.replace(PRICE_PATTERN, ' ');

  // 2) 강조 마커 제거
  s = s.replace(EMPHASIS_MARKERS, ' ');

  // 3) 공백 정규화 (반복 dedup 정확도용)
  s = s.replace(/\s+/g, ' ').trim();

  // 4) 반복 phrase 축약
  s = collapseRepeatedPhrases(s);

  // 5) 최종 공백 정리
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
