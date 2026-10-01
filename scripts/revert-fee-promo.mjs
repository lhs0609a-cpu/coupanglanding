/**
 * 한시 수수료 할인 원복 — apply-fee-promo.mjs 가 남긴 스냅샷 기준.
 *
 * 코드 쪽 할인(fee-promo.ts)은 FEE_PROMO_YEAR_MONTHS 에서 해당 월을 빼면 꺼지고,
 * 이 스크립트는 그 전에 이미 금액이 깎여 저장된 행을 원래 금액으로 되돌린다.
 *
 * 결제 완료(paid)된 행은 되돌리지 않는다 — 이미 할인가로 청구·세금계산서 발행됐으므로
 * 금액을 올리면 장부와 어긋난다.
 *
 * 사용:
 *   node scripts/revert-fee-promo.mjs artifacts/fee-promo-2026-09-....json          # dry-run
 *   node scripts/revert-fee-promo.mjs artifacts/fee-promo-2026-09-....json --apply
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const snapPath = args.find((a) => !a.startsWith('--'));
if (!snapPath) {
  console.error('사용법: node scripts/revert-fee-promo.mjs <스냅샷.json> [--apply]');
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

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
console.log(`스냅샷 ${snapPath} — ${snap.month} / ${snap.changes.length}건 / 모드 ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

let ok = 0, skipped = 0, fail = 0;
for (const c of snap.changes) {
  const { data: cur } = await sb
    .from('monthly_reports')
    .select('id, fee_payment_status, supply_amount, total_with_vat')
    .eq('id', c.id)
    .maybeSingle();
  if (!cur) { console.log(' 없음', c.email); skipped++; continue; }
  if (cur.fee_payment_status === 'paid') {
    console.log(` skip(이미 결제됨) ${c.email} — 할인가 ${cur.total_with_vat?.toLocaleString()} 로 청구 완료`);
    skipped++; continue;
  }
  console.log(` ${c.email} | 청구 ${cur.total_with_vat?.toLocaleString()} → ${c.before.total_with_vat?.toLocaleString()}`);
  if (!APPLY) continue;
  const { error } = await sb.from('monthly_reports').update(c.before).eq('id', c.id);
  if (error) { fail++; console.error('  실패', error.message); } else { ok++; }
}
console.log(`\n${APPLY ? `원복 완료: 성공 ${ok}건 / 실패 ${fail}건 / skip ${skipped}건` : `DRY-RUN — skip ${skipped}건. 실제 원복은 --apply`}`);
