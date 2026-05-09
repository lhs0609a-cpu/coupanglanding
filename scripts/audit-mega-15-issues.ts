/**
 * 16,259 카테고리 × 20개 상품 = 325,180 상세페이지 전수 검증.
 *
 * 15개 이슈 카테고리:
 *   1. 카테고리 오염 (cross-leaf)
 *   2. 법 위반 표현 (의약품·효능·과장)
 *   3. 정체성 붕괴 (leaf 본문 누락 / 대명사 비율)
 *   4. 옵션·단위·중량 모순
 *   5. 빈 리뷰 슬롯
 *   6. 단어 반복
 *   7. 미치환 변수
 *   8. 쿠팡 SEO (글자수 / 키워드)
 *   9. 구매욕 폭발 (CTA 부재)
 *   10. 동사 오용 (식품→사용/의류→드시다)
 *   11. 카테고리 자체가 틀림 (대분류 오인)
 *   12. 모순·사실 오류 (시간/빈도/수치 충돌)
 *   13. 과장·허세 표현
 *   14. 한국어 오류
 *   15. 거의 동일 문장 반복
 */
import { generateStoryV2 } from '../src/lib/megaload/services/story-generator';
import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('src/lib/megaload/data/coupang-cat-index.json', 'utf8')) as Array<[string, string, string, number]>;

interface CatRow {
  code: string;
  path: string;
  leaf: string;
  depth: number;
}

const CATEGORIES: CatRow[] = raw.map(([code, fullSpace, leaf, depth]) => {
  const tokens = fullSpace.split(/\s+/).filter(Boolean);
  const leafParts = leaf.split(/[\s/(),\[\]]+/).filter(Boolean);
  const parentTokens = tokens.slice(0, Math.max(1, tokens.length - leafParts.length));
  const path = parentTokens.length > 0 ? parentTokens.join('>') + '>' + leaf : leaf;
  return { code, path, leaf, depth };
});

// ── 상품명 변형 풀 (20개 / 카테고리) ──────────────
const BRANDS = [
  '프리미엄', '데일리', '오리진', '이노바', '카비전',
  '셀라비뷰', '맘스케어', '에어플로', '헬로', '베스트',
  '로얄', '에코', '플러스', '오로라', '페이버릿',
  '내츄럴', '브이엠', '라이프', '스마트', '코어',
];
const ADJECTIVES = [
  '대용량', '신상', '베이직', '컴팩트', '디럭스',
  '프로', '슬림', '스탠다드', '특가', '한정',
  '울트라', '맥시', '미니', '오리지널', '클래식',
  '신선', '엄선', '고급', '가성비', '인기',
];
const SPECS = ['', '500ml', '1kg', '2개입', 'L사이즈', 'XL', '50개입', '3종 세트', '아이보리', '블랙'];

function buildVariants(leaf: string, baseIdx: number): string[] {
  const out: string[] = [];
  for (let v = 0; v < 20; v++) {
    const brand = BRANDS[(baseIdx + v) % BRANDS.length];
    const adj = ADJECTIVES[(baseIdx + v * 7) % ADJECTIVES.length];
    const spec = SPECS[(baseIdx + v * 3) % SPECS.length];
    const leafParts = leaf.split(/[\s/]+/).filter(Boolean);
    const main = leafParts.length === 1 ? `${brand} ${adj} ${leaf}` : `${brand} ${leaf}`;
    out.push(spec ? `${main} ${spec}` : main);
  }
  return out;
}

// ── 검증 패턴 ────────────────────────────────────
type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
type IssueCategory =
  | '1.카테고리오염' | '2.법위반표현' | '3.정체성붕괴' | '4.옵션단위중량모순'
  | '5.빈리뷰슬롯' | '6.단어반복' | '7.미치환변수' | '8.쿠팡SEO'
  | '9.구매욕폭발' | '10.동사오용' | '11.카테고리자체틀림' | '12.모순사실오류'
  | '13.과장허세' | '14.한국어오류' | '15.거의동일문장반복';

interface PatternCheck {
  category: IssueCategory;
  name: string;
  severity: Severity;
  // 단순 정규식 검사
  re?: RegExp;
  // 또는 본문 전체 + 컨텍스트 기반 검사
  fn?: (allText: string, ctx: { productName: string; categoryPath: string; paragraphs: string[] }) => string | null;
  exemptIfCategoryHas?: string[];
  exemptIfProductHas?: string[];
}

const CHECKS: PatternCheck[] = [
  // 1. 카테고리오염
  { category: '1.카테고리오염', name: '분유→유아식예요/물티슈예요/카시트예요/이유식예요', severity: 'CRITICAL',
    re: /(유아식이?예요|물티슈이?예요|카시트이?예요|이유식이?예요|유아세제이?예요|젖병이?예요)/,
    exemptIfProductHas: ['유아식','이유식','물티슈','카시트','세제','젖병'] },
  { category: '1.카테고리오염', name: '노트→다이어리/만년필/필통/플래너', severity: 'MAJOR',
    re: /(다이어리|만년필|필통|점착메모|플래너)이?예요/,
    exemptIfProductHas: ['다이어리','만년필','필통','점착메모','플래너'] },
  { category: '1.카테고리오염', name: '블랙박스→왁스/광택', severity: 'CRITICAL',
    re: /왁스(가|는|를|이|로|예요|로 유명)|광택나는|발수가\s/,
    exemptIfProductHas: ['왁스','코팅','광택'] },
  { category: '1.카테고리오염', name: '신선식품→캡슐/정제/알약', severity: 'CRITICAL',
    re: /(캡슐|정제|알약|1정|1포)\s+/,
    exemptIfCategoryHas: ['건강식품','비타민','영양제','홍삼','오메가','유산균'],
    exemptIfProductHas: ['캡슐','정제'] },

  // 2. 법위반표현 (의약품·과장 효능)
  { category: '2.법위반표현', name: '치료/완치/특효 (의약품 표현)', severity: 'CRITICAL',
    re: /\b(치료|완치|특효|의약품|만병통치)\b/ },
  { category: '2.법위반표현', name: '의사 추천/처방/진료', severity: 'CRITICAL',
    re: /(의사\s*추천|처방|진료|FDA\s*승인.*효능|의학적\s*효과)/ },
  { category: '2.법위반표현', name: '효과 100%/세계 1위', severity: 'MAJOR',
    re: /(효과\s*100%|세계\s*1위|업계\s*1위|국내\s*최고)/ },
  { category: '2.법위반표현', name: '암/당뇨/고혈압/관절염 치료', severity: 'CRITICAL',
    re: /(암|당뇨|고혈압|관절염|아토피)\s*(치료|개선|완화|효과)/,
    exemptIfCategoryHas: ['건강식품','비타민','영양제'] },

  // 3. 정체성붕괴
  { category: '3.정체성붕괴', name: 'leaf 토큰 본문 누락', severity: 'MINOR',
    fn: (allText, ctx) => {
      const leaf = ctx.categoryPath.split('>').pop() || '';
      const leafTok = leaf.split(/[\s/(),\[\]]+/).filter(t => t.length >= 2)[0] || '';
      if (leafTok.length < 2) return null;
      if (!allText.includes(leafTok) && !allText.includes(leaf)) {
        return `(leaf "${leafTok}" missing)`;
      }
      return null;
    } },
  { category: '3.정체성붕괴', name: '"이 제품/이 상품" 비율 50%+', severity: 'MINOR',
    fn: (allText, ctx) => {
      const proxy = (allText.match(/이\s*(상품|제품|아이템)/g) ?? []).length;
      const cleanName = ctx.productName.split(/\s+/).slice(0, 3).join(' ');
      const brandTok = ctx.productName.split(/\s+/)[0];
      let real = 0;
      if (cleanName.length > 4) real += (allText.split(cleanName).length - 1);
      if (brandTok.length >= 2) real += (allText.split(brandTok).length - 1);
      const total = proxy + real;
      if (total >= 4 && proxy / total > 0.6) {
        return `proxy=${proxy}, real=${real}`;
      }
      return null;
    } },

  // 4. 옵션단위중량모순
  { category: '4.옵션단위중량모순', name: '상품명 g/ml/kg/L vs 본문 다른 단위', severity: 'MAJOR',
    fn: (allText, ctx) => {
      const m = ctx.productName.match(/(\d+(?:\.\d+)?)\s*(g|ml|kg|L|개입|매)\b/);
      if (!m) return null;
      const [, num, unit] = m;
      // 같은 카테고리 단위로 다른 수치가 본문에 등장
      const others = allText.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}\\b`, 'g')) ?? [];
      const distinct = new Set(others.map(s => s.replace(/\s+/g, '')));
      distinct.delete(`${num}${unit}`);
      if (distinct.size >= 1 && [...distinct].some(d => d !== `${num}${unit}` && d.length > 0)) {
        return `상품명 ${num}${unit} ↔ 본문 ${[...distinct].join(',')}`;
      }
      return null;
    } },

  // 5. 빈 리뷰 슬롯
  { category: '5.빈리뷰슬롯', name: '진짜 빈 인용 (텍스트 없는 따옴표)', severity: 'MAJOR',
    re: /'[\s,]*'(?![가-힣A-Za-z])|"[\s,]*"(?![가-힣A-Za-z])/ },
  { category: '5.빈리뷰슬롯', name: '리뷰 캡션이 0개', severity: 'MINOR',
    fn: (_allText, _ctx) => null /* generateStoryV2 result.reviewTexts 별도 검사 */ },

  // 6. 단어반복
  { category: '6.단어반복', name: '동일 단어 인접 중복(2자+)', severity: 'MAJOR',
    re: /(\S{2,7}) \1(?=[\s.,!?])/ },
  { category: '6.단어반복', name: '같은 단어 12회 이상 (SEO 스터핑 의심)', severity: 'MINOR',
    fn: (allText, ctx) => {
      const words = allText.match(/[가-힣]{2,5}/g) ?? [];
      const counts = new Map<string, number>();
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      // 흔한 단어 + leaf 토큰(전체/부분 prefix) 은 제외 (자연스러운 반복)
      const leafFull = (ctx.categoryPath.split('>').pop() || '');
      const leafSplits = leafFull.split(/[\s/(),\[\]]+/).filter(Boolean);
      const ALLOWED = new Set<string>([
        '있어요','있습니다','됩니다','제품','상품','사용','경우','이에요','이라','마다',
        '한번','이건','이거','우리','매일','모두','정말','너무','진짜','직접','이번',
        '하나','다시','계속','지금','다른','다릅','만족','꾸준', '가격', '디자인',
        '가격에','이라면','관리도','쓰자마자','이래서','만족도',
      ]);
      // leaf 토큰의 모든 2~5자 prefix 도 자연스러운 반복으로 간주
      for (const lt of leafSplits) {
        for (let l = 2; l <= Math.min(5, lt.length); l++) ALLOWED.add(lt.slice(0, l));
      }
      const heavy = [...counts.entries()].filter(([w, c]) => {
        if (c < 12) return false;
        if (ALLOWED.has(w)) return false;
        // leaf 토큰의 substring 이면 자연스러운 반복으로 간주
        if (leafSplits.some(lt => lt.includes(w))) return false;
        return true;
      });
      if (heavy.length > 0) return `${heavy[0][0]}×${heavy[0][1]}`;
      return null;
    } },

  // 7. 미치환변수
  { category: '7.미치환변수', name: '{var} placeholder 잔재', severity: 'CRITICAL',
    re: /\{[가-힣A-Za-z_][^}]*\}/ },
  { category: '7.미치환변수', name: '" . " 잔재 (변수 빈치환)', severity: 'CRITICAL',
    re: /\s\.\s+[가-힣]/ },
  { category: '7.미치환변수', name: '"수 ." 어미 잘림', severity: 'CRITICAL',
    re: /[가-힣]\s+수\s*\.\s/ },

  // 8. 쿠팡 SEO
  { category: '8.쿠팡SEO', name: '본문 600자 미만', severity: 'MAJOR',
    fn: (allText) => allText.length < 600 ? `${allText.length}자` : null },
  { category: '8.쿠팡SEO', name: '본문 4000자 초과 (스터핑)', severity: 'MINOR',
    fn: (allText) => allText.length > 4000 ? `${allText.length}자` : null },

  // 9. 구매욕폭발 (CTA 부재)
  { category: '9.구매욕폭발', name: 'CTA 표현 부재', severity: 'MINOR',
    fn: (allText) => {
      const cta = /(사세요|구매하세요|만나보세요|시작해보세요|담아두세요|주문|선택)/;
      return cta.test(allText) ? null : 'CTA 키워드 없음';
    } },

  // 10. 동사오용
  { category: '10.동사오용', name: '식품 카테고리에 "입어보세요/입어봤"', severity: 'CRITICAL',
    re: /(입어보세요|입어봤|착용해)/,
    exemptIfCategoryHas: ['패션','의류','잡화','신발','가방','악세서리'] },
  { category: '10.동사오용', name: '의류·가전 카테고리에 "드셔보세요/먹어봤"', severity: 'CRITICAL',
    re: /(드셔보세요|드셔봤|먹어봤|드심)/,
    exemptIfCategoryHas: ['식품','건강식품','반려','애완','분유','이유식','음료','과일','채소'] },
  { category: '10.동사오용', name: '신선식품·가공식품에 "써봤/사용해보면"', severity: 'MAJOR',
    re: /(사용해보면|써봤는데|사용 시 안정감)/,
    // ⚠️ 도서/완구/반려/원예 등 모든 비식품 카테고리 exempt — 처음에 누락하여 99k false positive
    exemptIfCategoryHas: ['주방','조리','패션','의류','신발','가방','가전','자동차','문구','뷰티','생활','가구','출산','스포츠','도서','음반','DVD','완구','취미','반려','애완','원예','홈데코'] },

  // 11. 카테고리 자체 틀림 (top 카테고리 모순)
  { category: '11.카테고리자체틀림', name: '뷰티 카테고리에 "조리/요리/맛"', severity: 'MAJOR',
    re: /(조리해|요리해|맛있어요|맛있는|쫄깃|식감)/,
    exemptIfCategoryHas: ['식품','주방','반려','애완','출산','분유'] },
  { category: '11.카테고리자체틀림', name: '식품 카테고리에 "착용/입어"', severity: 'MAJOR',
    re: /(착용감|입어보|입어요|입었더니)/,
    // ⚠️ wearable 헬스용품 (건강팔찌/건강목걸이/발패치/안마기/보호대/측정기/액세서리 등) 도 exempt
    // - "액세서리"(l) 와 "악세서리"(ㅏ) 둘 다. 64086 "기타건강액세서리" path 매칭용.
    // - "건강용품","측정","측정기","측정용품" — 64064 "기타 건강측정기" path 매칭용.
    exemptIfCategoryHas: ['패션','의류','잡화','신발','가방','뷰티','반려','목걸이','팔찌','반지','패치','안마','보호대','마스크','장갑','양말','벨트','스타킹','모자','벙어리','시계','악세사리','악세서리','액세서리','건강용품','건강측정','측정기','측정용품'],
    exemptIfProductHas: ['팔찌','목걸이','반지','벨트','시계','패치','보호대','안마기','마스크','장갑','양말','모자','측정기','액세서리','악세서리'] },

  // 12. 모순/사실 오류
  { category: '12.모순사실오류', name: '주말+매일 빈도 모순', severity: 'MAJOR',
    re: /주말에.*매일\s*빠지지/ },
  { category: '12.모순사실오류', name: '한 단락에 1주/3주/6주/3개월 동시 등장', severity: 'MINOR',
    fn: (_allText, ctx) => {
      for (const p of ctx.paragraphs) {
        const m = p.match(/(\d+)\s*(주|개월)/g);
        if (!m) continue;
        const distinct = new Set(m.map(s => s.replace(/\s+/g, '')));
        if (distinct.size >= 4) return `${[...distinct].slice(0,4).join(',')}`;
      }
      return null;
    } },

  // 13. 과장/허세
  { category: '13.과장허세', name: '최고/유일/완벽 과장', severity: 'MINOR',
    re: /(세계\s*최강|업계\s*유일|완벽한\s*상품|국내\s*1위|타사\s*대비\s*\d+배)/ },

  // 14. 한국어 오류
  { category: '14.한국어오류', name: '선물으로/이걸으로 (ㄹ받침)', severity: 'CRITICAL',
    re: /선물으로|이걸으로|박스으로/ },
  { category: '14.한국어오류', name: '없은/있은 (불규칙 관형형)', severity: 'CRITICAL',
    re: /[가-힣\s](없|있)은(?=[\s가-힣])/ },
  { category: '14.한국어오류', name: '드심하 (합성 깨짐)', severity: 'CRITICAL', re: /드심하/ },
  { category: '14.한국어오류', name: '한이라/운이라 (관형형+이라)', severity: 'CRITICAL',
    re: /[가-힣](한|운|은|인)이라\s/ },
  { category: '14.한국어오류', name: '추상명사+한테/에게', severity: 'MAJOR',
    re: /(고민|식단|루틴|일상|체질|건강|마음)(한테|에게)/ },
  { category: '14.한국어오류', name: '는은/는는/은은 (조사 충돌)', severity: 'CRITICAL',
    re: /[가-힣]는은\s|[가-힣]는는\s|[가-힣]은은\s/ },
  { category: '14.한국어오류', name: '영문/숫자+을 (받침 오류)', severity: 'MAJOR',
    re: /[A-Za-z0-9]을\s/ },
  { category: '14.한국어오류', name: '때간이/단계에했', severity: 'CRITICAL', re: /때간이|단계에했/ },

  // 15. 거의 동일 문장 반복
  { category: '15.거의동일문장반복', name: '80%+ 일치 문장 한 페이지에 2회+', severity: 'MINOR',
    fn: (_allText, ctx) => {
      const sentences: string[] = [];
      for (const p of ctx.paragraphs) {
        sentences.push(...p.split(/(?<=[.!?。])\s+/).filter(s => s.trim().length >= 25));
      }
      const norm = (s: string) => s.replace(/[\s.,!?。]+/g, '').toLowerCase();
      const seen = new Map<string, string>();
      for (const s of sentences) {
        const k = norm(s).slice(0, 25);
        if (k.length < 20) continue;
        if (seen.has(k)) {
          const prev = seen.get(k)!;
          if (prev !== s) return `"${prev.slice(0, 40)}" ≈ "${s.slice(0, 40)}"`;
        } else {
          seen.set(k, s);
        }
      }
      return null;
    } },
];

// ── 메인 루프 ────────────────────────────────────
const VARIANTS_PER_CAT = 20;
const TOTAL_PAGES = CATEGORIES.length * VARIANTS_PER_CAT;
const totalByCategory = new Map<string, number>();
const totalBySeverity = new Map<string, number>();
const totalByPattern = new Map<string, number>();
const totalByTopCategory = new Map<string, number>();
const samplesByPattern = new Map<string, Array<{ code: string; product: string; excerpt: string }>>();

let processedPages = 0;
let processedCats = 0;
let exceptions = 0;
let totalHits = 0;

const start = Date.now();
const PROGRESS_EVERY = 500; // 카테고리마다

for (let ci = 0; ci < CATEGORIES.length; ci++) {
  const c = CATEGORIES[ci];
  if (c.leaf.length < 2) continue;

  const variants = buildVariants(c.leaf, ci);

  for (let vi = 0; vi < variants.length; vi++) {
    const productName = variants[vi];
    let result;
    try {
      result = generateStoryV2(productName, c.path, 'seller_MEGA15', ci * 100 + vi, undefined, c.code);
    } catch (e) {
      exceptions++;
      continue;
    }
    processedPages++;

    const allText = [...result.paragraphs, ...result.reviewTexts].join(' ');
    const ctx = { productName, categoryPath: c.path, paragraphs: result.paragraphs };

    // 빈 리뷰 슬롯 — reviewTexts 별도 검사
    if (result.reviewTexts.length === 0) {
      const v = '5.빈리뷰슬롯-리뷰캡션 0개';
      totalByCategory.set('5.빈리뷰슬롯', (totalByCategory.get('5.빈리뷰슬롯') ?? 0) + 1);
      totalBySeverity.set('MINOR', (totalBySeverity.get('MINOR') ?? 0) + 1);
      totalByPattern.set(v, (totalByPattern.get(v) ?? 0) + 1);
      const top = c.path.split('>')[0] || '?';
      totalByTopCategory.set(top, (totalByTopCategory.get(top) ?? 0) + 1);
      const arr = samplesByPattern.get(v) ?? [];
      if (arr.length < 5) arr.push({ code: c.code, product: productName, excerpt: '리뷰 캡션 0개' });
      samplesByPattern.set(v, arr);
      totalHits++;
    }

    for (const ck of CHECKS) {
      if (ck.exemptIfCategoryHas?.some(k => c.path.includes(k))) continue;
      if (ck.exemptIfProductHas?.some(k => productName.includes(k))) continue;
      let hit: string | null = null;
      let excerpt = '';
      if (ck.re) {
        const m = allText.match(ck.re);
        if (m) {
          hit = ck.name;
          const idx = m.index ?? 0;
          excerpt = allText.slice(Math.max(0, idx - 20), idx + (m[0]?.length ?? 0) + 30);
        }
      } else if (ck.fn) {
        const r = ck.fn(allText, ctx);
        if (r) {
          hit = ck.name;
          excerpt = r;
        }
      }
      if (hit) {
        const key = ck.category + '-' + hit;
        totalByCategory.set(ck.category, (totalByCategory.get(ck.category) ?? 0) + 1);
        totalBySeverity.set(ck.severity, (totalBySeverity.get(ck.severity) ?? 0) + 1);
        totalByPattern.set(key, (totalByPattern.get(key) ?? 0) + 1);
        const top = c.path.split('>')[0] || '?';
        totalByTopCategory.set(top, (totalByTopCategory.get(top) ?? 0) + 1);
        const arr = samplesByPattern.get(key) ?? [];
        if (arr.length < 5) arr.push({ code: c.code, product: productName, excerpt });
        samplesByPattern.set(key, arr);
        totalHits++;
      }
    }
  }

  processedCats++;
  if (processedCats % PROGRESS_EVERY === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const eta = ((Date.now() - start) / processedPages * (TOTAL_PAGES - processedPages) / 1000).toFixed(0);
    const msg = `  진행: ${processedCats}/${CATEGORIES.length} (${processedPages.toLocaleString()} pages, ${elapsed}s, ETA ${eta}s, hits=${totalHits.toLocaleString()})\n`;
    // ⚠️ Windows MSYS 의 stdout 리다이렉션 버퍼링 우회 — progress 를 직접 파일에 append.
    writeFileSync('audit-mega-15-progress.log', msg, { flag: 'a' });
    process.stdout.write(msg);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${'='.repeat(70)}`);
console.log(`전수 검증 완료: ${processedCats}/${CATEGORIES.length} 카테고리 × ${VARIANTS_PER_CAT}개 = ${processedPages.toLocaleString()} 페이지 (${elapsed}s)`);
console.log(`예외 발생: ${exceptions}건`);
console.log(`총 검출: ${totalHits.toLocaleString()}건`);
console.log(`${'='.repeat(70)}`);

if (totalBySeverity.size > 0) {
  console.log('\n━━━ 심각도별 ━━━');
  for (const sev of ['CRITICAL', 'MAJOR', 'MINOR']) {
    const cnt = totalBySeverity.get(sev) ?? 0;
    if (cnt) console.log(`  ${sev.padEnd(8)}: ${cnt.toLocaleString()}건`);
  }
}

if (totalByCategory.size > 0) {
  console.log('\n━━━ 이슈 카테고리별 ━━━');
  const sorted = [...totalByCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, cnt] of sorted) {
    console.log(`  ${cnt.toLocaleString().padStart(8)} 건 — ${cat}`);
  }
}

if (totalByPattern.size > 0) {
  console.log('\n━━━ 패턴별 (Top 30) ━━━');
  const sorted = [...totalByPattern.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [p, cnt] of sorted) {
    console.log(`  ${cnt.toLocaleString().padStart(8)} 건 — ${p}`);
  }
}

if (totalByTopCategory.size > 0) {
  console.log('\n━━━ 대분류별 ━━━');
  const sorted = [...totalByTopCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, cnt] of sorted) {
    console.log(`  ${cnt.toLocaleString().padStart(8)} 건 — ${t}`);
  }
}

console.log('\n━━━ 패턴별 샘플 (최대 5건) ━━━');
const topPatterns = [...samplesByPattern.entries()]
  .filter(([k]) => (totalByPattern.get(k) ?? 0) > 0)
  .sort((a, b) => (totalByPattern.get(b[0]) ?? 0) - (totalByPattern.get(a[0]) ?? 0))
  .slice(0, 30);
for (const [p, samples] of topPatterns) {
  console.log(`\n● ${p} (${(totalByPattern.get(p) ?? 0).toLocaleString()}건):`);
  for (const s of samples) {
    console.log(`  [${s.code}] "${s.product}"`);
    console.log(`    "${s.excerpt}"`);
  }
}

writeFileSync('audit-mega-15-issues-result.json', JSON.stringify({
  totalCategories: processedCats,
  totalPages: processedPages,
  exceptions,
  totalHits,
  bySeverity: Object.fromEntries(totalBySeverity),
  byCategory: Object.fromEntries(totalByCategory),
  byPattern: Object.fromEntries(totalByPattern),
  byTopCategory: Object.fromEntries(totalByTopCategory),
  samples: Object.fromEntries(samplesByPattern),
  elapsedSeconds: parseInt(elapsed, 10),
}, null, 2));
console.log('\n전체 결과: audit-mega-15-issues-result.json');
