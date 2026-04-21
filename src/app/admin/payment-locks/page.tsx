'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, ShieldCheck, CalendarPlus, RotateCcw, AlertTriangle, Loader2, Search, UserPlus, CalendarClock, FlaskConical } from 'lucide-react';

interface LockedUser {
  id: string;
  profile_id: string;
  payment_overdue_since: string | null;
  payment_lock_level: number;
  payment_lock_exempt_until: string | null;
  admin_override_level: number | null;
  computed_level: number;
  profile: { full_name: string | null; email: string | null } | null;
}

interface SearchUser {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  payment_lock_level: number;
  payment_overdue_since: string | null;
  payment_lock_exempt_until: string | null;
  first_billing_grace_until: string | null;
  is_test_account: boolean;
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

  // 사전 예외 설정 - 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

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
    body: { action: 'reset' | 'exempt' | 'force_level' | 'clear_override'; exempt_until?: string; force_level?: number },
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

  // 사전 예외 검색
  const doSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/pt-users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok) setSearchResults(data.users || []);
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, [searchQuery]);

  const preExempt = async (u: SearchUser) => {
    const name = u.full_name || u.email || u.id.slice(0, 8);
    const input = prompt(
      `${name} 님에게 결제 락 예외를 미리 적용합니다.\n이 날짜까지는 결제 실패해도 차단되지 않습니다.\n\n종료일(YYYY-MM-DD):`,
      u.payment_lock_exempt_until || '',
    );
    if (!input) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      alert('YYYY-MM-DD 형식으로 입력해주세요');
      return;
    }
    await callAction(u.id, { action: 'exempt', exempt_until: input });
    await doSearch();
  };

  const toggleTestAccount = async (u: SearchUser) => {
    const name = u.full_name || u.email || u.id.slice(0, 8);
    const nextState = !u.is_test_account;
    const confirmMsg = nextState
      ? `${name} 계정을 테스트 계정으로 지정합니다.\n\n• 자동 결제 시도 안 함\n• 모든 결제 락 면제\n• 결제 관련 팝업/배너 안 뜸\n• 모든 기능 정상 동작\n\n진행할까요?`
      : `${name} 계정의 테스트 지정을 해제합니다.\n이후부터 정상 결제 프로세스가 적용됩니다.\n\n진행할까요?`;
    if (!confirm(confirmMsg)) return;
    setActingId(u.id);
    try {
      const res = await fetch(`/api/admin/payment-locks/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_test_account', is_test: nextState }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || '처리 실패');
      }
      await doSearch();
    } catch (err) {
      alert(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setActingId(null);
    }
  };

  const extendGrace = async (u: SearchUser) => {
    const name = u.full_name || u.email || u.id.slice(0, 8);
    const input = prompt(
      `${name} 님의 "첫 결제 유예 종료일" 을 설정합니다.\n이 날짜까지는 자동 결제가 시도되지 않습니다 (청구일 도달해도 skip).\n\n종료일(YYYY-MM-DD):`,
      u.first_billing_grace_until || '',
    );
    if (!input) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      alert('YYYY-MM-DD 형식으로 입력해주세요');
      return;
    }
    setActingId(u.id);
    try {
      const res = await fetch(`/api/admin/payment-locks/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend_grace', grace_until: input }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || '처리 실패');
      }
      await doSearch();
    } catch (err) {
      alert(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setActingId(null);
    }
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

      {/* 사전 예외 / 유예 설정 — 정상 유저도 포함해 검색 */}
      <div className="bg-white border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-gray-900">사전 예외 / 유예 설정 (결제 락 걸리지 않은 PT생 포함)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          특정 PT생에게 미리 <b>예외 종료일</b>을 걸어두면 그 날짜까지는 결제 실패해도 차단되지 않습니다.<br />
          <b>첫 결제 유예</b>는 청구일(매월 5일) 자동결제 시도 자체를 skip — 아직 결제 시점이 안 된 유저에게 사용.
        </p>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="이메일 또는 이름 검색 (2자 이상)"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <button
            onClick={doSearch}
            disabled={searching || searchQuery.trim().length < 2}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {searching ? '검색 중' : '검색'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100">
            {searchResults.map((u) => {
              const name = u.full_name || u.email || u.id.slice(0, 8);
              const isExempt = u.payment_lock_exempt_until && u.payment_lock_exempt_until >= new Date().toISOString().slice(0, 10);
              return (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1">
                      {name}
                      {u.is_test_account && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[9px] font-bold">
                          <FlaskConical className="w-2.5 h-2.5" />
                          TEST
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {u.email} · 락 L{u.payment_lock_level}
                      {isExempt && u.payment_lock_exempt_until && ` · 예외 ${u.payment_lock_exempt_until}까지`}
                      {u.first_billing_grace_until && ` · 유예 ${u.first_billing_grace_until}까지`}
                      {u.is_test_account && ' · 결제 완전 면제'}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleTestAccount(u)}
                      disabled={actingId === u.id}
                      className={`px-2.5 py-1 text-xs font-medium rounded disabled:opacity-50 inline-flex items-center gap-1 ${
                        u.is_test_account
                          ? 'bg-teal-600 text-white hover:bg-teal-700'
                          : 'bg-white border border-teal-600 text-teal-700 hover:bg-teal-50'
                      }`}
                      title={u.is_test_account ? '테스트 지정 해제 (정상 결제 프로세스 적용)' : '테스트 계정 지정 (결제 완전 면제, 모든 기능 정상)'}
                    >
                      <FlaskConical className="w-3 h-3" />
                      {u.is_test_account ? '테스트 해제' : '테스트 계정'}
                    </button>
                    <button
                      onClick={() => preExempt(u)}
                      disabled={actingId === u.id || u.is_test_account}
                      className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                      title="이 날짜까지 결제 락 예외 (미납이어도 차단 안 됨)"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      예외
                    </button>
                    <button
                      onClick={() => extendGrace(u)}
                      disabled={actingId === u.id || u.is_test_account}
                      className="px-2.5 py-1 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-1"
                      title="이 날짜까지 자동 결제 시도 자체를 skip"
                    >
                      <CalendarClock className="w-3 h-3" />
                      유예
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <p className="mt-3 text-xs text-gray-500 text-center">검색 결과 없음</p>
        )}
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
                      <div className="inline-flex gap-1 flex-wrap justify-end">
                        {u.admin_override_level !== null && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium self-center">
                            Override: {u.admin_override_level}
                          </span>
                        )}
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
                        {u.admin_override_level !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm(`${name} 사용자의 override를 해제하고 자동 계산으로 복귀합니다. 진행할까요?`)) return;
                              callAction(u.id, { action: 'clear_override' });
                            }}
                            disabled={actingId === u.id}
                            className="px-2.5 py-1 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                          >
                            Override 해제
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
