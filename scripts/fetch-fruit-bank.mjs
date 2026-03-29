// 과일 종류별 대표이미지 대량 다운로드 — 쿠팡 스톡 이미지 뱅크 구축용
// Pexels API에서 다양한 쿼리로 최대한 많이 가져온 뒤 유저가 직접 큐레이션
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '../.env.local'), 'utf8');
const API_KEY = envContent.match(/PEXELS_API_KEY="?([^"\n]+)"?/)[1];

const bankDir = join(__dirname, '..', 'stock-image-bank');
mkdirSync(bankDir, { recursive: true });

async function search(query, perPage = 40, page = 1) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  return data.photos || [];
}

async function download(url, filepath) {
  if (existsSync(filepath)) return true; // 이미 있으면 스킵
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
  return true;
}

// 각 과일별 다양한 쿼리 — "white background" 제약 없이 넓게 검색
const fruits = [
  {
    label: '사과',
    folder: 'apple',
    queries: [
      'red apple fruit',
      'fresh apple',
      'apple fruit closeup',
      'red apple isolated',
      'apple fruit white',
      'single apple',
      'green apple fruit',
      'apple fruit studio',
    ],
  },
  {
    label: '딸기',
    folder: 'strawberry',
    queries: [
      'strawberry fruit',
      'fresh strawberry',
      'strawberry closeup',
      'strawberry isolated',
      'strawberry white',
      'single strawberry',
      'strawberry red fresh',
      'strawberry studio',
    ],
  },
  {
    label: '배',
    folder: 'pear',
    queries: [
      'pear fruit',
      'fresh pear',
      'pear closeup',
      'pear isolated',
      'pear fruit white',
      'single pear',
      'asian pear nashi',
      'pear fruit studio',
    ],
  },
  {
    label: '감귤',
    folder: 'mandarin',
    queries: [
      'mandarin orange fruit',
      'tangerine fruit',
      'mandarin citrus',
      'tangerine isolated',
      'mandarin fresh',
      'single tangerine',
      'clementine fruit',
      'mandarin orange closeup',
    ],
  },
  {
    label: '포도',
    folder: 'grape',
    queries: [
      'grapes fruit',
      'fresh grapes',
      'grape bunch',
      'grapes closeup',
      'green grapes',
      'purple grapes',
      'grape cluster',
      'grapes studio',
    ],
  },
  {
    label: '수박',
    folder: 'watermelon',
    queries: [
      'watermelon fruit',
      'watermelon slice',
      'fresh watermelon',
      'watermelon closeup',
      'watermelon isolated',
      'whole watermelon',
      'watermelon cut',
      'watermelon red',
    ],
  },
  {
    label: '복숭아',
    folder: 'peach',
    queries: [
      'peach fruit',
      'fresh peach',
      'peach closeup',
      'peach isolated',
      'peach fruit white',
      'single peach',
      'peach fresh ripe',
      'peach studio',
    ],
  },
  {
    label: '망고',
    folder: 'mango',
    queries: [
      'mango fruit',
      'fresh mango',
      'mango closeup',
      'mango isolated',
      'mango yellow',
      'single mango',
      'ripe mango',
      'mango fruit studio',
    ],
  },
  {
    label: '바나나',
    folder: 'banana',
    queries: [
      'banana fruit',
      'fresh banana',
      'banana bunch',
      'banana closeup',
      'banana isolated',
      'single banana',
      'yellow banana',
      'banana fruit studio',
    ],
  },
  {
    label: '키위',
    folder: 'kiwi',
    queries: [
      'kiwi fruit',
      'fresh kiwi',
      'kiwi closeup',
      'kiwi isolated',
      'kiwi cut half',
      'single kiwi',
      'kiwi green',
      'kiwi fruit studio',
    ],
  },
];

console.log('=== 과일 스톡 이미지 대량 다운로드 ===');
console.log(`저장 위치: ${bankDir}\n`);

for (const fruit of fruits) {
  const fruitDir = join(bankDir, fruit.folder);
  mkdirSync(fruitDir, { recursive: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${fruit.label} (${fruit.folder})`);
  console.log(`${'='.repeat(50)}`);

  const allPhotos = new Map(); // id → photo

  for (const q of fruit.queries) {
    try {
      // 페이지 1 (최대 40장)
      const photos1 = await search(q, 40, 1);
      for (const p of photos1) {
        if (!allPhotos.has(p.id)) allPhotos.set(p.id, p);
      }
      console.log(`  "${q}" p1 → ${photos1.length}장 (누적 ${allPhotos.size})`);

      // 페이지 2도 가져오기 (추가 40장)
      if (photos1.length >= 40) {
        const photos2 = await search(q, 40, 2);
        for (const p of photos2) {
          if (!allPhotos.has(p.id)) allPhotos.set(p.id, p);
        }
        console.log(`  "${q}" p2 → ${photos2.length}장 (누적 ${allPhotos.size})`);
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error(`  에러: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n  → 고유 ${allPhotos.size}장 — 다운로드 시작...`);

  // 전부 다운로드 (medium 사이즈 ~350x350)
  let downloaded = 0;
  let failed = 0;
  const photoList = [...allPhotos.values()];

  for (let i = 0; i < photoList.length; i++) {
    const p = photoList[i];
    const filename = `${fruit.folder}_${String(i + 1).padStart(3, '0')}_${p.id}.jpg`;
    const filepath = join(fruitDir, filename);
    try {
      const ok = await download(p.src.medium, filepath);
      if (ok) downloaded++;
      else failed++;
    } catch {
      failed++;
    }

    // 진행 표시 (50장마다)
    if ((i + 1) % 50 === 0) {
      console.log(`    ${i + 1}/${photoList.length} 다운로드 완료`);
    }
  }

  console.log(`  ✓ ${fruit.label}: ${downloaded}장 다운로드 (실패 ${failed})`);
}

console.log('\n\n=== 완료 ===');
console.log(`저장 위치: ${bankDir}`);
console.log('각 폴더에서 쿠팡 대표이미지로 쓸만한 사진을 골라주세요!');
