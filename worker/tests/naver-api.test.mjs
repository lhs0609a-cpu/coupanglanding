import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function loadRoute(name, { admin = false, owner = 'seller-1', status = 'running', claimed = ['a'], error = null } = {}) {
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
        else if (name === 'detail') data = this.patch ? [{ id: 'a' }] : { id: 'a', detail_requested_by: owner, detail_status: status };
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
  return { route: mod.namespace, updates };
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
