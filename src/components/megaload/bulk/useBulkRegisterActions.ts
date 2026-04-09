'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { pickAndScanFolder, uploadScannedImages, uploadScannedImagesWithVariation, uploadSingleImage, compressImage, rescanMainImages, type ScannedImageFile } from '@/lib/megaload/services/client-folder-scanner';
import { validateProductLocal } from '@/lib/megaload/services/product-validator';
import type {
  EditableProduct, PriceBracket, ShippingPlace, ReturnCenter,
  CategoryItem, CategoryMatchResult, PreviewProduct, BatchResult,
  CategoryMetadata, PreventionConfig, FailureDiagnostic,
} from './types';
import type { PreflightProductResult, CanaryResult } from '@/lib/megaload/types';
import { DEFAULT_PREVENTION_CONFIG, DISABLED_PREVENTION_CONFIG } from '@/lib/megaload/services/item-winner-prevention';
import { isCommodityCategory } from '@/lib/megaload/services/stock-image-service';
import { addRecentPath } from './BulkStep1Settings';

// ---- 브랜드 자동 추출 (상품명에서) ----
function extractBrandFromName(name: string): string {
  if (!name) return '';
  // 1) [브랜드명] 또는 (브랜드명) 패턴
  const bracketMatch = name.match(/^[\[【\(]([^\]】\)]{2,20})[\]】\)]/);
  if (bracketMatch) return bracketMatch[1].trim();
  // 2) 첫 번째 한글 토큰 (2자 이상, 일반적 수식어 제외)
  const excludeWords = new Set(['프리미엄', '고함량', '저분자', '대용량', '초특가', '무료배송', '국내산', '수입', '특가', '할인', '정품', '당일발송']);
  const tokens = name.split(/[\s,/]+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (cleaned.length >= 2 && !excludeWords.has(cleaned) && /[가-힣a-zA-Z]/.test(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

/** product.json brand 필드가 실제 브랜드인지 검증 (프로모션 태그 제외) */
function isValidBrand(brand: string | undefined): boolean {
  if (!brand || brand.length < 2) return false;
  // "1+1", "2+1" 등 프로모션 태그 제외
  if (/^\d+\+\d+$/.test(brand)) return false;
  // 숫자/특수문자만으로 구성된 것 제외
  if (!/[가-힣a-zA-Z]/.test(brand)) return false;
  return true;
}

export function useBulkRegisterActions() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [brackets, setBrackets] = useState<PriceBracket[]>([
    { minPrice: 100, maxPrice: 5000, marginRate: 450 },
    { minPrice: 5001, maxPrice: 10000, marginRate: 240 },
    { minPrice: 10001, maxPrice: 20000, marginRate: 160 },
    { minPrice: 20001, maxPrice: 30000, marginRate: 115 },
    { minPrice: 30001, maxPrice: 50000, marginRate: 100 },
    { minPrice: 50001, maxPrice: 80000, marginRate: 90 },
    { minPrice: 80001, maxPrice: 150000, marginRate: 80 },
    { minPrice: 150001, maxPrice: 200000, marginRate: 60 },
    { minPrice: 200001, maxPrice: 300000, marginRate: 55 },
    { minPrice: 300001, maxPrice: 9999999, marginRate: 70 },
  ]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [generateAiContent, setGenerateAiContent] = useState(false);
  const [includeReviewImages, setIncludeReviewImages] = useState(true);
  const [noticeOverrides, setNoticeOverrides] = useState<Record<string, string>>({});
  const [preventionConfig, setPreventionConfig] = useState<PreventionConfig>(DEFAULT_PREVENTION_CONFIG);
  const [useStockImages, setUseStockImages] = useState(false);
  const [stockImageProgress, setStockImageProgress] = useState<{ done: number; total: number } | null>(null);
  const [browsingFolder, setBrowsingFolder] = useState(false);
  const [thirdPartyImages, setThirdPartyImages] = useState<ScannedImageFile[]>([]);
  // 제3자 이미지 CDN URL 영구 저장 (localStorage)
  const [savedThirdPartyUrls, setSavedThirdPartyUrls] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('megaload_thirdPartyUrls');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Shipping
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

  // Step 2 state
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [autoMatchingProgress, setAutoMatchingProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoMatchError, setAutoMatchError] = useState('');
  const [autoMatchStats, setAutoMatchStats] = useState<{ matched: number; failed: number; total: number } | null>(null);
  const [autoCategoryRetryCount, setAutoCategoryRetryCount] = useState(0);
  const [categoryFailures, setCategoryFailures] = useState<FailureDiagnostic[]>([]);
  const AUTO_CATEGORY_MAX_RETRIES = 3;

  // Auto-fill pipeline progress
  const [titleGenProgress, setTitleGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [contentGenProgress, setContentGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [imageFilterProgress, setImageFilterProgress] = useState<{
    done: number; total: number; phase: 'idle' | 'running' | 'complete';
  }>({ done: 0, total: 0, phase: 'idle' });
  const [pipelineRan, setPipelineRan] = useState(false);

  // Category search
  const [categorySearchTarget, setCategorySearchTarget] = useState<string | null>(null);
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [categoryResults, setCategoryResults] = useState<CategoryItem[]>([]);
  const [searchingCategory, setSearchingCategory] = useState(false);

  // Validation
  const [validating, setValidating] = useState(false);
  const [categoryMetaCache, setCategoryMetaCache] = useState<Record<string, CategoryMetadata>>({});
  const [validationPhase, setValidationPhase] = useState<'idle' | 'local' | 'deep' | 'dryrun' | 'preupload' | 'complete'>('idle');

  // Image preupload pipeline
  const [imagePreuploadProgress, setImagePreuploadProgress] = useState<{
    total: number; done: number; phase: 'idle' | 'uploading' | 'complete' | 'error';
  }>({ total: 0, done: 0, phase: 'idle' });
  const [imagePreuploadCache, setImagePreuploadCache] = useState<Record<string, {
    mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[];
    uploadedAt?: number;
  }>>({});
  const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30분
  const imagePreuploadAbort = useRef<AbortController | null>(null);
  // Ref로 최신 캐시 참조 — useCallback 클로저 stale 문제 방지
  const imagePreuploadCacheRef = useRef(imagePreuploadCache);
  imagePreuploadCacheRef.current = imagePreuploadCache;

  // Dry-Run
  const [dryRunResults, setDryRunResults] = useState<Record<string, {
    payloadPreview?: { displayCategoryCode: number; sellerProductName: string; imageCount: number; noticeCategoryCount: number; attributeCount: number; hasDetailPage: boolean; stock: number };
    missingRequiredFields?: string[];
  }>>({});

  // Preflight
  const [preflightPhase, setPreflightPhase] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [preflightResults, setPreflightResults] = useState<Record<string, PreflightProductResult>>({});
  const [preflightStats, setPreflightStats] = useState<{ total: number; pass: number; fail: number; warn: number } | null>(null);
  const [preflightDurationMs, setPreflightDurationMs] = useState(0);

  // Canary
  const [canaryPhase, setCanaryPhase] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [canaryResult, setCanaryResult] = useState<CanaryResult | null>(null);

  // Step 3 state
  const [registering, setRegistering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);

  // ---- Prevention config ----
  const setPreventionEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      setPreventionConfig(DEFAULT_PREVENTION_CONFIG);
    } else {
      setPreventionConfig(DISABLED_PREVENTION_CONFIG);
    }
  }, []);

  const setPreventionIntensity = useCallback((intensity: 'low' | 'mid' | 'high') => {
    setPreventionConfig(prev => ({ ...prev, variationIntensity: intensity }));
  }, []);

  // ---- Folder path management ----
  const addFolderPath = useCallback((pathOrPaths: string) => {
    const lines = pathOrPaths.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    setFolderPaths((prev) => {
      const newPaths = [...prev];
      for (const line of lines) {
        if (!newPaths.includes(line)) {
          newPaths.push(line);
          addRecentPath(line);
        }
      }
      return newPaths;
    });
  }, []);

  const removeFolderPath = useCallback((path: string) => {
    setFolderPaths((prev) => prev.filter((p) => p !== path));
  }, []);

  // ---- Auto category matching ----
  const runAutoCategory = useCallback(async (prods: EditableProduct[], retryOnly = false) => {
    const BATCH_SIZE = 50;
    const targets = retryOnly ? prods.filter((p) => !p.editedCategoryCode) : prods;
    const total = targets.length;
    if (total === 0) return;

    setAutoMatchingProgress({ done: 0, total });
    setAutoMatchError('');
    setCategoryFailures([]);
    let matchedCount = 0;
    let failedCount = 0;
    const failedBatches: number[] = [];
    let allFailures: FailureDiagnostic[] = [];

    const processBatch = async (batchStart: number, batchProds: EditableProduct[], allProds: EditableProduct[]) => {
      const names = batchProds.map((p) => p.name);  // 원본 상품명으로 카테고리 매칭
      const naverCategoryIds = batchProds.map((p) => p.naverCategoryId);
      const hasNaverIds = naverCategoryIds.some(Boolean);
      const res = await fetch('/api/megaload/products/bulk-register/auto-category-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productNames: names,
          ...(hasNaverIds ? { naverCategoryIds } : {}),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json() as { results: CategoryMatchResult[]; failures?: FailureDiagnostic[] };
      if (data.failures?.length) {
        allFailures = [...allFailures, ...data.failures];
      }
      // 매칭 수를 state updater 밖에서 먼저 계산 (React 18에서 updater는 렌더 시점에 실행되므로
      // updater 안에서 외부 변수를 수정하면 return 시점에 반영되지 않음)
      let batchMatched = 0;
      for (const r of data.results) {
        if (batchProds[r.index] && r.categoryCode) {
          batchMatched++;
        }
      }
      setProducts((prev) => {
        const updated = [...prev];
        for (const r of data.results) {
          const targetProduct = batchProds[r.index];
          if (!targetProduct) continue;
          const globalIdx = updated.findIndex((p) => p.uid === targetProduct.uid);
          if (globalIdx >= 0 && r.categoryCode) {
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedCategoryCode: r.categoryCode,
              editedCategoryName: r.categoryPath || r.categoryName || '',
              categoryConfidence: r.confidence,
              categorySource: r.source,
            };
          }
        }
        return updated;
      });
      return batchMatched;
    };

    // Main pass
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      try {
        const matched = await processBatch(i, batch, prods);
        matchedCount += matched || 0;
      } catch (err) {
        console.error(`[auto-category] Batch ${i} failed:`, err);
        failedBatches.push(i);
        failedCount += batch.length;
      }
      setAutoMatchingProgress({ done: Math.min(i + BATCH_SIZE, total), total });
    }

    // Retry failed batches once
    if (failedBatches.length > 0) {
      for (const batchStart of failedBatches) {
        await new Promise((r) => setTimeout(r, 500)); // backoff
        const batch = targets.slice(batchStart, batchStart + BATCH_SIZE);
        try {
          const matched = await processBatch(batchStart, batch, prods);
          matchedCount += matched || 0;
          failedCount -= batch.length;
        } catch (err) {
          console.error(`[auto-category] Retry batch ${batchStart} failed:`, err);
        }
      }
    }

    const stats = { matched: matchedCount, failed: total - matchedCount, total };
    setAutoMatchStats(stats);
    if (stats.failed > 0) {
      setAutoMatchError(`카테고리 매칭 ${stats.matched}/${stats.total} 성공 (${stats.failed}개 실패). 수동으로 지정하거나 재시도하세요.`);
    }

    // Save and log failure diagnostics
    if (allFailures.length > 0) {
      setCategoryFailures(allFailures);
      console.log(`[카테고리 매칭 실패] ${allFailures.length}개 상품:`);
      console.table(allFailures.map(f => ({
        상품명: (f.productName || '').slice(0, 30),
        토큰: (f.tokens || []).join(', '),
        점수: f.bestScore,
        실패사유: f.reason,
      })));
      console.log('[카테고리 매칭 실패 목록]', JSON.stringify(allFailures, null, 2));
    }

    setAutoMatchingProgress(null);
  }, []);

  // Retry auto-category for unmatched products (max 3 retries, exponential backoff)
  const retryAutoCategory = useCallback(async () => {
    if (autoCategoryRetryCount >= AUTO_CATEGORY_MAX_RETRIES) {
      setAutoMatchError(`자동 카테고리 재시도 횟수 초과 (최대 ${AUTO_CATEGORY_MAX_RETRIES}회). 수동으로 지정해주세요.`);
      return;
    }
    const backoffMs = 500 * Math.pow(2, autoCategoryRetryCount);
    setAutoCategoryRetryCount((c) => c + 1);
    await new Promise((r) => setTimeout(r, backoffMs));
    runAutoCategory(products, true);
  }, [products, runAutoCategory, autoCategoryRetryCount]);

  // ---- 1단계: 쿠팡 Predict API로 카테고리 추천 (단일 상품) ----
  const fetchCategorySuggestions = useCallback(async (uid: string): Promise<CategoryItem[]> => {
    const product = products.find(p => p.uid === uid);
    if (!product) return [];
    try {
      // 쿠팡 카테고리 검색 + Predict API 동시 호출
      const name = product.name || product.editedName || '';
      const [searchRes, predictRes] = await Promise.allSettled([
        fetch(`/api/megaload/products/bulk-register/search-category?keyword=${encodeURIComponent(name.slice(0, 30))}`),
        fetch('/api/megaload/products/bulk-register/auto-category', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productName: name }),
        }),
      ]);

      const suggestions: CategoryItem[] = [];
      // Predict API 결과 (가장 정확)
      if (predictRes.status === 'fulfilled' && predictRes.value.ok) {
        const data = await predictRes.value.json();
        if (data.categoryCode) {
          suggestions.push({ id: data.categoryCode, name: data.categoryName || '', path: data.categoryPath || '' });
        }
      }
      // 검색 API 결과 (다양한 후보)
      if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
        const data = await searchRes.value.json();
        for (const item of (data.items || []).slice(0, 5)) {
          if (!suggestions.some(s => s.id === item.id)) {
            suggestions.push(item);
          }
        }
      }
      return suggestions.slice(0, 5);
    } catch { return []; }
  }, [products]);

  // ---- 2단계: 신뢰도 낮은 상품 감지 ----
  const lowConfidenceProducts = useMemo(() =>
    products.filter(p => p.selected && p.categoryConfidence < 0.9 && p.editedCategoryCode),
  [products]);

  // ---- 3단계: 오분류 일괄 재매칭 (쿠팡 Predict API 우선) ----
  const [rematchingCategory, setRematchingCategory] = useState(false);
  const rematchLowConfidence = useCallback(async () => {
    const targets = lowConfidenceProducts;
    if (targets.length === 0) return;
    setRematchingCategory(true);

    try {
      const BATCH = 10;
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            const res = await fetch('/api/megaload/products/bulk-register/auto-category', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ productName: p.name || p.editedName, forceCoupangApi: true }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return { uid: p.uid, ...data };
          }),
        );

        setProducts(prev => prev.map(p => {
          const r = results.find(r => r.status === 'fulfilled' && r.value?.uid === p.uid);
          if (!r || r.status !== 'fulfilled' || !r.value?.categoryCode) return p;
          const v = r.value;
          // 새 결과가 기존보다 높은 신뢰도일 때만 적용
          if (v.confidence > p.categoryConfidence) {
            return {
              ...p,
              editedCategoryCode: v.categoryCode,
              editedCategoryName: v.categoryPath || v.categoryName || '',
              categoryConfidence: v.confidence,
              categorySource: 'coupang_api',
            };
          }
          return p;
        }));
      }
    } finally { setRematchingCategory(false); }
  }, [lowConfidenceProducts]);

  // ---- Stock image fetch (Pexels) ----
  const runStockImageFetch = useCallback(async (prods: EditableProduct[]) => {
    if (!useStockImages) return;

    const targets = prods.filter(p => p.editedCategoryCode && isCommodityCategory(p.editedCategoryName));
    if (targets.length === 0) return;

    setStockImageProgress({ done: 0, total: targets.length });
    await new Promise(r => setTimeout(r, 0));

    const BATCH = 20;
    let done = 0;

    // P0-3: 모든 배치 결과를 로컬에 누적한 뒤 한 번에 적용
    const allStockResults: Record<string, { stockImageUrls: string[]; stockCategoryKey?: string }> = {};

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/megaload/products/stock-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map(p => ({
              uid: p.uid,
              categoryPath: p.editedCategoryName,
              productCode: p.productCode,
            })),
            count: 5,
          }),
        });

        if (res.ok) {
          const data = await res.json() as {
            results: Record<string, { stockImageUrls: string[]; stockCategoryKey?: string }>;
            skipped: string[];
          };
          Object.assign(allStockResults, data.results);
        }
      } catch (err) {
        console.error('[stock-images] Batch failed:', err);
      }
      done += batch.length;
      setStockImageProgress({ done: Math.min(done, targets.length), total: targets.length });
    }

    // 한 번에 products + preupload cache 업데이트
    if (Object.keys(allStockResults).length > 0) {
      setProducts(prev => prev.map(p => {
        const result = allStockResults[p.uid];
        if (!result || result.stockImageUrls.length === 0) return p;

        const originalScanned = p.originalScannedMainImages || p.scannedMainImages;
        const stockScanned = result.stockImageUrls.map((url, idx) => ({
          name: `stock_${idx}.jpg`,
          objectUrl: url,
          handle: null as unknown as FileSystemFileHandle,
        }));

        return {
          ...p,
          stockMainImageUrls: result.stockImageUrls,
          stockCategoryKey: result.stockCategoryKey,
          originalScannedMainImages: originalScanned,
          scannedMainImages: stockScanned,
          mainImageCount: stockScanned.length,
        };
      }));

      setImagePreuploadCache(prev => {
        const updated = { ...prev };
        for (const [uid, result] of Object.entries(allStockResults)) {
          if (result.stockImageUrls.length > 0) {
            updated[uid] = {
              ...(updated[uid] || { detailImageUrls: [], reviewImageUrls: [], infoImageUrls: [] }),
              mainImageUrls: result.stockImageUrls,
              uploadedAt: Date.now(),
            };
          }
        }
        return updated;
      });
    }

    setStockImageProgress({ done: targets.length, total: targets.length });
  }, [useStockImages]);

  // ---- 스톡 이미지 개별 교체 (스왑 모달) ----
  const handleSwapStockImage = useCallback((uid: string, imageIndex: number, newCdnUrl: string) => {
    // 1. products 상태 업데이트 (stockMainImageUrls + scannedMainImages)
    setProducts(prev => prev.map(p => {
      if (p.uid !== uid) return p;

      const urls = [...(p.stockMainImageUrls || [])];
      // imageIndex가 범위 내인 경우 교체, 아니면 추가
      if (imageIndex < urls.length) {
        urls[imageIndex] = newCdnUrl;
      } else {
        urls.push(newCdnUrl);
      }

      const stockScanned = urls.map((url, idx) => ({
        name: `stock_${idx}.jpg`,
        objectUrl: url,
        handle: null as unknown as FileSystemFileHandle,
      }));

      return {
        ...p,
        stockMainImageUrls: urls,
        scannedMainImages: stockScanned,
        mainImageCount: stockScanned.length,
      };
    }));

    // 2. imagePreuploadCache 업데이트
    setImagePreuploadCache(prev => {
      const cached = prev[uid];
      if (!cached) return prev;
      const mainImageUrls = [...cached.mainImageUrls];
      if (imageIndex < mainImageUrls.length) {
        mainImageUrls[imageIndex] = newCdnUrl;
      } else {
        mainImageUrls.push(newCdnUrl);
      }
      return {
        ...prev,
        [uid]: { ...cached, mainImageUrls, uploadedAt: Date.now() },
      };
    });
  }, []);

  // ---- Auto-fill pipeline: Title generation (template or AI) ----
  const runTitleGeneration = useCallback(async (prods: EditableProduct[]) => {
    const targets = prods.filter(p => p.editedCategoryCode && !p.editedDisplayProductName);
    if (!targets.length) {
      setTitleGenProgress({ done: 0, total: 0 });
      return;
    }
    setTitleGenProgress({ done: 0, total: targets.length });
    // React 배치를 끊어 UI에 0% 상태를 표시
    await new Promise(r => setTimeout(r, 0));

    // SEO 최적화 상품명 즉시 생성 (항상 실행, AI 불필요)
    // displayProductName은 SEO 최적화, sellerProductName은 "브랜드 고유번호" 유지
    {
      const { generateDisplayName } = await import('@/lib/megaload/services/display-name-generator');
      const displaySeed = `display_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setProducts(prev => {
        const updated = [...prev];
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const globalIdx = updated.findIndex(p => p.uid === target.uid);
          if (globalIdx >= 0) {
            // 풀 브랜드명 복원 — editedBrand는 2글자 축약이라 긴 브랜드명 필터 실패
            const fullBrand = isValidBrand(target.brand) ? target.brand : extractBrandFromName(target.name);
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedDisplayProductName: generateDisplayName(
                target.name,  // 원본 상품명 사용 (editedName은 브랜드+고유번호)
                fullBrand,
                target.editedCategoryName,
                displaySeed,
                i,
              ),
              editedSellerProductName: updated[globalIdx].editedName, // "브랜드 고유번호" 그대로 사용
            };
          }
        }
        return updated;
      });
      setTitleGenProgress({ done: targets.length, total: targets.length });
      return;
    }

    // AI 기반 생성 (폴백 — 위에서 항상 return하므로 실행 안 됨)
    const BATCH = 100;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const inputs = batch.map(p => ({
        originalName: p.editedName,
        categoryPath: p.editedCategoryName,
        brand: p.editedBrand,
        keywords: p.tags,
      }));

      try {
        const res = await fetch('/api/megaload/products/bulk-register/generate-titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: inputs }),
        });

        if (res.ok) {
          const data = await res.json();
          setProducts(prev => prev.map(p => {
            const idx = batch.findIndex(b => b.uid === p.uid);
            if (idx === -1 || !data.results?.[idx]) return p;
            return { ...p, editedDisplayProductName: data.results[idx].displayName };
          }));
        }
      } catch (err) {
        console.error('[title-gen] Batch failed:', err);
      }
      setTitleGenProgress({ done: Math.min(i + BATCH, targets.length), total: targets.length });
    }
  }, [preventionConfig]);

  // ---- Auto-fill pipeline: Story/content generation (template or AI) ----
  const runContentGeneration = useCallback(async (prods: EditableProduct[]) => {
    const targets = prods.filter(p =>
      p.editedCategoryCode &&
      (!p.editedStoryParagraphs || p.editedStoryParagraphs.length === 0)
    );
    if (!targets.length) {
      setContentGenProgress({ done: 0, total: 0 });
      return;
    }
    setContentGenProgress({ done: 0, total: targets.length });
    // React 배치를 끊어 UI에 0% 상태를 표시
    await new Promise(r => setTimeout(r, 0));

    // 템플릿 기반 즉시 생성 (항상 실행 — AI 불필요)
    {
      const { generateStoryV2 } = await import('@/lib/megaload/services/story-generator');
      const sellerSeed = `seller_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setProducts(prev => {
        const updated = [...prev];
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const globalIdx = updated.findIndex(p => p.uid === target.uid);
          if (globalIdx >= 0) {
            const story = generateStoryV2(
              target.editedDisplayProductName || target.name,
              target.editedCategoryName,
              sellerSeed,
              i,
              {
                description: target.description,
                tags: target.tags,
                brand: target.editedBrand || target.brand,
                noticeValues: target.editedNoticeValues,
                attributeValues: target.editedAttributeValues,
              },
            );
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedStoryParagraphs: story.paragraphs,
              editedReviewTexts: story.reviewTexts,
              editedContentBlocks: story.contentBlocks,
            };
          }
        }
        return updated;
      });
      setContentGenProgress({ done: targets.length, total: targets.length });
      return;
    }

    // AI 기반 생성 (방지 비활성 + AI 활성 시)
    const BATCH = 50;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/megaload/products/bulk-register/generate-content-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map(p => ({
              productName: p.editedDisplayProductName || p.editedName,
              category: p.editedCategoryName,
              features: p.tags,
              description: p.description,
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setProducts(prev => prev.map(p => {
            const idx = batch.findIndex(b => b.uid === p.uid);
            if (idx === -1 || !data.results?.[idx]) return p;
            const r = data.results[idx];
            return {
              ...p,
              editedStoryParagraphs: r.paragraphs || [],
              editedReviewTexts: r.reviewTexts || [],
            };
          }));
        }
      } catch (err) {
        console.error('[content-gen] Batch failed:', err);
      }
      setContentGenProgress({ done: Math.min(i + BATCH, targets.length), total: targets.length });
    }
  }, [generateAiContent, preventionConfig]);

  // ---- Auto-fill pipeline trigger: after category matching completes ----
  const productsRef = useRef<EditableProduct[]>(products);
  productsRef.current = products;

  useEffect(() => {
    if (autoMatchingProgress === null && autoMatchStats && !pipelineRan && step === 2) {
      setPipelineRan(true);
      (async () => {
        const latest = productsRef.current;

        // ========== 순차 파이프라인 (UI 응답성 최우선) ==========
        // Canvas가 CPU를 차단하므로 제목/콘텐츠를 먼저 즉시 생성
        // 이미지 필터는 대표이미지 스코어링만 (이상치/상세/교차비교 완전 생략)

        // Step 1. 상품명 생성 — 즉시 완료 (템플릿 기반, <100ms)
        await runTitleGeneration(latest);
        await new Promise(r => setTimeout(r, 50));

        // Step 2. 상세페이지 생성 — 즉시 완료 (템플릿 기반, <100ms)
        await runContentGeneration(productsRef.current);
        await new Promise(r => setTimeout(r, 50));

        // Step 3. 대표이미지 선정
        // main_images 폴더의 모든 이미지를 스코어링하여 누끼 우선 정렬
        {
          const { filterAndScoreMainImages } = await import('@/lib/megaload/services/image-quality-scorer');
          const { ensureObjectUrl, rescanMainImages: rescanMainImagesFn } = await import('@/lib/megaload/services/client-folder-scanner');

          // ★ Step 3a: main_images 자동 리스캔 (코드 업데이트 후 누락 이미지 복구)
          // dirHandle이 있으면 현재 코드의 패턴으로 다시 스캔
          let rescanCount = 0;
          for (let idx = 0; idx < latest.length; idx++) {
            const p = latest[idx];
            if (p.productDirHandle) {
              try {
                const rescanned = await rescanMainImagesFn(p.productDirHandle);
                if (rescanned.length > (p.scannedMainImages?.length ?? 0)) {
                  rescanCount++;
                  latest[idx] = { ...p, scannedMainImages: rescanned, mainImageCount: rescanned.length };
                }
              } catch { /* dirHandle 만료 시 기존 유지 */ }
            }
          }
          if (rescanCount > 0) {
            console.info(`[image-rescan] ${rescanCount}개 상품의 main_images 리스캔 완료 (누락 이미지 복구)`);
            setProducts([...latest]);
            await new Promise(r => setTimeout(r, 50));
          }

          const filterTotal = latest.length;
          setImageFilterProgress({ done: 0, total: filterTotal, phase: 'running' });
          await new Promise(r => setTimeout(r, 0));

          type ScoringResult = { index: number; score: import('@/lib/megaload/services/image-quality-scorer').ImageScore; filtered: boolean }[] | null;
          const scoringResults: ScoringResult[] = new Array(latest.length).fill(null);
          const usedReview: boolean[] = new Array(latest.length).fill(false);
          const MAX_REVIEW_CANDIDATES = 20;

          for (let idx = 0; idx < latest.length; idx++) {
            const p = latest[idx];
            let usedMainImages = false;

            // 1순위: 메인이미지 — 있으면 무조건 사용 (누끼 보호)
            // ★ main_images 폴더의 이미지는 절대 리뷰이미지로 교체하지 않음
            // 스코어링은 정렬(누끼 우선)용으로만 사용, 하드필터 결과 무시
            if (p.scannedMainImages && p.scannedMainImages.length > 0) {
              usedMainImages = true;  // ← 무조건 true
              console.info(`[image-pipeline] ${p.productCode}: scannedMainImages=${p.scannedMainImages.length}장 (${p.scannedMainImages.map(m => m.name).join(', ')})`);
              const validEntries: { origIdx: number; url: string }[] = [];
              for (let j = 0; j < p.scannedMainImages.length; j++) {
                const url = p.scannedMainImages[j].objectUrl;
                if (url) validEntries.push({ origIdx: j, url });
              }
              console.info(`[image-pipeline] ${p.productCode}: objectUrl 있음=${validEntries.length}장, 없음=${p.scannedMainImages.length - validEntries.length}장`);
              if (validEntries.length > 1) {
                try {
                  const urls = validEntries.map(e => e.url);
                  const scores = await filterAndScoreMainImages(urls);
                  // 스코어링 결과는 정렬용으로만 저장 (하드필터 무시)
                  scoringResults[idx] = scores.map(s => ({
                    ...s,
                    index: validEntries[s.index].origIdx,
                  }));
                  console.info(`[image-pipeline] ${p.productCode}: 스코어 결과 = ${scores.slice(0, 5).map(s => `${p.scannedMainImages![validEntries[s.index].origIdx]?.name}=${s.score.overall.toFixed(1)}${s.score.hardFilterReason ? `(${s.score.hardFilterReason})` : ''}`).join(', ')}`);
                } catch (e) {
                  console.warn(`[image-pipeline] ${p.productCode}: 스코어링 실패`, e);
                }
              }
            } else {
              console.info(`[image-pipeline] ${p.productCode}: scannedMainImages 없음 → 리뷰 폴백`);
            }

            // 2순위: 기존 대표이미지 부적합/없음 → 리뷰 이미지 폴백 (지재권 보호)
            if (!usedMainImages && p.scannedReviewImages && p.scannedReviewImages.length > 0) {
              const candidates = p.scannedReviewImages.slice(0, MAX_REVIEW_CANDIDATES);
              const validEntries: { origIdx: number; url: string }[] = [];
              for (let j = 0; j < candidates.length; j++) {
                const url = await ensureObjectUrl(candidates[j]);
                if (url) validEntries.push({ origIdx: j, url });
              }
              if (validEntries.length > 0) {
                try {
                  const urls = validEntries.map(e => e.url);
                  const scores = await filterAndScoreMainImages(urls);
                  const passed = scores.filter(s => !s.filtered);
                  if (passed.length > 0) {
                    scoringResults[idx] = scores.map(s => ({
                      ...s,
                      index: validEntries[s.index].origIdx,
                    }));
                    usedReview[idx] = true;
                  }
                } catch { /* skip */ }
              }
            }

            // 5개 상품마다 progress + yield
            if ((idx + 1) % 5 === 0 || idx === latest.length - 1) {
              setImageFilterProgress(prev => ({ ...prev, done: idx + 1 }));
              await new Promise(r => setTimeout(r, 0));
            }
          }

          // setProducts — 스코어링 결과 적용
          setProducts(prev => prev.map((p, i) => {
            const scores = scoringResults[i];

            if (usedReview[i] && scores && scores.length > 0) {
              // 리뷰 이미지 → 대표사진 교체 (메인이미지가 없을 때만)
              const passed = scores.filter(s => !s.filtered);
              const surviving = passed.length > 0 ? passed : [scores[0]];
              console.info(
                `[review→main] ${p.productCode}: 리뷰 ${surviving.length}장 선정 (${surviving.slice(0, 3).map(s => `#${s.index}=${s.score.overall.toFixed(1)}`).join(', ')})`,
              );
              const newMain = surviving.map(s => p.scannedReviewImages![s.index]).slice(0, 10);
              return { ...p, scannedMainImages: newMain, mainImageCount: newMain.length };
            }

            if (!scores || scores.length === 0) return p;
            if (!p.scannedMainImages || p.scannedMainImages.length <= 1) return p;

            // 메인이미지: 스코어 순 정렬만 (하드필터 제거 안 함)
            // 누끼 이미지가 높은 점수를 받아 앞으로 오도록 정렬
            const allSorted = [...scores].sort((a, b) => b.score.overall - a.score.overall);
            console.info(
              `[image-score] ${p.productCode}: 대표=#${allSorted[0].index} (overall=${allSorted[0].score.overall.toFixed(1)}), 전체 ${allSorted.length}장 유지`,
            );
            const sorted = allSorted.map(s => p.scannedMainImages![s.index]);
            const finalImages = sorted.slice(0, 10);
            return { ...p, scannedMainImages: finalImages, mainImageCount: finalImages.length };
          }));

          setImageFilterProgress({ done: filterTotal, total: filterTotal, phase: 'complete' });
          await new Promise(r => setTimeout(r, 50));

          // Step 3.5. 자동 크롭: 대표이미지(index 0) 점유율이 낮으면 바운딩박스 기준 크롭
          {
            const { autoCropToFill } = await import('@/lib/megaload/services/image-quality-scorer');

            const latestForCrop = productsRef.current;
            const cropResults: Map<number, string> = new Map();

            for (let idx = 0; idx < latestForCrop.length; idx++) {
              const p = latestForCrop[idx];
              const mainImg = p.scannedMainImages?.[0];
              const url = mainImg?.objectUrl;
              if (!url) continue;

              try {
                const result = await autoCropToFill(url);
                if (result.cropped) {
                  cropResults.set(idx, result.url);
                  console.info(
                    `[auto-crop] ${p.productCode}: 점유율 ${(result.oldRatio * 100).toFixed(0)}%→${(result.newRatio * 100).toFixed(0)}%`,
                  );
                }
              } catch { /* skip */ }

              // 10개마다 yield
              if ((idx + 1) % 10 === 0) await new Promise(r => setTimeout(r, 0));
            }

            if (cropResults.size > 0) {
              setProducts(prev => prev.map((p, i) => {
                const newUrl = cropResults.get(i);
                if (!newUrl || !p.scannedMainImages || p.scannedMainImages.length === 0) return p;

                const updated = [...p.scannedMainImages];
                updated[0] = { ...updated[0], objectUrl: newUrl };
                return { ...p, scannedMainImages: updated };
              }));
              console.info(`[auto-crop] ${cropResults.size}개 상품 대표이미지 크롭 완료`);
            }
          }

          // Step 3.7. 상세/리뷰 이미지 다양성 기반 자동 선택
          {
            const { selectDiverseImages } = await import('@/lib/megaload/services/image-quality-scorer');
            type ImageSelectionMeta = import('./types').ImageSelectionMeta;

            const latestForFilter = productsRef.current;
            const detailOrderMap: Map<number, number[]> = new Map();
            const reviewOrderMap: Map<number, number[]> = new Map();
            const detailMetaMap: Map<number, ImageSelectionMeta> = new Map();
            const reviewMetaMap: Map<number, ImageSelectionMeta> = new Map();

            for (let idx = 0; idx < latestForFilter.length; idx++) {
              const p = latestForFilter[idx];

              // 메인이미지 URLs (이상치 비교 기준)
              const mainUrls = (p.scannedMainImages ?? [])
                .map(img => img.objectUrl)
                .filter((u): u is string => !!u)
                .slice(0, 3);

              // (1) 상세이미지 다양성 선택
              const detailImgs = p.scannedDetailImages ?? [];
              if (detailImgs.length > 0) {
                const detailUrls: (string | null)[] = [];
                for (const img of detailImgs) {
                  const url = await ensureObjectUrl(img);
                  detailUrls.push(url ?? null);
                }
                const validDetailMap: { origIdx: number; url: string }[] = [];
                for (let j = 0; j < detailUrls.length; j++) {
                  if (detailUrls[j]) validDetailMap.push({ origIdx: j, url: detailUrls[j]! });
                }

                if (validDetailMap.length > 0) {
                  try {
                    const result = await selectDiverseImages(
                      validDetailMap.map(e => e.url),
                      { maxCount: 10, referenceUrls: mainUrls },
                    );
                    // selectedIndices는 validDetailMap 내의 인덱스 → origIdx로 변환
                    const selectedOrigIndices = result.selectedIndices.map(i => validDetailMap[i].origIdx);
                    detailOrderMap.set(idx, selectedOrigIndices);
                    detailMetaMap.set(idx, {
                      diversityScore: result.diversityScore,
                      imageTypes: result.imageTypes,
                      clusterCount: result.clusterCount,
                      watermarkScores: result.watermarkScores,
                    });
                  } catch (e) {
                    console.warn(`[detail-diversity] ${p.productCode}: 다양성 선택 실패`, e);
                  }
                }
              }

              // (2) 리뷰이미지 다양성 선택
              const reviewImgs = p.scannedReviewImages ?? [];
              if (reviewImgs.length > 0) {
                const reviewUrls: (string | null)[] = [];
                for (const img of reviewImgs) {
                  const url = await ensureObjectUrl(img);
                  reviewUrls.push(url ?? null);
                }
                const validReviewMap: { origIdx: number; url: string }[] = [];
                for (let j = 0; j < reviewUrls.length; j++) {
                  if (reviewUrls[j]) validReviewMap.push({ origIdx: j, url: reviewUrls[j]! });
                }

                if (validReviewMap.length > 0) {
                  try {
                    const result = await selectDiverseImages(
                      validReviewMap.map(e => e.url),
                      { maxCount: 5, referenceUrls: mainUrls },
                    );
                    const selectedOrigIndices = result.selectedIndices.map(i => validReviewMap[i].origIdx);
                    reviewOrderMap.set(idx, selectedOrigIndices);
                    reviewMetaMap.set(idx, {
                      diversityScore: result.diversityScore,
                      imageTypes: result.imageTypes,
                      clusterCount: result.clusterCount,
                      watermarkScores: result.watermarkScores,
                    });
                  } catch (e) {
                    console.warn(`[review-diversity] ${p.productCode}: 다양성 선택 실패`, e);
                  }
                }
              }

              // 10개마다 yield
              if ((idx + 1) % 10 === 0) await new Promise(r => setTimeout(r, 0));
            }

            // 결과 적용
            if (detailOrderMap.size > 0 || reviewOrderMap.size > 0) {
              setProducts(prev => prev.map((p, i) => {
                const detailOrder = detailOrderMap.get(i);
                const reviewOrder = reviewOrderMap.get(i);
                const detailMeta = detailMetaMap.get(i);
                const reviewMeta = reviewMetaMap.get(i);
                if (!detailOrder && !reviewOrder) return p;
                return {
                  ...p,
                  ...(detailOrder ? { editedDetailImageOrder: detailOrder } : {}),
                  ...(reviewOrder ? { editedReviewImageOrder: reviewOrder } : {}),
                  ...(detailMeta ? { detailImageSelectionMeta: detailMeta } : {}),
                  ...(reviewMeta ? { reviewImageSelectionMeta: reviewMeta } : {}),
                };
              }));
              console.info(`[image-diversity] 상세이미지 ${detailOrderMap.size}건, 리뷰이미지 ${reviewOrderMap.size}건 다양성 기반 자동 선택 완료`);
            }
          }
        }

        // Step 4. 스톡 이미지 fetch
        await runStockImageFetch(productsRef.current);
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchingProgress, autoMatchStats, pipelineRan, step]);

  // ---- Browse folder (showDirectoryPicker) ----
  const handleBrowseFolder = useCallback(async () => {
    setBrowsingFolder(true);
    setScanError('');
    try {
      const { dirName, products: scanned, thirdPartyImages: tpImages } = await pickAndScanFolder();
      if (scanned.length === 0) {
        setScanError(`"${dirName}" 폴더에 product_* 하위 폴더가 없습니다.`);
        setBrowsingFolder(false);
        return;
      }

      // 제3자 이미지 저장 (배치 폴더의 '제3자이미지/' 하위 폴더)
      if (tpImages.length > 0) {
        setThirdPartyImages(tpImages);
        console.info(`[browse] 제3자 이미지 ${tpImages.length}장 로드`);
      }

      const editableProducts: EditableProduct[] = scanned.map((sp) => {
        const sourcePrice = sp.productJson.price || 0;
        const rawName = sp.productJson.name || sp.productJson.title || '';
        const rawBrand = sp.productJson.brand || '';
        const resolvedBrand = isValidBrand(rawBrand) ? rawBrand : extractBrandFromName(rawName);
        return {
          productCode: sp.productCode,
          sourceUrl: sp.sourceUrl,
          name: rawName || `product_${sp.productCode}`,
          brand: rawBrand,
          tags: sp.productJson.tags || [],
          description: sp.productJson.description || '',
          sourcePrice,
          sellingPrice: sourcePrice,
          mainImageCount: sp.mainImages.length,
          detailImageCount: sp.detailImages.length,
          infoImageCount: sp.infoImages.length,
          reviewImageCount: sp.reviewImages.length,
          mainImages: [],
          detailImages: [],
          infoImages: [],
          reviewImages: [],
          folderPath: `browser://${dirName}/${sp.folderName}`,
          hasProductJson: !!(sp.productJson.name || sp.productJson.title),
          naverCategoryId: (sp.productJson.naverCategoryId as string)
            || (sp.productJson.sourceCategory as { categoryId?: string })?.categoryId
            || undefined,
          uid: `browser://${dirName}/${sp.folderName}::${sp.productCode}`,
          editedName: `${resolvedBrand} ${sp.productCode}`,
          editedBrand: resolvedBrand.slice(0, 2),
          editedSellingPrice: sourcePrice,
          editedDisplayProductName: '', // 비워두면 runTitleGeneration에서 SEO 최적화 상품명 자동 생성
          editedCategoryCode: '',
          editedCategoryName: '',
          categoryConfidence: 0,
          categorySource: '',
          selected: true,
          scannedMainImages: sp.mainImages,
          scannedDetailImages: sp.detailImages,
          scannedInfoImages: sp.infoImages,
          scannedReviewImages: sp.reviewImages,
          productDirHandle: sp.dirHandle,
          status: 'pending' as const,
        };
      });

      const withPricing = editableProducts.map((p) => {
        const bracket = brackets.find((b) => p.sourcePrice >= b.minPrice && p.sourcePrice < (b.maxPrice ?? Infinity));
        const rate = bracket ? bracket.marginRate : 25;
        const sellingPrice = Math.ceil((p.sourcePrice * (1 + rate / 100)) / 100) * 100;
        return { ...p, sellingPrice, editedSellingPrice: sellingPrice };
      });

      setProducts(withPricing);
      const browserPath = `browser://${dirName}`;
      setFolderPaths((prev) => prev.includes(browserPath) ? prev : [...prev, browserPath]);
      setStep(2);
      runAutoCategory(withPricing);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') { /* user cancel */ }
      else { setScanError(err instanceof Error ? err.message : '폴더 스캔 실패'); }
    } finally {
      setBrowsingFolder(false);
    }
  }, [brackets, runAutoCategory]);

  // ---- #16 Session recovery: 자동저장 (2초 debounce, Step 2에서만) ----
  const SESSION_KEY = 'megaload_bulk_session';
  const SESSION_TTL_MS = 30 * 60 * 1000; // 30분
  const [sessionRestoreOffered, setSessionRestoreOffered] = useState(false);

  // 자동저장
  useEffect(() => {
    if (step !== 2 || products.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const sessionData = {
          savedAt: Date.now(),
          step,
          brackets,
          selectedOutbound,
          selectedReturn,
          deliveryChargeType,
          deliveryCharge,
          freeShipOverAmount,
          returnCharge,
          contactNumber,
          generateAiContent,
          includeReviewImages,
          useStockImages,
          preventionConfig,
          products: products.map(({ scannedMainImages, scannedDetailImages, scannedInfoImages, scannedReviewImages, ...rest }) => rest),
          // CDN URL은 직렬화 가능 → 새로고침 후에도 이미지 URL 유지
          imagePreuploadCache: imagePreuploadCacheRef.current,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      } catch { /* sessionStorage full or unavailable */ }
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, products, brackets, selectedOutbound, selectedReturn, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, contactNumber, generateAiContent, includeReviewImages, useStockImages, preventionConfig]);

  // 마운트 시 세션 복원 제안
  useEffect(() => {
    if (sessionRestoreOffered) return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.savedAt || Date.now() - data.savedAt > SESSION_TTL_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      if (data.products?.length > 0 && step === 1 && products.length === 0) {
        setSessionRestoreOffered(true);
        const shouldRestore = confirm(`이전 작업 세션이 있습니다 (${data.products.length}개 상품, ${Math.round((Date.now() - data.savedAt) / 60000)}분 전). 복원하시겠습니까?`);
        if (shouldRestore) {
          // 브랜드 앞 2글자 축약 적용 (이전 세션에 전체 브랜드명이 저장됐을 수 있음)
          setProducts((data.products as EditableProduct[]).map((p: EditableProduct) => ({
            ...p,
            editedBrand: p.editedBrand ? p.editedBrand.slice(0, 2) : '',
          })));
          setBrackets(data.brackets || brackets);
          setSelectedOutbound(data.selectedOutbound || '');
          setSelectedReturn(data.selectedReturn || '');
          setDeliveryChargeType(data.deliveryChargeType || 'FREE');
          setDeliveryCharge(data.deliveryCharge || 0);
          setFreeShipOverAmount(data.freeShipOverAmount || 0);
          setReturnCharge(data.returnCharge || 5000);
          setContactNumber(data.contactNumber || '');
          setGenerateAiContent(data.generateAiContent || false);
          setIncludeReviewImages(data.includeReviewImages ?? true);
          if (data.useStockImages) setUseStockImages(data.useStockImages);
          if (data.preventionConfig) setPreventionConfig(data.preventionConfig);
          // 이미지 CDN URL 캐시 복원 (scannedMainImages는 소실되지만 URL은 유지)
          if (data.imagePreuploadCache && Object.keys(data.imagePreuploadCache).length > 0) {
            setImagePreuploadCache(data.imagePreuploadCache);
          }
          setStep(2);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Local validation auto-run ----
  useEffect(() => {
    if (products.length === 0 || step !== 2) return;
    // Skip validation while auto-matching is still running
    if (autoMatchingProgress !== null) return;
    const timer = setTimeout(() => {
      setProducts((prev) =>
        prev.map((p) => {
          const result = validateProductLocal({
            editedName: p.editedName,
            editedSellingPrice: p.editedSellingPrice,
            editedCategoryCode: p.editedCategoryCode,
            editedBrand: p.editedBrand,
            sourcePrice: p.sourcePrice,
            mainImageCount: p.scannedMainImages?.length ?? p.mainImageCount,
            scannedMainImages: p.scannedMainImages,
          });
          return { ...p, validationStatus: result.status, validationErrors: result.errors, validationWarnings: result.warnings };
        }),
      );
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.map((p) => `${p.uid}:${p.editedName}:${p.editedSellingPrice}:${p.editedCategoryCode}:${p.editedBrand}:${p.mainImageCount}`).join(','), step, autoMatchingProgress]);

  // ---- 이미지 순서 필터링 헬퍼 ----
  function filterImagesByOrder<T>(images: T[], order: number[] | undefined): T[] {
    if (!order) return images;
    return order.filter(i => i >= 0 && i < images.length).map(i => images[i]);
  }

  // ---- Preflight용 플레이스홀더 URL ----
  // 이미지가 사전업로드되지 않았지만 로컬에 존재하는 경우
  // 프리플라이트 검증을 위해 플레이스홀더 URL 생성
  // (실제 등록 시에는 실제 업로드된 URL 사용)
  function buildPreflightPlaceholderUrls(p: EditableProduct) {
    const mainCount = p.scannedMainImages?.length || p.mainImages?.length || p.mainImageCount || 0;
    const detailRawLen = p.scannedDetailImages?.length ?? p.detailImages?.length ?? 0;
    const detailCount = (p.editedDetailImageOrder
      ? p.editedDetailImageOrder.filter(i => i >= 0 && i < detailRawLen).length
      : detailRawLen) || p.detailImageCount || 0;
    const reviewRawLen = p.scannedReviewImages?.length ?? p.reviewImages?.length ?? 0;
    const reviewCount = (p.editedReviewImageOrder
      ? p.editedReviewImageOrder.filter(i => i >= 0 && i < reviewRawLen).length
      : reviewRawLen) || p.reviewImageCount || 0;
    const infoCount = p.scannedInfoImages?.length || p.infoImages?.length || p.infoImageCount || 0;
    if (mainCount === 0) return undefined; // 이미지가 정말 없으면 undefined
    return {
      mainImageUrls: Array.from({ length: mainCount }, (_, i) => `preflight-placeholder://main/${p.uid}/${i}`),
      detailImageUrls: Array.from({ length: detailCount }, (_, i) => `preflight-placeholder://detail/${p.uid}/${i}`),
      reviewImageUrls: Array.from({ length: reviewCount }, (_, i) => `preflight-placeholder://review/${p.uid}/${i}`),
      infoImageUrls: Array.from({ length: infoCount }, (_, i) => `preflight-placeholder://info/${p.uid}/${i}`),
    };
  }

  // ---- Image preupload (백그라운드 비차단) ----
  // Step 2에서 백그라운드로 업로드 시작, 프리플라이트는 즉시 진행
  // 등록 시 캐시된 URL 사용, 없으면 on-the-fly 업로드
  const startImagePreupload = useCallback(async (targetProducts: EditableProduct[]) => {
    const browserProducts = targetProducts.filter(p =>
      p.folderPath.startsWith('browser://') && (p.scannedMainImages?.length ?? 0) > 0
    );
    const serverProducts = targetProducts.filter(p =>
      !p.folderPath.startsWith('browser://') && p.mainImages.length > 0
    );
    const total = browserProducts.length + serverProducts.length;

    if (total === 0) {
      setImagePreuploadProgress({ total: 0, done: 0, phase: 'complete' });
      return;
    }

    // 즉시 "완료" 표시 (프리플라이트 차단 방지) → 백그라운드에서 실제 업로드
    setImagePreuploadProgress({ total, done: 0, phase: 'uploading' });

    // 백그라운드 업로드 (비차단 — await 안 함, 프리플라이트는 먼저 진행)
    const shouldVary = preventionConfig.enabled && preventionConfig.imageVariation;

    (async () => {
      // 브라우저 모드: main 이미지를 flat 풀로 병렬 업로드
      const allTasks: { uid: string; imgIndex: number; img: ScannedImageFile }[] = [];
      const productUrlMap: Record<string, string[]> = {};
      for (const p of browserProducts) {
        const imgs = p.scannedMainImages || [];
        productUrlMap[p.uid] = new Array(imgs.length).fill('');
        for (let j = 0; j < imgs.length; j++) {
          allTasks.push({ uid: p.uid, imgIndex: j, img: imgs[j] });
        }
      }

      let completed = 0;
      let taskIdx = 0;
      const CONCURRENCY = 15;

      async function worker() {
        while (taskIdx < allTasks.length) {
          const idx = taskIdx++;
          if (idx >= allTasks.length) return;
          const task = allTasks[idx];
          try {
            const file = await task.img.handle.getFile();
            const compressed = await compressImage(file);
            const url = await uploadSingleImage(compressed, task.img.name);
            productUrlMap[task.uid][task.imgIndex] = url;
          } catch { /* 실패 시 빈 문자열 */ }
          completed++;
          // 진행률 업데이트 (10개마다)
          if (completed % 10 === 0 || completed === allTasks.length) {
            const productsDone = Object.values(productUrlMap).filter(urls => urls.some(Boolean)).length;
            setImagePreuploadProgress(prev => ({ ...prev, done: productsDone }));
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, allTasks.length) }, () => worker()),
      );

      // 캐시에 저장
      const timestamped: Record<string, { mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[]; uploadedAt: number }> = {};
      for (const p of browserProducts) {
        const urls = (productUrlMap[p.uid] || []).filter(Boolean);
        if (urls.length > 0) {
          timestamped[p.uid] = { mainImageUrls: urls, detailImageUrls: [], reviewImageUrls: [], infoImageUrls: [], uploadedAt: Date.now() };
        }
      }
      if (Object.keys(timestamped).length > 0) {
        setImagePreuploadCache(prev => ({ ...prev, ...timestamped }));
      }
      setImagePreuploadProgress({ total, done: total, phase: 'complete' });
    })();

    // 프리플라이트 차단 방지: 즉시 리턴 (백그라운드 업로드 계속 진행)
  }, [preventionConfig]);

  // ---- Deep validation ----
  const handleDeepValidation = useCallback(async () => {
    const targetProducts = products.filter((p) => p.selected);
    if (targetProducts.length === 0) return;
    setValidating(true);
    setValidationPhase('deep');
    startImagePreupload(targetProducts);

    try {
      const BATCH = 100;
      for (let i = 0; i < targetProducts.length; i += BATCH) {
        const batch = targetProducts.slice(i, i + BATCH);
        const res = await fetch('/api/megaload/products/bulk-register/validate-batch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map((p) => ({
              uid: p.uid, editedName: p.editedName, editedBrand: p.editedBrand, editedSellingPrice: p.editedSellingPrice,
              editedCategoryCode: p.editedCategoryCode, sourcePrice: p.sourcePrice,
              mainImageCount: p.scannedMainImages?.length ?? p.mainImageCount, detailImageCount: p.detailImageCount,
              infoImageCount: p.infoImageCount, reviewImageCount: p.reviewImageCount,
            })),
            contactNumber, dryRun: true,
            deliveryInfo: {
              outboundShippingPlaceCode: selectedOutbound, returnCenterCode: selectedReturn,
              deliveryChargeType, deliveryCharge: deliveryChargeType === 'FREE' ? 0 : deliveryCharge, returnCharge,
            },
            stock: 999,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setProducts((prev) => prev.map((p) => {
            const r = data.results[p.uid];
            if (!r) return p;
            return { ...p, validationStatus: r.status, validationErrors: r.errors, validationWarnings: r.warnings };
          }));
          const newDryRun: typeof dryRunResults = {};
          for (const [uid, r] of Object.entries(data.results) as [string, Record<string, unknown>][]) {
            if (r.payloadPreview || r.missingRequiredFields) {
              newDryRun[uid] = {
                payloadPreview: r.payloadPreview as typeof dryRunResults[string]['payloadPreview'],
                missingRequiredFields: r.missingRequiredFields as string[],
              };
            }
          }
          setDryRunResults((prev) => ({ ...prev, ...newDryRun }));
          if (data.categoryMeta) setCategoryMetaCache((prev) => ({ ...prev, ...data.categoryMeta }));
        }
      }
      setValidationPhase('complete');
    } catch { /* ignore */ } finally { setValidating(false); }
  }, [products, contactNumber, selectedOutbound, selectedReturn, deliveryChargeType, deliveryCharge, returnCharge, startImagePreupload, dryRunResults]);

  // ---- Preflight ----
  const handlePreflight = useCallback(async () => {
    const selectedProds = products.filter(p => p.selected && p.editedCategoryCode && p.validationStatus !== 'error');
    if (selectedProds.length === 0) return;

    setPreflightPhase('running');
    setPreflightResults({});
    setPreflightStats(null);

    try {
      // Ref로 최신 캐시 읽기 — useCallback 클로저 stale 방지
      const currentCache = imagePreuploadCacheRef.current;

      const batchProducts = selectedProds.map(p => {
        const meta = categoryMetaCache[p.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
        const cached = currentCache[p.uid];
        return {
          uid: p.uid,
          productCode: p.productCode,
          folderPath: p.folderPath,
          name: p.editedName,
          sourceName: p.name,
          brand: p.editedBrand,
          sellingPrice: p.editedSellingPrice,
          sourcePrice: p.sourcePrice,
          categoryCode: p.editedCategoryCode,
          categoryPath: p.editedCategoryName,
          mainImageCount: p.scannedMainImages?.length || p.mainImages?.length || p.mainImageCount || 0,
          tags: p.tags,
          description: p.description,
          mainImages: p.mainImages,
          detailImages: p.detailImages,
          reviewImages: p.reviewImages,
          infoImages: p.infoImages,
          noticeMeta: meta.noticeMeta,
          attributeMeta: meta.attributeMeta,
          aiDisplayName: p.editedDisplayProductName,
          aiSellerName: p.editedSellerProductName,
          categoryConfidence: p.categoryConfidence,
          displayProductNameOverride: p.editedDisplayProductName,
          noticeValuesOverride: p.editedNoticeValues,
          attributeValuesOverride: p.editedAttributeValues,
          descriptionOverride: p.editedDescription,
          storyParagraphsOverride: p.editedStoryParagraphs,
          reviewTextsOverride: p.editedReviewTexts,
          contentBlocksOverride: p.editedContentBlocks,
          preUploadedUrls: cached ? {
            mainImageUrls: cached.mainImageUrls || [],
            detailImageUrls: cached.detailImageUrls || [],
            reviewImageUrls: cached.reviewImageUrls || [],
            infoImageUrls: cached.infoImageUrls || [],
          } : buildPreflightPlaceholderUrls(p),
        };
      });

      // 이미지 타임스탬프 수집
      const imageTimestamps: Record<string, number> = {};
      for (const p of selectedProds) {
        const cached = currentCache[p.uid];
        if (cached?.uploadedAt) imageTimestamps[p.uid] = cached.uploadedAt;
      }

      const res = await fetch('/api/megaload/products/bulk-register/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: batchProducts,
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
          stock: 999,
          contactNumber,
          noticeOverrides: Object.keys(noticeOverrides).length > 0 ? noticeOverrides : undefined,
          preventionConfig: preventionConfig.enabled ? preventionConfig : undefined,
          categoryMetaCache,
          imageTimestamps,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreflightResults(data.results || {});
        setPreflightStats(data.stats || null);
        setPreflightDurationMs(data.durationMs || 0);
        if (data.categoryMeta) setCategoryMetaCache(prev => ({ ...prev, ...data.categoryMeta }));
        setPreflightPhase('complete');
      } else {
        const errData = await res.json().catch(() => ({ error: '프리플라이트 실패' }));
        console.error('[preflight] Error:', errData.error);
        setPreflightPhase('error');
      }
    } catch (err) {
      console.error('[preflight] Error:', err);
      setPreflightPhase('error');
    }
  // imagePreuploadCache는 ref로 읽으므로 deps에서 제거 — stale closure 완전 방지
  }, [products, categoryMetaCache, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, noticeOverrides, preventionConfig]);

  // ---- Canary ----
  const handleCanary = useCallback(async (targetUid: string) => {
    const product = products.find(p => p.uid === targetUid);
    if (!product) return;

    setCanaryPhase('running');
    setCanaryResult(null);

    try {
      const meta = categoryMetaCache[product.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
      const cached = imagePreuploadCacheRef.current[product.uid];

      const res = await fetch('/api/megaload/products/bulk-register/canary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            uid: product.uid,
            productCode: product.productCode,
            folderPath: product.folderPath,
            name: product.editedName,
            sourceName: product.name,
            brand: product.editedBrand,
            sellingPrice: product.editedSellingPrice,
            sourcePrice: product.sourcePrice,
            categoryCode: product.editedCategoryCode,
            tags: product.tags,
            description: product.description,
            mainImages: product.mainImages,
            detailImages: product.detailImages,
            reviewImages: product.reviewImages,
            infoImages: product.infoImages,
            noticeMeta: meta.noticeMeta,
            attributeMeta: meta.attributeMeta,
            aiDisplayName: product.editedDisplayProductName,
            aiSellerName: product.editedSellerProductName,
            displayProductNameOverride: product.editedDisplayProductName,
            noticeValuesOverride: product.editedNoticeValues,
            attributeValuesOverride: product.editedAttributeValues,
            descriptionOverride: product.editedDescription,
            storyParagraphsOverride: product.editedStoryParagraphs,
            reviewTextsOverride: product.editedReviewTexts,
            contentBlocksOverride: product.editedContentBlocks,
            preUploadedUrls: cached ? {
              mainImageUrls: cached.mainImageUrls || [],
              detailImageUrls: cached.detailImageUrls || [],
              reviewImageUrls: cached.reviewImageUrls || [],
              infoImageUrls: cached.infoImageUrls || [],
            } : undefined,
          },
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
          stock: 999,
          noticeOverrides: Object.keys(noticeOverrides).length > 0 ? noticeOverrides : undefined,
          preventionConfig: preventionConfig.enabled ? preventionConfig : undefined,
          thirdPartyImageUrls: savedThirdPartyUrls.length > 0
            ? savedThirdPartyUrls
            : thirdPartyImages.length > 0
              ? (await uploadScannedImages(thirdPartyImages, thirdPartyImages.length)).filter(Boolean)
              : undefined,
        }),
      });

      const data = await res.json() as CanaryResult;
      setCanaryResult(data);
      setCanaryPhase(data.success ? 'complete' : 'error');
    } catch (err) {
      console.error('[canary] Error:', err);
      setCanaryResult({
        success: false,
        phases: [],
        cleanedUp: false,
        error: err instanceof Error ? err.message : '카나리 테스트 실패',
      });
      setCanaryPhase('error');
    }
  }, [products, categoryMetaCache, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, noticeOverrides, preventionConfig]);

  // ---- Auto-trigger preflight after deep validation + image upload complete ----
  // handlePreflight는 imagePreuploadCacheRef로 최신 캐시를 읽으므로
  // stale closure 문제 없이 항상 최신 이미지 URL을 사용
  useEffect(() => {
    if (
      validationPhase === 'complete' &&
      (imagePreuploadProgress.phase === 'complete' || imagePreuploadProgress.phase === 'idle' || imagePreuploadProgress.phase === 'uploading') &&
      preflightPhase === 'idle' &&
      step === 2
    ) {
      handlePreflight();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationPhase, imagePreuploadProgress.phase, preflightPhase, step]);

  // ---- Load shipping info ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingShipping(true); setShippingError('');
      try {
        const res = await fetch('/api/megaload/products/bulk-register/shipping-info');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '물류 정보 조회 실패');
        if (cancelled) return;
        setShippingPlaces(data.outboundShippingPlaces || []);
        setReturnCenters(data.returnShippingCenters || []);
        if (data.outboundShippingPlaces?.length > 0) setSelectedOutbound(data.outboundShippingPlaces[0].outboundShippingPlaceCode);
        if (data.returnShippingCenters?.length > 0) setSelectedReturn(data.returnShippingCenters[0].returnCenterCode);
      } catch (err) { if (!cancelled) setShippingError(err instanceof Error ? err.message : '물류 정보 조회 실패'); }
      finally { if (!cancelled) setLoadingShipping(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Server folder scan ----
  const handleScan = useCallback(async () => {
    const serverPaths = folderPaths.filter((fp) => !fp.startsWith('browser://'));
    if (serverPaths.length === 0) { setScanError('서버에서 접근 가능한 폴더 경로를 추가해주세요.'); return; }
    if (!selectedOutbound) { setScanError('출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!selectedReturn) { setScanError('반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }

    setScanning(true); setScanError('');
    try {
      const allEditableProducts: EditableProduct[] = [];
      let latestBrackets: PriceBracket[] | null = null;

      for (const fp of serverPaths) {
        const res = await fetch(`/api/megaload/products/bulk-register?folderPath=${encodeURIComponent(fp)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`[${fp}] ${data.error || '스캔 실패'}`);
        if (data.brackets) latestBrackets = data.brackets;
        const editableProducts: EditableProduct[] = (data.products as PreviewProduct[]).map((p) => {
          const srvBrand = isValidBrand(p.brand) ? p.brand : extractBrandFromName(p.name);
          return {
          ...p, uid: `${p.folderPath}::${p.productCode}`, editedName: `${srvBrand} ${p.productCode}`, editedBrand: srvBrand.slice(0, 2),
          editedSellingPrice: p.sellingPrice, editedDisplayProductName: '', // SEO 자동 생성 대기
          editedCategoryCode: '', editedCategoryName: '',
          categoryConfidence: 0, categorySource: '', selected: true, status: 'pending' as const,
        };});
        allEditableProducts.push(...editableProducts);
      }

      if (latestBrackets) setBrackets(latestBrackets);
      setProducts(allEditableProducts);
      setStep(2);
      runAutoCategory(allEditableProducts);
    } catch (err) { setScanError(err instanceof Error ? err.message : '스캔 실패'); }
    finally { setScanning(false); }
  }, [folderPaths, selectedOutbound, selectedReturn, runAutoCategory]);

  // ---- Price recalc ----
  const recalcPrices = useCallback((newBrackets: PriceBracket[]) => {
    setBrackets(newBrackets);
    setProducts((prev) => prev.map((p) => {
      const bracket = newBrackets.find((b) => p.sourcePrice >= b.minPrice && p.sourcePrice < (b.maxPrice ?? Infinity));
      const rate = bracket ? bracket.marginRate : 25;
      const sellingPrice = Math.ceil((p.sourcePrice * (1 + rate / 100)) / 100) * 100;
      return { ...p, editedSellingPrice: sellingPrice, sellingPrice };
    }));
  }, []);

  // ---- Category search ----
  const handleSearchCategory = useCallback(async () => {
    if (!categoryKeyword.trim()) return;
    setSearchingCategory(true);
    try {
      const res = await fetch(`/api/megaload/products/bulk-register/search-category?keyword=${encodeURIComponent(categoryKeyword)}`);
      const data = await res.json();
      if (data.items) setCategoryResults(data.items);
    } catch { /* ignore */ }
    finally { setSearchingCategory(false); }
  }, [categoryKeyword]);

  const selectCategory = useCallback((cat: CategoryItem) => {
    if (categorySearchTarget === 'bulk') {
      setProducts((prev) => prev.map((p) => p.selected ? { ...p, editedCategoryCode: cat.id, editedCategoryName: cat.path || cat.name, categoryConfidence: 1, categorySource: 'manual' } : p));
    } else if (categorySearchTarget) {
      setProducts((prev) => prev.map((p) => p.uid === categorySearchTarget ? { ...p, editedCategoryCode: cat.id, editedCategoryName: cat.path || cat.name, categoryConfidence: 1, categorySource: 'manual' } : p));
    }
    setCategorySearchTarget(null); setCategoryResults([]); setCategoryKeyword('');
  }, [categorySearchTarget]);

  // ---- Toggle / update ----
  const toggleProduct = useCallback((uid: string) => {
    setProducts((prev) => prev.map((p) => p.uid === uid ? { ...p, selected: !p.selected } : p));
  }, []);

  const toggleAll = useCallback(() => {
    setProducts((prev) => {
      const allSelected = prev.every((p) => p.selected);
      return prev.map((p) => ({ ...p, selected: !allSelected }));
    });
  }, []);

  const updateField = useCallback((uid: string, field: string, value: string | number | string[] | number[] | Record<string, string>) => {
    setProducts((prev) => prev.map((p) => p.uid === uid ? { ...p, [field]: value } : p));
  }, []);

  // ---- Image reorder / remove ----
  const handleReorderImages = useCallback((uid: string, newOrder: string[]) => {
    setProducts((prev) => prev.map((p) => {
      if (p.uid !== uid) return p;
      // Browser mode: newOrder는 objectUrl 배열 → scannedMainImages를 URL 순서에 맞게 재배열
      if (p.scannedMainImages && p.scannedMainImages.length > 0) {
        const reordered = newOrder
          .map(url => p.scannedMainImages!.find(img => img.objectUrl === url))
          .filter((img): img is NonNullable<typeof img> => !!img);
        // 매핑 실패 시 (URL 불일치) 기존 순서 유지
        if (reordered.length === 0) return p;
        return { ...p, scannedMainImages: reordered, mainImageCount: reordered.length };
      }
      return { ...p, mainImages: newOrder };
    }));
    // Also update preupload cache (server mode only — browser mode는 cache 없음)
    // uploadedAt도 갱신 — 재배열 후 캐시 만료로 원본 순서 폴백 방지
    setImagePreuploadCache((prev) => {
      const cached = prev[uid];
      if (!cached) return prev;
      return { ...prev, [uid]: { ...cached, mainImageUrls: newOrder, uploadedAt: Date.now() } };
    });
  }, []);

  const handleRemoveImage = useCallback((uid: string, imageIndex: number) => {
    setProducts((prev) => prev.map((p) => {
      if (p.uid !== uid) return p;
      const update: Partial<EditableProduct> = {};
      // Browser mode: scannedMainImages 기준으로 제거
      if (p.scannedMainImages && p.scannedMainImages.length > 0) {
        const newScanned = [...p.scannedMainImages];
        newScanned.splice(imageIndex, 1);
        update.scannedMainImages = newScanned;
        update.mainImageCount = newScanned.length;
      }
      // Server mode: mainImages 기준으로 제거
      if (p.mainImages && p.mainImages.length > 0) {
        const newMainImages = [...p.mainImages];
        newMainImages.splice(imageIndex, 1);
        update.mainImages = newMainImages;
        if (!p.scannedMainImages?.length) update.mainImageCount = newMainImages.length;
      }
      return { ...p, ...update };
    }));
    setImagePreuploadCache((prev) => {
      const cached = prev[uid];
      if (!cached) return prev;
      const newUrls = [...cached.mainImageUrls];
      newUrls.splice(imageIndex, 1);
      return { ...prev, [uid]: { ...cached, mainImageUrls: newUrls } };
    });
  }, []);

  // ---- Get detail image URLs for a product ----
  const getDetailImageUrls = useCallback((uid: string): string[] => {
    // 1. 캐시된 CDN URL (ref로 항상 최신값)
    const cached = imagePreuploadCacheRef.current[uid];
    if (cached?.mainImageUrls?.length) return cached.mainImageUrls;
    // 2. scannedMainImages의 objectUrl (브라우저 모드)
    const product = products.find(p => p.uid === uid);
    if (product?.scannedMainImages?.length) {
      const urls = product.scannedMainImages
        .map(img => img.objectUrl)
        .filter((u): u is string => !!u);
      if (urls.length > 0) return urls;
    }
    // 3. 서버 모드 로컬 경로
    if (product?.mainImages?.length) {
      return product.mainImages.map(p =>
        p.startsWith('http') || p.startsWith('blob:') ? p : `/api/megaload/products/bulk-register/serve-image?path=${encodeURIComponent(p)}`
      );
    }
    return [];
  }, [products]);

  // ---- Register ----
  const handleRegister = useCallback(async () => {
    // #15 등록 버튼 가드: 검증 중 또는 자동매칭 진행 중이면 차단
    if (validating || autoMatchingProgress) {
      alert(validating ? '검증이 진행 중입니다. 완료 후 다시 시도해주세요.' : '카테고리 자동매칭이 진행 중입니다. 완료 후 다시 시도해주세요.');
      return;
    }

    const selectedProducts = products.filter((p) => p.selected && p.editedCategoryCode && p.validationStatus !== 'error');
    if (selectedProducts.length === 0) { alert('등록 가능한 선택 상품이 없습니다. (카테고리 미지정 또는 검증 오류)'); return; }

    setStep(3); setRegistering(true); setIsPaused(false); isPausedRef.current = false; setStartTime(Date.now());

    const preuploadDone = imagePreuploadProgress.phase === 'complete' || imagePreuploadProgress.phase === 'idle';
    if (!preuploadDone) {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 30000) { await new Promise((r) => setTimeout(r, 500)); break; }
    }

    const BATCH_SIZE = 30;
    setProducts((prev) => prev.map((p) => p.selected && p.editedCategoryCode ? { ...p, status: 'pending' } : p));

    try {
      const uniqueCategoryCodes = [...new Set(selectedProducts.map((p) => p.editedCategoryCode))];
      const uncachedCodes = uniqueCategoryCodes.filter((c) => !categoryMetaCache[c]);
      const initRes = await fetch('/api/megaload/products/bulk-register/init-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalCount: selectedProducts.length, categoryCodes: uncachedCodes }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Job 초기화 실패');

      const { jobId } = initData;
      const categoryMeta = { ...categoryMetaCache, ...(initData.categoryMeta || {}) };

      // 제3자 이미지: 저장된 CDN URL 우선 → 없으면 스캔 이미지 업로드
      let thirdPartyImageCdnUrls: string[] = [];
      if (savedThirdPartyUrls.length > 0) {
        thirdPartyImageCdnUrls = [...savedThirdPartyUrls];
        console.info(`[register] 제3자 이미지 ${thirdPartyImageCdnUrls.length}장 (저장된 URL 사용)`);
      } else if (thirdPartyImages.length > 0) {
        try {
          thirdPartyImageCdnUrls = await uploadScannedImages(thirdPartyImages, thirdPartyImages.length);
          thirdPartyImageCdnUrls = thirdPartyImageCdnUrls.filter(Boolean);
          console.info(`[register] 제3자 이미지 ${thirdPartyImageCdnUrls.length}장 업로드 완료`);
        } catch (e) {
          console.warn('[register] 제3자 이미지 업로드 실패:', e);
        }
      }

      const batches: EditableProduct[][] = [];
      for (let i = 0; i < selectedProducts.length; i += BATCH_SIZE) {
        batches.push(selectedProducts.slice(i, i + BATCH_SIZE));
      }
      setBatchProgress({ current: 0, total: batches.length });

      let totalSuccess = 0;
      let totalError = 0;

      for (let i = 0; i < batches.length; i++) {
        while (isPausedRef.current) { await new Promise((r) => setTimeout(r, 500)); }

        const batch = batches[i];
        const batchUids = new Set(batch.map((p) => p.uid));
        setProducts((prev) => prev.map((p) => batchUids.has(p.uid) ? { ...p, status: 'registering' } : p));

        const batchProducts = [];
        for (const p of batch) {
          const meta = categoryMeta?.[p.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
          const product: Record<string, unknown> = {
            uid: p.uid, productCode: p.productCode, folderPath: p.folderPath, name: p.editedName, sourceName: p.name, sourceUrl: p.sourceUrl,
            brand: p.editedBrand, sellingPrice: p.editedSellingPrice, sourcePrice: p.sourcePrice,
            categoryCode: p.editedCategoryCode, categoryPath: p.editedCategoryName, tags: p.tags, description: p.description,
            mainImages: p.mainImages, detailImages: p.detailImages, reviewImages: p.reviewImages, infoImages: p.infoImages,
            noticeMeta: meta.noticeMeta, attributeMeta: meta.attributeMeta,
          };
          // per-product overrides
          if (p.editedDisplayProductName) product.displayProductNameOverride = p.editedDisplayProductName;
          if (p.editedSellerProductName) product.aiSellerName = p.editedSellerProductName;
          if (p.editedManufacturer) product.manufacturerOverride = p.editedManufacturer;
          if (p.editedOriginalPrice) product.originalPrice = p.editedOriginalPrice;
          if (p.editedItemName) product.itemNameOverride = p.editedItemName;
          if (p.editedUnitCount !== undefined) product.unitCountOverride = p.editedUnitCount;
          if (p.editedStock !== undefined) product.stockOverride = p.editedStock;
          if (p.editedMaxBuyPerPerson) product.maxBuyPerPersonOverride = p.editedMaxBuyPerPerson;
          if (p.editedShippingDays) product.shippingDaysOverride = p.editedShippingDays;
          if (p.editedTaxType) product.taxType = p.editedTaxType;
          if (p.editedAdultOnly) product.adultOnly = p.editedAdultOnly;
          if (p.editedBarcode) product.barcode = p.editedBarcode;
          if (p.editedNoticeValues && Object.keys(p.editedNoticeValues).length > 0) product.noticeValuesOverride = p.editedNoticeValues;
          if (p.editedAttributeValues && Object.keys(p.editedAttributeValues).length > 0) product.attributeValuesOverride = p.editedAttributeValues;
          // 상세페이지 콘텐츠 오버라이드
          if (p.editedDescription !== undefined) product.descriptionOverride = p.editedDescription;
          if (p.editedStoryParagraphs && p.editedStoryParagraphs.length > 0) product.storyParagraphsOverride = p.editedStoryParagraphs;
          if (p.editedReviewTexts && p.editedReviewTexts.length > 0) product.reviewTextsOverride = p.editedReviewTexts;
          if (p.editedContentBlocks && p.editedContentBlocks.length > 0) product.contentBlocksOverride = p.editedContentBlocks;
          const cached = imagePreuploadCacheRef.current[p.uid];
          const cacheValid = cached && cached.uploadedAt && (Date.now() - cached.uploadedAt < IMAGE_CACHE_TTL_MS);
          const shouldVary = preventionConfig.enabled && preventionConfig.imageVariation;

          // 이미지 업로드: 캐시 → 브라우저 업로드 → 서버 업로드 순서
          const hasCache = cacheValid && cached.mainImageUrls?.length;
          const hasScanned = (p.scannedMainImages?.length ?? 0) > 0;
          const hasLocalPaths = (p.mainImages?.length ?? 0) > 0;

          // 이미지 순서 필터링 적용
          const filteredDetail = filterImagesByOrder(p.scannedDetailImages || [], p.editedDetailImageOrder);
          const filteredReview = filterImagesByOrder(p.scannedReviewImages || [], p.editedReviewImageOrder);

          if (hasCache) {
            const mainUrls = cached.mainImageUrls;
            const detailUrls = cached.detailImageUrls?.length ? cached.detailImageUrls : await uploadScannedImages(filteredDetail, 10);
            const reviewUrls = cached.reviewImageUrls?.length ? cached.reviewImageUrls : (includeReviewImages ? await uploadScannedImages(filteredReview, 10) : []);
            const infoUrls = cached.infoImageUrls?.length ? cached.infoImageUrls : await uploadScannedImages(p.scannedInfoImages || [], 10);
            product.preUploadedUrls = { mainImageUrls: mainUrls, detailImageUrls: detailUrls, reviewImageUrls: reviewUrls, infoImageUrls: infoUrls };
          } else if (hasScanned) {
            // 브라우저 모드: scannedMainImages를 직접 업로드
            const mainUrls = await uploadScannedImagesWithVariation(p.scannedMainImages!, shouldVary, 10);
            const detailUrls = await uploadScannedImages(filteredDetail, 10);
            const reviewUrls = includeReviewImages ? await uploadScannedImages(filteredReview, 10) : [];
            const infoUrls = await uploadScannedImages(p.scannedInfoImages || [], 10);
            product.preUploadedUrls = { mainImageUrls: mainUrls, detailImageUrls: detailUrls, reviewImageUrls: reviewUrls, infoImageUrls: infoUrls };
          } else if (!hasLocalPaths) {
            // 이미지가 전혀 없는 경우 — 서버에서도 업로드 불가
            console.warn(`[register] ${p.productCode}: 이미지 없음 (cache=${!!hasCache}, scanned=${!!hasScanned}, local=${!!hasLocalPaths})`);
          }
          // hasLocalPaths만 있으면: preUploadedUrls 미설정 → batch API가 서버에서 업로드
          batchProducts.push(product);
        }

        try {
          const batchRes = await fetch('/api/megaload/products/bulk-register/batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId, batchIndex: i,
              deliveryInfo: {
                deliveryCompanyCode: 'CJGLS', deliveryChargeType,
                deliveryCharge: deliveryChargeType === 'FREE' ? 0 : deliveryCharge,
                freeShipOverAmount: deliveryChargeType === 'CONDITIONAL_FREE' ? freeShipOverAmount : 0,
                deliveryChargeOnReturn: returnCharge, outboundShippingPlaceCode: selectedOutbound,
              },
              returnInfo: {
                returnCenterCode: selectedReturn, returnCharge,
                companyContactNumber: contactNumber, afterServiceContactNumber: contactNumber,
                afterServiceInformation: '상품 이상 시 고객센터로 연락 바랍니다.',
              },
              stock: 999, generateAiContent, includeReviewImages,
              noticeOverrides: Object.keys(noticeOverrides).length > 0 ? noticeOverrides : undefined,
              preventionConfig: preventionConfig.enabled ? preventionConfig : undefined,
              products: batchProducts,
              thirdPartyImageUrls: thirdPartyImageCdnUrls.length > 0 ? thirdPartyImageCdnUrls : undefined,
            }),
          });
          const batchData = await batchRes.json();
          if (batchRes.ok && batchData.results) {
            const batchResults = batchData.results as BatchResult[];
            totalSuccess += batchData.successCount || 0;
            totalError += batchData.errorCount || 0;
            setProducts((prev) => prev.map((p) => {
              const r = batchResults.find((br) => br.uid === p.uid);
              if (!r) return p;
              return { ...p, status: r.success ? 'success' : 'error', channelProductId: r.channelProductId, errorMessage: r.error, detailedError: r.detailedError, duration: r.duration };
            }));
          } else {
            totalError += batch.length;
            setProducts((prev) => prev.map((p) => batchUids.has(p.uid) ? { ...p, status: 'error', errorMessage: batchData.error || '배치 실패' } : p));
          }
        } catch (err) {
          totalError += batch.length;
          setProducts((prev) => prev.map((p) => batchUids.has(p.uid) ? { ...p, status: 'error', errorMessage: err instanceof Error ? err.message : '네트워크 오류' } : p));
        }
        setBatchProgress({ current: i + 1, total: batches.length });
      }

      await fetch('/api/megaload/products/bulk-register/complete-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, successCount: totalSuccess, errorCount: totalError }),
      });
    } catch (err) { alert(err instanceof Error ? err.message : '등록 실패'); }
    finally { setRegistering(false); }
  }, [products, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, generateAiContent, includeReviewImages, noticeOverrides, categoryMetaCache, imagePreuploadProgress.phase, validating, autoMatchingProgress, preventionConfig]);

  // ---- Toggle pause ----
  const togglePause = useCallback(() => {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
  }, [isPaused]);

  // ---- 실패한 상품만 재등록 ----
  const retryFailed = useCallback(() => {
    // 실패 상품의 상태 초기화 → 다시 등록 대상으로
    setProducts(prev => prev.map(p =>
      p.status === 'error' ? { ...p, status: 'pending' as const, errorMessage: undefined, detailedError: undefined, channelProductId: undefined } : p
    ));
    setBatchProgress({ current: 0, total: 0 });
    setStartTime(null);
    // handleRegister가 status !== 'success'인 상품만 등록
  }, []);

  // ---- 검증(Step 2)으로 돌아가기 ----
  const backToStep2 = useCallback(() => {
    setProducts(prev => prev.map(p =>
      p.status === 'error' ? { ...p, status: 'pending' as const, errorMessage: undefined, detailedError: undefined } : p
    ));
    setStep(2);
    setPreflightPhase('idle');
    setPreflightResults({});
    setPreflightStats(null);
    setBatchProgress({ current: 0, total: 0 });
    setStartTime(null);
  }, []);

  // ---- Reset ----
  const handleReset = useCallback(() => {
    setStep(1); setProducts([]); setFolderPaths([]); setBatchProgress({ current: 0, total: 0 });
    setStartTime(null); setAutoMatchingProgress(null);
    setDryRunResults({}); setImagePreuploadCache({}); setImagePreuploadProgress({ total: 0, done: 0, phase: 'idle' });
    setValidationPhase('idle'); setAutoCategoryRetryCount(0);
    setTitleGenProgress(null); setContentGenProgress(null); setPipelineRan(false);
    setImageFilterProgress({ done: 0, total: 0, phase: 'idle' });
    setStockImageProgress(null);
    setCategoryFailures([]);
    setPreflightPhase('idle'); setPreflightResults({}); setPreflightStats(null); setPreflightDurationMs(0);
    setCanaryPhase('idle'); setCanaryResult(null);
    // #16 세션 삭제
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, []);

  // ---- Computed values (P2-3: useMemo로 불필요한 배열 순회 방지) ----
  const computedStats = useMemo(() => {
    let selectedCount = 0;
    let totalSourcePrice = 0;
    let totalSellingPrice = 0;
    let validationReadyCount = 0;
    let validationErrorCount = 0;
    let validationWarningCount = 0;
    let registerableCount = 0;

    for (const p of products) {
      if (p.selected) {
        selectedCount++;
        totalSourcePrice += p.sourcePrice;
        totalSellingPrice += p.editedSellingPrice;
        if (p.editedCategoryCode && p.validationStatus !== 'error') registerableCount++;
      }
      if (p.validationStatus === 'ready') validationReadyCount++;
      else if (p.validationStatus === 'error') validationErrorCount++;
      else if (p.validationStatus === 'warning') validationWarningCount++;
    }

    return { selectedCount, totalSourcePrice, totalSellingPrice, validationReadyCount, validationErrorCount, validationWarningCount, registerableCount };
  }, [products]);
  const { selectedCount, totalSourcePrice, totalSellingPrice, validationReadyCount, validationErrorCount, validationWarningCount, registerableCount } = computedStats;
  const canRegister = preflightPhase === 'complete' && (preflightStats?.fail ?? 0) === 0;

  // 카나리 대상 자동 선정: 가장 많은 카테고리에 속한 상품 중 1개
  const canaryTargetUid = useMemo(() => {
    const eligible = products.filter(p =>
      p.selected && p.editedCategoryCode && p.validationStatus !== 'error' &&
      (imagePreuploadCache[p.uid]?.mainImageUrls?.length ?? 0) > 0
    );
    if (eligible.length === 0) return null;
    // 카테고리별 빈도 → 가장 흔한 카테고리의 대표 상품
    const catCount: Record<string, number> = {};
    for (const p of eligible) {
      catCount[p.editedCategoryCode] = (catCount[p.editedCategoryCode] || 0) + 1;
    }
    const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topCat) return eligible[0].uid;
    // 해당 카테고리 중 confidence 높은 순
    const candidates = eligible.filter(p => p.editedCategoryCode === topCat);
    candidates.sort((a, b) => b.categoryConfidence - a.categoryConfidence);
    return candidates[0]?.uid ?? null;
  }, [products, imagePreuploadCache]);

  // ─── 제3자 이미지 관리 (localStorage 영구 저장) ─────────────

  /** 제3자 이미지 파일 선택 → CDN 업로드 → URL 영구 저장 */
  const handleUploadThirdPartyImages = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;
      const files = Array.from(input.files);
      const scannedFiles: ScannedImageFile[] = [];
      for (const file of files) {
        const objectUrl = URL.createObjectURL(file);
        // FileSystemFileHandle 없이 직접 File 객체를 wrapping
        scannedFiles.push({
          name: file.name,
          handle: { getFile: () => Promise.resolve(file) } as unknown as FileSystemFileHandle,
          objectUrl,
        });
      }
      try {
        const urls = await uploadScannedImages(scannedFiles, scannedFiles.length);
        const validUrls = urls.filter(Boolean);
        if (validUrls.length > 0) {
          const merged = [...savedThirdPartyUrls, ...validUrls];
          setSavedThirdPartyUrls(merged);
          localStorage.setItem('megaload_thirdPartyUrls', JSON.stringify(merged));
          console.info(`[제3자] ${validUrls.length}장 업로드 → 총 ${merged.length}장 저장`);
        }
      } catch (e) {
        console.error('[제3자] 업로드 실패:', e);
      }
    };
    input.click();
  }, [savedThirdPartyUrls]);

  /** 저장된 제3자 이미지 1장 삭제 */
  const handleRemoveThirdPartyUrl = useCallback((index: number) => {
    const updated = savedThirdPartyUrls.filter((_, i) => i !== index);
    setSavedThirdPartyUrls(updated);
    localStorage.setItem('megaload_thirdPartyUrls', JSON.stringify(updated));
  }, [savedThirdPartyUrls]);

  /** 저장된 제3자 이미지 전체 초기화 */
  const handleClearThirdPartyUrls = useCallback(() => {
    setSavedThirdPartyUrls([]);
    localStorage.removeItem('megaload_thirdPartyUrls');
  }, []);

  return {
    step, setStep,
    folderPaths, brackets,
    shippingPlaces, returnCenters,
    selectedOutbound, setSelectedOutbound,
    selectedReturn, setSelectedReturn,
    deliveryChargeType, setDeliveryChargeType,
    deliveryCharge, setDeliveryCharge,
    freeShipOverAmount, setFreeShipOverAmount,
    returnCharge, setReturnCharge,
    contactNumber, setContactNumber,
    generateAiContent, setGenerateAiContent,
    includeReviewImages, setIncludeReviewImages,
    useStockImages, setUseStockImages,
    noticeOverrides, setNoticeOverrides,
    preventionConfig, setPreventionEnabled, setPreventionIntensity,
    loadingShipping, shippingError,
    scanning, scanError, browsingFolder, thirdPartyImages, savedThirdPartyUrls,
    products, setProducts,
    autoMatchingProgress, autoMatchError, autoMatchStats, categoryFailures,
    categorySearchTarget, setCategorySearchTarget,
    categoryKeyword, setCategoryKeyword,
    categoryResults, searchingCategory,
    validating, validationPhase,
    imagePreuploadProgress, imagePreuploadCache,
    dryRunResults,
    titleGenProgress, contentGenProgress, imageFilterProgress, stockImageProgress,
    // Preflight
    preflightPhase, preflightResults, preflightStats, preflightDurationMs,
    // Canary
    canaryPhase, canaryResult, canaryTargetUid,
    registering, isPaused, batchProgress, startTime,
    // Computed
    selectedCount, totalSourcePrice, totalSellingPrice,
    validationReadyCount, validationErrorCount, validationWarningCount, registerableCount,
    canRegister,
    // Actions
    addFolderPath, removeFolderPath,
    recalcPrices,
    handleScan, handleBrowseFolder,
    handleSearchCategory, selectCategory,
    handleDeepValidation, handlePreflight, handleCanary,
    toggleProduct, toggleAll, updateField,
    handleReorderImages, handleRemoveImage, getDetailImageUrls, handleSwapStockImage,
    handleRegister, togglePause, handleReset, retryFailed, backToStep2, retryAutoCategory,
    // 카테고리 정확도 개선
    fetchCategorySuggestions, lowConfidenceProducts, rematchLowConfidence, rematchingCategory,
    // 제3자 이미지 관리
    handleUploadThirdPartyImages, handleRemoveThirdPartyUrl, handleClearThirdPartyUrls,
  };
}
