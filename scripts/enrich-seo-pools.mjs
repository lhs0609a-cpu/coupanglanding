// scripts/enrich-seo-pools.mjs
// L1 base pool 보강 + 16,259 카테고리에 대해 누락된 categoryPools 자동 생성.
//
// 전략:
// 1) 16개 L1 카테고리에 강력한 base ingredients/features 정의 (각 20+ 항목)
// 2) 카테고리 path 별로 fallback이 generic-only가 되지 않도록 ingredients/features 채움
// 3) 기존 풀은 union 보강 (덮어쓰지 않음)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POOL_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'seo-keyword-pools.json');
const CAT_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');

const data = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
const cats = JSON.parse(readFileSync(CAT_PATH, 'utf8'));

// ─── L1 base pools — 모든 fallback의 최후 안전망 ─────────────
// (universalModifiers와 별개로 카테고리 톤에 맞는 ingredients/features)
const L1_BASE = {
  '뷰티': {
    ingredients: ['콜라겐','히알루론산','세라마이드','펩타이드','비타민C','나이아신아마이드','레티놀','프로폴리스','센텔라','시카','녹차','알로에','EGF','마데카','글루타치온','알부틴','바쿠치올','달팽이','티트리','약산성','PHA','BHA','AHA','판테놀'],
    features: ['보습','수분','탄력','진정','미백','주름개선','안티에이징','리프팅','각질','모공','발효','고농축','저자극','민감피부','건성피부','지성피부','복합성','집중케어','데일리','약산성','피부장벽','광채'],
  },
  '식품': {
    ingredients: ['단백질','식이섬유','오메가3','유산균','비타민D','칼슘','철분','마그네슘','아연','비오틴','콜라겐','홍삼','프로폴리스','녹용','쌀','잡곡','견과류','과일','채소','한우','국내산','산지직송','신선'],
    features: ['건강','영양','면역','피로회복','체력','다이어트','저칼로리','무첨가','유기농','HACCP','GMP','국산','산지직송','신선도','당일배송','대용량','선물용','가족용','어린이','시니어','균형','보충'],
  },
  '생활용품': {
    ingredients: ['천연','식물성','대나무','천연펄프','순면','마이크로파이버','EVA','PP','PE','스테인리스','실리콘','소프트','워셔블','다회용','일회용','항균','살균','탈취'],
    features: ['세정력','탈취','살균','항균','보습','내구성','대용량','경량','무독성','친환경','다회용','휴대용','다용도','수납','정리','수분흡수','빠른건조','안전','편리','가성비'],
  },
  '가전/디지털': {
    ingredients: ['스테인리스','알루미늄','강화유리','LED','OLED','LCD','HEPA필터','카본필터','구리코일','세라믹','특수강','복합소재','마이크로프로세서','블루투스','Wi-Fi'],
    features: ['에너지효율','저소음','대용량','컴팩트','스마트','자동','터치','원격제어','음성인식','IoT','블루투스','Wi-Fi','HDR','초고화질','초저소음','절전','안전','내구성','A/S','국내정발','정품'],
  },
  '패션의류잡화': {
    ingredients: ['면','순면','폴리에스터','레이온','스판덱스','리넨','울','캐시미어','가죽','천연가죽','인조가죽','데님','폴리','나일론','실크','모직','폴리우레탄','코튼','텐셀'],
    features: ['편안함','스타일','데일리','오피스룩','캐주얼','베이직','트렌디','클래식','모던','시즌리스','사계절','신축성','통기성','보온','발수','생활방수','가성비','빅사이즈','미니멀','베이지','블랙','화이트','네이비'],
  },
  '가구/홈데코': {
    ingredients: ['원목','MDF','PB','파티클보드','자작나무','오크','월넛','패브릭','메모리폼','라텍스','스테인리스','금속','강화유리','대리석','PVC','PE','폴리','면','마이크로파이버'],
    features: ['실용성','수납','조립간편','내구성','심플','모던','북유럽','미니멀','클래식','디자인','컴팩트','대형','이동식','접이식','다용도','거실','침실','주방','홈오피스','1인가구','가족용','인테리어'],
  },
  '출산/유아동': {
    ingredients: ['유기농','오가닉','순면','대나무섬유','천연','무형광','무염소','무알콜','순한','약산성','BPA-free','프탈레이트프리','스테인리스','실리콘','EVA','저자극','피부친화'],
    features: ['안전','부드러움','자극없음','피부친화','신생아','영아','유아','어린이','민감피부','저자극','순한','무첨가','국내제조','KC인증','부모안심','선물용','대용량','가성비','베이비','아동용'],
  },
  '스포츠/레져': {
    ingredients: ['폴리에스터','나일론','스판덱스','쿨맥스','드라이핏','메쉬','EVA','TPU','카본','알루미늄','스테인리스','고탄성','경량'],
    features: ['통기성','신축성','쿨링','속건','발수','경량','내구성','전문가용','입문용','초보자','중상급','휴대','접이식','조절','다목적','홈트레이닝','캠핑','등산','자전거','피트니스'],
  },
  '주방용품': {
    ingredients: ['스테인리스','304','316','3중','5중','다층','알루미늄','무쇠','세라믹','법랑','강화유리','내열유리','실리콘','우드','대나무','PP','PE','내열소재'],
    features: ['논스틱','인덕션','가스','전자레인지','식기세척기','오븐','고른가열','내구성','경량','대용량','컴팩트','수납','보관','다용도','홈쿡','에어프라이어','캠핑'],
  },
  '반려/애완용품': {
    ingredients: ['닭고기','연어','소고기','오리','양고기','고구마','브로콜리','블루베리','프로바이오틱스','글루코사민','유기농','HACCP','AAFCO','무항생제','Non-GMO','자연재료'],
    features: ['기호성','영양균형','소화흡수','모질개선','관절건강','체중관리','면역력','구강건강','피모건강','장건강','배변개선','활력','스트레스해소','노령견','퍼피','소형견','대형견','고양이','다묘가정','실내견'],
  },
  '완구/취미': {
    ingredients: ['ABS','PP','PE','목재','자작나무','패브릭','EVA','실리콘','종이','두꺼운종이','특수재질','무독성','BPA-free','KC인증'],
    features: ['창의력','지능발달','학습','놀이','집중력','협동','감각','오감','두뇌','연령별','3세이상','5세이상','초등','선물용','수집','매니아','코스프레','피규어','보드게임','퍼즐','블록'],
  },
  '자동차용품': {
    ingredients: ['ABS','PVC','PE','PU','EVA','스테인리스','알루미늄','구리','카본','실리콘','특수가공','내열','내한','내UV','발수코팅','광택','왁스'],
    features: ['차량용','발수','광택','코팅','방오','내열','내한','경량','내구성','범용','전용','OEM','순정','튜닝','세차','관리','실내','외장','시거잭','12V','24V','블랙박스','네비게이션'],
  },
  '문구/오피스': {
    ingredients: ['종이','두꺼운종이','PP','PE','PVC','금속','스테인리스','잉크','수성잉크','유성잉크','겔잉크','목재','자작나무','패브릭','가죽'],
    features: ['필기감','부드러움','선명','오래가는','학생용','사무용','고급','클래식','심플','모던','데일리','다이어리','노트','메모','휴대','정리','수납','선물용','한정판','컬렉션'],
  },
  '도서': {
    ingredients: ['종이','코팅지','두꺼운종이','특수지','한지','반양장','양장','페이퍼백','하드커버'],
    features: ['교양','학습','자기계발','베스트셀러','신간','스테디셀러','초등','중등','고등','수험','자격증','전문서','입문서','어린이','청소년','성인','선물용','한정판','개정판'],
  },
  '문구/사무': {
    ingredients: ['종이','PP','PE','금속','스테인리스','잉크','목재'],
    features: ['필기감','선명','오래가는','학생용','사무용','심플','모던','데일리','휴대','정리','수납','선물용'],
  },
};

// 기존 categoryPools 유지하면서 누락 보강
const pools = data.categoryPools;
let updatedExisting = 0;
let createdNew = 0;
let skippedNoL1 = 0;

// L1 path별 풀 생성 helper
function buildPoolForPath(catPath) {
  const segs = catPath.split('>');
  const l1 = segs[0];
  const leaf = segs[segs.length - 1];

  const base = L1_BASE[l1];
  if (!base) return null;

  // generic = leaf + 인접 segments
  const generic = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] && !generic.includes(segs[i])) generic.push(segs[i]);
    if (generic.length >= 4) break;
  }
  if (l1 && !generic.includes(l1)) generic.push(l1);

  return {
    generic: generic.slice(0, 5),
    ingredients: [...base.ingredients],
    features: [...base.features],
  };
}

// 16,259 카테고리 모두 순회
for (const [code, v] of Object.entries(cats)) {
  if (!v || !v.p || typeof v.p !== 'string') continue;
  const catPath = v.p;
  const segs = catPath.split('>');
  const l1 = segs[0];

  // 기존 풀이 있으면 ingredients/features만 보강
  const existing = pools[catPath];
  if (existing) {
    const base = L1_BASE[l1];
    if (!base) continue;
    let changed = false;
    if (!existing.ingredients || existing.ingredients.length === 0) {
      existing.ingredients = [...base.ingredients];
      changed = true;
    }
    if (!existing.features || existing.features.length === 0) {
      existing.features = [...base.features];
      changed = true;
    }
    if (changed) updatedExisting++;
    continue;
  }

  // 신규 풀 생성
  const newPool = buildPoolForPath(catPath);
  if (!newPool) {
    skippedNoL1++;
    continue;
  }
  pools[catPath] = newPool;
  createdNew++;
}

// L1 root 키도 보강 — fallback 안전망
for (const l1 of Object.keys(L1_BASE)) {
  const base = L1_BASE[l1];
  if (!pools[l1]) {
    pools[l1] = {
      generic: [l1],
      ingredients: [...base.ingredients],
      features: [...base.features],
    };
    createdNew++;
  } else {
    if (!pools[l1].ingredients || pools[l1].ingredients.length === 0) {
      pools[l1].ingredients = [...base.ingredients];
      updatedExisting++;
    }
    if (!pools[l1].features || pools[l1].features.length === 0) {
      pools[l1].features = [...base.features];
    }
  }
}

writeFileSync(POOL_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`기존 풀 보강: ${updatedExisting}`);
console.log(`신규 풀 생성: ${createdNew}`);
console.log(`L1 매핑 없어 스킵: ${skippedNoL1}`);
console.log(`최종 categoryPools 키: ${Object.keys(pools).length}`);
