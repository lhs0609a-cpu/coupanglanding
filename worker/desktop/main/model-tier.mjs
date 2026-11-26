/**
 * 하드웨어 → 모델 티어 결정 (순수 함수 · import 없음 · 단위 테스트 가능).
 * ---------------------------------------------------------------------------
 * 원칙: **모델 선택은 안정적인 값으로만** 한다.
 *   - GPU 쪽은 "지금 남은 VRAM"(모델을 올릴 수 있는 크기의 기준)
 *   - RAM 쪽은 "총 RAM"(PC 사양). "남은 RAM"은 출렁여서(작업 중 1.1GB ↔ 유휴 5.0GB) 모델 강등에 쓰지 않는다.
 *   남은 RAM 은 **시작 여부**(모델을 올릴 여유가 있나)만 판단한다 — requiredRamMb 참고.
 *
 * 티어:
 *   strong : 7.8B  — VRAM 이 넉넉해 GPU 에 통째로 올라감
 *   small  : 3B    — GPU 가 쓸 만하면(작은 VRAM 포함) 3B, CPU 면 총 RAM 12GB 이상
 *   tiny   : 1.5B  — GPU 를 못 쓰고(없음/VRAM 부족) 총 RAM 12GB 미만인 저사양 PC
 *                    CPU 추론 · 메모리 부족 시에도 죽지 않게 가장 작은 모델을 쓴다.
 */

export const STRONG_PREFS = ['exaone3.5:7.8b', 'qwen2.5:7b-instruct', 'qwen2.5:7b'];
export const SMALL_PREFS = ['qwen2.5:3b-instruct', 'exaone3.5:2.4b', 'qwen2.5:3b'];
export const TINY_PREFS = ['qwen2.5:1.5b-instruct', 'qwen2.5:1.5b'];

/** GPU 를 실제로 쓸 수 있다고 보는 남은 VRAM(MB). 이보다 적으면 3B 도 CPU 로 스필한다. */
export const GPU_USABLE_FREE_MB = 3500;
/** 이 총 RAM 미만 + GPU 못 씀 → tiny. (16GB PC 는 3B 그대로, 8GB PC 는 1.5B) */
export const LOW_TOTAL_RAM_MB = 12000;
/** 모델을 올리기 위해 남은 RAM 이 이 이상이어야 시작한다(CPU 로 내려갈 때 기준). */
export const RAM_FOR_SMALL_MB = 3000;
export const RAM_FOR_TINY_MB = 1800;

/**
 * @param {{ strong: boolean, gpuOk: boolean, vramFreeMb: number, ramTotalMb: number }} m
 * @returns {{ tier: 'strong'|'small'|'tiny', gpuUsable: boolean }}
 */
export function classifyTier({ strong, gpuOk, vramFreeMb, ramTotalMb }) {
  const gpuUsable = !!gpuOk && (Number(vramFreeMb) || 0) >= GPU_USABLE_FREE_MB;
  if (strong) return { tier: 'strong', gpuUsable };
  const total = Number(ramTotalMb) || 0;
  // 총 RAM 을 모르면(측정 실패) 보수적으로 small 을 유지한다 — 강등은 확실할 때만.
  if (!gpuUsable && total > 0 && total < LOW_TOTAL_RAM_MB) return { tier: 'tiny', gpuUsable };
  return { tier: 'small', gpuUsable };
}

/** 티어에서 모델 이름을 고른다: 이미 깔린 첫 후보, 없으면 대표값(그때만 pull). */
export function pickModel(tier, installed = []) {
  const prefs = tier === 'strong' ? STRONG_PREFS : tier === 'tiny' ? TINY_PREFS : SMALL_PREFS;
  return prefs.find((n) => installed.includes(n)) || prefs[0];
}

/** 시작하려면 남은 RAM 이 얼마 있어야 하는가(MB). CPU 로 내려가는 구간에만 의미가 있다. */
export function requiredRamMb(tier) {
  return tier === 'tiny' ? RAM_FOR_TINY_MB : RAM_FOR_SMALL_MB;
}
