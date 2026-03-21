/**
 * manual-fix-map.cjs — 수동 수정
 * 미매칭 + 확인된 오류를 정확한 쿠팡 코드로 교정
 */
const fs = require('fs');
const path = require('path');
const idx = require('../src/lib/megaload/data/coupang-cat-index.json');
const det = require('../src/lib/megaload/data/coupang-cat-details.json');
const MAP_PATH = path.join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'naver-to-coupang-map.json');
const data = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const naver = require('../src/lib/megaload/data/naver-categories.json');

function findByPath(keywords, topFilter) {
  for (const e of idx) {
    const p = det[e[0]]?.p || '';
    if (topFilter && !p.startsWith(topFilter)) continue;
    if (keywords.every(kw => p.includes(kw))) return e[0];
  }
  return null;
}

function findNaverId(pathIncludes) {
  const found = naver.leaves.find(c => c.path.includes(pathIncludes));
  return found?.id;
}

// 네이버 경로 → 쿠팡 코드 직접 매핑
const FIXES = {};

// 넥케어
const neckId = findNaverId('스킨케어>넥케어');
if (neckId) FIXES[neckId] = '56169'; // 넥크림

// 프라이팬 하위 전체
for (const leaf of naver.leaves) {
  if (!leaf.path.includes('프라이팬>')) continue;
  const name = leaf.name;
  if (name === '일반프라이팬') FIXES[leaf.id] = '80297';
  else if (name === '구이팬') FIXES[leaf.id] = '80300'; // 그릴팬
  else if (name === '에그팬') FIXES[leaf.id] = '80308';
  else if (name.includes('궁중')) FIXES[leaf.id] = '80297';
  else if (name.includes('볶음')) FIXES[leaf.id] = '80297';
  else if (name.includes('스킬렛')) FIXES[leaf.id] = '80297';
  else if (name.includes('전골')) FIXES[leaf.id] = findByPath(['전골냄비'], '주방') || '80297';
  else FIXES[leaf.id] = '80297';
}

// 액자 하위
for (const leaf of naver.leaves) {
  if (leaf.path.includes('액자>') && leaf.path.includes('가구/인테리어')) {
    FIXES[leaf.id] = '78385'; // 액자/프레임
  }
}

// 운동화 (출산/육아)
const shoeId = findNaverId('유아동잡화>신발>운동화');
if (shoeId) FIXES[shoeId] = findByPath(['유아동화'], '출산') || findByPath(['유아동 신발'], '출산') || '81249';

// 쌀류
FIXES[findNaverId('쌀>백미')] = '59262';
FIXES[findNaverId('쌀>찹쌀')] = findByPath(['쌀류', '찹쌀'], '식품') || '59264';
FIXES[findNaverId('쌀>현미')] = findByPath(['쌀류', '현미'], '식품') || '59263';
FIXES[findNaverId('쌀>흑미')] = '59265';
FIXES[findNaverId('쌀>기능성쌀')] = '72708';

// 과일
FIXES[findNaverId('과일>배')] = findByPath(['과일류', '과일', '배>'], '식품') || findByPath(['과일류', '>배'], '식품') || '59365';
FIXES[findNaverId('과일>감')] = '59365'; // 감

// 채소
FIXES[findNaverId('채소>무')] = findByPath(['채소류', '무'], '식품') || findByPath(['채소류'], '식품');
FIXES[findNaverId('채소>마')] = findByPath(['채소류', '마'], '식품') || findByPath(['채소류'], '식품');

// 견과
FIXES[findNaverId('견과류>밤')] = findByPath(['견과류', '밤'], '식품') || findByPath(['건과/견과류'], '식품');
FIXES[findNaverId('견과류>잣')] = '59415';

// 과자/빵
FIXES[findNaverId('과자/베이커리>껌')] = '59651'; // 일반껌
FIXES[findNaverId('빵>식빵/베이글')] = '59130'; // 식빵
FIXES[findNaverId('빵>호빵/찐빵')] = '72960';
FIXES[findNaverId('빵>도넛')] = findByPath(['빵/베이커리', '기타'], '식품') || '72971';
FIXES[findNaverId('빵>생지/냉동반죽')] = findByPath(['빵/베이커리'], '식품') || '72971';
FIXES[findNaverId('빵>일반빵')] = findByPath(['빵/베이커리', '기타'], '식품') || '72971';

// 스포츠
FIXES[findNaverId('스키장비>폴')] = '82394';
FIXES[findNaverId('웨이트기구>봉/바')] = findByPath(['바벨'], '스포츠') || findByPath(['웨이트'], '스포츠') || '82480';
FIXES[findNaverId('스킨스쿠버>납')] = '82480';
FIXES[findNaverId('무술용품>봉/곤/창')] = findByPath(['무술/호신'], '스포츠') || findByPath(['호신'], '스포츠');

// 공구
FIXES[findNaverId('페인트용품>붓')] = findByPath(['페인트붓'], '생활') || findByPath(['붓/풀솔'], '가구') || '78438';
FIXES[findNaverId('체결용품>못')] = '64307';
FIXES[findNaverId('체결용품>핀')] = '64251';

// 문구
FIXES[findNaverId('필기도구>펜')] = findByPath(['볼펜'], '문구') || findByPath(['펜'], '문구');
FIXES[findNaverId('문구용품>자')] = findByPath(['자/삼각자'], '문구') || findByPath(['직자'], '문구');
FIXES[findNaverId('서예/동양화용품>먹')] = '80157';

// 자동차
FIXES[findNaverId('타이어/휠>휠')] = '78918';
FIXES[findNaverId('튜닝용품>혼')] = findByPath(['경적'], '자동차') || findByPath(['혼'], '자동차') || '78918';

// 이어폰
FIXES[findNaverId('이어폰/헤드폰액세서리>캡/솜/팁')] = findByPath(['이어폰 액세서리'], '가전') || findByPath(['이어폰'], '가전');

// 화방 붓
FIXES[findNaverId('붓>서예/동양화붓')] = findByPath(['서예', '붓'], '문구') || '80157';
FIXES[findNaverId('붓>구성붓/세필붓')] = findByPath(['미술', '붓'], '문구') || findByPath(['붓'], '문구');
FIXES[findNaverId('붓>수채화붓')] = findByPath(['미술', '붓'], '문구') || findByPath(['붓'], '문구');
FIXES[findNaverId('붓>유화붓')] = findByPath(['미술', '붓'], '문구') || findByPath(['붓'], '문구');
FIXES[findNaverId('붓>아크릴붓')] = findByPath(['미술', '붓'], '문구') || findByPath(['붓'], '문구');

// null 제거
for (const [k, v] of Object.entries(FIXES)) {
  if (!k || !v) delete FIXES[k];
}

console.log('수정 대상:', Object.keys(FIXES).length + '개');

let applied = 0;
for (const [navId, coupangCode] of Object.entries(FIXES)) {
  if (!det[coupangCode]) { console.log('  경고: 쿠팡코드 없음:', coupangCode); continue; }
  const detail = det[coupangCode];
  const navLeaf = naver.leaves.find(c => c.id === navId);

  data.map[navId] = { c: coupangCode, n: 0.95, m: 'm' };

  const existingIdx = data.details.findIndex(d => d.naverCatId === navId);
  const newD = {
    naverCatId: navId,
    naverName: navLeaf?.name || '',
    naverPath: navLeaf?.path || '',
    coupangCode,
    coupangName: detail.p.split('>').pop(),
    coupangPath: detail.p,
    method: 'manual',
    confidence: 0.95,
  };
  if (existingIdx >= 0) data.details[existingIdx] = newD;
  else data.details.push(newD);
  applied++;
}

data.unmatched = (data.unmatched || []).filter(u => !data.map[u.id]);
data.stats.matched = Object.keys(data.map).length;
data.stats.unmatched = data.unmatched.length;
fs.writeFileSync(MAP_PATH, JSON.stringify(data, null, 2), 'utf8');

console.log('적용:', applied);
console.log('최종:', data.stats.matched + '/' + data.stats.totalNaver + ', 미매칭:', data.stats.unmatched);
