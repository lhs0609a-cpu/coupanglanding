'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  FileText, MessageSquare, Plus, Trash2, Eye, EyeOff,
  ChevronDown, ChevronRight, GripVertical, Image as ImageIcon, Check,
  Sparkles,
} from 'lucide-react';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
import { ensureObjectUrl } from '@/lib/megaload/services/client-folder-scanner';
import {
  scoreProductRelevance,
  type ProductRelevanceScore,
} from '@/lib/megaload/services/image-quality-scorer';
// 제3자 이미지 서버 URL (Supabase Storage 영구 저장)
const THIRD_PARTY_IMAGE_URLS = [
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-01.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-02.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-03.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-04.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-05.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-06.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-07.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-08.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-09.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-10.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-11.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-12.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-13.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-14.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-15.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-16.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-17.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-18.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-19.jpg',
  'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/megaload/third-party/tp-20.jpg',
];
import type { ContentBlock } from '@/lib/megaload/services/persuasion-engine';
import type { EditableProduct, ScannedImageFile } from './types';

interface DetailPageContentTabProps {
  product: EditableProduct;
  onUpdate: (uid: string, field: string, value: string | number | string[] | number[] | Record<string, string>) => void;
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls?: string[];
    reviewImageUrls?: string[];
    infoImageUrls?: string[];
  };
}

interface CollapsibleProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** order 배열로 이미지 필터링. undefined → 전체, [] → 0장 */
function filterByOrder<T>(items: T[], order: number[] | undefined): T[] {
  if (!order) return items;
  return order.filter(i => i >= 0 && i < items.length).map(i => items[i]);
}

interface ImageSelectorGroupProps {
  label: string;
  images: ScannedImageFile[];
  thumbnailUrls: string[];
  order: number[] | undefined;
  onOrderChange: (newOrder: number[]) => void;
  /** 이미지 품질/관련성 분석 결과 (미사용) */
  analysis?: unknown;
  /** AI 분석 버튼 핸들러 (리뷰: AI 자동 추천, 상세: 관련성 분석) */
  onAnalyze?: () => void;
  /** 분석 진행 중 여부 */
  isAnalyzing?: boolean;
  /** 상품 관련성 점수 (이미지 인덱스 → 점수) */
  relevanceScores?: { index: number; score: number }[];
  /** 분석 버튼 레이블 (기본 'AI 자동 추천') */
  analyzeLabel?: string;
}

/** 거부 사유별 뱃지 메타 */
const REJECTION_BADGE: Record<string, { label: string; bg: string }> = {
  unrelated: { label: '비관련', bg: 'bg-red-500' },
  low_quality: { label: '품질↓', bg: 'bg-amber-500' },
  empty_image: { label: '빈이미지', bg: 'bg-gray-500' },
  text_banner: { label: '배너', bg: 'bg-gray-500' },
  promotional_image: { label: '광고', bg: 'bg-gray-500' },
};

function ImageSelectorGroup({
  label, images, thumbnailUrls, order, onOrderChange,
  analysis, onAnalyze, isAnalyzing, relevanceScores, analyzeLabel,
}: ImageSelectorGroupProps) {
  // 관련성 점수 인덱스 매핑
  const relevanceByIdx = useMemo(() => {
    if (!relevanceScores) return null;
    const map = new Map<number, number>();
    for (const r of relevanceScores) map.set(r.index, r.score);
    return map;
  }, [relevanceScores]);

  // 관련성 통계 계산
  const relevanceStats = useMemo(() => {
    if (!relevanceByIdx) return null;
    let related = 0, uncertain = 0, unrelated = 0;
    for (const [, score] of relevanceByIdx) {
      if (score > 0.7) related++;
      else if (score >= 0.4) uncertain++;
      else unrelated++;
    }
    return { related, uncertain, unrelated };
  }, [relevanceByIdx]);
  const dragSrcRef = useRef<number | null>(null); // position in order array being dragged
  const [dragOverPos, setDragOverPos] = useState<number | null>(null);

  if (images.length === 0) return null;

  const allIndices = images.map((_, i) => i);
  const selectedIndices = order ?? allIndices;
  const selectedSet = new Set(selectedIndices);
  const unselectedIndices = allIndices.filter(i => !selectedSet.has(i));
  const selectedCount = selectedIndices.length;
  const totalCount = images.length;

  const toggleImage = (imgIdx: number) => {
    if (selectedSet.has(imgIdx)) {
      // 제거
      const newOrder = selectedIndices.filter(i => i !== imgIdx);
      onOrderChange(newOrder);
    } else {
      // 끝에 추가
      onOrderChange([...selectedIndices, imgIdx]);
    }
  };

  const selectAll = () => onOrderChange(allIndices);
  const deselectAll = () => onOrderChange([]);

  // DnD handlers (selected 영역 내에서만)
  const handleDragStart = (posInOrder: number) => (e: React.DragEvent) => {
    dragSrcRef.current = posInOrder;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(posInOrder));
  };
  const handleDragOver = (posInOrder: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPos(posInOrder);
  };
  const handleDrop = (posInOrder: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPos(null);
    const from = dragSrcRef.current;
    if (from === null || from === posInOrder) return;
    const newOrder = [...selectedIndices];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(posInOrder, 0, moved);
    onOrderChange(newOrder);
    dragSrcRef.current = null;
  };
  const handleDragEnd = () => {
    setDragOverPos(null);
    dragSrcRef.current = null;
  };

  const renderThumb = (imgIdx: number, opts: { selected: boolean; posInOrder?: number; draggable?: boolean }) => {
    const url = thumbnailUrls[imgIdx] || images[imgIdx]?.objectUrl;
    const a = analysis?.analyses[imgIdx];
    const rejectionBadge = a?.rejectionReason ? REJECTION_BADGE[a.rejectionReason] : undefined;
    const isRecommended = a?.isRecommended ?? false;
    const relScore = relevanceByIdx?.get(imgIdx);

    // 분석 결과 기반 테두리 색상
    let borderClass = opts.selected
      ? dragOverPos === opts.posInOrder
        ? 'border-blue-400 ring-2 ring-blue-200'
        : 'border-blue-500'
      : 'border-gray-200 opacity-50';
    if (a && !opts.selected) {
      if (rejectionBadge) borderClass = 'border-red-200 opacity-40';
      else if (isRecommended) borderClass = 'border-emerald-300 opacity-70';
    }
    // 관련성 낮은 이미지 opacity 강화
    if (relScore !== undefined && relScore < 0.4 && !opts.selected) {
      borderClass = 'border-red-200 opacity-30';
    }

    const reasonText = a?.rejectionReason
      ? ` · ${REJECTION_BADGE[a.rejectionReason]?.label ?? a.rejectionReason}`
      : isRecommended
        ? ` · 추천 (품질 ${Math.round(a!.qualityScore)})`
        : '';
    const relText = relScore !== undefined ? ` · 관련성 ${Math.round(relScore * 100)}%` : '';

    return (
      <div
        key={`${label}-${imgIdx}`}
        className={`relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 ${borderClass}`}
        onClick={() => toggleImage(imgIdx)}
        draggable={opts.draggable}
        onDragStart={opts.draggable ? handleDragStart(opts.posInOrder!) : undefined}
        onDragOver={opts.draggable ? handleDragOver(opts.posInOrder!) : undefined}
        onDrop={opts.draggable ? handleDrop(opts.posInOrder!) : undefined}
        onDragEnd={opts.draggable ? handleDragEnd : undefined}
        title={`${images[imgIdx]?.name ?? `이미지 ${imgIdx + 1}`}${opts.selected ? ` (순서 ${opts.posInOrder! + 1})` : ' (제외됨)'}${reasonText}${relText}`}
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-gray-300" />
          </div>
        )}
        {/* 선택 체크마크 */}
        {opts.selected && (
          <div className="absolute top-1 left-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        {/* 순서 번호 */}
        {opts.selected && opts.posInOrder !== undefined && (
          <div className="absolute bottom-1 right-1 min-w-[18px] h-[18px] bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow">
            {opts.posInOrder + 1}
          </div>
        )}
        {/* 분석 뱃지 (우상단) */}
        {rejectionBadge && (
          <div className={`absolute top-1 right-1 text-[9px] px-1 py-[1px] rounded ${rejectionBadge.bg} text-white font-bold shadow`}>
            {rejectionBadge.label}
          </div>
        )}
        {!rejectionBadge && isRecommended && (
          <div className="absolute top-1 right-1 text-[9px] px-1 py-[1px] rounded bg-emerald-500 text-white font-bold shadow flex items-center gap-0.5">
            <Sparkles className="w-2.5 h-2.5" />추천
          </div>
        )}
        {/* 관련성 점 (좌하단) */}
        {relScore !== undefined && (
          <div
            className={`absolute bottom-1 left-1 w-3 h-3 rounded-full shadow border border-white/60 ${
              relScore > 0.7 ? 'bg-emerald-500' : relScore >= 0.4 ? 'bg-amber-400' : 'bg-red-500'
            }`}
            title={`관련성 ${Math.round(relScore * 100)}%`}
          />
        )}
        {/* 미선택 오버레이 */}
        {!opts.selected && (
          <div className="absolute inset-0 bg-white/40" />
        )}
      </div>
    );
  };

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
          {selectedCount}/{totalCount}장 선택
        </span>
        <div className="flex-1" />
        {onAnalyze && (
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="text-[10px] px-2 py-0.5 rounded border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-50 transition flex items-center gap-1"
            title="AI가 품질과 상품 관련성을 분석하여 추천 이미지를 자동 선택합니다"
          >
            <Sparkles className="w-3 h-3" />
            {isAnalyzing ? '분석중...' : analyzeLabel ?? (analysis ? '다시 분석' : 'AI 자동 추천')}
          </button>
        )}
        <button
          onClick={selectAll}
          className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
        >
          전체선택
        </button>
        <button
          onClick={deselectAll}
          className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 transition"
        >
          전체해제
        </button>
      </div>
      {analysis && (
        <div className="text-[10px] text-gray-600 bg-gray-50 px-2 py-1.5 rounded mb-2 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>총 <b>{analysis.stats.total}</b>장</span>
          <span className="text-emerald-600">추천 <b>{analysis.stats.recommended}</b>장</span>
          {analysis.stats.rejectedUnrelated > 0 && (
            <span className="text-red-500">비관련 <b>{analysis.stats.rejectedUnrelated}</b>장</span>
          )}
          {analysis.stats.rejectedLowQuality > 0 && (
            <span className="text-amber-600">품질낮음 <b>{analysis.stats.rejectedLowQuality}</b>장</span>
          )}
          {analysis.stats.rejectedBanner > 0 && (
            <span className="text-gray-500">배너/광고 <b>{analysis.stats.rejectedBanner}</b>장</span>
          )}
        </div>
      )}
      {relevanceStats && (
        <div className="text-[10px] text-gray-600 bg-gray-50 px-2 py-1.5 rounded mb-2 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-emerald-600">관련 <b>{relevanceStats.related}</b>장</span>
          {relevanceStats.uncertain > 0 && (
            <span className="text-amber-500">불확실 <b>{relevanceStats.uncertain}</b>장</span>
          )}
          {relevanceStats.unrelated > 0 && (
            <span className="text-red-500">비관련 <b>{relevanceStats.unrelated}</b>장</span>
          )}
        </div>
      )}
      {selectedCount === 0 && (
        <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded mb-2">
          선택된 이미지가 없습니다. 상세페이지에 이미지가 포함되지 않습니다.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {/* 선택된 이미지 (드래그 가능) */}
        {selectedIndices.map((imgIdx, posInOrder) =>
          renderThumb(imgIdx, { selected: true, posInOrder, draggable: selectedCount > 1 })
        )}
        {/* 미선택 이미지 */}
        {unselectedIndices.map(imgIdx =>
          renderThumb(imgIdx, { selected: false })
        )}
      </div>
      {selectedCount > 1 && (
        <p className="text-[10px] text-gray-400 mt-1.5">
          선택된 이미지를 드래그하여 순서를 변경할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function Collapsible({ title, icon, badge, defaultOpen = true, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {badge && <span className="text-[10px] text-gray-400 font-normal">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}

export default function DetailPageContentTab({
  product,
  onUpdate,
  preUploadedUrls,
}: DetailPageContentTabProps) {
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewVariant, setPreviewVariant] = useState<'A' | 'B' | 'C' | 'D'>('A');
  // lazy objectURL 생성 결과 (review/detail은 eagerObjectUrls=false로 스캔됨)
  const [resolvedDetailUrls, setResolvedDetailUrls] = useState<string[]>([]);
  const [resolvedReviewUrls, setResolvedReviewUrls] = useState<string[]>([]);
  // 상세 이미지 관련성 분석 결과
  const [detailRelevanceScores, setDetailRelevanceScores] = useState<{ index: number; score: number }[] | null>(null);
  const [isAnalyzingDetailRelevance, setIsAnalyzingDetailRelevance] = useState(false);

  // 상품이 바뀌면 분석 결과 초기화
  useEffect(() => {
    setDetailRelevanceScores(null);
    setIsAnalyzingDetailRelevance(false);
  }, [product.uid]);

  const description = product.editedDescription ?? product.description ?? '';
  const storyParagraphs = product.editedStoryParagraphs ?? [];
  const reviewTexts = product.editedReviewTexts ?? [];
  const contentBlocks: ContentBlock[] = product.editedContentBlocks ?? [];

  // scanned 이미지의 objectURL을 lazy 생성 (썸네일 + 미리보기 공용)
  useEffect(() => {
    // CDN URL이 있으면 lazy 생성 불필요
    if (preUploadedUrls?.detailImageUrls?.filter(Boolean).length) return;
    let cancelled = false;
    (async () => {
      const detailImgs = product.scannedDetailImages ?? [];
      const reviewImgs = product.scannedReviewImages ?? [];
      if (detailImgs.length === 0 && reviewImgs.length === 0) return;
      const dUrls: string[] = [];
      for (const img of detailImgs) {
        const url = await ensureObjectUrl(img);
        if (url) dUrls.push(url);
      }
      const rUrls: string[] = [];
      for (const img of reviewImgs) {
        const url = await ensureObjectUrl(img);
        if (url) rUrls.push(url);
      }
      if (!cancelled) {
        setResolvedDetailUrls(dUrls);
        setResolvedReviewUrls(rUrls);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.uid, preUploadedUrls?.detailImageUrls]);

  // --- 상품설명 ---
  const handleDescriptionChange = useCallback((value: string) => {
    onUpdate(product.uid, 'editedDescription', value);
  }, [product.uid, onUpdate]);

  // --- 스토리 문단 ---
  const handleParagraphChange = useCallback((index: number, value: string) => {
    const updated = [...storyParagraphs];
    updated[index] = value;
    onUpdate(product.uid, 'editedStoryParagraphs', updated);
  }, [product.uid, storyParagraphs, onUpdate]);

  const handleAddParagraph = useCallback(() => {
    onUpdate(product.uid, 'editedStoryParagraphs', [...storyParagraphs, '']);
  }, [product.uid, storyParagraphs, onUpdate]);

  const handleRemoveParagraph = useCallback((index: number) => {
    const updated = storyParagraphs.filter((_, i) => i !== index);
    onUpdate(product.uid, 'editedStoryParagraphs', updated);
  }, [product.uid, storyParagraphs, onUpdate]);

  // --- 리뷰 텍스트 ---
  const handleReviewTextChange = useCallback((index: number, value: string) => {
    const updated = [...reviewTexts];
    updated[index] = value;
    onUpdate(product.uid, 'editedReviewTexts', updated);
  }, [product.uid, reviewTexts, onUpdate]);

  const handleAddReviewText = useCallback(() => {
    onUpdate(product.uid, 'editedReviewTexts', [...reviewTexts, '']);
  }, [product.uid, reviewTexts, onUpdate]);

  const handleRemoveReviewText = useCallback((index: number) => {
    const updated = reviewTexts.filter((_, i) => i !== index);
    onUpdate(product.uid, 'editedReviewTexts', updated);
  }, [product.uid, reviewTexts, onUpdate]);

  // --- 상세 이미지 관련성 분석 ---
  const handleAnalyzeDetailRelevance = useCallback(async () => {
    const detailImgs = product.scannedDetailImages ?? [];
    if (detailImgs.length === 0) return;

    setIsAnalyzingDetailRelevance(true);
    try {
      // 상세 이미지 URL 수집
      const detailUrls: string[] = [];
      for (const img of detailImgs) {
        const url = await ensureObjectUrl(img);
        detailUrls.push(url || 'data:image/png;base64,');
      }

      // 기준 이미지(대표이미지) 수집
      const mainImgs = product.scannedMainImages ?? [];
      const referenceUrls: string[] = [];
      for (const img of mainImgs) {
        const url = await ensureObjectUrl(img);
        if (url) referenceUrls.push(url);
      }
      if (referenceUrls.length === 0 && preUploadedUrls?.mainImageUrls) {
        referenceUrls.push(...preUploadedUrls.mainImageUrls.filter(Boolean));
      }

      const scores = await scoreProductRelevance(referenceUrls, detailUrls);
      const mapped = scores.map(s => ({ index: s.index, score: s.score }));
      setDetailRelevanceScores(mapped);

      // 자동 재선택: score < 0.3 제외, score >= 0.4 선택
      if (product.editedDetailImageOrder === undefined) {
        const autoSelected = scores
          .filter(s => s.score >= 0.4)
          .map(s => s.index);
        if (autoSelected.length > 0) {
          onUpdate(product.uid, 'editedDetailImageOrder', autoSelected);
        }
      }
    } catch (err) {
      console.error('[analyzeDetailRelevance]', err);
    } finally {
      setIsAnalyzingDetailRelevance(false);
    }
  }, [
    product.uid,
    product.scannedDetailImages,
    product.scannedMainImages,
    product.editedDetailImageOrder,
    preUploadedUrls?.mainImageUrls,
    onUpdate,
  ]);

  // --- 미리보기 HTML ---
  const previewHtml = useMemo(() => {
    if (!previewOpen) return '';

    // 서버 업로드 URL > lazy resolved objectURL > 인라인 objectURL > 플레이스홀더 순서
    const detailImageUrls = (preUploadedUrls?.detailImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.detailImageUrls!.filter(Boolean)
      : resolvedDetailUrls.length > 0
        ? resolvedDetailUrls
        : (product.scannedDetailImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);
    const reviewImageUrls = (preUploadedUrls?.reviewImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.reviewImageUrls!.filter(Boolean)
      : resolvedReviewUrls.length > 0
        ? resolvedReviewUrls
        : (product.scannedReviewImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);
    const infoImageUrls = (preUploadedUrls?.infoImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.infoImageUrls!.filter(Boolean)
      : (product.scannedInfoImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);

    // order 배열로 이미지 필터링 (선택/순서 반영)
    const filteredDetailUrls = filterByOrder(detailImageUrls, product.editedDetailImageOrder);
    const filteredReviewUrls = filterByOrder(reviewImageUrls, product.editedReviewImageOrder);

    // 이미지 없으면 플레이스홀더 SVG 사용
    const placeholderImg = (label: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect fill="#f0f0f0" width="800" height="400"/><text fill="#999" font-family="sans-serif" font-size="20" x="400" y="200" text-anchor="middle">${label}</text></svg>`)}`;

    // editedDetailImageOrder가 []이면 사용자가 의도적으로 0장 선택한 것 → 빈 배열
    const detailUrls = filteredDetailUrls.length > 0
      ? filteredDetailUrls
      : Array.isArray(product.editedDetailImageOrder) && product.editedDetailImageOrder.length === 0
        ? []
        : product.detailImageCount > 0
          ? Array.from({ length: Math.min(product.detailImageCount, 3) }, (_, i) => placeholderImg(`상세이미지 ${i + 1}`))
          : [];

    // 리뷰이미지는 상세페이지에 사용하지 않음
    const reviewUrls: string[] = [];

    const paragraphs = storyParagraphs.length > 0
      ? storyParagraphs.filter(p => p.trim())
      : (description ? [description] : []);

    // 제3자 이미지: 서버 로직과 동일 — 20% 확률로 1장만 선택
    const tpSeed = product.productCode || product.uid;
    let tpHash = 0;
    for (let i = 0; i < tpSeed.length; i++) tpHash = ((tpHash << 5) - tpHash + tpSeed.charCodeAt(i)) | 0;
    const tpSlot = Math.abs(tpHash) % 5; // 0~4 중 0만 선택 = 20%
    const selectedTp = tpSlot === 0
      ? [THIRD_PARTY_IMAGE_URLS[Math.abs(tpHash) % THIRD_PARTY_IMAGE_URLS.length]]
      : [];

    return buildRichDetailPageHtml(
      {
        productName: product.editedDisplayProductName || product.name,
        brand: '',  // 브랜드 비움 (아이템위너 방지)
        aiStoryParagraphs: paragraphs,
        reviewImageUrls: reviewUrls,
        reviewTexts: reviewTexts.length > 0 ? reviewTexts : undefined,
        detailImageUrls: detailUrls,
        infoImageUrls,
        thirdPartyImageUrls: selectedTp,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        categoryPath: product.editedCategoryName,
      },
      previewVariant,
    );
  }, [previewOpen, previewVariant, product, storyParagraphs, reviewTexts, description, preUploadedUrls, contentBlocks, resolvedDetailUrls, resolvedReviewUrls]);

  return (
    <div className="space-y-3">
      {/* ─── 상세페이지 이미지 선택 ─── */}
      {(product.scannedDetailImages?.length ?? 0) > 0 && (
        <Collapsible
          title="상세페이지 이미지"
          icon={<ImageIcon className="w-3.5 h-3.5 text-indigo-500" />}
          badge={`${(product.editedDetailImageOrder ?? product.scannedDetailImages ?? []).length}장 선택`}
          defaultOpen={false}
        >
          <ImageSelectorGroup
            label="상세이미지"
            images={product.scannedDetailImages ?? []}
            thumbnailUrls={resolvedDetailUrls}
            order={product.editedDetailImageOrder}
            onOrderChange={(newOrder) => onUpdate(product.uid, 'editedDetailImageOrder', newOrder)}
            onAnalyze={handleAnalyzeDetailRelevance}
            isAnalyzing={isAnalyzingDetailRelevance}
            analyzeLabel={detailRelevanceScores ? '다시 분석' : '관련성 분석'}
            relevanceScores={detailRelevanceScores ?? product.detailImageSelectionMeta?.relevanceScores ?? undefined}
          />
        </Collapsible>
      )}

      {/* ─── 상품설명 ─── */}
      <Collapsible
        title="상품설명"
        icon={<FileText className="w-3.5 h-3.5 text-blue-500" />}
        badge={`${description.length}자`}
      >
        <div className="pt-2">
          <textarea
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none resize-y"
            placeholder="상품 설명을 입력하세요. 이 텍스트는 쿠팡 상세페이지에 포함됩니다."
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-gray-400">{description.length}자</span>
            {product.editedDescription !== undefined && product.editedDescription !== product.description && (
              <button
                onClick={() => onUpdate(product.uid, 'editedDescription', product.description)}
                className="text-[10px] text-gray-400 hover:text-[#E31837]"
              >
                원본 복원
              </button>
            )}
          </div>
        </div>
      </Collapsible>

      {/* ─── AI 스토리 문단 ─── */}
      <Collapsible
        title={contentBlocks.length > 0 ? '설득형 콘텐츠 블록' : '스토리 문단 (이미지 사이 텍스트)'}
        icon={<GripVertical className="w-3.5 h-3.5 text-purple-500" />}
        badge={contentBlocks.length > 0 ? `${contentBlocks.length}블록` : storyParagraphs.length > 0 ? `${storyParagraphs.length}개` : undefined}
      >
        <div className="pt-2 space-y-2">
          {storyParagraphs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">
              스토리 문단이 없습니다. 직접 추가하거나, 등록 시 AI가 자동 생성합니다.
            </p>
          ) : (
            storyParagraphs.map((para, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1 shrink-0 mt-1.5">
                  <span className="text-[10px] text-gray-400 w-4 text-center">{i + 1}</span>
                  {contentBlocks[i] && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium whitespace-nowrap">
                      {contentBlocks[i].type}
                    </span>
                  )}
                </div>
                <textarea
                  value={para}
                  onChange={(e) => handleParagraphChange(i, e.target.value)}
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-[#E31837] outline-none resize-y"
                  placeholder={`문단 ${i + 1} 내용`}
                />
                <button
                  onClick={() => handleRemoveParagraph(i)}
                  className="p-1 text-gray-300 hover:text-red-500 transition mt-1.5"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
          <button
            onClick={handleAddParagraph}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-[#E31837] hover:text-[#E31837] transition w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> 문단 추가
          </button>
          <p className="text-[10px] text-gray-400">
            상세 이미지 사이에 삽입되는 텍스트입니다. 비워두면 등록 시 AI가 자동 생성합니다.
          </p>
        </div>
      </Collapsible>

      {/* ─── 리뷰 텍스트 ─── */}
      <Collapsible
        title="리뷰 텍스트"
        icon={<MessageSquare className="w-3.5 h-3.5 text-green-500" />}
        badge={reviewTexts.length > 0 ? `${reviewTexts.length}개` : undefined}
      >
        <div className="pt-2 space-y-2">
          {reviewTexts.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">
              리뷰 텍스트가 없습니다. 직접 추가하거나, 등록 시 AI가 자동 생성합니다.
            </p>
          ) : (
            reviewTexts.map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] text-gray-400 mt-2.5 w-4 shrink-0 text-center">{i + 1}</span>
                <textarea
                  value={text}
                  onChange={(e) => handleReviewTextChange(i, e.target.value)}
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-[#E31837] outline-none resize-y"
                  placeholder={`리뷰 ${i + 1}: 사용 후기를 입력하세요`}
                />
                <button
                  onClick={() => handleRemoveReviewText(i)}
                  className="p-1 text-gray-300 hover:text-red-500 transition mt-1.5"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
          <button
            onClick={handleAddReviewText}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-[#E31837] hover:text-[#E31837] transition w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> 리뷰 추가
          </button>
          <p className="text-[10px] text-gray-400">
            리뷰 이미지 아래에 표시되는 후기 텍스트입니다. 비워두면 등록 시 AI가 자동 생성합니다.
          </p>
        </div>
      </Collapsible>

      {/* ─── 상세페이지 미리보기 ─── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <button
            onClick={() => setPreviewOpen(!previewOpen)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-[#E31837] transition"
          >
            {previewOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            상세페이지 미리보기
          </button>
          {previewOpen && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500">레이아웃:</label>
              <select
                value={previewVariant}
                onChange={(e) => setPreviewVariant(e.target.value as 'A' | 'B' | 'C' | 'D')}
                className="px-2 py-0.5 border border-gray-200 rounded text-[10px] focus:ring-1 focus:ring-[#E31837] outline-none"
              >
                <option value="A">A — 이미지-글 교차</option>
                <option value="B">B — 이미지 먼저</option>
                <option value="C">C — 히어로+그리드</option>
                <option value="D">D — 헤더 없음</option>
              </select>
            </div>
          )}
        </div>
        {previewOpen && (
          <div className="border-t border-gray-100 bg-gray-50 p-2">
            <div className="bg-white rounded-lg shadow-inner overflow-hidden" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;}</style></head><body>${previewHtml}</body></html>`}
                className="w-full border-0"
                style={{ height: '500px' }}
                title="상세페이지 미리보기"
                sandbox="allow-same-origin"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              실제 등록 시 이미지가 CDN에 업로드된 후 최종 HTML이 생성됩니다.
              {!preUploadedUrls && ' (현재 플레이스홀더 이미지 표시 중)'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
