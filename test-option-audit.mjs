import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const d = require('./src/lib/megaload/data/coupang-cat-details.json');
const codes = Object.keys(d);

const HANDLED_REGEX = ['수량','개당 용량','개당 중량','개당 수량','개당 캡슐/정','색상','사이즈','패션의류/잡화 사이즈','크기','컬러','신발사이즈'];
const FALLBACK_PATTERNS = ['색상','컬러','모델','품번','사이즈','크기','구성','맛','향','용량','중량','길이','차종','인원','가로','세로','신발','총','단계','원료','주원료','ram','메모리','저장','전구','수산물','농산물','개당 수량','출고','쌀','계란','분쇄'];

let totalReq = 0, handledRegex = 0, handledFallback = 0;
const unhandled = new Map();

for (const c of codes) {
  for (const o of (d[c].b || [])) {
    if (o.r !== true) continue;
    totalReq++;
    const name = o.n.replace(/\(택1\)\s*/g, '').trim();
    const nameLower = name.toLowerCase();
    if (HANDLED_REGEX.some(h => name === h || name.includes(h))) { handledRegex++; continue; }
    if (FALLBACK_PATTERNS.some(p => nameLower.includes(p))) { handledFallback++; continue; }
    unhandled.set(name, (unhandled.get(name) || 0) + 1);
  }
}

const unhandledCount = totalReq - handledRegex - handledFallback;
console.log('전체 필수옵션 건수:', totalReq);
console.log('정규식 직접 처리:', handledRegex, '(' + Math.round(handledRegex/totalReq*100) + '%)');
console.log('fallback 처리:', handledFallback, '(' + Math.round(handledFallback/totalReq*100) + '%)');
console.log('미처리:', unhandledCount, '(' + Math.round(unhandledCount/totalReq*100) + '%)');
console.log('\n미처리 필수옵션 TOP 30:');
[...unhandled.entries()].sort((a,b) => b[1] - a[1]).slice(0, 30).forEach(([n, c]) => console.log('  ' + n + ' → ' + c + '개 카테고리'));
