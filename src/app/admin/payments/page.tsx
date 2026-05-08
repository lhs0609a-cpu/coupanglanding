'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Lock,
  AlertTriangle,
  Loader2,
  PlayCircle,
  FileWarning,
  CreditCardIcon,
  Check,
} from 'lucide-react';

type Status = 'normal' | 'retrying' | 'final_failed' | 'locked' | 'no_card' | 'no_report';
type Filter = 'all' | Status;

interface UserRow {
  pt_user_id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  status: Status;
  payment_overdue_since: string | null;
  payment_lock_level: number;
  computed_lock_level: number;
  admin_override_level: number | null;
  payment_lock_exempt_until: string | null;
  retry_in_progress: boolean;
  card: { id: string; company: string; number: string; failed_count: number } | null;
  this_month_report: {
    id: string;
    year_month: string;
    fee_payment_status: string;
    total_with_vat: number;
    deadline: string | null;
  } | null;
  latest_tx: {
    id: string;
    status: string;
    retry_count: number;
    next_retry_at: string | null;
    is_final_failure: boolean;
    final_failed_at: string | null;
    failure_code: string | null;
    failure_label: string;
    total_amount: number;
    created_at: string;
  } | null;
}

interface Summary {
  total: number;
  normal: number;
  retrying: number;
  final_failed: number;
  locked: number;
  no_card: number;
  no_report: number;
}

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  normal: { label: '정상', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  retrying: { label: '재시도 중', color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
  final_failed: { label: '최종 실패', color: 'bg-red-100 text-red-700', icon: XCircle },
  locked: { label: '락 걸림', color: 'bg-orange-100 text-orange-800', icon: Lock },
  no_card: { label: '카드 미등록', color: 'bg-amber-100 text-amber-800', icon: CreditCardIcon },
  no_report: { label: '리포트 미제출', color: 'bg-gray-100 text-gray-700', icon: FileWarning },
};

const LOCK_LEVEL_LABEL: Record<number, string> = {
  0: '정상',
  1: 'L1 부분차단',
  2: 'L2 전체차단',
  3: 'L3 완전차단',
};

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/payments/overview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRows(data.users || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetryNow = async (txId: string, name: string) => {
    if (!confirm(`${name} 사용자의 결제를 즉시 재시도합니다. 진행할까요?`)) return;
    setActingId(txId);
    try {
      const res = await fetch(`/api/admin/payments/transactions/${txId}/retry-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재시도 실패');
      const r = data.result;
      if (r.succeeded) alert('✅ 결제 성공');
      else if (r.finalFailed) alert(`❌ 최종 실패: ${r.errorMessage || r.errorCode}`);
      else alert(`재시도 실패 (${r.errorMessage || r.errorCode}). 다음 24h 후 자동 재시도됩니다.`);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '재시도 실패');
    } finally {
      setActingId(null);
    }
  };

  /**
   * 수동 paid 처리 — 외부수단(계좌이체) 결제 또는 webhook 누락 사고 복구.
   * 토스 환불 발생 안 함. 미납 리포트 모두 paid 로 강제 마킹 + 락 해제.
   */
  const handleMarkPaid = async (ptUserId: string, name: string) => {
    const reason = prompt(
      `${name} 사용자의 모든 미납 리포트를 "결제 완료" 처리합니다.\n\n` +
        '※ 이 액션은 토스 환불을 발생시키지 않습니다.\n' +
        '※ 사용자가 외부 수단(계좌이체 등)으로 실제 결제했거나 webhook 누락 사고일 때만 사용하세요.\n\n' +
        '처리 사유를 입력하세요 (감사 추적용, 2자 이상):',
    );
    if (!reason || reason.trim().length < 2) return;

    setActingId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payments/${ptUserId}/mark-report-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ 실패: ${data.error || '서버 오류'}`);
        return;
      }
      const lines = (data.markedReports || []).map(
        (r: { yearMonth: string; previousStatus: string; amount: number }) =>
          `✓ ${r.yearMonth} (${r.previousStatus} → paid, ₩${r.amount.toLocaleString()})`,
      );
      alert(
        `✅ 수동 paid 처리 완료\n\n` +
          `${lines.join('\n')}\n\n` +
          `락 해제: ${data.lockCleared ? 'YES' : 'NO (다른 미납·재시도 잔존)'}`,
      );
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setActingId(null);
    }
  };

  /** 강제 결제 — 최종실패 / 진행중 / 대기 상관없이 PT생 단위로 시도 */
  const handleForceCharge = async (ptUserId: string, name: string) => {
    if (!confirm(`${name} 사용자에게 강제로 결제를 시도합니다.\n(최종실패 상태라도 카드 결제 재시도 가능)\n\n진행할까요?`)) return;
    setActingId(ptUserId);
    try {
      const res = await fetch(`/api/admin/payments/${ptUserId}/charge-now`, { method: 'POST' });
      const text = await res.text();
      let data: { error?: string; succeededCount?: number; failedCount?: number; results?: Array<{ yearMonth: string; succeeded: boolean; amount: number; receiptUrl?: string | null; errorMessage?: string; errorCode?: string }> } = {};
      try { data = JSON.parse(text); } catch { /* fallthrough */ }
      if (!res.ok) {
        alert(`❌ HTTP ${res.status}\n${data.error || text.slice(0, 200)}`);
        return;
      }
      const lines = (data.results || []).map((r) =>
        r.succeeded
          ? `✅ ${r.yearMonth}: ₩${r.amount.toLocaleString()} 결제 완료${r.receiptUrl ? ' (영수증 발급)' : ''}`
          : `❌ ${r.yearMonth}: ${r.errorMessage || r.errorCode || '실패'}`
      );
      alert(`${name} 결제 결과:\n\n${lines.join('\n') || '시도 0건'}\n\n성공 ${data.succeededCount ?? 0}건 · 실패 ${data.failedCount ?? 0}건`);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '결제 실패');
    } finally {
      setActingId(null);
    }
  };

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">결제 통합 대시보드</h1>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 요약 카드 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <SummaryCard label="전체" value={summary.total} active={filter === 'all'} onClick={() => setFilter('all')} />
          <SummaryCard label="정상" value={summary.normal} color="text-green-600" active={filter === 'normal'} onClick={() => setFilter('normal')} />
          <SummaryCard label="재시도 중" value={summary.retrying} color="text-blue-600" active={filter === 'retrying'} onClick={() => setFilter('retrying')} />
          <SummaryCard label="최종 실패" value={summary.final_failed} color="text-red-600" active={filter === 'final_failed'} onClick={() => setFilter('final_failed')} />
          <SummaryCard label="락 걸림" value={summary.locked} color="text-orange-600" active={filter === 'locked'} onClick={() => setFilter('locked')} />
          <SummaryCard label="카드 미등록" value={summary.no_card} color="text-amber-600" active={filter === 'no_card'} onClick={() => setFilter('no_card')} />
          <SummaryCard label="리포트 미제출" value={summary.no_report} color="text-gray-600" active={filter === 'no_report'} onClick={() => setFilter('no_report')} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-2 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="font-semibold">해당 상태의 사용자가 없습니다</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">사용자</th>
                <th className="px-4 py-3 text-left">상태</th>
                <th className="px-4 py-3 text-left">이번달 리포트</th>
                <th className="px-4 py-3 text-left">최근 결제 시도</th>
                <th className="px-4 py-3 text-left">재시도</th>
                <th className="px-4 py-3 text-left">락</th>
                <th className="px-4 py-3 text-left">카드</th>
                <th className="px-4 py-3 text-right">조치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((r) => {
                const meta = STATUS_META[r.status];
                const StatusIcon = meta.icon;
                const name = r.full_name || r.email || r.pt_user_id.slice(0, 8);
                const canRetryNow =
                  r.latest_tx &&
                  r.latest_tx.status === 'failed' &&
                  !r.latest_tx.is_final_failure;

                return (
                  <tr key={r.pt_user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.this_month_report ? (
                        <div>
                          <p className="text-gray-900">{r.this_month_report.year_month}</p>
                          <p className="text-xs text-gray-500">
                            {r.this_month_report.total_with_vat.toLocaleString()}원 ·{' '}
                            <span className="font-medium">{r.this_month_report.fee_payment_status}</span>
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.latest_tx ? (
                        <div>
                          <p className="text-gray-900">
                            {r.latest_tx.status === 'success' && '✅ 성공'}
                            {r.latest_tx.status === 'failed' && (r.latest_tx.is_final_failure ? '❌ 최종실패' : '⚠️ 실패')}
                            {r.latest_tx.status === 'pending' && '⏳ 진행중'}
                          </p>
                          {r.latest_tx.failure_code && (
                            <p className="text-xs text-red-600">{r.latest_tx.failure_label}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            {new Date(r.latest_tx.created_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.latest_tx && r.latest_tx.retry_count > 0 ? (
                        <div>
                          <p className="text-blue-700 font-medium">{r.latest_tx.retry_count}/3 회</p>
                          {r.latest_tx.next_retry_at && (
                            <p className="text-xs text-gray-500">
                              다음: {new Date(r.latest_tx.next_retry_at).toLocaleString('ko-KR')}
                            </p>
                          )}
                        </div>
                      ) : r.latest_tx?.next_retry_at ? (
                        <p className="text-xs text-gray-500">
                          예정: {new Date(r.latest_tx.next_retry_at).toLocaleString('ko-KR')}
                        </p>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{LOCK_LEVEL_LABEL[r.payment_lock_level]}</p>
                      {r.computed_lock_level !== r.payment_lock_level && (
                        <p className="text-xs text-orange-600">계산값 {r.computed_lock_level} (cron 미반영)</p>
                      )}
                      {r.admin_override_level !== null && (
                        <p className="text-xs text-purple-600">Override {r.admin_override_level}</p>
                      )}
                      {r.payment_overdue_since && (
                        <p className="text-xs text-gray-500">
                          연체 {new Date(r.payment_overdue_since).toLocaleDateString('ko-KR')}~
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.card ? (
                        <div>
                          <p className="text-gray-900">{r.card.company}</p>
                          <p className="text-xs text-gray-500">{r.card.number}</p>
                          {r.card.failed_count > 0 && (
                            <p className="text-xs text-red-600">실패 {r.card.failed_count}회</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600 text-xs font-medium">미등록</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-col gap-1 items-end">
                        {/* 강제 결제 — 카드 있고 결제 제외 아닐 때 항상 표시 */}
                        {r.card && r.status !== 'no_card' && (
                          <button
                            type="button"
                            onClick={() => handleForceCharge(r.pt_user_id, name)}
                            disabled={actingId === r.pt_user_id}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white rounded disabled:opacity-50 ${
                              r.status === 'final_failed' ? 'bg-red-700 hover:bg-red-800 ring-2 ring-red-300' : 'bg-red-600 hover:bg-red-700'
                            }`}
                            title={r.status === 'final_failed' ? '최종실패 상태에서도 강제 결제 시도' : '즉시 카드 결제'}
                          >
                            {actingId === r.pt_user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                            ⚡ {r.status === 'final_failed' ? '강제 재결제' : '결제'}
                          </button>
                        )}
                        {canRetryNow && r.latest_tx && (
                          <button
                            type="button"
                            onClick={() => handleRetryNow(r.latest_tx!.id, name)}
                            disabled={actingId === r.latest_tx.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            title="기존 tx 기반 재시도 (재시도 가능 코드 한정)"
                          >
                            {actingId === r.latest_tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                            즉시 재시도
                          </button>
                        )}
                        {/* 수동 paid 처리 — 락 또는 미납 리포트 있을 때 표시. 외부 결제·webhook 사고 복구용 */}
                        {(r.status === 'locked' ||
                          (r.this_month_report &&
                            ['awaiting_payment', 'overdue', 'suspended'].includes(
                              r.this_month_report.fee_payment_status,
                            ))) && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(r.pt_user_id, name)}
                            disabled={actingId === r.pt_user_id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                            title="외부 결제 또는 webhook 사고 복구 — 토스 환불 발생 안 함"
                          >
                            {actingId === r.pt_user_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            수동 paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = 'text-gray-900',
  active,
  onClick,
}: {
  label: string;
  value: number;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white border rounded-lg p-3 text-left transition ${
        active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </button>
  );
}
