'use client';

import { useState, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { MessageSquare, Search, Copy, Check, Lightbulb } from 'lucide-react';
import { CS_TEMPLATES, CS_CATEGORIES, type CsTemplate } from '@/lib/data/cs-templates';

export default function CsTemplatesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CsTemplate | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredTemplates = useMemo(() => {
    return CS_TEMPLATES.filter((template) => {
      const matchesCategory =
        selectedCategory === 'all' || template.category === selectedCategory;
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        template.title.toLowerCase().includes(lowerSearch) ||
        template.tags.some((tag) => tag.toLowerCase().includes(lowerSearch));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchTerm]);

  const getCategoryInfo = (categoryValue: string) => {
    return CS_CATEGORIES.find((c) => c.value === categoryValue);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <MessageSquare className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">CS 응답 템플릿</h1>
        </div>
        <p className="text-sm text-gray-500 ml-9">
          쿠팡 셀러 CS 상황별 복사붙이기 응답 템플릿
        </p>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            selectedCategory === 'all'
              ? 'bg-[#E31837] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          전체
        </button>
        {CS_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              selectedCategory === cat.value
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="템플릿 검색 (제목, 태그)..."
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
        />
      </div>

      {/* Template Grid */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-gray-400 text-sm">
            검색 결과가 없습니다.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map((template) => {
            const catInfo = getCategoryInfo(template.category);
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template)}
                className="text-left"
              >
                <Card className="hover:border-[#E31837] hover:shadow-md transition cursor-pointer h-full">
                  <div className="space-y-3">
                    {/* Category Badge + Title */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5">
                        {catInfo && (
                          <Badge label={`${catInfo.icon} ${catInfo.label}`} colorClass={catInfo.color} />
                        )}
                        <h3 className="font-bold text-gray-900">{template.title}</h3>
                      </div>
                    </div>

                    {/* Situation (truncated 2 lines) */}
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {template.situation}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {template.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Tip Count */}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>실전 팁 {template.tips.length}개</span>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedTemplate}
        onClose={() => {
          setSelectedTemplate(null);
          setCopied(false);
        }}
        title={selectedTemplate?.title || ''}
        maxWidth="max-w-2xl"
      >
        {selectedTemplate && (() => {
          const catInfo = getCategoryInfo(selectedTemplate.category);
          return (
            <div className="space-y-5">
              {/* Category Badge */}
              {catInfo && (
                <Badge label={`${catInfo.icon} ${catInfo.label}`} colorClass={catInfo.color} />
              )}

              {/* Situation */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-1.5">상황</h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {selectedTemplate.situation}
                </p>
              </div>

              {/* Response Template */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-bold text-gray-700">응답 템플릿</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedTemplate.responseText)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      copied
                        ? 'bg-green-500 text-white'
                        : 'bg-[#E31837] text-white hover:bg-[#c81530]'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        복사완료!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        복사하기
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-gray-200">
                  {selectedTemplate.responseText}
                </div>
              </div>

              {/* Tips */}
              {selectedTemplate.tips.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    실전 팁
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedTemplate.tips.map((tip, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-gray-600"
                      >
                        <span className="text-amber-500 mt-0.5 shrink-0">&#8226;</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
