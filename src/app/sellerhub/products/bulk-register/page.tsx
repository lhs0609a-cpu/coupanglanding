'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderSearch, ArrowRight, ArrowLeft, Loader2, CheckCircle2, XCircle,
  Package, Search, RefreshCw, Truck, MapPin, Phone,
} from 'lucide-react';
import Link from 'next/link';

// ---- 타입 ----

interface PriceBracket {
  minPrice: number;
  maxPrice: number | null;
  marginRate: number;
}

interface PreviewProduct {
  productCode: string;
  name: string;
  brand: string;
  sourcePrice: number;
  sellingPrice: number;
  mainImageCount: number;
  detailImageCount: number;
  infoImageCount: number;
  folderPath: string;
  hasProductJson: boolean;
}

interface RegisterResult {
  productCode: string;
  name?: string;
  success: boolean;
  channelProductId?: string;
  error?: string;
}

interface ShippingPlace {
  outboundShippingPlaceCode: string;
  placeName: string;
  placeAddresses: string;
}

interface ReturnCenter {
  returnCenterCode: string;
  shippingPlaceName: string;
  deliverCode: string;
  returnAddress: string;
}

interface CategoryItem {
  id: string;
  name: string;
  path: string;
}

export default function BulkRegisterPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ---- Step 1: 폴더 + 가격 + 배송 설정 ----
  const [folderPath, setFolderPath] = useState('');
  const [brackets, setBrackets] = useState<PriceBracket[]>([
    { minPrice: 0,      maxPrice: 10000,  marginRate: 35 },
    { minPrice: 10000,  maxPrice: 20000,  marginRate: 30 },
    { minPrice: 20000,  maxPrice: 50000,  marginRate: 25 },
    { minPrice: 50000,  maxPrice: 100000, marginRate: 20 },
    { minPrice: 100000, maxPrice: null,    marginRate: 15 },
  ]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // 배송 설정
  const [shippingPlaces, setShippingPlaces] = useState<ShippingPlace[]>([]);
  const [returnCenters, setReturnCenters] = useState<ReturnCenter[]>([]);
  const [selectedOutbound, setSelectedOutbound] = useState('');
  const [selectedReturn, setSelectedReturn] = useState('');
  const [deliveryChargeType, setDeliveryChargeType] = useState<'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE'>('FREE');
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [freeShipOverAmount, setFreeShipOverAmount] = useState(0);
  const [returnCharge, setReturnCharge] = useState(5000);
  const [contactNumber, setContactNumber] = useState('');
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState('');

  // ---- Step 2: 미리보기 ----
  const [products, setProducts] = useState<PreviewProduct[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryResults, setCategoryResults] = useState<CategoryItem[]>([]);
  const [searchingCategory, setSearchingCategory] = useState(false);

  // ---- Step 3: 등록 실행 ----
  const [registering, setRegistering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalToRegister, setTotalToRegister] = useState(0);
  const [results, setResults] = useState<RegisterResult[]>([]);
  const [registerDone, setRegisterDone] = useState(false);

  // ---- 초기 로드: 출고지/반품지 조회 ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingShipping(true);
      setShippingError('');
      try {
        const res = await fetch('/api/sellerhub/products/bulk-register/shipping-info');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '물류 정보 조회 실패');
        if (cancelled) return;

        setShippingPlaces(data.outboundShippingPlaces || []);
        setReturnCenters(data.returnShippingCenters || []);

        // 첫 번째 항목 자동 선택
        if (data.outboundShippingPlaces?.length > 0) {
          setSelectedOutbound(data.outboundShippingPlaces[0].outboundShippingPlaceCode);
        }
        if (data.returnShippingCenters?.length > 0) {
          setSelectedReturn(data.returnShippingCenters[0].returnCenterCode);
        }
      } catch (err) {
        if (!cancelled) {
          setShippingError(err instanceof Error ? err.message : '물류 정보 조회 실패');
        }
      } finally {
        if (!cancelled) setLoadingShipping(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Step 1: 스캔 ----
  const handleScan = useCallback(async () => {
    if (!folderPath.trim()) {
      setScanError('폴더 경로를 입력해주세요.');
      return;
    }
    if (!selectedOutbound) {
      setScanError('출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)');
      return;
    }
    if (!selectedReturn) {
      setScanError('반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)');
      return;
    }

    setScanning(true);
    setScanError('');
    try {
      const res = await fetch(`/api/sellerhub/products/bulk-register?folderPath=${encodeURIComponent(folderPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '스캔 실패');

      setProducts(data.products);
      setSelectedCodes(data.products.map((p: PreviewProduct) => p.productCode));
      if (data.brackets) setBrackets(data.brackets);
      setStep(2);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '스캔 실패');
    } finally {
      setScanning(false);
    }
  }, [folderPath, selectedOutbound, selectedReturn]);

  // ---- 마진율 변경 → 판매가 재계산 ----
  const recalcPrices = useCallback((newBrackets: PriceBracket[]) => {
    setBrackets(newBrackets);
    setProducts((prev) =>
      prev.map((p) => {
        const bracket = newBrackets.find(
          (b) => p.sourcePrice >= b.minPrice && p.sourcePrice < (b.maxPrice ?? Infinity),
        );
        const rate = bracket ? bracket.marginRate : 25;
        const sellingPrice = Math.ceil((p.sourcePrice * (1 + rate / 100)) / 100) * 100;
        return { ...p, sellingPrice };
      }),
    );
  }, []);

  // ---- 카테고리 검색 ----
  const handleSearchCategory = useCallback(async () => {
    if (!categoryKeyword.trim()) return;
    setSearchingCategory(true);
    try {
      const res = await fetch(`/api/sellerhub/products/bulk-register/search-category?keyword=${encodeURIComponent(categoryKeyword)}`);
      const data = await res.json();
      if (data.items) setCategoryResults(data.items);
    } catch {
      // ignore
    } finally {
      setSearchingCategory(false);
    }
  }, [categoryKeyword]);

  // ---- 체크박스 ----
  const toggleProduct = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };
  const toggleAll = () => {
    setSelectedCodes(
      selectedCodes.length === products.length ? [] : products.map((p) => p.productCode),
    );
  };

  // ---- Step 3: 등록 실행 ----
  const handleRegister = useCallback(async () => {
    if (!categoryCode) return alert('카테고리를 선택해주세요.');
    if (!selectedOutbound) return alert('출고지를 선택해주세요.');
    if (!selectedReturn) return alert('반품지를 선택해주세요.');

    setRegistering(true);
    setRegisterDone(false);
    setResults([]);
    setStep(3);

    const codesToRegister = selectedCodes.length > 0 ? selectedCodes : products.map((p) => p.productCode);
    setTotalToRegister(codesToRegister.length);
    setProgress(0);

    try {
      const res = await fetch('/api/sellerhub/products/bulk-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath,
          productCodes: codesToRegister,
          brackets,
          categoryCode,
          deliveryInfo: {
            deliveryCompanyCode: 'CJGLS',
            deliveryChargeType,
            deliveryCharge: deliveryChargeType === 'FREE' ? 0 : deliveryCharge,
            freeShipOverAmount: deliveryChargeType === 'CONDITIONAL_FREE' ? freeShipOverAmount : 0,
            deliveryChargeOnReturn: returnCharge,
            outboundShippingPlaceCode: selectedOutbound,
          },
          returnInfo: {
            returnCenterCode: selectedReturn,
            returnCharge,
            companyContactNumber: contactNumber,
            afterServiceContactNumber: contactNumber,
            afterServiceInformation: '상품 이상 시 고객센터로 연락 바랍니다.',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');

      setResults(data.results || []);
      setProgress(data.totalCount || codesToRegister.length);
    } catch (err) {
      setResults([{ productCode: 'ALL', success: false, error: err instanceof Error ? err.message : '등록 실패' }]);
    } finally {
      setRegistering(false);
      setRegisterDone(true);
    }
  }, [folderPath, selectedCodes, products, brackets, categoryCode, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber]);

  // ---- 계산 ----
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const selectedProducts = products.filter((p) => selectedCodes.includes(p.productCode));
  const totalSourcePrice = selectedProducts.reduce((s, p) => s + p.sourcePrice, 0);
  const totalSellingPrice = selectedProducts.reduce((s, p) => s + p.sellingPrice, 0);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대량 상품 등록</h1>
          <p className="text-sm text-gray-500 mt-1">
            로컬 소싱 폴더에서 상품을 스캔하여 쿠팡에 대량 등록합니다.
          </p>
        </div>
        <Link href="/sellerhub/products" className="text-sm text-gray-500 hover:text-gray-700 transition">
          상품관리로 돌아가기
        </Link>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: '폴더 & 배송 설정' },
          { num: 2, label: '상품 미리보기' },
          { num: 3, label: '등록 실행' },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                step === s.num
                  ? 'bg-[#E31837] text-white'
                  : step > s.num
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.num}</span>}
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ===================================================================== */}
      {/* Step 1: 폴더 선택 + 가격 설정 + 배송/반품 설정                         */}
      {/* ===================================================================== */}
      {step === 1 && (
        <div className="space-y-6">

          {/* 폴더 경로 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderSearch className="w-5 h-5 text-gray-500" /> 소싱 폴더 경로
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="예: J:\대량등록 소싱아이템\건기식\비오틴\2026-02-03\100-1"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              product_* 하위 폴더를 자동 인식합니다. (product.json → 상품명/가격, main_images/ → 대표이미지, output/ → 상세페이지)
            </p>
          </div>

          {/* 배송/반품 설정 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-500" /> 배송 / 반품 설정
            </h2>

            {loadingShipping ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> 쿠팡 물류 정보 불러오는 중...
              </div>
            ) : shippingError ? (
              <div className="text-sm text-red-600 py-2">{shippingError}</div>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                {/* 출고지 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-3.5 h-3.5 inline mr-1" />출고지 <span className="text-red-500">*</span>
                  </label>
                  {shippingPlaces.length === 0 ? (
                    <p className="text-sm text-orange-600">쿠팡 Wing에서 출고지를 먼저 등록해주세요.</p>
                  ) : (
                    <select
                      value={selectedOutbound}
                      onChange={(e) => setSelectedOutbound(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {shippingPlaces.map((p) => (
                        <option key={p.outboundShippingPlaceCode} value={p.outboundShippingPlaceCode}>
                          {p.placeName} — {p.placeAddresses}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 반품지 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-3.5 h-3.5 inline mr-1" />반품지 <span className="text-red-500">*</span>
                  </label>
                  {returnCenters.length === 0 ? (
                    <p className="text-sm text-orange-600">쿠팡 Wing에서 반품지를 먼저 등록해주세요.</p>
                  ) : (
                    <select
                      value={selectedReturn}
                      onChange={(e) => setSelectedReturn(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {returnCenters.map((c) => (
                        <option key={c.returnCenterCode} value={c.returnCenterCode}>
                          {c.shippingPlaceName} — {c.returnAddress}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 배송비 타입 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">배송비</label>
                  <select
                    value={deliveryChargeType}
                    onChange={(e) => setDeliveryChargeType(e.target.value as typeof deliveryChargeType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="FREE">무료배송</option>
                    <option value="NOT_FREE">유료배송</option>
                    <option value="CONDITIONAL_FREE">조건부 무료배송</option>
                  </select>
                  {deliveryChargeType === 'NOT_FREE' && (
                    <input
                      type="number"
                      value={deliveryCharge}
                      onChange={(e) => setDeliveryCharge(Number(e.target.value))}
                      placeholder="배송비 (원)"
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  )}
                  {deliveryChargeType === 'CONDITIONAL_FREE' && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="number"
                        value={deliveryCharge}
                        onChange={(e) => setDeliveryCharge(Number(e.target.value))}
                        placeholder="기본 배송비 (원)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        value={freeShipOverAmount}
                        onChange={(e) => setFreeShipOverAmount(Number(e.target.value))}
                        placeholder="무료배송 기준 금액 (원)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* 반품 배송비 + 연락처 */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">반품 편도 배송비</label>
                    <input
                      type="number"
                      value={returnCharge}
                      onChange={(e) => setReturnCharge(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Phone className="w-3.5 h-3.5 inline mr-1" />판매자 연락처
                    </label>
                    <input
                      type="text"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="02-1234-5678"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 가격 구간 */}
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
                      <td className="py-3 text-sm text-gray-700">
                        {b.minPrice.toLocaleString()}원 ~ {b.maxPrice ? `${b.maxPrice.toLocaleString()}원` : '무제한'}
                      </td>
                      <td className="py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={b.marginRate}
                          onChange={(e) => {
                            const nb = [...brackets];
                            nb[idx] = { ...nb[idx], marginRate: Number(e.target.value) };
                            recalcPrices(nb);
                          }}
                          className="w-20 text-center px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                        />
                      </td>
                      <td className="py-3 text-right text-sm text-gray-500">
                        {examplePrice.toLocaleString()}원 → {exampleSelling.toLocaleString()}원
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 스캔 버튼 */}
          {scanError && <p className="text-sm text-red-600">{scanError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleScan}
              disabled={scanning || loadingShipping}
              className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              폴더 스캔 & 다음
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Step 2: 상품 미리보기 + 카테고리 선택                                   */}
      {/* ===================================================================== */}
      {step === 2 && (
        <div className="space-y-6">

          {/* 카테고리 검색 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">쿠팡 카테고리 선택 <span className="text-red-500">*</span></h2>
            <div className="flex gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={categoryKeyword}
                  onChange={(e) => setCategoryKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchCategory()}
                  placeholder="카테고리 검색 (예: 비오틴, 비타민, 건강기능식품)"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearchCategory}
                disabled={searchingCategory}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                {searchingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
              </button>
            </div>
            {categoryCode && (
              <p className="text-sm text-green-600 mb-2">
                선택됨: <span className="font-medium">{categoryCode}</span>
                {categoryResults.find((c) => c.id === categoryCode) && (
                  <span className="text-gray-500 ml-1">
                    ({categoryResults.find((c) => c.id === categoryCode)?.path})
                  </span>
                )}
              </p>
            )}
            {categoryResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {categoryResults.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryCode(cat.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition ${
                      categoryCode === cat.id ? 'bg-red-50 text-[#E31837]' : 'text-gray-700'
                    }`}
                  >
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{cat.path}</span>
                    <span className="text-xs text-gray-300 ml-1">({cat.id})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 배송 설정 요약 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">배송/마진 설정</h2>
              <button onClick={() => setStep(1)} className="text-sm text-[#E31837] hover:underline">수정</button>
            </div>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg">
                출고지: {shippingPlaces.find((p) => p.outboundShippingPlaceCode === selectedOutbound)?.placeName || selectedOutbound}
              </span>
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg">
                반품지: {returnCenters.find((c) => c.returnCenterCode === selectedReturn)?.shippingPlaceName || selectedReturn}
              </span>
              <span className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg">
                배송: {deliveryChargeType === 'FREE' ? '무료' : deliveryChargeType === 'CONDITIONAL_FREE' ? `${freeShipOverAmount.toLocaleString()}원 이상 무료` : `${deliveryCharge.toLocaleString()}원`}
              </span>
              <span className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg">
                반품비: {returnCharge.toLocaleString()}원
              </span>
              {brackets.map((b, idx) => (
                <span key={idx} className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg">
                  {b.minPrice.toLocaleString()}~{b.maxPrice ? b.maxPrice.toLocaleString() : '∞'}: {b.marginRate}%
                </span>
              ))}
            </div>
          </div>

          {/* 요약 통계 */}
          <div className="grid grid-cols-4 gap-4">
            <StatBox label="선택 상품" value={selectedCodes.length} />
            <StatBox label="전체 상품" value={products.length} />
            <StatBox label="총 원가" value={`${totalSourcePrice.toLocaleString()}원`} />
            <StatBox label="총 판매가" value={`${totalSellingPrice.toLocaleString()}원`} highlight />
          </div>

          {/* 상품 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedCodes.length === products.length && products.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
                전체 선택
              </label>
              <span className="text-xs text-gray-400">
                예상 소요: ~{Math.ceil(selectedCodes.length * 3 / 60)}분
              </span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left w-10" />
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">상품코드</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">상품명</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">원가</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">판매가</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">대표이미지</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">상세페이지</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => (
                    <tr key={p.productCode} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedCodes.includes(p.productCode)}
                          onChange={() => toggleProduct(p.productCode)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">{p.productCode}</td>
                      <td className="px-4 py-2">
                        <div className="text-sm text-gray-900 line-clamp-1">{p.name}</div>
                        {p.brand && <div className="text-xs text-gray-400">{p.brand}</div>}
                        {!p.hasProductJson && <span className="text-xs text-orange-500">product.json 없음</span>}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{p.sourcePrice.toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm font-medium text-[#E31837] text-right">{p.sellingPrice.toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs text-center text-gray-500">{p.mainImageCount}장</td>
                      <td className="px-4 py-2 text-xs text-center text-gray-500">{p.detailImageCount}장</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
            <button
              onClick={handleRegister}
              disabled={selectedCodes.length === 0 || !categoryCode}
              className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
            >
              {selectedCodes.length}개 쿠팡에 등록하기
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Step 3: 등록 실행                                                      */}
      {/* ===================================================================== */}
      {step === 3 && (
        <div className="space-y-6">
          {/* 진행 바 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {registerDone ? '등록 완료' : '등록 진행 중...'}
              </h2>
              {registering && <Loader2 className="w-5 h-5 animate-spin text-[#E31837]" />}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-[#E31837] h-3 rounded-full transition-all duration-300"
                style={{ width: `${totalToRegister > 0 ? (progress / totalToRegister) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{progress} / {totalToRegister}</span>
              {registering && (
                <span className="text-xs text-gray-400">
                  각 상품: 이미지 업로드 → 쿠팡 등록 → DB 저장
                </span>
              )}
              {registerDone && <span className="text-green-600 font-medium">완료</span>}
            </div>
          </div>

          {/* 결과 요약 */}
          {registerDone && (
            <div className="grid grid-cols-3 gap-4">
              <StatBox label="전체" value={totalToRegister} />
              <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{successCount}</div>
                <div className="text-xs text-green-600 mt-1">성공</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${failCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`text-2xl font-bold ${failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{failCount}</div>
                <div className={`text-xs mt-1 ${failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>실패</div>
              </div>
            </div>
          )}

          {/* 결과 상세 */}
          {results.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 text-sm font-medium text-gray-700">
                등록 결과 상세
              </div>
              <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
                {results.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                    {r.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs font-mono text-gray-400 w-32 shrink-0">{r.productCode}</span>
                    <span className="text-sm text-gray-700 line-clamp-1 flex-1">{r.name || ''}</span>
                    {r.success ? (
                      <span className="text-xs text-green-600 shrink-0">쿠팡 #{r.channelProductId}</span>
                    ) : (
                      <span className="text-xs text-red-600 shrink-0 max-w-xs truncate">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 하단 버튼 */}
          {registerDone && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setStep(2);
                  setRegisterDone(false);
                  setResults([]);
                  setProgress(0);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <RefreshCw className="w-4 h-4" /> 다시 등록
              </button>
              <Link
                href="/sellerhub/products"
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
              >
                <Package className="w-4 h-4" /> 상품관리로 이동
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 요약 카드 컴포넌트 ----

function StatBox({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <div className={`text-xl font-bold ${highlight ? 'text-[#E31837]' : 'text-gray-900'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
