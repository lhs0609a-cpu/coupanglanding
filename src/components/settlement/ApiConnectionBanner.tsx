'use client';

import { Plug, ArrowRight, ShieldAlert, Clock } from 'lucide-react';
import Link from 'next/link';

interface ApiConnectionBannerProps {
  /** 'blocker': 전체 차단 (리포트 페이지), 'nudge': 넛지 (대시보드) */
  variant: 'blocker' | 'nudge';
  /** 가입일로부터 경과 일수 */
  daysSinceJoin?: number;
}

export default function ApiConnectionBanner({ variant, daysSinceJoin = 0 }: ApiConnectionBannerProps) {
  if (variant === 'blocker') {
    return (
      <div className="max-w-xl mx-auto space-y-6 py-4">
        <div className="p-6 bg-red-50 border-2 border-red-300 rounded-xl">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-900">쿠팡 API 연동이 필요합니다</h2>
              <p className="text-sm text-red-700 mt-2">
                API가 연동되지 않으면 매출 보고서를 제출할 수 없습니다.<br />
                아래 버튼을 눌러 API 연동을 먼저 완료해주세요.
              </p>
            </div>

            <div className="w-full bg-white rounded-lg p-4 border border-red-200">
              <h3 className="text-sm font-bold text-gray-900 mb-3">API 연동이 필요한 이유</h3>
              <ul className="text-xs text-gray-700 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold shrink-0 mt-0.5">1</span>
                  <span>매출 데이터가 <span className="font-medium">자동으로 검증</span>되어 스크린샷이 필요 없습니다</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold shrink-0 mt-0.5">2</span>
                  <span>상품 등록 수가 <span className="font-medium">자동 집계</span>되어 할인이 적용됩니다</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold shrink-0 mt-0.5">3</span>
                  <span>정산 처리가 <span className="font-medium">빠르게 승인</span>됩니다</span>
                </li>
              </ul>
            </div>

            <Link
              href="/my/settings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#E31837] text-white font-bold rounded-lg hover:bg-red-700 transition"
            >
              <Plug className="w-5 h-5" />
              API 연동하러 가기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // nudge variant: 대시보드용 배너
  const isUrgent = daysSinceJoin >= 7;
  const isWarning = daysSinceJoin >= 3;

  const bgColor = isUrgent ? 'bg-red-50 border-red-300' : isWarning ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-300';
  const iconBg = isUrgent ? 'bg-red-100' : isWarning ? 'bg-amber-100' : 'bg-blue-100';
  const iconColor = isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-blue-600';
  const titleColor = isUrgent ? 'text-red-900' : isWarning ? 'text-amber-900' : 'text-blue-900';
  const textColor = isUrgent ? 'text-red-700' : isWarning ? 'text-amber-700' : 'text-blue-700';
  const btnColor = isUrgent ? 'bg-red-600 hover:bg-red-700' : isWarning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700';

  const messages = {
    title: isUrgent
      ? 'API 미연동 — 정산 불가'
      : isWarning
        ? 'API 연동을 완료해주세요'
        : '쿠팡 API를 연동하세요',
    description: isUrgent
      ? 'API가 연동되지 않아 매출 보고서를 제출할 수 없습니다. 지금 바로 연동해주세요.'
      : isWarning
        ? 'API가 연동되지 않으면 매출 정산이 진행되지 않습니다.'
        : '쿠팡 Open API를 연동하면 매출 데이터가 자동으로 집계됩니다.',
  };

  return (
    <div className={`p-4 border-2 rounded-xl ${bgColor}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {isUrgent ? <ShieldAlert className={`w-5 h-5 ${iconColor}`} /> : <Plug className={`w-5 h-5 ${iconColor}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-bold ${titleColor}`}>{messages.title}</p>
            {daysSinceJoin > 0 && (
              <span className={`text-xs flex items-center gap-1 ${textColor}`}>
                <Clock className="w-3 h-3" />
                가입 후 {daysSinceJoin}일
              </span>
            )}
          </div>
          <p className={`text-sm mt-1 ${textColor}`}>{messages.description}</p>
        </div>
        <Link
          href="/my/settings"
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-white text-sm font-bold rounded-lg transition shrink-0 ${btnColor}`}
        >
          <Plug className="w-4 h-4" />
          연동하기
        </Link>
      </div>
    </div>
  );
}
