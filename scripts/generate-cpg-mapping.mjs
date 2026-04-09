#!/usr/bin/env node
// ============================================================
// CPG (Content Profile Group) 매핑 생성 스크립트
//
// coupang-cat-index.json → cpg-mapping.json
//
// 전략:
//   1. 16,259개 카테고리 엔트리를 L3 기준으로 그룹핑
//   2. 소규모 그룹(≤3) → 상위 L2로 병합
//   3. 대규모 그룹(>100) → L4 하위 분할
//   4. 도서 카테고리 제외
//   5. 결과: ~350-400개 CPG + 소분류 코드 매핑
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── 데이터 로드 ────────────────────────────────────────────
const catIndex = JSON.parse(
  readFileSync(join(ROOT, 'src/lib/megaload/data/coupang-cat-index.json'), 'utf8'),
);

// 엔트리 형식: [code, "space-separated-path", displayName, depth]
// depth: 3=L3, 4=L4, 5=L5, 6=L6

// ─── L1 정규화 (쿠팡 내부명 → 표시 경로명) ──────────────────
const L1_NORMALIZE = {
  '가구': '가구/홈데코',
  '가전': '가전/디지털',
  '문구': '문구/오피스',
  '반려': '반려/애완용품',
  '스포츠': '스포츠/레져',
  '출산': '출산/유아동',
  '완구': '완구/취미',
};

function normalizePath(spacePath) {
  const parts = spacePath.split(' ');
  const l1 = L1_NORMALIZE[parts[0]] || parts[0];
  return [l1, ...parts.slice(1)].join('>');
}

function getPathParts(spacePath) {
  const parts = spacePath.split(' ');
  parts[0] = L1_NORMALIZE[parts[0]] || parts[0];
  return parts;
}

// ─── 1단계: 도서 제외 + 비도서 엔트리 수집 ──────────────────
const nonBookEntries = catIndex.filter(e => !e[1].startsWith('도서'));
console.log(`Total entries: ${catIndex.length}, Non-book: ${nonBookEntries.length}`);

// ─── 2단계: L3 기준 초기 그룹핑 ─────────────────────────────
const l3Groups = {};

for (const entry of nonBookEntries) {
  const parts = getPathParts(entry[1]);
  const l3Key = parts.slice(0, 3).join('>');
  const l2Key = parts.slice(0, 2).join('>');

  if (!l3Groups[l3Key]) {
    l3Groups[l3Key] = {
      parentGroup: l2Key,
      entries: [],
    };
  }
  l3Groups[l3Key].entries.push({
    code: entry[0],
    fullPath: normalizePath(entry[1]),
    displayName: entry[2],
    depth: entry[3],
  });
}

console.log(`Initial L3 groups: ${Object.keys(l3Groups).length}`);

// ─── 3단계: 소규모 그룹 병합 (≤3개 엔트리 → L2 병합) ───────
const SMALL_THRESHOLD = 3;
const mergedGroups = {};

// 먼저 L2 → L3그룹목록 맵 생성
const l2ToL3 = {};
for (const [l3Key, group] of Object.entries(l3Groups)) {
  const l2 = group.parentGroup;
  if (!l2ToL3[l2]) l2ToL3[l2] = [];
  l2ToL3[l2].push({ key: l3Key, ...group });
}

for (const [l2Key, l3List] of Object.entries(l2ToL3)) {
  const smallGroups = l3List.filter(g => g.entries.length <= SMALL_THRESHOLD);
  const normalGroups = l3List.filter(g => g.entries.length > SMALL_THRESHOLD);

  // 정상 크기 그룹은 그대로 유지
  for (const g of normalGroups) {
    mergedGroups[g.key] = {
      parentGroup: l2Key,
      entries: g.entries,
    };
  }

  // 소규모 그룹은 L2로 병합
  if (smallGroups.length > 0) {
    const mergedEntries = smallGroups.flatMap(g => g.entries);
    if (mergedEntries.length > 0) {
      // 이미 L2 키로 된 정상 그룹이 있으면 거기에 추가
      if (mergedGroups[l2Key]) {
        mergedGroups[l2Key].entries.push(...mergedEntries);
      } else {
        // L2 그룹이 아직 없고, 소규모 그룹 1개뿐이면 원래 L3 키 유지
        if (smallGroups.length === 1 && normalGroups.length > 0) {
          mergedGroups[smallGroups[0].key] = {
            parentGroup: l2Key,
            entries: smallGroups[0].entries,
          };
        } else {
          mergedGroups[l2Key] = {
            parentGroup: l2Key.split('>')[0],
            entries: mergedEntries,
          };
        }
      }
    }
  }
}

console.log(`After small-group merge: ${Object.keys(mergedGroups).length}`);

// ─── 4단계: 대규모 그룹 분할 (>100 → L4 하위 분할) ──────────
const LARGE_THRESHOLD = 100;
const finalGroups = {};

for (const [groupKey, group] of Object.entries(mergedGroups)) {
  if (group.entries.length <= LARGE_THRESHOLD) {
    finalGroups[groupKey] = group;
    continue;
  }

  // L4 기준 하위 분할
  const l4Sub = {};
  const remainEntries = [];

  for (const entry of group.entries) {
    const pathParts = entry.fullPath.split('>');
    if (pathParts.length >= 4) {
      const l4Key = pathParts.slice(0, 4).join('>');
      if (!l4Sub[l4Key]) l4Sub[l4Key] = [];
      l4Sub[l4Key].push(entry);
    } else {
      remainEntries.push(entry);
    }
  }

  // L4 하위 그룹 중 엔트리 ≤3개인 것은 원래 그룹에 남김
  for (const [l4Key, entries] of Object.entries(l4Sub)) {
    if (entries.length <= SMALL_THRESHOLD) {
      remainEntries.push(...entries);
    } else {
      finalGroups[l4Key] = {
        parentGroup: groupKey,
        entries,
      };
    }
  }

  // 남은 엔트리가 있으면 원래 그룹키로 유지
  if (remainEntries.length > 0) {
    finalGroups[groupKey] = {
      parentGroup: group.parentGroup,
      entries: remainEntries,
    };
  }
}

console.log(`After large-group split: ${Object.keys(finalGroups).length}`);

// ─── 5단계: displayName 생성 ──────────────────────────────────
function generateDisplayName(groupKey, entries) {
  const parts = groupKey.split('>');
  const lastPart = parts[parts.length - 1];
  const parentPart = parts.length > 1 ? parts[parts.length - 2] : '';

  // 엔트리의 displayName들에서 공통 패턴 추출
  if (entries.length <= 5) {
    return `${parentPart} ${lastPart}`.trim();
  }
  return `${parentPart} ${lastPart} 외`.trim();
}

// ─── 6단계: 출력 형식 구성 ──────────────────────────────────
const output = {
  _meta: {
    generatedAt: new Date().toISOString(),
    totalGroups: Object.keys(finalGroups).length,
    totalLeafCodes: 0,
    sourceEntries: nonBookEntries.length,
  },
  groups: {},
  codeToGroup: {},
};

// 정렬된 그룹 키
const sortedKeys = Object.keys(finalGroups).sort();

for (const groupKey of sortedKeys) {
  const group = finalGroups[groupKey];
  const leafCodes = group.entries.map(e => e.code);
  const leafNames = [...new Set(group.entries.map(e => e.displayName))];

  output.groups[groupKey] = {
    displayName: generateDisplayName(groupKey, group.entries),
    parentGroup: group.parentGroup,
    leafCodes,
    leafNames,
    entryCount: leafCodes.length,
  };

  for (const code of leafCodes) {
    output.codeToGroup[code] = groupKey;
  }
}

output._meta.totalLeafCodes = Object.keys(output.codeToGroup).length;

// ─── 7단계: 저장 ────────────────────────────────────────────
const outDir = join(ROOT, 'src/lib/megaload/data');
const outPath = join(outDir, 'cpg-mapping.json');

writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`\n=== CPG Mapping Generated ===`);
console.log(`Groups: ${output._meta.totalGroups}`);
console.log(`Leaf codes mapped: ${output._meta.totalLeafCodes}`);
console.log(`Output: ${outPath}`);

// ─── 통계 출력 ───────────────────────────────────────────────
const l1Stats = {};
for (const [key, group] of Object.entries(output.groups)) {
  const l1 = key.split('>')[0];
  if (!l1Stats[l1]) l1Stats[l1] = { groups: 0, codes: 0 };
  l1Stats[l1].groups++;
  l1Stats[l1].codes += group.entryCount;
}

console.log('\nL1 분포:');
for (const [l1, stats] of Object.entries(l1Stats).sort()) {
  console.log(`  ${l1}: ${stats.groups} groups, ${stats.codes} codes`);
}

// 미매핑 코드 검증
const mappedCodes = new Set(Object.keys(output.codeToGroup));
const unmapped = nonBookEntries.filter(e => !mappedCodes.has(e[0]));
if (unmapped.length > 0) {
  console.log(`\n⚠ Unmapped codes: ${unmapped.length}`);
  unmapped.slice(0, 5).forEach(e => console.log(`  ${e[0]}: ${e[1]}`));
} else {
  console.log(`\n✓ All ${nonBookEntries.length} non-book codes mapped`);
}
