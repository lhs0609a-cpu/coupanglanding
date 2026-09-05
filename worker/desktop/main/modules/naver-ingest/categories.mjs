/**
 * 네이버 카테고리 탐색 — "전체를 긁는다"가 아니라 **관리자가 고른 카테고리만** 수집하기 위한 것.
 * ---------------------------------------------------------------------------
 * 네이버는 전체 카테고리 트리를 주는 공개 API 가 없다. 그래서 한 단계씩 들어가며 발견한다:
 *   대분류(아래 시드) → 그 페이지에서 하위 링크 수집 → 또 들어가서 수집 …
 * 한 번 발견한 결과는 캐시에 남겨(디스크 영속) 다음부터는 즉시 응답한다 —
 * 카테고리 목록을 볼 때마다 네이버 예산을 쓰면 곤란하기 때문이다.
 *
 * ⭐ 어떻게 "하위 분류"를 가려내는가 (v2)
 *   페이지에는 어디서나 전체 메뉴(대분류+중분류)가 깔려 있어서 링크를 그냥 모으면 전부 섞인다.
 *   대신 우리는 **대분류 id 25개를 알고 있다**. 그래서:
 *     · 대분류 페이지 → 링크 목록을 대분류 경계로 잘라 { 대분류 → 중분류 } 를 통째로 복원한다.
 *       (페이지 1장으로 25개 대분류의 중분류가 전부 확보된다 = 트리를 바로 펼쳐 보여줄 수 있다)
 *     · 그 아래 단계 → **처음 보는 id 만** 하위 분류다. 메뉴·형제·조상은 이미 캐시에 있으므로
 *       "알고 있는 id"를 빼면 남는 게 곧 자식이다.
 *
 * 🔴 소분류는 **메뉴 페이지에 없다** (2026-08-20 실측, 이게 depth 3 이 계속 0 이던 원인)
 *   shopping.naver.com/ns/category/{중분류} 를 열고 8초를 더 기다려도 링크는 404개 —
 *   전부 전역 메뉴(대분류 25 + 중분류 377)뿐이고 그 중분류의 자식은 한 개도 없다.
 *   그래서 prewarm 을 depth 8 로 완주해도 중분류 376개가 전부 "자식 0개(말단)" 로 캐시됐다.
 *   소분류는 **목록 페이지**(search.shopping.naver.com/ns/category/{id})의 카테고리 메뉴에만
 *   있다(같은 실측: '상의' 목록 페이지 → 반팔티셔츠·민소매티셔츠·크롭티… 8개 + 조상/자기 링크).
 *   → 중분류 이하는 수집과 **같은 경로**(메뉴 → 목록 링크 클릭)로 목록 페이지까지 가서 읽는다.
 *   ⚠️ 목록 페이지는 **네이버 로그인 없이는 안 열린다**(로그인 화면으로 튄다). 그래서 이 단계는
 *      로그인을 전제로 하고, 없으면 페이지를 여는 대신 그렇게 말하고 멈춘다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryLinksJs } from './inject.mjs';
import naverGate from '../../naver-gate.mjs';

/**
 * 앱에 **동봉된 카테고리 스냅샷**(category-tree.json).
 *
 * 왜 파일로 들고 다니나: 카테고리 트리는 하루에도 안 바뀌는데, 그걸 설치본마다 처음 한 번씩
 * 네이버를 20~40분 두드려 다시 알아내는 건 낭비다(그 시간 동안 사용자는 기다린다).
 * 이미 알아낸 건 제품에 넣어 배포하면 **첫 실행부터 요청 0으로 즉시** 뜬다.
 * 파일은 도우미의 /naver-ingest/categories/export 결과를 그대로 커밋해 갱신한다.
 */
const BUNDLED = (() => {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), 'category-tree.json');
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return j?.map && Object.keys(j.map).length ? j : null;
  } catch { return null; }   // 스냅샷이 없어도 동작한다 — 그때는 직접 읽을 뿐이다
})();

/**
 * 대분류 시드 — 이것만 상수로 두고 나머지는 런타임에 발견한다.
 * (naveritem 원본의 data/nav_category_map.json 에서 가져온 값)
 *
 * ⚠️ 여기서 빠진 대분류는 **사라지지 않고 남의 자식이 된다**. 메뉴를 대분류 경계로 자르기
 *   때문에, 모르는 대분류는 앞 대분류의 중분류로 붙어 버린다(실측 2026-08-20: 렌탈관의
 *   5개가 '공구' 밑으로, 여행의 5개가 'E쿠폰/티켓/생활편의' 밑으로 들어가 있었다).
 *   네이버 메뉴 API(shopping.naver.com/api/modules/gnb/category/list)가 대분류 27개를
 *   준다 — 목록이 어긋나 보이면 그걸로 대조한다.
 */
export const ROOT_CATEGORIES = [
  { id: '10000107', name: '여성의류' },
  { id: '10000108', name: '남성의류' },
  { id: '10000109', name: '패션잡화' },
  { id: '10000110', name: '신발' },
  { id: '10000111', name: '화장품/미용' },
  { id: '10006530', name: '신선식품' },
  { id: '10000114', name: '가공식품' },
  { id: '10000115', name: '건강식품' },
  { id: '10000116', name: '출산/유아동' },
  { id: '10000117', name: '반려동물용품' },
  { id: '10000120', name: '가전' },
  { id: '10000121', name: '휴대폰/카메라' },
  { id: '10000122', name: 'PC/주변기기' },
  { id: '10000112', name: '가구' },
  { id: '10006496', name: '조명/인테리어' },
  { id: '10000113', name: '패브릭/홈데코' },
  { id: '10000119', name: '주방용품' },
  { id: '10000118', name: '생활용품' },
  { id: '10000123', name: '스포츠/레저' },
  { id: '10000125', name: '자동차/오토바이' },
  { id: '10000127', name: '키덜트/취미' },
  { id: '10000124', name: '건강/의료용품' },
  { id: '10000128', name: '악기/문구' },
  { id: '10000126', name: '공구' },
  { id: '10007178', name: '렌탈관' },
  { id: '10000129', name: 'E쿠폰/티켓/생활편의' },
  { id: '10008203', name: '여행' },
];

/**
 * 카테고리 **메뉴** 페이지 — 하위 분류 링크가 여기 있다. 상품은 없다.
 * (실측 2026-08-17: 본문 2,976자 · scrollHeight 106 · 상품 링크 1개(배너). 링크 480개 중 403개가
 *  전부 카테고리 메뉴다. 여기서 스크롤해봐야 영원히 0건이다.)
 */
export const categoryUrl = (id) => `https://shopping.naver.com/ns/category/${id}`;

/**
 * 카테고리 **상품 목록** 페이지 — 실제 상품 카드는 이 호스트에만 있다.
 * ⚠️ 로그인 세션이 없으면 nid.naver.com 로그인 화면으로 리다이렉트된다(실측 — 페이지 안의 진짜
 *   링크를 눌러도 동일). 그래서 수집 전에 로그인 여부를 반드시 먼저 본다.
 */
export const listUrl = (id) => `https://search.shopping.naver.com/ns/category/${id}`;

const ROOT_IDS = new Set(ROOT_CATEGORIES.map((c) => c.id));

/** 한 카테고리가 가질 수 있는 하위 개수 상한 — 이걸 넘으면 목록을 잘못 읽은 것으로 본다. */
const MAX_CHILDREN = 80;

/**
 * 카테고리처럼 생겼지만 카테고리가 아닌 링크.
 * 목록 페이지의 '더보기' 는 **남의 가지로 간다**(실측: 신선식품>김치 의 더보기 → 주방용품의
 * '김치통', 가공식품>커피/차류 의 더보기 → '과자/떡/베이커리'). 이름이 화면 문구라서
 * 걸러 내지 않으면 트리에 '더보기' 라는 카테고리가 생긴다.
 */
const NON_CATEGORY_NAMES = new Set(['더보기', '더 보기', '전체보기', '전체 보기', '모두보기']);

/**
 * 캐시 스키마 버전. v1 은 전체 메뉴가 통째로 섞여 들어간 쓰레기라 그대로 두면 영원히 보인다 —
 * 버전이 다르면 조용히 버린다.
 */
// v3: 사이드바를 기다리지 않고 읽어 "자식 0개(말단)" 로 잘못 저장된 항목들을 버린다.
// v4: 소분류를 **메뉴 페이지**에서 찾다가 중분류 376개를 전부 "말단" 으로 적어 둔 캐시를 버린다.
//     (버전을 안 올리면 그 빈 항목이 캐시 히트라 목록 페이지를 영원히 안 열어 본다)
const CACHE_VERSION = 4;

/** 발견 결과 캐시: { [catId]: { children:[{id,name}], at } } */
let cache = {};
let store = null;
let useBundle = true;

/** 동봉 스냅샷만 깔린 바닥 상태 — 초기화와 "캐시 비우기"가 같은 출발선을 쓰게 한다. */
function baseCache(useBundled) {
  const base = {};
  if (useBundled && BUNDLED) {
    for (const [id, kids] of Object.entries(BUNDLED.map)) {
      if (kids?.length) base[id] = { children: kids, at: BUNDLED.at || 0, bundled: true };
    }
  }
  return base;
}

/** bundled=false 는 테스트에서 동봉 스냅샷 없이 발견 로직만 보려는 경우다. */
export function initCategories(storeRef, { bundled = true } = {}) {
  store = storeRef;
  useBundle = bundled;
  const v = store?.get('naverIngestCatVersion', 0) || 0;
  const ok = v === CACHE_VERSION;

  // 동봉 스냅샷을 바닥에 깔고 그 위에 이 PC 가 직접 읽은 것을 덮는다 —
  // 직접 읽은 쪽이 항상 더 최신이고, 스냅샷은 "아직 안 읽은 가지"를 메우는 용도다.
  cache = baseCache(bundled);
  if (ok) for (const [id, entry] of Object.entries(store?.get('naverIngestCatCache', {}) || {})) cache[id] = entry;

  const saved = ok ? store?.get('naverIngestCatPrewarm', null) : null;
  done = saved || { at: 0, depth: 0, nodes: 0 };
  // 스냅샷이 이미 소분류(3단계)까지 담고 있으면 "다 읽은 것"으로 친다 — 다시 20~40분 돌 이유가 없다.
  // 중분류(2단계)까지만 담긴 스냅샷은 완료가 아니다: 첫 두 단계를 공짜로 얻되, 소분류는 여전히 읽어야 한다.
  if (bundled && BUNDLED && (BUNDLED.depth || 0) >= 3 && (BUNDLED.depth || 0) > (done.depth || 0)) {
    done = { at: BUNDLED.at || Date.now(), depth: BUNDLED.depth, nodes: 0 };
  }
  if (!ok) saveCache();
}

function saveCache() {
  try {
    store?.set('naverIngestCatCache', cache);
    store?.set('naverIngestCatVersion', CACHE_VERSION);
    store?.set('naverIngestCatPrewarm', done);
  } catch { /* 캐시 저장 실패는 치명적 아님 */ }
}

/** 지금까지 발견한 트리 전체 { 부모id → 자식들 } — 웹이 한 번에 펼쳐 그리는 데 쓴다. */
export function knownMap() {
  const map = {};
  for (const [pid, entry] of Object.entries(cache)) map[pid] = entry.children || [];
  return map;
}

/** 이미 아는 카테고리 id 전부 — "이 페이지에서 처음 보는 것"을 가려내는 기준선. */
function knownIds() {
  const s = new Set(ROOT_IDS);
  for (const [pid, entry] of Object.entries(cache)) {
    s.add(pid);
    for (const c of entry.children || []) s.add(c.id);
  }
  return s;
}

/**
 * 문서 순서대로 나온 링크를 **대분류 경계로 잘라** 전체 메뉴(대분류→중분류)를 복원한다.
 * 대분류 링크를 만나면 그때부터 다음 대분류 전까지가 그 대분류의 중분류다.
 * 첫 대분류 앞에 나오는 링크(사이드바 등)는 소속을 알 수 없으므로 버린다.
 */
function splitMenu(links) {
  const groups = {};
  let cur = null;
  for (const l of links) {
    if (ROOT_IDS.has(l.id)) { cur = l.id; if (!groups[cur]) groups[cur] = []; continue; }
    if (cur && groups[cur].length < MAX_CHILDREN) groups[cur].push(l);
  }
  return groups;
}

/**
 * 하위 카테고리 목록.
 *   parentId 없음 → 대분류 시드(네트워크 사용 안 함)
 *   있음 → 캐시에 있으면 그대로, 없으면 그 카테고리 페이지를 열어 링크를 수집
 *
 * ★ 페이지를 여는 경우에만 게이트 슬롯을 쓴다(캐시 히트는 예산 0).
 */
export async function listChildren(pool, parentId, { force = false, onLog = () => {}, signal, ensureLogin = null } = {}) {
  if (!parentId) return { parentId: null, trail: [], children: ROOT_CATEGORIES, map: knownMap(), cached: true };

  if (!force && cache[parentId]) {
    return { parentId, trail: [], children: cache[parentId].children || [], map: knownMap(), cached: true };
  }

  const before = knownIds();
  const isRoot = ROOT_IDS.has(parentId);

  // 중분류 이하는 목록 페이지까지 가야 하고, 그 페이지는 로그인이 전제다 — 창을 열기 전에 챙긴다.
  if (!isRoot && ensureLogin) await ensureLogin().catch(() => { /* 아래에서 loginRequired 로 잡힌다 */ });

  // 미리 읽기 중 "정지"를 누르면 쿨다운을 기다리던 것까지 즉시 풀린다.
  await naverGate.acquire('ingest', { signal });
  const result = await pool.withWindow('list', async (sw) => {
    onLog(`카테고리 탐색 — ${parentId}`);
    const nav = await sw.gotoViaClick(categoryUrl(parentId), { timeoutMs: 20000 });
    if (!nav.ok) throw new Error(`카테고리 페이지를 열지 못했습니다 (${nav.error || 'unknown'})`);

    const det = await sw.detect();
    if (det.captcha) throw new Error('캡차가 떴습니다 — 도우미 창에서 풀어주세요.');
    if (det.blocked) {
      const ms = naverGate.triggerCooldown(det.is429);
      throw new Error(`네이버가 차단했습니다 — ${Math.round(ms / 1000)}초 뒤 다시 시도하세요.`);
    }

    // 대분류는 이 메뉴 페이지 한 장이면 끝난다(25개 대분류의 중분류가 전부 여기 있다).
    if (isRoot) {
      let menu = { links: [], currentId: null };
      for (let i = 0; i < 8; i++) {
        const seen = await sw.evaluate(categoryLinksJs);
        if (seen?.links?.length) { menu = seen; break; }   // 메뉴는 뜨자마자 있다 — 기다릴 게 없다
        await new Promise((r) => setTimeout(r, 700));
      }
      naverGate.recordSuccess();
      return menu;
    }

    // 중분류 이하 — 소분류는 **목록 페이지**에만 있다. 수집과 같은 경로로 간다
    // (메뉴 안의 진짜 링크를 눌러서 이동. 없으면 그때만 목록 주소로 직접 간다).
    const viaMenu = await sw.gotoViaPageLink(`search.shopping.naver.com/ns/category/${parentId}`, { timeoutMs: 20000 });
    const nav2 = viaMenu.notFound
      ? await sw.gotoViaClick(listUrl(parentId), { timeoutMs: 20000 })
      : viaMenu;
    if (!nav2.ok) throw new Error(`목록 페이지를 열지 못했습니다 (${nav2.error || 'unknown'})`);

    const det2 = await sw.detect();
    if (det2.captcha) throw new Error('캡차가 떴습니다 — 도우미 창에서 풀어주세요.');
    if (det2.loginRequired) throw new Error('네이버 로그인이 필요합니다 — 목록 페이지는 로그인 없이 열리지 않습니다.');
    if (det2.blocked) {
      const ms = naverGate.triggerCooldown(det2.is429);
      throw new Error(`네이버가 차단했습니다 — ${Math.round(ms / 1000)}초 뒤 다시 시도하세요.`);
    }

    // ⚠️ "링크가 하나라도 잡히면 됐다" 로 기다리면 **항상 첫 시도에 끝난다** — 조상·자기
    //   링크는 뜨자마자 있기 때문이다. 정작 필요한 카테고리 메뉴는 그보다 늦게 그려져서,
    //   기다림 없이 읽으면 "자식 0개(=말단)" 로 저장된다.
    //   그래서 **처음 보는 id 가 나타날 때까지** 기다린다. 그게 메뉴가 그려진 시점이다.
    let found = { links: [], currentId: null };
    for (let i = 0; i < 8; i++) {
      const seen = await sw.evaluate(categoryLinksJs);
      if (seen?.links?.length) found = seen;
      const fresh = (found.links || []).filter((l) => l.id !== parentId && !before.has(l.id));
      if (fresh.length) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    naverGate.recordSuccess();
    return found;
  });

  if (!result) throw new Error('수집 창을 얻지 못했습니다.');
  const links = (result.links || []).filter((l) => l && l.id && l.name && !NON_CATEGORY_NAMES.has(l.name));

  let children;
  if (ROOT_IDS.has(parentId)) {
    // 대분류 페이지 — 메뉴 전체를 복원해 25개 대분류의 중분류를 한꺼번에 캐시에 넣는다.
    // 메뉴가 제대로 안 잡히면(레이아웃 변경 등) 아래 "처음 보는 id" 방식으로 떨어진다.
    const groups = splitMenu(links);
    const solid = Object.values(groups).filter((g) => g.length > 0).length;
    if (solid >= 15) {
      for (const [rootId, kids] of Object.entries(groups)) {
        if (kids.length) cache[rootId] = { children: kids, at: Date.now() };
      }
      onLog(`카테고리 메뉴 복원 — 대분류 ${solid}개의 하위 분류를 한 번에 확보했습니다.`);
      // 메뉴를 제대로 읽었는데 이 대분류만 비었다면 정말로 하위가 없는 것이다.
      // (여기서 아래 "처음 보는 id" 로 넘기면 방금 넣은 남의 중분류를 자식으로 오인한다)
      children = cache[parentId]?.children || [];
    }
  }

  if (!children) {
    // 중분류 이하 — 메뉴·형제·조상은 이미 아는 id 이므로, 처음 보는 것만 자식이다.
    children = links.filter((l) => l.id !== parentId && !before.has(l.id)).slice(0, MAX_CHILDREN);
  }

  cache[parentId] = { children, at: Date.now() };
  saveCache();
  return { parentId, trail: [], children, map: knownMap(), cached: false };
}

/**
 * 캐시 비우기(네이버가 카테고리를 개편했을 때).
 * 완전히 빈 상태가 아니라 **동봉 스냅샷 상태**로 되돌린다 — 제품이 들고 있는 트리까지
 * 버리면 다음 조회가 다시 처음부터 네이버를 두드리게 된다.
 */
export function clearCategoryCache() {
  cache = baseCache(useBundle);
  done = { at: 0, depth: 0, nodes: 0 };
  saveCache();
  return true;
}

// ── 전체 트리 미리 읽기 ───────────────────────────────────────────────────
// 관리자가 카테고리를 고를 때마다 몇 초씩 기다리는 건 잘못된 설계다. 트리는 하루에도
// 안 바뀌는 정적인 것이므로 **미리 다 읽어 두고** 클릭은 즉답이어야 한다.
//
// 비용은 정직하게 적어 둔다: 게이트가 요청 간 3~7초를 강제하므로(품절 모니터와 예산 공유)
// 중분류 약 400개를 열어 소분류까지 확보하는 데 **20~40분**이 걸린다. 세분류까지 가면
// 수천 페이지라 몇 시간이다. 그래서 기본 깊이는 3(소분류)이다.
// 중분류부터는 한 카테고리당 페이지가 2장이다(메뉴 → 목록) — 소분류가 목록 쪽에만 있기 때문이다.

/** 미리 읽기 완료 스탬프 — 웹이 "이미 다 읽었는지"를 판단하는 근거. */
let done = { at: 0, depth: 0, nodes: 0 };

/**
 * 지금까지 발견한 트리를 그대로 뽑는다 — 이 결과를 category-tree.json 으로 커밋하면
 * 다음 릴리스부터는 모든 설치본이 요청 0으로 이 트리를 갖고 시작한다.
 */
export function exportTree() {
  const map = {};
  let categories = 0;
  for (const [id, entry] of Object.entries(cache)) {
    const kids = entry.children || [];
    if (!kids.length) continue;
    map[id] = kids.map((c) => ({ id: String(c.id), name: String(c.name) }));
    categories += kids.length;
  }
  return { at: Date.now(), depth: done.depth || 0, parents: Object.keys(map).length, categories, map };
}

export function prewarmInfo() {
  const ids = new Set(ROOT_IDS);
  for (const e of Object.values(cache)) for (const c of e.children || []) ids.add(c.id);
  return { ...done, nodes: ids.size };
}

/** 동시 실행 도우미 — 창 개수만큼만 병렬로 돌린다(게이트가 총량을 따로 막는다). */
async function runPooled(items, concurrency, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * 트리 전체를 미리 읽어 캐시에 채운다.
 *   maxDepth 3 = 대>중>소 (중분류 페이지를 전부 연다)
 *   maxDepth 4 = 세분류까지 (수천 페이지 — 몇 시간)
 *   maxDepth 8 = 사실상 "끝까지" — 더 내려갈 곳이 없으면 알아서 멈춘다
 * 이미 캐시에 있는 가지는 건너뛰므로 중단 후 다시 시작하면 이어서 한다.
 */
export async function prewarmTree(pool, { maxDepth = 3, onLog = () => {}, onProgress = () => {}, signal, ensureLogin = null } = {}) {
  let level = ROOT_CATEGORIES.slice();
  let read = 0, failed = 0;
  const visited = new Set();

  for (let depth = 1; depth < maxDepth; depth++) {
    const todo = level.filter((c) => !visited.has(c.id));
    todo.forEach((c) => visited.add(c.id));
    const next = [];
    const queued = new Set();
    let leftInLevel = todo.length;
    // 다음 단계를 실제로 열게 되는가 — 안 열 거면 "남은 개수"에 세면 안 된다.
    // (마지막 단계에서 발견되는 소분류 수천 개를 남은 일감으로 세면 예상 시간이 몇 시간으로 뻥튀기된다)
    const deeper = depth + 1 < maxDepth;

    // 대분류는 순차로 — 첫 페이지 한 장이 25개 대분류의 중분류를 전부 채우므로,
    // 병렬로 쏘면 이미 확보될 내용을 위해 페이지를 4장 더 여는 낭비가 된다.
    const conc = depth === 1 ? 1 : Math.max(1, Math.min(pool?.effectiveCount || pool?.configured || 2, 4));

    await runPooled(todo, conc, async (node) => {
      if (signal?.aborted) return;
      leftInLevel--;
      onProgress({ read, failed, level: depth + 1, pending: leftInLevel + (deeper ? next.length : 0), current: node.name });

      let kids = cache[node.id]?.children;
      if (!kids) {
        // 차단이면 게이트가 쿨다운을 걸어 두므로, 다음 acquire 가 알아서 그만큼 기다린다.
        for (let attempt = 1; attempt <= 3 && !kids; attempt++) {
          if (signal?.aborted) return;
          try {
            kids = (await listChildren(pool, node.id, { onLog, signal, ensureLogin })).children;
            read++;
          } catch (e) {
            const msg = String(e?.message || e);
            if (msg === 'aborted' || signal?.aborted) return;
            if (/캡차/.test(msg)) throw e;       // 사람이 풀어야 한다 — 여기서 멈추는 게 맞다
            if (attempt === 3) { failed++; onLog(`건너뜀 — ${node.name}: ${msg}`); }
          }
        }
      }
      // 같은 하위 분류가 여러 부모에 걸려 있을 수 있다 — 두 번 열지 않는다.
      for (const k of kids || []) {
        if (visited.has(k.id) || queued.has(k.id)) continue;
        queued.add(k.id);
        next.push(k);
      }
      onProgress({ read, failed, level: depth + 1, pending: leftInLevel + (deeper ? next.length : 0), current: node.name });
    });

    if (signal?.aborted) return { read, failed, stopped: '사용자가 중단했습니다.' };
    if (!next.length) break;
    level = next;
  }

  done = { at: Date.now(), depth: maxDepth, nodes: Object.keys(cache).length };
  saveCache();
  return { read, failed, stopped: null };
}
