const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');

function load(path, mocks = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (name) => mocks[name] || require(name),
    URL, Response, File, Blob, Buffer, Uint8Array, AbortSignal, console,
    process: { env: {} }, ...globals,
  }, { filename: path });
  return exports;
}

async function main() {
  let response = new Response(Buffer.from('image'), { headers: { 'Content-Type': 'image/jpeg' } });
  const adapter = load('src/lib/megaload/catalog-manual-import.ts', {}, { fetch: async () => response });
  const product = {
    id: '11111111-1111-4111-8111-111111111111', productNo: '1234567890', title: '테스트 상품',
    url: 'https://smartstore.naver.com/test/products/1234567890', price: 12000, brand: '브랜드',
    categoryId: '50000000', categoryPath: '생활/건강', detailText: '원본 상세',
    options: [{ optionName: '빨강', price: 13000 }], notice: { 원산지: '한국' }, reviewTexts: [],
    images: { main: ['https://shop-phinf.pstatic.net/main.jpg'], detail: ['https://shop-phinf.pstatic.net/detail.jpg'], review: [] },
  };
  const scan = adapter.catalogToScan([product], 'test');
  const source = scan.products[0];
  assert.equal(source.productCode, product.productNo);
  assert.equal(source.sourceUrl, product.url);
  assert.equal(source.productJson.price, 12000);
  assert.equal(source.productJson.naverCategoryId, product.categoryId);
  assert.equal(source.productJson.catalogSource.options, product.options);
  assert.equal(source.productJson.catalogSource.notice, product.notice);
  assert.equal(source.detailImages.length, 1);
  assert.match(source.mainImages[0].objectUrl, /group=main&index=0$/);
  const file = await source.mainImages[0].handle.getFile();
  assert.equal(file.type, 'image/jpeg');
  assert.equal(file.size, 5);
  response = new Response('failed', { status: 502 });
  await assert.rejects(source.mainImages[0].handle.getFile(), /502/);
  response = new Response('<html/>', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(source.mainImages[0].handle.getFile(), /이미지 응답/);
  assert.throws(() => adapter.catalogToScan([{ ...product, productNo: '../bad' }], 'test'), /상품번호/);
  assert.throws(() => adapter.catalogToScan([{ ...product, images: { ...product.images, main: [] } }], 'test'), /대표이미지/);

  let user = { id: 'user' };
  let row = { detail_status: 'done', images: product.images, thumb: null };
  let calls = 0;
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  let upstream = () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
  let fetchOptions;
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/server': {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
      createServiceClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) }),
    },
  };
  const route = load('src/app/api/megaload/naver-sourcing/products/image/route.ts', mocks, {
    fetch: async (_url, options) => { calls++; fetchOptions = options; return upstream(); },
  });
  const request = (suffix = '') => ({ nextUrl: new URL(`https://app.test/api?id=${product.id}&group=main&index=0${suffix}`) });
  user = null;
  assert.equal((await route.GET(request())).status, 401);
  user = { id: 'user' };
  assert.equal((await route.GET({ nextUrl: new URL('https://app.test/?id=bad') })).status, 400);
  row = null;
  assert.equal((await route.GET(request())).status, 404);
  row = { detail_status: 'none', images: product.images };
  assert.equal((await route.GET(request())).status, 404);
  row = { detail_status: 'done', images: { main: ['https://pstatic.net.attacker.test/x'] } };
  assert.equal((await route.GET(request())).status, 400);
  assert.equal(calls, 0);
  row = { detail_status: 'done', images: product.images };
  let result = await route.GET(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(fetchOptions.redirect, 'error');
  assert.equal((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).format, 'jpeg');
  upstream = () => new Response('not an image');
  assert.equal((await route.GET(request())).status, 502);
  upstream = () => new Response('denied', { status: 403 });
  assert.equal((await route.GET(request())).status, 502);

  const exportRoute = load('src/app/api/megaload/naver-sourcing/products/export/route.ts', mocks);
  for (const body of [null, {}, { ids: 'bad' }, { ids: [] }]) {
    assert.equal((await exportRoute.POST({ json: async () => body })).status, 400);
  }
  assert.equal((await exportRoute.POST({ json: async () => ({ ids: Array.from({ length: 201 }, (_, i) => String(i)) }) })).status, 400);

  // Exercise the actual import component's handlers without issuing any listing writes.
  const state = [];
  let cursor = 0;
  let mounted = false;
  let effects = [];
  let imported = null;
  let requests = [];
  const component = load('src/components/megaload/bulk/CatalogManualImport.tsx', {
    react: {
      useState: (initial) => {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], (value) => { state[i] = value; }];
      },
      useEffect: (fn) => { if (!mounted) effects.push(fn); },
    },
    '@/lib/megaload/catalog-manual-import': adapter,
    '@/lib/megaload/naver-ingest-local': { findHelper: async () => null, kickQueue: async () => {} },
  }, {
    URLSearchParams,
    window: { location: { search: '?catalog=test' } },
    sessionStorage: { getItem: () => JSON.stringify({ ids: [product.id, 'missing'], at: Date.now() }) },
    fetch: async (url) => {
      requests.push(url);
      return Response.json({ products: [product], skipped: [{ id: 'missing', title: '미준비 상품', reason: '상세 미확보' }] });
    },
  }).default;
  function render(ready = true) {
    cursor = 0;
    const tree = component({ ready, onImport: (scan) => { imported = scan; } });
    effects.forEach((fn) => fn()); effects = []; mounted = true;
    return tree;
  }
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  function label(node) {
    if (Array.isArray(node)) return node.map(label).join('');
    return typeof node === 'object' && node ? label(node.props?.children) : String(node ?? '');
  }
  render();
  let button = elements(render(false)).find((el) => el.type === 'button');
  assert.equal(button.props.disabled, true);
  await button.props.onClick();
  assert.equal(requests.length, 0);
  button = elements(render()).find((el) => el.type === 'button');
  await button.props.onClick();
  assert.equal(imported, null, 'Missing selections must not be silently dropped');
  const tree = render();
  assert.match(label(tree), /미준비 상품/);
  button = elements(tree).find((el) => el.type === 'button' && label(el).includes('개만 검수'));
  button.props.onClick();
  assert.equal(imported.products.length, 1);
  assert.equal(imported.products[0].productCode, product.productNo);
  assert.deepEqual(requests, ['/api/megaload/naver-sourcing/products/export']);
  console.log('PASS: catalog mapping, source preservation, image reader failures, authenticated image proxy, host validation, image decoding, export input validation');
  console.log('PASS: manual settings gate, missing-product disclosure, explicit partial import, no automatic listing writes');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
