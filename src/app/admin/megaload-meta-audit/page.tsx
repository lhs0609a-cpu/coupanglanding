'use client';

import { useState } from 'react';
import { Activity, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import Card from '@/components/ui/Card';

interface Drift {
  category_code: string;
  path: string;
  status: 'match' | 'drift' | 'missing_cache_b' | 'missing_cache_s' | 'live_fail';
  errors: string[];
  cached_buy_count?: number;
  live_exposed_count?: number;
  cached_search_count?: number;
  live_none_count?: number;
}

interface Summary {
  sampled: number;
  matched: number;
  drifted: number;
  live_failed: number;
  total_error_count: number;
  drift_rate: string;
  domain_count: number;
}

interface Result {
  ok: boolean;
  summary: Summary;
  by_domain: Record<string, { sampled: number; drifted: number }>;
  drifts: Drift[];
  matches_sample: Drift[];
}

export default function MegaloadMetaAuditPage() {
  const [sampleSize, setSampleSize] = useState(50);
  const [throttleMs, setThrottleMs] = useState(250);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string>('');

  const runAudit = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/admin/cat-meta-freshness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample: sampleSize, throttleMs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '실행 실패');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">카테고리 메타 신선도 감사</h1>
      </div>

      <Card>
        <p className="text-sm text-gray-600">
          <strong>coupang-cat-details.json</strong> 캐시가 쿠팡 라이브 API와 일치하는지 stratified sampling으로 검증합니다.
          쿠팡이 카테고리 attribute를 추가/변경했을 때 우리가 미동기화 상태인지 감지합니다.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          ※ 본인의 쿠팡 API 키로 라이브 호출합니다. throttle 시간이 짧으면 rate limit 위험.
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-gray-700 mb-3">실행 옵션</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">샘플 크기</label>
            <input
              type="number"
              min={5}
              max={300}
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded px-2 py-2 text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">5~300 (도메인 균등)</p>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">호출 간격 (ms)</label>
            <input
              type="number"
              min={100}
              max={5000}
              value={throttleMs}
              onChange={(e) => setThrottleMs(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded px-2 py-2 text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">rate limit 방지</p>
          </div>
          <button
            onClick={runAudit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c41530] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {loading ? '검증 중...' : '신선도 검증 시작'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          예상 소요시간: 약 {Math.ceil((sampleSize * throttleMs) / 1000)}초
        </p>
      </Card>

      {error && (
        <Card>
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
          </div>
        </Card>
      )}

      {result && (
        <>
          <Card>
            <h2 className="text-sm font-bold text-gray-700 mb-3">결과 요약</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-xs text-gray-500">샘플 수</div>
                <div className="text-xl font-bold">{result.summary.sampled}</div>
              </div>
              <div className="bg-green-50 rounded p-3">
                <div className="text-xs text-gray-500">일치</div>
                <div className="text-xl font-bold text-green-700">{result.summary.matched}</div>
              </div>
              <div className="bg-yellow-50 rounded p-3">
                <div className="text-xs text-gray-500">드리프트</div>
                <div className="text-xl font-bold text-yellow-700">{result.summary.drifted}</div>
              </div>
              <div className="bg-red-50 rounded p-3">
                <div className="text-xs text-gray-500">live 실패</div>
                <div className="text-xl font-bold text-red-700">{result.summary.live_failed}</div>
              </div>
              <div className="bg-blue-50 rounded p-3">
                <div className="text-xs text-gray-500">드리프트율</div>
                <div className="text-xl font-bold text-blue-700">{result.summary.drift_rate}</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              도메인 {result.summary.domain_count}개 × 누적 변경 항목 {result.summary.total_error_count}건
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-gray-700 mb-3">도메인별 드리프트</h2>
            <div className="space-y-1">
              {Object.entries(result.by_domain)
                .sort((a, b) => b[1].drifted - a[1].drifted)
                .map(([domain, stats]) => {
                  const rate = stats.sampled > 0 ? (stats.drifted / stats.sampled) * 100 : 0;
                  return (
                    <div key={domain} className="flex items-center gap-3 text-sm">
                      <span className="w-32 truncate">{domain}</span>
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div
                          className={`h-full ${rate > 30 ? 'bg-red-500' : rate > 10 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-20 text-right">
                        {stats.drifted}/{stats.sampled} ({rate.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-gray-700 mb-3">
              드리프트 상세 ({result.drifts.length}건)
            </h2>
            {result.drifts.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span>전체 샘플 모두 캐시와 라이브 API 일치</span>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {result.drifts.map((d) => (
                  <div key={d.category_code} className="border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium">
                        <span className="text-gray-400">[{d.category_code}]</span> {d.path}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          d.status === 'drift'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    {(d.cached_buy_count !== undefined || d.live_exposed_count !== undefined) && (
                      <div className="text-[11px] text-gray-500 mb-1">
                        구매옵션: 캐시 {d.cached_buy_count ?? '?'} ↔ live {d.live_exposed_count ?? '?'} ·
                        검색속성: 캐시 {d.cached_search_count ?? '?'} ↔ live {d.live_none_count ?? '?'}
                      </div>
                    )}
                    <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
                      {d.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
