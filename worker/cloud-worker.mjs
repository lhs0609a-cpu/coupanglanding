#!/usr/bin/env node
/**
 * 쿠팡 썸네일 클라우드 풀(pull) 워커 (로컬 GPU / ComfyUI SDXL)
 *
 * 웹에서 "전체 썸네일 재생성"으로 만든 pending 잡을 Supabase에서 끌어와
 * 로컬 ComfyUI로 생성하고, 결과를 Storage에 올린 뒤 잡을 done 처리한다.
 * 워커는 사용자 JWT로만 접근(service_role 키 없음) → RLS가 본인 잡으로 스코프 강제.
 * 인바운드 포트/터널 불필요(워커가 클라이언트로서 폴링).
 *
 * 사용:
 *   node cloud-worker.mjs              # config.json 의 cloud 설정 사용, 무한 폴링
 *   node cloud-worker.mjs --once       # pending 다 비우면 종료
 *   node cloud-worker.mjs --max 50     # 최대 50건 처리 후 종료
 *
 * config.json 의 cloud 블록 (또는 환경변수):
 *   supabaseUrl  (env SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL)
 *   anonKey      (env SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)  ※ 공개키, service_role 아님
 *   email, password  (env WORKER_EMAIL / WORKER_PASSWORD)  ※ 첫 로그인 후 .session.json 캐시
 *   comfyUrl, workflow, positivePrompt, negativePrompt  (로컬 모드와 공유)
 */

import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as comfy from './lib/comfyui-client.mjs';
import { Session } from './lib/supabase-rest.mjs';
import { runPullLoop } from './lib/pull-loop.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fs = { readFile };
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (m) => console.log(`[${ts()}] ${m}`);

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    if (k === 'once') { a.once = true; continue; }
    a[k] = argv[++i];
  }
  return a;
}

async function loadConfig() {
  try { return JSON.parse(await readFile(join(__dirname, 'config.json'), 'utf8')); }
  catch { return {}; }
}

const DEFAULT_POSITIVE =
  'professional Coupang e-commerce product thumbnail, the product centered on a pure seamless white studio background (#FFFFFF), soft diffused studio lighting, subtle natural contact shadow directly beneath the product, photorealistic commercial product photography, sharp focus, clean and minimal, 1:1 square composition';
const DEFAULT_NEGATIVE =
  'text, watermark, logo, extra objects, props, lifestyle scene, hands, people, colored background, gradient background, dark shadows, blurry, low quality, distorted, deformed, duplicated product, frame, border';

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const cfg = await loadConfig();
  const c = cfg.cloud || {};

  const supabaseUrl = (c.supabaseUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = c.anonKey || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const email = c.email || process.env.WORKER_EMAIL;
  const password = c.password || process.env.WORKER_PASSWORD;
  if (!supabaseUrl || !anonKey) {
    console.error('❌ supabaseUrl / anonKey 가 필요합니다 (config.json cloud 블록 또는 환경변수).');
    process.exit(1);
  }
  if (anonKey.length > 40 && /service_role/.test(Buffer.from(anonKey.split('.')[1] || '', 'base64').toString('utf8'))) {
    console.error('❌ service_role 키로 보입니다. 워커에는 절대 service_role 키를 쓰지 마세요. anon(공개) 키를 사용하세요.');
    process.exit(1);
  }

  const comfyUrl = (c.comfyUrl || cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
  const workflowPath = resolve(c.workflow || cfg.workflow || join(__dirname, 'workflows/sdxl-inpaint-thumbnail.example.json'));
  const defaultPositive = cfg.positivePrompt || DEFAULT_POSITIVE;
  const defaultNegative = cfg.negativePrompt || DEFAULT_NEGATIVE;
  const timeoutMs = (Number(cli.timeout) || cfg.timeoutSec || 300) * 1000;
  const pollMs = (Number(cli.poll) || c.pollSec || 5) * 1000;
  const maxJobs = cli.max ? Number(cli.max) : Infinity;
  const workerId = `${hostname()}-${randomUUID().slice(0, 8)}`;

  // 1) ComfyUI + 워크플로
  log(`ComfyUI 연결: ${comfyUrl}`);
  let health;
  try { health = await comfy.checkHealth(comfyUrl); }
  catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
  log(`✅ ComfyUI ${health.comfyVersion} · ${health.device} (VRAM ${health.vramTotalMb}MB)`);
  let workflow;
  try { workflow = await comfy.loadWorkflow(fs, workflowPath); }
  catch (e) { console.error(`❌ 워크플로 로드 실패:\n${e.message}`); process.exit(1); }

  // 2) 로그인
  const session = new Session(supabaseUrl, anonKey, join(__dirname, '.session.json'));
  try { await session.loadOrLogin(email, password); }
  catch (e) { console.error(`❌ 로그인 실패: ${e.message}`); process.exit(1); }
  log(`✅ Supabase 로그인 · worker_id=${workerId}`);

  // 3) 폴링 루프 (공통 pull-loop 사용)
  const onEvent = (e) => {
    switch (e.type) {
      case 'idle':     log('대기 중 — pending 잡 없음'); break;
      case 'claimed':  log(`[${e.processed}] ${e.label} 처리 중...`); break;
      case 'done':     log(`✅ [${e.processed}] ${e.label} (${e.sizeKb}KB)`); break;
      case 'error':    log(`❌ [${e.processed}] ${e.label} — ${e.message}`); break;
      case 'warn':     log(`⚠️ ${e.message}`); break;
      case 'finished': log(`종료: 처리 ${e.processed} · 성공 ${e.ok} · 실패 ${e.fail}`); break;
    }
  };
  await runPullLoop({
    session, comfyUrl, workflow, defaultPositive, defaultNegative,
    timeoutMs, pollMs, workerId, hostname: hostname(), maxJobs, once: !!cli.once, onEvent,
  });
}

main().catch((e) => { console.error('치명적 오류:', e); process.exit(1); });
