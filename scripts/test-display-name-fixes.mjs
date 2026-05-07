/**
 * test-display-name-fixes.mjs
 *
 * 즉시 fix 3종 동작 검증:
 *   - 단일자 leaf 후처리 dedup
 *   - "1개" 무의미 수량 생략
 *   - 합성 prefix 자동 분해
 *
 * tsx 없이 ESM에서 TS 모듈 import는 어렵기 때문에, 실제 generator 로직을
 * inline 재구현 — 즉시 fix 3종만 격리해 검증.
 */

const COMPOSITE_PREFIXES = ['국내산', '국산', '신선', '프리미엄', '천연', '내추럴', '유기농', '무농약', '대용량', '소용량', '특대'];

function decomposeComposite(word) {
  const lower = word.toLowerCase();
  for (const prefix of COMPOSITE_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase()) && lower.length > prefix.length) {
      const suffix = word.slice(prefix.length);
      if (suffix.length >= 1 && /[가-힣]/.test(suffix)) {
        return [prefix, suffix];
      }
    }
  }
  return [word];
}

function leafSingleCharDedup(parts, leafRaw) {
  if (!(leafRaw.length === 1 && /[가-힣]/.test(leafRaw))) return parts;
  const leafChar = leafRaw;
  const indices = [];
  parts.forEach((tok, i) => {
    if (tok.includes(leafChar)) indices.push(i);
  });
  if (indices.length <= 2) return parts;
  const sorted = [...indices].sort((a, b) => {
    if (parts[a] === leafChar) return -1;
    if (parts[b] === leafChar) return 1;
    return parts[a].length - parts[b].length;
  });
  const keep = new Set(sorted.slice(0, 2));
  const removeSet = new Set(indices.filter(i => !keep.has(i)));
  return parts.filter((_, i) => !removeSet.has(i));
}

function maybeAppendCount(parts, countValue, unit) {
  const v = String(countValue).trim();
  if (v === '1' || v === '1.0') return parts;
  return [...parts, `${v}${unit || '개'}`];
}

let pass = 0, fail = 0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) {
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    fail++;
  } else pass++;
}

console.log('━━━ Composite prefix 분해 ━━━');
expect('국내산사과 → [국내산, 사과]', decomposeComposite('국내산사과'), ['국내산', '사과']);
expect('프리미엄망고 → [프리미엄, 망고]', decomposeComposite('프리미엄망고'), ['프리미엄', '망고']);
expect('신선참외 → [신선, 참외]', decomposeComposite('신선참외'), ['신선', '참외']);
expect('국내산배 → [국내산, 배] (단일자 suffix)', decomposeComposite('국내산배'), ['국내산', '배']);
expect('특대과 → [특대, 과]', decomposeComposite('특대과'), ['특대', '과']);
expect('비매칭 → 원본', decomposeComposite('샤인머스캣'), ['샤인머스캣']);
expect('너무 짧음 → 원본', decomposeComposite('국내산'), ['국내산']);

console.log('\n━━━ 단일자 leaf 후처리 dedup ━━━');
// '배' char 포함 토큰 4개 (신고배,산지배,국내산배,배) → 2개 보존(배,신고배), 나머지 비포함 토큰은 그대로
expect(
  '배 leaf 4회 → 2회 보존 (비포함 토큰은 유지)',
  leafSingleCharDedup(['신고배', '산지배', '국내산배', '특대', '배', '대과', '특대과'], '배'),
  ['신고배', '특대', '배', '대과', '특대과'],
);
// 토큰에 '과' char 포함 — 사과, 청사과 = 2회 (3회 아님) → 무변경
expect(
  '과 char 2회 → 무변경 (3회 미만)',
  leafSingleCharDedup(['사과', '청사과', '아오리'], '과'),
  ['사과', '청사과', '아오리'],
);
expect(
  '과 char 3회 → 2회 보존',
  leafSingleCharDedup(['사과', '청사과', '아오리', '대과'], '과'),
  ['사과', '아오리', '대과'], // 짧은 순: 대과(2), 사과(2), 청사과(3) → 2개 keep [대과,사과]
);

expect('2회 이하 → 무변경', leafSingleCharDedup(['신고배', '배'], '배'), ['신고배', '배']);
expect('다자 leaf → 무변경', leafSingleCharDedup(['크림', '크림팩', '크림젤', '뷰티크림'], '크림'), ['크림', '크림팩', '크림젤', '뷰티크림']);

console.log('\n━━━ "1개" 무의미 수량 생략 ━━━');
expect('count=1 → 생략', maybeAppendCount(['상품', '500g'], '1', '개'), ['상품', '500g']);
expect('count=2 → 추가', maybeAppendCount(['상품', '500g'], '2', '개'), ['상품', '500g', '2개']);
expect('count=10 → 추가', maybeAppendCount(['상품'], '10', '입'), ['상품', '10입']);
expect('count=1.0 → 생략', maybeAppendCount(['상품'], '1.0', '개'), ['상품']);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`pass: ${pass} · fail: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
