'use client';

import { useState, useCallback } from 'react';
import {
  Loader2, AlertTriangle, Copy, Check, ChevronDown, ChevronRight,
  Package, FileText, Tag, Image as ImageIcon, Truck, Hash,
} from 'lucide-react';

interface ExtractedOption {
  name: string;
  value: string;
  unit?: string;
}

interface NoticeField {
  noticeCategoryDetailName: string;
  content: string;
}

interface NoticeCategory {
  name: string;
  fieldCount: number;
  fields: NoticeField[];
}

interface AttributeInfo {
  name: string;
  required: boolean;
  dataType: string;
}

interface PreviewMeta {
  extractedOptions: ExtractedOption[];
  optionConfidence: number;
  optionWarnings: string[];
  totalUnitCount?: number;
  noticeCategories: NoticeCategory[];
  attributeCount: number;
  attributes: AttributeInfo[];
  imageCount: number;
  estimatedPayloadSize: number;
}

export interface PayloadPreviewData {
  payload: Record<string, unknown>;
  meta: PreviewMeta;
}

interface PayloadPreviewPanelProps {
  loading: boolean;
  data: PayloadPreviewData | null;
  error: string;
}

export default function PayloadPreviewPanel({ loading, data, error }: PayloadPreviewPanelProps) {
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const text = JSON.stringify(data.payload, null, 2);
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <span className="text-sm">페이로드 빌드 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <span className="text-sm text-red-600">{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-300">
        <Package className="w-8 h-8 mb-3" />
        <span className="text-sm">탭을 클릭하면 페이로드를 미리 봅니다</span>
      </div>
    );
  }

  const { payload, meta } = data;
  const p = payload as Record<string, unknown>;
  const items = (p.sellerProductItemList as Record<string, unknown>[] | undefined) || [];

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return (
    <div className="space-y-5">
      {/* 옵션 추출 결과 */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <Tag className="w-3.5 h-3.5" /> 옵션 추출 결과
        </h4>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          {meta.extractedOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {meta.extractedOptions.map((opt, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs">
                  <span className="text-gray-500">{opt.name}:</span>
                  <span className="font-medium text-gray-800">{opt.value}{opt.unit || ''}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400">추출된 옵션 없음</span>
          )}
          <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <span>신뢰도: <strong className={meta.optionConfidence >= 80 ? 'text-green-600' : meta.optionConfidence >= 50 ? 'text-yellow-600' : 'text-gray-400'}>{meta.optionConfidence}%</strong></span>
            {meta.totalUnitCount !== undefined && (
              <span>unitCount: <strong className="text-gray-700">{meta.totalUnitCount}</strong></span>
            )}
          </div>
          {meta.optionWarnings.length > 0 && (
            <div className="space-y-1">
              {meta.optionWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-orange-600">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 고시정보 */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <FileText className="w-3.5 h-3.5" /> 고시정보
        </h4>
        <div className="space-y-2">
          {meta.noticeCategories.length > 0 ? meta.noticeCategories.map((nc, i) => (
            <NoticeSection key={i} category={nc} />
          )) : (
            <span className="text-xs text-gray-400">고시정보 없음</span>
          )}
        </div>
      </section>

      {/* 속성 */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <Hash className="w-3.5 h-3.5" /> 속성 ({meta.attributeCount}개)
        </h4>
        {meta.attributes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {meta.attributes.map((attr, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${attr.required ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                {attr.name}
                {attr.required && <span className="text-red-400 text-[9px]">*</span>}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400">속성 없음</span>
        )}
      </section>

      {/* 핵심 필드 요약 */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
          <Package className="w-3.5 h-3.5" /> 핵심 필드 요약
        </h4>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <KeyValue label="displayCategoryCode" value={String(p.displayCategoryCode || '-')} />
            <KeyValue label="salePrice" value={`${Number(items[0]?.originalPrice || 0).toLocaleString()}원`} />
            <KeyValue
              label="sellerProductName"
              value={String(p.sellerProductName || '-')}
              sub={`${String(p.sellerProductName || '').length}자`}
              full
            />
            <KeyValue
              label="displayProductName"
              value={String(p.displayProductName || '-')}
              sub={`${String(p.displayProductName || '').length}자`}
              full
            />
            <KeyValue label="unitCount" value={String(items[0]?.unitCount ?? '-')} />
            <KeyValue
              label="이미지"
              value={`${meta.imageCount}장`}
              icon={<ImageIcon className="w-3 h-3 text-gray-400" />}
            />
            <KeyValue
              label="배송"
              value={String(p.deliveryChargeType === 'FREE' ? '무료배송' : p.deliveryChargeType === 'CONDITIONAL_FREE' ? '조건부 무료' : '유료배송')}
              icon={<Truck className="w-3 h-3 text-gray-400" />}
            />
            <KeyValue label="페이로드 크기" value={`~${formatBytes(meta.estimatedPayloadSize)}`} />
          </div>
        </div>
      </section>

      {/* 전체 JSON */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setJsonExpanded(!jsonExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-[#E31837] transition"
          >
            {jsonExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            전체 JSON
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? '복사됨' : 'JSON 복사'}
          </button>
        </div>
        {jsonExpanded && (
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-[11px] leading-relaxed overflow-x-auto max-h-[600px] overflow-y-auto font-mono">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

// ---- Sub-components ----

function NoticeSection({ category }: { category: NoticeCategory }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-100 transition"
      >
        <span className="font-medium text-gray-700">{category.name} ({category.fieldCount}개 필드)</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {category.fields.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-gray-500 shrink-0 w-28 truncate" title={f.noticeCategoryDetailName}>{f.noticeCategoryDetailName}</span>
              <span className="text-gray-800 break-all">{f.content || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyValue({ label, value, sub, icon, full }: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-gray-500">{icon}{label}: </span>
      <strong className="text-gray-800 break-all">{value}</strong>
      {sub && <span className="text-[10px] text-gray-400 ml-1">({sub})</span>}
    </div>
  );
}
