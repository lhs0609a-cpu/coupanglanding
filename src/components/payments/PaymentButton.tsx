'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { BillingCard } from '@/lib/supabase/types';
import { formatKRW } from '@/lib/utils/format';

interface PaymentButtonProps {
  reportId: string;
  amount: number;
  penaltyAmount: number;
  yearMonth: string;
  onSuccess: () => void;
}

export default function PaymentButton({
  reportId,
  amount,
  penaltyAmount,
  yearMonth,
  onSuccess,
}: PaymentButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cards, setCards] = useState<BillingCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const totalAmount = amount + penaltyAmount;

  const fetchCards = async () => {
    setCardsLoading(true);
    try {
      const res = await fetch('/api/payments/cards');
      const data = await res.json();
      setCards(data.cards || []);
      // 기본 카드 자동 선택
      const primary = (data.cards || []).find((c: BillingCard) => c.is_primary);
      if (primary) setSelectedCardId(primary.id);
    } catch {
      // ignore
    } finally {
      setCardsLoading(false);
    }
  };

  const handleOpen = () => {
    setModalOpen(true);
    setResult(null);
    setErrorMsg('');
    fetchCards();
  };

  const handlePay = async () => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/payments/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          cardId: selectedCardId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult('error');
        setErrorMsg(data.error || '결제에 실패했습니다.');
        return;
      }

      setResult('success');
      setTimeout(() => {
        setModalOpen(false);
        onSuccess();
      }, 2000);
    } catch (err) {
      setResult('error');
      setErrorMsg(err instanceof Error ? err.message : '결제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
      >
        <CreditCard className="w-5 h-5" />
        카드로 결제하기
      </button>

      <Modal isOpen={modalOpen} onClose={() => !loading && setModalOpen(false)} title="수수료 카드 결제">
        {cardsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-600 mb-2">등록된 결제 카드가 없습니다</p>
            <p className="text-sm text-gray-400">
              <a href="/my/settings" className="text-blue-600 hover:underline">설정 페이지</a>에서 카드를 먼저 등록해주세요.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 결제 금액 */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{yearMonth} 수수료</span>
                <span className="font-medium">{formatKRW(amount)}</span>
              </div>
              {penaltyAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>연체금</span>
                  <span>+{formatKRW(penaltyAmount)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>총 결제액</span>
                <span className="text-lg">{formatKRW(totalAmount)}</span>
              </div>
            </div>

            {/* 카드 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">결제 카드</label>
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.card_company} {card.card_number}
                    {card.is_primary ? ' (기본)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 결과 표시 */}
            {result === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">결제가 완료되었습니다!</span>
              </div>
            )}
            {result === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm">{errorMsg}</span>
              </div>
            )}

            {/* 결제 버튼 */}
            {result !== 'success' && (
              <button
                type="button"
                onClick={handlePay}
                disabled={loading || !selectedCardId}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CreditCard className="w-5 h-5" />
                )}
                {loading ? '결제 처리 중...' : `${formatKRW(totalAmount)} 결제하기`}
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
