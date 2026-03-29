// Pexels v2 — 과일 클로즈업/단품 스타일에 최적화된 쿼리 테스트
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf8');
const API_KEY = envContent.match(/PEXELS_API_KEY="?([^"\n]+)"?/)[1];

const outDir = join(__dirname, 'pexels-test-v2');
mkdirSync(outDir, { recursive: true });

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

// 새로운 쿼리 전략:
// 스타일 A: "single [fruit] isolated white" — 흰배경 단품
// 스타일 B: "[fruit] closeup macro top view" — 과일 꽉 차는 클로즈업
// 스타일 C: "[fruit] fresh cut half white background" — 단면/반쪽
const tests = [
  {
    label: '사과',
    queries: [
      { tag: 'single', q: 'single red apple isolated white background' },
      { tag: 'closeup', q: 'red apple closeup macro fresh detail' },
      { tag: 'topview', q: 'red apples top view flat lay white background' },
    ]
  },
  {
    label: '딸기',
    queries: [
      { tag: 'single', q: 'single strawberry isolated white background' },
      { tag: 'closeup', q: 'strawberry closeup macro fresh red detail' },
      { tag: 'pile', q: 'fresh strawberries pile top view white background' },
    ]
  },
  {
    label: '배',
    queries: [
      { tag: 'single', q: 'single asian pear round fruit isolated white background' },
      { tag: 'closeup', q: 'yellow round pear fruit closeup fresh' },
      { tag: 'korean', q: 'korean pear nashi round fruit white background' },
    ]
  },
  {
    label: '감귤',
    queries: [
      { tag: 'single', q: 'single mandarin tangerine isolated white background' },
      { tag: 'closeup', q: 'mandarin orange fruit closeup peel fresh' },
      { tag: 'pile', q: 'tangerines pile top view white background' },
    ]
  },
  {
    label: '포도',
    queries: [
      { tag: 'single', q: 'grape bunch isolated white background' },
      { tag: 'closeup', q: 'green grapes closeup macro fresh detail' },
      { tag: 'shine', q: 'shine muscat green grapes white background' },
    ]
  },
  {
    label: '수박',
    queries: [
      { tag: 'single', q: 'watermelon whole isolated white background' },
      { tag: 'cut', q: 'watermelon slice red flesh closeup' },
      { tag: 'half', q: 'watermelon cut half white background fresh' },
    ]
  },
  {
    label: '복숭아',
    queries: [
      { tag: 'single', q: 'single peach fruit isolated white background' },
      { tag: 'closeup', q: 'peach fruit closeup macro fresh skin' },
      { tag: 'pile', q: 'fresh peaches pile top view white' },
    ]
  },
];

console.log('=== Pexels v2 — 과일 클로즈업/단품 쿼리 테스트 ===\n');

let totalDownloaded = 0;

for (const test of tests) {
  console.log(`\n--- ${test.label} ---`);

  for (const { tag, q } of test.queries) {
    try {
      const photos = await search(q, 8);
      console.log(`  [${tag}] "${q}" → ${photos.length}장`);

      // 상위 3장 다운로드
      for (let i = 0; i < Math.min(3, photos.length); i++) {
        const p = photos[i];
        const filename = `${test.label}_${tag}_${i+1}_${p.id}.jpg`;
        const ok = await download(p.src.medium, filename);
        if (ok) {
          totalDownloaded++;
          console.log(`    ${i+1}. ${p.width}x${p.height} avg=${p.avg_color} → ${filename}`);
        }
      }
    } catch (err) {
      console.error(`    에러: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

console.log(`\n=== 완료: 총 ${totalDownloaded}장 → ${outDir} ===`);
