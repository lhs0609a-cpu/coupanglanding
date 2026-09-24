import fs from "node:fs";
import path from "node:path";
import meta from "./generated/seo-keyword-meta.json";

/**
 * 네이버 실검색량 키워드 데이터 (서버 전용)
 *
 * ── 출처 ──
 * 네이버 검색광고 키워드도구 API 로 시드 3,300개를 확장해 336,283개를 받은 뒤,
 * 사람이 고른 시드 상품어를 포함하고 월 검색량 100 이상인 것만 남긴 75,748개다.
 * (로또·프로야구·계산기 같은 무관 키워드 17만 개를 걸러낸 결과)
 *
 * ── 지어내지 않는다 ──
 * 검색량·경쟁도는 전부 네이버가 준 값이다. 없는 값은 화면에서 생략한다.
 *
 * ⚠️ 이 필터에도 오매칭이 약 10% 남아 있다(룰루레몬→레몬, 웹하드→하드).
 *    네이버 쇼핑 검색 API 가 살아나면 상품수로 한 번 더 걸러낼 수 있다.
 *    현재 그 API 는 SE05(미등록)로 막혀 있어 competitionRatio 를 채우지 못한다.
 *
 * ── 세 갈래로 나눠 읽는다 ──
 *   · 개수·그룹 통계 → generated/seo-keyword-meta.json (수백 바이트, import)
 *   · 목록/사이트맵  → public/data/kw-index.json (4.5MB, fs)
 *   · 문서 1건       → public/data/kw/{0..63}.json (최대 246KB, fs)
 * 전부 scripts/build-seo-keyword-dataset.mjs 로 생성한다.
 *
 * ⚠️ 4.5MB 인덱스를 src/ 에 두고 import 하면 안 된다. TypeScript 가 75,748개 원소의
 *    리터럴 타입을 추론하려 들어 tsc 가 10분을 넘긴다(실측). 그래서 fs 로 읽는다.
 *    대신 next.config.ts 의 outputFileTracingIncludes 에 반드시 포함시켜야 한다.
 */

/** 인덱스 한 줄: [키워드, 총검색량, 시드, 시드카테고리, 쿠팡카테고리id|null] */
type IndexRow = [string, number, string, string, string | null];

export interface KeywordSummary {
  keyword: string;
  totalSearch: number;
  /** 이 키워드를 물어온 시드 상품어 */
  seed: string;
  /** 시드가 속한 상품 카테고리 (11종) */
  seedCategory: string;
  /** 연결된 쿠팡 카테고리 id (없을 수 있다) */
  coupangCategoryId: string | null;
}

export interface KeywordDetail extends KeywordSummary {
  pcSearch: number;
  mobileSearch: number;
  /** 네이버가 준 경쟁 정도 (낮음/중간/높음) */
  competition: string;
  /** 연결된 쿠팡 카테고리의 판매수수료율 (%) */
  coupangCommissionRate: number | null;
  /**
   * 상품수 ÷ 검색량. 셀러가 실제로 보는 지표다.
   * 네이버 쇼핑 검색 API 가 등록되지 않아 아직 채우지 못한다 → null.
   */
  competitionRatio: number | null;
}

let indexCache: IndexRow[] | null = null;

function loadIndex(): IndexRow[] {
  if (indexCache) return indexCache;
  const file = path.join(process.cwd(), "public", "data", "kw-index.json");
  indexCache = JSON.parse(fs.readFileSync(file, "utf8")) as IndexRow[];
  return indexCache;
}

/** 시드 카테고리 목록 — 목록 페이지의 그룹이 된다. 순서가 곧 URL 의 groupId 다 */
export const KEYWORD_GROUPS: string[] = [
  "패션의류",
  "패션잡화",
  "화장품/미용",
  "디지털/가전",
  "가구/인테리어",
  "출산/육아",
  "식품",
  "스포츠/레저",
  "생활/건강",
  "여가/생활편의",
  "기타",
];

function toSummary(row: IndexRow): KeywordSummary {
  return {
    keyword: row[0],
    totalSearch: row[1],
    seed: row[2],
    seedCategory: row[3],
    coupangCategoryId: row[4],
  };
}

export function getKeywordCount(): number {
  // 메타만 읽으면 되므로 4.5MB 인덱스를 열지 않는다
  return meta.count;
}

/** 전체 (사이트맵용) */
export function getAllKeywords(): KeywordSummary[] {
  return loadIndex().map(toSummary);
}

/** 검색량 상위 N개 */
export function getTopKeywords(limit: number): KeywordSummary[] {
  // 인덱스는 생성 시점에 검색량 내림차순으로 정렬돼 있다
  return loadIndex().slice(0, limit).map(toSummary);
}

/** 그룹별 개수 */
export function getGroupCounts(): { group: string; groupId: number; count: number }[] {
  // 메타에 그룹별 개수가 들어 있다 — 인덱스를 열 필요가 없다
  const counts = meta.groups as Record<string, number>;
  return KEYWORD_GROUPS.map((group, groupId) => ({
    group,
    groupId,
    count: counts[group] ?? 0,
  })).filter((g) => g.count > 0);
}

export const KEYWORDS_PER_PAGE = 100;

/** 그룹 안에서 페이지 단위로 자른다 (1-base page) */
export function getKeywordPage(
  groupId: number,
  page: number
): { items: KeywordSummary[]; totalPages: number; group: string } | null {
  const group = KEYWORD_GROUPS[groupId];
  if (!group) return null;
  const rows = loadIndex().filter((r) => r[3] === group);
  const totalPages = Math.max(1, Math.ceil(rows.length / KEYWORDS_PER_PAGE));
  if (page < 1 || page > totalPages) return null;
  const start = (page - 1) * KEYWORDS_PER_PAGE;
  return {
    items: rows.slice(start, start + KEYWORDS_PER_PAGE).map(toSummary),
    totalPages,
    group,
  };
}

/** 같은 시드에서 나온 연관 키워드 — 내부 링크용 */
export function getRelatedKeywords(keyword: string, seed: string, limit = 24): KeywordSummary[] {
  const out: KeywordSummary[] = [];
  for (const row of loadIndex()) {
    if (row[2] !== seed) continue;
    if (row[0] === keyword) continue;
    out.push(toSummary(row));
    if (out.length >= limit) break;
  }
  return out;
}

// ── 상세 샤드 ──

const SHARD_COUNT = 64;

/** ⚠️ scripts/build-seo-keyword-dataset.mjs 의 shardOf 와 반드시 일치해야 한다 */
function shardOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

interface RawDetail {
  pc: number;
  mo: number;
  t: number;
  c: string;
  s: string;
  sc: string;
  ci: string | null;
  cr: number | null;
}

const shardCache = new Map<number, Record<string, RawDetail>>();

function loadShard(keyword: string): Record<string, RawDetail> {
  const n = shardOf(keyword);
  const cached = shardCache.get(n);
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "data", "kw", `${n}.json`);
  const shard = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, RawDetail>;
  shardCache.set(n, shard);
  return shard;
}

export function getKeyword(keyword: string): KeywordDetail | null {
  let d: RawDetail | undefined;
  try {
    d = loadShard(keyword)[keyword];
  } catch {
    return null;
  }
  if (!d) return null;
  return {
    keyword,
    totalSearch: d.t,
    pcSearch: d.pc,
    mobileSearch: d.mo,
    competition: d.c,
    seed: d.s,
    seedCategory: d.sc,
    coupangCategoryId: d.ci,
    coupangCommissionRate: d.cr,
    // 쇼핑 검색 API 가 등록되면 여기에 상품수 기반 경쟁률이 들어간다
    competitionRatio: null,
  };
}
