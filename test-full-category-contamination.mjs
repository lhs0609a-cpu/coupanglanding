// ============================================================
// 전체 카테고리 교차 오염 테스트
//
// 모든 13개 대분류 × 서브카테고리 × 대표 상품으로 리뷰를 생성하고
// 다른 카테고리의 용어가 섞여있는지 검증
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 데이터 로드 ────────────────────────────────────────────

const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const reviewFrameData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/real-review-frames.json'), 'utf-8'));

const FRAMES = reviewFrameData.frames;
const FRAGMENTS = reviewFrameData.fragments;
const CATEGORY_ALIASES = reviewFrameData.categoryAliases;
const VARIABLES = storyData.variables;

// ─── seeded-random.ts 포팅 ──────────────────────────────────

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

// ─── real-review-composer.ts 로직 포팅 ──────────────────────

function getReviewCategoryKey(categoryPath) {
  const top = (categoryPath.split('>')[0] || '').trim();
  if (top.includes('뷰티') || top.includes('화장품')) return '뷰티';
  if (top.includes('식품') || top.includes('건강식품')) return '식품';
  if (top.includes('생활') || categoryPath.includes('세제') || categoryPath.includes('욕실') || categoryPath.includes('수납')) return '생활용품';
  if (top.includes('가전') || top.includes('디지털')) return '가전/디지털';
  if (top.includes('패션') || top.includes('의류')) return '패션의류잡화';
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

function resolveFragmentCategory(catKey) {
  if (FRAGMENTS[catKey]) return catKey;
  if (CATEGORY_ALIASES[catKey]) return CATEGORY_ALIASES[catKey];
  return 'DEFAULT';
}

function hasFinalConsonant(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

function fixKoreanParticles(text) {
  return text
    .replace(/([\uAC00-\uD7A3])(이|가)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '이' : '가') + sp)
    .replace(/([\uAC00-\uD7A3])(은|는)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '은' : '는') + sp)
    .replace(/([\uAC00-\uD7A3])(을|를)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '을' : '를') + sp)
    .replace(/([\uAC00-\uD7A3])(으로|로)(\s)/g, (_, prev, _p, sp) =>
      prev + (hasFinalConsonant(prev) ? '으로' : '로') + sp);
}

function fillVariables(text, vars, productName, rng) {
  let result = text.replace(/\{product\}/g, productName);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)];
    }
    return match;
  });
  result = fixKoreanParticles(result);
  return result;
}

function detectProductForm(productName, categoryKey) {
  const n = productName;
  if (categoryKey === '출산/유아동') {
    if (/기저귀|팬티형|밴드형/.test(n)) return 'baby_diaper';
    if (/분유|이유식|유아식|퓨레|핑거푸드/.test(n)) return 'baby_food';
    return 'baby_skincare';
  }
  if (categoryKey === '식품') {
    if (/즙|쥬스|주스|음료|드링크|시럽|진액|원액|농축액|엑기스|액/.test(n)) return 'supplement_liquid';
    if (/캡슐|정제|알약|타블렛|소프트젤/.test(n)) return 'supplement_capsule';
    if (/분말|파우더|가루|환|스틱/.test(n)) return 'supplement_powder';
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|글루코사민|영양제|콜라겐/.test(n)) return 'supplement_capsule';
    if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|정육|한우|돼지|닭|수산물|생선|새우|쌀|잡곡/.test(n)) return 'fresh_food';
    if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|밀키트/.test(n)) return 'processed_food';
    return 'processed_food';
  }
  if (categoryKey === '뷰티') {
    if (/샴푸|린스|트리트먼트|헤어/.test(n)) return 'haircare';
    if (/립|틴트|파운데이션|마스카라|아이라이너|블러셔|팩트|쿠션/.test(n)) return 'makeup';
    if (/바디로션|바디워시|바디크림|핸드크림/.test(n)) return 'bodycare';
    return 'skincare';
  }
  if (categoryKey === '가전/디지털') return 'electronics';
  if (categoryKey === '주방용품') return 'cookware';
  if (categoryKey === '패션의류잡화') return 'fashion';
  if (categoryKey === '자동차용품') return 'automotive';
  return 'default';
}

const FORM_BLOCKLIST = {
  fresh_food:         /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  processed_food:     /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  supplement_liquid:  /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_powder:  /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_capsule: /바르|발라|피부에|도포|씻어서|샐러드|조리|데워/,
  skincare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  haircare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  makeup:             /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  bodycare:           /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  baby_diaper:        /먹[어으고는기이여]|먹여|섭취|\d정|\d포|맛있|바르|발라|피부에|크림|로션|캡슐|알약/,
  baby_food:          /바르|발라|피부에|도포|캡슐|알약|정제|크림|로션|충전|세차/,
  baby_skincare:      /먹[어으고는기이여]|먹여|섭취|\d정|맛있|캡슐|알약|충전|세차/,
  electronics:        /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약/,
  cookware:           /섭취|\d정|바르|발라|피부에|캡슐|알약|충전/,
  fashion:            /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약|충전|세차/,
  automotive:         /먹[어으고는기이]|섭취|\d정|피부에|맛있|캡슐|알약/,
};

function filterByProductForm(values, productName, categoryKey) {
  const form = detectProductForm(productName, categoryKey || 'default');
  const blocklist = FORM_BLOCKLIST[form];
  if (!blocklist) return values;
  const filtered = values.filter(v => !blocklist.test(v));
  return filtered.length > 0 ? filtered : values;
}

function resolveVariablePool(categoryPath, catKey, productName) {
  const parentVars = VARIABLES[catKey] || VARIABLES['DEFAULT'];
  const parts = categoryPath.split('>').map(p => p.trim());

  if (parts.length >= 2) {
    const subKey = `${parts[0]}>${parts[1]}`;
    if (subKey !== '식품>건강식품') {
      const subVars = VARIABLES[subKey];
      if (subVars) {
        return { ...parentVars, ...subVars };
      }
    }
  }

  if (catKey === '출산/유아동') {
    if (/기저귀|팬티형|밴드형/.test(productName)) {
      const sub = VARIABLES['출산/유아동>기저귀'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/분유/.test(productName)) {
      const sub = VARIABLES['출산/유아동>분유'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/이유식|유아식|퓨레|핑거푸드|유아과자|유아음료/.test(productName)) {
      const sub = VARIABLES['출산/유아동>유아식품'];
      if (sub) return { ...parentVars, ...sub };
    }
  }

  if (catKey === '식품') {
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|캡슐|정제|영양제|글루코사민|콜라겐|건강기능|건강식품|비오틴/.test(productName) ||
        categoryPath.includes('건강식품')) {
      const sub = VARIABLES['식품>건강식품'];
      const healthVars = sub ? { ...parentVars, ...sub } : parentVars;

      const pn = productName.toLowerCase();
      if (/비오틴|모발|탈모|머리카락|손톱/.test(pn)) {
        healthVars['효과1'] = ['모발건강','피부건강','손톱건강','두피건강','모발영양','피부미용','모발강화','케라틴합성'];
        healthVars['효과2'] = ['탈모예방','모발윤기','피부탄력','손톱강화','두피영양'];
        healthVars['성분'] = ['비오틴','비타민B7','판토텐산','아연','셀레늄','비타민E','비타민C','케라틴','시스테인','엽산'];
        healthVars['카테고리'] = ['비오틴','모발영양제','비타민','영양제','건강식품'];
      } else if (/루테인|눈|시력|안구|지아잔틴/.test(pn)) {
        healthVars['효과1'] = ['눈건강','시력보호','눈피로','안구건조','황반건강','눈영양','시력관리','눈노화방지'];
        healthVars['효과2'] = ['눈피로회복','시야선명','블루라이트차단','눈건조개선','안구보호'];
        healthVars['성분'] = ['루테인','지아잔틴','비타민A','베타카로틴','빌베리추출물','아스타잔틴','오메가3','아연','비타민E','마리골드꽃추출물'];
        healthVars['카테고리'] = ['루테인','눈영양제','비타민','영양제','건강식품'];
      } else if (/콘드로이친|상어연골|보스웰리아|글루코사민|관절|무릎|연골|msm/.test(pn)) {
        healthVars['효과1'] = ['관절건강','연골보호','관절유연성','뼈건강','관절영양','연골재생','관절편안함','무릎건강'];
        healthVars['효과2'] = ['관절통완화','보행편안','관절유연','연골강화','움직임개선'];
        healthVars['성분'] = ['콘드로이친','글루코사민','MSM','상어연골','보스웰리아','초록입홍합','칼슘','비타민D','콜라겐','히알루론산'];
        healthVars['카테고리'] = ['관절영양제','글루코사민','영양제','건강식품','관절건강'];
      } else if (/밀크씨슬|간|헤파|실리마린/.test(pn)) {
        healthVars['효과1'] = ['간건강','간보호','간해독','간기능개선','간영양','피로회복','간세포보호','독소배출'];
        healthVars['효과2'] = ['숙취해소','간수치개선','피로감소','활력증진','해독력강화'];
        healthVars['성분'] = ['밀크씨슬','실리마린','UDCA','아티초크','비타민B군','헛개나무열매','강황','울금','타우린','메티오닌'];
        healthVars['카테고리'] = ['밀크씨슬','간영양제','영양제','건강식품','간건강'];
      } else if (/유산균|프로바이오|프리바이오|장|락토|비피더스/.test(pn)) {
        healthVars['효과1'] = ['장건강','소화흡수','장내환경','유익균증식','배변활동','장면역력','장내균형','소화개선'];
        healthVars['효과2'] = ['쾌변','더부룩함해소','소화력향상','장내유익균','배변규칙성'];
        healthVars['성분'] = ['유산균','프로바이오틱스','프리바이오틱스','락토바실러스','비피더스균','모유유래유산균','김치유산균','식이섬유','프락토올리고당','아연'];
        healthVars['카테고리'] = ['유산균','프로바이오틱스','영양제','건강식품','장건강'];
      } else if (/콜라겐|히알루론/.test(pn)) {
        healthVars['효과1'] = ['피부탄력','피부보습','주름개선','피부건강','피부광채','피부영양','피부재생','피부노화방지'];
        healthVars['효과2'] = ['피부윤기','보습력향상','탄력개선','주름감소','피부결개선'];
        healthVars['성분'] = ['콜라겐','히알루론산','엘라스틴','비타민C','세라마이드','코엔자임Q10','석류추출물','비타민E','아스타잔틴','펩타이드'];
        healthVars['카테고리'] = ['콜라겐','이너뷰티','영양제','건강식품','피부영양'];
      } else if (/오메가|크릴|epa|dha|혈관/.test(pn)) {
        healthVars['효과1'] = ['혈관건강','혈행개선','중성지방감소','혈액순환','콜레스테롤관리','심혈관건강','혈압관리','혈관탄력'];
        healthVars['효과2'] = ['혈행촉진','중성지방관리','혈관탄력','심장건강','혈류개선'];
        healthVars['성분'] = ['오메가3','EPA','DHA','크릴오일','어유','rTG오메가3','비타민E','아스타잔틴','인지질','비타민D'];
        healthVars['카테고리'] = ['오메가3','크릴오일','영양제','건강식품','혈관건강'];
      } else if (/홍삼|인삼|면역|홍경천|프로폴리스/.test(pn)) {
        healthVars['효과1'] = ['면역력','피로회복','활력','체력','항산화','기억력','혈액순환','면역강화'];
        healthVars['효과2'] = ['에너지충전','활력개선','면역증진','체력보강','기운회복'];
        healthVars['성분'] = ['홍삼','진세노사이드','인삼사포닌','프로폴리스','플라보노이드','홍경천','아연','비타민C','셀레늄','베타글루칸'];
        healthVars['카테고리'] = ['홍삼','면역영양제','건강식품','영양제','면역건강'];
      } else if (/코엔자임|coq10|유비퀴놀|심장/.test(pn)) {
        healthVars['효과1'] = ['심장건강','항산화','에너지생성','세포보호','혈압관리','심혈관건강','피로회복','활력'];
        healthVars['효과2'] = ['심장기능','항산화력','에너지충전','세포활력','혈관건강'];
        healthVars['성분'] = ['코엔자임Q10','유비퀴놀','비타민E','셀레늄','오메가3','비타민B군','마그네슘','L-카르니틴','알파리포산','아스타잔틴'];
        healthVars['카테고리'] = ['코엔자임Q10','항산화영양제','영양제','건강식품','심장건강'];
      } else if (/마그네슘|칼슘|아연|셀레늄|철분|미네랄/.test(pn)) {
        healthVars['효과1'] = ['뼈건강','근육이완','신경안정','에너지대사','면역력','수면개선','스트레스완화','혈압관리'];
        healthVars['효과2'] = ['근육경련완화','수면질개선','피로감소','뼈밀도유지','면역강화'];
        healthVars['성분'] = ['마그네슘','칼슘','아연','셀레늄','철분','비타민D','비타민K','망간','구리','크롬'];
        healthVars['카테고리'] = ['미네랄','칼슘','영양제','건강식품','뼈건강'];
      } else if (/비타민[cdCD]|비타민\s*[cdCD]|멀티비타민|종합비타민/.test(pn)) {
        healthVars['효과1'] = ['면역력','뼈건강','항산화','에너지대사','피부건강','활력','영양균형','피로회복'];
        healthVars['효과2'] = ['면역강화','에너지충전','뼈밀도유지','피부건강','활력개선'];
        healthVars['성분'] = ['비타민C','비타민D','비타민B군','비타민E','비타민A','비타민K','나이아신','엽산','판토텐산','비오틴'];
        healthVars['카테고리'] = ['비타민','멀티비타민','영양제','건강식품','비타민제'];
      } else if (/쏘팔메토|전립선|노코기리야자/.test(pn)) {
        healthVars['효과1'] = ['전립선건강','배뇨기능','남성건강','호르몬균형','소변기능','전립선보호','야간뇨감소','배뇨개선'];
        healthVars['효과2'] = ['전립선기능','배뇨편안','남성활력','전립선보호','소변건강'];
        healthVars['성분'] = ['쏘팔메토','노코기리야자','아연','리코펜','셀레늄','호박씨오일','비타민E','비타민B6','쐐기풀추출물','베타시토스테롤'];
        healthVars['카테고리'] = ['쏘팔메토','남성영양제','영양제','건강식품','전립선건강'];
      } else if (/엽산|임산부|태아/.test(pn)) {
        healthVars['효과1'] = ['태아건강','세포분열','신경관발달','임산부건강','영양보충','DNA합성','혈액생성','면역력'];
        healthVars['효과2'] = ['태아발달','임산부영양','빈혈예방','건강한임신','영양균형'];
        healthVars['성분'] = ['엽산','활성엽산','비타민B12','철분','비타민D','칼슘','DHA','아연','비타민C','마그네슘'];
        healthVars['카테고리'] = ['엽산','임산부영양제','영양제','건강식품','임산부건강'];
      } else if (/가르시니아|다이어트|체지방|CLA|지방/.test(pn)) {
        healthVars['효과1'] = ['체지방감소','식욕억제','대사촉진','지방분해','체중관리','에너지대사','포만감','지방연소'];
        healthVars['효과2'] = ['체중관리','체지방관리','식욕조절','대사개선','지방감소'];
        healthVars['성분'] = ['가르시니아','HCA','녹차추출물','CLA','L-카르니틴','키토산','크롬','카테킨','후코잔틴','공액리놀레산'];
        healthVars['카테고리'] = ['다이어트','체지방관리','영양제','건강식품','체중관리'];
      } else if (/흑마늘|마늘|양파/.test(pn)) {
        healthVars['효과1'] = ['면역력','항산화','피로회복','혈관건강','활력','체력','항균','혈압관리'];
        healthVars['효과2'] = ['면역강화','활력개선','항산화력','피로감소','기운회복'];
        healthVars['성분'] = ['흑마늘','S-알릴시스테인','폴리페놀','알리신','셀레늄','아연','비타민B6','게르마늄','사포닌','항산화성분'];
        healthVars['카테고리'] = ['흑마늘','면역영양제','건강식품','영양제','면역건강'];
      } else if (/프로틴|단백질|BCAA|아미노산|크레아틴|운동/.test(pn)) {
        healthVars['효과1'] = ['근력강화','근육회복','단백질보충','운동능력','체력','근육성장','에너지공급','근지구력'];
        healthVars['효과2'] = ['근육회복','운동효과','근력향상','체력증진','근육합성'];
        healthVars['성분'] = ['유청단백질','WPI','WPC','BCAA','L-글루타민','크레아틴','아미노산','카제인','대두단백','콜라겐펩타이드'];
        healthVars['카테고리'] = ['프로틴','단백질보충제','영양제','건강식품','운동보충제'];
      } else if (/스피루리나|클로렐라|녹즙|녹색/.test(pn)) {
        healthVars['효과1'] = ['영양균형','항산화','면역력','디톡스','에너지','철분보충','영양보충','해독'];
        healthVars['효과2'] = ['영양보충','항산화력','면역강화','에너지충전','해독력'];
        healthVars['성분'] = ['스피루리나','클로렐라','피코시아닌','클로로필','철분','단백질','비타민B12','감마리놀렌산','베타카로틴','아연'];
        healthVars['카테고리'] = ['스피루리나','클로렐라','영양제','건강식품','녹색영양'];
      }

      return healthVars;
    }
    if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|정육|한우|돼지|닭|수산물|생선|새우|쌀|잡곡/.test(productName) ||
        categoryPath.includes('신선식품')) {
      const sub = VARIABLES['식품>신선식품'];
      if (sub) return { ...parentVars, ...sub };
    }
    if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|밀키트|간편식/.test(productName) ||
        categoryPath.includes('가공식품')) {
      const sub = VARIABLES['식품>가공식품'];
      if (sub) return { ...parentVars, ...sub };
    }
  }

  return parentVars;
}

function sanitizeByProductForm(text, productName, categoryKey) {
  const form = detectProductForm(productName, categoryKey);
  const blocklist = FORM_BLOCKLIST[form];
  if (!blocklist) return text;
  const sentences = text.split(/(?<=[.!?。요])\s+/);
  const cleaned = sentences.filter(s => !blocklist.test(s));
  if (cleaned.length === 0) return '';
  return cleaned.join(' ');
}

function composeFragment(pool, rng, productName, categoryKey) {
  const filteredOpeners = productName ? filterByProductForm(pool.openers, productName, categoryKey) : pool.openers;
  const openers = filteredOpeners.length > 0 ? filteredOpeners : pool.openers;
  const opener = openers[Math.floor(rng() * openers.length)] || '';
  const filteredValues = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = filteredValues.length > 0 ? filteredValues : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';
  const filteredClosers = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = filteredClosers.length > 0 ? filteredClosers : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';
  return [opener, value, closer].filter(p => p.length > 0).join(' ');
}

function composeExtraFragment(pool, rng, productName, categoryKey) {
  const filteredValues = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = filteredValues.length > 0 ? filteredValues : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';
  const filteredClosers = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = filteredClosers.length > 0 ? filteredClosers : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';
  return [value, closer].filter(p => p.length > 0).join(' ');
}

const CATEGORY_FRAME_WEIGHTS = {
  '뷰티': ['CONCLUSION_FIRST', 'COMPARISON', 'DAILY_LIFE', 'GIFT_STORY', 'REPURCHASE'],
  '식품': ['CONCLUSION_FIRST', 'REPURCHASE', 'GIFT_STORY', 'DAILY_LIFE', 'COMPARISON'],
  '생활용품': ['DAILY_LIFE', 'REPURCHASE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'COMPARISON'],
  '가전/디지털': ['COMPARISON', 'CONCLUSION_FIRST', 'DAILY_LIFE', 'REPURCHASE', 'GIFT_STORY'],
  '패션의류잡화': ['DAILY_LIFE', 'CONCLUSION_FIRST', 'COMPARISON', 'GIFT_STORY', 'REPURCHASE'],
  '가구/홈데코': ['COMPARISON', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'REPURCHASE'],
  '출산/유아동': ['GIFT_STORY', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'REPURCHASE', 'COMPARISON'],
  '스포츠/레져': ['DAILY_LIFE', 'COMPARISON', 'CONCLUSION_FIRST', 'REPURCHASE', 'GIFT_STORY'],
  '반려/애완용품': ['DAILY_LIFE', 'GIFT_STORY', 'REPURCHASE', 'CONCLUSION_FIRST', 'COMPARISON'],
  '주방용품': ['DAILY_LIFE', 'COMPARISON', 'REPURCHASE', 'CONCLUSION_FIRST', 'GIFT_STORY'],
  '문구/오피스': ['DAILY_LIFE', 'CONCLUSION_FIRST', 'GIFT_STORY', 'COMPARISON', 'REPURCHASE'],
  '완구/취미': ['GIFT_STORY', 'DAILY_LIFE', 'CONCLUSION_FIRST', 'COMPARISON', 'REPURCHASE'],
  '자동차용품': ['COMPARISON', 'CONCLUSION_FIRST', 'DAILY_LIFE', 'REPURCHASE', 'GIFT_STORY'],
  'DEFAULT': ['CONCLUSION_FIRST', 'DAILY_LIFE', 'COMPARISON', 'REPURCHASE', 'GIFT_STORY'],
};

function selectFrame(catKey, rng) {
  const weights = CATEGORY_FRAME_WEIGHTS[catKey] || CATEGORY_FRAME_WEIGHTS['DEFAULT'];
  return weights[Math.floor(rng() * weights.length)];
}

const PADDING_SECTIONS = ['experience', 'detail', 'daily_routine', 'motivation'];

function generateRealReview(productName, categoryPath, sellerSeed, productIndex) {
  const catKey = getReviewCategoryKey(categoryPath);
  const fragCatKey = resolveFragmentCategory(catKey);
  const vars = resolveVariablePool(categoryPath, catKey, productName);
  const seed = stringToSeed(`${sellerSeed}::realreview::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);
  const cleanName = productName
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  const frameId = selectFrame(catKey, rng);
  const frame = FRAMES[frameId];
  const fragments = FRAGMENTS[fragCatKey] || FRAGMENTS['DEFAULT'];
  const paragraphs = [];

  for (const section of frame.structure) {
    const pool = fragments[section];
    if (!pool) continue;
    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const sanitized = sanitizeByProductForm(filled, productName, catKey);
    if (sanitized.trim().length > 5) {
      paragraphs.push(sanitized.trim());
    }
    if ((section === 'experience' || section === 'detail' || section === 'backstory') && pool.values.length > 2) {
      const extra = composeExtraFragment(pool, rng, productName, catKey);
      const filledExtra = fillVariables(extra, vars, cleanName, rng);
      const sanitizedExtra = sanitizeByProductForm(filledExtra, productName, catKey);
      if (sanitizedExtra.trim().length > 5) {
        const lastIdx = paragraphs.length - 1;
        if (lastIdx >= 0) {
          paragraphs[lastIdx] += ' ' + sanitizedExtra.trim();
        }
      }
    }
  }

  let totalChars = paragraphs.join('').length;
  let padIdx = 0;
  while (totalChars < 400 && padIdx < PADDING_SECTIONS.length) {
    const section = PADDING_SECTIONS[padIdx++];
    const pool = fragments[section];
    if (!pool) continue;
    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const sanitizedPad = sanitizeByProductForm(filled, productName, catKey);
    if (sanitizedPad.trim().length > 5) {
      const verdictIdx = paragraphs.length - 1;
      if (verdictIdx >= 0) paragraphs.splice(verdictIdx, 0, sanitizedPad.trim());
      else paragraphs.push(sanitizedPad.trim());
      totalChars += sanitizedPad.trim().length;
    }
  }

  return { paragraphs, frameId, catKey, fragCatKey, vars };
}

// ============================================================
// 테스트 데이터: 전체 카테고리 × 대표 상품
// ============================================================

const TEST_PRODUCTS = [
  // ─── 뷰티 (4 subcategories) ───
  { name: '히알루론산 수분 토너 200ml', category: '뷰티>스킨>토너', expectedCat: '뷰티' },
  { name: '비타민C 브라이트닝 세럼 30ml', category: '뷰티>스킨>세럼', expectedCat: '뷰티' },
  { name: '콜라겐 탄력 크림 50ml', category: '뷰티>스킨>크림', expectedCat: '뷰티' },
  { name: '레티놀 주름개선 앰플 20ml', category: '뷰티>스킨>앰플', expectedCat: '뷰티' },
  { name: '롱래스팅 매트 립스틱', category: '뷰티>메이크업>립', expectedCat: '뷰티' },
  { name: '촉촉 커버 쿠션 파운데이션', category: '뷰티>메이크업>파운데이션', expectedCat: '뷰티' },
  { name: '워터프루프 마스카라', category: '뷰티>메이크업>마스카라', expectedCat: '뷰티' },
  { name: '두피 케어 탈모방지 샴푸 500ml', category: '뷰티>헤어>샴푸', expectedCat: '뷰티' },
  { name: '케라틴 헤어 트리트먼트 300ml', category: '뷰티>헤어>트리트먼트', expectedCat: '뷰티' },
  { name: '시어버터 바디로션 400ml', category: '뷰티>바디>바디로션', expectedCat: '뷰티' },
  { name: '핸드크림 세트 3종', category: '뷰티>바디>핸드크림', expectedCat: '뷰티' },
  { name: '바디워시 대용량 1000ml', category: '뷰티>바디>바디워시', expectedCat: '뷰티' },

  // ─── 식품 > 건강식품 (18 ingredient types) ───
  { name: '비오틴 5000 모발영양 60정', category: '식품>건강식품>비타민', expectedCat: '식품' },
  { name: '루테인 지아잔틴 눈건강 60캡슐', category: '식품>건강식품>눈건강', expectedCat: '식품' },
  { name: '콘드로이친 1200 관절건강 60정', category: '식품>건강식품>관절', expectedCat: '식품' },
  { name: '글루코사민 MSM 무릎 연골건강', category: '식품>건강식품>관절', expectedCat: '식품' },
  { name: '보스웰리아 관절 편안함 90정', category: '식품>건강식품>관절', expectedCat: '식품' },
  { name: '밀크씨슬 실리마린 간건강 90정', category: '식품>건강식품>간건강', expectedCat: '식품' },
  { name: '유산균 프로바이오틱스 100억 CFU', category: '식품>건강식품>유산균', expectedCat: '식품' },
  { name: '저분자 피쉬 콜라겐 펩타이드 분말', category: '식품>건강식품>콜라겐', expectedCat: '식품' },
  { name: '히알루론산 이너뷰티 콜라겐', category: '식품>건강식품>콜라겐', expectedCat: '식품' },
  { name: 'rTG 오메가3 EPA DHA 60캡슐', category: '식품>건강식품>오메가3', expectedCat: '식품' },
  { name: '남극 크릴오일 인지질 오메가3', category: '식품>건강식품>오메가3', expectedCat: '식품' },
  { name: '6년근 홍삼정 면역력 증진', category: '식품>건강식품>홍삼', expectedCat: '식품' },
  { name: '프로폴리스 면역력 강화 60캡슐', category: '식품>건강식품>프로폴리스', expectedCat: '식품' },
  { name: '코엔자임Q10 유비퀴놀 심장건강', category: '식품>건강식품>코엔자임', expectedCat: '식품' },
  { name: '마그네슘 400mg 수면 도움', category: '식품>건강식품>미네랄', expectedCat: '식품' },
  { name: '칼슘 비타민D 뼈건강', category: '식품>건강식품>미네랄', expectedCat: '식품' },
  { name: '아연 셀레늄 면역 미네랄', category: '식품>건강식품>미네랄', expectedCat: '식품' },
  { name: '비타민C 1000mg 메가도스', category: '식품>건강식품>비타민', expectedCat: '식품' },
  { name: '멀티비타민 종합영양제 90정', category: '식품>건강식품>비타민', expectedCat: '식품' },
  { name: '쏘팔메토 전립선 건강', category: '식품>건강식품>남성건강', expectedCat: '식품' },
  { name: '엽산 400 임산부 영양제', category: '식품>건강식품>엽산', expectedCat: '식품' },
  { name: '가르시니아 다이어트 체지방감소', category: '식품>건강식품>다이어트', expectedCat: '식품' },
  { name: '흑마늘 진액 면역력 강화', category: '식품>건강식품>흑마늘', expectedCat: '식품' },
  { name: '프로틴 유청단백질 WPI 초코', category: '식품>건강식품>프로틴', expectedCat: '식품' },
  { name: '스피루리나 클로렐라 녹색 영양제', category: '식품>건강식품>스피루리나', expectedCat: '식품' },
  { name: 'BCAA 아미노산 운동 보충제', category: '식품>건강식품>프로틴', expectedCat: '식품' },

  // ─── 식품 > 신선식품 ───
  { name: '제주 한라봉 5kg 선물세트', category: '식품>신선식품>과일', expectedCat: '식품' },
  { name: '유기농 딸기 500g', category: '식품>신선식품>과일', expectedCat: '식품' },
  { name: '1++ 한우 등심 500g', category: '식품>신선식품>정육', expectedCat: '식품' },
  { name: '완도 전복 1kg 활전복', category: '식품>신선식품>수산물', expectedCat: '식품' },
  { name: '이천쌀 10kg 신동진', category: '식품>신선식품>쌀', expectedCat: '식품' },

  // ─── 식품 > 가공식품 ───
  { name: '신라면 멀티팩 20개입', category: '식품>가공식품>라면', expectedCat: '식품' },
  { name: '치킨 너겟 냉동 1kg', category: '식품>가공식품>냉동', expectedCat: '식품' },
  { name: '쉐프의 밀키트 갈비찜 2인분', category: '식품>가공식품>밀키트', expectedCat: '식품' },
  { name: '프리미엄 과자 선물세트', category: '식품>가공식품>과자', expectedCat: '식품' },

  // ─── 생활용품 (3 subcategories) ───
  { name: '프리미엄 세탁세제 2.5L', category: '생활용품>세제>세탁세제', expectedCat: '생활용품' },
  { name: '아기 전용 섬유유연제 1.5L', category: '생활용품>세제>섬유유연제', expectedCat: '생활용품' },
  { name: '곰팡이 제거 욕실 클리너', category: '생활용품>욕실용품>클리너', expectedCat: '생활용품' },
  { name: '규조토 발매트 대형', category: '생활용품>욕실용품>발매트', expectedCat: '생활용품' },
  { name: '접이식 수납박스 3종 세트', category: '생활용품>수납/정리>수납박스', expectedCat: '생활용품' },
  { name: '옷걸이 50개 논슬립', category: '생활용품>수납/정리>옷걸이', expectedCat: '생활용품' },
  { name: '냄새없는 음식물 쓰레기통', category: '생활용품>주방>쓰레기통', expectedCat: '생활용품' },

  // ─── 가전/디지털 (5 subcategories) ───
  { name: '무선 싸이클론 청소기 350W', category: '가전/디지털>청소가전>무선청소기', expectedCat: '가전/디지털' },
  { name: '로봇청소기 LDS 레이저 센서', category: '가전/디지털>청소가전>로봇청소기', expectedCat: '가전/디지털' },
  { name: '6인용 에어프라이어 대용량', category: '가전/디지털>주방가전>에어프라이어', expectedCat: '가전/디지털' },
  { name: '인덕션 3구 빌트인', category: '가전/디지털>주방가전>인덕션', expectedCat: '가전/디지털' },
  { name: 'OLED 65인치 스마트TV', category: '가전/디지털>영상가전>TV', expectedCat: '가전/디지털' },
  { name: '게이밍 모니터 144Hz 27인치', category: '가전/디지털>영상가전>모니터', expectedCat: '가전/디지털' },
  { name: '인버터 벽걸이 에어컨 18평형', category: '가전/디지털>계절가전>에어컨', expectedCat: '가전/디지털' },
  { name: '세라믹 히터 급속난방', category: '가전/디지털>계절가전>히터', expectedCat: '가전/디지털' },
  { name: '초음파 가습기 대용량 4L', category: '가전/디지털>계절가전>가습기', expectedCat: '가전/디지털' },
  { name: '전동 안마기 목 어깨 EMS', category: '가전/디지털>건강가전>안마기', expectedCat: '가전/디지털' },
  { name: '음파 전동칫솔 충전식', category: '가전/디지털>건강가전>전동칫솔', expectedCat: '가전/디지털' },
  { name: '노트북 인텔 13세대 i7 512GB', category: '가전/디지털>PC>노트북', expectedCat: '가전/디지털' },

  // ─── 패션의류잡화 (3 subcategories) ───
  { name: '오버핏 옥스포드 셔츠 남성', category: '패션의류잡화>남성의류>셔츠', expectedCat: '패션의류잡화' },
  { name: '슬림핏 치노팬츠 남성', category: '패션의류잡화>남성의류>바지', expectedCat: '패션의류잡화' },
  { name: '플리스 후리스 자켓 남성', category: '패션의류잡화>남성의류>자켓', expectedCat: '패션의류잡화' },
  { name: '쉬폰 플리츠 원피스 여성', category: '패션의류잡화>여성의류>원피스', expectedCat: '패션의류잡화' },
  { name: '울 블렌드 가디건 여성', category: '패션의류잡화>여성의류>가디건', expectedCat: '패션의류잡화' },
  { name: '캐주얼 노트북 백팩 15.6인치', category: '패션의류잡화>가방>백팩', expectedCat: '패션의류잡화' },
  { name: '여성 크로스백 미니 가죽', category: '패션의류잡화>가방>크로스백', expectedCat: '패션의류잡화' },
  { name: '런닝화 남녀공용 메쉬 경량', category: '패션의류잡화>신발>운동화', expectedCat: '패션의류잡화' },

  // ─── 가구/홈데코 (3 subcategories) ───
  { name: '메모리폼 매트리스 퀸 사이즈', category: '가구/홈데코>침대>매트리스', expectedCat: '가구/홈데코' },
  { name: '라텍스 토퍼 슈퍼싱글', category: '가구/홈데코>침대>토퍼', expectedCat: '가구/홈데코' },
  { name: '3인용 패브릭 소파 그레이', category: '가구/홈데코>소파>3인소파', expectedCat: '가구/홈데코' },
  { name: '1인용 리클라이너 소파', category: '가구/홈데코>소파>리클라이너', expectedCat: '가구/홈데코' },
  { name: 'LED 무드등 간접조명 스탠드', category: '가구/홈데코>조명>무드등', expectedCat: '가구/홈데코' },
  { name: '원목 수납 책장 5단', category: '가구/홈데코>책장>수납', expectedCat: '가구/홈데코' },
  { name: '화이트 미니멀 컴퓨터 책상', category: '가구/홈데코>책상>컴퓨터책상', expectedCat: '가구/홈데코' },

  // ─── 출산/유아동 (3 subcategories) ───
  { name: '팬티형 기저귀 대형 50매', category: '출산/유아동>기저귀>팬티형', expectedCat: '출산/유아동' },
  { name: '밴드형 기저귀 신생아 80매', category: '출산/유아동>기저귀>밴드형', expectedCat: '출산/유아동' },
  { name: '산양 분유 2단계 800g', category: '출산/유아동>분유>산양분유', expectedCat: '출산/유아동' },
  { name: '유기농 쌀 이유식 초기', category: '출산/유아동>유아식품>이유식', expectedCat: '출산/유아동' },
  { name: '유아 과자 퓨레 10봉', category: '출산/유아동>유아식품>퓨레', expectedCat: '출산/유아동' },
  { name: '유아 보습 로션 순한 300ml', category: '출산/유아동>유아스킨케어>로션', expectedCat: '출산/유아동' },
  { name: '아기 물티슈 캡형 100매', category: '출산/유아동>위생용품>물티슈', expectedCat: '출산/유아동' },

  // ─── 스포츠/레져 (3 subcategories) ───
  { name: '카본 드라이버 10.5도 R샤프트', category: '스포츠/레져>골프>드라이버', expectedCat: '스포츠/레져' },
  { name: '투어 골프공 3피스 12개입', category: '스포츠/레져>골프>골프공', expectedCat: '스포츠/레져' },
  { name: '4인용 원터치 텐트 자동 팝업', category: '스포츠/레져>캠핑>텐트', expectedCat: '스포츠/레져' },
  { name: '캠핑 침낭 동계 -15도', category: '스포츠/레져>캠핑>침낭', expectedCat: '스포츠/레져' },
  { name: '가정용 덤벨 세트 20kg', category: '스포츠/레져>헬스>덤벨', expectedCat: '스포츠/레져' },
  { name: 'TPE 요가매트 6mm 논슬립', category: '스포츠/레져>헬스>요가매트', expectedCat: '스포츠/레져' },
  { name: '쿠셔닝 런닝화 조깅화 남성', category: '스포츠/레져>런닝>런닝화', expectedCat: '스포츠/레져' },

  // ─── 반려/애완용품 (2 subcategories) ───
  { name: '연어 사료 소형견 전용 6kg', category: '반려/애완용품>강아지>사료', expectedCat: '반려/애완용품' },
  { name: '강아지 간식 오리 저키 300g', category: '반려/애완용품>강아지>간식', expectedCat: '반려/애완용품' },
  { name: '강아지 관절 영양제 글루코사민', category: '반려/애완용품>강아지>영양제', expectedCat: '반려/애완용품' },
  { name: '고양이 참치 사료 전연령 5kg', category: '반려/애완용품>고양이>사료', expectedCat: '반려/애완용품' },
  { name: '고양이 스크래처 캣타워 대형', category: '반려/애완용품>고양이>캣타워', expectedCat: '반려/애완용품' },
  { name: '강아지 배변패드 100매 대형', category: '반려/애완용품>강아지>배변패드', expectedCat: '반려/애완용품' },

  // ─── 주방용품 ───
  { name: '세라믹 코팅 프라이팬 28cm', category: '주방용품>프라이팬', expectedCat: '주방용품' },
  { name: '스테인리스 냄비세트 4종', category: '주방용품>냄비', expectedCat: '주방용품' },
  { name: '진공 스텐 텀블러 500ml', category: '주방용품>텀블러', expectedCat: '주방용품' },
  { name: '밀폐용기 세트 유리 10종', category: '주방용품>밀폐용기', expectedCat: '주방용품' },
  { name: '항균 도마 TPU 대형', category: '주방용품>도마', expectedCat: '주방용품' },

  // ─── 문구/오피스 ───
  { name: '제트스트림 볼펜 0.5mm 10본', category: '문구/오피스>필기구>볼펜', expectedCat: '문구/오피스' },
  { name: '가죽 다이어리 A5 위클리', category: '문구/오피스>노트>다이어리', expectedCat: '문구/오피스' },
  { name: '점착 메모지 포스트잇 5색', category: '문구/오피스>점착메모>메모지', expectedCat: '문구/오피스' },
  { name: '프리미엄 만년필 F촉', category: '문구/오피스>필기구>만년필', expectedCat: '문구/오피스' },

  // ─── 완구/취미 ───
  { name: '레고 시티 경찰서 세트 1000피스', category: '완구/취미>블록>레고', expectedCat: '완구/취미' },
  { name: '가족 보드게임 루미큐브', category: '완구/취미>보드게임>루미큐브', expectedCat: '완구/취미' },
  { name: '어린이 미술 크레파스 64색', category: '완구/취미>미술>크레파스', expectedCat: '완구/취미' },
  { name: '코딩 로봇 교육완구 6세+', category: '완구/취미>로봇>코딩로봇', expectedCat: '완구/취미' },
  { name: '피규어 건담 MG 1/100', category: '완구/취미>피규어>프라모델', expectedCat: '완구/취미' },

  // ─── 자동차용품 ───
  { name: '카나우바 왁스 프리미엄 광택', category: '자동차용품>왁스>카나우바', expectedCat: '자동차용품' },
  { name: '세라믹 코팅제 9H 유리막', category: '자동차용품>코팅제>유리막', expectedCat: '자동차용품' },
  { name: '고압 세차건 워터건', category: '자동차용품>세차용품>세차건', expectedCat: '자동차용품' },
  { name: '차량용 방향제 블랙아이스', category: '자동차용품>방향제>차량용', expectedCat: '자동차용품' },
  { name: '블랙박스 2채널 QHD 64GB', category: '자동차용품>블랙박스>전후방', expectedCat: '자동차용품' },
];

// ============================================================
// 교차 오염 감지 규칙
//
// 각 카테고리에서 절대 나와서는 안 되는 다른 카테고리의 핵심 용어
// ============================================================

const CROSS_CONTAMINATION_RULES = {
  '뷰티': {
    forbidden: [
      // 식품/건강식품 용어 (단, 뷰티 성분과 겹치는 것은 제외)
      /섭취|복용|캡슐|알약|정제|CFU|균주|장건강|소화|배변|간건강|간보호|혈관건강|혈당|중성지방|관절|연골|무릎|전립선|태아|임산부영양/,
      // 가전 용어
      /흡입력|냉방|난방|인버터|사이클론|해상도|화소|와트|볼트|주파수/,
      // 자동차 용어 (카나우바왁스는 화장품 성분이므로 제외)
      /세차|(?<!카나우바)왁스|코팅제|발수|엔진|연비|블랙박스|주행/,
      // 패션 용어 (핏, 통기성 등은 겹칠 수 있으므로 제외)
      /바지|셔츠|자켓|코트|원피스|청바지|드라이버|골프|텐트|침낭/,
      // 반려동물 용어
      /사료|급여|소형견|대형견|고양이|반려|캣타워|배변패드|헤어볼/,
      // 주방 용어
      /프라이팬|냄비|인덕션|에어프라이어|식기세척/,
      // 완구 용어
      /레고|블록|피규어|보드게임/,
    ],
    allowed: /피부|보습|바르|크림|세럼|토너|에센스|앰플|각질|주름|탄력|미백|톤업|진정|모공|리프팅|광채|수분|팩|마스크|클렌징|선크림|자외선|SPF|PA|성분|추출물|피부과|화장|메이크업|립|파운데이션|쿠션|아이|마스카라|블러셔|샴푸|린스|트리트먼트|헤어|두피|모발|바디|핸드크림/
  },
  '식품': {
    forbidden: [
      // 뷰티 용어
      /바르[고는면]|발라[서요]|세안|클렌징|메이크업|파운데이션|쿠션|립스틱|마스카라|아이라이너|발림성|끈적|텍스처|피부결|피부장벽|각질/,
      // 가전 용어
      /흡입력|냉방|난방|인버터|HEPA|사이클론|해상도|화소|모니터|로봇청소기/,
      // 자동차 용어
      /세차|왁스|코팅제|발수|엔진|연비|블랙박스/,
      // 패션 용어
      /착용감|핏|코디|바지|셔츠|원피스|자켓/,
      // 가구 용어
      /매트리스|소파|침대|체압분산|메모리폼|라텍스|책상|서랍장/,
    ],
    allowed: /섭취|복용|맛|먹|식품|영양|건강|비타민|미네랄|성분|효과|면역|항산화|기능|식약처|HACCP|GMP|캡슐|정제|분말|원액|즙|음료|단백질|아미노산|프로바이오|유산균|오메가|콜라겐|루테인|밀크씨슬|홍삼|인삼|간건강|장건강|눈건강|뼈건강|관절|혈관|혈당|콜레스테롤|체지방|다이어트|과일|채소|신선|정육|수산|라면|냉동|밀키트/
  },
  '생활용품': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|탄력|미백|착용감|핏|코디|매트리스|소파|드라이버|골프|블랙박스|엔진|연비/,
    ],
    allowed: /세정|세탁|살균|탈취|청소|세제|욕실|수납|정리|청결|위생|항균|곰팡이|물티슈|빨래|클리너/
  },
  '가전/디지털': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|탄력|미백|세안|클렌징|사료|급여|소형견|고양이|왁스|세차|엔진|연비|드라이버.*샤프트|골프공/,
    ],
    allowed: /가전|디지털|전자|모니터|TV|청소기|에어컨|냉장고|세탁기|건조기|정수기|가습기|제습기|히터|선풍기|로봇|안마|혈압|체중계|노트북|태블릿|성능|배터리|화질|음질|소음|에너지/
  },
  '패션의류잡화': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|흡입력|냉방|난방|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|드라이버.*도|골프공|텐트|침낭/,
    ],
    allowed: /착용|핏|디자인|보온|통기|신축|내구|방수|스타일|편안|가벼|코디|세탁|패션|의류|옷|바지|셔츠|자켓|코트|니트|가방|신발|모자/
  },
  '가구/홈데코': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|탄력.*크림|흡입력|사이클론|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|드라이버.*도|골프공/,
    ],
    allowed: /가구|소파|침대|매트리스|책상|의자|선반|서랍|수납|인테리어|조명|디자인|편안|안정|공간|조립|원목|패브릭|가죽/
  },
  '출산/유아동': {
    forbidden: [
      /세차|왁스|연비|블랙박스|엔진|흡입력|사이클론|로봇청소기|드라이버.*도|골프공|텐트|침낭|프라이팬|인덕션/,
    ],
    allowed: /아기|유아|아이|엄마|임산부|신생아|기저귀|분유|이유식|성장|발달|안전|순한|부드러운|면역|영양/
  },
  '스포츠/레져': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|탄력.*크림|냉방|난방|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|매트리스.*소파|피규어|레고/,
    ],
    allowed: /운동|스포츠|헬스|근력|체력|골프|캠핑|텐트|등산|러닝|요가|덤벨|매트|그립|쿠셔닝|충격흡수|밸런스/
  },
  '반려/애완용품': {
    forbidden: [
      /세차|왁스|연비|블랙박스|엔진|흡입력|사이클론|드라이버.*도|골프공|매트리스|소파|침대|착용감|핏|코디|바지|셔츠/,
    ],
    allowed: /반려|강아지|고양이|사료|간식|급여|모질|피모|관절|체중|구강|헤어볼|배변|장|소화|면역/
  },
  '주방용품': {
    forbidden: [
      /섭취.*정|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|탄력.*크림|흡입력|사이클론|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|드라이버.*도|골프공/,
    ],
    allowed: /주방|요리|조리|프라이팬|냄비|칼|도마|텀블러|밀폐|식기|세척|내열|코팅|논스틱|스테인리스|세라믹/
  },
  '문구/오피스': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|흡입력|냉방|난방|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|드라이버.*도|골프공|매트리스/,
    ],
    allowed: /문구|필기|볼펜|노트|다이어리|펜|만년필|인쇄|종이|정리|수납|메모|바인더|플래너/
  },
  '완구/취미': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르[고는면]|발라[서요]|피부결|주름|흡입력|냉방|난방|사료|급여|소형견|고양이|세차|왁스|연비|블랙박스|매트리스|소파.*가죽/,
    ],
    allowed: /완구|장난감|놀이|블록|퍼즐|보드게임|피규어|레고|미술|크레파스|교육|창의|상상|재미|호기심/
  },
  '자동차용품': {
    forbidden: [
      /섭취|복용|캡슐|알약|바르.*피부|발라.*피부|피부결|주름|탄력.*크림|흡입력|사이클론|사료|급여|소형견|고양이|매트리스|소파|침대|착용감|핏|코디|레고|피규어|보드게임/,
    ],
    allowed: /자동차|차량|세차|왁스|코팅|발수|광택|엔진|연비|블랙박스|주행|거치|시트|매트|선팅|LED/
  },
};

// ============================================================
// 건강식품 특화: 성분 교차오염 규칙
// (콘드로이친 제품에 프로폴리스 나오면 안됨 등)
// ============================================================

const HEALTH_INGREDIENT_RULES = {
  '관절': {
    keywords: /콘드로이친|글루코사민|보스웰리아|MSM|상어연골|관절|무릎|연골/,
    allowedIngredients: /콘드로이친|글루코사민|MSM|상어연골|보스웰리아|초록입홍합|칼슘|비타민D|콜라겐|히알루론산|관절|연골|뼈/,
    forbiddenIngredients: /프로폴리스|루테인|지아잔틴|밀크씨슬|실리마린|유산균|프로바이오|락토바실러스|비피더스|비오틴|엽산|가르시니아|쏘팔메토|스피루리나|클로렐라/,
  },
  '눈건강': {
    keywords: /루테인|지아잔틴|눈|시력|안구/,
    allowedIngredients: /루테인|지아잔틴|비타민A|베타카로틴|빌베리|아스타잔틴|오메가3|아연|비타민E|마리골드|눈|시력|안구|황반/,
    forbiddenIngredients: /프로폴리스|콘드로이친|글루코사민|밀크씨슬|실리마린|유산균|비오틴|엽산|가르시니아|쏘팔메토|스피루리나/,
  },
  '간건강': {
    keywords: /밀크씨슬|실리마린|간건강|간보호|헤파/,
    allowedIngredients: /밀크씨슬|실리마린|UDCA|아티초크|비타민B|헛개|강황|울금|타우린|메티오닌|간/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|글루코사민|유산균|프로바이오|비오틴|엽산|가르시니아|쏘팔메토|스피루리나/,
  },
  '장건강': {
    keywords: /유산균|프로바이오|락토|비피더스|장건강/,
    allowedIngredients: /유산균|프로바이오|프리바이오|락토바실러스|비피더스|모유유래|김치유산균|식이섬유|프락토올리고당|아연|장|소화|배변/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '면역/홍삼': {
    keywords: /홍삼|인삼|프로폴리스|면역|홍경천/,
    allowedIngredients: /홍삼|진세노사이드|인삼|프로폴리스|플라보노이드|홍경천|아연|비타민C|셀레늄|베타글루칸|면역|활력|피로/,
    forbiddenIngredients: /루테인|콘드로이친|글루코사민|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '모발/비오틴': {
    keywords: /비오틴|모발|탈모|머리카락|손톱/,
    allowedIngredients: /비오틴|비타민B7|판토텐산|아연|셀레늄|비타민E|비타민C|케라틴|시스테인|엽산|모발|두피|탈모|손톱/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|가르시니아|쏘팔메토|스피루리나/,
  },
  '콜라겐': {
    keywords: /콜라겐|히알루론/,
    allowedIngredients: /콜라겐|히알루론산|엘라스틴|비타민C|세라마이드|코엔자임Q10|석류|비타민E|아스타잔틴|펩타이드|피부|탄력|보습|주름/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '오메가3': {
    keywords: /오메가|크릴|EPA|DHA|혈관/,
    allowedIngredients: /오메가3|EPA|DHA|크릴오일|어유|rTG|비타민E|아스타잔틴|인지질|비타민D|혈관|혈행|중성지방|콜레스테롤|심혈관/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '코엔자임': {
    keywords: /코엔자임|CoQ10|유비퀴놀|심장/,
    allowedIngredients: /코엔자임|유비퀴놀|비타민E|셀레늄|오메가3|비타민B|마그네슘|L-카르니틴|알파리포산|아스타잔틴|심장|항산화|에너지/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '미네랄': {
    keywords: /마그네슘|칼슘|아연|셀레늄|철분|미네랄/,
    allowedIngredients: /마그네슘|칼슘|아연|셀레늄|철분|비타민D|비타민K|망간|구리|크롬|뼈|근육|신경|수면|미네랄/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|스피루리나/,
  },
  '비타민': {
    keywords: /비타민[CcDd]|멀티비타민|종합비타민/,
    allowedIngredients: /비타민|나이아신|엽산|판토텐산|비오틴|면역|뼈|항산화|에너지|피부건강|피로/,
    forbiddenIngredients: /콘드로이친|밀크씨슬|실리마린|가르시니아|쏘팔메토|스피루리나|클로렐라/,
  },
  '전립선': {
    keywords: /쏘팔메토|전립선|노코기리야자/,
    allowedIngredients: /쏘팔메토|노코기리야자|아연|리코펜|셀레늄|호박씨|비타민E|비타민B6|쐐기풀|베타시토스테롤|전립선|배뇨|남성/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|스피루리나/,
  },
  '엽산': {
    keywords: /엽산|임산부|태아/,
    allowedIngredients: /엽산|활성엽산|비타민B12|철분|비타민D|칼슘|DHA|아연|비타민C|마그네슘|태아|임산부|신경관|세포분열/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '다이어트': {
    keywords: /가르시니아|다이어트|체지방|CLA/,
    allowedIngredients: /가르시니아|HCA|녹차|CLA|L-카르니틴|키토산|크롬|카테킨|후코잔틴|공액리놀레산|체지방|식욕|대사|지방|체중/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|쏘팔메토|스피루리나/,
  },
  '흑마늘': {
    keywords: /흑마늘|마늘|양파/,
    allowedIngredients: /흑마늘|S-알릴시스테인|폴리페놀|알리신|셀레늄|아연|비타민B6|게르마늄|사포닌|항산화|면역|피로|활력/,
    forbiddenIngredients: /루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '프로틴': {
    keywords: /프로틴|단백질|BCAA|아미노산|크레아틴/,
    allowedIngredients: /유청단백|WPI|WPC|BCAA|L-글루타민|크레아틴|아미노산|카제인|대두단백|콜라겐펩타이드|근력|근육|단백질|운동/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토|스피루리나/,
  },
  '스피루리나': {
    keywords: /스피루리나|클로렐라|녹즙/,
    allowedIngredients: /스피루리나|클로렐라|피코시아닌|클로로필|철분|단백질|비타민B12|감마리놀렌산|베타카로틴|아연|영양|항산화|면역|디톡스|해독/,
    forbiddenIngredients: /프로폴리스|루테인|콘드로이친|밀크씨슬|유산균|비오틴|가르시니아|쏘팔메토/,
  },
};

// ============================================================
// 테스트 실행
// ============================================================

console.log('='.repeat(70));
console.log('  전체 카테고리 교차 오염 테스트');
console.log('  대상: ' + TEST_PRODUCTS.length + '개 상품 × 5 프레임 시드');
console.log('='.repeat(70));
console.log();

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];

for (const product of TEST_PRODUCTS) {
  const { name, category, expectedCat } = product;
  const catKey = getReviewCategoryKey(category);

  // 20개 시드로 각각 생성 (다양한 프레임+조각 조합 최대 커버)
  for (let seedIdx = 0; seedIdx < 20; seedIdx++) {
    const sellerSeed = `test-seller-${seedIdx}-${expectedCat}`;
    const result = generateRealReview(name, category, sellerSeed, seedIdx);
    const fullText = result.paragraphs.join(' ');

    totalTests++;

    // 1) 교차 카테고리 오염 체크
    const rules = CROSS_CONTAMINATION_RULES[expectedCat];
    if (rules) {
      for (const forbiddenRegex of rules.forbidden) {
        const match = fullText.match(forbiddenRegex);
        if (match) {
          totalFailed++;
          failures.push({
            product: name,
            category,
            catKey,
            seedIdx,
            frameId: result.frameId,
            type: 'CROSS_CATEGORY',
            matched: match[0],
            regex: forbiddenRegex.toString().slice(0, 60),
            context: getContext(fullText, match.index, 40),
          });
          break; // 한 상품당 한 번만 카운트
        }
      }
      if (!failures.some(f => f.product === name && f.seedIdx === seedIdx && f.type === 'CROSS_CATEGORY')) {
        // 2) 건강식품 성분 교차오염 체크 (식품 카테고리만)
        if (expectedCat === '식품' && category.includes('건강식품')) {
          let ingredientFail = false;
          for (const [ruleKey, rule] of Object.entries(HEALTH_INGREDIENT_RULES)) {
            if (rule.keywords.test(name.toLowerCase())) {
              // 이 상품에 해당하는 규칙 발견
              const forbMatch = fullText.match(rule.forbiddenIngredients);
              if (forbMatch) {
                totalFailed++;
                ingredientFail = true;
                failures.push({
                  product: name,
                  category,
                  catKey,
                  seedIdx,
                  frameId: result.frameId,
                  type: 'INGREDIENT_MISMATCH',
                  ruleKey,
                  matched: forbMatch[0],
                  context: getContext(fullText, forbMatch.index, 40),
                });
              }
              break; // 한 상품에 한 규칙만 매칭
            }
          }
          if (!ingredientFail) {
            totalPassed++;
          }
        } else {
          totalPassed++;
        }
      }
    } else {
      totalPassed++; // 규칙 없는 카테고리는 패스
    }
  }
}

// ─── 변수 풀 오염 체크 (성분/효과 풀 레벨) ─────────────────

console.log('─── Part 1: 변수 풀 오염 체크 ───');
console.log();

let poolTests = 0;
let poolPassed = 0;
let poolFailed = 0;
const poolFailures = [];

for (const product of TEST_PRODUCTS) {
  const { name, category, expectedCat } = product;
  const catKey = getReviewCategoryKey(category);
  const vars = resolveVariablePool(category, catKey, name);

  poolTests++;

  // 건강식품 성분 풀 교차 검증
  if (expectedCat === '식품' && category.includes('건강식품')) {
    for (const [ruleKey, rule] of Object.entries(HEALTH_INGREDIENT_RULES)) {
      if (rule.keywords.test(name.toLowerCase())) {
        const pool성분 = vars['성분'] || [];
        const contaminated = pool성분.filter(s => rule.forbiddenIngredients.test(s));
        if (contaminated.length > 0) {
          poolFailed++;
          poolFailures.push({
            product: name,
            ruleKey,
            contaminated,
            pool: pool성분.join(', '),
          });
        } else {
          poolPassed++;
        }
        break;
      }
    }
  } else {
    poolPassed++;
  }
}

for (const f of poolFailures) {
  console.log(`  FAIL [POOL] ${f.product}`);
  console.log(`    규칙: ${f.ruleKey}`);
  console.log(`    오염된 성분: ${f.contaminated.join(', ')}`);
  console.log(`    전체 풀: ${f.pool}`);
  console.log();
}

console.log(`  풀 테스트 결과: ${poolPassed}/${poolTests} PASSED, ${poolFailed} FAILED`);
console.log();

// ─── 생성 텍스트 교차 오염 결과 ─────────────────────────────

console.log('─── Part 2: 생성 텍스트 교차 오염 체크 ───');
console.log();

if (failures.length > 0) {
  // 카테고리별 그룹핑
  const byType = {};
  for (const f of failures) {
    const key = f.type;
    if (!byType[key]) byType[key] = [];
    byType[key].push(f);
  }

  for (const [type, flist] of Object.entries(byType)) {
    console.log(`  [${type}] — ${flist.length}건`);
    for (const f of flist.slice(0, 20)) { // 최대 20건 출력
      console.log(`    FAIL: "${f.product}" (${f.category})`);
      console.log(`      frame=${f.frameId}, seed=${f.seedIdx}`);
      console.log(`      매칭: "${f.matched}" ${f.ruleKey ? `(규칙: ${f.ruleKey})` : ''}`);
      console.log(`      컨텍스트: ...${f.context}...`);
      console.log();
    }
    if (flist.length > 20) {
      console.log(`    ... 외 ${flist.length - 20}건 더`);
    }
  }
} else {
  console.log('  ✓ 교차 오염 없음!');
}

console.log();
console.log(`  텍스트 테스트 결과: ${totalPassed}/${totalTests} PASSED, ${totalFailed} FAILED`);
console.log();

// ─── 총합 ────────────────────────────────────────────────────

console.log('='.repeat(70));
const allPassed = poolFailed + totalFailed;
if (allPassed === 0) {
  console.log('  ★ 전체 통과! 교차 오염 0건 ★');
} else {
  console.log(`  ✗ 총 ${allPassed}건 오염 발견 (풀: ${poolFailed}, 텍스트: ${totalFailed})`);
}
console.log(`  총 상품: ${TEST_PRODUCTS.length}개`);
console.log(`  총 리뷰 생성: ${totalTests}건 (${TEST_PRODUCTS.length} × 5 시드)`);
console.log(`  풀 체크: ${poolPassed}/${poolTests}`);
console.log(`  텍스트 체크: ${totalPassed}/${totalTests}`);
console.log('='.repeat(70));

// 실패시 exit code 1
if (allPassed > 0) {
  process.exit(1);
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function getContext(text, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\n/g, ' ');
}
