import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const e = require(join(__dirname, '..', '.audit-build/services/persuasion-engine.js'));

const ISSUES = [
  { name: '선물으로', re: /선물으로/ },
  { name: '써봤는데/사용하니까', re: /(써봤는데|사용하니까|사용해보면)/ },
  { name: '이건 진짜', re: /이건\s*진짜/ },
  { name: '시간 투자', re: /시간\s*투자/ },
  { name: '체감이 확실', re: /체감이\s*확실/ },
  { name: '마감/소재/기능', re: /\b(마감|소재|기능|사양|모델)\b/ },
  { name: 'HACCP', re: /HACCP/ },
  { name: '분야에', re: /\s분야에\s/ },
  { name: '카테고리에서', re: /카테고리에서/ },
  { name: '적당한 시점', re: /적당한\s*시점/ },
  { name: '정착하시길', re: /정착하시길/ },
  { name: '엄선한 엄선한', re: /엄선한\s+엄선한/ },
  { name: '활용을 추천', re: /활용을\s*추천/ },
  { name: '활용 드실/드시', re: /활용\s*드[실시]/ },
  { name: '오래 쓴/쓰는 동안', re: /(오래\s*쓴|쓰는\s*동안)/ },
  { name: '사용 시', re: /사용\s*시(간|에|\b)/ },
  { name: '동급에서/동급 평균', re: /동급(에서|에|\s)/ },
  { name: '리뷰 마이닝/표준편차', re: /(리뷰\s*마이닝|표준편차)/ },
  { name: '부정 키워드/표현 비중', re: /부정\s*(키워드|표현)/ },
  { name: '향 수치', re: /향\s*수치|건강검진/ },
  { name: '가방에 넣고', re: /가방에\s*넣고/ },
  { name: '2주/2개월 (생망고 보관)', re: /(2주|2개월).*(드신|먹어)/ },
  { name: '원재료', re: /원재료/ },
  { name: '체감/체내', re: /(체감|체내\s*흡수)/ },
];

const cat = '식품>신선식품>과일류>과일>망고';
const productName = '망고 남독마이 선물용 당도선별 과일 국내산 식품';
const leaf = '망고';

const found = {};
let trials = 0, totalText = '';
for (let i = 0; i < 30; i++) {
  trials++;
  const r = e.generatePersuasionContent(productName, cat, 'mango-test', i, ['망고', '애플망고', '태국망고'], '59393');
  const paras = e.contentBlocksToParagraphs(r.blocks, cat);
  const text = paras.join('\n');
  totalText += text + '\n';
  for (const { name, re } of ISSUES) {
    const m = text.match(re);
    if (m) found[name] = (found[name] || 0) + 1;
  }
}
console.log('30회 생성 결과 — 잔여 문제 어휘:');
for (const { name } of ISSUES) {
  const c = found[name] || 0;
  if (c > 0) console.log(`  ❌ ${name.padEnd(30)} ${c}회`);
}
console.log('\n검출 안 된 항목:');
for (const { name } of ISSUES) {
  if (!found[name]) console.log(`  ✅ ${name}`);
}
