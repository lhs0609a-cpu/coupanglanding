'use client';

import { useRef, useState, useCallback } from 'react';
import {
  FolderSearch, ArrowRight, Loader2, Search, Truck, MapPin, Phone,
  Sparkles, Plus, FolderOpen, Clock, X, Folder,
} from 'lucide-react';
import type { PriceBracket, ShippingPlace, ReturnCenter } from './types';
import IntegrationTestCard from './IntegrationTestCard';

const RECENT_PATHS_KEY = 'bulk_register_recent_paths';
const MAX_RECENT_PATHS = 10;

function getRecentPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PATHS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecentPaths(paths: string[]) {
  try {
    const unique = [...new Set(paths)].slice(0, MAX_RECENT_PATHS);
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(unique));
  } catch { /* ignore */ }
}

export function addRecentPath(path: string) {
  const existing = getRecentPaths().filter((p) => p !== path);
  saveRecentPaths([path, ...existing]);
}

interface BulkStep1SettingsProps {
  folderPaths: string[];
  brackets: PriceBracket[];
  shippingPlaces: ShippingPlace[];
  returnCenters: ReturnCenter[];
  selectedOutbound: string;
  selectedReturn: string;
  deliveryChargeType: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE';
  deliveryCharge: number;
  freeShipOverAmount: number;
  returnCharge: number;
  contactNumber: string;
  generateAiContent: boolean;
  includeReviewImages: boolean;
  noticeOverrides: Record<string, string>;
  loadingShipping: boolean;
  shippingError: string;
  scanning: boolean;
  scanError: string;
  browsingFolder: boolean;
  onAddFolderPath: (path: string) => void;
  onRemoveFolderPath: (path: string) => void;
  onSetSelectedOutbound: (v: string) => void;
  onSetSelectedReturn: (v: string) => void;
  onSetDeliveryChargeType: (v: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE') => void;
  onSetDeliveryCharge: (v: number) => void;
  onSetFreeShipOverAmount: (v: number) => void;
  onSetReturnCharge: (v: number) => void;
  onSetContactNumber: (v: string) => void;
  onSetGenerateAiContent: (v: boolean) => void;
  onSetIncludeReviewImages: (v: boolean) => void;
  onSetNoticeOverrides: (v: Record<string, string>) => void;
  onRecalcPrices: (brackets: PriceBracket[]) => void;
  onScan: () => void;
  onBrowseFolder: () => void;
}

export default function BulkStep1Settings({
  folderPaths, brackets, shippingPlaces, returnCenters,
  selectedOutbound, selectedReturn,
  deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, contactNumber,
  generateAiContent, includeReviewImages, noticeOverrides,
  loadingShipping, shippingError, scanning, scanError, browsingFolder,
  onAddFolderPath, onRemoveFolderPath,
  onSetSelectedOutbound, onSetSelectedReturn,
  onSetDeliveryChargeType, onSetDeliveryCharge, onSetFreeShipOverAmount,
  onSetReturnCharge, onSetContactNumber,
  onSetGenerateAiContent, onSetIncludeReviewImages, onSetNoticeOverrides,
  onRecalcPrices, onScan, onBrowseFolder,
}: BulkStep1SettingsProps) {
  const [folderInput, setFolderInput] = useState('');
  const [showRecentPaths, setShowRecentPaths] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropMessage, setDropMessage] = useState('');
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const serverFolderPaths = folderPaths.filter((fp) => !fp.startsWith('browser://'));

  const handleFolderInputAdd = useCallback(() => {
    if (!folderInput.trim()) return;
    // multi-line paste
    const lines = folderInput.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) onAddFolderPath(line);
    setFolderInput('');
  }, [folderInput, onAddFolderPath]);

  const handleFolderInputPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) {
      e.preventDefault();
      const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) onAddFolderPath(line);
      setFolderInput('');
    }
  }, [onAddFolderPath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false); setDropMessage('');
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text') || e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('URL');
    if (text) {
      let path = text.trim();
      if (path.startsWith('file:///')) {
        path = decodeURIComponent(path.replace('file:///', '')).replace(/\//g, '\\');
      } else if (path.startsWith('file://')) {
        path = decodeURIComponent(path.replace('file://', '')).replace(/\//g, '\\');
      }
      const firstLine = path.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)[0];
      if (firstLine) { onAddFolderPath(firstLine); return; }
    }
    if (e.dataTransfer.files.length > 0 || e.dataTransfer.items.length > 0) {
      setDropMessage('폴더를 직접 끌어다 놓으면 브라우저 보안 정책으로 경로를 읽을 수 없습니다. 아래 방법을 사용해주세요:\n1) 탐색기 주소창의 경로 텍스트를 복사하여 붙여넣기\n2) 폴더 선택하기 버튼으로 폴더 탐색');
      setTimeout(() => setDropMessage(''), 6000);
    }
  }, [onAddFolderPath]);

  const handleShowRecentPaths = useCallback(() => {
    setRecentPaths(getRecentPaths());
    setShowRecentPaths(prev => !prev);
  }, []);

  return (
    <div className="space-y-6">
      {/* Folder Path */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FolderSearch className="w-5 h-5 text-gray-500" /> 소싱 폴더 경로
        </h2>
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-4 transition ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
        >
          {folderPaths.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {folderPaths.map((fp) => (
                <div key={fp} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm">
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[400px]">{fp}</span>
                  <button onClick={() => onRemoveFolderPath(fp)} className="p-0.5 hover:bg-blue-200 rounded transition"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          {folderPaths.length === 0 && (
            <button
              onClick={onBrowseFolder}
              disabled={browsingFolder}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-3 text-sm font-medium text-[#E31837] bg-white border-2 border-[#E31837] rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
            >
              {browsingFolder ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderOpen className="w-5 h-5" />}
              {browsingFolder ? '폴더 읽는 중...' : '폴더 선택하기'}
            </button>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFolderInputAdd(); } }}
              onPaste={handleFolderInputPaste}
              placeholder="경로를 붙여넣거나 입력 (예: C:\Users\u\바탕 화면\100-2)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
            <button onClick={handleFolderInputAdd} disabled={!folderInput.trim()} className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition">
              <Plus className="w-4 h-4" /> 추가
            </button>
            <div className="relative">
              <button onClick={handleShowRecentPaths} className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition" title="최근 경로">
                <Clock className="w-4 h-4 text-gray-500" />
              </button>
              {showRecentPaths && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                  {recentPaths.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">최근 사용한 경로가 없습니다.</div>
                  ) : (
                    recentPaths.map((rp) => (
                      <button key={rp} onClick={() => { onAddFolderPath(rp); setShowRecentPaths(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition truncate">{rp}</button>
                    ))
                  )}
                </div>
              )}
            </div>
            {folderPaths.length > 0 && (
              <button onClick={onBrowseFolder} disabled={browsingFolder} className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition" title="폴더 선택">
                {browsingFolder ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <FolderOpen className="w-4 h-4 text-gray-500" />}
              </button>
            )}
          </div>
          {dropMessage && (
            <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 whitespace-pre-line">{dropMessage}</div>
          )}
          <p className="mt-2 text-xs text-gray-400">&quot;폴더 선택하기&quot;를 클릭하면 PC 폴더를 직접 선택할 수 있습니다. (Chrome/Edge 지원)</p>
        </div>
        <p className="mt-2 text-xs text-gray-400">product_* 하위 폴더를 자동 인식합니다. (product.json, main_images/, output/, reviews/, product_info/)</p>
      </div>

      {/* Shipping */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-gray-500" /> 배송 / 반품 설정
        </h2>
        {loadingShipping ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> 쿠팡 물류 정보 불러오는 중...</div>
        ) : shippingError ? (
          <div className="text-sm text-red-600 py-2">{shippingError}</div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><MapPin className="w-3.5 h-3.5 inline mr-1" />출고지 <span className="text-red-500">*</span></label>
              {shippingPlaces.length === 0 ? (
                <p className="text-sm text-orange-600">쿠팡 Wing에서 출고지를 먼저 등록해주세요.</p>
              ) : (
                <select value={selectedOutbound} onChange={(e) => onSetSelectedOutbound(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {shippingPlaces.map((p) => (<option key={p.outboundShippingPlaceCode} value={p.outboundShippingPlaceCode}>{p.placeName} — {p.placeAddresses}</option>))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><MapPin className="w-3.5 h-3.5 inline mr-1" />반품지 <span className="text-red-500">*</span></label>
              {returnCenters.length === 0 ? (
                <p className="text-sm text-orange-600">쿠팡 Wing에서 반품지를 먼저 등록해주세요.</p>
              ) : (
                <select value={selectedReturn} onChange={(e) => onSetSelectedReturn(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {returnCenters.map((c) => (<option key={c.returnCenterCode} value={c.returnCenterCode}>{c.shippingPlaceName} — {c.returnAddress}</option>))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">배송비</label>
              <select value={deliveryChargeType} onChange={(e) => onSetDeliveryChargeType(e.target.value as typeof deliveryChargeType)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="FREE">무료배송</option>
                <option value="NOT_FREE">유료배송</option>
                <option value="CONDITIONAL_FREE">조건부 무료배송</option>
              </select>
              {deliveryChargeType === 'NOT_FREE' && (
                <input type="number" value={deliveryCharge} onChange={(e) => onSetDeliveryCharge(Number(e.target.value))} placeholder="배송비 (원)" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              )}
              {deliveryChargeType === 'CONDITIONAL_FREE' && (
                <div className="mt-2 space-y-2">
                  <input type="number" value={deliveryCharge} onChange={(e) => onSetDeliveryCharge(Number(e.target.value))} placeholder="기본 배송비 (원)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="number" value={freeShipOverAmount} onChange={(e) => onSetFreeShipOverAmount(Number(e.target.value))} placeholder="무료배송 기준 금액 (원)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">반품 편도 배송비</label>
                <input type="number" value={returnCharge} onChange={(e) => onSetReturnCharge(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"><Phone className="w-3.5 h-3.5 inline mr-1" />판매자 연락처</label>
                <input type="text" value={contactNumber} onChange={(e) => onSetContactNumber(e.target.value)} placeholder="02-1234-5678" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Integration Test */}
      <IntegrationTestCard disabled={loadingShipping} />

      {/* Options */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-gray-500" /> 등록 옵션</h2>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition ${generateAiContent ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
              <input type="checkbox" checked={generateAiContent} onChange={(e) => onSetGenerateAiContent(e.target.checked)} className="sr-only" />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${generateAiContent ? 'translate-x-5' : ''}`} />
            </div>
            <div><div className="text-sm font-medium text-gray-700">AI 상세페이지 생성</div><div className="text-xs text-gray-400">GPT-4o-mini로 감성 스토리 자동 생성</div></div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition ${includeReviewImages ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
              <input type="checkbox" checked={includeReviewImages} onChange={(e) => onSetIncludeReviewImages(e.target.checked)} className="sr-only" />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${includeReviewImages ? 'translate-x-5' : ''}`} />
            </div>
            <div><div className="text-sm font-medium text-gray-700">리뷰 이미지 포함</div><div className="text-xs text-gray-400">reviews/ 폴더 이미지를 상세페이지에 삽입</div></div>
          </label>
        </div>
      </div>

      {/* Margin Rate */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">가격대별 마진율 설정</h2>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="pb-2 text-left">원가 범위</th>
              <th className="pb-2 text-center">마진율 (%)</th>
              <th className="pb-2 text-right">예시 판매가</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {brackets.map((b, idx) => {
              const examplePrice = b.minPrice || 5000;
              const exampleSelling = Math.ceil((examplePrice * (1 + b.marginRate / 100)) / 100) * 100;
              return (
                <tr key={idx}>
                  <td className="py-3 text-sm text-gray-700">{b.minPrice.toLocaleString()}원 ~ {b.maxPrice ? `${b.maxPrice.toLocaleString()}원` : '무제한'}</td>
                  <td className="py-3 text-center">
                    <input type="number" min={0} max={200} value={b.marginRate} onChange={(e) => {
                      const nb = [...brackets];
                      nb[idx] = { ...nb[idx], marginRate: Number(e.target.value) };
                      onRecalcPrices(nb);
                    }} className="w-20 text-center px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent" />
                  </td>
                  <td className="py-3 text-right text-sm text-gray-500">{examplePrice.toLocaleString()}원 → {exampleSelling.toLocaleString()}원</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notice Overrides */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">상품정보제공고시 기본값</h2>
        <p className="text-xs text-gray-400 mb-4">비어있는 필드는 &quot;상세페이지 참조&quot;로 자동 입력됩니다.</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: '품명 및 모델명', placeholder: '상품명에서 자동 입력' },
            { key: '브랜드', placeholder: '상품 브랜드에서 자동 입력' },
            { key: '제조국 또는 원산지', placeholder: '상세페이지 참조' },
            { key: '제조자/수입자', placeholder: '브랜드에서 자동 입력' },
            { key: 'A/S 책임자와 전화번호', placeholder: '연락처에서 자동 입력' },
            { key: '인증/허가 사항', placeholder: '해당사항 없음' },
          ].map(({ key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{key}</label>
              <input
                type="text"
                value={noticeOverrides[key] || ''}
                onChange={(e) => {
                  const newOverrides = { ...noticeOverrides };
                  if (e.target.value) { newOverrides[key] = e.target.value; } else { delete newOverrides[key]; }
                  onSetNoticeOverrides(newOverrides);
                }}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
          ))}
        </div>
      </div>

      {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      <div className="flex justify-end">
        {serverFolderPaths.length > 0 && (
          <button
            onClick={onScan}
            disabled={scanning || loadingShipping}
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {serverFolderPaths.length > 1 ? `${serverFolderPaths.length}개 폴더 스캔 & 다음` : '폴더 스캔 & 다음'}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
