'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText, MessageSquare, Plus, Trash2, Eye, EyeOff,
  ChevronDown, ChevronRight, GripVertical, Image as ImageIcon,
} from 'lucide-react';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
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
import type { EditableProduct } from './types';

interface DetailPageContentTabProps {
  product: EditableProduct;
  onUpdate: (uid: string, field: string, value: string | number | string[] | Record<string, string>) => void;
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

  const description = product.editedDescription ?? product.description ?? '';
  const storyParagraphs = product.editedStoryParagraphs ?? [];
  const reviewTexts = product.editedReviewTexts ?? [];
  const contentBlocks: ContentBlock[] = product.editedContentBlocks ?? [];

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

  // --- 미리보기 HTML ---
  const previewHtml = useMemo(() => {
    if (!previewOpen) return '';

    // 서버 업로드 URL > 브라우저 objectURL > 플레이스홀더 순서
    const detailImageUrls = (preUploadedUrls?.detailImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.detailImageUrls!.filter(Boolean)
      : (product.scannedDetailImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);
    const reviewImageUrls = (preUploadedUrls?.reviewImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.reviewImageUrls!.filter(Boolean)
      : (product.scannedReviewImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);
    const infoImageUrls = (preUploadedUrls?.infoImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.infoImageUrls!.filter(Boolean)
      : (product.scannedInfoImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);

    // 이미지 없으면 플레이스홀더 SVG 사용
    const placeholderImg = (label: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect fill="#f0f0f0" width="800" height="400"/><text fill="#999" font-family="sans-serif" font-size="20" x="400" y="200" text-anchor="middle">${label}</text></svg>`)}`;

    const detailUrls = detailImageUrls.length > 0
      ? detailImageUrls
      : product.detailImageCount > 0
        ? Array.from({ length: Math.min(product.detailImageCount, 3) }, (_, i) => placeholderImg(`상세이미지 ${i + 1}`))
        : [placeholderImg('상세이미지 없음')];

    const reviewUrls = reviewImageUrls.length > 0
      ? reviewImageUrls
      : product.reviewImageCount > 0
        ? Array.from({ length: Math.min(product.reviewImageCount, 3) }, (_, i) => placeholderImg(`리뷰이미지 ${i + 1}`))
        : [];

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
  }, [previewOpen, previewVariant, product, storyParagraphs, reviewTexts, description, preUploadedUrls, contentBlocks]);

  return (
    <div className="space-y-3">
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
        badge={reviewTexts.length > 0 ? `${reviewTexts.length}개` : product.reviewImageCount > 0 ? `이미지 ${product.reviewImageCount}장` : undefined}
      >
        <div className="pt-2 space-y-2">
          {product.reviewImageCount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 bg-gray-50 px-2 py-1.5 rounded">
              <ImageIcon className="w-3 h-3" />
              리뷰 이미지 {product.reviewImageCount}장 감지됨
            </div>
          )}
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
