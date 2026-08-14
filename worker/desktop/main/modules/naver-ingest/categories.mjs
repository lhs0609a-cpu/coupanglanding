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
 */
import { categoryLinksJs } from './inject.mjs';
import naverGate from '../../naver-gate.mjs';

/**
 * 대분류 시드 — 이것만 상수로 두고 나머지는 런타임에 발견한다.
 * (naveritem 원본의 data/nav_category_map.json 에서 가져온 값)
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
  { id: '10000129', name: 'E쿠폰/티켓/생활편의' },
];

export const categoryUrl = (id) => `https://shopping.naver.com/ns/category/${id}`;

const ROOT_IDS = new Set(ROOT_CATEGORIES.map((c) => c.id));

/** 한 카테고리가 가질 수 있는 하위 개수 상한 — 이걸 넘으면 목록을 잘못 읽은 것으로 본다. */
const MAX_CHILDREN = 80;

/**
 * 캐시 스키마 버전. v1 은 전체 메뉴가 통째로 섞여 들어간 쓰레기라 그대로 두면 영원히 보인다 —
 * 버전이 다르면 조용히 버린다.
 */
const CACHE_VERSION = 2;

/** 발견 결과 캐시: { [catId]: { children:[{id,name}], at } } */
let cache = {};
let store = null;

export function initCategories(storeRef) {
  store = storeRef;
  const v = store?.get('naverIngestCatVersion', 0) || 0;
  cache = v === CACHE_VERSION ? (store?.get('naverIngestCatCache', {}) || {}) : {};
  if (v !== CACHE_VERSION) saveCache();
}

function saveCache() {
  try {
    store?.set('naverIngestCatCache', cache);
    store?.set('naverIngestCatVersion', CACHE_VERSION);
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
export async function listChildren(pool, parentId, { force = false, onLog = () => {} } = {}) {
  if (!parentId) return { parentId: null, trail: [], children: ROOT_CATEGORIES, map: knownMap(), cached: true };

  if (!force && cache[parentId]) {
    return { parentId, trail: [], children: cache[parentId].children || [], map: knownMap(), cached: true };
  }

  const before = knownIds();

  await naverGate.acquire('ingest');
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

    // 사이드바는 늦게 그려진다. 링크가 잡힐 때까지 몇 번 다시 읽는다.
    let found = { links: [], currentId: null };
    for (let i = 0; i < 4; i++) {
      found = await sw.evaluate(categoryLinksJs);
      if (found?.links?.length) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    naverGate.recordSuccess();
    return found;
  });

  if (!result) throw new Error('수집 창을 얻지 못했습니다.');
  const links = (result.links || []).filter((l) => l && l.id && l.name);

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

/** 캐시 비우기(네이버가 카테고리를 개편했을 때). */
export function clearCategoryCache() {
  cache = {};
  saveCache();
  return true;
}
