'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  FileText, MessageSquare, Plus, Trash2, Eye, EyeOff,
  ChevronDown, ChevronRight, GripVertical, Image as ImageIcon, Check,
  Sparkles,
} from 'lucide-react';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
import EditableDetailPreview from './EditableDetailPreview';
import { fillNoticeFields, type NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import { ensureObjectUrl } from '@/lib/megaload/services/client-folder-scanner';
import {
  scoreProductRelevance,
  filterDetailPageImages,
  detectDuplicateImages,
  type ProductRelevanceScore,
} from '@/lib/megaload/services/image-quality-scorer';
import { createSeededRandom, stringToSeed } from '@/lib/megaload/services/seeded-random';
import { selectWithSeed } from '@/lib/megaload/services/item-winner-prevention';
import { THIRD_PARTY_IMAGE_URLS } from '@/lib/megaload/constants/third-party-images';
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
  /** 현재 카테고리의 고시정보 메타 (서버에서 fetch한 categoryMetaCache의 noticeMeta) */
  noticeMeta?: NoticeCategoryMeta[];
  /** 사용자 전역 고시정보 오버라이드 */
  noticeOverrides?: Record<string, string>;
  /** 리뷰 이미지를 대표 이미지로 promote 토글 */
  onTogglePromoteReview?: (uid: string, reviewIndex: number) => void;
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
  /** 스캔된 이미지 파일 핸들 (없으면 thumbnailUrls.length가 총 개수) */
  images?: ScannedImageFile[];
  thumbnailUrls: string[];
  order: number[] | undefined;
  onOrderChange: (newOrder: number[]) => void;
  /** AI 분석 버튼 핸들러 (상세: 관련성 분석) */
  onAnalyze?: () => void;
  /** 분석 진행 중 여부 */
  isAnalyzing?: boolean;
  /** 상품 관련성 점수 (이미지 인덱스 → 점수) */
  relevanceScores?: { index: number; score: number }[];
  /** 분석 버튼 레이블 (기본 'AI 자동 추천') */
  analyzeLabel?: string;
  /** 리뷰 → 대표 promote 토글 핸들러 (있으면 각 썸네일에 ⬆ 버튼 노출) */
  onTogglePromote?: (idx: number) => void;
  /** 현재 대표로 promote 된 인덱스 셋 — 버튼 토글 상태 표시용 */
  promotedSet?: Set<number>;
}


function ImageSelectorGroup({
  label, images, thumbnailUrls, order, onOrderChange,
  onAnalyze, isAnalyzing, relevanceScores, analyzeLabel,
  onTogglePromote, promotedSet,
}: ImageSelectorGroupProps) {
  // 이미지 총 개수: 스캔 핸들 있으면 그 길이, 없으면 썸네일 URL 길이 기준
  const totalCount = images?.length ?? thumbnailUrls.length;
  const imageNameAt = (idx: number) => images?.[idx]?.name ?? `이미지 ${idx + 1}`;
  const objectUrlAt = (idx: number) => images?.[idx]?.objectUrl;
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

  if (totalCount === 0) return null;

  const allIndices = Array.from({ length: totalCount }, (_, i) => i);
  const selectedIndices = order ?? allIndices;
  const selectedSet = new Set(selectedIndices);
  const unselectedIndices = allIndices.filter(i => !selectedSet.has(i));
  const selectedCount = selectedIndices.length;

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
    const url = thumbnailUrls[imgIdx] || objectUrlAt(imgIdx);
    const relScore = relevanceByIdx?.get(imgIdx);
    const autoExcludeReason = images?.[imgIdx]?.autoExcludeReason;

    // 테두리 색상
    let borderClass = opts.selected
      ? dragOverPos === opts.posInOrder
        ? 'border-blue-400 ring-2 ring-blue-200'
        : 'border-blue-500'
      : 'border-gray-200 opacity-50';
    // 관련성 낮은 이미지 opacity 강화
    if (relScore !== undefined && relScore < 0.4 && !opts.selected) {
      borderClass = 'border-red-200 opacity-30';
    }
    // 자동 제외된 이미지 강조
    if (autoExcludeReason && !opts.selected) {
      borderClass = 'border-amber-300 ring-1 ring-amber-200 opacity-60';
    }

    const relText = relScore !== undefined ? ` · 관련성 ${Math.round(relScore * 100)}%` : '';
    const reasonLabels: Record<string, string> = {
      duplicate: '중복',
      text_banner: '광고/텍스트',
      empty_image: '빈 이미지',
      hard_filter: '광고/텍스트',
      low_score: '품질 낮음',
      color_outlier: '색상 이질',
      unrelated_to_main: '대표와 무관',
    };
    const reasonText = autoExcludeReason ? ` · 자동제외(${reasonLabels[autoExcludeReason] ?? autoExcludeReason})` : '';

    return (
      <div
        key={`${label}-${imgIdx}`}
        className={`group relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 ${borderClass}`}
        onClick={() => toggleImage(imgIdx)}
        draggable={opts.draggable}
        onDragStart={opts.draggable ? handleDragStart(opts.posInOrder!) : undefined}
        onDragOver={opts.draggable ? handleDragOver(opts.posInOrder!) : undefined}
        onDrop={opts.draggable ? handleDrop(opts.posInOrder!) : undefined}
        onDragEnd={opts.draggable ? handleDragEnd : undefined}
        title={`${imageNameAt(imgIdx)}${opts.selected ? ` (순서 ${opts.posInOrder! + 1})` : ' (제외됨)'}${relText}${reasonText}`}
      >
        {url ? (
          <img src={url} alt="" width={80} height={80} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
        {/* 자동 제외 배지 (상단) */}
        {autoExcludeReason && (
          <div className="absolute inset-x-0 top-0 bg-amber-500/95 text-white text-[8px] font-bold px-1 py-0.5 truncate">
            {reasonLabels[autoExcludeReason] ?? autoExcludeReason}
          </div>
        )}
        {/* 리뷰 → 대표 promote 토글 (우상단) */}
        {onTogglePromote && (() => {
          const isPromoted = !!promotedSet?.has(imgIdx);
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePromote(imgIdx); }}
              className={`absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[8px] font-bold shadow transition ${
                isPromoted
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-white/90 text-gray-700 opacity-0 group-hover:opacity-100 hover:bg-amber-100'
              }`}
              title={isPromoted ? '대표 이미지에서 제외' : '대표 이미지로 추가'}
            >
              {isPromoted ? '★대표' : '⬆ 대표로'}
            </button>
          );
        })()}
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
            {isAnalyzing ? '분석중...' : analyzeLabel ?? 'AI 자동 추천'}
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
  noticeMeta,
  noticeOverrides,
  onTogglePromoteReview,
}: DetailPageContentTabProps) {
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewVariant, setPreviewVariant] = useState<'A' | 'B' | 'C' | 'D'>('A');
  // lazy objectURL 생성 결과 (review/detail은 eagerObjectUrls=false로 스캔됨)
  const [resolvedDetailUrls, setResolvedDetailUrls] = useState<string[]>([]);
  const [resolvedReviewUrls, setResolvedReviewUrls] = useState<string[]>([]);
  // 상세 이미지 관련성 분석 결과
  const [detailRelevanceScores, setDetailRelevanceScores] = useState<{ index: number; score: number }[] | null>(null);
  const [isAnalyzingDetailRelevance, setIsAnalyzingDetailRelevance] = useState(false);

  // 상품이 바뀌면 분석 결과 + 미리보기 펼침 상태 초기화 (한 번 닫고 다른 상품 봐도 다시 보이도록)
  useEffect(() => {
    setDetailRelevanceScores(null);
    setIsAnalyzingDetailRelevance(false);
    setPreviewOpen(true);
  }, [product.uid]);

  // 자동 트리거: 패널이 열렸고 분석이 한 번도 안 돌았으면 자동 실행
  // 보호 케이스 (자동 트리거 SKIP):
  //   - editedDetailImageOrder가 부분 선택 (= 사용자가 의도적으로 큐레이션한 상태)
  //   - 이미 분석 결과 있음 (detailRelevanceScores)
  //   - 이미 트리거함 (autoTriggeredRef)
  // 트리거 케이스:
  //   - editedDetailImageOrder undefined (스캔 초기 상태)
  //   - 또는 전부 선택 (= 옛 코드로 스캔 OR "전체선택" 누른 상태, 큐레이션 아님)
  const autoTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    const totalDetail = product.scannedDetailImages?.length ?? 0;
    if (totalDetail === 0) return;
    if (detailRelevanceScores) return; // 이미 분석 완료
    if (isAnalyzingDetailRelevance) return;
    if (autoTriggeredRef.current === product.uid) return; // 이 상품은 이미 트리거 함

    // 사용자 큐레이션 보호: 부분 선택이면 SKIP
    const order = product.editedDetailImageOrder;
    const isUserCurated = order !== undefined && order.length > 0 && order.length < totalDetail;
    if (isUserCurated) return;

    autoTriggeredRef.current = product.uid;
    // 짧은 지연으로 panel 렌더 완료 후 실행 (UX 부드럽게)
    const timer = setTimeout(() => {
      handleAnalyzeDetailRelevance();
    }, 100);
    return () => clearTimeout(timer);
    // handleAnalyzeDetailRelevance를 deps에 넣으면 무한루프 가능 — 의도적 omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.uid, product.scannedDetailImages, product.editedDetailImageOrder, detailRelevanceScores, isAnalyzingDetailRelevance]);

  const description = product.editedDescription ?? product.description ?? '';
  const storyParagraphs = product.editedStoryParagraphs ?? [];
  const reviewTexts = product.editedReviewTexts ?? [];
  const contentBlocks: ContentBlock[] = product.editedContentBlocks ?? [];

  // 썸네일 URL 해결 헬퍼 — 스캔 핸들 → 업로드된 CDN URL → 로컬 경로 serve-image 순
  // (세션 복원/서버 폴더 상품에서도 선택 UI가 표시되도록)
  const resolveThumbnailUrls = (
    resolvedUrls: string[],
    scanned: ScannedImageFile[] | undefined,
    cdnUrls: string[] | undefined,
    localPaths: string[] | undefined,
  ): string[] => {
    if (resolvedUrls.length > 0) return resolvedUrls;
    const scannedUrls = scanned
      ?.map(img => img.objectUrl)
      .filter((u): u is string => !!u) ?? [];
    if (scannedUrls.length > 0) return scannedUrls;
    const cdn = cdnUrls?.filter((u): u is string => !!u) ?? [];
    if (cdn.length > 0) return cdn;
    return (localPaths ?? []).map(p =>
      p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:')
        ? p
        : `/api/megaload/products/bulk-register/serve-image?path=${encodeURIComponent(p)}`,
    );
  };

  const detailThumbnailUrls = useMemo<string[]>(
    () => resolveThumbnailUrls(resolvedDetailUrls, product.scannedDetailImages, preUploadedUrls?.detailImageUrls, product.detailImages),
    [resolvedDetailUrls, product.scannedDetailImages, product.detailImages, preUploadedUrls?.detailImageUrls],
  );

  const reviewThumbnailUrls = useMemo<string[]>(
    () => resolveThumbnailUrls(resolvedReviewUrls, product.scannedReviewImages, preUploadedUrls?.reviewImageUrls, product.reviewImages),
    [resolvedReviewUrls, product.scannedReviewImages, product.reviewImages, preUploadedUrls?.reviewImageUrls],
  );

  // scanned 이미지의 objectURL을 병렬 생성 (썸네일 + 미리보기 공용)
  // 병렬 동시성 + 점진적 setState로 썸네일이 즉시 하나씩 나타나도록 함
  useEffect(() => {
    // CDN URL이 있으면 lazy 생성 불필요
    if (preUploadedUrls?.detailImageUrls?.filter(Boolean).length) return;
    let cancelled = false;

    const detailImgs = product.scannedDetailImages ?? [];
    const reviewImgs = product.scannedReviewImages ?? [];
    if (detailImgs.length === 0 && reviewImgs.length === 0) {
      setResolvedDetailUrls([]);
      setResolvedReviewUrls([]);
      return;
    }

    // 인덱스 보존을 위한 미리 채운 배열 (실패 시 빈 문자열)
    const dUrls: string[] = new Array(detailImgs.length).fill('');
    const rUrls: string[] = new Array(reviewImgs.length).fill('');

    // 점진적 flush: 5개씩 모이면 setState (UI에 즉시 반영)
    let pendingFlush = false;
    const scheduleFlush = () => {
      if (pendingFlush || cancelled) return;
      pendingFlush = true;
      // requestAnimationFrame으로 다음 프레임에 batch 적용 (불필요 리렌더 방지)
      const apply = () => {
        if (cancelled) return;
        setResolvedDetailUrls([...dUrls]);
        setResolvedReviewUrls([...rUrls]);
        pendingFlush = false;
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(apply);
      } else {
        setTimeout(apply, 16);
      }
    };

    // 병렬 워커 풀 (동시 10개) — 메인 이미지에 영향 안 가는 수준
    const tasks: { kind: 'd' | 'r'; idx: number; img: typeof detailImgs[number] }[] = [];
    for (let j = 0; j < detailImgs.length; j++) tasks.push({ kind: 'd', idx: j, img: detailImgs[j] });
    for (let j = 0; j < reviewImgs.length; j++) tasks.push({ kind: 'r', idx: j, img: reviewImgs[j] });

    let nextIdx = 0;
    let resolvedCount = 0;
    const CONC = 10;
    const worker = async () => {
      while (true) {
        if (cancelled) return;
        const i = nextIdx++;
        if (i >= tasks.length) return;
        const t = tasks[i];
        try {
          const url = await ensureObjectUrl(t.img);
          if (cancelled) return;
          if (url) {
            if (t.kind === 'd') dUrls[t.idx] = url;
            else rUrls[t.idx] = url;
          }
        } catch { /* skip */ }
        resolvedCount++;
        // 매 5개마다 또는 끝에서 flush
        if (resolvedCount % 5 === 0 || resolvedCount === tasks.length) {
          scheduleFlush();
        }
      }
    };
    Promise.all(
      Array.from({ length: Math.min(CONC, tasks.length) }, () => worker()),
    ).then(() => {
      if (!cancelled) scheduleFlush();
    });

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

  // --- 상세 이미지 관련성 분석 + 광고/중복 자동 제외 ---
  // 클릭 한 번에 전체 분석 + MIN_KEEP=5 보호된 자동 선택을 수행
  const handleAnalyzeDetailRelevance = useCallback(async () => {
    const detailImgs = product.scannedDetailImages ?? [];
    if (detailImgs.length === 0) return;

    setIsAnalyzingDetailRelevance(true);
    try {
      // 상세 이미지 URL 수집 (유효한 것만 — 빈 데이터 URL은 분석 대상 아님)
      const validEntries: { origIdx: number; url: string }[] = [];
      for (let j = 0; j < detailImgs.length; j++) {
        const url = await ensureObjectUrl(detailImgs[j]);
        if (url) validEntries.push({ origIdx: j, url });
      }
      if (validEntries.length === 0) return;
      const detailUrls = validEntries.map(e => e.url);

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

      // (1) 관련성 점수 (기존)
      const relScores = await scoreProductRelevance(referenceUrls, detailUrls);
      // relScores.index는 detailUrls 내 인덱스 → origIdx로 변환해 UI에 저장
      const mapped = relScores.map(s => ({
        index: validEntries[s.index]?.origIdx ?? s.index,
        score: s.score,
      }));
      setDetailRelevanceScores(mapped);

      // (2) 광고/텍스트/빈이미지 검출
      const exclusionReasons = new Map<number, string>(); // origIdx → reason
      try {
        const adFilter = await filterDetailPageImages(detailUrls);
        for (const r of adFilter) {
          if (r.filtered) {
            const origIdx = validEntries[r.index].origIdx;
            exclusionReasons.set(origIdx, r.reason || 'text_banner');
          }
        }
      } catch { /* skip */ }

      // (3) 중복 검출 (코사인 0.95+)
      try {
        const dup = await detectDuplicateImages(detailUrls, 0.95);
        for (const dupIdx of dup.duplicateIndices) {
          const origIdx = validEntries[dupIdx].origIdx;
          if (!exclusionReasons.has(origIdx)) {
            exclusionReasons.set(origIdx, 'duplicate');
          }
        }
      } catch { /* skip */ }

      // (4) 관련성 < 0.3 도 제외 후보로 추가
      for (const r of relScores) {
        const origIdx = validEntries[r.index].origIdx;
        if (r.score < 0.3 && !exclusionReasons.has(origIdx)) {
          exclusionReasons.set(origIdx, 'low_relevance');
        }
      }

      // (5) 최종 선택 = (전체 - 제외 후보) — 관련성 순으로 정렬
      const allOrigIndices = validEntries.map(e => e.origIdx);
      let finalSelected = allOrigIndices.filter(i => !exclusionReasons.has(i));

      // (6) MIN_KEEP=5 보호 — 너무 적게 남으면 우선순위 낮은 사유부터 해제
      const MIN_KEEP = 5;
      const minKeep = Math.min(MIN_KEEP, allOrigIndices.length);
      if (finalSelected.length < minKeep && exclusionReasons.size > 0) {
        // 풀어주기 우선순위: low_relevance(약함) → duplicate → text_banner → empty_image(강함)
        const reasonPriority: Record<string, number> = {
          low_relevance: 1,
          duplicate: 2,
          text_banner: 3,
          dark_background: 3,
          colored_banner: 3,
          promotional_image: 3,
          empty_image: 4,
        };
        const taggedSorted = allOrigIndices
          .filter(i => exclusionReasons.has(i))
          .sort((a, b) => {
            const pa = reasonPriority[exclusionReasons.get(a)!] ?? 99;
            const pb = reasonPriority[exclusionReasons.get(b)!] ?? 99;
            if (pa !== pb) return pa - pb;
            // 같은 사유면 관련성 점수 높은 순
            const sa = relScores.find(r => validEntries[r.index].origIdx === a)?.score ?? 0;
            const sb = relScores.find(r => validEntries[r.index].origIdx === b)?.score ?? 0;
            return sb - sa;
          });
        let releaseCount = minKeep - finalSelected.length;
        for (const origIdx of taggedSorted) {
          if (releaseCount <= 0) break;
          exclusionReasons.delete(origIdx);
          releaseCount--;
        }
        finalSelected = allOrigIndices.filter(i => !exclusionReasons.has(i));
        console.warn(`[analyzeDetailRelevance] ${product.productCode}: MIN_KEEP=${minKeep} 보호 — 자동제외 일부 해제`);
      }

      // (7) 결과 적용 — 관련성 높은 순으로 정렬
      finalSelected.sort((a, b) => {
        const sa = relScores.find(r => validEntries[r.index].origIdx === a)?.score ?? 0;
        const sb = relScores.find(r => validEntries[r.index].origIdx === b)?.score ?? 0;
        return sb - sa;
      });

      if (finalSelected.length > 0) {
        onUpdate(product.uid, 'editedDetailImageOrder', finalSelected);
        const excludedCount = allOrigIndices.length - finalSelected.length;
        if (excludedCount > 0) {
          const summary = Array.from(exclusionReasons.entries())
            .map(([i, r]) => `#${i + 1}=${r}`)
            .slice(0, 8)
            .join(', ');
          console.info(`[analyzeDetailRelevance] ${product.productCode}: ${excludedCount}장 자동 제외 — ${summary}${exclusionReasons.size > 8 ? '...' : ''}`);
        }
      }
    } catch (err) {
      console.error('[analyzeDetailRelevance]', err);
    } finally {
      setIsAnalyzingDetailRelevance(false);
    }
  }, [
    product.uid,
    product.productCode,
    product.scannedDetailImages,
    product.scannedMainImages,
    preUploadedUrls?.mainImageUrls,
    onUpdate,
  ]);

  // --- 미리보기 HTML ---
  const previewHtml = useMemo(() => {
    if (!previewOpen) return '';

    // 서버 업로드 URL > lazy resolved objectURL > 인라인 objectURL > 로컬경로(serve-image) > 플레이스홀더 순서
    const toServeUrl = (p: string) =>
      p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:')
        ? p
        : `/api/megaload/products/bulk-register/serve-image?path=${encodeURIComponent(p)}`;

    const detailImageUrls = (preUploadedUrls?.detailImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.detailImageUrls!.filter(Boolean)
      : resolvedDetailUrls.length > 0
        ? resolvedDetailUrls
        : (product.scannedDetailImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []).length > 0
          ? product.scannedDetailImages!.map(img => img.objectUrl).filter((u): u is string => !!u)
          : (product.detailImages?.length ?? 0) > 0
            ? product.detailImages!.map(toServeUrl)
            : [];
    const reviewImageUrls = (preUploadedUrls?.reviewImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.reviewImageUrls!.filter(Boolean)
      : resolvedReviewUrls.length > 0
        ? resolvedReviewUrls
        : (product.scannedReviewImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []).length > 0
          ? product.scannedReviewImages!.map(img => img.objectUrl).filter((u): u is string => !!u)
          : (product.reviewImages?.length ?? 0) > 0
            ? product.reviewImages!.map(toServeUrl)
            : [];
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
          ? Array.from({ length: product.detailImageCount }, (_, i) => placeholderImg(`상세이미지 ${i + 1}`))
          : [];

    // editedReviewImageOrder가 []이면 사용자가 의도적으로 0장 선택한 것 → 빈 배열
    const reviewUrls = filteredReviewUrls.length > 0
      ? filteredReviewUrls
      : Array.isArray(product.editedReviewImageOrder) && product.editedReviewImageOrder.length === 0
        ? []
        : (product.reviewImageCount ?? 0) > 0
          ? Array.from({ length: product.reviewImageCount ?? 0 }, (_, i) => placeholderImg(`리뷰이미지 ${i + 1}`))
          : [];

    const paragraphs = storyParagraphs.length > 0
      ? storyParagraphs.filter(p => p.trim())
      : (description ? [description] : []);

    const previewReviewTexts = reviewTexts.filter(t => t.trim());

    // 제3자 이미지: 실제 등록 단일 모드와 동일한 시드 로직(20% 확률, productCode 시드)
    const tpRng = createSeededRandom(stringToSeed(`tp-select:${product.productCode}`));
    const previewThirdPartyUrls = Math.floor(tpRng() * 10) < 2
      ? [selectWithSeed([...THIRD_PARTY_IMAGE_URLS], `tp-pick:${product.productCode}`)]
      : [];

    // 고시정보(상품정보제공고시) — 서버 등록 경로(coupang-product-builder.ts:366)와 동일한 fillNoticeFields() 사용
    //   noticeMeta가 없으면(카테고리 메타 미캐싱) 빈 배열 → buildNoticeTable 호출 안 됨
    let noticeFields: { name: string; value: string }[] | undefined;
    if (noticeMeta && noticeMeta.length > 0) {
      const merged = { ...(noticeOverrides || {}), ...(product.editedNoticeValues || {}) };
      const filled = fillNoticeFields(
        noticeMeta,
        { name: product.name, brand: product.brand, tags: product.tags, description: description || '' },
        undefined,
        Object.keys(merged).length > 0 ? merged : undefined,
        undefined,
        product.editedCategoryName,
      );
      const detail = filled?.[0]?.noticeCategoryDetailName;
      if (detail && detail.length > 0) {
        noticeFields = detail.map(f => ({ name: f.noticeCategoryDetailName, value: f.content }));
      }
    }

    return buildRichDetailPageHtml(
      {
        productName: product.editedDisplayProductName || product.name,
        brand: '',  // 브랜드 비움 (아이템위너 방지)
        aiStoryParagraphs: paragraphs,
        reviewImageUrls: reviewUrls,       // 사용자 선택 리뷰이미지
        reviewTexts: previewReviewTexts.length > 0 ? previewReviewTexts : undefined,
        detailImageUrls: detailUrls,       // ★ 사용자 선택 이미지만
        infoImageUrls,
        thirdPartyImageUrls: previewThirdPartyUrls,
        consignmentImageUrls: [],          // 위탁판매 이미지 제거
        faqItems: [],                      // Q&A 제거
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        categoryPath: product.editedCategoryName,
        noticeFields,
      },
      previewVariant,
    );
  }, [previewOpen, previewVariant, product, storyParagraphs, reviewTexts, description, preUploadedUrls, contentBlocks, resolvedDetailUrls, resolvedReviewUrls, noticeMeta, noticeOverrides]);

  return (
    <div className="space-y-3">
      {/* ─── 리뷰 이미지 선택 ─── (상세페이지 본문은 리뷰이미지 + 스토리문단 교차로 구성) */}
      {reviewThumbnailUrls.length > 0 && (() => {
        // 현재 대표 이미지로 promote 된 리뷰 인덱스 셋
        const promotedSet = new Set<number>();
        for (const m of (product.scannedMainImages ?? [])) {
          if (m.promotedFromReview !== undefined) promotedSet.add(m.promotedFromReview);
        }
        return (
          <Collapsible
            key={`review-img-${product.uid}`}
            title="리뷰 이미지"
            icon={<ImageIcon className="w-3.5 h-3.5 text-emerald-500" />}
            badge={`${(product.editedReviewImageOrder ?? reviewThumbnailUrls).length}장 선택${promotedSet.size > 0 ? ` · 대표로 ${promotedSet.size}장` : ''}`}
            defaultOpen={true}
          >
            <ImageSelectorGroup
              label="리뷰이미지"
              images={product.scannedReviewImages}
              thumbnailUrls={reviewThumbnailUrls}
              order={product.editedReviewImageOrder}
              onOrderChange={(newOrder) => onUpdate(product.uid, 'editedReviewImageOrder', newOrder)}
              onTogglePromote={onTogglePromoteReview ? (idx) => onTogglePromoteReview(product.uid, idx) : undefined}
              promotedSet={promotedSet}
            />
          </Collapsible>
        );
      })()}

      {/* ─── 상품설명 ─── */}
      <Collapsible
        key={`description-${product.uid}`}
        title="상품설명"
        icon={<FileText className="w-3.5 h-3.5 text-blue-500" />}
        badge={`${description.length}자`}
        defaultOpen={true}
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

      {/* ─── AI 스토리 문단 ─── (인라인 편집은 미리보기에서 직접 가능하므로 기본 닫힘) */}
      <Collapsible
        key={`story-${product.uid}`}
        title={contentBlocks.length > 0 ? '설득형 콘텐츠 블록' : '스토리 문단 (이미지 사이 텍스트)'}
        icon={<GripVertical className="w-3.5 h-3.5 text-purple-500" />}
        badge={contentBlocks.length > 0 ? `${contentBlocks.length}블록` : storyParagraphs.length > 0 ? `${storyParagraphs.length}개` : undefined}
        defaultOpen={false}
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

      {/* ─── 리뷰 텍스트 ─── (인라인 편집 우선, 텍스트만 직접 보고 싶을 때만 펼침) */}
      <Collapsible
        key={`review-text-${product.uid}`}
        title="리뷰 텍스트"
        icon={<MessageSquare className="w-3.5 h-3.5 text-green-500" />}
        badge={reviewTexts.length > 0 ? `${reviewTexts.length}개` : undefined}
        defaultOpen={false}
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
            {previewVariant === 'A' ? (
              // ─── Layout A 인라인 편집 미리보기 ───
              // 본문(이미지·글 교차 섹션)만 편집 가능. 히어로/FAQ/마무리/고시정보는 read-only.
              // 본문이 사용자 편집 후 즉시 state(editedStoryParagraphs / editedReviewImageOrder)
              // 에 commit 되므로 페이로드 미리보기에도 즉시 반영.
              (() => {
                const editableParagraphs = storyParagraphs.length > 0
                  ? storyParagraphs.filter(p => p.trim())
                  : (description ? [description] : []);
                // 미리보기에서 보여주는 이미지 = 사용자가 선택한(editedReviewImageOrder) 리뷰이미지.
                // EditableDetailPreview 가 받는 imageUrls 의 index 와 1:1 매칭되도록 만든다.
                const editableImageUrls = (() => {
                  const reviewImageUrls = (preUploadedUrls?.reviewImageUrls?.filter(Boolean) ?? []).length > 0
                    ? preUploadedUrls!.reviewImageUrls!.filter(Boolean)
                    : resolvedReviewUrls.length > 0
                      ? resolvedReviewUrls
                      : (product.scannedReviewImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []).length > 0
                        ? product.scannedReviewImages!.map(img => img.objectUrl).filter((u): u is string => !!u)
                        : [];
                  return filterByOrder(reviewImageUrls, product.editedReviewImageOrder);
                })();

                return (
                  <>
                    <EditableDetailPreview
                      paragraphs={editableParagraphs}
                      imageUrls={editableImageUrls}
                      productName={product.editedDisplayProductName || product.name}
                      maxHeight={500}
                      onParagraphsChange={(next) => {
                        // 빈 문자열 제거 후 commit. 모두 비면 빈 배열로 저장 (재생성 트리거).
                        const cleaned = next.map(p => p.trim()).filter(Boolean);
                        onUpdate(product.uid, 'editedStoryParagraphs', cleaned);
                      }}
                      onImageDelete={(renderedIdx) => {
                        // renderedIdx 는 editableImageUrls 상의 index. 이를 source 이미지 index 로 역매핑.
                        const totalSourceCount = (resolvedReviewUrls.length > 0
                          ? resolvedReviewUrls.length
                          : product.scannedReviewImages?.length ?? product.reviewImages?.length ?? 0);
                        const currentOrder = product.editedReviewImageOrder
                          ?? Array.from({ length: totalSourceCount }, (_, i) => i);
                        const sourceIdxToRemove = currentOrder[renderedIdx];
                        if (sourceIdxToRemove === undefined) return;
                        const newOrder = currentOrder.filter(i => i !== sourceIdxToRemove);
                        onUpdate(product.uid, 'editedReviewImageOrder', newOrder);
                      }}
                    />
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      ✏️ 글 클릭해서 편집 · 호버 시 ✕ 삭제 · 사이 + 버튼으로 문단 추가 · 변경은 즉시 저장됨
                    </p>
                  </>
                );
              })()
            ) : (
              // ─── Layout B/C/D 는 기존 iframe 읽기전용 미리보기 유지 ───
              <>
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
                  · 인라인 편집은 레이아웃 A에서만 가능합니다.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
