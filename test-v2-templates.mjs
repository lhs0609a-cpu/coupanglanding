#!/usr/bin/env node
// ============================================================
// v2 템플릿 뱅크 품질 검증
//
// story-templates-v2.json을 직접 로드해서 변수 치환 후
// 문법 품질(조사, 미해결 변수, 연속 공백)을 검사하고
// 샘플을 출력한다.
//
// composer 로직을 경유하지 않고 JSON만 검증하므로
// next 빌드 없이 Node.js로 바로 실행 가능.
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const v2 = JSON.parse(readFileSync(
  join(__dirname, 'src/lib/megaload/data/story-templates-v2.json'),
  'utf-8',
));

// ─── 변수 슬롯 치환 유틸 ─────────────────────────────────

// 카테고리별 샘플 변수 사전
const SAMPLE_VARS_BY_CAT = {
  '식품>음료': {
    '효과1': ['풍부한 풍미','깊은 향','부드러운 목넘김','청량감','상쾌함'],
    '효과2': ['갈증해소','집중력','만족감','리프레시','활력'],
    '성분': ['아라비카 원두','100% 과일 농축액','유기농 곡물','생수','천연추출물'],
    '사용법': ['아침 공복에','식후에','취향에 맞게','차갑게','따뜻하게'],
    '사용감': ['부드러운','깔끔한','진한','향긋한','시원한'],
    '추천대상': ['직장인','수험생','커피 애호가','카페마니아','홈카페'],
    '카테고리': ['음료','커피','과일주스','전통차','생수'],
    '기간': ['1주일','한 달','2주일','3일'],
    '인증': ['HACCP','GMP','식약처','ISO'],
  },
  '뷰티': {
    '효과1': ['수분감','탄력','미백','영양','진정'],
    '효과2': ['매끈함','결정돈','생기','광채','촉촉함'],
    '성분': ['히알루론산','세라마이드','나이아신아마이드','비타민C','펩타이드'],
    '사용법': ['하루 두 번','세안 후','자기 전에','아침저녁으로'],
    '사용감': ['부드러운','촉촉한','가벼운','산뜻한','쫀쫀한'],
    '추천대상': ['건성피부','민감피부','복합성피부','중년 여성','20대'],
    '카테고리': ['크림','세럼','로션','에센스','스킨','립스틱'],
    '기간': ['2주','한 달','3개월','6주'],
    '인증': ['피부테스트','식약처','EWG','비건','더마테스트'],
  },
  '식품': {
    '효과1': ['신선함','깊은 맛','담백함','고소함','자연스러운 단맛'],
    '효과2': ['영양균형','만족감','포만감','건강','활력'],
    '성분': ['국내산 원재료','유기농 재료','엄선된 식재료','천연 조미료','무첨가'],
    '사용법': ['간편하게','조리해서','데워서','바로 꺼내','바로 섭취'],
    '사용감': ['담백한','고소한','부드러운','깔끔한','진한'],
    '추천대상': ['자취생','주부','바쁜 직장인','운동인','어르신'],
    '카테고리': ['간편식','가공식품','반찬','밀키트','식재료'],
    '기간': ['1주일','한 달','2주일'],
    '인증': ['HACCP','식약처','유기농','국산','농산물품질관리원'],
  },
  '생활용품': {
    '효과1': ['청결','편의성','내구성','위생','실용성'],
    '효과2': ['시간절약','정돈','안심','공간활용','쾌적함'],
    '성분': ['친환경 소재','안전 원료','탄탄한 구조','부드러운 재질','항균 처리'],
    '사용법': ['간편하게','필요할 때','일상적으로','정기적으로'],
    '사용감': ['편리한','깔끔한','견고한','안정적인','가벼운'],
    '추천대상': ['자취생','주부','신혼부부','1인가구','사무직'],
    '카테고리': ['세제','수납함','욕실용품','청소용품','생활소품'],
    '기간': ['한 달','1주일','6개월'],
    '인증': ['KC','친환경','안전검사','ISO','환경부'],
  },
  '가전/디지털': {
    '효과1': ['뛰어난 성능','편의성','정교함','강력한 출력','빠른 응답'],
    '효과2': ['시간절약','에너지효율','만족감','편리함','안정성'],
    '성분': ['고성능 부품','내구성 소재','정밀 설계','최신 기술','검증된 칩셋'],
    '사용법': ['전원 연결 후','앱으로','간단한 설정 후','음성 명령으로'],
    '사용감': ['직관적인','편리한','안정적인','강력한','부드러운'],
    '추천대상': ['1인가구','직장인','게이머','학생','주부'],
    '카테고리': ['청소기','공기청정기','무선 이어폰','모니터','노트북'],
    '기간': ['한 달','3개월','1년'],
    '인증': ['KC','에너지효율','CE','FCC','RoHS'],
  },
  '주방용품': {
    '효과1': ['내구성','조리 편의','그립감','세척 편의','가벼움'],
    '효과2': ['요리효율','위생','공간활용','사용만족도','안전성'],
    '성분': ['스테인리스','세라믹 코팅','탄탄한 구조','무독성 소재','내열성 재질'],
    '사용법': ['일상 요리에','조리 후','간단히 세척','용도에 맞게'],
    '사용감': ['견고한','편리한','깔끔한','안정적인','가벼운'],
    '추천대상': ['자취생','홈쿡','주부','요리 초보','캠퍼'],
    '카테고리': ['프라이팬','냄비','칼','도마','식기'],
    '기간': ['한 달','6개월','1년'],
    '인증': ['KC','식약처','무독성','HACCP','환경부'],
  },
  '패션의류잡화': {
    '효과1': ['세련된 핏','편안함','내구성','소재감','완성도'],
    '효과2': ['스타일','활동성','자신감','데일리 활용','고급스러움'],
    '성분': ['면혼방','린넨','울','폴리','코튼'],
    '사용법': ['데일리로','포인트로','레이어드로','기본 아이템과 함께'],
    '사용감': ['편안한','세련된','부드러운','가벼운','고급스러운'],
    '추천대상': ['직장인','20대','30대','남성','여성'],
    '카테고리': ['티셔츠','원피스','자켓','바지','니트'],
    '기간': ['한 시즌','1년','6개월'],
    '인증': ['OEKO-TEX','KC','면혼방','친환경'],
  },
};

function hasFinalConsonant(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

const VAR_BOUNDARY = '\u0001';

// 변수 치환 경계(VAR_BOUNDARY)에 접한 조사만 교정.
// 템플릿 내부의 "있는/없는/뭔가" 같은 단어는 보호됨.
function fixParticlesAtBoundary(text) {
  const b = VAR_BOUNDARY;
  return text
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(은|는)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '은' : '는'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(이|가)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '이' : '가'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(을|를)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '을' : '를'))
    .replace(new RegExp(`([\\uAC00-\\uD7A3])${b}(과|와)`, 'g'), (_, prev) =>
      prev + (hasFinalConsonant(prev) ? '과' : '와'))
    .replace(new RegExp(b, 'g'), '');
}

let seed = 42;
function rng() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

function fillTemplate(template, productName, vars) {
  const b = VAR_BOUNDARY;
  let result = template.replace(/\{product\}/g, productName + b);
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    const pool = vars[key];
    if (pool && pool.length > 0) {
      return pool[Math.floor(rng() * pool.length)] + b;
    }
    return '';
  });
  return fixParticlesAtBoundary(result).replace(/\s{2,}/g, ' ').trim();
}

// ─── 1. 카테고리 확인 ────────────────────────────────────

console.log('='.repeat(72));
console.log('v2 템플릿 뱅크 로드 확인');
console.log('='.repeat(72));
const categories = Object.keys(v2.templates);
console.log(`등록된 카테고리: ${categories.length}개`);
for (const cat of categories) {
  const blocks = Object.keys(v2.templates[cat]);
  console.log(`  ${cat}: ${blocks.length}개 블록타입`);
  for (const b of blocks) {
    const t = v2.templates[cat][b];
    const count = Array.isArray(t) ? t.length : `titles:${t.titles.length}/items:${t.items.length}`;
    console.log(`    - ${b}: ${count}`);
  }
}

// ─── 2. 샘플 출력: 각 카테고리당 1개 샘플 ─────────────

const SAMPLES = [
  { cat: '식품>음료', product: '제주 감귤주스 1L 12팩' },
  { cat: '뷰티', product: '히알루론산 수분크림 50ml' },
  { cat: '식품', product: '유기농 쌀 10kg' },
  { cat: '생활용품', product: '대용량 수납 박스 3개 세트' },
  { cat: '가전/디지털', product: '무선 스틱 청소기 S20' },
  { cat: '주방용품', product: '프리미엄 논스틱 프라이팬 28cm' },
  { cat: '패션의류잡화', product: '프리미엄 면 티셔츠 2PACK' },
];

const blockOrder = ['hook','problem','agitation','solution','feature_detail','benefits_grid','social_proof','comparison','usage_guide','urgency','cta'];

for (const sample of SAMPLES) {
  const { cat, product: productName } = sample;
  const vars = SAMPLE_VARS_BY_CAT[cat] || SAMPLE_VARS_BY_CAT['식품>음료'];
  const catTpl = v2.templates[cat];
  if (!catTpl) continue;

  console.log('\n\n' + '='.repeat(72));
  console.log(`샘플: ${cat} / "${productName}"`);
  console.log('='.repeat(72));

  for (const blockType of blockOrder) {
    const tpl = catTpl[blockType];
    if (!tpl) continue;
    console.log(`\n◆ [${blockType}]`);
    if (blockType === 'benefits_grid') {
      const title = fillTemplate(tpl.titles[Math.floor(rng() * tpl.titles.length)], productName, vars);
      console.log(`  제목: ${title}`);
      const items = [];
      const used = new Set();
      while (items.length < 5 && used.size < tpl.items.length) {
        const idx = Math.floor(rng() * tpl.items.length);
        if (!used.has(idx)) {
          used.add(idx);
          items.push(fillTemplate(tpl.items[idx], productName, vars));
        }
      }
      items.forEach(it => console.log(`    • ${it}`));
    } else {
      const idx1 = Math.floor(rng() * tpl.length);
      let idx2 = Math.floor(rng() * tpl.length);
      if (idx2 === idx1 && tpl.length > 1) idx2 = (idx1 + 1) % tpl.length;
      const content = fillTemplate(tpl[idx1], productName, vars);
      const subContent = fillTemplate(tpl[idx2], productName, vars);
      console.log(`  content: ${content}`);
      console.log(`  sub    : ${subContent}`);
    }
  }
}

// ─── 3. 전체 템플릿 문법 품질 일괄 검사 ─────────────────

console.log('\n\n' + '='.repeat(72));
console.log('전체 템플릿 문법 품질 검사');
console.log('='.repeat(72));

const AWKWARD_PATTERNS = [
  { re: /[가-힣]+는를\b/, name: '는를' },
  { re: /[가-힣]+이을\b/, name: '이을' },
  { re: /[가-힣]+을를\b/, name: '을를' },
  { re: /[가-힣]+는이\b/, name: '는이' },
  { re: /있은/, name: '있은(있는 오교정)' },
  { re: /없은/, name: '없은(없는 오교정)' },
  { re: /뭔이/, name: '뭔이(뭔가 오교정)' },
  { re: /누군이/, name: '누군이(누군가 오교정)' },
  { re: /어딘이/, name: '어딘이(어딘가 오교정)' },
  { re: /언젠이/, name: '언젠이(언젠가 오교정)' },
  { re: /\{[^}]+\}/, name: '미해결 변수' },
  { re: /\s{2,}/, name: '연속 공백' },
];

let totalChecked = 0;
let totalAwkward = 0;
const issues = [];

// 각 카테고리별 자체 SAMPLE_VARS로 50회씩 치환 검증
for (let iter = 0; iter < 50; iter++) {
  for (const cat of categories) {
    const vars = SAMPLE_VARS_BY_CAT[cat] || SAMPLE_VARS_BY_CAT['식품>음료'];
    const productName = '테스트 상품 500ml';
    for (const blockType of Object.keys(v2.templates[cat])) {
      const tpl = v2.templates[cat][blockType];
      const arr = Array.isArray(tpl) ? tpl
        : [...tpl.titles, ...tpl.items];
      for (const t of arr) {
        totalChecked++;
        const filled = fillTemplate(t, productName, vars);
        for (const p of AWKWARD_PATTERNS) {
          if (p.re.test(filled)) {
            totalAwkward++;
            if (issues.length < 20) {
              issues.push(`  ❌ [${cat}/${blockType}] ${p.name}: "${filled}"`);
              issues.push(`     (원본: ${t})`);
            }
            break;
          }
        }
      }
    }
  }
}

if (issues.length > 0) {
  console.log('\n발견된 문제 (최대 10건):');
  issues.forEach(s => console.log(s));
}

console.log(`\n검사: ${totalChecked} 치환, 어색함: ${totalAwkward} (${(totalAwkward/totalChecked*100).toFixed(3)}%)`);

if (totalAwkward === 0) {
  console.log('\n✅ v2 템플릿 전부 문법 깔끔');
} else {
  console.log(`\n⚠️  ${totalAwkward}건 문제 발견 — 템플릿 원문 또는 조사 교정 보완 필요`);
}
