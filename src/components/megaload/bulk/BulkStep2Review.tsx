'use client';

import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Search, Zap, Filter, Upload, Eye, BarChart3, CircleDot, Package, ClipboardCopy, ChevronDown, ChevronUp, Ban,
  ShieldCheck, FlaskConical, Lock, Image as ImageIcon, FileText, Type, PackageX,
} from 'lucide-react';
import type { PreflightProductResult, CanaryResult } from '@/lib/megaload/types';
import BulkProductTable from './BulkProductTable';
import BulkProductDetailPanel, { type PayloadPreviewState } from './BulkProductDetailPanel';
import CategoryCascadingPicker from './CategoryCascadingPicker';
import type { PayloadPreviewData } from './PayloadPreviewPanel';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
import type { EditableProduct, CategoryItem, FilterMode, SortField, SortDirection, FailureDiagnostic } from './types';
import type { CategoryMetadata } from '@/lib/megaload/services/product-validator';

interface BulkStep2ReviewProps {
  products: EditableProduct[];
  autoMatchingProgress: { done: number; total: number } | null;
  autoMatchError?: string;
  autoMatchStats?: { matched: number; failed: number; total: number } | null;
  categoryFailures?: FailureDiagnostic[];
  onRetryAutoCategory?: () => void;
  validating: boolean;
  validationPhase: string;
  imagePreuploadProgress: {
    total: number; done: number; phase: string;
    failureCount?: number; failureReasons?: Record<string, number>; sampleFailure?: string;
  };
  imagePreuploadCache: Record<string, { mainImageUrls: string[]; detailImageUrls?: string[]; reviewImageUrls?: string[]; infoImageUrls?: string[] }>;
  dryRunResults: Record<string, { payloadPreview?: { hasDetailPage?: boolean }; missingRequiredFields?: string[] }>;
  deliveryChargeType: string;
  deliveryCharge: number;
  freeShipOverAmount: number;
  selectedCount: number;
  totalSourcePrice: number;
  totalSellingPrice: number;
  validationReadyCount: number;
  validationWarningCount: number;
  validationErrorCount: number;
  registerableCount: number;
  // Category search
  categorySearchTarget: string | null;
  categoryKeyword: string;
  categoryResults: CategoryItem[];
  searchingCategory: boolean;
  // Auto-fill pipeline progress
  imageFilterProgress: { done: number; total: number; phase: 'idle' | 'running' | 'complete' };
  titleGenProgress: { done: number; total: number } | null;
  contentGenProgress: { done: number; total: number } | null;
  // Bulk actions
  onSetProducts: React.Dispatch<React.SetStateAction<EditableProduct[]>>;
  onToggle: (uid: string) => void;
  onToggleAll: () => void;
  onUpdate: (uid: string, field: string, value: string | number | boolean | string[] | number[] | Record<string, string>) => void;
  onCategoryClick: (uid: string) => void;
  onSetCategorySearchTarget: (v: string | null) => void;
  onSetCategoryKeyword: (v: string) => void;
  onSearchCategory: () => void;
  onSelectCategory: (cat: CategoryItem) => void;
  onDeepValidation: () => void;
  onRegister: () => void;
  onBack: () => void;
  // Thumbnail
  thumbnailCache: Record<string, string | null>;
  onLoadThumbnail: (uid: string) => void;
  // Image reorder
  onReorderImages: (uid: string, newOrder: string[]) => void;
  onRemoveImage: (uid: string, imageIndex: number) => void;
  onToggleAutoExclude?: (uid: string, imageIndex: number) => void;
  onPrewarmProduct?: (uid: string) => void;
  onPrewarmCancel?: (uid: string) => void;
  onSwapStockImage?: (uid: string, imageIndex: number, newCdnUrl: string) => void;
  onTogglePromoteReview?: (uid: string, reviewIndex: number) => void;
  // Detail panel image URLs
  getDetailImageUrls: (uid: string) => string[];
  // Payload preview (shipping info needed for preview API)
  selectedOutbound?: string;
  selectedReturn?: string;
  returnCharge?: number;
  contactNumber?: string;
  includeReviewImages?: boolean;
  noticeOverrides?: Record<string, string>;
  preventionConfig?: PreventionConfig;
  categoryMetaCache?: Record<string, CategoryMetadata>;
  // Preflight
  preflightPhase?: 'idle' | 'running' | 'complete' | 'error';
  preflightResults?: Record<string, PreflightProductResult>;
  preflightStats?: { total: number; pass: number; fail: number; warn: number } | null;
  preflightDurationMs?: number;
  // Canary
  canaryPhase?: 'idle' | 'running' | 'complete' | 'error';
  canaryResult?: CanaryResult | null;
  canaryTargetUid?: string | null;
  canRegister?: boolean;
  onPreflight?: () => void;
  onCanary?: (uid: string) => void;
  // 카테고리 정확도 개선
  lowConfidenceCount?: number;
  rematchingCategory?: boolean;
  onRematchLowConfidence?: () => void;
  onFetchCategorySuggestions?: (uid: string) => Promise<CategoryItem[]>;
  // 품절 체크
  stockCheckPhase?: 'idle' | 'running' | 'complete';
  stockCheckProgress?: { done: number; total: number };
  stockCheckResults?: Record<string, { status: import('./useStockCheck').StockStatus; options?: { optionName: string; status: 'in_stock' | 'sold_out' }[]; isOptionProduct?: boolean; soldOutOptionCount?: number; totalOptionCount?: number }>;
  stockCheckStats?: { inStock: number; soldOut: number; removed: number; unknown: number; error: number } | null;
  onStockCheck?: () => void;
  onExcludeSoldOut?: () => void;
}

// P1-2: 파이프라인 진행률 섹션 — memo 분리로 테이블 re-render 방지
const PipelineProgress = memo(function PipelineProgress({
  imageFilterProgress,
  titleGenProgress,
  contentGenProgress,
}: {
  imageFilterProgress: { done: number; total: number; phase: 'idle' | 'running' | 'complete' };
  titleGenProgress: { done: number; total: number } | null;
  contentGenProgress: { done: number; total: number } | null;
}) {
  if (imageFilterProgress.phase === 'idle' && titleGenProgress === null && contentGenProgress === null) return null;

  const steps: { label: string; icon: React.ReactNode; done: number; total: number; phase: 'idle' | 'running' | 'complete'; color: string }[] = [
    {
      label: '이미지 다양성 분석',
      icon: <ImageIcon className="w-3.5 h-3.5" />,
      done: imageFilterProgress.done,
      total: imageFilterProgress.total,
      phase: imageFilterProgress.phase,
      color: 'blue',
    },
    {
      label: '노출상품명 생성',
      icon: <Type className="w-3.5 h-3.5" />,
      done: titleGenProgress?.done ?? 0,
      total: titleGenProgress?.total ?? 0,
      phase: titleGenProgress === null
        ? 'idle'
        : titleGenProgress.done >= titleGenProgress.total ? 'complete' : 'running',
      color: 'purple',
    },
    {
      label: '상세페이지 생성',
      icon: <FileText className="w-3.5 h-3.5" />,
      done: contentGenProgress?.done ?? 0,
      total: contentGenProgress?.total ?? 0,
      phase: contentGenProgress === null
        ? 'idle'
        : contentGenProgress.done >= contentGenProgress.total ? 'complete' : 'running',
      color: 'green',
    },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-gray-700 mb-3">자동 파이프라인</h4>
      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : (s.phase === 'complete' ? 100 : 0);
          const textColor = s.phase === 'complete' ? 'text-green-600' : s.phase === 'running' ? `text-${s.color}-600` : 'text-gray-400';
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 w-32 text-xs ${textColor}`}>
                {s.phase === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : s.icon}
                <span>{s.label}</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${s.phase === 'complete' ? 'bg-green-500' : s.phase === 'running' ? (s.color === 'blue' ? 'bg-blue-500' : s.color === 'purple' ? 'bg-purple-500' : 'bg-green-500') : 'bg-gray-200'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] w-12 text-right text-gray-500">
                {s.phase !== 'idle' && s.total > 0 ? `${s.done}/${s.total}` : s.phase === 'complete' ? '완료' : '대기'}
              </span>
              <span className={`text-[10px] w-10 text-right font-medium ${textColor}`}>
                {s.phase !== 'idle' ? `${pct}%` : ''}
              </span>
              <span className="w-4 text-center">
                {s.phase === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : s.phase === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <CircleDot className="w-3.5 h-3.5 text-gray-300" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// P1-1: React.memo 적용
export default memo(function BulkStep2Review({
  products, autoMatchingProgress, autoMatchError, autoMatchStats, categoryFailures, onRetryAutoCategory, validating, validationPhase,
  imagePreuploadProgress, imagePreuploadCache, dryRunResults,
  imageFilterProgress, titleGenProgress, contentGenProgress,
  deliveryChargeType, deliveryCharge, freeShipOverAmount,
  selectedCount, totalSourcePrice, totalSellingPrice,
  validationReadyCount, validationWarningCount, validationErrorCount, registerableCount,
  categorySearchTarget, categoryKeyword, categoryResults, searchingCategory,
  onSetProducts, onToggle, onToggleAll, onUpdate, onCategoryClick,
  onSetCategorySearchTarget, onSetCategoryKeyword, onSearchCategory, onSelectCategory,
  onDeepValidation, onRegister, onBack,
  thumbnailCache, onLoadThumbnail,
  onReorderImages, onRemoveImage, onToggleAutoExclude, onPrewarmProduct, onPrewarmCancel, onSwapStockImage, onTogglePromoteReview, getDetailImageUrls,
  selectedOutbound, selectedReturn, returnCharge, contactNumber, includeReviewImages, noticeOverrides,
  preventionConfig,
  categoryMetaCache,
  preflightPhase, preflightResults, preflightStats, preflightDurationMs,
  canaryPhase, canaryResult, canaryTargetUid, canRegister,
  onPreflight, onCanary,
  lowConfidenceCount, rematchingCategory, onRematchLowConfidence,
  stockCheckPhase, stockCheckProgress, stockCheckResults, stockCheckStats, onStockCheck, onExcludeSoldOut,
}: BulkStep2ReviewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showFailures, setShowFailures] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Bulk actions
  const [bulkAction, setBulkAction] = useState<'brand' | 'category' | 'price' | null>(null);
  const [bulkBrandValue, setBulkBrandValue] = useState('');
  const [bulkPriceAdjust, setBulkPriceAdjust] = useState(0);

  // Payload preview state
  const [payloadPreview, setPayloadPreview] = useState<PayloadPreviewState>({ loading: false, data: null, error: '' });
  const previewAbortRef = useRef<AbortController | null>(null);

  // Reset preview when selected product changes
  useEffect(() => {
    setPayloadPreview({ loading: false, data: null, error: '' });
    previewAbortRef.current?.abort();
  }, [selectedUid]);

  const handleRequestPreview = useCallback(async (uid: string) => {
    const product = products.find(p => p.uid === uid);
    if (!product) return;
    if (!product.editedCategoryCode) {
      setPayloadPreview({ loading: false, data: null, error: '카테고리가 지정되지 않았습니다.' });
      return;
    }

    previewAbortRef.current?.abort();
    const abort = new AbortController();
    previewAbortRef.current = abort;

    setPayloadPreview({ loading: true, data: null, error: '' });

    try {
      const cached = imagePreuploadCache[uid];
      // ★ 사용자 선택(editedDetailImageOrder/editedReviewImageOrder) 반영 — 선택 외 이미지 미리보기 금지
      const filterByOrder = <T,>(arr: T[], order: number[] | undefined): T[] => {
        if (!order) return arr;
        return order.filter(i => i >= 0 && i < arr.length).map(i => arr[i]);
      };
      const preUploadedUrls = cached ? {
        mainImageUrls: cached.mainImageUrls || [],
        detailImageUrls: filterByOrder(cached.detailImageUrls || [], product.editedDetailImageOrder),
        reviewImageUrls: filterByOrder(cached.reviewImageUrls || [], product.editedReviewImageOrder),
        infoImageUrls: cached.infoImageUrls || [],
      } : undefined;

      const res = await fetch('/api/megaload/products/bulk-register/preview-payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            productCode: product.productCode,
            folderPath: product.folderPath,
            name: product.editedName,
            brand: product.editedBrand,
            sellingPrice: product.editedSellingPrice,
            sourcePrice: product.sourcePrice,
            categoryCode: product.editedCategoryCode,
            tags: product.tags,
            description: product.description,
            mainImages: product.mainImages,
            // ★ 서버 모드 경로(paths)도 사용자 선택 반영
            detailImages: filterByOrder(product.detailImages || [], product.editedDetailImageOrder),
            reviewImages: filterByOrder(product.reviewImages || [], product.editedReviewImageOrder),
            infoImages: product.infoImages,
            // ★ 카테고리 수동 변경 시 클라이언트에서 재생성된 본문/제목/리뷰를 서버 미리보기에 전달.
            //   누락 시 서버는 빈 본문으로 detailHtml 생성 → 카테고리 바뀌어도 미리보기 동일.
            //   등록 경로(useBulkRegisterActions.ts:2161-2170) 와 동일 override 필드명.
            displayProductNameOverride: product.editedDisplayProductName,
            descriptionOverride: product.editedDescription,
            storyParagraphsOverride: product.editedStoryParagraphs,
            reviewTextsOverride: product.editedReviewTexts,
            contentBlocksOverride: product.editedContentBlocks,
            noticeValuesOverride: product.editedNoticeValues,
          },
          deliveryInfo: {
            deliveryCompanyCode: 'CJGLS',
            deliveryChargeType,
            deliveryCharge: deliveryChargeType === 'FREE' ? 0 : deliveryCharge,
            freeShipOverAmount,
            deliveryChargeOnReturn: returnCharge || 5000,
            outboundShippingPlaceCode: selectedOutbound || '',
          },
          returnInfo: {
            returnCenterCode: selectedReturn || '',
            returnCharge: returnCharge || 5000,
            companyContactNumber: contactNumber || '',
            afterServiceContactNumber: contactNumber || '',
            afterServiceInformation: '상품 수령 후 7일 이내 반품/교환 가능',
          },
          stock: 999,
          includeReviewImages: includeReviewImages ?? true,
          noticeOverrides,
          preUploadedUrls,
        }),
        signal: abort.signal,
      });

      if (abort.signal.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '서버 오류' }));
        setPayloadPreview({ loading: false, data: null, error: data.error || `HTTP ${res.status}` });
        return;
      }

      const data = await res.json() as PayloadPreviewData;
      if (!abort.signal.aborted) {
        setPayloadPreview({ loading: false, data, error: '' });
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setPayloadPreview({ loading: false, data: null, error: err instanceof Error ? err.message : '미리보기 실패' });
    }
  }, [products, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, includeReviewImages, noticeOverrides, imagePreuploadCache]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter & sort products
  const displayedProducts = useMemo(() => {
    let result = products;

    // Filter
    if (filterMode === 'problems') {
      result = result.filter(p => p.validationStatus === 'error' || p.validationStatus === 'warning');
    } else if (filterMode === 'no-category') {
      result = result.filter(p => !p.editedCategoryCode);
    } else if (filterMode === 'no-image') {
      result = result.filter(p => (p.scannedMainImages?.length ?? p.mainImageCount) === 0);
    } else if (filterMode === 'skipped') {
      result = result.filter(p => !p.selected);
    } else if (filterMode === 'sold-out') {
      result = result.filter(p => {
        const sr = stockCheckResults?.[p.uid];
        return sr && (sr.status === 'sold_out' || sr.status === 'removed');
      });
    } else if (filterMode === 'image-review') {
      // 이미지 신뢰도 낮은 상품만 표시: diversityScore < 70 또는 유형 2종 이하 또는 워터마크 감지 또는 이미지 3장 미만
      result = result.filter(p => {
        const meta = p.detailImageSelectionMeta;
        const detailCount = p.editedDetailImageOrder?.length ?? p.detailImageCount;
        if (detailCount < 3) return true;
        if (meta?.watermarkScores?.some(w => w.score >= 0.5)) return true;
        if (!meta) return false;
        const uniqueTypes = new Set(meta.imageTypes.filter(t => t !== 'unknown')).size;
        return meta.diversityScore < 70 || uniqueTypes < 3;
      });
    }

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(p => p.editedName.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q));
    }

    // Sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.editedName.localeCompare(b.editedName);
        else if (sortField === 'price') cmp = a.sourcePrice - b.sourcePrice;
        else if (sortField === 'confidence') cmp = a.categoryConfidence - b.categoryConfidence;
        return sortDirection === 'desc' ? -cmp : cmp;
      });
    }

    return result;
  }, [products, filterMode, debouncedSearch, sortField, sortDirection]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const handleRowClick = useCallback((uid: string) => {
    setSelectedUid(prev => prev === uid ? null : uid);
  }, []);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedUid) return;
    const idx = displayedProducts.findIndex(p => p.uid === selectedUid);
    if (idx === -1) return;
    const newIdx = direction === 'prev' ? Math.max(0, idx - 1) : Math.min(displayedProducts.length - 1, idx + 1);
    setSelectedUid(displayedProducts[newIdx].uid);
  }, [selectedUid, displayedProducts]);

  const selectedProduct = selectedUid ? products.find(p => p.uid === selectedUid) ?? null : null;

  const applyBulkBrand = useCallback(() => {
    if (!bulkBrandValue.trim()) return;
    onSetProducts(prev => prev.map(p => p.selected ? { ...p, editedBrand: bulkBrandValue.slice(0, 2) } : p));
    setBulkAction(null); setBulkBrandValue('');
  }, [bulkBrandValue, onSetProducts]);

  const applyBulkPrice = useCallback(() => {
    if (bulkPriceAdjust === 0) return;
    onSetProducts(prev => prev.map(p => {
      if (!p.selected) return p;
      const adjusted = Math.max(100, Math.ceil((p.editedSellingPrice * (1 + bulkPriceAdjust / 100)) / 100) * 100);
      const originalPrice = Math.ceil((adjusted * 1.5) / 100) * 100;
      return { ...p, editedSellingPrice: adjusted, editedOriginalPrice: originalPrice };
    }));
    setBulkAction(null); setBulkPriceAdjust(0);
  }, [bulkPriceAdjust, onSetProducts]);

  const skippedCount = products.filter(p => !p.selected).length;

  const soldOutCount = stockCheckResults
    ? Object.values(stockCheckResults).filter(r => r.status === 'sold_out' || r.status === 'removed').length
    : 0;

  // 품절 체크 완료 시 자동 제외 (최초 1회)
  const autoExcludedRef = useRef(false);
  useEffect(() => {
    if (stockCheckPhase === 'complete' && soldOutCount > 0 && !autoExcludedRef.current && onExcludeSoldOut) {
      autoExcludedRef.current = true;
      onExcludeSoldOut();
    }
    if (stockCheckPhase === 'idle') {
      autoExcludedRef.current = false;
    }
  }, [stockCheckPhase, soldOutCount, onExcludeSoldOut]);

  const filterButtons: { mode: FilterMode; label: string; count?: number; icon?: React.ReactNode }[] = [
    { mode: 'all', label: '전체' },
    { mode: 'problems', label: '문제만' },
    { mode: 'no-category', label: '카테고리 미매칭' },
    { mode: 'no-image', label: '이미지 없음' },
    { mode: 'skipped', label: '제외됨', count: skippedCount },
    ...(soldOutCount > 0 ? [{ mode: 'sold-out' as FilterMode, label: '품절', count: soldOutCount, icon: <PackageX className="w-3 h-3 inline mr-1" /> }] : []),
    { mode: 'image-review' as FilterMode, label: '이미지 검토', count: products.filter(p => {
      const meta = p.detailImageSelectionMeta;
      const detailCount = p.editedDetailImageOrder?.length ?? p.detailImageCount;
      if (detailCount < 3) return true;
      if (meta?.watermarkScores?.some(w => w.score >= 0.5)) return true;
      if (!meta) return false;
      const uniqueTypes = new Set(meta.imageTypes.filter(t => t !== 'unknown')).size;
      return meta.diversityScore < 70 || uniqueTypes < 3;
    }).length || undefined, icon: <ImageIcon className="w-3 h-3 inline mr-1" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Auto-matching progress */}
      {autoMatchingProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-700">카테고리 자동매칭 중... {autoMatchingProgress.done}/{autoMatchingProgress.total} ({Math.round((autoMatchingProgress.done / autoMatchingProgress.total) * 100)}%)</span>
          <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(autoMatchingProgress.done / autoMatchingProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Auto-match error / stats */}
      {!autoMatchingProgress && autoMatchError && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          <span className="text-sm text-orange-700 flex-1">{autoMatchError}</span>
          {onRetryAutoCategory && (
            <button onClick={onRetryAutoCategory} className="px-3 py-1 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition shrink-0">
              재시도
            </button>
          )}
        </div>
      )}

      {/* Category match failure details */}
      {categoryFailures && categoryFailures.length > 0 && !autoMatchingProgress && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowFailures(!showFailures)}
            className="w-full px-3 py-2 flex items-center justify-between text-sm text-orange-700 hover:bg-orange-100 transition"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              실패 {categoryFailures.length}개 상품 상세보기
            </span>
            {showFailures ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showFailures && (
            <div className="px-3 pb-3">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => {
                    const header = '상품명\t추출 토큰\t최고 점수\t가장 가까운 카테고리\t실패 사유';
                    const rows = categoryFailures.map(f =>
                      `${f.productName}\t${f.tokens.join(',')}\t${f.bestScore}\t${f.bestCandidate || '-'}\t${f.reason}`
                    );
                    navigator.clipboard.writeText([header, ...rows].join('\n'));
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition"
                >
                  <ClipboardCopy className="w-3 h-3" /> 클립보드 복사
                </button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-orange-50">
                    <tr className="border-b border-orange-200">
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">#</th>
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">상품명</th>
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">추출 토큰</th>
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">최고 점수</th>
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">가장 가까운 카테고리</th>
                      <th className="text-left py-1.5 px-2 text-orange-600 font-medium">실패 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryFailures.map((f, i) => (
                      <tr key={i} className="border-b border-orange-100 hover:bg-orange-100/50">
                        <td className="py-1 px-2 text-orange-500">{i + 1}</td>
                        <td className="py-1 px-2 text-gray-700 max-w-[200px] truncate" title={f.productName}>{f.productName}</td>
                        <td className="py-1 px-2 text-gray-500 max-w-[150px] truncate" title={f.tokens.join(', ')}>{f.tokens.join(', ')}</td>
                        <td className="py-1 px-2 text-gray-600">{f.bestScore}/12</td>
                        <td className="py-1 px-2 text-gray-500">{f.bestCandidate || '-'}</td>
                        <td className="py-1 px-2 text-orange-600">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!autoMatchingProgress && autoMatchStats && !autoMatchError && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-sm text-green-700">카테고리 자동매칭 완료: {autoMatchStats.matched}/{autoMatchStats.total} 성공</span>
        </div>
      )}

      {/* 자동 파이프라인 통합 진행 섹션 — P1-2: memo 컴포넌트로 분리 */}
      <PipelineProgress
        imageFilterProgress={imageFilterProgress}
        titleGenProgress={titleGenProgress}
        contentGenProgress={contentGenProgress}
      />

      {/* Validation Dashboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-500" /> 검증 대시보드
          </h3>
          <button
            onClick={onDeepValidation}
            disabled={validating || selectedCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {validating ? '검증 + 업로드 진행 중...' : '전체 검증 + 이미지 사전업로드'}
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-6 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-gray-900">{products.length}</div><div className="text-[10px] text-gray-500 mt-0.5">전체 상품</div></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-blue-600">{selectedCount}</div><div className="text-[10px] text-gray-500 mt-0.5">선택됨</div></div>
          <div className="bg-green-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-green-600">{validationReadyCount}</div><div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 등록 가능</div></div>
          <div className={`rounded-lg p-3 text-center ${validationWarningCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}><div className={`text-lg font-bold ${validationWarningCount > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{validationWarningCount}</div><div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><AlertTriangle className="w-3 h-3" /> 경고</div></div>
          <div className={`rounded-lg p-3 text-center ${validationErrorCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}><div className={`text-lg font-bold ${validationErrorCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{validationErrorCount}</div><div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><XCircle className="w-3 h-3" /> 오류</div></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-gray-700">{products.filter(p => p.editedCategoryCode).length}/{products.length}</div><div className="text-[10px] text-gray-500 mt-0.5">카테고리 매칭</div></div>
        </div>

        {/* Price summary */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <span className="text-gray-500">총 원가: <strong className="text-gray-700">{totalSourcePrice.toLocaleString()}원</strong></span>
          <span className="text-gray-400">→</span>
          <span className="text-gray-500">총 판매가: <strong className="text-[#E31837]">{totalSellingPrice.toLocaleString()}원</strong></span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">예상 마진: <strong className="text-green-600">{(totalSellingPrice - totalSourcePrice).toLocaleString()}원</strong></span>
        </div>

        {/* Pipeline progress */}
        {(validationPhase !== 'idle' || imagePreuploadProgress.phase !== 'idle') && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-36 text-xs">
                {validationPhase === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : validating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <CircleDot className="w-3.5 h-3.5 text-gray-300" />}
                <span className={validationPhase === 'complete' ? 'text-green-600' : validating ? 'text-blue-600' : 'text-gray-400'}>Dry-Run 검증</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${validationPhase === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: validationPhase === 'complete' ? '100%' : validating ? '60%' : '0%' }} />
              </div>
              <span className="text-[10px] text-gray-400 w-16 text-right">{validationPhase === 'complete' ? '완료' : validating ? '진행중' : '대기'}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-36 text-xs">
                {imagePreuploadProgress.phase === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : imagePreuploadProgress.phase === 'uploading' ? <Upload className="w-3.5 h-3.5 animate-pulse text-purple-500" /> : <CircleDot className="w-3.5 h-3.5 text-gray-300" />}
                <span className={imagePreuploadProgress.phase === 'complete' ? 'text-green-600' : imagePreuploadProgress.phase === 'uploading' ? 'text-purple-600' : 'text-gray-400'}>이미지 사전업로드</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${imagePreuploadProgress.phase === 'complete' ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: imagePreuploadProgress.total > 0 ? `${(imagePreuploadProgress.done / imagePreuploadProgress.total) * 100}%` : imagePreuploadProgress.phase === 'complete' ? '100%' : '0%' }} />
              </div>
              <span className="text-[10px] text-gray-400 w-20 text-right">{imagePreuploadProgress.phase === 'complete' ? '완료' : imagePreuploadProgress.total > 0 ? `${imagePreuploadProgress.done}/${imagePreuploadProgress.total} (${Math.round((imagePreuploadProgress.done / imagePreuploadProgress.total) * 100)}%)` : '대기'}</span>
            </div>
            {(imagePreuploadProgress.failureCount ?? 0) > 0 && (
              <div className="ml-[10.25rem] -mt-1 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                <div className="font-medium">⚠ 업로드 실패 {imagePreuploadProgress.failureCount}건</div>
                {imagePreuploadProgress.failureReasons && Object.keys(imagePreuploadProgress.failureReasons).length > 0 && (
                  <div className="text-[10px] text-red-500 mt-0.5">
                    원인: {Object.entries(imagePreuploadProgress.failureReasons).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </div>
                )}
                {imagePreuploadProgress.sampleFailure && (
                  <div className="text-[10px] text-red-400 mt-0.5 truncate" title={imagePreuploadProgress.sampleFailure}>
                    예: {imagePreuploadProgress.sampleFailure}
                  </div>
                )}
              </div>
            )}
            {/* Preflight pipeline row */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-36 text-xs">
                {preflightPhase === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : preflightPhase === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : preflightPhase === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-500" /> : <CircleDot className="w-3.5 h-3.5 text-gray-300" />}
                <span className={preflightPhase === 'complete' ? 'text-green-600' : preflightPhase === 'running' ? 'text-indigo-600' : preflightPhase === 'error' ? 'text-red-600' : 'text-gray-400'}>프리플라이트</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${preflightPhase === 'complete' ? (preflightStats?.fail ?? 0) > 0 ? 'bg-red-500' : 'bg-green-500' : preflightPhase === 'running' ? 'bg-indigo-500' : 'bg-gray-200'}`} style={{ width: preflightPhase === 'complete' || preflightPhase === 'error' ? '100%' : preflightPhase === 'running' ? '60%' : '0%' }} />
              </div>
              <span className="text-[10px] text-gray-400 w-16 text-right">
                {preflightPhase === 'complete' ? `${preflightStats?.pass ?? 0}/${preflightStats?.total ?? 0} (${preflightStats?.total ? Math.round(((preflightStats?.pass ?? 0) / preflightStats.total) * 100) : 0}%)` : preflightPhase === 'running' ? '검사중' : preflightPhase === 'error' ? '오류' : '대기'}
              </span>
            </div>
            {/* Canary pipeline row */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-36 text-xs">
                {canaryPhase === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : canaryPhase === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" /> : canaryPhase === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-500" /> : <CircleDot className="w-3.5 h-3.5 text-gray-300" />}
                <span className={canaryPhase === 'complete' ? 'text-green-600' : canaryPhase === 'running' ? 'text-amber-600' : canaryPhase === 'error' ? 'text-red-600' : 'text-gray-400'}>카나리 테스트 (선택)</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${canaryPhase === 'complete' ? 'bg-green-500' : canaryPhase === 'running' ? 'bg-amber-500' : canaryPhase === 'error' ? 'bg-red-500' : 'bg-gray-200'}`} style={{ width: canaryPhase !== 'idle' ? '100%' : '0%' }} />
              </div>
              <span className="text-[10px] text-gray-400 w-16 text-right">
                {canaryPhase === 'complete' ? '통과' : canaryPhase === 'running' ? '테스트중' : canaryPhase === 'error' ? '실패' : '대기'}
              </span>
            </div>
          </div>
        )}

        {/* Dry-Run results */}
        {Object.keys(dryRunResults).length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center gap-2 mb-2"><Eye className="w-4 h-4 text-blue-600" /><span className="text-xs font-medium text-blue-700">Dry-Run 검증 결과 (쿠팡 API 페이로드 사전 검증)</span></div>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div><span className="text-blue-500">페이로드 생성:</span><strong className="ml-1 text-blue-700">{Object.keys(dryRunResults).length}건</strong></div>
              <div><span className="text-blue-500">필수필드 누락:</span><strong className={`ml-1 ${Object.values(dryRunResults).some(r => r.missingRequiredFields && r.missingRequiredFields.length > 0) ? 'text-red-600' : 'text-green-600'}`}>{Object.values(dryRunResults).filter(r => r.missingRequiredFields && r.missingRequiredFields.length > 0).length}건</strong></div>
              <div><span className="text-blue-500">상세페이지:</span><strong className="ml-1 text-blue-700">{Object.values(dryRunResults).filter(r => r.payloadPreview?.hasDetailPage).length}건</strong></div>
              <div><span className="text-blue-500">이미지 업로드:</span><strong className="ml-1 text-purple-600">{Object.keys(imagePreuploadCache).length}건 완료</strong></div>
            </div>
          </div>
        )}

        {/* Preflight Report Panel */}
        {preflightPhase && preflightPhase !== 'idle' && (
          <div className={`rounded-lg p-4 border mt-4 ${
            preflightPhase === 'complete' && (preflightStats?.fail ?? 0) === 0
              ? 'bg-green-50 border-green-200'
              : preflightPhase === 'complete' && (preflightStats?.fail ?? 0) > 0
                ? 'bg-red-50 border-red-200'
                : preflightPhase === 'running'
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-gray-900">프리플라이트 검사</span>
                {preflightPhase === 'running' && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
              </div>
              {preflightStats && (
                <span className="text-xs text-gray-500">
                  {preflightStats.pass}/{preflightStats.total} 통과
                  {preflightDurationMs ? ` (${(preflightDurationMs / 1000).toFixed(1)}초)` : ''}
                </span>
              )}
            </div>

            {preflightStats && preflightPhase === 'complete' && (
              <>
                {/* Stats badges */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-2.5 text-center border border-green-100">
                    <div className="text-lg font-bold text-green-600">{preflightStats.pass}</div>
                    <div className="text-[10px] text-green-600">통과</div>
                  </div>
                  <div className={`bg-white rounded-lg p-2.5 text-center border ${preflightStats.warn > 0 ? 'border-orange-100' : 'border-gray-100'}`}>
                    <div className={`text-lg font-bold ${preflightStats.warn > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{preflightStats.warn}</div>
                    <div className="text-[10px] text-gray-500">경고</div>
                  </div>
                  <div className={`bg-white rounded-lg p-2.5 text-center border ${preflightStats.fail > 0 ? 'border-red-100' : 'border-gray-100'}`}>
                    <div className={`text-lg font-bold ${preflightStats.fail > 0 ? 'text-red-600' : 'text-gray-300'}`}>{preflightStats.fail}</div>
                    <div className="text-[10px] text-gray-500">실패</div>
                  </div>
                </div>

                {/* Failed product details */}
                {preflightStats.fail > 0 && preflightResults && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-red-700 mb-1.5">실패 상세 ({preflightStats.fail}건):</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {Object.entries(preflightResults)
                        .filter(([, r]) => !r.pass)
                        .map(([uid, r]) => (
                          <button key={uid} onClick={() => setSelectedUid(uid)} className="w-full flex items-start gap-2 text-xs bg-white rounded px-2 py-1.5 border border-red-100 hover:bg-red-50 hover:border-red-300 cursor-pointer transition-colors text-left">
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium text-gray-700">{(r.payloadSnapshot?.sellerProductName || '').slice(0, 30)}</span>
                              {r.errors.map((e, i) => (
                                <div key={i} className="text-red-600 mt-0.5">{e.message}</div>
                              ))}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Canary test section */}
                {canaryTargetUid && onCanary && (
                  <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-gray-600">카나리 테스트 (1건 실제 등록 → 삭제)</span>
                        {canaryTargetUid && (
                          <span className="text-gray-400">
                            대상: {products.find(p => p.uid === canaryTargetUid)?.editedName?.slice(0, 20) || canaryTargetUid.slice(-8)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onCanary(canaryTargetUid)}
                        disabled={canaryPhase === 'running' || (preflightStats?.fail ?? 0) > 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition"
                      >
                        {canaryPhase === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                        {canaryPhase === 'running' ? '테스트 중...' : canaryPhase === 'complete' ? '재실행' : '테스트 실행'}
                      </button>
                    </div>
                    {/* Canary result */}
                    {canaryResult && (
                      <div className={`mt-2 rounded-lg p-2.5 text-xs ${canaryResult.success ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                        {canaryResult.success ? (
                          <div className="flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>카나리 테스트 통과 — API 등록 성공{canaryResult.cleanedUp ? ' + 자동 삭제 완료' : ''}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-700">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{canaryResult.error || '카나리 테스트 실패'}</span>
                          </div>
                        )}
                        {canaryResult.phases.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {canaryResult.phases.map((phase, i) => (
                              <div key={i} className="flex items-center gap-2 text-gray-500">
                                {phase.success ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                                <span>{phase.name}</span>
                                <span className="text-gray-300">({phase.durationMs}ms)</span>
                                {phase.error && <span className="text-red-500">— {phase.error}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {canaryResult.channelProductId && !canaryResult.cleanedUp && (
                          <div className="mt-1.5 text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            상품 ID {canaryResult.channelProductId} — 쿠팡 Wing에서 수동 삭제 필요
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Re-run preflight button */}
                {preflightStats.fail > 0 && onPreflight && (
                  <button
                    onClick={onPreflight}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition"
                  >
                    <ShieldCheck className="w-3 h-3" /> 프리플라이트 재실행
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Filter + Search bar */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          {filterButtons.map(({ mode, label, count, icon }) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 text-xs rounded-full border transition ${filterMode === mode ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
            >
              {icon || (mode === 'skipped' ? <Ban className="w-3 h-3 inline mr-1" /> : <Filter className="w-3 h-3 inline mr-1" />)}
              {label}
              {count !== undefined && count > 0 && (
                <span className={`ml-1 px-1 py-px rounded-full text-[10px] font-medium ${filterMode === mode ? 'bg-white/20' : 'bg-red-100 text-red-600'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="상품명 검색..."
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs w-48 focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <span className="text-xs text-gray-400">{displayedProducts.length}개 / {products.length}개</span>
        </div>
      </div>

      {/* Bulk action toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500">일괄 작업:</span>
        <button onClick={() => setBulkAction(bulkAction === 'brand' ? null : 'brand')} className={`px-3 py-1.5 text-xs rounded-lg border transition ${bulkAction === 'brand' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>브랜드 변경</button>
        <button onClick={() => { setBulkAction(bulkAction === 'category' ? null : 'category'); if (bulkAction !== 'category') onSetCategorySearchTarget('bulk'); }} className={`px-3 py-1.5 text-xs rounded-lg border transition ${bulkAction === 'category' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>카테고리 변경</button>
        <button onClick={() => setBulkAction(bulkAction === 'price' ? null : 'price')} className={`px-3 py-1.5 text-xs rounded-lg border transition ${bulkAction === 'price' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>가격 조정</button>
        {(lowConfidenceCount ?? 0) > 0 && (
          <button
            onClick={onRematchLowConfidence}
            disabled={rematchingCategory}
            className="px-3 py-1.5 text-xs rounded-lg border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition flex items-center gap-1"
          >
            {rematchingCategory ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
            {rematchingCategory ? '재매칭 중...' : `오분류 재매칭 (${lowConfidenceCount}건)`}
          </button>
        )}
        {validationErrorCount > 0 && (
          <button
            onClick={() => {
              onSetProducts(prev => prev.map(p =>
                p.validationStatus === 'error' ? { ...p, selected: false } : p
              ));
            }}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition flex items-center gap-1"
          >
            <Ban className="w-3 h-3" />
            오류 상품 일괄 제외 ({validationErrorCount})
          </button>
        )}
        {onStockCheck && (
          <button
            onClick={onStockCheck}
            disabled={stockCheckPhase === 'running' || selectedCount === 0}
            className={`px-3 py-1.5 text-xs rounded-lg border transition flex items-center gap-1 ${
              stockCheckPhase === 'complete'
                ? 'border-green-300 text-green-600 hover:bg-green-50'
                : 'border-purple-300 text-purple-600 hover:bg-purple-50'
            } disabled:opacity-50`}
          >
            {stockCheckPhase === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageX className="w-3 h-3" />}
            {stockCheckPhase === 'running'
              ? `품절 체크 중... ${stockCheckProgress?.done ?? 0}/${stockCheckProgress?.total ?? 0}`
              : stockCheckPhase === 'complete'
                ? `품절 체크 완료`
                : '원본 품절 체크'}
          </button>
        )}
        {onExcludeSoldOut && soldOutCount > 0 && (
          <button
            onClick={onExcludeSoldOut}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition flex items-center gap-1"
          >
            <Ban className="w-3 h-3" />
            품절 상품 제외 ({soldOutCount})
          </button>
        )}
        {bulkAction === 'brand' && (
          <div className="flex items-center gap-2">
            <input type="text" value={bulkBrandValue} onChange={(e) => setBulkBrandValue(e.target.value)} placeholder="브랜드명" className="px-2 py-1 border border-gray-300 rounded text-xs w-32" />
            <button onClick={applyBulkBrand} className="px-2 py-1 text-xs bg-[#E31837] text-white rounded">선택 상품에 적용</button>
          </div>
        )}
        {bulkAction === 'price' && (
          <div className="flex items-center gap-2">
            <input type="number" value={bulkPriceAdjust} onChange={(e) => setBulkPriceAdjust(Number(e.target.value))} placeholder="조정률 (%)" className="px-2 py-1 border border-gray-300 rounded text-xs w-24" />
            <span className="text-xs text-gray-400">%</span>
            <button onClick={applyBulkPrice} className="px-2 py-1 text-xs bg-[#E31837] text-white rounded">선택 상품에 적용</button>
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">{selectedCount}개 선택됨</span>
      </div>

      {/* Category cascading picker — 대분류 → 중분류 → 소분류 클릭으로 직접 선택 */}
      <CategoryCascadingPicker
        isOpen={!!categorySearchTarget}
        onClose={() => onSetCategorySearchTarget(null)}
        onSelect={(code, fullPath) => {
          // CategoryItem 형식으로 변환해 기존 selectCategory 핸들러 재사용
          const leafName = fullPath.split('>').pop() || '';
          onSelectCategory({ id: code, name: leafName, path: fullPath });
        }}
        currentCode={(() => {
          if (!categorySearchTarget || categorySearchTarget === 'bulk') return undefined;
          const target = products.find(p => p.uid === categorySearchTarget);
          return target?.editedCategoryCode || undefined;
        })()}
        title={(() => {
          if (categorySearchTarget === 'bulk') return '카테고리 선택 — 선택 상품 일괄 적용';
          if (!categorySearchTarget) return '카테고리 선택';
          const target = products.find(p => p.uid === categorySearchTarget);
          return target ? `카테고리 선택 — ${target.editedName || target.name}` : '카테고리 선택';
        })()}
      />

      {/* Stock check running banner */}
      {stockCheckPhase === 'running' && stockCheckProgress && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
          <span className="text-sm text-purple-700">원본 품절 자동 체크 중... {stockCheckProgress.done}/{stockCheckProgress.total}</span>
          <div className="flex-1 h-1.5 bg-purple-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: stockCheckProgress.total > 0 ? `${(stockCheckProgress.done / stockCheckProgress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {/* Stock check results summary */}
      {stockCheckPhase === 'complete' && stockCheckStats && (
        <div className={`rounded-lg p-3 border ${stockCheckStats.soldOut + stockCheckStats.removed > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <PackageX className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-semibold text-gray-700">품절 체크 결과</span>
            {(stockCheckStats.soldOut + stockCheckStats.removed) > 0 && (
              <span className="text-xs text-red-600 font-medium ml-auto">
                {stockCheckStats.soldOut + stockCheckStats.removed}개 품절/삭제 상품 자동 제외됨
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-3 text-xs text-center">
            <div><span className="text-green-600 font-bold text-sm">{stockCheckStats.inStock}</span><div className="text-gray-500 mt-0.5">판매중</div></div>
            <div><span className={`font-bold text-sm ${stockCheckStats.soldOut > 0 ? 'text-red-600' : 'text-gray-300'}`}>{stockCheckStats.soldOut}</span><div className="text-gray-500 mt-0.5">품절</div></div>
            <div><span className={`font-bold text-sm ${stockCheckStats.removed > 0 ? 'text-gray-600' : 'text-gray-300'}`}>{stockCheckStats.removed}</span><div className="text-gray-500 mt-0.5">삭제됨</div></div>
            <div><span className={`font-bold text-sm ${stockCheckStats.unknown > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>{stockCheckStats.unknown}</span><div className="text-gray-500 mt-0.5">확인불가</div></div>
            <div><span className={`font-bold text-sm ${stockCheckStats.error > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{stockCheckStats.error}</span><div className="text-gray-500 mt-0.5">접속오류</div></div>
          </div>
        </div>
      )}

      {/* Product table */}
      <BulkProductTable
        products={displayedProducts}
        selectedUid={selectedUid}
        thumbnailCache={thumbnailCache}
        stockResults={stockCheckResults}
        sortField={sortField}
        sortDirection={sortDirection}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onUpdate={onUpdate}
        onCategoryClick={onCategoryClick}
        onRowClick={handleRowClick}
        onLoadThumbnail={onLoadThumbnail}
        onSort={handleSort}
        onPrewarmProduct={onPrewarmProduct}
        onPrewarmCancel={onPrewarmCancel}
      />

      {/* Bottom navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
          <ArrowLeft className="w-4 h-4" /> 이전
        </button>
        <div className="flex items-center gap-3">
          {imagePreuploadProgress.phase === 'complete' && Object.keys(imagePreuploadCache).length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> 이미지 {Object.keys(imagePreuploadCache).length}개 준비 완료
            </span>
          )}
          {imagePreuploadProgress.phase === 'uploading' && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs">
              <Upload className="w-3.5 h-3.5 animate-pulse" /> 이미지 업로드 중... {imagePreuploadProgress.done}/{imagePreuploadProgress.total} ({Math.round((imagePreuploadProgress.done / imagePreuploadProgress.total) * 100)}%)
            </span>
          )}
          <div className="relative group">
            {(() => {
              // 등록 버튼 상태 결정
              const hasPreflightFail = (preflightStats?.fail ?? 0) > 0;
              const preflightNotRun = !preflightPhase || preflightPhase === 'idle';
              const preflightRunning = preflightPhase === 'running';
              const preflightPassed = preflightPhase === 'complete' && !hasPreflightFail;
              const disabled = registerableCount === 0 || !preflightPassed;

              let buttonLabel: string;
              let buttonColor: string;
              let buttonIcon = <Zap className="w-4 h-4" />;

              if (preflightRunning) {
                buttonLabel = '검사 중...';
                buttonColor = 'bg-gray-400';
                buttonIcon = <Loader2 className="w-4 h-4 animate-spin" />;
              } else if (preflightNotRun) {
                buttonLabel = '프리플라이트 필요';
                buttonColor = 'bg-gray-400';
                buttonIcon = <Lock className="w-4 h-4" />;
              } else if (hasPreflightFail) {
                buttonLabel = `${preflightStats!.fail}개 상품 수정 필요`;
                buttonColor = 'bg-red-500';
                buttonIcon = <XCircle className="w-4 h-4" />;
              } else if (preflightPassed) {
                buttonLabel = `${preflightStats?.pass ?? registerableCount}개 등록 시작`;
                buttonColor = 'bg-green-600 hover:bg-green-700';
                buttonIcon = <CheckCircle2 className="w-4 h-4" />;
              } else {
                buttonLabel = `${registerableCount}개 등록 시작`;
                buttonColor = 'bg-[#E31837] hover:bg-red-700';
              }

              return (
                <button
                  onClick={onRegister}
                  disabled={disabled}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium text-white ${buttonColor} rounded-lg disabled:opacity-50 transition shadow-sm`}
                >
                  {buttonIcon} {buttonLabel}
                  {validationErrorCount > 0 && preflightPassed && <span className="text-xs opacity-75">({validationErrorCount}개 제외)</span>}
                  {preflightPassed && <ArrowRight className="w-4 h-4" />}
                </button>
              );
            })()}
            {registerableCount === 0 && (
              <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none">
                {products.filter(p => p.selected && !p.editedCategoryCode).length > 0
                  ? '카테고리 미지정 상품이 있습니다. 자동매칭을 재시도하거나 수동 지정해주세요.'
                  : '검증 오류가 있는 상품을 수정해주세요.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <BulkProductDetailPanel
        product={selectedProduct}
        imageUrls={selectedUid ? getDetailImageUrls(selectedUid) : []}
        onClose={() => setSelectedUid(null)}
        onNavigate={handleNavigate}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onCategoryClick={onCategoryClick}
        onReorderImages={onReorderImages}
        onRemoveImage={onRemoveImage}
        onToggleAutoExclude={onToggleAutoExclude}
        onSwapStockImage={onSwapStockImage}
        onTogglePromoteReview={onTogglePromoteReview}
        payloadPreview={payloadPreview}
        onRequestPreview={handleRequestPreview}
        preUploadedUrls={imagePreuploadCache}
        preventionConfig={preventionConfig}
        titleGenProgress={titleGenProgress}
        noticeMeta={selectedProduct?.editedCategoryCode ? categoryMetaCache?.[selectedProduct.editedCategoryCode]?.noticeMeta : undefined}
        noticeOverrides={noticeOverrides}
      />
    </div>
  );
});
