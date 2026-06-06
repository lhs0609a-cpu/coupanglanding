// PENDING 거짓실패 완화의 핵심 분기 검증 — decideTimeoutOutcome
// 실행: npx tsx scripts/test-coupon-pending-outcome.mjs
import { decideTimeoutOutcome } from '../src/lib/utils/coupang-api-client.ts';

let pass = 0;
let fail = 0;
const cases = [
  // [label, verify, lastPollSucceeded, lastPollTotal, expected]
  ['진짜 실패: 쿠폰 파기/NOT_FOUND → PENDING(재시도)',
    { exists: false, status: 'NOT_FOUND' }, 0, 100, 'PENDING'],

  ['거짓 실패 해소: 쿠폰 살아있고 진행 완료 → SUCCESS',
    { exists: true, status: 'ACTIVE' }, 100, 100, 'SUCCESS'],

  ['거짓 실패 해소: 쿠폰 살아있고 진행도 미제공 → SUCCESS(보수적)',
    { exists: true, status: 'ACTIVE' }, 0, 0, 'SUCCESS'],

  ['부분 등록 의심: 살아있지만 80/100만 진행 → PENDING(재시도)',
    { exists: true, status: 'ACTIVE' }, 80, 100, 'PENDING'],

  ['부분 등록 의심: 99/100 → PENDING(재시도)',
    { exists: true, status: 'ACTIVE' }, 99, 100, 'PENDING'],

  ['verify 호출 실패(verifyStatus=UNKNOWN, exists=false) → PENDING',
    { exists: false, status: 'UNKNOWN' }, 100, 100, 'PENDING'],

  ['쿠폰 EXPIRED 이지만 exists=true → SUCCESS(보수적, 등록 후 만료 가능)',
    { exists: true, status: 'EXPIRED' }, 100, 100, 'SUCCESS'],

  ['진행도 0/100(시작 안 함)인데 exists=true → PENDING',
    { exists: true, status: 'ACTIVE' }, 0, 100, 'PENDING'],
];

console.log('═══ decideTimeoutOutcome 분기 검증 ═══\n');
for (const [label, verify, succeeded, total, expected] of cases) {
  const actual = decideTimeoutOutcome(verify, succeeded, total);
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  console.log(`   입력: exists=${verify.exists}(${verify.status}), poll=${succeeded}/${total}`);
  console.log(`   기대: ${expected} | 실제: ${actual}\n`);
}

console.log(`═══ 결과: ${pass}/${pass + fail} 통과 ═══`);
process.exit(fail === 0 ? 0 : 1);
