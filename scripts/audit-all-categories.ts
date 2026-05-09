/**
 * 16,259개 쿠팡 카테고리 전수 검증.
 * 각 카테고리의 leaf 명사를 기반으로 합성 상품명을 만들고
 * generateStoryV2 로 본문을 생성한 뒤 비문/오염/정체성붕괴/SEO 문제를 검출.
 */
import { generateStoryV2 } from '../src/lib/megaload/services/story-generator';
import { readFileSync, writeFileSync } from 'fs';

interface CatRow {
  code: string;
  path: string;       // ">" 구분
  leaf: string;
  depth: number;
}

// ── 카테고리 인덱스 로드 ──────────────────────────
const raw = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8')) as Array<[string, string, string, number]>;
const CATEGORIES: CatRow[] = raw.map(([code, fullSpace, leaf, depth]) => {
  // 슬래시 leaf("흙침대/흙보료") 는 fullSpace 에서 공백으로 split 되어 "흙침대 흙보료" 로 들어있음.
  // → 정확한 path 재구성: leaf parts 를 제외한 부모 tokens + leaf (슬래시 포함) 로 join.
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0
    ? parentTokens.join('>') + '>' + leaf
    : leaf;
  return { code, path, leaf, depth };
});

console.log(`총 카테고리 수: ${CATEGORIES.length}`);

// ── 합성 상품명 생성 ──────────────────────────────
//   leaf + 적절한 전치 형용사/숫자 조합으로 자연스러운 상품명 합성.
const BRAND_POOL = ['프리미엄', '데일리', '오리진', '이노바', '카비전', '셀라비뷰', '맘스케어', '에어플로'];
const ADJ_POOL_GENERIC = ['대용량', '신상', '베이직', '컴팩트', '디럭스', '프로', '슬림', '스탠다드'];

function buildProductName(leaf: string, idx: number): string {
  const brand = BRAND_POOL[idx % BRAND_POOL.length];
  const adj = ADJ_POOL_GENERIC[(idx >> 3) % ADJ_POOL_GENERIC.length];
  // leaf 가 한 단어면 brand + adj + leaf, 두 단어 이상이면 brand + leaf
  const leafTokens = leaf.split(/[\s/]+/).filter(Boolean);
  if (leafTokens.length === 1) return `${brand} ${adj} ${leaf}`;
  return `${brand} ${leaf}`;
}

// ── 검증 패턴 (audit-50-products.ts 기준) ──────────
interface ViolationCheck {
  name: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  re: RegExp;
}

const VIOLATIONS: ViolationCheck[] = [
  // 한국어 비문
  { name: '선물으로/이걸으로 (ㄹ받침)', severity: 'CRITICAL', re: /선물으로|이걸으로/ },
  { name: '없은/있은 (관형형 오류)', severity: 'CRITICAL', re: /[가-힣\s](없|있)은(?=[\s가-힣])/ },
  { name: '드심+어미 (합성 깨짐)', severity: 'CRITICAL', re: /드심하/ },
  { name: '단계에했/때간이/때시간', severity: 'CRITICAL', re: /단계에했|때간이|때시간(?!이)/ },
  { name: '한이라/운이라/은이라', severity: 'CRITICAL', re: /[가-힣](한|운|은|인)이라\s/ },
  { name: '가까가 (오타)', severity: 'MAJOR', re: /가까가\s/ },
  { name: '추상명사+한테/에게', severity: 'MAJOR', re: /(고민|식단|루틴|일상)(한테|에게)/ },
  { name: '는은/는는/은은 (충돌)', severity: 'CRITICAL', re: /[가-힣]는은\s|[가-힣]는는\s|[가-힣]은은\s/ },

  // 변수 빈치환
  { name: '미치환 placeholder', severity: 'CRITICAL', re: /\{[가-힣A-Za-z_][^}]*\}/ },
  { name: '문장 중간 ". "', severity: 'CRITICAL', re: /\s\.\s+[가-힣]/ },
  { name: '문장 끝 " ."', severity: 'CRITICAL', re: /[가-힣]\s+\.\s*$/m },
  { name: '"수 ." 어미 잘림', severity: 'CRITICAL', re: /[가-힣]\s+수\s*\.\s/ },
  { name: '빈 괄호/꺾쇠', severity: 'CRITICAL', re: /\(\s*\)|\[\s*\]|<\s*>/ },

  // fallback 노출
  { name: '바로 상품/제품입니다', severity: 'CRITICAL', re: /바로\s+(상품|제품)입니다/ },
  { name: ', 상품/제품 + 조사', severity: 'CRITICAL', re: /[,，]\s*(상품|제품)\s*(은|는|을|를|이|가|에|의|으로|로)\s/ },
  { name: '"이건 상품 써봐"', severity: 'CRITICAL', re: /'\s*이건\s+상품\s+써봐/ },
  { name: '이제 (이) 제품으로 바꿔', severity: 'CRITICAL', re: /이제\s+(이\s+)?(상품|제품)\s*(으로|로)\s+바꿔/ },
  { name: '오래 망설인 끝에 상품을', severity: 'CRITICAL', re: /(끝에|망설인 끝에)\s+(상품|제품)\s*(을|를|이|가)\s/ },
  { name: '유명해진 상품의 진짜', severity: 'CRITICAL', re: /(유명해진|언급하는|들어본)\s+(상품|제품)\s*(의|에서|를|을)\s/ },

  // 빈도 모순
  { name: '주말에+매일 빠지지', severity: 'MAJOR', re: /주말에.*매일\s*빠지지/ },

  // 영문/숫자 + 받침 조사
  { name: '영문/숫자+을', severity: 'MAJOR', re: /[A-Za-z0-9]을\s/ },

  // 특수
  { name: '진짜 빈 인용 ""', severity: 'MAJOR', re: /'[\s,]*'(?![가-힣A-Za-z])|"[\s,]*"(?![가-힣A-Za-z])/ },
  { name: '4점 이상 연속 마침표', severity: 'MINOR', re: /\.{4,}/ },
  { name: '문장 시작 "을/를"', severity: 'MAJOR', re: /(?:^|\.\s+|\?\s+|!\s+)(을|를)\s/ },
  { name: '동일 단어 인접 중복(2자+)', severity: 'MAJOR', re: /(\S{2,}) \1(?=[\s.,!?])/ },

  // SEO/정체성
  { name: 'leaf 명사 본문 누락 (SEO)', severity: 'MINOR', re: /__SEO_LEAF_MISSING__/ }, // 별도 로직 처리
];

interface Hit {
  code: string;
  path: string;
  leaf: string;
  productName: string;
  paragraphIndex: number;
  violation: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  excerpt: string;
}

const allHits: Hit[] = [];
const violationCount = new Map<string, number>();
const severityCount = new Map<string, number>();
let totalChecked = 0;
let totalErrors = 0;

const start = Date.now();
const TOTAL = CATEGORIES.length;

for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const c = CATEGORIES[ci];
  // 너무 짧은 leaf (1자) 는 의미가 없어 스킵
  if (c.leaf.length < 2) continue;
  const productName = buildProductName(c.leaf, ci);

  let result;
  try {
    result = generateStoryV2(productName, c.path, 'seller_AUDIT_ALL', ci, undefined, c.code);
  } catch (e) {
    totalErrors++;
    allHits.push({
      code: c.code, path: c.path, leaf: c.leaf, productName,
      paragraphIndex: 0,
      violation: '예외 발생',
      severity: 'CRITICAL',
      excerpt: e instanceof Error ? e.message : String(e),
    });
    continue;
  }
  totalChecked++;

  const allText = [...result.paragraphs, ...result.reviewTexts];

  // SEO 정체성 검사: leaf 의 첫 단어가 본문에 한 번도 등장하지 않으면 정체성 붕괴
  // ⚠️ leafFirst 추출은 슬래시·괄호·콤마 모두 분리해야 정확 (의료용침대(환자용침대) → "의료용침대")
  const leafFirstToken = c.leaf.split(/[\s/(),\[\]]+/).filter(Boolean)[0] || '';
  if (leafFirstToken.length >= 2) {
    const fullText = allText.join(' ');
    if (!fullText.includes(leafFirstToken) && !fullText.includes(c.leaf)) {
      const v = 'leaf 명사 본문 누락 (SEO)';
      allHits.push({
        code: c.code, path: c.path, leaf: c.leaf, productName,
        paragraphIndex: 0,
        violation: v,
        severity: 'MINOR',
        excerpt: `(leaf "${c.leaf}" / token "${leafFirstToken}" 본문 미포함)`,
      });
      violationCount.set(v, (violationCount.get(v) ?? 0) + 1);
      severityCount.set('MINOR', (severityCount.get('MINOR') ?? 0) + 1);
    }
  }

  for (let i = 0; i < allText.length; i++) {
    const para = allText[i];
    for (const v of VIOLATIONS) {
      if (v.name.includes('SEO')) continue; // 위에서 처리
      const m = para.match(v.re);
      if (!m) continue;
      const idx = m.index ?? 0;
      const excerpt = para.slice(Math.max(0, idx - 25), idx + (m[0]?.length ?? 0) + 35);
      allHits.push({
        code: c.code, path: c.path, leaf: c.leaf, productName,
        paragraphIndex: i + 1,
        violation: v.name,
        severity: v.severity,
        excerpt,
      });
      violationCount.set(v.name, (violationCount.get(v.name) ?? 0) + 1);
      severityCount.set(v.severity, (severityCount.get(v.severity) ?? 0) + 1);
    }
  }

  if ((ci + 1) % 1000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`  진행: ${ci + 1}/${TOTAL} (${elapsed}s, hits=${allHits.length})`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${'='.repeat(60)}`);
console.log(`검증 완료: ${totalChecked}/${TOTAL} 카테고리 (${elapsed}s)`);
console.log(`예외 발생: ${totalErrors}건`);
console.log(`총 검출: ${allHits.length}건`);
console.log(`${'='.repeat(60)}`);

if (severityCount.size > 0) {
  console.log('\n━━━ 심각도별 ━━━');
  for (const sev of ['CRITICAL', 'MAJOR', 'MINOR']) {
    const cnt = severityCount.get(sev) ?? 0;
    if (cnt) console.log(`  ${sev.padEnd(8)}: ${cnt.toLocaleString()}건`);
  }
}

if (violationCount.size > 0) {
  console.log('\n━━━ 패턴별 (Top) ━━━');
  const sorted = [...violationCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [v, c] of sorted) {
    console.log(`  ${c.toLocaleString().padStart(7)} 건 — ${v}`);
  }
}

// 카테고리 대분류별 집계
const byTopCategory = new Map<string, number>();
for (const h of allHits) {
  const top = h.path.split('>')[0] || '?';
  byTopCategory.set(top, (byTopCategory.get(top) ?? 0) + 1);
}
if (byTopCategory.size > 0) {
  console.log('\n━━━ 대분류별 ━━━');
  const sorted = [...byTopCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, c] of sorted) {
    console.log(`  ${c.toLocaleString().padStart(6)} 건 — ${t}`);
  }
}

// 샘플 hits 저장 (전체는 너무 크므로 패턴별 최대 3개씩)
const samplesByPattern = new Map<string, Hit[]>();
for (const h of allHits) {
  const arr = samplesByPattern.get(h.violation) ?? [];
  if (arr.length < 5) arr.push(h);
  samplesByPattern.set(h.violation, arr);
}

console.log('\n━━━ 패턴별 샘플 (최대 5건) ━━━');
for (const [pattern, samples] of samplesByPattern) {
  console.log(`\n● ${pattern}:`);
  for (const h of samples) {
    console.log(`  [${h.code}] ${h.leaf} / "${h.productName}"`);
    console.log(`    §${h.paragraphIndex}: "${h.excerpt}"`);
  }
}

// 전체 hits 를 JSON 으로 저장
writeFileSync('audit-all-categories-hits.json', JSON.stringify({
  totalChecked,
  totalErrors,
  totalHits: allHits.length,
  bySeverity: Object.fromEntries(severityCount),
  byPattern: Object.fromEntries(violationCount),
  byTopCategory: Object.fromEntries(byTopCategory),
  samples: Object.fromEntries(samplesByPattern),
}, null, 2));
console.log('\n전체 결과: audit-all-categories-hits.json');
