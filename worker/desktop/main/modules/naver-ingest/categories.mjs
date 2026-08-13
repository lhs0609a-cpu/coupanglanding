/**
 * 네이버 카테고리 탐색 — "전체를 긁는다"가 아니라 **관리자가 고른 카테고리만** 수집하기 위한 것.
 * ---------------------------------------------------------------------------
 * 네이버는 전체 카테고리 트리를 주는 공개 API 가 없다. 그래서 한 단계씩 들어가며 발견한다:
 *   대분류(아래 시드) → 그 페이지에서 하위 링크 수집 → 또 들어가서 수집 …
 * 한 번 발견한 결과는 캐시에 남겨(디스크 영속) 다음부터는 즉시 응답한다 —
 * 카테고리 목록을 볼 때마다 네이버 예산을 쓰면 곤란하기 때문이다.
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

/** 발견 결과 캐시: { [catId]: { children:[{id,name}], trail:[{id,name}], at } } */
let cache = {};
let store = null;

export function initCategories(storeRef) {
  store = storeRef;
  cache = store?.get('naverIngestCatCache', {}) || {};
}

function saveCache() {
  try { store?.set('naverIngestCatCache', cache); } catch { /* 캐시 저장 실패는 치명적 아님 */ }
}

/**
 * 하위 카테고리 목록.
 *   parentId 없음 → 대분류 시드(네트워크 사용 안 함)
 *   있음 → 캐시에 있으면 그대로, 없으면 그 카테고리 페이지를 열어 링크를 수집
 *
 * ★ 페이지를 여는 경우에만 게이트 슬롯을 쓴다(캐시 히트는 예산 0).
 */
export async function listChildren(pool, parentId, { force = false, onLog = () => {} } = {}) {
  if (!parentId) return { parentId: null, trail: [], children: ROOT_CATEGORIES, cached: true };

  if (!force && cache[parentId]) {
    return { parentId, ...cache[parentId], cached: true };
  }

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
    let found = { children: [], trail: [], currentId: null };
    for (let i = 0; i < 4; i++) {
      found = await sw.evaluate(categoryLinksJs);
      if (found?.children?.length) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    naverGate.recordSuccess();
    return found;
  });

  if (!result) throw new Error('수집 창을 얻지 못했습니다.');
  cache[parentId] = { children: result.children || [], trail: result.trail || [], at: Date.now() };
  saveCache();
  return { parentId, ...cache[parentId], cached: false };
}

/** 캐시 비우기(네이버가 카테고리를 개편했을 때). */
export function clearCategoryCache() {
  cache = {};
  saveCache();
  return true;
}
