'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, PlayCircle } from 'lucide-react';

interface PendingReport {
  id: string;
  pt_user_id: string;
  year_month: string;
  fee_payment_status: string;
  payment_status: string;
  total_with_vat: number | null;
  payment_confirmed_at: string | null;
  fee_paid_at: string | null;
  pt_user: { fullName: string | null; email: string | null } | null;
}

interface RunResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ reportId: string; message: string }>;
}

export default function SettlementRecoveryPage() {
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payments/settlement-recovery?limit=100');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReports(data.reports || []);
      setHasMore(!!data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(reports.map((r) => r.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function runRecovery(opts: { all: boolean }) {
    if (running) return;
    if (!opts.all && selectedIds.size === 0) {
      setError('복구할 리포트를 선택하세요.');
      return;
    }
    setRunning(true);
    setError(null);
    setLastResult(null);
    try {
      const body = opts.all
        ? { limit: 50 }
        : { reportIds: Array.from(selectedIds) };
      const res = await fetch('/api/admin/payments/settlement-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setLastResult(data);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">정산 후처리 복구</h1>
        <p className="text-sm text-gray-600 mt-2">
          <code className="bg-gray-100 px-1 rounded">settlement_completed_at IS NULL</code> 이면서
          수수료가 결제(<code className="bg-gray-100 px-1 rounded">fee_payment_status=&apos;paid&apos;</code>)된 리포트 목록.
          이전 <code className="bg-gray-100 px-1 rounded">completeSettlement</code> 가드 버그로 후처리(revenue / trainer / 세금계산서)가
          누락된 케이스를 재실행합니다. 멱등 처리되어 안전하게 재실행 가능.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded flex gap-2 items-start">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {lastResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-900">복구 결과</span>
          </div>
          <div className="text-sm text-green-800">
            처리 {lastResult.processed}건 — 성공 {lastResult.succeeded} / 실패 {lastResult.failed}
          </div>
          {lastResult.errors.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-red-700">에러 {lastResult.errors.length}건</summary>
              <ul className="mt-1 space-y-1">
                {lastResult.errors.map((e, i) => (
                  <li key={i} className="font-mono">
                    {e.reportId}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center mb-4">
        <button
          onClick={load}
          disabled={loading || running}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </button>
        <button
          onClick={selectAll}
          disabled={loading || running || reports.length === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          전체 선택
        </button>
        <button
          onClick={clearAll}
          disabled={loading || running || selectedIds.size === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          선택 해제
        </button>
        <div className="flex-1" />
        <button
          onClick={() => runRecovery({ all: false })}
          disabled={loading || running || selectedIds.size === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#E31837] text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          선택한 {selectedIds.size}건 복구
        </button>
        <button
          onClick={() => runRecovery({ all: true })}
          disabled={loading || running || reports.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#E31837] text-[#E31837] rounded hover:bg-red-50 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          전체 일괄 복구 (최대 50건)
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-2">
        총 {reports.length}건 (선택 {selectedIds.size}){hasMore && ' · 더 있음 (limit 100)'}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : reports.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-gray-50 border border-gray-200 rounded">
          누락된 리포트가 없습니다.
        </div>
      ) : (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === reports.length && reports.length > 0}
                    onChange={(e) => (e.target.checked ? selectAll() : clearAll())}
                  />
                </th>
                <th className="px-3 py-2 text-left">사용자</th>
                <th className="px-3 py-2 text-left">월</th>
                <th className="px-3 py-2 text-right">수수료</th>
                <th className="px-3 py-2 text-left">결제 확정</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">report.id</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.pt_user?.fullName || '이름없음'}</div>
                    <div className="text-xs text-gray-500">{r.pt_user?.email || '-'}</div>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.year_month}</td>
                  <td className="px-3 py-2 text-right">
                    {r.total_with_vat ? r.total_with_vat.toLocaleString() : '-'}원
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.fee_paid_at ? new Date(r.fee_paid_at).toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-400">
                    {r.id.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
