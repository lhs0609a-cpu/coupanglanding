// ============================================================
// 전체 9,900개 실제 소분류 카테고리 교차 오염 테스트
//
// coupang-cat-details.json의 모든 카테고리(도서 제외)에서
// 카테고리 경로의 leaf name으로 상품명을 자동 생성하고,
// 리뷰 + 설득형 콘텐츠를 생성하여 교차 오염 검증
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 데이터 로드 ────────────────────────────────────────────

const catDetails = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/coupang-cat-details.json'), 'utf-8'));
const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const reviewFrameData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/real-review-frames.json'), 'utf-8'));

const FRAMES = reviewFrameData.frames;
const FRAGMENTS = reviewFrameData.fragments;
const CATEGORY_ALIASES = reviewFrameData.categoryAliases;
const VARIABLES = storyData.variables;

// ─── seeded-random ──────────────────────────────────────────

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

// ─── real-review-composer 로직 ──────────────────────────────

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
    .replace(/([\uAC00-\uD7A3])(이|가)(\s)/g, (_, prev, _p, sp) => prev + (hasFinalConsonant(prev) ? '이' : '가') + sp)
    .replace(/([\uAC00-\uD7A3])(은|는)(\s)/g, (_, prev, _p, sp) => prev + (hasFinalConsonant(prev) ? '은' : '는') + sp)
    .replace(/([\uAC00-\uD7A3])(을|를)(\s)/g, (_, prev, _p, sp) => prev + (hasFinalConsonant(prev) ? '을' : '를') + sp)
    .replace(/([\uAC00-\uD7A3])(으로|로)(\s)/g, (_, prev, _p, sp) => prev + (hasFinalConsonant(prev) ? '으로' : '로') + sp);
}

function fillVariables(text, vars, productName, rng) {
  let result = text.replace(/\{product\}/g, productName);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) return pool[Math.floor(rng() * pool.length)];
    return match;
  });
  return fixKoreanParticles(result);
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
    if (/과일|채소|사과|배|딸기|토마토|정육|한우|돼지|닭|수산물|생선|새우|쌀|잡곡/.test(n)) return 'fresh_food';
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
  fresh_food: /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  processed_food: /섭취|\d정|\d포|캡슐|정제|알약|삼키|바르|발라|피부에|도포/,
  supplement_liquid: /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_powder: /캡슐|알약|삼키|넘기기|목에 안|정제|바르|발라|피부에/,
  supplement_capsule: /바르|발라|피부에|도포|씻어서|샐러드|조리|데워/,
  skincare: /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  haircare: /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  makeup: /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  bodycare: /먹[어으고는기이]|섭취|\d정|맛있|삼키|캡슐|알약|충전|세차/,
  baby_diaper: /먹[어으고는기이여]|먹여|섭취|\d정|\d포|맛있|바르|발라|피부에|크림|로션|캡슐|알약/,
  baby_food: /바르|발라|피부에|도포|캡슐|알약|정제|크림|로션|충전|세차/,
  baby_skincare: /먹[어으고는기이여]|먹여|섭취|\d정|맛있|캡슐|알약|충전|세차/,
  electronics: /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약/,
  cookware: /섭취|\d정|바르|발라|피부에|캡슐|알약|충전/,
  fashion: /먹[어으고는기이]|섭취|\d정|바르|발라|피부에|맛있|캡슐|알약|충전|세차/,
  automotive: /먹[어으고는기이]|섭취|\d정|피부에|맛있|캡슐|알약/,
};

function filterByProductForm(values, productName, categoryKey) {
  const form = detectProductForm(productName, categoryKey || 'default');
  const blocklist = FORM_BLOCKLIST[form];
  if (!blocklist) return values;
  const filtered = values.filter(v => !blocklist.test(v));
  return filtered.length > 0 ? filtered : values;
}

// 실제 쿠팡 중분류 → VARIABLES 키 매핑
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

function resolveVariablePool(categoryPath, catKey, productName) {
  const parentVars = VARIABLES[catKey] || VARIABLES['DEFAULT'];
  const parts = categoryPath.split('>').map(p => p.trim());

  if (parts.length >= 2) {
    const rawSubKey = `${parts[0]}>${parts[1]}`;
    const subKey = SUBCATEGORY_ALIASES[rawSubKey] || rawSubKey;
    if (subKey !== '식품>건강식품') {
      const subVars = VARIABLES[subKey];
      if (subVars) return { ...parentVars, ...subVars };
    }
  }

  if (catKey === '출산/유아동') {
    if (/기저귀|팬티형|밴드형/.test(productName)) {
      const sub = VARIABLES['출산/유아동>기저귀']; if (sub) return { ...parentVars, ...sub };
    }
    if (/분유/.test(productName)) {
      const sub = VARIABLES['출산/유아동>분유']; if (sub) return { ...parentVars, ...sub };
    }
    if (/이유식|유아식|퓨레|핑거푸드|유아과자|유아음료/.test(productName)) {
      const sub = VARIABLES['출산/유아동>유아식품']; if (sub) return { ...parentVars, ...sub };
    }
  }

  if (catKey === '식품') {
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|캡슐|정제|영양제|글루코사민|콜라겐|건강기능|건강식품|비오틴/.test(productName) ||
        categoryPath.includes('건강식품')) {
      const sub = VARIABLES['식품>건강식품'];
      const hv = sub ? { ...parentVars, ...sub } : parentVars;
      const pn = productName.toLowerCase();
      // 성분별 오버라이드 (효과1, 효과2, 성분, 카테고리)
      if (/비오틴|모발|탈모|머리카락|손톱/.test(pn)) {
        hv['효과1']=['모발건강','피부건강','손톱건강','두피건강','모발영양','피부미용','모발강화','케라틴합성'];
        hv['효과2']=['탈모예방','모발윤기','피부탄력','손톱강화','두피영양'];
        hv['성분']=['비오틴','비타민B7','판토텐산','아연','셀레늄','비타민E','비타민C','케라틴','시스테인','엽산'];
        hv['카테고리']=['비오틴','모발영양제','비타민','영양제','건강식품'];
      } else if (/루테인|눈|시력|안구|지아잔틴/.test(pn)) {
        hv['효과1']=['눈건강','시력보호','눈피로','안구건조','황반건강','눈영양','시력관리','눈노화방지'];
        hv['효과2']=['눈피로회복','시야선명','블루라이트차단','눈건조개선','안구보호'];
        hv['성분']=['루테인','지아잔틴','비타민A','베타카로틴','빌베리추출물','아스타잔틴','오메가3','아연','비타민E','마리골드꽃추출물'];
        hv['카테고리']=['루테인','눈영양제','비타민','영양제','건강식품'];
      } else if (/콘드로이친|상어연골|보스웰리아|글루코사민|관절|무릎|연골|msm/.test(pn)) {
        hv['효과1']=['관절건강','연골보호','관절유연성','뼈건강','관절영양','연골재생','관절편안함','무릎건강'];
        hv['효과2']=['관절통완화','보행편안','관절유연','연골강화','움직임개선'];
        hv['성분']=['콘드로이친','글루코사민','MSM','상어연골','보스웰리아','초록입홍합','칼슘','비타민D','콜라겐','히알루론산'];
        hv['카테고리']=['관절영양제','글루코사민','영양제','건강식품','관절건강'];
      } else if (/밀크씨슬|간|헤파|실리마린/.test(pn)) {
        hv['효과1']=['간건강','간보호','간해독','간기능개선','간영양','피로회복','간세포보호','독소배출'];
        hv['효과2']=['숙취해소','간수치개선','피로감소','활력증진','해독력강화'];
        hv['성분']=['밀크씨슬','실리마린','UDCA','아티초크','비타민B군','헛개나무열매','강황','울금','타우린','메티오닌'];
        hv['카테고리']=['밀크씨슬','간영양제','영양제','건강식품','간건강'];
      } else if (/유산균|프로바이오|프리바이오|장|락토|비피더스/.test(pn)) {
        hv['효과1']=['장건강','소화흡수','장내환경','유익균증식','배변활동','장면역력','장내균형','소화개선'];
        hv['효과2']=['쾌변','더부룩함해소','소화력향상','장내유익균','배변규칙성'];
        hv['성분']=['유산균','프로바이오틱스','프리바이오틱스','락토바실러스','비피더스균','모유유래유산균','김치유산균','식이섬유','프락토올리고당','아연'];
        hv['카테고리']=['유산균','프로바이오틱스','영양제','건강식품','장건강'];
      } else if (/콜라겐|히알루론/.test(pn)) {
        hv['효과1']=['피부탄력','피부보습','주름개선','피부건강','피부광채','피부영양','피부재생','피부노화방지'];
        hv['효과2']=['피부윤기','보습력향상','탄력개선','주름감소','피부결개선'];
        hv['성분']=['콜라겐','히알루론산','엘라스틴','비타민C','세라마이드','코엔자임Q10','석류추출물','비타민E','아스타잔틴','펩타이드'];
        hv['카테고리']=['콜라겐','이너뷰티','영양제','건강식품','피부영양'];
      } else if (/오메가|크릴|epa|dha|혈관/.test(pn)) {
        hv['효과1']=['혈관건강','혈행개선','중성지방감소','혈액순환','콜레스테롤관리','심혈관건강','혈압관리','혈관탄력'];
        hv['효과2']=['혈행촉진','중성지방관리','혈관탄력','심장건강','혈류개선'];
        hv['성분']=['오메가3','EPA','DHA','크릴오일','어유','rTG오메가3','비타민E','아스타잔틴','인지질','비타민D'];
        hv['카테고리']=['오메가3','크릴오일','영양제','건강식품','혈관건강'];
      } else if (/홍삼|인삼|면역|홍경천|프로폴리스/.test(pn)) {
        hv['효과1']=['면역력','피로회복','활력','체력','항산화','기억력','혈액순환','면역강화'];
        hv['효과2']=['에너지충전','활력개선','면역증진','체력보강','기운회복'];
        hv['성분']=['홍삼','진세노사이드','인삼사포닌','프로폴리스','플라보노이드','홍경천','아연','비타민C','셀레늄','베타글루칸'];
        hv['카테고리']=['홍삼','면역영양제','건강식품','영양제','면역건강'];
      } else if (/코엔자임|coq10|유비퀴놀|심장/.test(pn)) {
        hv['효과1']=['심장건강','항산화','에너지생성','세포보호','혈압관리','심혈관건강','피로회복','활력'];
        hv['효과2']=['심장기능','항산화력','에너지충전','세포활력','혈관건강'];
        hv['성분']=['코엔자임Q10','유비퀴놀','비타민E','셀레늄','오메가3','비타민B군','마그네슘','L-카르니틴','알파리포산','아스타잔틴'];
        hv['카테고리']=['코엔자임Q10','항산화영양제','영양제','건강식품','심장건강'];
      } else if (/마그네슘|칼슘|아연|셀레늄|철분|미네랄/.test(pn)) {
        hv['효과1']=['뼈건강','근육이완','신경안정','에너지대사','면역력','수면개선','스트레스완화','혈압관리'];
        hv['효과2']=['근육경련완화','수면질개선','피로감소','뼈밀도유지','면역강화'];
        hv['성분']=['마그네슘','칼슘','아연','셀레늄','철분','비타민D','비타민K','망간','구리','크롬'];
        hv['카테고리']=['미네랄','칼슘','영양제','건강식품','뼈건강'];
      } else if (/비타민[cdCD]|비타민\s*[cdCD]|멀티비타민|종합비타민/.test(pn)) {
        hv['효과1']=['면역력','뼈건강','항산화','에너지대사','피부건강','활력','영양균형','피로회복'];
        hv['효과2']=['면역강화','에너지충전','뼈밀도유지','피부건강','활력개선'];
        hv['성분']=['비타민C','비타민D','비타민B군','비타민E','비타민A','비타민K','나이아신','엽산','판토텐산','비오틴'];
        hv['카테고리']=['비타민','멀티비타민','영양제','건강식품','비타민제'];
      } else if (/쏘팔메토|전립선|노코기리야자/.test(pn)) {
        hv['카테고리']=['쏘팔메토','남성영양제','영양제','건강식품','전립선건강'];
      } else if (/엽산|임산부|태아/.test(pn)) {
        hv['카테고리']=['엽산','임산부영양제','영양제','건강식품','임산부건강'];
      } else if (/가르시니아|다이어트|체지방|CLA|지방/.test(pn)) {
        hv['카테고리']=['다이어트','체지방관리','영양제','건강식품','체중관리'];
      } else if (/흑마늘|마늘|양파/.test(pn)) {
        hv['카테고리']=['흑마늘','면역영양제','건강식품','영양제','면역건강'];
      } else if (/프로틴|단백질|BCAA|아미노산|크레아틴|운동/.test(pn)) {
        hv['카테고리']=['프로틴','단백질보충제','영양제','건강식품','운동보충제'];
      } else if (/스피루리나|클로렐라|녹즙|녹색/.test(pn)) {
        hv['카테고리']=['스피루리나','클로렐라','영양제','건강식품','녹색영양'];
      }
      return hv;
    }
    if (/과일|채소|한라봉|사과|배|딸기|토마토|감귤|정육|한우|돼지|닭|수산물|생선|새우|쌀|잡곡/.test(productName) || categoryPath.includes('신선식품')) {
      const sub = VARIABLES['식품>신선식품']; if (sub) return { ...parentVars, ...sub };
    }
    if (/라면|통조림|냉동|즉석|과자|쿠키|빵|소스|밀키트|간편식/.test(productName) || categoryPath.includes('가공식품')) {
      const sub = VARIABLES['식품>가공식품']; if (sub) return { ...parentVars, ...sub };
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
  return cleaned.length === 0 ? '' : cleaned.join(' ');
}

function composeFragment(pool, rng, productName, categoryKey) {
  const fo = productName ? filterByProductForm(pool.openers, productName, categoryKey) : pool.openers;
  const openers = fo.length > 0 ? fo : pool.openers;
  const opener = openers[Math.floor(rng() * openers.length)] || '';
  const fv = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = fv.length > 0 ? fv : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';
  const fc = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = fc.length > 0 ? fc : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';
  return [opener, value, closer].filter(p => p.length > 0).join(' ');
}

function composeExtraFragment(pool, rng, productName, categoryKey) {
  const fv = productName ? filterByProductForm(pool.values, productName, categoryKey) : pool.values;
  const values = fv.length > 0 ? fv : pool.values;
  const value = values[Math.floor(rng() * values.length)] || '';
  const fc = productName ? filterByProductForm(pool.closers, productName, categoryKey) : pool.closers;
  const closers = fc.length > 0 ? fc : pool.closers;
  const closer = closers[Math.floor(rng() * closers.length)] || '';
  return [value, closer].filter(p => p.length > 0).join(' ');
}

const CATEGORY_FRAME_WEIGHTS = {
  '뷰티':['CONCLUSION_FIRST','COMPARISON','DAILY_LIFE','GIFT_STORY','REPURCHASE'],
  '식품':['CONCLUSION_FIRST','REPURCHASE','GIFT_STORY','DAILY_LIFE','COMPARISON'],
  '생활용품':['DAILY_LIFE','REPURCHASE','CONCLUSION_FIRST','GIFT_STORY','COMPARISON'],
  '가전/디지털':['COMPARISON','CONCLUSION_FIRST','DAILY_LIFE','REPURCHASE','GIFT_STORY'],
  '패션의류잡화':['DAILY_LIFE','CONCLUSION_FIRST','COMPARISON','GIFT_STORY','REPURCHASE'],
  '가구/홈데코':['COMPARISON','DAILY_LIFE','CONCLUSION_FIRST','GIFT_STORY','REPURCHASE'],
  '출산/유아동':['GIFT_STORY','DAILY_LIFE','CONCLUSION_FIRST','REPURCHASE','COMPARISON'],
  '스포츠/레져':['DAILY_LIFE','COMPARISON','CONCLUSION_FIRST','REPURCHASE','GIFT_STORY'],
  '반려/애완용품':['DAILY_LIFE','GIFT_STORY','REPURCHASE','CONCLUSION_FIRST','COMPARISON'],
  '주방용품':['DAILY_LIFE','COMPARISON','REPURCHASE','CONCLUSION_FIRST','GIFT_STORY'],
  '문구/오피스':['DAILY_LIFE','CONCLUSION_FIRST','GIFT_STORY','COMPARISON','REPURCHASE'],
  '완구/취미':['GIFT_STORY','DAILY_LIFE','CONCLUSION_FIRST','COMPARISON','REPURCHASE'],
  '자동차용품':['COMPARISON','CONCLUSION_FIRST','DAILY_LIFE','REPURCHASE','GIFT_STORY'],
  'DEFAULT':['CONCLUSION_FIRST','DAILY_LIFE','COMPARISON','REPURCHASE','GIFT_STORY'],
};

function generateReview(productName, categoryPath, sellerSeed, productIndex) {
  const catKey = getReviewCategoryKey(categoryPath);
  const fragCatKey = resolveFragmentCategory(catKey);
  const vars = resolveVariablePool(categoryPath, catKey, productName);
  const seed = stringToSeed(`${sellerSeed}::realreview::${productIndex}::${productName}`);
  const rng = createSeededRandom(seed);
  const cleanName = productName.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, '').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 3).join(' ');
  const weights = CATEGORY_FRAME_WEIGHTS[catKey] || CATEGORY_FRAME_WEIGHTS['DEFAULT'];
  const frameId = weights[Math.floor(rng() * weights.length)];
  const frame = FRAMES[frameId];
  const fragments = FRAGMENTS[fragCatKey] || FRAGMENTS['DEFAULT'];
  const paragraphs = [];
  for (const section of frame.structure) {
    const pool = fragments[section]; if (!pool) continue;
    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const sanitized = sanitizeByProductForm(filled, productName, catKey);
    if (sanitized.trim().length > 5) paragraphs.push(sanitized.trim());
    if (['experience','detail','backstory'].includes(section) && pool.values.length > 2) {
      const extra = composeExtraFragment(pool, rng, productName, catKey);
      const fe = fillVariables(extra, vars, cleanName, rng);
      const se = sanitizeByProductForm(fe, productName, catKey);
      if (se.trim().length > 5 && paragraphs.length > 0) paragraphs[paragraphs.length-1] += ' ' + se.trim();
    }
  }
  let tc = paragraphs.join('').length;
  const padSections = ['experience','detail','daily_routine','motivation'];
  let pi = 0;
  while (tc < 400 && pi < padSections.length) {
    const pool = fragments[padSections[pi++]]; if (!pool) continue;
    const raw = composeFragment(pool, rng, productName, catKey);
    const filled = fillVariables(raw, vars, cleanName, rng);
    const s = sanitizeByProductForm(filled, productName, catKey);
    if (s.trim().length > 5) { paragraphs.splice(Math.max(0,paragraphs.length-1), 0, s.trim()); tc += s.trim().length; }
  }
  return { paragraphs, catKey };
}

// ============================================================
// 카테고리별 교차 오염 감지 규칙 — 핵심 금지어
// ============================================================

// 대분류별 핵심 금지어: 절대 다른 대분류 텍스트가 섞여서는 안 되는 용어
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

// 건강식품 성분 교차오염 — 상품과 무관한 특정 성분 언급
const HEALTH_INGREDIENT_FORBID = {
  '관절': { test: /콘드로이친|글루코사민|보스웰리아|관절|무릎|연골|msm/i, forbid: /프로폴리스|루테인|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나|클로렐라/ },
  '눈': { test: /루테인|지아잔틴|눈건강|시력|안구/i, forbid: /프로폴리스|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '간': { test: /밀크씨슬|실리마린|간건강|간보호|헤파/i, forbid: /프로폴리스|루테인|콘드로이친|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '장': { test: /유산균|프로바이오|락토바실러스|비피더스|장건강/i, forbid: /프로폴리스|루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토/ },
  '면역': { test: /홍삼|인삼|프로폴리스|면역.*강화|홍경천/i, forbid: /루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/ },
  '모발': { test: /비오틴|모발|탈모/i, forbid: /프로폴리스|루테인|콘드로이친|밀크씨슬|가르시니아|쏘팔메토|스피루리나/ },
  '오메가': { test: /오메가3|크릴오일|EPA|DHA/i, forbid: /프로폴리스|루테인|콘드로이친|밀크씨슬|비오틴|가르시니아|쏘팔메토|스피루리나/ },
};

// ============================================================
// 인트라카테고리 오염 규칙 — 같은 대분류 내 서브카테고리 교차 오염
// ============================================================
// 서브카테고리별로 다른 서브카테고리의 핵심 키워드가 나오면 안 됨
const INTRA_CATEGORY_RULES = {
  // 가전/디지털 — 서브카테고리간 핵심 키워드 교차 금지
  '가전/디지털>영상가전': { forbid: /흡입력|냉방력|난방력|제습력|가습력|안마력|분쇄력|추출력/ },
  '가전/디지털>청소가전': { forbid: /냉방력|난방력|화질|색감|해상도|HDR|음질|서라운드|안마력/ },
  '가전/디지털>계절가전': { forbid: /흡입력|화질|해상도|HDR|음질|서라운드|안마력|분쇄력/ },
  '가전/디지털>주방가전': { forbid: /흡입력|냉방력|난방력|화질|해상도|HDR|음질|서라운드|안마력/ },
  '가전/디지털>건강가전': { forbid: /흡입력|냉방력|난방력|화질|해상도|HDR|분쇄력|추출력/ },
  '가전/디지털>음향가전': { forbid: /흡입력|냉방력|난방력|화질|HDR|안마력|분쇄력|추출력/ },
  '가전/디지털>컴퓨터': { forbid: /흡입력|냉방력|난방력|안마력|분쇄력|추출력/ },
  '가전/디지털>휴대폰': { forbid: /흡입력|냉방력|난방력|안마력|분쇄력|추출력/ },
  '가전/디지털>카메라': { forbid: /흡입력|냉방력|난방력|안마력|분쇄력|추출력/ },

  // 뷰티 — 서브카테고리간 교차 금지
  '뷰티>스킨': { forbid: /두피케어|탈모방지|볼륨업|발색|지속력|밀착력|커버력|매트피니시|컬유지/ },
  '뷰티>메이크업': { forbid: /두피케어|탈모방지|볼륨업|보습.*수분.*주름|각질제거.*바디/ },
  '뷰티>헤어': { forbid: /발색|밀착력|커버력|매트피니시|파운데이션|쿠션|립스틱|아이섀도우/ },
  '뷰티>바디': { forbid: /두피케어|탈모방지|발색|밀착력|커버력|매트피니시|파운데이션|쿠션/ },
  '뷰티>네일': { forbid: /두피케어|탈모방지|볼륨업|수분보습.*피부결|주름개선.*탄력/ },
  '뷰티>향수': { forbid: /두피케어|탈모방지|발색|밀착력|커버력|흡입력|수분보습.*피부결/ },

  // 식품 서브카테고리 교차
  '식품>음료': { forbid: /캡슐.*섭취|정제.*섭취/ },
};

// ============================================================
// 카테고리 경로에서 자동 상품명 생성
// ============================================================

function generateProductName(categoryPath) {
  const parts = categoryPath.split('>');
  // leaf 2~3개 조합하여 자연스러운 상품명
  const leaf = parts[parts.length - 1].trim();
  const parent = parts.length >= 2 ? parts[parts.length - 2].trim() : '';

  // 프리미엄/고급 등 modifier 추가 (카테고리에 따라)
  const modifiers = ['프리미엄', '고급', '베스트', '인기', '추천'];
  const mod = modifiers[stringToSeed(categoryPath) % modifiers.length];

  if (parent && parent !== leaf && !leaf.includes(parent)) {
    return `${mod} ${parent} ${leaf}`;
  }
  return `${mod} ${leaf}`;
}

// ============================================================
// 테스트 실행
// ============================================================

console.log('='.repeat(70));
console.log('  전체 소분류 카테고리 교차 오염 테스트');

// 도서 제외 전체 카테고리 수집
const allCategories = [];
for (const [code, detail] of Object.entries(catDetails)) {
  const path = detail.p;
  if (path.startsWith('도서')) continue; // 도서 제외
  allCategories.push({ code, path });
}

const SEEDS = ['test-seller-A', 'test-seller-B', 'test-seller-C', 'test-seller-D', 'test-seller-E'];

console.log(`  대상: ${allCategories.length}개 소분류 × ${SEEDS.length}시드 = ${allCategories.length * SEEDS.length}건`);
console.log('='.repeat(70));
console.log();

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const failures = [];
const catFailCount = {};

for (const cat of allCategories) {
  const productName = generateProductName(cat.path);
  const catKey = getReviewCategoryKey(cat.path);
  const parts = cat.path.split('>').map(p => p.trim());

  for (let si = 0; si < SEEDS.length; si++) {
  // 리뷰 생성
  const result = generateReview(productName, cat.path, SEEDS[si], si);
  const fullText = result.paragraphs.join(' ');

  totalTests++;
  let failed = false;

  // 1) 대분류 교차 오염 체크
  const forbiddenRegex = HARD_FORBIDDEN[catKey];
  if (forbiddenRegex) {
    const match = fullText.match(forbiddenRegex);
    if (match) {
      failed = true;
      totalFailed++;
      if (!catFailCount[catKey]) catFailCount[catKey] = 0;
      catFailCount[catKey]++;
      if (failures.length < 50) { // 최대 50건 상세 출력
        failures.push({
          code: cat.code,
          path: cat.path,
          productName,
          catKey,
          type: 'CROSS_CATEGORY',
          matched: match[0],
          context: fullText.slice(Math.max(0, match.index - 30), match.index + match[0].length + 30),
        });
      }
    }
  }

  // 2) 건강식품 성분 교차오염 체크
  if (!failed && catKey === '식품' && cat.path.includes('건강식품')) {
    for (const [ruleKey, rule] of Object.entries(HEALTH_INGREDIENT_FORBID)) {
      if (rule.test.test(productName)) {
        const forbMatch = fullText.match(rule.forbid);
        if (forbMatch) {
          failed = true;
          totalFailed++;
          if (!catFailCount[catKey]) catFailCount[catKey] = 0;
          catFailCount[catKey]++;
          if (failures.length < 50) {
            failures.push({
              code: cat.code,
              path: cat.path,
              productName,
              catKey,
              type: 'INGREDIENT',
              ruleKey,
              matched: forbMatch[0],
              context: fullText.slice(Math.max(0, forbMatch.index - 30), forbMatch.index + forbMatch[0].length + 30),
            });
          }
        }
        break;
      }
    }
  }

  // 3) 인트라카테고리 교차 오염 체크 — 같은 대분류 내 서브카테고리간 교차
  if (!failed && parts.length >= 2) {
    const rawSubKey = `${parts[0]}>${parts[1]}`;
    const resolvedSubKey = SUBCATEGORY_ALIASES[rawSubKey] || rawSubKey;
    const intraRule = INTRA_CATEGORY_RULES[resolvedSubKey];
    if (intraRule) {
      const intraMatch = fullText.match(intraRule.forbid);
      if (intraMatch) {
        failed = true;
        totalFailed++;
        if (!catFailCount[catKey]) catFailCount[catKey] = 0;
        catFailCount[catKey]++;
        if (failures.length < 50) {
          failures.push({
            code: cat.code,
            path: cat.path,
            productName,
            catKey,
            type: 'INTRA_CATEGORY',
            matched: intraMatch[0],
            subKey: resolvedSubKey,
            context: fullText.slice(Math.max(0, intraMatch.index - 30), intraMatch.index + intraMatch[0].length + 30),
          });
        }
      }
    }
  }

  // 4) 미해석 변수 체크 — {변수명}이 그대로 남아있으면 실패
  const unresolvedMatch = fullText.match(/\{([^}]{1,10})\}/);
  if (!failed && unresolvedMatch) {
    failed = true;
    totalFailed++;
    if (!catFailCount[catKey]) catFailCount[catKey] = 0;
    catFailCount[catKey]++;
    if (failures.length < 50) {
      failures.push({
        code: cat.code,
        path: cat.path,
        productName,
        catKey,
        type: 'UNRESOLVED_VAR',
        matched: unresolvedMatch[0],
        context: fullText.slice(Math.max(0, unresolvedMatch.index - 20), unresolvedMatch.index + 40),
      });
    }
  }

  if (!failed) totalPassed++;
  } // end seed loop
}

// ─── 결과 출력 ──────────────────────────────────────────────

console.log('─── 대분류별 결과 ───');
const topCatCounts = {};
for (const cat of allCategories) {
  const ck = getReviewCategoryKey(cat.path);
  topCatCounts[ck] = (topCatCounts[ck] || 0) + 1;
}
for (const [ck, count] of Object.entries(topCatCounts).sort((a,b) => b[1]-a[1])) {
  const failC = catFailCount[ck] || 0;
  const status = failC === 0 ? '✓' : '✗';
  console.log(`  ${status} ${ck}: ${count - failC}/${count} PASS${failC > 0 ? ` (${failC} FAIL)` : ''}`);
}
console.log();

if (failures.length > 0) {
  console.log('─── 실패 상세 (최대 50건) ───');
  for (const f of failures) {
    console.log(`  [${f.type}] ${f.path}`);
    console.log(`    상품명: ${f.productName}`);
    console.log(`    매칭: "${f.matched}" ${f.ruleKey ? `(${f.ruleKey})` : ''}`);
    console.log(`    컨텍스트: ...${f.context}...`);
    console.log();
  }
}

console.log('='.repeat(70));
if (totalFailed === 0) {
  console.log(`  ★ 전체 통과! ${totalTests}개 카테고리 교차 오염 0건 ★`);
} else {
  console.log(`  ✗ ${totalFailed}건 오염 발견 (${totalTests}개 중)`);
}
console.log(`  총 카테고리: ${allCategories.length}개 (도서 제외)`);
console.log(`  PASS: ${totalPassed} | FAIL: ${totalFailed}`);
console.log('='.repeat(70));

if (totalFailed > 0) process.exit(1);
