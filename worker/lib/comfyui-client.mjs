/**
 * ComfyUI HTTP 클라이언트 (의존성 0 — Node 18+ 내장 fetch/FormData/Blob 사용)
 *
 * 표준 패턴: ComfyUI UI에서 워크플로를 만든 뒤 "Save (API Format)"으로 내보낸
 * JSON 그래프를 로드 → 입력 이미지/프롬프트/시드만 갈아끼워 큐에 넣음.
 * 그래프 구조가 어떻든(인페인트/img2img/IP-Adapter) 동작한다.
 *
 * ComfyUI API 엔드포인트:
 *   POST /upload/image      입력 이미지 업로드 (multipart)
 *   POST /prompt            워크플로 큐잉 → { prompt_id }
 *   GET  /history/{id}      실행 결과 조회
 *   GET  /view?...          출력 이미지 다운로드
 *   GET  /system_stats      헬스/디바이스 정보
 */

import { randomUUID } from 'node:crypto';

/** ComfyUI 서버 헬스 + GPU 정보 확인. 실패 시 throw. */
export async function checkHealth(comfyUrl) {
  const res = await fetch(`${comfyUrl}/system_stats`);
  if (!res.ok) throw new Error(`ComfyUI 응답 실패 (${res.status}) — 서버가 켜져 있나요? ${comfyUrl}`);
  const stats = await res.json();
  const dev = stats?.devices?.[0];
  return {
    comfyVersion: stats?.system?.comfyui_version ?? 'unknown',
    device: dev?.name ?? 'unknown',
    vramTotalMb: dev?.vram_total ? Math.round(dev.vram_total / 1048576) : 0,
  };
}

/** ComfyUI 에 설치된 노드 class_type 목록(Set). /object_info 키가 곧 사용가능 노드. */
export async function listNodeTypes(comfyUrl) {
  const res = await fetch(`${comfyUrl}/object_info`);
  if (!res.ok) throw new Error(`/object_info 응답 실패 (${res.status})`);
  const info = await res.json();
  return new Set(Object.keys(info));
}

/** 워크플로가 요구하는 class_type 중 ComfyUI 에 설치 안 된 것 목록(커스텀 노드 누락 탐지용). */
export function missingNodeTypes(graph, availableSet) {
  const required = new Set();
  for (const n of Object.values(graph)) {
    if (n && typeof n === 'object' && n.class_type) required.add(n.class_type);
  }
  return [...required].filter((c) => !availableSet.has(c));
}

/** API-format 워크플로 JSON 로드 */
export async function loadWorkflow(fs, path) {
  const raw = await fs.readFile(path, 'utf8');
  const graph = JSON.parse(raw);
  // "Save (API Format)"은 노드 맵을 그대로 반환. UI export(.json with "nodes" array)는 미지원.
  if (graph.nodes && Array.isArray(graph.nodes)) {
    throw new Error(
      '이 워크플로는 UI 포맷입니다. ComfyUI에서 "Save (API Format)"으로 다시 내보내주세요.\n' +
      '(설정 → Enable Dev mode Options 활성화하면 메뉴가 보입니다)',
    );
  }
  return graph;
}

/**
 * 워크플로 그래프에 입력값 주입.
 * - LoadImage 노드의 image 입력 → 업로드한 파일명
 * - KSampler가 가리키는 positive/negative CLIPTextEncode 텍스트 (프롬프트 지정 시)
 * - KSampler 계열 seed 무작위화 (고정 시드로 같은 결과 반복 방지)
 *
 * 노드 ID를 몰라도 class_type으로 자동 탐지한다. nodeIds로 명시 지정도 가능.
 */
export function patchWorkflow(graph, { inputFilename, positivePrompt, negativePrompt, seed, nodeIds = {} }) {
  const g = structuredClone(graph);

  // 비-노드 키 제거 (예: "_comment" 설명 문자열).
  // ComfyUI 0.22+ 의 validate_prompt 는 prompt 의 모든 키를 노드로 간주해
  // node_data.get('_meta') 를 호출 → 문자열 값이면 500(AttributeError) 발생.
  // class_type 없는 값은 모두 제거해서 어떤 ComfyUI 버전에서도 안전하게.
  for (const k of Object.keys(g)) {
    if (!g[k] || typeof g[k] !== 'object' || !g[k].class_type) delete g[k];
  }

  const findByClass = (cls) =>
    Object.entries(g).filter(([, n]) => n?.class_type === cls).map(([id]) => id);

  // 1) 입력 이미지
  const loadIds = nodeIds.loadImage ? [String(nodeIds.loadImage)] : findByClass('LoadImage');
  if (loadIds.length === 0) {
    throw new Error('워크플로에 LoadImage 노드가 없습니다. 입력 이미지를 받을 노드가 필요합니다.');
  }
  for (const id of loadIds) g[id].inputs.image = inputFilename;

  // 2) KSampler 계열 — seed 무작위화 + positive/negative 링크 추적
  const samplerIds = [...findByClass('KSampler'), ...findByClass('KSamplerAdvanced'), ...findByClass('SamplerCustom')];
  const seedVal = seed ?? Math.floor(Math.random() * 1e15);
  for (const id of samplerIds) {
    const inp = g[id].inputs;
    if ('seed' in inp) inp.seed = seedVal;
    if ('noise_seed' in inp) inp.noise_seed = seedVal;

    // positive/negative는 [nodeId, outputIdx] 링크 → 따라가서 CLIPTextEncode 텍스트 교체
    if (positivePrompt != null) setPromptViaLink(g, inp.positive, positivePrompt);
    if (negativePrompt != null) setPromptViaLink(g, inp.negative, negativePrompt);
  }

  // sampler가 없거나 링크 추적 실패 시: 노드 ID 직접 지정분 처리
  if (nodeIds.positive != null && positivePrompt != null && g[nodeIds.positive]) {
    g[nodeIds.positive].inputs.text = positivePrompt;
  }
  if (nodeIds.negative != null && negativePrompt != null && g[nodeIds.negative]) {
    g[nodeIds.negative].inputs.text = negativePrompt;
  }

  return g;
}

function setPromptViaLink(g, link, text) {
  if (!Array.isArray(link)) return;
  const node = g[link[0]];
  if (node?.class_type === 'CLIPTextEncode' && node.inputs && 'text' in node.inputs) {
    node.inputs.text = text;
  }
}

/** 입력 이미지 업로드 → ComfyUI input 디렉토리에 저장된 파일명 반환 */
export async function uploadImage(comfyUrl, buffer, filename) {
  const form = new FormData();
  form.append('image', new Blob([buffer]), filename);
  form.append('overwrite', 'true');
  const res = await fetch(`${comfyUrl}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`이미지 업로드 실패 (${res.status}): ${await res.text().catch(() => '')}`);
  const data = await res.json();
  // subfolder가 있으면 "subfolder/name" 형태로 LoadImage에 넣어야 함
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

/** 워크플로 큐잉 → prompt_id */
export async function queuePrompt(comfyUrl, graph, clientId) {
  const res = await fetch(`${comfyUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`큐잉 실패 (${res.status}): ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  if (!data.prompt_id) throw new Error(`prompt_id 없음: ${JSON.stringify(data).slice(0, 300)}`);
  return data.prompt_id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** /history 폴링으로 완료 대기 → 출력 이미지 메타 목록 [{filename, subfolder, type}] */
export async function waitForResult(comfyUrl, promptId, { timeoutMs = 300_000, pollMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // ⚠️ 폴링 fetch 의 일시적 실패를 throw 하지 않는다.
    //   CPU/저사양 환경에선 ComfyUI 가 무거운 샘플링 중 HTTP 응답을 잠깐 못 해
    //   fetch 가 "fetch failed"(ECONNRESET 등) 로 던질 수 있다. 그때 작업을 포기하면
    //   (워커가 실제로 처리 중인데도) 폴백돼 버림 → 다음 폴링으로 재시도하고 deadline 까지 버틴다.
    let res;
    try {
      res = await fetch(`${comfyUrl}/history/${promptId}`);
    } catch {
      await sleep(pollMs);
      continue;
    }
    if (res.ok) {
      const hist = await res.json().catch(() => ({}));
      const entry = hist[promptId];
      if (entry) {
        const status = entry.status?.status_str;
        if (status === 'error') {
          const msgs = (entry.status?.messages ?? [])
            .filter((m) => m[0] === 'execution_error')
            .map((m) => m[1]?.exception_message)
            .filter(Boolean);
          throw new Error(`ComfyUI 실행 오류: ${msgs.join(' | ') || '알 수 없음'}`);
        }
        const images = [];
        for (const out of Object.values(entry.outputs ?? {})) {
          for (const img of out.images ?? []) images.push(img);
        }
        if (images.length > 0) return images.filter((i) => i.type === 'output' || !i.type);
        if (status === 'success') return images; // 출력 이미지 없는 성공 (드뭄)
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`타임아웃 (${Math.round(timeoutMs / 1000)}초) — prompt_id=${promptId}`);
}

/** 출력 이미지 다운로드 → Buffer */
export async function downloadOutput(comfyUrl, { filename, subfolder = '', type = 'output' }) {
  const q = new URLSearchParams({ filename, subfolder, type });
  const res = await fetch(`${comfyUrl}/view?${q}`);
  if (!res.ok) throw new Error(`출력 다운로드 실패 (${res.status}): ${filename}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 한 장 처리: 업로드 → 패치 → 큐잉 → 대기 → 다운로드.
 * @returns {Promise<Buffer>} 첫 출력 이미지 버퍼
 */
export async function generateThumbnail(comfyUrl, {
  imageBuffer, inputName, workflow, positivePrompt, negativePrompt, seed, nodeIds, timeoutMs,
}) {
  const clientId = randomUUID();
  const uploadedName = await uploadImage(comfyUrl, imageBuffer, inputName);
  const graph = patchWorkflow(workflow, {
    inputFilename: uploadedName, positivePrompt, negativePrompt, seed, nodeIds,
  });
  const promptId = await queuePrompt(comfyUrl, graph, clientId);
  const outputs = await waitForResult(comfyUrl, promptId, { timeoutMs });
  if (outputs.length === 0) throw new Error('출력 이미지가 생성되지 않았습니다.');
  return downloadOutput(comfyUrl, outputs[0]);
}
