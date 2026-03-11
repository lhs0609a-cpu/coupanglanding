'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Badge from '@/components/ui/Badge';
import {
  Lightbulb,
  Search,
  ChevronDown,
  ChevronRight,
  Target,
  Layers,
  KeyRound,
  Settings,
  TrendingUp,
  BarChart3,
  Wallet,
  AlertTriangle,
  Zap,
  Package,
} from 'lucide-react';
import { adTipCategories, type AdTipCategory, type AdTip } from '@/lib/data/ad-tips';

// ── Icon map ──────────────────────────────────
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Layers,
  KeyRound,
  Settings,
  TrendingUp,
  BarChart3,
  Wallet,
  AlertTriangle,
  Zap,
  Package,
};

// ── Importance badge ──────────────────────────
const importanceBadge: Record<AdTip['importance'], { label: string; color: string }> = {
  must: { label: '필독', color: 'bg-red-100 text-red-700' },
  recommended: { label: '추천', color: 'bg-blue-100 text-blue-700' },
  advanced: { label: '고급', color: 'bg-gray-100 text-gray-600' },
};

export default function AdTipsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set());

  // Filtered categories & tips
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return adTipCategories
      .filter((cat) => !selectedCategory || cat.id === selectedCategory)
      .map((cat) => {
        if (!term) return cat;
        const filteredTips = cat.tips.filter(
          (tip) =>
            tip.title.toLowerCase().includes(term) ||
            tip.content.toLowerCase().includes(term) ||
            tip.tags.some((t) => t.toLowerCase().includes(term)),
        );
        return { ...cat, tips: filteredTips };
      })
      .filter((cat) => cat.tips.length > 0);
  }, [searchTerm, selectedCategory]);

  const totalTips = adTipCategories.reduce((sum, cat) => sum + cat.tips.length, 0);
  const mustCount = adTipCategories.reduce(
    (sum, cat) => sum + cat.tips.filter((t) => t.importance === 'must').length,
    0,
  );

  const toggleTip = (tipId: string) => {
    setExpandedTips((prev) => {
      const next = new Set(prev);
      if (next.has(tipId)) next.delete(tipId);
      else next.add(tipId);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set(filtered.flatMap((cat) => cat.tips.map((t) => t.id)));
    setExpandedTips(allIds);
  };

  const collapseAll = () => {
    setExpandedTips(new Set());
  };

  // Simple markdown renderer (bold, tables, code blocks, lists, blockquotes)
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block
      if (line.trim().startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto my-2 font-mono">
            {codeLines.join('\n')}
          </pre>,
        );
        continue;
      }

      // Table
      if (line.includes('|') && line.trim().startsWith('|')) {
        const tableRows: string[] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
          tableRows.push(lines[i]);
          i++;
        }
        // Parse table
        const headerRow = tableRows[0];
        const dataRows = tableRows.slice(2); // skip separator
        const headers = headerRow.split('|').filter(Boolean).map((h) => h.trim());
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left font-semibold text-gray-700">
                      <span dangerouslySetInnerHTML={{ __html: inlineMd(h) }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => {
                  const cells = row.split('|').filter(Boolean).map((c) => c.trim());
                  return (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                      {cells.map((cell, cIdx) => (
                        <td key={cIdx} className="border border-gray-200 px-2 py-1.5 text-gray-600">
                          <span dangerouslySetInnerHTML={{ __html: inlineMd(cell) }} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // Blockquote
      if (line.trim().startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        elements.push(
          <div key={`quote-${i}`} className="border-l-3 border-[#E31837] bg-red-50/50 pl-3 py-2 my-2 text-sm text-gray-700">
            <span dangerouslySetInnerHTML={{ __html: inlineMd(quoteLines.join(' ')) }} />
          </div>,
        );
        continue;
      }

      // Checkbox list
      if (line.trim().startsWith('- [ ]') || line.trim().startsWith('- [x]')) {
        const checked = line.trim().startsWith('- [x]');
        const text = line.trim().replace(/^- \[[ x]\]\s*/, '');
        elements.push(
          <div key={`check-${i}`} className="flex items-start gap-2 my-0.5 text-sm text-gray-600">
            <input type="checkbox" checked={checked} readOnly className="mt-1 accent-[#E31837]" />
            <span dangerouslySetInnerHTML={{ __html: inlineMd(text) }} />
          </div>,
        );
        i++;
        continue;
      }

      // Unordered list
      if (/^\s*[-*]\s/.test(line) && !line.trim().startsWith('---')) {
        const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
        const text = line.trim().replace(/^[-*]\s+/, '');
        elements.push(
          <div key={`li-${i}`} className="flex items-start gap-1.5 my-0.5 text-sm text-gray-600" style={{ paddingLeft: `${Math.min(indent, 4) * 8}px` }}>
            <span className="text-[#E31837] mt-0.5 flex-shrink-0">&#x2022;</span>
            <span dangerouslySetInnerHTML={{ __html: inlineMd(text) }} />
          </div>,
        );
        i++;
        continue;
      }

      // Ordered list
      if (/^\d+\.\s/.test(line.trim())) {
        const match = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (match) {
          elements.push(
            <div key={`ol-${i}`} className="flex items-start gap-1.5 my-0.5 text-sm text-gray-600">
              <span className="text-[#E31837] font-bold flex-shrink-0 min-w-[1.2rem] text-right">{match[1]}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMd(match[2]) }} />
            </div>,
          );
        }
        i++;
        continue;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={`br-${i}`} className="h-2" />);
        i++;
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="text-sm text-gray-600 my-1 leading-relaxed">
          <span dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
        </p>,
      );
      i++;
    }

    return elements;
  };

  // Inline markdown: bold, inline code, italic
  const inlineMd = (text: string): string => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-[#E31837] px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-6 h-6 text-[#E31837]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">쿠팡 광고 노하우</h1>
            <p className="text-sm text-gray-500">실전에서 검증된 광고 최적화 전략</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={`${totalTips}개 팁`} colorClass="bg-gray-100 text-gray-700" />
          <Badge label={`필독 ${mustCount}개`} colorClass="bg-red-100 text-red-700" />
        </div>
      </div>

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="키워드로 검색... (예: ROAS, 입찰가, 전환율)"
            className="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition"
          />
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
              !selectedCategory
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          {adTipCategories.map((cat) => {
            const Icon = iconMap[cat.icon];
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition ${
                  selectedCategory === cat.id
                    ? 'bg-[#E31837] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {cat.title}
              </button>
            );
          })}
        </div>

        {/* Expand/Collapse */}
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-[#E31837] transition">
            모두 펼치기
          </button>
          <span className="text-xs text-gray-300">|</span>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-[#E31837] transition">
            모두 접기
          </button>
        </div>
      </div>

      {/* Tip Categories */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3" />
          <p>검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((category) => {
            const Icon = iconMap[category.icon];
            const mustTips = category.tips.filter((t) => t.importance === 'must').length;

            return (
              <div key={category.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Category Header */}
                <div className="px-5 py-4 bg-gray-50/70 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    {Icon && <Icon className="w-5 h-5 text-[#E31837]" />}
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-gray-900">{category.title}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">{category.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {mustTips > 0 && (
                        <Badge label={`필독 ${mustTips}`} colorClass="bg-red-100 text-red-700" />
                      )}
                      <Badge label={`${category.tips.length}개`} colorClass="bg-gray-100 text-gray-600" />
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="divide-y divide-gray-100">
                  {category.tips.map((tip) => {
                    const isExpanded = expandedTips.has(tip.id);
                    const badge = importanceBadge[tip.importance];

                    return (
                      <div key={tip.id}>
                        {/* Tip Header */}
                        <button
                          onClick={() => toggleTip(tip.id)}
                          className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50/50 transition group"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#E31837] flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#E31837] flex-shrink-0 transition" />
                          )}
                          <span className="flex-1 text-sm font-medium text-gray-900 group-hover:text-[#E31837] transition">
                            {tip.title}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>
                        </button>

                        {/* Tip Content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 pl-12">
                                {/* Tags */}
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {tip.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                                {/* Markdown Content */}
                                <div className="space-y-0">
                                  {renderMarkdown(tip.content)}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
