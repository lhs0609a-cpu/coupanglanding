'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { pickAndScanFolder, uploadScannedImages, uploadScannedImagesWithVariation } from '@/lib/megaload/services/client-folder-scanner';
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
        상품명: f.productName.slice(0, 30),
        토큰: f.tokens.join(', '),
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

  // ---- Stock image fetch (Pexels) ----
  const runStockImageFetch = useCallback(async (prods: EditableProduct[]) => {
    if (!useStockImages) return;

    const targets = prods.filter(p => p.editedCategoryCode && isCommodityCategory(p.editedCategoryName));
    if (targets.length === 0) return;

    setStockImageProgress({ done: 0, total: targets.length });
    await new Promise(r => setTimeout(r, 0));

    const BATCH = 20;
    let done = 0;

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

          setProducts(prev => prev.map(p => {
            const result = data.results[p.uid];
            if (!result || result.stockImageUrls.length === 0) return p;

            // 원본 백업 (복원용)
            const originalScanned = p.originalScannedMainImages || p.scannedMainImages;

            // scannedMainImages를 스톡 이미지로 교체 (objectUrl = CDN URL)
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

          // imagePreuploadCache에 CDN URL 직접 설정
          // → preupload 단계에서 캐시 히트 → 추가 업로드 불필요
          setImagePreuploadCache(prev => {
            const updated = { ...prev };
            for (const [uid, result] of Object.entries(data.results)) {
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
      } catch (err) {
        console.error('[stock-images] Batch failed:', err);
      }
      done += batch.length;
      setStockImageProgress({ done: Math.min(done, targets.length), total: targets.length });
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
    // displayProductName과 sellerProductName을 서로 다른 시드로 생성하여
    // 쿠팡 아이템위너 매칭 시 교차 비교 유사도를 낮춘다.
    {
      const { generateDisplayName } = await import('@/lib/megaload/services/display-name-generator');
      const displaySeed = `display_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sellerNameSeed = `seller_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setProducts(prev => {
        const updated = [...prev];
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const globalIdx = updated.findIndex(p => p.uid === target.uid);
          if (globalIdx >= 0) {
            const sellerName = generateDisplayName(
              target.name,
              target.editedBrand || target.brand,
              target.editedCategoryName,
              sellerNameSeed,
              i,
            );
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedDisplayProductName: generateDisplayName(
                target.name,  // 원본 상품명 사용 (editedName은 브랜드+고유번호)
                target.editedBrand || target.brand,
                target.editedCategoryName,
                displaySeed,
                i,
              ),
              editedSellerProductName: sellerName,
              // editedName은 "브랜드 고유번호" 유지 — UI 표시용
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
      const { generateStory } = await import('@/lib/megaload/services/story-generator');
      const sellerSeed = `seller_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setProducts(prev => {
        const updated = [...prev];
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const globalIdx = updated.findIndex(p => p.uid === target.uid);
          if (globalIdx >= 0) {
            const story = generateStory(
              target.editedDisplayProductName || target.name,  // 원본 상품명 사용
              target.editedCategoryName,
              sellerSeed,
              i,
            );
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedStoryParagraphs: story.paragraphs,
              editedReviewTexts: story.reviewTexts,
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

        // 대표이미지 품질 스코어링 + 부적합 필터링 + 이상치 감지
        // → 최고 품질 이미지를 index 0에 고정 후 나머지 셔플
        const { filterAndScoreMainImages, detectOutlierImages } = await import('@/lib/megaload/services/image-quality-scorer');

        // Phase 1: 각 상품의 대표이미지 스코어링 + 하드필터 (병렬)
        // objectUrl이 없는 이미지를 건너뛰되, 원본 인덱스를 보존하여 매핑 버그 방지
        const scoringPromises = latest.map(async (p) => {
          if (!p.scannedMainImages || p.scannedMainImages.length <= 1) return null;
          // objectUrl이 있는 이미지만 추출 + 원본 인덱스 매핑 보존
          const validEntries: { origIdx: number; url: string }[] = [];
          for (let idx = 0; idx < p.scannedMainImages.length; idx++) {
            const url = p.scannedMainImages[idx].objectUrl;
            if (url) validEntries.push({ origIdx: idx, url });
          }
          if (validEntries.length <= 1) return null;
          try {
            const urls = validEntries.map(e => e.url);
            const scores = await filterAndScoreMainImages(urls);
            // scores[].index는 urls 배열 기준 → 원본 인덱스로 변환
            return scores.map(s => ({
              ...s,
              index: validEntries[s.index].origIdx,
            }));
          } catch { return null; }
        });
        const filterTotal = latest.length;
        setImageFilterProgress({ done: 0, total: filterTotal, phase: 'running' });
        let filterDone = 0;
        const scoringResults: (Awaited<typeof scoringPromises[number]>)[] = [];
        for (const p of scoringPromises) {
          scoringResults.push(await p);
          filterDone++;
          setImageFilterProgress(prev => ({ ...prev, done: filterDone }));
        }

        // Phase 2: 이상치 감지 — 개별 스코어링 통과한 이미지 중 색상 분포가 다른 이미지 제거
        // (다른 브랜드/상품 이미지 자동 감지)
        const outlierPromises = latest.map(async (p, i) => {
          if (!p.scannedMainImages || p.scannedMainImages.length <= 4) return null;
          const scores = scoringResults[i];
          if (!scores) return null;
          // 스코어링 통과한 이미지만 대상 (index는 이미 원본 기준)
          const passedIndices = scores.filter(s => !s.filtered).map(s => s.index);
          if (passedIndices.length <= 4) return null;
          const validEntries: { passedIdx: number; origIdx: number; url: string }[] = [];
          for (let j = 0; j < passedIndices.length; j++) {
            const url = p.scannedMainImages![passedIndices[j]]?.objectUrl;
            if (url) validEntries.push({ passedIdx: j, origIdx: passedIndices[j], url });
          }
          if (validEntries.length <= 4) return null;
          try {
            const outliers = await detectOutlierImages(validEntries.map(e => e.url));
            // 원본 인덱스로 매핑
            return outliers.map((o, j) => ({
              originalIndex: validEntries[j].origIdx,
              isOutlier: o.isOutlier,
              distance: o.distance,
            }));
          } catch { return null; }
        });
        const outlierResults = await Promise.all(outlierPromises);

        setProducts(prev => prev.map((p, i) => {
          if (!p.scannedMainImages || p.scannedMainImages.length <= 1) return p;
          const scores = scoringResults[i];
          if (!scores || scores.length === 0) return p;

          // Phase 1 필터: 하드필터 + 최소 점수 미달 제거
          const passed = scores.filter(s => !s.filtered);
          const surviving = passed.length > 0 ? passed : [scores[0]];

          // Phase 2 필터: 이상치 제거
          const outliers = outlierResults[i];
          const outlierIndices = new Set(
            outliers?.filter(o => o.isOutlier).map(o => o.originalIndex) ?? [],
          );
          const afterOutlier = outlierIndices.size > 0
            ? surviving.filter(s => !outlierIndices.has(s.index))
            : surviving;
          // 이상치 제거 후 빈 배열 방지
          const final = afterOutlier.length > 0 ? afterOutlier : [surviving[0]];

          const hardFilteredCount = scores.length - surviving.length;
          const outlierCount = surviving.length - afterOutlier.length;
          if (hardFilteredCount > 0 || outlierCount > 0) {
            const reasons: string[] = [];
            if (hardFilteredCount > 0) reasons.push(`하드필터 ${hardFilteredCount}장`);
            if (outlierCount > 0) reasons.push(`이상치 ${outlierCount}장`);
            console.info(`[image-filter] ${p.productCode}: ${reasons.join(' + ')} 제거 (${scores.length}→${final.length}장)`);
          }

          // 스코어링 결과 로그 — 대표이미지 선택 근거 확인용
          console.info(
            `[image-score] ${p.productCode}: 대표=#${final[0].index} (overall=${final[0].score.overall.toFixed(1)}, compact=${final[0].score.productCompactness.toFixed(0)}, edge=${final[0].score.edgeCrop.toFixed(0)}, sym=${final[0].score.symmetry.toFixed(0)}, bg=${final[0].score.background.toFixed(0)}, center=${final[0].score.centering.toFixed(0)})` +
            ` | 전체: ${final.slice(0, 5).map((s, j) => `#${s.index}=${s.score.overall.toFixed(1)}`).join(', ')}${final.length > 5 ? '...' : ''}`,
          );

          // 스코어 순으로 재배열 — index는 원본 scannedMainImages 기준
          // 점수 순 유지 (최고 점수 = 대표) — 아이템위너 방지 셔플은 빌더 단계에서 수행
          const sorted = final.map(s => p.scannedMainImages![s.index]);
          const finalImages = sorted.slice(0, 10);
          return {
            ...p,
            scannedMainImages: finalImages,
            mainImageCount: finalImages.length,
          };
        }));

        // Phase 3: 상세페이지/리뷰 이미지 필터링 — 배송안내, 배너, 빈 이미지 + 다른 상품 사진 제거
        const { filterDetailPageImages, crossReferenceOutlierImages } = await import('@/lib/megaload/services/image-quality-scorer');

        // Phase 3에서도 원본 인덱스 매핑 보존 (objectUrl이 없는 항목 건너뛰기)
        const detailFilterPromises = productsRef.current.map(async (p) => {
          const results: {
            detail?: { origIdx: number; filtered: boolean; reason?: string }[];
            review?: { origIdx: number; filtered: boolean; reason?: string }[];
          } = {};

          // 대표이미지 URL 수집 (교차 이상치 감지의 기준)
          const mainUrls: string[] = [];
          if (p.scannedMainImages) {
            for (const img of p.scannedMainImages) {
              if (img.objectUrl) mainUrls.push(img.objectUrl);
            }
          }

          // 상세 이미지 필터
          if (p.scannedDetailImages && p.scannedDetailImages.length > 0) {
            const entries: { origIdx: number; url: string }[] = [];
            for (let j = 0; j < p.scannedDetailImages.length; j++) {
              const url = p.scannedDetailImages[j].objectUrl;
              if (url) entries.push({ origIdx: j, url });
            }
            if (entries.length > 0) {
              try {
                const raw = await filterDetailPageImages(entries.map(e => e.url));
                results.detail = raw.map(r => ({ origIdx: entries[r.index].origIdx, filtered: r.filtered, reason: r.reason }));

                // 교차 이상치 감지: 배너/빈이미지 필터 통과한 상세이미지를 대표이미지와 비교
                if (mainUrls.length > 0) {
                  const passedEntries = results.detail
                    .map((r, idx) => ({ ...r, entryIdx: idx }))
                    .filter(r => !r.filtered);
                  if (passedEntries.length > 0) {
                    try {
                      const crossResults = await crossReferenceOutlierImages(
                        mainUrls,
                        passedEntries.map(e => entries.find(en => en.origIdx === e.origIdx)!.url),
                      );
                      for (let k = 0; k < crossResults.length; k++) {
                        if (crossResults[k].isOutlier) {
                          const target = results.detail[passedEntries[k].entryIdx];
                          target.filtered = true;
                          target.reason = 'cross_reference_outlier';
                        }
                      }
                    } catch { /* skip cross-reference */ }
                  }
                }
              } catch { /* skip */ }
            }
          }
          // 리뷰 이미지 필터
          if (p.scannedReviewImages && p.scannedReviewImages.length > 0) {
            const entries: { origIdx: number; url: string }[] = [];
            for (let j = 0; j < p.scannedReviewImages.length; j++) {
              const url = p.scannedReviewImages[j].objectUrl;
              if (url) entries.push({ origIdx: j, url });
            }
            if (entries.length > 0) {
              try {
                const raw = await filterDetailPageImages(entries.map(e => e.url));
                results.review = raw.map(r => ({ origIdx: entries[r.index].origIdx, filtered: r.filtered, reason: r.reason }));

                // 교차 이상치 감지: 배너/빈이미지 필터 통과한 리뷰이미지를 대표이미지와 비교
                if (mainUrls.length > 0) {
                  const passedEntries = results.review
                    .map((r, idx) => ({ ...r, entryIdx: idx }))
                    .filter(r => !r.filtered);
                  if (passedEntries.length > 0) {
                    try {
                      const crossResults = await crossReferenceOutlierImages(
                        mainUrls,
                        passedEntries.map(e => entries.find(en => en.origIdx === e.origIdx)!.url),
                      );
                      for (let k = 0; k < crossResults.length; k++) {
                        if (crossResults[k].isOutlier) {
                          const target = results.review[passedEntries[k].entryIdx];
                          target.filtered = true;
                          target.reason = 'cross_reference_outlier';
                        }
                      }
                    } catch { /* skip cross-reference */ }
                  }
                }
              } catch { /* skip */ }
            }
          }
          return results;
        });
        const detailFilterResults = await Promise.all(detailFilterPromises);

        setProducts(prev => prev.map((p, i) => {
          const filterResult = detailFilterResults[i];
          let updated = { ...p };

          // 상세 이미지 필터 적용
          if (filterResult.detail && p.scannedDetailImages) {
            const passed = filterResult.detail.filter(r => !r.filtered);
            if (passed.length < p.scannedDetailImages.length) {
              const removed = filterResult.detail.filter(r => r.filtered).length;
              console.info(`[detail-filter] ${p.productCode}: 상세이미지 ${removed}장 제거 (${filterResult.detail.filter(r => r.filtered).map(r => r.reason).join(',')})`);
              const kept = passed.map(r => p.scannedDetailImages![r.origIdx]);
              updated = { ...updated, scannedDetailImages: kept, detailImageCount: kept.length };
            }
          }

          // 리뷰 이미지 필터 적용
          if (filterResult.review && p.scannedReviewImages) {
            const passed = filterResult.review.filter(r => !r.filtered);
            if (passed.length < p.scannedReviewImages.length) {
              const removed = filterResult.review.filter(r => r.filtered).length;
              console.info(`[detail-filter] ${p.productCode}: 리뷰이미지 ${removed}장 제거 (${filterResult.review.filter(r => r.filtered).map(r => r.reason).join(',')})`);
              const kept = passed.map(r => p.scannedReviewImages![r.origIdx]);
              updated = { ...updated, scannedReviewImages: kept, reviewImageCount: kept.length };
            }
          }

          return updated;
        }));

        setImageFilterProgress({ done: filterTotal, total: filterTotal, phase: 'complete' });
        // React 배치를 끊어 이미지 필터링 완료 상태를 UI에 반영
        await new Promise(r => setTimeout(r, 50));

        // 스톡 이미지 fetch (범용 카테고리 대표이미지 교체)
        await runStockImageFetch(productsRef.current);
        await new Promise(r => setTimeout(r, 50));

        await runTitleGeneration(productsRef.current);
        // React 배치를 끊어 노출상품명 완료 상태를 UI에 반영
        await new Promise(r => setTimeout(r, 50));
        await runContentGeneration(productsRef.current);
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchingProgress, autoMatchStats, pipelineRan, step]);

  // ---- Browse folder (showDirectoryPicker) ----
  const handleBrowseFolder = useCallback(async () => {
    setBrowsingFolder(true);
    setScanError('');
    try {
      const { dirName, products: scanned } = await pickAndScanFolder();
      if (scanned.length === 0) {
        setScanError(`"${dirName}" 폴더에 product_* 하위 폴더가 없습니다.`);
        setBrowsingFolder(false);
        return;
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
          editedBrand: resolvedBrand,
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
          setProducts(data.products);
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

  // ---- Image preupload ----
  const startImagePreupload = useCallback(async (targetProducts: EditableProduct[]) => {
    const serverProducts = targetProducts.filter((p) => !p.folderPath.startsWith('browser://') && p.mainImages.length > 0);
    if (serverProducts.length === 0) {
      setImagePreuploadProgress({ total: 0, done: 0, phase: 'complete' });
      return;
    }
    const abort = new AbortController();
    imagePreuploadAbort.current = abort;
    setImagePreuploadProgress({ total: serverProducts.length, done: 0, phase: 'uploading' });

    const CHUNK = 5;
    for (let i = 0; i < serverProducts.length; i += CHUNK) {
      if (abort.signal.aborted) break;
      const chunk = serverProducts.slice(i, i + CHUNK);
      try {
        const res = await fetch('/api/megaload/products/bulk-register/preupload-images', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: chunk.map((p) => ({ uid: p.uid, productCode: p.productCode, mainImages: p.mainImages, detailImages: p.detailImages, reviewImages: p.reviewImages, infoImages: p.infoImages })),
            includeReviewImages,
            preventionSeed: preventionConfig.enabled && preventionConfig.imageVariation ? 'pending' : undefined,
            variationIntensity: preventionConfig.enabled && preventionConfig.imageVariation ? preventionConfig.variationIntensity : undefined,
          }),
          signal: abort.signal,
        });
        if (res.ok) {
          const data = await res.json() as { results: Record<string, { mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[]; uploadedAt?: number }> };
          const timestamped: typeof data.results = {};
          for (const [key, val] of Object.entries(data.results)) {
            timestamped[key] = { ...val, uploadedAt: Date.now() };
          }
          setImagePreuploadCache((prev) => ({ ...prev, ...timestamped }));
        }
      } catch { if (abort.signal.aborted) break; }
      setImagePreuploadProgress((prev) => ({ ...prev, done: Math.min(i + CHUNK, serverProducts.length) }));
    }
    if (!abort.signal.aborted) {
      setImagePreuploadProgress((prev) => ({ ...prev, phase: 'complete' }));
    }
  }, [includeReviewImages, preventionConfig]);

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
      const batchProducts = selectedProds.map(p => {
        const meta = categoryMetaCache[p.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
        const cached = imagePreuploadCache[p.uid];
        return {
          uid: p.uid,
          productCode: p.productCode,
          folderPath: p.folderPath,
          name: p.editedName,
          brand: p.editedBrand,
          sellingPrice: p.editedSellingPrice,
          sourcePrice: p.sourcePrice,
          categoryCode: p.editedCategoryCode,
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
          preUploadedUrls: cached ? {
            mainImageUrls: cached.mainImageUrls || [],
            detailImageUrls: cached.detailImageUrls || [],
            reviewImageUrls: cached.reviewImageUrls || [],
            infoImageUrls: cached.infoImageUrls || [],
          } : undefined,
        };
      });

      // 이미지 타임스탬프 수집
      const imageTimestamps: Record<string, number> = {};
      for (const p of selectedProds) {
        const cached = imagePreuploadCache[p.uid];
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
  }, [products, categoryMetaCache, imagePreuploadCache, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, noticeOverrides, preventionConfig]);

  // ---- Canary ----
  const handleCanary = useCallback(async (targetUid: string) => {
    const product = products.find(p => p.uid === targetUid);
    if (!product) return;

    setCanaryPhase('running');
    setCanaryResult(null);

    try {
      const meta = categoryMetaCache[product.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
      const cached = imagePreuploadCache[product.uid];

      const res = await fetch('/api/megaload/products/bulk-register/canary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            uid: product.uid,
            productCode: product.productCode,
            folderPath: product.folderPath,
            name: product.editedName,
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
  }, [products, categoryMetaCache, imagePreuploadCache, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, noticeOverrides, preventionConfig]);

  // ---- Auto-trigger preflight after deep validation + image upload complete ----
  useEffect(() => {
    if (
      validationPhase === 'complete' &&
      (imagePreuploadProgress.phase === 'complete' || imagePreuploadProgress.phase === 'idle') &&
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
          ...p, uid: `${p.folderPath}::${p.productCode}`, editedName: `${srvBrand} ${p.productCode}`, editedBrand: srvBrand,
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

  const updateField = useCallback((uid: string, field: string, value: string | number | string[] | Record<string, string>) => {
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
    setImagePreuploadCache((prev) => {
      const cached = prev[uid];
      if (!cached) return prev;
      return { ...prev, [uid]: { ...cached, mainImageUrls: newOrder } };
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
    const cached = imagePreuploadCache[uid];
    if (cached?.mainImageUrls?.length) return cached.mainImageUrls;
    const product = products.find(p => p.uid === uid);
    if (product?.mainImages?.length) {
      // 로컬 경로(G:\... 등)는 브라우저에서 직접 표시 불가 → 서버 프록시 URL로 변환
      // blob: URL은 이미 표시 가능하므로 그대로 반환
      return product.mainImages.map(p =>
        p.startsWith('http') || p.startsWith('blob:') ? p : `/api/megaload/products/bulk-register/serve-image?path=${encodeURIComponent(p)}`
      );
    }
    return [];
  }, [imagePreuploadCache, products]);

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

    const BATCH_SIZE = 10;
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
            uid: p.uid, productCode: p.productCode, folderPath: p.folderPath, name: p.editedName,
            brand: p.editedBrand, sellingPrice: p.editedSellingPrice, sourcePrice: p.sourcePrice,
            categoryCode: p.editedCategoryCode, tags: p.tags, description: p.description,
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
          const cached = imagePreuploadCache[p.uid];
          const cacheValid = cached && cached.uploadedAt && (Date.now() - cached.uploadedAt < IMAGE_CACHE_TTL_MS);
          if (cacheValid) { product.preUploadedUrls = cached; }
          else if (p.scannedMainImages || p.scannedDetailImages) {
            const shouldVary = preventionConfig.enabled && preventionConfig.imageVariation;
            const mainUrls = await uploadScannedImagesWithVariation(p.scannedMainImages || [], shouldVary, 10);
            const detailUrls = await uploadScannedImages(p.scannedDetailImages || [], 10);
            const reviewUrls = includeReviewImages ? await uploadScannedImages(p.scannedReviewImages || [], 10) : [];
            const infoUrls = await uploadScannedImages(p.scannedInfoImages || [], 10);
            product.preUploadedUrls = { mainImageUrls: mainUrls, detailImageUrls: detailUrls, reviewImageUrls: reviewUrls, infoImageUrls: infoUrls };
          }
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
  }, [products, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, generateAiContent, includeReviewImages, noticeOverrides, categoryMetaCache, imagePreuploadCache, imagePreuploadProgress.phase, validating, autoMatchingProgress, preventionConfig]);

  // ---- Toggle pause ----
  const togglePause = useCallback(() => {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
  }, [isPaused]);

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

  // ---- Computed values ----
  const selectedProducts = products.filter((p) => p.selected);
  const selectedCount = selectedProducts.length;
  const totalSourcePrice = selectedProducts.reduce((s, p) => s + p.sourcePrice, 0);
  const totalSellingPrice = selectedProducts.reduce((s, p) => s + p.editedSellingPrice, 0);
  const validationReadyCount = products.filter((p) => p.validationStatus === 'ready').length;
  const validationErrorCount = products.filter((p) => p.validationStatus === 'error').length;
  const validationWarningCount = products.filter((p) => p.validationStatus === 'warning').length;
  const registerableCount = products.filter((p) => p.selected && p.editedCategoryCode && p.validationStatus !== 'error').length;
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
    scanning, scanError, browsingFolder,
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
    handleRegister, togglePause, handleReset, retryAutoCategory,
  };
}
