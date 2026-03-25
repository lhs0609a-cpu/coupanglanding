// 카테고리 매칭 종합 테스트 — 전체 소분류 × 30개 상품명
// Tier 0 (voteTier0) + MODIFIER_TOKENS 음성/양성 검증
'use strict';

const path = require('path');
const indexJson = require(path.join(__dirname, '../src/lib/megaload/data/coupang-cat-index.json'));

// ═══ Constants (from category-matcher.ts) ═══

const NOISE_WORDS = new Set([
  'mg','mcg','iu','ml','g','kg','l',
  '정','개','병','통','캡슐','포','박스','봉','팩','세트','매','장','알','ea','pcs',
  '프리미엄','고함량','저분자','먹는','국내','해외',
  '추천','인기','베스트','대용량','소용량','순수','천연','식물성',
  '무료배송','당일발송','특가','할인','증정','사은품','리뷰이벤트',
  '함유','효능','효과','예방','개선','상품상세참조','풍성한',
  'new','box','haccp',
]);
const NOISE_PATTERNS = [
  /^\d+$/,/^\d+\+\d+$/,/^\d+(개월|일|주)분?$/,
  /^\d+(ml|g|kg|mg|l|ea)$/i,
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/,
  /^\d+x\d+$/i,/^\d+%$/,
];

const DIRECT_CODE_MAP = {
  '비오틴':{code:'73132',path:'식품>건강식품>비타민/미네랄>바이오틴'},
  '바이오틴':{code:'73132',path:'식품>건강식품>비타민/미네랄>바이오틴'},
  '비타민a':{code:'58907',path:'식품>건강식품>비타민/미네랄>비타민A'},
  '비타민b':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  '비타민b군':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  '비타민c':{code:'58909',path:'식품>건강식품>비타민/미네랄>비타민C'},
  '비타민d':{code:'58910',path:'식품>건강식품>비타민/미네랄>비타민D'},
  '비타민e':{code:'58911',path:'식품>건강식품>비타민/미네랄>비타민E'},
  '비타민k':{code:'58912',path:'식품>건강식품>비타민/미네랄>비타민K'},
  '멀티비타민':{code:'58913',path:'식품>건강식품>비타민/미네랄>멀티비타민'},
  '종합비타민':{code:'58913',path:'식품>건강식품>비타민/미네랄>멀티비타민'},
  '마그네슘':{code:'58931',path:'식품>건강식품>비타민/미네랄>마그네슘'},
  '아연':{code:'58930',path:'식품>건강식품>비타민/미네랄>아연'},
  '셀레늄':{code:'58934',path:'식품>건강식품>비타민/미네랄>셀레늄'},
  '엽산':{code:'102535',path:'식품>건강식품>비타민/미네랄>엽산'},
  '철분':{code:'58922',path:'식품>건강식품>비타민/미네랄>철분'},
  '칼슘':{code:'58921',path:'식품>건강식품>비타민/미네랄>칼슘'},
  '요오드':{code:'58933',path:'식품>건강식품>비타민/미네랄>요오드'},
  '크롬':{code:'102536',path:'식품>건강식품>비타민/미네랄>크롬'},
  '오메가3':{code:'73134',path:'식품>건강식품>기타건강식품>오메가3,6,9'},
  '오메가':{code:'73134',path:'식품>건강식품>기타건강식품>오메가3,6,9'},
  '밀크씨슬':{code:'58926',path:'식품>건강식품>기타건강식품>밀크시슬'},
  '밀크시슬':{code:'58926',path:'식품>건강식품>기타건강식품>밀크시슬'},
  '루테인':{code:'58920',path:'식품>건강식품>기타건강식품>루테인'},
  '유산균':{code:'58991',path:'식품>건강식품>기타건강식품>유산균'},
  '프로바이오틱스':{code:'58991',path:'식품>건강식품>기타건강식품>유산균'},
  '프로바이오틱':{code:'58991',path:'식품>건강식품>기타건강식품>유산균'},
  '락토바실러스':{code:'58991',path:'식품>건강식품>기타건강식품>유산균'},
  '글루코사민':{code:'58927',path:'식품>건강식품>기타건강식품>글루코사민'},
  '콜라겐':{code:'59163',path:'식품>건강식품>기타건강식품>콜라겐/히알루론산'},
  '히알루론산':{code:'59163',path:'식품>건강식품>기타건강식품>콜라겐/히알루론산'},
  '코큐텐':{code:'58972',path:'식품>건강식품>기타건강식품>코엔자임Q10/코큐텐'},
  '코엔자임':{code:'58972',path:'식품>건강식품>기타건강식품>코엔자임Q10/코큐텐'},
  '프로폴리스':{code:'58905',path:'식품>건강식품>기타건강식품>프로폴리스'},
  '스피루리나':{code:'58902',path:'식품>건강식품>기타건강식품>스피루리나'},
  '클로렐라':{code:'58901',path:'식품>건강식품>기타건강식품>클로렐라'},
  '쏘팔메토':{code:'58924',path:'식품>건강식품>기타건강식품>쏘팔메토'},
  '마카':{code:'102530',path:'식품>건강식품>기타건강식품>마카'},
  '보스웰리아':{code:'112304',path:'식품>건강식품>기타건강식품>보스웰리아'},
  '크릴오일':{code:'112307',path:'식품>건강식품>기타건강식품>크릴오일'},
  '폴리코사놀':{code:'58929',path:'식품>건강식품>기타건강식품>폴리코사놀'},
  '알로에':{code:'58938',path:'식품>건강식품>기타건강식품>알로에정/알로에겔'},
  '토코페롤':{code:'58982',path:'식품>건강식품>기타건강식품>토코페롤'},
  '맥주효모':{code:'73132',path:'식품>건강식품>비타민/미네랄>바이오틴'},
  '감마리놀렌산':{code:'58925',path:'식품>건강식품>기타건강식품>감마리놀렌산'},
  '초록입홍합':{code:'112306',path:'식품>건강식품>기타건강식품>초록입홍합'},
  '레시틴':{code:'102522',path:'식품>건강식품>기타건강식품>레시틴'},
  '레스베라트롤':{code:'102519',path:'식품>건강식품>기타건강식품>레스베라트롤'},
  '홍삼':{code:'58889',path:'식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정'},
  '홍삼정':{code:'58889',path:'식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정'},
  '프로틴':{code:'73141',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더'},
  '프로틴파우더':{code:'73141',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더'},
  '크레아틴':{code:'73145',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>크레아틴'},
  '아르기닌':{code:'102545',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>L-아르기닌'},
  '가르시니아':{code:'102537',path:'식품>건강식품>헬스/다이어트식품>가르시니아'},
  'bcaa':{code:'102541',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>BCAA'},
  '타우린':{code:'102542',path:'식품>건강식품>헬스/다이어트식품>헬스보충식품>타우린'},
  '화장지':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '휴지':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '주방세제':{code:'63961',path:'생활용품>세제>주방세제>일반주방세제'},
  '섬유유연제':{code:'63950',path:'생활용품>세제>섬유유연제>일반 섬유유연제'},
  '와이퍼':{code:'78710',path:'자동차용품>실외용품>와이퍼>플랫와이퍼'},
  '접이식테이블':{code:'77950',path:'가구>주방가구>식탁테이블>접이식식탁'},
  '접이식':{code:'77950',path:'가구>주방가구>식탁테이블>접이식식탁'},
  '꿀':{code:'58900',path:'식품>가공즉석식품>시럽>일반꿀'},
  '벌꿀':{code:'58900',path:'식품>가공즉석식품>시럽>일반꿀'},
  '충전케이블':{code:'62691',path:'가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블'},
  '데이터케이블':{code:'62691',path:'가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블'},
  '레티놀':{code:'56171',path:'뷰티>스킨>에센스/세럼/앰플>에센스/세럼'},
  '넥크림':{code:'56169',path:'뷰티>스킨>크림>넥크림'},
  '넥케어':{code:'56169',path:'뷰티>스킨>크림>넥크림'},
  '목크림':{code:'56169',path:'뷰티>스킨>크림>넥크림'},
  '바디워시':{code:'56213',path:'뷰티>바디>샤워/입욕용품>바디워시'},
  '바디로션':{code:'56222',path:'뷰티>바디>바디케어>바디로션'},
  '바디크림':{code:'56223',path:'뷰티>바디>바디케어>바디크림'},
  '바디오일':{code:'56224',path:'뷰티>바디>바디케어>바디오일'},
  '바디미스트':{code:'56226',path:'뷰티>바디>바디케어>바디미스트'},
  '바디스크럽':{code:'56214',path:'뷰티>바디>샤워/입욕용품>바디스크럽'},
  '핸드크림':{code:'56236',path:'뷰티>바디>핸드/풋 케어>핸드케어>핸드크림'},
  '핸드워시':{code:'56234',path:'뷰티>바디>핸드/풋 케어>핸드케어>핸드워시'},
  '샴푸':{code:'56280',path:'뷰티>헤어>샴푸>일반샴푸'},
  '아이크림':{code:'56168',path:'뷰티>스킨>크림>아이크림'},
  '선크림':{code:'56196',path:'뷰티>스킨>선케어/태닝>선블록/선크림/선로션'},
  '자외선차단':{code:'56196',path:'뷰티>스킨>선케어/태닝>선블록/선크림/선로션'},
  '선블록':{code:'56196',path:'뷰티>스킨>선케어/태닝>선블록/선크림/선로션'},
  '립스틱':{code:'56429',path:'뷰티>메이크업>립메이크업>립스틱'},
  '립틴트':{code:'56428',path:'뷰티>메이크업>립메이크업>립틴트'},
  '치약':{code:'63981',path:'생활용품>구강/면도>치약'},
  '칫솔':{code:'63982',path:'생활용품>구강/면도>칫솔'},
  'vitamin':{code:'58913',path:'식품>건강식품>비타민/미네랄>멀티비타민'},
  'vitaminc':{code:'58909',path:'식품>건강식품>비타민/미네랄>비타민C'},
  'vitamind':{code:'58910',path:'식품>건강식품>비타민/미네랄>비타민D'},
  'omega':{code:'73134',path:'식품>건강식품>기타건강식품>오메가3,6,9'},
  'lutein':{code:'58920',path:'식품>건강식품>기타건강식품>루테인'},
  'probiotics':{code:'58991',path:'식품>건강식품>기타건강식품>유산균'},
  'collagen':{code:'59163',path:'식품>건강식품>기타건강식품>콜라겐/히알루론산'},
  'retinol':{code:'56171',path:'뷰티>스킨>에센스/세럼/앰플>에센스/세럼'},
  '비타민d3':{code:'58910',path:'식품>건강식품>비타민/미네랄>비타민D'},
  '비타민b2':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  '비타민b6':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  '비타민b12':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  '오메가369':{code:'73134',path:'식품>건강식품>기타건강식품>오메가3,6,9'},
  '롤화장지':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '롤휴지':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '두루마리':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '미용티슈':{code:'63900',path:'생활용품>화장지물티슈>일반롤화장지'},
  '루테인지아잔틴':{code:'58920',path:'식품>건강식품>기타건강식품>루테인'},
  '비타민b컴플렉스':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  'vitamina':{code:'58907',path:'식품>건강식품>비타민/미네랄>비타민A'},
  'vitaminb':{code:'58908',path:'식품>건강식품>비타민/미네랄>비타민B군'},
  'vitamind3':{code:'58910',path:'식품>건강식품>비타민/미네랄>비타민D'},
  'vitamine':{code:'58911',path:'식품>건강식품>비타민/미네랄>비타민E'},
  'vitamink':{code:'58912',path:'식품>건강식품>비타민/미네랄>비타민K'},
};

const SYNONYM_MAP = {
  '선크림':['선크림','선로션','자외선차단'],
  '레티놀':['레티놀','주름개선','에센스','세럼'],
  '넥케어':['넥케어','넥크림','목크림'],'넥크림':['넥크림','넥케어','목크림'],
  '목크림':['목크림','넥크림','넥케어'],
  '비오틴':['비오틴','바이오틴'],'바이오틴':['바이오틴','비오틴'],
  '비타민b':['비타민b','비타민b군'],
  '오메가3':['오메가3','오메가3지방산','오메가'],
  '프로바이오틱스':['프로바이오틱스','유산균'],
  '유산균':['유산균','프로바이오틱스'],
  '프로바이오틱':['프로바이오틱','프로바이오틱스','유산균'],
  '락토바실러스':['락토바실러스','유산균','프로바이오틱스'],
  '종합비타민':['종합비타민','멀티비타민'],'멀티비타민':['멀티비타민','종합비타민'],
  '콜라겐':['콜라겐','히알루론산','피쉬콜라겐'],
  '밀크씨슬':['밀크씨슬','밀크시슬','간건강'],
  '프로틴':['프로틴','프로틴파우더'],
  '코큐텐':['코큐텐','코엔자임q10','코엔자임'],
  '코엔자임':['코엔자임','코큐텐','코엔자임q10'],
  '맥주효모':['맥주효모','바이오틴','비오틴'],
  '꿀':['벌꿀','꿀','일반꿀','아카시아꿀'],
  '화장지':['화장지','두루마리','롤화장지'],
  '휴지':['화장지','휴지','두루마리','롤화장지'],
  '주방세제':['주방세제','식기세척','일반주방세제'],
  '섬유유연제':['섬유유연제','유연제','일반섬유유연제'],
  '충전케이블':['충전케이블','데이터케이블','충전'],
  '와이퍼':['와이퍼','와이퍼블레이드','플랫와이퍼'],
};

const PRODUCT_TO_CATEGORY_ALIAS = {
  '비오틴':['바이오틴'],'맥주효모':['바이오틴'],'밀크씨슬':['밀크시슬'],
  '코큐텐':['코엔자임q10'],'코엔자임q10':['코큐텐'],
  '프로바이오틱스':['유산균'],'락토바실러스':['유산균'],'락토바실루스':['유산균'],
  '멀티비타민':['종합비타민'],'종합비타민':['멀티비타민'],
  '히알루론산':['콜라겐'],'피쉬콜라겐':['콜라겐'],
  '넥케어':['넥크림'],'목크림':['넥크림'],'목주름':['넥크림'],
};

const MODIFIER_TOKENS = new Set([
  '이탈리아','일본','중국','프랑스','독일','미국','영국',
  '호주','스페인','인도','태국','베트남','대만','캐나다',
  '스위스','네덜란드','터키','그리스','러시아','브라질',
  '멕시코','유럽','아시아','아프리카','남미','북미',
  '하와이','발리','괌','사이판','오세아니아',
  '레드','블루','그린','블랙','화이트','핑크','골드','실버',
  '업소용','가정용','산업용','건식','습식',
]);

// ═══ Core Functions ═══

function cleanProductName(name) {
  let c = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ').replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const words = c.split(/\s+/).filter(Boolean);
  const seen = new Set(); const unique = [];
  for (const w of words) { const l = w.toLowerCase(); if (!seen.has(l)) { seen.add(l); unique.push(w); } }
  return unique.join(' ');
}

function tokenize(name) {
  const words = cleanProductName(name).split(/\s+/).map(w => w.toLowerCase());
  const r = [];
  for (const w of words) {
    if (!w.length) continue;
    if (w.length === 1) {
      if (/[가-힣]/.test(w)) r.push(w);
      else if (/[a-z]/.test(w) && r.length > 0 && /^[a-z]+$/.test(r[r.length-1])) r[r.length-1] += w;
      continue;
    }
    if (NOISE_WORDS.has(w) || NOISE_PATTERNS.some(p => p.test(w))) continue;
    r.push(w);
  }
  return r;
}

function buildCompoundTokens(tokens) {
  const c = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) c.push(tokens[i] + tokens[i+1]);
  const e = [...c];
  for (const t of c) { const s = SYNONYM_MAP[t]; if (s) for (const x of s) if (!e.includes(x)) e.push(x); }
  const a = [...e];
  for (const t of e) { const al = PRODUCT_TO_CATEGORY_ALIAS[t]; if (al) for (const x of al) if (!a.includes(x)) a.push(x); }
  return a;
}

function voteTier0(candidates) {
  const votes = new Map();
  for (const t of candidates) {
    const d = DIRECT_CODE_MAP[t]; if (!d) continue;
    const ex = votes.get(d.code);
    if (ex) { ex.count++; ex.longest = Math.max(ex.longest, t.length); }
    else votes.set(d.code, { entry: d, count: 1, longest: t.length });
  }
  if (votes.size === 0) return null;
  const best = [...votes.values()].sort((a,b) => b.count-a.count || b.longest-a.longest)[0];
  return { code: best.entry.code, path: best.entry.path };
}

function matchLocal(productName) {
  const tokens = tokenize(productName);
  const compounds = buildCompoundTokens(tokens);
  const base = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) base.push(tokens[i]+tokens[i+1]);
  const baseSet = new Set(base);
  const all = [...base, ...compounds.filter(t => !baseSet.has(t))];
  const t0 = voteTier0(all);
  if (t0) return { ...t0, tier: 'T0', tokens };
  // Tier 1: localMatch (simplified for test)
  return { code: null, tier: 'MISS', tokens };
}

// ═══ Test Data Generator ═══

const BRANDS_H = ['종근당','고려은단','뉴트리원','대웅제약','녹십자','GNC','NOW','솔가','네이처메이드','닥터스베스트','JW중외','한미약품','광동제약','뉴트리코어','재로우'];
const BRANDS_B = ['이니스프리','닥터자르트','라로슈포제','토니모리','미샤','더페이스샵','코스알엑스','해피바스','뉴트로지나','세타필','아모레','LG생활건강','마몽드','라네즈','설화수'];
const BRANDS_L = ['깨끗한나라','유한킴벌리','쌍용','코멧','피죤','다우니','샤프란','CJ라이온','불스원','3M','보쉬','레인엑스','퍼실','아이깨끗해','엘지'];
const COUNTRIES = ['이탈리아','프랑스','독일','미국','영국','호주','스위스','일본','캐나다','스페인'];
const MODS_H = ['고함량','저분자','프리미엄','유기농','식물성','순수','고순도','초임계','GMP','HACCP','특허','활성형'];
const MODS_B = ['프리미엄','수분','촉촉','저자극','약산성','비건','무향','진정','민감성','산뜻한','자연유래','고보습'];
const SPECS = ['100mg','250mg','300mg','500mg','600mg','800mg','1000mg','1500mg','2000mg','3000mg'];
const CNTS = ['30정','60정','90정','120정','180정','240정','60캡슐','90캡슐','120캡슐','30포','60포','90포'];
const VOLS = ['30ml','50ml','80ml','100ml','150ml','200ml','250ml','300ml','500ml','1000ml'];
const VOLS_L = ['500ml','750ml','1L','1.5L','2L','2.5L','3L','3.2L','5L'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function gen(kw, catPath, n) {
  const d = catPath.includes('건강') || catPath.includes('식품') ? 'H' : catPath.includes('뷰티') || catPath.includes('바디') || catPath.includes('헤어') || catPath.includes('스킨') || catPath.includes('메이크업') ? 'B' : 'L';
  const br = d==='H'?BRANDS_H:d==='B'?BRANDS_B:BRANDS_L;
  const mo = d==='H'?MODS_H:MODS_B;
  const isEn = /^[a-z]+$/.test(kw);
  const names = [];
  const templates = [
    () => `${pick(br)} ${kw} ${d==='H'?pick(SPECS):''} ${d==='H'?pick(CNTS):d==='B'?pick(VOLS):pick(VOLS_L)}`,
    () => `${kw} ${pick(br)} ${pick(mo)} ${d==='H'?pick(CNTS):d==='B'?pick(VOLS):pick(VOLS_L)}`,
    () => `${pick(COUNTRIES)} ${pick(br)} ${kw} ${pick(mo)}`,
    () => `${pick(COUNTRIES)}산 ${kw} ${pick(br)} ${d==='H'?pick(SPECS):''}`,
    () => `${pick(br)} ${pick(mo)} ${kw} ${d==='H'?pick(CNTS):d==='B'?pick(VOLS):pick(VOLS_L)}`,
    () => `[${pick(br)}] ${kw} ${pick(mo)} ${d==='H'?pick(SPECS)+' '+pick(CNTS):pick(VOLS)}`,
    () => `${kw} ${pick(mo)} ${pick(mo)} ${d==='H'?pick(CNTS):''}`,
    () => `${pick(br)} ${pick(COUNTRIES)} ${kw} ${d==='H'?pick(SPECS):''}`,
    () => `${pick(br)} ${kw} 1+1 ${pick(mo)}`,
    () => `${kw} ${d==='H'?pick(SPECS)+' '+pick(CNTS):pick(VOLS)} ${pick(mo)}`,
    () => `${pick(COUNTRIES)} ${pick(COUNTRIES)} ${kw} ${pick(br)}`,
    () => `${pick(br)} ${pick(mo)} ${d==='H'?pick(SPECS)+' ':''} ${kw}`,
    () => `${kw} 어린이용 ${pick(br)} ${d==='H'?pick(CNTS):pick(VOLS)}`,
    () => `NOW Foods ${kw} ${d==='H'?pick(SPECS)+' '+pick(CNTS):''}`,
    () => `${kw} ${pick(br)} 특가 무료배송`,
    () => `${pick(br)} ${pick(mo)} ${kw} ${pick(mo)} ${d==='H'?pick(CNTS):pick(VOLS)}`,
    () => `${pick(br)} 정품 ${kw} ${d==='H'?pick(SPECS):''}`,
    () => `${kw} ${pick(br)} 베스트 인기 ${d==='H'?pick(CNTS):pick(VOLS)}`,
    () => `${pick(COUNTRIES)} 직수입 ${kw} ${pick(br)} ${pick(mo)}`,
    () => `${pick(br)} ${kw} 리필 ${d==='L'?pick(VOLS_L):d==='B'?pick(VOLS):''}`,
    () => `${kw} 더블 ${pick(br)} ${d==='H'?pick(CNTS):pick(VOLS)}`,
    () => `최고급 ${pick(COUNTRIES)}산 ${kw} ${pick(br)}`,
    () => `${pick(br)} ${kw} 가족용 ${d==='H'?pick(CNTS):''}`,
    () => `${kw} ${pick(br)} 선물 ${pick(mo)}`,
    () => `${pick(br)} ${kw} ${pick(mo)} 세트`,
    () => `${pick(COUNTRIES)} 유기농 인증 ${kw} ${pick(br)}`,
    () => `${pick(br)} 고급 ${kw} ${d==='H'?pick(SPECS)+' '+pick(CNTS):pick(VOLS)}`,
    () => `${kw} ${pick(mo)} ${pick(br)} 당일발송`,
    () => `${pick(br)} 건강기능식품 ${kw} ${d==='H'?pick(CNTS):''}`,
    () => `${kw} ${d==='H'?pick(SPECS):''} ${pick(br)} 추천`,
  ];
  for (let i = 0; i < n; i++) names.push(templates[i % templates.length]().replace(/\s+/g,' ').trim());
  return names;
}

// ═══ MODIFIER_TOKENS Tests ═══

function testModifierNegative() {
  console.log('\n  == MODIFIER_TOKENS 음성 테스트 (지명이 여행 카테고리로 빠지면 안됨) ==\n');
  const cases = [
    '바디워시 이탈리아 150년 유기농 알로에베라앤레몬 바이오 명품 2개 500ml',
    '프랑스산 유기농 바디로션 시어버터 300ml',
    '독일 프리미엄 핸드크림 카모마일 50ml',
    '이탈리아 명품 바디오일 아르간 200ml',
    '스위스 천연 아이크림 줄기세포 30ml',
    '일본 프리미엄 샴푸 동백오일 500ml',
    '호주산 유기농 선크림 SPF50 50ml',
    '미국 대용량 섬유유연제 라벤더 3L',
    '영국 프리미엄 치약 민트 150g',
    '프랑스 고급 립스틱 매트 3.5g',
    '이탈리아 유기농 마그네슘 400mg 120정',
    '독일산 비타민C 1000mg 프리미엄 60정',
    '프랑스 오메가3 rTG 1000mg 180캡슐',
    '스위스 프로바이오틱스 100억 유산균 60캡슐',
    '미국산 콜라겐 저분자 펩타이드 300g',
  ];
  let pass = 0;
  for (const name of cases) {
    const r = matchLocal(name);
    // 여행 카테고리 코드 확인 — 도서/여행이 path에 있으면 안됨
    const isBad = r.code && (r.path || '').includes('여행');
    if (isBad) {
      console.log(`    FAIL "${name.substring(0,50)}" => ${r.path}`);
    } else {
      console.log(`    PASS "${name.substring(0,50)}" => ${r.code||'(T1대기)'} [${r.tier}]`);
      pass++;
    }
  }
  console.log(`\n    결과: ${pass}/${cases.length}`);
  return { pass, total: cases.length };
}

function testModifierPositive() {
  console.log('\n  == MODIFIER_TOKENS 양성 테스트 (여행 상품 → 여행 매칭 유지 확인) ==\n');
  // 이건 Tier1(localMatch)에서 잡히는 케이스 — Tier0엔 해당 없음
  // localMatch가 올바른 score를 주는지 직접 확인
  const compoundSet = (tokens) => new Set(buildCompoundTokens(tokens));
  const cases = ['이탈리아 여행 가이드북','프랑스 여행 에세이 파리','일본 여행 도쿄 오사카 가이드'];
  let pass = 0;
  for (const name of cases) {
    const tokens = tokenize(name);
    const cs = buildCompoundTokens(tokens);
    const cSet = new Set(cs);
    const mSet = new Set(tokens.filter(t => t.length >= 2));
    // 여행 관련 인덱스 엔트리 찾기
    let bestTravel = null;
    for (const entry of indexJson) {
      const [code, catTokensStr, leafName, depth] = entry;
      if (!catTokensStr.includes('여행')) continue;
      const catTokenList = catTokensStr.split(' ');
      const leafLower = leafName.toLowerCase();
      let score = 0, leafScore = 0;
      for (const t of cs) { if (t.length >= 2 && t === leafLower) { leafScore = MODIFIER_TOKENS.has(t)?3:20; break; } }
      score += leafScore;
      if (leafScore > 0) {
        const idx = tokens.findIndex(t => t===leafLower||leafLower.includes(t));
        if (idx===0) score+=5; else if (idx===1) score+=3;
      }
      let matched = 0;
      for (const ct of catTokenList) { if (cSet.has(ct)||mSet.has(ct)) { score+=3; matched++; } }
      if (matched>=4) score+=25; else if (matched>=3) score+=18; else if (matched>=2) score+=10;
      if (catTokenList.length>0&&matched>0) score+=Math.round((matched/catTokenList.length)*5);
      if (leafScore>0&&matched<=1) score-=depth>=4?8:5;
      if (matched>=2) score+=Math.round(depth*0.5);
      if (!bestTravel || score > bestTravel.score) bestTravel = { entry, score };
    }
    if (bestTravel && bestTravel.score >= 12) {
      console.log(`    PASS "${name}" => score=${bestTravel.score} (${bestTravel.entry[2]}) >= threshold(12)`);
      pass++;
    } else {
      console.log(`    FAIL "${name}" => score=${bestTravel?.score||0} < threshold(12)`);
    }
  }
  console.log(`\n    결과: ${pass}/${cases.length}`);
  return { pass, total: cases.length };
}

// ═══ Main ═══

function main() {
  console.log('='.repeat(70));
  console.log('  카테고리 매칭 종합 테스트 — 전체 소분류 x 30개 상품명');
  console.log('='.repeat(70));

  // Group by unique code
  const groups = new Map();
  for (const [kw, val] of Object.entries(DIRECT_CODE_MAP)) {
    const g = groups.get(val.code);
    if (g) g.keywords.push(kw);
    else groups.set(val.code, { path: val.path, keywords: [kw] });
  }

  console.log(`\n  소분류 ${groups.size}개 x 30개 = ${groups.size * 30}개 테스트\n`);

  let totalPass = 0, totalFail = 0, totalTests = 0;
  const failCats = [];

  for (const [code, { path: catPath, keywords }] of groups) {
    // 가장 긴 한글 키워드를 primary로 사용
    const korKws = keywords.filter(k => /[가-힣]/.test(k));
    const primary = korKws.sort((a,b) => b.length-a.length)[0] || keywords[0];
    const names = gen(primary, catPath, 30);
    let catPass = 0;
    const fails = [];

    for (const name of names) {
      totalTests++;
      const r = matchLocal(name);
      if (r.code === code) { catPass++; totalPass++; }
      else { totalFail++; fails.push({ name, got: r.code, tier: r.tier, tokens: r.tokens }); }
    }

    const catName = catPath.split('>').slice(-1)[0];
    const status = fails.length === 0 ? 'OK' : 'FAIL';
    console.log(`  ${status.padEnd(4)} [${code}] ${catPath.padEnd(58)} ${catPass}/30  (${primary})`);

    if (fails.length > 0) {
      failCats.push({ code, catPath, primary, fails });
      for (const f of fails.slice(0, 2)) {
        console.log(`        X "${f.name.substring(0,55)}" => ${f.got||'null'} [${f.tier}] tokens=[${f.tokens.join(',')}]`);
      }
      if (fails.length > 2) console.log(`        ... 외 ${fails.length-2}건`);
    }
  }

  // MODIFIER tests
  const neg = testModifierNegative();
  const pos = testModifierPositive();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  최종 결과');
  console.log('='.repeat(70));
  console.log(`  Tier0 매칭:       ${totalPass}/${totalTests} (${(totalPass/totalTests*100).toFixed(1)}%)`);
  console.log(`  수식어 음성:      ${neg.pass}/${neg.total}`);
  console.log(`  수식어 양성:      ${pos.pass}/${pos.total}`);
  const grand = totalPass + neg.pass + pos.pass;
  const grandT = totalTests + neg.total + pos.total;
  console.log(`  종합:             ${grand}/${grandT} (${(grand/grandT*100).toFixed(1)}%)`);
  console.log(totalFail===0&&neg.pass===neg.total&&pos.pass===pos.total ? '\n  *** ALL TESTS PASSED ***' : '\n  !!! FAILURES DETECTED !!!');

  if (failCats.length > 0) {
    console.log('\n  -- 실패 상세 --');
    for (const d of failCats) {
      console.log(`\n  [${d.code}] ${d.catPath} (${d.primary}) - ${d.fails.length}건:`);
      for (const f of d.fails) {
        console.log(`    "${f.name}"`);
        console.log(`      tokens=[${f.tokens.join(', ')}] => ${f.got||'null'} [${f.tier}]`);
      }
    }
  }
}

main();
