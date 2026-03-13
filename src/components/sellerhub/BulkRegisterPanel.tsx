'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  FolderSearch, ArrowRight, ArrowLeft, Loader2, CheckCircle2, XCircle,
  Search, RefreshCw, Truck, MapPin, Phone, Sparkles, Pause, Play,
  Pencil, ChevronDown, Folder, X, Clock, Plus, FolderOpen,
  AlertTriangle, Shield, Filter, Upload, Zap, Eye, BarChart3,
  Image as ImageIcon, Package, CircleDot,
} from 'lucide-react';
import { pickAndScanFolder, uploadScannedImages, type ScannedImageFile } from '@/lib/sellerhub/services/client-folder-scanner';
import {
  validateProductLocal,
  type ValidationStatus,
  type ValidationIssue,
  type ProductValidationResult,
  type CategoryMetadata,
} from '@/lib/sellerhub/services/product-validator';

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
  tags: string[];
  description: string;
  sourcePrice: number;
  sellingPrice: number;
  mainImageCount: number;
  detailImageCount: number;
  infoImageCount: number;
  reviewImageCount: number;
  mainImages: string[];
  detailImages: string[];
  infoImages: string[];
  reviewImages: string[];
  folderPath: string;
  hasProductJson: boolean;
}

interface EditableProduct extends PreviewProduct {
  uid: string;
  editedName: string;
  editedBrand: string;
  editedSellingPrice: number;
  editedCategoryCode: string;
  editedCategoryName: string;
  categoryConfidence: number;
  categorySource: string;
  selected: boolean;
  // 클라이언트 스캔 이미지 핸들 (showDirectoryPicker 사용 시)
  scannedMainImages?: ScannedImageFile[];
  scannedDetailImages?: ScannedImageFile[];
  scannedInfoImages?: ScannedImageFile[];
  scannedReviewImages?: ScannedImageFile[];
  // 검증 결과
  validationStatus?: ValidationStatus;
  validationErrors?: ValidationIssue[];
  validationWarnings?: ValidationIssue[];
  // 등록 결과
  status: 'pending' | 'registering' | 'success' | 'error';
  channelProductId?: string;
  errorMessage?: string;
  duration?: number;
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

interface CategoryMatchResult {
  index: number;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  confidence: number;
  source: string;
}

interface BatchResult {
  uid?: string;
  productCode: string;
  name: string;
  success: boolean;
  channelProductId?: string;
  error?: string;
  duration?: number;
}

// ---- localStorage 최근 경로 ----

const RECENT_PATHS_KEY = 'bulk_register_recent_paths';
const MAX_RECENT_PATHS = 10;

function getRecentPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PATHS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentPaths(paths: string[]) {
  try {
    // 중복 제거 + 최근 사용 순 + 최대 10개
    const unique = [...new Set(paths)].slice(0, MAX_RECENT_PATHS);
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(unique));
  } catch {
    // ignore
  }
}

function addRecentPath(path: string) {
  const existing = getRecentPaths().filter((p) => p !== path);
  saveRecentPaths([path, ...existing]);
}

// ---- 메인 컴포넌트 ----

export default function BulkRegisterPanel() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ---- Step 1: 설정 ----
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [folderInput, setFolderInput] = useState('');
  const [showRecentPaths, setShowRecentPaths] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [browsingFolder, setBrowsingFolder] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [brackets, setBrackets] = useState<PriceBracket[]>([
    { minPrice: 0,      maxPrice: 10000,  marginRate: 35 },
    { minPrice: 10000,  maxPrice: 20000,  marginRate: 30 },
    { minPrice: 20000,  maxPrice: 50000,  marginRate: 25 },
    { minPrice: 50000,  maxPrice: 100000, marginRate: 20 },
    { minPrice: 100000, maxPrice: null,    marginRate: 15 },
  ]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [generateAiContent, setGenerateAiContent] = useState(false);
  const [includeReviewImages, setIncludeReviewImages] = useState(true);
  const [noticeOverrides, setNoticeOverrides] = useState<Record<string, string>>({});

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

  // ---- Step 2: 편집 ----
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [autoMatchingProgress, setAutoMatchingProgress] = useState<{ done: number; total: number } | null>(null);

  // 카테고리 검색 팝업
  const [categorySearchTarget, setCategorySearchTarget] = useState<string | null>(null); // uid or 'bulk'
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [categoryResults, setCategoryResults] = useState<CategoryItem[]>([]);
  const [searchingCategory, setSearchingCategory] = useState(false);

  // 일괄 작업
  const [bulkAction, setBulkAction] = useState<'brand' | 'category' | 'price' | null>(null);
  const [bulkBrandValue, setBulkBrandValue] = useState('');
  const [bulkPriceAdjust, setBulkPriceAdjust] = useState(0);

  // ---- 검증 ----
  const [validating, setValidating] = useState(false);
  const [categoryMetaCache, setCategoryMetaCache] = useState<Record<string, CategoryMetadata>>({});
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);

  // ---- 파이프라인: 이미지 사전업로드 ----
  const [imagePreuploadProgress, setImagePreuploadProgress] = useState<{
    total: number; done: number; phase: 'idle' | 'uploading' | 'complete' | 'error';
  }>({ total: 0, done: 0, phase: 'idle' });
  const [imagePreuploadCache, setImagePreuploadCache] = useState<Record<string, {
    mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[];
  }>>({});
  const imagePreuploadAbort = useRef<AbortController | null>(null);

  // ---- 파이프라인: Dry-Run 검증 ----
  const [dryRunResults, setDryRunResults] = useState<Record<string, {
    payloadPreview?: { displayCategoryCode: number; sellerProductName: string; imageCount: number; noticeCategoryCount: number; attributeCount: number; hasDetailPage: boolean; stock: number };
    missingRequiredFields?: string[];
  }>>({});
  const [validationPhase, setValidationPhase] = useState<'idle' | 'local' | 'deep' | 'dryrun' | 'preupload' | 'complete'>('idle');

  // ---- Step 3: 등록 ----
  const [registering, setRegistering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);

  // ---- 폴더 경로 관리 ----
  const addFolderPath = useCallback((pathOrPaths: string) => {
    // 여러 줄 붙여넣기 지원
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

  const handleFolderInputAdd = useCallback(() => {
    if (!folderInput.trim()) return;
    addFolderPath(folderInput);
    setFolderInput('');
  }, [folderInput, addFolderPath]);

  const handleFolderInputPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) {
      e.preventDefault();
      addFolderPath(text);
      setFolderInput('');
    }
  }, [addFolderPath]);

  // 드래그앤드롭
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // dropZone 영역을 떠날 때만
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const [dropMessage, setDropMessage] = useState('');

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDropMessage('');

    // 여러 dataTransfer 형식 시도
    const text = e.dataTransfer.getData('text/plain')
      || e.dataTransfer.getData('text')
      || e.dataTransfer.getData('text/uri-list')
      || e.dataTransfer.getData('URL');

    if (text) {
      let path = text.trim();
      // file:// URI 처리 (예: file:///C:/Users/u/...)
      if (path.startsWith('file:///')) {
        path = decodeURIComponent(path.replace('file:///', ''));
        path = path.replace(/\//g, '\\');
      } else if (path.startsWith('file://')) {
        path = decodeURIComponent(path.replace('file://', ''));
        path = path.replace(/\//g, '\\');
      }
      // 줄바꿈이 있으면 첫 번째 유효한 줄만
      const firstLine = path.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)[0];
      if (firstLine) {
        addFolderPath(firstLine);
        return;
      }
    }

    // 텍스트 없이 파일/폴더만 드롭된 경우 (탐색기에서 폴더 직접 드래그)
    if (e.dataTransfer.files.length > 0 || e.dataTransfer.items.length > 0) {
      setDropMessage('폴더를 직접 끌어다 놓으면 브라우저 보안 정책으로 경로를 읽을 수 없습니다. 아래 방법을 사용해주세요:\n1) 탐색기 주소창의 경로 텍스트를 복사하여 붙여넣기\n2) 📂 찾기 버튼으로 폴더 탐색');
      // 5초 후 자동 제거
      setTimeout(() => setDropMessage(''), 6000);
    }
  }, [addFolderPath]);

  // 최근 경로 로드
  const handleShowRecentPaths = useCallback(() => {
    setRecentPaths(getRecentPaths());
    setShowRecentPaths((prev) => !prev);
  }, []);

  // ---- 카테고리 자동매칭 (배치) ----
  const runAutoCategory = useCallback(async (prods: EditableProduct[]) => {
    const BATCH_SIZE = 50;
    const total = prods.length;
    setAutoMatchingProgress({ done: 0, total });

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = prods.slice(i, i + BATCH_SIZE);
      const names = batch.map((p) => p.editedName);

      try {
        const res = await fetch('/api/sellerhub/products/bulk-register/auto-category-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productNames: names }),
        });

        if (res.ok) {
          const data = await res.json() as { results: CategoryMatchResult[] };
          setProducts((prev) => {
            const updated = [...prev];
            for (const r of data.results) {
              const globalIdx = i + r.index;
              if (globalIdx < updated.length && r.categoryCode) {
                updated[globalIdx] = {
                  ...updated[globalIdx],
                  editedCategoryCode: r.categoryCode,
                  editedCategoryName: r.categoryPath || r.categoryName,
                  categoryConfidence: r.confidence,
                  categorySource: r.source,
                };
              }
            }
            return updated;
          });
        }
      } catch {
        // 매칭 실패 → 수동으로
      }

      setAutoMatchingProgress({ done: Math.min(i + BATCH_SIZE, total), total });
    }
    setAutoMatchingProgress(null);
  }, []);

  // ---- 네이티브 폴더 선택 (showDirectoryPicker) ----
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

      // ScannedProduct → EditableProduct 변환
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
          editedBrand: sp.productJson.brand || '',
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

      // 마진율 적용
      const withPricing = editableProducts.map((p) => {
        const bracket = brackets.find(
          (b) => p.sourcePrice >= b.minPrice && p.sourcePrice < (b.maxPrice ?? Infinity),
        );
        const rate = bracket ? bracket.marginRate : 25;
        const sellingPrice = Math.ceil((p.sourcePrice * (1 + rate / 100)) / 100) * 100;
        return { ...p, sellingPrice, editedSellingPrice: sellingPrice };
      });

      setProducts(withPricing);
      // folderPaths에도 추가 (표시용)
      const browserPath = `browser://${dirName}`;
      setFolderPaths((prev) => prev.includes(browserPath) ? prev : [...prev, browserPath]);
      setStep(2);

      // 카테고리 자동매칭
      runAutoCategory(withPricing);
    } catch (err) {
      // 사용자가 취소한 경우 무시
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 사용자 취소
      } else {
        setScanError(err instanceof Error ? err.message : '폴더 스캔 실패');
      }
    } finally {
      setBrowsingFolder(false);
    }
  }, [brackets, runAutoCategory]);

  // ---- 로컬 검증 자동 실행 (디바운스) ----
  useEffect(() => {
    if (products.length === 0 || step !== 2) return;
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
          return {
            ...p,
            validationStatus: result.status,
            validationErrors: result.errors,
            validationWarnings: result.warnings,
          };
        }),
      );
    }, 500);
    return () => clearTimeout(timer);
  // products 내용이 바뀔 때 재실행하되, setProducts에 의한 검증 결과 업데이트는 무시
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.map((p) => `${p.uid}:${p.editedName}:${p.editedSellingPrice}:${p.editedCategoryCode}:${p.editedBrand}:${p.mainImageCount}`).join(','), step]);

  // ---- 파이프라인: 이미지 사전 업로드 (백그라운드) ----
  const startImagePreupload = useCallback(async (targetProducts: EditableProduct[]) => {
    // 서버 경로 상품만 (browser:// 는 Step 3에서 클라이언트 업로드)
    const serverProducts = targetProducts.filter(
      (p) => !p.folderPath.startsWith('browser://') && p.mainImages.length > 0,
    );
    if (serverProducts.length === 0) {
      setImagePreuploadProgress({ total: 0, done: 0, phase: 'complete' });
      return;
    }

    const abort = new AbortController();
    imagePreuploadAbort.current = abort;
    setImagePreuploadProgress({ total: serverProducts.length, done: 0, phase: 'uploading' });

    const CHUNK = 5; // 5개 상품씩 배치
    for (let i = 0; i < serverProducts.length; i += CHUNK) {
      if (abort.signal.aborted) break;
      const chunk = serverProducts.slice(i, i + CHUNK);
      try {
        const res = await fetch('/api/sellerhub/products/bulk-register/preupload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: chunk.map((p) => ({
              uid: p.uid,
              productCode: p.productCode,
              mainImages: p.mainImages,
              detailImages: p.detailImages,
              reviewImages: p.reviewImages,
              infoImages: p.infoImages,
            })),
            includeReviewImages,
          }),
          signal: abort.signal,
        });
        if (res.ok) {
          const data = await res.json() as { results: Record<string, { mainImageUrls: string[]; detailImageUrls: string[]; reviewImageUrls: string[]; infoImageUrls: string[] }> };
          setImagePreuploadCache((prev) => ({ ...prev, ...data.results }));
        }
      } catch {
        if (abort.signal.aborted) break;
      }
      setImagePreuploadProgress((prev) => ({
        ...prev,
        done: Math.min(i + CHUNK, serverProducts.length),
      }));
    }
    if (!abort.signal.aborted) {
      setImagePreuploadProgress((prev) => ({ ...prev, phase: 'complete' }));
    }
  }, [includeReviewImages]);

  // ---- 파이프라인: 전체 검증 (딥 + Dry-Run + 이미지 사전업로드 동시) ----
  const handleDeepValidation = useCallback(async () => {
    const targetProducts = products.filter((p) => p.selected);
    if (targetProducts.length === 0) return;

    setValidating(true);
    setValidationPhase('deep');

    // 이미지 사전업로드 백그라운드 시작 (검증과 동시 실행)
    startImagePreupload(targetProducts);

    try {
      // 딥 검증 + Dry-Run 동시
      const BATCH = 100;
      for (let i = 0; i < targetProducts.length; i += BATCH) {
        const batch = targetProducts.slice(i, i + BATCH);
        const res = await fetch('/api/sellerhub/products/bulk-register/validate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map((p) => ({
              uid: p.uid,
              editedName: p.editedName,
              editedBrand: p.editedBrand,
              editedSellingPrice: p.editedSellingPrice,
              editedCategoryCode: p.editedCategoryCode,
              sourcePrice: p.sourcePrice,
              mainImageCount: p.scannedMainImages?.length ?? p.mainImageCount,
              detailImageCount: p.detailImageCount,
              infoImageCount: p.infoImageCount,
              reviewImageCount: p.reviewImageCount,
            })),
            contactNumber,
            dryRun: true,
            deliveryInfo: {
              outboundShippingPlaceCode: selectedOutbound,
              returnCenterCode: selectedReturn,
              deliveryChargeType,
              deliveryCharge: deliveryChargeType === 'FREE' ? 0 : deliveryCharge,
              returnCharge,
            },
            stock: 999,
          }),
        });

        if (res.ok) {
          const data = await res.json() as {
            results: Record<string, ProductValidationResult & {
              payloadPreview?: Record<string, unknown>;
              missingRequiredFields?: string[];
            }>;
            categoryMeta: Record<string, CategoryMetadata>;
          };

          // 검증 결과 반영
          setProducts((prev) =>
            prev.map((p) => {
              const r = data.results[p.uid];
              if (!r) return p;
              return {
                ...p,
                validationStatus: r.status,
                validationErrors: r.errors,
                validationWarnings: r.warnings,
              };
            }),
          );

          // Dry-Run 결과 저장
          const newDryRun: typeof dryRunResults = {};
          for (const [uid, r] of Object.entries(data.results)) {
            if (r.payloadPreview || r.missingRequiredFields) {
              newDryRun[uid] = {
                payloadPreview: r.payloadPreview as typeof dryRunResults[string]['payloadPreview'],
                missingRequiredFields: r.missingRequiredFields,
              };
            }
          }
          setDryRunResults((prev) => ({ ...prev, ...newDryRun }));

          // categoryMeta 캐시 업데이트
          if (data.categoryMeta) {
            setCategoryMetaCache((prev) => ({ ...prev, ...data.categoryMeta }));
          }
        }
      }

      setValidationPhase('complete');
    } catch {
      // 검증 실패 → 무시 (로컬 검증 결과 유지)
    } finally {
      setValidating(false);
    }
  }, [products, contactNumber, selectedOutbound, selectedReturn, deliveryChargeType, deliveryCharge, returnCharge, startImagePreupload, dryRunResults]);

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

  // ---- Step 1: 다중 폴더 스캔 + 카테고리 자동매칭 ----
  const serverFolderPaths = folderPaths.filter((fp) => !fp.startsWith('browser://'));

  const handleScan = useCallback(async () => {
    const serverPaths = folderPaths.filter((fp) => !fp.startsWith('browser://'));
    if (serverPaths.length === 0) {
      setScanError('서버에서 접근 가능한 폴더 경로를 추가해주세요.');
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
      const allEditableProducts: EditableProduct[] = [];
      let latestBrackets: PriceBracket[] | null = null;

      for (const fp of serverPaths) {
        const res = await fetch(`/api/sellerhub/products/bulk-register?folderPath=${encodeURIComponent(fp)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(`[${fp}] ${data.error || '스캔 실패'}`);

        if (data.brackets) latestBrackets = data.brackets;

        const editableProducts: EditableProduct[] = (data.products as PreviewProduct[]).map((p) => ({
          ...p,
          uid: `${p.folderPath}::${p.productCode}`,
          editedName: p.name,
          editedBrand: p.brand,
          editedSellingPrice: p.sellingPrice,
          editedCategoryCode: '',
          editedCategoryName: '',
          categoryConfidence: 0,
          categorySource: '',
          selected: true,
          status: 'pending' as const,
        }));

        allEditableProducts.push(...editableProducts);
      }

      if (latestBrackets) setBrackets(latestBrackets);
      setProducts(allEditableProducts);
      setStep(2);

      // 카테고리 자동매칭
      runAutoCategory(allEditableProducts);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : '스캔 실패');
    } finally {
      setScanning(false);
    }
  }, [folderPaths, selectedOutbound, selectedReturn, runAutoCategory]);

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
        return { ...p, editedSellingPrice: sellingPrice, sellingPrice };
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

  const selectCategory = useCallback((cat: CategoryItem) => {
    if (categorySearchTarget === 'bulk') {
      setProducts((prev) =>
        prev.map((p) =>
          p.selected
            ? { ...p, editedCategoryCode: cat.id, editedCategoryName: cat.path || cat.name, categoryConfidence: 1, categorySource: 'manual' }
            : p,
        ),
      );
    } else if (categorySearchTarget) {
      // uid로 매칭
      setProducts((prev) =>
        prev.map((p) =>
          p.uid === categorySearchTarget
            ? { ...p, editedCategoryCode: cat.id, editedCategoryName: cat.path || cat.name, categoryConfidence: 1, categorySource: 'manual' }
            : p,
        ),
      );
    }
    setCategorySearchTarget(null);
    setCategoryResults([]);
    setCategoryKeyword('');
  }, [categorySearchTarget]);

  // ---- 체크박스 (uid 기반) ----
  const toggleProduct = useCallback((uid: string) => {
    setProducts((prev) =>
      prev.map((p) => p.uid === uid ? { ...p, selected: !p.selected } : p),
    );
  }, []);

  const toggleAll = useCallback(() => {
    setProducts((prev) => {
      const allSelected = prev.every((p) => p.selected);
      return prev.map((p) => ({ ...p, selected: !allSelected }));
    });
  }, []);

  // ---- 인라인 편집 (uid 기반) ----
  const updateField = useCallback((uid: string, field: string, value: string | number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.uid === uid ? { ...p, [field]: value } : p,
      ),
    );
  }, []);

  // ---- 일괄 작업 ----
  const applyBulkBrand = useCallback(() => {
    if (!bulkBrandValue.trim()) return;
    setProducts((prev) =>
      prev.map((p) => p.selected ? { ...p, editedBrand: bulkBrandValue } : p),
    );
    setBulkAction(null);
    setBulkBrandValue('');
  }, [bulkBrandValue]);

  const applyBulkPrice = useCallback(() => {
    if (bulkPriceAdjust === 0) return;
    setProducts((prev) =>
      prev.map((p) => {
        if (!p.selected) return p;
        const adjusted = Math.ceil((p.editedSellingPrice * (1 + bulkPriceAdjust / 100)) / 100) * 100;
        return { ...p, editedSellingPrice: Math.max(100, adjusted) };
      }),
    );
    setBulkAction(null);
    setBulkPriceAdjust(0);
  }, [bulkPriceAdjust]);

  // ---- Step 3: 배치 등록 (uid 기반) ----
  const handleRegister = useCallback(async () => {
    // 에러 상품 제외
    const selectedProducts = products.filter(
      (p) => p.selected && p.editedCategoryCode && p.validationStatus !== 'error',
    );
    if (selectedProducts.length === 0) {
      alert('등록 가능한 선택 상품이 없습니다. (카테고리 미지정 또는 검증 오류)');
      return;
    }

    setStep(3);
    setRegistering(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setStartTime(Date.now());

    // 이미지 사전업로드 완료 대기 (최대 30초)
    const preuploadDone = imagePreuploadProgress.phase === 'complete' || imagePreuploadProgress.phase === 'idle';
    if (!preuploadDone) {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 30000) {
        await new Promise((r) => setTimeout(r, 500));
        // imagePreuploadProgress는 state라서 직접 참조 불가 → 바로 진행
        break;
      }
    }

    const BATCH_SIZE = 10; // 이미지 사전업로드 덕분에 10개씩 가능

    // Reset statuses
    setProducts((prev) =>
      prev.map((p) =>
        p.selected && p.editedCategoryCode ? { ...p, status: 'pending' } : p,
      ),
    );

    try {
      // 1. init-job (캐시된 카테고리 메타는 제외)
      const uniqueCategoryCodes = [...new Set(selectedProducts.map((p) => p.editedCategoryCode))];
      const uncachedCodes = uniqueCategoryCodes.filter((c) => !categoryMetaCache[c]);
      const initRes = await fetch('/api/sellerhub/products/bulk-register/init-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalCount: selectedProducts.length,
          categoryCodes: uncachedCodes,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Job 초기화 실패');

      const { jobId } = initData;
      // 캐시와 신규 메타 병합
      const categoryMeta = { ...categoryMetaCache, ...(initData.categoryMeta || {}) };

      // 2. 배치 분할
      const batches: EditableProduct[][] = [];
      for (let i = 0; i < selectedProducts.length; i += BATCH_SIZE) {
        batches.push(selectedProducts.slice(i, i + BATCH_SIZE));
      }
      setBatchProgress({ current: 0, total: batches.length });

      let totalSuccess = 0;
      let totalError = 0;

      // 3. 순차 배치 실행
      for (let i = 0; i < batches.length; i++) {
        // 일시정지 체크
        while (isPausedRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }

        const batch = batches[i];

        // 배치 상품 상태를 registering으로 (uid 기반)
        const batchUids = new Set(batch.map((p) => p.uid));
        setProducts((prev) =>
          prev.map((p) => batchUids.has(p.uid) ? { ...p, status: 'registering' } : p),
        );

        // 사전 업로드된 이미지 URL 활용 + 클라이언트 스캔 상품 처리
        const batchProducts = [];
        for (const p of batch) {
          const meta = categoryMeta?.[p.editedCategoryCode] || { noticeMeta: [], attributeMeta: [] };
          const product: Record<string, unknown> = {
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
          };

          // 1) 사전 업로드된 URL이 있으면 사용 (파이프라인)
          const cached = imagePreuploadCache[p.uid];
          if (cached) {
            product.preUploadedUrls = cached;
          }
          // 2) 클라이언트에서 스캔한 이미지 파일이 있으면 브라우저에서 직접 업로드
          else if (p.scannedMainImages || p.scannedDetailImages) {
            const mainUrls = await uploadScannedImages(p.scannedMainImages || [], 10);
            const detailUrls = await uploadScannedImages(p.scannedDetailImages || [], 10);
            const reviewUrls = includeReviewImages ? await uploadScannedImages(p.scannedReviewImages || [], 10) : [];
            const infoUrls = await uploadScannedImages(p.scannedInfoImages || [], 10);
            product.preUploadedUrls = {
              mainImageUrls: mainUrls,
              detailImageUrls: detailUrls,
              reviewImageUrls: reviewUrls,
              infoImageUrls: infoUrls,
            };
          }
          // 3) 둘 다 아니면 서버에서 로컬 파일 업로드 (기존 방식)

          batchProducts.push(product);
        }

        try {
          const batchRes = await fetch('/api/sellerhub/products/bulk-register/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              batchIndex: i,
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
              generateAiContent,
              includeReviewImages,
              noticeOverrides: Object.keys(noticeOverrides).length > 0 ? noticeOverrides : undefined,
              products: batchProducts,
            }),
          });
          const batchData = await batchRes.json();

          if (batchRes.ok && batchData.results) {
            const batchResults = batchData.results as BatchResult[];
            totalSuccess += batchData.successCount || 0;
            totalError += batchData.errorCount || 0;

            // uid 기반 상태 업데이트
            setProducts((prev) =>
              prev.map((p) => {
                const r = batchResults.find((br) => br.uid === p.uid);
                if (!r) return p;
                return {
                  ...p,
                  status: r.success ? 'success' : 'error',
                  channelProductId: r.channelProductId,
                  errorMessage: r.error,
                  duration: r.duration,
                };
              }),
            );
          } else {
            // 전체 배치 실패
            totalError += batch.length;
            setProducts((prev) =>
              prev.map((p) =>
                batchUids.has(p.uid)
                  ? { ...p, status: 'error', errorMessage: batchData.error || '배치 실패' }
                  : p,
              ),
            );
          }
        } catch (err) {
          totalError += batch.length;
          setProducts((prev) =>
            prev.map((p) =>
              batchUids.has(p.uid)
                ? { ...p, status: 'error', errorMessage: err instanceof Error ? err.message : '네트워크 오류' }
                : p,
            ),
          );
        }

        setBatchProgress({ current: i + 1, total: batches.length });
      }

      // 4. complete-job
      await fetch('/api/sellerhub/products/bulk-register/complete-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, successCount: totalSuccess, errorCount: totalError }),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setRegistering(false);
    }
  }, [products, deliveryChargeType, deliveryCharge, freeShipOverAmount, returnCharge, selectedOutbound, selectedReturn, contactNumber, generateAiContent, includeReviewImages, noticeOverrides, categoryMetaCache, imagePreuploadCache, imagePreuploadProgress.phase]);

  // ---- 계산 ----
  const selectedProducts = products.filter((p) => p.selected);
  const selectedCount = selectedProducts.length;
  const totalSourcePrice = selectedProducts.reduce((s, p) => s + p.sourcePrice, 0);
  const totalSellingPrice = selectedProducts.reduce((s, p) => s + p.editedSellingPrice, 0);
  const successCount = products.filter((p) => p.status === 'success').length;
  const failCount = products.filter((p) => p.status === 'error').length;
  const pendingCount = products.filter((p) => p.selected && p.status === 'pending').length;

  // 검증 통계
  const validationReadyCount = products.filter((p) => p.validationStatus === 'ready').length;
  const validationErrorCount = products.filter((p) => p.validationStatus === 'error').length;
  const validationWarningCount = products.filter((p) => p.validationStatus === 'warning').length;
  const registerableProducts = products.filter(
    (p) => p.selected && p.editedCategoryCode && p.validationStatus !== 'error',
  );
  const registerableCount = registerableProducts.length;

  // 문제 필터 적용된 상품 목록
  const displayedProducts = showProblemsOnly
    ? products.filter((p) => p.validationStatus === 'error' || p.validationStatus === 'warning')
    : products;

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const processedCount = successCount + failCount;
  const avgPerProduct = processedCount > 0 ? elapsed / processedCount : 0;
  const remainingEstimate = avgPerProduct > 0 ? Math.ceil(avgPerProduct * pendingCount) : 0;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}초`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

  return (
    <div className="space-y-6">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: '설정', icon: '1' },
          { num: 2, label: '검증', icon: '2' },
          { num: 3, label: '등록', icon: '3' },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                step === s.num
                  ? 'bg-[#E31837] text-white shadow-sm'
                  : step > s.num
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.icon}</span>}
              {s.label}
            </div>
          </div>
        ))}
        {products.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Package className="w-3.5 h-3.5" /> {products.length}개 스캔됨
            </span>
            {imagePreuploadProgress.phase === 'uploading' && (
              <span className="flex items-center gap-1 text-xs text-purple-500">
                <Upload className="w-3.5 h-3.5 animate-pulse" />
                이미지 업로드 {imagePreuploadProgress.done}/{imagePreuploadProgress.total}
              </span>
            )}
            {imagePreuploadProgress.phase === 'complete' && Object.keys(imagePreuploadCache).length > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <ImageIcon className="w-3.5 h-3.5" />
                {Object.keys(imagePreuploadCache).length}개 업로드 완료
              </span>
            )}
          </div>
        )}
      </div>

      {/* ===== Step 1: 설정 ===== */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderSearch className="w-5 h-5 text-gray-500" /> 소싱 폴더 경로
            </h2>

            {/* 드롭존 */}
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 transition ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 bg-gray-50'
              }`}
            >
              {/* 폴더 칩 목록 */}
              {folderPaths.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {folderPaths.map((fp) => (
                    <div
                      key={fp}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm"
                    >
                      <Folder className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[400px]">{fp}</span>
                      <button
                        onClick={() => removeFolderPath(fp)}
                        className="p-0.5 hover:bg-blue-200 rounded transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 폴더 찾기 버튼 (가장 눈에 띄게) */}
              {folderPaths.length === 0 && (
                <button
                  onClick={handleBrowseFolder}
                  disabled={browsingFolder}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-3 text-sm font-medium text-[#E31837] bg-white border-2 border-[#E31837] rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
                >
                  {browsingFolder ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderOpen className="w-5 h-5" />}
                  {browsingFolder ? '폴더 읽는 중...' : '폴더 선택하기'}
                </button>
              )}

              {/* 입력 + 버튼 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFolderInputAdd();
                    }
                  }}
                  onPaste={handleFolderInputPaste}
                  placeholder="경로를 붙여넣거나 입력 (예: C:\Users\u\바탕 화면\100-2)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
                <button
                  onClick={handleFolderInputAdd}
                  disabled={!folderInput.trim()}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
                >
                  <Plus className="w-4 h-4" /> 추가
                </button>

                {/* 최근 경로 */}
                <div className="relative">
                  <button
                    onClick={handleShowRecentPaths}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    title="최근 경로"
                  >
                    <Clock className="w-4 h-4 text-gray-500" />
                  </button>
                  {showRecentPaths && (
                    <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                      {recentPaths.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">최근 사용한 경로가 없습니다.</div>
                      ) : (
                        recentPaths.map((rp) => (
                          <button
                            key={rp}
                            onClick={() => {
                              addFolderPath(rp);
                              setShowRecentPaths(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition truncate"
                          >
                            {rp}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 폴더 찾기 (칩이 있을 때 작은 아이콘) */}
                {folderPaths.length > 0 && (
                  <button
                    onClick={handleBrowseFolder}
                    disabled={browsingFolder}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                    title="폴더 선택"
                  >
                    {browsingFolder ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <FolderOpen className="w-4 h-4 text-gray-500" />}
                  </button>
                )}
              </div>

              {/* 드롭 안내 메시지 */}
              {dropMessage && (
                <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 whitespace-pre-line">
                  {dropMessage}
                </div>
              )}

              {/* 힌트 */}
              <p className="mt-2 text-xs text-gray-400">
                &quot;폴더 선택하기&quot;를 클릭하면 PC 폴더를 직접 선택할 수 있습니다. (Chrome/Edge 지원)
              </p>
            </div>

            <p className="mt-2 text-xs text-gray-400">
              product_* 하위 폴더를 자동 인식합니다. (product.json, main_images/, output/, reviews/, product_info/)
            </p>
          </div>

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

          {/* 옵션 토글 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-gray-500" /> 등록 옵션
            </h2>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`relative w-11 h-6 rounded-full transition ${generateAiContent ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={generateAiContent}
                    onChange={(e) => setGenerateAiContent(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${generateAiContent ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">AI 상세페이지 생성</div>
                  <div className="text-xs text-gray-400">GPT-4o-mini로 감성 스토리 자동 생성</div>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`relative w-11 h-6 rounded-full transition ${includeReviewImages ? 'bg-[#E31837]' : 'bg-gray-200'}`}>
                  <input
                    type="checkbox"
                    checked={includeReviewImages}
                    onChange={(e) => setIncludeReviewImages(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${includeReviewImages ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">리뷰 이미지 포함</div>
                  <div className="text-xs text-gray-400">reviews/ 폴더 이미지를 상세페이지에 삽입</div>
                </div>
              </label>
            </div>
          </div>

          {/* 마진율 */}
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

          {/* notices 편집 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">상품정보제공고시 기본값</h2>
            <p className="text-xs text-gray-400 mb-4">
              비어있는 필드는 &quot;상세페이지 참조&quot;로 자동 입력됩니다.
            </p>
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
                      if (e.target.value) {
                        newOverrides[key] = e.target.value;
                      } else {
                        delete newOverrides[key];
                      }
                      setNoticeOverrides(newOverrides);
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
                onClick={handleScan}
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
      )}

      {/* ===== Step 2: 편집 테이블 ===== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* 자동매칭 진행 */}
          {autoMatchingProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700">
                카테고리 자동매칭 중... {autoMatchingProgress.done}/{autoMatchingProgress.total}
              </span>
              <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(autoMatchingProgress.done / autoMatchingProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ====== 검증 대시보드 ====== */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" /> 검증 대시보드
              </h3>
              <button
                onClick={handleDeepValidation}
                disabled={validating || selectedCount === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {validating ? `검증 + 업로드 진행 중...` : '전체 검증 + 이미지 사전업로드'}
              </button>
            </div>

            {/* 통계 카드 그리드 */}
            <div className="grid grid-cols-6 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{products.length}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">전체 상품</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-600">{selectedCount}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">선택됨</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-600">{validationReadyCount}</div>
                <div className="text-[10px] text-green-600 mt-0.5 flex items-center justify-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> 등록 가능
                </div>
              </div>
              <div className={`rounded-lg p-3 text-center ${validationWarningCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
                <div className={`text-lg font-bold ${validationWarningCount > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{validationWarningCount}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> 경고
                </div>
              </div>
              <div className={`rounded-lg p-3 text-center ${validationErrorCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className={`text-lg font-bold ${validationErrorCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{validationErrorCount}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                  <XCircle className="w-3 h-3" /> 오류
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-700">
                  {products.filter((p) => p.editedCategoryCode).length}/{products.length}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">카테고리 매칭</div>
              </div>
            </div>

            {/* 가격 요약 */}
            <div className="flex items-center gap-6 mb-4 text-sm">
              <span className="text-gray-500">총 원가: <strong className="text-gray-700">{totalSourcePrice.toLocaleString()}원</strong></span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-500">총 판매가: <strong className="text-[#E31837]">{totalSellingPrice.toLocaleString()}원</strong></span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">예상 마진: <strong className="text-green-600">{(totalSellingPrice - totalSourcePrice).toLocaleString()}원</strong></span>
            </div>

            {/* 파이프라인 진행 상태 */}
            {(validationPhase !== 'idle' || imagePreuploadProgress.phase !== 'idle') && (
              <div className="space-y-2 mb-4">
                {/* 검증 진행 */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-36 text-xs">
                    {validationPhase === 'complete' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    ) : validating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    ) : (
                      <CircleDot className="w-3.5 h-3.5 text-gray-300" />
                    )}
                    <span className={validationPhase === 'complete' ? 'text-green-600' : validating ? 'text-blue-600' : 'text-gray-400'}>
                      Dry-Run 검증
                    </span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${validationPhase === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: validationPhase === 'complete' ? '100%' : validating ? '60%' : '0%' }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-16 text-right">
                    {validationPhase === 'complete' ? '완료' : validating ? '진행중' : '대기'}
                  </span>
                </div>

                {/* 이미지 사전 업로드 진행 */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-36 text-xs">
                    {imagePreuploadProgress.phase === 'complete' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    ) : imagePreuploadProgress.phase === 'uploading' ? (
                      <Upload className="w-3.5 h-3.5 animate-pulse text-purple-500" />
                    ) : (
                      <CircleDot className="w-3.5 h-3.5 text-gray-300" />
                    )}
                    <span className={
                      imagePreuploadProgress.phase === 'complete' ? 'text-green-600' :
                      imagePreuploadProgress.phase === 'uploading' ? 'text-purple-600' : 'text-gray-400'
                    }>
                      이미지 사전업로드
                    </span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${imagePreuploadProgress.phase === 'complete' ? 'bg-green-500' : 'bg-purple-500'}`}
                      style={{
                        width: imagePreuploadProgress.total > 0
                          ? `${(imagePreuploadProgress.done / imagePreuploadProgress.total) * 100}%`
                          : imagePreuploadProgress.phase === 'complete' ? '100%' : '0%',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-16 text-right">
                    {imagePreuploadProgress.phase === 'complete'
                      ? '완료'
                      : imagePreuploadProgress.total > 0
                        ? `${imagePreuploadProgress.done}/${imagePreuploadProgress.total}`
                        : '대기'}
                  </span>
                </div>
              </div>
            )}

            {/* Dry-Run 결과 요약 */}
            {Object.keys(dryRunResults).length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">Dry-Run 검증 결과 (쿠팡 API 페이로드 사전 검증)</span>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-blue-500">페이로드 생성:</span>
                    <strong className="ml-1 text-blue-700">{Object.keys(dryRunResults).length}건</strong>
                  </div>
                  <div>
                    <span className="text-blue-500">필수필드 누락:</span>
                    <strong className={`ml-1 ${
                      Object.values(dryRunResults).some((r) => r.missingRequiredFields && r.missingRequiredFields.length > 0)
                        ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {Object.values(dryRunResults).filter((r) => r.missingRequiredFields && r.missingRequiredFields.length > 0).length}건
                    </strong>
                  </div>
                  <div>
                    <span className="text-blue-500">상세페이지:</span>
                    <strong className="ml-1 text-blue-700">
                      {Object.values(dryRunResults).filter((r) => r.payloadPreview?.hasDetailPage).length}건
                    </strong>
                  </div>
                  <div>
                    <span className="text-blue-500">이미지 업로드:</span>
                    <strong className="ml-1 text-purple-600">
                      {Object.keys(imagePreuploadCache).length}건 완료
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* 필터 + 도구 */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProblemsOnly}
                  onChange={(e) => setShowProblemsOnly(e.target.checked)}
                  className="rounded border-gray-300 w-3.5 h-3.5"
                />
                <Filter className="w-3 h-3" />
                문제만 보기
              </label>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-400">
                표시: {displayedProducts.length}개 / 전체 {products.length}개
              </span>
            </div>
          </div>

          {/* 일괄 작업 툴바 */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-gray-500">일괄 작업:</span>
            <button
              onClick={() => setBulkAction(bulkAction === 'brand' ? null : 'brand')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                bulkAction === 'brand' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              브랜드 변경
            </button>
            <button
              onClick={() => { setBulkAction(bulkAction === 'category' ? null : 'category'); if (bulkAction !== 'category') { setCategorySearchTarget('bulk'); } }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                bulkAction === 'category' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              카테고리 변경
            </button>
            <button
              onClick={() => setBulkAction(bulkAction === 'price' ? null : 'price')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                bulkAction === 'price' ? 'bg-[#E31837] text-white border-[#E31837]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              가격 조정
            </button>

            {bulkAction === 'brand' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bulkBrandValue}
                  onChange={(e) => setBulkBrandValue(e.target.value)}
                  placeholder="브랜드명"
                  className="px-2 py-1 border border-gray-300 rounded text-xs w-32"
                />
                <button onClick={applyBulkBrand} className="px-2 py-1 text-xs bg-[#E31837] text-white rounded">
                  선택 상품에 적용
                </button>
              </div>
            )}
            {bulkAction === 'price' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bulkPriceAdjust}
                  onChange={(e) => setBulkPriceAdjust(Number(e.target.value))}
                  placeholder="조정률 (%)"
                  className="px-2 py-1 border border-gray-300 rounded text-xs w-24"
                />
                <span className="text-xs text-gray-400">%</span>
                <button onClick={applyBulkPrice} className="px-2 py-1 text-xs bg-[#E31837] text-white rounded">
                  선택 상품에 적용
                </button>
              </div>
            )}

            <span className="ml-auto text-xs text-gray-400">
              {selectedCount}개 선택됨
            </span>
          </div>

          {/* 카테고리 검색 모달 */}
          {categorySearchTarget && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  카테고리 검색 {categorySearchTarget === 'bulk' ? '(선택 상품 일괄)' : ''}
                </h3>
                <button onClick={() => { setCategorySearchTarget(null); setCategoryResults([]); setCategoryKeyword(''); }} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
              </div>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={categoryKeyword}
                    onChange={(e) => setCategoryKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchCategory()}
                    placeholder="카테고리 검색 (예: 비오틴, 비타민)"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSearchCategory}
                  disabled={searchingCategory}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {searchingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : '검색'}
                </button>
              </div>
              {categoryResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {categoryResults.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => selectCategory(cat)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition"
                    >
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{cat.path}</span>
                      <span className="text-xs text-gray-300 ml-1">({cat.id})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 상품 편집 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={products.length > 0 && products.every((p) => p.selected)}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
                전체 선택
              </label>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>배송: {deliveryChargeType === 'FREE' ? '무료' : deliveryChargeType === 'CONDITIONAL_FREE' ? `${freeShipOverAmount.toLocaleString()}원 이상 무료` : `${deliveryCharge.toLocaleString()}원`}</span>
                <button onClick={() => setStep(1)} className="text-[#E31837] hover:underline">설정 수정</button>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-8" />
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-16">코드</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">상품명</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-24">브랜드</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 w-20">원가</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 w-24">판매가</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-48">카테고리</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 w-8">대</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 w-8">상</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 w-8">리</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 w-8">정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedProducts.map((p) => (
                    <ProductRow
                      key={p.uid}
                      product={p}
                      onToggle={toggleProduct}
                      onUpdate={updateField}
                      onCategoryClick={(uid) => setCategorySearchTarget(uid)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
            <div className="flex items-center gap-3">
              {/* 사전 업로드 상태 표시 */}
              {imagePreuploadProgress.phase === 'complete' && Object.keys(imagePreuploadCache).length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  이미지 {Object.keys(imagePreuploadCache).length}개 준비 완료
                </span>
              )}
              {imagePreuploadProgress.phase === 'uploading' && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs">
                  <Upload className="w-3.5 h-3.5 animate-pulse" />
                  이미지 업로드 중... ({imagePreuploadProgress.done}/{imagePreuploadProgress.total})
                </span>
              )}
              <button
                onClick={handleRegister}
                disabled={registerableCount === 0 || products.some((p) => p.selected && p.validationStatus === 'error')}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50 transition shadow-sm"
              >
                <Zap className="w-4 h-4" />
                {registerableCount}개 등록 시작
                {validationErrorCount > 0 && (
                  <span className="text-xs opacity-75">({validationErrorCount}개 제외)</span>
                )}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Step 3: 등록 진행 ===== */}
      {step === 3 && (
        <div className="space-y-6">
          {/* 진행률 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {registering ? (
                  <>
                    등록 진행 중 — 배치 {batchProgress.current}/{batchProgress.total}
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      ({Object.keys(imagePreuploadCache).length > 0 ? '이미지 사전업로드 적용' : '일반 모드'}, 배치 크기 10)
                    </span>
                  </>
                ) : '등록 완료'}
              </h2>
              {registering && (
                <button
                  onClick={() => {
                    const next = !isPaused;
                    setIsPaused(next);
                    isPausedRef.current = next;
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition ${
                    isPaused
                      ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                      : 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? '재개' : '일시정지'}
                </button>
              )}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
              <div
                className="bg-[#E31837] h-4 rounded-full transition-all duration-300 flex items-center justify-center"
                style={{ width: `${selectedCount > 0 ? (processedCount / selectedCount) * 100 : 0}%` }}
              >
                {processedCount > 0 && (
                  <span className="text-[10px] text-white font-medium">
                    {Math.round((processedCount / selectedCount) * 100)}%
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex gap-4">
                <span className="text-green-600">성공: {successCount}</span>
                <span className="text-red-600">실패: {failCount}</span>
                <span className="text-gray-400">대기: {pendingCount}</span>
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>경과: {formatTime(elapsed)}</span>
                {registering && remainingEstimate > 0 && (
                  <span>예상 남은: {formatTime(remainingEstimate)}</span>
                )}
              </div>
            </div>
          </div>

          {/* 완료 통계 */}
          {!registering && (
            <div className="grid grid-cols-3 gap-4">
              <StatBox label="전체" value={selectedCount} />
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

          {/* 상품별 상태 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-medium text-gray-700">
              등록 상태
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 w-12">상태</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-16">코드</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">상품명</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-32">쿠팡 ID / 오류</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-16">소요</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.filter((p) => p.selected).map((p) => (
                    <tr key={p.uid} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-center">
                        {p.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />}
                        {p.status === 'error' && <XCircle className="w-4 h-4 text-red-500 mx-auto" />}
                        {p.status === 'registering' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin mx-auto" />}
                        {p.status === 'pending' && <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs font-mono text-gray-500">{p.productCode}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 line-clamp-1">{p.editedName}</td>
                      <td className="px-4 py-2 text-xs">
                        {p.status === 'success' && (
                          <span className="text-green-600">#{p.channelProductId}</span>
                        )}
                        {p.status === 'error' && (
                          <span className="text-red-600 truncate max-w-[200px] block" title={p.errorMessage}>
                            {p.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 text-right">
                        {p.duration ? `${(p.duration / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!registering && (
            <div className="flex items-center justify-center">
              <button
                onClick={() => {
                  setStep(1);
                  setProducts([]);
                  setFolderPaths([]);
                  setFolderInput('');
                  setBatchProgress({ current: 0, total: 0 });
                  setStartTime(null);
                  setAutoMatchingProgress(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <RefreshCw className="w-4 h-4" /> 새로 등록하기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 서브 컴포넌트 ----

interface ProductRowProps {
  product: EditableProduct;
  onToggle: (uid: string) => void;
  onUpdate: (uid: string, field: string, value: string | number) => void;
  onCategoryClick: (uid: string) => void;
}

const ProductRow = memo(function ProductRow({ product: p, onToggle, onUpdate, onCategoryClick }: ProductRowProps) {
  // 필드별 에러 여부 확인
  const fieldHasError = (field: string) =>
    p.validationErrors?.some((e) => e.field === field) || false;
  const fieldHasWarning = (field: string) =>
    p.validationWarnings?.some((w) => w.field === field) || false;

  const fieldBorderClass = (field: string, base: string) => {
    if (fieldHasError(field)) return base.replace('border-transparent', 'border-red-400');
    if (fieldHasWarning(field)) return base.replace('border-transparent', 'border-orange-300');
    return base;
  };

  // 모든 이슈를 툴팁용 텍스트로
  const allIssues = [...(p.validationErrors || []), ...(p.validationWarnings || [])];
  const tooltipText = allIssues.map((i) => `${i.severity === 'error' ? '[오류]' : '[경고]'} ${i.message}`).join('\n');

  return (
    <tr className={`hover:bg-gray-50 ${!p.selected ? 'opacity-50' : ''} ${p.validationStatus === 'error' ? 'bg-red-50/50' : ''}`}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={p.selected}
            onChange={() => onToggle(p.uid)}
            className="rounded border-gray-300"
          />
          {p.validationStatus && (
            <span title={tooltipText} className="cursor-help">
              {p.validationStatus === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              {p.validationStatus === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
              {p.validationStatus === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-500 font-mono">{p.productCode}</td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={p.editedName}
          onChange={(e) => onUpdate(p.uid, 'editedName', e.target.value)}
          title={fieldHasError('name') ? p.validationErrors?.find((e) => e.field === 'name')?.message : undefined}
          className={fieldBorderClass('name', "w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E31837] rounded text-sm text-gray-900 focus:ring-1 focus:ring-[#E31837] outline-none transition")}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={p.editedBrand}
          onChange={(e) => onUpdate(p.uid, 'editedBrand', e.target.value)}
          title={fieldHasWarning('brand') ? p.validationWarnings?.find((w) => w.field === 'brand')?.message : undefined}
          className={fieldBorderClass('brand', "w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E31837] rounded text-xs text-gray-700 focus:ring-1 focus:ring-[#E31837] outline-none transition")}
          placeholder="-"
        />
      </td>
      <td className="px-3 py-1.5 text-sm text-gray-700 text-right tabular-nums">
        {p.sourcePrice.toLocaleString()}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={p.editedSellingPrice}
          onChange={(e) => onUpdate(p.uid, 'editedSellingPrice', Number(e.target.value))}
          title={fieldHasError('sellingPrice') ? p.validationErrors?.find((e) => e.field === 'sellingPrice')?.message : undefined}
          className={fieldBorderClass('sellingPrice', "w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E31837] rounded text-sm text-[#E31837] font-medium text-right tabular-nums focus:ring-1 focus:ring-[#E31837] outline-none transition")}
        />
      </td>
      <td className="px-3 py-1.5">
        <button
          onClick={() => onCategoryClick(p.uid)}
          className="w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 transition group"
        >
          {p.editedCategoryCode ? (
            <>
              <span className="text-xs text-gray-700 truncate flex-1">{p.editedCategoryName}</span>
              {p.categoryConfidence > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded ${
                  p.categoryConfidence >= 0.8 ? 'bg-green-100 text-green-600' :
                  p.categoryConfidence >= 0.5 ? 'bg-yellow-100 text-yellow-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {Math.round(p.categoryConfidence * 100)}%
                </span>
              )}
              <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" />
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">카테고리 선택</span>
              <ChevronDown className="w-3 h-3 text-gray-300 shrink-0" />
            </>
          )}
        </button>
      </td>
      <td className="px-3 py-1.5 text-xs text-center text-gray-500">{p.mainImageCount}</td>
      <td className="px-3 py-1.5 text-xs text-center text-gray-500">{p.detailImageCount}</td>
      <td className="px-3 py-1.5 text-xs text-center">
        <span className={p.reviewImageCount > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
          {p.reviewImageCount}
        </span>
      </td>
      <td className="px-3 py-1.5 text-xs text-center text-gray-500">{p.infoImageCount}</td>
    </tr>
  );
});

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
