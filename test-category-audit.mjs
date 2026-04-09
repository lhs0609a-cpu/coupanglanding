import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const d = require('./src/lib/megaload/data/coupang-cat-details.json');
const codes = Object.keys(d);

const HANDLED_REGEX = ['수량','개당 용량','개당 중량','개당 수량','개당 캡슐/정','색상','사이즈','패션의류/잡화 사이즈','크기','컬러','신발사이즈'];
const FALLBACK_PATTERNS = ['색상','컬러','모델','품번','사이즈','크기','구성','맛','향','용량','중량','길이','차종','인원','가로','세로','신발','총','단계','원료','주원료','ram','메모리','저장','전구','수산물','농산물','개당 수량','출고','쌀','계란','분쇄'];

// 카테고리 그룹별 분석
const groups = {
  '식품/건기식': p => /^식품/.test(p),
  '뷰티': p => /^뷰티/.test(p),
  '생활용품': p => /^생활용품/.test(p),
  '주방용품': p => /^주방용품|^홈인테리어.*주방/.test(p),
  '가구/홈인테리어': p => /^가구|^홈인테리어/.test(p),
  '패션': p => /^패션|^의류|^잡화/.test(p),
  '유아동': p => /^출산\/유아동|^유아/.test(p),
  '스포츠/레저': p => /^스포츠|^레저/.test(p),
  '가전/디지털': p => /^가전|^디지털|^컴퓨터/.test(p),
  '반려동물': p => /^반려동물|^애완/.test(p),
  '자동차': p => /^자동차/.test(p),
  '도서': p => /^도서/.test(p),
};

for (const [groupName, matcher] of Object.entries(groups)) {
  let total = 0, handled = 0, fallback = 0;
  const missed = new Map();
  
  for (const c of codes) {
    const path = d[c].p || '';
    if (!matcher(path)) continue;
    
    for (const o of (d[c].b || [])) {
      if (o.r !== true) continue;
      total++;
      const name = o.n.replace(/\(택1\)\s*/g, '').trim();
      const nameLower = name.toLowerCase();
      
      if (HANDLED_REGEX.some(h => name === h || name.includes(h))) { handled++; continue; }
      if (FALLBACK_PATTERNS.some(p => nameLower.includes(p))) { fallback++; continue; }
      missed.set(name, (missed.get(name) || 0) + 1);
    }
  }
  
  const missedCount = total - handled - fallback;
  const pct = total > 0 ? Math.round((handled + fallback) / total * 100) : 100;
  console.log(`\n=== ${groupName} === (필수옵션 ${total}건)`);
  console.log(`  정규식: ${handled} | fallback: ${fallback} | 미처리: ${missedCount} | 커버리지: ${pct}%`);
  
  if (missedCount > 0) {
    const top = [...missed.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
    console.log(`  미처리 옵션:`);
    top.forEach(([n, c]) => console.log(`    - ${n} (${c}개 카테고리)`));
  }
}
