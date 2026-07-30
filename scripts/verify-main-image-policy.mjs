/**
 * 대표컷 지재권 정책 검증.
 * ---------------------------------------------------------------------------
 * 사용자 확정 규칙(2026-07-30):
 *   · 업체가 각 잡고 찍은 사진 = 지재권 위험 → 대표 후순위
 *   · 과일·신선식품            = 구매자 리뷰 실사 사용
 *   · 일반 공산품              = 우리가 만든 누끼(흰 배경) 사용
 *
 * vision-selector 의 랭킹 가중치와 동일한 식을 여기서 재현해, 후보 조합별로
 * "무엇이 대표가 되는가"를 표로 뽑는다. 규칙이 바뀌면 여기가 먼저 깨진다.
 *
 * 실행: node scripts/verify-main-image-policy.mjs
 */
import { looksStudioShot } from '../worker/lib/image-metrics.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// ── vision-selector 와 동일한 랭킹 식 ──────────────────────────────────────
function rank(c, isFresh) {
  let adj = isFresh ? (c.cutout ? 0.6 : 1.0) : (c.cutout ? 1.3 : 1.0);
  if (c.review) adj *= isFresh ? 1.25 : 1.05;
  if (c.studio && !c.cutout && !c.review) adj *= 0.35;
  return c.score * adj;
}
const winner = (cands, isFresh) => [...cands].sort((a, b) => rank(b, isFresh) - rank(a, isFresh))[0].name;

// 품질 점수는 동일하다고 두고(0.7), 정책만으로 순위가 갈리는지 본다.
const S = 0.7;
const cutout = { name: '누끼본', score: S, cutout: true };
const studio = { name: '업체 스튜디오컷', score: S, studio: true };
const plain = { name: '일반 원본', score: S };
const rev = { name: '리뷰 실사', score: S, review: true };

console.log('── 정책 검증 ──');
check('공산품: 누끼본이 1순위', winner([studio, plain, rev, cutout], false) === '누끼본');
check('공산품: 누끼 없으면 리뷰 실사', winner([studio, plain, rev], false) === '리뷰 실사');
check('공산품: 누끼·리뷰 없으면 일반 원본(업체컷보다 앞)', winner([studio, plain], false) === '일반 원본');
check('공산품: 업체 스튜디오컷은 최후수단', winner([studio], false) === '업체 스튜디오컷');
check('과일: 리뷰 실사가 1순위', winner([studio, plain, rev, cutout], true) === '리뷰 실사');
check('과일: 리뷰 없으면 일반 원본(누끼보다 앞)', winner([studio, plain, cutout], true) === '일반 원본');
check('과일: 누끼본이 업체컷보다는 앞', winner([studio, cutout], true) === '누끼본');

// 품질이 크게 앞서는 업체컷도 정책을 못 뒤집는지(가중치가 실효적인지) 확인
check('업체컷이 품질 우위여도 리뷰 실사에 밀린다',
  winner([{ ...studio, score: 0.95 }, { ...rev, score: 0.5 }], false) === '리뷰 실사',
  `업체 ${(0.95 * 0.35).toFixed(3)} vs 리뷰 ${(0.5 * 1.05).toFixed(3)}`);

console.log('\n── 스튜디오컷 판별기 ──');
// 업체 상업 촬영물: 정사각 1000px, 균일 조명, 깨끗한 흰 배경, 중앙 배치
const studioMet = {
  aspect: 1.0, minSide: 1000, cornerSpread: 4, cornerTexture: 3,
  bgConfidence: 0.82, bgLum: 246, mainEdgeSides: 0, subjectRatio: 0.42,
};
// 구매자 리뷰 실사: 폰 비율, 생활 배경, 불균일 조명
const reviewMet = {
  aspect: 0.75, minSide: 720, cornerSpread: 38, cornerTexture: 24,
  bgConfidence: 0.21, bgLum: 158, mainEdgeSides: 2, subjectRatio: 0.55,
};
const a = looksStudioShot(studioMet);
const b = looksStudioShot(reviewMet);
check('업체 상업컷 → studio=true', a.studio === true, `confidence ${a.confidence} (${a.why.join(', ')})`);
check('구매자 실사 → studio=false', b.studio === false, `confidence ${b.confidence}`);
check('메트릭 없으면 판정 보류', looksStudioShot(null).studio === false);

console.log(failed === 0 ? '\n정책 검증 통과' : `\n실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
