/**
 * 카테고리 임베딩 인덱스 빌드 (1회용, 순수 node + ollama)
 * ---------------------------------------------------------------------------
 * coupang-cat-index.json(16k) 의 각 카테고리를 ollama 임베딩(bge-m3)으로 벡터화해
 * 정규화 후 cat-embeddings.f32(바이너리) + cat-embeddings.meta.json 으로 저장.
 *
 * 실행:  node build-cat-embeddings.mjs [임베딩모델=bge-m3]
 * 사전:  ollama pull bge-m3
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isUp, embed } from './lib/local-llm.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2] || 'bge-m3';
const BATCH = 48;

function normInto(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / n;
  return v;
}

const okVec = (e) => Array.isArray(e) && e.length > 0 && e.every((x) => Number.isFinite(x));

async function main() {
  if (!(await isUp())) { console.error('ollama 미응답'); process.exit(1); }
  const idx = JSON.parse(readFileSync(join(here, 'lib', 'data', 'coupang-cat-index.json'), 'utf8'));
  console.log(`카테고리 ${idx.length}개 임베딩 시작 (모델 ${MODEL}, 배치 ${BATCH})...`);

  const codes = idx.map((r) => String(r[0]));
  const paths = idx.map((r) => String(r[1]));
  // 제어문자 제거 + 공백 정리, 빈 문자열이면 코드로 대체
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const texts = idx.map((r) => clean(`${r[2]} / ${String(r[1]).replace(/\s+/g, ' > ')}`) || String(r[0]));

  let dim = 1024;
  let bad = 0;
  const vecs = [];
  const t0 = Date.now();
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    let embs = null;
    try { embs = await embed(MODEL, chunk); } catch { embs = null; }
    if (!embs || embs.length !== chunk.length || !embs.every(okVec)) {
      // 배치 실패/NaN 포함 → 개별 처리, 그래도 실패면 0벡터
      embs = [];
      for (const t of chunk) {
        let e = null;
        try { const r = await embed(MODEL, t); e = r[0]; } catch { e = null; }
        if (!okVec(e)) { e = new Array(dim).fill(0); bad++; }
        embs.push(e);
      }
    }
    for (const e of embs) { if (okVec(e)) dim = e.length; vecs.push(normInto(e)); }
    if (i % (BATCH * 10) === 0) {
      const pct = ((i / texts.length) * 100).toFixed(0);
      const eta = i > 0 ? ((Date.now() - t0) / i * (texts.length - i) / 1000).toFixed(0) : '?';
      process.stdout.write(`\r  ${i}/${texts.length} (${pct}%) ETA ${eta}s   `);
    }
  }
  console.log(`\n임베딩 완료: ${vecs.length}개 x ${dim}dim, ${((Date.now() - t0) / 1000).toFixed(0)}s (실패->0벡터 ${bad}개)`);

  const flat = new Float32Array(vecs.length * dim);
  for (let i = 0; i < vecs.length; i++) flat.set(vecs[i], i * dim);
  writeFileSync(join(here, 'lib', 'data', 'cat-embeddings.f32'), Buffer.from(flat.buffer));
  writeFileSync(join(here, 'lib', 'data', 'cat-embeddings.meta.json'),
    JSON.stringify({ model: MODEL, dim, count: vecs.length, codes, paths }));
  console.log('저장 완료: lib/data/cat-embeddings.f32 + .meta.json', `(${(flat.byteLength / 1e6).toFixed(0)}MB)`);
}

main().catch((e) => { console.error('\n빌드 오류:', e.message); process.exit(1); });
