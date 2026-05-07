'use client';

import { useState, useEffect } from 'react';
import { Loader2, CalendarDays, Save, Lock } from 'lucide-react';
import type { BillingCard, PaymentSchedule } from '@/lib/supabase/types';
import { BILLING_DAY } from '@/lib/payments/billing-constants';

interface AutoPaymentSettingsProps {
  cards: BillingCard[];
}

export default function AutoPaymentSettings({ cards }: AutoPaymentSettingsProps) {
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      const res = await fetch('/api/payments/schedule', {
        signal: AbortSignal.timeout(12_000),
      });
      const data = await res.json();
      if (data.schedule) {
        setSchedule(data.schedule);
        setSelectedCardId(data.schedule.billing_card_id || '');
      }
    } catch {
      // ignore — UI shows empty/default state
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/payments/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCardId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '저장 실패');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const activeCards = cards.filter((c) => c.is_active);

  return (
    <div className="space-y-5">
      {/* 청구일 — 운영 정책상 고정, 사용자 변경 불가 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <CalendarDays className="w-4 h-4 inline mr-1" />
          매월 청구일
        </label>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
          <Lock className="w-4 h-4 text-gray-400" />
          <span className="text-gray-900 font-medium">매월 {BILLING_DAY}일</span>
          <span className="text-xs text-gray-500 ml-auto">관리자 지정 (변경 불가)</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          모든 PT 사용자는 매월 {BILLING_DAY}일에 미납 수수료가 자동 결제됩니다.
        </p>
      </div>

      {/* 결제 카드 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          결제 카드
        </label>
        {activeCards.length === 0 ? (
          <p className="text-sm text-orange-600">
            등록된 카드가 없습니다. 먼저 카드를 등록해주세요.
          </p>
        ) : (
          <select
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">기본 카드 사용</option>
            {activeCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.card_company} {card.card_number}
                {card.is_primary ? ' (기본)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 저장 버튼 */}
      <div className="space-y-2">
        {saved && (
          <div className="flex items-center gap-2 text-green-600">
            <Save className="w-4 h-4" />
            <p className="text-sm">자동결제 설정이 저장되었습니다.</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>

      {/* 안내 */}
      {schedule && schedule.total_success_count > 0 && (
        <div className="text-xs text-gray-400 pt-2 border-t">
          총 {schedule.total_success_count}회 결제 성공
          {schedule.last_charged_at && (
            <> · 마지막 결제: {new Date(schedule.last_charged_at).toLocaleDateString('ko-KR')}</>
          )}
        </div>
      )}
    </div>
  );
}
