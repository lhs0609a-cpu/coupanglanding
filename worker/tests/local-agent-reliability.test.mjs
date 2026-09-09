import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import gate from '../desktop/main/naver-gate.mjs';
import { TabPool } from '../desktop/main/modules/naver-ingest/tab-pool.mjs';
import { ChromeTab } from '../desktop/main/modules/naver-ingest/chrome-tab.mjs';
import { openProduct, parseProductUrl } from '../desktop/main/modules/naver-ingest/runner.mjs';
import { extractOne, writeProductFolder } from '../desktop/main/modules/naver-ingest/detail-extract.mjs';
import { downloadImage } from '../desktop/main/modules/naver-ingest/image-download.mjs';
import { generate, generateVision, hasModel } from '../lib/local-llm.mjs';
import { generateAllFields } from '../lib/ai-generator.mjs';
import { buildDetailPrompt, pickPersona } from '../lib/ai-prompts.mjs';
import { validateDetail, generatePerfectDetail } from '../lib/detail-content-gen.mjs';
import { lineStream } from '../desktop/main/line-stream.mjs';
import { stepInto } from '../desktop/main/modules/naver-ingest/chrome-navigate.mjs';
import { generateBatch } from '../lib/ai-batch.mjs';
import vm from 'node:vm';
import { extractDetailJs } from '../desktop/main/modules/naver-ingest/detail-extract.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const url = 'https://smartstore.naver.com/shop/products/1234567';
test('검수 실패한 생성문 대신 원본 옵션 초안을 반환하고 검수를 요구한다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ response: '신선도를 완벽하게 보장합니다.' }));
  const result = await generatePerfectDetail({ model: 'test', originalName: '참외 3kg', categoryPath: '식품>참외',
    features: ['3kg 소과(14-20과)', '3kg 중과(8-12과)'], sourceFacts: ['전 옵션 망포장 발송'], maxAttempts: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.text.includes('3kg 소과(14-20과)'));
  assert.ok(result.text.includes('전 옵션 망포장 발송'));
  assert.ok(!result.text.includes('보장'));
  assert.ok(result.issues.some((s) => s.includes('원문 기반 초안')));
});

test('상세 설명은 구조화된 문단과 세 가지 요점으로 요청한다', () => {
  const result = buildDetailPrompt({ originalName: '참외 3kg', categoryPath: '과일 > 참외' }, { focus: '구성' });
  assert.equal(result.format.properties.body.minItems, 2);
  assert.equal(result.format.properties.bullets.maxItems, 3);
  assert.deepEqual(result.format.required, ['intro', 'body', 'bullets', 'closing']);
});

test('생성한 검색어는 원본에 없는 맛과 기능을 입증하지 않는다', () => {
  const result = validateDetail('달콤한 참외입니다.', { vocab: '참외 3kg', seoKeywords: ['달콤'] });
  assert.ok(result.issues.some((issue) => issue.includes('원본 근거에 없는 특징(달콤)')));
  const grounded = validateDetail('달콤한 참외입니다.', { vocab: '달콤한 참외 3kg' });
  assert.ok(!grounded.issues.some((issue) => issue.includes('원본 근거에 없는 특징')));
});

const tab = (extra = {}) => ({
  url, status: 'idle', alive: true, gotoViaClick: async () => ({ ok: true }),
  detect: async () => ({}), humanize: async () => {}, evaluate: async () => ({ name: '유리 냉수통' }),
  close() { this.status = 'closed'; this.alive = false; }, ...extra,
});
const neverFetch = (_url, { signal }) => new Promise((_, reject) => {
  if (signal.aborted) return reject(signal.reason);
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('실패가 차단 레벨 3을 더 빠른 레벨 2로 낮추지 않는다', () => {
  const saved = gate.level;
  gate.level = 3; gate.recordFailure(); assert.equal(gate.level, 3); gate.level = saved;
});

test('다른 탭의 성공이 차단 중의 백오프를 초기화하지 않는다', () => {
  const saved = { cooldownUntil: gate.cooldownUntil, blockStreak: gate.blockStreak, level: gate.level, successStreak: gate.successStreak };
  Object.assign(gate, { cooldownUntil: Date.now() + 60000, blockStreak: 3, level: 3, successStreak: 0 });
  try { gate.recordSuccess(); assert.equal(gate.blockStreak, 3); assert.equal(gate.level, 3); assert.equal(gate.successStreak, 0); }
  finally { Object.assign(gate, saved); }
});

test('상품 URL 호스트와 경로를 정확히 검증한다', () => {
  assert.equal(parseProductUrl(url).ok, true);
  for (const value of ['https://evil.test/?x=' + url, url + '/other', url.replace('naver.com', 'naver.com.evil.test')]) {
    assert.equal(parseProductUrl(value).ok, false);
  }
});

test('상품 영구 실패와 차단 신호를 한 번만 처리한다', async (t) => {
  t.mock.method(gate, 'acquire', async () => {});
  let blocks = 0;
  t.mock.method(gate, 'triggerCooldown', () => { blocks++; return 1000; });
  for (const status of [404, 410, 419, 429]) {
    let calls = 0;
    const result = await openProduct(tab({ evaluate: async () => { calls++; return { error: 'API 실패', status }; } }), url);
    assert.equal(calls, 1);
    assert.equal(result.apiStatus, status);
    assert.equal(result.retryable, status === 419 || status === 429);
  }
  assert.equal(blocks, 2);
});

test('게이트 쿨다운도 상품 전체 시간 상한 안에서 종료한다', async (t) => {
  t.mock.method(gate, 'acquire', (_priority, { signal }) => neverFetch('', { signal }));
  const sw = tab();
  const result = await openProduct(sw, url, { timeoutMs: 25 });
  assert.match(result.error, /시간 초과/);
  assert.equal(sw.alive, false);
});

test('페이지 추출이 응답하지 않으면 탭을 폐기한다', async (t) => {
  t.mock.method(gate, 'acquire', async () => {});
  const sw = tab({ evaluate: () => new Promise(() => {}) });
  const result = await openProduct(sw, url, { timeoutMs: 25 });
  assert.equal(result.ok, false);
  assert.equal(sw.alive, false);
});

test('이동 실패 시 이전 상품을 새 상품으로 저장하지 않는다', async (t) => {
  t.mock.method(gate, 'acquire', async () => {});
  let extracted = 0;
  const result = await openProduct(tab({ url: url.replace('1234567', '9999999'), gotoViaClick: async () => ({ ok: false }),
    evaluate: async () => { extracted++; return { name: '이전 상품' }; } }), url, { timeoutMs: 25 });
  assert.equal(result.ok, false); assert.equal(extracted, 0);
});

test('상세 추출은 차단과 재시도 메타데이터를 보존한다', async () => {
  const result = await extractOne({ withWindow: async () => ({ ok: false, error: '차단', blocked: true, apiStatus: 419, retryable: true }) }, url, '.');
  assert.equal(result.blocked, true); assert.equal(result.apiStatus, 419); assert.equal(result.retryable, true);
});

test('부가정보 API가 차단하면 나머지 리뷰 API를 호출하지 않는다', async () => {
  let calls = 0;
  const result = await vm.runInNewContext(extractDetailJs, {
    window: {}, document: { title: '냉수통', documentElement: { innerHTML: '' } }, AbortSignal,
    location: { origin: 'https://smartstore.naver.com', host: 'smartstore.naver.com', pathname: '/shop/products/1234567', href: url },
    performance: { getEntriesByType: () => [{ name: 'https://smartstore.naver.com/i/v2/channels/channel/products/1234567' }] },
    fetch: async () => { calls++; return calls === 1
      ? Response.json({ name: '냉수통', originProductNo: '1234567', channel: { naverPaySellerNo: '555' } })
      : new Response('제한', { status: 429 }); },
  });
  assert.equal(calls, 2); assert.equal(result.status, 429);
});

test('준비 중인 탭은 배정하지 않고 풀 조정을 중복 실행하지 않는다', async (t) => {
  const pool = new TabPool(); pool.running = true; pool.configured = 1;
  let finish;
  let warmups = 0;
  t.mock.method(ChromeTab.prototype, 'warmUp', function () { warmups++; return new Promise((r) => { finish = r; }); });
  const first = pool._reconcile();
  const second = pool._reconcile();
  assert.equal(first, second);
  assert.equal(pool._tryTake('detail'), null);
  assert.equal(warmups, 1);
  finish(true); await first;
  assert.ok(pool._tryTake('detail'));
  await pool.stop();
});

test('탭 대기를 취소하면 대기열에서 즉시 빠진다', async () => {
  const pool = new TabPool(); pool.running = true;
  const controller = new AbortController();
  const pending = pool.withWindow('detail', () => assert.fail('취소된 작업 실행'), { signal: controller.signal });
  controller.abort(); assert.equal(await pending, null); assert.equal(pool._waiters.length, 0);
  await pool.stop();
  assert.equal(await pool.withWindow('detail', () => {}), null);
});

test('탭 축소 중 목록용 0번 탭을 잃지 않는다', async () => {
  const pool = new TabPool(); pool.running = true; pool.configured = 1;
  pool.slots = [{ index: 0, busy: false, sw: tab() }, { index: 1, busy: true, sw: tab() }];
  await pool._reconcile(); assert.ok(pool.slots.some((s) => s.index === 0)); await pool.stop();
});

test('AI 텍스트와 비전 요청은 시간 초과 시 재시도하지 않는다', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (...args) => { calls++; return neverFetch(...args); });
  // AbortSignal.timeout 타이머는 unref 이므로 테스트 프로세스의 생존 핸들을 유지한다.
  const alive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(generate({ model: 'test', prompt: 'test', timeoutMs: 20 }), { name: 'TimeoutError' });
    await assert.rejects(generateVision({ model: 'test', prompt: 'test', timeoutMs: 20 }), { name: 'TimeoutError' });
    assert.equal(calls, 2);
  } finally { clearInterval(alive); }
});

test('다른 크기의 모델을 설치된 요청 모델로 오판하지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ models: [{ name: 'qwen:3b' }] }));
  assert.equal(await hasModel('qwen:7b'), false); assert.equal(await hasModel('qwen:3b'), true);
});

test('기존 GPU 호출의 timeoutMs 0은 즉시 취소되지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    signal.throwIfAborted();
    return Response.json({ response: '정상 판정' });
  });
  assert.equal((await generateVision({ model: 'test', timeoutMs: 0 })).text, '정상 판정');
});

test('이미지 오류 HTML 및 초과 용량을 저장하지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>차단</html>'));
  await assert.rejects(downloadImage('https://images.test/p.jpg', 'main_'));
  t.mock.method(globalThis, 'fetch', async () => new Response('x', { headers: { 'content-length': '100' } }));
  await assert.rejects(downloadImage('https://images.test/p.jpg', 'main_', { maxBytes: 10 }), /용량 초과/);
});

test('대표 이미지는 긴 변 제한, 세로 상세는 글자 폭 보존', async (t) => {
  const png = await sharp({ create: { width: 600, height: 2400, channels: 4, background: '#ffffff' } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async () => new Response(png));
  const main = await downloadImage('https://images.test/p.png', 'main_');
  const detail = await downloadImage('https://images.test/p.png', 'detail_');
  const a = await sharp(main.buf).metadata(); const b = await sharp(detail.buf).metadata();
  assert.equal(a.height, 1200); assert.equal(a.width, 300);
  assert.equal(b.width, 600); assert.equal(b.height, 2400);
  assert.equal(a.format, 'jpeg');
});

test('이미지 중복 다운로드를 제거하고 대표가 없으면 완료 처리하지 않는다', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'megaload-test-'));
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: 'white' } }).png().toBuffer();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(png); });
  try {
    const result = await writeProductFolder(dir, { channelProductNo: '1234', name: '냉수통', mainImages: ['https://images.test/p', 'https://images.test/p'] });
    assert.equal(result.mainImages, 1); assert.equal(calls, 1);
    assert.equal(JSON.parse(await readFile(join(result.folder, 'product.json'), 'utf8')).name, '냉수통');
    await assert.rejects(writeProductFolder(dir, { channelProductNo: '5678', name: '사진 없음' }), /대표이미지/);
    assert.equal((await readdir(dir)).includes('product_5678'), false);
    await writeProductFolder(dir, { channelProductNo: '1234', name: '새 냉수통', mainImages: ['https://images.test/new'] });
    assert.equal(JSON.parse(await readFile(join(result.folder, 'product.json'), 'utf8')).name, '새 냉수통');
    assert.ok((await readdir(join(dir, '.ingest'))).some((name) => name.endsWith('.previous')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('노출명 복구 후 실패한 응답의 다른 상품 속성어를 재사용하지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const body = JSON.parse(request.body);
    return Response.json({ response: body.format
      ? JSON.stringify({ core: '기능성 쌀 혼합곡', attrs: ['오염키워드'], keywords: ['오염키워드'] })
      : '유리 냉수통은 규격과 구성을 확인하고 선택해요.\n\n- 필요한 용량을 확인해요.\n- 사용 공간을 살펴보세요.\n- 구성품을 확인해요.' });
  });
  const result = await generateAllFields({ originalName: '유리 냉수통 1L', categoryPath: '주방>냉수통' }, {
    model: 'test', categoryDecisive: true, categoryCandidates: [{ code: '123', path: '주방>냉수통', leaf: '냉수통' }],
  });
  assert.equal(result.displayUngrounded, true);
  assert.equal(result.keywords.includes('오염키워드'), false);
});

test('상세 프롬프트는 허구 체험 예시를 넣지 않고 검증기도 체험 서술을 잡는다', () => {
  const prompt = buildDetailPrompt({ originalName: '유리 냉수통 1L', categoryPath: '주방>냉수통', sourceFacts: ['용량 1L'] }, pickPersona('test'));
  assert.equal(prompt.prompt.includes('상자에서'), false);
  assert.equal(prompt.prompt.includes('칠레에서 온 거라 그런지'), false);
  assert.ok(validateDetail('제가 직접 써보니 좋았어요.', { leaf: '냉수통' }).issues.some((s) => s.includes('경험')));
});

test('UTF-8 문자가 청크 사이에서 나뉘어도 마지막 진행률을 잃지 않는다', () => {
  const lines = [];
  const stream = lineStream((line) => lines.push(line));
  const bytes = Buffer.from('[텍스트 254/254] 완료\n마지막 줄');
  for (const byte of bytes) stream.write(Buffer.from([byte]));
  stream.end();
  assert.deepEqual(lines, ['[텍스트 254/254] 완료', '마지막 줄']);
});

test('주소 이동 없이 열린 하위 메뉴를 성공으로 판정한다', async () => {
  let clicks = 0;
  const result = await stepInto({ clickLink: async () => { clicks++; return { ok: false, reason: 'no-navigation' }; },
    evaluate: async () => true }, { id: '10006530', name: '신선식품' }, null);
  assert.equal(result.ok, true); assert.equal(clicks, 1);
});

test('모델 연속 실패로 중단된 배치의 미처리 건수를 빠뜨리지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('model failed to load', { status: 500 }));
  const products = Array.from({ length: 7 }, (_, i) => ({ id: String(i), originalName: '유리 냉수통 1L', categoryPath: '주방>냉수통' }));
  const { summary } = await generateBatch(products, { model: 'test', concurrency: 1 });
  assert.equal(summary.failed, 3); assert.equal(summary.skipped, 4);
  assert.equal(summary.ok, 0); assert.ok(summary.abortReason);
});

test('생성 0건이면 CLI가 실패로 종료하고 기존 결과를 보존한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'megaload-cli-'));
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'test:latest' }] }));
    else { res.statusCode = 500; res.end(JSON.stringify({ error: 'model load failed' })); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const folder = join(root, 'product_1234'); await mkdir(folder);
    await writeFile(join(folder, 'product.json'), JSON.stringify({ name: '유리 냉수통 1L', price: 10000 }));
    const previous = join(root, '_allinone.generated.jsonl'); await writeFile(previous, 'previous-result\n');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../run-folder.mjs', import.meta.url)),
      root, '--model', 'test:latest', '--no-image-ai', '--no-thumb', '--no-vision'], {
      env: { ...process.env, OLLAMA_URL: `http://127.0.0.1:${server.address().port}` },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = ''; child.stdout.on('data', (d) => { output += d; }); child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => child.kill(), 60000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    clearTimeout(timer);
    assert.equal(code, 1, output);
    assert.match(output, /생성 결과 0건/);
    assert.equal(await readFile(previous, 'utf8'), 'previous-result\n');
    assert.equal(JSON.parse(await readFile(join(root, '_allinone.failure.json'), 'utf8')).summary.failed, 1);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
