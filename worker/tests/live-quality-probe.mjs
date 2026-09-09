import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateAllFields } from '../lib/ai-generator.mjs';
import { buildSourceFacts } from '../lib/source-facts.mjs';

const root = process.argv[2];
if (!root) throw new Error('소싱 폴더 경로가 필요합니다');
const entry = (await readdir(root, { withFileTypes: true })).find((e) => e.isDirectory() && e.name.startsWith('product_'));
if (!entry) throw new Error('상품 폴더 없음');
const source = JSON.parse(await readFile(join(root, entry.name, 'product.json'), 'utf8'));
const product = {
  originalName: source.name || source.title,
  categoryPath: source.sourceCategory?.categoryPath || '', brand: source.brand || '',
  features: (source.options || []).map((o) => o.optionName).filter(Boolean).slice(0, 6),
  sourceFacts: buildSourceFacts(source),
};
const leaf = product.categoryPath.split('>').pop();
console.log('probe', { product: product.originalName, facts: product.sourceFacts.length, leaf });
const result = await generateAllFields(product, {
  model: 'exaone3.5:7.8b', categoryDecisive: true,
  categoryCandidates: [{ code: 'probe-only', path: product.categoryPath, leaf }],
});
await writeFile(new URL('./live-quality-result.json', import.meta.url), JSON.stringify({ product, result }, null, 2));
console.log(JSON.stringify({ displayName: result.displayName, issues: result.qualityIssues, compliance: result.compliance,
  detailAttempts: result.detailAttempts, timings: result.timings, detail: result.detail }, null, 2));
