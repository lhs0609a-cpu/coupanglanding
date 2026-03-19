'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Search, Zap, Filter, Upload, Eye, BarChart3, CircleDot, Package,
} from 'lucide-react';
import BulkProductTable from './BulkProductTable';
import BulkProductDetailPanel, { type PayloadPreviewState } from './BulkProductDetailPanel';
import type { PayloadPreviewData } from './PayloadPreviewPanel';
import type { EditableProduct, CategoryItem, FilterMode, SortField, SortDirection } from './types';

interface BulkStep2ReviewProps {
  products: EditableProduct[];
  autoMatchingProgress: { done: number; total: number } | null;
  autoMatchError?: string;
  autoMatchStats?: { matched: number; failed: number; total: number } | null;
  onRetryAutoCategory?: () => void;
  validating: boolean;
  validationPhase: string;
  imagePreuploadProgress: { total: number; done: number; phase: string };
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
  // Bulk actions
  onSetProducts: React.Dispatch<React.SetStateAction<EditableProduct[]>>;
  onToggle: (uid: string) => void;
  onToggleAll: () => void;
  onUpdate: (uid: string, field: string, value: string | number) => void;
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
  // Detail panel image URLs
  getDetailImageUrls: (uid: string) => string[];
  // Payload preview (shipping info needed for preview API)
  selectedOutbound?: string;
  selectedReturn?: string;
  returnCharge?: number;
  contactNumber?: string;
  includeReviewImages?: boolean;
  noticeOverrides?: Record<string, string>;
}

export default function BulkStep2Review({
  products, autoMatchingProgress, autoMatchError, autoMatchStats, onRetryAutoCategory, validating, validationPhase,
  imagePreuploadProgress, imagePreuploadCache, dryRunResults,
  deliveryChargeType, deliveryCharge, freeShipOverAmount,
  selectedCount, totalSourcePrice, totalSellingPrice,
  validationReadyCount, validationWarningCount, validationErrorCount, registerableCount,
  categorySearchTarget, categoryKeyword, categoryResults, searchingCategory,
  onSetProducts, onToggle, onToggleAll, onUpdate, onCategoryClick,
  onSetCategorySearchTarget, onSetCategoryKeyword, onSearchCategory, onSelectCategory,
  onDeepValidation, onRegister, onBack,
  thumbnailCache, onLoadThumbnail,
  onReorderImages, onRemoveImage, getDetailImageUrls,
  selectedOutbound, selectedReturn, returnCharge, contactNumber, includeReviewImages, noticeOverrides,
}: BulkStep2ReviewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
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
      const preUploadedUrls = cached ? {
        mainImageUrls: cached.mainImageUrls || [],
        detailImageUrls: cached.detailImageUrls || [],
        reviewImageUrls: cached.reviewImageUrls || [],
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
            detailImages: product.detailImages,
            reviewImages: product.reviewImages,
            infoImages: product.infoImages,
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
    onSetProducts(prev => prev.map(p => p.selected ? { ...p, editedBrand: bulkBrandValue } : p));
    setBulkAction(null); setBulkBrandValue('');
  }, [bulkBrandValue, onSetProducts]);

  const applyBulkPrice = useCallback(() => {
    if (bulkPriceAdjust === 0) return;
    onSetProducts(prev => prev.map(p => {
      if (!p.selected) return p;
      const adjusted = Math.ceil((p.editedSellingPrice * (1 + bulkPriceAdjust / 100)) / 100) * 100;
      return { ...p, editedSellingPrice: Math.max(100, adjusted) };
    }));
    setBulkAction(null); setBulkPriceAdjust(0);
  }, [bulkPriceAdjust, onSetProducts]);

  const filterButtons: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: '전체' },
    { mode: 'problems', label: '문제만' },
    { mode: 'no-category', label: '카테고리 미매칭' },
    { mode: 'no-image', label: '이미지 없음' },
  ];

  return (
    <div className="space-y-4">
      {/* Auto-matching progress */}
      {autoMatchingProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-700">카테고리 자동매칭 중... {autoMatchingProgress.done}/{autoMatchingProgress.total}</span>
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

      {!autoMatchingProgress && autoMatchStats && !autoMatchError && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-sm text-green-700">카테고리 자동매칭 완료: {autoMatchStats.matched}/{autoMatchStats.total} 성공</span>
        </div>
      )}

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
              <span className="text-[10px] text-gray-400 w-16 text-right">{imagePreuploadProgress.phase === 'complete' ? '완료' : imagePreuploadProgress.total > 0 ? `${imagePreuploadProgress.done}/${imagePreuploadProgress.total}` : '대기'}</span>
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

        {/* Filter + Search bar */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
          {filterButtons.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 text-xs rounded-full border transition ${filterMode === mode ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
            >
              <Filter className="w-3 h-3 inline mr-1" />{label}
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

      {/* Category search modal */}
      {categorySearchTarget && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">카테고리 검색 {categorySearchTarget === 'bulk' ? '(선택 상품 일괄)' : ''}</h3>
            <button onClick={() => { onSetCategorySearchTarget(null); }} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
          </div>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={categoryKeyword} onChange={(e) => onSetCategoryKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearchCategory()} placeholder="카테고리 검색 (예: 비오틴, 비타민)" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
            </div>
            <button onClick={onSearchCategory} disabled={searchingCategory} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              {searchingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
            </button>
          </div>
          {categoryResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {categoryResults.map((cat) => (
                <button key={cat.id} onClick={() => onSelectCategory(cat)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition">
                  <span className="font-medium">{cat.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{cat.path}</span>
                  <span className="text-xs text-gray-300 ml-1">({cat.id})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product table */}
      <BulkProductTable
        products={displayedProducts}
        selectedUid={selectedUid}
        thumbnailCache={thumbnailCache}
        sortField={sortField}
        sortDirection={sortDirection}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onUpdate={onUpdate}
        onCategoryClick={onCategoryClick}
        onRowClick={handleRowClick}
        onLoadThumbnail={onLoadThumbnail}
        onSort={handleSort}
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
              <Upload className="w-3.5 h-3.5 animate-pulse" /> 이미지 업로드 중... ({imagePreuploadProgress.done}/{imagePreuploadProgress.total})
            </span>
          )}
          <div className="relative group">
            <button
              onClick={onRegister}
              disabled={registerableCount === 0 || products.some(p => p.selected && p.validationStatus === 'error')}
              className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition shadow-sm"
            >
              <Zap className="w-4 h-4" /> {registerableCount}개 등록 시작
              {validationErrorCount > 0 && <span className="text-xs opacity-75">({validationErrorCount}개 제외)</span>}
              <ArrowRight className="w-4 h-4" />
            </button>
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
        onUpdate={onUpdate}
        onCategoryClick={onCategoryClick}
        onReorderImages={onReorderImages}
        onRemoveImage={onRemoveImage}
        payloadPreview={payloadPreview}
        onRequestPreview={handleRequestPreview}
      />
    </div>
  );
}
