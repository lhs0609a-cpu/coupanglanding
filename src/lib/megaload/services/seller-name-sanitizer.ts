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
 * 다단어 phrase(2단어 이상)가 연속 2회 이상 반복되면 **첫 1회만 보존** 하고 나머지는 제거.
 * 예: "사과/배 과일세트 사과/배 과일세트 사과/배 과일세트" → "사과/배 과일세트"
 *
 * 이전엔 전부 제거했으나 "사과/배 과일세트" 같은 phrase가 실제 카테고리 키워드인 경우
 * 카테고리 매칭이 무너지는 버그 발생(과일세트 → 비관련 카테고리). 1회 보존으로
 * SEO 노이즈는 차단하되 카테고리 시그널은 살림.
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
    // 윈도우 길이는 짧을수록 우선 — 가장 작은 반복 단위를 먼저 잡아 4회 반복도 1 copy로 정리
    const maxWin = Math.min(6, Math.floor((words.length - i) / 2));
    for (let win = 2; win <= maxWin; win++) {
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
      // 2회 이상 반복 = SEO 스팸 → 첫 1회만 보존 (카테고리 키워드 시그널 보호)
      if (repeats >= 2) {
        result.push(...slice);
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
