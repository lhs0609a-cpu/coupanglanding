'use client';

import Link from 'next/link';
import { Lock, ShieldAlert, LayoutDashboard, Receipt, MessageSquare, Settings, ArrowRight } from 'lucide-react';
import { formatDDay } from '@/lib/utils/settlement';

interface GatePageProps {
  dday: number;
  targetMonth: string;
  deadline: string;
}

const ALLOWED_FEATURES = [
  { label: '대시보드', icon: LayoutDashboard, href: '/megaload/dashboard' },
  { label: '정산', icon: Receipt, href: '/megaload/settlement' },
  { label: '문의관리', icon: MessageSquare, href: '/megaload/cs' },
  { label: '설정', icon: Settings, href: '/megaload/settings' },
];

/** Tier 2: 인라인 게이트 — 허용 메뉴 외 접근 시 children 대체 */
export default function SettlementGatePage({ dday, targetMonth, deadline }: GatePageProps) {
  return (
    <div className="max-w-lg mx-auto py-16 px-4 text-center">
      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Lock className="w-8 h-8 text-amber-600" />
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2">기능 이용이 제한되었습니다</h2>
      <p className="text-sm text-gray-600 mb-1">
        {targetMonth} 매출 정산 마감일({deadline})이 지났습니다.
      </p>
      <p className="text-sm font-semibold text-amber-700 mb-6">
        {formatDDay(dday)} — 정산을 제출해야 잠금이 해제됩니다.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
        <p className="text-sm font-semibold text-amber-800 mb-3">이용 가능한 기능</p>
        <div className="grid grid-cols-2 gap-2">
          {ALLOWED_FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-amber-200 text-sm text-amber-800 hover:bg-amber-50 transition"
            >
              <f.icon className="w-4 h-4" />
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <Link
        href="/my/report"
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
      >
        정산 제출하기
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

/** Tier 3: 풀스크린 차단 — 사이드바/헤더 없이 전체 화면 */
export function SettlementBlockPage({ dday, targetMonth, deadline }: GatePageProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">메가로드 이용이 차단되었습니다</h1>
        <p className="text-sm text-gray-600 mb-1">
          {targetMonth} 매출 정산 마감일({deadline})로부터 7일이 초과되었습니다.
        </p>
        <p className="text-sm font-bold text-red-600 mb-6">
          {formatDDay(dday)}
        </p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-red-800 mb-2">정산 미제출 경고</p>
          <ul className="text-sm text-red-700 space-y-1.5">
            <li>- 정산을 제출하지 않으면 모든 메가로드 기능을 이용할 수 없습니다.</li>
            <li>- 계약 조건에 따라 <strong>위약금 또는 계약 해지</strong> 사유가 될 수 있습니다.</li>
            <li>- 정산 제출 즉시 정상 이용이 가능합니다.</li>
          </ul>
        </div>

        <Link
          href="/my/report"
          className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-bold text-white bg-[#E31837] rounded-xl hover:bg-red-700 transition shadow-lg"
        >
          지금 정산 제출하기
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
