#!/usr/bin/env tsx
/**
 * 카테고리 매칭 회귀 검증 스크립트 (v2)
 *
 * 핵심: 실제 "충돌 쌍"만 테스트
 *
 * 충돌 쌍 탐지:
 * - 출산/유아동 도메인 leaf 중 "유아X/아기X/아동X/키즈X/신생아X" 형태 → core stem X 추출
 * - X가 다른 L1에서 단독 leaf 또는 꼬리 leaf로 존재하면 → 실제 충돌 쌍
 * - 입력 "아기X"를 돌렸을 때 출산/유아동이 나오는지 검증
 *
 * 반려·자동차도 동일한 방식으로 추출.
 */

import catDetails from '../src/lib/megaload/data/coupang-cat-details.json';
import { matchCategory } from '../src/lib/megaload/services/category-matcher';

interface LeafInfo { code: string; path: string; leaf: string; l1: string; }

function loadLeaves(): LeafInfo[] {
  const result: LeafInfo[] = [];
  for (const [code, v] of Object.entries(catDetails as Record<string, { p: string }>)) {
    if (!v?.p) continue;
    const parts = v.p.split('>').map(s => s.trim()).filter(Boolean);
    result.push({ code, path: v.p, leaf: parts[parts.length - 1], l1: parts[0] });
  }
  return result;
}

interface DomainDef {
  label: string;
  l1Regex: RegExp;          // 이 도메인의 L1을 식별
  corePrefixes: string[];   // leaf 이름에서 제거할 도메인 접두사 (유아X → X)
  testPrefixes: string[];   // 입력 생성 시 사용할 접두사
}

const DOMAINS: DomainDef[] = [
  {
    label: '유아동',
    l1Regex: /출산|유아|아동/,
    corePrefixes: ['유아', '아기', '아동', '키즈', '신생아'],
    testPrefixes: ['아기', '유아', '신생아'],
  },
  {
    label: '반려',
    l1Regex: /반려|애완/,
    corePrefixes: ['강아지', '고양이', '반려동물', '반려', '애완', '펫', '애견'],
    testPrefixes: ['강아지', '고양이', '반려', '애견'],
  },
  {
    label: '자동차',
    l1Regex: /자동차/,
    corePrefixes: ['자동차', '차량', '오토바이'],
    testPrefixes: ['자동차', '차량'],
  },
];

interface ConflictCase {
  domain: DomainDef;
  expectedCode: string;
  expectedPath: string;
  stem: string;
  sourceLeaf: string;
  competitorLeaves: LeafInfo[];  // 다른 L1에서 같은 stem을 쓰는 카테고리
}

/**
 * 도메인별 leaf에서 core stem을 추출하고, 다른 L1에 같은 stem이 존재하면 충돌 쌍으로 수집
 */
function findConflictPairs(leaves: LeafInfo[]): ConflictCase[] {
  const conflicts: ConflictCase[] = [];
  for (const domain of DOMAINS) {
    const domainLeaves = leaves.filter(l => domain.l1Regex.test(l.l1));
    for (const dl of domainLeaves) {
      for (const pfx of domain.corePrefixes) {
        if (!dl.leaf.startsWith(pfx)) continue;
        const stem = dl.leaf.slice(pfx.length).trim();
        if (stem.length < 2) continue;
        // 다른 L1에서 이 stem이 leaf 또는 leaf 꼬리로 쓰이는지
        const competitors = leaves.filter(l =>
          !domain.l1Regex.test(l.l1) &&
          (l.leaf === stem || l.leaf.endsWith(stem)),
        );
        if (competitors.length > 0) {
          conflicts.push({
            domain,
            expectedCode: dl.code,
            expectedPath: dl.path,
            stem,
            sourceLeaf: dl.leaf,
            competitorLeaves: competitors,
          });
        }
        break; // 한 leaf당 첫 매칭 prefix만
      }
    }
  }
  return conflicts;
}

async function main() {
  const startTime = Date.now();
  const leaves = loadLeaves();
  console.log(`전체 카테고리: ${leaves.length}개`);

  const conflicts = findConflictPairs(leaves);
  console.log(`실제 충돌 쌍: ${conflicts.length}개`);

  interface Failure {
    input: string;
    expectedDomain: string;
    expectedCode: string;
    expectedPath: string;
    actualCode: string;
    actualPath: string;
    actualL1: string;
    stem: string;
  }
  const failures: Failure[] = [];
  const seenInputs = new Set<string>();
  let processed = 0;
  let totalTests = 0;

  // 총 테스트 수 먼저 카운트
  for (const c of conflicts) {
    for (const pfx of c.domain.testPrefixes) totalTests++;
  }
  console.log(`총 테스트 케이스: ${totalTests}개\n`);

  for (const c of conflicts) {
    for (const pfx of c.domain.testPrefixes) {
      const input = pfx + c.stem;
      if (seenInputs.has(input)) continue;
      seenInputs.add(input);
      processed++;

      const result = await matchCategory(input);
      const actualL1 = result ? result.categoryPath.split('>')[0].trim() : '(null)';
      if (!result || !c.domain.l1Regex.test(actualL1)) {
        failures.push({
          input,
          expectedDomain: c.domain.label,
          expectedCode: c.expectedCode,
          expectedPath: c.expectedPath,
          actualCode: result?.categoryCode || '',
          actualPath: result?.categoryPath || '',
          actualL1,
          stem: c.stem,
        });
      }

      if (processed % 200 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r진행: ${processed}/${totalTests} (${elapsed}s, 실패 ${failures.length}건)`);
      }
    }
  }
  console.log();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const uniqueTests = seenInputs.size;
  console.log('='.repeat(80));
  console.log(`검증 완료 (${elapsed}s)`);
  console.log(`고유 입력: ${uniqueTests}개`);
  console.log(`통과: ${uniqueTests - failures.length} / ${uniqueTests} (${((1-failures.length/uniqueTests)*100).toFixed(2)}%)`);
  console.log(`실패: ${failures.length}건`);

  // 실패 stem별 그룹
  const byStem = new Map<string, Failure[]>();
  for (const f of failures) {
    if (!byStem.has(f.stem)) byStem.set(f.stem, []);
    byStem.get(f.stem)!.push(f);
  }
  const sortedStems = [...byStem.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('\n── 실패 stem TOP 40 ──');
  for (const [stem, fails] of sortedStems.slice(0, 40)) {
    const example = fails[0];
    console.log(`  ${stem.padEnd(12)} 실패 ${fails.length}건 — 예: "${example.input}" → ${example.actualL1 || '(null)'} (기대: ${example.expectedDomain})`);
  }

  // 도메인별 요약
  console.log('\n── 도메인별 실패 요약 ──');
  const byDomain = new Map<string, number>();
  for (const f of failures) byDomain.set(f.expectedDomain, (byDomain.get(f.expectedDomain) || 0) + 1);
  for (const [d, n] of byDomain) console.log(`  ${d}: ${n}건`);

  // 추천 수정 제안
  console.log('\n── 추천 DIRECT_CODE_MAP 엔트리 (실패 빈도순 상위 40) ──');
  const topStems = sortedStems.slice(0, 40);
  for (const [stem, fails] of topStems) {
    const example = fails[0];
    // 각 테스트 prefix별로 엔트리
    const domainDef = DOMAINS.find(d => d.label === example.expectedDomain);
    if (!domainDef) continue;
    for (const pfx of domainDef.testPrefixes) {
      console.log(`  '${pfx}${stem}': { code: '${example.expectedCode}', path: '${example.expectedPath}' },`);
    }
  }

  // 저장
  const fs = require('fs');
  fs.writeFileSync('scripts/verify-category-report.json', JSON.stringify({
    summary: {
      conflicts: conflicts.length,
      uniqueTests,
      failures: failures.length,
      passRate: ((1 - failures.length / uniqueTests) * 100).toFixed(2) + '%',
      elapsed,
    },
    failuresByStem: Object.fromEntries(sortedStems.map(([s, fs]) => [s, fs.length])),
    failureSamples: failures.slice(0, 500),
  }, null, 2));
  console.log('\n상세 리포트: scripts/verify-category-report.json');
}

main();
