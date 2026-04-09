import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('./src/lib/megaload/data/coupang-cat-details.json', 'utf8'));
const unhandled = {};
for (const [code, cat] of Object.entries(data)) {
  for (const opt of (cat.b || [])) {
    if (!opt.r || !opt.u) continue;
    const n = opt.n.replace(/\(택\d+\)\s*/g,'').trim();
    if (n === '총 수량') continue;
    if (n === '수량' || n.includes('용량') || n.includes('중량') || n.includes('캡슐') || n.includes('정')) continue;
    if (n.includes('수량')) continue;
    if (n.includes('사이즈') || n === '크기' || n.includes('색상') || n.includes('컬러')) continue;
    if (n.includes('길이') || n.includes('신발')) continue;
    const key = n + '(' + opt.u + ')';
    unhandled[key] = (unhandled[key] || 0) + 1;
  }
}
Object.entries(unhandled).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(v + ' | ' + k));
