/**
 * build-naver-coupang-map.cjs — v3
 *
 * 네이버 → 쿠팡 카테고리 매핑 (계층 하향식)
 *
 * 핵심: 대분류 → 중분류 → 소분류 → 세분류 순서로
 * 각 레벨에서 매칭하고, 매칭된 범위 안에서만 하위를 찾는다.
 * "의자"가 가구인지 유아동인지 대분류/중분류 컨텍스트로 결정됨.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const NAVER_PATH = path.join(DATA_DIR, 'naver-categories.json');
const COUPANG_INDEX_PATH = path.join(DATA_DIR, 'coupang-cat-index.json');
const COUPANG_DETAILS_PATH = path.join(DATA_DIR, 'coupang-cat-details.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'naver-to-coupang-map.json');

// ── 네이버 대분류 → 쿠팡 대분류 ──
const TOP_MAP = {
  '패션의류':     ['패션의류잡화'],
  '패션잡화':     ['패션의류잡화'],
  '화장품/미용':  ['뷰티'],
  '디지털/가전':  ['가전/디지털'],
  '가구/인테리어':['가구/홈데코'],
  '출산/육아':    ['출산/유아동'],
  '식품':         ['식품'],
  '스포츠/레저':  ['스포츠/레져'],
  '생활/건강':    ['생활용품', '반려/애완용품', '주방용품', '가전/디지털', '문구/오피스', '자동차용품'],
  '도서':         ['도서'],
  '여가/생활편의':['생활용품', '완구/취미'],
};

// 네이버 중분류 → 쿠팡 대분류 세분화 (전체)
const MID_OVERRIDE = {
  // ── 생활/건강 (34개 중분류) ──
  '생활/건강>반려동물':           ['반려/애완용품'],
  '생활/건강>관상어용품':         ['반려/애완용품'],
  '생활/건강>주방용품':           ['주방용품'],
  '생활/건강>문구/사무용품':      ['문구/오피스'],
  '생활/건강>자동차용품':         ['자동차용품'],
  '생활/건강>자동차':             ['자동차용품'],
  '생활/건강>계약금자동차':       ['자동차용품'],
  '생활/건강>공구':               ['생활용품'],
  '생활/건강>건강관리용품':       ['생활용품'],
  '생활/건강>건강측정용품':       ['생활용품'],
  '생활/건강>구강위생용품':       ['생활용품'],
  '생활/건강>냉온/찜질용품':      ['생활용품'],
  '생활/건강>눈건강용품':         ['생활용품'],
  '생활/건강>당뇨관리용품':       ['생활용품'],
  '생활/건강>물리치료/저주파용품': ['생활용품'],
  '생활/건강>발건강용품':         ['생활용품'],
  '생활/건강>생활용품':           ['생활용품'],
  '생활/건강>세탁용품':           ['생활용품'],
  '생활/건강>수납/정리용품':      ['생활용품'],
  '생활/건강>실버용품':           ['생활용품'],
  '생활/건강>안마용품':           ['생활용품'],
  '생활/건강>욕실용품':           ['생활용품'],
  '생활/건강>원예/식물':          ['생활용품'],
  '생활/건강>의료용품':           ['생활용품'],
  '생활/건강>재활운동용품':       ['생활용품'],
  '생활/건강>정원/원예용품':      ['생활용품'],
  '생활/건강>종교':               ['생활용품'],
  '생활/건강>좌욕/좌훈용품':      ['생활용품'],
  '생활/건강>청소용품':           ['생활용품'],
  '생활/건강>화방용품':           ['문구/오피스', '생활용품'],
  '생활/건강>수집품':             ['완구/취미'],
  '생활/건강>악기':               ['완구/취미'],
  '생활/건강>블루레이':           ['가전/디지털'],
  '생활/건강>DVD':                ['가전/디지털'],
  '생활/건강>음반':               ['가전/디지털'],
  // ── 여가/생활편의 ──
  '여가/생활편의>생활편의':       ['생활용품'],
  '여가/생활편의>국내여행/체험':  ['생활용품'],
  '여가/생활편의>해외여행':       ['생활용품'],
  '여가/생활편의>국내렌터카':     ['생활용품'],
  '여가/생활편의>홈케어서비스':   ['생활용품'],
  '여가/생활편의>원데이클래스':   ['완구/취미'],
  '여가/생활편의>예체능레슨':     ['완구/취미'],
  '여가/생활편의>자기계발/취미 레슨': ['완구/취미'],
  // ── 가구/인테리어 ──
  '가구/인테리어>수예':           ['가구/홈데코'],
  // ── 화장품/미용 ──
  // (전부 뷰티 → TOP_MAP으로 충분)
  // ── 패션잡화 ──
  // (전부 패션의류잡화 → TOP_MAP으로 충분)
};

function main() {
  const naver = JSON.parse(fs.readFileSync(NAVER_PATH, 'utf8'));
  const coupangIndex = JSON.parse(fs.readFileSync(COUPANG_INDEX_PATH, 'utf8'));
  const coupangDetails = JSON.parse(fs.readFileSync(COUPANG_DETAILS_PATH, 'utf8'));
  const naverLeaves = naver.leaves || [];

  // 쿠팡 카테고리를 경로 레벨별로 파싱
  const coupangAll = coupangIndex.map(([code, tokensStr, leafName, depth]) => {
    const fullPath = coupangDetails[code]?.p || leafName;
    const parts = fullPath.split('>').map(s => s.trim());
    return { code, leafName, tokens: tokensStr.split(' '), depth, path: fullPath, parts };
  });

  console.log(`네이버 leaf: ${naverLeaves.length}개, 쿠팡: ${coupangAll.length}개\n`);

  const matched = new Map();
  const methodStats = {};

  function addMatch(nCat, cEntry, method, confidence) {
    matched.set(nCat.id, {
      naverCatId: nCat.id, naverName: nCat.name, naverPath: nCat.path,
      coupangCode: cEntry.code, coupangName: cEntry.leafName, coupangPath: cEntry.path,
      method, confidence,
    });
    methodStats[method] = (methodStats[method] || 0) + 1;
  }

  // ── 단어 유사도 함수들 ──
  function normalizeWord(w) {
    return w.toLowerCase().replace(/[\/\s]/g, '').trim();
  }

  function wordScore(a, b) {
    a = normalizeWord(a); b = normalizeWord(b);
    if (!a || !b) return 0;
    if (a === b) return 10;  // 1글자도 정확 일치면 10점
    if (a.length < 2 || b.length < 2) return 0; // 부분매칭은 2글자 이상만
    if (a.includes(b) || b.includes(a)) return 7;
    // 공통 부분문자열 비율
    const short = a.length <= b.length ? a : b;
    const long = a.length > b.length ? a : b;
    let matchChars = 0;
    for (const ch of short) { if (long.includes(ch)) matchChars++; }
    const ratio = matchChars / short.length;
    return ratio > 0.7 ? ratio * 5 : 0;
  }

  // 레벨의 단어들을 비교 (슬래시로 분리된 복합 레벨 지원)
  function levelScore(naverLevel, coupangLevel) {
    const nWords = naverLevel.split(/[\/\s]+/).filter(w => w.length >= 2);
    const cWords = coupangLevel.split(/[\/\s]+/).filter(w => w.length >= 2);
    if (nWords.length === 0 || cWords.length === 0) return 0;

    let totalScore = 0;
    let bestPairScore = 0;
    for (const nw of nWords) {
      for (const cw of cWords) {
        const s = wordScore(nw, cw);
        totalScore += s;
        bestPairScore = Math.max(bestPairScore, s);
      }
    }
    return { totalScore, bestPairScore };
  }

  // ── 계층 하향식 매칭 ──
  for (const nCat of naverLeaves) {
    const nParts = nCat.path.split('>').map(s => s.trim());
    const naverTop = nParts[0];
    const naverMid = nParts.length >= 2 ? nParts[1] : '';

    // Step 1: 대분류 범위 결정
    const midKey = naverTop + '>' + naverMid;
    const validTops = MID_OVERRIDE[midKey] || TOP_MAP[naverTop] || [];

    // 대분류로 후보 필터
    let candidates = coupangAll.filter(c => validTops.includes(c.parts[0]));
    if (candidates.length === 0) candidates = coupangAll; // fallback

    // Step 2: 중분류 매칭 — 후보를 중분류 유사도로 좁히기
    if (nParts.length >= 2 && candidates.length > 50) {
      const scored = candidates.map(c => {
        const midScore = c.parts.length >= 2 ? levelScore(nParts[1], c.parts[1]) : { totalScore: 0, bestPairScore: 0 };
        return { entry: c, midScore: midScore.bestPairScore };
      });
      const maxMidScore = Math.max(...scored.map(s => s.midScore));
      if (maxMidScore >= 5) {
        // 중분류 매칭되는 것들만 남김 (top 60%)
        const threshold = maxMidScore * 0.6;
        const narrowed = scored.filter(s => s.midScore >= threshold).map(s => s.entry);
        if (narrowed.length >= 1) candidates = narrowed;
      }
    }

    // Step 3: 소분류 매칭 — 추가 좁히기
    if (nParts.length >= 3 && candidates.length > 20) {
      const scored = candidates.map(c => {
        const subScore = c.parts.length >= 3 ? levelScore(nParts[2], c.parts[2]) : { totalScore: 0, bestPairScore: 0 };
        return { entry: c, subScore: subScore.bestPairScore };
      });
      const maxSubScore = Math.max(...scored.map(s => s.subScore));
      if (maxSubScore >= 5) {
        const threshold = maxSubScore * 0.6;
        const narrowed = scored.filter(s => s.subScore >= threshold).map(s => s.entry);
        if (narrowed.length >= 1) candidates = narrowed;
      }
    }

    // Step 4: 최종 leaf 매칭 — 남은 후보 중 전체 경로 유사도가 가장 높은 것
    let bestEntry = null;
    let bestScore = -1;
    let bestMethod = 'forced_default';

    for (const c of candidates) {
      let score = 0;

      // leaf 이름 비교 (가장 중요)
      const leafS = wordScore(nParts[nParts.length - 1], c.parts[c.parts.length - 1]);
      score += leafS * 3; // leaf 가중치 3배

      // 각 레벨 비교
      const maxLevel = Math.min(nParts.length, c.parts.length);
      for (let lvl = 0; lvl < maxLevel; lvl++) {
        const ls = levelScore(nParts[lvl], c.parts[lvl]);
        // 상위 레벨일수록 가중치 높음 (대분류 불일치 방지)
        const weight = maxLevel - lvl;
        score += ls.bestPairScore * weight;
      }

      // depth 일치 보너스
      if (nParts.length === c.parts.length) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestEntry = c;
        if (leafS >= 10) bestMethod = 'exact_leaf';
        else if (leafS >= 7) bestMethod = 'partial_leaf';
        else if (score >= 30) bestMethod = 'path_similarity';
        else if (score >= 15) bestMethod = 'relaxed_path';
        else bestMethod = 'best_effort';
      }
    }

    if (bestEntry) {
      const confidence = Math.min(0.98, Math.max(0.30, bestScore / 60));
      addMatch(nCat, bestEntry, bestMethod, confidence);
    }
  }

  // ── 검증 ──
  let topMismatch = 0;
  for (const d of matched.values()) {
    const naverTop = d.naverPath.split('>')[0];
    const coupangTop = d.coupangPath.split('>')[0];
    const midKey = naverTop + '>' + d.naverPath.split('>')[1];
    const validTops = MID_OVERRIDE[midKey] || TOP_MAP[naverTop] || [];
    if (validTops.length > 0 && !validTops.includes(coupangTop)) topMismatch++;
  }

  // ── 저장 ──
  const details = [...matched.values()].sort((a, b) => a.naverPath.localeCompare(b.naverPath));
  const output = {
    generatedAt: new Date().toISOString(),
    stats: {
      totalNaver: naverLeaves.length,
      matched: matched.size,
      unmatched: naverLeaves.length - matched.size,
      topCategoryMismatch: topMismatch,
      byMethod: methodStats,
    },
    map: Object.fromEntries(
      [...matched.values()].map(m => [m.naverCatId, { c: m.coupangCode, n: m.confidence, m: m.method.charAt(0) }])
    ),
    details,
    unmatched: naverLeaves.filter(n => !matched.has(n.id)).map(n => ({ id: n.id, name: n.name, path: n.path })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`=== 결과 ===`);
  console.log(`매칭: ${matched.size}/${naverLeaves.length} (${(matched.size/naverLeaves.length*100).toFixed(1)}%)`);
  console.log(`대분류 불일치: ${topMismatch}`);
  console.log(`\n매칭 방법별:`);
  for (const [m, c] of Object.entries(methodStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m}: ${c}`);
  }

  const buckets = { '90%+': 0, '80-90%': 0, '70-80%': 0, '60-70%': 0, '50-60%': 0, '<50%': 0 };
  for (const d of matched.values()) {
    if (d.confidence >= 0.9) buckets['90%+']++;
    else if (d.confidence >= 0.8) buckets['80-90%']++;
    else if (d.confidence >= 0.7) buckets['70-80%']++;
    else if (d.confidence >= 0.6) buckets['60-70%']++;
    else if (d.confidence >= 0.5) buckets['50-60%']++;
    else buckets['<50%']++;
  }
  console.log(`\n신뢰도 분포:`);
  for (const [b, c] of Object.entries(buckets)) console.log(`  ${b}: ${c}`);
}

main();
