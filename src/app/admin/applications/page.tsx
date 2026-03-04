'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils/format';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
} from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { FileText, Search, RefreshCw, Eye, MessageSquare } from 'lucide-react';
import type { Application } from '@/lib/supabase/types';

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'new', label: '신규' },
  { value: 'contacted', label: '연락완료' },
  { value: 'consulting', label: '상담중' },
  { value: 'converted', label: '전환' },
  { value: 'rejected', label: '거절' },
];

const STATUS_TRANSITIONS = ['new', 'contacted', 'consulting', 'converted', 'rejected'];

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModal, setDetailModal] = useState<Application | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: string; note: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setApplications((data as Application[]) || []);
    setLoading(false);
  }, [statusFilter, supabase]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', id);
    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: newStatus as Application['status'] } : app))
    );
    if (detailModal?.id === id) {
      setDetailModal((prev) => prev ? { ...prev, status: newStatus as Application['status'] } : null);
    }
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    await supabase
      .from('applications')
      .update({ admin_note: noteText })
      .eq('id', noteModal.id);
    setApplications((prev) =>
      prev.map((app) => (app.id === noteModal.id ? { ...app, admin_note: noteText } : app))
    );
    setNoteModal(null);
  };

  const filtered = applications.filter((app) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.phone.includes(q) ||
      (app.email && app.email.toLowerCase().includes(q))
    );
  });

  const newCount = applications.filter((a) => a.status === 'new').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">신청 관리</h1>
          {newCount > 0 && (
            <span className="px-2.5 py-1 bg-[#E31837] text-white text-xs font-bold rounded-full">
              {newCount}건 신규
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fetchApplications}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 연락처, 이메일 검색..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  statusFilter === opt.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">신청 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">이름</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">연락처</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden md:table-cell">관심 카테고리</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">상태</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden sm:table-cell">신청일</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
                  <tr key={app.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-medium text-gray-900">{app.name}</td>
                    <td className="py-3 px-4 text-gray-600">{app.phone}</td>
                    <td className="py-3 px-4 text-gray-600 hidden md:table-cell">{app.category_interest || '-'}</td>
                    <td className="py-3 px-4">
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${APPLICATION_STATUS_COLORS[app.status] || ''}`}
                      >
                        {STATUS_TRANSITIONS.map((s) => (
                          <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">{formatDate(app.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailModal(app)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                          title="상세보기"
                        >
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setNoteModal({ id: app.id, note: app.admin_note || '' }); setNoteText(app.admin_note || ''); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                          title="메모"
                        >
                          <MessageSquare className={`w-4 h-4 ${app.admin_note ? 'text-[#E31837]' : 'text-gray-400'}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title="신청 상세" maxWidth="max-w-xl">
        {detailModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">이름</div>
                <div className="font-medium">{detailModal.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">연락처</div>
                <div className="font-medium">{detailModal.phone}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">이메일</div>
                <div className="font-medium">{detailModal.email || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">상태</div>
                <Badge label={APPLICATION_STATUS_LABELS[detailModal.status]} colorClass={APPLICATION_STATUS_COLORS[detailModal.status]} />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">관심 카테고리</div>
                <div className="font-medium">{detailModal.category_interest || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">현재 상황</div>
                <div className="font-medium">{detailModal.current_situation || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">쿠팡 판매 경험</div>
                <div className="font-medium">{detailModal.coupang_experience || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">신청일</div>
                <div className="font-medium">{formatDate(detailModal.created_at)}</div>
              </div>
            </div>
            {detailModal.message && (
              <div>
                <div className="text-xs text-gray-500 mb-1">추가 메시지</div>
                <div className="p-3 bg-gray-50 rounded-lg text-sm">{detailModal.message}</div>
              </div>
            )}
            {detailModal.admin_note && (
              <div>
                <div className="text-xs text-gray-500 mb-1">관리자 메모</div>
                <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-sm">{detailModal.admin_note}</div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <select
                value={detailModal.status}
                onChange={(e) => handleStatusChange(detailModal.id, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {STATUS_TRANSITIONS.map((s) => (
                  <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Note Modal */}
      <Modal isOpen={!!noteModal} onClose={() => setNoteModal(null)} title="관리자 메모">
        <div className="space-y-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none resize-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            placeholder="메모를 입력하세요..."
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setNoteModal(null)}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveNote}
              className="px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
            >
              저장
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
