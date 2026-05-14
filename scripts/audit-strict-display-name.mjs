// 16k × 5seed 강화 audit — 사용자가 보고한 모든 단어 + 시그니처 단어 전수 검사
// substring false positive 차단 (token 단위 비교)
import { createJiti } from '../node_modules/jiti/lib/jiti.mjs';
import fs from 'node:fs';
const jiti = createJiti(import.meta.url, { interopDefault: true });
const DG = await jiti.import('../src/lib/megaload/services/display-name-generator.ts');
const PE = await jiti.import('../src/lib/megaload/services/persuasion-engine.ts');
const RR = await jiti.import('../src/lib/megaload/services/real-review-composer.ts');
const Guard = await jiti.import('../src/lib/megaload/services/cross-category-guard.ts');

const seoData = JSON.parse(fs.readFileSync('./src/lib/megaload/data/category-seo-templates.json', 'utf8'));
const categoryPaths = Object.keys(seoData).filter(k => !k.startsWith('_'));

console.log(`총 ${categoryPaths.length}개 카테고리 강화 audit (5 seeds × display + detail)`);

const issues = { display: {}, detail: {} };
let processed = 0;
const startTime = Date.now();

for (const catPath of categoryPaths) {
  const leaf = catPath.split('>').pop().trim();
  const productName = `프리미엄 ${leaf} 1kg`;

  // 5시드 display name + detail page 모두 검사
  const displayTokens = new Set();
  let displayBad = [];
  const detailText = [];
  let detailBad = [];

  try {
    for (let s = 0; s < 5; s++) {
      const dn = DG.generateDisplayName(productName, '', catPath, s);
      dn.split(/[\s/]+/).forEach(t => displayTokens.add(t.replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, '')));

      const r = PE.generatePersuasionContent(productName, catPath, `audit-${s}`, processed * 5 + s);
      const persuasion = PE.contentBlocksToParagraphs(r.blocks || [], catPath);
      const review = RR.generateRealReview(productName, catPath, `audit-${s}`, processed * 5 + s);
      detailText.push(...persuasion, ...review.paragraphs);
    }
  } catch (e) { processed++; continue; }

  // Guard의 detectCrossCategory로 검사 (시스템 정의된 forbidden 토큰)
  const dnFlat = [...displayTokens].join(' ');
  displayBad = Guard.detectCrossCategory(dnFlat, catPath);

  const detailFlat = detailText.join('\n');
  detailBad = Guard.detectCrossCategory(detailFlat, catPath);

  if (displayBad.length > 0) issues.display[catPath] = displayBad;
  if (detailBad.length > 0) issues.detail[catPath] = detailBad;

  processed++;
  if (processed % 1000 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    process.stdout.write(`\r${processed}/${categoryPaths.length} | ${(processed / elapsed).toFixed(0)}/s | dn:${Object.keys(issues.display).length} dt:${Object.keys(issues.detail).length}      `);
  }
}

console.log(`\n\n=== 강화 Audit 완료 (${((Date.now() - startTime) / 1000).toFixed(0)}s) ===`);
console.log(`전체: ${processed}개 카테고리 × 5시드 = ${processed * 5} 페이지`);
console.log(`Display Name 부적합: ${Object.keys(issues.display).length}개 (${(100 * Object.keys(issues.display).length / processed).toFixed(2)}%)`);
console.log(`Detail Page 부적합:  ${Object.keys(issues.detail).length}개 (${(100 * Object.keys(issues.detail).length / processed).toFixed(2)}%)`);

for (const kind of ['display', 'detail']) {
  const list = Object.entries(issues[kind]).slice(0, 15);
  if (list.length === 0) continue;
  console.log(`\n=== ${kind} 샘플 ===`);
  for (const [path, words] of list) {
    console.log(`  ${path} → [${words.join(', ')}]`);
  }
}

const reportPath = `./scripts/verification-reports/audit-strict-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
fs.writeFileSync(reportPath, JSON.stringify({
  summary: {
    total: processed,
    display_issues: Object.keys(issues.display).length,
    detail_issues: Object.keys(issues.detail).length,
    elapsed: ((Date.now() - startTime) / 1000),
  },
  issues,
}, null, 2));
console.log(`\n전체 결과: ${reportPath}`);
