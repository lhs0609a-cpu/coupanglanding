// 라이브 쿠팡 API attributeMeta 캐시 → coupang-cat-details.json b/s 재생성
//
// 입력: src/lib/megaload/data/cache/live-attr-meta-shard*.json (16k cats)
// 출력: src/lib/megaload/data/coupang-cat-details.regen.json (수동 검토 후 swap)
//
// 변환 규칙:
//   live.attributes 의 각 attr →
//     - exposed='EXPOSED' + required=true  → b array (구매옵션)
//     - exposed='NONE' OR required=false   → s array (검색속성)
//     - dataType='NUMBER' + basicUnit (≠'없음') → unit 필드 추가
//     - dataType='STRING' OR basicUnit='없음'    → unit 필드 생략
//     - groupNumber !== 'NONE' + 그룹에 2+ EXPOSED 멤버  → c1=true (택1)
//
// 보존: 기존 p, r 필드 (path, commission rate)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const cacheDir = join(dataDir, 'cache');

const existingDetails = JSON.parse(readFileSync(join(dataDir, 'coupang-cat-details.json'), 'utf-8'));
const liveMeta = {};
for (let s = 0; s < 10; s++) {
  const f = join(cacheDir, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  for (const [code, val] of Object.entries(data)) {
    if (val.attrs) liveMeta[code] = val.attrs;
  }
}
console.log(`Live cache: ${Object.keys(liveMeta).length} cats`);
console.log(`Local existing: ${Object.keys(existingDetails).length} cats`);

const regen = {};
let regenerated = 0;
let preservedNoLive = 0;

for (const [code, existing] of Object.entries(existingDetails)) {
  const live = liveMeta[code];
  if (!live) {
    // 라이브 데이터 없음 → 기존 데이터 보존
    regen[code] = existing;
    preservedNoLive++;
    continue;
  }

  // groupNumber 별 EXPOSED 멤버 수 계산 (c1 판정용)
  const exposedGroupCounts = new Map();
  for (const a of live) {
    if (a.ex === 'EXPOSED' && a.gn && a.gn !== 'NONE') {
      exposedGroupCounts.set(a.gn, (exposedGroupCounts.get(a.gn) || 0) + 1);
    }
  }

  const b = [];
  const s = [];
  for (const a of live) {
    const basicIsSentinel = a.bu === '없음' || a.bu === '없음 ';
    const isNumber = a.dt === 'NUMBER';
    const opt = { n: a.n, r: !!a.r };
    if (isNumber && a.bu && !basicIsSentinel) opt.u = a.bu;
    if (a.ex === 'EXPOSED' && a.gn && a.gn !== 'NONE' && (exposedGroupCounts.get(a.gn) || 0) > 1) {
      opt.c1 = true;
    }

    if (a.ex === 'EXPOSED' && a.r) {
      b.push(opt);
    } else {
      s.push(opt);
    }
  }

  regen[code] = {
    p: existing.p,
    r: existing.r,
    b,
    s,
    ...(existing.nc !== undefined ? { nc: existing.nc } : {}),
  };
  regenerated++;
}

// 라이브에는 있는데 로컬에는 없는 cat → 추가
let liveOnly = 0;
for (const [code, live] of Object.entries(liveMeta)) {
  if (existingDetails[code]) continue;
  // 카테고리 path 없으므로 b/s 만 생성
  const exposedGroupCounts = new Map();
  for (const a of live) {
    if (a.ex === 'EXPOSED' && a.gn && a.gn !== 'NONE') {
      exposedGroupCounts.set(a.gn, (exposedGroupCounts.get(a.gn) || 0) + 1);
    }
  }
  const b = [], sArr = [];
  for (const a of live) {
    const basicIsSentinel = a.bu === '없음' || a.bu === '없음 ';
    const isNumber = a.dt === 'NUMBER';
    const opt = { n: a.n, r: !!a.r };
    if (isNumber && a.bu && !basicIsSentinel) opt.u = a.bu;
    if (a.ex === 'EXPOSED' && a.gn && a.gn !== 'NONE' && (exposedGroupCounts.get(a.gn) || 0) > 1) opt.c1 = true;
    if (a.ex === 'EXPOSED' && a.r) b.push(opt); else sArr.push(opt);
  }
  regen[code] = { p: '?', r: 0, b, s: sArr };
  liveOnly++;
}

writeFileSync(join(dataDir, 'coupang-cat-details.regen.json'), JSON.stringify(regen));
console.log(`\n=== 재생성 결과 ===`);
console.log(`Regenerated (live 기반): ${regenerated.toLocaleString()}`);
console.log(`Preserved (라이브 없음): ${preservedNoLive.toLocaleString()}`);
console.log(`Live-only (로컬 없음): ${liveOnly.toLocaleString()}`);
console.log(`Total: ${Object.keys(regen).length.toLocaleString()}`);
console.log(`\n파일: src/lib/megaload/data/coupang-cat-details.regen.json`);
console.log(`확인 후 coupang-cat-details.json 으로 swap 하세요.`);
