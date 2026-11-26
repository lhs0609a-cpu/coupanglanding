import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTier, pickModel, requiredRamMb, TINY_PREFS } from '../desktop/main/model-tier.mjs';

test('GPU 가 넉넉하면 strong', () => {
  assert.equal(classifyTier({ strong: true, gpuOk: true, vramFreeMb: 9000, ramTotalMb: 8000 }).tier, 'strong');
});

test('GPU 없는 8GB PC 는 tiny (1.5B)', () => {
  const t = classifyTier({ strong: false, gpuOk: false, vramFreeMb: 0, ramTotalMb: 8192 });
  assert.equal(t.tier, 'tiny');
  assert.equal(t.gpuUsable, false);
  assert.equal(pickModel(t.tier, []), TINY_PREFS[0]);
});

test('GPU 없는 16GB PC 는 small 유지 (3B)', () => {
  assert.equal(classifyTier({ strong: false, gpuOk: false, vramFreeMb: 0, ramTotalMb: 16384 }).tier, 'small');
});

test('VRAM 이 조금이라도 있으면(GPU 사용 가능) 총 RAM 이 적어도 small', () => {
  assert.equal(classifyTier({ strong: false, gpuOk: true, vramFreeMb: 4000, ramTotalMb: 8192 }).tier, 'small');
});

test('총 RAM 을 모르면 강등하지 않는다', () => {
  assert.equal(classifyTier({ strong: false, gpuOk: false, vramFreeMb: 0, ramTotalMb: 0 }).tier, 'small');
});

test('이미 깔린 모델을 우선 쓴다, 없으면 대표값', () => {
  assert.equal(pickModel('tiny', ['qwen2.5:1.5b']), 'qwen2.5:1.5b');
  assert.equal(pickModel('small', []), 'qwen2.5:3b-instruct');
});

test('tiny 는 시작 기준 RAM 이 더 낮다', () => {
  assert.ok(requiredRamMb('tiny') < requiredRamMb('small'));
});
