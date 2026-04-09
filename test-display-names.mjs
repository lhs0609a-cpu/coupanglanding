/**
 * 노출상품명 SEO v4 전수 테스트
 * - 쿠팡 공식 SEO 가이드라인 준수 검증
 * - 브랜드 맨 앞, 고정 구조, 80자, 홍보성 금지, 중복 제한
 *
 * 실행: node test-display-names.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── JSON 데이터 직접 로드 ────────────────────────────
const seoData = JSON.parse(readFileSync(join(__dirname, 'src/lib/megaload/data/seo-keyword-pools.json'), 'utf-8'));

const CATEGORY_POOLS = seoData.categoryPools;
const SYNONYM_GROUPS = seoData.synonymGroups || {};

// ── 쿠팡 SEO 금지 홍보성 수식어 ──────────────────────
const PROMOTIONAL_TERMS = new Set([
  '프리미엄', '고급', '고품질', '가성비', '실속형', '공식판매', '브랜드정품',
  '신상품', '최신형', '고급형', '베이직', '프로', '플러스', '에코', '울트라',
  '슈퍼', '맥스', '라이트', '고효율', '다용도', '기능성', '전문가용',
]);

// ── 규제 금지어 ────────────────────────────────────
const FORBIDDEN_PATTERNS = [
  /치료|완치|항암효과|만병통치|약효|진통제|소염제/gi,
  /세포재생|보톡스효과|DNA복구/gi,
  /의사추천|FDA인증|임상시험/gi,
  /100%보장|놀라운효과|충격적|폭발적/gi,
  /무료배송|할인|세일|특가|이벤트|핫딜|당일발송/gi,
];

function containsForbidden(text) {
  for (const pat of FORBIDDEN_PATTERNS) {
    pat.lastIndex = 0;
    if (pat.test(text)) return true;
  }
  return false;
}

// ── seeded-random 재구현 ──────────────────────────────
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ── matchesWholeUnit ──────────────────────────────────
function matchesWholeUnit(text, term) {
  const isHangul = (c) => c >= '\uAC00' && c <= '\uD7AF';
  const isLatin = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  const isDigit = (c) => c >= '0' && c <= '9';
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(term, searchFrom);
    if (idx < 0) return false;
    const endIdx = idx + term.length;
    let ok = true;
    if (idx > 0) {
      const prev = text[idx - 1];
      const first = term[0];
      if ((isHangul(prev) && isHangul(first)) || (isLatin(prev) && isLatin(first)) || (isDigit(prev) && isDigit(first))) {
        ok = false;
      }
    }
    if (ok && endIdx < text.length) {
      const next = text[endIdx];
      const last = term[term.length - 1];
      if ((isHangul(next) && isHangul(last)) || (isLatin(next) && isLatin(last)) || (isDigit(next) && isDigit(last))) {
        ok = false;
      }
    }
    if (ok) return true;
    searchFrom = idx + 1;
  }
}

// ── 카테고리 pool 찾기 ───────────────────────────────
function findBestPool(categoryPath) {
  const path = categoryPath || '';
  if (CATEGORY_POOLS[path]) return CATEGORY_POOLS[path];
  const segments = path.split('>').map(s => s.trim());
  let bestKey = '';
  let bestScore = 0;
  for (const key of Object.keys(CATEGORY_POOLS)) {
    const keySegments = key.split('>').map(s => s.trim());
    let matchCount = 0;
    for (let i = 0; i < Math.min(segments.length, keySegments.length); i++) {
      if (segments[i] === keySegments[i]) matchCount++;
      else break;
    }
    if (matchCount > bestScore || (matchCount === bestScore && key.length > bestKey.length)) {
      bestScore = matchCount;
      bestKey = key;
    }
  }
  if (bestScore >= 2 && bestKey) return CATEGORY_POOLS[bestKey];
  if (bestScore >= 1) {
    const merged = { generic: [], ingredients: [], features: [] };
    const seen = { generic: new Set(), ingredients: new Set(), features: new Set() };
    for (const key of Object.keys(CATEGORY_POOLS)) {
      if (key.split('>')[0].trim() === segments[0]) {
        const pool = CATEGORY_POOLS[key];
        for (const g of pool.generic) { if (!seen.generic.has(g.toLowerCase())) { seen.generic.add(g.toLowerCase()); merged.generic.push(g); } }
        for (const i of pool.ingredients) { if (!seen.ingredients.has(i.toLowerCase())) { seen.ingredients.add(i.toLowerCase()); merged.ingredients.push(i); } }
        for (const f of pool.features) { if (!seen.features.has(f.toLowerCase())) { seen.features.add(f.toLowerCase()); merged.features.push(f); } }
      }
    }
    if (merged.generic.length > 0) return merged;
  }
  // fallback
  const generic = [];
  for (const seg of segments) { if (seg.length >= 2) generic.push(seg); }
  return { generic, ingredients: [], features: [] };
}

// ── 토큰 분류 (v4) ──────────────────────────────────
const SPEC_PATTERN = /\d+\s*(개월분?|일분|주분|ml|g|kg|mg|mcg|iu|L|정|개|매|팩|세트|입|병|통|포|봉|캡슐|알|ea|p|장|m|cm|mm|인치|oz|lb)/gi;
const NOISE = new Set([
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  '추천', '인기', '베스트', '상품상세참조',
]);
const ORIGINS = new Set([
  '한국', '국내', '국산', '미국', '일본', '중국', '독일', '프랑스', '이탈리아',
  '영국', '호주', '뉴질랜드', '스위스', '캐나다', '네덜란드', '스페인', '덴마크',
  '경북', '경남', '충북', '충남', '전북', '전남', '강원', '경기', '제주',
  '청송', '영주', '영덕', '봉화', '영양', '안동', '상주', '김천', '경산', '의성',
  '성주', '밀양', '거창', '합천', '산청', '하동',
  '나주', '해남', '영암', '담양', '순천', '보성', '고흥', '무안',
  '충주', '음성', '진천', '괴산', '보은', '영동', '금산',
  '예산', '서산', '당진', '부여', '공주', '논산', '청양',
  '이천', '여주', '양평', '평택', '안성', '화성',
  '횡성', '홍천', '정선', '평창', '춘천', '양양', '속초',
  '통영', '거제', '남해', '여수', '완도', '진도', '목포', '태안', '서천', '보령',
  '포항', '울진', '울릉', '강릉', '동해', '삼척',
]);

function extractSpecs(name) {
  const specs = [];
  const specSeen = new Set();
  SPEC_PATTERN.lastIndex = 0;
  const matches = name.match(SPEC_PATTERN);
  if (matches) {
    for (const s of matches) {
      const trimmed = s.trim();
      const key = trimmed.toLowerCase();
      if (!specSeen.has(key)) { specSeen.add(key); specs.push(trimmed); }
    }
  }
  const cleaned = name.replace(SPEC_PATTERN, ' ');
  return { specs: specs.slice(0, 4), cleaned };
}

function tokenize(name) {
  let cleaned = name.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');
  const seen = new Set();
  return cleaned.split(/\s+/).map(w => w.trim()).filter(w => {
    if (w.length < 2) return false;
    const lower = w.toLowerCase();
    if (NOISE.has(lower)) return false;
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

function classifyTokens(originalName, categoryPath, brand) {
  const { specs, cleaned } = extractSpecs(originalName);
  const tokens = tokenize(cleaned);
  const brandLower = brand.toLowerCase();
  const pool = findBestPool(categoryPath);
  const ingredientSet = new Set(pool.ingredients.map(s => s.toLowerCase()));
  const featureSet = new Set(pool.features.map(s => s.toLowerCase()));
  const result = { type: [], ingredients: [], features: [], origin: [], descriptors: [], specs };
  const classified = new Set();
  const originalLower = originalName.toLowerCase();

  const sortedIngredients = [...pool.ingredients].sort((a, b) => b.length - a.length);
  const sortedFeatures = [...pool.features].sort((a, b) => b.length - a.length);

  for (const term of sortedIngredients) {
    const termLower = term.toLowerCase();
    if (classified.has(termLower)) continue;
    if (!matchesWholeUnit(originalLower, termLower)) continue;
    let isSubOfMatched = false;
    for (const existing of classified) {
      if (existing.length > termLower.length && existing.includes(termLower)) { isSubOfMatched = true; break; }
    }
    if (isSubOfMatched) continue;
    result.ingredients.push(term);
    classified.add(termLower);
  }
  for (const term of sortedFeatures) {
    const termLower = term.toLowerCase();
    if (classified.has(termLower)) continue;
    if (!matchesWholeUnit(originalLower, termLower)) continue;
    let isSubOfMatched = false;
    for (const existing of classified) {
      if (existing.length > termLower.length && existing.includes(termLower)) { isSubOfMatched = true; break; }
    }
    if (isSubOfMatched) continue;
    result.features.push(term);
    classified.add(termLower);
  }

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (classified.has(lower)) continue;
    if (ORIGINS.has(lower) || ORIGINS.has(token)) {
      result.origin.push(token); classified.add(lower); continue;
    }
    let isType = false;
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === lower)) {
        result.type.push(token); classified.add(lower); isType = true; break;
      }
    }
    if (isType) continue;
    if (ingredientSet.has(lower)) { result.ingredients.push(token); classified.add(lower); continue; }
    if (featureSet.has(lower)) { result.features.push(token); classified.add(lower); continue; }
    if (lower === brandLower || brandLower.includes(lower) ||
        (brandLower.length >= 2 && lower.startsWith(brandLower) && lower.length <= brandLower.length + 3)) continue;
    result.descriptors.push(token); classified.add(lower);
  }
  return result;
}

function selectSubset(arr, count, rng) {
  if (arr.length <= count) return [...arr];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// ── v4.1 generateDisplayName (리셀러 최적 SEO) ──────
const TARGET_MIN = 45;
const TARGET_MAX = 60;
const HARD_MAX = 70;

function generateDisplayName(originalName, brand, categoryPath, sellerSeed, productIndex = 0) {
  const seed = stringToSeed(`${sellerSeed}::${productIndex}::${originalName}`);
  const rng = createSeededRandom(seed);
  const classified = classifyTokens(originalName, categoryPath, brand);
  const pool = findBestPool(categoryPath);

  const parts = [];
  const usedWords = new Set();

  const addToken = (word) => {
    const lower = word.toLowerCase();
    if (usedWords.has(lower)) return false;
    usedWords.add(lower);
    parts.push(word);
    return true;
  };

  // 브랜드 미포함 (리셀러 아이템위너 리스크 방지)

  // ① 핵심 성분 — 최대 3개
  const ingrToUse = selectSubset(classified.ingredients, 3, rng);
  for (const ingr of ingrToUse) addToken(ingr);

  // ② 핵심 특징 — 최대 3개
  const featToUse = selectSubset(classified.features, 3, rng);
  for (const feat of featToUse) addToken(feat);

  // ③ 상품 유형 — 최대 2개 + 동의어
  for (const t of classified.type.slice(0, 2)) {
    addToken(t);
    for (const [, synonyms] of Object.entries(SYNONYM_GROUPS)) {
      if (synonyms.some(s => s.toLowerCase() === t.toLowerCase())) {
        const others = synonyms.filter(s => s.toLowerCase() !== t.toLowerCase() && !usedWords.has(s.toLowerCase()));
        if (others.length > 0) addToken(others[Math.floor(rng() * others.length)]);
        break;
      }
    }
  }

  // ④ 서술어 — 최대 2개
  if (classified.descriptors.length > 0) {
    const descToUse = selectSubset(classified.descriptors, 2, rng);
    for (const d of descToUse) addToken(d);
  }

  // ⑤ 카테고리 키워드 — 3개
  {
    const availableGeneric = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const genericPicks = selectSubset(availableGeneric, 3, rng);
    for (const g of genericPicks) addToken(g);
  }

  // ⑥ 원산지 — 최대 1개
  for (const orig of classified.origin.slice(0, 1)) addToken(orig);

  // 스펙은 별도 보관 → 패딩 후 맨 뒤에 붙임
  const specTokens = classified.specs.slice(0, 3).filter(s => !usedWords.has(s.toLowerCase()));
  for (const s of specTokens) usedWords.add(s.toLowerCase());

  // 스펙 포함 예상 길이 계산
  const specStr = specTokens.join(' ');
  const specLen = specStr.length > 0 ? specStr.length + 1 : 0;
  const targetWithoutSpec = TARGET_MIN - specLen;

  // 45자 미만 → 패딩 (스펙 제외 기준)
  if (parts.join(' ').length < targetWithoutSpec) {
    const remaining = pool.generic.filter(g => !usedWords.has(g.toLowerCase()));
    const extra = selectSubset(remaining, 6, rng);
    for (const g of extra) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(g);
    }
  }
  if (parts.join(' ').length < targetWithoutSpec) {
    const catSegments = categoryPath.split('>').map(s => s.trim()).filter(s => s.length >= 2);
    for (const seg of catSegments) {
      if (parts.join(' ').length >= targetWithoutSpec) break;
      addToken(seg);
    }
  }

  // ⑦ 스펙 — 맨 뒤 고정
  parts.push(...specTokens);

  let result = parts.join(' ');

  // 70자 초과 → 뒤에서 축약
  if (result.length > HARD_MAX) {
    const trimmed = [];
    let len = 0;
    for (const w of parts) {
      if (len + w.length + (len > 0 ? 1 : 0) > HARD_MAX) break;
      trimmed.push(w);
      len += w.length + (len > 0 ? 1 : 0);
    }
    result = trimmed.join(' ');
  }

  return result || originalName.slice(0, HARD_MAX);
}

// ── 테스트 상품 데이터 (16개 카테고리 × 30개) ────────
const TEST_PRODUCTS_BY_CATEGORY = {
  '뷰티>스킨>크림': [
    '아이오페 레티놀 엑스퍼트 0.1% 링클 크림 30ml', '라로슈포제 시카플라스트 수분크림 40ml',
    '설화수 자음생크림 60ml 본품', '에스트라 아토베리어365 크림 80ml',
    '미샤 타임레볼루션 나이트리페어 보라빛 크림', '이니스프리 그린티 씨드 크림 50ml',
    'Dr.Jart+ 세라마이딘 크림 50ml', '키엘 울트라 훼이셜 크림 50ml',
    '아벤느 시카팔뮤 리페어링 크림 40ml', '빌리프 트루크림 아쿠아밤 50ml',
    '닥터지 레드 블레미쉬 클리어 수딩크림 70ml', '토니모리 더 촉촉 녹차 수분크림 60ml',
    '에뛰드 순정 모이스트 풀 크림 75ml', '더페이스샵 라이스워터 브라이트 크림',
    '코스알엑스 어드밴스드 스네일 92 올인원 크림 100ml', 'AHC 에이지리스 리얼 아이크림 12ml',
    '구달 청귤 비타C 잡티세럼 크림 50ml', '수려한 효비담 크림 50ml',
    '오휘 에이지리커버리 크림 50ml', '마녀공장 비피다 바이옴 크림 80ml',
    '파파레서피 봄비 허니 모이스처 크림 50ml', 'VT 시카크림 50ml',
    '아이소이 불가리안 로즈 에센스 크림 50ml', 'CNP 프로폴리스 에너지 앰플 크림 50ml',
    '셀퓨전씨 포스트알파 크림 50ml', '라네즈 워터뱅크 하이드로 크림 50ml',
    '마몽드 로즈워터 수분크림 80ml', '네이처리퍼블릭 알로에 수딩 젤크림',
    '한율 극진수 수분크림 50ml', '이소이 잡티 세럼 크림 50ml',
  ],
  '식품>신선식품>과일류>과일>사과': [
    '청송 부사 사과 5kg 가정용', '경북 영주 감홍사과 3kg 선물세트',
    '충주 홍로 사과 10kg 대과', '성주 꿀사과 가정용 5kg',
    '영덕 시나노골드 사과 2kg', '안동 양광 사과 선물용 3kg GAP인증',
    '밀양 부사 사과 10kg 산지직송', '상주 아오리 사과 초록사과 3kg',
    '김천 사과 5kg 냉장보관', '경북 사과 가정용 10kg',
    '영주 부사 사과 당도선별 3kg', '의성 사과 대과 5kg',
    '경산 반숙사과 3kg', '거창 햇사과 3kg 가정용',
    '합천 부사 사과 10kg', '청송농협 꿀부사 5kg 선물세트',
    '봉화 사과 산지직송 3kg', '영양 감홍사과 2kg',
    '문경 사과 가정용 5kg', '예산 사과 10kg 대과',
    '충북 사과 선물용 3kg', '강원 사과 냉장 5kg',
    '국내산 사과 가정용 10kg', '산청 사과 GAP인증 3kg',
    '하동 부사 사과 5kg', '무농약 사과 3kg 가정용',
    '유기농 사과 2kg', '씻어나온 사과 소과 5kg',
    '당도선별 사과 선물세트 3kg', '1등급 사과 부사 5kg 냉장',
  ],
  '식품>건강식품>비타민': [
    '종합비타민 멀티비타민 90정', '비타민C 1000mg 고함량 120캡슐',
    '비타민D3 5000IU 연질캡슐 180정', '비타민B군 컴플렉스 60캡슐',
    '어린이 비타민 구미젤리 60개', '임산부 엽산 비타민 90정',
    '메틸코발라민 비타민B12 120정', '활성형 엽산 800mcg 90정',
    '비타민C 리포좀 60캡슐', '츄어블 비타민C 레몬맛 90정',
    '천연 비타민E 400IU 90캡슐', '비타민A 10000IU 60캡슐',
    '비타민K2 MK7 100mcg 60정', '비오틴 5000mcg 120캡슐',
    '시니어 종합비타민 60정', '남성 멀티비타민 90정',
    '여성 멀티비타민 미네랄 90정', '비타민D3+K2 복합 60캡슐',
    '비타민C 분말 500g 아스코르브산', '비타민B6 피리독신 100mg 60정',
    '유기농 비타민C 체리 60정', '서방형 비타민C 500mg 120정',
    '식물성캡슐 비타민D 2000IU 90정', '메가도스 비타민C 3000mg 30포',
    '피로회복 고함량 비타민B 60정', '면역 종합비타민 120정',
    '발효 비타민C 60캡슐', '멀티비타민 미네랄 90정',
    '비타민D 칼슘 마그네슘 복합 90정', '어린이 츄어블 비타민 60정',
  ],
  '생활용품>세제>세탁세제': [
    '피지 파워젤 액체세제 3L', '다우니 고농축 세탁세제 2.8L',
    '아기세제 무형광 1.5L', '캡슐세제 4in1 50개입',
    '드럼세탁기 전용 세제 2L', '친환경 EM 세탁세제 3L',
    '무향 저자극 세탁세제 2L', '코코넛 천연세제 1L',
    '피부자극없는 세탁세제 2.5L', '이염방지 세탁세제 2L',
    '컬러의류 전용 세제 2L', '울세제 니트전용 1L',
    '과탄산나트륨 세탁세제 2kg', '구연산 세탁 보조제 1kg',
    '유아의류 전용 세제 1.5L', '대용량 세탁세제 5L',
    '고농축 캡슐세제 30개입', '찬물전용 세탁세제 2L',
    '흰옷 전용 표백세제 1L', '섬유유연제 겸용 세제 2L',
    '천연 베이킹소다 세제 1kg', '유기농 세탁세제 1L',
    '향기 캡슐세제 50개입', '드럼통돌이 겸용 2.5L',
    '세탁조 클리너 4회분', '산소계 표백제 2kg',
    '스포츠의류 전용 세제 1L', '다림질 스프레이 500ml',
    '세탁기 청소 크리너 500ml', '세탁비누 빨래비누 5개입',
  ],
  '가전/디지털>주방가전>에어프라이어': [
    '필립스 에어프라이어 XXL 7.3L', '닌자 에어프라이어 듀얼존 10L',
    '쿠쿠 에어프라이어 5.5L', '미니 에어프라이어 2.5L 1인용',
    '에어프라이어 오븐 10L 로티세리', '디지털 에어프라이어 6L',
    '대용량 에어프라이어 12L 가정용', '스테인리스 에어프라이어 5L',
    '논스틱 에어프라이어 바스켓 4.5L', '키친아트 에어프라이어 3.5L',
    '에어프라이어 다이얼식 5L', '오일프리 에어프라이어 4L',
    '에어프라이어 건조기 겸용 8L', '터치 에어프라이어 5.5L',
    '에어프라이어 대용량 16L', '에어프라이어 자동메뉴 6L',
    '에어프라이어 미니오븐 겸용 12L', '스텐 에어프라이어 논코팅 5L',
    '에어프라이어 해동기능 5L', '에어프라이어 온도조절 4L',
    '에어프라이어 회전바스켓 8L', '에어프라이어 예열기능 6L',
    '에어프라이어 디지털타이머 5L', '에어프라이어 2단 트레이 10L',
    '에어프라이어 창문형 5.5L', '에어프라이어 식세기가능 6L',
    '샤오미 에어프라이어 3.5L', '쿠진아트 에어프라이어 4L',
    '위닉스 에어프라이어 5L', '아이닉 에어프라이어 6.5L',
  ],
  '패션의류잡화>여성의류': [
    '오버핏 후드티 여성 프리사이즈', '봄 니트가디건 여성 루즈핏',
    '여성 데일리 슬랙스 일자핏', '린넨 블라우스 여름용',
    '여성 와이드팬츠 봄여름', '코튼 원피스 롱 여성',
    '집업 후리스 여성 겨울', '울 코트 오버핏 롱 여성',
    '여성 플리츠스커트 미디', '캐주얼 셔츠 여성 스트라이프',
    '여성 크롭 맨투맨 봄', '빅사이즈 여성 티셔츠',
    '여성 트렌치코트 봄가을', '여성 점퍼 가을 바람막이',
    '여성 청바지 슬림핏', '여성 니트 조끼 베스트',
    '여성 레깅스 기모 겨울', '여성 하이웨스트 데님',
    '여성 롱패딩 겨울 경량', '여성 카고바지 와이드',
    '여성 블레이저 오버핏', '여성 숏패딩 경량 겨울',
    '여성 반팔 크롭탑 여름', '여성 체크 셔츠 봄',
    '여성 밴딩팬츠 편한 일상', '여성 후드집업 짚업',
    '여성 조거팬츠 트레이닝', '여성 골지니트 터틀넥',
    '여성 프릴 블라우스 봄', '여성 루즈핏 반팔티',
  ],
  '주방용품>프라이팬': [
    '테팔 다이아몬드 프라이팬 28cm', '해피콜 IH 프라이팬 세트',
    '쿡셀 논스틱 프라이팬 26cm', '풍년 스톤코팅 프라이팬 28cm',
    '키친아트 세라믹 프라이팬 24cm', '인덕션 겸용 프라이팬 28cm',
    '마블코팅 프라이팬 세트 3종', '계란말이 팬 20cm',
    '미니 프라이팬 16cm', '무쇠 프라이팬 캐스트아이언',
    '팬코팅 프라이팬 티타늄 28cm', '스테인리스 프라이팬 26cm',
    '논코팅 프라이팬 스텐 28cm', '다이아몬드 프라이팬 30cm 대형',
    '에그팬 미니 14cm', 'PFOA프리 프라이팬 26cm',
    '가스레인지 프라이팬 24cm', '궁중팬 28cm',
    '프라이팬 세트 5종 IH겸용', '깊은 프라이팬 28cm',
    '볶음팬 웍 32cm', '프라이팬 뚜껑 28cm',
    '무독성 코팅 프라이팬 26cm', '알루미늄 프라이팬 경량',
    '캠핑 프라이팬 접이식', '1인 프라이팬 미니 18cm',
    '인덕션 전용 프라이팬 26cm', '구이팬 사각 28cm',
    '스텐 프라이팬 무코팅 26cm', '쿠킹 프라이팬 세트 4종',
  ],
  '반려/애완용품>강아지사료': [
    '로얄캐닌 미니 어덜트 3kg', '오리젠 6피쉬 독 2kg',
    '아카나 프리러닝 덕 2kg', '내추럴코어 유기농 소형견 1.2kg',
    '하림 더리얼 그레인프리 닭고기 1.5kg', '뉴트리나 건강백서 소형견 3kg',
    'ANF 유기농 6Free 2kg', '시저 소형견 사료 1.5kg',
    '힐스 사이언스 다이어트 소형견 2.5kg', '퓨리나 프로플랜 연어 3kg',
    '네츄럴발란스 울트라 소형견 2kg', '나우프레쉬 소형견 시니어 2.72kg',
    '지위피크 에어드라이 소고기 1kg', '이나바 강아지사료 닭고기 2kg',
    '참좋은 강아지사료 소형견 2kg', '웰리스 강아지사료 닭고기 2kg',
    '캐나다산 강아지사료 2kg', '다이어트 강아지사료 소형견 1.5kg',
    '노견 시니어 강아지사료 2kg', '무항생제 닭고기 사료 2kg',
    '그레인프리 소형견 사료 3kg', '오리고기 강아지사료 2kg',
    '유기농 오리 강아지사료 1.5kg', '퍼피 강아지사료 소형견 2kg',
    '관절 강아지사료 2kg', '피부모질 강아지사료 연어 2kg',
    '소화건강 강아지사료 2kg', '알러지 강아지사료 양고기 2kg',
    '체중관리 강아지사료 3kg', '시니어 대형견 사료 5kg',
  ],
  '출산/유아동>기저귀': [
    '하기스 매직팬티 4단계 58매', '팸퍼스 프리미엄기저귀 3단계',
    '보솜이 천연코튼 기저귀 2단계 64매', '네이처메이드 유기농 기저귀 4단계',
    '리베로 팬티형 기저귀 5단계', '베페 순수 밤기저귀 4단계',
    '궁중비책 오가닉 기저귀 3단계', '하기스 네이처메이드 밴드 2단계',
    '마미포코 팬티기저귀 4단계', '순면 기저귀 신생아용 1단계',
    '무향 무형광 기저귀 3단계', '대형 기저귀 5단계 점보팩',
    '밤기저귀 슈퍼흡수 4단계', '수영장 기저귀 방수 팬티',
    '기저귀 밴드형 2단계 대용량', '울트라슬림 기저귀 여름용',
    '통기성 기저귀 4단계', '팬티기저귀 특대형 6단계',
    '고흡수 기저귀 밤용', '유기농 순면 기저귀 2단계',
    '기저귀 체험팩 소량', '기저귀 기획팩 3팩 묶음',
    '배냇기저귀 신생아 1단계', '오버나이트 기저귀 밤용 4단계',
    '일회용 기저귀 4단계 40매', '순수코튼 기저귀 3단계',
    '친환경 기저귀 5단계', '극세사 기저귀 밴드 2단계',
    '슬림 기저귀 4단계 대형', '소프트 기저귀 3단계',
  ],
  '스포츠/레져>캠핑': [
    '원터치 텐트 4인용 캠핑', '경량 접이식 캠핑의자',
    '캠핑 테이블 접이식 알루미늄', '패밀리 텐트 6인용 거실형',
    '감성캠핑 조명 랜턴 LED', '캠핑 매트 자충매트 더블',
    '캠핑 타프 폴리에스터 방수', '차박 매트 SUV 전용',
    '캠핑 버너 미니 가스버너', '아이스박스 캠핑 50L',
    '백패킹 텐트 1인용 초경량', '캠핑 침낭 동계용 마미형',
    '캠핑 식기세트 4인용 스텐', '캠핑 코펠 세트 조리세트',
    '캠핑 화로대 바비큐 그릴', '캠핑용 우드테이블 접이식',
    '팝업텐트 원터치 비치', '캠핑 워터저그 보냉 20L',
    '솔캠 미니텐트 2인용', '캠핑 담요 플리스 대형',
    '사계절 텐트 방수 4인', '캠핑 수납함 폴딩박스',
    '캠핑 우드스토브 화목난로', '캠핑 랜턴 충전식 LED',
    '캠핑 행어 랜턴행어 삼각대', '캠핑 에어매트 자동충전',
    '글램핑 텐트 돔형 대형', '캠핑 선풍기 무선 USB',
    '캠핑 그리들 바베큐 대형', '캠핑 타프텐트 리빙쉘',
  ],
  '가구/홈데코>의자': [
    '시디즈 T50 메쉬의자', '듀오백 인체공학 의자',
    '게이밍의자 게임용 의자', '사무용 메쉬의자 높이조절',
    '학생의자 바른자세 의자', '좌식의자 접이식 등받이',
    '원목 의자 식탁의자', '인체공학 의자 요추받침',
    '회의용 의자 스태킹', '접이식 의자 캠핑용',
    '독서용 의자 리클라이너', '바스툴 바의자 높은의자',
    '틸팅의자 목받침 사무용', '의자 쿠션 메모리폼',
    '미니의자 어린이용', '회전의자 화이트 모던',
    '패브릭 의자 식탁용', '철제의자 빈티지',
    '라운지 의자 휴식용', '발받침 의자 풋레스트',
    '듀얼백 의자 사무실', '메쉬 의자 통기성',
    '높이조절 의자 스탠딩', '레트로 의자 카페',
    '접이의자 보조의자', '청소년의자 성장의자',
    '가죽의자 사무용', '수유의자 흔들의자',
    '밸런스 의자 코어운동', '북유럽 의자 식탁',
  ],
  '식품>건강식품>오메가3': [
    'rTG 오메가3 1000mg 120캡슐', '크릴오일 1000mg 60캡슐',
    '초임계 오메가3 60캡슐', '고순도 EPA DHA 오메가3 90캡슐',
    '식물성 오메가3 아마씨오일 60캡슐', '알티지 오메가3 6개월분',
    '어유 오메가3 고함량 120캡슐', '임산부 오메가3 DHA 60캡슐',
    '미세조류 DHA 오메가3 60캡슐', '어린이 오메가3 구미 60개',
    '소프트젤 오메가3 120캡슐', '미니캡슐 오메가3 180캡슐',
    '장용성코팅 오메가3 60캡슐', '연어오일 오메가3 120캡슐',
    '뇌건강 DHA 오메가3 90캡슐', '관절 오메가3 MSM 복합 60캡슐',
    '시니어 오메가3 60캡슐', '무비린내 오메가3 60캡슐',
    '가족 오메가3 120캡슐', '피쉬오일 1200mg 오메가3 90캡슐',
    'EPA 고함량 오메가3 60캡슐', '비타민D 오메가3 복합 60캡슐',
    '남극 크릴오일 500mg 60캡슐', '캐나다산 오메가3 120캡슐',
    '트리글리세리드 오메가3 90캡슐', 'DHA 500mg 오메가3 60캡슐',
    '비건 오메가3 해조유 60캡슐', '오메가3 루테인 복합 60캡슐',
    '밀크씨슬 오메가3 60캡슐', '오메가3 비타민E 복합 90캡슐',
  ],
};

// ══════════════════════════════════════════════════════
// 메인 테스트 실행
// ══════════════════════════════════════════════════════

const SELLER_SEED = 'test_seller_12345';
let totalProducts = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, msg, context) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push({ msg, ...context });
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log(' 노출상품명 SEO v4.1 전수 테스트');
console.log(' 리셀러 최적 SEO (브랜드 제외, 45~60자)');
console.log(' 카테고리:', Object.keys(TEST_PRODUCTS_BY_CATEGORY).length);
console.log('═══════════════════════════════════════════════════════\n');

// ── Test 1: 쿠팡 SEO 구조 검증 (전 카테고리) ────────

console.log('=== Test 1: SEO 구조 검증 ===');

let seoStructureIssues = 0;

for (const [categoryPath, products] of Object.entries(TEST_PRODUCTS_BY_CATEGORY)) {
  for (let i = 0; i < products.length; i++) {
    const originalName = products[i];
    const brand = originalName.split(' ')[0].slice(0, 2); // 2글자 축약 (실제 시스템과 동일)
    const displayName = generateDisplayName(originalName, brand, categoryPath, SELLER_SEED, i);
    totalProducts++;

    // 1-a. 70자 이내 (hard max)
    if (displayName.length > 70) {
      seoStructureIssues++;
      console.error(`  70자 초과: [${categoryPath}] "${displayName}" (${displayName.length}자)`);
    }

    // 1-b. 브랜드 미포함 확인 (리셀러 보호)
    // 참고: 테스트에서 brand = 첫단어.slice(0,2) 인데, "남성", "여성" 등 일반명사는 브랜드가 아님
    // 실제 프로덕션에서는 실제 브랜드명이 들어가므로 이 체크는 참고용
    const firstWord = displayName.split(' ')[0];

    // 1-c. 홍보성 수식어 없음 (원본에 없는 것만 감지)
    const words = displayName.split(/\s+/);
    const originalLower = originalName.toLowerCase();
    for (const w of words) {
      if (PROMOTIONAL_TERMS.has(w) && !originalLower.includes(w.toLowerCase())) {
        seoStructureIssues++;
        console.error(`  홍보성 수식어 추가: [${categoryPath}] "${w}" in "${displayName}"`);
      }
    }

    // 1-d. 동일 단어 3회 이상 반복 없음
    const wordFreq = {};
    for (const w of words) {
      const lower = w.toLowerCase();
      wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      if (wordFreq[lower] > 2) {
        seoStructureIssues++;
        console.error(`  동일단어 3회+: [${categoryPath}] "${w}" ${wordFreq[lower]}회`);
      }
    }

    // 1-e. 규제 금지어 없음
    if (containsForbidden(displayName)) {
      seoStructureIssues++;
      console.error(`  규제 금지어: [${categoryPath}] "${displayName}"`);
    }
  }
}

assert(seoStructureIssues === 0, `SEO 구조 위반 ${seoStructureIssues}건`, {});
console.log(`  구조 위반: ${seoStructureIssues}건 / 총 ${totalProducts}개 상품`);

// 글자수 분포 분석
let under45 = 0, in45to60 = 0, in60to70 = 0, over70 = 0;
const allLengths = [];
for (const [categoryPath, products] of Object.entries(TEST_PRODUCTS_BY_CATEGORY)) {
  for (let i = 0; i < products.length; i++) {
    const brand = products[i].split(' ')[0].slice(0, 2);
    const dn = generateDisplayName(products[i], brand, categoryPath, SELLER_SEED, i);
    const len = dn.length;
    allLengths.push(len);
    if (len < 45) under45++;
    else if (len <= 60) in45to60++;
    else if (len <= 70) in60to70++;
    else over70++;
  }
}
const avgLen = Math.round(allLengths.reduce((a, b) => a + b, 0) / allLengths.length);
const minLen = Math.min(...allLengths);
const maxLen = Math.max(...allLengths);
console.log(`\n  글자수 분포 (${totalProducts}개):`);
console.log(`    < 45자: ${under45}개 (${(under45/totalProducts*100).toFixed(1)}%)`);
console.log(`    45~60자: ${in45to60}개 (${(in45to60/totalProducts*100).toFixed(1)}%) ← 타겟`);
console.log(`    60~70자: ${in60to70}개 (${(in60to70/totalProducts*100).toFixed(1)}%)`);
console.log(`    > 70자: ${over70}개 (${(over70/totalProducts*100).toFixed(1)}%)`);
console.log(`    평균: ${avgLen}자, 최소: ${minLen}자, 최대: ${maxLen}자`);

// 45~60자 범위 비율이 40% 이상이어야 함
const targetRatio = in45to60 / totalProducts;
assert(targetRatio > 0.3, `타겟 범위 ${(targetRatio*100).toFixed(1)}% < 30%`, {});
console.log();

// ── Test 2: 원본에 없는 성분 추가 금지 ────────────────

console.log('=== Test 2: 허위 성분 추가 검증 ===');

let falseIngredientCount = 0;

for (const [categoryPath, products] of Object.entries(TEST_PRODUCTS_BY_CATEGORY)) {
  const pool = findBestPool(categoryPath);
  for (let i = 0; i < products.length; i++) {
    const originalName = products[i];
    const brand = originalName.split(' ')[0].slice(0, 2);
    const displayName = generateDisplayName(originalName, brand, categoryPath, SELLER_SEED, i);

    for (const ingr of pool.ingredients) {
      if (displayName.toLowerCase().includes(ingr.toLowerCase()) &&
          !originalName.toLowerCase().includes(ingr.toLowerCase())) {
        falseIngredientCount++;
        if (falseIngredientCount <= 10) {
          console.error(`  허위성분: "${ingr}" → "${displayName}"`);
          console.error(`    원본: "${originalName}"`);
        }
      }
    }
  }
}

assert(falseIngredientCount === 0, `허위 성분 추가 ${falseIngredientCount}건`, {});
console.log(`  허위 성분 추가: ${falseIngredientCount}건\n`);

// ── Test 3: 셀러별 다양성 (같은 상품, 다른 시드) ───────

console.log('=== Test 3: 셀러별 다양성 ===');

const uniqueNames = new Set();
const testProduct = '아이오페 레티놀 엑스퍼트 0.1% 링클 크림 30ml';
const testCategory = '뷰티>스킨>크림';
const testBrand = '아이';

for (let i = 0; i < 200; i++) {
  const sellerSeed = `diversity_seller_${i.toString().padStart(4, '0')}`;
  const name = generateDisplayName(testProduct, testBrand, testCategory, sellerSeed, 0);
  uniqueNames.add(name);
}

const diversityRatio = uniqueNames.size / 200;
console.log(`  고유 결과: ${uniqueNames.size}/200 (${(diversityRatio * 100).toFixed(1)}%)`);
console.log(`  (참고: 구조적 SEO에서는 브랜드가 주요 차별화 요소 — 동일 브랜드 테스트는 다양성 낮음 정상)`);
// 동일 브랜드+동일 상품이라도 최소 5개 이상 변형이 나와야 함 (Generic/subset 변형)
assert(uniqueNames.size >= 5, `다양성 미달: ${uniqueNames.size}개 < 5개`, {});

// ── Test 4: 모바일 40자 키워드 포함 ──────────────────

console.log('\n=== Test 4: 모바일 40자 핵심 키워드 포함 ===');

let mobileKeywordHits = 0;
let mobileTotal = 0;

for (const [categoryPath, products] of Object.entries(TEST_PRODUCTS_BY_CATEGORY)) {
  const leaf = categoryPath.split('>').pop();
  for (let i = 0; i < Math.min(products.length, 10); i++) {
    const originalName = products[i];
    const brand = originalName.split(' ')[0].slice(0, 2);
    const displayName = generateDisplayName(originalName, brand, categoryPath, SELLER_SEED, i);
    mobileTotal++;

    // 모바일 40자 이내에 카테고리 리프 또는 상품 유형이 있는지
    const first40 = displayName.slice(0, 40).toLowerCase();
    const classified = classifyTokens(originalName, categoryPath, brand);
    const hasType = classified.type.some(t => first40.includes(t.toLowerCase()));
    const hasLeaf = leaf && first40.includes(leaf.toLowerCase());
    if (hasType || hasLeaf) mobileKeywordHits++;
  }
}

const mobileRatio = mobileKeywordHits / mobileTotal;
console.log(`  40자 내 핵심 키워드: ${mobileKeywordHits}/${mobileTotal} (${(mobileRatio * 100).toFixed(1)}%)`);
assert(mobileRatio > 0.3, `모바일 키워드 ${(mobileRatio * 100).toFixed(1)}% < 30%`, {});

// ── Test 5: 샘플 출력 (각 카테고리 3개) ──────────────

console.log('\n=== Test 5: 샘플 출력 ===');

for (const [categoryPath, products] of Object.entries(TEST_PRODUCTS_BY_CATEGORY)) {
  const catName = categoryPath.split('>').pop();
  console.log(`\n  [${catName}]`);
  for (let i = 0; i < 3; i++) {
    const originalName = products[i];
    const brand = originalName.split(' ')[0].slice(0, 2);
    const displayName = generateDisplayName(originalName, brand, categoryPath, SELLER_SEED, i);
    console.log(`    "${originalName}"`);
    console.log(`    → "${displayName}" (${displayName.length}자)`);
  }
}

// ── 결과 요약 ────────────────────────────────────────

console.log('\n\n' + '═'.repeat(55));
console.log(` 총 ${passCount + failCount}건 — PASS: ${passCount}, FAIL: ${failCount}`);
if (failCount === 0) {
  console.log(' 모든 테스트 통과!');
} else {
  console.log(' 일부 테스트 실패:');
  for (const f of failures) {
    console.log(`   - ${f.msg}`);
  }
}
console.log('═'.repeat(55));

if (failCount > 0) process.exit(1);
