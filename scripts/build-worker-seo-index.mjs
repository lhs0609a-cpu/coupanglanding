/**
 * 워커(올인원)용 SEO 연관검색어 색인 빌더.
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 올인원 노출명의 "검색 속성어"는 지금까지 **LLM 이 지어낸 단어**였다.
 *   실제 네이버 자동완성·검색량·연관검색어 데이터(naver-search-volume.json 16.8MB,
 *   naver-autocomplete.json 4.6MB)는 웹(src/lib/megaload/data)에만 있고 워커는 참조 0건이었다.
 *   → 지어낸 속성어는 검색량이 0일 수 있다. 실제로 사람들이 치는 말로 붙여야 SEO 가 된다.
 *
 * 원본은 21MB 라 데스크탑 앱에 그대로 넣을 수 없다. 카테고리별 상위 N개 키워드만 남겨
 * 압축 색인을 만든다: { "<쿠팡 카테고리 경로>": ["연관어1", ...] }
 *
 * 실행: node scripts/build-worker-seo-index.mjs
 * 산출: worker/lib/data/seo-related.json
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const SRC = 'src/lib/megaload/data';
const OUT = 'worker/lib/data/seo-related.json';
const TOP_N = 14;          // 카테고리당 보관 개수(노출명 보정에 쓰는 만큼만)
const MIN_LEN = 2, MAX_LEN = 12;

const vol = JSON.parse(readFileSync(`${SRC}/naver-search-volume.json`, 'utf8'));
const auto = JSON.parse(readFileSync(`${SRC}/naver-autocomplete.json`, 'utf8'));
let pools = {};
try { pools = JSON.parse(readFileSync(`${SRC}/seo-keyword-pools-v2.json`, 'utf8')); } catch { /* 선택 */ }

// 전역 금지어 — 검색 노이즈/광고성. 풀 파일의 banned 를 합집합으로 모은다.
const banned = new Set(['가격', '할인', '특가', '증정', '사은품', '쿠폰', '무료배송', '당일발송',
  '빠른배송', '오늘출발', '최저가', '리뷰이벤트', '인기', '추천', '베스트', '순위', '후기']);
for (const v of Object.values(pools)) for (const b of v?.banned || []) banned.add(String(b));

// 계정정지 위험어(광고법 누적) — 노출명에 절대 들어가면 안 된다.
const RISK = /(^|[^가-힣])(유기농|국산|국내산|포도당|수액)([^가-힣]|$)/;

// 검색어이긴 하나 상품명에 넣으면 해로운 것들.
//   · 추천/순위/후기: 검색 노이즈이자 쿠팡 SEO 금지 표현
//   · 맛집/카페/레스토랑/지역: 장소 검색어(와인 → "청담맛집" 같은 오염, 실측)
const NOISE = /(추천|순위|후기|리뷰|맛집|카페|레스토랑|바로가기|가격|도매|쇼핑몰|브랜드|효능|뜻|시간|만들기)/;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const squash = (s) => clean(s).replace(/\s+/g, '');

/**
 * ⚠️ leaf 포함을 강제한다. 원본 연관검색어·자동완성에는 **동음이의어와 무관 상품**이 대량으로 섞여 있다
 *    (실측: 백미 → "백미러·백미당·백밀칼국수", 현미 → "현미경", 찹쌀 → "쑥개떡·쌀도매",
 *     와인(도서) → "청담맛집·파인다이닝"). leaf 문자열을 포함하는 것만 남기면 대부분 걸러진다.
 * ⚠️ 남더라도 **타사 브랜드명이 섞인다**(일리윤·세타필·존슨즈·바세린·신동진쌀 — 실측).
 *    그래서 이 목록은 노출명에 그대로 이어붙이지 않고 LLM 에 "실제 검색어 후보"로만 주고,
 *    브랜드 제외 규칙이 걸린 프롬프트가 고르게 한다(2중 방어).
 */
const usable = (k, leaf) => {
  const s = clean(k);
  if (s.length < MIN_LEN || s.length > MAX_LEN) return false;
  if (banned.has(s)) return false;
  if (RISK.test(s)) return false;
  if (NOISE.test(s)) return false;
  if (/[^가-힣a-zA-Z0-9 .%]/.test(s)) return false;   // 특수문자 배제(쿠팡 검색오류)
  const lf = squash(leaf);
  if (!lf || lf.length < 2) return false;
  if (!squash(s).includes(lf)) return false;          // leaf 미포함 = 다른 상품/동음이의
  if (squash(s) === lf) return false;                 // leaf 그 자체는 이미 상품명에 있다
  return true;
};

const out = {};
let kept = 0;
for (const [path, v] of Object.entries(vol)) {
  if (!v || path.startsWith('_')) continue;
  const scored = new Map();
  const leaf = v.leaf || String(path).split('>').pop();
  const add = (kw, score) => {
    const s = clean(kw);
    if (!usable(s, leaf)) return;
    scored.set(s, Math.max(scored.get(s) || 0, score));
  };
  // ① 연관검색어(검색량 순) — 사람들이 실제로 치는 말
  for (const r of v.related || []) add(r.kw, (r.pc || 0) + (r.mobile || r.mo || 0) || 1);
  // ② 자동완성 제안 — 실제 입력 접두 기반
  for (const s of auto[path]?.suggestions || []) add(s, 0.5);
  // ③ 풀의 롱테일/동의어 보강
  for (const s of [...(pools[path]?.longTail || []), ...(pools[path]?.synonyms || [])]) add(s, 0.2);

  const list = [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([k]) => k);
  if (list.length) { out[path] = list; kept += list.length; }
}

writeFileSync(OUT, JSON.stringify(out));
const mb = (statSync(OUT).size / 1048576).toFixed(2);
console.log(`카테고리 ${Object.keys(out).length.toLocaleString()}개 · 키워드 ${kept.toLocaleString()}개 → ${OUT} (${mb} MB)`);
const sample = Object.keys(out).find((k) => out[k].length >= 6);
console.log('샘플:', sample, '→', out[sample].slice(0, 8).join(', '));
