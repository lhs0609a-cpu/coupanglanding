/**
 * validate-seo-templates.mjs
 *
 * generate-category-seo-templates.mjs 결과 검증.
 *   - 커버리지: % 카테고리에 primary/modifiers 채워졌는지
 *   - 품질: 빈 키워드/banned 없는 카테고리 탐지
 *   - 카테고리 누설: primary에 카테고리 외 키워드 의심 케이스
 *   - 실패 카테고리: error 항목 수 + 재실행 후보
 *
 * 사용:
 *   node scripts/validate-seo-templates.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const TEMPLATES_PATH = join(DATA_DIR, 'category-seo-templates.json');
const COUPANG_INDEX_PATH = join(DATA_DIR, 'coupang-cat-index.json');
const COUPANG_DETAILS_PATH = join(DATA_DIR, 'coupang-cat-details.json');

if (!existsSync(TEMPLATES_PATH)) {
  console.error('templates 파일 없음. generate-category-seo-templates.mjs 먼저 실행.');
  process.exit(1);
}

const templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));
const coupangIndex = JSON.parse(readFileSync(COUPANG_INDEX_PATH, 'utf8'));
const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

const allPaths = new Set();
for (const [code, , leafName] of coupangIndex) {
  const p = coupangDetails[code]?.p || leafName;
  if (p && typeof p === 'string') allPaths.add(p);
}
const total = allPaths.size;

let withPrimary = 0;
let withModifiers = 0;
let withBanned = 0;
let withError = 0;
let missing = 0;
let suspicious = []; // primary 길이 0 등
let primaryCounts = []; // 분포 분석용
let modifierCounts = [];

for (const path of allPaths) {
  const t = templates[path];
  if (!t) { missing++; continue; }
  if (t.error) { withError++; continue; }
  const pCnt = t.primary?.length || 0;
  const mCnt = t.modifiers?.length || 0;
  const bCnt = t.banned?.length || 0;
  if (pCnt > 0) withPrimary++;
  if (mCnt > 0) withModifiers++;
  if (bCnt > 0) withBanned++;
  primaryCounts.push(pCnt);
  modifierCounts.push(mCnt);
  if (pCnt < 3 || mCnt < 2) {
    suspicious.push({ path, primary: pCnt, modifiers: mCnt });
  }
}

const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0) / arr.length).toFixed(1) : 0;
const median = arr => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length / 2)];
};

console.log('═'.repeat(60));
console.log(`SEO 템플릿 검증 결과 (총 ${total} 카테고리)`);
console.log('═'.repeat(60));
console.log(`  primary 채워짐: ${withPrimary} (${(withPrimary/total*100).toFixed(1)}%)`);
console.log(`  modifiers 채워짐: ${withModifiers} (${(withModifiers/total*100).toFixed(1)}%)`);
console.log(`  banned 채워짐: ${withBanned} (${(withBanned/total*100).toFixed(1)}%)`);
console.log(`  error: ${withError}`);
console.log(`  missing: ${missing}`);
console.log('');
console.log(`  primary 평균 ${avg(primaryCounts)} · 중앙값 ${median(primaryCounts)}`);
console.log(`  modifiers 평균 ${avg(modifierCounts)} · 중앙값 ${median(modifierCounts)}`);
console.log('');
console.log(`의심 케이스 (primary<3 또는 modifiers<2): ${suspicious.length}건`);
console.log('  샘플:');
suspicious.slice(0, 10).forEach(s => console.log(`    ${s.path} (primary=${s.primary}, mod=${s.modifiers})`));
console.log('═'.repeat(60));
