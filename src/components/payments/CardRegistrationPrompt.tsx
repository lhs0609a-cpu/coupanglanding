'use client';

import { useState, useEffect, useMemo } from 'react';
import { CreditCard, ArrowRight, Shield, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CardRegistrationPromptProps {
  /** compact: 1줄 배너, full: 대형 카드 */
  variant?: 'compact' | 'full';
  /** 정산 대상 여부 (eligible이면 더 강하게 표시) */
  eligible?: boolean;
  /** 수수료 미납 상태 여부 */
  hasUnpaidFee?: boolean;
}

export default function CardRegistrationPrompt({
  variant = 'compact',
  eligible = false,
  hasUnpaidFee = false,
}: CardRegistrationPromptProps) {
  const [hasCards, setHasCards] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/payments/cards');
        if (res.ok) {
          const data = await res.json();
          setHasCards((data.cards || []).length > 0);
        }
      } catch {
        // ignore
      }
    })();
  }, [supabase]);

  // 카드 있거나 로딩 중이면 숨김
  if (hasCards === null || hasCards || dismissed) return null;

  // compact: 수수료 미납 시 강한 배너
  if (variant === 'compact') {
    if (hasUnpaidFee) {
      // 미납 상태 — 강한 경고
      return (
        <div className="flex items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3">
          <CreditCard className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900">
              결제 카드를 등록하고 수수료를 바로 결제하세요
            </p>
          </div>
          <Link
            href="/my/settings"
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            카드 등록
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      );
    }

    if (!eligible) return null;

    // 정산 대상이지만 미납 아닌 상태 — 가벼운 안내
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <CreditCard className="w-5 h-5 text-gray-500 shrink-0" />
        <p className="flex-1 text-sm text-gray-600">
          결제 카드를 등록하면 수수료가 자동 결제됩니다.
        </p>
        <Link
          href="/my/settings"
          className="shrink-0 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          등록하기 →
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-gray-400 hover:text-gray-500 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // full: 설정 페이지 안내용 카드 (대시보드 하단 등)
  return (
    <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <CreditCard className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 mb-1">결제 카드를 등록해주세요</h3>
          <p className="text-sm text-gray-600 mb-3">
            카드를 등록하면 매월 수수료가 자동 결제됩니다. 연체 걱정 없이 편하게 이용하세요.
          </p>
          <ul className="text-xs text-gray-500 space-y-1 mb-4">
            <li className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-500" />
              토스페이먼츠 보안 결제 — 카드 정보는 안전하게 관리됩니다
            </li>
            <li className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-500" />
              매월 자동결제 — 연체 부과금, 지연이자 걱정 없음
            </li>
            <li className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-green-500" />
              언제든 카드 변경 및 해지 가능
            </li>
          </ul>
          <Link
            href="/my/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            <CreditCard className="w-4 h-4" />
            결제 카드 등록하기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
