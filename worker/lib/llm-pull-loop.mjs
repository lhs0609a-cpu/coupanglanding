/**
 * LLM 풀(pull) 루프 — 로컬 GPU(Ollama)로 텍스트 재생성/재매칭 잡 처리.
 *
 * claim_llm_jobs(RPC) → task_type 별 처리(노출상품명/상세글/옵션수량/카테고리/검색어태그) → result(jsonb) 기록.
 * 썸네일 pull-loop(이미지)와 동형이며, 엔진만 Ollama generate/embed 로 교체.
 * 의존성: local-llm(ollama HTTP) + ai-prompts(기존 프롬프트 빌더) + category-embed-matcher.
 */

import { rpc, patchRow } from './supabase-rest.mjs';
import { generate, listModels, isUp } from './local-llm.mjs';
import { buildTitlePrompt, buildOptionsPrompt, pickPersona } from './ai-prompts.mjs';
import { generatePerfectDetail } from './detail-content-gen.mjs';
import { buildSourceFacts } from './source-facts.mjs';
import { topCandidatesEmbed, isBuilt as embedBuilt } from './category-embed-matcher.mjs';
import { withGpu } from './gpu-lease.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 같은 잡이 N회 넘게 claim 되면 영구 실패로 종결(무한 reclaim 차단).
// ※ ollama 다운 같은 일시 사유는 attempts 를 되돌리므로(아래) 이 한도에 안 쌓임 — 실제 처리 실패만 카운트.
const MAX_ATTEMPTS = 8;
const OLLAMA_DOWN_BACKOFF_MS = 15000; // ollama 미실행 시 재claim 백오프(기존 1.4초 → 15초, 스래싱 방지)

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

/**
 * 쿠팡 **연관검색어** 뽑기 — 검색어 태그 20칸을 채우는 재료.
 * ---------------------------------------------------------------------------
 * 왜 로컬인가: 태그는 상품마다 20개씩 필요하다. 서버 LLM 으로 돌리면 상품당 호출이 하나 더
 * 붙는데, 이 일은 "사람이 검색창에 치는 말"을 아는 정도면 충분해 로컬 모델로 족하다(비용 0).
 *
 * ⚠️ 여기서 만든 말이 그대로 등록되지는 않는다. 웹의 buildSearchTags 가 금지어·타사 브랜드·
 *    상품명 중복·특수문자를 다시 거른다 —— 그러니 넉넉히(요청 수의 1.5배) 뽑아 보낸다.
 *    거르고 나면 절반 이하만 남는 일이 흔하다.
 */
async function runSearchTags(model, input) {
  const name = String(input.displayName || input.originalName || '').trim();
  const cat = String(input.categoryPath || '').trim();
  const leaf = cat.split('>').pop()?.trim() || cat;
  const want = Math.min(40, Math.max(10, Number(input.count) || 30));
  const avoid = Array.isArray(input.avoid) ? input.avoid.filter(Boolean).slice(0, 30).join(', ') : '';
  const system = '너는 쿠팡 상품 등록 담당자다. 사람들이 쿠팡 검색창에 실제로 치는 말만 쓴다. JSON 만 출력한다.';
  // ⚠️ 유형을 나눠 시킨다. 그냥 "검색어 30개"라고 하면 모델은 한 핵심어에 수식어만 갈아 끼운
  //    목록을 준다("대용량OO, OO세트, 업소용OO…") —— 도달하는 검색어 집합이 거의 안 늘어난다.
  //    실전에서 잘 뽑힌 20개는 상위분류·별칭·용도·소재·특장점·대상이 골고루 섞여 있다.
  const per = Math.max(3, Math.round(want / 6));
  const prompt = [
    `상품명: ${name}`,
    cat ? `카테고리: ${cat}` : '',
    '',
    `이 상품을 사려는 사람이 쿠팡 검색창에 칠 법한 말을, 아래 6가지 유형으로 각 ${per}개씩 뽑아라.`,
    `1) 상위분류·별칭 — 같은 물건을 부르는 다른 말(예: 주방화 → 조리화, 위생화, 작업화, 주방신발)`,
    `2) 용도·상황·장소 — 어디서 왜 쓰는가(예: 주방, 시장, 텃밭, 캠핑, 도시락, 사무실)`,
    `3) 형태·소재·규격 — 눈에 보이는 사실(예: 라운드, EVA, 기모, 분리형, 대용량)`,
    `4) 특장점 — 확인 가능한 사실만(예: 방수, 미끄럼방지, 가벼운, 저소음)`,
    `5) 대상 — 누가 쓰는가(예: 남성, 여성, 아이, 1인가구, 업소용)`,
    `6) 함께 검색되는 말 — 이 상품을 찾다가 같이 치는 말`,
    '',
    '규칙:',
    '- 한글 위주(숫자·단위 허용), 2~15자, 특수문자·따옴표 금지',
    avoid ? `- 다음 낱말은 상품명·카테고리에 이미 있다. 그대로 반복하지 마라: ${avoid}` : '',
    '- 다른 회사 브랜드명 금지',
    '- 배송/최저가/특가/할인/베스트/추천/1위 같은 광고·배송어 금지',
    '- 효능·치료·예방·면역 같은 효과 주장 금지',
    '- 유기농·국산·국내산처럼 확인 못 하는 원산지·인증 주장 금지',
    `- ⚠️ 이 상품과 상관없는 말은 절대 넣지 마라. 어긋난 검색어 하나가 판매자의 모든 상품을`,
    `  검색에서 빼는 사유가 된다. 확신이 없으면 그 유형은 개수를 줄여라(빈칸이 낫다).`,
    '',
    '유형 순서대로 한 배열에 담아라. JSON: {"tags":["검색어1","검색어2"]}',
  ].filter(Boolean).join('\n');
  const { text } = await generate({
    model, prompt, system, format: 'json',
    options: { temperature: 0.6, num_ctx: 2048 },
  });
  const j = safeJson(text) || {};
  const raw = Array.isArray(j.tags) ? j.tags : Array.isArray(j.keywords) ? j.keywords : [];
  const seen = new Set();
  const tags = [];
  for (const t of raw) {
    const s = String(t || '').replace(/["'\\]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 20) continue;
    const key = s.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(s);
  }
  if (!tags.length) throw new Error('빈 검색어 결과');
  return { tags: tags.slice(0, 40) };
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
    // ⚠️ 판매자가 밝힌 사실(원산지·중량·보관법 등). 예전엔 이걸 안 넘겨서 재생성 경로에서만
    //    근거가 통째로 사라졌다 — 근거가 비면 모델이 자유연상으로 딴 물건 이야기를 쓴다
    //    (실측 사고: 곡물 상세글이 냉수통 후기가 됐다).
    sourceFacts: input.sourceFacts || buildSourceFacts(input.productJson || {}),
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
  session, workerId, hostname, appVersion, getLocalEndpoint, pollMs = 700, signal, onEvent = () => {}, model: preferModel,
  ensureEngine,
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
    try { await rpc(session, 'worker_heartbeat', { p_worker_id: workerId, p_hostname: hostname || workerId, p_app_version: appVersion ?? null, p_local_endpoint: getLocalEndpoint?.() ?? null }); }
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

    /**
     * 텍스트 잡이 있을 때만 ollama 를 확인한다(큐가 빈 동안에는 건드리지 않는다).
     *
     * ⚠️ 예전엔 이 확인 전체가 `if (!model)` 안에 있었다 — 즉 **첫 잡에서 한 번만** 봤다.
     *    도우미가 유휴일 때 ollama 를 내려 램을 돌려주게 되면서 그 전제가 깨진다: 두 번째
     *    잡이 들어올 땐 model 캐시가 살아 있다는 이유로 확인을 건너뛰고, 내려간 ollama 에
     *    그대로 요청을 던져 연결 거부로 죽는다. 그래서 **매 배치마다** 본다(로컬 HTTP 1회).
     */
    if (ensureEngine && !(await isUp())) {
      try { await ensureEngine(); }
      catch (e) { onEvent({ type: 'warn', message: `Ollama 기동 실패: ${e.message || e}` }); }
    }
    if (!(await isUp())) {
      // Ollama 미실행 → 이미 claim 한 잡을 pending 으로 되돌려 'processing' 에 갇히지 않게.
      //   ★ claim 이 올린 attempts 를 되돌린다(−1) — ollama 가 오래 꺼져 있으면 claim→되돌림→재claim 이
      //     반복되며 attempts 가 수천(실측 1198)까지 폭증하던 버그. 일시 사유는 한도에 안 쌓이게 한다.
      onEvent({ type: 'warn', message: 'Ollama 데몬이 실행 중이 아닙니다. (잡 반환 후 대기)' });
      for (const job of jobs) {
        try { await patchRow(session, 'megaload_llm_jobs', `id=eq.${job.id}`, { status: 'pending', worker_id: null, claimed_at: null, attempts: Math.max(0, (job.attempts || 1) - 1) }); }
        catch { /* ignore */ }
      }
      await sleep(OLLAMA_DOWN_BACKOFF_MS); // 긴 백오프로 재claim 빈도 자체를 낮춤
      continue;
    }
    if (!model) model = await pickModel(preferModel);

    for (const job of jobs) {
      if (stopped()) break;
      processed++;
      // ★ 재시도 한도 초과 안전망 — 어떤 이유로든 N회 넘게 claim 된 잡은 영구 실패로 종결(무한 reclaim 차단).
      if ((job.attempts || 0) > MAX_ATTEMPTS) {
        try { await patchRow(session, 'megaload_llm_jobs', `id=eq.${job.id}`, { status: 'error', error_message: `재시도 한도(${MAX_ATTEMPTS}회) 초과 — 영구 실패로 종결`, completed_at: new Date().toISOString() }); }
        catch { /* ignore */ }
        fail++;
        onEvent({ type: 'error', jobId: job.id, label: job.label, message: '재시도 한도 초과 — 종결', ok, fail, processed });
        continue;
      }
      onEvent({ type: 'claimed', jobId: job.id, label: job.label, task: job.task_type, processed });
      try {
        const input = job.input || {};
        let result;
        // GPU 리스('llm' 모드)로 감싼다 — 이미지(SDXL) 잡과 직렬화되어 동시 실행 시
        // VRAM 스왑 thrash 를 막는다. 이미지→텍스트 전환 시 Ollama 가 지연 로드된다.
        if (job.task_type === 'display_name') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다 (예: ollama pull qwen2.5:7b-instruct).');
          result = await withGpu('llm', () => runDisplayName(model, input));
        } else if (job.task_type === 'options') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다.');
          result = await withGpu('llm', () => runOptions(model, input));
        } else if (job.task_type === 'content') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다.');
          result = await withGpu('llm', () => runContent(model, input));
        } else if (job.task_type === 'search_tags') {
          if (!model) throw new Error('설치된 Ollama 모델이 없습니다.');
          result = await withGpu('llm', () => runSearchTags(model, input));
        } else if (job.task_type === 'category') {
          result = await withGpu('llm', () => runCategory(input));
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
