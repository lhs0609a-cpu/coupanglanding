'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CreditCard, Shield } from 'lucide-react';

interface Props {
  lockLevel: 0 | 1 | 2 | 3;
  overdueSince: string | null;
  hasCard: boolean;
  /** true면 닫기 버튼 제공. false면 완전 강제 */
  allowDismiss?: boolean;
}

/**
 * 결제 락 경고 풀스크린 모달 — /megaload/* 에서 사용.
 * /my/* 는 DashboardLayout 에 내장.
 */
export default function PaymentLockForceModal({ lockLevel, overdueSince, hasCard, allowDismiss = true }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (lockLevel < 1) return null;
  if (allowDismiss && dismissed) return null;

  const daysSinceOverdue = overdueSince
    ? Math.floor((Date.now() - new Date(overdueSince).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const nextThreshold = lockLevel === 1 ? 3 : lockLevel === 2 ? 7 : null;
  const daysUntilNext = nextThreshold !== null ? Math.max(0, nextThreshold - daysSinceOverdue) : null;

  const safeLockLevel = lockLevel as 1 | 2 | 3; // L0 는 위에서 return null 로 걸러냄
  const meta: Record<1 | 2 | 3, { title: string; subtitle: string; bg: string; restrictions: string[] }> = {
    1: {
      title: '⚠️ L1 부분 차단 중',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · ${daysUntilNext ?? 0}일 뒤 L2 전체 차단`,
      bg: 'bg-amber-600',
      restrictions: ['신규 상품 등록 차단', '일괄 처리/사입 동기화 차단', '조회·일반 쓰기는 허용'],
    },
    2: {
      title: '🔒 L2 전체 쓰기 차단 중',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · ${daysUntilNext ?? 0}일 뒤 L3 완전 봉쇄`,
      bg: 'bg-orange-600',
      restrictions: ['모든 쓰기 작업 차단 (POST/PUT/DELETE)', '상품·주문·가격 수정 불가', '조회만 가능'],
    },
    3: {
      title: '🚫 L3 완전 봉쇄',
      subtitle: `미납 ${daysSinceOverdue}일 경과 · 결제 페이지만 접근 가능`,
      bg: 'bg-red-700',
      restrictions: ['메가로드 전체 접근 차단', '결제 설정 페이지로만 이동', '카드 등록 + 결제 시 즉시 복구'],
    },
  };
  const m = meta[safeLockLevel];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className={`rounded-t-2xl px-6 py-5 text-center ${m.bg}`}>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">{m.title}</h2>
          <p className="mt-1 text-sm text-white/90">{m.subtitle}</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-red-700">현재 상태</span>
              <span className="text-xs font-bold text-red-800">L{lockLevel} · D+{daysSinceOverdue}</span>
            </div>
            <ul className="space-y-1 text-xs text-red-700">
              {m.restrictions.map((r, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {daysUntilNext !== null && daysUntilNext > 0 && (
              <p className="mt-2 text-[11px] font-medium text-red-600 border-t border-red-200 pt-2">
                ⏰ <strong>{daysUntilNext}일 뒤</strong> 다음 단계로 자동 상승합니다
              </p>
            )}
          </div>

          {!hasCard && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <CreditCard className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                <strong>결제 카드가 등록되지 않아 자동결제가 불가능합니다.</strong>{' '}
                카드를 등록하면 미납 금액이 즉시 결제되고 모든 제한이 해제됩니다.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-gray-500">
            <Shield className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <p>토스페이먼츠 보안 결제 — 카드 정보는 안전하게 관리됩니다</p>
          </div>

          <Link
            href="/my/settings"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E31837] px-5 py-3.5 text-base font-bold text-white hover:bg-[#c81530] transition"
          >
            <CreditCard className="h-5 w-5" />
            {hasCard ? '지금 결제하기' : '결제 카드 등록하기'}
          </Link>

          {allowDismiss && lockLevel < 3 && (
            <button
              onClick={() => setDismissed(true)}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-700"
            >
              나중에 보기 (이 페이지에서만 숨기기)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
