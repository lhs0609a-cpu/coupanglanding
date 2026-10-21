import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function loadRoute(name, { admin = false, owner = 'seller-1', status = 'running', claimed = ['a'], error = null, prevDetail = null, adoptGives = 0 } = {}) {
  const adopted = [];
  const adoptedNone = [];
  const revived = [];
  const updates = [];
  const rows = [{ id: 'a', product_no: '1234', url: 'https://smartstore.naver.com/shop/products/1234' },
    { id: 'b', product_no: '5678', url: 'https://smartstore.naver.com/shop/products/5678' }];
  const service = { from(table) {
    const query = { table, filters: [], patch: null,
      select() { return this; }, update(patch) { this.patch = patch; updates.push(this); return this; },
      insert() { assert.fail('셀러가 새 상품을 삽입해서는 안 됨'); },
      eq(key, value) { this.filters.push([key, value]); return this; },
      in(key, value) { this.filters.push([key, value]); return this; },
      lt() { return this; }, order() { return this; }, limit() { return this; },
      single() { return this; }, maybeSingle() { return this; },
      then(resolve, reject) {
        let data;
        if (table === 'profiles') data = { role: admin ? 'admin' : 'seller' };
        else if (table === 'megaload_users') data = { id: 'seller-1' };
        else if (name === 'detail') data = this.patch ? [{ id: 'a' }] : { id: 'a', detail_requested_by: owner, detail_status: status, detail: prevDetail };
        else data = this.patch ? rows.filter((r) => claimed.includes(r.id)) : rows;
        return Promise.resolve({ data, error: this.patch ? error : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const auth = { auth: { getUser: async () => ({ data: { user: { id: 'profile-1' } } }) } };
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => auth },
    '@/lib/supabase/server': { createClient: async () => auth, createServiceClient: async () => service },
    '@/lib/megaload/naver-store-type': { isDetailExtractable: () => true },
    // 로그인한 셀러 도우미가 자기 몫이 없을 때 스스로 일감을 가져가는 경로.
    '@/lib/megaload/detail-queue-assign': {
      adoptUnownedWork: async (_svc, uid, want) => { adopted.push({ uid, want }); return adoptGives; },
      adoptUnrequested: async (_svc, uid, want) => { adoptedNone.push({ uid, want }); return 0; },
      reviveFailed: async () => { revived.push(1); return 0; },
    },
  };
  const source = await readFile(new URL(`../../src/app/api/megaload/naver-sourcing/products/${name}/route.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ URL, Date, Set, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key' } } });
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link((id) => {
    const exports = mocks[id]; assert.ok(exports, id);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  });
  await mod.evaluate();
  return { route: mod.namespace, updates, adopted, adoptedNone, revived };
}

const request = (body = {}) => ({ headers: new Headers({ authorization: 'Bearer test-session' }), url: 'https://test.invalid/?limit=3', json: async () => body });

test('셀러가 본인 요청의 상세 결과를 저장한다', async () => {
  const { route, updates } = await loadRoute('detail');
  const result = await route.POST(request({ productNo: '1234', ok: true, title: '유리 냉수통', images: { main: ['https://images.test/a.jpg'] }, reviewTexts: [{ text: '용량 표시가 있어 확인하기 편해요.', score: 5 }] }));
  assert.equal(result.status, 200);
  assert.ok(updates[0].filters.some(([key, value]) => key === 'detail_requested_by' && value === 'seller-1'));
  assert.ok(updates[0].filters.some(([key, value]) => key === 'detail_status' && value === 'running'));
  assert.equal(updates[0].patch.detail.reviewTexts[0].score, 5);
});

test('다른 셀러 요청과 완료된 상품을 덮어쓸 수 없다', async () => {
  for (const config of [{ owner: 'seller-2' }, { status: 'done' }]) {
    const { route, updates } = await loadRoute('detail', config);
    const result = await route.POST(request({ productNo: '1234', ok: false, error: 'test' }));
    assert.equal(result.status, 403); assert.equal(updates.length, 0);
  }
});

test('차단 실패 사유와 재시도 여부가 서버에 보존된다', async () => {
  const { route, updates } = await loadRoute('detail');
  assert.equal((await route.POST(request({ productNo: '1234', ok: false, error: 'API 419', blocked: true, retryable: true, apiStatus: 419 }))).status, 200);
  assert.equal(updates[0].patch.detail.apiStatus, 419);
});

test('상품명·대표이미지가 없으면 완료로 저장하지 않는다', async () => {
  const { route, updates } = await loadRoute('detail');
  assert.equal((await route.POST(request({ productNo: '1234', ok: true }))).status, 400);
  assert.equal(updates.length, 0);
});

test('여러 에이전트가 경쟁해도 실제로 선점한 작업만 반환한다', async () => {
  const { route, updates } = await loadRoute('queue');
  const result = await route.GET(request());
  assert.equal(result.status, 200); assert.equal(result.body.jobs.length, 1); assert.equal(result.body.jobs[0].id, 'a');
  const claim = updates.find((q) => q.patch.detail_status === 'running');
  assert.ok(claim.filters.some(([k, v]) => k === 'detail_status' && v.includes('requested')));
  assert.ok(claim.filters.some(([k, v]) => k === 'detail_requested_by' && v === 'seller-1'));
});

test('선점 저장이 실패하면 작업을 반환하지 않는다', async () => {
  const { route } = await loadRoute('queue', { error: { message: 'DB unavailable' } });
  const result = await route.GET(request()); assert.equal(result.status, 500); assert.equal(result.body.jobs, undefined);
});

test('자기 몫이 없는 셀러 도우미는 주인 없는 일감을 스스로 가져간다', async () => {
  // 도우미는 네이버 로그인이 있을 때만 큐를 돈다 → 폴링했다는 것 자체가 "지금 일할 수 있다".
  // 선배정만 쓰던 때 로그인한 셀러가 빈 손으로 돌아가 수집이 통째로 멈췄다(2026-10-13).
  const { route, adopted } = await loadRoute('queue');
  await route.GET(request());
  assert.equal(adopted.length, 1, '셀러는 자기 몫이 비면 가져오기를 시도해야 한다');
  assert.equal(adopted[0].uid, 'seller-1');
  assert.ok(adopted[0].want > 0);
});

test('관리자 도우미는 가져오기를 하지 않는다 — 어차피 전량을 집는다', async () => {
  const { route, adopted } = await loadRoute('queue', { admin: true });
  await route.GET(request());
  assert.equal(adopted.length, 0);
});

test('상품 탓이 아닌 실패(release)는 failed 로 굳히지 않고 큐에 돌려놓는다', async () => {
  // 워커를 끈 순간·로그인 끊김·캡차까지 failed 로 남아 다시는 안 뽑히던 것(2026-10-21).
  const { route, updates } = await loadRoute('detail');
  assert.equal((await route.POST(request({ productNo: '1234', ok: false, release: true, error: 'aborted' }))).status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.detail_status, 'requested');
  assert.equal(updates[0].patch.detail, undefined, '실패 기록을 덮어쓰면 안 된다');
});

test('실패 횟수를 센다 — 옛 기록(횟수 없음)은 1번으로 본다', async () => {
  for (const [prevDetail, want] of [[null, 1], [{ error: 'old' }, 2], [{ error: 'x', attempts: 3 }, 4]]) {
    const { route, updates } = await loadRoute('detail', { prevDetail });
    await route.POST(request({ productNo: '1234', ok: false, error: 'timeout', retryable: true }));
    assert.equal(updates[0].patch.detail_status, 'failed');
    assert.equal(updates[0].patch.detail.attempts, want);
  }
});

test('큐 폴링마다 일시 실패를 되살린다', async () => {
  const { route, revived } = await loadRoute('queue');
  await route.GET(request());
  assert.equal(revived.length, 1);
});

test('요청 일감이 바닥난 셀러는 아직 안 고른 상품까지 채운다 — 요청분이 있으면 손대지 않는다', async () => {
  const empty = await loadRoute('queue');
  await empty.route.GET(request());
  assert.equal(empty.adoptedNone.length, 1);
  assert.equal(empty.adoptedNone[0].uid, 'seller-1');

  const busy = await loadRoute('queue', { adoptGives: 3 });
  await busy.route.GET(request());
  assert.equal(busy.adoptedNone.length, 0, '요청 일감을 가져왔으면 미요청분은 건드리지 않는다');
});

async function loadAssignLib(failedRows) {
  const updates = [];
  const service = { from() {
    const q = { filters: [], patch: null,
      select() { return this; }, update(patch) { this.patch = patch; updates.push(this); return this; },
      eq(k, v) { this.filters.push([k, v]); return this; }, in(k, v) { this.filters.push([k, v]); return this; },
      lt() { return this; }, order() { return this; }, limit() { return this; },
      then(resolve, reject) {
        const ids = this.filters.find(([k]) => k === 'id')?.[1] || [];
        const data = this.patch ? ids.map((id) => ({ id })) : failedRows;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
  const source = await readFile(new URL('../../src/lib/megaload/detail-queue-assign.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ Date, Set, Map, Number, console });
  const mod = new vm.SourceTextModule(code, { context });
  const mocks = { '@/lib/megaload/naver-store-type': { isDetailExtractable: (u) => /smartstore/.test(u) } };
  await mod.link((id) => {
    const exports = mocks[id]; assert.ok(exports, id);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  });
  await mod.evaluate();
  return { lib: mod.namespace, service, updates };
}

test('reviveFailed — 일시 실패만 되살리고 영구 실패·횟수 초과·미지원 주소는 뒤로 보낸다', async () => {
  const ss = (n) => `https://smartstore.naver.com/s/products/${n}`;
  const { lib, service, updates } = await loadAssignLib([
    { id: 'timeout', url: ss(1), detail: { error: '시간 초과', retryable: true, attempts: 1 } },
    { id: 'legacy', url: ss(2), detail: { error: 'no-navigation' } },
    { id: 'gone', url: ss(3), detail: { error: 'API 404', apiStatus: 404 } },
    { id: 'tired', url: ss(4), detail: { error: '419', attempts: 5 } },
    { id: 'market', url: 'https://shopping.naver.com/market/x/products/5', detail: null },
  ]);
  assert.equal(await lib.reviveFailed(service), 2);
  const revive = updates.find((u) => u.patch.detail_status === 'requested');
  assert.deepEqual(revive.filters.find(([k]) => k === 'id')[1], ['timeout', 'legacy']);
  assert.equal(revive.patch.detail_requested_by, null, '지금 켜진 도우미가 가져가도록 주인을 비운다');
  const pushBack = updates.find((u) => u.patch.detail_at && !u.patch.detail_status);
  assert.deepEqual(pushBack.filters.find(([k]) => k === 'id')[1], ['gone', 'tired', 'market']);
});
