/**
 * LLM 풀(pull) 루프 — 로컬 GPU(Ollama)로 텍스트 재생성/재매칭 잡 처리.
 *
 * claim_llm_jobs(RPC) → task_type 별 처리(노출상품명/상세글/옵션수량/카테고리) → result(jsonb) 기록.
 * 썸네일 pull-loop(이미지)와 동형이며, 엔진만 Ollama generate/embed 로 교체.
 * 의존성: local-llm(ollama HTTP) + ai-prompts(기존 프롬프트 빌더) + category-embed-matcher.
 */

import { rpc, patchRow } from './supabase-rest.mjs';
import { generate, listModels, isUp } from './local-llm.mjs';
import { buildTitlePrompt, buildOptionsPrompt, pickPersona } from './ai-prompts.mjs';
import { generatePerfectDetail } from './detail-content-gen.mjs';
import { topCandidatesEmbed, isBuilt as embedBuilt } from './category-embed-matcher.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 상세글 단락 → 블록 타입 시퀀스(쿠팡 설득형 렌더러용). 길면 마지막 타입 반복.
const BLOCK_TYPE_ORDER = [
  'hook', 'problem', 'agitation', 'solution', 'benefits_grid',
  'feature_detail', 'usage_guide', 'social_proof', 'urgency', 'cta',
];

/** 설치된 모델 중 한국어 생성에 적합한 것을 고른다. */
async function pickModel(prefer) {
  const models = await listModels();
  if (!models.length) return null;
  if (prefer && models.includes(prefer)) return prefer;
  const order = ['exaone3.5', 'qwen2.5:7b-instruct', 'qwen2.5', 'llama3.1:8b', 'gemma2'];
  for (const p of order) {
    const hit = models.find((m) => m.startsWith(p));
    if (hit) return hit;
  }
  return models[0];
}

function safeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* below */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

async function runDisplayName(model, input) {
  const persona = pickPersona(input.seed || input.originalName || 'seed');
  const { system, prompt, format, options } = buildTitlePrompt(
    { originalName: input.originalName, features: input.features || [], category: input.categoryPath },
    persona,
  );
  const { text } = await generate({ model, prompt, system, options, format });
  const j = safeJson(text) || {};
  let name = String(j.displayName || '').trim();
  if (!name) throw new Error('빈 노출상품명 결과');
  if (name.length > 100) name = name.slice(0, 100);
  return { displayName: name, keywords: Array.isArray(j.keywords) ? j.keywords : [] };
}

async function runOptions(model, input) {
  const { system, prompt, format, options } = buildOptionsPrompt(
    { originalName: input.originalName, features: input.features || [] },
  );
  const { text } = await generate({ model, prompt, system, options, format });
  const j = safeJson(text) || {};
  const opts = Array.isArray(j.options)
    ? j.options
        .filter((o) => o && o.name && o.value)
        .slice(0, 4)
        .map((o) => ({ name: String(o.name), value: String(o.value), unit: o.unit ? String(o.unit) : undefined }))
    : [];
  if (opts.length === 0) throw new Error('추출된 옵션 없음');
  return { options: opts };
}

async function runContent(model, input) {
  // 생성→검증→실패 시 자동 재생성(통과까지). 카테고리 정합·순한국어·SEO·구매욕 구조 보장.
  const { paragraphs, blocks, ok, issues, attempts } = await generatePerfectDetail({
    model,
    originalName: input.displayName || input.originalName,
    categoryPath: input.categoryPath,
    leaf: input.leaf,
    features: input.features || [],
    seoKeywords: input.seoKeywords || input.keywords || [],
    seed: input.seed || input.originalName,
    maxTokens: 1300,
    maxAttempts: 4,
  });
  if (!paragraphs || paragraphs.length === 0) throw new Error('빈 상세글 결과');
  return { paragraphs, blocks, generationOk: ok, generationIssues: issues, attempts };
}

async function runCategory(input) {
  if (!embedBuilt()) throw new Error('카테고리 임베딩이 워커에 빌드되지 않았습니다 (category-embed-build).');
  const cands = await topCandidatesEmbed(input.originalName, 8);
  if (!cands.length) throw new Error('카테고리 후보를 찾지 못했습니다.');
  const best = cands[0];
  return {
    categoryCode: best.code,
    categoryPath: best.path,
    confidence: best.score,
    candidates: cands.slice(0, 5).map((c) => ({ code: c.code, path: c.path, score: c.score })),
  };
}

/**
 * @param {object} o
 * @param {import('./supabase-rest.mjs').Session} o.session
 * @param {string} o.workerId
 * @param {string} [o.hostname]
 * @param {number} [o.pollMs=3000]
 * @param {AbortSignal} [o.signal]
 * @param {(e:object)=>void} [o.onEvent]
 * @param {string} [o.model]   선호 모델(없으면 자동 선택)
 */
export async function runLlmPullLoop({
  session, workerId, hostname, pollMs = 700, signal, onEvent = () => {}, model: preferModel,
}) {
  const stopped = () => signal?.aborted;
  let model = null;
  let processed = 0, ok = 0, fail = 0, idleLogged = false, lastBeat = 0, idleTicks = 0;

  // 워커 시작 시 모델 예열 — 첫 생성의 콜드 로드(5.5초)를 미리 끝내 둔다(이후 웜 0.2초, keep_alive 30분).
  try {
    if (await isUp()) {
      model = await pickModel(preferModel);
      if (model) {
        await generate({ model, prompt: '준비', options: { num_predict: 1 } });
        onEvent({ type: 'info', message: `LLM 모델 예열 완료: ${model}` });
      }
    }
  } catch { /* best-effort 예열 — 실패해도 첫 잡에서 로드됨 */ }

  const beat = async () => {
    if (Date.now() - lastBeat < 30_000) return;
    lastBeat = Date.now();
    try { await rpc(session, 'worker_heartbeat', { p_worker_id: workerId, p_hostname: hostname || workerId }); }
    catch { /* ignore */ }
  };

  while (!stopped()) {
    await beat();
    let jobs;
    try {
      jobs = await rpc(session, 'claim_llm_jobs', { p_worker_id: workerId, p_limit: 4 });
    } catch (e) {
      onEvent({ type: 'warn', message: `LLM claim 실패(재시도): ${e.message}` });
      await sleep(pollMs);
      continue;
    }
    if (!jobs || jobs.length === 0) {
      if (!idleLogged) { onEvent({ type: 'idle' }); idleLogged = true; }
      idleTicks++;
      // 활성: pollMs(0.7초)로 빠르게 집음. 장기 유휴(약 10초+): 2.5초로 백오프해 불필요한 RPC 절감.
      await sleep(idleTicks > 15 ? 2500 : pollMs);
      continue;
    }
    idleLogged = false;
    idleTicks = 0;

    // 텍스트 잡이 있을 때만 ollama/모델 확인 (불필요한 기동 방지)
    if (!model) {
      if (!(await isUp())) {
        // Ollama 미실행 → 이미 claim 한 잡을 pending 으로 되돌려 'processing' 에 갇히지 않게(즉시 재처리 대기).
        onEvent({ type: 'warn', message: 'Ollama 데몬이 실행 중이 아닙니다. (잡 반환 후 대기)' });
        for (const job of jobs) {
          try { await patchRow(session, 'megaload_llm_jobs', `id=eq.${job.id}`, { status: 'pending', worker_id: null, claimed_at: null }); }
          catch { /* ignore */ }
        }
        await sleep(pollMs * 2);
        continue;
      }
      model = await pickModel(preferModel);
    }

    for (const job of jobs) {
      if (stopped()) break;
      processed++;
      onEvent({ type: 'claimed', jobId: job.id, label: job.label, task: job.task_type, processed });
      try {
        const input = job.input || {};
        let result;
        if (job.task_type === 'display_name') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다 (예: ollama pull qwen2.5:7b-instruct).');
          result = await runDisplayName(model, input);
        } else if (job.task_type === 'options') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다.');
          result = await runOptions(model, input);
        } else if (job.task_type === 'content') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다.');
          result = await runContent(model, input);
        } else if (job.task_type === 'category') {
          result = await runCategory(input);
        } else {
          throw new Error(`알 수 없는 task_type: ${job.task_type}`);
        }
        await patchRow(session, 'megaload_llm_jobs', `id=eq.${job.id}`, {
          status: 'done', result, completed_at: new Date().toISOString(), error_message: null,
        });
        ok++;
        onEvent({ type: 'done', jobId: job.id, label: job.label, task: job.task_type, ok, fail, processed });
      } catch (e) {
        fail++;
        try {
          await patchRow(session, 'megaload_llm_jobs', `id=eq.${job.id}`, {
            status: 'error', error_message: String(e.message).slice(0, 500), completed_at: new Date().toISOString(),
          });
        } catch { /* ignore */ }
        onEvent({ type: 'error', jobId: job.id, label: job.label, message: e.message, ok, fail, processed });
      }
    }
  }
  return { processed, ok, fail };
}
