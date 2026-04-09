import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));

// ═══ 수정된 매칭 로직 시뮬레이션 ═══

function normalizeOptionName(name) {
  let n = name.replace(/\(택\d+\)\s*/g, '').trim();
  if (n === '총 수량') n = '수량';
  return n;
}

// 수정 전 매칭 조건
function matchesBefore(name, unit) {
  const n = normalizeOptionName(name);
  if (n === '개당 용량' && unit === 'ml') return 'extractVolumeMl';
  if (n === '개당 중량' && unit === 'g') return 'extractWeightG';
  if (n === '개당 수량' && unit === '개') return 'extractPerCount';
  if (n.includes('캡슐') || n.includes('정')) return 'extractTabletCount';
  if ((n === '수량' || n === '총 수량') && unit === '개') return 'extractCount';
  if (n === '사이즈' || n.includes('사이즈') || n === '크기') return 'extractSize';
  if (n === '색상' || n.includes('색상') || n === '컬러' || n.includes('컬러')) return 'extractColor';
  return null;
}

// 수정 후 매칭 조건
function matchesAfter(name, unit) {
  const n = normalizeOptionName(name);
  if ((n === '수량' || n === '총 수량') && unit === '개') return 'extractCount';
  if (n.includes('용량') && unit === 'ml') return 'extractVolumeMl';
  if (n.includes('중량') && unit === 'g') return 'extractWeightG';
  if (n.includes('수량') && n !== '수량' && unit === '개') return 'extractPerCount';
  if (n.includes('캡슐') || n.includes('정')) return 'extractTabletCount';
  if (n === '사이즈' || n.includes('사이즈') || n === '크기') return 'extractSize';
  if (n === '색상' || n.includes('색상') || n === '컬러' || n.includes('컬러')) return 'extractColor';
  return null;
}

// 비교 분석
const improved = [];
const unchanged = [];
const regressed = [];
const allOpts = new Map(); // name(unit) → count

for (const [code, cat] of Object.entries(data)) {
  const buyOpts = cat.b || [];
  for (const opt of buyOpts) {
    if (!opt.r) continue; // 필수 아니면 스킵
    const key = `${opt.n}(${opt.u || '-'})`;
    allOpts.set(key, (allOpts.get(key) || 0) + 1);

    const before = matchesBefore(opt.n, opt.u);
    const after = matchesAfter(opt.n, opt.u);

    if (!before && after) {
      // 수정으로 새로 매칭됨 (개선)
      const found = improved.find(i => i.key === key);
      if (found) {
        found.count++;
      } else {
        improved.push({ key, count: 1, handler: after, choose1: opt.c1, sample: cat.p });
      }
    } else if (before && !after) {
      // 수정으로 매칭 깨짐 (회귀!)
      const found = regressed.find(i => i.key === key);
      if (found) {
        found.count++;
      } else {
        regressed.push({ key, count: 1, before, sample: cat.p });
      }
    } else if (before !== after && before && after) {
      // 핸들러가 바뀜
      const changeKey = `${key}: ${before} → ${after}`;
      const found = unchanged.find(i => i.key === changeKey);
      if (found) {
        found.count++;
      } else {
        unchanged.push({ key: changeKey, count: 1 });
      }
    }
  }
}

console.log('=== 회귀 (기존 동작 깨짐) ===');
if (regressed.length === 0) {
  console.log('  없음 ✅');
} else {
  regressed.sort((a, b) => b.count - a.count).forEach(r => {
    console.log(`  ❌ ${r.count}개 | ${r.key} — 기존: ${r.before} | 예: ${r.sample}`);
  });
}

console.log('');
console.log('=== 개선 (새로 매칭됨 — 기존 "1" 폴백 → 정상 추출) ===');
improved.sort((a, b) => b.count - a.count).forEach(i => {
  console.log(`  ✅ ${i.count}개 | ${i.key}${i.choose1 ? ' [택1]' : ''} → ${i.handler} | 예: ${i.sample}`);
});

console.log('');
console.log('=== 핸들러 변경 (동작은 동일) ===');
if (unchanged.length === 0) {
  console.log('  없음');
} else {
  unchanged.sort((a, b) => b.count - a.count).forEach(u => {
    console.log(`  ⚠️ ${u.count}개 | ${u.key}`);
  });
}

// 여전히 미처리인 필수 숫자 옵션
console.log('');
console.log('=== 여전히 미처리 (숫자 단위 있는 필수 옵션) ===');
const stillUnhandled = [];
for (const [code, cat] of Object.entries(data)) {
  for (const opt of (cat.b || [])) {
    if (!opt.r || !opt.u) continue;
    const after = matchesAfter(opt.n, opt.u);
    if (!after) {
      const key = `${opt.n}(${opt.u})`;
      const found = stillUnhandled.find(s => s.key === key);
      if (found) {
        found.count++;
      } else {
        stillUnhandled.push({ key, count: 1, choose1: opt.c1, sample: cat.p });
      }
    }
  }
}
stillUnhandled.sort((a, b) => b.count - a.count).forEach(s => {
  console.log(`  ${s.count}개 | ${s.key}${s.choose1 ? ' [택1]' : ''} | 예: ${s.sample}`);
});
