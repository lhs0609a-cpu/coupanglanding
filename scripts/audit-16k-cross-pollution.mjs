// 1.6만 카테고리 전수 cross-pollution audit
// 모든 카테고리에 대해 detail page 생성 → 부적합 시그니처 검출 → 보고
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
import fs from 'node:fs';
const jiti = createJiti(import.meta.url, { interopDefault: true });

const PE = await jiti.import('../src/lib/megaload/services/persuasion-engine.ts');
const RR = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');

const seoData = JSON.parse(fs.readFileSync('./src/lib/megaload/data/category-seo-templates.json', 'utf8'));
const categoryPaths = Object.keys(seoData).filter(k => !k.startsWith('_'));

console.log(`총 ${categoryPaths.length}개 카테고리 audit 시작`);

// ─── 카테고리 → 기대 product form 매핑 ─────────────────────────
function getCategoryGroup(path) {
  // ⚠️ 출산/유아동 우선 분류 — '유모차' 가 '차' 로 매칭되는 false 분류 차단
  if (path.startsWith('출산/유아동') || path.startsWith('출산')) {
    if (path.includes('유아간식/음료') || path.includes('유아국/반찬') || path.includes('유아양념')
        || path.includes('유아 우유') || path.includes('유아생수/차') || path.includes('유아티백')) return 'processed_food';
    if (path.includes('유아건강식품')) return 'health_supplement';
    return 'baby';
  }
  if (path.startsWith('식품>건강식품') || path.includes('영양제') || path.includes('비타민/미네랄')
      || path.includes('홍삼') || path.includes('오메가3') || path.includes('루테인')
      || path.includes('프로바이오')) return 'health_supplement';
  if (path.startsWith('식품>신선식품') || path.includes('과일류') || path.includes('채소')
      || path.includes('축산') || path.includes('수산') || path.includes('정육')
      || path.includes('농산물')) return 'fresh_food';
  if (path.startsWith('식품>가공') || path.includes('즉석') || path.includes('스낵')
      || path.includes('김치') || path.includes('반찬') || path.includes('젓갈')
      || path.includes('면류') || path.includes('소스') || path.includes('조미료')
      || path.includes('베이커리') || path.includes('유제품') || path.includes('아이스크림')
      || path.includes('생수') || path.includes('음료') || path.includes('차') || path.includes('커피')
      || path.includes('전통주')) return 'processed_food';
  if (path.startsWith('식품')) return 'processed_food'; // 기타 식품
  if (path.startsWith('뷰티')) return 'beauty';
  if (path.startsWith('가전/디지털') || path.startsWith('가전')) return 'electronics';
  if (path.startsWith('자동차용품')) return 'automotive';
  if (path.startsWith('반려/애완용품') || path.startsWith('반려')) return 'pet';
  if (path.startsWith('출산/유아동') || path.startsWith('출산')) return 'baby';
  if (path.startsWith('패션의류잡화') || path.startsWith('패션')) return 'fashion';
  if (path.startsWith('생활용품')) return 'household';
  if (path.startsWith('가구/홈데코')) return 'furniture';
  if (path.startsWith('스포츠/레져') || path.startsWith('스포츠')) return 'sports';
  if (path.startsWith('주방용품')) return 'kitchen';
  if (path.startsWith('문구/오피스') || path.startsWith('문구')) return 'office';
  if (path.startsWith('완구/취미')) return 'toy';
  if (path.startsWith('도서')) return 'book';
  return 'other';
}

// ─── 각 그룹에 누출되면 안 될 시그니처 ─────────────────────────
const POLLUTION_SIGS = {
  // 신선/가공식품에 영양제 어휘 누출
  fresh_food: [
    /[한두세네]\s*포\s*뜯/, /\d+포\s*뜯/, /[한두세네]\s*포\s*용량/,
    /부원료/, /함량\s*비교/, /하루\s*권장량/,
    /수치가\s*정상/, /건강검진/, /효도\s*제대로/,
    /영양제/, /건강기능식품/, /\d+정\b/, /캡슐/, /알약/, /정제/,
    /바르[고면는기]/, /발라/, /도포/, /피부에\s*좋/,
  ],
  processed_food: [
    /[한두세네]\s*포\s*뜯/, /\d+포\s*뜯/,
    /부원료/, /함량\s*비교/, /하루\s*권장량/,
    /수치가\s*정상/, /건강검진/, /효도\s*제대로/,
    /영양제/, /건강기능식품/, /\d+정\b/, /캡슐/, /알약/,
    /바르[고면는기]/, /발라/, /도포/, /피부에\s*좋/,
  ],
  health_supplement: [
    /바르[고면는기]/, /발라/, /도포/, /피부에\s*좋/,
    /타이어/, /엔진오일/, /세차/,
    /기저귀/, /이유식\s*단계/,
  ],
  beauty: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/, /세차/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  electronics: [
    /삼키/, /바르[고면는기]/, /발라/, /도포/,
    /\d+정\b/, /캡슐/, /부원료/,
    /타이어/, /기저귀/,
  ],
  automotive: [
    /삼키/, /바르[고면는기]/, /발라/, /도포/,
    /\d+정\b/, /캡슐/, /부원료/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  pet: [
    /\d+정\b/, /캡슐\s*(?!형)/, /부원료/, /삼키[기는다]/,
    /바르[고면는기]/, /발라/, /도포/,
    /타이어/, /엔진오일/,
  ],
  baby: [
    /타이어/, /엔진오일/, /세차/,
    /펌웨어/, /해상도/,
  ],
  fashion: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  household: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키[기는다]/,
    /타이어/, /엔진오일/, /세차/, // 청소세제는 제외
  ],
  furniture: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/,
    /\d+포\s*뜯/,
  ],
  sports: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/, /세차/,
    /\d+포\s*뜯/,
  ],
  kitchen: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/, /세차/,
    /\d+포\s*뜯/,
  ],
  office: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/, /세차/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  toy: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/, // 장난감 부품 삼킴 경고는 별개
    /타이어/, /엔진오일/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  book: [
    /\d+정\b/, /캡슐/, /부원료/, /삼키/,
    /타이어/, /엔진오일/, /세차/,
    /기저귀/, /\d+포\s*뜯/,
  ],
  other: [
    /\d+정\b/, /캡슐/, /부원료/,
  ],
};

// ─── 카테고리별 시그니처 예외 — false positive 차단 ────────────
// (특정 도메인에서 부적합 단어가 정상인 경우)
function isExceptionMatch(catPath, sigSource) {
  const s = sigSource;
  // 자전거: 타이어/페달/안장 등은 정상
  if (catPath.includes('자전거') && /타이어|엔진오일/.test(s)) return true;
  // 자동차/오토바이 카테고리도 마찬가지
  if (catPath.includes('자동차') && /타이어|엔진오일|세차/.test(s)) return true;
  if (catPath.includes('오토바이') && /타이어|엔진오일/.test(s)) return true;
  // 휠 있는 스포츠 (킥보드/스케이트/전동휠/스케이트보드): 타이어 정상
  if (/킥보드|스케이트|전동휠|롤러|보드/.test(catPath) && /타이어/.test(s)) return true;
  // 승용완구 (붕붕카/스카이콩콩 등 휠 있는 어린이 탈것): 타이어 정상
  if (/승용완구|붕붕|콩콩/.test(catPath) && /타이어/.test(s)) return true;
  // RC 차/탱크/드론/로봇 — RC 모형 차량에 타이어 정상
  if (/RC|로봇|작동완구|장난감총|미니카/.test(catPath) && /타이어/.test(s)) return true;
  // 스포츠/야외완구 (구기/물총 등) — 타이어는 false positive
  if (catPath.includes('스포츠/야외완구') && /타이어/.test(s)) return true;
  // 완구/장난감: 부품 삼킴 안전 경고는 정상 텍스트
  if ((catPath.startsWith('완구') || catPath.includes('장난감')) && /삼키/.test(s)) return true;
  // 캡슐 커피머신/세제 등: 캡슐 단독은 부품명, 차단 X
  if (catPath.includes('캡슐') && /캡슐/.test(s)) return true;
  // 화장품 패치/마스카라/네일/리무버: 바르기/도포 정상
  if ((catPath.includes('패치') || catPath.includes('마스카라') || catPath.includes('네일')
       || catPath.includes('리무버') || catPath.includes('영양제')) && /바르|발라|도포/.test(s)) return true;
  // 자외선차단/선케어: 바르기 정상
  if ((catPath.includes('자외선') || catPath.includes('선케어') || catPath.includes('선크림')) && /바르|발라|도포/.test(s)) return true;
  return false;
}

// ─── 카테고리에서 product name 자동 생성 ───────────────────────
function generateProductName(catPath) {
  const leaf = catPath.split('>').pop().trim();
  // leaf 토큰 정리
  const cleanLeaf = leaf.replace(/[\/(),]/g, ' ').split(/\s+/).filter(t => t.length >= 2)[0] || leaf;
  return `프리미엄 ${cleanLeaf}`;
}

// ─── 메인 audit 루프 ─────────────────────────────────────────
const results = {};
const groupCounts = {};
const groupIssues = {};
const allIssues = [];

let processed = 0;
const startTime = Date.now();

for (const catPath of categoryPaths) {
  const group = getCategoryGroup(catPath);
  groupCounts[group] = (groupCounts[group] || 0) + 1;

  const sigs = POLLUTION_SIGS[group] || [];
  if (sigs.length === 0) {
    processed++;
    continue;
  }

  const productName = generateProductName(catPath);
  const seed = `audit-${processed}`;

  let allText = '';
  try {
    // 다중 시드 (3개) — 카테고리당 3페이지 생성하여 시드 다양성 커버
    const texts = [];
    for (let s = 0; s < 3; s++) {
      const r = PE.generatePersuasionContent(productName, catPath, `${seed}-${s}`, processed * 10 + s);
      const persuasionParas = PE.contentBlocksToParagraphs(r.blocks || [], catPath);
      const review = RR.generateRealReview(productName, catPath, `${seed}-${s}`, processed * 10 + s);
      texts.push(...persuasionParas, ...review.paragraphs);
    }
    allText = texts.join('\n');
  } catch (e) {
    // 생성 실패 — 기록 후 패스
    allIssues.push({ catPath, group, error: e.message });
    processed++;
    continue;
  }

  const issues = [];
  for (const re of sigs) {
    if (isExceptionMatch(catPath, re.source)) continue; // 도메인 예외
    const matches = allText.match(new RegExp(re.source, 'g'));
    if (matches && matches.length > 0) {
      issues.push({ pattern: re.source, count: matches.length, example: matches[0] });
    }
  }

  if (issues.length > 0) {
    allIssues.push({ catPath, group, issues });
    groupIssues[group] = (groupIssues[group] || 0) + 1;
  }

  processed++;
  if (processed % 1000 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (categoryPaths.length - processed) / rate;
    process.stdout.write(`\r${processed}/${categoryPaths.length} (${(100 * processed / categoryPaths.length).toFixed(1)}%) | ${rate.toFixed(0)}/s | ETA ${eta.toFixed(0)}s | issues: ${allIssues.length}      `);
  }
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`\n\n=== Audit 완료 (${elapsed.toFixed(1)}s) ===`);
console.log(`전체: ${processed}개 카테고리`);
console.log(`부적합 발견: ${allIssues.length}개 (${(100 * allIssues.length / processed).toFixed(2)}%)`);
console.log(`Clean: ${processed - allIssues.length}개 (${(100 * (processed - allIssues.length) / processed).toFixed(2)}%)`);

console.log('\n=== 그룹별 통계 ===');
for (const [group, count] of Object.entries(groupCounts).sort((a, b) => b[1] - a[1])) {
  const issues = groupIssues[group] || 0;
  const cleanPct = (100 * (count - issues) / count).toFixed(1);
  console.log(`  ${group.padEnd(20)} ${count.toString().padStart(5)} cats | ${issues.toString().padStart(4)} issues | ${cleanPct}% clean`);
}

if (allIssues.length > 0) {
  console.log('\n=== 부적합 카테고리 샘플 (최대 30) ===');
  for (const item of allIssues.slice(0, 30)) {
    if (item.error) {
      console.log(`  [ERROR] ${item.catPath}: ${item.error}`);
    } else {
      const examples = item.issues.map(i => `${i.example}(${i.count})`).join(', ');
      console.log(`  [${item.group}] ${item.catPath} → ${examples}`);
    }
  }

  // 결과 파일 저장
  const reportPath = './scripts/verification-reports/audit-16k-cross-pollution-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      total: processed,
      issues: allIssues.length,
      cleanPct: (100 * (processed - allIssues.length) / processed).toFixed(2),
      elapsed,
    },
    groupStats: Object.fromEntries(
      Object.entries(groupCounts).map(([g, c]) => [g, { total: c, issues: groupIssues[g] || 0 }]),
    ),
    issues: allIssues,
  }, null, 2));
  console.log(`\n전체 결과: ${reportPath}`);
}
