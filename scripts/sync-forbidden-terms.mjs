// scripts/sync-forbidden-terms.mjs
// audit-detail-pages.mjs의 FORBIDDEN_BY_TOP를 source of truth로,
// 모든 content-profiles/*.json의 profile.forbiddenTerms에 일괄 적용.
//
// 각 profile의 기존 forbiddenTerms 배열에 L1 단위 forbidden을 union → 중복 제거.
// 빈 배열만 채우는 게 아니라 비-빈 배열도 누락된 토큰을 보강.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'content-profiles');

// audit-detail-pages.mjs:65-84 와 동기 — 같은 source 유지
const FORBIDDEN_BY_TOP = {
  '뷰티': ['강아지','고양이','사료','오메가3','쌀밥','한우','삼겹살','타이어','브레이크','노트북','자동차','김치찌개','다이어리','티셔츠','냉장고','세탁기','블록','퍼즐','카시트'],
  '식품': ['크림','에센스','세럼','토너','샴푸','립스틱','마스카라','파운데이션','강아지사료','고양이사료','기저귀','타이어','노트북','자동차','볼펜','다이어리','TV','냉장고','세탁기','블록','퍼즐'],
  '생활용품': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','블록','퍼즐','노트북','타이어','브레이크','마스카라'],
  '가전/디지털': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','마스카라'],
  '패션의류잡화': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','냉장고','세탁기','타이어','마스카라'],
  '가구/홈데코': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','타이어','브레이크','마스카라'],
  '출산/유아동': ['강아지사료','고양이사료','립스틱','마스카라','오메가3','홍삼','한우','삼겹살','타이어','브레이크','노트북','자동차','파운데이션'],
  '스포츠/레져': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','파운데이션','샴푸','두피','모발','마스카라'],
  '주방용품': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','마스카라'],
  '반려/애완용품': ['크림','에센스','립스틱','오메가3','홍삼','김치','된장','한우','파운데이션','두피','모발','기저귀','타이어','노트북','마스카라'],
  '완구/취미': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','마스카라'],
  '자동차용품': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','두피','모발','기저귀','마스카라'],
  '문구/사무': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','마스카라'],
  '문구/오피스': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','마스카라'],
  '도서': ['크림','에센스','립스틱','강아지사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','브레이크','마스카라'],
  '문구': ['크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','마스카라'],
};

// 파일명 → L1 매핑 (파일명은 L1 일부)
const FILE_TO_L1 = {
  '식품.json': '식품',
  '뷰티.json': '뷰티',
  '생활용품.json': '생활용품',
  '가전.json': '가전/디지털',
  '패션의류잡화.json': '패션의류잡화',
  '가구.json': '가구/홈데코',
  '출산.json': '출산/유아동',
  '스포츠.json': '스포츠/레져',
  '주방용품.json': '주방용품',
  '반려.json': '반려/애완용품',
  '완구.json': '완구/취미',
  '자동차용품.json': '자동차용품',
  '문구.json': '문구/오피스',
};

const files = readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');

let totalProfiles = 0;
let updatedProfiles = 0;
let totalAddedTerms = 0;

for (const file of files) {
  const l1 = FILE_TO_L1[file];
  if (!l1) {
    console.warn(`[skip] ${file}: L1 매핑 없음`);
    continue;
  }
  const forbidden = FORBIDDEN_BY_TOP[l1];
  if (!forbidden) {
    console.warn(`[skip] ${file}: ${l1} forbidden list 없음`);
    continue;
  }

  const filePath = join(PROFILES_DIR, file);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  let changed = false;
  let addedInFile = 0;

  for (const [key, profile] of Object.entries(data.profiles || {})) {
    totalProfiles++;
    const existing = profile.forbiddenTerms || [];
    const set = new Set(existing);
    const before = set.size;
    for (const term of forbidden) set.add(term);
    if (set.size !== before) {
      profile.forbiddenTerms = [...set];
      addedInFile += set.size - before;
      changed = true;
      updatedProfiles++;
    }
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    totalAddedTerms += addedInFile;
    console.log(`[update] ${file} (${l1}): ${addedInFile} 토큰 추가`);
  }
}

console.log(`\n총 ${totalProfiles} profiles 중 ${updatedProfiles}개 업데이트, ${totalAddedTerms} 토큰 추가`);
