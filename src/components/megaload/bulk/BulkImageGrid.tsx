'use client';

import { useState, useCallback, memo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical, Star, Sparkles, AlertTriangle } from 'lucide-react';

type AutoExcludeReason = 'hard_filter' | 'low_score' | 'color_outlier' | 'unrelated_to_main' | 'duplicate' | 'text_banner' | 'empty_image';

interface ImageItem {
  id: string;
  url: string;
  autoExcludeReason?: AutoExcludeReason;
  /** 리뷰 이미지에서 promote 된 항목 표시용 — 리뷰 인덱스. 노출 시 "리뷰" 배지로 식별. */
  promotedFromReview?: number;
}

const REASON_LABELS: Record<AutoExcludeReason, string> = {
  hard_filter: '광고/텍스트',
  low_score: '품질 낮음',
  color_outlier: '색상 이질',
  unrelated_to_main: '대표와 무관',
  duplicate: '중복',
  text_banner: '광고/텍스트',
  empty_image: '빈 이미지',
};

const REASON_TOOLTIPS: Record<AutoExcludeReason, string> = {
  hard_filter: '텍스트 배너 또는 광고성 이미지로 감지됨',
  low_score: '대표이미지 품질 점수가 낮음',
  color_outlier: '다른 이미지들과 색상 분포가 크게 다름',
  unrelated_to_main: '1번 대표이미지와 색상 분포가 크게 달라 다른 상품 사진일 가능성',
  duplicate: '다른 이미지와 색상 분포가 거의 동일 — 동일 각도 중복 사진',
  text_banner: '광고/이벤트 텍스트 배너로 감지됨',
  empty_image: '빈 이미지 또는 콘텐츠 부족',
};

interface BulkImageGridProps {
  images: ImageItem[];
  onReorder: (newOrder: ImageItem[]) => void;
  onRemove: (id: string) => void;
  onToggleAutoExclude?: (id: string) => void;
  onSetAsMain?: (id: string) => void;
  onImageClick?: (id: string, index: number) => void;
  onRegenerateClick?: (id: string, index: number) => void;
}

// React.memo로 감싸 드래그 시 다른 이미지의 불필요 리렌더 방지
// (drag transform 변하는 image만 리렌더 → 9~10장 그리드 부드러움 향상)
const SortableImage = memo(function SortableImage({ image, onRemove, onToggleAutoExclude, isMain, onSetAsMain, onImageClick, onRegenerateClick, idx }: { image: ImageItem; onRemove: (id: string) => void; onToggleAutoExclude?: (id: string) => void; isMain: boolean; onSetAsMain?: (id: string) => void; onImageClick?: (id: string, index: number) => void; onRegenerateClick?: (id: string, index: number) => void; idx: number }) {
  const [imgError, setImgError] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  const reason = image.autoExcludeReason;
  const isAutoExcluded = !!reason;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg overflow-hidden border-2 ${
        isDragging
          ? 'border-blue-400 shadow-lg'
          : isAutoExcluded
            ? 'border-amber-300 ring-1 ring-amber-200'
            : 'border-gray-200'
      }`}
    >
      <div
        onClick={onImageClick ? () => onImageClick(image.id, idx) : undefined}
        className={onImageClick ? 'cursor-pointer' : ''}
      >
        {imgError ? (
          <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-xs text-gray-400">
            로드 실패
          </div>
        ) : (
          <img
            src={image.url}
            alt=""
            className={`w-full aspect-square object-cover bg-gray-100 ${
              isAutoExcluded ? 'opacity-40 grayscale' : ''
            }`}
            // 첫 4개(첫 행)는 LCP 영향 — 즉시 페치 + 동기 디코드 우선순위.
            loading={idx < 4 ? 'eager' : 'lazy'}
            decoding="async"
            // @ts-expect-error fetchpriority 는 React 19 표준이지만 일부 타입버전 누락
            fetchpriority={idx === 0 ? 'high' : idx < 4 ? 'auto' : 'low'}
            onError={() => setImgError(true)}
          />
        )}
        {isAutoExcluded && reason && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAutoExclude?.(image.id); }}
            className="absolute inset-x-0 top-0 bg-amber-500/95 hover:bg-amber-600 text-white text-[10px] font-bold px-1.5 py-1 flex items-center gap-1 transition"
            title={`${REASON_TOOLTIPS[reason]} — 클릭하면 강제 포함 (등록에 사용)`}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">자동 제외 · {REASON_LABELS[reason]} (클릭→포함)</span>
          </button>
        )}
        {!isAutoExcluded && onToggleAutoExclude && idx > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAutoExclude(image.id); }}
            className="absolute top-1 left-8 px-1.5 py-0.5 bg-black/40 hover:bg-amber-500 text-white text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="이 이미지를 등록에서 제외"
          >
            제외
          </button>
        )}
      </div>
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 p-1 bg-black/50 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      {/* Remove button */}
      <button
        onClick={() => onRemove(image.id)}
        className="absolute top-1 right-1 p-1 bg-red-500/80 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Gemini regenerate button */}
      {onRegenerateClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onRegenerateClick(image.id, idx); }}
          className="absolute bottom-1 right-1 p-1 bg-purple-500/85 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-600 shadow"
          title="Gemini으로 이 이미지 재생성"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      )}
      {/* 순서 번호 */}
      <div className="absolute top-1 right-8 bg-black/50 text-white text-[9px] px-1 py-0.5 rounded font-mono">
        {idx + 1}
      </div>
      {/* "리뷰에서 가져옴" 배지 — 좌상단 (drag handle 옆) */}
      {image.promotedFromReview !== undefined && (
        <div
          className="absolute top-1 left-7 px-1.5 py-0.5 bg-emerald-500/90 rounded text-[9px] text-white font-bold shadow"
          title={`리뷰 이미지 #${image.promotedFromReview + 1} 에서 promote 됨`}
        >
          리뷰
        </div>
      )}
      {/* Main badge or set-as-main button */}
      {isMain ? (
        <div className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500 rounded text-[10px] text-white font-bold">
          <Star className="w-3 h-3 fill-white" /> 대표
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onSetAsMain?.(image.id); }}
          className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-500"
        >
          <Star className="w-3 h-3" /> 대표로
        </button>
      )}
    </div>
  );
});

export default function BulkImageGrid({ images, onReorder, onRemove, onToggleAutoExclude, onSetAsMain, onImageClick, onRegenerateClick }: BulkImageGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(images, oldIndex, newIndex);
    onReorder(newOrder);
  };

  if (images.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
        이미지가 없습니다.
      </div>
    );
  }

  const autoExcludedCount = images.filter(i => i.autoExcludeReason).length;

  const handleRemoveAllAutoExcluded = () => {
    // 1번(대표) 보호 — autoExcludeReason 있어도 idx 0이면 안 지움
    images.forEach((img, idx) => {
      if (idx > 0 && img.autoExcludeReason) {
        onRemove(img.id);
      }
    });
  };

  const handleIncludeAllAutoExcluded = () => {
    if (!onToggleAutoExclude) return;
    images.forEach((img) => {
      if (img.autoExcludeReason) onToggleAutoExclude(img.id);
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      {autoExcludedCount > 0 && (
        <div className="mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
          <div className="flex items-center justify-between gap-2">
            <span className="text-amber-700 font-medium text-[11px]">
              자동 제외 {autoExcludedCount}장 — 등록 시 자동으로 빠짐
            </span>
            <div className="flex gap-1 shrink-0">
              {onToggleAutoExclude && (
                <button
                  type="button"
                  onClick={handleIncludeAllAutoExcluded}
                  className="px-2 py-0.5 bg-white hover:bg-amber-100 border border-amber-300 text-amber-700 rounded text-[10px] font-bold"
                  title="자동 제외된 이미지를 모두 강제 포함"
                >
                  전부 포함
                </button>
              )}
              <button
                type="button"
                onClick={handleRemoveAllAutoExcluded}
                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold"
              >
                목록에서 삭제
              </button>
            </div>
          </div>
          <div className="mt-1 text-[10px] text-amber-600">
            다른 상품/광고/품질 낮음으로 감지. 노란 배지 클릭 = 강제 포함, 호버 시 "제외" 버튼으로 정상 이미지도 수동 제외 가능.
          </div>
        </div>
      )}
      <SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-4 gap-2">
          {images.map((image, idx) => (
            <SortableImage
              key={image.id}
              image={image}
              isMain={idx === 0}
              idx={idx}
              onRemove={onRemove}
              onToggleAutoExclude={onToggleAutoExclude}
              onSetAsMain={onSetAsMain}
              onImageClick={onImageClick}
              onRegenerateClick={onRegenerateClick}
            />
          ))}
        </div>
      </SortableContext>
      {activeId && (
        <div className="fixed inset-0 z-40 pointer-events-none" />
      )}
    </DndContext>
  );
}
