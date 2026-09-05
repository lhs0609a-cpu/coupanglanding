/**
 * 카테고리 임베딩 매처 (완전 로컬, ollama 임베딩 + 코사인)
 * ---------------------------------------------------------------------------
 * build 스크립트(category-embed-build.mjs)가 만든 정규화 벡터(.f32)+메타를 로드해,
 * 상품명 임베딩과 코사인 유사도로 top-K 카테고리 후보를 뽑는다.
 * 토큰매칭(category-candidates-mini)보다 의미 정확도가 높다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { embed, freeVram, unload } from './local-llm.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const META = join(here, 'data', 'cat-embeddings.meta.json');
const VEC = join(here, 'data', 'cat-embeddings.f32');

let STATE = null;
export function isBuilt() { return existsSync(META) && existsSync(VEC); }

function load() {
  if (STATE) return STATE;
  const meta = JSON.parse(readFileSync(META, 'utf8')); // { model, dim, count, codes:[], paths:[] }
  const buf = readFileSync(VEC);
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  STATE = { ...meta, vectors };
  return STATE;
}

function normalize(v) {
  let s = 0; for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

/**
 * 이미 구한 질의 벡터로 top-K 를 고른다(네트워크 호출 없음 — 순수 계산).
 * `embedQueries` 로 한꺼번에 벡터를 받아 두고 상품마다 이걸 부른다.
 */
export function topCandidatesFromVec(qvRaw, k = 8) {
  if (!qvRaw) return [];
  const st = load();
  const q = normalize(qvRaw);
  const { dim, count, vectors, codes, paths } = st;
  const scores = new Array(count);
  for (let i = 0; i < count; i++) {
    let dot = 0; const off = i * dim;
    for (let d = 0; d < dim; d++) dot += vectors[off + d] * q[d]; // 저장 벡터는 정규화됨
    scores[i] = { i, dot };
  }
  scores.sort((a, b) => b.dot - a.dot);
  return scores.slice(0, k).map(({ i, dot }) => ({ code: String(codes[i]), path: paths[i], score: +dot.toFixed(3) }));
}

/**
 * 질의 여러 개를 **한 번의 호출로** 임베딩한다.
 * ---------------------------------------------------------------------------
 * ⚠️ 왜 한 번인가(실측 2026-08-25): 예전엔 상품마다 임베딩을 따로 불렀는데, 그 호출이
 *    **텍스트 생성과 같은 ollama 슬롯을 두고 경쟁**한다. 생성은 동시 6개가 각각 수십 초씩
 *    도는 중이라, 뒤에 선 임베딩 한 건이 그 줄을 다 기다린다. 이 PC 에서 재현했을 때
 *    60초를 넘겨도 응답이 없었고 — 상한이 없던 탓에 **생성 전체가 거기서 멈췄다**.
 *    100개면 이 줄서기를 100번 한다.
 * → 생성이 시작되기 **전에**, 아무도 슬롯을 안 쓸 때, 전부 한 번에 받는다.
 *    입력이 배열이면 ollama 가 배열로 돌려준다. 실패하면 빈 배열 → 호출부가 토큰 매칭으로 간다.
 * @param {string[]} queries
 * @param {{timeoutMs?:number, onLog?:Function}} [o]
 * @returns {Promise<number[][]>} queries 와 같은 길이(실패 시 빈 배열)
 */
export async function embedQueries(queries, { timeoutMs = 120_000, onLog } = {}) {
  if (!isBuilt() || !queries?.length) return [];
  const st = load();
  const out = [];
  // ⭐ 임베딩 전에 **텍스트 모델을 GPU 에서 내린다**(실측 2026-08-25, RTX 4060 Ti 16GB).
  //    이 함수가 "아무도 슬롯을 안 쓰는 시점"에 불린다는 전제는 반만 맞았다. 줄서기가 아니라
  //    **자리(VRAM)** 가 문제였다: exaone 이 떠 있으면 bge-m3 가 아예 못 뜨고, 요청이
  //    실패하지도 않고 **영원히 매달린다**(빈 GPU 10.6초 vs 떠 있을 때 90초+ 무응답).
  //    keep_alive 가 30분이라 앞선 실행의 모델이 그대로 남아 있어, 두 번째 실행부터는
  //    임베딩이 매번 상한까지 매달렸다가 접혔다 → 그 실행 내내 카테고리가 조용히 토큰 매칭으로
  //    떨어졌다. 속도만이 아니라 **분류 정확도가 말없이 낮아지던** 경로다.
  //    비용은 텍스트 모델 재적재뿐이고 실측 0.2~0.6초다(디스크 캐시).
  const freed = await freeVram();
  if (freed.length) onLog?.(`[카테고리] 임베딩 자리를 만들려고 ${freed.join(', ')} 를 잠시 내렸습니다(재적재 1초 미만).`);
  try {
    // 너무 크게 묶으면 한 번에 실패했을 때 전부 잃는다 — 32개씩 나눠 던진다.
    const CHUNK = 32;
    for (let i = 0; i < queries.length; i += CHUNK) {
      const part = queries.slice(i, i + CHUNK);
      try {
        const vecs = await embed(st.model, part, { timeoutMs });
        if (vecs.length !== part.length) throw new Error(`응답 ${vecs.length}개 ≠ 요청 ${part.length}개`);
        out.push(...vecs);
      } catch (e) {
        onLog?.(`[카테고리] 임베딩 일괄 요청 실패(${String(e?.message || e).slice(0, 80)}) — `
          + '이 실행은 토큰 매칭으로 후보를 뽑습니다(설계된 폴백).');
        return [];
      }
    }
    return out;
  } finally {
    // 임베딩 모델을 곧바로 내린다 — 이제 자리를 차지하는 쪽이 반대가 된다. 벡터는 이미 다
    // 받아 뒀으므로(이 함수의 존재 이유) 남겨 둘 이유가 없고, 남기면 텍스트 생성이 좁은
    // VRAM 에서 돌거나 같은 방식으로 매달린다.
    await unload(st.model);
  }
}

/**
 * 상품명 → top-K 카테고리 후보 (의미 유사도순).
 * @returns {Promise<Array<{code:string, path:string, score:number}>>}
 */
/**
 * 임베딩이 이 PC 에서 **못 쓰는 상태**인가 — 한 번 정하면 이 실행 내내 유지한다.
 * ---------------------------------------------------------------------------
 * 상한 초과는 사진이나 상품의 문제가 아니라 **이 PC/엔진의 상태**다(모델이 자리를 못 잡음).
 * 한 번 걸리면 다음 상품도 걸린다 — 그런데 상품마다 상한을 다시 태우면 100개면 25분을
 * 그냥 버린다. 두 번 걸리면 접고, 남은 상품은 곧바로 토큰 매칭으로 간다.
 * 품질은 그대로다: 상한 초과 시의 결과가 어차피 토큰 폴백이다(ai-batch 의 candidatesFor).
 */
const EMBED_GIVEUP_AFTER = 2;
let embedTimeouts = 0;
let embedOff = false;
export function embedDisabled() { return embedOff; }

export async function topCandidatesEmbed(productName, k = 8) {
  if (embedOff) return [];
  const st = load();
  let qv;
  try {
    [qv] = await embed(st.model, productName);
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    if (timedOut && ++embedTimeouts >= EMBED_GIVEUP_AFTER && !embedOff) {
      embedOff = true;
      console.log('[카테고리] 임베딩 매칭이 응답하지 않아 이 실행에서는 접습니다 — '
        + '남은 상품은 토큰 매칭으로 후보를 뽑습니다(설계된 폴백).');
    }
    throw e;   // 호출부(candidatesFor)의 catch 가 토큰 폴백으로 받는다
  }
  if (!qv) return [];
  const q = normalize(qv);
  const { dim, count, vectors, codes, paths } = st;
  const scores = new Array(count);
  for (let i = 0; i < count; i++) {
    let dot = 0; const off = i * dim;
    for (let d = 0; d < dim; d++) dot += vectors[off + d] * q[d]; // 저장 벡터는 정규화됨
    scores[i] = i;
    scores[i] = { i, dot };
  }
  scores.sort((a, b) => b.dot - a.dot);
  return scores.slice(0, k).map(({ i, dot }) => ({ code: String(codes[i]), path: paths[i], score: +dot.toFixed(3) }));
}
