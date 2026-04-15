'use client';

import Link from 'next/link';
import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react';

interface PaymentLockBannerProps {
  level: number;
  overdueSince: string | null;
}

export default function PaymentLockBanner({ level, overdueSince }: PaymentLockBannerProps) {
  if (!level || level < 1) return null;

  const sinceText = overdueSince
    ? new Date(overdueSince).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const config: Record<
    number,
    { bg: string; border: string; text: string; icon: typeof AlertTriangle; title: string; desc: string }
  > = {
    1: {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      text: 'text-amber-900',
      icon: AlertTriangle,
      title: '서비스 일부 제한 — 1단계',
      desc: '결제 미이행으로 신규 상품 등록·일괄 처리가 차단되었습니다. 즉시 결제 카드를 등록/변경해주세요.',
    },
    2: {
      bg: 'bg-orange-50',
      border: 'border-orange-400',
      text: 'text-orange-900',
      icon: ShieldAlert,
      title: '서비스 쓰기 전체 제한 — 2단계',
      desc: '결제 미이행으로 모든 쓰기 작업이 차단되었습니다. 조회만 가능합니다.',
    },
    3: {
      bg: 'bg-red-50',
      border: 'border-red-500',
      text: 'text-red-900',
      icon: Lock,
      title: '서비스 완전 차단 — 3단계',
      desc: '결제 미이행으로 서비스가 완전히 차단되었습니다. 결제 설정 외 모든 페이지가 잠겼습니다.',
    },
  };

  const cfg = config[level];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className={`${cfg.bg} ${cfg.border} ${cfg.text} border-l-4 border px-4 py-3 mb-4 rounded-r-lg`}>
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{cfg.title}</p>
          <p className="text-sm mt-0.5 opacity-90">{cfg.desc}</p>
          {sinceText && (
            <p className="text-xs mt-1 opacity-75">연체 기준일: {sinceText}</p>
          )}
        </div>
        <Link
          href="/my/settings"
          className="flex-shrink-0 px-3 py-1.5 bg-white rounded-md text-sm font-semibold hover:bg-gray-50 transition border border-current"
        >
          결제 카드 등록
        </Link>
      </div>
    </div>
  );
}
