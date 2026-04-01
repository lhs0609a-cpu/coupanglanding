'use client';

import { useRef, useState, useCallback } from 'react';
import {
  FolderSearch, ArrowRight, Loader2, Search, Truck, MapPin, Phone,
  Sparkles, Plus, FolderOpen, Clock, X, Folder, Shield, Check,
} from 'lucide-react';
import type { PriceBracket, ShippingPlace, ReturnCenter, PreventionConfig } from './types';
import { getPreventionLevel } from '@/lib/megaload/services/item-winner-prevention';
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
  includeReviewImages: boolean;
  useStockImages: boolean;
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
  onSetIncludeReviewImages: (v: boolean) => void;
  onSetUseStockImages: (v: boolean) => void;
  onSetNoticeOverrides: (v: Record<string, string>) => void;
  preventionConfig: PreventionConfig;
  onSetPreventionEnabled: (v: boolean) => void;
  onSetPreventionIntensity: (v: 'low' | 'mid' | 'high') => void;
  onRecalcPrices: (brackets: PriceBracket[]) => void;
  onScan: () => void;
  onBrowseFolder: () => void;
  // 제3자 이미지
  savedThirdPartyUrls: string[];
  onUploadThirdPartyImages: () => void;
  onRemoveThirdPartyUrl: (index: number) => void;
  onClearThirdPartyUrls: () => void;
}

export default function BulkStep1Settings({
  folderPaths, brackets, shippingPlaces, returnCenters,
  selectedOutbound, selectedReturn,
  deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, contactNumber,
  includeReviewImages, useStockImages, noticeOverrides,
  loadingShipping, shippingError, scanning, scanError, browsingFolder,
  onAddFolderPath, onRemoveFolderPath,
  onSetSelectedOutbound, onSetSelectedReturn,
  onSetDeliveryChargeType, onSetDeliveryCharge, onSetFreeShipOverAmount,
  onSetReturnCharge, onSetContactNumber,
  onSetIncludeReviewImages, onSetUseStockImages, onSetNoticeOverrides,
  preventionConfig, onSetPreventionEnabled, onSetPreventionIntensity,
  onRecalcPrices, onScan, onBrowseFolder,
  savedThirdPartyUrls, onUploadThirdPartyImages, onRemoveThirdPartyUrl, onClearThirdPartyUrls,
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

      {/* Item Winner Prevention */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-500" /> 아이템위너 방지
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition ${preventionConfig.enabled ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
              <input type="checkbox" checked={preventionConfig.enabled} onChange={(e) => onSetPreventionEnabled(e.target.checked)} className="sr-only" />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${preventionConfig.enabled ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">활성화</div>
              <div className="text-xs text-gray-400">같은 소싱 폴더를 여러 셀러가 등록할 때 쿠팡의 상품 그룹화를 방지합니다.</div>
            </div>
          </label>
          {preventionConfig.enabled && (
            <div className="ml-14 space-y-2.5">
              {[
                { label: '대표이미지 순서 셔플', key: 'imageOrderShuffle' as const, desc: '셀러마다 대표이미지 순서를 다르게' },
                { label: '이미지 미세 변형', key: 'imageVariation' as const, desc: '파일 해시를 변경하여 매칭 회피' },
                { label: 'AI 상품명 자동 생성 (필수)', key: 'mandatoryAiNames' as const, desc: '셀러 페르소나 기반 고유 상품명' },
                { label: '상세페이지 레이아웃 변형', key: 'detailPageVariation' as const, desc: '셀러별 다른 HTML 구조' },
              ].map(({ label, key, desc }) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <Check className={`w-4 h-4 shrink-0 ${preventionConfig[key] ? 'text-green-500' : 'text-gray-300'}`} />
                  <span className={preventionConfig[key] ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
                  <span className="text-xs text-gray-400">— {desc}</span>
                </div>
              ))}
              {/* 변형 강도 선택 */}
              {preventionConfig.imageVariation && (
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-medium shrink-0">변형 강도:</span>
                  <div className="flex gap-1">
                    {([
                      { key: 'low' as const, label: '약', desc: '미세 변형 (파일 해시만 변경)' },
                      { key: 'mid' as const, label: '중', desc: '중간 변형 (pHash 일부 변경)' },
                      { key: 'high' as const, label: '강', desc: '강한 변형 (pHash 완전 변경)' },
                    ]).map(({ key, label, desc }) => (
                      <button
                        key={key}
                        onClick={() => onSetPreventionIntensity(key)}
                        title={desc}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                          preventionConfig.variationIntensity === key
                            ? 'bg-[#E31837] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 ml-1">
                    {preventionConfig.variationIntensity === 'low' ? '파일 해시 변경 위주' :
                     preventionConfig.variationIntensity === 'high' ? '좌우반전·회전·배경변경 포함' : '좌우반전·배경변경 포함'}
                  </span>
                </div>
              )}
              <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
                방지 레벨: <span className="font-semibold text-gray-700">{getPreventionLevel(preventionConfig) === 4 ? '높음' : getPreventionLevel(preventionConfig) >= 2 ? '중간' : '낮음'}</span> ({getPreventionLevel(preventionConfig)}/4)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 제3자 이미지 관리 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Folder className="w-5 h-5 text-gray-500" /> 제3자 이미지
          {savedThirdPartyUrls.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {savedThirdPartyUrls.length}장 저장됨
            </span>
          )}
        </h2>
        <p className="text-xs text-gray-400 mb-3">
          한번 업로드하면 모든 상품 등록 시 자동으로 상세페이지에 포함됩니다. 상품당 랜덤 2장 배치.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={onUploadThirdPartyImages}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> 이미지 추가
          </button>
          {savedThirdPartyUrls.length > 0 && (
            <button
              onClick={onClearThirdPartyUrls}
              className="px-4 py-2 text-red-500 hover:bg-red-50 text-sm rounded-lg transition"
            >
              전체 삭제
            </button>
          )}
        </div>
        {savedThirdPartyUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {savedThirdPartyUrls.map((url, i) => (
              <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                <img src={url} alt={`제3자 ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => onRemoveThirdPartyUrl(i)}
                  className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-gray-500" /> 등록 옵션</h2>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition ${includeReviewImages ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
              <input type="checkbox" checked={includeReviewImages} onChange={(e) => onSetIncludeReviewImages(e.target.checked)} className="sr-only" />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${includeReviewImages ? 'translate-x-5' : ''}`} />
            </div>
            <div><div className="text-sm font-medium text-gray-700">리뷰 이미지 포함</div><div className="text-xs text-gray-400">reviews/ 폴더 이미지를 상세페이지에 삽입</div></div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`relative w-11 h-6 rounded-full transition ${useStockImages ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
              <input type="checkbox" checked={useStockImages} onChange={(e) => onSetUseStockImages(e.target.checked)} className="sr-only" />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${useStockImages ? 'translate-x-5' : ''}`} />
            </div>
            <div><div className="text-sm font-medium text-gray-700">스톡 이미지 사용</div><div className="text-xs text-gray-400">농산물/수산물 등 범용 카테고리의 대표이미지를 고품질 스톡 사진으로 교체</div></div>
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
                    <input type="number" min={0} max={500} value={b.marginRate} onChange={(e) => {
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

      {/* 상품정보제공고시: 쿠팡이 자동 적용하므로 별도 설정 불필요 */}

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
