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
  FileX,
  Ban,
  HelpCircle,
  Search,
} from 'lucide-react';

type Status =
  | 'normal'
  | 'retrying'
  | 'final_failed'
  | 'locked'
  | 'no_card'
  | 'no_report'
  | 'no_contract'
  | 'excluded';
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
  no_contract?: number;
  excluded?: number;
}

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  normal: { label: '정상', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  retrying: { label: '재시도 중', color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
  final_failed: { label: '최종 실패', color: 'bg-red-100 text-red-700', icon: XCircle },
  locked: { label: '락 걸림', color: 'bg-orange-100 text-orange-800', icon: Lock },
  no_card: { label: '카드 미등록', color: 'bg-amber-100 text-amber-800', icon: CreditCardIcon },
  no_report: { label: '리포트 미제출', color: 'bg-gray-100 text-gray-700', icon: FileWarning },
  no_contract: { label: '계약 미서명', color: 'bg-yellow-100 text-yellow-800', icon: FileX },
  excluded: { label: '결제 제외', color: 'bg-purple-100 text-purple-700', icon: Ban },
};

const UNKNOWN_STATUS_META = {
  label: '알수없음',
  color: 'bg-gray-100 text-gray-500',
  icon: HelpCircle,
} as const;

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
   * 토스 직접 조회 — 특정 tx 의 toss_order_id 로 토스 API 호출. raw 응답 alert.
   * 토스 status='DONE' 이고 우리 시스템이 success 가 아니면 자동 복구.
   */
  const handleTossVerify = async (txId: string, name: string) => {
    if (!confirm(`${name} 의 결제 tx 를 토스 API 로 직접 조회합니다.\n\n토스 응답이 DONE 이면 자동으로 success 복구 + 락 해제됩니다.`))
      return;
    setActingId(txId);
    try {
      const res = await fetch(`/api/admin/payments/transactions/${txId}/toss-verify`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ ${data.error || '실패'}\n\n${data.detail || ''}`);
        return;
      }
      const lines = [
        `🧾 토스 응답 결과 (orderId: ${data.toss_order_id})`,
        '',
        `• 토스에 존재: ${data.tossFound ? 'YES' : 'NO'}`,
        `• 토스 status: ${data.tossStatus || '-'}`,
        `• 토스 paymentKey: ${data.tossPaymentKey ? data.tossPaymentKey.slice(0, 24) + '...' : '-'}`,
        `• 토스 승인시각: ${data.tossApprovedAt || '-'}`,
        `• 토스 결제금액: ${data.tossTotalAmount ? data.tossTotalAmount.toLocaleString() + '원' : '-'}`,
        '',
        `• 우리 시스템 status: ${data.ourStatus}`,
        `• 우리 시스템 failure_code: ${data.ourFailureCode || '-'}`,
        '',
        `→ ${data.recoveryNote}`,
        data.recovered ? '\n✅ 자동 복구 완료 — 화면 새로고침' : '',
      ];
      alert(lines.filter(Boolean).join('\n'));
      if (data.recovered) await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '조회 실패');
    } finally {
      setActingId(null);
    }
  };

  /**
   * 자동 동기화 실행 — payment_transactions success ↔ monthly_report overdue 미스매치 일괄 복구.
   * 같은 로직이 매시간 cron 으로도 실행됨. 즉시 효과 보려면 이 버튼 사용.
   */
  const [syncing, setSyncing] = useState(false);
  const [forceRecovering, setForceRecovering] = useState(false);

  /**
   * 강제 토스 복구 — desync-recovery 보다 더 공격적.
   * is_final_failure=true 인 좀비 tx 도 토스 재조회해서 DONE 이면 강제 복구.
   * 토스 정산엔 입금예정인데 우리 시스템 최종실패인 케이스 정리용.
   */
  const handleForceRecoverAll = async () => {
    if (
      !confirm(
        '🚨 강제 토스 복구를 실행합니다.\n\n' +
          '✓ 모든 미납 사용자의 모든 failed/pending tx 를 토스에 직접 재조회\n' +
          '✓ 토스가 DONE 인 결제는 모두 success 로 강제 복구 (is_final_failure=true 도 포함)\n' +
          '✓ desync-recovery 보다 공격적 — silent stuck 을 마지막으로 정리\n' +
          '✓ 토스 환불 발생 안 함 (이미 결제된 건만 시스템 동기화)\n\n' +
          '실행할까요?',
      )
    )
      return;
    setForceRecovering(true);
    try {
      const res = await fetch('/api/admin/payments/force-recover-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ 실패: ${data.error || '서버 오류'}`);
        return;
      }
      const recoveredLines = (data.details?.recovered || []).slice(0, 10).map(
        (r: { orderId: string; amount: number; tossPaymentKey: string | null }) =>
          `   ✓ ${r.orderId.slice(0, 32)}... ₩${r.amount.toLocaleString()}`,
      );
      const stillNotDoneCount = data.details?.stillNotDone?.length ?? 0;
      const errCount = data.details?.errors?.length ?? 0;
      alert(
        `✅ 강제 토스 복구 완료\n\n` +
          `[스캔] ${data.scannedTxs}건의 의심 tx 검사\n\n` +
          `[복구] ${data.recovered}건 success 강제 복구 ⭐\n` +
          (recoveredLines.length > 0 ? recoveredLines.join('\n') + '\n\n' : '') +
          `[NOT DONE] ${stillNotDoneCount}건 (토스도 미결제 확인)\n` +
          `[에러] ${errCount}건 (토스 호출/RPC 실패)\n\n` +
          `[락 처리] 영향 ${data.affectedPtUsers}명 / 해제 ${data.locksCleared}명`,
      );
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '강제 복구 실패');
    } finally {
      setForceRecovering(false);
    }
  };
  const handleSyncLocks = async () => {
    if (
      !confirm(
        '🔄 결제 동기화 자동 복구를 실행합니다.\n\n' +
          '✓ payment_transactions 에 success tx 있는데 리포트가 paid 가 아닌 케이스 모두 자동 정정\n' +
          '✓ 영향받은 사용자의 결제 락 자동 해제\n' +
          '✓ 토스 환불 발생 안 함 (이미 결제된 건만 시스템 동기화)\n\n' +
          '실행할까요?',
      )
    )
      return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/payments/sync-locks', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ 실패: ${data.error || '서버 오류'}`);
        return;
      }
      const errorDetail = (data.errors || [])
        .slice(0, 5)
        .map((e: { stage: string; message: string }) => `   - [${e.stage}] ${e.message}`)
        .join('\n');
      alert(
        `✅ 동기화 완료\n\n` +
          `[Pass A] success tx ↔ overdue 미스매치\n` +
          `• 미스매치 검출: ${data.scannedDesyncReports ?? 0}건\n` +
          `• 리포트 paid 정정: ${data.fixedReports?.length ?? 0}건\n\n` +
          `[Pass B] failed tx 토스 재검증\n` +
          `• 의심 tx 스캔: ${data.scannedSuspectFailedTx ?? 0}건\n` +
          `• 토스 DONE 확인 (success 복구): ${data.tossVerifiedDone ?? 0}건  ⭐\n` +
          `• 토스 DONE 아님 (실패 확정): ${data.tossVerifiedNotDone ?? 0}건\n` +
          `• 토스 호출 에러: ${data.tossVerifyErrors ?? 0}건\n\n` +
          `[락 처리]\n` +
          `• 영향 사용자: ${data.affectedPtUsers ?? 0}명\n` +
          `• 락 자동 해제: ${data.locksCleared ?? 0}명\n` +
          `• 락 보존(다른 미납 잔존): ${data.locksStillHeld ?? 0}명\n\n` +
          (data.errors?.length
            ? `[에러 ${data.errors.length}건]\n${errorDetail}`
            : ''),
      );
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '동기화 실패');
    } finally {
      setSyncing(false);
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
          onClick={handleSyncLocks}
          disabled={syncing || loading || forceRecovering}
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-600 text-white font-semibold rounded hover:bg-emerald-700 disabled:opacity-50"
          title="payment_transactions success ↔ report overdue 미스매치 자동 정정 + 락 해제 (매시간 cron 도 같은 로직 실행)"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          🔄 자동 동기화 실행
        </button>
        <button
          type="button"
          onClick={handleForceRecoverAll}
          disabled={syncing || loading || forceRecovering}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white font-semibold rounded hover:bg-red-700 disabled:opacity-50"
          title="좀비 stuck tx 마지막 정리 — is_final_failure 도 토스 직접 재조회 후 DONE 이면 강제 복구. 토스 정산엔 입금예정인데 시스템엔 최종실패인 케이스용."
        >
          {forceRecovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          🚨 강제 토스 복구
        </button>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
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
                const meta = STATUS_META[r.status] ?? UNKNOWN_STATUS_META;
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
                        {/* 토스 직접 조회 — failed/success/pending 모두 가능. 토스가 진실의 원천 */}
                        {r.latest_tx && (
                          <button
                            type="button"
                            onClick={() => handleTossVerify(r.latest_tx!.id, name)}
                            disabled={actingId === r.latest_tx.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                            title="토스 API 직접 조회 — DONE 이면 자동 복구"
                          >
                            {actingId === r.latest_tx.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Search className="w-3 h-3" />
                            )}
                            토스 확인
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
