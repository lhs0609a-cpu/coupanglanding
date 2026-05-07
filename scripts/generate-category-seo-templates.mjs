/**
 * generate-category-seo-templates.mjs
 *
 * 16k 쿠팡 카테고리 × GPT-4o-mini → SEO 템플릿 JSON 생성.
 *
 * 출력: src/lib/megaload/data/category-seo-templates.json
 *   {
 *     "<카테고리경로>": {
 *       "primary": ["사과", "부사", "홍로"],   // 핵심 검색 키워드
 *       "modifiers": ["국내산", "유기농", "선물용"],  // 보조 수식어
 *       "banned": ["가격", "할인", "특가"],   // 금지 토큰
 *       "lengthMin": 40,
 *       "lengthMax": 60
 *     }
 *   }
 *
 * 특징:
 *   - Resume: 기존 결과 보존하고 미생성만 호출
 *   - Concurrent: 20 worker 병렬
 *   - Auto-save: 1000건마다 디스크 저장
 *   - Cost: ~$1.6 (16k × ~$0.0001)
 *
 * 사용:
 *   OPENAI_API_KEY=sk-... node scripts/generate-category-seo-templates.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'lib', 'megaload', 'data');
const COUPANG_INDEX_PATH = join(DATA_DIR, 'coupang-cat-index.json');
const COUPANG_DETAILS_PATH = join(DATA_DIR, 'coupang-cat-details.json');
const OUTPUT_PATH = join(DATA_DIR, 'category-seo-templates.json');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.SEO_MODEL || 'gpt-4o-mini';
const CONCURRENCY = parseInt(process.env.SEO_CONCURRENCY || '20', 10);
const SAVE_EVERY = 200; // 200건마다 자동 저장

const SYSTEM_PROMPT = `당신은 쿠팡 상품 SEO 최적화 전문가입니다.
주어진 카테고리에 대해 실제 쿠팡에서 검색량이 높고 노출/클릭률이 우수한 노출상품명 패턴을 분석합니다.

규칙 (반드시 준수):
1. primary: 이 카테고리에서 소비자가 실제 검색창에 입력하는 핵심 키워드 5-10개. 검색어 그대로 (예: "사과" O, "사과맛" X).
2. modifiers: 소비자가 함께 검색하거나 선호하는 품질/특징/인증 수식어 5-10개. 카테고리에 적합한 것만 (예: 식품→"국내산","유기농","HACCP"; 가전→"에너지효율","KC인증").
3. banned: 이 카테고리에서 SEO 페널티/검색효과 없는 단어 3-8개 (예: "가격","할인","특가","증정","사은품" 등 마케팅 노이즈; 또는 카테고리와 무관한 단어).
4. lengthMin/lengthMax: 모바일 한 줄 노출 + 키워드 풍부도 균형 (보통 40~60자).

추가 원칙:
- 마케팅 합성어 금지: "프리미엄X","최고급X","국내산X" 같은 합성 단어 X — 분리 토큰만.
- 브랜드명 X (리셀러 보호).
- 카테고리 외 누설 금지 (예: 사과 카테고리에 "자몽","오렌지" X).
- 한국어로 응답.

반드시 다음 JSON 스키마로만 응답하세요 (다른 설명 X):
{"primary":["..."],"modifiers":["..."],"banned":["..."],"lengthMin":40,"lengthMax":60}`;

function buildUserPrompt(categoryPath) {
  const segs = categoryPath.split('>').map(s => s.trim()).filter(Boolean);
  const leaf = segs[segs.length - 1];
  return `카테고리 경로: ${categoryPath}
리프(소분류): ${leaf}

이 카테고리의 노출상품명 SEO 템플릿을 위 스키마대로 JSON으로 출력하세요.`;
}

async function callGPT(categoryPath, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(categoryPath) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 600,
        }),
      });
      if (res.status === 429) {
        const wait = Math.min(60_000, Math.pow(2, i) * 1500);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GPT ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(content);
      return validateTemplate(parsed);
    } catch (err) {
      if (i === retries - 1) {
        return { error: err.message || String(err) };
      }
      await new Promise(r => setTimeout(r, 2000 + i * 1000));
    }
  }
  return { error: 'max_retries' };
}

function validateTemplate(t) {
  const out = {
    primary: Array.isArray(t.primary) ? t.primary.filter(s => typeof s === 'string' && s.trim().length >= 1).slice(0, 12).map(s => s.trim()) : [],
    modifiers: Array.isArray(t.modifiers) ? t.modifiers.filter(s => typeof s === 'string' && s.trim().length >= 1).slice(0, 12).map(s => s.trim()) : [],
    banned: Array.isArray(t.banned) ? t.banned.filter(s => typeof s === 'string' && s.trim().length >= 1).slice(0, 10).map(s => s.trim()) : [],
    lengthMin: Number.isFinite(t.lengthMin) ? Math.max(20, Math.min(80, t.lengthMin)) : 40,
    lengthMax: Number.isFinite(t.lengthMax) ? Math.max(30, Math.min(100, t.lengthMax)) : 60,
  };
  if (out.lengthMax < out.lengthMin) out.lengthMax = out.lengthMin + 20;
  return out;
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY 환경변수를 설정하세요.');
    process.exit(1);
  }

  const coupangIndex = JSON.parse(readFileSync(COUPANG_INDEX_PATH, 'utf8'));
  const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

  const allPaths = new Set();
  for (const [code, , leafName] of coupangIndex) {
    const path = coupangDetails[code]?.p || leafName;
    if (path && typeof path === 'string') allPaths.add(path);
  }
  const pathList = [...allPaths].sort();
  console.log(`총 카테고리 경로: ${pathList.length}`);

  // Resume: 기존 결과 로드
  let templates = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      templates = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`기존 결과 로드: ${Object.keys(templates).length}개`);
    } catch { templates = {}; }
  }

  const todo = pathList.filter(p => !templates[p] || templates[p].error);
  console.log(`처리 대상: ${todo.length}개 (concurrent=${CONCURRENCY})`);

  if (todo.length === 0) {
    console.log('모든 카테고리 처리 완료.');
    return;
  }

  let cursor = 0;
  let done = 0;
  let failed = 0;
  const start = Date.now();

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= todo.length) return;
      const path = todo[idx];
      const result = await callGPT(path);
      if (result.error) {
        templates[path] = { error: result.error };
        failed++;
      } else {
        templates[path] = result;
      }
      done++;
      if (done % SAVE_EVERY === 0) {
        writeFileSync(OUTPUT_PATH, JSON.stringify(templates, null, 0));
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (done / Math.max(1, elapsed)).toFixed(1);
        const remaining = todo.length - done;
        const eta = (remaining / Math.max(0.1, rate)).toFixed(0);
        console.log(`  [${done}/${todo.length}] ${rate}/s · 실패 ${failed} · 경과 ${elapsed}s · 잔여 ~${eta}s`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  writeFileSync(OUTPUT_PATH, JSON.stringify(templates, null, 0));

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\n완료: ${done}건 · 실패 ${failed}건 · ${elapsed}s`);
  console.log(`출력: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
