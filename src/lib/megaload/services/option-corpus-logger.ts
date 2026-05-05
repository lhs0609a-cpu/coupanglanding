// ============================================================
// 옵션 추출 corpus 자동 로거
//
// 목적: 사용자가 실제 쿠팡에 등록한 상품의 (원본명, 카테고리, 추출옵션, 최종옵션)을
//       JSONL 파일에 누적 → 회귀 검증의 ground truth로 사용.
//
// self-graded 한계 해결: 합성 패턴 GT 대신 실 사용자 등록 데이터로 검증.
//
// 서버 영향: 등록 1건당 한 줄 append (microsecond). DB INSERT 아님 — 로컬 파일.
//          파일 사이즈 통제: 일자별 회전 (LOG_PATH 패턴).
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = 'scripts/verification-reports/corpus';

interface CorpusEntry {
  ts: string;
  productName: string;
  categoryCode: string;
  categoryPath?: string;
  extracted: { name: string; value: string; unit?: string }[];
  /** 사용자가 검수 화면에서 수정한 최종 옵션값 — null이면 추출값 그대로 등록 */
  userEdited?: { name: string; value: string; unit?: string }[];
  /** 등록 성공한 쿠팡 상품 ID (선택) */
  channelProductId?: string;
  /** 디스플레이 상품명 (있으면) */
  displayName?: string;
}

let warned = false;

// Vercel 프로덕션은 파일시스템 읽기전용이라 모든 write 가 실패. 매 상품마다 fs 시도 → catch 의
// 비용을 회피하기 위해 모듈 로드 시 한 번만 판정 후 no-op 화.
const FS_WRITABLE = (() => {
  if (typeof window !== 'undefined') return false;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return false;
  return true;
})();

export function logExtractionCorpus(entry: Omit<CorpusEntry, 'ts'>): void {
  if (!FS_WRITABLE) return;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const file = path.join(LOG_DIR, `extractions-${date}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(file, line, { encoding: 'utf8' });
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn('[corpus-logger] 로그 기록 실패 (1회만 경고):', err instanceof Error ? err.message : err);
    }
    // 로깅 실패는 등록을 막지 않음 — 무시
  }
}

/**
 * 사용자 수정 비교: 추출 == 최종 인지 확인
 * - true: 시스템 추출이 정확했음 (수정 없음)
 * - false: 시스템 추출이 사용자 의도와 달랐음 (회귀 후보)
 */
export function isExtractionAccurate(
  extracted: { name: string; value: string }[],
  finalEdited: { name: string; value: string }[],
): boolean {
  if (extracted.length !== finalEdited.length) return false;
  const extMap = new Map(extracted.map(o => [o.name, o.value]));
  for (const f of finalEdited) {
    if (extMap.get(f.name) !== f.value) return false;
  }
  return true;
}
