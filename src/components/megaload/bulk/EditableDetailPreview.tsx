'use client';

/**
 * EditableDetailPreview — 네이버 블로그식 인라인 편집 미리보기.
 *
 * 기존 iframe 미리보기는 읽기 전용이라 사용자가 글을 클릭해 수정하거나 이미지를
 * 직접 삭제할 수 없었음. 이 컴포넌트는 상세페이지 본문(Layout A)을 React로 직접
 * 렌더하면서 인라인 편집 affordance를 제공한다.
 *
 * 편집 동작:
 *   - 문단 hover → "✏️ 클릭해서 편집" 표시. 클릭 → contentEditable on, blur 시 저장.
 *   - 문단 hover → 우상단 ✕ 삭제 버튼.
 *   - 문단 사이 + 호버 시 "+ 문단 추가" 버튼.
 *   - 이미지 hover → 우상단 ✕ 삭제 버튼.
 *
 * MVP 한계 (의도적):
 *   - Layout A 본문(이미지·글 교차)만 편집 가능. Hero/FAQ/마무리/고시정보는 read-only.
 *   - 리치텍스트 포맷(굵게/색상)은 미지원 — 평문만.
 *   - Undo/redo 없음.
 *   - 이미지 추가/교체는 사이드 패널의 기존 ImageSelectorGroup 사용.
 */

import { useState, useRef, useCallback } from 'react';
import { Trash2, Plus, Pencil, Sparkles } from 'lucide-react';

interface EditableDetailPreviewProps {
  /** 본문 문단 (편집 가능) */
  paragraphs: string[];
  /** 본문 이미지 URL (편집 가능: 삭제) */
  imageUrls: string[];
  /** 상품명 (이미지 alt 용, 표시용 아님) */
  productName: string;
  /** 문단 변경 콜백 — 변경된 paragraphs 배열 전체 */
  onParagraphsChange: (next: string[]) => void;
  /** 이미지 인덱스 삭제 콜백 — 삭제할 이미지의 imageUrls 내 index */
  onImageDelete: (index: number) => void;
  /** 미리보기 높이 (기본 500px) */
  maxHeight?: number;
}

interface Block {
  type: 'paragraph' | 'image';
  /** type=paragraph일 때 paragraphs 배열 내 index, type=image일 때 imageUrls 배열 내 index */
  refIdx: number;
}

/**
 * 분배 알고리즘 — detail-page-builder.ts buildBlogStyleSection과 동일하게
 * Math.ceil(remaining/slots) 동적 chunk로 모든 문단을 이미지와 페어링.
 *
 * 출력: 슬롯 단위로 [paragraphs..., image] 시퀀스 반복.
 */
function distributeBlocks(paragraphs: string[], images: string[]): Block[] {
  const blocks: Block[] = [];
  if (images.length === 0) {
    paragraphs.forEach((_, i) => blocks.push({ type: 'paragraph', refIdx: i }));
    return blocks;
  }
  if (paragraphs.length === 0) {
    images.forEach((_, i) => blocks.push({ type: 'image', refIdx: i }));
    return blocks;
  }

  let pIdx = 0;
  for (let i = 0; i < images.length; i++) {
    const remaining = paragraphs.length - pIdx;
    const slotsLeft = images.length - i;
    const take = Math.min(Math.ceil(remaining / slotsLeft), remaining);
    for (let k = 0; k < take; k++, pIdx++) {
      blocks.push({ type: 'paragraph', refIdx: pIdx });
    }
    blocks.push({ type: 'image', refIdx: i });
  }
  // 안전망 — 분배 누락분 (이론상 도달 안 함)
  while (pIdx < paragraphs.length) {
    blocks.push({ type: 'paragraph', refIdx: pIdx });
    pIdx++;
  }
  return blocks;
}

export default function EditableDetailPreview({
  paragraphs,
  imageUrls,
  productName,
  onParagraphsChange,
  onImageDelete,
  maxHeight = 500,
}: EditableDetailPreviewProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // 편집 중 임시 텍스트 — blur 시 onParagraphsChange로 commit
  const [draft, setDraft] = useState<string>('');
  const editRef = useRef<HTMLDivElement>(null);

  const blocks = distributeBlocks(paragraphs, imageUrls);

  const startEdit = useCallback((pIdx: number) => {
    setEditingIdx(pIdx);
    setDraft(paragraphs[pIdx] ?? '');
    // 다음 tick에 포커스 + 끝으로 caret 이동
    setTimeout(() => {
      const el = editRef.current;
      if (el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }, 0);
  }, [paragraphs]);

  const commitEdit = useCallback(() => {
    if (editingIdx === null) return;
    const trimmed = draft.trim();
    const next = [...paragraphs];
    if (trimmed) {
      next[editingIdx] = trimmed;
    } else {
      next.splice(editingIdx, 1);
    }
    onParagraphsChange(next);
    setEditingIdx(null);
    setDraft('');
  }, [editingIdx, draft, paragraphs, onParagraphsChange]);

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
    setDraft('');
  }, []);

  const deleteParagraph = useCallback((pIdx: number) => {
    const next = paragraphs.filter((_, i) => i !== pIdx);
    onParagraphsChange(next);
  }, [paragraphs, onParagraphsChange]);

  const insertParagraphAfter = useCallback((pIdx: number | null) => {
    // pIdx === null → 맨 앞에 삽입
    const next = [...paragraphs];
    const insertAt = pIdx === null ? 0 : pIdx + 1;
    next.splice(insertAt, 0, '');
    onParagraphsChange(next);
    // 즉시 편집 모드 진입
    setTimeout(() => startEdit(insertAt), 0);
  }, [paragraphs, onParagraphsChange, startEdit]);

  return (
    <div className="rounded-lg overflow-hidden border-2 border-[#E31837]">
      {/* ─── 편집 가능 안내 배너 ─── */}
      <div className="bg-gradient-to-r from-[#E31837] to-red-600 text-white px-4 py-2.5 flex items-center gap-2">
        <Sparkles className="w-4 h-4 shrink-0" />
        <div className="flex-1 text-xs font-semibold leading-tight">
          ✏️ 직접 수정 가능 — 글을 클릭해서 편집 · 마우스 올리면 🗑️ 삭제 · 문단 사이 + 로 추가 · 이미지 ✕로 제거
        </div>
        <span className="text-[10px] bg-white/20 rounded px-2 py-0.5 whitespace-nowrap">실시간 자동 저장</span>
      </div>
      <div
        className="bg-white shadow-inner overflow-y-auto"
        style={{ maxHeight }}
      >
        <div style={{ padding: '20px 16px', maxWidth: 720, margin: '0 auto' }}>
        {/* 맨 위 + 버튼 */}
        <BlockInsertButton onInsert={() => insertParagraphAfter(null)} />

        {blocks.map((block, blockIdx) => {
          if (block.type === 'paragraph') {
            const pIdx = block.refIdx;
            const isEditing = editingIdx === pIdx;
            const text = paragraphs[pIdx] ?? '';
            return (
              <div key={`p-${pIdx}-${blockIdx}`}>
                {isEditing ? (
                  <div className="relative my-2">
                    <div
                      ref={editRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setDraft((e.target as HTMLDivElement).innerText)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          commitEdit();
                        }
                      }}
                      className="outline-none ring-2 ring-[#E31837] rounded p-3"
                      style={{ lineHeight: 2, fontSize: 16, color: '#222', wordBreak: 'keep-all', minHeight: 40 }}
                    >
                      {text}
                    </div>
                    <div className="absolute -bottom-5 right-0 text-[10px] text-gray-400">
                      Esc 취소 · Ctrl+Enter 저장 · 클릭 외부도 저장
                    </div>
                  </div>
                ) : (
                  <ParagraphView
                    text={text}
                    onEdit={() => startEdit(pIdx)}
                    onDelete={() => deleteParagraph(pIdx)}
                  />
                )}
                <BlockInsertButton onInsert={() => insertParagraphAfter(pIdx)} />
              </div>
            );
          }

          // image block
          const iIdx = block.refIdx;
          const url = imageUrls[iIdx];
          if (!url) return null;
          return (
            <div key={`i-${iIdx}-${blockIdx}`}>
              <ImageView
                url={url}
                alt={`${productName} ${iIdx + 1}`}
                onDelete={() => onImageDelete(iIdx)}
              />
              <BlockInsertButton onInsert={() => insertParagraphAfter(null /* always append paragraph after image — but we need pIdx; use last */)} hidden />
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

function ParagraphView({
  text,
  onEdit,
  onDelete,
}: {
  text: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative group my-2 cursor-pointer rounded transition-all"
      style={{
        padding: '12px',
        lineHeight: 2,
        fontSize: 16,
        color: '#222',
        wordBreak: 'keep-all',
        background: hover ? '#fff8f8' : 'transparent',
        outline: hover ? '2px dashed #E31837' : '2px dashed transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onEdit}
      title="클릭해서 편집"
    >
      {text || <span className="text-gray-400">(빈 문단 — 클릭해서 작성)</span>}
      {hover && (
        <>
          {/* 좌상단 "클릭해서 편집" 힌트 */}
          <div className="absolute -top-2 left-2 px-2 py-0.5 bg-[#E31837] text-white text-[10px] font-bold rounded shadow z-10 flex items-center gap-1">
            <Pencil className="w-2.5 h-2.5" /> 클릭해서 편집
          </div>
          {/* 우상단 액션 버튼 */}
          <div className="absolute top-1 right-1 flex gap-1 z-10">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (confirm('이 문단을 삭제할까요?')) onDelete(); }}
              className="p-1 bg-white border border-gray-300 rounded shadow hover:border-red-500 hover:text-red-500 hover:bg-red-50"
              title="문단 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ImageView({
  url,
  alt,
  onDelete,
}: {
  url: string;
  alt: string;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative my-3 transition-all"
      style={{
        outline: hover ? '2px dashed #E31837' : '2px dashed transparent',
        outlineOffset: '2px',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} style={{ width: '100%', display: 'block' }} />
      {hover && (
        <>
          {/* 어둠 오버레이 + 안내 */}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
            <span className="bg-white/95 text-[#E31837] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> ✕ 버튼으로 이 이미지 제거
            </span>
          </div>
          <button
            type="button"
            onClick={() => { if (confirm('이 이미지를 상세페이지에서 제거할까요? (원본 이미지는 보존됨)')) onDelete(); }}
            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 z-10"
            title="이 이미지를 상세페이지에서 제거 (원본 이미지는 보존됨)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

function BlockInsertButton({ onInsert, hidden = false }: { onInsert: () => void; hidden?: boolean }) {
  const [hover, setHover] = useState(false);
  if (hidden) return null;
  return (
    <div
      className="relative h-2 my-1 group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <button
          type="button"
          onClick={onInsert}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-white bg-[#E31837] rounded-full shadow hover:bg-red-700"
        >
          <Plus className="w-3 h-3" /> 문단 추가
        </button>
      )}
      {hover && <div className="absolute inset-0 border-t border-dashed border-[#E31837]" />}
    </div>
  );
}
