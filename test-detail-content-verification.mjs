// ============================================================
// 상세페이지 콘텐츠 종합 검증 테스트
//
// 설득형 콘텐츠(persuasion engine) + 리뷰 콘텐츠 통합 검증
// CPG 프로필 격리, forbiddenTerms, 교차오염, 변수 미해석 전수 검사
//
// 대상: 전체 9,900개 소분류 × 3시드 = 29,700건
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 데이터 로드 ────────────────────────────────────────────

const catDetails = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf-8'));
const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const fragmentData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/persuasion-fragments.json'), 'utf-8'));

// CPG 프로필 로드
const cpgMapping = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/cpg-mapping.json'), 'utf-8'));

// content-profiles 로드
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

// ─── 건강식품 코드 → 전용 프로필 키 매핑 ──────────────────────
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

// 건강식품 인라인 프로필
const HEALTH_PROFILES = {
  '건강식품::관절': {
    displayName: '관절건강 영양제',
    variables: {
      '효과1':['관절건강','연골보호','관절유연성','뼈건강','관절영양','연골재생','관절편안함','무릎건강'],
      '효과2':['관절통완화','보행편안','관절유연','연골강화','움직임개선'],
      '성분':['콘드로이친','글루코사민','MSM','상어연골','보스웰리아','초록입홍합','칼슘','비타민D','콜라겐','히알루론산'],
      '카테고리':['관절영양제','글루코사민','영양제','건강식품','관절건강'],
    },
    forbiddenTerms: ['간건강','눈건강','혈당관리','체지방감소','피부탄력','장건강','혈관건강','면역력','전립선','모발건강','철분','오메가3','루테인','밀크씨슬','유산균','홍삼'],
  },
  '건강식품::간건강': {
    displayName: '간건강 영양제',
    variables: {
      '효과1':['간건강','간보호','간해독','간기능개선'],
      '성분':['밀크씨슬','실리마린','UDCA','아티초크'],
      '카테고리':['밀크씨슬','간영양제','영양제','건강식품','간건강'],
    },
    forbiddenTerms: ['관절건강','눈건강','피부탄력','장건강','연골보호','뼈건강','전립선','모발건강','루테인','콘드로이친','글루코사민'],
  },
  '건강식품::눈건강': {
    displayName: '눈건강 영양제',
    variables: {
      '효과1':['눈건강','시력보호','눈피로해소','안구건조개선'],
      '성분':['루테인','지아잔틴','비타민A','베타카로틴','빌베리추출물'],
      '카테고리':['루테인','눈영양제','비타민','영양제','건강식품'],
    },
    forbiddenTerms: ['간건강','관절건강','피부탄력','장건강','연골보호','전립선','모발건강','밀크씨슬','콘드로이친','글루코사민','유산균'],
  },
  '건강식품::유산균': {
    displayName: '유산균',
    variables: {
      '효과1':['장건강','소화흡수','장내환경개선','유익균증식'],
      '성분':['유산균','프로바이오틱스','프리바이오틱스','락토바실러스'],
      '카테고리':['유산균','프로바이오틱스','영양제','건강식품','장건강'],
    },
    forbiddenTerms: ['간건강','눈건강','관절건강','피부탄력','연골보호','전립선','모발건강','밀크씨슬','루테인','콘드로이친'],
  },
  '건강식품::오메가3': {
    displayName: '오메가3',
    variables: {
      '효과1':['혈관건강','혈행개선','중성지방감소','혈액순환'],
      '성분':['오메가3','EPA','DHA','크릴오일'],
      '카테고리':['오메가3','크릴오일','영양제','건강식품','혈관건강'],
    },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강','밀크씨슬','루테인','유산균','콘드로이친'],
  },
  '건강식품::홍삼면역': {
    displayName: '홍삼/면역',
    variables: { '효과1':['면역력강화','피로회복','활력증진'], '성분':['홍삼','진세노사이드'], '카테고리':['홍삼','면역영양제','건강식품'] },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강','루테인','콘드로이친'],
  },
  '건강식품::콜라겐': {
    displayName: '콜라겐',
    variables: { '효과1':['피부탄력','피부보습','주름개선'], '성분':['콜라겐','히알루론산'], '카테고리':['콜라겐','이너뷰티','영양제'] },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','연골보호','전립선','모발건강','유산균','콘드로이친','면역력'],
  },
  '건강식품::비타민': {
    displayName: '비타민제',
    variables: { '효과1':['면역력','뼈건강','항산화'], '성분':['비타민C','비타민D','비타민B군'], '카테고리':['비타민','멀티비타민','영양제'] },
    forbiddenTerms: ['간건강','관절건강','장건강','연골보호','전립선','콘드로이친','글루코사민'],
  },
  '건강식품::미네랄': {
    displayName: '미네랄',
    variables: { '효과1':['뼈건강','근육이완','신경안정'], '성분':['마그네슘','칼슘','아연'], '카테고리':['미네랄','칼슘','영양제'] },
    forbiddenTerms: ['간건강','관절건강','장건강','피부탄력','연골보호','전립선','루테인','밀크씨슬'],
  },
  '건강식품::비오틴': {
    displayName: '비오틴',
    variables: { '효과1':['모발건강','피부건강','손톱건강'], '성분':['비오틴','비타민B7'], '카테고리':['비오틴','모발영양제','비타민'] },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','연골보호','전립선','루테인','콘드로이친','밀크씨슬','유산균'],
  },
  '건강식품::코엔자임': {
    displayName: '코엔자임Q10',
    variables: { '효과1':['심장건강','항산화','에너지생성'], '성분':['코엔자임Q10','유비퀴놀'], '카테고리':['코엔자임Q10','항산화영양제','영양제'] },
    forbiddenTerms: ['관절건강','장내환경','소화흡수','유익균','배변활동','피부탄력','연골보호','전립선','모발건강','루테인','콘드로이친','밀크씨슬','유산균'],
  },
  '건강식품::쏘팔메토': {
    displayName: '쏘팔메토',
    variables: { '효과1':['전립선건강','배뇨기능','남성건강'], '성분':['쏘팔메토','노코기리야자'], '카테고리':['쏘팔메토','남성영양제','영양제'] },
    forbiddenTerms: ['간건강','관절건강','장건강','피부탄력','연골보호','모발건강','루테인','콘드로이친','밀크씨슬','유산균','여성'],
  },
  '건강식품::다이어트': {
    displayName: '다이어트',
    variables: { '효과1':['체지방감소','식욕억제','대사촉진'], '성분':['가르시니아','HCA'], '카테고리':['다이어트','체지방관리','영양제'] },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','혈관건강','피부탄력','연골보호','전립선','모발건강','루테인','콘드로이친','밀크씨슬'],
  },
  '건강식품::프로틴': {
    displayName: '프로틴',
    variables: { '효과1':['근력강화','근육회복','단백질보충'], '성분':['유청단백질','WPI','WPC'], '카테고리':['프로틴','단백질보충제','영양제'] },
    forbiddenTerms: ['간건강','눈건강','관절건강','장건강','피부탄력','혈관건강','연골보호','전립선','모발건강','루테인','밀크씨슬','유산균'],
  },
  '건강식품::스피루리나': {
    displayName: '스피루리나',
    variables: { '효과1':['영양균형','항산화','면역력강화'], '성분':['스피루리나','클로렐라'], '카테고리':['스피루리나','클로렐라','영양제'] },
    forbiddenTerms: ['관절건강','장건강','피부탄력','연골보호','전립선','모발건강','루테인','콘드로이친','밀크씨슬'],
  },
  '건강식품::흑마늘': {
    displayName: '흑마늘',
    variables: { '효과1':['면역력강화','항산화','피로회복'], '성분':['흑마늘','S-알릴시스테인'], '카테고리':['흑마늘','면역영양제','건강식품'] },
    forbiddenTerms: ['눈건강','관절건강','장건강','피부탄력','연골보호','전립선','모발건강','루테인','콘드로이친','유산균'],
  },
  '건강식품::엽산': {
    displayName: '엽산',
    variables: { '효과1':['태아건강','세포분열','신경관발달'], '성분':['엽산','활성엽산'], '카테고리':['엽산','임산부영양제','영양제'] },
    forbiddenTerms: ['간건강','관절건강','장건강','혈관건강','연골보호','전립선','모발건강','다이어트','근력강화'],
  },
};

// 건강식품 프로필 등록
for (const [key, hp] of Object.entries(HEALTH_PROFILES)) {
  profileCache.set(key, {
    groupId: key,
    displayName: hp.displayName,
    parentGroup: '식품>건강식품',
    variables: hp.variables,
    forbiddenTerms: hp.forbiddenTerms,
  });
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
    const profileKey = HEALTH_CODE_TO_PROFILE[categoryCode];
    const p = profileCache.get(profileKey);
    if (p) return p;
  }
  const groupId = findGroupId(categoryPath, categoryCode);
  if (!groupId) return null;
  return profileCache.get(groupId) || null;
}

// ─── 설득형 콘텐츠 생성 (fragment-composer + persuasion-engine 재구현) ──

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
  '뷰티>선물세트':'뷰티>스킨','뷰티>뷰티소품':'뷰티>메이크업','뷰티>네일':'뷰티>네일','뷰티>향수':'뷰티>향수',
  '식품>가공/즉석식품':'식품>가공식품','식품>냉장/냉동식품':'식품>가공식품','식품>스낵/간식':'식품>가공식품',
  '식품>생수/음료':'식품>음료','식품>유제품/아이스크림/디저트':'식품>가공식품','식품>장/소스':'식품>가공식품',
  '식품>가루/조미료/향신료':'식품>가공식품','식품>커피/차':'식품>음료','식품>전통주':'식품>음료',
  '생활용품>세탁용품':'생활용품>세제','생활용품>청소용품':'생활용품>세제',
  '생활용품>방향/탈취/제습/살충':'생활용품>세제','생활용품>화장지/물티슈':'생활용품>욕실용품',
  '생활용품>구강/면도':'생활용품>욕실용품','생활용품>생리대/성인기저귀':'생활용품>욕실용품',
  '생활용품>건강용품':'생활용품>건강용품','생활용품>의료/간호용품':'생활용품>건강용품',
  '생활용품>조명/전기용품':'생활용품>수납/정리','생활용품>생활소품':'생활용품>수납/정리',
  '생활용품>생활잡화':'생활용품>수납/정리','생활용품>안전용품':'생활용품>수납/정리',
  '생활용품>공구':'생활용품>공구','생활용품>보수용품':'생활용품>공구',
  '생활용품>배관/건축자재':'생활용품>공구','생활용품>철물':'생활용품>공구',
  '생활용품>접착용품':'생활용품>공구','생활용품>방충용품':'생활용품>세제',
  '생활용품>도장용품':'생활용품>공구','생활용품>성인용품(19)':'생활용품>수납/정리',
  '패션의류잡화>남성패션':'패션의류잡화>남성의류','패션의류잡화>여성패션':'패션의류잡화>여성의류',
  '패션의류잡화>유니섹스/남녀공용 패션':'패션의류잡화>남성의류',
  '패션의류잡화>베이비 의류/신발/잡화(~24개월)':'패션의류잡화>아동의류',
  '패션의류잡화>영유아동 신발/잡화/기타의류(0~17세)':'패션의류잡화>아동의류',
  '패션의류잡화>주니어 의류(9~17세)':'패션의류잡화>아동의류',
  '패션의류잡화>키즈 의류(3~8세)':'패션의류잡화>아동의류',
  '가구/홈데코>가구':'가구/홈데코>가구','가구/홈데코>침구':'가구/홈데코>침대',
  '가구/홈데코>인테리어용품':'가구/홈데코>조명','가구/홈데코>인테리어자재':'가구/홈데코>조명',
  '가구/홈데코>카페트/매트':'가구/홈데코>소파','가구/홈데코>커튼/침장':'가구/홈데코>침대',
  '가구/홈데코>쿠션/방석':'가구/홈데코>소파','가구/홈데코>패브릭소품/커버':'가구/홈데코>소파',
  '가구/홈데코>원예/가드닝':'가구/홈데코>원예','가구/홈데코>금고':'가구/홈데코>소파',
  '가구/홈데코>수선/수예도구':'가구/홈데코>소파',
  '출산/유아동>기저귀/교체용품':'출산/유아동>기저귀','출산/유아동>분유/유아식품':'출산/유아동>분유',
  '출산/유아동>수유/이유용품':'출산/유아동>분유','출산/유아동>이유/유아식기':'출산/유아동>유아식품',
  '출산/유아동>유아목욕/스킨케어':'출산/유아동>유아스킨케어','출산/유아동>유아물티슈/캡/홀더':'출산/유아동>기저귀',
  '출산/유아동>유아위생/건강/세제':'출산/유아동>기저귀','출산/유아동>놀이매트/안전용품':'출산/유아동>유아식품',
  '출산/유아동>외출용품':'출산/유아동>외출용품','출산/유아동>유아가구/인테리어':'출산/유아동>외출용품',
  '출산/유아동>유아동침구':'출산/유아동>유아스킨케어','출산/유아동>임부용품':'출산/유아동>유아스킨케어',
  '출산/유아동>출산준비물/선물':'출산/유아동>외출용품',
  '스포츠/레져>헬스/요가':'스포츠/레져>헬스','스포츠/레져>등산':'스포츠/레져>캠핑',
  '스포츠/레져>자전거':'스포츠/레져>자전거','스포츠/레져>수영/수상스포츠':'스포츠/레져>수영',
  '스포츠/레져>낚시':'스포츠/레져>낚시','스포츠/레져>스키/겨울스포츠':'스포츠/레져>캠핑',
  '스포츠/레져>구기스포츠':'스포츠/레져>구기','스포츠/레져>라켓스포츠':'스포츠/레져>구기',
  '스포츠/레져>킥보드/스케이트':'스포츠/레져>자전거','스포츠/레져>발레/댄스/에어로빅':'스포츠/레져>헬스',
  '스포츠/레져>검도/격투/무술':'스포츠/레져>헬스','스포츠/레져>스포츠 신발':'스포츠/레져>헬스',
  '스포츠/레져>스포츠 잡화':'스포츠/레져>헬스','스포츠/레져>기타스포츠':'스포츠/레져>헬스',
  '스포츠/레져>심판용품':'스포츠/레져>구기','스포츠/레져>측정용품':'스포츠/레져>헬스',
  '스포츠/레져>철인3종경기':'스포츠/레져>헬스',
  '반려/애완용품>강아지 사료/간식/영양제':'반려/애완용품>강아지','반려/애완용품>강아지용품':'반려/애완용품>강아지',
  '반려/애완용품>강아지/고양이 겸용':'반려/애완용품>강아지','반려/애완용품>고양이 사료/간식/영양제':'반려/애완용품>고양이',
  '반려/애완용품>고양이용품':'반려/애완용품>고양이','반려/애완용품>관상어용품':'반려/애완용품>소동물',
  '반려/애완용품>햄스터/토끼/기니피그용품':'반려/애완용품>소동물','반려/애완용품>조류용품':'반려/애완용품>소동물',
  '반려/애완용품>파충류용품':'반려/애완용품>소동물','반려/애완용품>고슴도치용품':'반려/애완용품>소동물',
  '반려/애완용품>페럿용품':'반려/애완용품>소동물','반려/애완용품>장수풍뎅이/곤충용품':'반려/애완용품>소동물',
  '반려/애완용품>거북이/달팽이용품':'반려/애완용품>소동물','반려/애완용품>가축사료/용품':'반려/애완용품>소동물',
  '주방용품>조리용품':'주방용품>프라이팬','주방용품>취사도구':'주방용품>프라이팬',
  '주방용품>칼/가위/도마':'주방용품>칼/도마','주방용품>보관/밀폐용기':'주방용품>도시락',
  '주방용품>보온/보냉용품':'주방용품>도시락','주방용품>수저/컵/식기':'주방용품>식기',
  '주방용품>이유/유아식기':'주방용품>식기','주방용품>베이킹&포장용품':'주방용품>프라이팬',
  '주방용품>주방수납/정리':'주방용품>도시락','주방용품>주방일회용품':'주방용품>도시락',
  '주방용품>주방잡화':'주방용품>도시락','주방용품>커피/티/와인':'주방용품>식기',
  '주방용품>교자상/밥상/상커버':'주방용품>식기','주방용품>제기/제수용품':'주방용품>식기',
  '완구/취미>블록놀이':'완구/취미>레고/블록','완구/취미>보드게임':'완구/취미>보드게임',
  '완구/취미>퍼즐/큐브/피젯토이':'완구/취미>보드게임','완구/취미>인형':'완구/취미>인형',
  '완구/취미>역할놀이':'완구/취미>인형','완구/취미>로봇/작동완구':'완구/취미>RC/로봇',
  '완구/취미>RC완구/부품':'완구/취미>RC/로봇','완구/취미>STEAM/학습완구':'완구/취미>레고/블록',
  '완구/취미>프라모델':'완구/취미>레고/블록','완구/취미>피규어/다이캐스트':'완구/취미>레고/블록',
  '완구/취미>수집품':'완구/취미>레고/블록','완구/취미>악기/음향기기':'완구/취미>악기',
  '완구/취미>DIY':'완구/취미>레고/블록','완구/취미>신생아/영아완구':'완구/취미>인형',
  '완구/취미>물놀이/계절완구':'완구/취미>인형','완구/취미>스포츠/야외완구':'완구/취미>RC/로봇',
  '완구/취미>승용완구':'완구/취미>RC/로봇','완구/취미>실내대형완구':'완구/취미>인형',
  '완구/취미>마술용품':'완구/취미>보드게임',
  '자동차용품>세차/관리용품':'자동차용품>세차용품','자동차용품>공기청정/방향/탈취':'자동차용품>실내용품',
  '자동차용품>매트/시트/쿠션':'자동차용품>실내용품','자동차용품>실내용품':'자동차용품>실내용품',
  '자동차용품>실외용품':'자동차용품>세차용품','자동차용품>차량용디지털기기':'자동차용품>디지털기기',
  '자동차용품>차량용튜닝용품':'자동차용품>세차용품','자동차용품>램프/배터리/전기':'자동차용품>디지털기기',
  '자동차용품>비상/안전/차량가전':'자동차용품>디지털기기','자동차용품>오일/정비/소모품':'자동차용품>세차용품',
  '자동차용품>오토바이용품':'자동차용품>세차용품','자동차용품>타이어/휠/체인':'자동차용품>세차용품',
  '자동차용품>DIY/공구용품':'자동차용품>세차용품',
  '문구/오피스>문구/학용품':'문구/오피스>필기구','문구/오피스>사무용품':'문구/오피스>필기구',
  '문구/오피스>사무기기':'문구/오피스>필기구','문구/오피스>미술/화방용품':'문구/오피스>필기구',
};

// ─── resolveFragments ──────────────────────────────────────

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

// ─── resolveVariables (CPG 프로필 우선) ──────────────────────

function resolveVariables(categoryPath, categoryCode) {
  const profile = resolveContentProfile(categoryPath, categoryCode);
  if (profile && profile.variables && Object.keys(profile.variables).length > 0) {
    return { ...profile.variables };
  }
  // 레거시
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

// ─── fillTemplate ──────────────────────────────────────────

function hasFinalConsonant(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

function fixKoreanParticles(text) {
  return text
    .replace(/([\uAC00-\uD7A3])(은|는)/g, (_, prev) => prev + (hasFinalConsonant(prev) ? '은' : '는'))
    .replace(/([\uAC00-\uD7A3])(이|가)/g, (_, prev) => prev + (hasFinalConsonant(prev) ? '이' : '가'))
    .replace(/([\uAC00-\uD7A3])(을|를)/g, (_, prev) => prev + (hasFinalConsonant(prev) ? '을' : '를'))
    .replace(/([\uAC00-\uD7A3])(과|와)/g, (_, prev) => prev + (hasFinalConsonant(prev) ? '과' : '와'));
}

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
  return fixKoreanParticles(result);
}

// ─── filterFragmentPool ────────────────────────────────────

function filterFragmentPool(pool, forbiddenTerms) {
  const hasForbidden = (text) => forbiddenTerms.some(term => text.includes(term));
  const filterArr = (arr) => {
    if (!arr) return arr;
    const filtered = arr.filter(s => !hasForbidden(s));
    return filtered.length > 0 ? filtered : arr;
  };
  return {
    openers: filterArr(pool.openers || []),
    values: filterArr(pool.values || []),
    closers: filterArr(pool.closers || []),
    emphases: pool.emphases ? filterArr(pool.emphases) : undefined,
    titles: pool.titles,
    item_pool: pool.item_pool ? filterArr(pool.item_pool) : undefined,
  };
}

// ─── composeBlock ──────────────────────────────────────────

function pickRandom(arr, rng) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(rng() * arr.length)];
}

function composeOneSentence(pool, vars, productName, rng) {
  const opener = pickRandom(pool.openers, rng);
  const value = pickRandom(pool.values, rng);
  const closer = pickRandom(pool.closers, rng);
  let raw = [opener, value, closer].filter(Boolean).join(' ');
  raw = fillTemplate(raw, vars, productName, rng);
  return raw.replace(/\s{2,}/g, ' ').trim();
}

function composeBlock(blockType, categoryPath, vars, productName, rng, forbiddenTerms) {
  const rawPool = resolveFragments(blockType, categoryPath);
  const pool = { openers: rawPool.openers||[], values: rawPool.values||[], closers: rawPool.closers||[], item_pool: rawPool.item_pool, titles: rawPool.titles, emphases: rawPool.emphases };
  const hasPool = pool.openers.length > 0 || pool.values.length > 0;
  let actualPool = hasPool ? pool : resolveFragments('solution', categoryPath);

  // forbiddenTerms 필터: 프래그먼트 텍스트에서 금지어 포함 항목 제거
  if (forbiddenTerms && forbiddenTerms.length > 0) {
    actualPool = filterFragmentPool(actualPool, forbiddenTerms);
  }

  if (blockType === 'benefits_grid') {
    const title = actualPool.titles?.length > 0 ? actualPool.titles[Math.floor(rng() * actualPool.titles.length)] : '핵심 장점';
    const itemPool = actualPool.item_pool || [];
    const items = [];
    const shuffled = [...itemPool];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    for (let i = 0; i < Math.min(5, shuffled.length); i++) {
      let filled = fillTemplate(shuffled[i], vars, productName, rng);
      items.push(filled);
    }
    return { type: blockType, content: title, items };
  }

  const content = composeOneSentence(actualPool, vars, productName, rng);
  const subContent = composeOneSentence(actualPool, vars, productName, rng);
  return { type: blockType, content, subContent: content !== subContent ? subContent : undefined };
}

// ─── 설득형 콘텐츠 생성 ──────────────────────────────────────

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

  // CPG 프로필
  const profile = resolveContentProfile(categoryPath, categoryCode);

  // 변수풀 (CPG 격리 or 레거시)
  let vars = resolveVariables(categoryPath, categoryCode);

  // forbiddenTerms 필터
  if (profile && profile.forbiddenTerms && profile.forbiddenTerms.length > 0) {
    const forbidden = new Set(profile.forbiddenTerms);
    for (const [key, values] of Object.entries(vars)) {
      const filtered = values.filter(v => !forbidden.has(v));
      if (filtered.length > 0) vars[key] = filtered;
    }
  }

  // 프레임워크 선택
  const allowedFrameworks = resolveCategoryFrameworks(categoryPath);
  const frameworkId = allowedFrameworks[Math.floor(rng() * allowedFrameworks.length)];
  const framework = FRAMEWORKS[frameworkId] || FRAMEWORKS['AIDA'];

  // 블록 생성 (forbiddenTerms 전달 → 프래그먼트 필터)
  const ft = profile?.forbiddenTerms;
  const blocks = framework.blocks.map(bt => composeBlock(bt, categoryPath, vars, cleanName, rng, ft));

  return { framework: frameworkId, blocks, profile };
}

// ============================================================
// 교차 오염 감지 규칙
// ============================================================

const HARD_FORBIDDEN = {
  '뷰티': /세차(?!용)|엔진|연비|블랙박스|사료|급여량|소형견|대형견|고양이사료|캣타워|배변패드|프라이팬|인덕션|에어프라이어|냄비세트|덤벨세트|텐트.*방수|침낭.*동계|드라이버.*도|골프공|레고.*피스|피규어.*건담/,
  '식품': /바르[고는면].*피부|발라[서요].*피부|세안후|클렌징|메이크업|파운데이션|마스카라|아이라이너|흡입력.*청소|냉방력|난방력|사이클론|로봇청소기|세차.*광택|블랙박스.*채널|착용감.*핏|코디.*레이어드|매트리스.*체압|소파.*패브릭/,
  '생활용품': /섭취.*정|캡슐.*섭취|알약|드라이버.*샤프트|골프공|블랙박스.*채널|매트리스.*체압|소파.*쿠셔닝/,
  '가전/디지털': /섭취.*정|캡슐.*섭취|알약.*삼키|바르[고는면].*피부|발라.*피부|세안후|클렌징|사료.*급여|소형견|고양이사료|캣타워|세차.*광택|코팅제.*9H/,
  '패션의류잡화': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|발라.*피부|흡입력.*청소|냉방력|난방력|사료.*급여|소형견|고양이사료|세차.*광택/,
  '가구/홈데코': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|발라.*피부|사이클론|사료.*급여|소형견|고양이사료|세차.*광택|드라이버.*샤프트|골프공/,
  '출산/유아동': /세차.*광택|엔진.*오일|블랙박스.*채널|드라이버.*샤프트|골프공|프라이팬.*코팅|인덕션.*빌트인|사료.*급여|소형견|고양이사료/,
  '스포츠/레져': /섭취.*정|캡슐.*섭취|바르[고는면].*피부|발라.*피부|냉방력|사료.*급여|소형견|고양이사료|세차.*광택|피규어.*건담|레고.*피스/,
  '반려/애완용품': /세차.*광택|엔진.*오일|블랙박스.*채널|드라이버.*샤프트|골프공|매트리스.*체압|소파.*패브릭|착용감.*핏|코디.*레이어드/,
  '주방용품': /섭취.*캡슐|알약.*삼키|바르[고는면].*피부|발라.*피부|사이클론|사료.*급여|소형견|고양이사료|세차.*광택|드라이버.*샤프트|골프공/,
  '문구/오피스': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|발라.*피부|흡입력.*청소|사료.*급여|소형견|고양이사료|세차.*광택|매트리스.*체압/,
  '완구/취미': /섭취.*정|캡슐.*섭취|알약|바르[고는면].*피부|발라.*피부|흡입력.*청소|사료.*급여|소형견|고양이사료|세차.*광택|매트리스.*체압/,
  '자동차용품': /섭취.*정|캡슐.*섭취|알약.*삼키|바르.*피부에|발라.*피부|사료.*급여|소형견|고양이사료|매트리스.*체압|소파.*패브릭|레고.*피스|피규어.*건담/,
};

// 건강식품 성분별 교차오염 (forbiddenTerms 기반)
const HEALTH_CROSS_CHECK = {
  '관절': { test: /관절|글루코사민|보스웰리아|콘드로이친|MSM/i, forbid: /루테인|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나|클로렐라/ },
  '눈': { test: /루테인|지아잔틴|눈건강|시력|안구/i, forbid: /콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '간': { test: /밀크씨슬|실리마린|간건강|간보호/i, forbid: /루테인|콘드로이친|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '장': { test: /유산균|프로바이오|장건강/i, forbid: /루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토/ },
  '오메가': { test: /오메가3|크릴오일|EPA|DHA/i, forbid: /루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '모발': { test: /비오틴|모발|탈모/i, forbid: /루테인|콘드로이친|밀크씨슬|가르시니아|쏘팔메토|스피루리나/ },
};

// ============================================================
// 상품명 생성
// ============================================================

function generateProductName(categoryPath) {
  const parts = categoryPath.split('>');
  const leaf = parts[parts.length - 1].trim();
  const parent = parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  const modifiers = ['프리미엄', '고급', '베스트', '인기', '추천'];
  const mod = modifiers[stringToSeed(categoryPath) % modifiers.length];
  if (parent && parent !== leaf && !leaf.includes(parent)) return `${mod} ${parent} ${leaf}`;
  return `${mod} ${leaf}`;
}

// ============================================================
// 블록 → 전체 텍스트
// ============================================================

function blocksToText(blocks) {
  return blocks.map(b => {
    let t = b.content || '';
    if (b.subContent) t += ' ' + b.subContent;
    if (b.items) t += ' ' + b.items.join(' ');
    if (b.emphasis) t += ' ' + b.emphasis;
    return t;
  }).join(' ');
}

// ============================================================
// 테스트 실행
// ============================================================

console.log('='.repeat(70));
console.log('  상세페이지 설득형 콘텐츠 종합 검증 테스트');
console.log('  (CPG 프로필 격리 + forbiddenTerms + 교차오염 + 변수미해석)');

const allCategories = [];
for (const [code, detail] of Object.entries(catDetails)) {
  if (detail.p.startsWith('도서')) continue;
  allCategories.push({ code, path: detail.p });
}

const SEEDS = ['seller-alpha', 'seller-beta', 'seller-gamma'];

console.log(`  대상: ${allCategories.length}개 소분류 × ${SEEDS.length}시드 = ${allCategories.length * SEEDS.length}건`);
console.log(`  CPG 프로필: ${profileCache.size}개 로드됨`);
console.log('='.repeat(70));
console.log();

let totalTests = 0, totalPassed = 0, totalFailed = 0;
const failures = [];
const catFailCount = {};
const failTypeCount = { CROSS_CATEGORY: 0, HEALTH_CROSS: 0, FORBIDDEN_TERM: 0, UNRESOLVED_VAR: 0, EMPTY_CONTENT: 0 };

// 대분류별 카운트 (진행률 표시)
const topCatTotal = {};
for (const cat of allCategories) {
  const top = inferTopCategory((cat.path.split('>')[0]||'').trim(), cat.path);
  topCatTotal[top] = (topCatTotal[top] || 0) + 1;
}

let processedCount = 0;

for (const cat of allCategories) {
  const productName = generateProductName(cat.path);
  const topCatKey = inferTopCategory((cat.path.split('>')[0]||'').trim(), cat.path);

  for (let si = 0; si < SEEDS.length; si++) {
    totalTests++;
    let failed = false;

    // 설득형 콘텐츠 생성
    const result = generatePersuasionContent(productName, cat.path, SEEDS[si], si, cat.code);
    const fullText = blocksToText(result.blocks);

    // ── 검증 1: 빈 콘텐츠 ──
    if (fullText.trim().length < 30) {
      failed = true;
      failTypeCount.EMPTY_CONTENT++;
      if (failures.length < 80) {
        failures.push({ code: cat.code, path: cat.path, productName, catKey: topCatKey, type: 'EMPTY_CONTENT', matched: `length=${fullText.length}`, context: fullText.slice(0, 100) });
      }
    }

    // ── 검증 2: 대분류 교차 오염 ──
    if (!failed) {
      const forbiddenRegex = HARD_FORBIDDEN[topCatKey];
      if (forbiddenRegex) {
        const match = fullText.match(forbiddenRegex);
        if (match) {
          failed = true;
          failTypeCount.CROSS_CATEGORY++;
          if (failures.length < 80) {
            failures.push({ code: cat.code, path: cat.path, productName, catKey: topCatKey, type: 'CROSS_CATEGORY', matched: match[0], context: fullText.slice(Math.max(0, match.index - 30), match.index + match[0].length + 30) });
          }
        }
      }
    }

    // ── 검증 3: 건강식품 성분 교차오염 ──
    if (!failed && topCatKey === '식품' && cat.path.includes('건강식품')) {
      for (const [ruleKey, rule] of Object.entries(HEALTH_CROSS_CHECK)) {
        if (rule.test.test(productName)) {
          const forbMatch = fullText.match(rule.forbid);
          if (forbMatch) {
            failed = true;
            failTypeCount.HEALTH_CROSS++;
            if (failures.length < 80) {
              failures.push({ code: cat.code, path: cat.path, productName, catKey: topCatKey, type: 'HEALTH_CROSS', ruleKey, matched: forbMatch[0], context: fullText.slice(Math.max(0, forbMatch.index - 30), forbMatch.index + forbMatch[0].length + 30) });
            }
          }
          break;
        }
      }
    }

    // ── 검증 4: forbiddenTerms 위반 (CPG 프로필의 금지어가 콘텐츠에 포함) ──
    if (!failed && result.profile && result.profile.forbiddenTerms) {
      for (const term of result.profile.forbiddenTerms) {
        if (fullText.includes(term)) {
          failed = true;
          failTypeCount.FORBIDDEN_TERM++;
          if (failures.length < 80) {
            const idx = fullText.indexOf(term);
            failures.push({ code: cat.code, path: cat.path, productName, catKey: topCatKey, type: 'FORBIDDEN_TERM', matched: term, profileId: result.profile.groupId, context: fullText.slice(Math.max(0, idx - 30), idx + term.length + 30) });
          }
          break;
        }
      }
    }

    // ── 검증 5: 미해석 변수 ──
    if (!failed) {
      const unresolvedMatch = fullText.match(/\{([^}]{1,10})\}/);
      if (unresolvedMatch) {
        failed = true;
        failTypeCount.UNRESOLVED_VAR++;
        if (failures.length < 80) {
          failures.push({ code: cat.code, path: cat.path, productName, catKey: topCatKey, type: 'UNRESOLVED_VAR', matched: unresolvedMatch[0], context: fullText.slice(Math.max(0, unresolvedMatch.index - 20), unresolvedMatch.index + 40) });
        }
      }
    }

    if (failed) {
      totalFailed++;
      catFailCount[topCatKey] = (catFailCount[topCatKey] || 0) + 1;
    } else {
      totalPassed++;
    }
  }

  processedCount++;
  if (processedCount % 2000 === 0) {
    process.stdout.write(`  ... ${processedCount}/${allCategories.length} 카테고리 처리됨 (${totalFailed} fail)\n`);
  }
}

// ─── 결과 출력 ──────────────────────────────────────────────

console.log();
console.log('─── 대분류별 결과 (설득형 콘텐츠) ───');
for (const [ck, count] of Object.entries(topCatTotal).sort((a, b) => b[1] - a[1])) {
  const failC = catFailCount[ck] || 0;
  const totalC = count * SEEDS.length;
  const status = failC === 0 ? '✓' : '✗';
  console.log(`  ${status} ${ck}: ${totalC - failC}/${totalC} PASS${failC > 0 ? ` (${failC} FAIL)` : ''}`);
}
console.log();

console.log('─── 실패 유형별 집계 ───');
for (const [type, count] of Object.entries(failTypeCount)) {
  if (count > 0) console.log(`  ${type}: ${count}건`);
}
if (Object.values(failTypeCount).every(c => c === 0)) console.log('  (없음)');
console.log();

if (failures.length > 0) {
  console.log('─── 실패 상세 (최대 80건) ───');
  for (const f of failures) {
    console.log(`  [${f.type}] ${f.path}`);
    console.log(`    상품명: ${f.productName}`);
    console.log(`    매칭: "${f.matched}" ${f.ruleKey ? `(${f.ruleKey})` : ''}${f.profileId ? ` [profile: ${f.profileId}]` : ''}`);
    console.log(`    컨텍스트: ...${f.context}...`);
    console.log();
  }
}

// ─── 샘플 출력: 카테고리별 1건씩 상세 내용 확인 ───
console.log('─── 카테고리별 샘플 상세페이지 콘텐츠 ───');
const sampleCategories = [
  { name: '뉴트리원 루테인 지아잔틴 60캡슐', path: '식품>건강식품>기타건강식품>루테인', code: '58920' },
  { name: '종근당 밀크씨슬 간건강 90정', path: '식품>건강식품>기타건강식품>밀크시슬', code: '58926' },
  { name: '프리미엄 글루코사민 관절건강 180정', path: '식품>건강식품>기타건강식품>글루코사민', code: '58927' },
  { name: '라네즈 워터 슬리핑 마스크', path: '뷰티>스킨케어>마스크/팩', code: '' },
  { name: '삼성 비스포크 냉장고 870L', path: '가전/디지털>냉장고/밥솥/주방가전>냉장고', code: '' },
  { name: '나이키 에어맥스 90 운동화', path: '패션의류잡화>남성패션>남성신발>운동화', code: '' },
  { name: '로얄캐닌 미니 어덜트 사료 3kg', path: '반려/애완용품>강아지 사료/간식/영양제>사료', code: '' },
  { name: '캠핑문 원터치 텐트 3-4인용', path: '스포츠/레져>캠핑>텐트/타프', code: '' },
  { name: '피셔프라이스 아기 체육관 놀이매트', path: '완구/취미>신생아/영아완구>체육관', code: '' },
  { name: '3M 자동차 유리막 코팅제', path: '자동차용품>세차/관리용품>왁스/코팅', code: '' },
];

for (const sample of sampleCategories) {
  const result = generatePersuasionContent(sample.name, sample.path, 'sample-seller', 0, sample.code);
  console.log(`\n  ▸ [${sample.path.split('>')[0]}] ${sample.name}`);
  console.log(`    프레임워크: ${result.framework}`);
  if (result.profile) console.log(`    CPG 프로필: ${result.profile.displayName} (forbiddenTerms: ${result.profile.forbiddenTerms?.length || 0}개)`);
  for (const block of result.blocks) {
    let text = block.content;
    if (block.subContent) text += ' | ' + block.subContent;
    if (block.items) text += ' | [' + block.items.join(', ') + ']';
    console.log(`    ${block.type}: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`);
  }
}

console.log();
console.log('='.repeat(70));
if (totalFailed === 0) {
  console.log(`  ★ 전체 통과! ${totalTests}건 설득형 콘텐츠 교차 오염 0건 ★`);
} else {
  console.log(`  ✗ ${totalFailed}건 오염 발견 (${totalTests}건 중)`);
}
console.log(`  PASS: ${totalPassed} | FAIL: ${totalFailed}`);
console.log('='.repeat(70));

if (totalFailed > 0) process.exit(1);
