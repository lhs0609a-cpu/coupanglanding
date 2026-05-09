/**
 * demo-by-category.mjs
 *
 * 다양한 L1 카테고리의 대표 leaf를 선정해 노출명 생성 + 메타정보 표시.
 * 사용자에게 "어떻게 SEO 매칭되었는지" 보여주는 시연용.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dn = await import('../.build-test/lib/megaload/services/display-name-generator.js');
const gz = await import('../.build-test/lib/megaload/services/mobile-golden-zone.js');
const v2r = await import('../.build-test/lib/megaload/services/v2-pool-resolver.js');
const car = await import('../.build-test/lib/megaload/services/category-attribute-resolver.js');
const { generateDisplayName } = dn;
const { auditGoldenZone } = gz;
const { getV2Pool, getDataQuality } = v2r;
const { resolveCategoryAttributes } = car;

const COUPANG_DETAILS_PATH = join(__dirname, '..', 'src', 'lib', 'megaload', 'data', 'coupang-cat-details.json');
const coupangDetails = JSON.parse(readFileSync(COUPANG_DETAILS_PATH, 'utf8'));

// 다양한 L1에서 대표 카테고리 선정
const SAMPLES = [
  // 식품 — 신선/가공/건강식품
  { path: '식품>건강식품>건강식품>비타민/미네랄>비타민C', input: '슈퍼비타민샵 비타민C 1000mg 90정 30일분 무첨가' },
  { path: '식품>축산물>국내산소고기/한우>한우 등심/안심', input: '한우공장 1++한우 등심 500g 냉장 산지직송 선물용' },
  { path: '식품>신선식품>과일류>과일>사과', input: '청송농가 부사 사과 5kg 못난이 가정용' },
  { path: '식품>가공/즉석식품>라면/면류>봉지라면', input: '★특가★ 신라면 5봉 무료배송 핫딜' },

  // 뷰티
  { path: '뷰티>스킨>크림>아이크림', input: '닥터케어 아이크림 50ml 보습 주름개선 비건' },
  { path: '뷰티>메이크업>베이스메이크업>BB크림', input: '한혜진 추천 BB크림 SPF50 50ml 커버력' },
  { path: '뷰티>헤어/바디>샴푸/린스/트리트먼트>샴푸', input: '내츄럴샵 두피케어 약산성 샴푸 500ml 탈모 예방' },

  // 가전/디지털
  { path: '가전/디지털>휴대폰/태블릿PC/액세서리>배터리/충전기>케이블/충전기>충전기>무선충전기', input: '프라임샵 무선충전기 15W 고속 갤럭시 호환' },
  { path: '가전/디지털>냉장고/밥솥/주방가전>커피메이커/머신>전자동머신', input: '하이퀄리티 전자동 에스프레소머신 가정용 자동분쇄' },
  { path: '가전/디지털>컴퓨터/게임/SW>저장장치>외장하드/NAS>외장하드>3.5인치', input: '스마일몰 3.5인치 외장하드 4TB USB3.0' },

  // 패션
  { path: '패션의류잡화>여성패션>여성의류>아우터>패딩/다운', input: '베스트셀러 여성 롱패딩 구스다운 100% 겨울 화이트' },
  { path: '패션의류잡화>남성패션>남성의류>티셔츠/탱크탑>긴팔티셔츠', input: '코리아몰 남성 긴팔티셔츠 면 100% 베이직 블랙' },

  // 출산/유아동
  { path: '출산/유아동>분유/이유식/간식>이유식>이유식', input: '오가닉 유기농 이유식 6개월 단계별 무첨가' },
  { path: '출산/유아동>기저귀/교체용품>기저귀>일회용기저귀', input: '베스트셀러 일회용기저귀 신생아 흡수력 무형광 100매' },

  // 스포츠/레져
  { path: '스포츠/레져>골프>골프공/티/마커/볼마크>골프공', input: '월드클래스 비거리 골프공 4피스 12구 화이트' },
  { path: '스포츠/레져>피트니스>홈트레이닝/스트레칭>요가매트', input: '내츄럴 요가매트 10mm TPE 친환경 미끄럼방지' },

  // 도서
  { path: '도서>국내도서>경제 경영>경영일반', input: '신세계몰 경영전략 베스트셀러 신간 2024년 개정판' },
  { path: '도서>외국도서>BUSINESS & ECONOMICS>Marketing', input: '프라임샵 Marketing Strategy 4th Edition Premium' },

  // 반려동물
  { path: '반려/애완용품>강아지 사료/간식/영양제>강아지 사료>건식사료', input: '바이오랩 소형견 건식사료 닭고기 무항생제 5kg' },
  { path: '반려/애완용품>고양이 사료/간식/영양제>고양이 간식>덴탈껌', input: '데일리 고양이 덴탈껌 헤어볼 케어 무첨가' },

  // 자동차용품
  { path: '자동차용품>실내용품>인테리어용품>핸들/핸들커버>핸들커버>겨울용', input: '스마일 차량용 핸들커버 겨울 보온 양털 12V' },

  // 주방용품
  { path: '주방용품>식기/홈세트>접시/볼>접시', input: '굿컴퍼니 도자기 접시 4P 식기세척기 가능 전자레인지' },

  // 1자 leaf 테스트
  { path: '식품>신선식품>견과/곡류>곡식>쌀', input: '청송농가 햅쌀 10kg 국내산 백미 도정일자' },

  // 영문 leaf 테스트
  { path: '도서>외국도서>COMPUTERS>Programming Languages>Python', input: 'Python Programming 4th Edition Premium' },
];

const SELLER_SEED = 'demo-seller';

console.log('━'.repeat(80));
console.log('🎯 메가로드 SEO v2 노출명 생성 시연 (실제 카테고리별)');
console.log('━'.repeat(80));

for (const { path, input } of SAMPLES) {
  const segs = path.split('>');
  const leaf = segs[segs.length - 1];
  const l1 = segs[0];

  const v2 = getV2Pool(path);
  const quality = getDataQuality(path);
  const attrs = resolveCategoryAttributes(path);

  let displayName;
  try {
    displayName = generateDisplayName(input, '리셀러몰', path, SELLER_SEED, 0);
  } catch (err) {
    console.log(`\n❌ ${path} - ERROR: ${err.message}`);
    continue;
  }

  const audit = auditGoldenZone(displayName, path);

  console.log('\n' + '─'.repeat(80));
  console.log(`📂 ${path}`);
  console.log(`   L1: ${l1} · leaf: "${leaf}" · 데이터품질: ${quality.toUpperCase()}`);
  console.log('');
  console.log(`📝 셀러 입력:    "${input}" (${input.length}자)`);
  console.log(`✨ 생성 노출명:  "${displayName}" (${displayName.length}자)`);
  console.log('');

  // 모바일 골든존
  console.log(`📱 모바일 첫 줄 (40자): "${audit.golden}${audit.truncated ? '...' : ''}"`);
  console.log(`   골든존 길이: ${audit.goldenLength}자 · 핵심 토큰: ${audit.coreKeywordCount}개 · 점수: ${audit.score}/100`);

  // SEO 매칭 분석
  console.log('\n🔍 SEO 매칭 분석:');
  console.log(`   ✓ 카테고리 leaf 포함: ${audit.hasLeafToken ? 'YES ✅' : 'NO ❌'}`);
  console.log(`   ✓ 매칭된 카테고리 토큰: [${audit.matchedCategoryWords.join(', ')}]`);

  if (v2 && v2.monthlyVolume > 0) {
    console.log(`   ✓ 네이버 월간 검색량: ${v2.monthlyVolume.toLocaleString()}회`);
  }
  if (v2 && Array.isArray(v2.topRelated) && v2.topRelated.length > 0) {
    const matched = v2.topRelated.filter(r => audit.golden.toLowerCase().includes((r.kw || '').toLowerCase()));
    console.log(`   ✓ 검색량 top 키워드: ${v2.topRelated.slice(0, 3).map(r => `"${r.kw}"(월${r.vol.toLocaleString()})`).join(' / ')}`);
    console.log(`   ✓ 골든존 매칭된 검색 키워드: ${matched.length > 0 ? matched.map(r => `"${r.kw}"`).join(', ') : '(없음)'}`);
  }

  if (v2 && Array.isArray(v2.modifiers) && v2.modifiers.length > 0) {
    console.log(`   ✓ v2 풀 modifiers (실데이터): [${v2.modifiers.slice(0, 6).join(', ')}]`);
  }

  if (attrs && Object.keys(attrs).length > 0) {
    const attrSummary = [];
    if (attrs.audience?.length) attrSummary.push(`audience: ${attrs.audience.slice(0, 3).join('/')}`);
    if (attrs.function?.length) attrSummary.push(`function: ${attrs.function.slice(0, 3).join('/')}`);
    if (attrs.material?.length) attrSummary.push(`material: ${attrs.material.slice(0, 3).join('/')}`);
    if (attrs.supplements?.length) attrSummary.push(`supplements: ${attrs.supplements.slice(0, 3).join('/')}`);
    if (attrSummary.length > 0) {
      console.log(`   ✓ 속성 마스터: ${attrSummary.join(' · ')}`);
    }
  }

  // 노이즈 제거 검증
  const noiseTokens = ['특가', '무료배송', '핫딜', '리뷰이벤트', '쿠폰', '한혜진', '★', '【', '】'];
  const removedNoise = noiseTokens.filter(n => input.includes(n) && !displayName.includes(n));
  if (removedNoise.length > 0) {
    console.log(`   ✓ 차단된 노이즈: [${removedNoise.join(', ')}]`);
  }
}

console.log('\n' + '━'.repeat(80));
console.log('시연 완료. 위 모든 노출명은 실제 메가로드 셀러가 받게 되는 결과물.');
console.log('━'.repeat(80));
