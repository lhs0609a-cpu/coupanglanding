'use client';

import { useState, useCallback } from 'react';
import {
  Plug, Play, RefreshCw, Loader2, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';

interface TestResult {
  id: string;
  label: string;
  success: boolean;
  message: string;
  detail?: unknown;
  durationMs: number;
}

interface IntegrationTestCardProps {
  disabled?: boolean;
}

export default function IntegrationTestCard({ disabled }: IntegrationTestCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const runTest = useCallback(async () => {
    setTesting(true);
    setError('');
    setTestResults(null);
    setExpandedIds(new Set());

    try {
      const res = await fetch('/api/megaload/products/bulk-register/integration-test', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTestResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '연동 테스트 실패');
    } finally {
      setTesting(false);
    }
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const failCount = testResults?.filter((r) => !r.success).length ?? 0;
  const allPassed = testResults !== null && failCount === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Plug className="w-5 h-5 text-gray-500" /> 쿠팡 API 연동 테스트
        </h2>
        <button
          onClick={runTest}
          disabled={disabled || testing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : testResults ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {testing ? '테스트 중...' : testResults ? '다시 테스트' : '연동 테스트 실행'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {testing && !testResults && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> 쿠팡 API 연동 상태를 확인하고 있습니다...
        </div>
      )}

      {testResults && (
        <div className="space-y-1">
          {testResults.map((r) => (
            <div key={r.id}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition ${
                  !r.success ? 'bg-red-50/50' : ''
                }`}
                onClick={() => !r.success && toggleExpand(r.id)}
              >
                {r.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span className={`font-medium w-28 shrink-0 ${r.success ? 'text-gray-700' : 'text-red-700'}`}>
                  {r.label}
                </span>
                <span className={`flex-1 ${r.success ? 'text-gray-500' : 'text-red-600'}`}>
                  {r.message}
                </span>
                <span className="text-xs text-gray-400 w-12 text-right shrink-0">
                  {r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                </span>
                {!r.success && (
                  expandedIds.has(r.id) ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )
                )}
              </div>
              {!r.success && expandedIds.has(r.id) && (
                <div className="ml-10 mr-3 mb-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 space-y-1">
                  <div>{r.message}</div>
                  {r.detail != null && (
                    <pre className="mt-1 p-2 bg-white rounded text-xs text-gray-600 overflow-x-auto">
                      {JSON.stringify(r.detail, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}

          {allPassed && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> 모든 연동 테스트를 통과했습니다. 상품 등록을 진행할 수 있습니다.
            </div>
          )}

          {failCount > 0 && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> 실패 항목 {failCount}개 — 등록 전에 해결해주세요.
            </div>
          )}
        </div>
      )}

      {!testing && !testResults && !error && (
        <p className="text-xs text-gray-400">상품 등록 전에 쿠팡 API 연동 상태를 점검합니다. (인증, 출고지, 반품지, 카테고리, 고시정보, 속성)</p>
      )}
    </div>
  );
}
