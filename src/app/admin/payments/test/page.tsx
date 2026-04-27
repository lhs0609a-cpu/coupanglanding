'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Receipt,
} from 'lucide-react';

interface PtUser {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  is_test_account?: boolean;
}

interface Card {
  id: string;
  card_company: string;
  card_number: string;
  card_type: string;
  is_primary: boolean;
  is_active: boolean;
  failed_count: number;
  registered_at: string;
  last_used_at: string | null;
}

interface TestTx {
  id: string;
  pt_user_id: string;
  toss_order_id: string;
  toss_payment_key: string | null;
  amount: number;
  total_amount: number;
  status: 'pending' | 'success' | 'failed';
  failure_code: string | null;
  failure_message: string | null;
  receipt_url: string | null;
  approved_at: string | null;
  failed_at: string | null;
  test_note: string | null;
  test_initiated_by: string | null;
  created_at: string;
  pt_user: { fullName: string | null; email: string | null } | null;
}

export default function AdminTestPaymentPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PtUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PtUser | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);

  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState('');
  const [executing, setExecuting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string; receiptUrl?: string } | null>(null);

  const [history, setHistory] = useState<TestTx[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 검색 디바운스
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/pt-users/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 사용자 선택 시 카드 로드
  useEffect(() => {
    if (!selectedUser) {
      setCards([]);
      setSelectedCardId(null);
      return;
    }
    setLoadingCards(true);
    fetch(`/api/admin/payments/charge-test/cards?ptUserId=${selectedUser.id}`)
      .then((r) => r.json())
      .then((data) => {
        const list: Card[] = data.cards || [];
        setCards(list);
        const primary = list.find((c) => c.is_primary) || list[0];
        setSelectedCardId(primary?.id ?? null);
      })
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, [selectedUser]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/payments/charge-test?limit=20');
      const data = await res.json();
      setHistory(data.transactions || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleExecute = async () => {
    if (!selectedUser || !selectedCardId) return;
    if (!confirm(`${selectedUser.full_name || selectedUser.email}님의 카드로 ${amount.toLocaleString()}원 실제 결제됩니다. 진행할까요?`)) {
      return;
    }
    setExecuting(true);
    setResultMsg(null);
    try {
      const res = await fetch('/api/admin/payments/charge-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ptUserId: selectedUser.id,
          amount,
          cardId: selectedCardId,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultMsg({
          type: 'success',
          text: `결제 성공! ${amount.toLocaleString()}원 청구됨. paymentKey: ${data.transaction.paymentKey}`,
          receiptUrl: data.transaction.receiptUrl || undefined,
        });
        setNote('');
      } else {
        setResultMsg({
          type: 'error',
          text: `결제 실패 (${data.failureCode || res.status}): ${data.error || '알 수 없는 오류'}`,
        });
      }
      loadHistory();
    } catch (err) {
      setResultMsg({
        type: 'error',
        text: `요청 실패: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  const formatDateTime = (s: string | null) => {
    if (!s) return '-';
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-[#E31837]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">테스트 결제 (실제 청구)</h1>
          <p className="text-sm text-gray-500">관리자 전용 — 임의 PT 사용자의 등록 카드로 1~1000원 실제 결제 검증</p>
        </div>
      </div>

      {/* 경고 배너 */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-amber-800">
          <p className="font-semibold mb-1">⚠️ 실제 카드 청구 발생</p>
          <p>
            토스페이먼츠 운영 키로 결제됩니다. 선택한 사용자의 카드 명세에 청구 흔적이 남고, PG 수수료가 발생할 수 있습니다.
            취소는 별도 처리가 필요합니다. 1분당 5회로 제한됩니다.
          </p>
        </div>
      </div>

      {/* PT 사용자 선택 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. PT 사용자 선택</h2>

        {!selectedUser ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 또는 이메일로 검색 (2자 이상)"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] outline-none"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.full_name || '(이름 없음)'}
                        {u.is_test_account && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">테스트 계정</span>}
                      </p>
                      <p className="text-xs text-gray-500">{u.email || '-'}</p>
                    </div>
                    <span className="text-xs text-gray-400">{u.status}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selectedUser.full_name || '(이름 없음)'}
              </p>
              <p className="text-xs text-gray-500 font-mono">{selectedUser.email} · {selectedUser.id.slice(0, 8)}</p>
            </div>
            <button
              onClick={() => setSelectedUser(null)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              변경
            </button>
          </div>
        )}
      </div>

      {/* 카드 선택 */}
      {selectedUser && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. 결제 카드 선택</h2>
          {loadingCards ? (
            <div className="py-8 text-center text-gray-400">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : cards.length === 0 ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <p className="font-semibold">활성 카드 없음</p>
              <p className="mt-1">이 사용자는 아직 결제 카드를 등록하지 않았습니다. 사용자가 직접 등록해야 결제 가능합니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedCardId === c.id ? 'border-[#E31837] bg-red-50/40' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    checked={selectedCardId === c.id}
                    onChange={() => setSelectedCardId(c.id)}
                    className="text-[#E31837]"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {c.card_company} {c.card_type} {c.card_number}
                      {c.is_primary && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#E31837]/10 text-[#E31837]">기본</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      등록 {formatDateTime(c.registered_at)}
                      {c.failed_count > 0 && <span className="ml-2 text-red-600">실패 {c.failed_count}회</span>}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 결제 실행 */}
      {selectedUser && cards.length > 0 && selectedCardId && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">3. 금액 + 결제 실행</h2>

          <div className="space-y-4">
            {/* 슬라이더 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">결제 금액</label>
                <span className="text-2xl font-bold text-[#E31837] tabular-nums">{amount.toLocaleString()}원</span>
              </div>
              <input
                type="range"
                min={1}
                max={1000}
                step={1}
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                className="w-full accent-[#E31837]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1원</span>
                <span>500원</span>
                <span>1,000원</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[1, 100, 500, 1000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className={`px-3 py-1 text-xs rounded-md border transition ${
                      amount === v ? 'border-[#E31837] text-[#E31837] bg-red-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {v.toLocaleString()}원
                  </button>
                ))}
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">메모 (선택)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="예: 자동결제 흐름 검증, 빌링키 만료 테스트 등"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] outline-none"
              />
            </div>

            {/* 실행 버튼 */}
            <button
              onClick={handleExecute}
              disabled={executing}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c8152f] transition disabled:opacity-50"
            >
              {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
              {executing ? '결제 진행 중...' : `${amount.toLocaleString()}원 실제 결제 실행`}
            </button>

            {/* 결과 */}
            {resultMsg && (
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                  resultMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {resultMsg.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p>{resultMsg.text}</p>
                  {resultMsg.receiptUrl && (
                    <a
                      href={resultMsg.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs underline"
                    >
                      <Receipt className="w-3 h-3" />
                      영수증 보기
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 최근 테스트 결제 내역 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">최근 테스트 결제 내역</h2>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">테스트 결제 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2 text-left">시각</th>
                  <th className="px-2 py-2 text-left">사용자</th>
                  <th className="px-2 py-2 text-right">금액</th>
                  <th className="px-2 py-2 text-center">상태</th>
                  <th className="px-2 py-2 text-left">메모</th>
                  <th className="px-2 py-2 text-center">영수증</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-xs text-gray-600 tabular-nums">{formatDateTime(tx.created_at)}</td>
                    <td className="px-2 py-2 text-xs">
                      <p className="font-medium text-gray-900">{tx.pt_user?.fullName || '-'}</p>
                      <p className="text-gray-400">{tx.pt_user?.email || '-'}</p>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{tx.total_amount.toLocaleString()}원</td>
                    <td className="px-2 py-2 text-center">
                      {tx.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> 성공
                        </span>
                      ) : tx.status === 'failed' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3" /> 실패
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          <Loader2 className="w-3 h-3 animate-spin" /> 진행
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={tx.test_note || tx.failure_message || ''}>
                      {tx.test_note || (tx.status === 'failed' ? `${tx.failure_code}: ${tx.failure_message}` : '-')}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {tx.receipt_url && (
                        <a
                          href={tx.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#E31837] hover:underline"
                        >
                          <Receipt className="w-3 h-3" />
                          보기
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
