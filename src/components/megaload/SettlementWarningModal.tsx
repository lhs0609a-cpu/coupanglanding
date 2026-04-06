'use client';

import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import { formatDDay, getDDayColorClass } from '@/lib/utils/settlement';
import { AlertTriangle } from 'lucide-react';

interface SettlementWarningModalProps {
  dday: number;
  targetMonth: string;
  deadline: string;
  onClose: () => void;
}

export default function SettlementWarningModal({
  dday,
  targetMonth,
  deadline,
  onClose,
}: SettlementWarningModalProps) {
  const ddayText = formatDDay(dday);
  const ddayColor = getDDayColorClass(dday);

  return (
    <Modal isOpen onClose={onClose} title="정산 마감 안내">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${ddayColor}`}>
              {ddayText}
            </span>
            <p className="text-sm text-gray-600 mt-1">
              {targetMonth} 매출 정산 마감일: <strong>{deadline}</strong>
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            마감일까지 정산을 제출하지 않으면 메가로드 기능 이용이
            <strong> 단계적으로 제한</strong>됩니다.
          </p>
          <ul className="mt-2 text-xs text-amber-700 space-y-1">
            <li>- 마감 후 1~7일: 일부 기능 잠금</li>
            <li>- 마감 후 7일 초과: 전체 기능 차단</li>
          </ul>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            나중에
          </button>
          <Link
            href="/my/report"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition text-center"
          >
            정산 제출하기
          </Link>
        </div>
      </div>
    </Modal>
  );
}
