'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { GuideFAQ } from '@/lib/data/guides';

interface GuideFAQSectionProps {
  faqs: GuideFAQ[];
}

export default function GuideFAQSection({ faqs }: GuideFAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (faqs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold text-gray-900 mb-3">자주 묻는 질문</h3>
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
            >
              <span className="text-sm font-medium text-gray-900 pr-4">
                Q. {faq.question}
              </span>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
