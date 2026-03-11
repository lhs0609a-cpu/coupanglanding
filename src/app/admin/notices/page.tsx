'use client';

import { useState, useEffect } from 'react';
import { Bell, Plus, Pin, Pencil, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { Notice, NoticeCategory } from '@/lib/supabase/types';
import { NOTICE_CATEGORY_LABELS, NOTICE_CATEGORY_COLORS } from '@/lib/utils/constants';

const CATEGORY_OPTIONS: { value: NoticeCategory; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'policy', label: '정책' },
  { value: 'promotion', label: '프로모션' },
  { value: 'education', label: '교육' },
  { value: 'emergency', label: '긴급' },
];

export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'system' as NoticeCategory,
    is_pinned: false,
    is_published: true,
  });

  useEffect(() => {
    fetchNotices();
  }, []);

  async function fetchNotices() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/notices');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setNotices(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', content: '', category: 'system', is_pinned: false, is_published: true });
    setShowModal(true);
  }

  function openEdit(notice: Notice) {
    setEditing(notice);
    setForm({
      title: notice.title,
      content: notice.content,
      category: notice.category,
      is_pinned: notice.is_pinned,
      is_published: notice.is_published,
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.title || !form.content) return;
    try {
      setSubmitting(true);
      if (editing) {
        const res = await fetch('/api/admin/notices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || '수정 실패');
        }
      } else {
        const res = await fetch('/api/admin/notices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || '등록 실패');
        }
      }
      setShowModal(false);
      fetchNotices();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/notices?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '삭제 실패');
      }
      fetchNotices();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Bell className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">공지 관리</h1>
            <p className="text-sm text-gray-500">파트너에게 전달할 공지사항을 관리합니다</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          새 공지
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

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
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">제목</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">고정</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">발행</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">작성일</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    등록된 공지가 없습니다.
                  </td>
                </tr>
              ) : (
                notices.map(notice => (
                  <tr key={notice.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Badge
                        label={NOTICE_CATEGORY_LABELS[notice.category] || notice.category}
                        colorClass={NOTICE_CATEGORY_COLORS[notice.category]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{notice.title}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {notice.is_pinned && <Pin className="w-4 h-4 text-blue-500 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${notice.is_published ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(notice)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(notice.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* 공지 작성/수정 모달 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '공지 수정' : '새 공지 작성'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as NoticeCategory }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="공지 제목"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="공지 내용을 작성하세요"
              rows={8}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] resize-none"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))}
                className="rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
              />
              <span className="text-sm text-gray-700">상단 고정</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))}
                className="rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
              />
              <span className="text-sm text-gray-700">즉시 발행</span>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.title || !form.content}
              className="flex-1 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] disabled:opacity-50 transition"
            >
              {submitting ? '처리 중...' : editing ? '수정' : '등록'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
