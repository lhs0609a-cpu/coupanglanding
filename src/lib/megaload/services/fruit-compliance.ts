// ============================================================
// 과일/신선식품 표시규정 자동 준수 (쿠팡 신뢰관리센터 가이드)
//
// 원칙: "주장하려면 근거를 같이." 근거는 지어내지 않고 원본에서 찾는다.
//   - 당도(고당도) → 원본에서 Brix 추출되면 "고당도N브릭스"로 유지, 없으면 주장 삭제
//   - 원산지(유명산지/명산지) → 원본에서 실제 산지 추출되면 치환, 없으면 삭제
//   - 등급(특상품/최상품) → 기준 자동생성 불가 → 노출문구에선 삭제(등급은 고시에 사실 기재)
//
// 추출 소스: 상품명 + 노출명 + 태그 + 설명 + OCR 스펙 (네이버 원본이 거의 다 담고 있음)
// ============================================================

export interface FruitInfo {
  /** 당도 (Brix) — 예: 13 */
  brix?: number;
  /** 품질 등급 표현 — 예: "특상품" */
  grade?: string;
  /** 실제 산지 — 예: "청송" */
  origin?: string;
}

export interface FruitExtractSource {
  name?: string;
  displayName?: string;
  tags?: string[];
  description?: string;
  ocrSpecs?: Record<string, string>;
}

// ─── 신선식품/과일·채소 카테고리 판정 ──────────────────────────
// 가공식품/음료/즙 등은 표시규정 대상이 아니므로 제외(오탐 방지).
export function isFreshProduceCategory(categoryPath?: string, name?: string): boolean {
  const hay = `${categoryPath || ''} ${name || ''}`;
  if (!hay.trim()) return false;
  if (/가공|건강식품|음료|주스|즙|차류|커피|과자|스낵|통조림|즉석|소스|장류|조미료|말랭이|칩|건조/.test(hay)) {
    // path가 명시적으로 신선식품이면 가공 키워드가 있어도 신선으로 인정
    if (!/신선식품|>과일|>채소|>농산/.test(categoryPath || '')) return false;
  }
  return /(신선식품|농산물|농산|과일|채소|쌀|잡곡|나물|버섯|수산물|축산물)/.test(categoryPath || '')
    || /^(사과|배|감귤|귤|한라봉|천혜향|오렌지|레몬|자몽|포도|샤인머스캣|복숭아|자두|체리|딸기|블루베리|참외|수박|멜론|망고|키위|바나나|파인애플|토마토|방울토마토|대추|곶감|단감|모과)/.test((name || '').trim());
}

// ─── 잘 알려진 농산물 산지 사전 (시/군 우선) ──────────────────
// 셀러가 원본에 직접 쓴 산지만 옮기기 위한 화이트리스트. 여기 없는 일반 지명은 무시.
const ORIGIN_REGIONS: string[] = [
  // 사과
  '청송', '충주', '영주', '문경', '예산', '거창', '봉화', '밀양', '장수', '무주', '정선', '영월',
  // 배
  '나주', '천안', '안성', '상주', '평택', '울산',
  // 감귤/한라봉
  '서귀포', '제주',
  // 포도/샤인머스캣
  '영동', '옥천', '김천', '상주', '경산', '천안', '논산',
  // 참외/수박
  '성주', '의성', '고창', '부여', '함안', '논산', '진주',
  // 딸기
  '논산', '담양', '밀양', '진주', '산청', '거창', '하동',
  // 복숭아/자두
  '영동', '음성', '청도', '경산', '의성',
  // 채소/기타
  '해남', '영암', '무안', '신안', '고흥', '보성', '강진', '횡성', '홍천', '평창', '괴산', '단양',
  // 광역(폴백)
  '경북', '경남', '충북', '충남', '전북', '전남', '강원', '경기',
];

function buildHaystack(src: FruitExtractSource): string {
  return [
    src.name,
    src.displayName,
    (src.tags || []).join(' '),
    src.description,
    src.ocrSpecs ? Object.values(src.ocrSpecs).join(' ') : '',
  ].filter(Boolean).join('  ');
}

function extractBrix(t: string): number | undefined {
  // "13brix", "13.5 브릭스", "당도 13", "당도:12brix", "12°Bx"
  const m =
    t.match(/(?:당도\s*[:：]?\s*)?(\d{1,2}(?:\.\d)?)\s*(?:brix|브릭스|bx|°\s*bx)/i) ||
    t.match(/당도\s*[:：]?\s*(\d{1,2}(?:\.\d)?)\s*(?:도|이상)?/);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  // 과일 당도 현실 범위(5~30 Brix) 밖이면 오탐으로 간주
  return v >= 5 && v <= 30 ? v : undefined;
}

function extractGrade(t: string): string | undefined {
  // 긴 표현 우선
  for (const g of ['특상품', '최상품', '특선', '특품', '왕특']) {
    if (t.includes(g)) return g;
  }
  return undefined;
}

function extractOrigin(t: string): string | undefined {
  for (const r of ORIGIN_REGIONS) {
    if (t.includes(r)) return r;
  }
  return undefined;
}

/** 원본에서 과일 근거 데이터(당도/등급/산지)를 추출한다. 지어내지 않는다. */
export function extractFruitInfo(src: FruitExtractSource): FruitInfo {
  const hay = buildHaystack(src);
  return {
    brix: extractBrix(hay),
    grade: extractGrade(hay),
    origin: extractOrigin(hay),
  };
}

// ─── 주장 게이트 ──────────────────────────────────────────────
const BRIX_CLAIM_RE = /(고당도|당도\s*선별|꿀당도|당도\s*최고|당도\s*up|당도업|당도甲|당도\s*굿)/gi;
const GRADE_CLAIM_RE = /(특상품|최상품|특\s*품|왕특|특선)/g;
const ORIGIN_CLAIM_RE = /(유명\s*산지\s*직송|유명\s*산지|명품\s*산지|명산지)/g;

function cleanupSpacing(s: string): string {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/([,])\s*\1+/g, '$1')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

/**
 * 근거 없는 과일 주장을 제거하거나, 근거가 있으면 근거를 붙여 합법화한다.
 *   - 고당도 → (brix 있으면) "고당도N브릭스", 없으면 삭제
 *   - 유명산지 → (origin 있으면) 실제 산지로 치환, 없으면 삭제
 *   - 특상품/최상품 → 노출문구에선 삭제 (등급은 고시에 사실 기재)
 * info 가 null 이면 모든 주장을 삭제(보수적).
 */
export function sanitizeFruitClaims(text: string | undefined, info: FruitInfo | null): string {
  if (!text) return text ?? '';
  let s = text;

  // 당도
  if (info?.brix != null) {
    let used = false;
    s = s.replace(BRIX_CLAIM_RE, () => {
      if (used) return '';
      used = true;
      return `고당도${info.brix}브릭스`;
    });
  } else {
    s = s.replace(BRIX_CLAIM_RE, '');
  }

  // 등급 — 기준 자동 생성 불가 → 노출문구에서 제거 (등급 사실은 고시에 기재)
  s = s.replace(GRADE_CLAIM_RE, '');

  // 원산지 — 본문에 이미 산지가 있으면 주장 토큰만 제거(중복 방지), 없으면 첫 주장을 실제 산지로 치환
  if (info?.origin) {
    const alreadyHasOrigin = s.includes(info.origin);
    let used = false;
    s = s.replace(ORIGIN_CLAIM_RE, () => {
      if (alreadyHasOrigin || used) return '';
      used = true;
      return info.origin!;
    });
  } else {
    s = s.replace(ORIGIN_CLAIM_RE, '');
  }

  return cleanupSpacing(s);
}
