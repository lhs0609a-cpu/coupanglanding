/**
 * 2026-09 매출분 청구 집행 — 한시 할인 20%(실효 24%) 기준.
 *
 * 운영 결정(2026-10-06):
 *   - 2026-09 매출분만 대상. 과거 미납(2026-06 century_inc / 2026-07 bbackga58)은 건드리지 않는다.
 *   - 이미 결제 승인된 2026-09 4건(실효 27%)은 소급 환불하지 않는다 → paid 는 전 단계에서 제외.
 *
 * 단계 (--step):
 *   rebase : 미납 2026-09 리포트를 10% 할인 → 20% 할인 금액으로 재계산.
 *            배포된 계산식과 동일하게 base → 상품등록 할인 → 한시 할인 → VAT 순서로 다시 쌓고,
 *            "현재 저장액이 10% 모델로 정확히 재현되는 행"만 수정한다(모델 불일치 행은 보고만).
 *   create : 리포트가 없는 2026-09 청구 대상(정산 net>0)에 리포트 생성.
 *            billable-reports.ts(ensureBillableReports)와 동일: net=total_sales, 광고비 0 가정,
 *            자동비용 5종, deposit=floor(순이익×share%), 공급가액=floor(deposit×0.8), VAT=floor(공급×0.1).
 *            상품등록 할인은 서버 생성 경로에도 없으므로 적용하지 않는다.
 *   charge : 2026-09 미납 리포트에 Toss 빌링키 결제.
 *
 * 중복 결제 방지 — 서버(execute-billing-now)와 동일한 가드만 사용한다:
 *   1) cron_try_acquire_lock('cron:auto-billing')  — 3일 cron·관리자 즉시청구와 동시 실행 차단
 *   2) 5분 이상 hang 된 pending tx 를 STALE_PENDING 으로 종결
 *   3) safe_check_report_for_billing RPC — 결제 직전 paid/success tx 재확인, is_billable 아니면 skip
 *   4) payment_transactions pending UNIQUE 인덱스 + toss_order_id UNIQUE
 *   5) payment_mark_success RPC(멱등) 로만 성공 마킹
 *
 * 정산 후처리(revenue_entries/트레이너 보너스/세금계산서)는 이 스크립트가 하지 않는다.
 * 결제 후 관리자 > 결제관리 > '정산 후처리 복구'(/api/admin/payments/settlement-recovery) 를 돌려야 한다.
 *
 * 사용:
 *   node scripts/bill-2026-09.mjs --step=rebase            # dry-run
 *   node scripts/bill-2026-09.mjs --step=rebase --apply
 *   node scripts/bill-2026-09.mjs --step=create [--apply]
 *   node scripts/bill-2026-09.mjs --step=charge [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MONTH = '2026-09';
const PROMO_RATE = 0.2;   // fee-promo.ts FEE_PROMO_RATE 와 일치해야 한다
const OLD_RATE = 0.1;     // rebase 검증용 — 기존 저장액이 이 요율로 재현되는지 확인
const VAT_RATE = 0.1;
const LOCK_KEY = 'cron:auto-billing';
const DEADLINE_ISO = '2026-11-03T14:59:59.000Z'; // getCurrentCycleDeadlineISO: 익월 3일 23:59:59 KST

const args = process.argv.slice(2);
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const APPLY = args.includes('--apply');
const STEP = flag('step', '');
if (!['rebase', 'create', 'charge'].includes(STEP)) {
  console.error('--step=rebase|create|charge 중 하나가 필요합니다');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── 서버와 동일한 계산식 (constants.DEFAULT_COST_RATES / deposit.ts / vat.ts / fee-promo.ts) ──
const COST_RATES = { cost_product: 0.40, cost_commission: 0.10, cost_returns: 0.03, cost_shipping: 0.05, cost_tax: 0.10 };
const buildCosts = (revenue, ad = 0) => ({
  cost_product: Math.round(revenue * COST_RATES.cost_product),
  cost_commission: Math.round(revenue * COST_RATES.cost_commission),
  cost_returns: Math.round(revenue * COST_RATES.cost_returns),
  cost_shipping: Math.round(revenue * COST_RATES.cost_shipping),
  cost_tax: Math.round(revenue * COST_RATES.cost_tax),
  cost_advertising: ad,
});
const sumCosts = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const calcDeposit = (revenue, costs, sharePct) => {
  const net = revenue - sumCosts(costs);
  return net > 0 ? Math.floor(net * sharePct / 100) : 0;
};
const withVat = (supply) => (supply <= 0
  ? { supply_amount: 0, vat_amount: 0, total_with_vat: 0 }
  : { supply_amount: supply, vat_amount: Math.floor(supply * VAT_RATE), total_with_vat: supply + Math.floor(supply * VAT_RATE) });
const applyPromo = (supply, rate) => (rate > 0 && supply > 0 ? Math.floor(supply * (1 - rate)) : Math.max(0, supply));

// listing-discount.ts LISTING_DISCOUNT_TIERS
const TIERS = [
  { name: '마스터', min: 5000, rate: 0.012, cap: 30000 },
  { name: '다이아', min: 2000, rate: 0.009, cap: 24000 },
  { name: '플래티넘', min: 1000, rate: 0.007, cap: 18000 },
  { name: '골드', min: 500, rate: 0.005, cap: 12000 },
  { name: '실버', min: 300, rate: 0.003, cap: 7000 },
  { name: '브론즈', min: 100, rate: 0.001, cap: 3000 },
];
const listingDiscount = (totalListings, netProfit) => {
  const tier = TIERS.find((t) => totalListings >= t.min);
  if (!tier || netProfit <= 0) return { amount: 0, tierName: null };
  return { amount: Math.min(Math.floor(netProfit * tier.rate), tier.cap), tierName: tier.name };
};

const snapshot = (name, payload) => {
  fs.mkdirSync('artifacts', { recursive: true });
  const p = path.join('artifacts', `bill-${MONTH}-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
  console.log(`스냅샷: ${p}`);
};
const won = (n) => Number(n || 0).toLocaleString();
const UNPAID = ['awaiting_payment', 'overdue', 'suspended'];

// failure-codes.ts — 재시도 허용 코드(allow-list). 여기에 없으면 최종실패로 종결한다(서버와 동일 판정).
const RETRYABLE_CODES = new Set([
  'NOT_ENOUGH_BALANCE', 'EXCEED_MAX_DAILY_PAYMENT_AMOUNT', 'EXCEED_MAX_ONE_DAY_AMOUNT',
  'PROVIDER_ERROR', 'FAILED_INTERNAL_SYSTEM_PROCESSING', 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
  'COMMON_ERROR', 'UNKNOWN', 'TIMEOUT',
]);
const isRetryable = (code) => RETRYABLE_CODES.has(code);

console.log(`[bill-${MONTH}] step=${STEP} mode=${APPLY ? 'APPLY(실제 반영)' : 'DRY-RUN'} promo=${PROMO_RATE * 100}%\n`);

// ───────────────────────── rebase ─────────────────────────
if (STEP === 'rebase') {
  const { data: reports, error } = await sb
    .from('monthly_reports')
    .select('id, pt_user_id, year_month, fee_payment_status, reported_revenue, cost_product, cost_commission, cost_advertising, cost_returns, cost_shipping, cost_tax, calculated_deposit, supply_amount, vat_amount, total_with_vat, pt_users(share_percentage, profiles(email))')
    .eq('year_month', MONTH)
    .in('fee_payment_status', UNPAID);
  if (error) throw error;

  const { data: points } = await sb.from('seller_points').select('pt_user_id, total_listings');
  const listingsBy = new Map((points || []).map((p) => [p.pt_user_id, Number(p.total_listings) || 0]));

  const changes = [];
  const skipped = [];
  for (const r of reports || []) {
    const revenue = Number(r.reported_revenue) || 0;
    const costs = {
      cost_product: Number(r.cost_product) || 0,
      cost_commission: Number(r.cost_commission) || 0,
      cost_returns: Number(r.cost_returns) || 0,
      cost_shipping: Number(r.cost_shipping) || 0,
      cost_tax: Number(r.cost_tax) || 0,
      cost_advertising: Number(r.cost_advertising) || 0,
    };
    const sharePct = Number(r.pt_users?.share_percentage ?? 30);
    const netProfit = revenue - sumCosts(costs);
    const base = netProfit > 0 ? Math.floor(netProfit * sharePct / 100) : 0;
    const ld = listingDiscount(listingsBy.get(r.pt_user_id) || 0, netProfit);
    const afterListing = base - ld.amount;
    const email = r.pt_users?.profiles?.email ?? r.pt_user_id;

    // 현재 저장액이 "구 요율(10%) 모델"로 정확히 재현돼야만 손댄다.
    const old = withVat(applyPromo(afterListing, OLD_RATE));
    if (old.total_with_vat !== Number(r.total_with_vat) || old.supply_amount !== Number(r.supply_amount)) {
      skipped.push({ email, stored: { supply: r.supply_amount, total: r.total_with_vat }, model10: old, base, listingDiscount: ld.amount });
      continue;
    }
    const next = withVat(applyPromo(afterListing, PROMO_RATE));
    changes.push({
      id: r.id,
      email,
      status: r.fee_payment_status,
      base,
      listingDiscount: ld.amount,
      listingTier: ld.tierName,
      before: { supply_amount: Number(r.supply_amount), vat_amount: Number(r.vat_amount), total_with_vat: Number(r.total_with_vat), calculated_deposit: Number(r.calculated_deposit) },
      after: next,
    });
  }

  for (const c of changes) {
    console.log(` ${c.email.padEnd(28)} ${c.status.padEnd(16)} 공급 ${won(c.before.supply_amount)} → ${won(c.after.supply_amount)} | 청구 ${won(c.before.total_with_vat)} → ${won(c.after.total_with_vat)} (감액 ${won(c.before.total_with_vat - c.after.total_with_vat)})`);
  }
  for (const s of skipped) {
    console.log(` [skip] ${s.email} — 저장 공급 ${won(s.stored.supply)} / 청구 ${won(s.stored.total)} 이 10% 모델(${won(s.model10.total_with_vat)})과 불일치 → 수동 확인`);
  }
  console.log(`\n변경 ${changes.length}건 / skip ${skipped.length}건`);
  if (!changes.length) process.exit(0);
  snapshot('rebase', { month: MONTH, oldRate: OLD_RATE, newRate: PROMO_RATE, applied: APPLY, changes, skipped });
  if (!APPLY) { console.log('DRY-RUN — --apply 로 반영하세요.'); process.exit(0); }

  let ok = 0, fail = 0;
  for (const c of changes) {
    // calculated_deposit 도 함께 내린다: 이 행들은 my/report 직접보고 경로가 만든 행이라
    // calculated_deposit 에 "할인 후 공급가액"이 들어가 있다(= 저장 공급가액과 동일).
    const payload = { ...c.after };
    if (c.before.calculated_deposit === c.before.supply_amount) payload.calculated_deposit = c.after.supply_amount;
    const { error: updErr } = await sb
      .from('monthly_reports')
      .update(payload)
      .eq('id', c.id)
      .eq('supply_amount', c.before.supply_amount)            // 경합 가드
      .in('fee_payment_status', UNPAID);                       // 그 사이 결제됐으면 손대지 않음
    if (updErr) { fail++; console.error(' 실패', c.email, updErr.message); } else { ok++; }
  }
  console.log(`\n반영: 성공 ${ok} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
}

// ───────────────────────── create ─────────────────────────
if (STEP === 'create') {
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
  const { data: pts, error: ptErr } = await sb
    .from('pt_users')
    .select('id, created_at, status, is_test_account, billing_excluded_until, share_percentage, profiles(email)')
    .neq('status', 'terminated')
    .eq('is_test_account', false);
  if (ptErr) throw ptErr;

  const { data: existing } = await sb.from('monthly_reports').select('pt_user_id').eq('year_month', MONTH);
  const have = new Set((existing || []).map((r) => r.pt_user_id));

  const { data: snaps } = await sb
    .from('api_revenue_snapshots')
    .select('pt_user_id, total_sales, total_commission, total_shipping, total_returns, total_settlement, total_sales_orders')
    .eq('year_month', MONTH);
  const snapBy = new Map((snaps || []).map((s) => [s.pt_user_id, s]));

  // 등록월 유예 — getFirstEligibleMonth(created_at) = 등록 다음 달
  const firstEligible = (createdAt) => {
    const d = new Date(createdAt);
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  };

  const rows = [];
  const skips = [];
  for (const pt of pts || []) {
    const email = pt.profiles?.email ?? pt.id;
    if (have.has(pt.id)) { skips.push(`${email}: 이미 리포트 있음`); continue; }
    if (pt.billing_excluded_until && pt.billing_excluded_until >= todayStr) { skips.push(`${email}: 결제 제외 ${pt.billing_excluded_until}`); continue; }
    if (firstEligible(pt.created_at) > MONTH) { skips.push(`${email}: 등록월 유예(${String(pt.created_at).slice(0, 10)} 등록)`); continue; }
    const snap = snapBy.get(pt.id);
    const net = snap ? Number(snap.total_sales) || 0 : 0;
    if (net <= 0) { skips.push(`${email}: 정산 net≤0`); continue; }

    const sharePct = Number(pt.share_percentage ?? 30);
    const costs = buildCosts(net, 0);
    const deposit = calcDeposit(net, costs, sharePct);
    const amounts = withVat(applyPromo(deposit, PROMO_RATE));
    if (amounts.total_with_vat <= 0) { skips.push(`${email}: 청구액 0`); continue; }
    rows.push({ pt, email, net, sharePct, costs, deposit, amounts, snap });
  }

  rows.sort((a, b) => b.amounts.total_with_vat - a.amounts.total_with_vat);
  for (const r of rows) {
    console.log(` ${r.email.padEnd(28)} ${String(r.sharePct).padStart(2)}% 정산 ${won(r.net).padStart(11)} 수수료(할인전) ${won(r.deposit).padStart(9)} → 청구 ${won(r.amounts.total_with_vat).padStart(9)}원`);
  }
  console.log(`\n생성 대상 ${rows.length}건 / 합계 ${won(rows.reduce((s, r) => s + r.amounts.total_with_vat, 0))}원`);
  console.log(`제외 ${skips.length}건`);
  for (const s of skips) console.log(`   - ${s}`);
  if (!rows.length) process.exit(0);
  snapshot('create', { month: MONTH, rate: PROMO_RATE, applied: APPLY, rows: rows.map(({ pt, ...r }) => ({ ptUserId: pt.id, ...r })) });
  if (!APPLY) { console.log('\nDRY-RUN — --apply 로 생성하세요.'); process.exit(0); }

  const nowIso = new Date().toISOString();
  let ok = 0, dup = 0, fail = 0;
  for (const r of rows) {
    const { error: insErr } = await sb.from('monthly_reports').insert({
      pt_user_id: r.pt.id,
      year_month: MONTH,
      reported_revenue: r.net,
      calculated_deposit: r.deposit,        // 할인 전 — 할인액 추적용
      admin_deposit_amount: r.deposit,
      payment_status: 'reviewed',
      reviewed_at: nowIso,
      ...r.costs,
      api_verified: true,
      api_settlement_data: r.snap,
      supply_amount: r.amounts.supply_amount,
      vat_amount: r.amounts.vat_amount,
      total_with_vat: r.amounts.total_with_vat,
      fee_payment_status: 'awaiting_payment',
      fee_payment_deadline: DEADLINE_ISO,
      fee_paid_at: null,
      fee_surcharge_amount: 0,
      fee_interest_amount: 0,
    });
    if (insErr) {
      if (/duplicate key|unique/i.test(insErr.message)) { dup++; console.log(` [skip] ${r.email} — 이미 생성됨(UNIQUE)`); }
      else { fail++; console.error(' 실패', r.email, insErr.message); }
    } else ok++;
  }
  console.log(`\n생성: 성공 ${ok} / 중복 skip ${dup} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
}

// ───────────────────────── charge ─────────────────────────
if (STEP === 'charge') {
  const secretKey = env.TOSS_PAYMENTS_SECRET_KEY;
  if (!secretKey) { console.error('TOSS_PAYMENTS_SECRET_KEY 없음'); process.exit(1); }
  const tossAuth = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: reports, error } = await sb
    .from('monthly_reports')
    .select('id, pt_user_id, year_month, total_with_vat, fee_payment_deadline, fee_payment_status')
    .eq('year_month', MONTH)                 // 범위 고정 — 과거월 미납은 건드리지 않는다
    .in('fee_payment_status', UNPAID)
    .order('total_with_vat', { ascending: false });
  if (error) throw error;

  const ptIds = [...new Set(reports.map((r) => r.pt_user_id))];
  const { data: pts } = await sb.from('pt_users').select('id, profile_id, status, is_test_account, billing_excluded_until, profiles(email)').in('id', ptIds);
  const ptBy = new Map((pts || []).map((p) => [p.id, p]));
  const { data: cards } = await sb.from('billing_cards').select('id, pt_user_id, billing_key, customer_key').in('pt_user_id', ptIds).eq('is_active', true).eq('is_primary', true);
  const cardBy = new Map((cards || []).map((c) => [c.pt_user_id, c]));
  const { data: ads } = await sb.from('ad_cost_submissions').select('pt_user_id').eq('year_month', MONTH).eq('status', 'pending');
  const adPending = new Set((ads || []).map((a) => a.pt_user_id));

  const plan = [];
  for (const r of reports) {
    const pt = ptBy.get(r.pt_user_id);
    const email = pt?.profiles?.email ?? r.pt_user_id;
    const amount = Number(r.total_with_vat) || 0;
    let skip = null;
    if (!pt) skip = 'pt_user 없음';
    else if (pt.status === 'terminated' || pt.is_test_account) skip = '해지/테스트 계정';
    else if (pt.billing_excluded_until && pt.billing_excluded_until >= todayStr) skip = `결제 제외 ${pt.billing_excluded_until}`;
    else if (!cardBy.get(r.pt_user_id)) skip = '활성 대표카드 없음';
    else if (adPending.has(r.pt_user_id)) skip = '광고비 검토 대기 — 승인 후 청구';
    else if (amount <= 0) skip = '청구액 0';
    // 2026-09 마감은 10/12 → 연체 아님. 혹시 지났으면 중단하고 수동 확인(가산금 계산은 서버에 맡긴다).
    else if (r.fee_payment_deadline && new Date(r.fee_payment_deadline).getTime() < Date.now()) skip = `마감 경과(${r.fee_payment_deadline}) — 연체 가산금 때문에 서버 경로로 처리 필요`;
    plan.push({ report: r, email, amount, card: cardBy.get(r.pt_user_id), profileId: pt?.profile_id, skip });
  }

  for (const p of plan) console.log(` ${p.skip ? '[skip]' : '[청구]'} ${p.email.padEnd(28)} ${won(p.amount).padStart(9)}원 ${p.skip || ''}`);
  const live = plan.filter((p) => !p.skip);
  console.log(`\n청구 ${live.length}건 / 합계 ${won(live.reduce((s, p) => s + p.amount, 0))}원 / skip ${plan.length - live.length}건`);
  if (!live.length) process.exit(0);
  snapshot('charge-plan', { month: MONTH, applied: APPLY, plan: plan.map((p) => ({ reportId: p.report.id, email: p.email, amount: p.amount, skip: p.skip })) });
  if (!APPLY) { console.log('\nDRY-RUN — --apply 로 실제 카드 결제합니다.'); process.exit(0); }

  // 가드 1: cron 락 — 3일 cron / 관리자 즉시청구와 동시 실행 차단
  const { data: lockOk } = await sb.rpc('cron_try_acquire_lock', { p_key: LOCK_KEY, p_ttl_seconds: 1800, p_acquired_by: 'script:bill-2026-09' });
  if (!lockOk) { console.error('락 획득 실패 — auto-billing cron 또는 관리자 즉시청구가 실행 중입니다. 중단.'); process.exit(1); }

  const results = [];
  try {
    for (const p of live) {
      const rid = p.report.id;
      // 가드 2: 5분 이상 hang 된 pending tx 종결
      await sb.from('payment_transactions').update({
        status: 'failed', failure_code: 'STALE_PENDING', failure_message: '응답 없는 pending tx 자동 정리',
        failed_at: new Date().toISOString(), is_final_failure: false,
      }).eq('monthly_report_id', rid).eq('status', 'pending').lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      // 가드 3: 결제 직전 재확인 (paid 또는 success tx 있으면 is_billable=false)
      const { data: checkData, error: checkErr } = await sb.rpc('safe_check_report_for_billing', { p_report_id: rid });
      const check = Array.isArray(checkData) ? checkData[0] : checkData;
      if (checkErr || !check?.is_billable) {
        console.log(` [skip] ${p.email} — pre-check 차단: ${check?.reason || checkErr?.message || 'unknown'}`);
        results.push({ email: p.email, status: 'pre_check_blocked', reason: check?.reason || checkErr?.message });
        continue;
      }

      // 가드 4: pending tx 선점 — 동일 리포트 동시 결제는 UNIQUE 로 실패
      const orderId = `FEE_${MONTH.replace('-', '')}_${p.report.pt_user_id.replace(/-/g, '').slice(0, 8)}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
      const { data: tx, error: txErr } = await sb.from('payment_transactions').insert({
        pt_user_id: p.report.pt_user_id,
        monthly_report_id: rid,
        billing_card_id: p.card.id,
        toss_order_id: orderId,
        amount: p.amount,
        penalty_amount: 0,
        total_amount: p.amount,
        status: 'pending',
        payment_method: 'card',
        is_auto_payment: true,
      }).select().single();
      if (!tx || txErr) {
        console.log(` [skip] ${p.email} — pending tx 선점 실패(중복 가능): ${txErr?.message}`);
        results.push({ email: p.email, status: 'tx_insert_failed', reason: txErr?.message });
        continue;
      }

      try {
        const res = await fetch(`https://api.tosspayments.com/v1/billing/${p.card.billing_key}`, {
          method: 'POST',
          headers: { Authorization: tossAuth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerKey: p.card.customer_key,
            amount: p.amount,
            orderId,
            orderName: `메가로드 수수료 ${MONTH} (한시 20% 할인)`,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        const data = await res.json();
        if (!res.ok) throw Object.assign(new Error(data?.message || `결제 실패 ${res.status}`), { code: data?.code || 'UNKNOWN', raw: data });
        if (data.status !== 'DONE') throw Object.assign(new Error(`결제 미완료 상태: ${data.status}`), { code: `NOT_DONE_${data.status}`, raw: data });

        // 가드 5: 성공 마킹은 멱등 RPC 로만
        const { error: markErr } = await sb.rpc('payment_mark_success', {
          p_tx_id: tx.id,
          p_payment_key: data.paymentKey,
          p_receipt_url: data.receipt?.url || null,
          p_raw: data,
          p_approved_at: data.approvedAt,
        });
        if (markErr) throw Object.assign(new Error(`결제는 승인됐으나 마킹 실패: ${markErr.message}`), { code: 'MARK_FAILED', raw: data });

        await sb.from('monthly_reports').update({ fee_surcharge_amount: 0, fee_interest_amount: 0 }).eq('id', rid);
        if (p.profileId) {
          await sb.from('notifications').insert({
            user_id: p.profileId,
            type: 'fee_payment',
            title: '수수료 결제 완료',
            message: `${MONTH} 수수료 ${won(p.amount)}원이 결제되었습니다. (한시 20% 할인 적용)`,
            link: '/my/report',
          });
        }
        console.log(` [성공] ${p.email.padEnd(28)} ${won(p.amount)}원 paymentKey=${String(data.paymentKey).slice(0, 14)}…`);
        results.push({ email: p.email, status: 'success', amount: p.amount, paymentKey: data.paymentKey, receipt: data.receipt?.url || null });
      } catch (payErr) {
        const code = payErr?.code || 'UNKNOWN';
        const retryable = isRetryable(code);
        await sb.from('payment_transactions').update({
          status: 'failed', failure_code: code, failure_message: payErr?.message || '스크립트 결제 실패',
          raw_response: payErr?.raw || null, failed_at: new Date().toISOString(), retry_count: 0,
          // 재시도 가능 코드만 payment-retry cron 이 집어가도록 next_retry_at 을 세팅한다(24h 뒤).
          // 그 외는 최종실패로 종결 — next_retry_at 이 null 인 채 is_final_failure=false 로 남으면
          // 어떤 cron 도 집어가지 않는 좀비 행이 된다.
          next_retry_at: retryable ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
          is_final_failure: !retryable,
          final_failed_at: retryable ? null : new Date().toISOString(),
        }).eq('id', tx.id);
        console.log(` [실패] ${p.email.padEnd(28)} ${code}${retryable ? '(24h 뒤 자동 재시도)' : '(최종실패 — 재시도 불가 코드)'} — ${payErr?.message}`);
        results.push({ email: p.email, status: 'failed', code, retryable, message: payErr?.message });
      }
    }
  } finally {
    await sb.rpc('cron_release_lock', { p_key: LOCK_KEY });
  }

  const succeeded = results.filter((r) => r.status === 'success');
  console.log(`\n결과: 성공 ${succeeded.length} / 실패 ${results.filter((r) => r.status === 'failed').length} / skip ${results.length - succeeded.length - results.filter((r) => r.status === 'failed').length}`);
  console.log(`수납액 합계 ${won(succeeded.reduce((s, r) => s + r.amount, 0))}원`);
  snapshot('charge-result', { month: MONTH, at: new Date().toISOString(), results });
  console.log('\n다음 단계: 관리자 > 결제관리 > 정산 후처리 복구(settlement-recovery) 실행 — revenue_entries/트레이너 보너스/세금계산서 생성');
}
