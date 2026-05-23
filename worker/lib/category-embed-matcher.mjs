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
import { embed } from './local-llm.mjs';

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
 * 상품명 → top-K 카테고리 후보 (의미 유사도순).
 * @returns {Promise<Array<{code:string, path:string, score:number}>>}
 */
export async function topCandidatesEmbed(productName, k = 8) {
  const st = load();
  const [qv] = await embed(st.model, productName);
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
