#!/usr/bin/env node
// 오염 수정 검증 — 모든 타겟 프로필의 변수에서 금지어가 사라졌는지 확인
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const files = [
  {
    name: '자동차용품',
    targets: [
      '자동차용품>차량용디지털기기',
      '자동차용품>차량용디지털기기>경보기',
      '자동차용품>차량용디지털기기>차량용거치대',
      '자동차용품>차량용디지털기기>차량용음향기기',
      '자동차용품>램프>배터리',
      '자동차용품>비상>안전',
    ],
    forbidden: ['세차','광택','발수','왁스','방수','세정력','방오력','윤활'],
  },
  {
    name: '식품',
    targets: [
      '식품>커피','식품>커피>전통차','식품>커피>커피믹스','식품>커피>코코아',
      '식품>생수>음료','식품>전통주','식품>전통주>과실주',
    ],
    forbidden: ['면역력','간건강','1정','복용','건강기능식품','영양제','관절건강','체지방감소'],
  },
  {
    name: '생활용품',
    targets: [
      '생활용품>공구','생활용품>공구>사다리','생활용품>공구>소형기계','생활용품>공구>수공구',
      '생활용품>공구>에어공구','생활용품>공구>용접용품','생활용품>공구>전동공구','생활용품>공구>측정도구',
    ],
    forbidden: ['세정력','탈취','살균','세제','섬유유연','방향'],
  },
  {
    name: '문구',
    targets: [
      '문구/오피스>오피스>학용품>카드','문구/오피스>오피스>학용품>스탬프',
      '문구/오피스>오피스>학용품>스테이플러','문구/오피스>오피스>학용품>봉투',
      '문구/오피스>오피스>학용품>테이프','문구/오피스>오피스>사무기기',
      '문구/오피스>오피스>미술>화방용품',
    ],
    forbidden: ['세차','세정력','토크','면역력','필기감','드릴','논스틱','인덕션'],
  },
  {
    name: '주방용품',
    targets: ['주방용품>보온>보냉용품'],
    forbidden: ['인덕션','논스틱','프라이팬','중약불','조리편의','열전도','요리편의'],
  },
];

let allClean = true;
let totalChecked = 0;

for (const f of files) {
  const p = path.join(ROOT, 'src/lib/megaload/data/content-profiles', `${f.name}.json`);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const key of f.targets) {
    totalChecked++;
    const profile = data.profiles[key];
    if (!profile) {
      console.log(`  ⚠️ MISSING: ${key}`);
      continue;
    }
    const allVars = Object.values(profile.variables || {}).flat();
    const contaminated = allVars.filter(v =>
      f.forbidden.some(t => String(v).includes(t))
    );
    if (contaminated.length > 0) {
      console.log(`  ❌ ${key}: ${contaminated.join(', ')}`);
      allClean = false;
    } else {
      console.log(`  ✓ ${key}`);
    }
  }
}

console.log('');
if (allClean) {
  console.log(`✅ ${totalChecked}/${totalChecked} 프로필 전부 깨끗합니다.`);
} else {
  console.log('❌ 오염 잔존');
  process.exit(1);
}
