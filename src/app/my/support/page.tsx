'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Plus, Send, ArrowLeft } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { SupportTicket, TicketMessage, TicketCategory } from '@/lib/supabase/types';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_COLORS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
} from '@/lib/utils/constants';

const STATUS_TABS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'in_progress', label: '처리중' },
  { value: 'resolved', label: '완료' },
];

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'settlement', label: '정산' },
  { value: 'contract', label: '계약' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'system_error', label: '시스템 오류' },
  { value: 'other', label: '기타' },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 새 문의 폼
  const [form, setForm] = useState({
    category: 'other' as TicketCategory,
    title: '',
    content: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  async function fetchTickets() {
    try {
      setLoading(true);
      const res = await fetch('/api/support');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setTickets(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages(ticketId: string) {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/support/${ticketId}/messages`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setMessages(json.data || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setMessagesLoading(false);
    }
  }

  async function handleSubmit() {
    if (!form.title || !form.content) return;
    try {
      setSubmitting(true);
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '등록 실패');
      setShowNewModal(false);
      setForm({ category: 'other', title: '', content: '' });
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedTicket) return;
    try {
      setSending(true);
      const res = await fetch(`/api/support/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '전송 실패');
      setNewMessage('');
      fetchMessages(selectedTicket.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSending(false);
    }
  }

  function openTicket(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    fetchMessages(ticket.id);
  }

  const filteredTickets = statusFilter === 'all'
    ? tickets
    : tickets.filter(t => t.status === statusFilter);

  // 대화 스레드 뷰
  if (selectedTicket) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => { setSelectedTicket(null); setMessages([]); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로 돌아가기
        </button>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  label={TICKET_CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
                  colorClass={TICKET_CATEGORY_COLORS[selectedTicket.category]}
                />
                <Badge
                  label={TICKET_STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
                  colorClass={TICKET_STATUS_COLORS[selectedTicket.status]}
                />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{selectedTicket.title}</h2>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(selectedTicket.created_at).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>

          {/* 메시지 스레드 */}
          <div className="border-t border-gray-100 pt-4">
            {messagesLoading ? (
              <div className="space-y-3 py-4">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4 pr-1">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        msg.sender_role === 'user'
                          ? 'bg-[#E31837] text-white rounded-tr-md'
                          : 'bg-gray-100 text-gray-800 rounded-tl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${
                        msg.sender_role === 'user' ? 'text-white/60' : 'text-gray-400'
                      }`}>
                        {msg.sender_role === 'admin' ? '관리자' : '나'} · {new Date(msg.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* 메시지 입력 */}
            {selectedTicket.status !== 'closed' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder="메시지를 입력하세요..."
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="p-2.5 bg-[#E31837] text-white rounded-full hover:bg-[#c81530] disabled:opacity-50 transition"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            )}

            {selectedTicket.status === 'closed' && (
              <p className="text-center text-sm text-gray-400 py-2">종료된 문의입니다.</p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <MessageCircle className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">1:1 문의</h1>
            <p className="text-sm text-gray-500">궁금한 점이나 문제가 있으면 문의해주세요</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          새 문의
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 상태 필터 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">문의 내역이 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => (
            <Card key={ticket.id} className="cursor-pointer hover:border-gray-300 transition">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => openTicket(ticket)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    label={TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                    colorClass={TICKET_STATUS_COLORS[ticket.status]}
                  />
                  <Badge
                    label={TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
                    colorClass={TICKET_CATEGORY_COLORS[ticket.category]}
                  />
                </div>
                <h3 className="font-medium text-gray-900">{ticket.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(ticket.created_at).toLocaleDateString('ko-KR')}
                </p>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* 새 문의 모달 */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="새 문의 작성">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as TicketCategory }))}
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
              placeholder="문의 제목을 입력하세요"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="문의 내용을 상세히 작성해주세요"
              rows={5}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
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
              {submitting ? '등록 중...' : '문의 등록'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
