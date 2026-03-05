'use client';

import type { AdminSettlementStatus } from '@/lib/utils/settlement';
import { Clock, AlertTriangle } from 'lucide-react';

interface AdminPendingBannerProps {
  adminStatus: AdminSettlementStatus;
}

export default function AdminPendingBanner({ adminStatus }: AdminPendingBannerProps) {
  if (adminStatus === 'not_applicable' || adminStatus === 'on_time') {
    return null;
  }

  if (adminStatus === 'admin_pending') {
    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm font-medium text-blue-800">
            정산이 관리자 확인 대기 중입니다. 곧 처리될 예정입니다.
          </p>
        </div>
      </div>
    );
  }

  // admin_overdue
  return (
    <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
        <p className="text-sm font-medium text-orange-800">
          정산 확인이 지연되고 있습니다. 문의사항이 있으시면 코치에게 연락해주세요.
        </p>
      </div>
    </div>
  );
}
