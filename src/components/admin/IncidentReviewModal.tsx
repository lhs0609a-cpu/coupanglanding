'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import type { Incident } from '@/lib/supabase/types';
import {
  INCIDENT_TYPE_LABELS, INCIDENT_SUBTYPE_LABELS,
  INCIDENT_SEVERITY_LABELS, INCIDENT_SEVERITY_COLORS,
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS,
} from '@/lib/utils/constants';
import { CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

interface IncidentWithUser extends Incident {
  pt_user?: {
    id: string;
    profile?: {
      id: string;
      full_name: string;
      email: string;
    };
  };
}

interface IncidentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: IncidentWithUser;
  onReviewed: () => void;
}

export default function IncidentReviewModal({
  isOpen,
  onClose,
  incident,
  onReviewed,
}: IncidentReviewModalProps) {
  const [adminNote, setAdminNote] = useState(incident.admin_note || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userName = incident.pt_user?.profile?.full_name || incident.pt_user?.profile?.email || '사용자';

  const handleStatusUpdate = async (newStatus: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: incident.id,
          status: newStatus,
          admin_note: adminNote.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '상태 업데이트에 실패했습니다.');
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
    setAdminNote(incident.admin_note || '');
    setError('');
    onClose();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="인시던트 리뷰" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* 기본 정보 */}
        <div className="p-3 bg-gray-50 rounded-lg space-y-1">
          <p className="text-sm text-gray-600">
            파트너: <span className="font-bold text-gray-900">{userName}</span>
          </p>
          <p className="text-xs text-gray-500">신고일: {formatDate(incident.created_at)}</p>
        </div>

        {/* 인시던트 상세 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={INCIDENT_SEVERITY_COLORS[incident.severity]}>
              {INCIDENT_SEVERITY_LABELS[incident.severity]}
            </Badge>
            <Badge className={INCIDENT_STATUS_COLORS[incident.status]}>
              {INCIDENT_STATUS_LABELS[incident.status]}
            </Badge>
            <span className="text-xs text-gray-500">
              {INCIDENT_TYPE_LABELS[incident.incident_type]} &gt; {INCIDENT_SUBTYPE_LABELS[incident.sub_type] || incident.sub_type}
            </span>
          </div>

          <h3 className="text-sm font-bold text-gray-900">{incident.title}</h3>

          {incident.description && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-900">{incident.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {incident.brand_name && (
              <div className="p-2 bg-gray-50 rounded">
                <span className="text-gray-500">브랜드: </span>
                <span className="font-medium text-gray-900">{incident.brand_name}</span>
              </div>
            )}
            {incident.product_name && (
              <div className="p-2 bg-gray-50 rounded">
                <span className="text-gray-500">상품: </span>
                <span className="font-medium text-gray-900">{incident.product_name}</span>
              </div>
            )}
            {incident.coupang_reference && (
              <div className="p-2 bg-gray-50 rounded col-span-2">
                <span className="text-gray-500">참조번호: </span>
                <span className="font-medium text-gray-900">{incident.coupang_reference}</span>
              </div>
            )}
          </div>

          {incident.actions_taken && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">수행된 조치</p>
              <p className="text-sm text-gray-700 bg-green-50 p-2 rounded">{incident.actions_taken}</p>
            </div>
          )}
        </div>

        {/* 관리자 메모 */}
        <div>
          <label htmlFor="admin-note" className="block text-sm font-medium text-gray-700 mb-1">
            관리자 메모
          </label>
          <textarea
            id="admin-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
            placeholder="관리자 메모를 입력하세요"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* 상태 변경 버튼 */}
        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            닫기
          </button>

          {incident.status !== 'closed' && (
            <>
              {incident.status === 'reported' && (
                <button
                  type="button"
                  onClick={() => handleStatusUpdate('in_progress')}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  처리 시작
                </button>
              )}

              <button
                type="button"
                onClick={() => handleStatusUpdate('escalated')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                에스컬레이션
              </button>

              <button
                type="button"
                onClick={() => handleStatusUpdate('resolved')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                해결 완료
              </button>

              <button
                type="button"
                onClick={() => handleStatusUpdate('closed')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                종료
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
