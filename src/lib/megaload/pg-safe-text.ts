/**
 * Postgres 가 거부하는 글자를 떼어낸다 — 저장 직전의 마지막 관문.
 * ---------------------------------------------------------------------------
 * 네이버 상세에서 긁어 온 리뷰·설명에는 사람이 입력한 쓰레기 바이트가 섞여 온다. 그중 둘은
 * **Postgres 가 아예 받지 않는다**:
 *
 *   · U+0000(NUL)        → jsonb 저장 시 `22P05 unsupported Unicode escape sequence`
 *   · 짝 없는 서로게이트  → PostgREST 가 `PGRST102 Empty or invalid json` 으로 되돌린다
 *                            (이모지 중간을 slice 로 자르면 여기서 생긴다)
 *
 * 둘 다 **500 으로 나간다.** 실측 2026-11-03: 수산물>새우 3건의 리뷰에 NUL 이 3개 있어서
 * 상세 저장이 HTTP 500 으로 거부됐고, 큐가 30분마다 되살려 **5시간 동안 30번** 같은 상품을
 * 다시 긁었다 — 네이버 예산(건당 페이지 1장 + 리뷰 이미지 30장)만 태우고 한 건도 저장되지
 * 않았다. 한 글자 때문에 상품이 영구히 막힌다.
 *
 * ★ 왜 도우미가 아니라 서버에서 거르나: 셀러 PC 의 도우미는 버전이 제각각이라(0.2.91~0.6.15)
 *   업데이트를 기다릴 수 없고, 저장을 거부당하는 쪽은 언제나 이 라우트다. 마지막 관문에 둔다.
 */

const BAD_CHARS = new RegExp('[\\u0000\\uD800-\\uDFFF]');

/** 문자열 하나 — NUL 제거 + 짝 없는 서로게이트 제거. 멀쩡하면 원본을 그대로 돌려준다. */
export function pgSafeString(input: string): string {
  // 빠른 경로 — 대부분의 문자열은 손댈 데가 없다.
  if (!BAD_CHARS.test(input)) return input;
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c === 0) continue;                                   // NUL
    if (c >= 0xD800 && c <= 0xDBFF) {                        // 상위 서로게이트
      const next = input.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { out += input[i] + input[i + 1]; i += 1; continue; }
      continue;                                              // 짝이 없다 → 버린다
    }
    if (c >= 0xDC00 && c <= 0xDFFF) continue;                // 앞이 없는 하위 서로게이트
    out += input[i];
  }
  return out;
}

/**
 * 객체·배열 안의 모든 문자열에 같은 일을 한다(키 이름까지 — jsonb 키도 같은 제약을 받는다).
 * 깊이 제한을 두는 이유: 상세 데이터는 도우미가 보내는 외부 입력이다. JSON 으로 왔으니 순환
 * 참조는 없지만, 비정상적으로 깊은 중첩으로 스택을 태울 수는 있다.
 */
export function pgSafe<T>(value: T, depth = 0): T {
  if (depth > 32) return null as unknown as T;
  if (typeof value === 'string') return pgSafeString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => pgSafe(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[pgSafeString(k)] = pgSafe(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}
