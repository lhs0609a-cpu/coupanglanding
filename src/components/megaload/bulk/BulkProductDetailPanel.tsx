'use client';

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Pencil, Code2, FileText,
} from 'lucide-react';
import BulkImageGrid from './BulkImageGrid';
import PayloadPreviewPanel, { type PayloadPreviewData } from './PayloadPreviewPanel';
import CoupangFieldsSection from './CoupangFieldsSection';
import DetailPageContentTab from './DetailPageContentTab';
import type { EditableProduct } from './types';

interface ImageItem {
  id: string;
  url: string;
}

export interface PayloadPreviewState {
  loading: boolean;
  data: PayloadPreviewData | null;
  error: string;
}

interface BulkProductDetailPanelProps {
  product: EditableProduct | null;
  imageUrls: string[];
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onUpdate: (uid: string, field: string, value: string | number | string[] | Record<string, string>) => void;
  onCategoryClick: (uid: string) => void;
  onReorderImages: (uid: string, newOrder: string[]) => void;
  onRemoveImage: (uid: string, imageIndex: number) => void;
  payloadPreview?: PayloadPreviewState;
  onRequestPreview?: (uid: string) => void;
  preUploadedUrls?: Record<string, { mainImageUrls: string[]; detailImageUrls?: string[]; reviewImageUrls?: string[]; infoImageUrls?: string[] }>;
}

export default function BulkProductDetailPanel({
  product,
  imageUrls,
  onClose,
  onNavigate,
  onUpdate,
  onCategoryClick,
  onReorderImages,
  onRemoveImage,
  payloadPreview,
  onRequestPreview,
  preUploadedUrls,
}: BulkProductDetailPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'detail' | 'payload'>('info');

  // Keyboard navigation
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp' && !editingName) {
        e.preventDefault();
        onNavigate('prev');
      } else if (e.key === 'ArrowDown' && !editingName) {
        e.preventDefault();
        onNavigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose, onNavigate, editingName]);

  // Sync name value + reset tab on product change
  useEffect(() => {
    if (product) {
      setNameValue(product.editedName);
      setEditingName(false);
      setActiveTab('info');
    }
  }, [product?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch preview when panel opens (if category is set)
  useEffect(() => {
    if (product && product.editedCategoryCode && onRequestPreview && !payloadPreview?.data && !payloadPreview?.loading) {
      onRequestPreview(product.uid);
    }
  }, [product?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also fetch when payload tab is explicitly selected
  useEffect(() => {
    if (activeTab === 'payload' && product && onRequestPreview && !payloadPreview?.data && !payloadPreview?.loading) {
      onRequestPreview(product.uid);
    }
  }, [activeTab, product?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameSave = useCallback(() => {
    if (product && nameValue.trim() !== product.editedName) {
      onUpdate(product.uid, 'editedName', nameValue.trim());
    }
    setEditingName(false);
  }, [product, nameValue, onUpdate]);

  const imageItems: ImageItem[] = imageUrls.map((url, i) => ({
    id: `img-${i}`,
    url,
  }));

  const handleImageReorder = useCallback((newOrder: ImageItem[]) => {
    if (!product) return;
    const newUrls = newOrder.map(item => item.url);
    onReorderImages(product.uid, newUrls);
  }, [product, onReorderImages]);

  const handleImageRemove = useCallback((id: string) => {
    if (!product) return;
    const index = parseInt(id.split('-').pop() || '0');
    onRemoveImage(product.uid, index);
  }, [product, onRemoveImage]);

  const allIssues = [
    ...(product?.validationErrors || []),
    ...(product?.validationWarnings || []),
  ];

  return (
    <AnimatePresence>
      {product && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-[640px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-400">{product.productCode}</span>
                {product.validationStatus === 'ready' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {product.validationStatus === 'warning' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                {product.validationStatus === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onNavigate('prev')}
                  className="p-1.5 hover:bg-gray-100 rounded transition"
                  title="이전 상품 (↑)"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onNavigate('next')}
                  className="p-1.5 hover:bg-gray-100 rounded transition"
                  title="다음 상품 (↓)"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-gray-100 rounded transition ml-2"
                  title="닫기 (ESC)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  activeTab === 'info'
                    ? 'border-[#E31837] text-[#E31837]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                상품 정보
              </button>
              <button
                onClick={() => setActiveTab('detail')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  activeTab === 'detail'
                    ? 'border-[#E31837] text-[#E31837]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                상세페이지
              </button>
              <button
                onClick={() => setActiveTab('payload')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  activeTab === 'payload'
                    ? 'border-[#E31837] text-[#E31837]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                페이로드 미리보기
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeTab === 'detail' ? (
                <DetailPageContentTab
                  product={product}
                  onUpdate={onUpdate}
                  preUploadedUrls={preUploadedUrls?.[product.uid]}
                />
              ) : activeTab === 'info' ? (
                <>
                  {/* === 기본 정보 섹션 === */}
                  {/* Product Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">상품명 (판매자용)</label>
                    {editingName ? (
                      <div className="space-y-2">
                        <textarea
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-[#E31837] rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] outline-none resize-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleNameSave();
                            }
                            if (e.key === 'Escape') {
                              setEditingName(false);
                              setNameValue(product.editedName);
                            }
                          }}
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{nameValue.length}자</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditingName(false); setNameValue(product.editedName); }}
                              className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              취소
                            </button>
                            <button
                              onClick={handleNameSave}
                              className="px-3 py-1 text-xs text-white bg-[#E31837] rounded hover:bg-red-700"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingName(true)}
                        className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 hover:border-[#E31837] transition group flex items-start gap-2"
                      >
                        <span className="flex-1">{product.editedName}</span>
                        <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#E31837] shrink-0 mt-0.5" />
                      </button>
                    )}
                  </div>

                  {/* Brand */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">브랜드</label>
                    <input
                      type="text"
                      value={product.editedBrand}
                      onChange={(e) => onUpdate(product.uid, 'editedBrand', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
                      placeholder="브랜드 미입력"
                    />
                  </div>

                  {/* Price */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">원가</label>
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 tabular-nums">
                        {product.sourcePrice.toLocaleString()}원
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">판매가</label>
                      <input
                        type="number"
                        value={product.editedSellingPrice}
                        onChange={(e) => onUpdate(product.uid, 'editedSellingPrice', Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#E31837] font-medium text-right tabular-nums focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">카테고리</label>
                    <button
                      onClick={() => onCategoryClick(product.uid)}
                      className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:border-[#E31837] transition flex items-center gap-2"
                    >
                      {product.editedCategoryCode ? (
                        <>
                          <span className="flex-1 text-gray-900">{product.editedCategoryName}</span>
                          {product.categoryConfidence > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              product.categoryConfidence >= 0.8 ? 'bg-green-100 text-green-600' :
                              product.categoryConfidence >= 0.5 ? 'bg-yellow-100 text-yellow-600' :
                              'bg-gray-100 text-gray-400'
                            }`}>
                              {Math.round(product.categoryConfidence * 100)}%
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">{product.categorySource}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">카테고리를 선택해주세요</span>
                      )}
                    </button>
                  </div>

                  {/* === 쿠팡 API 필드 섹션 === */}
                  {product.editedCategoryCode && (
                    <div className="border-t border-gray-100 pt-4">
                      <h3 className="text-xs font-semibold text-gray-600 mb-3">쿠팡 API 필드</h3>
                      <CoupangFieldsSection
                        product={product}
                        previewData={payloadPreview?.data ?? null}
                        previewLoading={payloadPreview?.loading ?? false}
                        previewError={payloadPreview?.error ?? ''}
                        onUpdate={onUpdate}
                      />
                    </div>
                  )}

                  {/* Validation Issues */}
                  {allIssues.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">검증 결과</label>
                      <div className="space-y-1.5">
                        {allIssues.map((issue, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                              issue.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                            }`}
                          >
                            {issue.severity === 'error' ? (
                              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            )}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Images */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      대표 이미지 ({imageUrls.length}장) — 드래그로 순서 변경
                    </label>
                    <BulkImageGrid
                      images={imageItems}
                      onReorder={handleImageReorder}
                      onRemove={handleImageRemove}
                    />
                  </div>

                  {/* Folder Path */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">폴더 경로</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500 font-mono break-all">
                      {product.folderPath}
                    </div>
                  </div>
                </>
              ) : (
                /* Payload Preview Tab */
                <PayloadPreviewPanel
                  loading={payloadPreview?.loading ?? false}
                  data={payloadPreview?.data ?? null}
                  error={payloadPreview?.error ?? (product.editedCategoryCode ? '' : '카테고리가 지정되지 않았습니다. 먼저 카테고리를 선택해주세요.')}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
