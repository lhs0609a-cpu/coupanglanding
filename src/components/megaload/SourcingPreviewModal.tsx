'use client';

/**
 * 소싱 상품 미리보기 — 목록에서 상품을 누르면 "등록해도 되는 물건인가"를 여기서 판단한다.
 * ---------------------------------------------------------------------------
 * 목록에는 제목·가격·썸네일·리뷰수뿐이라 판단이 불가능했다. 그렇다고 판단하려고 상세 추출
 * (폴더 생성 + 이미지 수십 장 다운로드)을 돌리면 안 쓸 상품에도 그 비용을 낸다.
 * 그래서 **보는 것(미리보기)과 가져오는 것(추출)을 분리**하고, 둘은 같은 추출기를 쓴다 —
 * 여기서 본 것과 실제로 가져오는 것이 다르면 미리보기의 의미가 없다.
 *
 * 쿠팡 등록에 실제로 필요한 것만 보여준다: 대표이미지 후보 · 옵션(가격/재고) · 상세 본문 ·
 * 상세 이미지 · 리뷰 사진 · 상품정보제공고시. 이 여섯 가지가 등록 화면이 요구하는 전부다.
 */

import { useEffect, useState } from 'react';
import { Loader2, X, ExternalLink, Download } from 'lucide-react';
import { previewProduct, type LocalEndpoint, type ProductPreview } from '@/lib/megaload/naver-ingest-local';

interface Props {
  ep: LocalEndpoint | null;
  url: string;
  /** 목록에서 이미 아는 값 — 상세가 오기 전에도 빈 화면을 안 보이게 한다. */
  fallback?: { title?: string; price?: number; thumb?: string; reviewCount?: number };
  onClose: () => void;
  /** 이 상품을 선택 목록에 넣고 상세 추출로 보낸다. */
  onPick?: () => void;
  picked?: boolean;
}

/** 고시정보(중첩 구조)를 화면에 뿌릴 수 있게 한 겹으로 편다. */
function flattenNotice(notice: ProductPreview['notice']): [string, string][] {
  const view = notice?.productInfoProvidedNoticeView;
  if (!view) return [];
  const out: [string, string][] = [];
  for (const section of Object.values(view)) {
    if (!section || typeof section !== 'object') continue;
    for (const [k, v] of Object.entries(section)) {
      if (typeof v === 'string') { out.push([k, v]); continue; }
      if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (typeof v2 === 'string') out.push([k2, v2]);
        }
      }
    }
  }
  return out;
}

export default function SourcingPreviewModal({ ep, url, fallback, onClose, onPick, picked }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProductPreview | null>(null);
  const [bigImage, setBigImage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setData(null);
    if (!ep) { setLoading(false); setError('도우미에 연결되어 있지 않습니다.'); return () => { alive = false; }; }
    previewProduct(ep, url)
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.data) setData(r.data);
        else setError(r.error || '불러오지 못했습니다.');
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ep, url]);

  // 목록에서 아는 값으로 먼저 채운다 — 30초를 빈 화면으로 기다리게 하지 않는다.
  const title = data?.title || fallback?.title || '(제목 없음)';
  const price = data?.price ?? fallback?.price;
  const mainImages = data?.mainImages?.length ? data.mainImages : (fallback?.thumb ? [fallback.thumb] : []);
  const notices = flattenNotice(data?.notice ?? null);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl my-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 머리 — 스크롤해도 제목과 닫기가 남아야 한다. */}
        <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-xl px-5 py-3 flex items-start gap-3 z-10">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 leading-snug">{title}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {price ? `${price.toLocaleString()}원` : '가격 미확인'}
              {data?.brand ? ` · ${data.brand}` : ''}
              {fallback?.reviewCount ? ` · 리뷰 ${fallback.reviewCount.toLocaleString()}` : ''}
            </p>
            {data?.categoryPath && <p className="text-xs text-gray-400 mt-0.5">{data.categoryPath}</p>}
          </div>
          {onPick && (
            <button
              onClick={onPick}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                picked ? 'bg-gray-100 text-gray-600' : 'bg-[#E31837] text-white hover:bg-[#c41230]'}`}
            >
              <Download className="w-4 h-4" />
              {picked ? '선택됨' : '가져올 목록에 추가'}
            </button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 text-gray-400 hover:text-[#E31837]" aria-label="네이버에서 열기">
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="shrink-0 p-2 text-gray-400 hover:text-gray-700" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              상품 페이지를 열어 옵션·상세·고시정보를 읽고 있습니다 (보통 10~30초)
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
              불러오지 못했습니다 — {error}
            </div>
          )}

          {/* 대표 이미지 후보 */}
          {mainImages.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-gray-900 mb-2">대표 이미지 후보 <span className="text-gray-400 font-normal">{mainImages.length}장</span></h4>
              <div className="flex gap-2 flex-wrap">
                {mainImages.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" onClick={() => setBigImage(u)}
                    className="w-28 h-28 rounded-lg object-cover bg-gray-100 border border-gray-200 cursor-zoom-in" />
                ))}
              </div>
            </section>
          )}

          {/* 옵션 — 쿠팡 등록에서 가격·재고가 그대로 넘어가는 자리다. */}
          {!!data?.options?.length && (
            <section>
              <h4 className="text-sm font-bold text-gray-900 mb-2">옵션 <span className="text-gray-400 font-normal">{data.options.length}개</span></h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left py-2 px-3">옵션명</th>
                      <th className="text-right py-2 px-3 w-28">추가금액</th>
                      <th className="text-right py-2 px-3 w-24">재고</th>
                      <th className="text-right py-2 px-3 w-20">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.options.map((o, i) => (
                      <tr key={`${o.optionName}-${i}`} className="border-t border-gray-100">
                        <td className="py-2 px-3 text-gray-800">{o.optionName}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{o.price ? `${o.price.toLocaleString()}원` : '-'}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{o.stock?.toLocaleString() ?? '-'}</td>
                        <td className={`py-2 px-3 text-right ${o.soldOut ? 'text-red-600' : 'text-emerald-600'}`}>
                          {o.soldOut ? '품절' : '판매중'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 상품정보제공고시 — 등록 시 이 값이 그대로 쓰인다(추측이 아니라 원본). */}
          {notices.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-gray-900 mb-2">
                상품정보제공고시 <span className="text-gray-400 font-normal">{notices.length}항목</span>
              </h4>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                {notices.map(([k, v], i) => (
                  <div key={`${k}-${i}`} className="flex gap-3 px-3 py-2 text-sm">
                    <span className="text-gray-500 w-56 shrink-0">{k}</span>
                    <span className="text-gray-800 break-words">{v}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 상세 본문 */}
          {!!data?.detailText && (
            <section>
              <h4 className="text-sm font-bold text-gray-900 mb-2">
                상세 설명 <span className="text-gray-400 font-normal">{data.detailText.length.toLocaleString()}자</span>
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto rounded-lg bg-gray-50 border border-gray-100 p-3">
                {data.detailText}
              </p>
            </section>
          )}

          {/* 상세 이미지 / 리뷰 사진 */}
          {[
            { label: '상세 이미지', list: data?.detailImages || [] },
            { label: '리뷰 사진', list: data?.reviewImages || [] },
          ].filter((s) => s.list.length > 0).map((s) => (
            <section key={s.label}>
              <h4 className="text-sm font-bold text-gray-900 mb-2">
                {s.label} <span className="text-gray-400 font-normal">{s.list.length}장</span>
              </h4>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
                {s.list.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" loading="lazy" onClick={() => setBigImage(u)}
                    className="w-full aspect-square rounded object-cover bg-gray-100 border border-gray-200 cursor-zoom-in" />
                ))}
              </div>
            </section>
          ))}

          {!loading && !error && !data?.options?.length && !data?.detailText && (
            <p className="text-sm text-gray-400">이 상품에서 가져올 옵션·상세 내용이 없습니다.</p>
          )}
        </div>
      </div>

      {/* 이미지 확대 — 대표컷을 고르려면 실제 크기로 봐야 한다. */}
      {bigImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6"
          onClick={(e) => { e.stopPropagation(); setBigImage(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bigImage} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
