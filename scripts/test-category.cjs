// 카테고리 매칭 로직 직접 테스트
const indexJson = require('../src/lib/megaload/data/coupang-cat-index.json');

const NOISE_WORDS = new Set([
  'mg','mcg','iu','ml','g','kg','l',
  '정','개','병','통','캡슐','포','박스','봉','팩','세트','매','장','알',
  'ea','pcs',
  '프리미엄','고함량','저분자','먹는','국내','해외',
  '추천','인기','베스트','대용량','소용량','순수','천연','식물성',
  '무료배송','당일발송','특가','할인','증정','사은품','리뷰이벤트',
  '함유','효능','효과','예방','개선','상품상세참조','풍성한',
  'new','box','haccp',
]);
const NOISE_PATTERNS = [
  /^\d+$/,
  /^\d+\+\d+$/,
  /^\d+(개월|일|주)분?$/,
  /^\d+(ml|g|kg|mg|l|ea)$/i,
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/,
  /^\d+x\d+$/i,
  /^\d+%$/,
];

function cleanProductName(name) {
  let c = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  c = c.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const words = c.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const l = w.toLowerCase();
    if (!seen.has(l)) {
      seen.add(l);
      unique.push(w);
    }
  }
  return unique.join(' ');
}

function tokenize(name) {
  const cleaned = cleanProductName(name);
  const words = cleaned.split(/\s+/).map(w => w.toLowerCase());
  const result = [];
  for (const w of words) {
    if (w.length === 0) continue;
    if (w.length === 1) {
      if (/[가-힣]/.test(w)) result.push(w);
      else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length - 1])) {
        result[result.length - 1] += w;
      }
      continue;
    }
    if (NOISE_WORDS.has(w)) continue;
    if (NOISE_PATTERNS.some(p => p.test(w))) continue;
    result.push(w);
  }
  return result;
}

const LOCAL_MATCH_THRESHOLD = 12;

function buildCompoundTokens(tokens) {
  const compounds = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    compounds.push(tokens[i] + tokens[i + 1]);
  }
  return compounds;
}

function localMatch(tokens) {
  if (tokens.length === 0) return null;
  const compoundTokens = buildCompoundTokens(tokens);
  const compoundSet = new Set(compoundTokens);
  const meaningfulTokens = tokens.filter(t => t.length >= 2);
  const meaningfulSet = new Set(meaningfulTokens);

  let best = null;

  for (const entry of indexJson) {
    const [, catTokensStr, leafName, depth] = entry;
    const catTokenList = catTokensStr.split(' ');
    const leafLower = leafName.toLowerCase();
    let score = 0;
    let leafScore = 0;

    for (const t of compoundTokens) {
      if (t.length >= 2 && t === leafLower) { leafScore = 20; break; }
    }
    if (leafScore === 0) {
      const leafWords = leafLower.split(/[\/\s]/).map(s => s.trim()).filter(Boolean);
      let wordMatchCount = 0;
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafWords.some(lw => lw === t)) wordMatchCount++;
      }
      if (wordMatchCount > 0) leafScore = 6 + wordMatchCount * 3;
    }
    if (leafScore === 0) {
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafLower.includes(t)) { leafScore = Math.min(6, t.length + 1); break; }
      }
    }
    score += leafScore;

    let matchedCatTokens = 0;
    for (const catToken of catTokenList) {
      if (compoundSet.has(catToken) || meaningfulSet.has(catToken)) {
        score += 3;
        matchedCatTokens++;
      }
    }
    if (matchedCatTokens >= 4) score += 25;
    else if (matchedCatTokens >= 3) score += 18;
    else if (matchedCatTokens >= 2) score += 10;

    if (catTokenList.length > 0 && matchedCatTokens > 0) {
      const coverage = matchedCatTokens / catTokenList.length;
      score += Math.round(coverage * 5);
    }
    if (leafScore > 0 && matchedCatTokens <= 1) score -= 3;
    if (matchedCatTokens >= 2) score += Math.round(depth * 0.5);

    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best && best.score >= LOCAL_MATCH_THRESHOLD ? best : null;
}

// 테스트 상품명들
const testNames = [
  '게운 바디워시 500ml 피부미용',
  '닥터지 레드 블레미쉬 클리어 수딩 크림 70ml',
  '메디힐 티트리 에센셜 마스크팩 10매',
  '라운드랩 1025 독도 토너 200ml',
  '이니스프리 그린티 씨드 세럼 80ml',
  '블루밍 빈폴 키즈 면 양말',
  '아이소이 액티 히알루론산 수분 앰플 50ml',
];

console.log('=== Tokenization + Local Match Test ===\n');
for (const name of testNames) {
  const tokens = tokenize(name);
  const result = localMatch(tokens);
  console.log(`Name: ${name}`);
  console.log(`Tokens: [${tokens.join(', ')}]`);
  if (result) {
    console.log(`Match: ${result.entry[2]} (code: ${result.entry[0]}, score: ${result.score})`);
  } else {
    console.log(`Match: NONE (threshold: ${LOCAL_MATCH_THRESHOLD})`);
  }
  console.log('');
}
