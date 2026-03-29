/**
 * complete-naver-coupang-map.cjs
 *
 * 미매칭 네이버 카테고리를 강화된 알고리즘으로 100% 매핑 완성.
 * Claude API 없이 다단계 퍼지 매칭으로 전부 처리.
 *
 * Pass 3: 릴랙스 경로 유사도 (낮은 threshold)
 * Pass 4: leaf 부분문자열 매칭
 * Pass 5: 상위 카테고리 기반 최근접 매칭
 * Pass 6: 강제 매핑 (같은 대분류 최상위 카테고리로)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const MAP_PATH = path.join(DATA_DIR, 'naver-to-coupang-map.json');
const COUPANG_INDEX_PATH = path.join(DATA_DIR, 'coupang-cat-index.json');
const COUPANG_DETAILS_PATH = path.join(DATA_DIR, 'coupang-cat-details.json');

// ── 네이버 대분류 → 쿠팡 대분류 매핑 ──
const TOP_MAP = {
  '패션의류': '패션의류잡화',
  '패션잡화': '패션의류잡화',
  '화장품/미용': '뷰티',
  '디지털/가전': '가전/디지털',
  '가구/인테리어': '가구/홈데코',
  '출산/육아': '출산/유아동',
  '식품': '식품',
  '스포츠/레저': '스포츠/레져',
  '생활/건강': '생활용품',
  '도서': '도서',
  '여가/생활편의': '생활용품',
};

function tokenize(str) {
  return str.split(/[>\/\s]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 2);
}

// 두 문자열의 글자 겹침 비율
function charOverlap(a, b) {
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  let match = 0;
  for (const ch of short) {
    if (long.includes(ch)) match++;
  }
  return match / Math.max(short.length, 1);
}

function main() {
  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const coupangIndex = JSON.parse(fs.readFileSync(COUPANG_INDEX_PATH, 'utf8'));
  const coupangDetails = JSON.parse(fs.readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

  // 쿠팡 카테고리 구조
  const coupangEntries = coupangIndex.map(([code, tokensStr, leafName, depth]) => ({
    code, leafName, tokens: tokensStr.split(' '), depth,
    path: coupangDetails[code]?.p || leafName,
  }));

  // 쿠팡 대분류별 그룹
  const coupangByTop = new Map();
  for (const e of coupangEntries) {
    const top = e.path.split('>')[0];
    if (!coupangByTop.has(top)) coupangByTop.set(top, []);
    coupangByTop.get(top).push(e);
  }

  const unmatched = [...mapData.unmatched];
  const newMatches = [];
  let pass3 = 0, pass4 = 0, pass5 = 0, pass6 = 0;

  // ── Pass 3: 릴랙스 경로 유사도 (threshold 12 → 8) ──
  const stillUnmatched3 = [];
  for (const nCat of unmatched) {
    const naverTokens = tokenize(nCat.path);
    const naverLeaf = nCat.name.toLowerCase().trim();
    let bestScore = 0;
    let bestEntry = null;

    for (const cEntry of coupangEntries) {
      let score = 0;
      const cLeaf = cEntry.leafName.toLowerCase().trim();
      const cTokens = new Set(cEntry.tokens.map(t => t.toLowerCase()));

      // leaf 포함 관계
      if (cLeaf.includes(naverLeaf) || naverLeaf.includes(cLeaf)) score += 12;
      else if (charOverlap(naverLeaf, cLeaf) > 0.7) score += 8;

      // leaf 단어 교집합
      const nWords = naverLeaf.split(/[\/\s]/).filter(Boolean);
      const cWords = cLeaf.split(/[\/\s]/).filter(Boolean);
      for (const nw of nWords) {
        if (nw.length >= 2) {
          for (const cw of cWords) {
            if (cw.includes(nw) || nw.includes(cw)) score += 4;
          }
        }
      }

      // 경로 토큰 겹침
      let overlap = 0;
      for (const nt of naverTokens) {
        if (cTokens.has(nt)) { overlap++; score += 2; }
        else {
          // 부분 매칭
          for (const ct of cTokens) {
            if (ct.includes(nt) || nt.includes(ct)) { overlap += 0.5; score += 1; break; }
          }
        }
      }
      if (overlap >= 2) score += 4;

      if (score > bestScore) { bestScore = score; bestEntry = cEntry; }
    }

    if (bestScore >= 8 && bestEntry) {
      newMatches.push({ nCat, cEntry: bestEntry, method: 'relaxed_path', confidence: Math.min(0.90, 0.6 + bestScore / 60) });
      pass3++;
    } else {
      stillUnmatched3.push(nCat);
    }
  }
  console.log(`Pass 3 (릴랙스 경로): ${pass3}개 매칭`);

  // ── Pass 4: leaf 부분문자열 + 대분류 필터 ──
  const stillUnmatched4 = [];
  for (const nCat of stillUnmatched3) {
    const naverLeaf = nCat.name.toLowerCase().trim();
    const naverTop = nCat.path.split('>')[0];
    const coupangTop = TOP_MAP[naverTop];
    const candidates = coupangTop ? (coupangByTop.get(coupangTop) || coupangEntries) : coupangEntries;

    let bestScore = 0;
    let bestEntry = null;

    for (const cEntry of candidates) {
      const cLeaf = cEntry.leafName.toLowerCase().trim();
      let score = 0;

      // 글자 겹침
      const overlap = charOverlap(naverLeaf, cLeaf);
      if (overlap > 0.5) score += overlap * 10;

      // 경로 2번째 레벨 (중분류) 매칭
      const naverParts = nCat.path.split('>').map(s => s.trim().toLowerCase());
      const cParts = cEntry.path.split('>').map(s => s.trim().toLowerCase());
      for (let i = 1; i < Math.min(naverParts.length, cParts.length); i++) {
        if (naverParts[i] === cParts[i]) score += 5;
        else if (charOverlap(naverParts[i], cParts[i]) > 0.6) score += 3;
      }

      if (score > bestScore) { bestScore = score; bestEntry = cEntry; }
    }

    if (bestScore >= 5 && bestEntry) {
      newMatches.push({ nCat, cEntry: bestEntry, method: 'fuzzy_leaf', confidence: Math.min(0.85, 0.5 + bestScore / 40) });
      pass4++;
    } else {
      stillUnmatched4.push(nCat);
    }
  }
  console.log(`Pass 4 (퍼지 leaf): ${pass4}개 매칭`);

  // ── Pass 5: 부모 카테고리에서 가장 가까운 쿠팡 카테고리 ──
  const stillUnmatched5 = [];
  for (const nCat of stillUnmatched4) {
    const naverParts = nCat.path.split('>').map(s => s.trim().toLowerCase());
    const naverTop = nCat.path.split('>')[0];
    const coupangTop = TOP_MAP[naverTop];
    const candidates = coupangTop ? (coupangByTop.get(coupangTop) || coupangEntries) : coupangEntries;

    let bestScore = 0;
    let bestEntry = null;

    for (const cEntry of candidates) {
      const cParts = cEntry.path.split('>').map(s => s.trim().toLowerCase());
      let score = 0;

      // 경로 각 레벨에서 토큰 비교
      for (let i = 0; i < naverParts.length; i++) {
        const nTokens = naverParts[i].split(/[\/\s]/).filter(Boolean);
        for (const nt of nTokens) {
          if (nt.length < 2) continue;
          for (let j = 0; j < cParts.length; j++) {
            if (cParts[j].includes(nt)) {
              score += (i === j) ? 3 : 1; // 같은 레벨이면 가산점
            }
          }
        }
      }

      if (score > bestScore) { bestScore = score; bestEntry = cEntry; }
    }

    if (bestScore >= 3 && bestEntry) {
      newMatches.push({ nCat, cEntry: bestEntry, method: 'parent_nearest', confidence: Math.min(0.80, 0.4 + bestScore / 30) });
      pass5++;
    } else {
      stillUnmatched5.push(nCat);
    }
  }
  console.log(`Pass 5 (부모 최근접): ${pass5}개 매칭`);

  // ── Pass 6: 강제 매핑 — 같은 대분류의 가장 일반적인 카테고리로 ──
  for (const nCat of stillUnmatched5) {
    const naverTop = nCat.path.split('>')[0];
    const coupangTop = TOP_MAP[naverTop];

    // 해당 대분류에서 depth가 가장 낮은(일반적인) 카테고리 선택
    let candidates = coupangTop ? (coupangByTop.get(coupangTop) || []) : [];
    if (candidates.length === 0) candidates = coupangEntries;

    // leaf name에서 글자 겹침이 가장 많은 것 선택
    const naverLeaf = nCat.name.toLowerCase();
    let best = candidates[0];
    let bestOv = 0;
    for (const c of candidates) {
      const ov = charOverlap(naverLeaf, c.leafName.toLowerCase());
      if (ov > bestOv) { bestOv = ov; best = c; }
    }

    newMatches.push({ nCat, cEntry: best, method: 'forced_top', confidence: Math.max(0.3, Math.min(0.6, bestOv)) });
    pass6++;
  }
  console.log(`Pass 6 (강제 매핑): ${pass6}개 매칭`);

  // ── 기존 매핑에 병합 ──
  const existingMap = mapData.map || {};
  const existingDetails = mapData.details || [];

  for (const { nCat, cEntry, method, confidence } of newMatches) {
    existingMap[nCat.id] = {
      c: cEntry.code,
      n: confidence,
      m: method.charAt(0),
    };
    existingDetails.push({
      naverCatId: nCat.id,
      naverName: nCat.name,
      naverPath: nCat.path,
      coupangCode: cEntry.code,
      coupangName: cEntry.leafName,
      coupangPath: cEntry.path,
      method,
      confidence,
    });
  }

  // 통계 재계산
  const byMethod = {};
  for (const d of existingDetails) {
    byMethod[d.method] = (byMethod[d.method] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    stats: {
      totalNaver: mapData.stats.totalNaver,
      matched: Object.keys(existingMap).length,
      unmatched: 0,
      byMethod,
    },
    map: existingMap,
    details: existingDetails.sort((a, b) => a.naverPath.localeCompare(b.naverPath)),
    unmatched: [],
  };

  fs.writeFileSync(MAP_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n=== 완료 ===`);
  console.log(`총 매칭: ${output.stats.matched}/${output.stats.totalNaver} (100%)`);
  console.log(`매칭 방법별:`);
  for (const [m, c] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m}: ${c}개`);
  }

  // 신뢰도 분포
  const confBuckets = { '90-100%': 0, '80-90%': 0, '70-80%': 0, '60-70%': 0, '50-60%': 0, '<50%': 0 };
  for (const code of Object.keys(existingMap)) {
    const conf = existingMap[code].n;
    if (conf >= 0.9) confBuckets['90-100%']++;
    else if (conf >= 0.8) confBuckets['80-90%']++;
    else if (conf >= 0.7) confBuckets['70-80%']++;
    else if (conf >= 0.6) confBuckets['60-70%']++;
    else if (conf >= 0.5) confBuckets['50-60%']++;
    else confBuckets['<50%']++;
  }
  console.log(`\n신뢰도 분포:`);
  for (const [bucket, count] of Object.entries(confBuckets)) {
    const bar = '█'.repeat(Math.round(count / 50));
    console.log(`  ${bucket}: ${count}개 ${bar}`);
  }
}

main();
