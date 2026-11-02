import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { generationResources, isRecoverableGenerationError } from '../lib/generation-resources.mjs';
import { generationCheckpoint } from '../lib/generation-checkpoint.mjs';

test('CPU and GPU resource profiles honor current memory and core budgets', () => {
  assert.equal(generationResources().concurrency, 1);
  const cpu = generationResources({ ram: { reliable: true, freeMb: 2500 }, cores: 8 });
  assert.equal(cpu.memoryBlocked, true); assert.equal(cpu.requestTimeoutMs, 1200000);
  for (const free of [1500, 3500, 6000]) {
    const p = generationResources({ gpu: { ok: true, vramFreeMb: free }, ram: { reliable: true, freeMb: 8000 }, cores: 8 });
    assert.equal(p.strong, false); assert.equal(p.concurrency, 1); assert.equal(p.visionOverlap, false);
  }
  const fast = generationResources({ gpu: { ok: true, vramFreeMb: 18000 }, ram: { reliable: true, freeMb: 16000 }, cores: 8 });
  assert.equal(fast.concurrency, 3); assert.equal(fast.visionOverlap, true);
  const busy = generationResources({ gpu: { ok: true, vramFreeMb: 18000 }, ram: { reliable: true, freeMb: 3500 }, cores: 8 });
  assert.equal(busy.strong, false); assert.equal(busy.concurrency, 1); assert.equal(busy.visionOverlap, false);
});

test('checkpoint survives torn writes and invalidates changed input and settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'generation-checkpoint-'));
  try {
    const file = join(dir, 'checkpoint.jsonl');
    const p = { id: 'one', originalName: 'sample' };
    generationCheckpoint(file, { model: 'small' }).put(p, { detail: 'completed' });
    writeFileSync(file, '{"torn":', { flag: 'a' });
    const next = generationCheckpoint(file, { model: 'small' });
    assert.deepEqual(next.get(p), { detail: 'completed' });
    assert.equal(next.get({ ...p, originalName: 'changed' }), undefined);
    assert.equal(generationCheckpoint(file, { model: 'large' }).get(p), undefined);
    next.put({ id: 'two' }, { detail: 'second' });
    assert.equal(generationCheckpoint(file, { model: 'small' }).get({ id: 'two' }).detail, 'second');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('interrupted products retry without regenerating successful products', async () => {
  const calls = new Map();
  const module = new vm.SourceTextModule(readFileSync(new URL('../lib/ai-batch.mjs', import.meta.url), 'utf8'));
  const stubs = {
    './ai-generator.mjs': { generateAllFields: async p => {
      const n = (calls.get(p.id) || 0) + 1; calls.set(p.id, n);
      if (p.id === '1' && n === 1) throw Error('ECONNRESET');
      return { timings: { totalMs: 1 }, displayName: p.originalName };
    } },
    './category-candidates-mini.mjs': { topCandidates: () => [] },
    './category-embed-matcher.mjs': { topCandidatesEmbed: () => [], topCandidatesFromVec: () => [], embedQueries: () => [], isBuilt: () => false },
    './margin-mini.mjs': { calculateSellingPrice: () => 100 },
    'node:os': { freemem: () => 16 * 1024 ** 3 },
    './generation-resources.mjs': { isRecoverableGenerationError },
    'node:timers/promises': { setTimeout: async () => {} },
    './local-llm.mjs': { ensureModel: async () => true, unload: async () => true },
  };
  await module.link(spec => {
    const values = stubs[spec]; assert.ok(values, spec);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  const result = await module.namespace.generateBatch(Array.from({ length: 6 }, (_, i) => ({ id: String(i), originalName: 'sample' })), { model: 'test', concurrency: 3 });
  assert.equal(result.records.filter(Boolean).length, 6);
  assert.equal(result.summary.failed, 0); assert.equal(result.summary.skipped, 0);
  assert.equal(result.summary.serialFallback, true); assert.equal(result.summary.retried, 1);
  assert.equal(calls.get('1'), 2); assert.equal(calls.get('0'), 1);
});
