/**
 * SEO + 정체성 심층 검증 (1,000 카테고리 샘플)
 * - 본문 길이 (쿠팡 SEO 권장 800~2500자)
 * - leaf 키워드 등장 횟수
 * - 브랜드 등장 횟수
 * - "이 제품/이 상품" 비율 (너무 높으면 정체성 약함)
 * - 단락 평균 길이 (너무 짧으면 설득력 부족)
 */
import { generateStoryV2 } from '../src/lib/megaload/services/story-generator';
import { readFileSync } from 'fs';

const raw = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8')) as Array<[string, string, string, number]>;

// 깊이 기준으로 분포 — leaf 깊이 4~5에 1000개 샘플
const leaves = raw.filter(r => r[3] >= 3).slice(0, 1000);

const REPORT = {
  total: 0,
  totalChars: 0,
  charsLessThan600: 0,
  charsMoreThan2500: 0,
  paragraphsLessThan5: 0,
  leafMissing: 0,
  brandMissing: 0,
  proxyOver50pct: 0,  // "이 제품/이 상품" 비율 50% 이상
  worstShort: [] as Array<{ leaf: string; chars: number; pCount: number }>,
  worstProxy: [] as Array<{ leaf: string; proxyCount: number; total: number }>,
};

for (let ci = 0; ci < leaves.length; ci++) {
  const [code, fullSpace, leaf, depth] = leaves[ci];
  if (leaf.length < 2) continue;

  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const path = tokens.length > 1 ? tokens[0] + '>' + tokens.slice(1).join('>') : fullSpace;
  const brand = '프리미엄';
  const productName = `${brand} ${leaf}`;

  let r;
  try {
    r = generateStoryV2(productName, path, 'seller_SEO_AUDIT', ci, undefined, code);
  } catch {
    continue;
  }

  const allText = [...r.paragraphs, ...r.reviewTexts].join(' ');
  const totalChars = allText.length;
  const pCount = r.paragraphs.length;
  REPORT.total++;
  REPORT.totalChars += totalChars;

  if (totalChars < 600) {
    REPORT.charsLessThan600++;
    if (REPORT.worstShort.length < 30) {
      REPORT.worstShort.push({ leaf, chars: totalChars, pCount });
    }
  }
  if (totalChars > 2500) REPORT.charsMoreThan2500++;
  if (pCount < 5) REPORT.paragraphsLessThan5++;

  // 정체성 — leaf 토큰이 본문에 등장하는지
  const leafFirst = leaf.split(/[\s/]+/).filter(Boolean)[0] || '';
  if (leafFirst.length >= 2 && !allText.includes(leafFirst) && !allText.includes(leaf)) {
    REPORT.leafMissing++;
  }
  if (!allText.includes(brand)) REPORT.brandMissing++;

  // 대명사 비율
  const proxyMatches = (allText.match(/이\s*(상품|제품|아이템)/g) ?? []).length;
  const productMatches = (allText.match(new RegExp(brand + '|' + leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  const totalRefs = proxyMatches + productMatches;
  if (totalRefs >= 3 && proxyMatches / totalRefs > 0.5) {
    REPORT.proxyOver50pct++;
    if (REPORT.worstProxy.length < 30) {
      REPORT.worstProxy.push({ leaf, proxyCount: proxyMatches, total: totalRefs });
    }
  }
}

const avgChars = (REPORT.totalChars / REPORT.total).toFixed(0);
console.log('━━━ SEO/정체성 검사 결과 ━━━');
console.log(`샘플: ${REPORT.total}개 카테고리`);
console.log(`평균 본문 글자수: ${avgChars}자`);
console.log(`600자 미만 (SEO 부족): ${REPORT.charsLessThan600}건 (${(REPORT.charsLessThan600/REPORT.total*100).toFixed(1)}%)`);
console.log(`2500자 초과 (SEO 과다): ${REPORT.charsMoreThan2500}건`);
console.log(`5단락 미만 (구조 부족): ${REPORT.paragraphsLessThan5}건`);
console.log(`leaf 키워드 본문 누락 (정체성 붕괴): ${REPORT.leafMissing}건 (${(REPORT.leafMissing/REPORT.total*100).toFixed(1)}%)`);
console.log(`브랜드 본문 누락: ${REPORT.brandMissing}건 (${(REPORT.brandMissing/REPORT.total*100).toFixed(1)}%)`);
console.log(`대명사 비율 50% 초과 (정체성 약함): ${REPORT.proxyOver50pct}건`);

if (REPORT.worstShort.length > 0) {
  console.log('\n━━━ 본문 짧은 카테고리 (SEO 부족) ━━━');
  for (const w of REPORT.worstShort.slice(0, 20)) {
    console.log(`  ${w.chars}자 / ${w.pCount}단락 — ${w.leaf}`);
  }
}

if (REPORT.worstProxy.length > 0) {
  console.log('\n━━━ 대명사 비율 높은 카테고리 (정체성 약함) ━━━');
  for (const w of REPORT.worstProxy.slice(0, 20)) {
    console.log(`  ${w.proxyCount}/${w.total} (${(w.proxyCount/w.total*100).toFixed(0)}%) — ${w.leaf}`);
  }
}
