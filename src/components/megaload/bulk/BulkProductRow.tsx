'use client';

import { memo, useState, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, Pencil, ChevronDown, ExternalLink, Ban,
} from 'lucide-react';
import type { EditableProduct } from './types';

// Shared grid template (matches BulkProductTable header)
export const GRID_TEMPLATE = '44px 40px 56px 1fr 88px 72px 168px 48px 36px';

interface BulkProductRowProps {
  product: EditableProduct;
  style: React.CSSProperties; // from react-window
  isSelected?: boolean; // row selected for detail panel
  thumbnailUrl: string | null;
  onLoadThumbnail: (uid: string) => void;
  onToggle: (uid: string) => void;
  onUpdate: (uid: string, field: string, value: string | number) => void;
  onCategoryClick: (uid: string) => void;
  onRowClick: (uid: string) => void;
}

const BulkProductRow = memo(function BulkProductRow({
  product: p,
  style,
  isSelected,
  thumbnailUrl,
  onLoadThumbnail,
  onToggle,
  onUpdate,
  onCategoryClick,
  onRowClick,
}: BulkProductRowProps) {
  const [thumbLoaded, setThumbLoaded] = useState(false);

  useEffect(() => {
    if (!thumbnailUrl) {
      onLoadThumbnail(p.uid);
    }
  }, [thumbnailUrl, p.uid, onLoadThumbnail]);

  const fieldHasError = (field: string) =>
    p.validationErrors?.some((e) => e.field === field) || false;
  const fieldHasWarning = (field: string) =>
    p.validationWarnings?.some((w) => w.field === field) || false;

  const fieldBorderClass = (field: string, base: string) => {
    if (fieldHasError(field)) return base.replace('border-transparent', 'border-red-400');
    if (fieldHasWarning(field)) return base.replace('border-transparent', 'border-orange-300');
    return base;
  };

  const allIssues = [...(p.validationErrors || []), ...(p.validationWarnings || [])];
  const tooltipText = allIssues.map((i) => `${i.severity === 'error' ? '[오류]' : '[경고]'} ${i.message}`).join('\n');

  const mainImgCount = p.scannedMainImages?.length ?? p.mainImageCount;

  return (
    <div
      style={{ ...style, gridTemplateColumns: GRID_TEMPLATE }}
      className={`grid items-center border-b border-gray-100 text-sm cursor-pointer transition-colors ${
        !p.selected ? 'opacity-50 border-l-2 border-l-red-300' : ''
      } ${p.validationStatus === 'error' && p.selected ? 'bg-red-50/50' : ''} ${
        isSelected ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'
      }`}
      onClick={(e) => {
        // Don't trigger row click for input/button/checkbox/anchor interactions
        if ((e.target as HTMLElement).closest('input, button, a')) return;
        onRowClick(p.uid);
      }}
      role="row"
    >
      {/* Checkbox + validation */}
      <div className="px-2 flex items-center gap-1">
        <input
          type="checkbox"
          checked={p.selected}
          onChange={() => onToggle(p.uid)}
          className="rounded border-gray-300"
          onClick={(e) => e.stopPropagation()}
        />
        {p.validationStatus && (
          <span title={tooltipText} className="cursor-help">
            {p.validationStatus === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
            {p.validationStatus === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
            {p.validationStatus === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
          </span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="px-1 flex items-center justify-center">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className={`w-9 h-9 rounded object-cover bg-gray-100 transition-opacity ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setThumbLoaded(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
            {mainImgCount || 0}
          </div>
        )}
      </div>

      {/* Code — clickable source link */}
      <div className="px-2 text-xs font-mono truncate">
        <a
          href={p.sourceUrl || `https://search.shopping.naver.com/catalog/${p.productCode}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-gray-500 hover:text-blue-600 transition"
          title="원본 상품 보기"
          onClick={(e) => e.stopPropagation()}
        >
          {p.productCode}
          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
        </a>
      </div>

      {/* Name */}
      <div className="px-2 min-w-0">
        <input
          type="text"
          value={p.editedName}
          onChange={(e) => onUpdate(p.uid, 'editedName', e.target.value)}
          title={fieldHasError('name') ? p.validationErrors?.find((e) => e.field === 'name')?.message : undefined}
          className={fieldBorderClass('name', `w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E31837] rounded text-sm text-gray-900 focus:ring-1 focus:ring-[#E31837] outline-none transition truncate${!p.selected ? ' line-through text-gray-400' : ''}`)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Source price */}
      <div className="px-2 text-sm text-gray-700 text-right tabular-nums">
        {p.sourcePrice.toLocaleString()}
      </div>

      {/* Selling price */}
      <div className="px-2">
        <input
          type="number"
          value={p.editedSellingPrice}
          onChange={(e) => onUpdate(p.uid, 'editedSellingPrice', Number(e.target.value))}
          title={fieldHasError('sellingPrice') ? p.validationErrors?.find((e) => e.field === 'sellingPrice')?.message : undefined}
          className={fieldBorderClass('sellingPrice', "w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E31837] rounded text-sm text-[#E31837] font-medium text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none transition")}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Category */}
      <div className="px-2">
        <button
          onClick={(e) => { e.stopPropagation(); onCategoryClick(p.uid); }}
          className="w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 transition group"
        >
          {p.editedCategoryCode ? (
            <>
              <span className="text-xs text-gray-700 truncate flex-1">{p.editedCategoryName}</span>
              {p.categoryConfidence > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${
                  p.categoryConfidence >= 0.8 ? 'bg-green-100 text-green-600' :
                  p.categoryConfidence >= 0.5 ? 'bg-yellow-100 text-yellow-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {Math.round(p.categoryConfidence * 100)}%
                </span>
              )}
              <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" />
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">카테고리 선택</span>
              <ChevronDown className="w-3 h-3 text-gray-300 shrink-0" />
            </>
          )}
        </button>
      </div>

      {/* Image counts */}
      <div className="px-2 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span title="대표">{mainImgCount}</span>
        <span>/</span>
        <span title="상세">{p.detailImageCount}</span>
      </div>

      {/* Skip (exclude) button */}
      <div className="flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(p.uid); }}
          title={p.selected ? '등록에서 제외' : '등록에 포함'}
          className={`p-1 rounded transition ${
            p.selected
              ? 'text-gray-300 hover:text-red-500 hover:bg-red-50'
              : 'text-red-500 bg-red-50 hover:bg-red-100'
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

export default BulkProductRow;
