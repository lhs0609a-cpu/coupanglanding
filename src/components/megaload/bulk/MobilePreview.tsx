'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star, ShoppingCart, Search, ChevronLeft as Back, Menu, X } from 'lucide-react';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
import { fillNoticeFields, type NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import { ensureObjectUrl } from '@/lib/megaload/services/client-folder-scanner';
import type { EditableProduct } from './types';
import type { PayloadPreviewData } from './PayloadPreviewPanel';

interface MobilePreviewProps {
  product: EditableProduct;
  /** 검수 패널이 표시 중인 대표이미지 URL (CDN/server/objectURL) */
  mainImageUrls: string[];
  /** 페이로드 미리보기 데이터 — 추출옵션/unitCount 표시용 */
  previewData: PayloadPreviewData | null;
  preUploadedUrls?: {
    mainImageUrls: string[];
    detailImageUrls?: string[];
    reviewImageUrls?: string[];
    infoImageUrls?: string[];
  };
  noticeMeta?: NoticeCategoryMeta[];
  noticeOverrides?: Record<string, string>;
  /** 우측 검수 패널 너비 — 폰을 그 왼쪽에 핀 고정 */
  panelWidth: number;
  onClose: () => void;
}

/** order 배열로 이미지 필터링 (DetailPageContentTab와 동일 규칙) */
function filterByOrder<T>(items: T[], order: number[] | undefined): T[] {
  if (!order) return items;
  return order.filter(i => i >= 0 && i < items.length).map(i => items[i]);
}

const toServeUrl = (p: string) =>
  p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:')
    ? p
    : `/api/megaload/products/bulk-register/serve-image?path=${encodeURIComponent(p)}`;

export default function MobilePreview({
  product,
  mainImageUrls,
  previewData,
  preUploadedUrls,
  noticeMeta,
  noticeOverrides,
  panelWidth,
  onClose,
}: MobilePreviewProps) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  // 상세/리뷰 이미지는 lazy objectURL — 폰 하단 상세영역 렌더용
  const [detailUrls, setDetailUrls] = useState<string[]>([]);
  const [reviewUrls, setReviewUrls] = useState<string[]>([]);

  const displayName = product.editedDisplayProductName || product.name || '(상품명 없음)';
  const sellingPrice = product.editedSellingPrice || 0;
  const originalPrice = product.editedOriginalPrice && product.editedOriginalPrice > sellingPrice
    ? product.editedOriginalPrice
    : 0;
  const discountPct = originalPrice > 0 ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;

  // 대표이미지 — 빈 경우 플레이스홀더
  const images = mainImageUrls.length > 0 ? mainImageUrls : [];

  // 상품 변경 시 캐러셀 리셋
  useEffect(() => { setCarouselIdx(0); }, [product.uid]);
  // 이미지 수 변경에 따른 인덱스 보정
  useEffect(() => {
    if (carouselIdx >= images.length) setCarouselIdx(Math.max(0, images.length - 1));
  }, [images.length, carouselIdx]);

  // ─── 옵션 표시 (추출옵션 + 중량 + 구매옵션) ───
  const optionRows = useMemo(() => {
    const rows: { name: string; value: string }[] = [];
    // 1) 페이로드 추출옵션 (가장 정확)
    for (const o of previewData?.meta.extractedOptions ?? []) {
      rows.push({ name: o.name, value: `${o.value}${o.unit || ''}` });
    }
    // 2) 농산물 중량 (별도 필드)
    if (product.editedAgriWeight && !rows.some(r => r.name.includes('중량'))) {
      rows.push({ name: '중량', value: product.editedAgriWeight });
    }
    // 3) 사용자 입력 구매옵션 (추출옵션과 중복 제외)
    for (const [k, v] of Object.entries(product.editedBuyOptionValues || {})) {
      if (!v || !v.trim()) continue;
      if (rows.some(r => r.name === k)) continue;
      rows.push({ name: k, value: v });
    }
    return rows;
  }, [previewData, product.editedAgriWeight, product.editedBuyOptionValues]);

  const unitCount = previewData?.meta.totalUnitCount;

  // ─── 상세/리뷰 이미지 URL 해결 (CDN → objectURL → serve-image) ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 상세
      let dUrls = preUploadedUrls?.detailImageUrls?.filter(Boolean) ?? [];
      if (dUrls.length === 0 && product.scannedDetailImages?.length) {
        const arr: string[] = [];
        for (const img of product.scannedDetailImages) {
          const u = await ensureObjectUrl(img);
          if (u) arr.push(u);
          if (cancelled) return;
        }
        dUrls = arr;
      }
      if (dUrls.length === 0 && product.detailImages?.length) {
        dUrls = product.detailImages.map(toServeUrl);
      }
      // 리뷰
      let rUrls = preUploadedUrls?.reviewImageUrls?.filter(Boolean) ?? [];
      if (rUrls.length === 0 && product.scannedReviewImages?.length) {
        const arr: string[] = [];
        for (const img of product.scannedReviewImages) {
          const u = await ensureObjectUrl(img);
          if (u) arr.push(u);
          if (cancelled) return;
        }
        rUrls = arr;
      }
      if (rUrls.length === 0 && product.reviewImages?.length) {
        rUrls = product.reviewImages.map(toServeUrl);
      }
      if (!cancelled) { setDetailUrls(dUrls); setReviewUrls(rUrls); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.uid, preUploadedUrls]);

  // ─── 상세페이지 HTML (실제 등록 경로와 동일한 builder 사용) ───
  const detailHtml = useMemo(() => {
    const description = product.editedDescription ?? product.description ?? '';
    const storyParagraphs = product.editedStoryParagraphs ?? [];
    const reviewTexts = (product.editedReviewTexts ?? []).filter(t => t.trim());
    const contentBlocks = product.editedContentBlocks ?? [];

    const paragraphs = storyParagraphs.length > 0
      ? storyParagraphs.filter(p => p.trim())
      : (description ? [description] : []);

    const filteredDetail = filterByOrder(detailUrls, product.editedDetailImageOrder);
    const filteredReview = filterByOrder(reviewUrls, product.editedReviewImageOrder);

    const infoImageUrls = (preUploadedUrls?.infoImageUrls?.filter(Boolean) ?? []).length > 0
      ? preUploadedUrls!.infoImageUrls!.filter(Boolean)
      : (product.scannedInfoImages?.map(img => img.objectUrl).filter((u): u is string => !!u) ?? []);

    // 고시정보 — 등록 경로와 동일한 fillNoticeFields()
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
        productName: displayName,
        brand: '',
        aiStoryParagraphs: paragraphs,
        reviewImageUrls: filteredReview,
        reviewTexts: reviewTexts.length > 0 ? reviewTexts : undefined,
        detailImageUrls: filteredDetail,
        infoImageUrls,
        thirdPartyImageUrls: [],
        consignmentImageUrls: [],
        faqItems: [],
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        categoryPath: product.editedCategoryName,
        noticeFields,
      },
      'A',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    product.uid, displayName, detailUrls, reviewUrls,
    product.editedDescription, product.editedStoryParagraphs, product.editedReviewTexts,
    product.editedContentBlocks, product.editedDetailImageOrder, product.editedReviewImageOrder,
    product.editedNoticeValues, product.editedCategoryName, noticeMeta, noticeOverrides, preUploadedUrls,
  ]);

  // 폰을 패널 바로 왼쪽에 핀. 단, 패널이 넓어 폰이 화면 밖으로 밀리면
  // left를 8px로 clamp 해 항상 화면 안에 보이도록 (필요 시 패널 위에 겹침).
  const phoneWidth = 372;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className="fixed top-0 h-full z-50 flex items-center pointer-events-none"
      style={{ left: `max(8px, calc(100vw - ${panelWidth + 12 + phoneWidth}px))` }}
    >
      <div
        className="pointer-events-auto bg-black rounded-[2.2rem] shadow-2xl border-4 border-black overflow-hidden flex flex-col"
        style={{ width: `${phoneWidth}px`, height: 'min(880px, 94vh)' }}
      >
        {/* 노치 */}
        <div className="relative bg-white">
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-28 h-5 bg-black rounded-full z-10" />
          {/* 쿠팡 상단바 */}
          <div className="flex items-center gap-2 px-3 pt-7 pb-2 bg-white">
            <Back className="w-5 h-5 text-gray-700 shrink-0" />
            <div className="flex-1 flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] text-gray-400 truncate">{displayName}</span>
            </div>
            <ShoppingCart className="w-5 h-5 text-gray-700 shrink-0" />
            <Menu className="w-5 h-5 text-gray-700 shrink-0" />
          </div>
        </div>

        {/* 스크롤 본문 */}
        <div className="flex-1 overflow-y-auto bg-white">
          {/* ─── 대표이미지 캐러셀 ─── */}
          <div className="relative w-full bg-gray-50" style={{ aspectRatio: '1 / 1' }}>
            {images.length > 0 ? (
              <img
                src={images[Math.min(carouselIdx, images.length - 1)]}
                alt=""
                className="w-full h-full object-contain"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                대표이미지 없음
              </div>
            )}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setCarouselIdx(i => (i - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCarouselIdx(i => (i + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] tabular-nums">
                  {Math.min(carouselIdx, images.length - 1) + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* 썸네일 스트립 */}
          {images.length > 1 && (
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-gray-100">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselIdx(i)}
                  className={`w-11 h-11 rounded border-2 overflow-hidden shrink-0 transition ${
                    i === carouselIdx ? 'border-[#E31837]' : 'border-gray-200 opacity-70'
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" decoding="async" />
                </button>
              ))}
            </div>
          )}

          {/* ─── 상품 정보 ─── */}
          <div className="px-3.5 py-3">
            {/* 배송 배지 */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-[#346aff] text-[10px] font-bold">
                무료배송
              </span>
              <span className="text-[10px] text-gray-400">판매자배송</span>
            </div>

            {/* 노출상품명 */}
            <h1 className="text-[15px] leading-snug text-gray-900 font-normal break-words">
              {displayName}
            </h1>

            {/* 평점 placeholder */}
            <div className="flex items-center gap-1 mt-1.5">
              <div className="flex">
                {[0, 1, 2, 3, 4].map(i => (
                  <Star key={i} className="w-3 h-3 fill-gray-200 text-gray-200" />
                ))}
              </div>
              <span className="text-[10px] text-gray-300">등록 후 리뷰 표시</span>
            </div>

            {/* 가격 */}
            <div className="mt-3">
              {originalPrice > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 line-through tabular-nums">
                    {originalPrice.toLocaleString()}원
                  </span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                {discountPct > 0 && (
                  <span className="text-[#E31837] text-xl font-bold tabular-nums">{discountPct}%</span>
                )}
                <span className="text-gray-900 text-2xl font-bold tabular-nums">
                  {sellingPrice.toLocaleString()}
                </span>
                <span className="text-gray-900 text-lg font-bold">원</span>
              </div>
            </div>

            {/* 옵션 박스 */}
            {(optionRows.length > 0 || unitCount !== undefined) && (
              <div className="mt-3 border border-gray-200 rounded-lg p-2.5">
                <div className="text-[11px] font-semibold text-gray-700 mb-1.5">옵션 선택</div>
                <div className="flex flex-wrap gap-1.5">
                  {optionRows.map((o, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]">
                      <span className="text-gray-400">{o.name}</span>
                      <span className="font-medium text-gray-800">{o.value}</span>
                    </span>
                  ))}
                  {optionRows.length === 0 && (
                    <span className="text-[11px] text-gray-400">단일 옵션</span>
                  )}
                </div>
                {unitCount !== undefined && (
                  <div className="text-[10px] text-gray-400 mt-1.5">총 수량(unitCount): {unitCount}</div>
                )}
              </div>
            )}
          </div>

          {/* 구분 바 */}
          <div className="h-2 bg-gray-100" />

          {/* ─── 상세정보 ─── */}
          <div className="px-0">
            <div className="px-3.5 py-2 text-[12px] font-bold text-gray-800 border-b border-gray-100">상품정보</div>
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;font-size:13px;}img{max-width:100%;height:auto;display:block;}</style></head><body>${detailHtml}</body></html>`}
              className="w-full border-0 block"
              style={{ height: '1400px' }}
              title="모바일 상세 미리보기"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      {/* 닫기 (폰 우상단 바깥) */}
      <button
        onClick={onClose}
        className="pointer-events-auto absolute -top-0 right-1 mt-2 w-7 h-7 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-[#E31837] transition"
        title="모바일 미리보기 닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
