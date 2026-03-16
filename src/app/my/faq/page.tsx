'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { HelpCircle, Search, ChevronDown, ChevronUp, BookOpen, TrendingUp, CreditCard, ShieldAlert, Settings, Code, FileText, AlertTriangle, Loader2, MessageCircle } from 'lucide-react';
import Card from '@/components/ui/Card';

type FaqCategory = 'signup' | 'settlement' | 'commission' | 'coupang_api' | 'tax_invoice' | 'penalty' | 'other';

interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  sort_order: number;
  view_count: number;
}

const CATEGORY_CONFIG: Record<FaqCategory, { label: string; color: string; icon: typeof BookOpen }> = {
  signup: { label: '가입/시작', color: 'bg-blue-100 text-blue-700', icon: BookOpen },
  settlement: { label: '정산', color: 'bg-purple-100 text-purple-700', icon: CreditCard },
  commission: { label: '수수료', color: 'bg-orange-100 text-orange-700', icon: TrendingUp },
  coupang_api: { label: '쿠팡 API', color: 'bg-green-100 text-green-700', icon: Code },
  tax_invoice: { label: '세금/계산서', color: 'bg-teal-100 text-teal-700', icon: FileText },
  penalty: { label: '페널티/정책', color: 'bg-rose-100 text-rose-700', icon: ShieldAlert },
  other: { label: '기타', color: 'bg-gray-100 text-gray-700', icon: Settings },
};

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'signup', label: '가입/시작' },
  { value: 'settlement', label: '정산' },
  { value: 'commission', label: '수수료' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금/계산서' },
  { value: 'penalty', label: '페널티/정책' },
  { value: 'other', label: '기타' },
];

/** 간단한 마크다운 렌더러 (이미지, 볼드, 링크 지원) */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 이미지: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      elements.push(
        <img
          key={i}
          src={imgMatch[2]}
          alt={imgMatch[1]}
          className="my-3 rounded-lg max-w-full h-auto border border-gray-200"
          loading="lazy"
        />
      );
      continue;
    }

    // 인라인 이미지가 포함된 라인
    if (line.includes('![')) {
      const parts: React.ReactNode[] = [];
      let partIdx = 0;
      const inlineImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      let lastIndex = 0;

      while ((match = inlineImgRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(<span key={`t${partIdx++}`}>{line.slice(lastIndex, match.index)}</span>);
        }
        parts.push(
          <img
            key={`img${partIdx++}`}
            src={match[2]}
            alt={match[1]}
            className="inline-block my-2 rounded-lg max-w-full h-auto border border-gray-200"
            loading="lazy"
          />
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < line.length) {
        parts.push(<span key={`t${partIdx++}`}>{line.slice(lastIndex)}</span>);
      }
      elements.push(<div key={i}>{parts}</div>);
      continue;
    }

    // 헤더: 【...】
    if (line.startsWith('【') && line.endsWith('】')) {
      elements.push(
        <h4 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-sm">
          {line}
        </h4>
      );
      continue;
    }

    // 구분선
    if (line.match(/^-{3,}$/)) {
      elements.push(<hr key={i} className="my-3 border-gray-200" />);
      continue;
    }

    // 볼드 처리 **text**
    const renderInline = (text: string): React.ReactNode => {
      const boldParts = text.split(/\*\*(.+?)\*\*/g);
      if (boldParts.length === 1) return text;
      return boldParts.map((part, idx) =>
        idx % 2 === 1 ? <strong key={idx} className="font-semibold text-gray-900">{part}</strong> : part
      );
    };

    // 빈 줄
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // 일반 텍스트
    elements.push(
      <div key={i} className="leading-relaxed">
        {renderInline(line)}
      </div>
    );
  }

  return elements;
}

export default function FaqPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/faqs');
      if (!res.ok) throw new Error('FAQ 조회 실패');
      const json = await res.json();
      setFaqs(json.data || []);
      setError(null);
    } catch {
      setError('FAQ를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const filteredFaqs = useMemo(() => {
    let result = faqs;

    if (selectedCategory !== 'all') {
      result = result.filter(f => f.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
      );
    }

    return result;
  }, [faqs, selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: faqs.length };
    for (const faq of faqs) {
      counts[faq.category] = (counts[faq.category] || 0) + 1;
    }
    return counts;
  }, [faqs]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자주 묻는 질문</h1>
          <p className="text-sm text-gray-500">쿠팡 셀러 운영에 필요한 핵심 정보를 모았습니다</p>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="궁금한 내용을 검색하세요... (예: 수수료, 로켓그로스, 세금)"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
        />
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedCategory(tab.value)}
            className={`px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
              selectedCategory === tab.value
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            <span className={`text-xs ${
              selectedCategory === tab.value ? 'text-white/70' : 'text-gray-400'
            }`}>
              {categoryCounts[tab.value] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* 결과 카운트 */}
      {searchQuery && (
        <p className="text-sm text-gray-500 mb-3">
          검색 결과: {filteredFaqs.length}개
        </p>
      )}

      {/* 로딩 */}
      {loading ? (
        <Card>
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-spin" />
            <p className="text-gray-500">FAQ를 불러오는 중...</p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="text-center py-12">
            <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-red-500">{error}</p>
            <button
              type="button"
              onClick={fetchFaqs}
              className="mt-3 text-sm text-[#E31837] hover:underline"
            >
              다시 시도
            </button>
          </div>
        </Card>
      ) : filteredFaqs.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">
              {searchQuery ? '검색 결과가 없습니다' : '해당 카테고리에 FAQ가 없습니다'}
            </p>
            <p className="text-sm text-gray-400">다른 키워드나 카테고리를 선택해보세요</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredFaqs.map(faq => {
            const config = CATEGORY_CONFIG[faq.category] || CATEGORY_CONFIG.other;
            const isExpanded = expandedId === faq.id;

            return (
              <div
                key={faq.id}
                className={`bg-white rounded-xl border transition-all ${
                  isExpanded ? 'border-gray-300 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="font-medium text-gray-900 text-sm">
                      {faq.question}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    <div className="pt-4 text-sm text-gray-700">
                      {renderMarkdown(faq.answer)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 안내 */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl text-center">
        <p className="text-sm text-gray-500">
          원하는 답변을 찾지 못하셨나요?
        </p>
        <a
          href="/my/support"
          className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-[#E31837] hover:underline"
        >
          <MessageCircle className="w-4 h-4" />
          1:1 문의하기
        </a>
      </div>
    </div>
  );
}
