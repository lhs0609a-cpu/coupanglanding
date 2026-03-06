'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { PartnerViolation, ViolationCategory, ViolationType, ViolationActionLevel } from '@/lib/supabase/types';
import {
  VIOLATION_CATEGORY_LABELS, VIOLATION_TYPE_LABELS,
  VIOLATION_STATUS_LABELS, VIOLATION_STATUS_COLORS,
  VIOLATION_ACTION_LABELS, VIOLATION_ACTION_COLORS,
  VIOLATION_CATEGORY_COLORS, VIOLATION_CONTRACT_ARTICLES,
  IMMEDIATE_TERMINATION_TYPES, getRiskLevel, RISK_SCORE_LABELS,
} from '@/lib/utils/constants';
import { Gavel, Plus, AlertTriangle } from 'lucide-react';

interface ViolationWithUser extends Omit<PartnerViolation, 'pt_user'> {
  pt_user?: {
    id: string;
    profile_id: string;
    profile?: {
      id: string;
      full_name: string;
      email: string;
    };
  };
}

interface PtUserOption {
  id: string;
  profile?: { full_name: string; email: string };
}

const VIOLATION_TYPES_BY_CATEGORY: Record<string, { value: ViolationType; label: string }[]> = {
  settlement: [
    { value: 'non_payment_3months', label: '3개월 이상 미정산' },
    { value: 'false_revenue_report', label: '매출 허위/미제출' },
  ],
  access_rights: [
    { value: 'access_sharing', label: '접근권한 양도/공유' },
    { value: 'credential_update_delay', label: '계정정보 미갱신' },
  ],
  confidentiality: [
    { value: 'confidentiality_breach', label: '기밀정보 유출' },
    { value: 'competing_service', label: '경쟁서비스 이용' },
  ],
  operation: [
    { value: 'product_deactivation_fail', label: '상품 미비활성화' },
    { value: 'blacklist_brand_sale', label: '블랙리스트 브랜드 판매' },
    { value: 'seller_account_terminated', label: '셀러 계정 해지' },
  ],
  other: [
    { value: 'other', label: '기타' },
  ],
};

export default function AdminViolationsPage() {
  const [violations, setViolations] = useState<ViolationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [ptUsers, setPtUsers] = useState<PtUserOption[]>([]);

  // Detail modal
  const [selected, setSelected] = useState<ViolationWithUser | null>(null);

  // Create form
  const [form, setForm] = useState({
    pt_user_id: '',
    violation_category: '' as ViolationCategory | '',
    violation_type: '' as ViolationType | '',
    title: '',
    description: '',
    evidence: '',
    action_level: '' as ViolationActionLevel | '',
    correction_deadline: '',
    admin_notes: '',
  });

  const loadViolations = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    const res = await fetch(`/api/admin/violations?${params}`);
    const data = await res.json();
    if (data.data) setViolations(data.data);
  }, [statusFilter, categoryFilter]);

  const loadPtUsers = useCallback(async () => {
    const res = await fetch('/api/admin/violations');
    // We need to fetch pt_users separately - use a simple approach
    // For now, we extract unique users from existing data
  }, []);

  useEffect(() => {
    setLoading(true);
    loadViolations().then(() => setLoading(false));
  }, [loadViolations]);

  // Load PT users for the create form
  useEffect(() => {
    if (createOpen && ptUsers.length === 0) {
      fetch('/api/admin/incidents?status=all')
        .then(res => res.json())
        .then(data => {
          // Extract unique PT users from incident data, or fetch separately
          // Use a dedicated lightweight fetch
          return fetch('/api/admin/violations?status=all');
        })
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            const users = new Map<string, PtUserOption>();
            data.data.forEach((v: ViolationWithUser) => {
              if (v.pt_user) {
                users.set(v.pt_user.id, v.pt_user);
              }
            });
            setPtUsers(Array.from(users.values()));
          }
        });
    }
  }, [createOpen, ptUsers.length]);

  const handleCreate = async () => {
    if (!form.pt_user_id || !form.violation_category || !form.violation_type || !form.title) {
      alert('파트너, 위반 카테고리, 유형, 제목은 필수입니다.');
      return;
    }

    const res = await fetch('/api/admin/violations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        contract_article: VIOLATION_CONTRACT_ARTICLES[form.violation_type] || null,
        action_level: form.action_level || null,
        correction_deadline: form.correction_deadline || null,
      }),
    });

    if (res.ok) {
      setCreateOpen(false);
      setForm({
        pt_user_id: '', violation_category: '', violation_type: '',
        title: '', description: '', evidence: '', action_level: '',
        correction_deadline: '', admin_notes: '',
      });
      loadViolations();
    } else {
      const err = await res.json();
      alert(err.error || '등록에 실패했습니다.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string, actionLevel?: string, reason?: string, correctionDeadline?: string) => {
    const res = await fetch('/api/admin/violations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        status: newStatus,
        action_level: actionLevel,
        reason,
        correction_deadline: correctionDeadline,
        admin_notes: selected?.admin_notes,
      }),
    });

    if (res.ok) {
      setSelected(null);
      loadViolations();
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });

  // Stats
  const activeCount = violations.filter(v => ['reported', 'investigating', 'action_taken', 'escalated'].includes(v.status)).length;
  const terminatedCount = violations.filter(v => v.status === 'terminated').length;
  const resolvedCount = violations.filter(v => v.status === 'resolved' || v.status === 'dismissed').length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gavel className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">계약위반 관리</h1>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          위반 등록
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '전체', value: violations.length, color: 'text-gray-900' },
          { label: '진행 중', value: activeCount, color: 'text-orange-600' },
          { label: '종결', value: resolvedCount, color: 'text-green-600' },
          { label: '계약해지', value: terminatedCount, color: 'text-red-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">상태:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              <option value="all">전체</option>
              <option value="reported">접수됨</option>
              <option value="investigating">조사 중</option>
              <option value="action_taken">조치 완료</option>
              <option value="escalated">단계 격상</option>
              <option value="resolved">시정 완료</option>
              <option value="dismissed">무혐의</option>
              <option value="terminated">계약해지</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">카테고리:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              <option value="all">전체</option>
              {Object.entries(VIOLATION_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {violations.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">등록된 위반 건이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">날짜</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">파트너</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">카테고리</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">위반 유형</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">제목</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">조치</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">상태</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => {
                  const name = v.pt_user?.profile?.full_name || v.pt_user?.profile?.email || '-';
                  return (
                    <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(v.created_at)}</td>
                      <td className="py-2 px-3 font-medium text-gray-900">{name}</td>
                      <td className="py-2 px-3">
                        <Badge label={VIOLATION_CATEGORY_LABELS[v.violation_category]} colorClass={VIOLATION_CATEGORY_COLORS[v.violation_category]} />
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-700">{VIOLATION_TYPE_LABELS[v.violation_type]}</td>
                      <td className="py-2 px-3 text-gray-900 max-w-[200px] truncate">{v.title}</td>
                      <td className="py-2 px-3">
                        {v.action_level ? (
                          <Badge label={VIOLATION_ACTION_LABELS[v.action_level]} colorClass={VIOLATION_ACTION_COLORS[v.action_level]} />
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Badge label={VIOLATION_STATUS_LABELS[v.status]} colorClass={VIOLATION_STATUS_COLORS[v.status]} />
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => setSelected(v)}
                          className="text-xs text-[#E31837] hover:underline font-medium"
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="계약위반 등록" maxWidth="max-w-2xl">
        <div className="space-y-4">
          {/* PT User select - manual input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">파트너 ID (pt_user_id)</label>
            <input
              type="text"
              value={form.pt_user_id}
              onChange={(e) => setForm(f => ({ ...f, pt_user_id: e.target.value }))}
              placeholder="PT 사용자 UUID 입력"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
            {ptUsers.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {ptUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, pt_user_id: u.id }))}
                    className={`text-xs px-2 py-1 rounded border transition ${
                      form.pt_user_id === u.id
                        ? 'bg-[#E31837] text-white border-[#E31837]'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {u.profile?.full_name || u.profile?.email || u.id.slice(0, 8)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">위반 카테고리</label>
            <select
              value={form.violation_category}
              onChange={(e) => setForm(f => ({ ...f, violation_category: e.target.value as ViolationCategory, violation_type: '' }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              <option value="">선택해주세요</option>
              {Object.entries(VIOLATION_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          {form.violation_category && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">위반 유형</label>
              <select
                value={form.violation_type}
                onChange={(e) => {
                  const vType = e.target.value as ViolationType;
                  setForm(f => ({ ...f, violation_type: vType }));
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
              >
                <option value="">선택해주세요</option>
                {(VIOLATION_TYPES_BY_CATEGORY[form.violation_category] || []).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {form.violation_type && IMMEDIATE_TERMINATION_TYPES.includes(form.violation_type) && (
                <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  즉시 해지 사유에 해당합니다
                </div>
              )}
              {form.violation_type && VIOLATION_CONTRACT_ARTICLES[form.violation_type] && (
                <p className="mt-1 text-xs text-gray-500">
                  관련 조항: {VIOLATION_CONTRACT_ARTICLES[form.violation_type]}
                </p>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="위반 건 제목"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Evidence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">증거/근거</label>
            <textarea
              value={form.evidence}
              onChange={(e) => setForm(f => ({ ...f, evidence: e.target.value }))}
              rows={2}
              placeholder="증거 자료 URL이나 설명"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          {/* Action Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">즉시 조치 (선택)</label>
            <select
              value={form.action_level}
              onChange={(e) => setForm(f => ({ ...f, action_level: e.target.value as ViolationActionLevel | '' }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            >
              <option value="">조사 후 결정</option>
              {Object.entries(VIOLATION_ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Correction deadline */}
          {(form.action_level === 'warning' || form.action_level === 'corrective') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시정 기한</label>
              <input
                type="date"
                value={form.correction_deadline}
                onChange={(e) => setForm(f => ({ ...f, correction_deadline: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
              />
            </div>
          )}

          {/* Admin notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모</label>
            <textarea
              value={form.admin_notes}
              onChange={(e) => setForm(f => ({ ...f, admin_notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
            >
              등록
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      {selected && (
        <ViolationDetailModal
          violation={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onNotesChange={(notes) => setSelected(s => s ? { ...s, admin_notes: notes } : null)}
        />
      )}
    </div>
  );
}

function ViolationDetailModal({
  violation,
  onClose,
  onStatusChange,
  onNotesChange,
}: {
  violation: ViolationWithUser;
  onClose: () => void;
  onStatusChange: (id: string, status: string, actionLevel?: string, reason?: string, deadline?: string) => void;
  onNotesChange: (notes: string) => void;
}) {
  const [actionModal, setActionModal] = useState<'action' | 'escalate' | null>(null);
  const [actionLevel, setActionLevel] = useState<string>('');
  const [reason, setReason] = useState('');
  const [deadline, setDeadline] = useState('');

  const name = violation.pt_user?.profile?.full_name || violation.pt_user?.profile?.email || '-';
  const isActive = ['reported', 'investigating', 'action_taken', 'escalated'].includes(violation.status);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="위반 상세" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">파트너:</span>
            <span className="ml-2 font-medium">{name}</span>
          </div>
          <div>
            <span className="text-gray-500">등록일:</span>
            <span className="ml-2">{formatDate(violation.created_at)}</span>
          </div>
          <div>
            <span className="text-gray-500">카테고리:</span>
            <span className="ml-2">
              <Badge label={VIOLATION_CATEGORY_LABELS[violation.violation_category]} colorClass={VIOLATION_CATEGORY_COLORS[violation.violation_category]} />
            </span>
          </div>
          <div>
            <span className="text-gray-500">유형:</span>
            <span className="ml-2 font-medium">{VIOLATION_TYPE_LABELS[violation.violation_type]}</span>
          </div>
          <div>
            <span className="text-gray-500">상태:</span>
            <span className="ml-2">
              <Badge label={VIOLATION_STATUS_LABELS[violation.status]} colorClass={VIOLATION_STATUS_COLORS[violation.status]} />
            </span>
          </div>
          <div>
            <span className="text-gray-500">조치:</span>
            <span className="ml-2">
              {violation.action_level ? (
                <Badge label={VIOLATION_ACTION_LABELS[violation.action_level]} colorClass={VIOLATION_ACTION_COLORS[violation.action_level]} />
              ) : '-'}
            </span>
          </div>
          {violation.contract_article && (
            <div className="col-span-2">
              <span className="text-gray-500">관련 조항:</span>
              <span className="ml-2 text-xs">{violation.contract_article}</span>
            </div>
          )}
        </div>

        {/* Title & Description */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="font-medium text-gray-900 mb-1">{violation.title}</h4>
          {violation.description && <p className="text-sm text-gray-600">{violation.description}</p>}
        </div>

        {/* Evidence */}
        {violation.evidence && (
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-1">증거/근거</h5>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{violation.evidence}</p>
          </div>
        )}

        {/* Partner Response */}
        {violation.partner_response && (
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-1">
              파트너 소명
              {violation.partner_responded_at && (
                <span className="text-xs text-gray-400 ml-2">{formatDate(violation.partner_responded_at)}</span>
              )}
            </h5>
            <p className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3 border border-blue-100">
              {violation.partner_response}
            </p>
          </div>
        )}

        {/* Correction deadline */}
        {violation.correction_deadline && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">시정 기한:</span>
            <span className="font-medium text-orange-600">{formatDate(violation.correction_deadline)}</span>
            {violation.correction_completed_at && (
              <Badge label="시정 완료" colorClass="bg-green-100 text-green-700" />
            )}
          </div>
        )}

        {/* Admin notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모</label>
          <textarea
            value={violation.admin_notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            disabled={!isActive}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837] disabled:bg-gray-50"
          />
        </div>

        {/* Action buttons */}
        {isActive && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
            {violation.status === 'reported' && (
              <button
                type="button"
                onClick={() => onStatusChange(violation.id, 'investigating')}
                className="px-3 py-1.5 text-sm text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 transition"
              >
                조사 시작
              </button>
            )}

            {['reported', 'investigating'].includes(violation.status) && (
              <>
                <button
                  type="button"
                  onClick={() => setActionModal('action')}
                  className="px-3 py-1.5 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition"
                >
                  조치 부과
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange(violation.id, 'dismissed', undefined, '무혐의 종결')}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  무혐의 종결
                </button>
              </>
            )}

            {violation.status === 'action_taken' && (
              <>
                <button
                  type="button"
                  onClick={() => onStatusChange(violation.id, 'resolved')}
                  className="px-3 py-1.5 text-sm text-white bg-green-500 rounded-lg hover:bg-green-600 transition"
                >
                  시정 완료
                </button>
                <button
                  type="button"
                  onClick={() => setActionModal('escalate')}
                  className="px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition"
                >
                  단계 격상
                </button>
              </>
            )}

            {violation.status === 'escalated' && (
              <>
                <button
                  type="button"
                  onClick={() => setActionModal('action')}
                  className="px-3 py-1.5 text-sm text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition"
                >
                  재조치
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('계약을 해지하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                      onStatusChange(violation.id, 'terminated', 'termination', '계약위반으로 인한 해지');
                    }
                  }}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
                >
                  계약 해지
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action sub-modal */}
      {actionModal && (
        <Modal
          isOpen={true}
          onClose={() => { setActionModal(null); setActionLevel(''); setReason(''); setDeadline(''); }}
          title={actionModal === 'escalate' ? '단계 격상' : '조치 부과'}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">조치 수준</label>
              <select
                value={actionLevel}
                onChange={(e) => setActionLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
              >
                <option value="">선택해주세요</option>
                {Object.entries(VIOLATION_ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {(actionLevel === 'warning' || actionLevel === 'corrective') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시정 기한</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setActionModal(null); setActionLevel(''); setReason(''); setDeadline(''); }}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!actionLevel}
                onClick={() => {
                  const newStatus = actionModal === 'escalate' ? 'escalated' : 'action_taken';
                  onStatusChange(violation.id, newStatus, actionLevel, reason, deadline || undefined);
                  setActionModal(null);
                  setActionLevel('');
                  setReason('');
                  setDeadline('');
                }}
                className="px-3 py-1.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
