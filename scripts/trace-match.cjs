const path = require('path');
const root = path.resolve(__dirname, '..');
const indexJson = require(path.join(root, 'src/lib/megaload/data/coupang-cat-index.json'));
const detailsJson = require(path.join(root, 'src/lib/megaload/data/coupang-cat-details.json'));

const NOISE_WORDS = new Set(['mg','mcg','iu','ml','g','kg','l','정','개','병','통','캡슐','포','박스','봉','팩','세트','매','장','알','ea','pcs','프리미엄','고함량','저분자','먹는','국내','해외','추천','인기','베스트','대용량','소용량','순수','천연','식물성','무료배송','당일발송','특가','할인','증정','사은품','리뷰이벤트','함유','효능','효과','예방','개선','상품상세참조','풍성한','new','box','haccp']);
const NOISE_PATTERNS = [/^\d+$/,/^\d+\+\d+$/,/^\d+(개월|일|주)분?$/,/^\d+(ml|g|kg|mg|l|ea)$/i,/^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/,/^\d+x\d+$/i,/^\d+%$/];

function clean(name) {
  let c = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  c = c.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const words = c.split(/\s+/).filter(Boolean);
  const seen = new Set(); const u = [];
  for (const w of words) { const l = w.toLowerCase(); if (!seen.has(l)) { seen.add(l); u.push(w); } }
  return u.join(' ');
}
function tokenize(name) {
  const cleaned = clean(name);
  const words = cleaned.split(/\s+/).map(w => w.toLowerCase());
  const result = [];
  for (const w of words) {
    if (w.length === 0) continue;
    if (w.length === 1) {
      if (/[가-힣]/.test(w)) result.push(w);
      else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length-1])) result[result.length-1] += w;
      continue;
    }
    if (NOISE_WORDS.has(w)) continue;
    if (NOISE_PATTERNS.some(p => p.test(w))) continue;
    result.push(w);
  }
  return result;
}

const TESTS = [
  '풋크림 30ml','풋샴푸 200ml','발마사지크림','족욕용솔트 500g','풋스프레이 100ml',
  '풋파일 발각질제거기','풋팩 힐패치','비타민C 1000mg 60정','오메가3 1000mg',
  '멀티비타민 미네랄 90정','유산균 프로바이오틱스 30포','루테인 지아잔틴 60캡슐',
  '밀크씨슬 60정','홍삼정 240g','발 보습 크림','발건강 영양제','콜라겐 분말',
];

function exactLeafCands(name) {
  const tokens = tokenize(name);
  const compounds = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) compounds.push(tokens[i]+tokens[i+1]);
  const cand = [];
  for (const e of indexJson) {
    const [code,,leafName] = e;
    const leafLower = leafName.toLowerCase();
    for (const t of compounds) {
      if (t.length >= 2 && t === leafLower) {
        cand.push({ code, leaf: leafName, path: detailsJson[code]?.p || '?', token: t });
        break;
      }
    }
  }
  return { tokens, compounds, cand };
}

for (const n of TESTS) {
  console.log('\n=== ' + n + ' ===');
  const r = exactLeafCands(n);
  console.log('tokens:', JSON.stringify(r.tokens));
  console.log('compounds:', JSON.stringify(r.compounds));
  console.log('exact-leaf cand (' + r.cand.length + '):');
  r.cand.slice(0, 10).forEach(c => console.log('  [' + c.token + '] -> ' + c.path));
}
