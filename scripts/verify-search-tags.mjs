/**
 * 쿠팡 검색어(searchTags) 빌더 검증.
 * ---------------------------------------------------------------------------
 * 쿠팡 검색은 카테고리·상품명·구매옵션·검색어 네 필드를 조합한다. searchTags 는
 * "상품명에 못 넣은 검색어"를 알고리즘에 추가로 인식시키는 유일한 수단(최대 20개)인데,
 * 지금까지 payload 에 이 필드가 아예 없었다.
 *
 * 지켜야 할 규칙:
 *   ① 상품명·카테고리에 이미 있는 단어는 넣지 않는다(중복은 낭비)
 *   ② 띄어쓰기 변형 중복 금지
 *   ③ 타사 브랜드명 금지 ← 가장 위험. 실제 연관검색어에 섞여 있다
 *   ④ 배송·과장·효능 주장 금지, 특수문자 금지
 *   ⑤ 최대 20개
 *
 * 실행: npx tsx scripts/verify-search-tags.mjs
 */
import { buildSearchTags } from '../src/lib/megaload/services/search-tags.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const BASE = {
  productName: '세라마이드 아토 수딩 젤 175ml 바디로션 대용량',
  categoryPath: '뷰티>바디>바디케어>바디로션',
  brand: '일리윤',
  sourceName: '일리윤 세라마이드 아토 수딩 젤 175ml 바디로션',
};
const run = (cands, over = {}) => buildSearchTags({ ...BASE, ...over, candidates: cands });

// ③ 타사 브랜드 — 반드시 차단
check('타사 브랜드 차단(세타필)', !run(['세타필바디로션']).includes('세타필바디로션'));
check('타사 브랜드 차단(존슨즈)', !run(['존슨즈 바디로션']).includes('존슨즈 바디로션'));
check('타사 브랜드 차단(한살림)', !run(['한살림 현미유']).includes('한살림 현미유'));
// 자사 브랜드는 허용(brand/sourceName 에 있으므로)
check('자사 브랜드는 허용', run(['일리윤수딩젤']).length === 1);

// ① 상품명·카테고리 중복 제외
check('상품명에 있는 말 제외', run(['바디로션']).length === 0);
check('카테고리에 있는 말 제외', run(['바디케어']).length === 0);

// ② 띄어쓰기 변형 중복
{
  const t = run(['향좋은 바디로션', '향좋은바디로션']);
  check('띄어쓰기 변형 중복 제거', t.length === 1, JSON.stringify(t));
}

// ④ 금지어
check('배송어 차단', run(['무료배송바디로션']).length === 0);
check('과장어 차단', run(['최저가바디로션']).length === 0);
check('효능 주장 차단', run(['아토피치료젤']).length === 0);
check('계정정지 위험어 차단(국산)', run(['국산바디로션']).length === 0);
check('특수문자 차단', run(['바디로션!!']).length === 0);

// 속성 합성어는 통과해야 한다(한국어는 합성어가 한 덩어리라 토큰 비교로는 못 가른다)
{
  const t = run(['고보습바디로션', '남자바디로션', '대용량바디로션', '선물용과일']);
  check('속성 합성어 통과', t.length >= 3, JSON.stringify(t));
}

// ⑤ 상한
{
  const many = Array.from({ length: 40 }, (_, i) => `대용량${i}바디로션`);
  check('최대 20개', run(many).length <= 20, `${run(many).length}개`);
}

console.log(failed === 0 ? '\n검색어 태그 검증 통과' : `\n실패 ${failed}건`);
process.exitCode = failed === 0 ? 0 : 1;
