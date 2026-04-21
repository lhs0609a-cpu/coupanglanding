#!/usr/bin/env node
/**
 * 카테고리 SEO 키워드 풀 생성기
 *
 * - coupang-cat-index.json + coupang-cat-details.json에서 16,259개 카테고리 경로 추출
 * - 기존 seo-keyword-pools.json에 이미 있는 카테고리는 SKIP (수작업 풀 보존)
 * - 나머지에 대해 claude -p (구독) 호출 → generic/ingredients/features 8개씩 생성
 * - 100개마다 seo-keyword-pools.generated.json에 체크포인트 저장 → 중단/재개 가능
 * - 동시성 제한 (CONCURRENCY=5, rate limit 안전)
 *
 * 사용법:
 *   node scripts/generate-category-pools.mjs           # 전체 실행
 *   node scripts/generate-category-pools.mjs --limit 10  # 10개만 (테스트용)
 *   node scripts/generate-category-pools.mjs --dry-run   # 대상 카테고리 수만 출력
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'src/lib/megaload/data');
const INDEX_FILE = join(DATA_DIR, 'coupang-cat-index.json');
const DETAILS_FILE = join(DATA_DIR, 'coupang-cat-details.json');
const EXISTING_POOLS_FILE = join(DATA_DIR, 'seo-keyword-pools.json');
const OUTPUT_FILE = join(DATA_DIR, 'seo-keyword-pools.generated.json');

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = 10;      // 동시 Claude 호출 수
const BATCH_SIZE = 15;       // 호출당 카테고리 수 (spawn 오버헤드 분산)
const CHECKPOINT_EVERY = 5;  // 배치 단위 (5배치 = 50카테고리마다 저장)
const MAX_RETRIES = 2;

// ─── 유틸 ──────────────────────────────────────────────────

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--model', 'claude-sonnet-4-6'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout);
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function buildBatchPrompt(items) {
  // items: [{ path, leafName }, ...]
  const list = items.map((it, i) => `${i + 1}. ${it.path}`).join('\n');
  return `너는 한국 쿠팡 SEO 키워드 전문가다. 아래 카테고리 ${items.length}개에 대한 SEO 키워드를 JSON으로만 출력하라(설명/마크다운/코드펜스 금지).

카테고리:
${list}

규칙(각 카테고리별):
- generic: 카테고리 일반 키워드 8개 (예: 영양제, 건강기능식품)
- ingredients: 성분/소재 8개 (없는 카테고리면 [])
- features: 효능/특징/용도 8개 (없는 카테고리면 [])
- 각 항목 2~10자 한국어, 일반 검색어 우선
- 수식어(프리미엄/슈퍼/베이직 등) 금지, 브랜드명 금지, 숫자/단위 금지

출력 형식(키는 카테고리 경로 그대로):
{
  "${items[0].path}": {"generic":[...],"ingredients":[...],"features":[...]},
  "${items[items.length - 1].path}": {"generic":[...],"ingredients":[...],"features":[...]}
}

이제 ${items.length}개 카테고리에 대해 JSON만 출력:`;
}

function extractJson(text) {
  // ```json ... ``` 또는 순수 JSON 블록 추출
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) return JSON.parse(fenced[1]);
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) return JSON.parse(bare[0]);
  throw new Error(`JSON not found in: ${text.slice(0, 200)}`);
}

function normalizePool(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { generic: [], ingredients: [], features: [] };
  for (const k of ['generic', 'ingredients', 'features']) {
    const v = p[k];
    if (!Array.isArray(v)) return null;
    out[k] = v.filter(x => typeof x === 'string').slice(0, 8);
  }
  return out;
}

async function processBatch(items) {
  // items: [{ path, leafName }, ...] (최대 BATCH_SIZE개)
  // 반환: { path → pool } (성공한 것만)
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES + 1; attempt++) {
    try {
      const out = await callClaude(buildBatchPrompt(items));
      const parsed = extractJson(out);
      if (!parsed || typeof parsed !== 'object') throw new Error('not object');
      const result = {};
      for (const it of items) {
        const pool = normalizePool(parsed[it.path]);
        if (pool) result[it.path] = pool;
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (/rate.?limit|429|too many/i.test(String(err))) {
        console.warn(`[rate-limit] 배치 ${items.length}개 — 60s 대기`);
        await new Promise(r => setTimeout(r, 60_000));
      } else {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

// ─── 메인 ──────────────────────────────────────────────────

async function main() {
  console.log('[load] 카테고리 데이터 로드 중...');
  const indexJson = JSON.parse(await readFile(INDEX_FILE, 'utf8'));
  const detailsJson = JSON.parse(await readFile(DETAILS_FILE, 'utf8'));
  const existingPools = JSON.parse(await readFile(EXISTING_POOLS_FILE, 'utf8'));
  const existingPaths = new Set(Object.keys(existingPools.categoryPools || {}));

  // index: [code, tokensString, leafName, depth]
  // details[code]: { p: path, ... }
  const allPaths = new Map(); // path → { code, leafName }
  for (const [code, , leafName] of indexJson) {
    const detail = detailsJson[code];
    if (!detail || !detail.p) continue;
    if (!allPaths.has(detail.p)) {
      allPaths.set(detail.p, { code, leafName });
    }
  }

  // 체크포인트 로드
  let generated = {};
  if (await exists(OUTPUT_FILE)) {
    generated = JSON.parse(await readFile(OUTPUT_FILE, 'utf8'));
    console.log(`[resume] 기존 ${Object.keys(generated).length}개 결과 로드`);
  }
  const generatedPaths = new Set(Object.keys(generated));

  // SKIP 대상: 기존 수작업 풀 + 이미 생성된 것
  const targets = [...allPaths.entries()]
    .filter(([path]) => !existingPaths.has(path) && !generatedPaths.has(path))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`[plan] 전체 ${allPaths.size}개 카테고리 중`);
  console.log(`       - 수작업 풀 보존: ${existingPaths.size}개`);
  console.log(`       - 이미 생성됨: ${generatedPaths.size}개`);
  console.log(`       - 신규 생성 대상: ${targets.length}개`);
  console.log(`       - 동시성: ${CONCURRENCY}, 체크포인트: ${CHECKPOINT_EVERY}개마다`);

  if (DRY_RUN || targets.length === 0) {
    console.log('[done] dry-run 또는 작업 없음.');
    return;
  }

  // 배치 단위로 묶기
  const batches = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE).map(([path, { leafName }]) => ({ path, leafName })));
  }
  console.log(`[batch] ${batches.length}개 배치 (배치당 최대 ${BATCH_SIZE}개)`);

  let done = 0, failed = 0;
  const failures = [];
  let nextBatchIdx = 0;
  const startTime = Date.now();

  async function worker() {
    while (nextBatchIdx < batches.length) {
      const bi = nextBatchIdx++;
      const batch = batches[bi];
      try {
        const results = await processBatch(batch);
        for (const it of batch) {
          if (results[it.path]) {
            generated[it.path] = results[it.path];
            done++;
          } else {
            failed++;
            failures.push({ path: it.path, error: 'missing in batch response' });
          }
        }
      } catch (err) {
        // 배치 전체 실패 → 모든 카테고리를 실패로 기록
        for (const it of batch) {
          failed++;
          failures.push({ path: it.path, error: String(err).slice(0, 200) });
        }
        console.warn(`[fail-batch] ${bi}: ${String(err).slice(0, 100)}`);
      }
      // 진행 + 체크포인트
      const total = done + failed;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = total / elapsed;
      const eta = Math.round((targets.length - total) / Math.max(rate, 0.01));
      console.log(`[progress] ${total}/${targets.length} (성공 ${done}, 실패 ${failed}) — ${rate.toFixed(1)}건/s — ETA ${Math.floor(eta/60)}분`);
      if ((bi + 1) % CHECKPOINT_EVERY === 0) {
        await writeFile(OUTPUT_FILE, JSON.stringify(generated, null, 0));
        console.log(`[checkpoint] ${OUTPUT_FILE} 저장 (${Object.keys(generated).length}개)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // 최종 저장
  await writeFile(OUTPUT_FILE, JSON.stringify(generated, null, 0));
  console.log(`\n[finalize] ${OUTPUT_FILE} 저장 완료 (${Object.keys(generated).length}개)`);
  if (failures.length > 0) {
    const failFile = OUTPUT_FILE.replace('.json', '.failures.json');
    await writeFile(failFile, JSON.stringify(failures, null, 2));
    console.log(`[fail-log] ${failFile} (${failures.length}개)`);
  }
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`[done] 총 ${done + failed}개 처리 (성공 ${done}, 실패 ${failed}) — ${elapsed}분`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });
