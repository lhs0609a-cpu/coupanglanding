'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils/format';
import { AlertTriangle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import type { Contract, PtUser, Profile } from '@/lib/supabase/types';

interface ContractWithUser extends Contract {
  pt_user: PtUser & { profile: Profile };
}

interface WithdrawalReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: ContractWithUser;
  onReviewed: () => void;
}

export default function WithdrawalReviewModal({
  isOpen,
  onClose,
  contract,
  onReviewed,
}: WithdrawalReviewModalProps) {
  const [mode, setMode] = useState<'view' | 'reject'>('view');
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userName = contract.pt_user?.profile?.full_name || contract.pt_user?.profile?.email || '사용자';

  const handleApprove = async () => {
    if (!confirm(`"${userName}" 파트너의 탈퇴 요청을 승인하시겠습니까?\n승인 시 계약이 해지되고 14일 철거 기한이 설정됩니다.`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/contracts/approve-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '승인 처리에 실패했습니다.');
        setLoading(false);
        return;
      }

      onReviewed();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('반려 사유를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/contracts/reject-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, reason: rejectReason.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '반려 처리에 실패했습니다.');
        setLoading(false);
        return;
      }

      onReviewed();
      handleClose();
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMode('view');
    setRejectReason('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="탈퇴 요청 심사" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* 파트너 정보 */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            대상: <span className="font-bold text-gray-900">{userName}</span>
          </p>
          {contract.withdrawal_requested_at && (
            <p className="text-xs text-gray-500 mt-1">
              요청일: {formatDate(contract.withdrawal_requested_at)}
            </p>
          )}
        </div>

        {/* 탈퇴 사유 */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">탈퇴 사유</h3>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">{contract.withdrawal_reason || '-'}</p>
          </div>
        </div>

        {/* 증빙 이미지 */}
        {contract.withdrawal_evidence_url && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">상품 목록 증빙</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <img
                src={contract.withdrawal_evidence_url}
                alt="증빙"
                className="w-full h-40 object-contain bg-gray-50 cursor-pointer"
                onClick={() => window.open(contract.withdrawal_evidence_url!, '_blank')}
              />
              <div className="p-2 bg-gray-50 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => window.open(contract.withdrawal_evidence_url!, '_blank')}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  새 탭에서 보기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 안내 */}
        <div className="space-y-2">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                승인 시: 계약 해지 처리, pt_users 종료, 14일 상품 철거 기한 설정
              </p>
            </div>
          </div>
        </div>

        {/* 반려 모드 */}
        {mode === 'reject' && (
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
              반려 사유 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
              placeholder="반려 사유를 입력하세요"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* 버튼 */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            닫기
          </button>

          {mode === 'view' ? (
            <>
              <button
                type="button"
                onClick={() => setMode('reject')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                반려
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {loading ? '처리 중...' : '승인'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setMode('view'); setRejectReason(''); setError(''); }}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={loading || !rejectReason.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {loading ? '처리 중...' : '반려 확인'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
