'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, MessageSquare } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import StatCard from '@/components/ui/StatCard';
import type { BugReport, BugReportMessage, BugReportAttachment, BugReportStatus, BugReportPriority } from '@/lib/supabase/types';
import {
  BUG_REPORT_CATEGORY_LABELS,
  BUG_REPORT_CATEGORY_COLORS,
  BUG_REPORT_STATUS_LABELS,
  BUG_REPORT_STATUS_COLORS,
  BUG_REPORT_PRIORITY_LABELS,
  BUG_REPORT_PRIORITY_COLORS,
} from '@/lib/utils/constants';
import BugReportThread from '@/components/megaload/bug-report/BugReportThread';
import ImageLightbox from '@/components/megaload/bug-report/ImageLightbox';
import { uploadBugReportImage } from '@/lib/megaload/services/bug-report-uploader';

const STATUS_FILTER: { value: BugReportStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '접수됨' },
  { value: 'confirmed', label: '확인됨' },
  { value: 'in_progress', label: '수정중' },
  { value: 'resolved', label: '수정완료' },
  { value: 'closed', label: '종료' },
];

export default function AdminMegaloadBugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<BugReportStatus | 'all'>('all');
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [messages, setMessages] = useState<BugReportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/megaload-bug-reports?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status} ${res.statusText || ''}`);
      }
      setReports(json.data || []);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      setError(
        isTimeout
          ? '서버 응답 지연 (15초 초과) — Supabase 쿼터 초과 또는 함수 타임아웃 가능성. Vercel/Supabase 상태를 확인하세요.'
          : err instanceof Error ? err.message : '오류 발생',
      );
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const fetchMessages = useCallback(async (reportId: string) => {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/admin/megaload-bug-reports/${reportId}/messages`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages(json.data || []);
    } catch {
      // silent
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const handleStatusChange = async (reportId: string, status: BugReportStatus) => {
    try {
      const res = await fetch('/api/admin/megaload-bug-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, status }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      if (selectedReport && selectedReport.id === reportId) {
        setSelectedReport({ ...selectedReport, status });
      }
      fetchReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 실패');
    }
  };

  const handlePriorityChange = async (reportId: string, priority: BugReportPriority) => {
    try {
      const res = await fetch('/api/admin/megaload-bug-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, priority }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      if (selectedReport && selectedReport.id === reportId) {
        setSelectedReport({ ...selectedReport, priority });
      }
      fetchReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : '우선도 변경 실패');
    }
  };

  const handleUploadImage = async (file: File): Promise<BugReportAttachment | null> => {
    // 직접 Supabase Storage 업로드 (Vercel 함수 경유 X). 실패 시 API 폴백.
    try {
      return await uploadBugReportImage(file);
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
      return null;
    }
  };

  const handleSendMessage = async (content: string, attachments: BugReportAttachment[]) => {
    if (!selectedReport) return;
    const res = await fetch(`/api/admin/megaload-bug-reports/${selectedReport.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, attachments }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || '전송 실패');
      return;
    }
    fetchMessages(selectedReport.id);
    fetchReports();
  };

  const openReport = (report: BugReport) => {
    setSelectedReport(report);
    fetchMessages(report.id);
  };

  const getUserName = (report: BugReport) => {
    const mu = report.megaload_user as BugReport['megaload_user'];
    return mu?.profile?.full_name || '-';
  };

  // 통계
  const stats = {
    pending: reports.filter(r => r.status === 'pending').length,
    confirmed: reports.filter(r => r.status === 'confirmed').length,
    in_progress: reports.filter(r => r.status === 'in_progress').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    total: reports.length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-100 rounded-lg">
          <Bug className="w-6 h-6 text-[#E31837]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">메가로드 오류문의 관리</h1>
          <p className="text-sm text-gray-500">사용자 오류 신고를 관리하고 답변합니다</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard title="접수됨" value={String(stats.pending)} subtitle={stats.pending > 0 ? '확인 필요' : ''} trend={stats.pending > 0 ? 'up' : undefined} />
        <StatCard title="확인됨" value={String(stats.confirmed)} />
        <StatCard title="수정중" value={String(stats.in_progress)} />
        <StatCard title="수정완료" value={String(stats.resolved)} />
        <StatCard title="전체" value={String(stats.total)} />
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_FILTER.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              statusFilter === tab.value
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">사용자</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">제목</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">상태</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">우선도</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">날짜</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">미읽음</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    오류문의 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                reports.map(report => (
                  <tr
                    key={report.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openReport(report)}
                  >
                    <td className="px-4 py-3 text-gray-900">
                      {getUserName(report)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={BUG_REPORT_CATEGORY_LABELS[report.category] || report.category}
                        colorClass={BUG_REPORT_CATEGORY_COLORS[report.category]}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                      {report.title}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        label={BUG_REPORT_STATUS_LABELS[report.status] || report.status}
                        colorClass={BUG_REPORT_STATUS_COLORS[report.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        label={BUG_REPORT_PRIORITY_LABELS[report.priority] || report.priority}
                        colorClass={BUG_REPORT_PRIORITY_COLORS[report.priority]}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(report.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(report.unread_count ?? 0) > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                          {report.unread_count}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* 상세 모달 */}
      <Modal
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title="오류문의 상세"
        maxWidth="max-w-2xl"
      >
        {selectedReport && (
          <div>
            {/* 헤더 정보 */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  label={BUG_REPORT_STATUS_LABELS[selectedReport.status] || selectedReport.status}
                  colorClass={BUG_REPORT_STATUS_COLORS[selectedReport.status]}
                />
                <Badge
                  label={BUG_REPORT_CATEGORY_LABELS[selectedReport.category] || selectedReport.category}
                  colorClass={BUG_REPORT_CATEGORY_COLORS[selectedReport.category]}
                />
                <Badge
                  label={BUG_REPORT_PRIORITY_LABELS[selectedReport.priority] || selectedReport.priority}
                  colorClass={BUG_REPORT_PRIORITY_COLORS[selectedReport.priority]}
                />
              </div>
              <h3 className="font-bold text-gray-900">{selectedReport.title}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{selectedReport.description}</p>
              <p className="text-xs text-gray-400 mt-2">
                {getUserName(selectedReport)} · {new Date(selectedReport.created_at).toLocaleString('ko-KR')}
              </p>

              {/* 컨텍스트 정보 */}
              {(selectedReport.page_url || selectedReport.browser_info || selectedReport.screen_size) && (
                <div className="mt-3 p-2 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-0.5">
                  {selectedReport.page_url && <p>페이지: {selectedReport.page_url}</p>}
                  {selectedReport.screen_size && <p>화면: {selectedReport.screen_size}</p>}
                  {selectedReport.browser_info && <p className="truncate">브라우저: {selectedReport.browser_info}</p>}
                </div>
              )}

              {/* 첨부 이미지 */}
              {selectedReport.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedReport.attachments.map((att, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={idx}
                      src={att.url}
                      alt={att.name}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition"
                      onClick={() => setLightbox({
                        images: selectedReport.attachments.map(a => a.url),
                        index: idx,
                      })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 상태 변경 버튼 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(['pending', 'confirmed', 'in_progress', 'resolved', 'closed'] as BugReportStatus[])
                .filter(s => s !== selectedReport.status)
                .map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(selectedReport.id, s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${BUG_REPORT_STATUS_COLORS[s]} hover:opacity-80`}
                  >
                    {BUG_REPORT_STATUS_LABELS[s]}
                  </button>
                ))}
            </div>

            {/* 우선도 변경 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500">우선도:</span>
              {(['low', 'normal', 'high', 'critical'] as BugReportPriority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePriorityChange(selectedReport.id, p)}
                  className={`px-2.5 py-1 text-xs rounded-full transition ${
                    selectedReport.priority === p
                      ? BUG_REPORT_PRIORITY_COLORS[p] + ' ring-2 ring-offset-1 ring-gray-300'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {BUG_REPORT_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>

            {/* 메시지 스레드 */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">대화</span>
              </div>
              <BugReportThread
                messages={messages}
                loading={messagesLoading}
                disabled={selectedReport.status === 'closed'}
                onSendMessage={handleSendMessage}
                onUploadImage={handleUploadImage}
                role="admin"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 라이트박스 */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={index => setLightbox(prev => prev ? { ...prev, index } : null)}
        />
      )}
    </div>
  );
}
