'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS } from '@/lib/megaload/constants';
import type { Channel, CsInquiry, CsTemplate, CsCategory, CsKeywordRule, InquiryStatus, CsTemplateContext, CsUrgency } from '@/lib/megaload/types';
import { renderTemplate, recommendTemplates, classifyInquiry, relativeTime } from '@/lib/megaload/services/cs-template-engine';
import {
  MessageSquare, Search, Send, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, Clock, Download, Tag, FileText,
  Eye, Keyboard, X, Package, Truck
} from 'lucide-react';

// ─── 상수 ───

const STATUS_TABS: { key: InquiryStatus | 'all'; label: string; count?: boolean }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '미답변', count: true },
  { key: 'replied', label: '답변완료' },
  { key: 'resolved', label: '해결' },
];

const URGENCY_CONFIG: Record<CsUrgency, { label: string; color: string; dot: string }> = {
  urgent: { label: '긴급', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  high: { label: '높음', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  normal: { label: '보통', color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  low: { label: '낮음', color: 'bg-blue-100 text-blue-600 border-blue-200', dot: 'bg-blue-400' },
};

const PAGE_SIZE = 20;

// ─── 메인 컴포넌트 ───

export default function CsPage() {
  const supabase = useMemo(() => createClient(), []);

  // 상태
  const [inquiries, setInquiries] = useState<CsInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<InquiryStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const [selectedInquiry, setSelectedInquiry] = useState<CsInquiry | null>(null);
  const [answer, setAnswer] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 템플릿 & 카테고리
  const [templates, setTemplates] = useState<CsTemplate[]>([]);
  const [categories, setCategories] = useState<CsCategory[]>([]);
  const [keywordRules, setKeywordRules] = useState<CsKeywordRule[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CsTemplate | null>(null);
  const [templateContext, setTemplateContext] = useState<CsTemplateContext>({});
  const [previewText, setPreviewText] = useState('');

  // 탭 전환: 문의함 / 템플릿관리
  const [mainTab, setMainTab] = useState<'inbox' | 'templates'>('inbox');

  // 키보드 단축키
  const listRef = useRef<HTMLDivElement>(null);
  const [shUserId, setShUserId] = useState('');

  // ─── 초기 데이터 로드 ───

  const loadMeta = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', session.user.id)
      .single();
    if (!shUser) return;
    setShUserId((shUser as Record<string, unknown>).id as string);

    // 카테고리 + 키워드 규칙
    const [catRes, tplRes] = await Promise.all([
      fetch('/api/megaload/cs/categories'),
      fetch('/api/megaload/cs/templates'),
    ]);
    if (catRes.ok) {
      const d = await catRes.json();
      setCategories(d.categories || []);
      setKeywordRules(d.rules || []);
    }
    if (tplRes.ok) {
      const d = await tplRes.json();
      setTemplates(d.templates || []);
    }
  }, [supabase]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // ─── 문의 목록 조회 ───

  const fetchInquiries = useCallback(async () => {
    if (!shUserId) return;
    setLoading(true);

    let query = supabase
      .from('sh_cs_inquiries')
      .select('*', { count: 'exact' })
      .eq('megaload_user_id', shUserId)
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (activeTab !== 'all') query = query.eq('status', activeTab);
    if (channelFilter) query = query.eq('channel', channelFilter);
    if (categoryFilter) query = query.eq('category_id', categoryFilter);
    if (search) query = query.ilike('content', `%${search}%`);

    const { data, count } = await query;
    setInquiries((data as unknown as CsInquiry[]) || []);
    setTotal(count || 0);
    setLoading(false);

    // 미답변 카운트 (뱃지용)
    const { count: pc } = await supabase
      .from('sh_cs_inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId)
      .eq('status', 'pending');
    setPendingCount(pc || 0);
  }, [supabase, shUserId, activeTab, channelFilter, categoryFilter, search, page]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  // ─── 동기화 ───

  const syncInquiries = async () => {
    setSyncLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/megaload/cs/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `${data.totalCollected}건의 새 문의를 가져왔습니다.` });
        fetchInquiries();
      } else {
        setMessage({ type: 'error', text: data.error || '동기화 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '동기화 중 오류 발생' });
    }
    setSyncLoading(false);
  };

  // ─── 문의 선택 → 컨텍스트 빌드 + 템플릿 추천 ───

  const selectInquiry = useCallback(async (inq: CsInquiry) => {
    setSelectedInquiry(inq);
    setSelectedTemplate(null);
    setAnswer(inq.answer || '');

    // 컨텍스트 빌드 (클라이언트에서 가능한 범위)
    const ctx: CsTemplateContext = {
      고객명: inq.buyer_name || '고객',
      상품명: inq.channel_product_name || '',
      주문번호: inq.channel_order_id || '',
    };

    // DB에서 주문 추가 정보 (간접 — 이미 inquiry에 있는 것 활용)
    if (inq.channel_order_id && shUserId) {
      const { data: order } = await supabase
        .from('sh_orders')
        .select('order_status, courier_code, invoice_number, ordered_at')
        .eq('megaload_user_id', shUserId)
        .eq('channel_order_id', inq.channel_order_id)
        .maybeSingle();
      if (order) {
        const o = order as Record<string, unknown>;
        ctx.배송상태 = o.order_status as string || '';
        ctx.택배사 = o.courier_code as string || '';
        ctx.송장번호 = o.invoice_number as string || '';
        ctx.주문일 = o.ordered_at
          ? new Date(o.ordered_at as string).toLocaleDateString('ko-KR')
          : '';
      }
    }

    setTemplateContext(ctx);
  }, [supabase, shUserId]);

  // ─── 템플릿 선택 → 미리보기 ───

  const selectTemplate = (tpl: CsTemplate) => {
    setSelectedTemplate(tpl);
    const rendered = renderTemplate(tpl.content, templateContext);
    setPreviewText(rendered);
    setAnswer(rendered);
  };

  // ─── 답변 전송 ───

  const sendAnswer = async () => {
    if (!selectedInquiry || !answer.trim()) return;
    setSendLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/megaload/cs/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          channel: selectedInquiry.channel,
          channelInquiryId: selectedInquiry.channel_inquiry_id,
          answer: answer.trim(),
          templateId: selectedTemplate?.id,
          inquirySource: selectedInquiry.inquiry_source,
        }),
      });

      const result = await res.json();

      if (!res.ok && res.status !== 502) {
        setMessage({ type: 'error', text: result.error || '답변 전송 실패' });
      }

      // DB 업데이트
      await supabase.from('sh_cs_inquiries').update({
        answer: answer.trim(),
        status: 'replied' as InquiryStatus,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: selectedTemplate?.id || null,
      }).eq('id', selectedInquiry.id);

      if (res.ok) {
        setMessage({ type: 'success', text: '답변이 전송되었습니다.' });
      } else if (res.status === 502) {
        setMessage({ type: 'success', text: '답변이 DB에 저장되었습니다. (채널 전송은 재시도 필요)' });
      }

      setSelectedInquiry(null);
      setSelectedTemplate(null);
      setAnswer('');
      setPreviewText('');
      fetchInquiries();
    } catch {
      setMessage({ type: 'error', text: '답변 전송 중 오류가 발생했습니다.' });
    } finally {
      setSendLoading(false);
    }
  };

  // ─── 추천 템플릿 계산 ───

  const recommendedTemplates = useMemo(() => {
    if (!selectedInquiry) return [];
    // 분류 안됐으면 content에서 분류 시도
    let catId = selectedInquiry.category_id;
    if (!catId && keywordRules.length > 0) {
      const cls = classifyInquiry(
        (selectedInquiry.content || '') + ' ' + (selectedInquiry.title || ''),
        keywordRules
      );
      catId = cls?.categoryId;
    }
    return recommendTemplates(catId, templateContext.배송상태, templates);
  }, [selectedInquiry, templates, keywordRules, templateContext.배송상태]);

  // ─── 키보드 단축키 ───

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 입력 중이면 무시
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = selectedInquiry ? inquiries.findIndex((i) => i.id === selectedInquiry.id) : -1;
        const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next >= 0 && next < inquiries.length) {
          selectInquiry(inquiries[next]);
        }
      }

      // 1~9: 템플릿 선택
      if (e.key >= '1' && e.key <= '9' && selectedInquiry) {
        const tplIdx = parseInt(e.key) - 1;
        if (tplIdx < recommendedTemplates.length) {
          selectTemplate(recommendedTemplates[tplIdx]);
        }
      }

      // Enter: 전송 (Ctrl/Cmd + Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && answer.trim() && selectedInquiry) {
        sendAnswer();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInquiry, inquiries, recommendedTemplates, answer]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 선택된 문의의 카테고리 정보
  const selectedCategory = selectedInquiry?.category_id
    ? categories.find((c) => c.id === selectedInquiry.category_id)
    : null;

  // ─── 렌더링 ───

  if (mainTab === 'templates') {
    return <TemplateManager
      templates={templates}
      categories={categories}
      onBack={() => setMainTab('inbox')}
      onRefresh={loadMeta}
    />;
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">문의관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">6채널 통합 CS 반자동 응답</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainTab('templates')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <FileText className="w-4 h-4" />
            템플릿 관리
          </button>
          <button
            onClick={syncInquiries}
            disabled={syncLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
            {syncLoading ? '동기화중...' : '문의 가져오기'}
          </button>
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 mb-3 flex-shrink-0 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* 탭 + 필터 */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === tab.key ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count && pendingCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                }`}>
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="문의 내용 검색..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>

        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value as Channel | ''); setPage(1); }}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 채널</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{CHANNEL_SHORT_LABELS[ch]}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 카테고리</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        <div className="ml-auto text-xs text-gray-400 flex items-center gap-1">
          <Keyboard className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">↑↓ 이동 | 1~9 템플릿 | Ctrl+Enter 전송</span>
        </div>
      </div>

      {/* 3컬럼 레이아웃 */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* ─── 좌측: 문의 목록 ─── */}
        <div ref={listRef} className="w-80 flex-shrink-0 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />불러오는 중...
            </div>
          ) : inquiries.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <MessageSquare className="w-7 h-7 mx-auto mb-2" />문의가 없습니다
            </div>
          ) : (
            inquiries.map((inq) => {
              const urgency = URGENCY_CONFIG[(inq.urgency as CsUrgency) || 'normal'];
              const cat = categories.find((c) => c.id === inq.category_id);
              const isSelected = selectedInquiry?.id === inq.id;

              return (
                <button
                  key={inq.id}
                  onClick={() => selectInquiry(inq)}
                  className={`w-full text-left bg-white rounded-lg border p-3 hover:shadow-sm transition ${
                    isSelected ? 'border-[#E31837] ring-1 ring-[#E31837]' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {/* 긴급도 점 */}
                    {inq.urgency && inq.urgency !== 'normal' && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urgency.dot}`} />
                    )}
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${CHANNEL_COLORS[inq.channel]}`}>
                      {CHANNEL_SHORT_LABELS[inq.channel]}
                    </span>
                    {cat && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${cat.color || 'bg-gray-100 text-gray-600'}`}>
                        {cat.name}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                      inq.status === 'pending' ? 'bg-red-100 text-red-700' :
                      inq.status === 'replied' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {inq.status === 'pending' ? '미답변' : inq.status === 'replied' ? '답변완료' : '해결'}
                    </span>
                  </div>
                  {inq.title && <p className="text-sm font-medium text-gray-900 mb-0.5 truncate">{inq.title}</p>}
                  <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{inq.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {inq.buyer_name && <span className="text-[10px] text-gray-500">{inq.buyer_name}</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {relativeTime(inq.inquired_at || inq.created_at)}
                    </span>
                  </div>
                </button>
              );
            })
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500">{total}건</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-xs text-gray-600">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── 가운데: 문의 상세 + 답변 ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {selectedInquiry ? (
            <>
              {/* 문의 헤더 */}
              <div className="p-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${CHANNEL_COLORS[selectedInquiry.channel]}`}>
                    {CHANNEL_SHORT_LABELS[selectedInquiry.channel]}
                  </span>
                  {selectedCategory && (
                    <span className={`px-2 py-0.5 text-xs rounded ${selectedCategory.color || 'bg-gray-100 text-gray-600'}`}>
                      <Tag className="w-3 h-3 inline mr-0.5" />{selectedCategory.name}
                    </span>
                  )}
                  {selectedInquiry.urgency && selectedInquiry.urgency !== 'normal' && (
                    <span className={`px-2 py-0.5 text-xs rounded border ${URGENCY_CONFIG[(selectedInquiry.urgency as CsUrgency)].color}`}>
                      {URGENCY_CONFIG[(selectedInquiry.urgency as CsUrgency)].label}
                    </span>
                  )}
                  {selectedInquiry.inquiry_source === 'callcenter' && (
                    <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">콜센터</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {relativeTime(selectedInquiry.inquired_at || selectedInquiry.created_at)}
                  </span>
                </div>
                {selectedInquiry.title && (
                  <h3 className="font-semibold text-gray-900 text-sm">{selectedInquiry.title}</h3>
                )}
                {selectedInquiry.buyer_name && (
                  <p className="text-xs text-gray-500 mt-0.5">{selectedInquiry.buyer_name}</p>
                )}
              </div>

              {/* 문의 내용 */}
              <div className="p-4 flex-1 overflow-y-auto space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">고객 문의</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{selectedInquiry.content}</p>
                </div>

                {/* 주문 정보 카드 */}
                {(selectedInquiry.channel_order_id || selectedInquiry.channel_product_name) && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" /> 주문 정보
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selectedInquiry.channel_product_name && (
                        <div>
                          <span className="text-gray-500">상품명: </span>
                          <span className="text-gray-800">{selectedInquiry.channel_product_name}</span>
                        </div>
                      )}
                      {selectedInquiry.channel_order_id && (
                        <div>
                          <span className="text-gray-500">주문번호: </span>
                          <span className="text-gray-800">{selectedInquiry.channel_order_id}</span>
                        </div>
                      )}
                      {templateContext.배송상태 && (
                        <div>
                          <span className="text-gray-500">배송상태: </span>
                          <span className="text-gray-800 flex items-center gap-1 inline-flex">
                            <Truck className="w-3 h-3" />{templateContext.배송상태}
                          </span>
                        </div>
                      )}
                      {templateContext.송장번호 && (
                        <div>
                          <span className="text-gray-500">송장: </span>
                          <span className="text-gray-800">{templateContext.택배사} {templateContext.송장번호}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 기존 답변 */}
                {selectedInquiry.answer && selectedInquiry.status !== 'pending' && (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                    <p className="text-xs font-medium text-green-700 mb-1.5">기존 답변</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedInquiry.answer}</p>
                  </div>
                )}
              </div>

              {/* 답변 입력 */}
              <div className="p-4 border-t border-gray-100 flex-shrink-0">
                <textarea
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setPreviewText(e.target.value); }}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
                  placeholder="답변을 입력하세요... (또는 오른쪽에서 템플릿 선택)"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => { setSelectedInquiry(null); setAnswer(''); setPreviewText(''); setSelectedTemplate(null); }}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={sendAnswer}
                    disabled={!answer.trim() || sendLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition ml-auto disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {sendLoading ? '전송중...' : '답변 전송'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">왼쪽에서 문의를 선택하세요</p>
                <p className="text-xs mt-1">↑↓ 키로 탐색할 수 있습니다</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── 우측: 템플릿 추천 ─── */}
        <div className="w-72 flex-shrink-0 overflow-y-auto">
          {selectedInquiry ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">추천 템플릿</h3>
                <span className="text-xs text-gray-400">{recommendedTemplates.length}개</span>
              </div>

              {recommendedTemplates.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-xs text-gray-400">
                  사용 가능한 템플릿이 없습니다
                </div>
              ) : (
                recommendedTemplates.slice(0, 15).map((tpl, idx) => {
                  const isActive = selectedTemplate?.id === tpl.id;
                  const tplCat = categories.find((c) => c.id === tpl.category_id);
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => selectTemplate(tpl)}
                      className={`w-full text-left rounded-lg border p-2.5 transition ${
                        isActive
                          ? 'border-[#E31837] ring-1 ring-[#E31837] bg-red-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-gray-400 font-mono w-4 text-center">{idx + 1}</span>
                        <span className="text-xs font-medium text-gray-900 truncate flex-1">{tpl.template_name}</span>
                        {tpl.use_count ? (
                          <span className="text-[10px] text-gray-400">{tpl.use_count}회</span>
                        ) : null}
                      </div>
                      {tplCat && (
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded mb-1 ${tplCat.color || 'bg-gray-100 text-gray-600'}`}>
                          {tplCat.name}
                        </span>
                      )}
                      <p className="text-[11px] text-gray-500 line-clamp-2">{tpl.content.slice(0, 80)}...</p>
                    </button>
                  );
                })
              )}

              {/* 미리보기 */}
              {selectedTemplate && previewText && (
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 mt-3">
                  <p className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> 미리보기 (변수 치환됨)
                  </p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {previewText}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">문의 선택 시 추천 템플릿이 표시됩니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 템플릿 관리 인라인 컴포넌트
// ============================================================

function TemplateManager({
  templates,
  categories,
  onBack,
  onRefresh,
}: {
  templates: CsTemplate[];
  categories: CsCategory[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [editingTemplate, setEditingTemplate] = useState<CsTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('');

  const [form, setForm] = useState({
    template_name: '',
    category_id: '',
    category: '',
    content: '',
    order_status_condition: '',
  });

  const openNew = () => {
    setIsNew(true);
    setEditingTemplate(null);
    setForm({ template_name: '', category_id: '', category: '', content: '', order_status_condition: '' });
  };

  const openEdit = (tpl: CsTemplate) => {
    setIsNew(false);
    setEditingTemplate(tpl);
    setForm({
      template_name: tpl.template_name,
      category_id: tpl.category_id || '',
      category: tpl.category || '',
      content: tpl.content,
      order_status_condition: tpl.order_status_condition || '',
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const variables = form.content.match(/\{\{(\S+?)\}\}/g)?.map((m) => m.slice(2, -2)) || [];
      const body = {
        ...form,
        category_id: form.category_id || null,
        order_status_condition: form.order_status_condition || null,
        variables: [...new Set(variables)],
        ...(editingTemplate && { id: editingTemplate.id }),
      };

      await fetch('/api/megaload/cs/templates', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setEditingTemplate(null);
      setIsNew(false);
      onRefresh();
    } catch {
      // 에러 처리
    }
    setSaving(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    await fetch(`/api/megaload/cs/templates?id=${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const filteredTemplates = filterCat
    ? templates.filter((t) => t.category_id === filterCat)
    : templates;

  // 카테고리별 그룹화
  const grouped = categories.map((cat) => ({
    category: cat,
    items: filteredTemplates.filter((t) => t.category_id === cat.id),
  })).filter((g) => g.items.length > 0 || !filterCat);

  const uncategorized = filteredTemplates.filter(
    (t) => !t.category_id || !categories.find((c) => c.id === t.category_id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition">
            <ChevronLeft className="w-4 h-4" /> 문의함으로
          </button>
          <h1 className="text-xl font-bold text-gray-900">템플릿 관리</h1>
          <span className="text-sm text-gray-400">{templates.length}개</span>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
        >
          + 새 템플릿
        </button>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCat('')}
          className={`px-3 py-1.5 text-xs rounded-lg border transition ${
            !filterCat ? 'bg-[#E31837] text-white border-[#E31837]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          전체
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilterCat(cat.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition ${
              filterCat === cat.id ? 'bg-[#E31837] text-white border-[#E31837]' : `bg-white border-gray-300 hover:bg-gray-50 ${cat.color || 'text-gray-600'}`
            }`}
          >
            {cat.name} ({templates.filter((t) => t.category_id === cat.id).length})
          </button>
        ))}
      </div>

      {/* 편집 폼 */}
      {(editingTemplate || isNew) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">{isNew ? '새 템플릿' : '템플릿 수정'}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">템플릿명 *</label>
              <input
                value={form.template_name}
                onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">카테고리</label>
              <select
                value={form.category_id}
                onChange={(e) => {
                  const cat = categories.find((c) => c.id === e.target.value);
                  setForm((f) => ({ ...f, category_id: e.target.value, category: cat?.name || '' }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">미분류</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-1">
              내용 * <span className="text-gray-400">(변수: {'{{고객명}}, {{상품명}}, {{주문번호}}, {{배송상태}}, {{택배사}}, {{송장번호}}, {{주문일}}'})</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent font-mono"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-1">주문상태 조건 (선택)</label>
            <input
              value={form.order_status_condition}
              onChange={(e) => setForm((f) => ({ ...f, order_status_condition: e.target.value }))}
              placeholder="예: 배송중, 배송완료 (비워두면 조건 없음)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingTemplate(null); setIsNew(false); }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || !form.template_name || !form.content}
              className="px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? '저장중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 카테고리별 템플릿 목록 */}
      {grouped.map(({ category: cat, items }) => (
        <div key={cat.id}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 text-xs rounded ${cat.color || 'bg-gray-100 text-gray-600'}`}>{cat.name}</span>
            <span className="text-xs text-gray-400">{items.length}개</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((tpl) => (
              <div key={tpl.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-medium text-gray-900 truncate">{tpl.template_name}</h4>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {tpl.use_count ? <span className="text-[10px] text-gray-400">{tpl.use_count}회</span> : null}
                    {tpl.is_default && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">기본</span>}
                  </div>
                </div>
                {tpl.order_status_condition && (
                  <p className="text-[10px] text-purple-600 mb-1">조건: {tpl.order_status_condition}</p>
                )}
                <p className="text-xs text-gray-500 line-clamp-3 mb-2">{tpl.content.slice(0, 120)}...</p>
                {tpl.variables && tpl.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tpl.variables.map((v) => (
                      <span key={v} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{`{{${v}}}`}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(tpl)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    수정
                  </button>
                  {!tpl.is_default && (
                    <button
                      onClick={() => deleteTemplate(tpl.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 미분류 */}
      {uncategorized.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">미분류</span>
            <span className="text-xs text-gray-400">{uncategorized.length}개</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {uncategorized.map((tpl) => (
              <div key={tpl.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-medium text-gray-900 truncate">{tpl.template_name}</h4>
                </div>
                <p className="text-xs text-gray-500 line-clamp-3 mb-2">{tpl.content.slice(0, 120)}...</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(tpl)} className="text-xs text-blue-600 hover:text-blue-800">수정</button>
                  {!tpl.is_default && (
                    <button onClick={() => deleteTemplate(tpl.id)} className="text-xs text-red-500 hover:text-red-700">삭제</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
