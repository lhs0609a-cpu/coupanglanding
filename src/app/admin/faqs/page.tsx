'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { Faq, FaqCategory } from '@/lib/supabase/types';
import { FAQ_CATEGORY_LABELS, FAQ_CATEGORY_COLORS } from '@/lib/utils/constants';

const CATEGORY_OPTIONS: { value: FaqCategory; label: string }[] = [
  { value: 'signup', label: '가입/시작' },
  { value: 'settlement', label: '정산' },
  { value: 'commission', label: '수수료' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'penalty', label: '페널티' },
  { value: 'other', label: '기타' },
];

export default function AdminFaqsPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    category: 'other' as FaqCategory,
    question: '',
    answer: '',
    sort_order: 0,
    is_published: true,
  });

  useEffect(() => {
    fetchFaqs();
  }, []);

  async function fetchFaqs() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/faqs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setFaqs(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ category: 'other', question: '', answer: '', sort_order: 0, is_published: true });
    setShowModal(true);
  }

  function openEdit(faq: Faq) {
    setEditing(faq);
    setForm({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order,
      is_published: faq.is_published,
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.question || !form.answer) return;
    try {
      setSubmitting(true);
      if (editing) {
        const res = await fetch('/api/admin/faqs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || '수정 실패');
        }
      } else {
        const res = await fetch('/api/admin/faqs', {
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
      fetchFaqs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/faqs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '삭제 실패');
      }
      fetchFaqs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <HelpCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FAQ 관리</h1>
            <p className="text-sm text-gray-500">자주 묻는 질문을 관리합니다</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          새 FAQ
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
                <th className="text-left px-4 py-3 font-medium text-gray-500">질문</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">순서</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">발행</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">조회수</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {faqs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    등록된 FAQ가 없습니다.
                  </td>
                </tr>
              ) : (
                faqs.map(faq => (
                  <tr key={faq.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Badge
                        label={FAQ_CATEGORY_LABELS[faq.category] || faq.category}
                        colorClass={FAQ_CATEGORY_COLORS[faq.category]}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[300px] truncate">
                      {faq.question}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{faq.sort_order}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${faq.is_published ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{faq.view_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(faq)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(faq.id)}
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

      {/* FAQ 작성/수정 모달 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'FAQ 수정' : '새 FAQ 작성'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as FaqCategory }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">질문</label>
            <input
              type="text"
              value={form.question}
              onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              placeholder="자주 묻는 질문"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">답변</label>
            <textarea
              value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
              placeholder="답변 내용을 작성하세요"
              rows={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">정렬 순서</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
              />
            </div>
            <div className="flex items-end pb-1">
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
              disabled={submitting || !form.question || !form.answer}
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
