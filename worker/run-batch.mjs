/**
 * 올인원 배치 CLI (순수 node + ollama)
 * ---------------------------------------------------------------------------
 * 실행: node run-batch.mjs <products.json> [모델=exaone3.5:7.8b] [sellerId]
 *   products.json: [{ "originalName":"...", "brand":"", "features":[], "id":"" }, ...]
 * 출력: <products>.generated.jsonl (레코드별 1줄) + 콘솔 진행/요약
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { isUp } from './lib/local-llm.mjs';
import { generateBatch } from './lib/ai-batch.mjs';
import { buildReviewHtml } from './lib/review-html.mjs';

const FILE = process.argv[2];
const MODEL = process.argv[3] || 'exaone3.5:7.8b';
const SELLER = process.argv[4] || 'seller-A';

if (!FILE) { console.error('사용법: node run-batch.mjs <products.json> [모델] [sellerId]'); process.exit(1); }

async function main() {
  if (!(await isUp())) { console.error('ollama 미응답 (http://127.0.0.1:11434)'); process.exit(1); }
  const products = JSON.parse(readFileSync(FILE, 'utf8'));
  const arr = Array.isArray(products) ? products : (products.products || []);
  const outFile = FILE.replace(/\.json$/i, '') + '.generated.jsonl';
  writeFileSync(outFile, '');
  console.log(`배치 생성: ${arr.length}개 (모델 ${MODEL}) → ${outFile}\n`);

  const allRecords = [];
  const { summary } = await generateBatch(arr, {
    model: MODEL, sellerId: SELLER, maxDetailTokens: 800,
    onItem: (i, total, rec) => {
      appendFileSync(outFile, JSON.stringify(rec) + '\n');
      allRecords.push(rec);
      const flag = rec.needsReview ? '⚠️검수' : '✅';
      console.log(`[${i + 1}/${total}] ${flag} ${rec.displayName}  | ${rec.categoryPath} [${rec.categoryCode || '-'}] | ${(rec.ms / 1000).toFixed(1)}s`);
    },
  });
  const htmlFile = FILE.replace(/\.json$/i, '') + '.review.html';
  writeFileSync(htmlFile, buildReviewHtml(allRecords, summary), 'utf8');
  console.log(`검수화면: ${htmlFile}`);
  console.log(`\n=== 요약 ===`);
  console.log(`총 ${summary.total} · 통과 ${summary.ok} · 검수필요 ${summary.needsReview}`);
  console.log(`상품당 평균 ${(summary.avgMs / 1000).toFixed(1)}s · 전체 ${(summary.wallMs / 1000 / 60).toFixed(1)}분 · 후보=${summary.candidateSource}`);
  console.log(`결과: ${outFile}`);
}

main().catch((e) => { console.error('배치 오류:', e.message); process.exit(1); });
