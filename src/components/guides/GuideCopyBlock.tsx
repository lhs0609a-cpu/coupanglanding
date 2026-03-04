'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { GuideCopyableTemplate } from '@/lib/data/guides';

interface GuideCopyBlockProps {
  template: GuideCopyableTemplate;
}

export default function GuideCopyBlock({ template }: GuideCopyBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(template.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{template.label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition bg-white border border-gray-300 hover:bg-gray-100 text-gray-600"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-600">복사됨!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              복사하기
            </>
          )}
        </button>
      </div>
      <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
        {template.text}
      </pre>
    </div>
  );
}
