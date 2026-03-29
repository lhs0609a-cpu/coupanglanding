// Pexels v3 — 과일 전용 3-쿼리 시스템 (single/closeup/cut·pile) 테스트
// 스코어링 v3: 해상도(50) + 비율(35) + 밝기(15)
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf8');
const API_KEY = envContent.match(/PEXELS_API_KEY="?([^"\n]+)"?/)[1];

const outDir = join(__dirname, 'pexels-test-v3');
mkdirSync(outDir, { recursive: true });

// ---- v3 스코어링 (stock-image-service.ts와 동일) ----
function hexBrightness(hex) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 128;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function scorePhoto(photo) {
  const brightness = hexBrightness(photo.avg_color || '#808080');

  // 해상도 (50점)
  const minDim = Math.min(photo.width, photo.height);
  let resScore = 0;
  if (minDim >= 1200) resScore = 50;
  else if (minDim >= 500) resScore = 50 * ((minDim - 500) / (1200 - 500));

  // 비율 (35점)
  const ratio = photo.width / photo.height;
  const deviation = Math.abs(ratio - 1.0);
  let aspectScore = 0;
  if (deviation <= 0.3) aspectScore = 35 * (1 - deviation / 0.3);

  // 밝기 (15점)
  let brightScore = 0;
  if (brightness >= 220) brightScore = 15;
  else if (brightness >= 100) brightScore = 15 * ((brightness - 100) / (220 - 100));

  const total = resScore + aspectScore + brightScore;
  return {
    total: Math.round(total * 10) / 10,
    brightness: Math.round(brightness),
    resScore: Math.round(resScore * 10) / 10,
    aspectScore: Math.round(aspectScore * 10) / 10,
    brightScore: Math.round(brightScore * 10) / 10,
  };
}

async function search(query, perPage = 15) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=square`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()).photos || [];
}

async function download(url, filename) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(outDir, filename), buf);
  return true;
}

// ---- 테스트 과일 (stock-image-service.ts FRUIT_QUERY_MAP과 동일) ----
const tests = [
  {
    label: '사과',
    queries: [
      { tag: 'single', q: 'single red apple fruit isolated white background' },
      { tag: 'closeup', q: 'red apple closeup macro fresh detail' },
      { tag: 'pile', q: 'fresh red apples pile closeup top view' },
    ],
  },
  {
    label: '딸기',
    queries: [
      { tag: 'single', q: 'strawberry fruit isolated white background' },
      { tag: 'closeup', q: 'strawberry closeup macro fresh red detail' },
      { tag: 'pile', q: 'fresh strawberries pile closeup top view' },
    ],
  },
  {
    label: '배',
    queries: [
      { tag: 'single', q: 'single pear fruit isolated white background' },
      { tag: 'closeup', q: 'pear fruit closeup macro fresh detail' },
      { tag: 'cut', q: 'pear fruit cut half white background' },
    ],
  },
  {
    label: '감귤',
    queries: [
      { tag: 'single', q: 'single mandarin tangerine isolated white background' },
      { tag: 'closeup', q: 'mandarin orange fruit closeup peel fresh' },
      { tag: 'cut', q: 'tangerine orange cut half cross section closeup' },
    ],
  },
  {
    label: '포도',
    queries: [
      { tag: 'single', q: 'grape bunch isolated white background' },
      { tag: 'closeup', q: 'green grapes closeup macro fresh detail' },
      { tag: 'pile', q: 'fresh grapes cluster closeup top view' },
    ],
  },
  {
    label: '수박',
    queries: [
      { tag: 'single', q: 'whole watermelon isolated white background' },
      { tag: 'closeup', q: 'watermelon slice red flesh closeup' },
      { tag: 'cut', q: 'watermelon cut half cross section fresh' },
    ],
  },
  {
    label: '복숭아',
    queries: [
      { tag: 'single', q: 'single peach fruit isolated white background' },
      { tag: 'closeup', q: 'peach fruit closeup macro fresh skin detail' },
      { tag: 'pile', q: 'fresh peaches pile closeup top view' },
    ],
  },
];

console.log('=== Pexels v3 — 과일 전용 3-쿼리 테스트 ===');
console.log(`스코어링: 해상도(50) + 비율(35) + 밝기(15) = 100\n`);

let totalDownloaded = 0;
const summary = [];

for (const test of tests) {
  console.log(`\n--- ${test.label} ---`);
  const fruitResults = { label: test.label, queries: [] };

  for (const { tag, q } of test.queries) {
    try {
      const photos = await search(q, 15);
      console.log(`  [${tag}] "${q}" → ${photos.length}장`);

      const queryResult = { tag, count: photos.length, downloaded: [] };

      // 스코어링 후 상위 5장 다운로드
      const scored = photos.map(p => ({ ...p, score: scorePhoto(p) }));
      scored.sort((a, b) => b.score.total - a.score.total);

      for (let i = 0; i < Math.min(5, scored.length); i++) {
        const p = scored[i];
        const s = p.score;
        const pass = s.total >= 30 ? 'PASS' : 'FAIL';
        const filename = `${test.label}_${tag}_${i + 1}_s${s.total}_${p.id}.jpg`;
        const ok = await download(p.src.medium, filename);
        if (ok) {
          totalDownloaded++;
          queryResult.downloaded.push({ filename, score: s.total, id: p.id });
          console.log(`    ${i + 1}. [${pass}] 점수=${s.total} (해상도=${s.resScore} 비율=${s.aspectScore} 밝기=${s.brightScore}) ${p.width}x${p.height} avg=${p.avg_color}`);
        }
      }
      fruitResults.queries.push(queryResult);
    } catch (err) {
      console.error(`    에러: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  summary.push(fruitResults);
}

console.log(`\n\n=== 완료: 총 ${totalDownloaded}장 → ${outDir} ===`);

// 요약 리포트
console.log('\n=== 요약 ===');
for (const fruit of summary) {
  const total = fruit.queries.reduce((a, q) => a + q.downloaded.length, 0);
  const uniqueIds = new Set(fruit.queries.flatMap(q => q.downloaded.map(d => d.id)));
  console.log(`${fruit.label}: ${total}장 (고유 ${uniqueIds.size}장)`);
}
