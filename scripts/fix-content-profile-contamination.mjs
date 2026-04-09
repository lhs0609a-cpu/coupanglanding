#!/usr/bin/env node
// 상세페이지 콘텐츠-상품 연관성 개선 — CPG 프로필 오염 직접 수정
// 각 카테고리별로 올바른 서브카테고리 변수로 교체 + forbiddenTerms 추가
//
// 대상 파일:
//  1. 자동차용품.json — 차량용디지털기기 4 profiles (세차→디지털)
//  2. 식품.json — 커피/음료 5 profiles (건강식품→일반식품)
//  3. 생활용품.json — 공구 8 profiles (세정→공구)
//  4. 문구.json — 18 profiles (필기→일반 사무)
//  5. 주방용품.json — 보온/보냉 1 profile (조리→보온)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'src/lib/megaload/data/content-profiles');

// ─── 카테고리별 올바른 변수 정의 ─────────────────────────

const AUTO_DIGITAL_VARS = {
  '효과1': [
    '화질','감도','야간촬영','녹화시간','GPS정확도','충전속도','응답속도',
    '밝기','감지력','연결성','선명도','해상도','저장용량','인식률'
  ],
  '효과2': [
    '안전성','편의성','내구성','증거확보','가시성','안정성','신뢰성','정확도'
  ],
  '사용법': [
    '시동 후 자동 작동','설치 후 자동 녹화','블루투스로 연결 후','전원 연결 후 작동',
    '차량에 장착 후 사용','스마트폰과 페어링하여','설정 후 바로 사용'
  ],
  '사용감': [
    '편리한','안정적인','선명한','스마트한','믿음직한','강력한','전문적인','든든한'
  ],
  '추천대상': [
    '초보운전','SUV 오너','장거리운전','출퇴근','차량관리','신차 오너',
    '수입차','경차','트럭','택시기사','화물차','야간운전','주차감시'
  ],
};

const AUTO_DIGITAL_FORBIDDEN = [
  '세차','광택','발수','코팅','왁스','세정력','방수','방오력','윤활','세차편의',
  '1정','복용','영양제','건강기능식품','면역력','섭취','탈취','살균','필기감','토크'
];

const FOOD_COFFEE_BEVERAGE_VARS = {
  '효과1': [
    '맛','향','풍미','농도','부드러움','깔끔함','상큼함','청량감','달콤함',
    '시원함','진한맛','고소함','향긋함','깊은맛'
  ],
  '효과2': [
    '갈증해소','기분전환','편의성','가성비','카페인충전','리프레시','집중력','활력','만족감'
  ],
  '사용법': [
    '아침에 한 잔','식후 디저트로','취향에 맞게 즐기세요','차갑게 즐기세요',
    '뜨거운 물에 우려','얼음과 함께','간편하게 즐겨','따뜻하게 마시며'
  ],
  '사용감': [
    '깔끔한','부드러운','진한','향긋한','상쾌한','고소한','달콤한','시원한','부담없는'
  ],
  '추천대상': [
    '커피러버','카페인충전','직장인','수험생','다이어터','아침대용','운동후',
    '여름음료','카페마니아','홈카페','차마니아','학생'
  ],
  '인증': [
    'HACCP','식약처','GMP','ISO','원산지증명'
  ],
};

const FOOD_COFFEE_BEVERAGE_FORBIDDEN = [
  '면역력','간건강','뼈건강','관절건강','관절','장건강','혈관건강','혈당관리',
  '콜레스테롤관리','체지방감소','항산화','영양균형','피부탄력',
  '1정','1정 섭취','복용','건강기능식품','영양제','섭취량','캡슐','정제',
  '세차','광택','발수','필기감','토크','인덕션'
];

const LIFE_TOOL_VARS = {
  '효과1': [
    '내구성','정밀도','그립감','토크','절단력','편의성','안전성','휴대성',
    '다기능','강도','출력','속도','정밀성','회전력','날카로움'
  ],
  '효과2': [
    '작업효율','내구성','편리함','안전성','정밀성','생산성','휴대성','견고함'
  ],
  '사용법': [
    '간편하게 조립','설명서대로 작업','안전장비 착용 후','전원 연결 후 사용',
    '부품 교체 후 사용','매뉴얼 참조하여','충전 후 작업','정확히 측정 후'
  ],
  '사용감': [
    '견고한','강력한','안정적인','묵직한','정밀한','편리한','프로페셔널한','든든한','날카로운'
  ],
  '추천대상': [
    'DIY초보','전문가','가정용','인테리어','자취생','공방','목공','배관',
    '현장작업','수리공','건설현장','취미공방'
  ],
};

const LIFE_TOOL_FORBIDDEN = [
  '세정력','탈취','살균','섬유유연','세제','세척력','탈취력','방향',
  '면역력','복용','영양제','건강기능식품','섭취','1정',
  '세차','광택','발수','필기감','인덕션','논스틱','코팅'
];

const OFFICE_VARS = {
  '효과1': [
    '내구성','편의성','수납력','디자인','정확성','생산성','보존력','휴대성',
    '효율성','안정감','정리력','활용도','심미성','실용성','가독성'
  ],
  '효과2': [
    '작업효율','깔끔함','정리정돈','편리함','심미성','오래감','가성비','활용도','실용성','세련됨'
  ],
  '사용법': [
    '책상 위에 정리하여','필요할 때 꺼내어','파일에 분류하여 보관','다이어리와 함께',
    '회의 시 활용하여','서류와 함께 보관','작업 중 가볍게','업무에 활용하여'
  ],
  '사용감': [
    '깔끔한','고급스러운','가벼운','견고한','심플한','세련된','깨끗한','단정한','실용적인'
  ],
  '추천대상': [
    '학생','직장인','수험생','디자이너','작가','교사','프리랜서','기획자','사무직','대학생','회사원'
  ],
};

const OFFICE_FORBIDDEN = [
  '세차','광택','발수','세정력','탈취','살균','토크','절단력','드릴','윤활',
  '면역력','복용','영양제','건강기능식품','1정','섭취',
  '논스틱','인덕션','프라이팬','중약불','보온력'
];

// 필기구는 개별 "필기감" 변수 유지
const OFFICE_WRITING_VARS = {
  ...OFFICE_VARS,
  '효과1': [
    '필기감','발색','정확성','내구성','그립감','잉크지속','선명도','부드러움',
    '표현력','가독성','휴대성','수납력','정리력','내구성'
  ],
  '사용법': [
    '책상 위에 정리하여','필기 시 가볍게 잡고','파일에 분류하여 보관','다이어리에 기록하며',
    '회의 시 메모하며','노트에 정리하며','업무에 활용하여'
  ],
};

const KITCHEN_THERMAL_VARS = {
  '효과1': [
    '밀폐력','보온력','보냉력','내구성','그립감','세척편의','디자인','가벼움',
    '수납편의','위생성','누출방지','단열효과','내열성','휴대성'
  ],
  '효과2': [
    '밀폐력','보온력','편의성','디자인','위생관리','휴대성','다용도','에너지절감'
  ],
  '사용법': [
    '뜨거운 음료를 담아','얼음과 함께 보관','밀봉 후 보관','식기세척기에 넣어',
    '간편하게 세척','출근길에 휴대하여','차갑게 유지하여','따뜻하게 담아'
  ],
  '사용감': [
    '견고한','세련된','편리한','깔끔한','고급스러운','실용적인','가벼운','안정적인'
  ],
  '추천대상': [
    '자취생','직장인','학생','캠퍼','다이어터','밀프렙','도시락족','피크닉',
    '홈카페','출근길','운동러','여행객'
  ],
};

const KITCHEN_THERMAL_FORBIDDEN = [
  '논스틱','인덕션','프라이팬','중약불','프라이','후라이','코팅','조리편의',
  '열전도','요리편의','세차','광택','발수',
  '복용','1정','면역력','건강기능식품','영양제','섭취','필기감','토크'
];

// ─── 유틸: 프로필 변수 패치 ──────────────────────────────

function patchProfile(profile, newVars, forbiddenTerms, keys = Object.keys(newVars)) {
  if (!profile || !profile.variables) return false;
  for (const k of keys) {
    if (newVars[k]) {
      profile.variables[k] = [...newVars[k]];
    }
  }
  profile.forbiddenTerms = [...forbiddenTerms];
  return true;
}

function loadJson(filename) {
  const p = path.join(PROFILES_DIR, filename);
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ─── 1. 자동차용품.json ──────────────────────────────────
{
  const { path: p, data } = loadJson('자동차용품.json');
  const targets = [
    '자동차용품>차량용디지털기기',
    '자동차용품>차량용디지털기기>경보기',
    '자동차용품>차량용디지털기기>차량용거치대',
    '자동차용품>차량용디지털기기>차량용음향기기',
    '자동차용품>램프>배터리',
    '자동차용품>비상>안전',
  ];
  let patched = 0;
  for (const key of targets) {
    if (data.profiles[key]) {
      patchProfile(data.profiles[key], AUTO_DIGITAL_VARS, AUTO_DIGITAL_FORBIDDEN);
      patched++;
    }
  }
  saveJson(p, data);
  console.log(`[자동차용품] ${patched}/${targets.length} 프로필 수정`);
}

// ─── 2. 식품.json ────────────────────────────────────────
{
  const { path: p, data } = loadJson('식품.json');
  const targets = [
    '식품>커피',
    '식품>커피>전통차',
    '식품>커피>커피믹스',
    '식품>커피>코코아',
    '식품>생수>음료',
    '식품>전통주',
    '식품>전통주>과실주',
  ];
  let patched = 0;
  for (const key of targets) {
    if (data.profiles[key]) {
      patchProfile(data.profiles[key], FOOD_COFFEE_BEVERAGE_VARS, FOOD_COFFEE_BEVERAGE_FORBIDDEN);
      patched++;
    }
  }
  saveJson(p, data);
  console.log(`[식품] ${patched}/${targets.length} 프로필 수정`);
}

// ─── 3. 생활용품.json ────────────────────────────────────
{
  const { path: p, data } = loadJson('생활용품.json');
  const targets = [
    '생활용품>공구',
    '생활용품>공구>사다리',
    '생활용품>공구>소형기계',
    '생활용품>공구>수공구',
    '생활용품>공구>에어공구',
    '생활용품>공구>용접용품',
    '생활용품>공구>전동공구',
    '생활용품>공구>측정도구',
  ];
  let patched = 0;
  for (const key of targets) {
    if (data.profiles[key]) {
      patchProfile(data.profiles[key], LIFE_TOOL_VARS, LIFE_TOOL_FORBIDDEN);
      patched++;
    }
  }
  saveJson(p, data);
  console.log(`[생활용품] ${patched}/${targets.length} 프로필 수정`);
}

// ─── 4. 문구.json ────────────────────────────────────────
{
  const { path: p, data } = loadJson('문구.json');
  // 필기구는 OFFICE_WRITING_VARS, 나머지는 OFFICE_VARS
  const writingKey = '문구/오피스>오피스>학용품>필기구';
  const nonWriting = [
    '문구/오피스>오피스>미술>화방용품',
    '문구/오피스>오피스>사무기기',
    '문구/오피스>오피스>사무용품',
    '문구/오피스>오피스>학용품>가위',
    '문구/오피스>오피스>학용품>과목별준비물',
    '문구/오피스>오피스>학용품>노트',
    '문구/오피스>오피스>학용품>봉투',
    '문구/오피스>오피스>학용품>스탬프',
    '문구/오피스>오피스>학용품>스테이플러',
    '문구/오피스>오피스>학용품>스티커',
    '문구/오피스>오피스>학용품>앨범',
    '문구/오피스>오피스>학용품>지우개',
    '문구/오피스>오피스>학용품>카드',
    '문구/오피스>오피스>학용품>컴퍼스',
    '문구/오피스>오피스>학용품>클립',
    '문구/오피스>오피스>학용품>테이프',
    '문구/오피스>오피스>학용품>포장',
  ];
  let patched = 0;
  if (data.profiles[writingKey]) {
    patchProfile(data.profiles[writingKey], OFFICE_WRITING_VARS, OFFICE_FORBIDDEN);
    patched++;
  }
  for (const key of nonWriting) {
    if (data.profiles[key]) {
      patchProfile(data.profiles[key], OFFICE_VARS, OFFICE_FORBIDDEN);
      patched++;
    }
  }
  saveJson(p, data);
  console.log(`[문구] ${patched}/${nonWriting.length + 1} 프로필 수정`);
}

// ─── 5. 주방용품.json ────────────────────────────────────
{
  const { path: p, data } = loadJson('주방용품.json');
  const targets = [
    '주방용품>보온>보냉용품',
  ];
  let patched = 0;
  for (const key of targets) {
    if (data.profiles[key]) {
      patchProfile(data.profiles[key], KITCHEN_THERMAL_VARS, KITCHEN_THERMAL_FORBIDDEN);
      patched++;
    }
  }
  saveJson(p, data);
  console.log(`[주방용품] ${patched}/${targets.length} 프로필 수정`);
}

console.log('\n✓ 완료');
