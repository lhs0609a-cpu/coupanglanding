#!/usr/bin/env node
/**
 * 16k 카테고리 audit (정적 분석) — 카테고리별로 적용될 forbidden filter 검증.
 *
 * 흐름:
 *   1) coupang-cat-index.json 로드 (16k 카테고리)
 *   2) 각 카테고리에 대해 L1+L2 forbidden terms 결정 (fragment-composer.ts와 동일 로직)
 *   3) persuasion-fragments.json + global-fragments-extended.json + story-templates.json 의
 *      모든 fragment 문자열에서 forbidden term 포함 여부 검사
 *   4) "필터로 잡힘" / "필터 누락" 카운트 → 추가로 보강할 forbidden term 발굴
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 데이터 로드 ──
const catIndex = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/coupang-cat-index.json'), 'utf-8'));
const fragmentData = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/persuasion-fragments.json'), 'utf-8'));
const storyData = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/story-templates.json'), 'utf-8'));
const v2Data = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/story-templates-v2.json'), 'utf-8'));
const extData = JSON.parse(readFileSync(join(root, 'src/lib/megaload/data/global-fragments-extended.json'), 'utf-8'));

console.log(`[audit] 카테고리: ${catIndex.length}개`);
console.log(`[audit] fragments: persuasion + v1 + v2 + extended`);

// ── L1/L2 forbidden terms (fragment-composer.ts에서 복사) ──
const L1_FORBIDDEN_TERMS = {
  '뷰티': ['세차','광택','발수','토크','절단력','복용','1정','논스틱','인덕션','프라이팬','필기감','타이어','브레이크','노트북','냉장고','세탁기','에어컨','강아지','고양이','사료','기저귀','분유','한우','삼겹살','김치찌개','건강기능식품','영양제','1캡슐'],
  '식품': ['세차','광택','발수','코팅','필기감','토크','절단력','드릴','논스틱','인덕션','프라이팬','세정력','탈취','살균','크림','에센스','세럼','토너','샴푸','린스','마스크팩','립스틱','파운데이션','마스카라','기저귀','타이어','브레이크','노트북','자동차','소파','냉장고','세탁기','강아지','고양이','사료'],
  '생활용품': ['면역력','섭취','복용','영양제','건강기능식품','세차','광택','발수','1정','캡슐','정제','필기감','크림','에센스','립스틱','마스카라','타이어','브레이크','노트북','김치','된장','한우','파운데이션','소파','침대','강아지사료','고양이사료','기저귀','오메가3','홍삼','유산균'],
  '가전/디지털': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','소파','침대','타이어','브레이크'],
  '패션의류잡화': ['면역력','섭취','복용','세차','광택','발수','토크','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','냉장고','세탁기','타이어','소파','침대','기저귀'],
  '가구/홈데코': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','토크','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','타이어','브레이크','기저귀'],
  '출산/유아동': ['세차','광택','발수','토크','절단력','드릴','1정','필기감','강아지','고양이','사료','립스틱','마스카라','오메가3','홍삼','한우','삼겹살','타이어','브레이크','노트북','소파','침대','크림','에센스','세럼','샴푸','김치'],
  '스포츠/레져': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','파운데이션','샴푸','기저귀','소파','냉장고','세탁기'],
  '주방용품': ['면역력','섭취','복용','영양제','건강기능식품','세차','필기감','토크','1정','캡슐','정제','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','파운데이션','샴푸','기저귀','타이어','브레이크','소파','침대'],
  '반려/애완용품': ['면역력','섭취','복용','세차','광택','발수','1정','필기감','토크','크림','에센스','립스틱','마스카라','파운데이션','오메가3','오메가-3','유산균','프로바이오틱스','글루코사민','콘드로이틴','홍삼','비타민','영양제','건강기능식품','피부탄력','혈관건강','혈행개선','중성지방','장건강','간건강','뼈건강','눈건강','인지능력','피부미백','주름개선','모발윤기','탈모예방','김치','된장','한우','파운데이션','기저귀','분유','타이어','브레이크','노트북','소파','침대','냉장고','세탁기','HACCP','GMP'],
  '완구/취미': ['면역력','섭취','복용','세차','광택','발수','1정','영양제','건강기능식품','필기감','논스틱','인덕션','크림','에센스','립스틱','강아지사료','고양이사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','소파','침대','냉장고','세탁기','브레이크'],
  '자동차용품': ['면역력','섭취','복용','영양제','건강기능식품','피부탄력','장건강','뼈건강','관절건강','혈관건강','혈행개선','1정','캡슐','정제','필기감','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','기저귀','분유','소파','침대','냉장고','세탁기'],
  '문구/오피스': ['면역력','섭취','복용','세차','광택','세정력','탈취','살균','1정','영양제','건강기능식품','토크','드릴','논스틱','인덕션','크림','에센스','립스틱','강아지','고양이','사료','오메가3','홍삼','김치','된장','한우','파운데이션','샴푸','기저귀','타이어','소파','침대'],
  '도서': ['세차','광택','발수','토크','절단력','드릴','1정','강아지사료','고양이사료','오메가3','홍삼','립스틱','크림','에센스','샴푸','기저귀','타이어','브레이크','냉장고','세탁기','파운데이션'],
};

const L2_FORBIDDEN_TERMS = {
  '식품>신선식품': [
    '마감','소재','기능','사양','모델','스펙','동급 모델','동급에서','동급에','광택',
    '사용감','사용 환경','사용 빈도','사용 패턴','사용해보면','사용 직후','사용 주기','사용감의',
    '오래 쓴다','한 번 쓰는','써봤','쓰는 동안','쓰지 않는','쓰는 만큼',
    '표준편차','리뷰 분포','리뷰 키워드 분석','단골 사용자','사용자 후기','리뷰 키워드',
    'HACCP','GMP','검증으로 안심',
    '비타민 엄선','엄선한 비타민','체감','체내 흡수율','함량','정제',
    '시간 투자','투자 가치','분야','적당한 시점','정착하시길','시행착오',
    '원재료','블라인드',
    '코팅','논스틱','인덕션','필기감','토크','드릴','절단력','발수',
    '냉장고','세탁기','에어컨','전자제품',
  ],
  '식품>신선식품>과일류': ['고소한','고소함'],
  '식품>신선식품>채소류': ['고소한','고소함'],
  '식품>가공식품': [
    '마감','소재','기능','사양','모델','스펙',
    '사용감','사용 환경','사용 빈도','사용 패턴',
    '오래 쓴다','한 번 쓰는','써봤','쓰는 동안',
    '필기감','토크','드릴','절단력',
  ],
  '식품>건강식품': [
    '마감','사양','모델','스펙','필기감','토크','드릴','절단력','코팅','논스틱','인덕션',
  ],
};

// ── 카테고리 path → forbidden terms (fragment-composer.ts와 동일 로직) ──
function getForbiddenTerms(categoryPath) {
  if (!categoryPath) return new Set();
  const parts = categoryPath.split('>').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return new Set();
  const merged = new Set();
  const l1Terms = L1_FORBIDDEN_TERMS[parts[0]];
  if (l1Terms) for (const t of l1Terms) merged.add(t);
  for (let depth = 2; depth <= Math.min(parts.length, 5); depth++) {
    const prefix = parts.slice(0, depth).join('>');
    const terms = L2_FORBIDDEN_TERMS[prefix];
    if (terms) for (const t of terms) merged.add(t);
  }
  return merged;
}

// ── fragment 문자열 추출 (모든 풀에서) ──
function extractAllFragmentStrings() {
  const strings = [];
  const collect = (obj, contextPath) => {
    if (Array.isArray(obj)) {
      for (const v of obj) {
        if (typeof v === 'string') strings.push({ path: contextPath, text: v });
        else if (typeof v === 'object' && v !== null) collect(v, contextPath);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [k, v] of Object.entries(obj)) {
        collect(v, `${contextPath}/${k}`);
      }
    } else if (typeof obj === 'string') {
      strings.push({ path: contextPath, text: obj });
    }
  };
  collect(fragmentData, 'persuasion');
  collect(storyData, 'story-v1');
  collect(v2Data, 'story-v2');
  collect(extData, 'extended');
  return strings;
}

const allFragments = extractAllFragmentStrings();
console.log(`[audit] 모든 fragment 문자열: ${allFragments.length}개`);

// ── 16k 카테고리 audit ──
const startedAt = Date.now();
const violations = []; // { catCode, catPath, fragment, forbiddenHit, source }
const stats = {
  perCategory: {}, // catPath → { totalChecked, leaked }
  perTerm: {},     // forbidden term → leak count
  perL1: {},       // L1 → leak count
};

let processed = 0;
for (const [code, fullPath, leafName, depth] of catIndex) {
  processed++;
  if (processed % 2000 === 0) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[audit] ${processed}/${catIndex.length} (${elapsed}s, leaks: ${violations.length})`);
  }
  const categoryPath = fullPath.replace(/ /g, '>');
  const forbidden = getForbiddenTerms(categoryPath);
  if (forbidden.size === 0) continue; // L1 미정의 카테고리는 스킵

  const l1 = fullPath.split(' ')[0];
  let leaked = 0;

  // 모든 fragment 문자열을 path-aware로 검사
  // (실제 엔진은 카테고리별 풀만 보지만, audit은 전수 검사로 잠재 리스크 발견)
  for (const { path, text } of allFragments) {
    // 카테고리별 풀이 아니면 (글로벌 풀) 모든 카테고리에 영향 가능 — 항상 검사
    // 카테고리별 풀이면 path에 카테고리명 포함 시만 검사
    const isCategoryScoped = path.includes(l1) || path.includes(categoryPath);
    const isGlobalPool = path.startsWith('extended') || path.includes('global');
    if (!isCategoryScoped && !isGlobalPool) continue;

    for (const term of forbidden) {
      if (text.includes(term)) {
        leaked++;
        violations.push({ code, catPath: fullPath, fragment: text.slice(0, 100), term, source: path });
        stats.perTerm[term] = (stats.perTerm[term] || 0) + 1;
        stats.perL1[l1] = (stats.perL1[l1] || 0) + 1;
        break; // 한 문자열에서 첫 번째 term만 카운트
      }
    }
  }
  stats.perCategory[fullPath] = { leaked };
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n[audit] 완료: ${processed}개 카테고리, ${violations.length}건 누출, ${elapsed}s`);

// ── 통계 출력 ──
console.log('\n━━━ 누출 어휘 TOP 30 ━━━');
const topTerms = Object.entries(stats.perTerm).sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [term, count] of topTerms) {
  console.log(`  ${count.toString().padStart(6)}  ${term}`);
}

console.log('\n━━━ L1 카테고리별 누출 빈도 ━━━');
const topL1 = Object.entries(stats.perL1).sort((a, b) => b[1] - a[1]);
for (const [l1, count] of topL1) {
  console.log(`  ${count.toString().padStart(6)}  ${l1}`);
}

// ── 리포트 저장 (상위 200건 샘플) ──
const reportPath = join(root, 'scripts/audit-result.json');
writeFileSync(reportPath, JSON.stringify({
  totalCategories: processed,
  totalViolations: violations.length,
  byTerm: topTerms,
  byL1: topL1,
  samples: violations.slice(0, 200),
  elapsed: `${elapsed}s`,
}, null, 2), 'utf-8');
console.log(`\n상세: ${reportPath}`);
