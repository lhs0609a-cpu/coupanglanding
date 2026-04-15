'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, ShieldCheck, CalendarPlus, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';

interface LockedUser {
  id: string;
  profile_id: string;
  payment_overdue_since: string | null;
  payment_lock_level: number;
  payment_lock_exempt_until: string | null;
  computed_level: number;
  profile: { full_name: string | null; email: string | null } | null;
}

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: '정상', color: 'bg-green-100 text-green-700' },
  1: { label: '1단계 (부분 쓰기 차단)', color: 'bg-amber-100 text-amber-800' },
  2: { label: '2단계 (전체 쓰기 차단)', color: 'bg-orange-100 text-orange-800' },
  3: { label: '3단계 (완전 차단)', color: 'bg-red-100 text-red-800' },
};

export default function AdminPaymentLocksPage() {
  const [users, setUsers] = useState<LockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/payment-locks');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const callAction = async (
    id: string,
    body: { action: 'reset' | 'exempt' | 'force_level'; exempt_until?: string; force_level?: number },
  ) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/payment-locks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setActingId(null);
    }
  };

  const handleReset = (id: string, name: string) => {
    if (!confirm(`${name} 사용자의 결제 락을 완전히 해제합니다. 진행할까요?`)) return;
    callAction(id, { action: 'reset' });
  };

  const handleExempt = (id: string, name: string) => {
    const input = prompt(`${name} 사용자에게 결제 락 예외를 적용할 종료일을 입력하세요 (YYYY-MM-DD):`);
    if (!input) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      alert('YYYY-MM-DD 형식으로 입력해주세요');
      return;
    }
    callAction(id, { action: 'exempt', exempt_until: input });
  };

  const handleForceLevel = (id: string, name: string, current: number) => {
    const input = prompt(`${name} 사용자의 결제 락 단계를 강제로 설정합니다 (0~3, 현재=${current}):`);
    if (input === null) return;
    const level = Number(input);
    if (!Number.isInteger(level) || level < 0 || level > 3) {
      alert('0~3 사이 정수여야 합니다');
      return;
    }
    callAction(id, { action: 'force_level', force_level: level });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Lock className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-900">결제 락 관리</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-sm">
        <p className="font-semibold mb-1">단계 정의</p>
        <ul className="space-y-0.5 text-xs">
          <li>• <b>1단계 (D+1)</b>: 신규 상품 등록·일괄 처리만 차단</li>
          <li>• <b>2단계 (D+3)</b>: 모든 쓰기 작업 차단, 조회만 허용</li>
          <li>• <b>3단계 (D+7)</b>: 메가로드 진입 자체 불가, /my/settings으로 강제 이동</li>
        </ul>
      </div>

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
      ) : users.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="font-semibold">현재 결제 락이 걸린 사용자가 없습니다</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">사용자</th>
                <th className="px-4 py-3 text-left">연체 시작일</th>
                <th className="px-4 py-3 text-left">현재 단계</th>
                <th className="px-4 py-3 text-left">계산된 단계</th>
                <th className="px-4 py-3 text-left">예외 종료일</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const name = u.profile?.full_name || u.profile?.email || u.id.slice(0, 8);
                const cur = LEVEL_LABELS[u.payment_lock_level] || LEVEL_LABELS[0];
                const computed = LEVEL_LABELS[u.computed_level] || LEVEL_LABELS[0];
                const isMismatch = u.payment_lock_level !== u.computed_level;
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">{u.profile?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {u.payment_overdue_since
                        ? new Date(u.payment_overdue_since).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cur.color}`}>
                        {cur.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${computed.color}`}>
                        {computed.label}
                      </span>
                      {isMismatch && (
                        <p className="text-xs text-orange-600 mt-1">cron 미반영</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {u.payment_lock_exempt_until
                        ? new Date(u.payment_lock_exempt_until).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleReset(u.id, name)}
                          disabled={actingId === u.id}
                          className="px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          해제
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExempt(u.id, name)}
                          disabled={actingId === u.id}
                          className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <CalendarPlus className="w-3 h-3" />
                          예외
                        </button>
                        <button
                          type="button"
                          onClick={() => handleForceLevel(u.id, name, u.payment_lock_level)}
                          disabled={actingId === u.id}
                          className="px-2.5 py-1 text-xs font-medium bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                        >
                          단계 강제
                        </button>
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
