'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  Receipt,
  Lock,
  Copy,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';

type Filter = 'all' | 'duplicate' | 'paid_locked';

interface Tx {
  id: string;
  ptUserId: string;
  monthlyReportId: string;
  name: string;
  email: string | null;
  yearMonth: string;
  reportStatus: string;
  status: string;
  amount: number;
  baseAmount: number;
  penaltyAmount: number;
  receiptUrl: string | null;
  paymentKey: string | null;
  orderId: string;
  failureCode: string | null;
  failureMessage: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  failedAt: string | null;
  isAutoPayment: boolean;
  siblingSuccessCount: number;
  isDuplicateSuccess: boolean;
}

const FILTER_LABEL: Record<Filter, string> = {
  all: '전체',
  duplicate: '중복 결제',
  paid_locked: '결제됐는데 락 잔존',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  success: { label: '결제 완료', color: 'bg-green-100 text-green-700' },
  failed: { label: '결제 실패', color: 'bg-red-100 text-red-700' },
  pending: { label: '진행중', color: 'bg-blue-100 text-blue-700' },
  cancelled: { label: '취소됨', color: 'bg-gray-100 text-gray-600' },
};

export default function AdminPaymentTransactionsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 취소 모달 상태
  const [cancelTarget, setCancelTarget] = useState<Tx | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelForce, setCancelForce] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ filter, limit: '200' });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/payments/transactions/list?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setTxs(data.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
      setTxs([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCancel = (tx: Tx) => {
    setCancelTarget(tx);
    setCancelReason('');
    setCancelForce(false);
    setCancelError('');
  };

  const closeCancel = () => {
    if (cancelling) return;
    setCancelTarget(null);
    setCancelReason('');
    setCancelForce(false);
    setCancelError('');
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 2) {
      setCancelError('취소 사유를 2자 이상 입력해주세요.');
      return;
    }
    const isDup = cancelTarget.siblingSuccessCount >= 1;
    const needForce = !isDup;

    if (needForce && !cancelForce) {
      setCancelError('단일 결제 취소는 "강제 취소" 옵션을 체크해야 합니다.');
      return;
    }

    setCancelling(true);
    setCancelError('');

    try {
      const res = await fetch(
        `/api/admin/payments/transactions/${cancelTarget.id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: cancelReason.trim(), force: cancelForce }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error || '취소 실패');
        return;
      }
      alert(
        `✅ 토스 취소 완료\n` +
          `- 중복 결제: ${data.isDuplicate ? 'YES' : 'NO'}\n` +
          `- 리포트 미납 되돌림: ${data.reportReverted ? 'YES' : 'NO'}\n` +
          `- 토스 상태: ${data.tossCancel?.status || '-'}`,
      );
      setCancelTarget(null);
      await fetchData();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : '취소 실패');
    } finally {
      setCancelling(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const fmtKRW = (n: number) => `${n.toLocaleString()}원`;
  const fmtDt = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleString('ko-KR', { hour12: false }) : '-';

  const dupCount = txs.filter(t => t.isDuplicateSuccess).length;
  const succCount = txs.filter(t => t.status === 'success').length;
  const cancelCount = txs.filter(t => t.status === 'cancelled').length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-7 h-7 text-blue-600" />
            결제 내역 / 중복 취소
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            결제 거래 조회 + 중복 결제 / 결제 후 락 잔존 사용자 진단 + 토스 결제 취소
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="이름 또는 이메일 검색"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800"
          >
            검색
          </button>
        </form>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="조회 결과" value={txs.length} color="text-gray-700" />
        <SummaryCard label="성공" value={succCount} color="text-green-700" />
        <SummaryCard label="중복 결제" value={dupCount} color="text-red-700" highlight={dupCount > 0} />
        <SummaryCard label="취소" value={cancelCount} color="text-gray-500" />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs text-gray-600 uppercase">
                <th className="px-3 py-2.5">사용자</th>
                <th className="px-3 py-2.5">월</th>
                <th className="px-3 py-2.5">상태</th>
                <th className="px-3 py-2.5 text-right">금액</th>
                <th className="px-3 py-2.5">자동/수동</th>
                <th className="px-3 py-2.5">생성</th>
                <th className="px-3 py-2.5">승인</th>
                <th className="px-3 py-2.5">토스</th>
                <th className="px-3 py-2.5">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </td>
                </tr>
              ) : txs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                    {filter === 'duplicate'
                      ? '중복 결제 없음 ✓'
                      : filter === 'paid_locked'
                        ? '결제 후 락 잔존 케이스 없음 ✓'
                        : '거래 없음'}
                  </td>
                </tr>
              ) : (
                txs.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-gray-50 ${tx.isDuplicateSuccess ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900">{tx.name}</div>
                      {tx.email && <div className="text-xs text-gray-500">{tx.email}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{tx.yearMonth}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_META[tx.status]?.color || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {tx.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                        {tx.status === 'failed' && <XCircle className="w-3 h-3" />}
                        {tx.status === 'cancelled' && <Lock className="w-3 h-3" />}
                        {STATUS_META[tx.status]?.label || tx.status}
                      </span>
                      {tx.isDuplicateSuccess && (
                        <div className="mt-1 inline-block px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">
                          중복 +{tx.siblingSuccessCount}
                        </div>
                      )}
                      {tx.failureCode && (
                        <div className="text-[11px] text-red-600 mt-0.5">
                          {tx.failureCode}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {fmtKRW(tx.amount)}
                      {tx.penaltyAmount > 0 && (
                        <div className="text-[11px] text-orange-600">
                          (연체 +{fmtKRW(tx.penaltyAmount)})
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {tx.isAutoPayment ? '자동' : '수동'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {fmtDt(tx.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {fmtDt(tx.approvedAt || tx.failedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      {tx.receiptUrl ? (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          영수증
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                      {tx.paymentKey && (
                        <button
                          type="button"
                          onClick={() => copyText(tx.paymentKey!)}
                          title="paymentKey 복사"
                          className="ml-2 text-gray-400 hover:text-gray-700"
                        >
                          <Copy className="w-3 h-3 inline" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {tx.status === 'success' ? (
                        <button
                          type="button"
                          onClick={() => openCancel(tx)}
                          className="px-2.5 py-1 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700"
                        >
                          취소
                        </button>
                      ) : tx.status === 'cancelled' ? (
                        <span className="text-xs text-gray-400">취소됨</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 취소 확인 모달 */}
      <Modal
        isOpen={!!cancelTarget}
        onClose={closeCancel}
        title="결제 취소 (토스 환불)"
      >
        {cancelTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">사용자</span>
                <span className="font-medium">{cancelTarget.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">월</span>
                <span>{cancelTarget.yearMonth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">금액</span>
                <span className="font-bold">{fmtKRW(cancelTarget.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">paymentKey</span>
                <span className="text-xs font-mono">
                  {cancelTarget.paymentKey?.slice(0, 16)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">중복 결제 여부</span>
                <span
                  className={
                    cancelTarget.siblingSuccessCount >= 1
                      ? 'text-red-700 font-semibold'
                      : 'text-gray-700'
                  }
                >
                  {cancelTarget.siblingSuccessCount >= 1
                    ? `중복 (다른 success ${cancelTarget.siblingSuccessCount}건 있음)`
                    : '단일 결제 (이거 취소하면 미납됨)'}
                </span>
              </div>
            </div>

            {cancelTarget.siblingSuccessCount === 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>주의:</strong> 이건 해당 월의 유일한 결제입니다. 취소하면
                  monthly_report 가 미납으로 되돌아가고 사용자에게 결제 락이 걸릴 수
                  있습니다. 정말 취소하려면 아래 "강제 취소" 를 체크하세요.
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                취소 사유 *
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="예: 중복 결제 환불"
                disabled={cancelling}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50"
              />
            </div>

            {cancelTarget.siblingSuccessCount === 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cancelForce}
                  onChange={(e) => setCancelForce(e.target.checked)}
                  disabled={cancelling}
                />
                <span className="text-amber-900">
                  강제 취소 — 단일 결제임을 인지하고 진행
                </span>
              </label>
            )}

            {cancelError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {cancelError}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={closeCancel}
                disabled={cancelling}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                토스로 취소 실행
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-3 ${
        highlight ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
