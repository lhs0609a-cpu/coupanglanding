'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { AlertTriangle } from 'lucide-react';

interface ContractTerminationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  userName: string;
  onTerminated: () => void;
}

export default function ContractTerminationModal({
  isOpen,
  onClose,
  contractId,
  userName,
  onTerminated,
}: ContractTerminationModalProps) {
  const [reason, setReason] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTerminate = async () => {
    if (!reason.trim()) {
      setError('해지 사유를 입력해주세요.');
      return;
    }
    if (!agreed) {
      setError('해지 내용에 동의해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/contracts/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, reason: reason.trim() }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '해지 처리에 실패했습니다.');
        setLoading(false);
        return;
      }

      onTerminated();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReason('');
    setAgreed(false);
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="계약 해지" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* 대상 사용자 */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            대상: <span className="font-bold text-gray-900">{userName}</span>
          </p>
        </div>

        {/* 해지 사유 */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
            해지 사유 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
            placeholder="해지 사유를 입력하세요"
          />
        </div>

        {/* 계약 조항 안내 */}
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">제10조 (해지 조건)</p>
                <p className="text-xs text-amber-700 mt-1">
                  양측은 30일 전 서면 통보로 해지할 수 있으며, 중대한 의무 위반 시 즉시 해지할 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-orange-800">제11조 (종료 의무)</p>
                <p className="text-xs text-orange-700 mt-1">
                  계약 종료 시 사용자는 14일 이내에 프로그램을 통해 등록한 모든 상품을 쿠팡 Wing에서 비활성화(판매중지)해야 합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">제12조 (위약금)</p>
                <p className="text-xs text-red-700 mt-1">
                  상품 철거 의무 미이행 시 수수료율의 2배에 해당하는 위약금이 부과됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 동의 체크박스 */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setError(''); }}
            className="w-5 h-5 rounded border-gray-300 text-[#E31837] focus:ring-[#E31837] mt-0.5"
          />
          <span className="text-sm text-gray-700">
            위 내용을 이해하고 해지합니다. 사용자에게 해지 안내 및 상품 철거 기한(14일) 알림이 발송됩니다.
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* 버튼 */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleTerminate}
            disabled={loading || !agreed || !reason.trim()}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : '해지 실행'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
