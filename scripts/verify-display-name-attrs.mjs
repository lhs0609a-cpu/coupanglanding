/**
 * 노출상품명 조립 검증 — "core + 속성어 5개 고정".
 * ---------------------------------------------------------------------------
 * 쿠팡 가이드: 상품명은 메인 키워드 + 속성어 3~5개로 간결하게. 나머지 검색어는
 * searchTags(최대 20개)로 보낸다. 키워드를 길게 나열하면 스터핑으로 역효과다.
 *
 * 예전 구조는 LLM 이 완성된 displayName 을 통째로 줘서 속성어 개수를 셀 수 없었다.
 * 지금은 core/attrs 를 나눠 받아 시스템이 정확히 5개를 붙인다.
 *
 * 실행: node scripts/verify-display-name-attrs.mjs
 */
import { composeDisplayNameForTest as compose } from '../worker/lib/ai-generator.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const attrCount = (out, core) => out.slice(core.length).trim().split(/\s+/).filter(Boolean).length;

const CORE = '깐마늘 1kg';
const ATTRS = ['다진마늘', '요리용', '김장', '반찬', '대용량', '아삭한', '국거리', '양념용'];

// 속성어 5개 고정
{
  const out = compose({ core: CORE, attrs: ATTRS }, 'seller-A');
  check('속성어 정확히 5개', attrCount(out, CORE) === 5, out);
  check('core 가 앞에 온다', out.startsWith(CORE), out);
}

// 후보가 5개 미만이면 있는 만큼만(지어내지 않는다)
{
  const out = compose({ core: CORE, attrs: ['요리용', '대용량'] }, 'seller-A');
  check('후보 부족 시 있는 만큼', attrCount(out, CORE) === 2, out);
}

// 셀러마다 다른 조합(아이템위너 회피) — 단, 개수는 항상 5개
{
  const a = compose({ core: CORE, attrs: ATTRS }, 'seller-A');
  const b = compose({ core: CORE, attrs: ATTRS }, 'seller-B');
  check('셀러별 조합이 갈린다', a !== b, `${a} / ${b}`);
  check('갈려도 개수는 5개', attrCount(a, CORE) === 5 && attrCount(b, CORE) === 5);
  check('같은 셀러는 항상 같은 결과', compose({ core: CORE, attrs: ATTRS }, 'seller-A') === a);
}

// core 와 중복되는 속성어는 붙이지 않는다
{
  const out = compose({ core: '깐마늘 1kg 대용량', attrs: ['대용량', '요리용', '김장', '반찬', '국거리', '양념용'] }, 'x');
  check('core 중복어 제외', !/대용량.*대용량/.test(out), out);
}

// 구버전 응답(displayName 통짜)도 그대로 받는다
{
  const out = compose({ displayName: '깐마늘 1kg 요리용 김장' }, 'x');
  check('구버전 displayName 호환', out === '깐마늘 1kg 요리용 김장', out);
}

// core 가 없으면 빈 값(상위에서 재생성/폴백이 돈다)
check('core 없으면 빈 값', compose({ attrs: ATTRS }, 'x') === '');

// 한자 혼입 속성어는 버린다
{
  const out = compose({ core: CORE, attrs: ['要理用', '요리용', '김장', '반찬', '대용량', '국거리'] }, 'x');
  check('한자 속성어 제외', !/要/.test(out), out);
}

console.log(failed === 0 ? '\n노출명 조립 검증 통과' : `\n실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
