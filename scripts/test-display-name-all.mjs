// 전체 카테고리 노출상품명 종합 테스트
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
    if (seen.has(lower)) return false; seen.add(lower); return true;
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
  if (bestScore >= 1) {
    const merged = { generic: [], ingredients: [], features: [] };
    const seen = { generic: new Set(), ingredients: new Set(), features: new Set() };
    for (const key of Object.keys(CATEGORY_POOLS)) {
      if (key.split('>')[0].trim() === segments[0]) {
        const pool = CATEGORY_POOLS[key];
        for (const g of pool.generic) { if (!seen.generic.has(g.toLowerCase())) { seen.generic.add(g.toLowerCase()); merged.generic.push(g); } }
        for (const ii of pool.ingredients) { if (!seen.ingredients.has(ii.toLowerCase())) { seen.ingredients.add(ii.toLowerCase()); merged.ingredients.push(ii); } }
        for (const f of pool.features) { if (!seen.features.has(f.toLowerCase())) { seen.features.add(f.toLowerCase()); merged.features.push(f); } }
      }
    }
    return merged;
  }
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
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (classified.has(lower)) continue;
    if (ORIGINS.has(lower) || ORIGINS.has(token)) { result.origin.push(token); classified.add(lower); continue; }
    let isType = false;
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === lower)) { result.type.push(token); classified.add(lower); isType = true; break; }
    }
    if (isType) continue;
    if (ingredientSet.has(lower)) { result.ingredients.push(token); classified.add(lower); continue; }
    if (featureSet.has(lower)) { result.features.push(token); classified.add(lower); continue; }
    if (lower === brandLower || brandLower.includes(lower)) continue;
    result.descriptors.push(token); classified.add(lower);
  }
  // Pass 3a: ORIGIN + TYPE/FEATURE compound decomposition
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
            foundType = true; break;
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
  // Pass 3b: FEATURE/INGREDIENT + TYPE compound decomposition ("보습크림" → "보습" + "크림")
  const descriptorsCopy2 = [...result.descriptors];
  for (const desc of descriptorsCopy2) {
    const descLower = desc.toLowerCase();
    let found = false;
    for (let splitAt = 1; splitAt < descLower.length && !found; splitAt++) {
      const suffix = descLower.slice(splitAt);
      const prefix = descLower.slice(0, splitAt);
      for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
        if (synonyms.some(s => s.toLowerCase() === suffix)) {
          if (featureSet.has(prefix) || ingredientSet.has(prefix)) {
            const prefixOriginal = desc.slice(0, splitAt);
            const suffixOriginal = desc.slice(splitAt);
            if (featureSet.has(prefix) && !classified.has(prefix)) { result.features.push(prefixOriginal); classified.add(prefix); }
            else if (ingredientSet.has(prefix) && !classified.has(prefix)) { result.ingredients.push(prefixOriginal); classified.add(prefix); }
            if (!classified.has(suffix)) { result.type.push(suffixOriginal); classified.add(suffix); }
            const idx = result.descriptors.indexOf(desc);
            if (idx >= 0) result.descriptors.splice(idx, 1);
            found = true; break;
          }
        }
      }
    }
  }
  return result;
}
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
  if (classified.type.length > 0 && classified.ingredients.length > 0) {
    const compoundCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < compoundCount; i++) {
      const t = classified.type[Math.floor(rng() * classified.type.length)];
      const ingr = classified.ingredients[Math.floor(rng() * classified.ingredients.length)];
      const compound = rng() < 0.5 ? `${ingr}${t}` : `${t}${ingr}`;
      if (!usedWords.has(compound.toLowerCase()) && compound.length <= 12) { allWords.push(compound); usedWords.add(compound.toLowerCase()); }
    }
  }
  for (let i = allWords.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [allWords[i], allWords[j]] = [allWords[j], allWords[i]]; }
  allWords.push(...classified.specs.filter(s => !usedWords.has(s.toLowerCase())));
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

// ============================================================
// 전체 카테고리 테스트 케이스
// ============================================================
const allTests = [
  // ---- 과일 ----
  { cat: '식품>신선식품>과일류>과일>사과', name: '청송 사과 부사 5kg 가정용', brand: '청송농협' },
  { cat: '식품>신선식품>과일류>과일>배', name: '나주배 신고배 선물용 7.5kg 특대과', brand: '나주농협' },
  { cat: '식품>신선식품>과일류>과일>감귤', name: '제주 감귤 노지감귤 10kg 가정용', brand: '제주과수원' },
  { cat: '식품>신선식품>과일류>과일>포도', name: '경북 샤인머스캣 포도 2kg 선물용', brand: '김천포도' },
  { cat: '식품>신선식품>과일류>과일>수박', name: '고창 수박 씨없는수박 8kg', brand: '고창농산' },
  { cat: '식품>신선식품>과일류>과일>딸기', name: '논산 딸기 설향 500g 산지직송', brand: '논산딸기' },
  { cat: '식품>신선식품>과일류>과일>복숭아', name: '경산 복숭아 백도 4.5kg 가정용', brand: '경산농산' },
  { cat: '식품>신선식품>과일류>과일>참외', name: '성주 참외 꿀참외 10kg 가정용', brand: '성주참외' },
  { cat: '식품>신선식품>과일류>과일>체리', name: '미국 체리 레이니어 1kg 냉장', brand: '프루타' },
  { cat: '식품>신선식품>과일류>과일>블루베리', name: '국내산 블루베리 유기농 500g', brand: '산지농원' },
  { cat: '식품>신선식품>과일류>과일>망고', name: '태국 망고 애플망고 2kg 선물용', brand: '트로피칼' },

  // ---- 채소 ----
  { cat: '식품>신선식품>채소>엽채류', name: '유기농 상추 로메인 500g 무농약', brand: '초록농원' },
  { cat: '식품>신선식품>채소>근채류', name: '국내산 당근 1kg 무농약 GAP인증', brand: '청정원' },
  { cat: '식품>신선식품>채소>과채류', name: '토마토 방울토마토 대추토마토 2kg', brand: '해남농원' },

  // ---- 수산물 ----
  { cat: '식품>신선식품>수산물>생선류', name: '통영 참돔 자연산 1kg 냉장', brand: '통영수산' },
  { cat: '식품>신선식품>수산물>조개/갑각류', name: '완도 전복 활전복 1kg 10마리', brand: '완도수산' },

  // ---- 정육/계란 ----
  { cat: '식품>신선식품>정육/계란>소고기', name: '한우 등심 1등급 500g 냉장', brand: '횡성한우' },
  { cat: '식품>신선식품>정육/계란>돼지고기', name: '국내산 삼겹살 구이용 1kg 냉장', brand: '포크밸리' },
  { cat: '식품>신선식품>정육/계란>닭고기', name: '무항생제 닭가슴살 1kg 냉장', brand: '하림' },
  { cat: '식품>신선식품>정육/계란>계란', name: '동물복지 유정란 30구 무항생제', brand: '자연방사' },

  // ---- 쌀/잡곡 ----
  { cat: '식품>신선식품>쌀/잡곡', name: '이천쌀 햅쌀 10kg 진공포장', brand: '이천농협' },

  // ---- 건강식품 ----
  { cat: '식품>건강식품>비타민', name: '비타민C 1000mg 고함량 365정', brand: '뉴트리원' },
  { cat: '식품>건강식품>오메가3', name: 'rTG오메가3 초임계 EPA DHA 180캡슐', brand: '닥터스' },
  { cat: '식품>건강식품>유산균', name: '유산균 프로바이오틱스 500억 60포', brand: '종근당' },
  { cat: '식품>건강식품>콜라겐', name: '저분자 피쉬콜라겐 히알루론산 90포', brand: '에버콜라겐' },
  { cat: '식품>건강식품>홍삼', name: '고려홍삼 6년근 진액 30포', brand: '정관장' },
  { cat: '식품>건강식품>프로틴', name: 'WPI 분리유청 프로틴 초코맛 2kg', brand: '옵티멈' },
  { cat: '식품>건강식품>다이어트', name: '가르시니아 다이어트 체지방 60정', brand: '그린스토어' },

  // ---- 뷰티 ----
  { cat: '뷰티>스킨>크림', name: '세라마이드 보습크림 콜라겐 50ml', brand: '닥터지' },
  { cat: '뷰티>스킨>에센스/세럼', name: '비타민C 세럼 브라이트닝 30ml', brand: '클레어스' },
  { cat: '뷰티>스킨>선케어', name: 'SPF50 선크림 톤업 워터프루프 50ml', brand: '라운드랩' },
  { cat: '뷰티>헤어>샴푸', name: '두피케어 탈모방지 샴푸 약산성 500ml', brand: '닥터포헤어' },
  { cat: '뷰티>바디>샤워/입욕용품>바디워시', name: '알로에 바디워시 보습 약산성 1000ml', brand: '해피바스' },

  // ---- 생활용품 ----
  { cat: '생활용품>세제>세탁세제', name: '고농축 세탁세제 액체 무향 3L', brand: '퍼실' },
  { cat: '생활용품>욕실용품', name: '전동칫솔 초음파 칫솔 화이트', brand: '필립스' },

  // ---- 가전/디지털 ----
  { cat: '가전/디지털>청소가전', name: '무선청소기 BLDC 스틱 핸디 겸용', brand: '다이슨' },
  { cat: '가전/디지털>주방가전', name: '에어프라이어 대용량 12L 스테인리스', brand: '쿠쿠' },

  // ---- 패션 ----
  { cat: '패션의류잡화>여성의류', name: '여성 오버핏 맨투맨 캐주얼 프리사이즈', brand: '지오다노' },

  // ---- 가구 ----
  { cat: '가구/인테리어>침대/매트리스', name: '독립스프링 매트리스 퀸 호텔용', brand: '시몬스' },

  // ---- 풀 없는 카테고리 (폴백 테스트) ----
  { cat: '완구/취미>레고/블록', name: '레고 테크닉 자동차 42143', brand: '레고' },
  { cat: '반려동물>강아지>사료', name: '강아지사료 연어 그레인프리 6kg', brand: '로얄캐닌' },
];

console.log('=== 전체 카테고리 노출상품명 테스트 ===\n');

let issues = [];

for (let i = 0; i < allTests.length; i++) {
  const tc = allTests[i];
  const classified = classifyTokens(tc.name, tc.cat, tc.brand);
  const displayName = generateDisplayName(tc.name, tc.brand, tc.cat, 'seller_test', i);

  // 카테고리 핵심 키워드 추출 (마지막 세그먼트)
  const catSegments = tc.cat.split('>');
  const catLeaf = catSegments[catSegments.length - 1].trim();

  // generic pool에서 오염 여부 검사
  // 다른 카테고리의 generic 키워드가 혼입되었는지 확인
  const pool = findBestPool(tc.cat);
  const poolGenerics = new Set((pool?.generic || []).map(g => g.toLowerCase()));
  const nameWords = displayName.toLowerCase().split(/\s+/);

  // 다른 카테고리의 핵심 단어가 들어갔는지 검사
  const wrongCatWords = [];
  const otherCatKeywords = {
    '사과': ['샴푸','세럼','크림','세제','청소기','에어프라이어','매트리스','소파','의자'],
    '배': ['샴푸','크림','사과류','에어프라이어'],
    '감귤': ['샴푸','크림','사과류'],
    '크림': ['사과','포도','감귤','삼겹살','세제'],
    '샴푸': ['사과','크림류','포도','세제','에어프라이어'],
    '세탁세제': ['사과','크림','샴푸','에어프라이어'],
    '청소가전': ['사과','크림','샴푸','세제류'],
  };

  const checkWords = otherCatKeywords[catLeaf] || [];
  for (const w of checkWords) {
    if (displayName.toLowerCase().includes(w.replace('류','')) && !tc.name.toLowerCase().includes(w.replace('류',''))) {
      wrongCatWords.push(w);
    }
  }

  const hasIssue = wrongCatWords.length > 0;
  const typeFound = classified.type.length > 0;
  const originFound = classified.origin.length > 0;

  // 요약 표시
  const statusIcon = hasIssue ? 'XX' : 'OK';
  const typeIcon = typeFound ? 'O' : 'X';

  console.log(`[${statusIcon}] ${tc.cat.padEnd(45)} TYPE:${typeIcon}`);
  console.log(`     원본: ${tc.name}`);
  console.log(`     생성: ${displayName}`);
  if (classified.type.length > 0) console.log(`     TYPE=[${classified.type}] FEAT=[${classified.features.slice(0,4)}] ORIG=[${classified.origin}]`);
  else console.log(`     TYPE=없음! FEAT=[${classified.features.slice(0,4)}] ORIG=[${classified.origin}] DESC=[${classified.descriptors.slice(0,3)}]`);
  if (hasIssue) {
    console.log(`     *** 오염 감지: [${wrongCatWords}] ***`);
    issues.push({ cat: tc.cat, name: tc.name, wrong: wrongCatWords });
  }
  console.log('');
}

console.log('========================================');
console.log(`총 ${allTests.length}개 테스트 | 오염 ${issues.length}개`);
if (issues.length > 0) {
  console.log('\n오염 목록:');
  for (const iss of issues) console.log(`  - ${iss.cat}: "${iss.wrong}" 혼입`);
}

// TYPE 미감지 목록
const noType = allTests.filter((tc, i) => {
  const classified = classifyTokens(tc.name, tc.cat, tc.brand);
  return classified.type.length === 0;
});
if (noType.length > 0) {
  console.log(`\nTYPE 미감지 (${noType.length}개):`);
  for (const tc of noType) {
    console.log(`  - ${tc.cat}: "${tc.name}"`);
  }
}
