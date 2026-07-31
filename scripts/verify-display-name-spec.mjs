/**
 * 노출상품명 꼬리 스펙 정리 검증 — 용량·수량은 맨 뒤에 **한 번만**.
 * ---------------------------------------------------------------------------
 * 쿠팡 노출명 관례상 용량/수량은 이름 끝에 붙인다(syncDisplayNameWithOptions).
 * 그런데 그 함수는 꼬리의 스펙만 지우고 붙였다 — 노출명은 보통 스펙을 **중간**에 갖고 있어서
 * 스펙이 두 번 나왔다(실측: "깐마늘 1kg 다진마늘 … 대용량 1kg, 2개").
 *
 * 실행: npx tsx scripts/verify-display-name-spec.mjs
 */
import { syncDisplayNameWithOptions as sync } from '../src/lib/megaload/services/display-name-generator.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const countOf = (s, sub) => s.split(sub).length - 1;

const W = (v, u) => ({ name: '중량', value: v, unit: u });
const V = (v, u) => ({ name: '용량', value: v, unit: u });
const C = (v) => ({ name: '수량', value: v, unit: '개' });

// 스펙이 중간에 있어도 꼬리에 한 번만
{
  const out = sync('깐마늘 1kg 다진마늘 요리용 김장 반찬 대용량', [W('1', 'kg'), C('2')]);
  check('중간 스펙 중복 제거', countOf(out, '1kg') === 1, out);
  check('꼬리에 스펙', /1kg, 2개$/.test(out), out);
}
{
  const out = sync('세라마이드 수딩젤 175ml 바디보습 성인용', [V('175', 'ml'), C('1')]);
  check('ml 스펙 중복 제거', countOf(out, '175ml') === 1, out);
}
// 비슷하지만 다른 숫자는 건드리지 않는다
{
  const out = sync('발아현미 20곡 혼합곡 2kg 대용량 요리용', [W('2', 'kg'), C('1')]);
  check('"20곡" 보존', out.includes('20곡'), out);
  check('kg 중복 제거', countOf(out, '2kg') === 1, out);
}
{
  const out = sync('보관용기 21kg 대용량', [W('1', 'kg'), C('1')]);
  check('21kg 를 1kg 로 오인 삭제하지 않음', out.includes('21kg'), out);
}
// 이미 꼬리에 스펙이 있던 기존 동작은 그대로
{
  const out = sync('프로틴 2kg, 1개', [W('2', 'kg'), C('1')]);
  check('꼬리 스펙 정규화', out === '프로틴 2kg, 1개', out);
}
// 스펙 옵션이 없으면 이름을 건드리지 않는다
check('옵션 없으면 무변경', sync('깐마늘 다진마늘 요리용', []) === '깐마늘 다진마늘 요리용');
// 플레이스홀더(숫자 없음)는 주입하지 않는다
{
  const out = sync('색상 참조 상품', [{ name: '색상', value: '상세페이지 참조' }]);
  check('플레이스홀더 미주입', !out.includes('상세페이지 참조,'), out);
}

console.log(failed === 0 ? '\n꼬리 스펙 검증 통과' : `\n실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
