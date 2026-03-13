'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS } from '@/lib/sellerhub/constants';
import type { Channel, CsInquiry, InquiryStatus } from '@/lib/sellerhub/types';
import { MessageSquare, Search, Send, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Clock, CheckCircle } from 'lucide-react';

const STATUS_TABS: { key: InquiryStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '미답변' },
  { key: 'replied', label: '답변완료' },
  { key: 'resolved', label: '해결' },
];

export default function CsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [inquiries, setInquiries] = useState<CsInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InquiryStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedInquiry, setSelectedInquiry] = useState<CsInquiry | null>(null);
  const [answer, setAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const PAGE_SIZE = 20;

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    let query = supabase
      .from('sh_cs_inquiries')
      .select('*', { count: 'exact' })
      .eq('sellerhub_user_id', (shUser as Record<string, unknown>).id)
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (activeTab !== 'all') query = query.eq('status', activeTab);
    if (channelFilter) query = query.eq('channel', channelFilter);
    if (search) query = query.ilike('content', `%${search}%`);

    const { data, count } = await query;
    setInquiries((data as unknown as CsInquiry[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, activeTab, channelFilter, search, page]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  const generateAiDraft = async (inquiry: CsInquiry) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/sellerhub/cs/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: inquiry.id, content: inquiry.content }),
      });
      const data = await res.json();
      if (data.draft) setAnswer(data.draft);
    } catch {
      // Handle error
    }
    setAiLoading(false);
  };

  const [sendLoading, setSendLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sendAnswer = async () => {
    if (!selectedInquiry || !answer.trim()) return;
    setSendLoading(true);
    setMessage(null);

    try {
      // 1. 채널 API를 통해 실제 답변 전송
      const res = await fetch('/api/sellerhub/cs/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          channel: selectedInquiry.channel,
          channelInquiryId: selectedInquiry.channel_inquiry_id,
          answer: answer.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        // 채널 API 전송 실패 — DB에는 저장하되 경고 표시
        setMessage({ type: 'error', text: result.error || '채널 답변 전송 실패. DB에만 저장됩니다.' });
      }

      // 2. DB 업데이트 (채널 전송 성공 여부와 관계없이)
      await supabase.from('sh_cs_inquiries').update({
        answer,
        status: 'replied',
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', selectedInquiry.id);

      if (res.ok) {
        setMessage({ type: 'success', text: '답변이 성공적으로 전송되었습니다.' });
      }

      setSelectedInquiry(null);
      setAnswer('');
      fetchInquiries();
    } catch {
      setMessage({ type: 'error', text: '답변 전송 중 오류가 발생했습니다.' });
    } finally {
      setSendLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">문의관리</h1>
          <p className="text-sm text-gray-500 mt-1">6채널 문의 통합 인박스</p>
        </div>
        <button
          onClick={fetchInquiries}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* 탭 */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="문의 내용 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>
        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value as Channel | ''); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 채널</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{CHANNEL_SHORT_LABELS[ch]}</option>
          ))}
        </select>
      </div>

      {/* 문의 목록 + 답변 패널 */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />불러오는 중...
            </div>
          ) : inquiries.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2" />문의가 없습니다
            </div>
          ) : inquiries.map((inq) => (
            <button
              key={inq.id}
              onClick={() => { setSelectedInquiry(inq); setAnswer(inq.ai_draft_answer || ''); }}
              className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-sm transition ${
                selectedInquiry?.id === inq.id ? 'border-[#E31837] ring-1 ring-[#E31837]' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${CHANNEL_COLORS[inq.channel]}`}>
                  {CHANNEL_SHORT_LABELS[inq.channel]}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                  inq.status === 'pending' ? 'bg-red-100 text-red-700' :
                  inq.status === 'replied' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {inq.status === 'pending' ? '미답변' : inq.status === 'replied' ? '답변완료' : '해결'}
                </span>
                {inq.buyer_name && <span className="text-xs text-gray-500">{inq.buyer_name}</span>}
              </div>
              {inq.title && <p className="text-sm font-medium text-gray-900 mb-1">{inq.title}</p>}
              <p className="text-sm text-gray-600 line-clamp-2">{inq.content}</p>
              <p className="text-xs text-gray-400 mt-1">
                {inq.inquired_at ? new Date(inq.inquired_at).toLocaleString('ko-KR') : new Date(inq.created_at).toLocaleString('ko-KR')}
              </p>
            </button>
          ))}
        </div>

        {/* 답변 패널 */}
        {selectedInquiry && (
          <div className="w-96 bg-white rounded-xl border border-gray-200 p-4 sticky top-4 self-start">
            <h3 className="font-semibold text-gray-900 mb-3">답변 작성</h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <p className="text-xs text-gray-500 mb-1">문의 내용</p>
              <p className="text-sm text-gray-700">{selectedInquiry.content}</p>
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
              placeholder="답변을 입력하세요..."
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => generateAiDraft(selectedInquiry)}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {aiLoading ? '생성중...' : 'AI 초안'}
              </button>
              <button
                onClick={sendAnswer}
                disabled={!answer.trim() || sendLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition ml-auto disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sendLoading ? '전송중...' : '답변 전송'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{total}건</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
