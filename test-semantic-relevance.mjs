// ============================================================
// 의미적 연관성 심층 검증
//
// "오염이 없다" ≠ "연관이 있다"
//
// 실제 상품명 + 카테고리 조합으로 콘텐츠 생성 후:
// 1. 카테고리 키워드가 콘텐츠에 포함되는지 (키워드 적중률)
// 2. 상품 유형과 무관한 범용 문구만 나오는지 (범용률)
// 3. 실제 생성 텍스트를 카테고리별 50건씩 출력하여 육안 검증
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const catDetails = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf-8'));
const naverData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/naver-categories.json'), 'utf-8'));
const naverToCoupang = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/naver-to-coupang-map.json'), 'utf-8'));
const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const fragmentData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/persuasion-fragments.json'), 'utf-8'));
const cpgMapping = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/cpg-mapping.json'), 'utf-8'));

const PROFILE_FILES = ['식품','뷰티','가전','생활용품','패션의류잡화','가구','출산','스포츠','반려','주방용품','완구','자동차용품','문구'];
const profileCache = new Map();
for (const fname of PROFILE_FILES) {
  try {
    const data = JSON.parse(readFileSync(join(__dirname, `src/lib/megaload/data/content-profiles/${fname}.json`), 'utf-8'));
    if (data.profiles) {
      for (const [groupId, profile] of Object.entries(data.profiles)) {
        profileCache.set(groupId, { groupId, displayName: profile.displayName || groupId, parentGroup: profile.parentGroup || fname, variables: profile.variables || {}, forbiddenTerms: profile.forbiddenTerms || [] });
      }
    }
  } catch (e) {}
}

// 건강식품 프로필
const HEALTH_CODE_TO_PROFILE = {
  '58927':'건강식품::관절','112304':'건강식품::관절','58920':'건강식품::눈건강','58926':'건강식품::간건강',
  '58991':'건강식품::유산균','73134':'건강식품::오메가3','58905':'건강식품::홍삼면역','59163':'건강식품::콜라겐',
  '58972':'건강식품::코엔자임','58924':'건강식품::쏘팔메토','58930':'건강식품::비타민','58931':'건강식품::미네랄',
  '113283':'건강식품::비오틴','58936':'건강식품::엽산','58942':'건강식품::다이어트','58946':'건강식품::프로틴',
};
const HEALTH_PROFILES = {
  '건강식품::관절': { variables: { '효과1':['관절건강','연골보호'], '성분':['콘드로이친','글루코사민','MSM','보스웰리아'] }, forbiddenTerms: ['간건강','눈건강','피부탄력','장건강','전립선','모발건강'] },
  '건강식품::눈건강': { variables: { '효과1':['눈건강','시력보호'], '성분':['루테인','지아잔틴'] }, forbiddenTerms: ['간건강','관절건강','전립선','모발건강'] },
  '건강식품::간건강': { variables: { '효과1':['간건강','간보호'], '성분':['밀크씨슬','실리마린'] }, forbiddenTerms: ['관절건강','눈건강','전립선','모발건강'] },
  '건강식품::유산균': { variables: { '효과1':['장건강','소화흡수'], '성분':['유산균','프로바이오틱스'] }, forbiddenTerms: ['간건강','관절건강','전립선','모발건강'] },
  '건강식품::오메가3': { variables: { '효과1':['혈관건강','혈행개선'], '성분':['오메가3','EPA','DHA'] }, forbiddenTerms: ['간건강','관절건강','전립선','모발건강'] },
  '건강식품::홍삼면역': { variables: { '효과1':['면역력강화','피로회복'], '성분':['홍삼','진세노사이드'] }, forbiddenTerms: ['관절건강','전립선','모발건강'] },
  '건강식품::콜라겐': { variables: { '효과1':['피부탄력','피부보습'], '성분':['콜라겐','히알루론산'] }, forbiddenTerms: ['간건강','관절건강','전립선','모발건강'] },
  '건강식품::비타민': { variables: { '효과1':['면역력','뼈건강'], '성분':['비타민C','비타민D'] }, forbiddenTerms: ['간건강','관절건강','전립선'] },
  '건강식품::미네랄': { variables: { '효과1':['뼈건강','근육이완'], '성분':['마그네슘','칼슘'] }, forbiddenTerms: ['간건강','관절건강','전립선'] },
  '건강식품::비오틴': { variables: { '효과1':['모발건강','피부건강'], '성분':['비오틴','비타민B7'] }, forbiddenTerms: ['간건강','관절건강','전립선'] },
  '건강식품::코엔자임': { variables: { '효과1':['심장건강','항산화'], '성분':['코엔자임Q10'] }, forbiddenTerms: ['관절건강','전립선','모발건강'] },
  '건강식품::쏘팔메토': { variables: { '효과1':['전립선건강','배뇨기능'], '성분':['쏘팔메토'] }, forbiddenTerms: ['간건강','관절건강','모발건강'] },
  '건강식품::다이어트': { variables: { '효과1':['체지방감소','식욕억제'], '성분':['가르시니아','HCA'] }, forbiddenTerms: ['간건강','관절건강','전립선'] },
  '건강식품::프로틴': { variables: { '효과1':['근력강화','근육회복'], '성분':['유청단백질','WPI'] }, forbiddenTerms: ['간건강','관절건강','전립선'] },
  '건강식품::엽산': { variables: { '효과1':['태아건강','세포분열'], '성분':['엽산'] }, forbiddenTerms: ['관절건강','전립선','다이어트'] },
};
for (const [key, hp] of Object.entries(HEALTH_PROFILES)) {
  profileCache.set(key, { groupId: key, displayName: key, parentGroup: '식품>건강식품', variables: hp.variables, forbiddenTerms: hp.forbiddenTerms });
}

// ─── utils ──────────────────────────────────────────────────

function stringToSeed(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h >>> 0; }
function createSeededRandom(seed) { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function inferTopCategory(top, full) {
  const fl = full.toLowerCase();
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || fl.includes('세제') || fl.includes('욕실')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류') || top.includes('잡화')) return '패션의류잡화';
  if (top.includes('가구') || top.includes('홈데코')) return '가구/홈데코';
  if (top.includes('출산') || top.includes('유아')) return '출산/유아동';
  if (top.includes('스포츠') || top.includes('레져')) return '스포츠/레져';
  if (top.includes('반려') || top.includes('애완')) return '반려/애완용품';
  if (top.includes('주방')) return '주방용품';
  if (top.includes('문구') || top.includes('사무')) return '문구/오피스';
  if (top.includes('완구') || top.includes('취미')) return '완구/취미';
  if (top.includes('자동차')) return '자동차용품';
  return 'DEFAULT';
}

const FRAGMENTS = fragmentData.fragments;
const FRAMEWORKS = fragmentData.frameworks;
const CATEGORY_FRAMEWORKS = fragmentData.categoryFrameworks;
const VARIABLES = storyData.variables;

const SUBCATEGORY_ALIASES = {
  '가전/디지털>TV/영상가전':'가전/디지털>영상가전','가전/디지털>계절환경가전':'가전/디지털>계절가전',
  '가전/디지털>냉장고/밥솥/주방가전':'가전/디지털>주방가전','가전/디지털>생활가전':'가전/디지털>청소가전',
  '뷰티>남성화장품':'뷰티>스킨','뷰티>선물세트':'뷰티>스킨',
  '식품>가공/즉석식품':'식품>가공식품','식품>냉장/냉동식품':'식품>가공식품',
  '식품>생수/음료':'식품>음료','식품>커피/차':'식품>음료',
  '생활용품>세탁용품':'생활용품>세제','생활용품>청소용품':'생활용품>세제',
  '패션의류잡화>남성패션':'패션의류잡화>남성의류','패션의류잡화>여성패션':'패션의류잡화>여성의류',
  '가구/홈데코>가구':'가구/홈데코>가구','가구/홈데코>침구':'가구/홈데코>침대',
  '반려/애완용품>강아지 사료/간식/영양제':'반려/애완용품>강아지','반려/애완용품>고양이 사료/간식/영양제':'반려/애완용품>고양이',
};

function resolveContentProfile(catPath, code) {
  if (code && HEALTH_CODE_TO_PROFILE[code]) { const p = profileCache.get(HEALTH_CODE_TO_PROFILE[code]); if (p) return p; }
  if (code && cpgMapping.codeToGroup[code]) { const gid = cpgMapping.codeToGroup[code]; return profileCache.get(gid) || null; }
  const np = catPath.replace(/\s+/g, '');
  if (cpgMapping.groups && cpgMapping.groups[np]) { return profileCache.get(np) || null; }
  let best = null, bestL = 0;
  for (const key of Object.keys(cpgMapping.groups || {})) { if (np.startsWith(key) && key.length > bestL) { best = key; bestL = key.length; } }
  return best ? profileCache.get(best) || null : null;
}

function resolveVariables(catPath, code) {
  const prof = resolveContentProfile(catPath, code);
  if (prof && prof.variables && Object.keys(prof.variables).length > 0) return { ...prof.variables };
  const parts = catPath.split('>').map(p => p.trim());
  const topKey = inferTopCategory(parts[0] || '', catPath);
  const base = { ...(VARIABLES['DEFAULT'] || {}) };
  const topVars = VARIABLES[topKey]; if (topVars) for (const [k, v] of Object.entries(topVars)) base[k] = v;
  for (let len = 2; len <= parts.length; len++) {
    const raw = parts.slice(0, len).join('>'), sub = SUBCATEGORY_ALIASES[raw] || raw;
    const sv = VARIABLES[sub]; if (sv) for (const [k, v] of Object.entries(sv)) base[k] = v;
  }
  return base;
}

function resolveFragments(bt, catPath) {
  const bf = FRAGMENTS[bt]; if (!bf) return { openers:[], values:[], closers:[] };
  if (bf[catPath]) return bf[catPath];
  const parts = catPath.split('>').map(p => p.trim());
  for (let l = parts.length - 1; l >= 1; l--) { const k = parts.slice(0, l).join('>'); if (bf[k]) return bf[k]; }
  const top = parts[0]; for (const k of Object.keys(bf)) { if (k === top || k.startsWith(top + '>')) return bf[k]; }
  return bf['DEFAULT'] || { openers:[], values:[], closers:[] };
}

function fillTemplate(tpl, vars, pname, rng) {
  let r = tpl.replace(/\{product\}/g, pname);
  r = r.replace(/\{([^}]+)\}/g, (m, key) => { const p = vars[key]; if (p && p.length > 0) return p[Math.floor(rng() * p.length)]; const bk = key.replace(/\d+$/, ''); const fb = vars[bk] || vars[bk + '1']; return (fb && fb.length > 0) ? fb[Math.floor(rng() * fb.length)] : ''; });
  return r;
}

function filterPool(pool, ft) {
  if (!ft || ft.length === 0) return pool;
  const has = t => ft.some(f => t.includes(f));
  const fa = a => { if (!a) return a; const f = a.filter(s => !has(s)); return f.length > 0 ? f : a; };
  return { openers: fa(pool.openers||[]), values: fa(pool.values||[]), closers: fa(pool.closers||[]), item_pool: pool.item_pool ? fa(pool.item_pool) : undefined, titles: pool.titles };
}

function pick(a, rng) { return (!a || a.length === 0) ? '' : a[Math.floor(rng() * a.length)]; }

function compose1(pool, vars, pn, rng) {
  let r = [pick(pool.openers, rng), pick(pool.values, rng), pick(pool.closers, rng)].filter(Boolean).join(' ');
  return fillTemplate(r, vars, pn, rng).replace(/\s{2,}/g, ' ').trim();
}

function genContent(productName, catPath, seed, idx, catCode) {
  const s = stringToSeed(`${seed}::persuasion::${idx}::${productName}`);
  const rng = createSeededRandom(s);
  const cn = productName.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  const prof = resolveContentProfile(catPath, catCode);
  let vars = resolveVariables(catPath, catCode);
  if (prof?.forbiddenTerms?.length > 0) {
    const fb = new Set(prof.forbiddenTerms);
    for (const [k, v] of Object.entries(vars)) { const f = v.filter(x => !fb.has(x)); if (f.length > 0) vars[k] = f; }
  }
  const afw = (function() {
    if (CATEGORY_FRAMEWORKS[catPath]) return CATEGORY_FRAMEWORKS[catPath];
    const parts = catPath.split('>').map(p => p.trim());
    for (let l = parts.length - 1; l >= 1; l--) { const k = parts.slice(0, l).join('>'); if (CATEGORY_FRAMEWORKS[k]) return CATEGORY_FRAMEWORKS[k]; }
    const tk = inferTopCategory(parts[0] || '', catPath);
    return CATEGORY_FRAMEWORKS[tk] || CATEGORY_FRAMEWORKS['DEFAULT'] || ['AIDA'];
  })();
  const fwId = afw[Math.floor(rng() * afw.length)];
  const fw = FRAMEWORKS[fwId] || FRAMEWORKS['AIDA'];
  const ft = prof?.forbiddenTerms;
  const blocks = fw.blocks.map(bt => {
    const raw = resolveFragments(bt, catPath);
    const pool = { openers: raw.openers||[], values: raw.values||[], closers: raw.closers||[], item_pool: raw.item_pool, titles: raw.titles };
    const hasP = pool.openers.length > 0 || pool.values.length > 0;
    let ap = hasP ? pool : resolveFragments('solution', catPath);
    if (ft?.length > 0) ap = filterPool(ap, ft);
    if (bt === 'benefits_grid') {
      const title = ap.titles?.length > 0 ? ap.titles[Math.floor(rng() * ap.titles.length)] : '핵심 장점';
      const sh = [...(ap.item_pool || [])]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      return { type: bt, content: title, items: sh.slice(0, 5).map(x => fillTemplate(x, vars, cn, rng)) };
    }
    const c = compose1(ap, vars, cn, rng), sc = compose1(ap, vars, cn, rng);
    return { type: bt, content: c, subContent: c !== sc ? sc : undefined };
  });
  const fullText = blocks.map(b => { let t = b.content || ''; if (b.subContent) t += ' ' + b.subContent; if (b.items) t += ' ' + b.items.join(' '); return t; }).join(' ');
  return { blocks, fullText, framework: fwId, profile: prof, vars };
}

// ============================================================
// 의미적 연관성 검증
// ============================================================

// 카테고리별 핵심 키워드: 이 카테고리 콘텐츠에 반드시 있어야 할 단어들
const CATEGORY_RELEVANCE_KEYWORDS = {
  '뷰티': ['피부','보습','케어','성분','사용','세안','발라','도포','톤','텍스처','모공','주름','메이크업','클렌징','쿠션','립','아이','마스카라','브러시','컬러'].concat(['미백','탄력','수분','트러블','진정','각질','자외선','SPF']),
  '식품': ['섭취','맛','원료','건강','영양','성분','식품','먹','드시','신선','맛있','유기농','국산','함유','하루','제조','포장','보관'].concat(['칼로리','단백질','비타민','음료','커피','차','과일','채소','고기','해산물']),
  '생활용품': ['세정','청소','세탁','섬유','향','욕실','화장지','물티슈','건강','구강','위생','용품','정리','보관','수납','공구','안전'].concat(['세제','유연제','소독','정전기','방향','탈취']),
  '가전/디지털': ['전원','설치','충전','성능','소음','기능','모드','화면','해상도','배터리','용량','무선','블루투스','자동','효율','에너지'].concat(['청소기','에어컨','냉장고','세탁기','TV','모니터','이어폰','스피커','카메라']),
  '패션의류잡화': ['착용','사이즈','소재','핏','디자인','세탁','코디','스타일','색상','컬러','원단','패턴','계절','캐주얼','포멀'].concat(['면','폴리','울','가죽','니트','데님','가방','지갑','벨트','모자','신발']),
  '가구/홈데코': ['조립','공간','인테리어','디자인','소재','수납','설치','배송','사이즈','내구성','원목','패브릭','프레임','매트리스','침구'].concat(['침대','소파','책상','의자','서랍','조명','커튼','카페트','선반']),
  '출산/유아동': ['아이','아기','유아','신생아','맘','엄마','안전','인증','순','무','피부','기저귀','분유','이유식','젖병','물티슈','카시트','유모차'].concat(['세제','보습','스킨케어','목욕']),
  '스포츠/레져': ['운동','헬스','요가','등산','캠핑','자전거','골프','수영','낚시','텐트','매트','덤벨','스틱','헬멧','방수','통기성','보온','쿨링'].concat(['근력','체력','퍼포먼스','트레이닝']),
  '반려/애완용품': ['반려','강아지','고양이','사료','간식','영양','급여','배변','목욕','하네스','산책','놀이','건강','체중','모질','관절'].concat(['소형견','대형견','캣타워','모래','패드']),
  '주방용품': ['요리','조리','프라이팬','냄비','코팅','인덕션','가스','식기','보관','밀폐','보온','보냉','칼','도마','실리콘','세척','내열'].concat(['텀블러','식판','수저','컵']),
  '완구/취미': ['놀이','아이','교육','학습','안전','레고','블록','퍼즐','인형','RC','보드게임','피규어','악기','DIY','재미','창의','발달'].concat(['조립','수집','게임']),
  '자동차용품': ['차량','자동차','세차','코팅','광택','실내','블랙박스','타이어','매트','시트','방향제','충전','LED','와이퍼','엔진오일'].concat(['발수','내구성','시공','도장']),
  '문구/오피스': ['필기','볼펜','노트','사무','프린터','용지','파일','테이프','스티커','색연필','물감','화방','문구','학용','수채화','연필'].concat(['인쇄','스프링','바인더']),
  'DEFAULT': ['품질','사용','제품','추천','만족','효과','성능','편리','안전'],
};

// ============================================================
// 테스트 케이스: 실제 상품 시나리오 30개
// ============================================================

const REAL_PRODUCT_TESTS = [
  // 뷰티
  { name: '닥터지 레드 블레미쉬 클리어 수딩크림 70ml', naverPath: '화장품/미용>스킨케어>크림', coupangPath: '뷰티>스킨케어>크림>수분크림', code: '' },
  { name: '롬앤 쥬시래스팅 틴트 5.5g', naverPath: '화장품/미용>색조메이크업>립틴트', coupangPath: '뷰티>메이크업>립메이크업>틴트', code: '' },
  // 식품
  { name: '뉴트리원 비오틴 5000mcg 90정', naverPath: '식품>건강식품>비타민', coupangPath: '식품>건강식품>기타건강식품>비오틴', code: '113283' },
  { name: '종근당 rTG 오메가3 1200mg 120캡슐', naverPath: '식품>건강식품>EPA/DHA', coupangPath: '식품>건강식품>기타건강식품>EPA/DHA', code: '73134' },
  { name: '곰곰 프리미엄 즉석밥 210g 24개', naverPath: '식품>면/통조림/가공식품>즉석밥', coupangPath: '식품>가공/즉석식품>즉석밥/죽>즉석밥', code: '' },
  { name: '스타벅스 하우스 블렌드 원두 1.13kg', naverPath: '식품>음료>커피', coupangPath: '식품>커피/차>원두커피', code: '' },
  // 가전
  { name: '삼성 비스포크 에어컨 윈도우핏 AF25B6914', naverPath: '디지털/가전>계절가전>에어컨', coupangPath: '가전/디지털>계절환경가전>에어컨', code: '' },
  { name: '애플 에어팟 프로 2세대 USB-C', naverPath: '디지털/가전>음향기기>이어폰', coupangPath: '가전/디지털>음향기기/이어폰/스피커>이어폰', code: '' },
  // 패션
  { name: '나이키 에어맥스 90 남성 운동화', naverPath: '패션잡화>남성신발>운동화/스니커즈', coupangPath: '패션의류잡화>남성패션>남성신발>운동화', code: '' },
  { name: '코치 시그니처 크로스바디백', naverPath: '패션잡화>여성가방>크로스백', coupangPath: '패션의류잡화>여성패션>여성가방>크로스백', code: '' },
  // 가구
  { name: '일룸 쿠시노 3인용 패브릭 소파', naverPath: '가구/인테리어>소파>3인용이상', coupangPath: '가구/홈데코>가구>소파>소파', code: '' },
  { name: '시몬스 뷰티레스트 매트리스 퀸', naverPath: '가구/인테리어>매트리스>퀸', coupangPath: '가구/홈데코>침구>매트리스', code: '' },
  // 출산/유아동
  { name: '하기스 매직팬티 기저귀 4단계 52매', naverPath: '출산/육아>기저귀>팬티형', coupangPath: '출산/유아동>기저귀/교체용품>팬티형기저귀', code: '' },
  { name: '페도라 C7 올인원 유모차', naverPath: '출산/육아>유모차>일반유모차', coupangPath: '출산/유아동>외출용품>유모차', code: '' },
  // 스포츠
  { name: '블랙야크 고어텍스 등산화 남성', naverPath: '스포츠/레저>등산>등산화', coupangPath: '스포츠/레져>등산>등산화/트레킹화', code: '' },
  { name: '코베아 빅보스 2룸 텐트', naverPath: '스포츠/레저>캠핑>텐트', coupangPath: '스포츠/레져>캠핑>텐트', code: '' },
  // 반려
  { name: '로얄캐닌 미니 어덜트 사료 8kg', naverPath: '생활/건강>반려동물>강아지 사료>건식사료', coupangPath: '반려/애완용품>강아지 사료/간식/영양제>사료', code: '' },
  { name: '캣츠랑 올라이프 고양이 사료 8kg', naverPath: '생활/건강>반려동물>고양이 사료>건식사료', coupangPath: '반려/애완용품>고양이 사료/간식/영양제>사료', code: '' },
  // 주방
  { name: '해피콜 다이아몬드 프라이팬 28cm', naverPath: '생활/건강>주방용품>프라이팬', coupangPath: '주방용품>조리용품>프라이팬/웍', code: '' },
  { name: '스탠리 클래식 보온병 1L', naverPath: '생활/건강>주방용품>텀블러/보온병', coupangPath: '주방용품>보온/보냉용품>보온병', code: '' },
  // 완구
  { name: '레고 테크닉 페라리 SP3 42143', naverPath: '출산/육아>장난감>블록/레고', coupangPath: '완구/취미>블록놀이>레고', code: '' },
  { name: '한국잡월드 보드게임 할리갈리', naverPath: '출산/육아>장난감>보드/퍼즐게임', coupangPath: '완구/취미>보드게임>보드게임', code: '' },
  // 자동차
  { name: '불스원 크리스탈 코팅 왁스 500ml', naverPath: '생활/건강>자동차용품>세차/관리용품>왁스', coupangPath: '자동차용품>세차/관리용품>왁스/코팅', code: '' },
  { name: '아이나비 FXD7000 전후방 블랙박스', naverPath: '디지털/가전>자동차전자기기>블랙박스', coupangPath: '자동차용품>차량용디지털기기>블랙박스', code: '' },
  // 생활용품
  { name: '피죤 시그니처 섬유유연제 리필 2.3L', naverPath: '생활/건강>세제>섬유유연제', coupangPath: '생활용품>세탁용품>섬유유연제', code: '' },
  { name: '니베아 소프트 보디로션 400ml', naverPath: '생활/건강>바디케어>바디로션', coupangPath: '뷰티>바디케어>바디로션/크림', code: '' },
  // 문구
  { name: '모나미 153 볼펜 0.7mm 12자루', naverPath: '생활/건강>문구/사무용품>필기류>볼펜', coupangPath: '문구/오피스>문구/학용품>필기류>볼펜', code: '' },
];

// ============================================================
// 실행
// ============================================================

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║        의미적 연관성 심층 검증 — "내용이 상품과 맞는가?"          ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝');
console.log();

// Part 1: 실제 상품 시나리오 30개 육안 검증
console.log('━━━ Part 1: 실제 상품 30개 콘텐츠 육안 검증 ━━━');
console.log();

let relevantCount = 0, weakCount = 0, irrelevantCount = 0;

for (const test of REAL_PRODUCT_TESTS) {
  const r = genContent(test.name, test.coupangPath, 'relevance-test', 0, test.code);
  const text = r.fullText;
  const topKey = inferTopCategory((test.coupangPath.split('>')[0] || '').trim(), test.coupangPath);
  const kwPool = CATEGORY_RELEVANCE_KEYWORDS[topKey] || CATEGORY_RELEVANCE_KEYWORDS['DEFAULT'];

  // 키워드 적중: 콘텐츠에 카테고리 키워드가 몇 개 포함되는지
  const matchedKws = kwPool.filter(kw => text.includes(kw));
  const hitRate = matchedKws.length / Math.min(kwPool.length, 15); // 15개 기준

  // 상품명 핵심 단어가 콘텐츠에 포함되는지
  const productTokens = test.name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !/^\d+[gGmMlLkK]/.test(w) && !/\d{3,}/.test(w));
  const productHits = productTokens.filter(t => text.includes(t));

  let verdict = '';
  if (hitRate >= 0.2 || matchedKws.length >= 3) {
    verdict = '✅ 연관'; relevantCount++;
  } else if (hitRate >= 0.1 || matchedKws.length >= 2) {
    verdict = '⚠️ 약한연관'; weakCount++;
  } else {
    verdict = '❌ 무관'; irrelevantCount++;
  }

  console.log(`${verdict} [${topKey}] ${test.name}`);
  console.log(`  네이버: ${test.naverPath}`);
  console.log(`  쿠팡:   ${test.coupangPath}`);
  console.log(`  프로필: ${r.profile?.displayName || '(레거시)'} | FW: ${r.framework}`);
  console.log(`  키워드적중: ${matchedKws.length}개 → ${matchedKws.slice(0, 8).join(', ')}${matchedKws.length > 8 ? '...' : ''}`);
  console.log(`  상품단어: ${productHits.join(', ') || '(없음)'} / [${productTokens.join(', ')}]`);
  console.log(`  변수풀: 효과1=[${(r.vars['효과1'] || []).slice(0, 4).join(', ')}] 성분=[${(r.vars['성분'] || []).slice(0, 4).join(', ')}]`);

  // 콘텐츠 블록별 내용 (첫 60자)
  for (const b of r.blocks) {
    let t = b.content || '';
    if (b.subContent) t += ' | ' + b.subContent;
    if (b.items?.length) t += ' | [' + b.items.join(', ') + ']';
    console.log(`    ${b.type}: ${t.slice(0, 100)}${t.length > 100 ? '...' : ''}`);
  }
  console.log();
}

// Part 2: 네이버 4,993개 전수 키워드 적중률 분석
console.log();
console.log('━━━ Part 2: 네이버 4,993개 전수 키워드 적중률 분석 ━━━');
console.log();

const navMap = naverToCoupang.map;
const leaves = naverData.leaves;
const topStats = {};

for (const leaf of leaves) {
  const mapping = navMap[leaf.id];
  if (!mapping || !catDetails[mapping.c]) continue;
  const cpPath = catDetails[mapping.c].p;
  const topKey = inferTopCategory((cpPath.split('>')[0] || '').trim(), cpPath);
  if (!topStats[topKey]) topStats[topKey] = { total: 0, kwHits: 0, totalMatchedKws: 0, zeroHit: 0, samples: [] };

  const leafName = leaf.path.split('>').pop().trim();
  const parentName = leaf.path.split('>').length >= 2 ? leaf.path.split('>').slice(-2, -1)[0].trim() : '';
  const productName = `프리미엄 ${parentName ? parentName + ' ' : ''}${leafName}`;
  const r = genContent(productName, cpPath, 'kw-test', 0, mapping.c);
  const text = r.fullText;
  const kwPool = CATEGORY_RELEVANCE_KEYWORDS[topKey] || CATEGORY_RELEVANCE_KEYWORDS['DEFAULT'];
  const matchedKws = kwPool.filter(kw => text.includes(kw));

  topStats[topKey].total++;
  topStats[topKey].totalMatchedKws += matchedKws.length;
  if (matchedKws.length >= 2) topStats[topKey].kwHits++;
  if (matchedKws.length === 0) {
    topStats[topKey].zeroHit++;
    if (topStats[topKey].samples.length < 3) {
      topStats[topKey].samples.push({ naverPath: leaf.path, cpPath, productName, text: text.slice(0, 150) });
    }
  }
}

console.log('대분류별 키워드 적중률 (카테고리 키워드 2개 이상 포함):');
console.log('─────────────────────────────────────────────────────');
let grandTotal = 0, grandHit = 0, grandZero = 0;
for (const [top, st] of Object.entries(topStats).sort((a, b) => b[1].total - a[1].total)) {
  const hitRate = ((st.kwHits / st.total) * 100).toFixed(1);
  const avgKw = (st.totalMatchedKws / st.total).toFixed(1);
  const icon = st.kwHits / st.total >= 0.95 ? '✅' : st.kwHits / st.total >= 0.8 ? '⚠️' : '❌';
  console.log(`  ${icon} ${top.padEnd(16)} ${st.total}개 | 적중 ${hitRate}% (평균 ${avgKw}개) | 0개적중 ${st.zeroHit}개`);
  grandTotal += st.total; grandHit += st.kwHits; grandZero += st.zeroHit;
}

console.log();
console.log(`  전체: ${grandTotal}개 중 ${grandHit}개 적중 (${((grandHit / grandTotal) * 100).toFixed(1)}%) | 0개적중 ${grandZero}개`);

// 0개 적중 샘플 출력
const zeroSamples = Object.entries(topStats).flatMap(([top, st]) => st.samples.map(s => ({ top, ...s }))).slice(0, 15);
if (zeroSamples.length > 0) {
  console.log();
  console.log('── 키워드 0개 적중 샘플 (최대 15건) ──');
  for (const s of zeroSamples) {
    console.log(`  [${s.top}] ${s.naverPath} → ${s.cpPath}`);
    console.log(`    상품: ${s.productName}`);
    console.log(`    콘텐츠: ${s.text}...`);
    console.log();
  }
}

// Part 3: 종합
console.log();
console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║                         종합 판정                                ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝');
console.log(`  Part 1 (실제 상품 30개): ✅연관 ${relevantCount} | ⚠️약한 ${weakCount} | ❌무관 ${irrelevantCount}`);
console.log(`  Part 2 (전수 4,993개): 키워드 적중률 ${((grandHit / grandTotal) * 100).toFixed(1)}% | 0개적중 ${grandZero}개 (${((grandZero / grandTotal) * 100).toFixed(2)}%)`);
console.log();
