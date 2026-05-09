// ============================================================
// 카테고리 자동 매칭 서비스 (로컬 DB 우선 3-tier)
// Tier 1: 로컬 DB 토큰 매칭 (coupang-cat-index.json)
// Tier 2: 쿠팡 Predict API
// Tier 3: AI 키워드 추출 → 로컬 DB 재검색
// ============================================================

import type { CoupangAdapter } from '../adapters/coupang.adapter';
import { sanitizeSellerName } from './seller-name-sanitizer';
// ai.service 는 Tier 3 진입 시에만 dynamic import — Gemini SDK / forbidden-terms 모듈
// 로드 비용이 커서 cold start 절약 + 매처 모듈 단독 사용(테스트/유틸) 가능.

// ─── Types ───────────────────────────────────────────────────

export interface CategoryMatchResult {
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  confidence: number;
  source: 'local_db' | 'coupang_api' | 'ai';
}

export interface FailureDiagnostic {
  index: number;
  productName: string;
  tokens: string[];
  bestTier: string;       // 'none' | 'tier0' | 'tier1' | 'tier1.5' | 'tier2' | 'tier3'
  bestScore: number;
  bestCandidate?: string;
  reason: string;
}

// 쿠팡 API hang 시 단일 호출이 배치 전체를 막지 않도록 강제 timeout.
// 어댑터 자체 timeout(30s)이 호출별로 누적되면 50건 배치가 분 단위로 늘어남.
function withFastTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`fast-timeout ${ms}ms`)), ms),
    ),
  ]);
}

/** Index entry: [code, tokensString, leafName, depth] */
type IndexEntry = [string, string, string, number];

/** Details entry from coupang-cat-details.json */
interface CategoryDetailRaw {
  p: string;       // full path
  r: number;       // commission rate
  b: { n: string; r: boolean; u?: string; c1?: boolean }[];  // buy options
  s: { n: string; r: boolean; u?: string }[];                 // search options
  nc: string | null; // notice category
}

export interface CategoryDetails {
  path: string;
  commission: number;
  buyOptions: { name: string; required: boolean; unit?: string; choose1?: boolean }[];
  searchOptions: { name: string; required: boolean; unit?: string }[];
  noticeCategory: string | null;
}

/** 네이버→쿠팡 매핑 엔트리 (naver-to-coupang-map.json의 map 값) */
interface NaverMapEntry {
  c: string;   // coupang code
  n: number;   // confidence
  m: string;   // method initial: 'e'|'p'|'c'
}

// ─── Lazy-loaded data singletons ─────────────────────────────

// JSON 직접 import (Vercel 서버리스 번들링 보장)
import indexJson from '../data/coupang-cat-index.json';
import detailsJson from '../data/coupang-cat-details.json';

let _indexData: IndexEntry[] | null = null;
let _detailsData: Record<string, CategoryDetailRaw> | null = null;
let _naverMap: Record<string, NaverMapEntry> | null = null;
// leaf 이름(소문자) → IndexEntry 들. 입력이 leaf 이름과 정확 일치하면 즉시 그 카테고리.
// "(방문설치)인덕션" / "Micro-ATX" / "낫" 처럼 기존 토크나이저로 매칭이 어려운
// 케이스를 결정론적으로 해결.
let _exactLeafMap: Map<string, IndexEntry[]> | null = null;

/** 네이버→쿠팡 매핑 테이블 로드 (파일 없으면 빈 객체) */
function loadNaverMap(): Record<string, NaverMapEntry> {
  if (_naverMap) return _naverMap;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mapJson = require('../data/naver-to-coupang-map.json');
    _naverMap = (mapJson.map || {}) as Record<string, NaverMapEntry>;
  } catch {
    _naverMap = {};
  }
  return _naverMap;
}

function loadIndex(): IndexEntry[] {
  if (_indexData) return _indexData;
  _indexData = indexJson as IndexEntry[];
  return _indexData;
}

function loadDetails(): Record<string, CategoryDetailRaw> {
  if (_detailsData) return _detailsData;
  _detailsData = detailsJson as unknown as Record<string, CategoryDetailRaw>;
  return _detailsData;
}

/** leaf 이름(소문자) → 해당 leaf 가 등장하는 IndexEntry 들. lazy build. */
function loadExactLeafMap(): Map<string, IndexEntry[]> {
  if (_exactLeafMap) return _exactLeafMap;
  const map = new Map<string, IndexEntry[]>();
  const addAlias = (key: string, entry: IndexEntry) => {
    const k = key.toLowerCase().trim();
    if (!k || k.length < 2) return;
    const list = map.get(k);
    if (list) {
      if (!list.some(e => e[0] === entry[0])) list.push(entry);
    } else {
      map.set(k, [entry]);
    }
  };
  for (const entry of loadIndex()) {
    const leaf = (entry[2] || '').trim();
    if (!leaf) continue;
    // 1) 원본 leaf 이름
    addAlias(leaf, entry);
    // 2) 슬래시·하이픈·괄호로 분리된 부분도 alias 로 등록
    //    "양파/파/부추김치" → ["양파", "파", "부추김치"], "물김치/동치미" → ["물김치","동치미"]
    //    셀러가 줄임말("파김치") 또는 단일 토큰("파")으로 입력해도 leaf 매칭 가능.
    //    "파" 같이 1글자 토큰은 addAlias 의 length < 2 가드로 자동 제외.
    if (/[\/\-]/.test(leaf)) {
      const parts = leaf.split(/[\/\-]+/).map(p => p.trim()).filter(Boolean);
      for (const p of parts) addAlias(p, entry);
    }
    // 3) 공백 제거 버전 ("양파/파/부추김치" → "양파파부추김치", "사과 배 과일세트" → "사과배과일세트")
    const compact = leaf.replace(/[\s\/\-]+/g, '');
    if (compact !== leaf) addAlias(compact, entry);
  }
  _exactLeafMap = map;
  return _exactLeafMap;
}

// substring 검사용 — multi-segment(공백/슬래시 포함) 이고 길이 >= 6 인 leaf 만.
// 짧거나 단일 단어 leaf 는 일반 단어와 충돌 위험이 커서 제외.
let _substringLeaves: { leafLower: string; entry: IndexEntry }[] | null = null;
function loadSubstringLeaves(): { leafLower: string; entry: IndexEntry }[] {
  if (_substringLeaves) return _substringLeaves;
  const list: { leafLower: string; entry: IndexEntry }[] = [];
  for (const entry of loadIndex()) {
    const leaf = entry[2] || '';
    if (leaf.length < 6) continue;
    if (!/[\s\/]/.test(leaf)) continue; // multi-segment 만
    list.push({ leafLower: leaf.toLowerCase(), entry });
  }
  // 길이 desc — 더 specific(긴) leaf 우선 매칭
  list.sort((a, b) => b.leafLower.length - a.leafLower.length);
  _substringLeaves = list;
  return _substringLeaves;
}

/**
 * 입력이 카테고리 leaf 이름과 정확 일치하는지 검사하고, 일치 시 결정론적으로 매칭.
 * 동명이의(같은 leaf 가 여러 path) 인 경우 가장 얕은 depth 우선 (대분류 가까운 쪽).
 * - "(방문설치)인덕션" → 105778
 * - "Micro-ATX" → 63068
 * - "낫" → 78544
 *
 * 실제 상품명("신선 망고 5kg") 은 leaf 와 정확 일치하지 않으므로 발동 안 됨.
 */
/**
 * 입력에 카테고리 leaf 이름이 substring 으로 포함되면 그 카테고리로 결정.
 * "정품 선물용 못난이 사과/배 과일세트 ..." → "사과/배 과일세트" leaf(72531) 매칭.
 *
 * 안전성: multi-segment(공백/슬래시 포함) 이고 길이 >= 6 leaf 만 후보. 가장 긴
 * leaf 우선(more specific). 짧은 단일 단어 leaf 는 false positive 위험으로 제외.
 *
 * 동명이의 leaf 가 substring 으로 매칭된 경우 가장 얕은 depth 우선.
 */
function leafSubstringMatch(productName: string): CategoryMatchResult | null {
  const text = productName.toLowerCase();
  if (text.length < 6) return null;
  for (const { leafLower, entry } of loadSubstringLeaves()) {
    if (text.includes(leafLower)) {
      // 동일 leaf 의 동명이의 후보 중 가장 얕은 depth + 작은 코드 우선
      const dupes = loadExactLeafMap().get(leafLower) || [entry];
      const sorted = [...dupes].sort((a, b) =>
        a[3] - b[3] || a[0].localeCompare(b[0])
      );
      const [code, , leafName] = sorted[0];
      const detail = loadDetails()[code];
      return {
        categoryCode: code,
        categoryName: leafName,
        categoryPath: detail?.p || leafName,
        confidence: 0.97,
        source: 'local_db',
      };
    }
  }
  return null;
}

/**
 * 토큰 단위 leaf 매칭 — 상품명 토큰 중 하나가 leaf 이름과 정확 일치하면 그 leaf 반환.
 * 마케팅 어휘 위주 토큰("국산/재료만/사용된/순도") + 진짜 카테고리 토큰("갓김치") 조합처럼
 * 다른 토큰 점수 부족으로 Tier 1 score threshold 미달하는 케이스 복구.
 *
 * 안전장치:
 *   - 토큰 길이 ≥ 2 (1글자 false positive 차단)
 *   - leaf 이름과 정확 일치만 (substring 매칭 X)
 *   - 후보 여러 개면 depth 깊은(specific) 카테고리 우선
 */
function findLeafByToken(tokens: string[]): CategoryMatchResult | null {
  if (!tokens || tokens.length === 0) return null;
  const map = loadExactLeafMap();
  type Cand = { code: string; leafName: string; depth: number; tokenLen: number };
  const candidates: Cand[] = [];
  for (const tok of tokens) {
    if (!tok || tok.length < 2) continue;
    const entries = map.get(tok.toLowerCase());
    if (!entries) continue;
    for (const [code, , leafName, depth] of entries) {
      candidates.push({ code, leafName, depth, tokenLen: tok.length });
    }
  }
  if (candidates.length === 0) return null;
  // 깊은 카테고리 우선 (구체적인 leaf 가 더 정확) → 토큰 길이 긴 것 우선 → 코드 작은 것
  candidates.sort((a, b) => b.depth - a.depth || b.tokenLen - a.tokenLen || a.code.localeCompare(b.code));
  const winner = candidates[0];
  const detail = loadDetails()[winner.code];
  return {
    categoryCode: winner.code,
    categoryName: winner.leafName,
    categoryPath: detail?.p || winner.leafName,
    confidence: 0.85,
    source: 'local_db',
  };
}

function exactLeafMatch(productName: string): CategoryMatchResult | null {
  const trimmed = productName.trim();
  const key = trimmed.toLowerCase();
  if (!key) return null;
  const entries = loadExactLeafMap().get(key);
  if (!entries || entries.length === 0) return null;
  // 우선순위: (1) case-sensitive 정확 일치 → (2) 얕은 depth → (3) 코드 작은 쪽.
  // "Visual Basic" 입력 시 leaf "Visual Basic" 이 leaf "Visual BASIC" 보다 우선.
  const sorted = [...entries].sort((a, b) => {
    const aExact = a[2] === trimmed ? 0 : 1;
    const bExact = b[2] === trimmed ? 0 : 1;
    return aExact - bExact || a[3] - b[3] || a[0].localeCompare(b[0]);
  });
  const [code, , leafName] = sorted[0];
  const detail = loadDetails()[code];
  return {
    categoryCode: code,
    categoryName: leafName,
    categoryPath: detail?.p || leafName,
    confidence: 0.99,
    source: 'local_db',
  };
}

// ─── 직접 카테고리 코드 매핑 (최고 우선순위) ─────────────────
// 상품명 토큰 → 쿠팡 displayCategoryCode 직접 매핑
// 토큰 점수 계산 없이 바로 정확한 카테고리로 연결
const DIRECT_CODE_MAP: Record<string, { code: string; path: string }> = {
  // ── 식품 > 김치 별칭 (셀러 줄임말 ≠ 쿠팡 leaf) ──
  '백김치': { code: '73057', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>포기김치' },
  '파김치': { code: '58180', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>양파/파/부추김치' },
  '대파김치': { code: '58180', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>양파/파/부추김치' },
  '쪽파김치': { code: '58180', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>양파/파/부추김치' },
  '깻잎김치': { code: '58443', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>기타김치' },
  '갓김치': { code: '58442', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>갓김치' },
  '겉절이': { code: '73060', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>겉절이김치' },
  '맛김치': { code: '73058', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>맛김치' },
  '묵은지': { code: '58181', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>묵은지' },
  '동치미': { code: '58441', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>물김치/동치미' },
  '물김치': { code: '58441', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>물김치/동치미' },
  '나박김치': { code: '58441', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>물김치/동치미' },
  '깍두기': { code: '58440', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>깍두기' },
  '총각김치': { code: '58444', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>총각김치' },
  '알타리김치': { code: '58444', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>총각김치' },
  '알타리': { code: '58444', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>총각김치' },
  '알타리무': { code: '58444', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>총각김치' },
  '알타리무김치': { code: '58444', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>총각김치' },
  '오이소박이': { code: '58182', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>오이소박이' },
  '오이김치': { code: '58182', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>오이소박이' },
  '열무김치': { code: '58445', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>열무김치' },
  '포기김치': { code: '73057', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>포기김치' },
  '배추김치': { code: '73057', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>포기김치' },
  '볶음김치': { code: '73059', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>볶음김치' },
  '고들빼기': { code: '58179', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>고들빼기' },
  '김치양념': { code: '73062', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>김치양념' },
  '부추김치': { code: '58180', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>양파/파/부추김치' },
  '양파김치': { code: '58180', path: '식품>냉장/냉동식품>김치/반찬/젓갈>김치>양파/파/부추김치' },
  // ── 건강식품 > 비타민/미네랄 ──
  '비오틴': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '바이오틴': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '비타민a': { code: '58907', path: '식품>건강식품>비타민/미네랄>비타민A' },
  '비타민b': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b군': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민c': { code: '58909', path: '식품>건강식품>비타민/미네랄>비타민C' },
  '비타민d': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민e': { code: '58911', path: '식품>건강식품>비타민/미네랄>비타민E' },
  '비타민k': { code: '58912', path: '식품>건강식품>비타민/미네랄>비타민K' },
  '멀티비타민': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  '종합비타민': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  '마그네슘': { code: '58931', path: '식품>건강식품>비타민/미네랄>마그네슘' },
  '아연': { code: '58930', path: '식품>건강식품>비타민/미네랄>아연' },
  '셀레늄': { code: '58934', path: '식품>건강식품>비타민/미네랄>셀레늄' },
  '엽산': { code: '102535', path: '식품>건강식품>비타민/미네랄>엽산' },
  '철분': { code: '58922', path: '식품>건강식품>비타민/미네랄>철분' },
  '칼슘': { code: '58921', path: '식품>건강식품>비타민/미네랄>칼슘' },
  '요오드': { code: '58933', path: '식품>건강식품>비타민/미네랄>요오드' },
  '크롬': { code: '102536', path: '식품>건강식품>비타민/미네랄>크롬' },
  // ── 건강식품 > 기타건강식품 ──
  '오메가3': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '오메가': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  '밀크씨슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '밀크시슬': { code: '58926', path: '식품>건강식품>기타건강식품>밀크시슬' },
  '루테인': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '유산균': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '프로바이오틱스': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '락토바실러스': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '글루코사민': { code: '58927', path: '식품>건강식품>기타건강식품>글루코사민' },
  '콜라겐': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  '히알루론산': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  '코큐텐': { code: '58972', path: '식품>건강식품>기타건강식품>코엔자임Q10/코큐텐' },
  '코엔자임': { code: '58972', path: '식품>건강식품>기타건강식품>코엔자임Q10/코큐텐' },
  '프로폴리스': { code: '58905', path: '식품>건강식품>기타건강식품>프로폴리스' },
  '스피루리나': { code: '58902', path: '식품>건강식품>기타건강식품>스피루리나' },
  '클로렐라': { code: '58901', path: '식품>건강식품>기타건강식품>클로렐라' },
  '쏘팔메토': { code: '58924', path: '식품>건강식품>기타건강식품>쏘팔메토' },
  '마카': { code: '102530', path: '식품>건강식품>기타건강식품>마카' },
  '보스웰리아': { code: '112304', path: '식품>건강식품>기타건강식품>보스웰리아' },
  '크릴오일': { code: '112307', path: '식품>건강식품>기타건강식품>크릴오일' },
  '폴리코사놀': { code: '58929', path: '식품>건강식품>기타건강식품>폴리코사놀' },
  '알로에': { code: '58938', path: '식품>건강식품>기타건강식품>알로에정/알로에겔' },
  '토코페롤': { code: '58982', path: '식품>건강식품>기타건강식품>토코페롤' },
  '맥주효모': { code: '73132', path: '식품>건강식품>비타민/미네랄>바이오틴' },
  '감마리놀렌산': { code: '58925', path: '식품>건강식품>기타건강식품>감마리놀렌산' },
  '초록입홍합': { code: '112306', path: '식품>건강식품>기타건강식품>초록입홍합' },
  '레시틴': { code: '102522', path: '식품>건강식품>기타건강식품>레시틴' },
  '레스베라트롤': { code: '102519', path: '식품>건강식품>기타건강식품>레스베라트롤' },
  // ── 건강식품 > 전통건강식품 ──
  '홍삼': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  '홍삼정': { code: '58889', path: '식품>건강식품>전통건강식품>홍삼>홍삼농축액/홍삼정' },
  // ── 건강식품 > 헬스/다이어트 ──
  '프로틴': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '프로틴파우더': { code: '73141', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>복합 프로틴 파우더' },
  '크레아틴': { code: '73145', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>크레아틴' },
  '아르기닌': { code: '102545', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>L-아르기닌' },
  '가르시니아': { code: '102537', path: '식품>건강식품>헬스/다이어트식품>가르시니아' },
  'bcaa': { code: '102541', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>BCAA' },
  '타우린': { code: '102542', path: '식품>건강식품>헬스/다이어트식품>헬스보충식품>타우린' },
  // ── 생활용품 ──
  '화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '주방세제': { code: '63961', path: '생활용품>세제>주방세제>일반주방세제' },
  '섬유유연제': { code: '63950', path: '생활용품>세제>섬유유연제>일반 섬유유연제' },
  // ── 자동차 ──
  '와이퍼': { code: '78710', path: '자동차용품>실외용품>와이퍼>플랫와이퍼' },
  // ── 가구 ──
  '접이식테이블': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  '접이식': { code: '77950', path: '가구>주방가구>식탁테이블>접이식식탁' },
  // ── 식품 ──
  '꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  '벌꿀': { code: '58900', path: '식품>가공즉석식품>시럽>일반꿀' },
  // ── 가전/디지털 ──
  '충전케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  '데이터케이블': { code: '62691', path: '가전/디지털>휴대폰액세서리>배터리충전기>충전 케이블' },
  // ── 뷰티 ──
  '레티놀': { code: '56171', path: '뷰티>스킨>에센스/세럼/앰플>에센스/세럼' },
  '넥크림': { code: '56169', path: '뷰티>스킨>크림>넥크림' },
  '넥케어': { code: '56169', path: '뷰티>스킨>크림>넥크림' },
  '목크림': { code: '56169', path: '뷰티>스킨>크림>넥크림' },
  '바디워시': { code: '56213', path: '뷰티>바디>샤워/입욕용품>바디워시' },
  '바디로션': { code: '56222', path: '뷰티>바디>바디케어>바디로션' },
  '바디크림': { code: '56223', path: '뷰티>바디>바디케어>바디크림' },
  '바디오일': { code: '56224', path: '뷰티>바디>바디케어>바디오일' },
  '바디미스트': { code: '56226', path: '뷰티>바디>바디케어>바디미스트' },
  '바디스크럽': { code: '56214', path: '뷰티>바디>샤워/입욕용품>바디스크럽' },
  '핸드크림': { code: '56236', path: '뷰티>바디>핸드/풋 케어>핸드케어>핸드크림' },
  '핸드워시': { code: '56234', path: '뷰티>바디>핸드/풋 케어>핸드케어>핸드워시' },
  '샴푸': { code: '56280', path: '뷰티>헤어>샴푸>일반샴푸' },
  '아이크림': { code: '56168', path: '뷰티>스킨>크림>아이크림' },
  '선크림': { code: '56196', path: '뷰티>스킨>선케어/태닝>선블록/선크림/선로션' },
  '자외선차단': { code: '56196', path: '뷰티>스킨>선케어/태닝>선블록/선크림/선로션' },
  '선블록': { code: '56196', path: '뷰티>스킨>선케어/태닝>선블록/선크림/선로션' },
  '립스틱': { code: '56429', path: '뷰티>메이크업>립메이크업>립스틱' },
  '립틴트': { code: '56428', path: '뷰티>메이크업>립메이크업>립틴트' },
  '치약': { code: '63981', path: '생활용품>구강/면도>치약' },
  '칫솔': { code: '63982', path: '생활용품>구강/면도>칫솔' },
  // ── 뷰티 > 클렌징 (스크린샷 실패 케이스 — 토큰 누락으로 도서/임산부 등으로 오매칭) ──
  '클렌징폼': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '폼클렌징': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '폼클렌저': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '클렌징폼클렌저': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '딥클렌징폼': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '오일투폼': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '거품클렌저': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '클렌징젤': { code: '56125', path: '뷰티>스킨>클렌징>클렌징 젤' },
  '젤클렌저': { code: '56125', path: '뷰티>스킨>클렌징>클렌징 젤' },
  '젤클렌징': { code: '56125', path: '뷰티>스킨>클렌징>클렌징 젤' },
  '클렌징비누': { code: '56127', path: '뷰티>스킨>클렌징>클렌징 비누' },
  '클렌징로션': { code: '56130', path: '뷰티>스킨>클렌징>클렌징 로션/밀크' },
  '클렌징밀크': { code: '56130', path: '뷰티>스킨>클렌징>클렌징 로션/밀크' },
  '클렌징크림': { code: '56132', path: '뷰티>스킨>클렌징>클렌징 크림/밤' },
  '클렌징밤': { code: '56132', path: '뷰티>스킨>클렌징>클렌징 크림/밤' },
  '클렌징파우더': { code: '56135', path: '뷰티>스킨>클렌징>클렌징 파우더' },
  '클렌징오일': { code: '56137', path: '뷰티>스킨>클렌징>클렌징 오일' },
  '클렌징워터': { code: '56140', path: '뷰티>스킨>클렌징>클렌징 워터' },
  '클렌징티슈': { code: '56142', path: '뷰티>스킨>클렌징>클렌징 티슈/시트' },
  '클렌징시트': { code: '56142', path: '뷰티>스킨>클렌징>클렌징 티슈/시트' },
  '리무버': { code: '56144', path: '뷰티>스킨>클렌징>립앤아이리무버' },
  '메이크업리무버': { code: '56144', path: '뷰티>스킨>클렌징>립앤아이리무버' },
  '클렌징세트': { code: '56147', path: '뷰티>스킨>클렌징>클렌징세트' },
  '세안제': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  // ── 뷰티 > 필링/스크럽 ──
  '페이스스크럽': { code: '56151', path: '뷰티>스킨>필링>페이스 스크럽' },
  '얼굴스크럽': { code: '56151', path: '뷰티>스킨>필링>페이스 스크럽' },
  '필링젤': { code: '56153', path: '뷰티>스킨>필링>필링 젤/고마쥬' },
  '고마쥬': { code: '56153', path: '뷰티>스킨>필링>필링 젤/고마쥬' },
  '필링파우더': { code: '56154', path: '뷰티>스킨>필링>필링 파우더' },
  '필링토너': { code: '56155', path: '뷰티>스킨>필링>필링 토너' },
  '필링크림': { code: '74527', path: '뷰티>스킨>필링>필링 크림' },
  '필링패드': { code: '74528', path: '뷰티>스킨>필링>필링 패드' },
  '각질제거': { code: '56153', path: '뷰티>스킨>필링>필링 젤/고마쥬' },
  '각질케어': { code: '56153', path: '뷰티>스킨>필링>필링 젤/고마쥬' },
  // 단일 토큰은 동음이의 위험 있음. compound("폼클렌징"/"클렌징젤") 우선
  // "클렌징"만 단독으로 들어왔을 때 폴백용 — 폼이 가장 일반적
  '클렌징': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  '클렌저': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  // ── 영문 키워드 (해외직구/영문 상품명 대응) ──
  'vitamin': { code: '58913', path: '식품>건강식품>비타민/미네랄>멀티비타민' },
  'vitamina': { code: '58907', path: '식품>건강식품>비타민/미네랄>비타민A' },
  'vitaminb': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  'vitaminc': { code: '58909', path: '식품>건강식품>비타민/미네랄>비타민C' },
  'vitamind': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  'vitamind3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  'vitamine': { code: '58911', path: '식품>건강식품>비타민/미네랄>비타민E' },
  'vitamink': { code: '58912', path: '식품>건강식품>비타민/미네랄>비타민K' },
  'omega': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  'lutein': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  'probiotics': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  'collagen': { code: '59163', path: '식품>건강식품>기타건강식품>콜라겐/히알루론산' },
  'retinol': { code: '56171', path: '뷰티>스킨>에센스/세럼/앰플>에센스/세럼' },
  'cleanser': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  'cleansing': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  'foamcleanser': { code: '56122', path: '뷰티>스킨>클렌징>클렌징 폼' },
  'cleansingoil': { code: '56137', path: '뷰티>스킨>클렌징>클렌징 오일' },
  'cleansingwater': { code: '56140', path: '뷰티>스킨>클렌징>클렌징 워터' },
  'cleansingbalm': { code: '56132', path: '뷰티>스킨>클렌징>클렌징 크림/밤' },
  'micellar': { code: '56140', path: '뷰티>스킨>클렌징>클렌징 워터' },
  'scrub': { code: '56151', path: '뷰티>스킨>필링>페이스 스크럽' },
  'peeling': { code: '56153', path: '뷰티>스킨>필링>필링 젤/고마쥬' },
  'remover': { code: '56144', path: '뷰티>스킨>클렌징>립앤아이리무버' },
  // ── 숫자 결합형 변형 ──
  '비타민d3': { code: '58910', path: '식품>건강식품>비타민/미네랄>비타민D' },
  '비타민b2': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b6': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '비타민b12': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  '오메가369': { code: '73134', path: '식품>건강식품>기타건강식품>오메가3,6,9' },
  // ── 한글 복합어 (띄어쓰기 없이 붙어서 쓰는 경우) ──
  '프로바이오틱': { code: '58991', path: '식품>건강식품>기타건강식품>유산균' },
  '롤화장지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '롤휴지': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '두루마리': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '미용티슈': { code: '63900', path: '생활용품>화장지물티슈>일반롤화장지' },
  '물티슈': { code: '63908', path: '생활용품>화장지/물티슈>화장지/티슈>물티슈' },
  // ── 동명이의 카테고리 해소 (일반 용도 우선) ──
  '온도계': { code: '64652', path: '생활용품>건강용품>체온/혈압>온도계' },
  '이발기': { code: '63834', path: '가전/디지털>이미용건강가전>이발기' },
  '정수기': { code: '63713', path: '가전/디지털>주방가전>정수기' },
  '스피커': { code: '63264', path: '가전/디지털>음향기기>스피커' },
  '필터': { code: '63358', path: '가전/디지털>계절환경가전>공기청정기>필터' },
  '배터리': { code: '62757', path: '가전/디지털>카메라/캠코더>배터리' },
  '헬멧': { code: '81754', path: '스포츠/레져>자전거>헬멧' },
  '침낭': { code: '81828', path: '스포츠/레져>캠핑>침낭' },
  '백팩': { code: '62794', path: '가전/디지털>노트북>가방/백팩>백팩' },
  '수건': { code: '64476', path: '생활용품>욕실용품>수건' },
  '구강청결제': { code: '63983', path: '생활용품>구강/면도>구강청결제' },
  '탈취제': { code: '68036', path: '패션의류잡화>신발/운동화>탈취제' },
  '젖병': { code: '76953', path: '출산/유아동>수유/이유용품>젖병' },
  // 유아물티슈 — "아기물티슈"가 반려동물 물티슈로 오매칭되는 문제 방지
  '유아물티슈': { code: '76872', path: '출산/유아동>유아물티슈/캡/홀더>유아물티슈' },
  '아기물티슈': { code: '76872', path: '출산/유아동>유아물티슈/캡/홀더>유아물티슈' },
  '유아건티슈': { code: '76871', path: '출산/유아동>유아물티슈/캡/홀더>유아건티슈' },
  '올인원': { code: '56176', path: '뷰티>스킨케어>올인원' },
  '쿨매트': { code: '78063', path: '가구/홈데코>침구>쿨매트' },
  '제면기': { code: '63745', path: '가전/디지털>주방가전>제면기' },
  '안전삼각대': { code: '78821', path: '자동차용품>비상/안전>안전삼각대' },
  '마스크': { code: '70690', path: '패션의류잡화>기타패션잡화>마스크' },
  '줄자': { code: '64255', path: '생활용품>공구>줄자' },
  '재떨이': { code: '64658', path: '생활용품>생활잡화>재떨이' },
  '박스테이프': { code: '64335', path: '생활용품>접착용품>박스테이프' },
  '양면테이프': { code: '64337', path: '생활용품>접착용품>양면테이프' },
  '지퍼백': { code: '80651', path: '주방용품>보관/밀폐용기>지퍼백' },
  '아이스팩': { code: '80639', path: '주방용품>보온/보냉용품>아이스팩' },
  '루테인지아잔틴': { code: '58920', path: '식품>건강식품>기타건강식품>루테인' },
  '비타민b컴플렉스': { code: '58908', path: '식품>건강식품>비타민/미네랄>비타민B군' },
  // ── 신선식품 > 과일류 ──
  // 셀러 키워드 스터핑("사과/배 과일세트")으로 인한 오매칭 방지: Tier 0에서 직접 결정.
  // 단일문자 한글(배/감/무)은 동음이의 위험 커서 제외 — DIRECT 대신 localMatch에 맡김.
  '사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '오렌지': { code: '59363', path: '식품>신선식품>과일류>과일>오렌지' },
  '네이블': { code: '59363', path: '식품>신선식품>과일류>과일>오렌지' },
  '발렌시아': { code: '59363', path: '식품>신선식품>과일류>과일>오렌지' },
  '참외': { code: '59378', path: '식품>신선식품>과일류>과일>참외' },
  '토마토': { code: '72498', path: '식품>신선식품>과일류>과일>토마토' },
  '방울토마토': { code: '72498', path: '식품>신선식품>과일류>과일>토마토' },
  '대저토마토': { code: '72498', path: '식품>신선식품>과일류>과일>토마토' },
  '망고': { code: '59393', path: '식품>신선식품>과일류>과일>망고' },
  '메론': { code: '59377', path: '식품>신선식품>과일류>과일>메론' },
  '멜론': { code: '59377', path: '식품>신선식품>과일류>과일>메론' },
  '카라향': { code: '59377', path: '식품>신선식품>과일류>과일>메론' },
  '수박': { code: '59376', path: '식품>신선식품>과일류>과일>수박' },
  '복숭아': { code: '72499', path: '식품>신선식품>과일류>과일>복숭아' },
  '자두': { code: '59374', path: '식품>신선식품>과일류>과일>자두' },
  '포도': { code: '72500', path: '식품>신선식품>과일류>과일>포도' },
  '귤': { code: '59359', path: '식품>신선식품>과일류>과일>귤' },
  '한라봉': { code: '59359', path: '식품>신선식품>과일류>과일>귤' },
  '천혜향': { code: '59359', path: '식품>신선식품>과일류>과일>귤' },
  '레몬': { code: '59364', path: '식품>신선식품>과일류>과일>레몬' },
  '체리': { code: '59382', path: '식품>신선식품>과일류>과일>체리' },
  '블루베리': { code: '59383', path: '식품>신선식품>과일류>과일>블루베리' },
  '딸기': { code: '59380', path: '식품>신선식품>과일류>과일>딸기' },
  '파인애플': { code: '59391', path: '식품>신선식품>과일류>과일>파인애플' },
  '자몽': { code: '59388', path: '식품>신선식품>과일류>과일>자몽' },
  '바나나': { code: '59390', path: '식품>신선식품>과일류>과일>바나나' },
  '두리안': { code: '72506', path: '식품>신선식품>과일류>과일>두리안' },
  '석류': { code: '59389', path: '식품>신선식품>과일류>과일>석류' },
  '매실': { code: '59387', path: '식품>신선식품>과일류>과일>매실' },
  '오디': { code: '59385', path: '식품>신선식품>과일류>과일>오디' },
  '무화과': { code: '72503', path: '식품>신선식품>과일류>과일>무화과' },
  '용과': { code: '72511', path: '식품>신선식품>과일류>과일>용과' },
  '람부탄': { code: '72509', path: '식품>신선식품>과일류>과일>람부탄' },
  '코코넛': { code: '72507', path: '식품>신선식품>과일류>과일>코코넛' },
  '살구': { code: '59375', path: '식품>신선식품>과일류>과일>살구' },
  // ── 신선식품 > 채소류 ──
  '오이': { code: '59297', path: '식품>신선식품>채소류>열매채소>오이' },
  '당근': { code: '59290', path: '식품>신선식품>채소류>뿌리채소>당근' },
  '감자': { code: '59289', path: '식품>신선식품>채소류>감자/고구마>감자' },
  '양파': { code: '59308', path: '식품>신선식품>채소류>뿌리채소>양파' },
  '마늘': { code: '59310', path: '식품>신선식품>채소류>뿌리채소>마늘' },
  '대파': { code: '59316', path: '식품>신선식품>채소류>나물/잎줄기채소>대파' },
  '상추': { code: '59336', path: '식품>신선식품>채소류>쌈채소/샐러드채소>상추' },
  '배추': { code: '59318', path: '식품>신선식품>채소류>나물/잎줄기채소>배추' },
  '호박': { code: '59299', path: '식품>신선식품>채소류>열매채소>호박' },
  '고추': { code: '59304', path: '식품>신선식품>채소류>열매채소>고추' },
  '피망': { code: '59306', path: '식품>신선식품>채소류>열매채소>피망' },
  '파프리카': { code: '59307', path: '식품>신선식품>채소류>열매채소>파프리카' },
  '시금치': { code: '59331', path: '식품>신선식품>채소류>나물/잎줄기채소>시금치' },
  '브로콜리': { code: '59350', path: '식품>신선식품>채소류>나물/잎줄기채소>브로콜리' },
  '콩나물': { code: '59282', path: '식품>신선식품>채소류>콩나물/숙주나물>콩나물' },
  '쪽파': { code: '59317', path: '식품>신선식품>채소류>나물/잎줄기채소>쪽파' },
  // ── 지역명+과일 합성어 (단일 한글 "배" 는 동음이의 위험으로 split 불가, 직접 매핑) ──
  '나주배': { code: '59357', path: '식품>신선식품>과일류>과일>배' },
  '신고배': { code: '59357', path: '식품>신선식품>과일류>과일>배' },
  '안성배': { code: '59357', path: '식품>신선식품>과일류>과일>배' },
  '천안배': { code: '59357', path: '식품>신선식품>과일류>과일>배' },
  '울산배': { code: '59357', path: '식품>신선식품>과일류>과일>배' },
  '청송사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '안동사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '영주사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '충주사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '문경사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  '의성사과': { code: '59356', path: '식품>신선식품>과일류>과일>사과' },
  // ── 주방용품 > 쌀통/잡곡통 ──
  '쌀통': { code: '80592', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>쌀통/쌀독' },
  '쌀독': { code: '80592', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>쌀통/쌀독' },
  '쌀항아리': { code: '80592', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>쌀통/쌀독' },
  '진공쌀통': { code: '80592', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>쌀통/쌀독' },
  '잡곡통': { code: '80593', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>잡곡통/시리얼통' },
  '시리얼통': { code: '80593', path: '주방용품>보관/밀폐용기>쌀통/잡곡통>잡곡통/시리얼통' },
};

// ─── 동의어/별칭 사전 (토큰 확장) ────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  // 뷰티
  '선크림': ['선크림', '선로션', '자외선차단'],
  '수분크림': ['수분크림', '데이크림'],
  '레티놀': ['레티놀', '주름개선', '에센스', '세럼'],
  '넥케어': ['넥케어', '넥크림', '목크림'],
  '넥크림': ['넥크림', '넥케어', '목크림'],
  '목크림': ['목크림', '넥크림', '넥케어'],
  '마스크팩': ['마스크팩', '시트마스크', '시트'],
  '세럼': ['세럼', '에센스'],
  '에센스': ['에센스', '세럼'],
  '린스': ['린스', '컨디셔너'],
  '립밤': ['립밤', '보습', '케어'],
  '파운데이션': ['파운데이션', '리퀴드'],
  '쿠션': ['쿠션', '쿠션파운데이션'],
  // 건강식품 — 비타민/미네랄
  '비오틴': ['비오틴', '바이오틴'],
  '바이오틴': ['바이오틴', '비오틴'],
  '비타민b': ['비타민b', '비타민b군'],
  '오메가3': ['오메가3', '오메가3지방산', '오메가'],
  '프로바이오틱스': ['프로바이오틱스', '유산균'],
  '유산균': ['유산균', '프로바이오틱스'],
  '프로바이오틱': ['프로바이오틱', '프로바이오틱스', '유산균'],
  '락토바실러스': ['락토바실러스', '유산균', '프로바이오틱스'],
  '종합비타민': ['종합비타민', '멀티비타민'],
  '멀티비타민': ['멀티비타민', '종합비타민'],
  '콜라겐': ['콜라겐', '히알루론산', '피쉬콜라겐'],
  '밀크씨슬': ['밀크씨슬', '밀크시슬', '간건강'],
  '프로틴': ['프로틴', '프로틴파우더'],
  '단백질': ['단백질', '프로틴', '프로틴파우더'],
  '코큐텐': ['코큐텐', '코엔자임q10', '코엔자임'],
  '코엔자임': ['코엔자임', '코큐텐', '코엔자임q10'],
  '맥주효모': ['맥주효모', '바이오틴', '비오틴'],
  // 식품
  '아몬드': ['아몬드', '견과류', '일반아몬드'],
  '견과': ['견과류', '견과', '혼합견과', '믹스넛'],
  '꿀': ['벌꿀', '꿀', '일반꿀', '아카시아꿀'],
  '라면': ['라면', '봉지라면'],
  '과자': ['과자', '과자쿠키'],
  // 생활용품
  '화장지': ['화장지', '두루마리', '롤화장지'],
  '휴지': ['화장지', '휴지', '두루마리', '롤화장지'],
  '주방세제': ['주방세제', '식기세척', '일반주방세제'],
  '섬유유연제': ['섬유유연제', '유연제', '일반섬유유연제'],
  '충전케이블': ['충전케이블', '데이터케이블', '충전'],
  // 패션
  '양말': ['양말', '남성양말', '여성양말', '스포츠양말'],
  '슬랙스': ['슬랙스', '정장바지', '팬츠'],
  '청바지': ['청바지', '데님팬츠'],
  // 주방
  '도마': ['도마', '나무도마', '항균도마'],
  '텀블러': ['텀블러', '보온텀블러', '보냉텀블러', '보온보냉텀블러'],
  '냄비': ['냄비', '양수냄비'],
  '프라이팬': ['프라이팬', '일반프라이팬'],
  // 가전
  '보조배터리': ['보조배터리', '휴대용배터리'],
  // 가구/홈
  '이불': ['이불', '차렵이불', '극세사이불'],
  '극세사': ['극세사', '극세사이불', '차렵이불'],
  '커튼': ['커튼', '실커튼', '암막커튼'],
  '카펫': ['카펫', '카페트', '러그'],
  '러그': ['러그', '카페트', '카펫'],
  // 스포츠
  '아령': ['아령', '덤벨', '아령덤벨'],
  '덤벨': ['덤벨', '아령', '아령덤벨'],
  // 자동차
  '와이퍼': ['와이퍼', '와이퍼블레이드', '플랫와이퍼'],
  // 유아동
  '기저귀': ['기저귀', '일회용기저귀'],
  '분유': ['분유', '조제분유'],
  '아기': ['아기', '유아'],
  '유아': ['유아', '아기'],
  '아기물티슈': ['아기물티슈', '유아물티슈'],
  '유아물티슈': ['유아물티슈', '아기물티슈'],
};

// ─── 상품명→카테고리명 별칭 (토큰 레벨) ─────────────────────
// 상품명에서 자주 쓰이는 단어 → 쿠팡 카테고리 인덱스의 대응 토큰
// SYNONYM_MAP은 양방향이지만, 여기는 "상품명 토큰 → 카테고리 검색용 토큰"
const PRODUCT_TO_CATEGORY_ALIAS: Record<string, string[]> = {
  '비오틴': ['바이오틴'],
  '맥주효모': ['바이오틴'],
  '밀크씨슬': ['밀크시슬'],
  '코큐텐': ['코엔자임q10'],
  '코엔자임q10': ['코큐텐'],
  '프로바이오틱스': ['유산균'],
  '락토바실러스': ['유산균'],
  '락토바실루스': ['유산균'],
  '멀티비타민': ['종합비타민'],
  '종합비타민': ['멀티비타민'],
  '히알루론산': ['콜라겐'],
  '피쉬콜라겐': ['콜라겐'],
  '어골칼슘': ['칼슘'],
  '헴철': ['철분'],
  '눈건강': ['루테인'],
  '넥케어': ['넥크림'],
  '목크림': ['넥크림'],
  '목주름': ['넥크림'],
  '관절': ['글루코사민', '보스웰리아'],
  '간건강': ['밀크시슬'],
  '장건강': ['유산균'],
  '뼈건강': ['칼슘'],
};

// ─── 수식어 토큰 사전 (지명·색상 등) ────────────────────────
// 상품 유형이 아니라 원산지·브랜드 스토리 등 수식 역할로 쓰이는 단어.
// 이 토큰이 leaf 매칭에 성공해도 점수를 대폭 제한하여 도메인 충돌 방지.
// 예: "이탈리아" → "도서>여행>해외여행>이탈리아" leaf와 충돌 방지
const MODIFIER_TOKENS = new Set([
  // 국가/지역명 — 도서>여행>해외여행 leaf와 충돌
  '이탈리아', '일본', '중국', '프랑스', '독일', '미국', '영국',
  '호주', '스페인', '인도', '태국', '베트남', '대만', '캐나다',
  '스위스', '네덜란드', '터키', '그리스', '러시아', '브라질',
  '멕시코', '유럽', '아시아', '아프리카', '남미', '북미',
  '하와이', '발리', '괌', '사이판', '오세아니아',
  // 색상 — 간혹 카테고리명과 겹칠 수 있는 수식어
  '레드', '블루', '그린', '블랙', '화이트', '핑크', '골드', '실버',
  // 용도/규격 수식어 — "업소용 바디워시"처럼 상품 설명 수식으로 쓰이지만
  // 쿠팡 카테고리 leaf 이름("업소용", "건식" 등)과 정확 일치하여 가전/디지털로 오매칭 방지
  '업소용', '가정용', '산업용', '건식', '습식',
]);

// ─── Tier 0 투표 기반 매칭 헬퍼 ─────────────────────────────
// 여러 토큰이 서로 다른 카테고리를 가리킬 때, 가장 많은 토큰이 지지하는 카테고리를 선택
// 예: "콜라겐 넥크림 넥케어" → 콜라겐(59163) 1표 vs 넥크림(56169) 2표 → 넥크림 승
//
// domainFilter: 도메인 prefix가 감지되면 해당 도메인 외 DIRECT 엔트리를 무시한다.
// 예: "아기홍삼" → domain='baby' → DIRECT_CODE_MAP['홍삼'](식품) 스킵 → localMatch로 폴백.
type DomainFilter = 'baby' | 'pet' | 'auto' | null;

function pathMatchesDomain(path: string, domain: DomainFilter): boolean {
  if (!domain) return true;
  const l1 = path.split('>')[0] || '';
  if (domain === 'baby') return /출산|유아|아동/.test(l1);
  if (domain === 'pet') return /반려|애완/.test(l1);
  if (domain === 'auto') return /자동차/.test(l1);
  return true;
}

function voteTier0(
  candidates: string[],
  domainFilter: DomainFilter = null,
  originalTokens?: string[],
): CategoryMatchResult | null {
  const votes = new Map<string, {
    entry: { code: string; path: string };
    count: number;
    longestToken: number;
    earliestPos: number;
  }>();
  // 원본 토큰 첫 등장 위치(없으면 +Infinity) — 동률 시 더 앞에 등장한 후보 우선.
  const positionOf = (tok: string): number => {
    if (!originalTokens) return Infinity;
    const i = originalTokens.indexOf(tok);
    return i < 0 ? Infinity : i;
  };
  for (const t of candidates) {
    const direct = DIRECT_CODE_MAP[t];
    if (!direct) continue;
    // 도메인 불일치 엔트리는 Tier 0에서 배제
    if (!pathMatchesDomain(direct.path, domainFilter)) continue;
    const pos = positionOf(t);
    const existing = votes.get(direct.code);
    if (existing) {
      existing.count++;
      existing.longestToken = Math.max(existing.longestToken, t.length);
      if (pos < existing.earliestPos) existing.earliestPos = pos;
    } else {
      votes.set(direct.code, { entry: direct, count: 1, longestToken: t.length, earliestPos: pos });
    }
  }
  if (votes.size === 0) return null;
  // 우선순위: 표수 ↓ → 첫 등장 위치 ↑ (앞에 먼저 나온 토큰) → 토큰 길이 ↓
  // "오렌지(idx2) 1표 vs 사과(idx5) 1표" → 오렌지 승.
  const best = [...votes.values()].sort((a, b) =>
    b.count - a.count
    || a.earliestPos - b.earliestPos
    || b.longestToken - a.longestToken
  )[0];
  return {
    categoryCode: best.entry.code,
    categoryName: best.entry.path.split('>').pop() || '',
    categoryPath: best.entry.path,
    confidence: 0.95,
    source: 'local_db',
  };
}

function detectDomainFilter(candidates: string[]): DomainFilter {
  const set = new Set(candidates);
  if (['아기', '유아', '신생아', '아동', '키즈'].some(p => set.has(p))) return 'baby';
  if (['강아지', '고양이', '반려', '반려동물', '애완', '애견', '펫'].some(p => set.has(p))) return 'pet';
  if (['자동차', '차량', '오토바이'].some(p => set.has(p))) return 'auto';
  return null;
}

// ─── Product name cleaning ───────────────────────────────────

const NOISE_WORDS = new Set([
  // 단위
  'mg', 'mcg', 'iu', 'ml', 'g', 'kg', 'l',
  '정', '개', '병', '통', '캡슐', '포', '박스', '봉', '팩', '세트', '매', '장', '알',
  'ea', 'pcs',
  // 수식어
  '프리미엄', '고함량', '저분자', '먹는', '국내', '해외',
  '추천', '인기', '베스트', '대용량', '소용량', '순수', '천연', '식물성',
  // 프로모션
  '무료배송', '당일발송', '특가', '할인', '증정', '사은품', '리뷰이벤트',
  // 일반 서술어
  '함유', '효능', '효과', '예방', '개선', '상품상세참조', '풍성한',
  'new', 'box', 'haccp',
]);

const NOISE_PATTERNS = [
  /^\d+$/, // 순수 숫자
  /^\d+\+\d+$/, // 1+1, 2+1
  /^\d+(개월|일|주)분?$/, // 3개월분
  /^\d+(ml|g|kg|mg|l|ea)$/i, // 500ml, 100g
  /^\d+(정|개|병|통|캡슐|포|봉|팩|매|장|알|입|갑|회|포기|줄|켤레|롤|겹|소프트젤|베지캡|베지캡슐)$/, // 60정, 80개, 30캡슐, 30롤
  /^\d+x\d+$/i, // 3x5, 2X3
  /^\d+%$/, // 3000%
];

/**
 * 상품명을 정리한다:
 * - 중복 단어 제거
 * - 괄호 안 브랜드/판매자명 제거
 * - 단위, 프로모션 텍스트 제거
 */
function cleanProductName(name: string): string {
  let cleaned = name;

  // 노이즈 반복 패턴 제거 — "징 징 징", "ㅋ ㅋ ㅋ", "abc abc abc"
  // 셀러가 SEO/플레이스홀더로 같은 짧은 토큰을 3회+ 반복한 경우 토큰 풀 오염 방지.
  cleaned = cleaned.replace(/\b(\S{1,4})(?:\s+\1){2,}\b/gu, ' ');

  // 괄호 안 텍스트 제거 (브랜드명 등)
  cleaned = cleaned.replace(/[\[\(【][^\]\)】]*[\]\)】]/g, ' ');

  // 한글+숫자 / 숫자+한글 경계에 공백 — "카라향2kg" → "카라향 2kg", "5kg망고" → "5kg 망고"
  // 셀러가 띄어쓰기 없이 붙여 쓴 케이스에 대해 토큰 경계 확보.
  cleaned = cleaned.replace(/([가-힣])(\d)/g, '$1 $2');
  cleaned = cleaned.replace(/(\d(?:ml|g|kg|mg|l|ea|cm|mm|m|oz|lb|개|정|병|통|매|팩|입|봉|포|장|알)?)([가-힣])/gi, '$1 $2');

  // 특수문자 → 공백 (한글, 영문, 숫자 유지)
  cleaned = cleaned.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ');

  // 단어 분리
  const words = cleaned.split(/\s+/).filter(Boolean);

  // 중복 제거 (순서 유지)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(w);
    }
  }

  return unique.join(' ');
}

/**
 * 상품명에서 의미있는 검색 토큰을 추출한다.
 * 한글 1글자("넥", "목" 등)도 유지 — 복합어 생성에 필요
 * 영문 단일문자는 이전 영문 토큰에 병합 ("Vitamin" + "A" → "vitamina")
 */
function tokenize(productName: string): string[] {
  const cleaned = cleanProductName(productName);
  const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
  const result: string[] = [];

  for (const w of words) {
    if (w.length === 0) continue;

    if (w.length === 1) {
      // 한글 1글자는 유지 (넥, 목, 잇 등 — 복합어 생성에 필요)
      if (/[가-힣]/.test(w)) {
        result.push(w);
      } else if (/[a-z]/i.test(w) && result.length > 0 && /^[a-z]+$/.test(result[result.length - 1])) {
        // 영문 단일문자 → 이전 영문 토큰에 병합 ("vitamin" + "a" → "vitamina")
        result[result.length - 1] += w;
      }
      continue;
    }

    if (NOISE_WORDS.has(w)) continue;
    if (NOISE_PATTERNS.some((p) => p.test(w))) continue;
    result.push(w);
  }

  return result;
}

// ─── Tier 1: Local DB matching ──────────────────────────────

// 매칭 점수 임계값 변천:
//   - 12 (이전): 안전 매칭만 허용. 60% 상품이 매칭 실패 → 사용자 수동 지정 부담.
//   - 6 (현재): 낮은 신뢰도 매칭도 반환. confidence 0.3 미만은 UI 에서 빨간 배지 표시
//     되어 사용자가 수동 검토 가능. 매칭 실패보다 "잘못 매칭" 이 식별 쉬워 UX 우월.
//   - HIGH_CONFIDENCE_THRESHOLD = 12 이상은 confidence 0.5+ 로 자동 진행.
// 6 은 false positive 폭증 (예: "폼클렌징"이 "도서>잡지>청소년"으로 매칭).
// 12 는 너무 엄격해서 정상 매칭도 fail. 8 이 sweet spot — DIRECT_CODE_MAP Tier 0
// 매칭이 우선이고 로컬 토큰 매칭은 보수적으로 가야 noise 차단됨.
const LOCAL_MATCH_THRESHOLD = 8;
const HIGH_CONFIDENCE_THRESHOLD = 12;

interface ScoredEntry {
  entry: IndexEntry;
  score: number;
}

/**
 * 상품 토큰에서 2-gram 복합어 + 동의어 확장을 생성한다.
 * ["넥", "크림"] → ["넥", "크림", "넥크림"]
 * ["선크림"] → ["선크림", "선로션", "자외선차단"] (동의어 확장)
 */
// 한국어 복합어 분리 경계 (카테고리 관련 핵심 단어)
// "자몽음료수" → ["자몽", "음료수"], "사과주스" → ["사과", "주스"]
// "골드망고" → ["골드", "망고"], "방울토마토" → ["방울", "토마토"]
const COMPOUND_SPLIT_SUFFIXES = [
  '음료수', '음료', '주스', '탄산', '탄산수', '사이다',
  '과일', '야채', '채소', '식품', '식물',
  '건강', '영양', '보조', '기능',
  '세트', '묶음', '팩', '박스',
  '크림', '로션', '세럼', '에센스',
  // 뷰티 클렌징/스킨/메이크업 제형 — "클리어딥클렌징폼"/"반전클렌저"/"오일투폼" 분해
  '클렌징', '클렌저', '폼', '젤', '밤', '오일', '워터', '밀크',
  '토너', '미스트', '앰플', '스크럽', '리무버', '비누',
  // 생활용품/유아 — "아기물티슈" → ["아기", "물티슈"]
  '물티슈', '화장지', '기저귀', '티슈',
  // 과일 — "골드망고/애플망고/무지개망고" 같은 품종+과일 합성어를 분리해
  // DIRECT_CODE_MAP 의 과일 토큰이 voteTier0 에서 잡히도록 한다.
  '망고', '사과', '오렌지', '토마토', '참외', '메론', '멜론', '수박',
  '복숭아', '자두', '포도', '귤', '레몬', '체리', '딸기', '파인애플',
  '자몽', '바나나', '석류', '매실', '코코넛', '살구', '무화과',
  '블루베리', '한라봉', '천혜향', '키위',
  // 채소
  '오이', '당근', '감자', '양파', '마늘', '대파', '상추', '배추',
  '호박', '고추', '피망', '파프리카', '시금치', '브로콜리',
];

// 도메인 prefix — "아기X"/"강아지X"/"자동차X" 형태를 ["아기", "X"] 등으로 분리해
// 복합어를 도메인 힌트 + 제품 stem으로 쪼갠다. stem 길이 2자 이상일 때만 분리.
const DOMAIN_PREFIXES = [
  // 유아동
  '신생아', '아기', '유아', '아동', '키즈',
  // 반려
  '강아지', '고양이', '반려동물', '반려', '애완', '애견', '펫',
  // 자동차
  '자동차', '차량', '오토바이',
];

function splitKoreanCompound(token: string): string[] {
  if (token.length < 3) return [];
  const parts: string[] = [];
  // 도메인 prefix 분리 우선 (가장 긴 prefix부터 시도)
  for (const pfx of DOMAIN_PREFIXES) {
    if (token.length > pfx.length && token.startsWith(pfx)) {
      const rest = token.slice(pfx.length);
      if (rest.length >= 2) {
        parts.push(pfx, rest);
        return parts;
      }
    }
  }
  for (const suffix of COMPOUND_SPLIT_SUFFIXES) {
    if (token.length > suffix.length && token.endsWith(suffix)) {
      const prefix = token.slice(0, -suffix.length);
      if (prefix.length >= 1) {
        parts.push(prefix, suffix);
        break;
      }
    }
    // 접두사 매칭: "음료자몽" 같은 역순 패턴도 처리
    if (token.length > suffix.length && token.startsWith(suffix)) {
      const rest = token.slice(suffix.length);
      if (rest.length >= 1) {
        parts.push(suffix, rest);
        break;
      }
    }
  }
  return parts;
}

function buildCompoundTokens(tokens: string[]): string[] {
  const compounds = [...tokens];

  // 한국어 복합어 분리: "자몽음료수" → ["자몽", "음료수"]
  for (const t of tokens) {
    const parts = splitKoreanCompound(t);
    for (const p of parts) {
      if (!compounds.includes(p)) compounds.push(p);
    }
  }

  // 2-gram 복합어
  for (let i = 0; i < tokens.length - 1; i++) {
    compounds.push(tokens[i] + tokens[i + 1]);
  }

  // 동의어 확장: 토큰과 복합어 모두에서 동의어 검색
  const expanded = [...compounds];
  for (const t of compounds) {
    const synonyms = SYNONYM_MAP[t];
    if (synonyms) {
      for (const syn of synonyms) {
        if (!expanded.includes(syn)) {
          expanded.push(syn);
        }
      }
    }
  }

  // 상품명→카테고리명 별칭 확장 (비오틴→바이오틴 등)
  const withAliases = [...expanded];
  for (const t of expanded) {
    const aliases = PRODUCT_TO_CATEGORY_ALIAS[t];
    if (aliases) {
      for (const alias of aliases) {
        if (!withAliases.includes(alias)) {
          withAliases.push(alias);
        }
      }
    }
  }

  return withAliases;
}

/**
 * 로컬 인덱스에서 토큰 기반 카테고리 매칭.
 *
 * 핵심 개선:
 * 1. 한글 1글자 토큰 유지 ("넥" → "넥크림" 복합어 생성)
 * 2. 카테고리 전체 경로(path) 매칭 — leaf뿐 아니라 부모 카테고리도 봄
 * 3. 다중 경로 레벨 일치 시 가산점 (leaf+parent 모두 매칭 → 훨씬 높은 점수)
 * 4. 2-char 이상 의미 토큰만 leaf 매칭에 사용 (1-char는 복합어 생성용)
 */
async function localMatch(
  tokens: string[],
  domainFilter: DomainFilter = null,
): Promise<{ match: ScoredEntry | null; bestCandidate: ScoredEntry | null }> {
  if (tokens.length === 0) return { match: null, bestCandidate: null };

  const index = loadIndex();
  const tokenSet = new Set(tokens);
  const compoundTokens = buildCompoundTokens(tokens);
  const compoundSet = new Set(compoundTokens);
  // 2글자 이상 의미 토큰
  const meaningfulTokens = tokens.filter(t => t.length >= 2);
  const meaningfulSet = new Set(meaningfulTokens);

  let best: ScoredEntry | null = null;

  for (const entry of index) {
    const [code, catTokensStr, leafName, depth] = entry;
    const catTokenList = catTokensStr.split(' ');
    const leafLower = leafName.toLowerCase();
    let score = 0;

    // 도메인 prefix 감지 시 타 도메인 엔트리는 페널티, 매칭 도메인은 보너스
    // boost가 leafScore(최대 20) 차이를 덮을 만큼 커야 도메인 일치를 확실히 선호함
    let domainBoost = 0;
    if (domainFilter) {
      const detail = (loadDetails() as Record<string, { p?: string }>)[code];
      const path = detail?.p || '';
      if (pathMatchesDomain(path, domainFilter)) {
        domainBoost = 25; // 같은 도메인 카테고리 강한 가산점
      } else {
        domainBoost = -25; // 다른 도메인 카테고리 강한 감점
      }
    }

    // === 1. Leaf matching ===
    let leafScore = 0;

    // 1a. 정확 일치 (compound 포함): "넥크림" === "넥크림"
    for (const t of compoundTokens) {
      if (t.length >= 2 && t === leafLower) {
        leafScore = MODIFIER_TOKENS.has(t) ? 3 : 20;
        break;
      }
    }

    if (leafScore === 0) {
      // 1b. "/" 구분 단어 정확 일치
      const leafWords = leafLower.split(/[\/\s]/).map(s => s.trim()).filter(Boolean);
      let wordMatchCount = 0;
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafWords.some(lw => lw === t)) {
          wordMatchCount++;
        }
      }
      if (wordMatchCount > 0) {
        // 여러 leaf 단어 매칭 시 보너스 (수식어면 ×0.3 제한)
        const raw = 6 + wordMatchCount * 3;
        const hasModifier = compoundTokens.some(t => t.length >= 2 && leafWords.some(lw => lw === t) && MODIFIER_TOKENS.has(t));
        leafScore = hasModifier ? Math.round(raw * 0.3) : raw;
      }
    }

    if (leafScore === 0) {
      // 1c. leaf에 토큰 포함 (부분 매칭, 2글자 이상)
      for (const t of compoundTokens) {
        if (t.length >= 2 && leafLower.includes(t)) {
          // 토큰 길이에 따라 점수 차등 (수식어면 ×0.3 제한)
          const raw = Math.min(6, t.length + 1);
          leafScore = MODIFIER_TOKENS.has(t) ? Math.round(raw * 0.3) : raw;
          break;
        }
      }
    }

    score += leafScore;

    // === 1d. 토큰 위치 가중치 ===
    // 상품명 앞쪽 토큰 = 상품 유형일 확률 높음 → leaf 매칭 시 위치 보너스.
    // 셀러 키워드 스터핑("오렌지...사과") 시 idx 차이만으로 동률을 깨려면 후위 토큰까지 차등 필요.
    if (leafScore > 0) {
      const matchedTokenIdx = tokens.findIndex(t =>
        t === leafLower || leafLower.includes(t)
      );
      // idx 0: +8, 1: +6, 2: +4, 3: +2, 4: +1, 5+: 0
      const POS_BONUS = [8, 6, 4, 2, 1];
      if (matchedTokenIdx >= 0 && matchedTokenIdx < POS_BONUS.length) {
        score += POS_BONUS[matchedTokenIdx];
      }
    }

    // === 2. Path token overlap (경로 전체 매칭) ===
    // catTokenList는 경로의 모든 단어 (e.g. ["뷰티", "스킨", "크림", "넥크림"])
    let matchedCatTokens = 0;
    for (const catToken of catTokenList) {
      if (compoundSet.has(catToken) || meaningfulSet.has(catToken)) {
        score += 3;
        matchedCatTokens++;
      }
    }

    // === 3. 다중 레벨 매칭 보너스 (핵심 — 컨텍스트 확인) ===
    // "강아지"+"사료" 둘 다 경로에 있으면 거의 확실한 매칭
    // "사료"만 있고 "강아지"가 없으면 약한 매칭
    if (matchedCatTokens >= 4) {
      score += 25; // 4개 이상 토큰 매칭 = 거의 확실
    } else if (matchedCatTokens >= 3) {
      score += 18;
    } else if (matchedCatTokens >= 2) {
      score += 10;
    }

    // 커버리지: 카테고리 토큰 중 몇 %를 커버하는지
    if (catTokenList.length > 0 && matchedCatTokens > 0) {
      const coverage = matchedCatTokens / catTokenList.length;
      score += Math.round(coverage * 5);
    }

    // Leaf-only match penalty: leaf만 매칭되고 부모 경로는 전혀 안 맞으면 감점
    // 깊은 카테고리(depth≥4)의 leaf-only 매칭은 더 강하게 감점
    // (동음이의어 방지: "이탈리아"가 도서>여행>해외여행>이탈리아와 바디워시에서 충돌)
    if (leafScore > 0 && matchedCatTokens <= 1) {
      score -= depth >= 4 ? 8 : 5;
    }

    // Depth 보너스 (다중 매칭일 때만, 매우 약하게)
    if (matchedCatTokens >= 2) {
      score += Math.round(depth * 0.5);
    }

    // === 전문 카테고리 감점 (동명이의어 방지) ===
    // 반려/자동차/스포츠 등 전문 L1에 leaf만 매칭되고 상품명에 도메인 키워드가 없으면 감점
    // "물티슈" → 반려동물이 아닌 생활용품으로 가야 함
    if (leafScore > 0 && matchedCatTokens <= 1) {
      const topCat = (catTokenList[0] || '').trim();
      const SPECIALTY_KEYWORDS: Record<string, string[]> = {
        '반려': ['반려', '애완', '강아지', '고양이', '펫', '사료', '간식', '목욕', '미용', '하네스', '산책'],
        '자동차': ['자동차', '차량', '세차', '오토바이', '타이어', '블랙박스'],
        '스포츠': ['골프', '등산', '캠핑', '낚시', '수영', '자전거', '헬스', '스키', '요가', '배드민턴'],
        '완구': ['완구', '장난감', '레고', '블록', '퍼즐', '피규어', '프라모델'],
        '출산': ['유아', '아기', '아동', '키즈', '신생아', '젖병', '기저귀', '유모차'],
        '도서': ['도서', '책', '소설', '교재', '참고서'],
        // 패션 — '발', '크림', '건강', '발목' 등 의미부족 토큰만으로 패션 leaf 매칭되는 것 차단
        // 풋케어/건기식/뷰티 상품이 leaf 부분매칭으로 패션의류잡화로 빠지는 버그 방지
        '패션': ['의류', '바지', '치마', '스커트', '원피스', '코트', '재킷', '패딩', '점퍼', '셔츠',
          '블라우스', '니트', '카디건', '티셔츠', '청바지', '슬랙스', '레깅스', '신발', '운동화',
          '구두', '부츠', '샌들', '슬리퍼', '로퍼', '가방', '백팩', '클러치', '토트백', '크로스백',
          '시계', '귀걸이', '목걸이', '반지', '팔찌', '벨트', '모자', '양말', '스타킹', '속옷', '잠옷'],
      };
      for (const [domain, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
        if (topCat.includes(domain)) {
          const hasContext = meaningfulTokens.some(t => keywords.some(kw => t.includes(kw) || kw.includes(t)));
          if (!hasContext) {
            // 패션은 더 강한 페널티 (1-2글자 부분매칭 leak이 너무 자주 발생)
            score -= domain === '패션' ? 15 : 8;
          }
          break;
        }
      }
    }

    // === 뷰티/식품/건강식품 토큰 → 무관 카테고리 leaf 매칭 차단 ===
    // 풋크림, 핸드크림, 비타민, 영양제 같은 분명한 뷰티/식품 토큰이 있는데
    // 패션/도서/음반/완구/문구 leaf와 부분매칭되는 경우(예: 폼클렌징 → 도서>청소년) 매칭 무효화
    if (leafScore > 0) {
      const path = (loadDetails() as Record<string, { p?: string }>)[code]?.p || '';
      const isFashion = path.startsWith('패션의류잡화');
      // 도서/음반/완구/문구/사무용품 — 뷰티/식품과 명백히 다른 도메인
      const isUnrelated = /^(도서|음반|완구|문구|사무용품|악기|컴퓨터|가구|자동차용품|반려동물용품)/.test(path);
      const BEAUTY_FOOD_TOKENS = [
        // 뷰티/화장품
        '크림', '로션', '세럼', '에센스', '앰플', '토너', '스킨', '미스트', '클렌저',
        '클렌징', '마스크팩', '시트마스크', '선크림', '핸드크림', '풋크림', '바디로션',
        '샴푸', '린스', '컨디셔너', '트리트먼트', '바디워시', '폼클렌징',
        '클렌징폼', '클렌징젤', '클렌징오일', '클렌징워터', '클렌징밀크', '클렌징파우더',
        '필링', '스크럽', '각질', '리무버',
        // 건강식품/식품
        '비타민', '영양제', '오메가', '홍삼', '유산균', '프로바이오틱스', '콜라겐',
        '루테인', '밀크씨슬', '글루코사민', '쏘팔메토', '코큐텐', '코엔자임', '크릴오일',
        '비오틴', '바이오틴', '아연', '마그네슘', '칼슘', '철분', '엽산', '셀레늄',
        '프로폴리스', '스피루리나', '클로렐라', '알로에', '히알루론산',
      ];
      const hasBeautyFoodToken = meaningfulTokens.some(t =>
        BEAUTY_FOOD_TOKENS.some(kw => t === kw || t.includes(kw))
      );
      if (hasBeautyFoodToken) {
        if (isFashion) {
          score -= 50;
        } else if (isUnrelated) {
          // 도서>청소년 → 폼클렌징 매칭 같은 catastrophe 차단
          score -= 50;
        }
      }
    }

    // 도메인 boost 반영
    score += domainBoost;

    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  const match = best && best.score >= LOCAL_MATCH_THRESHOLD ? best : null;
  return { match, bestCandidate: best };
}

async function buildResultFromIndex(entry: IndexEntry, score: number, maxScore: number): Promise<CategoryMatchResult> {
  const [code, , leafName] = entry;
  const details = loadDetails();
  const detail = details[code];

  // confidence 매핑:
  //   - score < HIGH_CONFIDENCE_THRESHOLD (12): 0.3 ~ 0.5 (낮은 신뢰도, 수동 검토 권장)
  //   - score >= HIGH_CONFIDENCE_THRESHOLD: 0.5 ~ 0.95 (자동 진행 가능)
  let confidence: number;
  if (score < HIGH_CONFIDENCE_THRESHOLD) {
    // 6~11 → 0.3~0.5 선형 매핑
    const low = Math.max(0, score - LOCAL_MATCH_THRESHOLD);
    const range = HIGH_CONFIDENCE_THRESHOLD - LOCAL_MATCH_THRESHOLD;
    confidence = 0.3 + (low / range) * 0.2;
  } else {
    confidence = Math.min(0.95, 0.5 + (score / maxScore) * 0.45);
  }

  return {
    categoryCode: code,
    categoryName: leafName,
    categoryPath: detail?.p || leafName,
    confidence,
    source: 'local_db',
  };
}

// ─── Tier 3: AI keyword extraction → Local DB ───────────────

// ─── SEO 노이즈 토큰 (모든 카테고리 공통 — 매칭에 무관한 marketing 어휘) ──
// 이 토큰들은 매칭 점수 산정에서 제외. 실제 카테고리 시그널과 분리.
const SEO_NOISE_TOKENS = new Set([
  '추천','비교','후기','리뷰','할인','특가','무료배송','당일발송','로켓배송','정품','무료',
  '가성비','만족','베스트','신상','신상품','한정','특별','선물','선물용','선물세트',
  '인기','대박','최고','최저가','최저','득템','쟁여','꿀템','갓성비','명품',
  '정식','한국','한국어','국산','국내산','수입','직배송','직수입','직접','전용',
  '안티에이징','보습','주름개선','미백','피부탄력','피부미백','잔주름',  // 효능 어휘 (식품 카테고리에 박히는 SEO)
  '체감','효과','즉시','바로','금방','빠른','강력','진한','풍부한','풍성한',
  '인증','검증','승인','자연','순수','자연스러운','진짜','진심','진정한',
  '필수','필수템','필수품','준비','신선','싱싱한','신선함',  // (식품 정상 토큰이지만 다른 카테고리에 박히면 노이즈)
]);

// ─── 헤드 토큰 우선 매칭 ─────────────────────────────────
// 상품명의 첫 N(=5) 토큰이 실제 상품 정체. 뒤는 SEO 스터핑.
// 헤드와 풀의 매칭 결과 L1 이 다르면 contamination 의 강한 시그널.
function getHeadTokens(tokens: string[], n: number = 5): string[] {
  // SEO_NOISE_TOKENS 제외하고 의미 있는 첫 N 토큰
  const meaningful = tokens.filter(t => !SEO_NOISE_TOKENS.has(t) && t.length >= 2);
  return meaningful.slice(0, n);
}

// ─── L1 카테고리 오염 감지 ─────────────────────────────────
// 셀러가 SEO 목적으로 다른 카테고리 키워드를 섞어둔 경우 감지.
// 한 토큰 셋 안에 2+ L1 카테고리 시그널이 섞이면 contaminated.
const L1_TOKEN_SIGNALS: Record<string, string[]> = {
  '식품': ['다시마','미역','김','파래','매생이','황태','멸치','오징어','문어','새우','조개','굴','전복','연어','고등어','참치','삼치','갈치','홍어','명태','명란','대구','쭈꾸미','낙지','꽃게','대게','킹크랩',
          '망고','사과','배','감','포도','딸기','복숭아','자두','수박','참외','메론','블루베리','오렌지','자몽','체리','파인애플','키위','석류','복분자','대추','곶감','밤','잣','호두','아몬드',
          '쌀','잡곡','보리','귀리','콩','팥','녹두','참깨','들깨','옥수수','감자','고구마','당근','양파','마늘','생강','파','부추','시금치','상추','깻잎','배추','무','오이','호박','토마토','가지','버섯','콩나물','숙주',
          '소고기','돼지고기','닭고기','오리고기','한우','삼겹살','목살','등심','안심','갈비','베이컨','소시지','햄','계란','달걀','우유','요거트','치즈','버터',
          '신선','산지','국산','농산','수산','축산','해조류','건어물','제철','원물','HACCP','GMP','당도','등급','5kg','1kg','3kg','10kg','선물세트',
          // 식품 가공/보관 어휘 (망고/다시마 케이스에서 누락됐던 토큰들)
          '염장','완도','자른','뿌리','신선도','신선함','싱싱한','해풍','토종','유기농','무농약','친환경','GAP','이력제','직거래','산지직송','저온','냉장','냉동','말린','건조','반건조','훈제','절단','손질','자연산','양식','노지','하우스','수경','노지재배','일조량','당도계','브릭스','과당','수분함량','수분','식이섬유','단백질','지방','탄수화물','칼로리','영양성분','원산지','품종','수확','재배','가족용','대용량','소포장','소분','진공포장',
          '간장','된장','고추장','쌈장','액젓','젓갈','김치','장아찌','반찬','조미료','소금','설탕','식초','후추','참기름','들기름','꿀','잼','시럽',
          '라면','즉석밥','즉석국','국수','파스타','떡','만두','피자','치킨','볶음밥','김밥','샐러드','과자','초콜릿','사탕','젤리','쿠키','크래커',
          '비타민','오메가3','홍삼','녹용','루테인','프로폴리스','콜라겐','마그네슘','칼슘','철분','아연','유산균','프로바이오틱스','글루코사민','MSM','커큐민','코엔자임',
          '커피','차','녹차','홍차','보이차','우롱차','보리차','옥수수수염차','둥굴레차','대추차','유자차','생강차','쌍화차','음료','주스','탄산음료','이온음료','맥주','와인','막걸리','소주'],
  '뷰티': ['안티에이징','수분','진정','뷰티','염색','파마','퍼머','헤어','샴푸','린스','트리트먼트','두피','모발','펌','드라이','컬링','스타일링',
          '크림','에센스','세럼','로션','토너','앰플','마스크팩','시트팩','클렌징','클렌저','폼클렌징','폼','오일클렌징','립스틱','립밤','립글로스','립틴트','립스','마스카라','아이라이너','아이섀도우','블러셔','파운데이션','쿠션','컨실러','BB','CC','선크림','자외선차단','선스틱','쉐도우','네일','매니큐어','젤네일','향수','퍼퓸','오드뚜왈렛',
          '미백','주름개선','보습','각질','블랙헤드','모공','피부','피지','잡티','다크써클','탄력','리프팅','콜라겐','히알루론','펩타이드','레티놀','비타민C','나이아신아마이드','시카','병풀','스네일','연어알'],
  '가전/디지털': ['노트북','데스크탑','모니터','마우스','키보드','이어폰','헤드폰','이어셋','마이크','스피커','웹캠','프린터','스캐너','HDD','SSD','USB','메모리','RAM','CPU','그래픽카드','VGA','SD카드','외장하드','공유기','라우터','허브',
                '스마트폰','휴대폰','갤럭시','아이폰','태블릿','아이패드','갤럭시탭','노트10','갤럭시버즈','에어팟','애플워치','갤럭시워치','스마트워치',
                '냉장고','김치냉장고','세탁기','건조기','에어컨','전기레인지','인덕션','전자레인지','오븐','에어프라이어','커피머신','정수기','공기청정기','선풍기','가습기','제습기','히터','전기장판',
                'TV','스마트TV','OLED','QLED','UHD','4K','셋톱박스','블루레이','홈시어터','사운드바','빔프로젝터','프로젝터','스피커'],
  '패션의류잡화': ['티셔츠','셔츠','블라우스','니트','스웨터','자켓','코트','패딩','후드','맨투맨','원피스','스커트','치마','바지','청바지','데님','반바지','양말','속옷','팬티','브라','잠옷','파자마','수영복','비키니','드레스','턱시도','정장','수트',
                '운동화','스니커즈','구두','부츠','샌들','슬리퍼','로퍼','단화','하이힐','플랫슈즈',
                '가방','백팩','크로스백','숄더백','토트백','클러치','지갑','벨트','모자','캡','비니','버킷햇','선글라스','안경','시계','목걸이','반지','귀걸이','팔찌','브로치','스카프','머플러','장갑','넥타이'],
  '가구/홈데코': ['소파','침대','매트리스','책상','의자','테이블','식탁','책장','옷장','서랍장','수납장','선반','거울','커튼','블라인드','러그','카펫','쿠션','베개','이불','요','담요','커버',
                '조명','전등','스탠드','샹들리에','LED등','꽃병','액자','시계','가습기','디퓨저','인센스','캔들'],
  '생활용품': ['화장지','휴지','물티슈','기저귀','생리대','수건','걸레','대걸레','빗자루','쓰레기통','쓰레기봉투','탈취제','방향제','섬유유연제','세탁세제','주방세제','세정제','락스','곰팡이제거제','살충제',
              '비누','샤워젤','바디워시','바디로션','치약','칫솔','구강청결제','면도기','면도크림','면봉','반창고','밴드','연고','파스'],
  '주방용품': ['프라이팬','냄비','전골냄비','웍','국자','뒤집개','집게','주걱','칼','도마','가위','강판','채반','체','조리기구','후라이팬','압력솥','냉면기','뚝배기',
              '식기','그릇','접시','컵','머그컵','텀블러','보온병','텀블러','수저','젓가락','포크','나이프','수저세트','냅킨','앞치마','오븐장갑','행주','수세미'],
  '반려/애완용품': ['강아지','고양이','개','애묘','애견','반려견','반려묘','사료','간식','츄르','캣닢','캣타워','스크래쳐','목줄','하네스','리드줄','켄넬','이동장','캐리어','쿠션','방석','매트','개껌','오리저키','동결건조','펫','펫푸드','캣','도그','우드'],
  '스포츠/레져': ['요가매트','폼롤러','덤벨','케틀벨','짐볼','복근운동기구','런닝머신','자전거','킥보드','전기자전거','MTB','로드자전거','헬멧','보호대','스케이트','스케이트보드','스키','보드','등산','등산복','등산화','캠핑','텐트','침낭','코펠','버너','랜턴','테이블','체어','쿨러','아이스박스','낚시','낚시대','릴','루어','웜','벌레용품','골프','골프채','골프공','골프화','골프장갑','수영','수영복','물안경','튜브'],
  '자동차용품': ['타이어','휠','오일','엔진오일','워셔액','부동액','와이퍼','블랙박스','네비게이션','후방카메라','LED램프','전조등','범퍼','휠캡','스티커','매트','시트커버','핸들커버','선바이저','방향제','세차용품','왁스','광택제','코팅제','이동가방','정비공구'],
  '문구/오피스': ['볼펜','연필','샤프','지우개','형광펜','마커','색연필','크레용','노트','다이어리','포스트잇','스티커','파일','클리어파일','바인더','펜꽂이','수첩','메모지','테이프','풀','가위','커터칼','자','컴퍼스','각도기','계산기','프린터','복사기','파쇄기','오피스','사무용품'],
  '완구/취미': ['장난감','블록','레고','퍼즐','보드게임','카드게임','RC','드론','피규어','인형','곰인형','봉제인형','게임기','닌텐도','플레이스테이션','PS','XBOX','게임','악기','기타','피아노','드럼','바이올린','우쿨렐레','하모니카','색칠','그리기','만들기','과학','실험','조립'],
  '도서': ['책','도서','소설','수필','자기계발','경제경영','만화','참고서','문제집','교재','어학','외국어','영어','일본어','중국어','어린이','유아','동화','그림책','전집','시리즈'],
};

interface ContaminationResult {
  contaminated: boolean;
  dominantL1: string | null;
  signalCounts: Record<string, number>;
}

function detectL1Contamination(tokens: string[]): ContaminationResult {
  const counts: Record<string, number> = {};
  const tokenSet = new Set(tokens);
  for (const [l1, signals] of Object.entries(L1_TOKEN_SIGNALS)) {
    let n = 0;
    for (const s of signals) {
      if (tokenSet.has(s)) n++;
    }
    if (n > 0) counts[l1] = n;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { contaminated: false, dominantL1: null, signalCounts: counts };
  if (sorted.length === 1) return { contaminated: false, dominantL1: sorted[0][0], signalCounts: counts };

  // 2+ L1 시그널 존재. 다음 둘 중 하나면 contaminated:
  //   - 2번째 L1 가 1번째의 20% 이상이면서 cb >= 1 (minor SEO 도 잡음)
  //   - cb >= 2 (다른 L1 시그널이 2개 이상이면 ratio 무관 contamination 확정)
  const [l1a, ca] = sorted[0];
  const [, cb] = sorted[1];
  const ratio = cb / Math.max(ca, 1);
  return {
    contaminated: (ratio >= 0.2 && cb >= 1) || cb >= 2,
    dominantL1: l1a,
    signalCounts: counts,
  };
}

async function aiKeywordMatch(productName: string): Promise<CategoryMatchResult | null> {
  try {
    const { mapCategory } = await import('./ai.service');
    const aiResult = await mapCategory(productName, '', 'coupang');
    if (aiResult.categoryId) {
      // Verify this category exists in our DB
      const details = loadDetails();
      const detail = details[aiResult.categoryId];
      return {
        categoryCode: aiResult.categoryId,
        categoryName: aiResult.categoryName,
        categoryPath: detail?.p || aiResult.categoryName,
        confidence: aiResult.confidence,
        source: 'ai',
      };
    }
  } catch (err) {
    console.warn('[category-matcher] AI mapping failed:', err instanceof Error ? err.message : err);
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * 네이버 카테고리 ID로 쿠팡 카테고리를 즉시 조회한다.
 * naver-to-coupang-map.json 매핑 테이블 사용.
 */
export function matchByNaverCategory(naverCategoryId: string): CategoryMatchResult | null {
  const naverMap = loadNaverMap();
  const entry = naverMap[naverCategoryId];
  if (!entry) return null;

  const details = loadDetails();
  const detail = details[entry.c];
  return {
    categoryCode: entry.c,
    categoryName: detail?.p?.split('>').pop() || '',
    categoryPath: detail?.p || '',
    confidence: entry.n,
    source: 'local_db',
  };
}

/**
 * 상품명으로 쿠팡 카테고리를 자동 매칭한다.
 * 우선순위: Tier 0 투표 → 네이버 카테고리 매핑 → 로컬 DB → 쿠팡 API → AI
 */
export async function matchCategory(
  productName: string,
  adapter?: CoupangAdapter,
  naverCategoryId?: string,
): Promise<CategoryMatchResult | null> {
  // ── Tier -1: 입력이 카테고리 leaf 이름과 정확 일치 ──
  // 사용자가 leaf 이름을 그대로 입력한 경우(검색/정합성 테스트) 결정론적 매칭.
  // 셀러 정제 전 raw 입력 으로도 한 번, 정제 후로도 한 번 시도.
  const exactRaw = exactLeafMatch(productName);
  if (exactRaw) return exactRaw;

  // 셀러 키워드 스터핑/가격 마커 1차 정제 — "★19900원★" / "사과/배 과일세트 ×3" 등
  const sanitized = sanitizeSellerName(productName);
  const exactSanitized = exactLeafMatch(sanitized);
  if (exactSanitized) return exactSanitized;

  const cleaned = cleanProductName(sanitized);
  const tokens = tokenize(sanitized);
  const compoundTokens = buildCompoundTokens(tokens);

  // ── 네이버 카테고리 매핑 (최우선 — 소싱 상품의 실제 분류) ──
  // naverCategoryId는 실제 상품의 정확한 카테고리이므로 키워드 추론보다 신뢰도가 높다.
  if (naverCategoryId) {
    const naverResult = matchByNaverCategory(naverCategoryId);
    if (naverResult) return naverResult;
  }

  // ── Tier -0.5: 토큰 단위 leaf match (마케팅 어휘 dominant 케이스 복구) ──
  // sanitize 후 토큰 → 그래도 못 찾으면 raw productName 토큰으로도 한 번 더 시도
  // ("갓김치 갓김치 갓김치 갓김치" 같은 1단어 반복이 sanitizer 의 win=2 매칭으로 전부 제거되는 케이스 복구)
  const tokenLeafResult = findLeafByToken(tokens);
  if (tokenLeafResult) return tokenLeafResult;
  const rawTokens = tokenize(productName);
  if (rawTokens.length !== tokens.length || rawTokens.some((t, i) => t !== tokens[i])) {
    const rawLeaf = findLeafByToken(rawTokens);
    if (rawLeaf) return rawLeaf;
  }

  // ── Tier -0.4: 괄호 안 텍스트 leaf 매칭 ──
  // "농가직송 (가구부속자재)" 같이 셀러가 leaf 이름을 괄호로 강조하는 케이스.
  // cleanProductName 이 괄호 텍스트를 brand 처리로 제거하므로 raw 입력에서 직접 추출.
  const parenMatches = productName.match(/[\[\(【]([^\]\)】]{2,30})[\]\)】]/g);
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.replace(/^[\[\(【]|[\]\)】]$/g, '').trim();
      if (!inner) continue;
      // 괄호 안 텍스트 자체가 leaf 이름인 경우
      const direct = exactLeafMatch(inner);
      if (direct) return direct;
      // 괄호 안 토큰 단위 leaf 매칭
      const innerTokens = tokenize(inner);
      const parenLeaf = findLeafByToken(innerTokens);
      if (parenLeaf) return parenLeaf;
    }
  }

  // ── Tier 0: 직접 코드 매핑 (네이버 ID 없을 때 최우선) ──
  // voteTier0 후보 = 원본 토큰 + 2-gram + splitKoreanCompound 결과만.
  // SYNONYM/ALIAS 확장은 의도적으로 제외 — "꿀참외" → ["꿀","참외"] split 후
  // SYNONYM_MAP['꿀']→['벌꿀','일반꿀'] 확장이 일반꿀 표를 다중 등록해 참외 보다
  // 더 많은 표를 받게 되는 인플레 방지.
  const tier0Candidates: string[] = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    tier0Candidates.push(tokens[i] + tokens[i + 1]);
  }
  for (const t of tokens) {
    const parts = splitKoreanCompound(t);
    for (const p of parts) tier0Candidates.push(p);
  }
  // 도메인 prefix 감지 (아기/유아 → baby, 강아지 → pet 등)
  const domainFilter = detectDomainFilter(compoundTokens);
  const tier0Result = voteTier0(tier0Candidates, domainFilter, tokens);
  if (tier0Result) return tier0Result;

  // ── Tier 1: Local DB matching ──
  const { match: localResult } = await localMatch(tokens, domainFilter);
  if (localResult) {
    // High-confidence local match
    const result = await buildResultFromIndex(
      localResult.entry,
      localResult.score,
      Math.max(localResult.score, 20),
    );
    return result;
  }

  // ── Tier 1.2: leaf 이름 substring 매칭 (raw 입력 — sanitize 전) ──
  // Tier 0/1 모두 실패한 모호 입력 ("정품 선물용 못난이 사과/배 과일세트 ...
  // 완숙 최상품 5kg(소과)") 에서 셀러가 leaf 이름을 그대로 박은 경우 캐치.
  // raw 사용 — sanitize 가 반복 phrase 를 제거해도 원본에는 남아있음.
  const subRaw = leafSubstringMatch(productName);
  if (subRaw) return subRaw;

  // ── Tier 1.5: Coupang Category Search API ──
  // 의미있는 토큰으로 쿠팡 카테고리 검색 (Predict API보다 키워드 검색이 더 정확)
  // 쿠팡 API hang 시 전체 배치가 막히지 않도록 5s fast-fail
  if (adapter) {
    const searchTokens = tokens.filter(t => t.length >= 2 && !NOISE_WORDS.has(t));
    // 가장 의미있는 토큰(길이 기준) 최대 2개로 검색
    const sortedByLen = [...searchTokens].sort((a, b) => b.length - a.length);
    const searchKeywords = sortedByLen.slice(0, 2);

    for (const keyword of searchKeywords) {
      try {
        const searchResult = await withFastTimeout(adapter.searchCategory(keyword), 5000);
        if (searchResult.items.length > 0) {
          const bestMatch = searchResult.items[0];
          const details = loadDetails();
          const detail = details[bestMatch.id];
          if (detail) {
            return {
              categoryCode: bestMatch.id,
              categoryName: bestMatch.name,
              categoryPath: detail.p || bestMatch.path || bestMatch.name,
              confidence: 0.88,
              source: 'coupang_api',
            };
          }
        }
      } catch (err) {
        console.warn('[category-matcher] Coupang Search API failed for keyword:', keyword, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Tier 2: Coupang Predict API ──
  // 쿠팡 API hang 시 전체 배치가 막히지 않도록 5s fast-fail
  if (adapter) {
    try {
      const apiResult = await withFastTimeout(adapter.autoCategorize(cleaned), 5000);
      if (apiResult?.predictedCategoryId) {
        const details = loadDetails();
        const detail = details[apiResult.predictedCategoryId];
        return {
          categoryCode: apiResult.predictedCategoryId,
          categoryName: apiResult.predictedCategoryName,
          categoryPath: detail?.p || apiResult.predictedCategoryName,
          confidence: 0.85,
          source: 'coupang_api',
        };
      }
    } catch (err) {
      console.warn('[category-matcher] Coupang Predict API failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── Tier 3: AI keyword extraction → Local DB ──
  const aiResult = await aiKeywordMatch(productName);
  if (aiResult) return aiResult;

  return null;
}

/**
 * 배치 카테고리 매칭 — 로컬 DB 우선 + 교차 상품 빈도 분석
 *
 * 1. 전체 상품을 로컬 DB로 먼저 매칭 (API 호출 0)
 * 2. 미매칭 상품만 배치 키워드 분석 → Coupang API
 * 3. 나머지 개별 폴백
 */
export async function matchCategoryBatch(
  productNames: string[],
  adapter?: CoupangAdapter,
  naverCategoryIds?: (string | undefined)[],
): Promise<{ results: (CategoryMatchResult | null)[]; failures: FailureDiagnostic[] }> {
  const results: (CategoryMatchResult | null)[] = new Array(productNames.length).fill(null);
  const cache = new Map<string, CategoryMatchResult | null>();

  // === Phase 0+1 통합: 네이버 매핑 최우선 → Tier 0 → 로컬 DB ===
  // 네이버 카테고리 ID는 소싱 상품의 실제 분류이므로 키워드 추론보다 신뢰도가 높다.
  // Tier 0는 네이버 ID가 없을 때만 작동.
  // 셀러 키워드 스터핑/가격 마커 1차 정제 후 토큰화.
  const sanitizedNames = productNames.map((n) => sanitizeSellerName(n));
  const productTokensList: string[][] = sanitizedNames.map((name) => tokenize(name));
  const unmatchedIndices: number[] = [];
  const tier1Diagnostics = new Map<number, { score: number; candidateName: string }>();

  // Tier -2: 학습된 alias 캐시 — 과거 사용자 매칭 결과 즉시 활용
  // matchByAlias 는 한 번 캐시 로드 후 메모리 lookup. 50건 배치 추가 비용 ~5ms.
  let aliasMatchFn: ((name: string) => Promise<CategoryMatchResult | null>) | null = null;
  try {
    const mod = await import('./category-alias-store');
    aliasMatchFn = mod.matchByAlias;
  } catch {
    aliasMatchFn = null;
  }

  for (let i = 0; i < productNames.length; i++) {
    // 네이버 카테고리 매핑 (최우선 — 소싱 상품의 실제 분류)
    if (naverCategoryIds) {
      const navId = naverCategoryIds[i];
      if (navId) {
        const navResult = matchByNaverCategory(navId);
        if (navResult) {
          results[i] = navResult;
          continue;
        }
      }
    }

    // Tier -2: alias 학습 캐시 — 과거에 매칭된 키워드는 즉시 매칭
    if (aliasMatchFn) {
      const aliasHit = await aliasMatchFn(sanitizedNames[i] || productNames[i]);
      if (aliasHit) { results[i] = aliasHit; continue; }
    }

    // Tier -1: 입력이 leaf 이름과 정확 일치 — 결정론적 매칭
    const exactRaw = exactLeafMatch(productNames[i]);
    if (exactRaw) { results[i] = exactRaw; continue; }
    const exactSan = exactLeafMatch(sanitizedNames[i]);
    if (exactSan) { results[i] = exactSan; continue; }

    // Tier -0.5: 토큰 단위 leaf match — 상품명 안에 leaf 이름과 정확 일치하는 토큰이 있으면 매칭.
    // 마케팅 어휘로 점수 낮아 fail 하던 "국산 재료만 사용된 순도 100% 갓김치" 같은 케이스 복구.
    // sanitized → 못 찾으면 raw 도 시도 (sanitizer가 1단어 반복을 win=2 로 보고 전부 제거하는 경우 복구)
    {
      const tokens = productTokensList[i];
      const tokenLeafMatch = findLeafByToken(tokens);
      if (tokenLeafMatch) { results[i] = tokenLeafMatch; continue; }
      const rawTokens = tokenize(productNames[i]);
      if (rawTokens.length !== tokens.length || rawTokens.some((t, k) => t !== tokens[k])) {
        const rawLeaf = findLeafByToken(rawTokens);
        if (rawLeaf) { results[i] = rawLeaf; continue; }
      }
      // 괄호 안 leaf
      const parenMatches = productNames[i].match(/[\[\(【]([^\]\)】]{2,30})[\]\)】]/g);
      if (parenMatches) {
        let parenHit: CategoryMatchResult | null = null;
        for (const pm of parenMatches) {
          const inner = pm.replace(/^[\[\(【]|[\]\)】]$/g, '').trim();
          if (!inner) continue;
          const direct = exactLeafMatch(inner);
          if (direct) { parenHit = direct; break; }
          const innerTokens = tokenize(inner);
          const parenLeaf = findLeafByToken(innerTokens);
          if (parenLeaf) { parenHit = parenLeaf; break; }
        }
        if (parenHit) { results[i] = parenHit; continue; }
      }
    }

    // Tier 0: 투표 기반 직접 코드 매핑 (네이버 ID 없을 때)
    // SYNONYM/ALIAS 확장 제외 — 표 인플레 차단 (matchCategory 와 동일 정책)
    const toks = productTokensList[i];
    const tier0Cands: string[] = [...toks];
    for (let j = 0; j < toks.length - 1; j++) {
      tier0Cands.push(toks[j] + toks[j + 1]);
    }
    for (const t of toks) {
      const parts = splitKoreanCompound(t);
      for (const p of parts) tier0Cands.push(p);
    }
    // Fix C: 도메인 필터 적용 — matchCategory 와 일관성 유지.
    // 이전엔 batch 경로만 null 을 넘겨서 "아기홍삼"이 식품으로, "강아지샴푸"가 사람샴푸로 매칭되는 케이스 존재.
    const domainFilter = detectDomainFilter(tier0Cands);
    const tier0Result = voteTier0(tier0Cands, domainFilter, toks);
    if (tier0Result) {
      results[i] = tier0Result;
      continue;
    }

    // Tier 1: 로컬 DB 토큰 매칭 (도메인 필터 같이 전달 — 다른 도메인 path 페널티)
    const { match: localResult, bestCandidate } = await localMatch(productTokensList[i], domainFilter);
    if (localResult) {
      results[i] = await buildResultFromIndex(
        localResult.entry,
        localResult.score,
        Math.max(localResult.score, 20),
      );
    } else {
      // Tier 1.2: leaf substring 매칭 (raw 입력 — sanitize 전 원본)
      const subRaw = leafSubstringMatch(productNames[i]);
      if (subRaw) {
        results[i] = subRaw;
      } else {
        unmatchedIndices.push(i);
        if (bestCandidate) {
          tier1Diagnostics.set(i, { score: bestCandidate.score, candidateName: bestCandidate.entry[2] });
        }
      }
    }
  }

  // === Phase 1.5: 다중 contamination 감지 + AI 강제 재검증 ===
  // 3가지 독립 시그널로 SEO 스터핑/오매칭 검출:
  //   A) L1 토큰 시그널 충돌 (하드코딩 키워드 — 명확한 케이스)
  //   B) 헤드(첫 5) vs 풀 매칭 L1 불일치 — 통계적 시그널 (새 SEO 패턴도 잡음)
  //   C) 헤드 토큰 매칭 실패 (헤드는 실제 상품, 매칭 안 되면 의미 매칭 X)
  const contaminatedIndices = new Set<number>();
  for (let i = 0; i < productNames.length; i++) {
    const result = results[i];
    if (!result) continue;
    // 네이버 카테고리 매핑은 신뢰 (실제 소싱 분류이므로 contamination 영향 없음)
    if (naverCategoryIds?.[i]) continue;

    const matchedL1 = (result.categoryPath || '').split('>')[0];
    let contamReason: string | null = null;

    // [A] L1 토큰 시그널 충돌
    const contamA = detectL1Contamination(productTokensList[i]);
    if (contamA.contaminated && contamA.dominantL1 && matchedL1 && contamA.dominantL1 !== matchedL1) {
      contamReason = `L1 시그널 충돌: matched=${matchedL1}, dominant=${contamA.dominantL1}`;
    }

    // [B] 헤드 vs 풀 매칭 L1 불일치 — 헤드 토큰만으로 따로 매칭하고 결과 비교
    if (!contamReason) {
      const headTokens = getHeadTokens(productTokensList[i], 5);
      if (headTokens.length >= 2) {
        // tokenize 결과를 직접 활용해 head 매칭 — Tier 0 voting 으로 빠르게 판정
        const headBaseComps: string[] = [...headTokens];
        for (let j = 0; j < headTokens.length - 1; j++) {
          headBaseComps.push(headTokens[j] + headTokens[j + 1]);
        }
        const headDomain = detectDomainFilter(headBaseComps);
        const headResult = voteTier0(headBaseComps, headDomain, headTokens);
        if (headResult) {
          const headL1 = (headResult.categoryPath || '').split('>')[0];
          if (headL1 && matchedL1 && headL1 !== matchedL1) {
            contamReason = `헤드/풀 L1 불일치: head=${headL1}, full=${matchedL1}`;
          }
        }
      }
    }

    if (contamReason) {
      console.warn(`[category-matcher] contamination: '${productNames[i].slice(0, 40)}' — ${contamReason} → AI 재검증`);
      results[i] = null;
      contaminatedIndices.add(i);
      if (!unmatchedIndices.includes(i)) unmatchedIndices.push(i);
    }
  }

  // 전부 로컬 매칭 완료 시 바로 반환
  if (unmatchedIndices.length === 0) return { results, failures: [] };

  // === Phase 1.7: 임베딩 시맨틱 매칭 (Tier 1) ===
  // 토큰/substring 매칭 실패한 케이스 — 글루합성어, 서술형 상품명, 사전 미등록 변형.
  // 16k 카테고리 임베딩(text-embedding-3-small, 512-dim)과 코사인 유사도 비교.
  //   ≥ 0.85 : 자동 매칭 (high confidence)
  //   0.65~0.85 : LLM rerank 후보 (Tier 2, 후속 단계에서 처리)
  //   < 0.65 : 미매칭 유지 → Phase 2/3 폴백
  // OPENAI_API_KEY 미설정 / 임베딩 미빌드 시 빈 결과 → 기존 폴백 그대로.
  try {
    const { findTopKByEmbedding, EMBEDDING_AUTO_THRESHOLD, EMBEDDING_RERANK_THRESHOLD } =
      await import('./category-embedder');
    const stillUnmatched = [...unmatchedIndices];
    const rerankNeeded: { idx: number; candidates: { code: string; path: string }[] }[] = [];

    for (const idx of stillUnmatched) {
      if (results[idx]) continue;
      const top = await findTopKByEmbedding(sanitizedNames[idx] || productNames[idx], 10);
      if (top.length === 0) continue;
      const best = top[0];
      if (best.similarity >= EMBEDDING_AUTO_THRESHOLD) {
        const detail = loadDetails()[best.categoryCode];
        results[idx] = {
          categoryCode: best.categoryCode,
          categoryName: best.leafName,
          categoryPath: detail?.p || best.categoryPath,
          confidence: best.similarity,
          source: 'ai',
        };
      } else if (best.similarity >= EMBEDDING_RERANK_THRESHOLD) {
        // Tier 2 LLM rerank 대상 — 후보 모아두고 일괄 처리
        rerankNeeded.push({
          idx,
          candidates: top.map(t => ({ code: t.categoryCode, path: t.categoryPath })),
        });
      }
    }

    // Tier 2: LLM rerank — 0.65~0.85 신뢰도 후보들에 대해 GPT-4o-mini 로 최적 카테고리 선택
    if (rerankNeeded.length > 0) {
      try {
        const { rerankCategoryCandidates } = await import('./category-llm-reranker');
        for (const { idx, candidates } of rerankNeeded) {
          if (results[idx]) continue;
          const picked = await rerankCategoryCandidates(productNames[idx], candidates);
          if (picked) {
            const detail = loadDetails()[picked.code];
            results[idx] = {
              categoryCode: picked.code,
              categoryName: detail?.p?.split('>').pop() || '',
              categoryPath: detail?.p || picked.path,
              confidence: picked.confidence,
              source: 'ai',
            };
          } else {
            // rerank 실패 → top-1 fallback
            const detail = loadDetails()[candidates[0].code];
            results[idx] = {
              categoryCode: candidates[0].code,
              categoryName: detail?.p?.split('>').pop() || '',
              categoryPath: detail?.p || candidates[0].path,
              confidence: 0.55,
              source: 'ai',
            };
          }
        }
      } catch (err) {
        console.warn('[category-matcher] LLM rerank skipped:', err instanceof Error ? err.message : err);
      }
    }

    // unmatchedIndices 갱신 — 매칭된 인덱스 제거
    for (let k = unmatchedIndices.length - 1; k >= 0; k--) {
      if (results[unmatchedIndices[k]]) unmatchedIndices.splice(k, 1);
    }
    if (unmatchedIndices.length === 0) return { results, failures: [] };
  } catch (err) {
    console.warn('[category-matcher] embedding tier skipped:', err instanceof Error ? err.message : err);
  }

  // === Phase 2: 미매칭 상품 — 교차 Document Frequency 분석 → API ===
  if (adapter && unmatchedIndices.length > 0) {
    // 미매칭 상품의 토큰 DF 분석
    const docFreq = new Map<string, number>();
    for (const idx of unmatchedIndices) {
      const unique = new Set(productTokensList[idx]);
      for (const w of unique) {
        docFreq.set(w, (docFreq.get(w) || 0) + 1);
      }
    }

    const sortedByDF = [...docFreq.entries()].sort((a, b) => b[1] - a[1]);

    // DF >= 30% (최소 2개)인 단어 = 배치 레벨 카테고리 키워드
    const threshold = Math.max(2, Math.floor(unmatchedIndices.length * 0.3));
    const batchKeywords = sortedByDF
      .filter(([, count]) => count >= threshold)
      .map(([word]) => word);

    // 각 배치 키워드의 대표 상품으로 API 호출
    for (const batchKw of batchKeywords) {
      if (cache.has(batchKw)) continue;

      // 대표 상품 선택
      let bestIdx = -1;
      let bestPos = Infinity;
      for (const idx of unmatchedIndices) {
        const pos = productTokensList[idx].indexOf(batchKw);
        if (pos >= 0 && pos < bestPos) {
          bestPos = pos;
          bestIdx = idx;
        }
      }
      if (bestIdx < 0) continue;

      try {
        const result = await matchCategory(productNames[bestIdx], adapter);
        cache.set(batchKw, result);
      } catch (err) {
        console.warn('[category-matcher] Batch keyword match failed:', batchKw, err instanceof Error ? err.message : err);
        cache.set(batchKw, null);
      }

      await delay(300);
    }

    // 배치 키워드 결과를 해당 미매칭 상품에 분배
    for (const idx of unmatchedIndices) {
      if (results[idx]) continue; // 이미 매칭됨

      const tokens = new Set(productTokensList[idx]);
      for (const batchKw of batchKeywords) {
        if (tokens.has(batchKw) && cache.has(batchKw) && cache.get(batchKw)) {
          results[idx] = cache.get(batchKw)!;
          break;
        }
      }
    }
  }

  // === Phase 3: 여전히 미매칭인 상품 — 개별 폴백 ===
  // contaminated 상품은 head/full 후보 모아 AI 검증 (같은 오매칭 반복 방지).
  for (let i = 0; i < results.length; i++) {
    if (results[i]) continue;

    const isContaminated = contaminatedIndices.has(i);
    const keywords = extractKeywords(productNames[i]);
    const primaryKey = keywords[0];

    if (!isContaminated && cache.has(primaryKey)) {
      results[i] = cache.get(primaryKey) ?? null;
      continue;
    }

    try {
      let result: CategoryMatchResult | null;
      if (isContaminated) {
        // ─── SEO 스터핑 케이스 — head/full/AI 후보 비교 후 AI 검증 ───
        const candidates: { code: string; path: string }[] = [];
        const seenCodes = new Set<string>();
        const addCandidate = (r: CategoryMatchResult | null) => {
          if (!r || !r.categoryCode || seenCodes.has(r.categoryCode)) return;
          seenCodes.add(r.categoryCode);
          candidates.push({ code: r.categoryCode, path: r.categoryPath || r.categoryName || '' });
        };

        // 후보 1: 헤드 토큰 매칭 (실제 상품 정체)
        const headTokens = getHeadTokens(productTokensList[i], 5);
        if (headTokens.length >= 2) {
          const headCands: string[] = [...headTokens];
          for (let j = 0; j < headTokens.length - 1; j++) headCands.push(headTokens[j] + headTokens[j + 1]);
          const headDomain = detectDomainFilter(headCands);
          const headRes = voteTier0(headCands, headDomain, headTokens);
          addCandidate(headRes);
          // 헤드 토큰 로컬 매칭도 후보로
          const { match: headLocal } = await localMatch(headTokens, headDomain);
          if (headLocal) {
            addCandidate(await buildResultFromIndex(headLocal.entry, headLocal.score, Math.max(headLocal.score, 20)));
          }
        }

        // 후보 2: sanitize 후 매칭
        const cleaned = sanitizeSellerName(productNames[i]);
        if (cleaned !== productNames[i]) {
          const cleanedRes = await matchCategory(cleaned, adapter);
          addCandidate(cleanedRes);
        }

        // 후보 3: AI 키워드 매칭 (free-form)
        const aiFree = await aiKeywordMatch(productNames[i]);
        addCandidate(aiFree);

        // AI 검증 — 후보 중 정답 선택
        if (candidates.length > 0) {
          try {
            const { verifyCategoryFromCandidates } = await import('./ai.service');
            const verified = await verifyCategoryFromCandidates(productNames[i], candidates);
            if (verified) {
              const details = loadDetails();
              const detail = details[verified.code];
              result = {
                categoryCode: verified.code,
                categoryName: detail?.p?.split('>').pop() || verified.path.split('>').pop() || '',
                categoryPath: verified.path || detail?.p || '',
                confidence: verified.confidence,
                source: 'ai',
              };
            } else {
              // AI 키 없거나 reject — 첫 후보(head 우선)
              const first = candidates[0];
              const details = loadDetails();
              const detail = details[first.code];
              result = {
                categoryCode: first.code,
                categoryName: detail?.p?.split('>').pop() || first.path.split('>').pop() || '',
                categoryPath: first.path,
                confidence: 0.5,
                source: 'ai', // AI 검증 시도했음 표시
              };
            }
          } catch {
            result = candidates[0] ? {
              categoryCode: candidates[0].code,
              categoryName: candidates[0].path.split('>').pop() || '',
              categoryPath: candidates[0].path,
              confidence: 0.5,
              source: 'ai',
            } : null;
          }
        } else {
          // 후보 0개 — 일반 매칭 폴백
          result = await matchCategory(productNames[i], adapter);
        }
      } else {
        result = await matchCategory(productNames[i], adapter);
      }
      cache.set(primaryKey, result);
      results[i] = result;
    } catch (err) {
      console.warn('[category-matcher] Individual match failed:', productNames[i], err instanceof Error ? err.message : err);
      cache.set(primaryKey, null);
    }

    await delay(300);
  }

  // Collect failure diagnostics for unmatched products
  const failures: FailureDiagnostic[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i]) continue;
    const tier1Info = tier1Diagnostics.get(i);
    failures.push({
      index: i,
      productName: productNames[i],
      tokens: productTokensList[i],
      bestTier: tier1Info ? 'tier1' : 'none',
      bestScore: tier1Info?.score ?? 0,
      bestCandidate: tier1Info?.candidateName,
      reason: tier1Info
        ? `Tier1 점수 미달 (${tier1Info.score}/${LOCAL_MATCH_THRESHOLD})`
        : '모든 매칭 단계 실패 (Tier0~3)',
    });
  }

  return { results, failures };
}

/**
 * 카테고리 코드로 상세 정보를 조회한다 (옵션 채우기용).
 * coupang-cat-details.json에서 조회.
 */
export async function getCategoryDetails(code: string): Promise<CategoryDetails | null> {
  const details = loadDetails();
  const raw = details[code];
  if (!raw) return null;

  return {
    path: raw.p,
    commission: raw.r,
    buyOptions: raw.b.map((o) => ({
      name: o.n,
      required: o.r,
      unit: o.u,
      choose1: o.c1,
    })),
    searchOptions: raw.s.map((o) => ({
      name: o.n,
      required: o.r,
      unit: o.u,
    })),
    noticeCategory: raw.nc,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 상품명에서 검색용 키워드를 빈도 기반으로 추출한다 (단일 상품용).
 */
function extractKeywords(productName: string): string[] {
  const meaningful = tokenize(productName);

  if (meaningful.length === 0) {
    const words = productName
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 2);
    return words.length > 0 ? [words.join(' ')] : [productName.slice(0, 10)];
  }

  // 빈도 계산
  const freq = new Map<string, number>();
  for (const w of meaningful) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // 빈도순 정렬
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  const top = sorted[0];
  const second = sorted[1];
  const keywords: string[] = [top];

  if (second) {
    keywords.push(`${top} ${second}`);
  }

  const koreanOther = sorted.find((w) => w !== top && /[가-힣]/.test(w));
  if (koreanOther) {
    const combo = `${koreanOther} ${top}`;
    if (!keywords.includes(combo)) {
      keywords.push(combo);
    }
  }

  return keywords;
}
