'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Menu, ShoppingCart, Star, Truck } from 'lucide-react';

export interface PhonePreviewData {
  name: string;
  brand?: string;
  images: string[];
  minPrice: number;
  maxPrice: number;
  origin?: string;
  categoryPath?: string;
  options: { name: string; value: string }[];
  detailHtml?: string;
  freeShipping?: boolean;
}

/**
 * 쿠팡 모바일 PDP 실시간 미리보기 — 공급사가 입력하는 즉시 "이렇게 팔린다"를 폰 화면으로.
 * 순수 표시용(폼 상태를 그대로 읽음). 등록 데이터와 1:1.
 */
export default function SupplierPhonePreview({ data }: { data: PhonePreviewData }) {
  const [idx, setIdx] = useState(0);
  const images = data.images.filter(Boolean);
  useEffect(() => { if (idx >= images.length) setIdx(Math.max(0, images.length - 1)); }, [images.length, idx]);

  const name = data.name || '상품명을 입력하면 여기에 표시됩니다';
  const price = data.maxPrice || data.minPrice || 0;
  const hasRange = data.minPrice > 0 && data.maxPrice > 0 && data.minPrice !== data.maxPrice;

  return (
    <div className="mx-auto bg-black rounded-[2.4rem] shadow-2xl border-[5px] border-black overflow-hidden flex flex-col"
      style={{ width: 340, height: 'min(760px, 78vh)' }}>
      {/* 노치 + 쿠팡 상단바 */}
      <div className="relative bg-white shrink-0">
        <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-24 h-4 bg-black rounded-full z-10" />
        <div className="flex items-center gap-2 px-3 pt-7 pb-2">
          <ChevronLeft className="w-5 h-5 text-gray-700 shrink-0" />
          <div className="flex-1 flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-400 truncate">{name}</span>
          </div>
          <ShoppingCart className="w-5 h-5 text-gray-700 shrink-0" />
          <Menu className="w-5 h-5 text-gray-700 shrink-0" />
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto bg-white">
        {/* 대표이미지 캐러셀 */}
        <div className="relative w-full bg-gray-50" style={{ aspectRatio: '1 / 1' }}>
          {images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[Math.min(idx, images.length - 1)]} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 text-xs gap-1">
              <ShoppingCart className="w-8 h-8" /> 대표 이미지를 넣어보세요
            </div>
          )}
          {images.length > 1 && (
            <>
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white grid place-items-center"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white grid place-items-center"><ChevronRight className="w-4 h-4" /></button>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] tabular-nums">
                {Math.min(idx, images.length - 1) + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {/* 정보 */}
        <div className="px-3.5 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-[#346aff] text-[10px] font-bold">
              <Truck className="w-3 h-3" />{data.freeShipping ? '무료배송' : '판매자배송'}
            </span>
            {data.brand && <span className="text-[10px] text-gray-400 truncate">{data.brand}</span>}
          </div>

          <h1 className="text-[15px] leading-snug text-gray-900 break-words">{name}</h1>

          <div className="flex items-center gap-1 mt-1.5">
            <div className="flex">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-3 h-3 fill-gray-200 text-gray-200" />)}</div>
            <span className="text-[10px] text-gray-300">등록 후 리뷰 표시</span>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-gray-900 text-2xl font-bold tabular-nums">{price.toLocaleString()}</span>
              <span className="text-gray-900 text-lg font-bold">원</span>
            </div>
            {hasRange && (
              <p className="text-[11px] text-gray-400 mt-0.5">셀러 판매가 범위 {data.minPrice.toLocaleString()}~{data.maxPrice.toLocaleString()}원</p>
            )}
          </div>

          {data.options.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-lg p-2.5">
              <div className="text-[11px] font-semibold text-gray-700 mb-1.5">옵션 선택</div>
              <div className="flex flex-wrap gap-1.5">
                {data.options.map((o, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px]">
                    {o.name && <span className="text-gray-400">{o.name}</span>}
                    <span className="font-medium text-gray-800">{o.value || '옵션'}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {(data.origin || data.categoryPath) && (
            <div className="mt-3 text-[10px] text-gray-400 space-y-0.5">
              {data.categoryPath && <p>카테고리: {data.categoryPath}</p>}
              {data.origin && <p>원산지: {data.origin}</p>}
            </div>
          )}
        </div>

        <div className="h-2 bg-gray-100" />

        {/* 상세 */}
        <div>
          <div className="px-3.5 py-2 text-[12px] font-bold text-gray-800 border-b border-gray-100">상품정보</div>
          {data.detailHtml && data.detailHtml.trim() ? (
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:8px;font-size:13px;color:#333;font-family:sans-serif}img{max-width:100%;height:auto;display:block;margin:4px 0}</style></head><body>${data.detailHtml}</body></html>`}
              className="w-full border-0 block" style={{ height: 520 }} title="상세 미리보기" sandbox="allow-same-origin"
            />
          ) : (
            <div className="px-3.5 py-8 text-center text-[11px] text-gray-300">상세페이지 HTML을 입력하면 여기에 표시됩니다</div>
          )}
        </div>
      </div>

      {/* 하단 구매바 */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-white">
        <button className="w-9 h-9 rounded-lg border border-gray-200 grid place-items-center text-gray-500"><Star className="w-4 h-4" /></button>
        <button className="flex-1 py-2.5 rounded-lg bg-[#E31837] text-white text-sm font-bold">구매하기</button>
      </div>
    </div>
  );
}
