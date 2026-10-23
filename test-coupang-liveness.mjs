// 삭제 판정 단위검증 — 쿠팡/DB 를 건드리지 않는다(가짜 어댑터·가짜 클라이언트).
//   핵심 불변식: "목록을 끝까지 못 봤으면 아무것도 지웠다고 하지 않는다".
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': 'D:/developer/coupanglanding/src' },
});
const { sweepLiveProductIds, markGoneProducts } =
  await jiti.import('D:/developer/coupanglanding/src/lib/megaload/services/coupang-liveness.ts');

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

// ── 가짜 어댑터 ──────────────────────────────────────────────
function adapterOf(pages, { throwAt = -1, transient = false } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    async getProducts({ nextToken }) {
      const idx = nextToken ? Number(nextToken) : 0;
      calls++;
      if (idx === throwAt) throw new Error(transient ? 'API 429: rate limited' : 'API 401: key revoked');
      const page = pages[idx] || [];
      return {
        items: page.map((id) => ({ sellerProductId: id })),
        totalCount: page.length,
        nextToken: idx + 1 < pages.length ? String(idx + 1) : null,
      };
    },
  };
}

console.log('\n[1] 전체 목록을 끝까지 받으면 complete=true');
{
  const a = adapterOf([['1', '2'], ['3']]);
  const r = await sweepLiveProductIds(a);
  t('complete', r.complete === true);
  t('3개 수집', r.ids.size === 3 && r.ids.has('3'));
}

console.log('\n[2] 영구 오류(키 revoked)는 complete=false — 삭제 판정 금지 신호');
{
  const a = adapterOf([['1'], ['2']], { throwAt: 1 });
  const r = await sweepLiveProductIds(a);
  t('complete=false', r.complete === false);
  t('에러 전달', /401/.test(r.error || ''));
  t('재시도 안 함(1+1회)', a.calls() === 2);
}

console.log('\n[3] 일시 오류(429)는 재시도한다');
{
  const a = adapterOf([['1']], { throwAt: 9, transient: true });
  const r = await sweepLiveProductIds(a);
  t('성공 처리', r.complete === true);
}
{
  const a = adapterOf([['1'], ['2']], { throwAt: 1, transient: true });
  const r = await sweepLiveProductIds(a);
  t('3회 재시도 후 포기', a.calls() === 4 && r.complete === false);
}

console.log('\n[4] 페이지 상한에 걸리면 complete=false');
{
  const many = Array.from({ length: 5 }, (_, i) => [String(i)]);
  const r = await sweepLiveProductIds(adapterOf(many), { maxPages: 2 });
  t('complete=false', r.complete === false);
  t('이유 명시', /끝까지/.test(r.error || ''));
}

// ── 가짜 supabase ────────────────────────────────────────────
function fakeClient() {
  const writes = [];
  const chain = (table) => {
    const ctx = { table, filters: {} };
    const self = {
      update(payload) { ctx.payload = payload; return self; },
      eq(k, v) { ctx.filters[k] = v; return self; },
      is(k, v) { ctx.filters[k] = v; return self; },
      in(k, v) { ctx.filters[k] = v; return self; },
      then(res) { writes.push(ctx); return Promise.resolve({ error: null }).then(res); },
    };
    return self;
  };
  return { writes, from: (table) => chain(table) };
}

console.log('\n[5] 목록에 없는 기록만 deleted 로 표시한다');
{
  const c = fakeClient();
  const live = new Set(['live-1']);
  const marked = await markGoneProducts(c, 'user-A', live, [
    { id: 'row-live', coupangProductId: 'live-1' },
    { id: 'row-gone', coupangProductId: 'gone-9' },
    { id: 'row-null', coupangProductId: null },
  ]);
  t('사라진 1건만 반환', marked.length === 1 && marked[0] === 'gone-9');
  const products = c.writes.find((w) => w.table === 'sh_products');
  t('sh_products status=deleted', products?.payload?.status === 'deleted');
  t('대상은 row-gone 뿐', JSON.stringify(products?.filters?.id) === JSON.stringify(['row-gone']));
  t('계정 한정', products?.filters?.megaload_user_id === 'user-A');
  t('채널상품번호 없는 기록은 건드리지 않음', !JSON.stringify(products?.filters?.id || []).includes('row-null'));
  const chans = c.writes.find((w) => w.table === 'sh_product_channels');
  t('채널 리스팅도 deleted', chans?.payload?.status === 'deleted' && chans.filters.channel === 'coupang');
  const ledger = c.writes.find((w) => w.table === 'catalog_registrations');
  t('장부엔 deleted_at 만 적는다', !!ledger?.payload?.deleted_at && !('status' in (ledger?.payload || {})));
  t('이미 적힌 건 다시 안 적는다', ledger?.filters?.deleted_at === null);
}

console.log('\n[6] 전부 살아있으면 아무것도 쓰지 않는다');
{
  const c = fakeClient();
  const marked = await markGoneProducts(c, 'user-A', new Set(['a', 'b']), [
    { id: 'r1', coupangProductId: 'a' }, { id: 'r2', coupangProductId: 'b' },
  ]);
  t('표시 0건', marked.length === 0);
  t('DB 쓰기 0회', c.writes.length === 0);
}

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
