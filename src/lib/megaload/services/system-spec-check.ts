// ============================================================
// 시스템 사양 체크 — 상품 대량등록(특히 이미지 다양성 분석) 적합도 진단
//
// 이미지 다양성 분석이 "시작조차 안 되거나" 느린 사용자가 직접 눌러
// 원인이 내 PC 사양/환경인지 바로 확인할 수 있게 한다.
//
// 핵심: 워커 스폰 실측(probeWorkerSupport) — 다양성 분석이 멈추는
//       "worker pool 미사용"의 진짜 원인을 사용자 화면에서 그대로 검증.
// ============================================================

import { probeWorkerSupport } from './image-analysis-pool';

export type SpecVerdict = 'good' | 'warning' | 'insufficient';

export interface SpecCheckResult {
  /** 종합 판정 */
  verdict: SpecVerdict;
  /** CPU 논리 코어 수 (0 = 알 수 없음) */
  cores: number;
  /** 디바이스 메모리 GB (Chromium 계열만 제공, null = 알 수 없음) */
  memoryGB: number | null;
  /** OffscreenCanvas 지원 (워커 내 이미지 분석 필수) */
  offscreenCanvas: boolean;
  /** createImageBitmap 지원 (스케일드 디코드) */
  createImageBitmapOk: boolean;
  /** 워커 스폰 실측 결과 */
  worker: { ok: boolean; latencyMs: number; error?: string };
  /** 디코드 처리량 벤치마크 (장/초), null = 측정 불가 */
  benchmark: { imagesPerSec: number } | null;
  /** 판정 근거(사용자 표시용) */
  reasons: string[];
  /** 권장 조치 */
  recommendations: string[];
}

/**
 * 합성 이미지를 만들어 createImageBitmap(스케일드 디코드) 처리량을 실측.
 * 디스크 I/O 는 제외한 CPU/디코드 능력 근사치 (환경 비교용).
 */
async function benchmarkDecode(): Promise<{ imagesPerSec: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return null;
    const oc = new OffscreenCanvas(800, 800);
    const ctx = oc.getContext('2d');
    if (!ctx) return null;
    // 그라디언트 + 블록 노이즈로 실제 JPEG 디코드 비용에 근접
    const g = ctx.createLinearGradient(0, 0, 800, 800);
    g.addColorStop(0, '#e31837');
    g.addColorStop(1, '#1030a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 800);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${(i * 7) % 255},${(i * 13) % 255},${(i * 29) % 255},0.5)`;
      ctx.fillRect((i * 37) % 780, (i * 53) % 780, 20, 20);
    }
    const blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const N = 20;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const bmp = await createImageBitmap(blob, { resizeWidth: 36, resizeHeight: 36, resizeQuality: 'low' });
      bmp.close();
    }
    const dt = performance.now() - t0;
    if (dt <= 0) return null;
    return { imagesPerSec: Math.round((N / dt) * 1000) };
  } catch {
    return null;
  }
}

/**
 * 사양 체크 실행 — 워커 스폰 실측 + 디코드 벤치마크 + 하드웨어 감지를 종합해
 * 상품 등록 적합도를 판정한다.
 */
export async function runSystemSpecCheck(): Promise<SpecCheckResult> {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0;
  const memoryGB =
    typeof navigator !== 'undefined' && 'deviceMemory' in navigator
      ? ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null)
      : null;
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const createImageBitmapOk = typeof createImageBitmap === 'function';

  const [worker, benchmark] = await Promise.all([probeWorkerSupport(), benchmarkDecode()]);

  const reasons: string[] = [];
  const recommendations: string[] = [];
  let verdict: SpecVerdict = 'good';
  const downgrade = (to: SpecVerdict) => {
    if (to === 'insufficient') verdict = 'insufficient';
    else if (to === 'warning' && verdict === 'good') verdict = 'warning';
  };

  // ① 워커 스폰 — 다양성 분석이 멈추는 진짜 원인
  if (!worker.ok) {
    downgrade('insufficient');
    reasons.push(`이미지 분석 워커 실행 실패 (${worker.error ?? '원인 미상'}) — 다양성 분석이 화면 스레드에서 돌아 멈춘 것처럼 보입니다`);
    recommendations.push('브라우저를 완전히 종료 후 재시작', '최신 Chrome/Edge 로 시도', '브라우저 하드웨어 가속(설정) 켜기');
  }

  // ② CPU
  if (cores > 0 && cores < 4) {
    downgrade('warning');
    reasons.push(`CPU ${cores}코어 (권장 8코어 이상) — 분석이 느릴 수 있습니다`);
    recommendations.push('상품을 30~50개씩 나눠 등록');
  }

  // ③ 메모리
  if (memoryGB != null && memoryGB < 4) {
    downgrade('warning');
    reasons.push(`메모리 ${memoryGB}GB (권장 8GB 이상)`);
    recommendations.push('다른 무거운 프로그램/탭 닫기');
  }

  // ④ 브라우저 기능
  if (!offscreenCanvas || !createImageBitmapOk) {
    downgrade('warning');
    reasons.push('OffscreenCanvas/createImageBitmap 미지원 — 느린 폴백 경로로 동작');
    recommendations.push('브라우저를 최신 버전으로 업데이트');
  }

  // ⑤ 디코드 속도
  if (benchmark && benchmark.imagesPerSec < 30) {
    downgrade('warning');
    reasons.push(`이미지 디코드 속도 느림 (${benchmark.imagesPerSec}장/초, 권장 60+)`);
  }

  if (verdict === 'good') {
    reasons.push('상품 등록 및 이미지 다양성 분석에 적합한 사양입니다');
  }

  return {
    verdict,
    cores,
    memoryGB,
    offscreenCanvas,
    createImageBitmapOk,
    worker,
    benchmark,
    reasons,
    // 중복 제거
    recommendations: Array.from(new Set(recommendations)),
  };
}
