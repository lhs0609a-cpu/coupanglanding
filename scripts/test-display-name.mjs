// display-name-generator 수정 후 토큰 분류 확인용 테스트
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seoData = JSON.parse(readFileSync(join(__dirname, '../src/lib/megaload/data/seo-keyword-pools.json'), 'utf8'));

const CATEGORY_POOLS = seoData.categoryPools;
const SYNONYM_GROUPS = seoData.synonymGroups;

function stringToSeed(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  return hash >>> 0;
}
function createSeededRandom(seed) {
  let state = seed | 0;
  return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ORIGINS = new Set([
  '한국','국내','국산','미국','일본','중국','독일','프랑스','이탈리아',
  '영국','호주','뉴질랜드','스위스','캐나다','네덜란드','스페인','덴마크',
  '노르웨이','스웨덴','핀란드','벨기에','오스트리아','인도','태국','베트남',
  '칠레','페루','멕시코','필리핀','에콰도르',
  '경북','경남','충북','충남','전북','전남','강원','경기','제주',
  '청송','영주','영덕','봉화','영양','안동','상주','김천','경산','의성',
  '성주','밀양','거창','합천','산청','하동',
  '나주','해남','영암','담양','순천','보성','고흥','무안',
  '충주','음성','진천','괴산','보은','영동','금산',
  '예산','서산','당진','부여','공주','논산','청양',
  '이천','여주','양평','평택','안성','화성',
  '횡성','홍천','정선','평창','춘천','양양','속초',
  '익산','정읍','남원','김제','완주','고창','부안',
  '서귀포',
  '통영','거제','남해','여수','완도','진도','목포','태안','서천','보령',
  '포항','울진','울릉','강릉','동해','삼척',
]);

const NOISE = new Set(['무료배송','당일발송','특가','할인','증정','사은품','리뷰이벤트','추천','인기','베스트','상품상세참조']);
const SPEC_PATTERN = /\d+\s*(ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

function extractSpecs(name) {
  const specs = []; const specSeen = new Set();
  const matches = name.match(SPEC_PATTERN);
  if (matches) { for (const s of matches) { const k = s.trim().toLowerCase(); if (!specSeen.has(k)) { specSeen.add(k); specs.push(s.trim()); } } }
  const cleaned = name.replace(SPEC_PATTERN, ' ');
  const hasCount = specs.some(s => /\d+\s*(개|입|매|팩|세트|병|통|포|봉|장|알|ea)$/i.test(s));
  if (!hasCount) specs.push('1개');
  return { specs: specs.slice(0, 3), cleaned };
}

function tokenize(name) {
  let cleaned = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const seen = new Set();
  return cleaned.split(/\s+/).map(w => w.trim()).filter(w => {
    if (w.length < 2) return false;
    const lower = w.toLowerCase();
    if (NOISE.has(lower)) return false;
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

function findBestPool(categoryPath) {
  if (CATEGORY_POOLS[categoryPath]) return CATEGORY_POOLS[categoryPath];
  const segments = categoryPath.split('>').map(s => s.trim());
  let bestKey = '', bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const keySegments = key.split('>').map(s => s.trim());
    let matchCount = 0;
    for (let i = 0; i < Math.min(segments.length, keySegments.length); i++) {
      if (segments[i] === keySegments[i]) matchCount++; else break;
    }
    if (matchCount > bestScore || (matchCount === bestScore && key.length > bestKey.length)) { bestScore = matchCount; bestKey = key; }
  }
  if (bestScore >= 2 && bestKey) return CATEGORY_POOLS[bestKey];
  return null;
}

function classifyTokens(originalName, categoryPath, brand) {
  const { specs, cleaned } = extractSpecs(originalName);
  const tokens = tokenize(cleaned);
  const brandLower = brand.toLowerCase();
  const pool = findBestPool(categoryPath);
  const ingredientSet = new Set((pool?.ingredients || []).map(s => s.toLowerCase()));
  const featureSet = new Set((pool?.features || []).map(s => s.toLowerCase()));
  const allIngredientTerms = pool?.ingredients || [];
  const allFeatureTerms = pool?.features || [];
  const result = { type: [], ingredients: [], features: [], origin: [], descriptors: [], specs };
  const classified = new Set();
  const originalLower = originalName.toLowerCase();

  // Pass 1: 역매칭
  for (const term of allIngredientTerms) {
    if (originalLower.includes(term.toLowerCase()) && !classified.has(term.toLowerCase())) {
      result.ingredients.push(term); classified.add(term.toLowerCase());
    }
  }
  for (const term of allFeatureTerms) {
    if (originalLower.includes(term.toLowerCase()) && !classified.has(term.toLowerCase())) {
      result.features.push(term); classified.add(term.toLowerCase());
    }
  }

  // Pass 2: 토큰별 분류 (원산지/TYPE을 브랜드보다 우선)
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (classified.has(lower)) continue;

    // 원산지 (브랜드보다 우선)
    if (ORIGINS.has(lower) || ORIGINS.has(token)) { result.origin.push(token); classified.add(lower); continue; }

    // TYPE (동의어 그룹 — 브랜드보다 우선)
    let isType = false;
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === lower)) { result.type.push(token); classified.add(lower); isType = true; break; }
    }
    if (isType) continue;

    // 성분
    if (ingredientSet.has(lower)) { result.ingredients.push(token); classified.add(lower); continue; }

    // 특징
    if (featureSet.has(lower)) { result.features.push(token); classified.add(lower); continue; }

    // 브랜드 제외 (위에 해당 안 할 때만)
    if (lower === brandLower || brandLower.includes(lower)) continue;

    // 서술어
    result.descriptors.push(token); classified.add(lower);
  }

  // Pass 3: 복합어 분해 ("청송사과" → "청송" origin + "사과" type)
  const descriptorsCopy = [...result.descriptors];
  for (const desc of descriptorsCopy) {
    const descLower = desc.toLowerCase();
    for (const origin of ORIGINS) {
      if (descLower.startsWith(origin) && descLower.length > origin.length) {
        const remainder = desc.slice(origin.length);
        const remainderLower = remainder.toLowerCase();
        let foundType = false;
        for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
          if (synonyms.some(s => s.toLowerCase() === remainderLower)) {
            if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
            if (!classified.has(remainderLower)) { result.type.push(remainder); classified.add(remainderLower); }
            const idx = result.descriptors.indexOf(desc);
            if (idx >= 0) result.descriptors.splice(idx, 1);
            foundType = true;
            break;
          }
        }
        if (foundType) break;
        if (featureSet.has(remainderLower)) {
          if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
          if (!classified.has(remainderLower)) { result.features.push(remainder); classified.add(remainderLower); }
          const idx = result.descriptors.indexOf(desc);
          if (idx >= 0) result.descriptors.splice(idx, 1);
          break;
        }
      }
    }
  }

  return result;
}

// ---- Full display name generation (simplified) ----
function getSynonym(word, rng) {
  for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    if (synonyms.some(s => s.toLowerCase() === word.toLowerCase())) {
      const others = synonyms.filter(s => s.toLowerCase() !== word.toLowerCase());
      if (others.length > 0) return others[Math.floor(rng() * others.length)];
    }
  }
  return word;
}

function selectSubset(items, count, rng) {
  if (items.length <= count) return [...items];
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  return shuffled.slice(0, count);
}

function generateDisplayName(originalName, brand, categoryPath, sellerSeed, productIndex) {
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);
  const classified = classifyTokens(originalName, categoryPath, brand);
  const usedWords = new Set();
  const allWords = [];

  for (const t of classified.type) { const syn = getSynonym(t, rng); if (!usedWords.has(syn.toLowerCase())) { allWords.push(syn); usedWords.add(syn.toLowerCase()); } }
  for (const ingr of classified.ingredients) {
    if (!usedWords.has(ingr.toLowerCase())) { allWords.push(ingr); usedWords.add(ingr.toLowerCase()); }
    const syn = getSynonym(ingr, rng); if (syn.toLowerCase() !== ingr.toLowerCase() && !usedWords.has(syn.toLowerCase())) { allWords.push(syn); usedWords.add(syn.toLowerCase()); }
  }
  for (const feat of classified.features) {
    if (!usedWords.has(feat.toLowerCase())) { allWords.push(feat); usedWords.add(feat.toLowerCase()); }
    const syn = getSynonym(feat, rng); if (syn.toLowerCase() !== feat.toLowerCase() && !usedWords.has(syn.toLowerCase())) { allWords.push(syn); usedWords.add(syn.toLowerCase()); }
  }
  for (const orig of classified.origin) { if (!usedWords.has(orig.toLowerCase())) { allWords.push(orig); usedWords.add(orig.toLowerCase()); } }
  const selectedDesc = selectSubset(classified.descriptors, 3, rng);
  for (const desc of selectedDesc) { if (!usedWords.has(desc.toLowerCase())) { allWords.push(desc); usedWords.add(desc.toLowerCase()); } }

  const pool = findBestPool(categoryPath);
  if (pool) {
    const genericCount = 2 + Math.floor(rng() * 2);
    const availableGeneric = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const selectedGeneric = selectSubset(availableGeneric, genericCount, rng);
    for (const g of selectedGeneric) { allWords.push(g); usedWords.add(g.toLowerCase()); }
  }

  // shuffle
  for (let i = allWords.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [allWords[i], allWords[j]] = [allWords[j], allWords[i]]; }
  allWords.push(...classified.specs);

  if (allWords.length < 6 && pool) {
    const remaining = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const extra = selectSubset(remaining, 6 - allWords.length, rng);
    for (const g of extra) allWords.push(g);
  }

  let result = allWords.join(' ');
  if (result.length > 100) {
    const trimmed = []; let len = 0;
    for (const w of allWords) { if (len + w.length + (len > 0 ? 1 : 0) > 100) break; trimmed.push(w); len += w.length + (len > 0 ? 1 : 0); }
    result = trimmed.join(' ');
  }
  return result || originalName.slice(0, 100);
}

// ==== Test ====
const testCases = [
  { name: '청송 사과 부사 5kg 가정용 17과~20과 중과', brand: '청송농협', cat: '식품>신선식품>과일류>과일>사과' },
  { name: '경북 영주 꿀사과 부사 10kg 당도선별 GAP인증', brand: '영주농협', cat: '식품>신선식품>과일류>과일>사과' },
  { name: '산지직송 사과 홍로 가정용 못난이 5kg', brand: '대구농산', cat: '식품>신선식품>과일류>과일>사과' },
  { name: '프리미엄 시나노골드 사과 선물용 특대과 3kg', brand: '과일나라', cat: '식품>신선식품>과일류>과일>사과' },
  { name: '[GAP인증] 무농약 청송사과 부사 10kg 대과', brand: '청송과수원', cat: '식품>신선식품>과일류>과일>사과' },
  { name: '제주 감귤 하우스감귤 3kg 가정용', brand: '제주농원', cat: '식품>신선식품>과일류>과일>감귤' },
  { name: '나주배 신고배 선물용 7.5kg 특대과', brand: '나주농협', cat: '식품>신선식품>과일류>과일>배' },
  { name: '성주 참외 꿀참외 당도선별 10kg 가정용', brand: '성주농업', cat: '식품>신선식품>과일류>과일>참외' },
];

console.log('=== 토큰 분류 ===\n');
for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const classified = classifyTokens(tc.name, tc.cat, tc.brand);
  console.log(`[${i+1}] 원본: ${tc.name}`);
  console.log(`    TYPE: [${classified.type.join(', ')}]  FEAT: [${classified.features.join(', ')}]  ORIG: [${classified.origin.join(', ')}]  DESC: [${classified.descriptors.join(', ')}]  SPEC: [${classified.specs.join(', ')}]`);
}

console.log('\n=== 최종 노출상품명 (셀러A) ===\n');
for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const name = generateDisplayName(tc.name, tc.brand, tc.cat, 'seller_A_123', i);
  console.log(`[${i+1}] ${name}`);
}

console.log('\n=== 최종 노출상품명 (셀러B — 같은 상품 다른 셀러) ===\n');
for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const name = generateDisplayName(tc.name, tc.brand, tc.cat, 'seller_B_456', i);
  console.log(`[${i+1}] ${name}`);
}
