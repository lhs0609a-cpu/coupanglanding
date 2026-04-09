/**
 * 리뷰 성분 불일치 전수 테스트
 *
 * 건강식품 소분류별로 생성된 리뷰에 상품과 무관한 성분이 언급되는지 검증.
 * 실행: node test-review-ingredient-mismatch.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const storyData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const reviewFrameData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/real-review-frames.json'), 'utf-8'));

const VARIABLES = storyData.variables;
const FRAMES = reviewFrameData.frames;
const FRAGMENTS = reviewFrameData.fragments;
const CATEGORY_ALIASES = reviewFrameData.categoryAliases;

// ── seeded-random ──
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function createSeededRandom(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

// ── resolveVariablePool 복제 (수정된 프로덕션 로직) ──
function resolveVariablePool(categoryPath, catKey, productName) {
  const parentVars = VARIABLES[catKey] || VARIABLES['DEFAULT'];
  const parts = categoryPath.split('>').map(p => p.trim());
  // "식품>건강식품"은 성분별 오버라이드가 필요하므로 조기 return 하지 않음
  if (parts.length >= 2) {
    const subKey = `${parts[0]}>${parts[1]}`;
    if (subKey !== '식품>건강식품') {
      const subVars = VARIABLES[subKey];
      if (subVars) return { ...parentVars, ...subVars };
    }
  }
  if (catKey === '식품') {
    if (/비타민|오메가|유산균|프로바이오|루테인|밀크씨슬|홍삼|캡슐|정제|영양제|글루코사민|콜라겐|건강기능|건강식품|비오틴/.test(productName) ||
        categoryPath.includes('건강식품')) {
      const sub = VARIABLES['식품>건강식품'];
      const healthVars = sub ? { ...parentVars, ...sub } : parentVars;
      const pn = productName.toLowerCase();
      if (/비오틴|모발|탈모|머리카락|손톱/.test(pn)) {
        healthVars['효과1'] = ['모발건강','피부건강','손톱건강','두피건강'];
        healthVars['효과2'] = ['탈모예방','모발윤기','피부탄력','손톱강화'];
        healthVars['성분'] = ['비오틴','비타민B7','판토텐산','아연','셀레늄','비타민E','비타민C','케라틴','시스테인','엽산'];
      } else if (/루테인|눈|시력|안구|지아잔틴/.test(pn)) {
        healthVars['효과1'] = ['눈건강','시력보호','눈피로','안구건조'];
        healthVars['효과2'] = ['눈피로회복','시야선명','블루라이트차단'];
        healthVars['성분'] = ['루테인','지아잔틴','비타민A','베타카로틴','빌베리추출물','아스타잔틴','오메가3','아연','비타민E','마리골드꽃추출물'];
      } else if (/콘드로이친|상어연골|보스웰리아|글루코사민|관절|무릎|연골|msm/.test(pn)) {
        healthVars['효과1'] = ['관절건강','연골보호','관절유연성','뼈건강'];
        healthVars['효과2'] = ['관절통완화','보행편안','관절유연','연골강화'];
        healthVars['성분'] = ['콘드로이친','글루코사민','MSM','상어연골','보스웰리아','초록입홍합','칼슘','비타민D','콜라겐','히알루론산'];
      } else if (/밀크씨슬|간|헤파|실리마린/.test(pn)) {
        healthVars['효과1'] = ['간건강','간보호','간해독','간기능개선'];
        healthVars['효과2'] = ['숙취해소','간수치개선','피로감소'];
        healthVars['성분'] = ['밀크씨슬','실리마린','UDCA','아티초크','비타민B군','헛개나무열매','강황','울금','타우린','메티오닌'];
      } else if (/유산균|프로바이오|프리바이오|장|락토|비피더스/.test(pn)) {
        healthVars['효과1'] = ['장건강','소화흡수','장내환경','유익균증식'];
        healthVars['효과2'] = ['쾌변','더부룩함해소','소화력향상'];
        healthVars['성분'] = ['유산균','프로바이오틱스','프리바이오틱스','락토바실러스','비피더스균','모유유래유산균','김치유산균','식이섬유','프락토올리고당','아연'];
      } else if (/콜라겐|히알루론/.test(pn)) {
        healthVars['효과1'] = ['피부탄력','피부보습','주름개선','피부건강'];
        healthVars['효과2'] = ['피부윤기','보습력향상','탄력개선'];
        healthVars['성분'] = ['콜라겐','히알루론산','엘라스틴','비타민C','세라마이드','코엔자임Q10','석류추출물','비타민E','아스타잔틴','펩타이드'];
      } else if (/오메가|크릴|epa|dha|혈관/.test(pn)) {
        healthVars['효과1'] = ['혈관건강','혈행개선','중성지방감소'];
        healthVars['효과2'] = ['혈행촉진','중성지방관리','혈관탄력'];
        healthVars['성분'] = ['오메가3','EPA','DHA','크릴오일','어유','rTG오메가3','비타민E','아스타잔틴','인지질','비타민D'];
      } else if (/홍삼|인삼|면역|홍경천|프로폴리스/.test(pn)) {
        healthVars['효과1'] = ['면역력','피로회복','활력','체력'];
        healthVars['효과2'] = ['에너지충전','활력개선','면역증진'];
        healthVars['성분'] = ['홍삼','진세노사이드','인삼사포닌','프로폴리스','플라보노이드','홍경천','아연','비타민C','셀레늄','베타글루칸'];
      } else if (/코엔자임|coq10|유비퀴놀|심장/.test(pn)) {
        healthVars['효과1'] = ['심장건강','항산화','에너지생성','세포보호'];
        healthVars['효과2'] = ['심장기능','항산화력','에너지충전'];
        healthVars['성분'] = ['코엔자임Q10','유비퀴놀','비타민E','셀레늄','오메가3','비타민B군','마그네슘','L-카르니틴','알파리포산','아스타잔틴'];
      } else if (/마그네슘|칼슘|아연|셀레늄|철분|미네랄/.test(pn)) {
        healthVars['효과1'] = ['뼈건강','근육이완','신경안정','에너지대사'];
        healthVars['효과2'] = ['근육경련완화','수면질개선','피로감소'];
        healthVars['성분'] = ['마그네슘','칼슘','아연','셀레늄','철분','비타민D','비타민K','망간','구리','크롬'];
      } else if (/비타민[cdCD]|비타민\s*[cdCD]|멀티비타민|종합비타민/.test(pn)) {
        healthVars['효과1'] = ['면역력','뼈건강','항산화','에너지대사'];
        healthVars['효과2'] = ['면역강화','에너지충전','뼈밀도유지'];
        healthVars['성분'] = ['비타민C','비타민D','비타민B군','비타민E','비타민A','비타민K','나이아신','엽산','판토텐산','비오틴'];
      } else if (/쏘팔메토|전립선|노코기리야자/.test(pn)) {
        healthVars['효과1'] = ['전립선건강','배뇨기능','남성건강','호르몬균형'];
        healthVars['효과2'] = ['전립선기능','배뇨편안','남성활력'];
        healthVars['성분'] = ['쏘팔메토','노코기리야자','아연','리코펜','셀레늄','호박씨오일','비타민E','비타민B6','쐐기풀추출물','베타시토스테롤'];
      } else if (/엽산|임산부|태아/.test(pn)) {
        healthVars['효과1'] = ['태아건강','세포분열','신경관발달','임산부건강'];
        healthVars['효과2'] = ['태아발달','임산부영양','빈혈예방'];
        healthVars['성분'] = ['엽산','활성엽산','비타민B12','철분','비타민D','칼슘','DHA','아연','비타민C','마그네슘'];
      } else if (/가르시니아|다이어트|체지방|CLA|지방/.test(pn)) {
        healthVars['효과1'] = ['체지방감소','식욕억제','대사촉진','지방분해'];
        healthVars['효과2'] = ['체중관리','체지방관리','식욕조절'];
        healthVars['성분'] = ['가르시니아','HCA','녹차추출물','CLA','L-카르니틴','키토산','크롬','카테킨','후코잔틴','공액리놀레산'];
      } else if (/흑마늘|마늘|양파/.test(pn)) {
        healthVars['효과1'] = ['면역력','항산화','피로회복','혈관건강'];
        healthVars['효과2'] = ['면역강화','활력개선','항산화력'];
        healthVars['성분'] = ['흑마늘','S-알릴시스테인','폴리페놀','알리신','셀레늄','아연','비타민B6','게르마늄','사포닌','항산화성분'];
      } else if (/프로틴|단백질|BCAA|아미노산|크레아틴|운동/.test(pn)) {
        healthVars['효과1'] = ['근력강화','근육회복','단백질보충','운동능력'];
        healthVars['효과2'] = ['근육회복','운동효과','근력향상'];
        healthVars['성분'] = ['유청단백질','WPI','WPC','BCAA','L-글루타민','크레아틴','아미노산','카제인','대두단백','콜라겐펩타이드'];
      } else if (/스피루리나|클로렐라|녹즙|녹색/.test(pn)) {
        healthVars['효과1'] = ['영양균형','항산화','면역력','디톡스'];
        healthVars['효과2'] = ['영양보충','항산화력','면역강화'];
        healthVars['성분'] = ['스피루리나','클로렐라','피코시아닌','클로로필','철분','단백질','비타민B12','감마리놀렌산','베타카로틴','아연'];
      }
      return healthVars;
    }
  }
  return parentVars;
}

// ── fillVariables 복제 ──
function fillVariables(text, vars, productName, rng) {
  let result = text.replace(/\{product\}/g, productName);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) return pool[Math.floor(rng() * pool.length)];
    return match;
  });
  return result;
}

function resolveFragmentCategory(catKey) {
  if (FRAGMENTS[catKey]) return catKey;
  if (CATEGORY_ALIASES[catKey]) return CATEGORY_ALIASES[catKey];
  return 'DEFAULT';
}

// ── 건강식품 전체 소분류 테스트 데이터 ──
const HEALTH_SUPPLEMENT_TESTS = [
  // [상품명, 카테고리경로, 기대성분키워드, 금지성분키워드]
  ['콘드로이친K MCT오일 영양제 30정', '식품>건강식품>기타건강식품>콘드로이친', ['콘드로이친','상어연골','MCT','관절'], ['프로폴리스','루테인','비오틴','유산균']],
  ['상어연골 콘드로이친 1000mg 90캡슐', '식품>건강식품>기타건강식품>콘드로이친', ['콘드로이친','상어연골','관절'], ['프로폴리스','루테인','비오틴']],
  ['rTG 오메가3 1000mg 120캡슐', '식품>건강식품>오메가3', ['오메가3','EPA','DHA','크릴오일'], ['프로폴리스','콘드로이친','루테인','유산균']],
  ['크릴오일 1000mg 60캡슐', '식품>건강식품>오메가3>크릴오일', ['크릴오일','오메가3','EPA','DHA'], ['프로폴리스','콘드로이친','유산균']],
  ['종합비타민 멀티비타민 90정', '식품>건강식품>비타민', ['비타민','멀티비타민'], ['콘드로이친','상어연골']],
  ['비타민C 1000mg 고함량 120정', '식품>건강식품>비타민>비타민C', ['비타민C'], ['콘드로이친','상어연골','루테인']],
  ['비타민D3 5000IU 180정', '식품>건강식품>비타민>비타민D', ['비타민D'], ['콘드로이친','프로폴리스']],
  ['루테인 지아잔틴 눈건강 60캡슐', '식품>건강식품>루테인', ['루테인','지아잔틴','눈건강'], ['프로폴리스','콘드로이친','유산균','홍삼']],
  ['밀크씨슬 실리마린 간건강 60정', '식품>건강식품>밀크씨슬', ['밀크씨슬','실리마린','간건강'], ['프로폴리스','콘드로이친','루테인','유산균']],
  ['프로바이오틱스 유산균 100억 60캡슐', '식품>건강식품>유산균', ['유산균','프로바이오틱스','장건강'], ['프로폴리스','콘드로이친','루테인']],
  ['6년근 홍삼정 면역력 60포', '식품>건강식품>홍삼', ['홍삼','인삼','면역'], ['콘드로이친','루테인','유산균']],
  ['글루코사민 관절 영양제 90정', '식품>건강식품>글루코사민', ['글루코사민','관절'], ['프로폴리스','루테인','유산균']],
  ['콜라겐 히알루론산 피부 영양제 60포', '식품>건강식품>콜라겐', ['콜라겐','히알루론산','피부'], ['콘드로이친','프로폴리스','루테인']],
  ['비오틴 5000mcg 모발건강 120정', '식품>건강식품>비오틴', ['비오틴','모발','탈모'], ['콘드로이친','프로폴리스','루테인','유산균']],
  ['프로폴리스 면역력 60캡슐', '식품>건강식품>프로폴리스', ['프로폴리스','면역'], ['콘드로이친','루테인']],
  ['마그네슘 400mg 90정', '식품>건강식품>미네랄>마그네슘', ['마그네슘'], ['프로폴리스','콘드로이친','루테인']],
  ['칼슘 마그네슘 비타민D 90정', '식품>건강식품>미네랄>칼슘', ['칼슘','마그네슘','비타민D'], ['프로폴리스','콘드로이친']],
  ['아연 셀레늄 면역 90정', '식품>건강식품>미네랄>아연', ['아연','셀레늄'], ['프로폴리스','콘드로이친','루테인']],
  ['코엔자임Q10 심장건강 60캡슐', '식품>건강식품>코엔자임Q10', ['코엔자임Q10','심장건강'], ['콘드로이친','루테인','유산균']],
  ['쏘팔메토 전립선건강 60캡슐', '식품>건강식품>쏘팔메토', ['쏘팔메토','전립선'], ['프로폴리스','콘드로이친','루테인']],
  ['엽산 임산부 비타민 90정', '식품>건강식품>엽산', ['엽산','임산부'], ['콘드로이친','프로폴리스']],
  ['철분 빈혈 60정', '식품>건강식품>철분', ['철분'], ['콘드로이친','프로폴리스','루테인']],
  ['가르시니아 다이어트 60정', '식품>건강식품>다이어트보조제', ['가르시니아','다이어트','체지방'], ['프로폴리스','콘드로이친','루테인']],
  ['보스웰리아 관절건강 60정', '식품>건강식품>보스웰리아', ['보스웰리아','관절'], ['프로폴리스','루테인','유산균']],
  ['흑마늘 진액 30포', '식품>건강식품>흑마늘', ['흑마늘','면역'], ['프로폴리스','콘드로이친','루테인']],
  ['스피루리나 녹색영양 60정', '식품>건강식품>스피루리나', ['스피루리나'], ['프로폴리스','콘드로이친','루테인']],
  ['크레아틴 운동보조제 300g', '식품>건강식품>운동보조식품', ['크레아틴','운동'], ['프로폴리스','콘드로이친','루테인']],
  ['단백질 프로틴 파우더 1kg', '식품>건강식품>프로틴', ['프로틴','단백질'], ['프로폴리스','콘드로이친','루테인']],
];

// ── 테스트 실행 ──
console.log('═══════════════════════════════════════════════════════════════');
console.log(' 건강식품 리뷰 성분 불일치 전수 테스트');
console.log(' 테스트 수: ' + HEALTH_SUPPLEMENT_TESTS.length + '개 소분류');
console.log('═══════════════════════════════════════════════════════════════\n');

const SELLER_SEED = 'test_seller_12345';
let totalIssues = 0;
let totalTests = 0;
const issues = [];

for (const [productName, categoryPath, _expectedIngrs, forbiddenIngrs] of HEALTH_SUPPLEMENT_TESTS) {
  const catKey = '식품'; // getReviewCategoryKey → '식품'
  const vars = resolveVariablePool(categoryPath, catKey, productName);
  const fragCatKey = resolveFragmentCategory(catKey);
  const fragments = FRAGMENTS[fragCatKey] || FRAGMENTS['DEFAULT'];

  // 성분 풀 검사
  const ingrPool = vars['성분'] || [];
  const ingrPool2 = vars['성분2'] || [];
  const allIngrs = [...ingrPool, ...ingrPool2];

  // 리뷰 텍스트 5번 생성하여 금지 성분 언급 확인
  for (let trial = 0; trial < 5; trial++) {
    totalTests++;
    const seed = stringToSeed(`${SELLER_SEED}::realreview::${trial}::${productName}`);
    const rng = createSeededRandom(seed);

    // 프레임 선택
    const weights = ['CONCLUSION_FIRST', 'REPURCHASE', 'GIFT_STORY', 'DAILY_LIFE', 'COMPARISON'];
    const frameId = weights[Math.floor(rng() * weights.length)];
    const frame = FRAMES[frameId];
    if (!frame) continue;

    // 전체 리뷰 텍스트 생성
    let reviewText = '';
    for (const section of frame.structure) {
      const pool = fragments[section];
      if (!pool) continue;
      const opener = pool.openers[Math.floor(rng() * pool.openers.length)] || '';
      const value = pool.values[Math.floor(rng() * pool.values.length)] || '';
      const closer = pool.closers[Math.floor(rng() * pool.closers.length)] || '';
      let raw = [opener, value, closer].filter(Boolean).join(' ');
      raw = fillVariables(raw, vars, productName, rng);
      reviewText += raw + ' ';
    }

    // 금지 성분 검사
    for (const forbidden of forbiddenIngrs) {
      if (reviewText.includes(forbidden)) {
        totalIssues++;
        issues.push({
          product: productName,
          category: categoryPath,
          forbidden,
          context: reviewText.substring(
            Math.max(0, reviewText.indexOf(forbidden) - 20),
            reviewText.indexOf(forbidden) + forbidden.length + 20,
          ),
        });
      }
    }
  }

  // 성분 풀 자체에 금지 성분이 있는지 확인
  for (const forbidden of forbiddenIngrs) {
    if (allIngrs.some(i => i.includes(forbidden))) {
      const poolName = ingrPool.some(i => i.includes(forbidden)) ? '성분' : '성분2';
      console.log(`  [POOL] ${productName.padEnd(35)} ${poolName} 풀에 "${forbidden}" 포함됨`);
    }
  }
}

console.log('\n=== 성분 풀 불일치 결과 ===\n');

// 효과 오버라이드 누락 검사
console.log('=== 효과 오버라이드 매칭 검사 ===\n');
for (const [productName, categoryPath] of HEALTH_SUPPLEMENT_TESTS) {
  const vars = resolveVariablePool(categoryPath, '식품', productName);
  const genericVars = VARIABLES['식품>건강식품'] || {};
  const isGenericEffect = vars['효과1'] === genericVars['효과1'] ||
    JSON.stringify(vars['효과1']) === JSON.stringify(genericVars['효과1']);
  const isGenericIngr = vars['성분'] === genericVars['성분'] ||
    JSON.stringify(vars['성분']) === JSON.stringify(genericVars['성분']);

  const effectStatus = isGenericEffect ? 'GENERIC ⚠️' : 'MATCHED ✓';
  const ingrStatus = isGenericIngr ? 'GENERIC ⚠️' : 'MATCHED ✓';
  const short = productName.slice(0, 35).padEnd(35);
  console.log(`  ${short} 효과: ${effectStatus.padEnd(14)} 성분: ${ingrStatus}`);
}

console.log(`\n=== 리뷰 생성 금지성분 언급 ===`);
console.log(`  총 ${totalTests}건 생성, ${totalIssues}건 불일치\n`);

if (issues.length > 0) {
  const uniqueProducts = [...new Set(issues.map(i => i.product))];
  for (const pname of uniqueProducts) {
    const pIssues = issues.filter(i => i.product === pname);
    const forbids = [...new Set(pIssues.map(i => i.forbidden))];
    console.log(`  ${pname}`);
    console.log(`    금지성분 언급: ${forbids.join(', ')}`);
    if (pIssues[0]) {
      console.log(`    예시: "...${pIssues[0].context}..."`);
    }
    console.log();
  }
}

console.log('\n' + '═'.repeat(65));
console.log(` 결과: ${totalIssues === 0 ? '모든 테스트 통과!' : `${totalIssues}건 불일치 — 수정 필요`}`);
console.log('═'.repeat(65));

if (totalIssues > 0) process.exit(1);
