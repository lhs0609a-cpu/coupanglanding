'use client';

import { useState, useEffect, useMemo } from 'react';
import { HelpCircle, Search, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Faq } from '@/lib/supabase/types';
import { FAQ_CATEGORY_LABELS, FAQ_CATEGORY_COLORS } from '@/lib/utils/constants';

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'signup', label: '가입/시작' },
  { value: 'settlement', label: '정산' },
  { value: 'commission', label: '수수료' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'penalty', label: '페널티' },
  { value: 'other', label: '기타' },
];

export default function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFaqs();
  }, []);

  async function fetchFaqs() {
    try {
      setLoading(true);
      const res = await fetch('/api/faqs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setFaqs(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자주 묻는 질문</h1>
          <p className="text-sm text-gray-500">궁금한 내용을 검색하거나 카테고리별로 확인하세요</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="질문을 검색하세요..."
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
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedCategory === tab.value
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
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredFaqs.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            {searchQuery ? '검색 결과가 없습니다.' : 'FAQ가 없습니다.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredFaqs.map(faq => (
            <Card key={faq.id} className="!p-0 overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-3"
                onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    label={FAQ_CATEGORY_LABELS[faq.category] || faq.category}
                    colorClass={FAQ_CATEGORY_COLORS[faq.category] || 'bg-gray-100 text-gray-700'}
                  />
                  <span className="font-medium text-gray-900 text-sm truncate">
                    {faq.question}
                  </span>
                </div>
                {expandedId === faq.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {expandedId === faq.id && (
                <div className="px-6 pb-4 border-t border-gray-100">
                  <div className="pt-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {faq.answer}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
