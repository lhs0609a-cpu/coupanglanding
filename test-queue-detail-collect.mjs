// 네이버 소싱 상세 수집 일괄 요청 — 미수집(none) + 수집실패(failed) 를 큐에 올린다.
//
// 실제 수집은 관리자 PC 의 도우미가 한다. 이 스크립트는 "가져와 달라"고 표시만 남긴다
// (detail_status='requested'). 도우미가 5건씩 가져가 네이버에서 상세를 뽑는다.
//
// ⚠ 상세를 못 뽑는 주소(스마트스토어·브랜드스토어 외)는 큐에 넣지 않는다.
//   넣으면 도우미가 재시도 6회 + 캡차 대기까지 매달렸다 실패하고, stale 복구가 되살려
//   같은 실패를 무한 반복한다(큐 라우트의 실측 주석). 그런 건 failed 로 확정해 큐에서 뺀다.
//
// 사용:
//   node test-queue-detail-collect.mjs            # 미리보기만
//   node test-queue-detail-collect.mjs --apply    # 실제로 큐에 올림
//   node test-queue-detail-collect.mjs --apply --only-none   # 미수집분만
import { readFileSync } from 'fs';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const APPLY = process.argv.includes('--apply');
const ONLY_NONE = process.argv.includes('--only-none');

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\//, '') },
});
const { isDetailExtractable, unsupportedReason } = await jiti.import('./src/lib/megaload/naver-store-type.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const statuses = ONLY_NONE ? ['none'] : ['none', 'failed'];

// 전량을 페이지로 끊어 가져온다 (PostgREST 는 1000행 상한)
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data: page, error } = await supabase
    .from('sh_naver_sourcing_products')
    .select('id, url, title, detail_status, detail_request_count')
    .in('detail_status', statuses)
    .range(from, from + 999);
  if (error) { console.error('조회 실패:', error.message); process.exit(1); }
  if (!page || page.length === 0) break;
  rows.push(...page);
  if (page.length < 1000) break;
}

const queueable = rows.filter((r) => isDetailExtractable(r.url));
const blocked = rows.filter((r) => !isDetailExtractable(r.url));

const byStatus = {};
for (const r of queueable) byStatus[r.detail_status] = (byStatus[r.detail_status] || 0) + 1;

console.log(`대상 ${rows.length}건 (${statuses.join(', ')})\n`);
console.log(`큐에 올릴 것   : ${queueable.length}건  ${JSON.stringify(byStatus)}`);
console.log(`상세 추출 불가 : ${blocked.length}건 — failed 로 확정해 큐에서 제외`);

if (blocked.length) {
  const reasons = {};
  for (const b of blocked.slice(0, 500)) {
    const r = unsupportedReason(b.url);
    reasons[r] = (reasons[r] || 0) + 1;
  }
  console.log('  사유:');
  for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`    ${n}건  ${r}`);
}

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 올리려면 --apply 를 붙이세요.');
  process.exit(0);
}

const now = new Date().toISOString();
let queued = 0;

// requested 로 올린다. 500건씩 끊어 처리 — 한 번에 수천 건을 밀면 타임아웃이 난다.
for (let i = 0; i < queueable.length; i += 500) {
  const chunk = queueable.slice(i, i + 500);
  const { error } = await supabase
    .from('sh_naver_sourcing_products')
    .update({ detail_status: 'requested', detail_requested_at: now })
    .in('id', chunk.map((r) => r.id));
  if (error) { console.error(`\n큐 등록 실패(${i}~):`, error.message); break; }
  queued += chunk.length;
  console.log(`  큐 등록 ${queued}/${queueable.length}`);
}

// 못 뽑는 주소는 failed 로 확정 — 도우미가 붙잡고 무한 재시도하지 않게.
let marked = 0;
for (let i = 0; i < blocked.length; i += 500) {
  const chunk = blocked.slice(i, i + 500);
  const { error } = await supabase
    .from('sh_naver_sourcing_products')
    .update({ detail_status: 'failed', detail_at: now })
    .in('id', chunk.map((r) => r.id));
  if (!error) marked += chunk.length;
}

console.log(`\n큐 등록 ${queued}건 · 추출불가 확정 ${marked}건`);
console.log('이제 관리자 PC 의 도우미가 5건씩 가져가 상세를 수집합니다.');
console.log('진행 확인: node test-queue-detail-collect.mjs (상태별 잔량이 보입니다)');
