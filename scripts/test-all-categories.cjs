/* eslint-disable */
// 전체 쿠팡 카테고리 (16,259개) 매처 전수조사
// 각 leaf 카테고리에 대해 leaf 이름을 그대로 입력으로 넣고 매처 결과 확인.
//
// 판정 규칙:
//   PASS  — 매처가 반환한 코드가 expected 와 동일
//   PASS* — 매처 코드는 다르지만 leaf 이름이 같음 (동명이의 ambiguity, 의도적)
//   FAIL  — 매처가 매칭 실패하거나 leaf 이름조차 다른 카테고리 반환
//
// 결과는 콘솔에 통계 + 실패 샘플을 출력하고 .test-out/category-audit.json 으로 dump.

const fs = require('fs');
const path = require('path');

const matcher = require('../.test-out/src/lib/megaload/services/category-matcher.js');
const idx = require('../src/lib/megaload/data/coupang-cat-index.json');
const details = require('../src/lib/megaload/data/coupang-cat-details.json');

// leaf 이름 → 해당 leaf 가 등장하는 모든 코드 (동명이의)
const leafToCodesMap = new Map();
for (const [code, , leafName] of idx) {
  if (!leafToCodesMap.has(leafName)) leafToCodesMap.set(leafName, []);
  leafToCodesMap.get(leafName).push(code);
}

(async () => {
  const start = Date.now();
  const total = idx.length;
  const stats = {
    pass: 0,
    passAmbiguous: 0,
    failNoMatch: 0,
    failWrongLeaf: 0,
    total,
  };
  // 실패/모호 케이스의 sample
  const failNoMatchSamples = [];
  const failWrongLeafSamples = [];
  const ambiguousSamples = [];

  // 배치 단위로 matchCategoryBatch 호출 (성능)
  const BATCH = 200;
  for (let start = 0; start < total; start += BATCH) {
    const slice = idx.slice(start, start + BATCH);
    const productNames = slice.map((e) => e[2]); // leaf name 그대로
    const { results } = await matcher.matchCategoryBatch(productNames);

    for (let i = 0; i < slice.length; i++) {
      const [expectedCode, , expectedLeaf, depth] = slice[i];
      const r = results[i];
      const expectedPath = details[expectedCode]?.p || '';

      if (!r) {
        stats.failNoMatch++;
        if (failNoMatchSamples.length < 20) {
          failNoMatchSamples.push({
            input: expectedLeaf,
            expectedCode,
            expectedPath,
            depth,
          });
        }
        continue;
      }

      if (r.categoryCode === expectedCode) {
        stats.pass++;
      } else if (r.categoryName === expectedLeaf) {
        // 동명이의 — leaf 이름은 같음
        stats.passAmbiguous++;
        if (ambiguousSamples.length < 30) {
          ambiguousSamples.push({
            input: expectedLeaf,
            expected: { code: expectedCode, path: expectedPath },
            got: { code: r.categoryCode, path: r.categoryPath },
          });
        }
      } else {
        stats.failWrongLeaf++;
        if (failWrongLeafSamples.length < 30) {
          failWrongLeafSamples.push({
            input: expectedLeaf,
            expected: { code: expectedCode, path: expectedPath, depth },
            got: { code: r.categoryCode, path: r.categoryPath, source: r.source, confidence: r.confidence },
          });
        }
      }
    }

    if ((start + BATCH) % 2000 === 0 || start + BATCH >= total) {
      const done = Math.min(start + BATCH, total);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stderr.write(`\r[${done}/${total}] pass=${stats.pass} amb=${stats.passAmbiguous} failNoMatch=${stats.failNoMatch} failWrong=${stats.failWrongLeaf}`);
    }
  }
  process.stderr.write('\n');

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== 전수조사 결과 (${elapsed}s) ===`);
  console.log(`총 카테고리:           ${stats.total}`);
  console.log(`PASS (정확 매칭):      ${stats.pass} (${((stats.pass / stats.total) * 100).toFixed(2)}%)`);
  console.log(`PASS* (동명이의):      ${stats.passAmbiguous} (${((stats.passAmbiguous / stats.total) * 100).toFixed(2)}%)`);
  console.log(`FAIL (매칭 실패):      ${stats.failNoMatch} (${((stats.failNoMatch / stats.total) * 100).toFixed(2)}%)`);
  console.log(`FAIL (잘못된 leaf):    ${stats.failWrongLeaf} (${((stats.failWrongLeaf / stats.total) * 100).toFixed(2)}%)`);

  if (failNoMatchSamples.length > 0) {
    console.log('\n--- 매칭 실패 sample (최대 20개) ---');
    for (const s of failNoMatchSamples) {
      console.log(`  [${s.expectedCode}] depth=${s.depth} | ${s.input}  →  expected: ${s.expectedPath}`);
    }
  }
  if (failWrongLeafSamples.length > 0) {
    console.log('\n--- 다른 카테고리 매칭 sample (최대 30개) ---');
    for (const s of failWrongLeafSamples) {
      console.log(`  IN: ${s.input}`);
      console.log(`    expected: [${s.expected.code}] ${s.expected.path}`);
      console.log(`    got:      [${s.got.code}] ${s.got.path}  (${s.got.source}, conf=${s.got.confidence?.toFixed(2)})`);
    }
  }
  if (ambiguousSamples.length > 0) {
    console.log('\n--- 동명이의 매칭 sample (최대 30개) ---');
    for (const s of ambiguousSamples.slice(0, 10)) {
      console.log(`  ${s.input}  →  expected:${s.expected.path} | got:${s.got.path}`);
    }
    console.log(`  (총 ${stats.passAmbiguous}개 동명이의)`);
  }

  // dump
  const dumpPath = path.join(__dirname, '..', '.test-out', 'category-audit.json');
  fs.writeFileSync(dumpPath, JSON.stringify({
    stats,
    failNoMatchSamples,
    failWrongLeafSamples,
    ambiguousSamples,
  }, null, 2));
  console.log(`\nDump: ${dumpPath}`);
})();
