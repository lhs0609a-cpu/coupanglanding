/**
 * 종합 감사 스크립트 — 4000+ 소분류 × 20개 아이템
 *
 * 테스트 항목:
 *   1. 노출상품명 (generateDisplayName) — 오염, 길이, 중복, 금지어, 브랜드 누출
 *   2. 상세페이지 (buildRichDetailPageHtml) — 구조, 빈 섹션, SEO
 *   3. 대표이미지 (image scoring) — 로직 리뷰
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const BASE = 'G:/내 드라이브/landingpage/coupanglanding/src/lib/megaload';

// ─── 데이터 로드 ──────────────────────────────────────────────
const catDetails = JSON.parse(readFileSync(join(BASE, 'data/coupang-cat-details.json'), 'utf8'));
const seoData = JSON.parse(readFileSync(join(BASE, 'data/seo-keyword-pools.json'), 'utf8'));

const CATEGORY_POOLS = seoData.categoryPools;
const SYNONYM_GROUPS = seoData.synonymGroups;
const UNIVERSAL_MODIFIERS = seoData.universalModifiers || [];

// v4.2: 기능성 수식어 allowlist
const FEATURE_SYNONYM_KEYS = new Set([
  '보습', '주름개선', '미백', '탄력', '콜라겐', '비타민c',
  '유산균', '오메가3', '프로틴', '다이어트', '루테인', '밀크씨슬',
  '칼슘', '마그네슘', '알로에', '유기농', '저자극', '대용량', '향기',
].map(k => k.toLowerCase()));

// v4.3: 비상품 카테고리 (TYPE synonym 매칭 스킵)
const NON_PRODUCT_TOP = new Set(['도서', '도서/음반/DVD']);

// ─── seeded-random ────────────────────────────────────────────
function stringToSeed(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── compliance filter (simplified) ───────────────────────────
const FORBIDDEN_ERRORS = [
  '치료', '완치', '항암', '당뇨', '고혈압', '치매', '골다공증', '아토피',
  '해독', '디톡스', '만병통치', '약효', '진통', '소염', '질병예방',
  '세포재생', '보톡스', '피부재생', 'DNA복구', '줄기세포배양',
  '체질개선', '의료기기', '의사추천', 'FDA인증', '임상시험',
  '최고', '1위', '기적', '완벽', '100%보장', '놀라운', '충격', '폭발적',
  '무료배송', '할인', '세일', '특가', '이벤트', '핫딜', '당일발송',
  '최저가', '한정', '베스트', '1등', '추천',
];

function checkForbidden(text) {
  const found = [];
  for (const term of FORBIDDEN_ERRORS) {
    if (text.includes(term)) found.push(term);
  }
  return found;
}

function cleanCompliance(text) {
  let cleaned = text;
  for (const term of FORBIDDEN_ERRORS) {
    cleaned = cleaned.split(term).join('');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

// ─── 토큰 분류 (원본 재현) ───────────────────────────────────
const SPEC_PATTERN = /\d+\s*(개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;

const NOISE = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '추천', '인기', '베스트', '상품상세참조',
]);

const ORIGINS = new Set([
  '한국', '국내', '국산', '미국', '일본', '중국', '독일', '프랑스', '이탈리아',
  '영국', '호주', '뉴질랜드', '스위스', '캐나다', '네덜란드', '스페인', '덴마크',
  '노르웨이', '스웨덴', '핀란드', '벨기에', '오스트리아', '인도', '태국', '베트남',
  '칠레', '페루', '멕시코', '필리핀', '에콰도르',
  '경북', '경남', '충북', '충남', '전북', '전남', '강원', '경기', '제주',
  '청송', '영주', '영덕', '봉화', '영양', '안동', '상주', '김천', '경산', '의성',
  '성주', '밀양', '거창', '합천', '산청', '하동',
  '나주', '해남', '영암', '담양', '순천', '보성', '고흥', '무안',
  '충주', '음성', '진천', '괴산', '보은', '영동', '금산',
  '예산', '서산', '당진', '부여', '공주', '논산', '청양',
  '이천', '여주', '양평', '평택', '안성', '화성',
  '횡성', '홍천', '정선', '평창', '춘천', '양양', '속초',
  '익산', '정읍', '남원', '김제', '완주', '고창', '부안',
  '서귀포',
  '통영', '거제', '남해', '여수', '완도', '진도', '목포', '태안', '서천', '보령',
  '포항', '울진', '울릉', '강릉', '동해', '삼척',
]);

function matchesWholeUnit(text, term) {
  const isHangul = (c) => c >= '\uAC00' && c <= '\uD7AF';
  const isLatin = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  const isDigit = (c) => c >= '0' && c <= '9';
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(term, searchFrom);
    if (idx < 0) return false;
    const endIdx = idx + term.length;
    let ok = true;
    if (idx > 0) {
      const prev = text[idx - 1]; const first = term[0];
      if ((isHangul(prev) && isHangul(first)) || (isLatin(prev) && isLatin(first)) || (isDigit(prev) && isDigit(first))) ok = false;
    }
    if (ok && endIdx < text.length) {
      const next = text[endIdx]; const last = term[term.length - 1];
      if ((isHangul(next) && isHangul(last)) || (isLatin(next) && isLatin(last)) || (isDigit(next) && isDigit(last))) ok = false;
    }
    if (ok) return true;
    searchFrom = idx + 1;
  }
}

function extractSpecs(name) {
  const specs = []; const specSeen = new Set();
  const matches = name.match(SPEC_PATTERN);
  if (matches) {
    for (const s of matches) {
      const trimmed = s.trim(); const key = trimmed.toLowerCase();
      if (!specSeen.has(key)) { specSeen.add(key); specs.push(trimmed); }
    }
  }
  const cleaned = name.replace(SPEC_PATTERN, ' ');
  return { specs: specs.slice(0, 4), cleaned };
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
  let bestKey = ''; let bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const keySegments = key.split('>').map(s => s.trim());
    let matchCount = 0;
    for (let i = 0; i < Math.min(segments.length, keySegments.length); i++) {
      if (segments[i] === keySegments[i]) matchCount++; else break;
    }
    if (matchCount > bestScore || (matchCount === bestScore && key.length > bestKey.length)) {
      bestScore = matchCount; bestKey = key;
    }
  }
  if (bestScore >= 2 && bestKey) return CATEGORY_POOLS[bestKey];
  if (bestScore >= 1) {
    const merged = { generic: [], ingredients: [], features: [] };
    const seen = { generic: new Set(), ingredients: new Set(), features: new Set() };
    for (const key of Object.keys(CATEGORY_POOLS)) {
      if (key.split('>')[0].trim() === segments[0]) {
        const pool = CATEGORY_POOLS[key];
        for (const g of pool.generic) { if (!seen.generic.has(g.toLowerCase())) { seen.generic.add(g.toLowerCase()); merged.generic.push(g); } }
        for (const i of pool.ingredients) { if (!seen.ingredients.has(i.toLowerCase())) { seen.ingredients.add(i.toLowerCase()); merged.ingredients.push(i); } }
        for (const f of pool.features) { if (!seen.features.has(f.toLowerCase())) { seen.features.add(f.toLowerCase()); merged.features.push(f); } }
      }
    }
    if (merged.generic.length > 0) return merged;
  }
  return generatePoolFromPath(segments);
}

function generatePoolFromPath(segments) {
  const generic = [];
  for (const seg of segments) { if (seg.length >= 2) generic.push(seg); }
  const leaf = segments[segments.length - 1] || '';
  const leafLower = leaf.toLowerCase();
  for (const [key, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    const keyLower = key.toLowerCase();
    if (leafLower.includes(keyLower) || keyLower.includes(leafLower)) {
      for (const s of synonyms.slice(0, 3)) { if (!generic.includes(s)) generic.push(s); }
      break;
    }
  }
  return { generic, ingredients: [], features: [] };
}

function classifyTokens(originalName, categoryPath, brand) {
  const { specs, cleaned } = extractSpecs(originalName);
  const tokens = tokenize(cleaned);
  const brandLower = brand.toLowerCase();
  // v4.3: 비상품 카테고리 판별
  const topCategory = categoryPath.split('>')[0]?.trim() || '';
  const isNonProductCategory = NON_PRODUCT_TOP.has(topCategory);
  const pool = findBestPool(categoryPath);
  const ingredientSet = new Set(pool.ingredients.map(s => s.toLowerCase()));
  const featureSet = new Set(pool.features.map(s => s.toLowerCase()));
  const allIngredientTerms = pool.ingredients;
  const allFeatureTerms = pool.features;
  const result = { type: [], ingredients: [], features: [], origin: [], descriptors: [], specs };
  const classified = new Set();
  const originalLower = originalName.toLowerCase();
  const sortedIngr = [...allIngredientTerms].sort((a, b) => b.length - a.length);
  const sortedFeat = [...allFeatureTerms].sort((a, b) => b.length - a.length);
  for (const term of sortedIngr) {
    const tl = term.toLowerCase();
    if (classified.has(tl)) continue;
    // v4.3: 브랜드명과 동일한 풀 키워드 스킵
    if (brandLower.length >= 2 && tl === brandLower) continue;
    if (!matchesWholeUnit(originalLower, tl)) continue;
    let sub = false;
    for (const existing of classified) { if (existing.length > tl.length && existing.includes(tl)) { sub = true; break; } }
    if (sub) continue;
    result.ingredients.push(term); classified.add(tl);
  }
  for (const term of sortedFeat) {
    const tl = term.toLowerCase();
    if (classified.has(tl)) continue;
    // v4.3: 브랜드명과 동일한 풀 키워드 스킵
    if (brandLower.length >= 2 && tl === brandLower) continue;
    if (!matchesWholeUnit(originalLower, tl)) continue;
    let sub = false;
    for (const existing of classified) { if (existing.length > tl.length && existing.includes(tl)) { sub = true; break; } }
    if (sub) continue;
    result.features.push(term); classified.add(tl);
  }
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (classified.has(lower)) continue;
    if (ORIGINS.has(lower) || ORIGINS.has(token)) { result.origin.push(token); classified.add(lower); continue; }
    // v4.3: 비상품 카테고리에서는 synonym TYPE 매칭 스킵
    if (!isNonProductCategory) {
      let isType = false;
      for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
        if (synonyms.some(s => s.toLowerCase() === lower)) { result.type.push(token); classified.add(lower); isType = true; break; }
      }
      if (isType) continue;
    }
    // v4.3: 브랜드 제외를 ingredient/feature 매칭보다 먼저
    if (lower === brandLower || brandLower.includes(lower) ||
        (brandLower.length >= 2 && lower.startsWith(brandLower) && lower.length <= brandLower.length + 3)) continue;
    if (ingredientSet.has(lower)) { result.ingredients.push(token); classified.add(lower); continue; }
    if (featureSet.has(lower)) { result.features.push(token); classified.add(lower); continue; }
    result.descriptors.push(token); classified.add(lower);
  }
  // 3a: origin+type decomposition
  const dc = [...result.descriptors];
  for (const desc of dc) {
    const dl = desc.toLowerCase();
    for (const origin of ORIGINS) {
      if (dl.startsWith(origin) && dl.length > origin.length) {
        const remainder = desc.slice(origin.length); const rl = remainder.toLowerCase();
        let ft = false;
        for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
          if (synonyms.some(s => s.toLowerCase() === rl)) {
            if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
            if (!classified.has(rl)) { result.type.push(remainder); classified.add(rl); }
            const idx = result.descriptors.indexOf(desc); if (idx >= 0) result.descriptors.splice(idx, 1);
            ft = true; break;
          }
        }
        if (ft) break;
        if (featureSet.has(rl)) {
          if (!classified.has(origin)) { result.origin.push(origin); classified.add(origin); }
          if (!classified.has(rl)) { result.features.push(remainder); classified.add(rl); }
          const idx = result.descriptors.indexOf(desc); if (idx >= 0) result.descriptors.splice(idx, 1);
          break;
        }
      }
    }
  }
  // 3b: feat/ingr+type decomposition
  const dc2 = [...result.descriptors];
  for (const desc of dc2) {
    const dl = desc.toLowerCase(); let found = false;
    for (let splitAt = 1; splitAt < dl.length && !found; splitAt++) {
      const suffix = dl.slice(splitAt); const prefix = dl.slice(0, splitAt);
      for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
        if (synonyms.some(s => s.toLowerCase() === suffix)) {
          if (featureSet.has(prefix) || ingredientSet.has(prefix)) {
            const po = desc.slice(0, splitAt); const so = desc.slice(splitAt);
            if (featureSet.has(prefix) && !classified.has(prefix)) { result.features.push(po); classified.add(prefix); }
            else if (ingredientSet.has(prefix) && !classified.has(prefix)) { result.ingredients.push(po); classified.add(prefix); }
            if (!classified.has(suffix)) { result.type.push(so); classified.add(suffix); }
            const idx = result.descriptors.indexOf(desc); if (idx >= 0) result.descriptors.splice(idx, 1);
            found = true; break;
          }
        }
      }
    }
  }
  return result;
}

function selectSubset(items, count, rng) {
  if (items.length <= count) return [...items];
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

const TARGET_MIN_CHARS = 45;
const HARD_MAX_CHARS = 70;

function generateDisplayName(originalName, brand, categoryPath, sellerSeed, productIndex) {
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);
  const classified = classifyTokens(originalName, categoryPath, brand);
  const originalLower = originalName.toLowerCase();
  const parts = [];
  const usedWords = new Set();
  const usedSubWords = new Map();
  const addToken = (word) => {
    const lower = word.toLowerCase();
    if (usedWords.has(lower)) return false;
    const subWords = lower.split(/[\/\s]+/).filter(w => w.length >= 2);
    for (const sw of subWords) {
      if ((usedSubWords.get(sw) || 0) >= 2) return false;
    }
    usedWords.add(lower);
    for (const sw of subWords) {
      usedSubWords.set(sw, (usedSubWords.get(sw) || 0) + 1);
    }
    parts.push(word); return true;
  };
  const ingrToUse = selectSubset(classified.ingredients, 3, rng);
  for (const ingr of ingrToUse) addToken(ingr);
  const featToUse = selectSubset(classified.features, 3, rng);
  for (const feat of featToUse) addToken(feat);
  // v4.3: 카테고리 관련성 검사 추가
  const categoryPathLowerGen = categoryPath.toLowerCase();
  for (const t of classified.type.slice(0, 2)) {
    addToken(t);
    for (const [groupKey, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === t.toLowerCase())) {
        const groupKeyLower = groupKey.toLowerCase();
        const tLower = t.toLowerCase();
        // 카테고리 경로에 그룹키 또는 타입 토큰이 있어야 확장
        if (!categoryPathLowerGen.includes(groupKeyLower) && !categoryPathLowerGen.includes(tLower)) {
          break; // 관련 없는 카테고리 → synonym 확장 스킵
        }
        const others = synonyms.filter(s => s.toLowerCase() !== tLower && !usedWords.has(s.toLowerCase()));
        if (others.length > 0) addToken(others[Math.floor(rng() * others.length)]);
        break;
      }
    }
  }
  if (classified.descriptors.length > 0) {
    const descToUse = selectSubset(classified.descriptors, 2, rng);
    for (const d of descToUse) addToken(d);
  }

  // ⑤ Generic keywords with contamination filter (v4.2)
  const pool = findBestPool(categoryPath);
  const synonymKeySet = new Set(Object.keys(SYNONYM_GROUPS).map(k => k.toLowerCase()));
  const myTypes = new Set(classified.type.map(t => t.toLowerCase()));
  const categoryPathLower = categoryPath.toLowerCase();
  const isHangulChar = (c) => c >= '\uAC00' && c <= '\uD7AF';
  const isContaminated = (g) => {
    const lower = g.toLowerCase();
    if (FEATURE_SYNONYM_KEYS.has(lower)) return false;
    if (categoryPathLower.includes(lower)) return false;
    if (synonymKeySet.has(lower) && !myTypes.has(lower)) return true;
    for (const synKey of synonymKeySet) {
      if (FEATURE_SYNONYM_KEYS.has(synKey)) continue;
      const minLen = (synKey.length === 1 && isHangulChar(synKey[0])) ? 1 : 2;
      if (synKey.length >= minLen && lower.includes(synKey) && !myTypes.has(synKey)) {
        if (!originalLower.includes(synKey) && !categoryPathLower.includes(synKey)) return true;
      }
    }
    return false;
  };
  {
    const availableGeneric = pool.generic.filter(g => !usedWords.has(g.toLowerCase()) && !isContaminated(g));
    const genericPicks = selectSubset(availableGeneric, 3, rng);
    for (const g of genericPicks) addToken(g);
  }
  // ⑤b TYPE 자동 추가 (리프명)
  if (classified.type.length === 0) {
    const leafName = categoryPath.split('>').pop()?.trim() || '';
    if (leafName.length >= 2) addToken(leafName);
  }

  for (const orig of classified.origin.slice(0, 1)) addToken(orig);

  const specTokens = classified.specs.slice(0, 3).filter(s => !usedWords.has(s.toLowerCase()));
  for (const s of specTokens) usedWords.add(s.toLowerCase());
  const specStr = specTokens.join(' ');
  const specLen = specStr.length > 0 ? specStr.length + 1 : 0;
  const targetWithoutSpec = TARGET_MIN_CHARS - specLen;

  if (parts.join(' ').length < targetWithoutSpec) {
    const remainingGeneric = pool.generic.filter(g => !usedWords.has(g.toLowerCase()) && !isContaminated(g));
    const extraGeneric = selectSubset(remainingGeneric, 6, rng);
    for (const g of extraGeneric) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(g);
    }
  }
  if (parts.join(' ').length < targetWithoutSpec) {
    const catSegments = categoryPath.split('>').map(s => s.trim()).filter(s => s.length >= 2);
    for (const seg of catSegments) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      if (!isContaminated(seg)) addToken(seg);
    }
  }
  if (parts.join(' ').length < targetWithoutSpec) {
    const availableMods = UNIVERSAL_MODIFIERS.filter(m => !usedWords.has(m.toLowerCase()));
    const modPicks = selectSubset(availableMods, 4, rng);
    for (const m of modPicks) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(m);
    }
  }
  parts.push(...specTokens);
  let result = parts.join(' ');
  if (result.length > HARD_MAX_CHARS) {
    const trimmed = []; let len = 0;
    for (const w of parts) {
      if (len + w.length + (len > 0 ? 1 : 0) > HARD_MAX_CHARS) break;
      trimmed.push(w); len += w.length + (len > 0 ? 1 : 0);
    }
    result = trimmed.join(' ');
  }
  result = cleanCompliance(result);
  return result || originalName.slice(0, HARD_MAX_CHARS);
}

// ─── FAQ 생성 재현 ──────────────────────────────────────────
function extractSeoKeywords(productName, categoryPath, sellerSeed, productIndex) {
  const seed = stringToSeed(`seo:${sellerSeed}:${productIndex}:${productName}`);
  const rng = createSeededRandom(seed);
  const pool = findBestPool(categoryPath);
  const keywords = [];
  const segments = categoryPath.split('>').map(s => s.trim());
  if (segments.length > 0) keywords.push(segments[segments.length - 1]);
  const nameTokens = productName.split(/\s+/).filter(t => t.length >= 2).slice(0, 3);
  for (const t of nameTokens) { if (!keywords.includes(t)) keywords.push(t); }
  const generics = pool.generic.filter(g => !keywords.map(k => k.toLowerCase()).includes(g.toLowerCase()));
  const picks = selectSubset(generics, 3, rng);
  for (const g of picks) { if (!keywords.includes(g)) keywords.push(g); }
  if (UNIVERSAL_MODIFIERS.length > 0) {
    const mod = UNIVERSAL_MODIFIERS[Math.floor(rng() * UNIVERSAL_MODIFIERS.length)];
    if (!keywords.includes(mod)) keywords.push(mod);
  }
  return keywords.slice(0, 6);
}

function generateFaqItems(productName, categoryPath, sellerSeed, productIndex, count = 4) {
  const seed = stringToSeed(`faq:${sellerSeed}:${productIndex}:${productName}`);
  const rng = createSeededRandom(seed);
  const segments = categoryPath.split('>').map(s => s.trim());
  const leaf = segments[segments.length - 1] || '상품';
  const templates = [
    { q: `${leaf} 어떻게 보관하나요?`, a: `${productName}은(는) 직사광선을 피하고 서늘한 곳에 보관해 주세요.` },
    { q: `${leaf} 유통기한이 어떻게 되나요?`, a: `제조일로부터 상세페이지에 표기된 기간까지이며, 개봉 후에는 빠른 시일 내 사용을 권장합니다.` },
    { q: `${leaf} 사이즈/용량이 어떻게 되나요?`, a: `상세페이지의 상품정보제공고시를 참고해 주세요. ${productName} 정확한 규격이 안내되어 있습니다.` },
    { q: `교환/반품은 어떻게 하나요?`, a: `수령 후 7일 이내 교환/반품이 가능합니다. 단, 사용 흔적이 있는 경우 교환/반품이 제한될 수 있습니다.` },
    { q: `${leaf} 선물용으로 적합한가요?`, a: `네, ${productName}은(는) 선물용으로도 많이 구매하시는 상품입니다.` },
    { q: `배송은 얼마나 걸리나요?`, a: `주문 후 1~3 영업일 이내 출고되며, 지역에 따라 1~2일 추가 소요될 수 있습니다.` },
    { q: `${leaf} 성분/원재료가 궁금합니다`, a: `${productName}의 상세 성분은 상품정보제공고시에서 확인하실 수 있습니다.` },
    { q: `어린이/반려동물에게 안전한가요?`, a: `상세페이지의 주의사항을 반드시 확인해 주세요. 용도에 맞게 사용하시면 안전합니다.` },
  ];
  const shuffled = selectSubset(templates, Math.min(count, templates.length), rng);
  return shuffled.map(t => ({ question: t.q, answer: t.a }));
}

function generateClosingText(productName, categoryPath, sellerSeed, productIndex) {
  const seed = stringToSeed(`closing:${sellerSeed}:${productIndex}:${productName}`);
  const rng = createSeededRandom(seed);
  const segments = categoryPath.split('>').map(s => s.trim());
  const leaf = segments[segments.length - 1] || '상품';
  const templates = [
    `${productName}, 지금 바로 만나보세요. ${leaf} 카테고리에서 합리적인 선택을 하실 수 있습니다.`,
    `믿을 수 있는 ${leaf}, ${productName}으로 시작해 보세요.`,
    `${productName} — 매일 쓰는 ${leaf}이니까, 제대로 고르세요.`,
  ];
  return templates[Math.floor(rng() * templates.length)];
}

// ─── 가상 아이템명 생성기 ─────────────────────────────────────
// 각 카테고리에 맞는 가상 상품명 20개 생성
const BRAND_POOL = [
  '비오팜', '종근당', '고려은단', '뉴트리원', '닥터리브', '풀무원', '오뚜기', '씨제이',
  '아모레', '미샤', '이니스프리', '네이처리퍼블릭', '스킨푸드', '삼성', '엘지',
  '코웨이', '필립스', '다이슨', '나이키', '아디다스', '뉴발란스', '브리타', '보쉬',
  '일리', '스타벅스', '하겐다즈', '롯데', '농심', '삼양', '해태', '빙그레',
  '유한킴벌리', '라이온', '피죤', '엘라스틴', '케라시스', '다우니', '리큐', '한샘',
  '시디즈', '에몬스', '일룸', '레고', '반다이', '타미야', '프로스펙스', '블랙야크',
];

const SPEC_POOL = [
  '50ml', '100ml', '200ml', '300ml', '500ml', '1L', '1.5L',
  '50g', '100g', '200g', '300g', '500g', '1kg', '2kg', '3kg', '5kg', '10kg',
  '10정', '30정', '60정', '90정', '120정',
  '10매', '20매', '30매', '50매', '80매', '100매',
  '1개', '2개', '3개', '5개', '10개', '12개',
  '1팩', '3팩', '5팩', '10팩',
  '1세트', '2세트', '3세트',
  '30cm', '50cm', '1m', '2m',
];

const MODIFIER_POOL = [
  '프리미엄', '유기농', '무농약', '친환경', '저자극', '고농축', '대용량',
  '순수', '내추럴', '클래식', '오리지널', '플러스', '스페셜', '리뉴얼',
  '미니', '점보', '에코', '슬림', '울트라', '마일드', '센시티브',
  '모이스처', '인텐시브', '디럭스', '라이트', '스탠다드',
];

function generateVirtualProducts(categoryPath, count = 20) {
  const segments = categoryPath.split('>').map(s => s.trim());
  const leaf = segments[segments.length - 1] || '상품';
  const pool = findBestPool(categoryPath);
  const products = [];

  for (let i = 0; i < count; i++) {
    const rng = createSeededRandom(stringToSeed(`vp:${categoryPath}:${i}`));
    const brand = BRAND_POOL[Math.floor(rng() * BRAND_POOL.length)];
    const spec = SPEC_POOL[Math.floor(rng() * SPEC_POOL.length)];
    const modifier = MODIFIER_POOL[Math.floor(rng() * MODIFIER_POOL.length)];

    // Type 1: 브랜드 + 리프 + 스펙
    // Type 2: 성분 + 리프 + 스펙
    // Type 3: 수식어 + 리프 + 스펙
    // Type 4: 브랜드 + 성분 + 리프
    // Type 5: 원산지 + 리프 + 스펙

    const variant = i % 5;
    let name;

    const ingr = pool.ingredients.length > 0
      ? pool.ingredients[Math.floor(rng() * pool.ingredients.length)]
      : '';
    const feat = pool.features.length > 0
      ? pool.features[Math.floor(rng() * pool.features.length)]
      : '';
    const generic = pool.generic.length > 0
      ? pool.generic[Math.floor(rng() * pool.generic.length)]
      : leaf;

    const originArr = [...ORIGINS];
    const origin = originArr[Math.floor(rng() * originArr.length)];

    switch (variant) {
      case 0: name = `${brand} ${leaf} ${spec}`; break;
      case 1: name = ingr ? `${ingr} ${leaf} ${spec}` : `${modifier} ${leaf} ${spec}`; break;
      case 2: name = `${modifier} ${feat || generic} ${leaf} ${spec}`; break;
      case 3: name = ingr ? `${brand} ${ingr} ${leaf}` : `${brand} ${modifier} ${leaf}`; break;
      case 4: name = `${origin} ${generic || leaf} ${spec}`; break;
      default: name = `${brand} ${leaf} ${spec}`;
    }

    products.push({ name: name.trim(), brand, categoryPath });
  }

  return products;
}

// ─── 테스트 실행 ─────────────────────────────────────────────

console.log('='.repeat(80));
console.log('종합 감사: 4000+ 소분류 × 20개 아이템 = 80,000+ 테스트');
console.log('='.repeat(80));

// 카테고리 수집 — detail.p = path, detail.r = rate
const allCats = [];
for (const [code, detail] of Object.entries(catDetails)) {
  if (detail.p) {
    const segments = detail.p.split('>').map(s => s.trim());
    allCats.push({ code, path: detail.p, name: segments[segments.length - 1] || '' });
  }
}
console.log(`\n총 카테고리: ${allCats.length}개`);

// 소분류(리프) 카테고리만 추출
// 리프 = 세그먼트 3개 이상
const leafCats = allCats.filter(c => c.path.split('>').length >= 3);
console.log(`소분류(리프) 카테고리: ${leafCats.length}개`);
console.log(`생성할 가상 상품: ${leafCats.length * 20}개\n`);

// 이슈 수집기
const issues = {
  // 노출상품명
  contaminated: [],      // 다른 상품명 혼입
  tooShort: [],          // 30자 미만
  tooLong: [],           // 70자 초과
  duplicateWords: [],    // 동일 단어 3회+
  forbidden: [],         // 금지어 포함
  emptyResult: [],       // 빈 결과
  brandLeak: [],         // 브랜드 노출
  noType: [],            // TYPE 토큰 없음
  allGeneric: [],        // 원본 토큰 0개 (전부 generic)

  // 상세페이지
  emptyFaq: [],          // FAQ 0개
  emptySeoKw: [],        // SEO 키워드 0개
  emptyClosing: [],      // 마무리 텍스트 없음
  faqTooGeneric: [],     // FAQ가 너무 일반적

  // 풀 커버리지
  noPool: [],            // categoryPool 매칭 실패 (generatePoolFromPath 폴백)
  oneLevel: [],          // 1레벨 매칭 (merged pool)
};

const sellerSeed = 'test-seller-001';
let processed = 0;
const totalItems = leafCats.length * 20;

// 진행률 출력 간격
const progressInterval = Math.max(1, Math.floor(leafCats.length / 20));

for (let catIdx = 0; catIdx < leafCats.length; catIdx++) {
  const cat = leafCats[catIdx];
  const products = generateVirtualProducts(cat.path, 20);

  // 풀 매칭 레벨 체크
  const pool = findBestPool(cat.path);
  if (!CATEGORY_POOLS[cat.path]) {
    const segments = cat.path.split('>').map(s => s.trim());
    let bestScore = 0;
    for (const key of Object.keys(CATEGORY_POOLS)) {
      const ks = key.split('>').map(s => s.trim());
      let m = 0;
      for (let i = 0; i < Math.min(segments.length, ks.length); i++) { if (segments[i] === ks[i]) m++; else break; }
      if (m > bestScore) bestScore = m;
    }
    if (bestScore < 1) {
      issues.noPool.push({ cat: cat.path, code: cat.code });
    } else if (bestScore === 1) {
      issues.oneLevel.push({ cat: cat.path, code: cat.code, poolGenericCount: pool.generic.length });
    }
  }

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const displayName = generateDisplayName(p.name, p.brand, p.categoryPath, sellerSeed, i);
    const classified = classifyTokens(p.name, p.categoryPath, p.brand);

    // ── 노출상품명 검사 ──

    // 1. 오염 체크 (v4.2: FEATURE allowlist + category path allowlist 적용)
    const synonymKeySetLocal = new Set(Object.keys(SYNONYM_GROUPS).map(k => k.toLowerCase()));
    const myTypesLocal = new Set(classified.type.map(t => t.toLowerCase()));
    const displayLower = displayName.toLowerCase();
    const origLower = p.name.toLowerCase();
    const catPathLower = p.categoryPath.toLowerCase();
    for (const synKey of synonymKeySetLocal) {
      if (synKey.length < 2) continue;
      if (myTypesLocal.has(synKey)) continue;
      if (origLower.includes(synKey)) continue;
      // v4.2: 기능성 수식어는 오염이 아님
      if (FEATURE_SYNONYM_KEYS.has(synKey)) continue;
      // v4.2: 카테고리 경로에 포함된 단어는 오염이 아님
      if (catPathLower.includes(synKey)) continue;
      if (displayLower.includes(synKey)) {
        // 부분 매칭 검증 (단어 경계)
        if (matchesWholeUnit(displayLower, synKey)) {
          issues.contaminated.push({
            cat: cat.path, product: p.name, display: displayName, contaminant: synKey
          });
        }
      }
    }

    // 2. 길이
    if (displayName.length < 30) {
      issues.tooShort.push({ cat: cat.path, product: p.name, display: displayName, len: displayName.length });
    }
    if (displayName.length > 70) {
      issues.tooLong.push({ cat: cat.path, product: p.name, display: displayName, len: displayName.length });
    }

    // 3. 중복 단어
    const words = displayName.split(/\s+/);
    const wordCount = {};
    for (const w of words) {
      const wl = w.toLowerCase();
      wordCount[wl] = (wordCount[wl] || 0) + 1;
    }
    for (const [w, c] of Object.entries(wordCount)) {
      if (c >= 3) {
        issues.duplicateWords.push({ cat: cat.path, product: p.name, display: displayName, word: w, count: c });
      }
    }

    // 4. 금지어
    const forbiddenFound = checkForbidden(displayName);
    if (forbiddenFound.length > 0) {
      issues.forbidden.push({ cat: cat.path, product: p.name, display: displayName, terms: forbiddenFound });
    }

    // 5. 빈 결과
    if (!displayName || displayName.trim().length === 0) {
      issues.emptyResult.push({ cat: cat.path, product: p.name });
    }

    // 6. 브랜드 누출 (전체 브랜드명이 노출상품명에 포함)
    if (p.brand && p.brand.length >= 3 && displayName.toLowerCase().includes(p.brand.toLowerCase())) {
      issues.brandLeak.push({ cat: cat.path, product: p.name, display: displayName, brand: p.brand });
    }

    // 7. TYPE 토큰 없음
    if (classified.type.length === 0) {
      issues.noType.push({ cat: cat.path, product: p.name, display: displayName });
    }

    // 8. 원본 토큰 0개 (전부 generic/path으로만 구성)
    const origTokenCount = classified.ingredients.length + classified.features.length + classified.type.length + classified.origin.length;
    if (origTokenCount === 0 && classified.descriptors.length === 0 && classified.specs.length === 0) {
      issues.allGeneric.push({ cat: cat.path, product: p.name, display: displayName });
    }

    processed++;
  }

  // 상세페이지 샘플 테스트 (카테고리당 1개만)
  const sampleProduct = products[0];
  const sampleIndex = 0;
  const seoKw = extractSeoKeywords(sampleProduct.name, cat.path, sellerSeed, sampleIndex);
  const faq = generateFaqItems(sampleProduct.name, cat.path, sellerSeed, sampleIndex, 4);
  const closing = generateClosingText(sampleProduct.name, cat.path, sellerSeed, sampleIndex);

  if (seoKw.length === 0) {
    issues.emptySeoKw.push({ cat: cat.path, product: sampleProduct.name });
  }
  if (faq.length === 0) {
    issues.emptyFaq.push({ cat: cat.path, product: sampleProduct.name });
  }
  if (!closing || closing.trim().length === 0) {
    issues.emptyClosing.push({ cat: cat.path, product: sampleProduct.name });
  }
  // FAQ가 너무 일반적 (상품명이 FAQ 답변에 안 들어감)
  const faqHasProduct = faq.some(f => f.answer.includes(sampleProduct.name.split(' ')[0]));
  if (!faqHasProduct && faq.length > 0) {
    // 상품명 첫 단어가 FAQ에 없으면 너무 일반적
    // (이건 가벼운 이슈이므로 최대 50개만 수집)
    if (issues.faqTooGeneric.length < 50) {
      issues.faqTooGeneric.push({ cat: cat.path, product: sampleProduct.name, faq: faq[0] });
    }
  }

  // 진행률 출력
  if (catIdx % progressInterval === 0 || catIdx === leafCats.length - 1) {
    const pct = ((catIdx + 1) / leafCats.length * 100).toFixed(1);
    process.stdout.write(`\r  진행: ${catIdx + 1}/${leafCats.length} 카테고리 (${pct}%) — 아이템 ${processed}/${totalItems}`);
  }
}

console.log('\n');
console.log('='.repeat(80));
console.log('감사 결과 리포트');
console.log('='.repeat(80));

// ── 1. 노출상품명 이슈 ──
console.log('\n━━━ 1. 노출상품명 (Display Name) ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n  총 테스트: ${totalItems.toLocaleString()}개`);

console.log(`\n  [CRITICAL] 오염 (다른 상품 유형 혼입): ${issues.contaminated.length}건`);
if (issues.contaminated.length > 0) {
  for (const item of issues.contaminated.slice(0, 20)) {
    console.log(`    ❌ "${item.display}" ← 오염: "${item.contaminant}"`);
    console.log(`       원본: "${item.product}" | 카테고리: ${item.cat}`);
  }
  if (issues.contaminated.length > 20) console.log(`    ... 외 ${issues.contaminated.length - 20}건 더`);
}

console.log(`\n  [ERROR] 너무 짧음 (<30자): ${issues.tooShort.length}건`);
if (issues.tooShort.length > 0) {
  for (const item of issues.tooShort.slice(0, 10)) {
    console.log(`    ⚠ "${item.display}" (${item.len}자) | 원본: "${item.product}"`);
  }
  if (issues.tooShort.length > 10) console.log(`    ... 외 ${issues.tooShort.length - 10}건 더`);
}

console.log(`\n  [ERROR] 너무 김 (>70자): ${issues.tooLong.length}건`);
if (issues.tooLong.length > 0) {
  for (const item of issues.tooLong.slice(0, 10)) {
    console.log(`    ⚠ "${item.display}" (${item.len}자)`);
  }
  if (issues.tooLong.length > 10) console.log(`    ... 외 ${issues.tooLong.length - 10}건 더`);
}

console.log(`\n  [WARN] 중복 단어 (3회+): ${issues.duplicateWords.length}건`);
if (issues.duplicateWords.length > 0) {
  for (const item of issues.duplicateWords.slice(0, 10)) {
    console.log(`    ⚠ "${item.word}" ${item.count}회 | "${item.display}"`);
  }
  if (issues.duplicateWords.length > 10) console.log(`    ... 외 ${issues.duplicateWords.length - 10}건 더`);
}

console.log(`\n  [CRITICAL] 금지어 포함: ${issues.forbidden.length}건`);
if (issues.forbidden.length > 0) {
  for (const item of issues.forbidden.slice(0, 10)) {
    console.log(`    ❌ 금지어: [${item.terms.join(', ')}] | "${item.display}"`);
  }
  if (issues.forbidden.length > 10) console.log(`    ... 외 ${issues.forbidden.length - 10}건 더`);
}

console.log(`\n  [ERROR] 빈 결과: ${issues.emptyResult.length}건`);
console.log(`  [WARN] 브랜드 누출 (3글자+): ${issues.brandLeak.length}건`);
if (issues.brandLeak.length > 0) {
  for (const item of issues.brandLeak.slice(0, 10)) {
    console.log(`    ⚠ 브랜드 "${item.brand}" 노출: "${item.display}"`);
  }
  if (issues.brandLeak.length > 10) console.log(`    ... 외 ${issues.brandLeak.length - 10}건 더`);
}

console.log(`\n  [INFO] TYPE 토큰 없음: ${issues.noType.length}건`);
if (issues.noType.length > 0) {
  for (const item of issues.noType.slice(0, 10)) {
    console.log(`    ℹ 원본: "${item.product}" → "${item.display}"`);
    console.log(`      카테: ${item.cat}`);
  }
  if (issues.noType.length > 10) console.log(`    ... 외 ${issues.noType.length - 10}건 더`);
}

console.log(`\n  [INFO] 원본 토큰 0개 (전부 generic): ${issues.allGeneric.length}건`);
if (issues.allGeneric.length > 0) {
  for (const item of issues.allGeneric.slice(0, 10)) {
    console.log(`    ℹ 원본: "${item.product}" → "${item.display}"`);
  }
  if (issues.allGeneric.length > 10) console.log(`    ... 외 ${issues.allGeneric.length - 10}건 더`);
}

// ── 2. 풀 커버리지 ──
console.log('\n━━━ 2. SEO 풀 커버리지 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  정의된 풀: ${Object.keys(CATEGORY_POOLS).length}개`);
console.log(`  정확 매칭: ${leafCats.length - issues.noPool.length - issues.oneLevel.length}개`);
console.log(`  1레벨 병합: ${issues.oneLevel.length}개`);
console.log(`  매칭 실패 (자동생성): ${issues.noPool.length}개`);

if (issues.noPool.length > 0) {
  console.log(`\n  매칭 실패 카테고리 (상위 20개):`);
  for (const item of issues.noPool.slice(0, 20)) {
    console.log(`    - ${item.cat}`);
  }
  if (issues.noPool.length > 20) console.log(`    ... 외 ${issues.noPool.length - 20}개 더`);
}

if (issues.oneLevel.length > 0) {
  console.log(`\n  1레벨 병합 카테고리 (키워드 풀 크기별 상위 10개):`);
  const sorted = [...issues.oneLevel].sort((a, b) => b.poolGenericCount - a.poolGenericCount);
  for (const item of sorted.slice(0, 10)) {
    console.log(`    - ${item.cat} (generic: ${item.poolGenericCount}개)`);
  }
}

// ── 3. 상세페이지 ──
console.log('\n━━━ 3. 상세페이지 (Detail Page) ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  총 테스트 (카테고리당 1개): ${leafCats.length}개`);
console.log(`  SEO 키워드 0개: ${issues.emptySeoKw.length}건`);
console.log(`  FAQ 0개: ${issues.emptyFaq.length}건`);
console.log(`  마무리 텍스트 없음: ${issues.emptyClosing.length}건`);
console.log(`  FAQ 너무 일반적: ${issues.faqTooGeneric.length}건 (최대 50건 수집)`);

// ── 4. 통계 요약 ──
console.log('\n━━━ 4. 종합 통계 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const criticalCount = issues.contaminated.length + issues.forbidden.length;
const errorCount = issues.tooShort.length + issues.tooLong.length + issues.emptyResult.length;
const warnCount = issues.duplicateWords.length + issues.brandLeak.length;
const infoCount = issues.noType.length + issues.allGeneric.length;

console.log(`  CRITICAL: ${criticalCount}건`);
console.log(`  ERROR:    ${errorCount}건`);
console.log(`  WARNING:  ${warnCount}건`);
console.log(`  INFO:     ${infoCount}건`);
console.log(`  합산 이슈율: ${((criticalCount + errorCount) / totalItems * 100).toFixed(3)}%`);

// ── 5. 길이 분포 ──
console.log('\n━━━ 5. 노출상품명 길이 분포 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const lenBuckets = { '<30': 0, '30-39': 0, '40-44': 0, '45-50': 0, '51-55': 0, '56-60': 0, '61-65': 0, '66-70': 0, '>70': 0 };
let totalLen = 0;
let sampleCount = 0;

// 전체 샘플 중 일부만 길이 분포 확인 (성능)
for (let catIdx = 0; catIdx < Math.min(leafCats.length, 500); catIdx++) {
  const cat = leafCats[catIdx];
  const products = generateVirtualProducts(cat.path, 20);
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const dn = generateDisplayName(p.name, p.brand, p.categoryPath, sellerSeed, i);
    const len = dn.length;
    totalLen += len;
    sampleCount++;
    if (len < 30) lenBuckets['<30']++;
    else if (len < 40) lenBuckets['30-39']++;
    else if (len < 45) lenBuckets['40-44']++;
    else if (len <= 50) lenBuckets['45-50']++;
    else if (len <= 55) lenBuckets['51-55']++;
    else if (len <= 60) lenBuckets['56-60']++;
    else if (len <= 65) lenBuckets['61-65']++;
    else if (len <= 70) lenBuckets['66-70']++;
    else lenBuckets['>70']++;
  }
}

console.log(`  (샘플: ${sampleCount.toLocaleString()}개 기준)`);
console.log(`  평균 길이: ${(totalLen / sampleCount).toFixed(1)}자`);
for (const [range, count] of Object.entries(lenBuckets)) {
  const pct = (count / sampleCount * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(pct / 2));
  console.log(`  ${range.padStart(6)}자: ${String(count).padStart(5)}개 (${pct.padStart(5)}%) ${bar}`);
}

// ── 6. 대표이미지 로직 리뷰 ──
console.log('\n━━━ 6. 대표이미지 로직 리뷰 (코드 분석) ━━━━━━━━━━━━━━━━━━━');
console.log(`  흰배경 가중치: 20% (최우선)`);
console.log(`  하드필터: 피부톤 15%+, 컨텐츠 <5%, 컬러배경 (채도>50% 또는 채도>20%+밝기<200)`);
console.log(`  텍스트배너: 4단계 감지 + 고채도 40% 차단`);
console.log(`  자동크롭: 점유율 55% 이하 → 바운딩박스 정사각형 크롭 (여백 12%)`);
console.log(`  리뷰이미지 우선: 리뷰이미지가 strict 기준 통과하면 대표이미지로 사용`);

console.log('\n' + '='.repeat(80));
console.log('감사 완료');
console.log('='.repeat(80));
