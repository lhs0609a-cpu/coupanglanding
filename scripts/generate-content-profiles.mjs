#!/usr/bin/env node
// ============================================================
// CPG 콘텐츠 프로필 생성 스크립트
//
// cpg-mapping.json의 ~411개 그룹에 대해
// Claude API로 전용 변수풀(격리된 콘텐츠 프로필) 생성.
//
// 사용: ANTHROPIC_API_KEY=sk-... node scripts/generate-content-profiles.mjs
//
// 출력: src/lib/megaload/data/content-profiles/*.json
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── 설정 ────────────────────────────────────────────────────
const API_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 15;       // 한 번에 15개 그룹
const DELAY_MS = 2000;       // API 호출 간 대기
const MAX_RETRIES = 3;

// ─── 데이터 로드 ─────────────────────────────────────────────
const cpgMapping = JSON.parse(
  readFileSync(join(ROOT, 'src/lib/megaload/data/cpg-mapping.json'), 'utf8'),
);

const PROFILE_DIR = join(ROOT, 'src/lib/megaload/data/content-profiles');
if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });

// L1 → 파일명 매핑
const L1_FILE_MAP = {
  '식품': '식품',
  '뷰티': '뷰티',
  '가전/디지털': '가전',
  '생활용품': '생활용품',
  '패션의류잡화': '패션의류잡화',
  '가구/홈데코': '가구',
  '출산/유아동': '출산',
  '스포츠/레져': '스포츠',
  '반려/애완용품': '반려',
  '주방용품': '주방용품',
  '완구/취미': '완구',
  '자동차용품': '자동차용품',
  '문구/오피스': '문구',
};

// 변수 키 정의 (story-templates.json과 동일한 키)
const VARIABLE_KEYS = [
  '효과1', '효과2', '성분', '성분2', '사용법', '사용감',
  '추천대상', '카테고리', '기간', '인증',
];

// ─── Claude API 호출 ────────────────────────────────────────

async function callClaude(prompt, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`API error (${res.status}): ${err}`);
        if (res.status === 429 || res.status >= 500) {
          await sleep(DELAY_MS * (attempt + 1) * 2);
          continue;
        }
        throw new Error(`API ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.content[0].text;
    } catch (e) {
      if (attempt < retries - 1) {
        console.warn(`Retry ${attempt + 1}/${retries}: ${e.message}`);
        await sleep(DELAY_MS * (attempt + 1));
      } else {
        throw e;
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 프로필 생성 프롬프트 ────────────────────────────────────

function buildPrompt(groups) {
  const groupDescriptions = groups.map(g => {
    const leafSample = g.leafNames.slice(0, 15).join(', ');
    return `## ${g.groupId}
- 상위: ${g.parentGroup}
- 소분류 예시: ${leafSample}
- 총 ${g.entryCount}개 하위 카테고리`;
  }).join('\n\n');

  return `당신은 한국 이커머스 상품 콘텐츠 전문가입니다.
아래 쿠팡 카테고리 그룹별로 **전용 변수풀**을 생성해주세요.

각 그룹의 변수풀은 **해당 제품군에만 해당하는 내용**이어야 합니다.
다른 카테고리의 내용이 절대 섞이면 안 됩니다.

예시: "관절건강 영양제" 그룹의 효과1에는 "관절건강", "연골보호" 등만 들어가고,
"간건강", "눈건강", "체지방감소" 같은 다른 영양제 효과는 절대 포함하지 마세요.

## 생성할 변수 키 (각 8~12개 값):
- 효과1: 해당 제품의 핵심 효과/기능 (8~12개)
- 효과2: 부가 효과/장점 (6~10개)
- 성분: 핵심 성분/소재/원재료 (6~10개)
- 성분2: 부가 성분/기술 (4~8개)
- 사용법: 사용 방법/활용법 (4~8개)
- 사용감: 사용 후 느낌/감상 (6~10개)
- 추천대상: 추천 대상 (4~8개)
- 카테고리: 관련 카테고리 키워드 (4~8개)
- 기간: 사용 기간/주기 표현 (4~6개)
- 인증: 관련 인증/수상/보증 (3~6개)

또한 각 그룹의 **forbiddenTerms** (절대 나오면 안 되는 용어 5~15개)도 생성해주세요.
이는 같은 상위 카테고리의 다른 그룹에서 나올 법한 용어들입니다.

## 카테고리 그룹 목록:

${groupDescriptions}

## 출력 형식 (JSON만 출력, 다른 텍스트 없이):
\`\`\`json
{
  "그룹ID": {
    "displayName": "표시 이름",
    "parentGroup": "상위 그룹",
    "variables": {
      "효과1": ["값1", "값2", ...],
      "효과2": ["값1", "값2", ...],
      "성분": ["값1", "값2", ...],
      "성분2": ["값1", "값2", ...],
      "사용법": ["값1", "값2", ...],
      "사용감": ["값1", "값2", ...],
      "추천대상": ["값1", "값2", ...],
      "카테고리": ["값1", "값2", ...],
      "기간": ["값1", "값2", ...],
      "인증": ["값1", "값2", ...]
    },
    "forbiddenTerms": ["금지어1", "금지어2", ...]
  }
}
\`\`\``;
}

// ─── JSON 파싱 헬퍼 ──────────────────────────────────────────

function parseJsonResponse(text) {
  // JSON 블록 추출
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    return JSON.parse(jsonStr);
  } catch {
    // 줄바꿈이나 trailing comma 정리 후 재시도
    const cleaned = jsonStr
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\r\n]+/g, '\n');
    return JSON.parse(cleaned);
  }
}

// ─── 메인 ────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 필요합니다.');
    console.log('사용: ANTHROPIC_API_KEY=sk-... node scripts/generate-content-profiles.mjs');
    console.log('\nAPI 키 없이 기본 프로필을 생성하려면 --fallback 옵션을 사용하세요.');

    if (process.argv.includes('--fallback')) {
      console.log('\n=== 폴백 모드: 기존 변수풀 기반 기본 프로필 생성 ===');
      await generateFallbackProfiles();
      return;
    }
    process.exit(1);
  }

  // 그룹 목록 준비
  const allGroups = Object.entries(cpgMapping.groups).map(([groupId, group]) => ({
    groupId,
    ...group,
  }));

  console.log(`Total groups: ${allGroups.length}`);

  // L1별로 분류
  const l1Groups = {};
  for (const group of allGroups) {
    const l1 = group.groupId.split('>')[0];
    if (!l1Groups[l1]) l1Groups[l1] = [];
    l1Groups[l1].push(group);
  }

  // L1별 처리
  for (const [l1, groups] of Object.entries(l1Groups)) {
    const fileName = L1_FILE_MAP[l1];
    if (!fileName) {
      console.warn(`No file mapping for L1: ${l1}`);
      continue;
    }

    const outPath = join(PROFILE_DIR, `${fileName}.json`);

    // 이미 생성된 파일이 있으면 스킵
    if (existsSync(outPath) && !process.argv.includes('--force')) {
      console.log(`[SKIP] ${fileName}.json already exists (use --force to regenerate)`);
      continue;
    }

    console.log(`\n=== ${l1} (${groups.length} groups) ===`);

    const allProfiles = {};

    // 배치 처리
    for (let i = 0; i < groups.length; i += BATCH_SIZE) {
      const batch = groups.slice(i, i + BATCH_SIZE);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(groups.length / BATCH_SIZE)} (${batch.length} groups)...`);

      try {
        const prompt = buildPrompt(batch);
        const response = await callClaude(prompt);
        const profiles = parseJsonResponse(response);

        for (const [groupId, profile] of Object.entries(profiles)) {
          allProfiles[groupId] = profile;
        }

        console.log(`    ✓ ${Object.keys(profiles).length} profiles generated`);
      } catch (e) {
        console.error(`    ✗ Error: ${e.message}`);
        // 실패한 그룹은 폴백 프로필 생성
        for (const g of batch) {
          if (!allProfiles[g.groupId]) {
            allProfiles[g.groupId] = createFallbackProfile(g);
          }
        }
      }

      if (i + BATCH_SIZE < groups.length) {
        await sleep(DELAY_MS);
      }
    }

    // 저장
    const output = {
      _meta: {
        l1Category: l1,
        generatedAt: new Date().toISOString(),
        profileCount: Object.keys(allProfiles).length,
      },
      profiles: allProfiles,
    };

    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`  → ${fileName}.json saved (${Object.keys(allProfiles).length} profiles)`);
  }

  // 마스터 인덱스 생성
  generateIndex();

  console.log('\n=== Content Profiles Generation Complete ===');
}

// ─── 폴백 프로필 생성 (API 없이) ─────────────────────────────

function createFallbackProfile(group) {
  const parts = group.groupId.split('>');
  const lastPart = parts[parts.length - 1] || '';
  const leafSample = (group.leafNames || []).slice(0, 5);

  return {
    displayName: group.displayName,
    parentGroup: group.parentGroup,
    variables: {
      '효과1': ['품질', '성능', '효과', '편의성', '내구성', '안전성', '실용성', '가성비'],
      '효과2': ['만족감', '편리함', '깔끔함', '신뢰성', '다용도'],
      '성분': leafSample.length > 0 ? leafSample : [lastPart],
      '성분2': ['프리미엄소재', '고급원단', '특수코팅'],
      '사용법': ['간편사용', '설명서참조', '일상사용', '필요시사용'],
      '사용감': ['만족스러운', '편안한', '깔끔한', '든든한', '기대이상'],
      '추천대상': ['모든 분', '가족', '선물용'],
      '카테고리': [lastPart, ...leafSample.slice(0, 3)],
      '기간': ['매일', '주1~2회', '필요시', '꾸준히'],
      '인증': ['정품보증', 'KC인증', '품질보증'],
    },
    forbiddenTerms: [],
  };
}

async function generateFallbackProfiles() {
  // 기존 story-templates.json 변수풀 로드
  const storyData = JSON.parse(
    readFileSync(join(ROOT, 'src/lib/megaload/data/story-templates.json'), 'utf8'),
  );
  const existingVars = storyData.variables || {};

  const allGroups = Object.entries(cpgMapping.groups).map(([groupId, group]) => ({
    groupId,
    ...group,
  }));

  const l1Groups = {};
  for (const group of allGroups) {
    const l1 = group.groupId.split('>')[0];
    if (!l1Groups[l1]) l1Groups[l1] = [];
    l1Groups[l1].push(group);
  }

  for (const [l1, groups] of Object.entries(l1Groups)) {
    const fileName = L1_FILE_MAP[l1];
    if (!fileName) continue;

    const outPath = join(PROFILE_DIR, `${fileName}.json`);
    const profiles = {};

    for (const group of groups) {
      profiles[group.groupId] = createSmartFallbackProfile(group, existingVars, l1);
    }

    const output = {
      _meta: {
        l1Category: l1,
        generatedAt: new Date().toISOString(),
        profileCount: Object.keys(profiles).length,
        mode: 'fallback',
      },
      profiles,
    };

    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`  ${fileName}.json: ${Object.keys(profiles).length} profiles`);
  }

  generateIndex();
  console.log('\n✓ Fallback profiles generated');
}

function createSmartFallbackProfile(group, existingVars, l1) {
  const parts = group.groupId.split('>');
  const lastPart = parts[parts.length - 1] || '';
  const midPart = parts.length > 1 ? parts[1] : '';
  const leafSample = (group.leafNames || []).slice(0, 8);

  // 기존 변수풀에서 가장 근접한 키 찾기
  const subKey = parts.slice(0, 2).join('>');
  const matchedVars = existingVars[group.groupId] || existingVars[subKey] || existingVars[l1] || existingVars['DEFAULT'] || {};

  // 리프 이름 기반으로 성분/카테고리 보강
  const categoryKeywords = [lastPart, midPart, ...leafSample.slice(0, 4)].filter(Boolean);

  return {
    displayName: group.displayName,
    parentGroup: group.parentGroup,
    variables: {
      '효과1': matchedVars['효과1'] || ['품질', '성능', '효과', '편의성', '내구성', '안전성', '실용성', '가성비'],
      '효과2': matchedVars['효과2'] || ['만족감', '편리함', '깔끔함', '신뢰성', '다용도'],
      '성분': leafSample.length > 2 ? leafSample.slice(0, 8) : (matchedVars['성분'] || [lastPart]),
      '성분2': matchedVars['성분2'] || ['프리미엄', '고급', '특수'],
      '사용법': matchedVars['사용법'] || ['간편사용', '설명서참조'],
      '사용감': matchedVars['사용감'] || ['만족스러운', '편안한', '깔끔한', '든든한'],
      '추천대상': matchedVars['추천대상'] || ['모든 분', '가족'],
      '카테고리': [...new Set(categoryKeywords)],
      '기간': matchedVars['기간'] || ['매일', '필요시'],
      '인증': matchedVars['인증'] || ['정품보증', 'KC인증'],
    },
    forbiddenTerms: [],
  };
}

// ─── 마스터 인덱스 생성 ──────────────────────────────────────

function generateIndex() {
  const index = {
    generatedAt: new Date().toISOString(),
    files: {},
  };

  for (const [l1, fileName] of Object.entries(L1_FILE_MAP)) {
    const filePath = join(PROFILE_DIR, `${fileName}.json`);
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      index.files[fileName] = {
        l1Category: l1,
        profileCount: data._meta?.profileCount || Object.keys(data.profiles || {}).length,
      };
    }
  }

  writeFileSync(
    join(PROFILE_DIR, 'index.json'),
    JSON.stringify(index, null, 2),
    'utf8',
  );
  console.log(`  index.json saved`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
