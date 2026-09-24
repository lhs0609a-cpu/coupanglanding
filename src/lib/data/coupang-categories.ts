import fs from "node:fs";
import path from "node:path";
import slimRows from "./generated/coupang-cat-slim.json";

/**
 * 쿠팡 카테고리 실데이터 접근 계층 (서버 전용)
 *
 * ── 이 데이터가 왜 중요한가 ──
 * 쿠팡 카테고리 16,259개의 **실제** 판매수수료율과 등록 시 반드시 채워야 하는 속성 목록이다.
 * 검색해도 한 곳에 정리된 데가 없다. "쿠팡 리프트테이블 수수료", "○○ 필수속성" 같은
 * 롱테일은 우리만 답을 가지고 있다.
 *
 * ── 지어내지 않는다 ──
 * 여기서 나오는 수치는 전부 원본 JSON 에 있는 값이다. 없는 값은 화면에서 생략한다.
 * 없는 걸 채워 넣는 순간 문서가 아니라 스팸이 된다.
 *
 * ── 두 단계로 나눠 읽는 이유 ──
 * 원본 상세(public/data/coupang-cat-details.json)는 11.5MB 한 덩어리다. 그대로 쓰면
 * 빌드 워커 20여 개가 각자 파싱해 OOM 으로 죽고, 람다 콜드스타트도 같은 비용을 낸다.
 *   · 목록/허브/사이트맵 → 슬림 인덱스(generated/coupang-cat-slim.json, 1.8MB, 번들 포함)
 *   · 카테고리 문서 1건  → 속성 샤드(public/data/cat-attrs/{0..31}.json, 최대 512KB) 하나만
 * 둘 다 scripts/build-coupang-cat-slim.mjs 로 생성한다. 원본이 갱신되면 다시 돌리고 커밋한다.
 * 런타임은 원본 11.5MB 를 아예 읽지 않는다.
 *
 * ⚠️ public/data 의 파일은 Vercel 에서 CDN 으로만 올라가고 람다 번들에서 빠질 수 있다.
 *    next.config.ts 의 outputFileTracingIncludes 로 강제 포함시켜 두었다.
 */

/** 슬림 인덱스 한 줄: [id, 표시명, 전체경로, depth, 수수료율, 필수속성수, 전체속성수] */
type SlimRow = [string, string, string, number, number, number, number];

/** 상세: p=경로, r=판매수수료율(%), b=구매옵션, s=상세속성 */
interface RawDetail {
  p: string;
  r: number;
  b?: { n: string; r: boolean; u?: string }[];
  s?: { n: string; r: boolean; u?: string }[];
}

export interface CategoryAttribute {
  name: string;
  required: boolean;
  unit?: string;
}

/** 목록·링크용 경량 레코드 */
export interface CategorySummary {
  id: string;
  /** 표시명 (경로의 마지막 마디) */
  name: string;
  pathParts: string[];
  /** 1depth 대분류 */
  topLevel: string;
  depth: number;
  /** 판매수수료율 (%) */
  commissionRate: number;
  requiredAttributeCount: number;
  totalAttributeCount: number;
}

/** 상세 페이지용 — 속성 전체 목록까지 포함 */
export interface CoupangCategory extends CategorySummary {
  /** 구매옵션 — 구매자가 상품을 고를 때 선택하는 값 */
  purchaseOptions: CategoryAttribute[];
  /** 상세 속성 — 검색 필터·상세 정보에 쓰이는 값 */
  detailAttributes: CategoryAttribute[];
}

const SLIM = slimRows as SlimRow[];

function toSummary(row: SlimRow): CategorySummary {
  const pathParts = row[2].split(">");
  return {
    id: row[0],
    name: row[1],
    pathParts,
    topLevel: pathParts[0],
    depth: row[3],
    commissionRate: row[4],
    requiredAttributeCount: row[5],
    totalAttributeCount: row[6],
  };
}

/**
 * 색인에 넣지 않을 카테고리.
 *
 * `도서>외국도서` 4,602개는 전부 판매수수료 10.8% 에 속성도 ISBN·출판사·저자로 사실상
 * 동일하고, "Mice, Hamsters, Guinea Pigs, etc." 같은 영문 장르명이라 한글 검색 수요가 없다.
 * 이런 묶음을 색인에 올리면 문서 하나하나가 아니라 **사이트 전체가** thin content 로
 * 평가된다. 규모를 키우려다 나머지 11,657개까지 같이 죽는다.
 *
 * 페이지 자체는 살려 둔다(링크가 깨지면 안 되고, 직접 찾아온 사람에게는 쓸모가 있다).
 * 사이트맵에서 빼고 noindex 를 붙여 색인만 막는다.
 */
const NON_INDEXABLE_PREFIXES = ["도서>외국도서"];

export function isIndexable(category: CategorySummary): boolean {
  const full = category.pathParts.join(">");
  return !NON_INDEXABLE_PREFIXES.some((p) => full === p || full.startsWith(p + ">"));
}

/** 전체 카테고리 요약 */
export function getAllCategories(): CategorySummary[] {
  return SLIM.map(toSummary);
}

/** 색인 대상 카테고리만 (사이트맵용) */
export function getIndexableCategories(): CategorySummary[] {
  return SLIM.map(toSummary).filter(isIndexable);
}

/** 전체 카테고리 수 (객체를 만들지 않는다) */
export function getCategoryCount(): number {
  return SLIM.length;
}

/** 특정 depth 의 카테고리만 (색인 대상으로 한정할 수 있다) */
export function getCategoriesByDepth(depth: number, indexableOnly = false): CategorySummary[] {
  const rows = SLIM.filter((r) => r[3] === depth).map(toSummary);
  return indexableOnly ? rows.filter(isIndexable) : rows;
}

/**
 * 대분류 14개와 각 소속 카테고리 수 (많은 순).
 * 색인에서 뺀 카테고리는 세지 않는다 — 화면에 적는 숫자와 실제 문서 수가 어긋나면 안 된다.
 */
export function getTopLevels(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of SLIM) {
    const full = row[2];
    if (NON_INDEXABLE_PREFIXES.some((p) => full === p || full.startsWith(p + ">"))) continue;
    const top = full.split(">")[0];
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** 이 카테고리 바로 아래 하위 카테고리 */
export function getChildren(category: CategorySummary, limit = 60): CategorySummary[] {
  const prefix = category.pathParts.join(">") + ">";
  const out: CategorySummary[] = [];
  for (const row of SLIM) {
    if (row[3] !== category.depth + 1) continue;
    if (!row[2].startsWith(prefix)) continue;
    out.push(toSummary(row));
    if (out.length >= limit) break;
  }
  return out;
}

/** 같은 부모 아래 형제 카테고리 */
export function getSiblings(category: CategorySummary, limit = 24): CategorySummary[] {
  const parentPrefix = category.pathParts.slice(0, -1).join(">") + ">";
  if (parentPrefix === ">") return [];
  const out: CategorySummary[] = [];
  for (const row of SLIM) {
    if (row[0] === category.id) continue;
    if (row[3] !== category.depth) continue;
    if (!row[2].startsWith(parentPrefix)) continue;
    out.push(toSummary(row));
    if (out.length >= limit) break;
  }
  return out;
}

// ── 속성 샤드 — 카테고리 문서 1건을 그릴 때만 읽는다 ──

/**
 * 원본 상세는 11.5MB 한 덩어리다. 그대로 읽으면 두 군데서 터진다.
 *   · 빌드: page-data 수집 워커 20여 개가 각자 11.5MB 를 파싱해 수 GB 를 쓰고 OOM 으로 죽는다
 *     (실제로 죽었다 — "Collecting page data using 23 workers" 에서)
 *   · 런타임: 람다 콜드스타트마다 같은 비용을 낸다
 * 그래서 id 해시로 32조각(최대 512KB)으로 쪼개 두고 필요한 조각만 읽는다.
 *
 * ⚠️ shardOf 는 scripts/build-coupang-cat-slim.mjs 의 같은 함수와 **반드시 일치**해야 한다.
 *    한쪽만 바꾸면 조회가 조용히 전부 실패한다(404 는 안 나고 속성만 빈 채로 그려진다).
 */
const SHARD_COUNT = 32;

function shardOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % SHARD_COUNT;
}

type AttrShard = Record<string, { b: RawDetail["b"]; s: RawDetail["s"] }>;

const shardCache = new Map<number, AttrShard>();

function loadShard(id: string): AttrShard {
  const n = shardOf(id);
  const cached = shardCache.get(n);
  if (cached) return cached;
  const file = path.join(process.cwd(), "public", "data", "cat-attrs", `${n}.json`);
  const shard = JSON.parse(fs.readFileSync(file, "utf8")) as AttrShard;
  shardCache.set(n, shard);
  return shard;
}

function toAttributes(raw: RawDetail["b"]): CategoryAttribute[] {
  if (!raw) return [];
  return raw.map((a) => ({ name: a.n, required: a.r, ...(a.u ? { unit: a.u } : {}) }));
}

export function getCategory(id: string): CoupangCategory | null {
  const row = SLIM.find((r) => r[0] === id);
  if (!row) return null;
  const attrs = loadShard(id)[id];
  if (!attrs) return null;
  return {
    ...toSummary(row),
    purchaseOptions: toAttributes(attrs.b),
    detailAttributes: toAttributes(attrs.s),
  };
}

/**
 * 판매가 대비 수수료 차감액 — 수수료율이 카테고리마다 달라 이 표가 페이지마다 달라진다.
 * 결제수수료는 카테고리별 확정값이 없으므로 넣지 않는다(지어내지 않는다).
 */
export function commissionTable(rate: number, prices = [10000, 30000, 50000, 100000]) {
  return prices.map((price) => {
    const fee = Math.round((price * rate) / 100);
    return { price, fee, net: price - fee };
  });
}
