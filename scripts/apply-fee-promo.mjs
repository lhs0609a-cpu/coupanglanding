/**
 * 한시 수수료 할인 — 이미 생성된 리포트에 소급 적용 (멱등).
 *
 * 쓰는 때: 할인 코드 배포 전에 해당 매출월 리포트가 이미 만들어졌을 때.
 *   생성 경로(billable-reports / monthly-report-auto-create)는 배포 후 자동으로 할인가로 만들지만,
 *   그 전에 만들어진 행은 할인 전 금액으로 남아 있으므로 이 스크립트로 맞춘다.
 *
 * 하는 일: 대상 매출월의 미납 리포트에 대해
 *   할인 전 공급가액(base) = (reported_revenue − 비용합계) × share%   ← 서버 계산식과 동일
 *   supply_amount = floor(base × (1 − rate)), vat = floor(supply × 10%), total = supply + vat
 *   calculated_deposit / admin_deposit_amount 는 건드리지 않는다.
 *
 * 안전장치:
 *   - 기본은 dry-run. 실제 반영은 --apply 필요.
 *   - base 를 저장된 매출·비용에서 **다시 계산**한다. calculated_deposit 을 기준으로 쓰면
 *     PT생 직접보고 경로(my/report)가 이미 할인된 값을 calculated_deposit 에 넣기 때문에
 *     두 번 깎을 수 있다. 재계산한 base 와 비교하면 두 경로를 구분할 수 있다.
 *   - supply_amount ≠ base 인 행은 건드리지 않고 보고만 한다 → 이미 할인됐거나
 *     상품등록 할인 등 다른 조정이 들어간 행을 덮어쓰지 않는다 (멱등).
 *   - fee_payment_status='paid' / payment_status='confirmed' 는 제외 (결제 완료분 소급 변경 금지).
 *   - 변경 전/후 스냅샷을 artifacts/ 에 저장 → revert-fee-promo.mjs 로 원복 가능.
 *
 * 사용:
 *   node scripts/apply-fee-promo.mjs                      # dry-run (2026-09)
 *   node scripts/apply-fee-promo.mjs --apply              # 실제 반영
 *   node scripts/apply-fee-promo.mjs --month=2026-09 --rate=0.10 --apply
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const APPLY = args.includes('--apply');
const MONTH = flag('month', '2026-09');
const RATE = Number(flag('rate', '0.10'));

if (!(RATE > 0 && RATE < 1)) {
  console.error('rate 는 0~1 사이여야 합니다 (0.10 = 10%)');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: reports, error } = await sb
  .from('monthly_reports')
  .select('id, pt_user_id, year_month, fee_payment_status, payment_status, reported_revenue, cost_product, cost_commission, cost_advertising, cost_returns, cost_shipping, cost_tax, calculated_deposit, admin_deposit_amount, supply_amount, vat_amount, total_with_vat, pt_users(share_percentage, profiles(full_name, email))')
  .eq('year_month', MONTH)
  .in('fee_payment_status', ['awaiting_payment', 'overdue', 'suspended']);
if (error) throw error;

console.log(`대상 매출월 ${MONTH} / 할인율 ${RATE * 100}% / 모드 ${APPLY ? 'APPLY(실제 반영)' : 'DRY-RUN'}`);
console.log(`미납 리포트 ${reports.length}건\n`);

const changes = [];
const needsReview = [];
let skipped = 0;

for (const r of reports) {
  if (r.payment_status === 'confirmed') { skipped++; continue; }

  // 할인 전 공급가액을 저장된 매출·비용에서 재계산 (서버 calculateDeposit 과 동일한 식)
  const revenue = Number(r.reported_revenue) || 0;
  const costTotal =
    (Number(r.cost_product) || 0) + (Number(r.cost_commission) || 0) + (Number(r.cost_advertising) || 0) +
    (Number(r.cost_returns) || 0) + (Number(r.cost_shipping) || 0) + (Number(r.cost_tax) || 0);
  const netProfit = revenue - costTotal;
  const sharePct = Number(r.pt_users?.share_percentage ?? 30);
  const base = netProfit > 0 ? Math.floor(netProfit * sharePct / 100) : 0;
  if (base <= 0) { skipped++; continue; }

  const newSupply = Math.floor(base * (1 - RATE));
  const newVat = Math.floor(newSupply * 0.1);
  const newTotal = newSupply + newVat;

  const curSupply = Number(r.supply_amount) || 0;
  const who0 = r.pt_users?.profiles;
  // 저장된 공급가액이 재계산 base 와 다르면 이미 할인됐거나 다른 조정이 들어간 행 →
  // 덮어쓰지 않고 보고만 한다 (중복 할인·기존 할인 소멸 방지).
  if (curSupply !== base) {
    needsReview.push({
      email: who0?.email ?? r.pt_user_id,
      base,
      supply: curSupply,
      note: curSupply <= newSupply ? '이미 할인 반영된 것으로 보임 → skip' : '다른 조정 있음 → 수동 확인',
    });
    skipped++;
    continue;
  }

  const who = r.pt_users?.profiles;
  changes.push({
    id: r.id,
    ptUserId: r.pt_user_id,
    name: who?.full_name ?? null,
    email: who?.email ?? null,
    status: r.fee_payment_status,
    before: { supply_amount: r.supply_amount, vat_amount: r.vat_amount, total_with_vat: r.total_with_vat },
    after: { supply_amount: newSupply, vat_amount: newVat, total_with_vat: newTotal },
    discountAmount: base - newSupply,
  });
}

for (const c of changes) {
  console.log(` ${c.email ?? c.ptUserId} | ${c.status} | 청구 ${c.before.total_with_vat?.toLocaleString()} → ${c.after.total_with_vat.toLocaleString()} (할인 ${c.discountAmount.toLocaleString()})`);
}
if (needsReview.length) {
  console.log();
  console.log("-- 건드리지 않은 행 (확인 필요) --");
  for (const n of needsReview) {
    console.log(` ${n.email} | 재계산 공급가 ${n.base.toLocaleString()} vs 저장 ${n.supply.toLocaleString()} | ${n.note}`);
  }
}
const sumBefore = changes.reduce((s, c) => s + (Number(c.before.total_with_vat) || 0), 0);
const sumAfter = changes.reduce((s, c) => s + c.after.total_with_vat, 0);
console.log(`\n변경 ${changes.length}건 / skip ${skipped}건`);
console.log(`청구 합계 ${sumBefore.toLocaleString()} → ${sumAfter.toLocaleString()} (감액 ${(sumBefore - sumAfter).toLocaleString()}원)`);

if (!changes.length) { console.log('\n변경할 행이 없습니다.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapPath = path.join('artifacts', `fee-promo-${MONTH}-${stamp}.json`);
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync(snapPath, JSON.stringify({ month: MONTH, rate: RATE, applied: APPLY, at: new Date().toISOString(), changes }, null, 2));
console.log(`스냅샷: ${snapPath}`);

if (!APPLY) {
  console.log('\nDRY-RUN 입니다. 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
  process.exit(0);
}

let ok = 0, fail = 0;
for (const c of changes) {
  const { error: updErr } = await sb
    .from('monthly_reports')
    .update(c.after)
    .eq('id', c.id)
    // 경합 안전장치: 읽은 값이 그대로일 때만 업데이트
    .eq('supply_amount', c.before.supply_amount);
  if (updErr) { fail++; console.error(' 실패', c.email, updErr.message); } else { ok++; }
}
console.log(`\n반영 완료: 성공 ${ok}건 / 실패 ${fail}건`);
