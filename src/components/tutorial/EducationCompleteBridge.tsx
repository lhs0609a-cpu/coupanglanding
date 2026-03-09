'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { Plug, ArrowRight, CheckCircle, Zap, Shield } from 'lucide-react';

interface EducationCompleteBridgeProps {
  coupangApiConnected: boolean;
}

export default function EducationCompleteBridge({ coupangApiConnected }: EducationCompleteBridgeProps) {
  // API가 이미 연동되어 있으면 표시하지 않음
  if (coupangApiConnected) return null;

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* 아이콘 */}
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <Plug className="w-6 h-6 text-blue-600" />
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-900">다음 단계: 쿠팡 API 연동</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              추천
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            교육을 모두 완료하셨습니다! 이제 쿠팡 API를 연동하여 매출 자동 검증과 빠른 정산 혜택을 받으세요.
          </p>

          {/* 혜택 목록 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span>매출 자동 검증</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span>정산 3일 단축</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Shield className="w-4 h-4 text-blue-500 shrink-0" />
              <span>빠른 승인 처리</span>
            </div>
          </div>

          {/* CTA 버튼 */}
          <Link
            href="/my/settings"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            API 연동하러 가기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
