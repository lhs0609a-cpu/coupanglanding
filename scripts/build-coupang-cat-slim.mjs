/**
 * 쿠팡 카테고리 슬림 인덱스 생성기
 *
 * public/data/coupang-cat-details.json 은 11.5MB 다. 목록·허브·사이트맵에서까지
 * 이걸 파싱하면 람다 콜드스타트마다 수백 ms 와 수십 MB 를 버린다.
 * 목록에 필요한 필드만 뽑아 슬림 인덱스를 만들어 둔다.
 *
 * 원본 인덱스(coupang-cat-index.json)의 평문 경로는 대분류 판별에 쓸 수 없다.
 * "가구/홈데코" 가 "가구 홈데코" 로 슬래시가 지워져 있어 공백으로 잘라내면 "가구" 가 된다.
 * 그래서 대분류는 상세의 p 경로("가구/홈데코>…")에서만 가져온다.
 *
 * 실행: node scripts/build-coupang-cat-slim.mjs
 * 원본 카테고리 데이터가 갱신되면 다시 실행하고 결과 파일을 커밋한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'public', 'data', 'coupang-cat-details.json');
const OUT = path.join(ROOT, 'src', 'lib', 'data', 'generated', 'coupang-cat-slim.json');
const SHARD_DIR = path.join(ROOT, 'public', 'data', 'cat-attrs');
/** 속성 샤드 개수. 11.5MB / 32 ≈ 샤드당 400KB */
const SHARD_COUNT = 32;

/** id → 샤드 번호. 런타임 로더(coupang-categories.ts)와 반드시 같은 식이어야 한다 */
function shardOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

const details = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/** [id, 표시명, 전체경로(>구분), depth, 수수료율, 필수속성수, 전체속성수] */
const rows = [];
for (const id of Object.keys(details)) {
  const d = details[id];
  if (!d || !d.p) continue;
  const parts = d.p.split('>').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) continue;
  const b = d.b || [];
  const s = d.s || [];
  const requiredCount = b.filter((a) => a.r).length + s.filter((a) => a.r).length;
  rows.push([
    id,
    parts[parts.length - 1],
    parts.join('>'),
    parts.length,
    d.r,
    requiredCount,
    b.length + s.length,
  ]);
}

// 대분류 → 이름 순으로 안정 정렬 (출력이 매번 같아야 diff 가 의미를 갖는다)
rows.sort((x, y) => x[2].localeCompare(y[2], 'ko'));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rows), 'utf8');

/**
 * 속성 샤드 — 상세 JSON(11.5MB)을 통째로 읽지 않기 위한 분할.
 *
 * 빌드의 page-data 수집은 워커 20여 개가 동시에 돈다. 워커마다 11.5MB 를 파싱하면
 * 수 GB 를 쓰고 OOM 으로 죽는다(실제로 죽었다). 런타임 콜드스타트도 같은 문제를 겪는다.
 * id 해시로 32조각으로 쪼개 필요한 조각만 읽는다.
 */
fs.rmSync(SHARD_DIR, { recursive: true, force: true });
fs.mkdirSync(SHARD_DIR, { recursive: true });

const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
for (const id of Object.keys(details)) {
  const d = details[id];
  if (!d || !d.p) continue;
  shards[shardOf(id)][id] = { b: d.b || [], s: d.s || [] };
}
let shardBytes = 0;
let maxShard = 0;
shards.forEach((obj, i) => {
  const file = path.join(SHARD_DIR, `${i}.json`);
  fs.writeFileSync(file, JSON.stringify(obj), 'utf8');
  const size = fs.statSync(file).size;
  shardBytes += size;
  maxShard = Math.max(maxShard, size);
});

const tops = new Map();
for (const r of rows) {
  const top = r[2].split('>')[0];
  tops.set(top, (tops.get(top) || 0) + 1);
}
const depths = {};
for (const r of rows) depths[r[3]] = (depths[r[3]] || 0) + 1;

console.log(`생성: ${path.relative(ROOT, OUT)}`);
console.log(`  카테고리 ${rows.length.toLocaleString()}개 · ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)}MB`);
console.log(`  대분류 ${tops.size}개:`, [...tops.entries()].map(([k, v]) => `${k}(${v})`).join(', '));
console.log(`  depth 분포:`, depths);
console.log(
  `속성 샤드: ${SHARD_COUNT}개 · 합계 ${(shardBytes / 1024 / 1024).toFixed(2)}MB · ` +
    `최대 ${(maxShard / 1024).toFixed(0)}KB (원본 11.5MB 를 조각내 필요한 것만 읽는다)`
);
