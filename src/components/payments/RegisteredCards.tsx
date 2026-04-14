'use client';

import { useState } from 'react';
import { CreditCard, Star, Trash2, Loader2 } from 'lucide-react';
import type { BillingCard } from '@/lib/supabase/types';

interface RegisteredCardsProps {
  cards: BillingCard[];
  onRefresh: () => void;
}

export default function RegisteredCards({ cards, onRefresh }: RegisteredCardsProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleDelete = async (cardId: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) return;

    setActionLoading(cardId);
    try {
      const res = await fetch('/api/payments/cards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      if (!res.ok) throw new Error('삭제 실패');
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '카드 삭제에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetPrimary = async (cardId: string) => {
    setActionLoading(cardId);
    try {
      const res = await fetch('/api/payments/cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      if (!res.ok) throw new Error('변경 실패');
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '기본 카드 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">등록된 카드가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`flex items-center justify-between p-4 rounded-lg border ${
            card.is_primary
              ? 'border-blue-300 bg-blue-50'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <CreditCard className={`w-8 h-8 ${card.is_primary ? 'text-blue-600' : 'text-gray-400'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {card.card_company}
                </span>
                <span className="text-sm text-gray-500">
                  {card.card_number}
                </span>
                {card.is_primary && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    <Star className="w-3 h-3" />
                    기본
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {card.card_type} · 등록 {new Date(card.registered_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!card.is_primary && (
              <button
                type="button"
                onClick={() => handleSetPrimary(card.id)}
                disabled={!!actionLoading}
                className="text-xs px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading === card.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '기본 설정'
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDelete(card.id)}
              disabled={!!actionLoading}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              title="카드 삭제"
            >
              {actionLoading === card.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
