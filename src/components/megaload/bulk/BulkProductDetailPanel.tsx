'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Code2, FileText, ExternalLink, Ban, GripVertical, Search, Cpu, Loader2, Smartphone,
} from 'lucide-react';
import PayloadPreviewPanel, { type PayloadPreviewData } from './PayloadPreviewPanel';
import MobilePreview from './MobilePreview';
import CoupangFieldsSection from './CoupangFieldsSection';
import DetailPageContentTab from './DetailPageContentTab';
import LlmRegenModal from './LlmRegenModal';
import type { LlmTask } from './useBulkRegisterActions';
import type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
import type { EditableProduct } from './types';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';

interface ImageItem {
  id: string;
  url: string;
  autoExcludeReason?: 'hard_filter' | 'low_score' | 'color_outlier' | 'unrelated_to_main' | 'duplicate' | 'text_banner' | 'empty_image';
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
  onToggle: (uid: string) => void;
  onUpdate: (uid: string, field: string, value: string | number | boolean | string[] | number[] | Record<string, string>) => void;
  onCategoryClick: (uid: string) => void;
  onReorderImages: (uid: string, newOrder: string[]) => void;
  onRemoveImage: (uid: string, imageIndex: number) => void;
  onToggleAutoExclude?: (uid: string, imageIndex: number) => void;
  onSwapStockImage?: (uid: string, imageIndex: number, newCdnUrl: string) => void;
  /** 리뷰 이미지를 대표 이미지로 promote 토글 */
  onTogglePromoteReview?: (uid: string, reviewIndex: number) => void;
  payloadPreview?: PayloadPreviewState;
  onRequestPreview?: (uid: string) => void;
  preUploadedUrls?: Record<string, { mainImageUrls: string[]; detailImageUrls?: string[]; reviewImageUrls?: string[]; infoImageUrls?: string[] }>;
  preventionConfig?: PreventionConfig;
  titleGenProgress?: { done: number; total: number } | null;
  /** 현재 product의 카테고리 고시정보 메타 — 상세페이지 미리보기 하단 고시정보 테이블 렌더용 */
  noticeMeta?: NoticeCategoryMeta[];
  /** 현재 product의 카테고리 속성/옵션 메타 — 필수 구매옵션 영역 렌더 + 차단 가드용 */
  attributeMeta?: AttributeMeta[];
  /** 사용자 전역 고시정보 오버라이드 (예: 제조국, A/S 안내) */
  noticeOverrides?: Record<string, string>;
  /** 동일 카테고리 선택 상품 전체에 attribute 일괄 적용 — 적용된 상품 수 반환 */
  onBulkApplyAttribute?: (attrName: string, value: string, categoryCode: string) => number;
  /** 로컬 GPU LLM 재생성 (노출상품명/상세글/옵션/카테고리) */
  onLlmRegen?: (targets: { uid: string; tasks: LlmTask[] }[]) => void;
  llmRegen?: { total: number; done: number; error: number; running: boolean; message?: string } | null;
  llmCanUndo?: boolean;
  onUndoLlm?: () => void;
}

export default function BulkProductDetailPanel({
  product,
  imageUrls,
  onClose,
  onNavigate,
  onToggle,
  onUpdate,
  onCategoryClick,
  onReorderImages,
  onRemoveImage,
  onToggleAutoExclude,
  onSwapStockImage,
  onTogglePromoteReview,
  payloadPreview,
  onRequestPreview,
  preUploadedUrls,
  preventionConfig,
  titleGenProgress,
  noticeMeta,
  attributeMeta,
  noticeOverrides,
  onBulkApplyAttribute,
  onLlmRegen,
  llmRegen,
  llmCanUndo,
  onUndoLlm,
}: BulkProductDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'detail' | 'payload'>('info');
  const [issuesExpanded, setIssuesExpanded] = useState(false);
  const [llmModalOpen, setLlmModalOpen] = useState(false);

  // ─── 모바일 미리보기 (쿠팡윙 스타일 — 패널 왼쪽에 폰 목업 핀) ───
  const MOBILE_PREVIEW_KEY = 'megaload:detail-panel-mobile-preview';
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem(MOBILE_PREVIEW_KEY);
      return raw === null ? true : raw === '1';
    } catch { return true; }
  });
  const toggleMobilePreview = useCallback(() => {
    setMobilePreviewOpen(prev => {
      const next = !prev;
      try { window.localStorage.setItem(MOBILE_PREVIEW_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Browser mode: load all main images as objectURLs
  const [browserImageUrls, setBrowserImageUrls] = useState<string[]>([]);

  // ─── Resizable width (per-user localStorage) ───
  // 좌측 가장자리 핸들로 너비 조절 → 사용자별 localStorage 영속.
  // 최소 500px, 최대 viewport의 95%. 기본 780px.
  const PANEL_MIN_WIDTH = 500;
  const PANEL_DEFAULT_WIDTH = 780;
  const PANEL_STORAGE_KEY = 'megaload:detail-panel-width';
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return PANEL_DEFAULT_WIDTH;
    try {
      const raw = window.localStorage.getItem(PANEL_STORAGE_KEY);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= PANEL_MIN_WIDTH) return parsed;
    } catch { /* ignore */ }
    return PANEL_DEFAULT_WIDTH;
  });
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // 패널은 우측 고정. 마우스 X가 왼쪽으로 갈수록 너비 증가.
      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = Math.floor(window.innerWidth * 0.95);
      const clamped = Math.max(PANEL_MIN_WIDTH, Math.min(maxWidth, newWidth));
      setPanelWidth(clamped);
    };
    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // localStorage 저장 (resize 끝날 때 한 번)
      try {
        window.localStorage.setItem(PANEL_STORAGE_KEY, String(panelWidth));
      } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [panelWidth]);

  // Keyboard navigation
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 중(input/textarea/select)에는 패널 단축키가 발동하지 않도록 가드.
      // 예전엔 ArrowUp/Down에 가드가 없어, 옵션값 입력칸에서 방향키/편집 중 상품이
      // 이전/다음으로 넘어가 버렸음.
      const active = document.activeElement;
      const inEditable = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || (active as HTMLElement).isContentEditable);
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        if (inEditable) return;
        e.preventDefault();
        onNavigate('prev');
      } else if (e.key === 'ArrowDown') {
        if (inEditable) return;
        e.preventDefault();
        onNavigate('next');
      } else if (e.key === 'Delete') {
        // Skip/restore toggle — only if not focused on an input
        if (inEditable) return;
        e.preventDefault();
        onToggle(product.uid);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose, onNavigate, onToggle]);

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
  // scannedMainImages가 있으면 자동제외 사유 + 리뷰 promote 마커를 ImageItem 에 전달
  const imageItems: ImageItem[] = displayImageUrls.map((url, i) => ({
    id: `img-${i}`,
    url,
    autoExcludeReason: scannedMainImagesRef?.[i]?.autoExcludeReason,
    promotedFromReview: scannedMainImagesRef?.[i]?.promotedFromReview,
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

  const handleImageToggleAutoExclude = useCallback((id: string) => {
    if (!product || !onToggleAutoExclude) return;
    const index = parseInt(id.split('-').pop() || '0');
    onToggleAutoExclude(product.uid, index);
  }, [product, onToggleAutoExclude]);

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
            className="fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col"
            style={{ width: `${panelWidth}px`, maxWidth: '95vw' }}
          >
            {/* Resize handle (좌측 가장자리) */}
            <div
              onMouseDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="패널 너비 조절 — 드래그"
              title="좌우로 드래그하여 패널 너비 조절"
              className={`absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-10 group ${
                isResizing ? 'bg-[#E31837]/40' : 'hover:bg-[#E31837]/30'
              } transition-colors`}
            >
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 p-1 rounded bg-white border border-gray-300 shadow-sm transition-opacity ${
                isResizing ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
              }`}>
                <GripVertical className="w-3 h-3 text-gray-400" />
              </div>
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <a
                  href={product.sourceUrl || `https://search.shopping.naver.com/catalog/${product.productCode}`}
                  target="_blank"
                  // noreferrer 제거: 네이버/쿠팡 안티봇 봇 의심 방지. origin 만 전송.
                  rel="noopener"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="inline-flex items-center gap-1 text-xs font-mono text-gray-400 hover:text-blue-600 transition shrink-0"
                  title="원본 상품 보기"
                >
                  {product.productCode}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {/* 구글 검색 우회 — 직접 링크 캡차/IP차단 걸렸을 때 사용. Referer=google.com 이라 회피 확률 높음. */}
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(product.name || product.productCode)}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center text-gray-300 hover:text-emerald-600 transition shrink-0"
                  title="구글 검색으로 우회 (캡차/IP차단 회피)"
                >
                  <Search className="w-3 h-3" />
                </a>
                {product.validationStatus === 'ready' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                {product.validationStatus === 'warning' && <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />}
                {product.validationStatus === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                <span className="text-xs text-gray-600 truncate max-w-[400px]" title={product.editedName}>
                  {product.editedName}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={toggleMobilePreview}
                  title={mobilePreviewOpen ? '모바일 미리보기 끄기' : '모바일 미리보기 켜기 — 실제 모바일 노출 화면'}
                  className={`p-1.5 rounded transition mr-1 ${
                    mobilePreviewOpen
                      ? 'text-[#E31837] bg-red-50 hover:bg-red-100'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onToggle(product.uid)}
                  title={product.selected ? '등록에서 제외 (Delete)' : '등록에 포함 (Delete)'}
                  className={`p-1.5 rounded transition ${
                    product.selected
                      ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                      : 'text-red-500 bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                </button>
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
              {onLlmRegen && (
                <button
                  onClick={() => setLlmModalOpen(true)}
                  disabled={llmRegen?.running}
                  title="이 상품의 노출상품명·상세글·옵션수량·카테고리를 AI로 재생성/재매칭합니다."
                  className="ml-auto my-1.5 flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
                >
                  {llmRegen?.running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                  이 상품 AI 재생성
                </button>
              )}
            </div>

            {/* 이 상품 LLM 재생성 모달 (단일) */}
            {onLlmRegen && (
              <LlmRegenModal
                isOpen={llmModalOpen}
                onClose={() => setLlmModalOpen(false)}
                singleProductName={product.editedDisplayProductName || product.editedName || product.name}
                selectedCount={1}
                totalCount={1}
                progress={llmRegen ?? null}
                canUndo={!!llmCanUndo}
                onUndo={() => onUndoLlm?.()}
                onRun={(_scope, tasks) => onLlmRegen([{ uid: product.uid, tasks }])}
              />
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'detail' ? (
                <DetailPageContentTab
                  product={product}
                  onUpdate={onUpdate}
                  preUploadedUrls={preUploadedUrls?.[product.uid]}
                  noticeMeta={noticeMeta}
                  noticeOverrides={noticeOverrides}
                  onTogglePromoteReview={onTogglePromoteReview}
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
                  onImageToggleAutoExclude={handleImageToggleAutoExclude}
                  preventionConfig={preventionConfig}
                  titleGenProgress={titleGenProgress}
                  onSwapStockImage={onSwapStockImage}
                  onBulkApplyAttribute={onBulkApplyAttribute}
                  attributeMeta={attributeMeta}
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

          {/* 모바일 미리보기 (쿠팡윙 스타일 — 패널 왼쪽 핀) */}
          {mobilePreviewOpen && (
            <MobilePreview
              product={product}
              mainImageUrls={displayImageUrls}
              previewData={payloadPreview?.data ?? null}
              preUploadedUrls={preUploadedUrls?.[product.uid]}
              noticeMeta={noticeMeta}
              noticeOverrides={noticeOverrides}
              panelWidth={panelWidth}
              onClose={toggleMobilePreview}
              onUpdate={onUpdate}
              onRemoveImage={onRemoveImage}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
