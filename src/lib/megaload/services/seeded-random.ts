// ============================================================
// 결정적 PRNG (Mulberry32)
// 셀러 ID를 시드로 넣으면 항상 같은 랜덤 시퀀스를 반환한다.
// 아이템위너 방지에서 셀러별 고유 셔플을 보장하기 위해 사용.
// ============================================================

/**
 * 문자열을 숫자 시드로 변환 (DJB2 해시)
 */
export function stringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG — 시드로부터 0~1 사이 float를 반환하는 함수 생성
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
