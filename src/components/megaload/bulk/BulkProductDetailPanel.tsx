'use client';

import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Code2, FileText,
} from 'lucide-react';
import PayloadPreviewPanel, { type PayloadPreviewData } from './PayloadPreviewPanel';
import CoupangFieldsSection from './CoupangFieldsSection';
import DetailPageContentTab from './DetailPageContentTab';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
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
  preventionConfig?: PreventionConfig;
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
  preventionConfig,
}: BulkProductDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'detail' | 'payload'>('info');
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  // Browser mode: load all main images as objectURLs
  const [browserImageUrls, setBrowserImageUrls] = useState<string[]>([]);

  // Keyboard navigation
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigate('prev');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigate('next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose, onNavigate]);

  // Reset tab on product change
  useEffect(() => {
    if (product) {
      setActiveTab('info');
      setIssuesExpanded(false);
    }
  }, [product?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser mode: load objectURLs from scannedMainImages
  // scannedMainImages 참조를 추적하여 필터링 후 갱신된 이미지 표시
  const scannedMainImagesRef = product?.scannedMainImages;

  useEffect(() => {
    if (!scannedMainImagesRef?.length || imageUrls.length > 0) {
      setBrowserImageUrls([]);
      return;
    }

    // objectUrl이 있으면 바로 사용 (핸들 만료 무관)
    const prebuiltUrls = scannedMainImagesRef
      .map(img => img.objectUrl)
      .filter((u): u is string => !!u);

    if (prebuiltUrls.length > 0) {
      setBrowserImageUrls(prebuiltUrls);
      return;
    }

    // 폴백: 핸들에서 직접 로드
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      for (const img of scannedMainImagesRef) {
        if (cancelled || !img.handle) continue;
        try {
          const file = await img.handle.getFile();
          urls.push(URL.createObjectURL(file));
        } catch { /* handle may be stale */ }
      }
      if (!cancelled) setBrowserImageUrls([...urls]);
    })();

    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [product?.uid, imageUrls.length, scannedMainImagesRef]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Display images: CDN/server URLs > browser objectURLs
  const displayImageUrls = imageUrls.length > 0 ? imageUrls : browserImageUrls;
  const imageItems: ImageItem[] = displayImageUrls.map((url, i) => ({
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

  const errorCount = product?.validationErrors?.length || 0;
  const warningCount = product?.validationWarnings?.length || 0;
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
            className="fixed top-0 right-0 h-full w-[780px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
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

            {/* Validation Issues Banner */}
            {allIssues.length > 0 && (
              <div className="border-b border-gray-200">
                <button
                  onClick={() => setIssuesExpanded(!issuesExpanded)}
                  className="w-full flex items-center gap-2 px-6 py-2 text-xs hover:bg-gray-50 transition"
                >
                  {errorCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium">
                      <XCircle className="w-3 h-3" />{errorCount}개 에러
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-medium">
                      <AlertTriangle className="w-3 h-3" />{warningCount}개 경고
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className="text-[10px] text-gray-400">{issuesExpanded ? '접기' : '펼치기'}</span>
                </button>
                {issuesExpanded && (
                  <div className="px-6 pb-2 space-y-1">
                    {allIssues.map((issue, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 px-3 py-1.5 rounded text-xs ${
                          issue.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                        }`}
                      >
                        {issue.severity === 'error' ? (
                          <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        )}
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'detail' ? (
                <DetailPageContentTab
                  product={product}
                  onUpdate={onUpdate}
                  preUploadedUrls={preUploadedUrls?.[product.uid]}
                />
              ) : activeTab === 'info' ? (
                <CoupangFieldsSection
                  product={product}
                  previewData={payloadPreview?.data ?? null}
                  previewLoading={payloadPreview?.loading ?? false}
                  previewError={payloadPreview?.error ?? ''}
                  onUpdate={onUpdate}
                  onCategoryClick={onCategoryClick}
                  imageItems={imageItems}
                  onImageReorder={handleImageReorder}
                  onImageRemove={handleImageRemove}
                  preventionConfig={preventionConfig}
                />
              ) : (
                <PayloadPreviewPanel
                  loading={payloadPreview?.loading ?? false}
                  data={payloadPreview?.data ?? null}
                  error={payloadPreview?.error ?? (product.editedCategoryCode ? '' : '카테고리가 지정되지 않았습니다. 먼저 카테고리를 선택해주세요.')}
                />
              )}
            </div>

            {/* Footer — folder path */}
            <div className="border-t border-gray-100 px-6 py-2">
              <p className="text-[10px] text-gray-400 font-mono truncate" title={product.folderPath}>
                {product.folderPath}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
