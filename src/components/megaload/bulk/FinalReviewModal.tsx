'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck, ExternalLink, AlertTriangle, X, Search, Image as ImageIcon, PlayCircle,
} from 'lucide-react';
import type { EditableProduct } from './types';

interface FinalReviewModalProps {
  open: boolean;
  products: EditableProduct[];
  imagePreuploadCache: Record<string, { mainImageUrls?: string[] }>;
  /** 사용자 제거 — 체크 해제된 상품의 uid */
  excludedUids: Set<string>;
  onToggleExclude: (uid: string) => void;
  onConfirm: () => void;
  onAbort: () => void;
}

/**
 * 자동 등록 직전 마지막 확인 게이트.
 * 사용자가 보는 정보: 썸네일 / 가격 / 원본링크 / 노출상품명
 * 체크 해제하면 해당 상품은 등록에서 제외됨.
 */
export default function FinalReviewModal({
  open, products, imagePreuploadCache, excludedUids,
  onToggleExclude, onConfirm, onAbort,
}: FinalReviewModalProps) {
  const [keyword, setKeyword] = useState('');

  const eligible = useMemo(
    () => products.filter(p => p.selected && p.validationStatus !== 'error'),
    [products],
  );

  const filtered = useMemo(() => {
    if (!keyword.trim()) return eligible;
    const kw = keyword.toLowerCase();
    return eligible.filter(p =>
      (p.editedDisplayProductName || '').toLowerCase().includes(kw) ||
      (p.name || '').toLowerCase().includes(kw) ||
      (p.productCode || '').toLowerCase().includes(kw),
    );
  }, [eligible, keyword]);

  const includedCount = eligible.length - excludedUids.size;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">최종 확인</h2>
              <p className="text-xs text-gray-500">
                썸네일 · 가격 · 원본링크 · 노출상품명 — 문제 있는 상품은 체크 해제해서 제외하세요.
              </p>
            </div>
          </div>
          <button onClick={onAbort} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="상품명 / 코드 검색…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent outline-none"
            />
          </div>
          <div className="text-sm text-gray-600">
            등록 예정 <span className="font-bold text-green-600">{includedCount}</span>
            <span className="text-gray-400"> / {eligible.length}</span>
            {excludedUids.size > 0 && (
              <span className="ml-2 text-red-600">· 제외 {excludedUids.size}</span>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {keyword ? `"${keyword}" 검색 결과 없음` : '등록 대상 상품이 없습니다'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 w-10"></th>
                  <th className="text-left px-3 py-2 w-20">썸네일</th>
                  <th className="text-left px-3 py-2">노출상품명</th>
                  <th className="text-right px-3 py-2 w-28">가격</th>
                  <th className="text-center px-3 py-2 w-24">원본 링크</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const excluded = excludedUids.has(p.uid);
                  const thumbUrl =
                    imagePreuploadCache[p.uid]?.mainImageUrls?.[0]
                    || p.scannedMainImages?.[0]?.objectUrl
                    || '';
                  const displayName = p.editedDisplayProductName || p.name;
                  const price = p.editedSellingPrice ?? p.sellingPrice;

                  return (
                    <tr
                      key={p.uid}
                      className={`border-b border-gray-100 transition ${
                        excluded ? 'bg-red-50/50 opacity-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => onToggleExclude(p.uid)}
                          className="w-4 h-4 accent-[#E31837] cursor-pointer"
                          title={excluded ? '등록에 포함' : '등록에서 제외'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt={displayName}
                            className="w-14 h-14 object-cover rounded border border-gray-200 bg-white"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded border border-gray-200 bg-gray-100 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-300" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className={`text-sm font-medium ${excluded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {displayName}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {p.productCode}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className={`font-semibold ${excluded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {price?.toLocaleString('ko-KR')}원
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.sourceUrl ? (
                          <a
                            href={p.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded"
                          >
                            <ExternalLink className="w-3 h-3" />
                            원본
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            지재권 의심 상품은 체크 해제 후 등록을 진행하세요. 등록 후에는 되돌릴 수 없습니다.
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAbort}
              className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              전체 취소
            </button>
            <button
              onClick={onConfirm}
              disabled={includedCount === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm bg-[#E31837] hover:bg-[#c01530] text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PlayCircle className="w-4 h-4" />
              {includedCount}개 등록 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
