'use client';

import { useState, useCallback } from 'react';
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
import { X, GripVertical, Star, Sparkles } from 'lucide-react';

interface ImageItem {
  id: string;
  url: string;
}

interface BulkImageGridProps {
  images: ImageItem[];
  onReorder: (newOrder: ImageItem[]) => void;
  onRemove: (id: string) => void;
  onSetAsMain?: (id: string) => void;
  onImageClick?: (id: string, index: number) => void;
  onRegenerateClick?: (id: string, index: number) => void;
}

function SortableImage({ image, onRemove, isMain, onSetAsMain, onImageClick, onRegenerateClick, idx }: { image: ImageItem; onRemove: (id: string) => void; isMain: boolean; onSetAsMain?: (id: string) => void; onImageClick?: (id: string, index: number) => void; onRegenerateClick?: (id: string, index: number) => void; idx: number }) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg overflow-hidden border-2 ${
        isDragging ? 'border-blue-400 shadow-lg' : 'border-gray-200'
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
            className="w-full aspect-square object-cover bg-gray-100"
            loading="lazy"
            onError={() => setImgError(true)}
          />
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
}

export default function BulkImageGrid({ images, onReorder, onRemove, onSetAsMain, onImageClick, onRegenerateClick }: BulkImageGridProps) {
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-4 gap-2">
          {images.map((image, idx) => (
            <SortableImage
              key={image.id}
              image={image}
              isMain={idx === 0}
              idx={idx}
              onRemove={onRemove}
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
