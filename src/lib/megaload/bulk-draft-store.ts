// ============================================================
// 대량등록 작업 드래프트 저장소 — IndexedDB (서버·비용 0, 클라이언트 전용)
//
// sessionStorage(탭 닫으면 소멸·5MB 한계) 대신 IndexedDB 사용:
//   · 브라우저를 닫거나 크래시해도 유지 → 프리플라이트/등록 중 오류 나도 이어하기 가능
//   · 수백 개 상품(상세 HTML 포함) 등 대용량도 저장(localStorage QuotaExceeded 회피)
// 값은 기존과 동일하게 JSON 문자열로 보관(구조적 복제 이슈 회피, 의미 동일).
// ============================================================
const DB_NAME = 'megaload';
const STORE = 'drafts';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 미지원')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 드래프트 저장 (덮어쓰기). 실패해도 throw 하지 않고 조용히 무시(저장 실패가 작업을 막지 않도록). */
export async function saveDraft(key: string, jsonValue: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(jsonValue, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* 저장 실패 무시 */ }
}

/** 드래프트 로드 — 없거나 실패 시 null. */
export async function loadDraft<T = string>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const value = await new Promise<T | null>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as T) ?? null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return value;
  } catch { return null; }
}

/** 드래프트 삭제 (등록 완료/새로 시작 시). */
export async function clearDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* 무시 */ }
}
