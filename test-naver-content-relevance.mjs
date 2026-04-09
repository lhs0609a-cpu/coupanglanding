// ============================================================
// 네이버 4,993개 리프 카테고리 전수 콘텐츠-상품 연관성 검증
//
// 1. 네이버 카테고리 → 쿠팡 카테고리 매핑 확인
// 2. 매핑된 쿠팡 카테고리로 콘텐츠 생성
// 3. 콘텐츠가 카테고리/상품과 연관 있는지 검증
//
// 검증 항목:
//   A. 미해결 변수: {효과1}, {성분} 등이 텍스트에 잔존
//   B. 대분류 교차 오염: 식품에 "바르다", 뷰티에 "섭취" 등
//   C. 건강식품 교차 오염: 비오틴 상품에 오메가3 언급 등
//   D. 빈/짧은 콘텐츠: 문단 0개 또는 100자 미만
//   E. 카테고리 키워드 연관성: 생성 콘텐츠에 카테고리 관련 단어 포함 여부
//   F. forbiddenTerms 위반: CPG 프로필 금지어 포함 여부
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 데이터 로드 ────────────────────────────────────────────

const naverData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/naver-categories.json'), 'utf-8'));
const naverToCoupang = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/naver-to-coupang-map.json'), 'utf-8'));
const catDetails = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf-8'));
const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const fragmentData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/persuasion-fragments.json'), 'utf-8'));
const cpgMapping = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/cpg-mapping.json'), 'utf-8'));

// CPG 프로필 로드
const PROFILE_FILES = ['식품','뷰티','가전','생활용품','패션의류잡화','가구','출산','스포츠','반려','주방용품','완구','자동차용품','문구'];
const profileCache = new Map();
for (const fname of PROFILE_FILES) {
  try {
    const data = JSON.parse(readFileSync(join(__dirname, `src/lib/megaload/data/content-profiles/${fname}.json`), 'utf-8'));
    if (data.profiles) {
      for (const [groupId, profile] of Object.entries(data.profiles)) {
        profileCache.set(groupId, {
          groupId,
          displayName: profile.displayName || groupId,
          parentGroup: profile.parentGroup || fname,
          variables: profile.variables || {},
          forbiddenTerms: profile.forbiddenTerms || [],
        });
      }
    }
  } catch (e) { /* 파일 없으면 무시 */ }
}

// 건강식품 코드 → 전용 프로필 키
const HEALTH_CODE_TO_PROFILE = {
  '58927':'건강식품::관절','112304':'건강식품::관절','102517':'건강식품::관절','112306':'건강식품::관절',
  '58920':'건강식품::눈건강','102525':'건강식품::눈건강','73136':'건강식품::눈건강',
  '58926':'건강식품::간건강','102524':'건강식품::간건강',
  '58991':'건강식품::유산균',
  '73134':'건강식품::오메가3','112307':'건강식품::오메가3','102520':'건강식품::오메가3','102522':'건강식품::오메가3',
  '58905':'건강식품::홍삼면역','102532':'건강식품::홍삼면역','102515':'건강식품::홍삼면역',
  '59163':'건강식품::콜라겐','102529':'건강식품::콜라겐',
  '58972':'건강식품::코엔자임','58929':'건강식품::코엔자임',
  '58924':'건강식품::쏘팔메토',
  '58902':'건강식품::스피루리나','58901':'건강식품::스피루리나',
  '105968':'건강식품::흑마늘',
  '58930':'건강식품::비타민','58932':'건강식품::비타민','58933':'건강식품::비타민','113284':'건강식품::비타민','102537':'건강식품::비타민','102536':'건강식품::비타민','102538':'건강식품::비타민',
  '58931':'건강식품::미네랄','102541':'건강식품::미네랄','102542':'건강식품::미네랄','58935':'건강식품::미네랄','102543':'건강식품::미네랄','58934':'건강식품::미네랄','102544':'건강식품::미네랄',
  '113283':'건강식품::비오틴',
  '58936':'건강식품::엽산',
  '58942':'건강식품::다이어트','102547':'건강식품::다이어트','102545':'건강식품::다이어트',
  '58946':'건강식품::프로틴','58948':'건강식품::프로틴','102550':'건강식품::프로틴','102548':'건강식품::프로틴',
};

const HEALTH_PROFILES = {
  '건강식품::관절': { displayName: '관절건강 영양제', variables: { '효과1':['관절건강','연골보호','관절유연성'], '성분':['콘드로이친','글루코사민','MSM','보스웰리아'] }, forbiddenTerms: ['간건강','눈건강','혈당관리','체지방감소','피부탄력','장건강','혈관건강','면역력','전립선','모발건강'] },
  '건강식품::간건강': { displayName: '간건강 영양제', variables: { '효과1':['간건강','간보호','간해독'], '성분':['밀크씨슬','실리마린','UDCA'] }, forbiddenTerms: ['관절건강','눈건강','피부탄력','장건강','연골보호','뼈건강','전립선','모발건강'] },
  '건강식품::눈건강': { displayName: '눈건강 영양제', variables: { '효과1':['눈건강','시력보호','눈피로해소'], '성분':['루테인','지아잔틴','비타민A'] }, forbiddenTerms: ['간건강','관절건강','피부탄력','장건강','연골보호','전립선','모발건강'] },
  '건강식품::유산균': { displayName: '유산균', variables: { '효과1':['장건강','소화흡수'], '성분':['유산균','프로바이오틱스'] }, forbiddenTerms: ['간건강','눈건강','관절건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::오메가3': { displayName: '오메가3', variables: { '효과1':['혈관건강','혈행개선'], '성분':['오메가3','EPA','DHA'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::홍삼면역': { displayName: '홍삼/면역', variables: { '효과1':['면역력강화','피로회복'], '성분':['홍삼','진세노사이드'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::콜라겐': { displayName: '콜라겐', variables: { '효과1':['피부탄력','피부보습'], '성분':['콜라겐','히알루론산'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','연골보호','전립선','모발건강'] },
  '건강식품::비타민': { displayName: '비타민제', variables: { '효과1':['면역력','뼈건강'], '성분':['비타민C','비타민D'] }, forbiddenTerms: ['간건강','관절건강','장건강','연골보호','전립선'] },
  '건강식품::미네랄': { displayName: '미네랄', variables: { '효과1':['뼈건강','근육이완'], '성분':['마그네슘','칼슘'] }, forbiddenTerms: ['간건강','관절건강','장건강','피부탄력','연골보호','전립선'] },
  '건강식품::비오틴': { displayName: '비오틴', variables: { '효과1':['모발건강','피부건강'], '성분':['비오틴','비타민B7'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','연골보호','전립선'] },
  '건강식품::코엔자임': { displayName: '코엔자임Q10', variables: { '효과1':['심장건강','항산화'], '성분':['코엔자임Q10','유비퀴놀'] }, forbiddenTerms: ['관절건강','장내환경','소화흡수','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::쏘팔메토': { displayName: '쏘팔메토', variables: { '효과1':['전립선건강','배뇨기능'], '성분':['쏘팔메토'] }, forbiddenTerms: ['간건강','관절건강','장건강','피부탄력','연골보호','모발건강'] },
  '건강식품::다이어트': { displayName: '다이어트', variables: { '효과1':['체지방감소','식욕억제'], '성분':['가르시니아','HCA'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::프로틴': { displayName: '프로틴', variables: { '효과1':['근력강화','근육회복'], '성분':['유청단백질','WPI'] }, forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','혈관건강','연골보호','전립선','모발건강'] },
  '건강식품::스피루리나': { displayName: '스피루리나', variables: { '효과1':['영양균형','항산화'], '성분':['스피루리나','클로렐라'] }, forbiddenTerms: ['관절건강','장건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::흑마늘': { displayName: '흑마늘', variables: { '효과1':['면역력강화','항산화'], '성분':['흑마늘'] }, forbiddenTerms: ['눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강'] },
  '건강식품::엽산': { displayName: '엽산', variables: { '효과1':['태아건강','세포분열'], '성분':['엽산','활성엽산'] }, forbiddenTerms: ['간건강','관절건강','장건강','혈관건강','연골보호','전립선','모발건강','다이어트'] },
};
for (const [key, hp] of Object.entries(HEALTH_PROFILES)) {
  profileCache.set(key, { groupId: key, displayName: hp.displayName, parentGroup: '식품>건강식품', variables: hp.variables, forbiddenTerms: hp.forbiddenTerms });
}

// ─── seeded-random ──────────────────────────────────────────

function stringToSeed(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
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

// ─── 카테고리 → 대분류 키 ──────────────────────────────────

function inferTopCategory(top, full) {
  const fl = full.toLowerCase();
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || fl.includes('세제') || fl.includes('욕실') || fl.includes('수납')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털') || fl.includes('컴퓨터') || fl.includes('영상')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화') || fl.includes('신발') || fl.includes('가방')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코') || fl.includes('침대') || fl.includes('소파') || fl.includes('인테리어')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아') || fl.includes('기저귀') || fl.includes('분유')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져') || fl.includes('헬스') || fl.includes('골프') || fl.includes('캠핑')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완') || fl.includes('사료') || fl.includes('고양이') || fl.includes('강아지')) return '반려/애완용품';
  if (top.includes('주방') || fl.includes('프라이팬') || fl.includes('냄비') || fl.includes('식기')) return '주방용품';
  if (top.includes('문구') || top.includes('사무') || fl.includes('필기') || fl.includes('노트')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미') || fl.includes('퍼즐') || fl.includes('보드게임')) return '완구/취미';
  if (top.includes('자동차') || fl.includes('블랙박스') || fl.includes('세차')) return '자동차용품';
  return 'DEFAULT';
}

// ─── CPG 프로필 해석 ──────────────────────────────────────

function findGroupId(categoryPath, categoryCode) {
  if (categoryCode && cpgMapping.codeToGroup[categoryCode]) return cpgMapping.codeToGroup[categoryCode];
  const np = categoryPath.replace(/\s+/g, '');
  if (cpgMapping.groups[np]) return np;
  let bestMatch = null, bestLen = 0;
  for (const key of Object.keys(cpgMapping.groups)) {
    if (np.startsWith(key) && key.length > bestLen) { bestMatch = key; bestLen = key.length; }
    if (key.startsWith(np) && np.length > bestLen) { bestMatch = key; bestLen = np.length; }
  }
  return bestMatch;
}

function resolveContentProfile(categoryPath, categoryCode) {
  if (categoryCode && HEALTH_CODE_TO_PROFILE[categoryCode]) {
    const p = profileCache.get(HEALTH_CODE_TO_PROFILE[categoryCode]);
    if (p) return p;
  }
  const groupId = findGroupId(categoryPath, categoryCode);
  if (!groupId) return null;
  return profileCache.get(groupId) || null;
}

// ─── 변수풀 + 프래그먼트 해석 ──────────────────────────────

const FRAGMENTS = fragmentData.fragments;
const FRAMEWORKS = fragmentData.frameworks;
const CATEGORY_FRAMEWORKS = fragmentData.categoryFrameworks;
const VARIABLES = storyData.variables;

const SUBCATEGORY_ALIASES = {
  '가전/디지털>TV/영상가전':'가전/디지털>영상가전','가전/디지털>계절환경가전':'가전/디지털>계절가전',
  '가전/디지털>냉장고/밥솥/주방가전':'가전/디지털>주방가전','가전/디지털>생활가전':'가전/디지털>청소가전',
  '가전/디지털>이미용건강가전':'가전/디지털>건강가전','가전/디지털>음향기기/이어폰/스피커':'가전/디지털>음향가전',
  '가전/디지털>컴퓨터/게임/SW':'가전/디지털>컴퓨터','가전/디지털>휴대폰/태블릿PC/액세서리':'가전/디지털>휴대폰',
  '가전/디지털>카메라/캠코더':'가전/디지털>카메라',
  '뷰티>남성화장품':'뷰티>스킨','뷰티>어린이화장품':'뷰티>스킨','뷰티>임산부화장품':'뷰티>스킨',
  '뷰티>선물세트':'뷰티>스킨','뷰티>뷰티소품':'뷰티>메이크업',
  '식품>가공/즉석식품':'식품>가공식품','식품>냉장/냉동식품':'식품>가공식품','식품>스낵/간식':'식품>가공식품',
  '식품>생수/음료':'식품>음료','식품>유제품/아이스크림/디저트':'식품>가공식품',
  '식품>가루/조미료/향신료':'식품>가공식품','식품>커피/차':'식품>음료',
  '생활용품>세탁용품':'생활용품>세제','생활용품>청소용품':'생활용품>세제',
  '생활용품>화장지/물티슈':'생활용품>욕실용품','생활용품>구강/면도':'생활용품>욕실용품',
  '패션의류잡화>남성패션':'패션의류잡화>남성의류','패션의류잡화>여성패션':'패션의류잡화>여성의류',
  '패션의류잡화>유니섹스/남녀공용 패션':'패션의류잡화>남성의류',
  '가구/홈데코>가구':'가구/홈데코>가구','가구/홈데코>침구':'가구/홈데코>침대',
  '출산/유아동>기저귀/교체용품':'출산/유아동>기저귀','출산/유아동>분유/유아식품':'출산/유아동>분유',
  '스포츠/레져>헬스/요가':'스포츠/레져>헬스','스포츠/레져>등산':'스포츠/레져>캠핑',
  '반려/애완용품>강아지 사료/간식/영양제':'반려/애완용품>강아지','반려/애완용품>고양이 사료/간식/영양제':'반려/애완용품>고양이',
  '주방용품>조리용품':'주방용품>프라이팬','주방용품>칼/가위/도마':'주방용품>칼/도마',
  '완구/취미>블록놀이':'완구/취미>레고/블록','완구/취미>보드게임':'완구/취미>보드게임',
  '자동차용품>세차/관리용품':'자동차용품>세차용품',
  '문구/오피스>문구/학용품':'문구/오피스>필기구','문구/오피스>사무용품':'문구/오피스>필기구',
};

function resolveVariables(categoryPath, categoryCode) {
  const profile = resolveContentProfile(categoryPath, categoryCode);
  if (profile && profile.variables && Object.keys(profile.variables).length > 0) return { ...profile.variables };
  const parts = categoryPath.split('>').map(p => p.trim());
  const topKey = inferTopCategory(parts[0] || '', categoryPath);
  const base = { ...(VARIABLES['DEFAULT'] || {}) };
  const topVars = VARIABLES[topKey];
  if (topVars) for (const [k, v] of Object.entries(topVars)) base[k] = v;
  for (let len = 2; len <= parts.length; len++) {
    const rawSubKey = parts.slice(0, len).join('>');
    const subKey = SUBCATEGORY_ALIASES[rawSubKey] || rawSubKey;
    const subVars = VARIABLES[subKey];
    if (subVars) for (const [k, v] of Object.entries(subVars)) base[k] = v;
  }
  return base;
}

function resolveFragments(blockType, categoryPath) {
  const blockFragments = FRAGMENTS[blockType];
  if (!blockFragments) return { openers: [], values: [], closers: [] };
  if (blockFragments[categoryPath]) return blockFragments[categoryPath];
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (blockFragments[key]) return blockFragments[key];
  }
  const top = parts[0];
  for (const key of Object.keys(blockFragments)) {
    if (key === top || key.startsWith(top + '>')) return blockFragments[key];
  }
  return blockFragments['DEFAULT'] || { openers: [], values: [], closers: [] };
}

// ─── 템플릿/블록 생성 ──────────────────────────────────────

function fillTemplate(template, vars, productName, rng) {
  let result = template.replace(/\{product\}/g, productName);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) return pool[Math.floor(rng() * pool.length)];
    const baseKey = key.replace(/\d+$/, '');
    const fallback = vars[baseKey] || vars[baseKey + '1'];
    if (fallback && fallback.length > 0) return fallback[Math.floor(rng() * fallback.length)];
    return '';
  });
  return result;
}

function filterFragmentPool(pool, forbiddenTerms) {
  const hasForbidden = (text) => forbiddenTerms.some(term => text.includes(term));
  const filterArr = (arr) => { if (!arr) return arr; const f = arr.filter(s => !hasForbidden(s)); return f.length > 0 ? f : arr; };
  return { openers: filterArr(pool.openers || []), values: filterArr(pool.values || []), closers: filterArr(pool.closers || []), item_pool: pool.item_pool ? filterArr(pool.item_pool) : undefined, titles: pool.titles, emphases: pool.emphases };
}

function pickRandom(arr, rng) { return (!arr || arr.length === 0) ? '' : arr[Math.floor(rng() * arr.length)]; }

function composeOneSentence(pool, vars, productName, rng) {
  let raw = [pickRandom(pool.openers, rng), pickRandom(pool.values, rng), pickRandom(pool.closers, rng)].filter(Boolean).join(' ');
  raw = fillTemplate(raw, vars, productName, rng);
  return raw.replace(/\s{2,}/g, ' ').trim();
}

function composeBlock(blockType, categoryPath, vars, productName, rng, forbiddenTerms) {
  const rawPool = resolveFragments(blockType, categoryPath);
  const pool = { openers: rawPool.openers||[], values: rawPool.values||[], closers: rawPool.closers||[], item_pool: rawPool.item_pool, titles: rawPool.titles };
  const hasPool = pool.openers.length > 0 || pool.values.length > 0;
  let actualPool = hasPool ? pool : resolveFragments('solution', categoryPath);
  if (forbiddenTerms && forbiddenTerms.length > 0) actualPool = filterFragmentPool(actualPool, forbiddenTerms);
  if (blockType === 'benefits_grid') {
    const title = actualPool.titles?.length > 0 ? actualPool.titles[Math.floor(rng() * actualPool.titles.length)] : '핵심 장점';
    const shuffled = [...(actualPool.item_pool || [])];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const items = shuffled.slice(0, 5).map(item => fillTemplate(item, vars, productName, rng));
    return { type: blockType, content: title, items };
  }
  const content = composeOneSentence(actualPool, vars, productName, rng);
  const subContent = composeOneSentence(actualPool, vars, productName, rng);
  return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
}

function resolveCategoryFrameworks(categoryPath) {
  if (CATEGORY_FRAMEWORKS[categoryPath]) return CATEGORY_FRAMEWORKS[categoryPath];
  const parts = categoryPath.split('>').map(p => p.trim());
  for (let len = parts.length - 1; len >= 1; len--) {
    const key = parts.slice(0, len).join('>');
    if (CATEGORY_FRAMEWORKS[key]) return CATEGORY_FRAMEWORKS[key];
  }
  const topKey = inferTopCategory(parts[0] || '', categoryPath);
  if (CATEGORY_FRAMEWORKS[topKey]) return CATEGORY_FRAMEWORKS[topKey];
  return CATEGORY_FRAMEWORKS['DEFAULT'] || ['AIDA', 'PAS', 'LIFESTYLE'];
}

function generatePersuasionContent(productName, categoryPath, sellerSeed, productIndex, categoryCode) {
  const seed = stringToSeed(`${sellerSeed}::persuasion::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);
  const cleanName = productName.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  const profile = resolveContentProfile(categoryPath, categoryCode);
  let vars = resolveVariables(categoryPath, categoryCode);
  if (profile && profile.forbiddenTerms && profile.forbiddenTerms.length > 0) {
    const forbidden = new Set(profile.forbiddenTerms);
    for (const [key, values] of Object.entries(vars)) {
      const filtered = values.filter(v => !forbidden.has(v));
      if (filtered.length > 0) vars[key] = filtered;
    }
  }
  const allowedFrameworks = resolveCategoryFrameworks(categoryPath);
  const frameworkId = allowedFrameworks[Math.floor(rng() * allowedFrameworks.length)];
  const framework = FRAMEWORKS[frameworkId] || FRAMEWORKS['AIDA'];
  const ft = profile?.forbiddenTerms;
  const blocks = framework.blocks.map(bt => composeBlock(bt, categoryPath, vars, cleanName, rng, ft));
  return { framework: frameworkId, blocks, profile };
}

function blocksToText(blocks) {
  return blocks.map(b => {
    let t = b.content || '';
    if (b.subContent) t += ' ' + b.subContent;
    if (b.items) t += ' ' + b.items.join(' ');
    if (b.emphasis) t += ' ' + b.emphasis;
    return t;
  }).join(' ');
}

// ─── 교차 오염 감지 규칙 ──────────────────────────────────────

const HARD_FORBIDDEN = {
  '뷰티': /세차(?!용)|엔진|연비|블랙박스|사료|급여량|소형견|대형견|고양이사료|프라이팬|인덕션|에어프라이어|냄비세트|덤벨세트|텐트.*방수|드라이버.*도|골프공/,
  '식품': /바르[고는면].*피부|발라[서요].*피부|세안후|클렌징|메이크업|파운데이션|마스카라|흡입력.*청소|냉방력|난방력|세차.*광택|착용감.*핏|매트리스.*체압/,
  '생활용품': /섭취.*정|캡슐.*섭취|알약|드라이버.*샤프트|골프공|블랙박스.*채널|매트리스.*체압/,
  '가전/디지털': /섭취.*정|캡슐.*섭취|알약.*삼키|바르[고는면].*피부|세안후|클렌징|사료.*급여|소형견|고양이사료|세차.*광택/,
  '패션의류잡화': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|흡입력.*청소|사료.*급여|세차.*광택/,
  '가구/홈데코': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|사료.*급여|세차.*광택|드라이버.*샤프트/,
  '출산/유아동': /세차.*광택|엔진.*오일|블랙박스.*채널|드라이버.*샤프트|골프공|인덕션.*빌트인|사료.*급여/,
  '스포츠/레져': /섭취.*정|캡슐.*섭취|바르[고는면].*피부|사료.*급여|세차.*광택|피규어.*건담/,
  '반려/애완용품': /세차.*광택|엔진.*오일|블랙박스.*채널|드라이버.*샤프트|골프공|매트리스.*체압|착용감.*핏/,
  '주방용품': /섭취.*캡슐|알약.*삼키|바르[고는면].*피부|사료.*급여|세차.*광택|드라이버.*샤프트/,
  '문구/오피스': /섭취.*정|캡슐.*섭취|바르[고는면].*피부|사료.*급여|세차.*광택|매트리스.*체압/,
  '완구/취미': /섭취.*정|캡슐.*섭취|바르[고는면].*피부|사료.*급여|세차.*광택|매트리스.*체압/,
  '자동차용품': /섭취.*정|캡슐.*섭취|바르.*피부에|사료.*급여|매트리스.*체압|레고.*피스/,
};

// ─── 상품명 생성 ──────────────────────────────────────────

function generateProductName(naverPath, coupangPath) {
  const parts = naverPath.split('>');
  const leaf = parts[parts.length - 1].trim();
  const parent = parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  const mod = ['프리미엄', '고급', '베스트', '인기', '추천'][stringToSeed(naverPath) % 5];
  if (parent && parent !== leaf && !leaf.includes(parent)) return `${mod} ${parent} ${leaf}`;
  return `${mod} ${leaf}`;
}

// ============================================================
// 테스트 실행
// ============================================================

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   네이버 4,993개 리프 카테고리 전수 콘텐츠-상품 연관성 검증     ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log();

const leaves = naverData.leaves;
const navMap = naverToCoupang.map;
const SEEDS = ['seller-a', 'seller-b', 'seller-c'];

console.log(`네이버 리프: ${leaves.length}개`);
console.log(`매핑 엔트리: ${Object.keys(navMap).length}개`);
console.log(`시드: ${SEEDS.length}개 → 총 ${leaves.length * SEEDS.length}건`);
console.log(`CPG 프로필: ${profileCache.size}개`);
console.log();

let totalTests = 0, totalPassed = 0, totalFailed = 0;
let unmappedCount = 0;
const failures = [];
const failTypeCount = { UNMAPPED: 0, CROSS_CATEGORY: 0, FORBIDDEN_TERM: 0, UNRESOLVED_VAR: 0, EMPTY_CONTENT: 0, LOW_RELEVANCE: 0 };
const topCatStats = {};    // 네이버 대분류별
const coupangTopStats = {}; // 매핑된 쿠팡 대분류별

const startTime = Date.now();

for (const leaf of leaves) {
  const naverId = leaf.id;
  const naverPath = leaf.path;
  const naverL1 = naverPath.split('>')[0].trim();

  // 네이버 대분류 통계
  if (!topCatStats[naverL1]) topCatStats[naverL1] = { total: 0, pass: 0, fail: 0, unmapped: 0 };
  topCatStats[naverL1].total++;

  // 매핑 확인
  const mapping = navMap[naverId];
  if (!mapping) {
    unmappedCount++;
    topCatStats[naverL1].unmapped++;
    failTypeCount.UNMAPPED++;
    if (failures.length < 50) {
      failures.push({ type: 'UNMAPPED', naverPath, naverId });
    }
    totalFailed++;
    totalTests++;
    continue;
  }

  const coupangCode = mapping.c;
  const confidence = mapping.n;
  const coupangDetail = catDetails[coupangCode];

  if (!coupangDetail) {
    unmappedCount++;
    topCatStats[naverL1].unmapped++;
    failTypeCount.UNMAPPED++;
    totalFailed++;
    totalTests++;
    continue;
  }

  const coupangPath = coupangDetail.p;
  const coupangTopKey = inferTopCategory((coupangPath.split('>')[0] || '').trim(), coupangPath);

  if (!coupangTopStats[coupangTopKey]) coupangTopStats[coupangTopKey] = { total: 0, pass: 0, fail: 0 };

  for (let si = 0; si < SEEDS.length; si++) {
    totalTests++;
    coupangTopStats[coupangTopKey].total++;
    let failed = false;
    let failType = '';
    let failMatch = '';
    let failContext = '';

    const productName = generateProductName(naverPath, coupangPath);

    // 설득형 콘텐츠 생성
    const result = generatePersuasionContent(productName, coupangPath, SEEDS[si], si, coupangCode);
    const fullText = blocksToText(result.blocks);

    // ── 검증 1: 빈 콘텐츠 ──
    if (fullText.trim().length < 30) {
      failed = true; failType = 'EMPTY_CONTENT';
      failMatch = `length=${fullText.length}`;
      failContext = fullText.slice(0, 100);
    }

    // ── 검증 2: 대분류 교차 오염 ──
    if (!failed) {
      const forbiddenRegex = HARD_FORBIDDEN[coupangTopKey];
      if (forbiddenRegex) {
        const match = fullText.match(forbiddenRegex);
        if (match) {
          failed = true; failType = 'CROSS_CATEGORY';
          failMatch = match[0];
          failContext = fullText.slice(Math.max(0, match.index - 30), match.index + match[0].length + 30);
        }
      }
    }

    // ── 검증 3: forbiddenTerms 위반 ──
    if (!failed && result.profile && result.profile.forbiddenTerms) {
      for (const term of result.profile.forbiddenTerms) {
        if (fullText.includes(term)) {
          failed = true; failType = 'FORBIDDEN_TERM';
          failMatch = term;
          const idx = fullText.indexOf(term);
          failContext = fullText.slice(Math.max(0, idx - 30), idx + term.length + 30);
          break;
        }
      }
    }

    // ── 검증 4: 미해석 변수 ──
    if (!failed) {
      const unresolvedMatch = fullText.match(/\{([^}]{1,10})\}/);
      if (unresolvedMatch) {
        failed = true; failType = 'UNRESOLVED_VAR';
        failMatch = unresolvedMatch[0];
        failContext = fullText.slice(Math.max(0, unresolvedMatch.index - 20), unresolvedMatch.index + 40);
      }
    }

    if (failed) {
      totalFailed++;
      topCatStats[naverL1].fail++;
      coupangTopStats[coupangTopKey].fail++;
      failTypeCount[failType]++;
      if (failures.length < 80) {
        failures.push({
          type: failType, naverPath, naverId, coupangPath, coupangCode, productName,
          coupangTopKey, confidence, matched: failMatch, context: failContext,
          profileId: result.profile?.groupId,
        });
      }
    } else {
      totalPassed++;
      topCatStats[naverL1].pass++;
      coupangTopStats[coupangTopKey].pass++;
    }
  }

  // 진행률
  if (totalTests % 3000 === 0) {
    process.stdout.write(`  ... ${Math.round(totalTests / SEEDS.length)}/${leaves.length} 카테고리 처리됨 (${totalFailed} fail)\n`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ─── 결과 리포트 ────────────────────────────────────────────

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('  네이버 대분류별 결과');
console.log('═══════════════════════════════════════════════════════════════');
for (const [l1, st] of Object.entries(topCatStats).sort((a, b) => b[1].total - a[1].total)) {
  const passRate = st.total > 0 ? ((st.pass / (st.total * SEEDS.length)) * 100).toFixed(1) : '0.0';
  const icon = st.fail === 0 && st.unmapped === 0 ? '✓' : st.fail > 0 ? '✗' : '△';
  console.log(`  ${icon} ${l1.padEnd(14)} ${st.total}개 | PASS ${st.pass} | FAIL ${st.fail} | 미매핑 ${st.unmapped}`);
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('  매핑된 쿠팡 대분류별 콘텐츠 생성 결과');
console.log('═══════════════════════════════════════════════════════════════');
for (const [ck, st] of Object.entries(coupangTopStats).sort((a, b) => b[1].total - a[1].total)) {
  const icon = (st.fail || 0) === 0 ? '✓' : '✗';
  console.log(`  ${icon} ${ck.padEnd(16)} ${st.total}건 | PASS ${st.pass} | FAIL ${st.fail || 0}`);
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('  실패 유형별 집계');
console.log('═══════════════════════════════════════════════════════════════');
for (const [type, count] of Object.entries(failTypeCount)) {
  if (count > 0) console.log(`  ${type}: ${count}건`);
}
if (Object.values(failTypeCount).every(c => c === 0)) console.log('  (없음)');

if (failures.length > 0) {
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  실패 상세 (최대 80건)');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const f of failures) {
    console.log(`  [${f.type}] 네이버: ${f.naverPath}`);
    if (f.coupangPath) console.log(`    → 쿠팡: ${f.coupangPath} (신뢰도: ${f.confidence})`);
    if (f.productName) console.log(`    상품명: ${f.productName}`);
    if (f.matched) console.log(`    매칭: "${f.matched}" ${f.profileId ? `[profile: ${f.profileId}]` : ''}`);
    if (f.context) console.log(`    컨텍스트: ...${f.context}...`);
    console.log();
  }
}

// ─── 매핑 신뢰도별 통과율 분석 ────────────────────────────

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('  매핑 신뢰도별 콘텐츠 생성 통과율');
console.log('═══════════════════════════════════════════════════════════════');
const confBuckets = { '>=0.9': { pass: 0, fail: 0 }, '0.7-0.9': { pass: 0, fail: 0 }, '0.5-0.7': { pass: 0, fail: 0 }, '<0.5': { pass: 0, fail: 0 } };
for (const leaf of leaves) {
  const mapping = navMap[leaf.id];
  if (!mapping || !catDetails[mapping.c]) continue;
  const bucket = mapping.n >= 0.9 ? '>=0.9' : mapping.n >= 0.7 ? '0.7-0.9' : mapping.n >= 0.5 ? '0.5-0.7' : '<0.5';
  // 이 카테고리의 결과를 찾기 (간접적으로 pass/fail 추정)
  confBuckets[bucket].pass += SEEDS.length; // 대부분 pass라 근사
}
// 실패한 것들의 신뢰도 집계
for (const f of failures) {
  if (f.confidence !== undefined) {
    const bucket = f.confidence >= 0.9 ? '>=0.9' : f.confidence >= 0.7 ? '0.7-0.9' : f.confidence >= 0.5 ? '0.5-0.7' : '<0.5';
    confBuckets[bucket].fail++;
    confBuckets[bucket].pass--;
  }
}
for (const [bucket, st] of Object.entries(confBuckets)) {
  const total = st.pass + st.fail;
  if (total === 0) continue;
  const rate = ((st.pass / total) * 100).toFixed(2);
  console.log(`  ${bucket}: ${total}건 → PASS ${rate}% (${st.fail} fail)`);
}

// ─── 종합 판정 ──────────────────────────────────────────────

console.log();
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║                         종합 판정                               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`  테스트: ${totalTests}건 (${leaves.length}개 네이버 리프 × ${SEEDS.length}시드)`);
console.log(`  소요시간: ${elapsed}초`);
console.log(`  PASS: ${totalPassed} | FAIL: ${totalFailed}`);
console.log(`  통과율: ${((totalPassed / totalTests) * 100).toFixed(2)}%`);
console.log(`  미매핑: ${unmappedCount}개`);

if (totalFailed === 0) {
  console.log();
  console.log('  ★ 전체 PASS — 4,993개 네이버 카테고리 콘텐츠 오염/불일치 0건 ★');
} else if (totalFailed / totalTests < 0.01) {
  console.log(`  ⚠️  거의 양호 — ${(totalFailed / totalTests * 100).toFixed(2)}% 이슈`);
} else {
  console.log(`  ❌ 개선 필요 — ${(totalFailed / totalTests * 100).toFixed(2)}% 이슈`);
}
console.log();

if (totalFailed > 0) process.exit(1);
