'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import StatCard from '@/components/ui/StatCard';
import type { SupportTicket, TicketMessage, TicketStatus } from '@/lib/supabase/types';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_COLORS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '@/lib/utils/constants';

const STATUS_FILTER = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'in_progress', label: '처리중' },
  { value: 'resolved', label: '완료' },
  { value: 'closed', label: '종료' },
];

interface TicketWithUser extends Omit<SupportTicket, 'pt_user'> {
  pt_user?: {
    id: string;
    profile_id: string;
    profile?: { id: string; full_name: string; email: string } | null;
  };
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketWithUser | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  async function fetchTickets() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/support?${params}`);
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
      const res = await fetch(`/api/admin/support/${ticketId}/messages`);
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

  async function handleReply() {
    if (!replyContent.trim() || !selectedTicket) return;
    try {
      setSending(true);
      const res = await fetch(`/api/admin/support/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '답변 실패');
      }
      setReplyContent('');
      fetchMessages(selectedTicket.id);
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(ticketId: string, status: TicketStatus) {
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticketId, status }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '상태 변경 실패');
      }
      // 현재 모달의 티켓 상태 업데이트
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류 발생');
    }
  }

  function openTicket(ticket: TicketWithUser) {
    setSelectedTicket(ticket);
    setReplyContent('');
    fetchMessages(ticket.id);
  }

  // 통계
  const stats = {
    pending: tickets.filter(t => t.status === 'pending').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <MessageCircle className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">문의 관리</h1>
          <p className="text-sm text-gray-500">파트너 1:1 문의를 관리하고 답변합니다</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="대기중" value={stats.pending} subtitle={stats.pending > 0 ? '처리 필요' : ''} trend={stats.pending > 0 ? 'up' : undefined} />
        <StatCard title="처리중" value={stats.in_progress} />
        <StatCard title="완료" value={stats.resolved} />
        <StatCard title="전체" value={stats.total} />
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
                <th className="text-left px-4 py-3 font-medium text-gray-500">유저</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">제목</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">상태</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">우선도</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">날짜</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    문의 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                tickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openTicket(ticket)}
                  >
                    <td className="px-4 py-3 text-gray-900">
                      {ticket.pt_user?.profile?.full_name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
                        colorClass={TICKET_CATEGORY_COLORS[ticket.category]}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                      {ticket.title}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        label={TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                        colorClass={TICKET_STATUS_COLORS[ticket.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        label={TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
                        colorClass={TICKET_PRIORITY_COLORS[ticket.priority]}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(ticket.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* 문의 상세 모달 */}
      <Modal
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title="문의 상세"
        maxWidth="max-w-2xl"
      >
        {selectedTicket && (
          <div>
            {/* 헤더 정보 */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  label={TICKET_STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
                  colorClass={TICKET_STATUS_COLORS[selectedTicket.status]}
                />
                <Badge
                  label={TICKET_CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
                  colorClass={TICKET_CATEGORY_COLORS[selectedTicket.category]}
                />
                <Badge
                  label={TICKET_PRIORITY_LABELS[selectedTicket.priority] || selectedTicket.priority}
                  colorClass={TICKET_PRIORITY_COLORS[selectedTicket.priority]}
                />
              </div>
              <h3 className="font-bold text-gray-900">{selectedTicket.title}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {selectedTicket.pt_user?.profile?.full_name || '-'} · {new Date(selectedTicket.created_at).toLocaleString('ko-KR')}
              </p>
            </div>

            {/* 상태 변경 버튼 */}
            <div className="flex gap-2 mb-4">
              {selectedTicket.status !== 'in_progress' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedTicket.id, 'in_progress')}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition"
                >
                  처리중으로 변경
                </button>
              )}
              {selectedTicket.status !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                  className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
                >
                  완료 처리
                </button>
              )}
              {selectedTicket.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedTicket.id, 'closed')}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                >
                  종료
                </button>
              )}
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
                <div className="space-y-3 max-h-[350px] overflow-y-auto mb-4 pr-1">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                          msg.sender_role === 'admin'
                            ? 'bg-[#E31837] text-white rounded-tr-md'
                            : 'bg-gray-100 text-gray-800 rounded-tl-md'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${
                          msg.sender_role === 'admin' ? 'text-white/60' : 'text-gray-400'
                        }`}>
                          {msg.sender_role === 'admin' ? '관리자' : '파트너'} · {new Date(msg.created_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* 답변 입력 */}
              {selectedTicket.status !== 'closed' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                    placeholder="답변을 입력하세요..."
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
                  />
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={sending || !replyContent.trim()}
                    className="p-2.5 bg-[#E31837] text-white rounded-full hover:bg-[#c81530] disabled:opacity-50 transition"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
