'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, Plus, ArrowLeft, MessageSquare } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { BugReport, BugReportMessage, BugReportAttachment, BugReportStatus } from '@/lib/supabase/types';
import {
  BUG_REPORT_CATEGORY_LABELS,
  BUG_REPORT_CATEGORY_COLORS,
  BUG_REPORT_STATUS_LABELS,
  BUG_REPORT_STATUS_COLORS,
} from '@/lib/utils/constants';
import BugReportForm from '@/components/megaload/bug-report/BugReportForm';
import BugReportThread from '@/components/megaload/bug-report/BugReportThread';
import ImageLightbox from '@/components/megaload/bug-report/ImageLightbox';

const STATUS_TABS: { value: BugReportStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '접수됨' },
  { value: 'confirmed', label: '확인됨' },
  { value: 'in_progress', label: '수정중' },
  { value: 'resolved', label: '수정완료' },
];

export default function BugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BugReportStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [messages, setMessages] = useState<BugReportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/megaload/bug-reports?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setReports(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류문의 목록을 불러오지 못했습니다.');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const fetchMessages = useCallback(async (reportId: string) => {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/megaload/bug-reports/${reportId}/messages`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages(json.data || []);
    } catch {
      // silent
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const handleSubmitReport = async (data: {
    title: string;
    description: string;
    category: string;
    attachments: BugReportAttachment[];
    page_url: string;
    browser_info: string;
    screen_size: string;
  }) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/megaload/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShowForm(false);
      fetchReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadImage = async (file: File): Promise<BugReportAttachment | null> => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/megaload/bug-reports/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '업로드 실패');
        return null;
      }
      return { url: json.url, name: json.name, size: json.size };
    } catch {
      alert('업로드 실패');
      return null;
    }
  };

  const handleSendMessage = async (content: string, attachments: BugReportAttachment[]) => {
    if (!selectedReport) return;
    const res = await fetch(`/api/megaload/bug-reports/${selectedReport.id}/messages`, {
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <Bug className="w-6 h-6 text-[#E31837]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">오류문의</h1>
            <p className="text-sm text-gray-500">프로그램 오류를 신고하고 진행상황을 확인합니다</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          새 신고
        </button>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
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

      {/* 목록 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Card className="text-center py-12">
          <Bug className="w-10 h-10 text-red-300 mx-auto mb-3" />
          <p className="text-sm text-red-600 mb-2">목록을 불러오지 못했습니다</p>
          <p className="text-xs text-gray-500 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => fetchReports()}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            다시 시도
          </button>
        </Card>
      ) : reports.length === 0 ? (
        <Card className="text-center py-12">
          <Bug className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">등록된 오류문의가 없습니다</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-md transition !p-4"
              onClick={() => openReport(report)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge
                      label={BUG_REPORT_STATUS_LABELS[report.status] || report.status}
                      colorClass={BUG_REPORT_STATUS_COLORS[report.status]}
                    />
                    <Badge
                      label={BUG_REPORT_CATEGORY_LABELS[report.category] || report.category}
                      colorClass={BUG_REPORT_CATEGORY_COLORS[report.category]}
                    />
                  </div>
                  <h3 className="font-medium text-gray-900 truncate">{report.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{report.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400">
                      {new Date(report.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    {report.attachments.length > 0 && (
                      <span className="text-xs text-gray-400">
                        첨부 {report.attachments.length}건
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {(report.unread_count ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {report.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 새 신고 모달 */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="오류 신고" maxWidth="max-w-lg">
        <BugReportForm
          onSubmit={handleSubmitReport}
          onUploadImage={handleUploadImage}
          submitting={submitting}
        />
      </Modal>

      {/* 상세 뷰 모달 */}
      <Modal
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title="오류문의 상세"
        maxWidth="max-w-2xl"
      >
        {selectedReport && (
          <div>
            {/* 리포트 정보 */}
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
              </div>
              <h3 className="font-bold text-gray-900">{selectedReport.title}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{selectedReport.description}</p>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(selectedReport.created_at).toLocaleString('ko-KR')}
              </p>

              {/* 첨부 이미지 (원본 리포트) */}
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

            {/* 메시지 스레드 */}
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
              role="user"
            />
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
