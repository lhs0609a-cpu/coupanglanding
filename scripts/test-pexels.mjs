// Pexels API 실제 호출 테스트 — 과일 카테고리별 검색 결과 확인
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local에서 API 키 읽기
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/PEXELS_API_KEY="?([^"\n]+)"?/);
if (!apiKeyMatch) { console.error('PEXELS_API_KEY not found in .env.local'); process.exit(1); }
const API_KEY = apiKeyMatch[1];

// ---- Scoring (stock-image-service.ts와 동일) ----
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

  // 밝기 (45점)
  let brightnessScore = 0;
  if (brightness >= 230) brightnessScore = 45;
  else if (brightness >= 140) brightnessScore = 45 * ((brightness - 140) / (230 - 140));

  // 비율 (35점) — 1:1이 만점
  const ratio = photo.width / photo.height;
  const deviation = Math.abs(ratio - 1.0);
  let aspectScore = 0;
  if (deviation <= 0.3) aspectScore = 35 * (1 - deviation / 0.3);

  // 해상도 (20점)
  const minDim = Math.min(photo.width, photo.height);
  let resScore = 0;
  if (minDim >= 1200) resScore = 20;
  else if (minDim >= 600) resScore = 20 * ((minDim - 600) / (1200 - 600));

  const total = brightnessScore + aspectScore + resScore;
  return { total: Math.round(total * 10) / 10, brightness: Math.round(brightness), aspectScore: Math.round(aspectScore * 10) / 10, resScore: Math.round(resScore * 10) / 10, brightnessScore: Math.round(brightnessScore * 10) / 10 };
}

async function searchPexels(query, perPage = 15) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=square`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pexels ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data;
}

// ---- 테스트할 카테고리 ----
const tests = [
  {
    label: '🍎 사과',
    primary: 'red apples pile isolated white background product photography',
    secondary: 'fresh red apples group studio product closeup',
  },
  {
    label: '🍐 배',
    primary: 'asian pear nashi fruit isolated white background product',
    secondary: 'pear fruit group studio product photography',
  },
  {
    label: '🍊 감귤',
    primary: 'mandarin oranges pile isolated white background product',
    secondary: 'tangerine clementine group studio closeup',
  },
  {
    label: '🍓 딸기',
    primary: 'strawberries pile isolated white background product photography',
    secondary: 'fresh strawberry group studio product closeup',
  },
  {
    label: '🥩 소고기',
    primary: 'raw beef steak sliced isolated white background product',
    secondary: 'fresh beef meat tray studio product photography',
  },
  {
    label: '🐟 생선',
    primary: 'fresh whole fish isolated white background product photography',
    secondary: 'raw fish fillet studio product closeup',
  },
];

console.log('=== Pexels API 실제 검색 테스트 ===\n');
console.log(`API Key: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-5)}\n`);

for (const test of tests) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${test.label}`);
  console.log(`${'='.repeat(70)}`);

  try {
    // Primary 검색
    console.log(`\n[Primary] "${test.primary}"`);
    const primary = await searchPexels(test.primary, 10);
    console.log(`  → ${primary.total_results}건 중 ${primary.photos.length}건 반환\n`);

    for (let i = 0; i < Math.min(primary.photos.length, 5); i++) {
      const p = primary.photos[i];
      const s = scorePhoto(p);
      const pass = s.total >= 35 ? 'PASS' : 'FAIL';
      console.log(`  [${i+1}] ${pass} 점수=${s.total} (밝기=${s.brightnessScore} 비율=${s.aspectScore} 해상도=${s.resScore})`);
      console.log(`      ${p.width}x${p.height} avg_color=${p.avg_color} 밝기=${s.brightness}`);
      console.log(`      촬영: ${p.photographer}`);
      console.log(`      URL: ${p.src.medium}`);
    }

    // Secondary 검색
    if (test.secondary) {
      console.log(`\n[Secondary] "${test.secondary}"`);
      const secondary = await searchPexels(test.secondary, 10);
      console.log(`  → ${secondary.total_results}건 중 ${secondary.photos.length}건 반환\n`);

      for (let i = 0; i < Math.min(secondary.photos.length, 3); i++) {
        const p = secondary.photos[i];
        const s = scorePhoto(p);
        const pass = s.total >= 35 ? 'PASS' : 'FAIL';
        console.log(`  [${i+1}] ${pass} 점수=${s.total} (밝기=${s.brightnessScore} 비율=${s.aspectScore} 해상도=${s.resScore})`);
        console.log(`      ${p.width}x${p.height} avg_color=${p.avg_color} 밝기=${s.brightness}`);
        console.log(`      URL: ${p.src.medium}`);
      }
    }

    // 합산 통계
    const allPhotos = [...primary.photos];
    if (test.secondary) {
      const sec = await searchPexels(test.secondary, 10);
      const seenIds = new Set(allPhotos.map(p => p.id));
      for (const p of sec.photos) { if (!seenIds.has(p.id)) allPhotos.push(p); }
    }
    const scores = allPhotos.map(p => scorePhoto(p));
    const passed = scores.filter(s => s.total >= 35);
    console.log(`\n  📊 합산: 총 ${allPhotos.length}장 → PASS ${passed.length}장 (${Math.round(passed.length/allPhotos.length*100)}%)`);
    console.log(`     평균 점수: ${Math.round(scores.reduce((a,s) => a + s.total, 0) / scores.length * 10) / 10}`);
    console.log(`     평균 밝기: ${Math.round(scores.reduce((a,s) => a + s.brightness, 0) / scores.length)}`);

  } catch (err) {
    console.error(`  ❌ 에러: ${err.message}`);
  }

  // Rate limit 방지
  await new Promise(r => setTimeout(r, 500));
}

console.log('\n\n=== 완료 ===');
