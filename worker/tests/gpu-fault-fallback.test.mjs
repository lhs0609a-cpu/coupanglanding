import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, explainLlmError, isGpuFaultError } from '../lib/local-llm.mjs';

const CUDA_MSG = '{"error":"an error was encountered while running the model: CUDA error: an illegal instruction was encountered"}';
const OOM_MSG = '{"error":"llama-server process has terminated: CUDA error: out of memory"}';

test('GPU 연산 오류와 VRAM 부족을 구분한다', () => {
  assert.equal(isGpuFaultError(CUDA_MSG), true);
  assert.equal(isGpuFaultError('HTTP 500: fetch failed'), false);
  assert.match(explainLlmError(CUDA_MSG), /GPU 연산 오류/);
  assert.match(explainLlmError(OOM_MSG), /VRAM\) 부족/);
});

test('GPU 오류면 모델을 내리고 CPU(num_gpu=0)로 한 번 재시도하며, 이후에는 CPU 로 고정한다', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ keep_alive: body.keep_alive, num_gpu: body.options?.num_gpu });
    if (body.keep_alive === 0) return new Response('{}', { status: 200 });
    if (body.options?.num_gpu === 0) return Response.json({ response: 'ok', eval_count: 1, eval_duration: 1e9 });
    return new Response(CUDA_MSG, { status: 500 });
  });

  const first = await generate({ model: 'm', prompt: 'p' });
  assert.equal(first.text, 'ok');
  // 1) GPU 로 시도 → 2) 언로드 → 3) CPU 재시도
  assert.deepEqual(calls.map((c) => c.num_gpu ?? null), [99, null, 0]);
  assert.equal(calls[1].keep_alive, 0);

  calls.length = 0;
  const second = await generate({ model: 'm', prompt: 'p' });
  assert.equal(second.text, 'ok');
  // 쿨다운 동안에는 처음부터 CPU 로 간다(깨진 GPU 에 다시 던지지 않는다)
  assert.deepEqual(calls.map((c) => c.num_gpu), [0]);
});
