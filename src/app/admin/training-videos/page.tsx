'use client';

import { useState, useEffect } from 'react';
import { Tv, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import type { TrainingVideo } from '@/lib/supabase/types';

const CATEGORY_OPTIONS = [
  { value: 'general', label: '일반' },
  { value: 'product-registration', label: '상품 등록' },
  { value: 'review', label: '리뷰/이미지' },
  { value: 'ad', label: '광고' },
  { value: 'settlement', label: '정산' },
  { value: 'cs', label: 'CS' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

interface FormState {
  title: string;
  description: string;
  youtube_input: string;
  category: string;
  sort_order: number;
  is_published: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  youtube_input: '',
  category: 'general',
  sort_order: 0,
  is_published: true,
};

export default function AdminTrainingVideosPage() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TrainingVideo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => { fetchVideos(); }, []);

  async function fetchVideos() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/training-videos');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setVideos(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(video: TrainingVideo) {
    setEditing(video);
    setForm({
      title: video.title,
      description: video.description ?? '',
      youtube_input: video.youtube_id,
      category: video.category,
      sort_order: video.sort_order,
      is_published: video.is_published,
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.title || !form.youtube_input) return;
    try {
      setSubmitting(true);
      const method = editing ? 'PATCH' : 'POST';
      const body = editing ? { id: editing.id, ...form } : form;
      const res = await fetch('/api/admin/training-videos', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setShowModal(false);
      fetchVideos();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/training-videos?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '삭제 실패');
      }
      fetchVideos();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Tv className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">교육 영상 관리</h1>
            <p className="text-sm text-gray-500">YouTube에 업로드한 영상을 회원에게 노출합니다</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          새 영상
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">썸네일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">제목</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">순서</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">발행</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {videos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    등록된 영상이 없습니다. YouTube 링크로 추가해주세요.
                  </td>
                </tr>
              ) : (
                videos.map((video) => (
                  <tr key={video.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {video.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-20 h-12 object-cover rounded"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{video.title}</span>
                        <a
                          href={`https://youtu.be/${video.youtube_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-blue-600"
                          aria-label="YouTube 열기"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      {video.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{video.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {CATEGORY_LABEL[video.category] || video.category}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{video.sort_order}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${video.is_published ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(video)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(video.id)}
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

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? '영상 수정' : '새 영상 등록'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">YouTube URL 또는 ID</label>
            <input
              type="text"
              value={form.youtube_input}
              onChange={(e) => setForm((f) => ({ ...f, youtube_input: e.target.value }))}
              placeholder="https://youtu.be/xxxxxxxxxxx 또는 11자리 ID"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            />
            <p className="text-xs text-gray-400 mt-1">youtu.be, youtube.com/watch?v=, embed, shorts 형식 모두 지원</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="영상 제목"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명 (선택)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="영상에 대한 간단한 설명"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">정렬 순서 (낮을수록 상단)</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              className="rounded border-gray-300 text-[#E31837] focus:ring-[#E31837]"
            />
            <span className="text-sm text-gray-700">즉시 발행 (회원에게 노출)</span>
          </label>

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
              disabled={submitting || !form.title || !form.youtube_input}
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
