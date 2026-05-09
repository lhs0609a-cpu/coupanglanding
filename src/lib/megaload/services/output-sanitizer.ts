// ============================================================
// 상세페이지 본문 출력 마스터 산타이저
//
// generateStoryV2 의 모든 출력(real-review + persuasion)이 거치는
// 최종 게이트. 데이터·템플릿·치환 단계에서 흘러든 비문/오염을
// 문장 단위로 차단한다.
//
// ─ 차단 항목 ───────────────────────────────────────────────
//   1. 변수 빈치환으로 깨진 문장 (". " 잔재, "수 .", 미치환 placeholder)
//   2. ㄹ받침 + "으로" 잘못 ("선물으로", "이걸으로")
//   3. 형용사 불규칙 ("없은"/"있은" → "없는"/"있는")
//   4. "드심해도" / "드심하면" 류 합성 깨짐 → "드셔도" / "드시면"
//   5. "단계에했더니" / "때간이" 등 합성 깨짐
//   6. fallback 명사 노출 (", 상품은 ", "바로 상품입니다") 문장 폐기
//   7. 카테고리 cross-leaf 오염 (분유→카시트, 노트→만년필 등)
//   8. 빈도 모순 ("주말에 ... 매일")
// ============================================================

interface SanitizeOptions {
  productName: string;
  categoryPath: string;
  cleanProductName: string;
  brand?: string;
}

// ── ㄹ받침 + "으로/로" 보정 ─────────────────────────────────
//   한국어 규칙: ㄹ받침 → "로", 무받침 → "로", 그 외 받침 → "으로"
//   예: "선물(ㄹ받침)으로" → "선물로", "이걸(ㄹ받침)으로" → "이걸로"
function fixRieulParticle(text: string): string {
  return text.replace(/([가-힣])(으로)(?=[\s.,!?]|$)/g, (m, char) => {
    const code = char.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return m;
    const jong = (code - 0xAC00) % 28;
    // 받침 없음(0) 또는 ㄹ(8) → "로"
    if (jong === 0 || jong === 8) return char + '로';
    return m;
  });
}

// ── 영문/숫자 끝 + 한국어 조사 보정 ──────────────────────
//   "A5을 / B7을 / 50ml을" 같은 영문/숫자 끝 단어 + "을/이/은"
//   한국어 발음 관습상 무받침 처리하여 "를/가/는" 으로 통일.
//   특수 케이스: 7/8/1 (받침 ㄹ), 6/3/0/m/n/k/l (받침) 은 보존하지만
//   판별 비용이 크고 잘못 적용해도 가독성 손실 적어 보수적으로 무받침 가정.
function fixAlphanumParticle(text: string): string {
  return text
    .replace(/([A-Za-z0-9])을(\s|[,.!?]|$)/g, '$1를$2')
    .replace(/([A-Za-z0-9])이(?=\s[가-힣])/g, '$1가')
    // "A5은 한 단계 위" → 받침 없음 가정
    .replace(/([A-Za-z0-9])은(\s+[가-힣])/g, '$1는$2');
}

// ── 형용사 불규칙 관형형 ────────────────────────────────────
//   "없다/있다/맛없다/맛있다" → 관형형 "는" (받침 무관)
function fixIrregularAdj(text: string): string {
  return text
    .replace(/(맛없|맛있|재미있|재미없|없|있)은(?=[\s가-힣])/g, '$1는');
}

// ── 동사 어간 + 명사 어미 합성 깨짐 ───────────────────────
//   "드심" 은 동사가 아닌 명사형. 뒤에 "해도/하면/한/하/합니다" 등이
//   붙어 비문이 되는 케이스를 정상 활용형으로 복구.
function fixDrinkVerbConjugation(text: string): string {
  return text
    .replace(/드심해도/g, '드셔도')
    .replace(/드심해보/g, '드셔보')
    .replace(/드심하면/g, '드시면')
    .replace(/드심하니까/g, '드시니까')
    .replace(/드심하니/g, '드시니')
    .replace(/드심한/g, '드신')
    .replace(/드심했/g, '드셨')
    .replace(/드심합니다/g, '드십니다')
    .replace(/드심하시/g, '드시')
    .replace(/드심하/g, '드시');
}

// ── 추상명사 + "한테/에게" → "에" ────────────────────────
//   "주름 고민한테" / "건강한 식단에게" 같이 사람이 아닌 대상에
//   "한테/에게"를 쓴 비문을 "에/께" 로 보정.
const ABSTRACT_NOUN_PARTICLE_FIX: Array<[RegExp, string]> = [
  [/(고민)한테/g, '$1 있는 분께'],
  [/(고민)에게/g, '$1 있는 분께'],
  // 한테 + 에게 모두 → 에 (추상명사용)
  [/(식단|식습관|루틴|일상|생활|습관|취향|컨디션|스타일|분위기|환경|조건|성향|상황|체질|건강|몸|컨셉|기분|마음)(한테|에게)/g, '$1에'],
];
function fixAbstractParticle(text: string): string {
  let out = text;
  for (const [re, rep] of ABSTRACT_NOUN_PARTICLE_FIX) out = out.replace(re, rep);
  return out;
}

// ── "는은", "는는" 합성 비문 보정 ────────────────────────
//   템플릿 "{변수}은" 에서 변수가 형용사 관형형(예: "자극없는") 일 때 "자극없는은" 발생.
//   "는은/는는/은은" 형태가 보이면 "는"으로 압축.
function fixAdjectiveParticleClash(text: string): string {
  return text
    .replace(/는은(?=[\s가-힣])/g, '는')
    .replace(/는는(?=[\s가-힣])/g, '는')
    .replace(/은은(?=[\s가-힣])/g, '은');
}

// ── 같은 형용사 인접 중복 ("부담 없는 부담없는") ───────────
function fixAdjacentAdjDup(text: string): string {
  return text
    // "부담 없는 부담없는" → "부담 없는"
    .replace(/(\S+)\s+없는\s+\1없는/g, '$1 없는')
    .replace(/(\S+없는)\s+\1/g, '$1')
    // 조사를 무시한 형용사 인접 (차이만 있는 어미)
    .replace(/([가-힣]{2,4})는\s+\1는(?=[\s가-힣])/g, '$1는')
    .replace(/([가-힣]{2,4})은\s+\1은(?=[\s가-힣])/g, '$1은');
}

// ── 빈치환 + 미치환 잔재 검출 ───────────────────────────────
//   변수가 ""로 치환된 후 남는 깨진 패턴들.
const BROKEN_PATTERNS: RegExp[] = [
  /\{[^}]+\}/,                    // 미치환 placeholder
  /\s\.\s*$/,                      // " ." 으로 끝남
  /\s\.\s+[가-힣]/,                // 중간 " ." 후 한글 (잘린 문장)
  /\(\s*\)|\[\s*\]|<\s*>/,         // 빈 괄호/꺾쇠
  /\s{3,}/,                        // 3공백 이상 (변수 누락)
  /[가-힣]\s+수\s*\.?\s*$/,        // "다룰 수 ." (어미 잘림)
  /[가-힣]\s+게\s*\.?\s*$/,        // "어렵지 않게 ." (어미 잘림)
  /[가-힣]\s+수\s*있어요\s+게/,    // 의미 깨짐
  /있어요\s+\./,                   // "있어요 ."
  /흔적이\s+\./,                   // "흔적이 ."
  /\s,\s*\./,                      // ", ."
  // 형용사 관형형 + "이라" — 비문 ("매끈한이라/부드러운이라/따뜻한이라")
  // 정상은 "매끈해서/부드러우니/따뜻해서". 변환 어휘 의존성이 커서 드롭.
  /[가-힣](한|운|은|인)이라(?=[\s가-힣])/,
];
function isBrokenSentence(s: string): boolean {
  if (!s.trim()) return true;
  return BROKEN_PATTERNS.some(re => re.test(s));
}

// ── 상품/제품 fallback 잔재 검출 ─────────────────────────
//   `{product}`가 일반 fallback으로 치환되어 의미가 빠진 문장.
//   `, 상품은 ` `바로 상품입니다` `, 제품 ,` 류 폐기.
//   ⚠️ "이 상품" 의 "이" 가 fixOrphanParticles 버그로 잘려나간 패턴도 포함.
const PRODUCT_FALLBACK_BROKEN: RegExp[] = [
  /[,，]\s*(상품|제품)\s*(은|는|을|를|이|가|에|으로|로|의)\s/,
  /바로\s+(상품|제품)입니다/,
  /[,，]\s*(상품|제품)\s*[,，]/,
  /[,，]\s*(상품|제품)\s*\./,
  /^\s*(상품|제품)\s*(을|를|이|는|은|에|으로|로|의)\s/,
  /언급하는\s+[가-힣]+,\s*바로\s*(상품|제품)/,
  // "오래 망설인 끝에 상품을 들였는데" / "유명해진 상품의 진짜 실력"
  /(끝에|망설인 끝에|유명해진|언급하는|입소문 난|소문난|들어본)\s+(상품|제품)\s*(을|를|이|가|은|는|의|에)\s/,
  // "상품 써봐"
  /'\s*(이건|이게|그게)\s+(상품|제품)\s+(써봐|드셔봐|먹어봐)\s*'/,
  // "이제 제품으로 바꿔보세요" / "이제 이 제품으로 바꿔보세요" 류 fallback
  /(이제|지금)\s+(이\s+)?(상품|제품)\s*(으로|로|을|를)\s+(바꿔|시도|시작)/,
  // "결국 고르는 그 식품, 이제 이 제품으로 바꿔보세요"
  /(고르는|찾으시는|좋아하는)\s+그?\s*식품\s*[,，]\s*이제\s+(이\s+)?(상품|제품)/,
  // "그동안 상품을 써왔는데"
  /(그동안|예전에|한참)\s+(상품|제품)\s*(을|를|에)\s/,
];
function isProductFallbackBroken(s: string): boolean {
  return PRODUCT_FALLBACK_BROKEN.some(re => re.test(s));
}

// ── 카테고리 cross-leaf 오염 검출 ─────────────────────────
//   상품명/카테고리와 무관한 sub-category 명사가 본문에 등장하는 케이스.
function detectCrossLeafContamination(
  s: string,
  productName: string,
  categoryPath: string,
): boolean {
  const pn = productName;
  const cp = categoryPath;

  // 문구·노트 — 다른 문구 sub-카테고리 명사
  if (/노트|메모지|메모장/.test(pn) && cp.includes('문구')) {
    if (/만년필|볼펜|마커\b|연필|필통|플래너|점착메모|파일\b|다이어리/.test(s)) return true;
  }
  if (/다이어리/.test(pn) && cp.includes('문구')) {
    if (/만년필|볼펜|마커\b|연필|필통|플래너|점착메모|파일\b/.test(s)) return true;
  }
  if (/볼펜|연필|마커|멀티펜|수성펜|중성펜|샤프/.test(pn) && cp.includes('문구')) {
    if (/노트\b|다이어리|플래너|점착메모|파일\b|필통|만년필/.test(s)) return true;
  }
  if (/만년필/.test(pn) && cp.includes('문구')) {
    if (/노트\b|다이어리|플래너|점착메모|파일\b|필통|볼펜|연필|마커/.test(s)) return true;
  }
  // 필기구 일반 (`필기구`/`펜` 등이 카테고리 path에 있는 경우)
  if ((cp.includes('필기구') || cp.includes('펜')) && cp.includes('문구')) {
    if (/노트\b|다이어리|플래너|점착메모|파일\b|필통/.test(s)) return true;
  }

  // 의류 — 가디건/티셔츠/원피스 등 다른 의류 sub-카테고리
  if (/가디건/.test(pn)) {
    if (/원피스|스커트|블라우스|자켓|코트|반팔티|민소매/.test(s)) return true;
  }
  if (/티셔츠|반팔/.test(pn)) {
    if (/원피스|스커트|블라우스|자켓|가디건|코트/.test(s)) return true;
  }
  if (/원피스/.test(pn)) {
    if (/스커트|블라우스|자켓|가디건|반팔티/.test(s)) return true;
  }

  // 분유·이유식 — 카시트/물티슈/기저귀 등 출산용품 cross-leaf
  if (/분유/.test(pn) || /분유/.test(cp)) {
    if (/카시트|물티슈|기저귀|이유식\b|유아식\b|유아식기|유아세제|젖병\b/.test(s)) return true;
    // "유아식예요/이유식예요" 등 카테고리 leaf 결합
    if (/유아식이?예요|이유식이?예요|물티슈예요|카시트예요|젖병예요/.test(s)) return true;
  }
  if (/물티슈/.test(pn)) {
    if (/카시트|분유|이유식|기저귀|유아식|젖병/.test(s)) return true;
  }
  if (/기저귀/.test(pn)) {
    if (/카시트|분유|이유식|물티슈|유아식|젖병/.test(s)) return true;
  }

  // 자동차 블랙박스 — 왁스/코팅/세차 cross-leaf
  if (/블랙박스/.test(pn)) {
    if (/왁스(가|는|를|이|에|로|으로|예요|로 유명)/.test(s)) return true;
    // 복합어 — "카나우바왁스/천연왁스/불소왁스" 등 (1.6만 audit 회귀)
    if (/[가-힣]{2,}왁스(\s|[.,!?])/.test(s)) return true;
    if (/(코팅|발수)(가|는|를|이|에|로|으로|이|예요)/.test(s)) return true;
    if (/광택나는|세차편리|불소코팅|카나우바|폴리시/.test(s)) return true;
    if (/핏(에서|이|을|는|가)/.test(s)) return true;
  }
  if (/왁스|코팅제/.test(pn)) {
    if (/블랙박스|선명도|화소/.test(s)) return true;
  }
  // 자동차용품 외 카테고리에서 "광택나는/왁스/세차" 누출 (1.6만 audit 에서 2,282건 검출)
  if (!cp.includes('자동차') && !cp.includes('블랙박스') && !/(왁스|코팅|광택)/.test(pn)) {
    if (/광택나는\s+설계/.test(s)) return true;
    if (/재구매와\s+추가\s+구매가\s+많은\s+왁스로/.test(s)) return true;
    if (/카매니아\s+커뮤니티/.test(s) && !cp.includes('자동차')) return true;
  }

  // 자동차 매트류 (방음/흡음/실내) — 자동차 path 안에 있지만 왁스/광택과 무관 (2,279건)
  if (/(방음매트|흡음매트|실내매트|차량매트|러그|시트커버)/.test(pn)) {
    if (/광택나는\s+설계/.test(s)) return true;
    if (/왁스로\s+유명/.test(s)) return true;
    if (/카나우바|발수|코팅(가|는|를|이|로|예요)|카매니아/.test(s)) return true;
  }

  // 반려동물 사료/영양제/사육장 — "수의사 추천/처방" 표현 (의약품 오인 우려)
  // 1.6만 audit 2,080건 잔여 — 가축사육장/낚시토끼 등 미커버 카테고리 확장.
  if ((cp.includes('반려') || cp.includes('애완') || cp.includes('가축')) ||
      /(사료|영양제|간식|사육장|용품|급식기|급수기|패드)/.test(pn)) {
    if (cp.includes('반려') || cp.includes('애완') || cp.includes('가축') ||
        /(강아지|고양이|토끼|닭|병아리|햄스터|페럿)/.test(pn)) {
      if (/수의사\s+(추천|처방|진료|언급)/.test(s)) return true;
    }
  }

  // 식물영양제 — "드셔봤" 류 (식물에게 사람 동사 사용)
  // 1.6만 audit 에서 289건 검출.
  if (/식물영양제|화훼/.test(pn) || (cp.includes('원예') && /(영양제|비료)/.test(pn))) {
    if (/드셔봤|드셔보세요|먹어봤|드심/.test(s)) return true;
  }

  // 가전 메이커류 (간식메이커/와플메이커/아이스크림메이커 등) — 식품 동사 차단
  // 1.6만 audit 에서 279건. 가전인데 "드셔봤/먹어봤" 사용.
  if (/(메이커|머신|기계|오븐|포트|인덕션|레인지)/.test(pn) && cp.includes('가전')) {
    if (/드셔봤|드셔보세요|먹어봤|드심해|드신\s+후/.test(s)) return true;
  }

  // 뷰티 넥크림 — 식품/박스 표현
  if (/(크림|세럼|토너|에센스|로션|앰플|팩|스킨)/.test(pn) && cp.includes('뷰티')) {
    if (/박스\b|함량은\s|함량 |먹[어으고는기이여]|드셔|드심/.test(s)) return true;
    if (/맛있|맛없|시원한|쫄깃|식감|풍미/.test(s)) return true;
  }

  // 식품 신선식품/가공식품 — 영양제/캡슐 + "10초 컷" 같은 부적합 표현
  // 영양제 카피 ("이 함량은 못 찾아요") 누출 차단
  const isFoodNotSupplement = (cp.includes('식품') || cp.includes('과일') || cp.includes('채소') || cp.includes('축산') || cp.includes('수산') || cp.includes('가공'))
    && !cp.includes('건강식품') && !cp.includes('영양제');
  if (isFoodNotSupplement || /(망고|감자|사과|배|딸기|토마토|오렌지|바나나|포도|복숭아|키위|체리|과일|채소|쌀|잡곡|한우|돼지|닭|연어|생선|새우|밀키트|김치|라면)/.test(pn)) {
    if (/이\s+함량은/.test(s)) return true;
    if (/(캡슐|정제|알약|섭취량|복용량|1정|1포)/.test(s)) return true;
    if (/하루\s*권장량/.test(s)) return true;
    // 신선식품에서 "10초 컷" — 즉석식품/밀키트/라면 등은 OK
    if (/10초\s*컷/.test(s) && !/(밀키트|라면|즉석|즉석식품)/.test(pn) && !cp.includes('가공')) return true;
  }

  // 식품 전반 — "박스" 단독 noun 노출 (포장 단위가 카테고리 leaf로 잘못 추출된 경우)
  if (cp.includes('식품') || cp.includes('과일') || cp.includes('채소')) {
    // 박스 단독 leaf 노출
    if (/박스(가|는|이|입니다|입|을|을\b|예|예요|에서|에|,|\s*\|)/.test(s)) return true;
    // "다른 박스가 밍밍" / "조용히 입소문 타고 있는 박스"
    if (/타고 있는 박스/.test(s)) return true;
    if (/꾸준히 달리는 박스/.test(s)) return true;
    if (/단골 되는 박스/.test(s)) return true;
    if (/(다른|많은|찾으시는)\s*박스/.test(s)) return true;
    // "조용히 입소문 타고 있는 식품" — 식품 단독 leaf
    if (/타고 있는 식품/.test(s)) return true;
    if (/꾸준히 달리는 식품/.test(s)) return true;
    if (/입소문 타고.*식품/.test(s)) return true;
  }

  // 사료 — "고구마/연어" 등 원료가 단독 명사로 노출
  if (/사료/.test(pn) && /반려/.test(cp)) {
    if (/검증된\s*(고구마|연어|닭|소고기)예요/.test(s)) return true;
    if (/(검증된|언급한|추천하는)\s*(고구마|연어|닭|소고기)\s*예요/.test(s)) return true;
  }

  // 가전 무선청소기 — "스마트", "가전" 형용사 단독 노출
  if (/청소기|진공청소기/.test(pn)) {
    if (/'\s*[가-힣]+\s*'\s*가전\.\s*$/.test(s)) return true;
    if (/'\s*[가-힣]+\s*'\s*스마트\.\s*$/.test(s)) return true;
  }

  return false;
}

// ── 빈도 모순 검출 ───────────────────────────────────────
function hasFrequencyContradiction(s: string): boolean {
  if (/주말에/.test(s) && /매일\s*빠지지/.test(s)) return true;
  if (/주말에만/.test(s) && /매일/.test(s)) return true;
  return false;
}

// ── 단어 합성 깨짐 보정 ───────────────────────────────────
//   "단계에했더니" / "때간이" / "기초 케어 마지막 단계에했더니" 류
//   변수 빈치환으로 단어가 붙어버린 케이스를 정상 표현으로 복구.
function fixCompoundBreaks(text: string): string {
  return text
    .replace(/단계에했더니/g, '단계에 발랐더니')
    .replace(/단계에했/g, '단계에 발랐')
    .replace(/단계에하/g, '단계에 사용하')
    .replace(/때간이/g, '때 시간이')
    .replace(/때시간/g, '때 시간')
    // 수+공백+마침표 → 어미 보강
    .replace(/(다룰|할|쓸)\s+수\s*\.\s*$/g, '$1 수 있어요.');
}

// ── 후회 없은 → 후회 없는 (자주 등장하는 비문) ─────────────
function fixCommonGrammarBugs(text: string): string {
  return text
    .replace(/후회\s+없은/g, '후회 없는')
    .replace(/번거로움\s+없은/g, '번거로움 없는')
    .replace(/실수\s+없은/g, '실수 없는')
    // "절반 가까가" → "절반 가까이" (받침 변형 오류)
    .replace(/가까가(?=[\s가-힣])/g, '가까이 ')
    // "착용감이 느껴지는 착용감" 류 인접 동어 (서로 다른 패턴)
    .replace(/(\S+이|\S+가)\s+느껴지는\s+\1/g, '$1 느껴지는');
}

// ── 한 단락 안 동일 패턴 압축 ────────────────────────────
//   "광고 문구 말고 결과로 증명하는 X, ..." 가 시간/대상만 바꿔 N회 반복되는 등.
//   템플릿 시그니처(첫 8어절)가 같으면 첫 문장만 유지.
function dedupeWithinParagraph(sentences: string[]): string[] {
  const seenSig = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    const sig = s.replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    out.push(s);
  }
  return out;
}

// ── 메인 산타이저 ─────────────────────────────────────────
export function sanitizeStoryParagraphs(
  paragraphs: string[],
  opts: SanitizeOptions,
): string[] {
  const out: string[] = [];
  const seenAcross = new Set<string>();

  for (const para of paragraphs) {
    if (!para) continue;
    // ⚠️ "요" 로 split 하면 "필요/주요/중요/조용/조요" 같은 명사가 어미로 오인되어
    //    문장이 잘못 끊김. 안전하게 . ! ? 만 사용.
    const sentences = para.split(/(?<=[.!?。])\s+/);
    const cleaned: string[] = [];

    for (const raw of sentences) {
      let s = raw.trim();
      if (!s) continue;

      // 1) 문법/조사/합성 보정
      s = fixRieulParticle(s);
      s = fixAlphanumParticle(s);
      s = fixIrregularAdj(s);
      s = fixDrinkVerbConjugation(s);
      s = fixAbstractParticle(s);
      s = fixCompoundBreaks(s);
      s = fixCommonGrammarBugs(s);
      s = fixAdjectiveParticleClash(s);
      s = fixAdjacentAdjDup(s);

      // {product} 잔재 보정 (만일을 대비)
      s = s.replace(/\{product\}/g, opts.cleanProductName);

      // 공백 정리
      s = s.replace(/\s{2,}/g, ' ').trim();

      // 2) 폐기 검사
      if (isBrokenSentence(s)) continue;
      if (isProductFallbackBroken(s)) continue;
      if (detectCrossLeafContamination(s, opts.productName, opts.categoryPath)) continue;
      if (hasFrequencyContradiction(s)) continue;

      // 3) cross-paragraph 동일 문장 제거 (상품명 변형 정규화 키)
      //   "에어플로 듀얼파워가 균형이에요" + "이 제품이 균형이에요" 처럼
      //   product 변형만 다른 동일 패턴은 같은 문장으로 보고 dedup.
      //   전략: 풀네임 + 모든 토큰 + "이 상품/제품/아이템" 을 모두 "__P__" 로 압축.
      const productRefs: string[] = [];
      if (opts.cleanProductName) productRefs.push(opts.cleanProductName);
      if (opts.cleanProductName) {
        const tokens = opts.cleanProductName.split(/\s+/).filter(t => t.length >= 2);
        // 부분 시퀀스 (앞 2/3 토큰)
        if (tokens.length >= 2) productRefs.push(tokens.slice(0, 2).join(' '));
        if (tokens.length >= 3) productRefs.push(tokens.slice(0, 3).join(' '));
        // 단일 토큰 (브랜드명)
        productRefs.push(...tokens);
      }
      // 길이 내림차순 (긴 것부터 매치)
      const sortedRefs = [...new Set(productRefs)].sort((a, b) => b.length - a.length);
      const productNorm = (str: string): string => {
        let out = str;
        for (const ref of sortedRefs) {
          if (!ref || ref.length < 2) continue;
          const esc = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          out = out.replace(new RegExp(esc, 'g'), '__P__');
        }
        out = out.replace(/이\s+(?:상품|제품|아이템)/g, '__P__');
        // 연속 __P__ 압축
        out = out.replace(/(__P__\s*){2,}/g, '__P__');
        // __P__ 직후 조사 제거 (서로 다른 조사로 같은 의미가 되는 케이스 dedup)
        out = out.replace(/__P__(이|가|은|는|을|를|에|의|로|으로|에서)/g, '__P__');
        return out;
      };
      const key = productNorm(s).replace(/[\s.,!?。]+/g, '').toLowerCase();
      // 짧은 문장은 dedup 대상이 아님 — 그대로 유지 (이전 버그: 짧으면 통째로 폐기)
      if (key.length >= 6) {
        if (seenAcross.has(key)) continue;
        seenAcross.add(key);
      }

      cleaned.push(s);
    }

    const deduped = dedupeWithinParagraph(cleaned);
    const joined = deduped.join(' ').trim();
    if (joined.length > 5) out.push(joined);
  }

  return out;
}

// 캡션(이미지 아래 짧은 텍스트)에도 동일 룰 적용
export function sanitizeReviewCaptions(
  captions: string[],
  opts: SanitizeOptions,
): string[] {
  const result = sanitizeStoryParagraphs(captions, opts);
  return result;
}
