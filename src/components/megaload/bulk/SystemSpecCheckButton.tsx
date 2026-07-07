'use client';

import { useState } from 'react';
import { Gauge, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { runSystemSpecCheck, type SpecCheckResult } from '@/lib/megaload/services/system-spec-check';

// verdict 별 전체 클래스 문자열 (Tailwind JIT 가 인식하도록 리터럴로 고정 — 템플릿 보간 금지)
const VERDICT_STYLE = {
  good: { box: 'bg-green-50 border-green-200', head: 'text-green-700', Icon: CheckCircle2, label: '적합', desc: '상품 등록에 적합' },
  warning: { box: 'bg-amber-50 border-amber-200', head: 'text-amber-700', Icon: AlertTriangle, label: '주의', desc: '느릴 수 있음' },
  insufficient: { box: 'bg-red-50 border-red-200', head: 'text-red-700', Icon: XCircle, label: '부족', desc: '이미지 다양성 분석이 멈추는 원인' },
} as const;

/**
 * "사양 체크" 버튼 — 이미지 다양성 분석이 멈추거나 느린 사용자가 눌러
 * 내 PC/브라우저가 상품 등록에 적합한지 즉석에서 진단한다.
 * 자체 상태만 쓰는 독립 컴포넌트 (props 없음).
 */
export default function SystemSpecCheckButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SpecCheckResult | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await runSystemSpecCheck());
    } catch {
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const style = result ? VERDICT_STYLE[result.verdict] : null;

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        disabled={running}
        title="내 PC가 상품 등록/이미지 분석에 적합한지 진단"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition disabled:opacity-50"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gauge className="w-3.5 h-3.5" />}
        {running ? '검사 중…' : '사양 체크'}
      </button>

      {result && style && (
        <div className={`mt-2 w-full p-2.5 rounded-lg border text-[11px] ${style.box}`}>
          <div className={`flex items-center gap-1.5 font-semibold mb-1 ${style.head}`}>
            <style.Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{style.label} — {style.desc}</span>
          </div>

          <div className="text-gray-600 space-y-0.5">
            <div>
              분석 워커:{' '}
              {result.worker.ok
                ? <span className="text-green-600 font-medium">정상 ({Math.round(result.worker.latencyMs)}ms)</span>
                : <span className="text-red-600 font-medium">실패 — {result.worker.error}</span>}
            </div>
            <div>
              CPU {result.cores || '?'}코어
              {result.memoryGB != null ? ` · 메모리 ${result.memoryGB}GB` : ''}
              {result.benchmark ? ` · 디코드 ${result.benchmark.imagesPerSec}장/초` : ''}
            </div>
          </div>

          {result.reasons.length > 0 && (
            <ul className="mt-1.5 list-disc list-inside text-gray-600 space-y-0.5">
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}

          {result.recommendations.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-200/70 text-gray-500">
              <span className="font-medium text-gray-600">권장</span> · {result.recommendations.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
