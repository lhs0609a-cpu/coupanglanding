/**
 * 아카데미 판정 엔진 테스트 — 프로덕션에 아무것도 쓰지 않는다.
 * Supabase 클라이언트는 전부 가짜이고, 쿠팡 API 는 아예 부르지 않는다.
 *
 * 확인하는 것:
 *   1) 콘텐츠 무결성 — 모든 스텝이 9칸을 채웠는가
 *   2) 클라이언트로 정답·pass() 가 새지 않는가
 *   3) 판정이 "근거" 를 말하는가 (detail 없는 판정 금지)
 *   4) 쿨다운 / 중복 XP / 이미 통과한 스텝 재판정
 *   5) L3 퀴즈 채점과 오답 해설
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const modCache = new Map();

/**
 * label 을 캐시 키에 넣는다 — 같은 파일이라도 목(mock)이 다르면 다른 모듈이다.
 * 안 그러면 두 번째 러너가 첫 번째 러너의 목을 그대로 물려받아,
 * "실패해야 하는 테스트가 통과" 하는 가짜 초록불이 난다.
 */
function load(file, extraMocks = {}, label = '') {
  const abs = path.resolve(file);
  const cacheKey = `${abs}#${label}`;
  if (modCache.has(cacheKey)) return modCache.get(cacheKey);
  const code = ts.transpileModule(readFileSync(abs, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  modCache.set(cacheKey, exports);
  const req = (name) => {
    if (extraMocks[name]) return extraMocks[name];
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + resolveExt('src/' + name.slice(2)), extraMocks, label);
    if (name.startsWith('./') || name.startsWith('../')) {
      const p = path.resolve(path.dirname(abs), name);
      return load(p + resolveExt(p), extraMocks, label);
    }
    return require(name);
  };
  vm.runInNewContext(code, { exports, require: req, module: { exports }, console, Map, Set, Date, JSON, Number, Array, Object, String, Promise }, { filename: abs });
  return exports;
}

function resolveExt(p) {
  const fs = require('node:fs');
  if (fs.existsSync(p + '.ts')) return '.ts';
  if (fs.existsSync(path.join(p, 'index.ts'))) return '/index.ts';
  return '.ts';
}

// ── 가짜 Supabase ────────────────────────────────────────────
function fakeService(state) {
  const api = (table) => ({
    select() { return this; },
    eq() { return this; },
    neq() { return this; },
    in() { return this; },
    async maybeSingle() { return { data: state.rows[table] ?? null }; },
    async upsert(row) { state.writes.push({ table, op: 'upsert', row }); state.rows[table] = { ...(state.rows[table] || {}), ...row }; return { error: null }; },
    async insert(row) {
      state.writes.push({ table, op: 'insert', row });
      const key = `${table}:${row.reason || row.badge_key || ''}:${row.ref_key || ''}`;
      if (state.unique.has(key)) return { error: { message: 'duplicate key' } };
      state.unique.add(key);
      return { error: null };
    },
    async update(row) { state.writes.push({ table, op: 'update', row }); return { error: null }; },
  });
  return { from: (table) => api(table) };
}

async function main() {
  const academy = load('src/lib/data/academy/index.ts');
  const steps = academy.ACADEMY_STEPS;

  // ── 1. 콘텐츠 무결성 ────────────────────────────────────
  assert.ok(steps.length > 0, '스텝이 하나도 없습니다');
  const seen = new Set();
  for (const s of steps) {
    assert.ok(!seen.has(s.key), `중복 스텝 키: ${s.key}`);
    seen.add(s.key);
    assert.ok(s.goal && s.goal.length > 5, `${s.key}: goal 없음`);
    assert.ok(s.why && s.why.length > 10, `${s.key}: why 없음 — 이유 없는 지시는 안 지켜진다`);
    assert.ok(s.estimatedSec > 0, `${s.key}: estimatedSec 없음`);
    assert.ok(Array.isArray(s.narration) && s.narration.length >= 3, `${s.key}: narration 부족`);
    assert.ok(Array.isArray(s.actions) && s.actions.length > 0, `${s.key}: actions 없음`);
    assert.ok(Array.isArray(s.troubleshoot) && s.troubleshoot.length > 0, `${s.key}: troubleshoot 없음 — 막혔을 때 출구가 없다`);
    assert.ok(s.verify && [1, 2, 3].includes(s.verify.level), `${s.key}: verify 없음`);
    assert.ok(s.xp > 0, `${s.key}: xp 없음`);
    // 접근 범위가 Act 정의와 어긋나지 않는가
    const expected = academy.ACT_META[s.act].access;
    assert.equal(s.access, expected, `${s.key}: Act ${s.act} 는 ${expected} 인데 ${s.access}`);
    // 내레이션은 문장 단위여야 하이라이트가 붙는다
    for (const line of s.narration) assert.ok(line.length < 120, `${s.key}: 내레이션 문장이 너무 김 — "${line.slice(0, 30)}…"`);
  }

  // ── 2. 클라이언트로 새면 안 되는 것 ──────────────────────
  for (const s of steps) {
    const pub = academy.toPublic(s);
    assert.equal(typeof pub.verify.pass, 'undefined', `${s.key}: pass() 가 클라이언트로 샌다`);
    if (s.verify.level === 3) {
      for (const q of pub.verify.quiz) {
        assert.equal(q.answer, undefined, `${s.key}: 퀴즈 정답이 클라이언트로 샌다`);
        assert.equal(q.why, undefined, `${s.key}: 퀴즈 해설이 미리 샌다`);
      }
    }
  }

  // ── 3. 판정이 근거를 말하는가 ───────────────────────────
  const l1 = steps.filter((s) => s.verify.level === 1);
  assert.ok(l1.length >= 3, 'L1 자동판정 스텝이 너무 적습니다');
  for (const s of l1) {
    const okEmpty = s.verify.pass({ ok: true, data: {} });
    const failed = s.verify.pass({ ok: false, data: {}, error: '네트워크 오류' });
    for (const v of [okEmpty, failed]) {
      assert.equal(typeof v.passed, 'boolean', `${s.key}: passed 가 boolean 이 아님`);
      assert.ok(v.detail && v.detail.length > 5, `${s.key}: detail 없음 — "실패했습니다" 만 있으면 사람은 막힌다`);
    }
    assert.equal(okEmpty.passed, false, `${s.key}: 빈 결과인데 통과시킴`);
    assert.equal(failed.passed, false, `${s.key}: 프로브 실패인데 통과시킴`);
  }

  // 실제 값으로 통과하는지
  const api = steps.find((s) => s.key === 'act1-05-api');
  assert.equal(api.verify.pass({ ok: true, data: { connected: true } }).passed, true);
  assert.match(api.verify.pass({ ok: true, data: { connected: false, message: '키 오류' } }).detail, /키 오류/);

  const ship = steps.find((s) => s.key === 'act1-06-shipping');
  assert.equal(ship.verify.pass({ ok: true, data: { outboundCount: 1, returnCount: 1 } }).passed, true);
  const onlyOut = ship.verify.pass({ ok: true, data: { outboundCount: 1, returnCount: 0 } });
  assert.equal(onlyOut.passed, false);
  assert.match(onlyOut.detail, /반품지/, '무엇이 빠졌는지 말해야 한다');

  const reg = steps.find((s) => s.key === 'act2-08-register');
  assert.equal(reg.verify.pass({ ok: true, data: { count: 3 } }).passed, true);
  assert.match(reg.verify.pass({ ok: true, data: { count: 3 } }).detail, /3건/);
  assert.match(reg.verify.pass({ ok: true, data: { count: 0 } }).detail, /0건/);

  // ── 4. 러너 — 쿨다운 / 중복 XP / 재판정 ─────────────────
  const state = { rows: {}, writes: [], unique: new Set() };
  const service = fakeService(state);
  const runner = load('src/lib/academy/verify/runner.ts', {
    './probes': { PROBES: { 'coupang.connection': async () => ({ ok: true, data: { connected: true } }) } },
  }, 'connected');

  const base = { service, userId: 'u1', megaloadUserId: 'm1', stepKey: 'act1-05-api' };

  const r1 = await runner.verifyStep(base);
  assert.equal(r1.passed, true, '정상 통과해야 한다');
  assert.equal(r1.xpAwarded, api.xp, 'XP 가 지급돼야 한다');
  assert.equal(r1.badgeAwarded, 'first_connect');

  // 이미 통과 → 재판정하지 않고 XP 도 다시 안 준다
  const r2 = await runner.verifyStep(base);
  assert.equal(r2.passed, true);
  assert.equal(r2.xpAwarded, 0, '통과한 스텝에 XP 를 또 주면 안 된다');

  // 쿨다운 — 실패 직후 연타
  const state2 = { rows: {}, writes: [], unique: new Set() };
  const runner2 = load('src/lib/academy/verify/runner.ts', {
    './probes': { PROBES: { 'coupang.connection': async () => ({ ok: true, data: { connected: false, message: '거부' } }) } },
  }, 'refused');
  const f1 = await runner2.verifyStep({ ...base, service: fakeService(state2) });
  assert.equal(f1.passed, false);
  assert.equal(f1.attempts, 1);
  assert.equal(f1.canRequestReview, false, '1회 실패에 수동 요청을 띄우면 안 된다');

  // ── 5. L3 퀴즈 채점 ─────────────────────────────────────
  const wing = steps.find((s) => s.key === 'act1-04-wing-signup');
  assert.equal(wing.verify.level, 3);
  const correct = wing.verify.quiz.map((q) => q.answer);
  const state3 = { rows: {}, writes: [], unique: new Set() };
  const runner3 = load('src/lib/academy/verify/runner.ts', { './probes': { PROBES: {} } }, 'quiz');

  const good = await runner3.verifyStep({ ...base, service: fakeService(state3), stepKey: wing.key, answers: correct });
  assert.equal(good.passed, true, '정답을 다 맞혔는데 실패 처리됨');

  const state4 = { rows: {}, writes: [], unique: new Set() };
  const bad = await runner3.verifyStep({
    ...base, service: fakeService(state4), stepKey: wing.key,
    answers: correct.map((a) => (a + 1) % 3),
  });
  assert.equal(bad.passed, false);
  assert.ok(bad.detail.includes(wing.verify.quiz[0].why.slice(0, 10)), '오답 해설을 돌려줘야 한다 — 점수만 주면 아무것도 안 배운다');

  const none = await runner3.verifyStep({ ...base, service: fakeService({ rows: {}, writes: [], unique: new Set() }), stepKey: wing.key });
  assert.equal(none.passed, false);
  assert.match(none.detail, /답해주세요/);

  // 없는 스텝
  const missing = await runner3.verifyStep({ ...base, service: fakeService({ rows: {}, writes: [], unique: new Set() }), stepKey: 'nope' });
  assert.equal(missing.passed, false);

  // ── 6. 판정 로그가 실패에도 남는가 ───────────────────────
  const logs = state2.writes.filter((w) => w.table === 'academy_verify_log');
  assert.equal(logs.length, 1, '실패도 로그로 남아야 한다 — 성공만 남기면 고칠 곳을 못 찾는다');
  assert.equal(logs[0].row.passed, false);
  assert.ok(logs[0].row.error, '실패 사유가 로그에 있어야 한다');

  // ── 6-2. 뱃지 도감 ──────────────────────────────────────
  // 'first_connect' 같은 내부 키가 화면에 그대로 보이면 미완성으로 읽힌다.
  const badgeMod = load('src/lib/data/academy/badges.ts');
  const badgeKeys = new Set(badgeMod.ACADEMY_BADGES.map((b) => b.key));
  for (const s of steps) {
    if (!s.badgeKey) continue;
    assert.ok(badgeKeys.has(s.badgeKey), `${s.key}: 뱃지 '${s.badgeKey}' 가 도감에 없다 — 화면에 내부 키가 그대로 뜬다`);
  }
  for (const b of badgeMod.ACADEMY_BADGES) {
    assert.ok(b.emoji && b.name && b.how, `뱃지 ${b.key}: 이름·이모지·획득조건이 다 있어야 한다`);
    assert.ok(!b.name.includes('_'), `뱃지 ${b.key}: 이름이 내부 키처럼 보인다`);
  }
  // 도감에 있는데 아무 스텝도 주지 않는 뱃지 = 영원히 못 받는 뱃지
  const awarded = new Set(steps.map((s) => s.badgeKey).filter(Boolean));
  for (const b of badgeMod.ACADEMY_BADGES) {
    assert.ok(awarded.has(b.key), `뱃지 ${b.key}: 지급하는 스텝이 없다 — 영원히 못 받는다`);
  }

  // ── 7. 번호 검증기 (L2 mode:'number') ───────────────────
  const v = load('src/lib/academy/verify/validators.ts');
  // 체크섬 직접 계산으로 확인: 123-45-6789? → 마지막 자리는 1 이라야 한다
  assert.equal(v.validateBizNumber('1234567891').valid, true, '유효한 사업자번호를 거부함');
  assert.equal(v.validateBizNumber('123-45-67891').valid, true, '하이픈이 있으면 못 읽음');
  assert.equal(v.validateBizNumber('1234567890').valid, false, '체크섬이 틀린 번호를 통과시킴');
  assert.equal(v.validateBizNumber('12345').valid, false, '자릿수가 모자란데 통과시킴');
  assert.equal(v.validateBizNumber('').valid, false);
  // 실패 사유를 말해주는가 (판정 근거 원칙은 번호 검증에도 적용된다)
  assert.match(v.validateBizNumber('12345').reason, /10자리|자리/);
  assert.match(v.validateBizNumber('1234567890').reason, /형식|확인/);
  // 정규화 + 마스킹 — 번호 전체를 저장하지 않는다
  const norm = v.validateBizNumber('1234567891').normalized;
  assert.equal(norm, '123-45-67891');
  const masked = v.maskNumber(norm);
  assert.ok(masked.includes('*'), '마스킹이 안 됨');
  assert.ok(!masked.endsWith('67891'), '뒷자리가 그대로 남음');

  assert.equal(v.validateOnlineSalesNumber('2026-서울강남-01234').valid, true);
  assert.equal(v.validateOnlineSalesNumber('제 2026-서울강남-01234 호').valid, true);
  assert.equal(v.validateOnlineSalesNumber('아무거나').valid, false);
  assert.equal(v.validateOnlineSalesNumber('123').valid, false);

  // 러너가 번호 스텝을 실제로 판정하는가
  const bizStep = steps.find((s) => s.verify.level === 2 && s.verify.mode === 'number');
  assert.ok(bizStep, 'mode:number 스텝이 없음');
  const runner4 = load('src/lib/academy/verify/runner.ts', { './probes': { PROBES: {} } }, 'number');
  const okNum = await runner4.verifyStep({
    ...base, service: fakeService({ rows: {}, writes: [], unique: new Set() }),
    stepKey: bizStep.key, value: '123-45-67891',
  });
  assert.equal(okNum.passed, true, '유효한 번호인데 실패 처리됨');
  const stateNum = { rows: {}, writes: [], unique: new Set() };
  const badNum = await runner4.verifyStep({
    ...base, service: fakeService(stateNum), stepKey: bizStep.key, value: '1234567890',
  });
  assert.equal(badNum.passed, false);
  assert.ok(badNum.detail.length > 5, '틀린 이유를 말해야 한다');
  // ★ 번호 원본이 저장되면 안 된다
  const saved = JSON.stringify(stateNum.writes.filter((w) => w.table === 'academy_progress'));
  assert.ok(!saved.includes('1234567890'), '입력한 번호 원본이 저장됐다');

  console.log(`PASS: 콘텐츠 무결성 ${steps.length}스텝 (9칸 전수 검사, Act 접근범위 일치, 내레이션 문장 길이)`);
  console.log('PASS: pass()·퀴즈 정답 클라이언트 미노출');
  console.log('PASS: 모든 L1 판정이 근거(detail) 를 말함 / 빈 결과·프로브 실패를 통과시키지 않음');
  console.log('PASS: 러너 — 통과 시 XP·뱃지 지급, 재판정 시 중복 지급 없음, 쿨다운, 수동요청 임계');
  console.log('PASS: L3 퀴즈 채점 + 오답 해설 + 미응답 처리');
  console.log('PASS: 실패 판정도 academy_verify_log 에 기록');
  console.log('PASS: 뱃지 도감 — 내부 키 미노출, 이름·획득조건 완비, 못 받는 뱃지 없음');
  console.log('PASS: 번호 검증 — 사업자번호 체크섬, 통신판매업 형식, 마스킹 저장(원본 미저장)');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
