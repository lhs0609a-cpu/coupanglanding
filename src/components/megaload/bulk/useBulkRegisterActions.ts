'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { pickAndScanFolder, uploadScannedImages } from '@/lib/megaload/services/client-folder-scanner';
import { validateProductLocal } from '@/lib/megaload/services/product-validator';
import type {
  EditableProduct, PriceBracket, ShippingPlace, ReturnCenter,
  CategoryItem, CategoryMatchResult, PreviewProduct, BatchResult,
  CategoryMetadata,
} from './types';
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

export function useBulkRegisterActions() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [brackets, setBrackets] = useState<PriceBracket[]>([
    { minPrice: 0, maxPrice: 10000, marginRate: 35 },
    { minPrice: 10000, maxPrice: 20000, marginRate: 30 },
    { minPrice: 20000, maxPrice: 50000, marginRate: 25 },
    { minPrice: 50000, maxPrice: 100000, marginRate: 20 },
    { minPrice: 100000, maxPrice: null, marginRate: 15 },
  ]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [generateAiContent, setGenerateAiContent] = useState(false);
  const [includeReviewImages, setIncludeReviewImages] = useState(true);
  const [noticeOverrides, setNoticeOverrides] = useState<Record<string, string>>({});
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
  }>>({});
  const imagePreuploadAbort = useRef<AbortController | null>(null);

  // Dry-Run
  const [dryRunResults, setDryRunResults] = useState<Record<string, {
    payloadPreview?: { displayCategoryCode: number; sellerProductName: string; imageCount: number; noticeCategoryCount: number; attributeCount: number; hasDetailPage: boolean; stock: number };
    missingRequiredFields?: string[];
  }>>({});

  // Step 3 state
  const [registering, setRegistering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);

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
    let matchedCount = 0;
    let failedCount = 0;
    const failedBatches: number[] = [];

    const processBatch = async (batchStart: number, batchProds: EditableProduct[], allProds: EditableProduct[]) => {
      const names = batchProds.map((p) => p.editedName);
      const res = await fetch('/api/megaload/products/bulk-register/auto-category-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNames: names }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json() as { results: CategoryMatchResult[] };
      let batchMatched = 0;
      setProducts((prev) => {
        const updated = [...prev];
        for (const r of data.results) {
          // Find the product in the full list by uid
          const targetProduct = batchProds[r.index];
          if (!targetProduct) continue;
          const globalIdx = updated.findIndex((p) => p.uid === targetProduct.uid);
          if (globalIdx >= 0 && r.categoryCode) {
            updated[globalIdx] = {
              ...updated[globalIdx],
              editedCategoryCode: r.categoryCode,
              editedCategoryName: r.categoryPath || r.categoryName,
              categoryConfidence: r.confidence,
              categorySource: r.source,
            };
            batchMatched++;
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
    setAutoMatchingProgress(null);
  }, []);

  // Retry auto-category for unmatched products
  const retryAutoCategory = useCallback(() => {
    runAutoCategory(products, true);
  }, [products, runAutoCategory]);

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
        return {
          productCode: sp.productCode,
          name: sp.productJson.name || sp.productJson.title || `product_${sp.productCode}`,
          brand: sp.productJson.brand || '',
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
          uid: `browser://${dirName}/${sp.folderName}::${sp.productCode}`,
          editedName: sp.productJson.name || sp.productJson.title || `product_${sp.productCode}`,
          editedBrand: sp.productJson.brand || extractBrandFromName(sp.productJson.name || sp.productJson.title || ''),
          editedSellingPrice: sourcePrice,
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
          }),
          signal: abort.signal,
        });
        if (res.ok) {
          const data = await res.json() as { results: Record<string, { mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[] }> };
          setImagePreuploadCache((prev) => ({ ...prev, ...data.results }));
        }
      } catch { if (abort.signal.aborted) break; }
      setImagePreuploadProgress((prev) => ({ ...prev, done: Math.min(i + CHUNK, serverProducts.length) }));
    }
    if (!abort.signal.aborted) {
      setImagePreuploadProgress((prev) => ({ ...prev, phase: 'complete' }));
    }
  }, [includeReviewImages]);

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
        const editableProducts: EditableProduct[] = (data.products as PreviewProduct[]).map((p) => ({
          ...p, uid: `${p.folderPath}::${p.productCode}`, editedName: p.name, editedBrand: p.brand || extractBrandFromName(p.name),
          editedSellingPrice: p.sellingPrice, editedCategoryCode: '', editedCategoryName: '',
          categoryConfidence: 0, categorySource: '', selected: true, status: 'pending' as const,
        }));
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

  const updateField = useCallback((uid: string, field: string, value: string | number) => {
    setProducts((prev) => prev.map((p) => p.uid === uid ? { ...p, [field]: value } : p));
  }, []);

  // ---- Image reorder / remove ----
  const handleReorderImages = useCallback((uid: string, newOrder: string[]) => {
    setProducts((prev) => prev.map((p) => {
      if (p.uid !== uid) return p;
      // If browser mode with scannedMainImages, reorder those too
      if (p.scannedMainImages && p.scannedMainImages.length > 0) {
        // newOrder is URLs; we need to map back to scannedMainImages
        // For browser mode, the URL ordering comes from the detail panel
        // We can only reorder the scanned array by matching indices
        return { ...p, mainImages: newOrder };
      }
      return { ...p, mainImages: newOrder };
    }));
    // Also update preupload cache
    setImagePreuploadCache((prev) => {
      const cached = prev[uid];
      if (!cached) return prev;
      return { ...prev, [uid]: { ...cached, mainImageUrls: newOrder } };
    });
  }, []);

  const handleRemoveImage = useCallback((uid: string, imageIndex: number) => {
    setProducts((prev) => prev.map((p) => {
      if (p.uid !== uid) return p;
      const newMainImages = [...p.mainImages];
      newMainImages.splice(imageIndex, 1);
      const update: Partial<EditableProduct> = { mainImages: newMainImages, mainImageCount: newMainImages.length };
      if (p.scannedMainImages) {
        const newScanned = [...p.scannedMainImages];
        newScanned.splice(imageIndex, 1);
        update.scannedMainImages = newScanned;
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
    if (product?.mainImages?.length) return product.mainImages;
    return [];
  }, [imagePreuploadCache, products]);

  // ---- Register ----
  const handleRegister = useCallback(async () => {
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
          const cached = imagePreuploadCache[p.uid];
          if (cached) { product.preUploadedUrls = cached; }
          else if (p.scannedMainImages || p.scannedDetailImages) {
            const mainUrls = await uploadScannedImages(p.scannedMainImages || [], 10);
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
              return { ...p, status: r.success ? 'success' : 'error', channelProductId: r.channelProductId, errorMessage: r.error, duration: r.duration };
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
  }, [products, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, generateAiContent, includeReviewImages, noticeOverrides, categoryMetaCache, imagePreuploadCache, imagePreuploadProgress.phase]);

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
    setValidationPhase('idle');
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
    noticeOverrides, setNoticeOverrides,
    loadingShipping, shippingError,
    scanning, scanError, browsingFolder,
    products, setProducts,
    autoMatchingProgress, autoMatchError, autoMatchStats,
    categorySearchTarget, setCategorySearchTarget,
    categoryKeyword, setCategoryKeyword,
    categoryResults, searchingCategory,
    validating, validationPhase,
    imagePreuploadProgress, imagePreuploadCache,
    dryRunResults,
    registering, isPaused, batchProgress, startTime,
    // Computed
    selectedCount, totalSourcePrice, totalSellingPrice,
    validationReadyCount, validationErrorCount, validationWarningCount, registerableCount,
    // Actions
    addFolderPath, removeFolderPath,
    recalcPrices,
    handleScan, handleBrowseFolder,
    handleSearchCategory, selectCategory,
    handleDeepValidation,
    toggleProduct, toggleAll, updateField,
    handleReorderImages, handleRemoveImage, getDetailImageUrls,
    handleRegister, togglePause, handleReset, retryAutoCategory,
  };
}
