// Pexels v4 — 과일 1개만 단독 흰배경 이미지 전용
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf8');
const API_KEY = envContent.match(/PEXELS_API_KEY="?([^"\n]+)"?/)[1];

const outDir = join(__dirname, 'pexels-test-v4');
mkdirSync(outDir, { recursive: true });

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
  const minDim = Math.min(photo.width, photo.height);

  // 해상도 (40점)
  let resScore = 0;
  if (minDim >= 1200) resScore = 40;
  else if (minDim >= 500) resScore = 40 * ((minDim - 500) / (1200 - 500));

  // 비율 (25점)
  const ratio = photo.width / photo.height;
  const deviation = Math.abs(ratio - 1.0);
  let aspectScore = 0;
  if (deviation <= 0.3) aspectScore = 25 * (1 - deviation / 0.3);

  // 밝기 (35점) — 단품 흰배경은 밝기가 핵심 필터
  let brightScore = 0;
  if (brightness >= 220) brightScore = 35;
  else if (brightness >= 160) brightScore = 35 * ((brightness - 160) / (220 - 160));

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

// 과일 1개 단독 — 흰배경 격리 쿼리만
const tests = [
  {
    label: '사과',
    queries: [
      'single red apple fruit isolated white background',
      'one red apple white background studio',
      'red apple fruit alone white background photography',
    ],
  },
  {
    label: '딸기',
    queries: [
      'single strawberry fruit isolated white background',
      'one strawberry white background studio',
      'strawberry fruit alone white background photography',
    ],
  },
  {
    label: '배',
    queries: [
      'single pear fruit isolated white background',
      'one pear white background studio',
      'asian pear fruit alone white background photography',
    ],
  },
  {
    label: '감귤',
    queries: [
      'single mandarin tangerine isolated white background',
      'one tangerine orange white background studio',
      'mandarin citrus fruit alone white background',
    ],
  },
  {
    label: '포도',
    queries: [
      'single grape bunch isolated white background',
      'one bunch grapes white background studio',
      'grape cluster alone white background photography',
    ],
  },
  {
    label: '수박',
    queries: [
      'single whole watermelon isolated white background',
      'one watermelon white background studio',
      'whole watermelon alone white background photography',
    ],
  },
  {
    label: '복숭아',
    queries: [
      'single peach fruit isolated white background',
      'one peach white background studio',
      'peach fruit alone white background photography',
    ],
  },
  {
    label: '망고',
    queries: [
      'single mango fruit isolated white background',
      'one mango white background studio',
      'mango fruit alone white background photography',
    ],
  },
  {
    label: '바나나',
    queries: [
      'single banana fruit isolated white background',
      'one banana white background studio',
      'banana fruit alone white background photography',
    ],
  },
  {
    label: '키위',
    queries: [
      'single kiwi fruit isolated white background',
      'one kiwi white background studio',
      'kiwi fruit alone white background photography',
    ],
  },
];

console.log('=== Pexels v4 — 과일 1개 단독 흰배경 전용 ===');
console.log('스코어링: 해상도(40) + 비율(25) + 밝기(35) = 100');
console.log('밝기 가중치 복원 — 흰배경 필터링 핵심\n');

let totalDownloaded = 0;

for (const test of tests) {
  console.log(`\n--- ${test.label} ---`);

  // 모든 쿼리 결과 합산 + 중복 제거
  const allPhotos = new Map(); // id → photo
  for (const q of test.queries) {
    try {
      const photos = await search(q, 15);
      console.log(`  "${q}" → ${photos.length}장`);
      for (const p of photos) {
        if (!allPhotos.has(p.id)) allPhotos.set(p.id, p);
      }
    } catch (err) {
      console.error(`  에러: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`  → 고유 ${allPhotos.size}장`);

  // 스코어링 + 밝기 180 이상만 (흰배경 필터)
  const scored = [...allPhotos.values()]
    .map(p => ({ ...p, score: scorePhoto(p) }))
    .filter(p => p.score.brightness >= 180) // 흰배경 필터
    .sort((a, b) => b.score.total - a.score.total);

  console.log(`  → 밝기>=180 필터 후 ${scored.length}장`);

  // 상위 5장 다운로드
  for (let i = 0; i < Math.min(5, scored.length); i++) {
    const p = scored[i];
    const s = p.score;
    const filename = `${test.label}_${i + 1}_s${s.total}_b${s.brightness}_${p.id}.jpg`;
    const ok = await download(p.src.medium, filename);
    if (ok) {
      totalDownloaded++;
      console.log(`    ${i + 1}. 점수=${s.total} (해상도=${s.resScore} 비율=${s.aspectScore} 밝기=${s.brightScore}) brightness=${s.brightness} ${p.width}x${p.height}`);
    }
  }
}

console.log(`\n\n=== 완료: 총 ${totalDownloaded}장 → ${outDir} ===`);
