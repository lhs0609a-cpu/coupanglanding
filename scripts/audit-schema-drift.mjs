// 로컬 cat-details.json b/s 와 라이브 API attribute meta 의 스키마 drift 비교
//
// 각 카테고리에 대해:
//   - 라이브 API EXPOSED required attrs
//   - 로컬 b 의 required attrs
//   - 매칭(이름 정규화) → 일치/누락/추가
//
// 출력: scripts/verification-reports/schema-drift-2026-05-14.json
//        + 콘솔 요약 (top drift cats)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const idx = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-index.json'), 'utf-8'));
const details = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json'), 'utf-8'));

const CACHE_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'cache');
const liveMeta = {};
for (let s = 0; s < 10; s++) {
  const f = join(CACHE_DIR, `live-attr-meta-shard${String(s).padStart(2, '0')}.json`);
  if (!existsSync(f)) continue;
  const data = JSON.parse(readFileSync(f, 'utf-8'));
  for (const [code, val] of Object.entries(data)) {
    if (val.attrs) liveMeta[code] = val.attrs;
  }
}

const catInfo = new Map();
for (const [code, fullSpace, leaf] of idx) {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  catInfo.set(String(code), { path, leaf });
}

function normalizeAttrName(name) {
  return String(name).replace(/\(택\d+\)/g, '').replace(/\s+/g, ' ').trim();
}

// 카테고리별 drift 측정
const driftCats = [];
let perfectCats = 0;
let driftedCats = 0;
const driftKinds = {
  nameOnly: 0,        // 이름은 다른데 동일한 의미 (수량 vs 총 수량)
  missingInLocal: 0,  // 라이브에는 있는데 로컬에 없음
  extraInLocal: 0,    // 로컬에는 있는데 라이브에 없음
  groupChanged: 0,    // groupNumber/choose1 차이
};

for (const [code, live] of Object.entries(liveMeta)) {
  const local = details[code];
  if (!local) continue;

  const liveExpReq = live.filter(a => a.ex === 'EXPOSED' && a.r);
  const localReq = (local.b || []).filter(o => o.r);

  const liveNames = new Set(liveExpReq.map(a => normalizeAttrName(a.n)));
  const localNames = new Set(localReq.map(o => normalizeAttrName(o.n)));

  const missingInLocal = [...liveNames].filter(n => !localNames.has(n));
  const extraInLocal = [...localNames].filter(n => !liveNames.has(n));

  if (missingInLocal.length === 0 && extraInLocal.length === 0) {
    perfectCats++;
    continue;
  }
  driftedCats++;
  if (missingInLocal.length > 0) driftKinds.missingInLocal++;
  if (extraInLocal.length > 0) driftKinds.extraInLocal++;

  driftCats.push({
    code,
    path: catInfo.get(code)?.path || '?',
    missingInLocal: liveExpReq.filter(a => missingInLocal.includes(normalizeAttrName(a.n))).map(a => ({ n: a.n, dt: a.dt, bu: a.bu, uu: a.uu, gn: a.gn })),
    extraInLocal: localReq.filter(o => extraInLocal.includes(normalizeAttrName(o.n))).map(o => ({ n: o.n, u: o.u, c1: !!o.c1 })),
  });
}

driftCats.sort((a, b) =>
  (b.missingInLocal.length + b.extraInLocal.length) - (a.missingInLocal.length + a.extraInLocal.length)
);

const summary = {
  meta: {
    totalCached: Object.keys(liveMeta).length,
    perfectCats,
    driftedCats,
    driftRate: +(driftedCats / Math.max(1, perfectCats + driftedCats) * 100).toFixed(2),
  },
  kinds: driftKinds,
  topDriftCats: driftCats.slice(0, 50),
  allDriftCount: driftCats.length,
};

writeFileSync('scripts/verification-reports/schema-drift-2026-05-14.json', JSON.stringify({ summary, drift: driftCats }, null, 2));
console.log('=== Schema Drift Report ===');
console.log(`Cached cats: ${summary.meta.totalCached.toLocaleString()}`);
console.log(`Perfect (in-sync): ${perfectCats.toLocaleString()} (${(100-summary.meta.driftRate).toFixed(1)}%)`);
console.log(`Drifted: ${driftedCats.toLocaleString()} (${summary.meta.driftRate}%)`);
console.log(`Drift kinds: missingInLocal=${driftKinds.missingInLocal}, extraInLocal=${driftKinds.extraInLocal}`);
console.log('\nTop 10 drifted cats:');
for (const c of driftCats.slice(0, 10)) {
  console.log(`  ${c.code} ${c.path}`);
  if (c.missingInLocal.length > 0) {
    console.log(`    missing: ${c.missingInLocal.map(a => `"${a.n}"(${a.dt}${a.bu ? `/${a.bu}` : ''})`).join(', ')}`);
  }
  if (c.extraInLocal.length > 0) {
    console.log(`    extra:   ${c.extraInLocal.map(o => `"${o.n}"(${o.u || '∅'})`).join(', ')}`);
  }
}
console.log('\n결과: scripts/verification-reports/schema-drift-2026-05-14.json');
