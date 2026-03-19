'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Plus, Send, ArrowLeft, Clock, CheckCircle, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';

type TicketStatus = 'pending' | 'in_progress' | 'resolved';
type TicketCategory = 'settlement' | 'contract' | 'coupang_api' | 'tax_invoice' | 'system_error' | 'other';

interface Message {
  id: string;
  sender: 'user' | 'admin';
  content: string;
  created_at: string;
}

interface Ticket {
  id: string;
  category: TicketCategory;
  title: string;
  status: TicketStatus;
  messages: Message[];
  created_at: string;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '대기중', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: '처리중', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  resolved: { label: '완료', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; color: string }> = {
  settlement: { label: '정산', color: 'bg-emerald-100 text-emerald-700' },
  contract: { label: '계약', color: 'bg-indigo-100 text-indigo-700' },
  coupang_api: { label: '쿠팡 API', color: 'bg-orange-100 text-orange-700' },
  tax_invoice: { label: '세금계산서', color: 'bg-cyan-100 text-cyan-700' },
  system_error: { label: '시스템 오류', color: 'bg-red-100 text-red-700' },
  other: { label: '기타', color: 'bg-gray-100 text-gray-700' },
};

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'settlement', label: '정산' },
  { value: 'contract', label: '계약' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'system_error', label: '시스템 오류' },
  { value: 'other', label: '기타' },
];

const STATUS_TABS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'in_progress', label: '처리중' },
  { value: 'resolved', label: '완료' },
];

const STORAGE_KEY = 'megaload_support_tickets';

function loadTickets(): Ticket[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveTickets(tickets: Ticket[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    category: 'other' as TicketCategory,
    title: '',
    content: '',
  });

  useEffect(() => {
    setTickets(loadTickets());
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [selectedTicket]);

  function handleSubmit() {
    if (!form.title || !form.content) return;

    const newTicket: Ticket = {
      id: Date.now().toString(),
      category: form.category,
      title: form.title,
      status: 'pending',
      messages: [
        {
          id: Date.now().toString() + '_msg',
          sender: 'user',
          content: form.content,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
    };

    // 자동 응답 추가
    setTimeout(() => {
      const autoReply: Message = {
        id: Date.now().toString() + '_auto',
        sender: 'admin',
        content: `안녕하세요, 메가로드 고객센터입니다.\n\n문의해 주셔서 감사합니다. 접수된 문의는 담당자 확인 후 순차적으로 답변드리겠습니다.\n\n• 평균 응답 시간: 영업일 기준 1~2일\n• 긴급 문의: 카카오톡 채널 "메가로드" 이용\n\n감사합니다.`,
        created_at: new Date(Date.now() + 1000).toISOString(),
      };
      setTickets(prev => {
        const updated = prev.map(t =>
          t.id === newTicket.id
            ? { ...t, messages: [...t.messages, autoReply], status: 'in_progress' as TicketStatus }
            : t
        );
        saveTickets(updated);
        if (selectedTicket?.id === newTicket.id) {
          setSelectedTicket(updated.find(t => t.id === newTicket.id) || null);
        }
        return updated;
      });
    }, 2000);

    const updated = [newTicket, ...tickets];
    setTickets(updated);
    saveTickets(updated);
    setShowNewModal(false);
    setForm({ category: 'other', title: '', content: '' });
  }

  function handleSendMessage() {
    if (!newMessage.trim() || !selectedTicket) return;

    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    const updatedTickets = tickets.map(t =>
      t.id === selectedTicket.id
        ? { ...t, messages: [...t.messages, msg] }
        : t
    );

    setTickets(updatedTickets);
    saveTickets(updatedTickets);
    setSelectedTicket(updatedTickets.find(t => t.id === selectedTicket.id) || null);
    setNewMessage('');

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  const filteredTickets = statusFilter === 'all'
    ? tickets
    : tickets.filter(t => t.status === statusFilter);

  // 대화 스레드 뷰
  if (selectedTicket) {
    const statusCfg = STATUS_CONFIG[selectedTicket.status];
    const catCfg = CATEGORY_CONFIG[selectedTicket.category];

    return (
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => setSelectedTicket(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로 돌아가기
        </button>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.color}`}>
                  {catCfg.label}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">{selectedTicket.title}</h2>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(selectedTicket.created_at).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>

          {/* 메시지 스레드 */}
          <div className="border-t border-gray-100 pt-4">
            <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4 pr-1">
              {selectedTicket.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      msg.sender === 'user'
                        ? 'bg-[#E31837] text-white rounded-tr-md'
                        : 'bg-gray-100 text-gray-800 rounded-tl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${
                      msg.sender === 'user' ? 'text-white/60' : 'text-gray-400'
                    }`}>
                      {msg.sender === 'admin' ? '관리자' : '나'} · {new Date(msg.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 메시지 입력 */}
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
                disabled={!newMessage.trim()}
                className="p-2.5 bg-[#E31837] text-white rounded-full hover:bg-[#c81530] disabled:opacity-50 transition"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
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

      {tickets.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">문의 내역이 없습니다</p>
            <p className="text-sm text-gray-400">궁금한 점이 있으면 &apos;새 문의&apos; 버튼을 눌러주세요</p>
          </div>
        </Card>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">해당 상태의 문의가 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => {
            const statusCfg = STATUS_CONFIG[ticket.status];
            const catCfg = CATEGORY_CONFIG[ticket.category];
            const lastMsg = ticket.messages[ticket.messages.length - 1];

            return (
              <Card key={ticket.id} className="cursor-pointer hover:border-gray-300 transition">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.color}`}>
                      {catCfg.label}
                    </span>
                    {ticket.messages.some(m => m.sender === 'admin') && (
                      <span className="text-xs text-blue-600 font-medium">답변 있음</span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900">{ticket.title}</h3>
                  {lastMsg && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {lastMsg.sender === 'admin' ? '관리자: ' : ''}{lastMsg.content.slice(0, 50)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(ticket.created_at).toLocaleDateString('ko-KR')} · 메시지 {ticket.messages.length}개
                  </p>
                </button>
              </Card>
            );
          })}
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
              disabled={!form.title || !form.content}
              className="flex-1 px-4 py-2.5 bg-[#E31837] text-white rounded-lg text-sm font-medium hover:bg-[#c81530] disabled:opacity-50 transition"
            >
              문의 등록
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
