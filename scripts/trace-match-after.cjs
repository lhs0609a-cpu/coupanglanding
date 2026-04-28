const path = require('path');
const root = path.resolve(__dirname, '..');
const indexJson = require(path.join(root, 'src/lib/megaload/data/coupang-cat-index.json'));
const detailsJson = require(path.join(root, 'src/lib/megaload/data/coupang-cat-details.json'));

// 테스트: 가드 강화 후 leaf만 부분매칭으로 패션 leaf로 빠지는지 시뮬레이션
// (단순화: 패션 카테고리 leaf 부분매칭 후보들을 찾아 토큰 검사)
const BEAUTY_FOOD_TOKENS = [
  '크림','로션','세럼','에센스','앰플','토너','스킨','미스트','클렌저','클렌징',
  '마스크팩','시트마스크','선크림','핸드크림','풋크림','바디로션',
  '샴푸','린스','컨디셔너','트리트먼트','바디워시','폼클렌징',
  '비타민','영양제','오메가','홍삼','유산균','프로바이오틱스','콜라겐',
  '루테인','밀크씨슬','글루코사민','쏘팔메토','코큐텐','코엔자임','크릴오일',
  '비오틴','바이오틴','아연','마그네슘','칼슘','철분','엽산','셀레늄',
  '프로폴리스','스피루리나','클로렐라','알로에','히알루론산',
];

function tokenize(name) {
  return name.toLowerCase()
    .replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !/^\d+(ml|g|kg|mg|개|정|캡슐|포)?$/.test(w));
}

function hasBeautyFoodToken(tokens) {
  return tokens.some(t => BEAUTY_FOOD_TOKENS.some(k => t === k || t.includes(k)));
}

// 시뮬레이션: 풋케어/건기식 상품명이 패션 leaf와 부분매칭되더라도 가드에 의해 차단되는지 확인
const TESTS = [
  { name: '풋크림 30ml', expectGuard: true },
  { name: '풋샴푸 200ml', expectGuard: true },
  { name: '발마사지 크림', expectGuard: true },
  { name: '족욕용 솔트', expectGuard: false }, // 솔트는 토큰리스트 없음
  { name: '비타민C 1000mg 60정', expectGuard: true },
  { name: '오메가3 1000mg', expectGuard: true },
  { name: '핸드크림', expectGuard: true },
  { name: '남성 카디건', expectGuard: false }, // 진짜 패션
  { name: '여성 운동화', expectGuard: false },
  { name: '비오틴 90정', expectGuard: true },
  { name: '루테인 60캡슐', expectGuard: true },
  { name: '콜라겐 분말', expectGuard: true },
  { name: '바디로션 500ml', expectGuard: true },
];

let pass = 0, fail = 0;
console.log('=== 뷰티/식품 토큰 → 패션 leaf 차단 가드 테스트 ===\n');
for (const t of TESTS) {
  const tokens = tokenize(t.name);
  const guarded = hasBeautyFoodToken(tokens);
  const ok = guarded === t.expectGuard;
  if (ok) {
    console.log('✓ ' + t.name + ' [tokens=' + JSON.stringify(tokens) + ', guarded=' + guarded + ']');
    pass++;
  } else {
    console.log('✗ ' + t.name);
    console.log('  expected guarded=' + t.expectGuard + ', got=' + guarded);
    console.log('  tokens=' + JSON.stringify(tokens));
    fail++;
  }
}
console.log('\n--- ' + pass + '/' + (pass+fail) + ' 통과 ---');
process.exit(fail > 0 ? 1 : 0);
