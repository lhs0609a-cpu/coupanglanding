/**
 * 아카데미 내레이션 mp3 배치 생성기 — **로컬에서만 돈다.**
 *
 *   node scripts/academy-tts-build.mjs            # 없는 것만 만든다
 *   node scripts/academy-tts-build.mjs --step act1-05-api
 *   node scripts/academy-tts-build.mjs --dry      # 무엇을 만들지만 보여준다
 *
 * ★ 프로덕션에는 OPENAI_API_KEY 를 두지 않는다(설계도 §16-2).
 *   여기서 만들어 Supabase Storage 에 올리면, 런타임은 정적 파일만 서빙한다.
 *
 * ★ 문장 하나를 발화 하나로 따로 뽑아 이어 붙인다.
 *   통으로 뽑으면 지금 어느 문장을 읽는 중인지 알 수 없어 자막 하이라이트가 안 붙는다.
 *   대신 문장별 길이를 재서 marks 로 저장한다.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

// ── .env.local 로드 ────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);

const OPENAI_KEY = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const DRY = process.argv.includes('--dry');
const ONLY = (() => { const i = process.argv.indexOf('--step'); return i > 0 ? process.argv[i + 1] : null; })();

// ── TS 모듈 로더 (테스트 스크립트와 같은 방식) ──────────────
const cache = new Map();
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs);
  const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  cache.set(abs, exports);
  const req = (name) => {
    if (name.startsWith('@/')) return load(resolve('src/' + name.slice(2)));
    if (name.startsWith('./') || name.startsWith('../')) return load(resolve(path.resolve(path.dirname(abs), name)));
    return nodeRequire(name);   // 'crypto' 등 내장 모듈
  };
  vm.runInNewContext(code, {
    exports, require: req, module: { exports }, console,
    Map, Set, Date, JSON, Number, Array, Object, String, Promise, Buffer,
  }, { filename: abs });
  return exports;
}
function resolve(p) {
  if (fs.existsSync(p + '.ts')) return p + '.ts';
  if (fs.existsSync(path.join(p, 'index.ts'))) return path.join(p, 'index.ts');
  return p + '.ts';
}
// ESM 에는 require 가 없다. vm 안의 TS 모듈이 'crypto' 를 부르므로 다리를 놔준다.
const nodeRequire = createRequire(import.meta.url);

const { ACADEMY_STEPS } = load('src/lib/data/academy/index.ts');
const { narrationHash, ttsPath, TTS_BUCKET, TTS_VOICE, TTS_MODEL } = load('src/lib/academy/tts.ts');

// ── 대상 추리기 ────────────────────────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const targets = ACADEMY_STEPS
  .filter((s) => !ONLY || s.key === ONLY)
  .map((s) => ({ step: s, hash: narrationHash(s.narration) }));

const { data: existing } = await sb.from('academy_tts_assets').select('step_key, script_hash').eq('voice', TTS_VOICE);
const have = new Set((existing || []).map((r) => `${r.step_key}:${r.script_hash}`));
const todo = targets.filter((t) => !have.has(`${t.step.key}:${t.hash}`));

const sentences = todo.reduce((n, t) => n + t.step.narration.length, 0);
console.log(`스텝 ${targets.length}개 중 생성 대상 ${todo.length}개 (문장 ${sentences}개)`);
if (!todo.length) { console.log('전부 최신입니다.'); process.exit(0); }
for (const t of todo) console.log(`  · ${t.step.key} — ${t.step.narration.length}문장`);

if (DRY) { console.log('\n--dry 라서 여기서 멈춥니다.'); process.exit(0); }

if (!OPENAI_KEY) {
  console.error('\n❌ OPENAI_API_KEY 가 없습니다 (.env.local 또는 환경변수).');
  console.error('   키 없이도 아카데미는 브라우저 음성으로 동작합니다 — 급하지 않으면 그대로 두셔도 됩니다.');
  console.error('   키를 넣고 다시 실행하면 이 스크립트가 mp3 를 만들어 채웁니다.');
  process.exit(1);
}

// ── 버킷 보장 (비공개) ─────────────────────────────────────
const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.name === TTS_BUCKET)) {
  const { error } = await sb.storage.createBucket(TTS_BUCKET, { public: false });
  if (error) { console.error('버킷 생성 실패:', error.message); process.exit(1); }
  console.log(`버킷 ${TTS_BUCKET} 생성`);
}

// ── mp3 하나 뽑기 ──────────────────────────────────────────
async function speak(text) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** mp3 재생 길이(ms) 추정 — 프레임을 세지 않고 비트레이트로 계산한다. 하이라이트용이라 이 정도면 충분하다. */
function estimateMs(buf) {
  // OpenAI mp3 는 24kHz / 약 32kbps CBR 로 나온다. 바이트 → ms.
  const BYTES_PER_MS = (32_000 / 8) / 1000;   // 4 bytes/ms
  return Math.max(200, Math.round(buf.length / BYTES_PER_MS));
}

// ── 실행 ───────────────────────────────────────────────────
let done = 0;
for (const { step, hash } of todo) {
  const chunks = [];
  const marks = [];
  let cursor = 0;
  try {
    for (let i = 0; i < step.narration.length; i++) {
      const buf = await speak(step.narration[i]);
      const ms = estimateMs(buf);
      marks.push({ index: i, startMs: cursor, endMs: cursor + ms });
      cursor += ms;
      chunks.push(buf);
      process.stdout.write(`\r  ${step.key} ${i + 1}/${step.narration.length}`);
    }
    const audio = Buffer.concat(chunks);
    const file = ttsPath(step.key, hash);

    const up = await sb.storage.from(TTS_BUCKET).upload(file, audio, { contentType: 'audio/mpeg', upsert: true });
    if (up.error) throw new Error(`업로드 실패: ${up.error.message}`);

    const ins = await sb.from('academy_tts_assets').upsert({
      step_key: step.key, script_hash: hash, voice: TTS_VOICE, audio_path: file, marks,
    }, { onConflict: 'step_key,script_hash,voice' });
    if (ins.error) throw new Error(`DB 기록 실패: ${ins.error.message}`);

    done++;
    console.log(`\r  ✓ ${step.key} — ${(audio.length / 1024).toFixed(0)}KB, ${(cursor / 1000).toFixed(1)}초`);
  } catch (e) {
    console.error(`\r  ✗ ${step.key} — ${e.message}`);
  }
}

console.log(`\n완료 ${done}/${todo.length}. 실패한 스텝은 브라우저 음성으로 그대로 동작합니다.`);
