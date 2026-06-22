'use client';

/**
 * 올인원 자동등록 패널 (기존 대량등록과 완전 분리)
 * ---------------------------------------------------------------------------
 * 로컬 워커(run-folder.mjs)가 생성한 결과를 읽어 검수 후 쿠팡에 등록한다.
 *   1) 폴더 선택  → 워커가 남긴 `_allinone.generated.jsonl` 읽기 + main_images_regen 스캔
 *   2) 사전채움   → 노출명·카테고리(코드)·가격·옵션·상세를 워커 결과로 자동 표시(재생성 X)
 *   3) 검수       → 카드별 승인 체크 + 상세 토글
 *   4) 등록       → 공용 batch API(init-job → 이미지 업로드 → batch → complete-job)
 *
 * ⚠️ 기존 대량등록(BulkRegisterPanel/useBulkRegisterActions)은 일절 수정하지 않는다.
 *    공용 batch API 엔드포인트와 이미지 업로드 유틸만 호출(엔드포인트 자체도 무수정).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  scanDirectoryHandle,
  uploadScannedImages,
  ensureObjectUrl,
  type ScannedProduct,
  type ScannedImageFile,
} from '@/lib/megaload/services/client-folder-scanner';
import {
  MARGIN_PRESETS, applyMarginPreset, calculateSellingPrice, type MarginPresetLevel,
} from '@/lib/megaload/services/margin-pricing';

const BATCH_SIZE = 10;
const IMG_RE = /\.(png|jpg|jpeg|webp)$/i;

/** 워커 _allinone.generated.jsonl 한 줄 레코드 */
interface GenRecord {
  sourceId: string | null;
  originalName: string;
  sourceUrl: string | null;
  sourcePrice: number | null;
  sellingPrice: number | null;
  mainImage: string | null;
  displayName: string;
  keywords: string[];
  categoryCode: string | null;
  categoryPath: string;
  options: { name: string; value: string; unit?: string }[];
  detail: string;
  persona?: string;
  needsReview?: boolean;
  thumbProcessed?: boolean | null;
}

type RowStatus = 'idle' | 'registering' | 'success' | 'error';

interface Row {
  uid: string;
  productCode: string;
  folderPath: string;
  scanned: ScannedProduct;
  gen: GenRecord | null;
  /** 대표이미지: 워커 가공본(main_images_regen) 우선, 없으면 원본 main_images */
  mainImages: ScannedImageFile[];
  usingRegen: boolean;
  approved: boolean;
  status: RowStatus;
  message?: string;
  channelProductId?: string;
}

interface OutboundPlace { outboundShippingPlaceCode: number; placeName: string; placeAddresses?: string }
interface ReturnCenter { returnCenterCode: number; shippingPlaceName: string; returnAddress?: string }

const won = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString() + '원');

/** 등록 가능 최소 조건 — 서버가 거절할 항목(카테고리코드 없음/판매가<100)을 기본 승인에서 제외 */
function isEligible(g: GenRecord | null): boolean {
  return !!g && !!g.categoryCode && !!g.sellingPrice && g.sellingPrice >= 100;
}

/** 검수화면 프리셋 적용 시 유효 판매가 — level=null이면 워커 생성값 유지.
 *  원가(sourcePrice)가 있어야 재계산, 없으면 워커값 폴백. */
function effSellingPrice(g: GenRecord | null, level: MarginPresetLevel | null): number | null {
  if (!g) return null;
  if (level == null) return g.sellingPrice;
  if (!g.sourcePrice || g.sourcePrice <= 0) return g.sellingPrice;
  return calculateSellingPrice(g.sourcePrice, applyMarginPreset(level));
}

/** product_<코드> 폴더의 main_images_regen 을 ScannedImageFile[] 로 읽기(페이지 로컬 — 공용 스캐너 무수정) */
async function readRegenImages(dirHandle?: FileSystemDirectoryHandle): Promise<ScannedImageFile[]> {
  if (!dirHandle) return [];
  try {
    const sub = await dirHandle.getDirectoryHandle('main_images_regen');
    const acc: { name: string; handle: FileSystemFileHandle }[] = [];
    for await (const [name, handle] of sub as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file' && IMG_RE.test(name)) acc.push({ name, handle: handle as FileSystemFileHandle });
    }
    acc.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return Promise.all(
      acc.map(async ({ name, handle }) => {
        try {
          const f = await handle.getFile();
          return { name, handle, objectUrl: URL.createObjectURL(f) } as ScannedImageFile;
        } catch {
          return { name, handle } as ScannedImageFile;
        }
      }),
    );
  } catch {
    return [];
  }
}

/** 루트 폴더의 _allinone.generated.jsonl 을 productCode→레코드 맵으로 */
async function readGenerated(root: FileSystemDirectoryHandle): Promise<Map<string, GenRecord>> {
  const map = new Map<string, GenRecord>();
  try {
    const fh = await root.getFileHandle('_allinone.generated.jsonl');
    const text = await (await fh.getFile()).text();
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const r = JSON.parse(s) as GenRecord;
        if (r.sourceId != null) map.set(String(r.sourceId), r);
      } catch { /* skip bad line */ }
    }
  } catch { /* no file */ }
  return map;
}

export default function AllInOneRegisterPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({});
  // 마진 프리셋: null = 워커 생성값 그대로. 선택 시 원가×프리셋으로 판매가 재계산.
  const [marginLevel, setMarginLevel] = useState<MarginPresetLevel | null>(null);

  // 물류 정보
  const [outbounds, setOutbounds] = useState<OutboundPlace[]>([]);
  const [returns, setReturns] = useState<ReturnCenter[]>([]);
  // ⚠️ 쿠팡 빌더는 returnCenterCode 를 변환 없이 그대로 전달(coupang-product-builder.ts:815) →
  //    검증된 대량등록 경로와 동일하게 '문자열'로 보관·전송한다(숫자 보내면 페이로드 타입 어긋남).
  const [selectedOutbound, setSelectedOutbound] = useState('');
  const [selectedReturn, setSelectedReturn] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [shippingErr, setShippingErr] = useState('');
  const sellerBrandRef = useRef<string | undefined>(undefined);

  // 물류/셀러 정보 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/megaload/products/bulk-register/shipping-info', { signal: AbortSignal.timeout(30000) });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setShippingErr(data.error || '물류 정보 조회 실패'); return; }
        const ob: OutboundPlace[] = data.outboundShippingPlaces || [];
        const rc: ReturnCenter[] = data.returnShippingCenters || [];
        setOutbounds(ob);
        setReturns(rc);
        if (ob[0]) setSelectedOutbound(String(ob[0].outboundShippingPlaceCode));
        if (rc[0]) setSelectedReturn(String(rc[0].returnCenterCode));
      } catch (e) {
        if (!cancelled) setShippingErr(e instanceof Error ? e.message : '물류 정보 조회 실패');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const approvedCount = rows.filter((r) => r.approved && r.status !== 'success').length;

  // ── 폴더 선택 + 스캔 ──────────────────────────────────────────────
  const handlePick = useCallback(async () => {
    setError('');
    if (!('showDirectoryPicker' in window)) {
      setError('이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
      return;
    }
    setScanning(true);
    setScanMsg('폴더 여는 중…');
    try {
      const root = await (window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'read' });

      setScanMsg('워커 생성결과(_allinone.generated.jsonl) 읽는 중…');
      const genMap = await readGenerated(root);

      setScanMsg('상품 폴더 스캔 중…');
      const { products } = await scanDirectoryHandle(root, (p) =>
        setScanMsg(`스캔 ${p.current}/${p.total} ${p.currentName || ''}`));

      const built: Row[] = [];
      for (const sp of products) {
        const gen = genMap.get(sp.productCode) || null;
        const regen = await readRegenImages(sp.dirHandle);
        const mainImages = regen.length > 0 ? regen : (sp.mainImages || []);
        // 썸네일 표시용 objectURL 보장 — 공용 스캐너는 main_images 를 lazy(objectUrl 미생성)로 읽으므로
        // 가공본(regen)이 없는 상품은 첫 장 URL 을 즉시 만들어야 카드 썸네일이 보인다.
        if (mainImages[0] && !mainImages[0].objectUrl) {
          await ensureObjectUrl(mainImages[0]);
        }
        built.push({
          uid: sp.productCode || crypto.randomUUID(),
          productCode: sp.productCode,
          folderPath: sp.folderName || sp.productCode,
          scanned: sp,
          gen,
          mainImages,
          usingRegen: regen.length > 0,
          approved: isEligible(gen) && !gen?.needsReview,
          status: 'idle',
        });
      }
      built.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
      setRows(built);
      const withGen = built.filter((r) => r.gen).length;
      setScanMsg(`상품 ${built.length}개 · 워커결과 매칭 ${withGen}개 · 대표가공 ${built.filter((r) => r.usingRegen).length}개`);
      if (withGen === 0) {
        setError('이 폴더에서 워커 생성결과(_allinone.generated.jsonl)를 찾지 못했습니다. 먼저 워커에서 run-folder.mjs 를 실행하세요.');
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setScanMsg(''); }
      else setError(e instanceof Error ? e.message : '스캔 실패');
    } finally {
      setScanning(false);
    }
  }, []);

  const toggleApprove = (uid: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, approved: !r.approved } : r)));
  const setAll = (v: boolean) =>
    setRows((prev) => prev.map((r) => (r.status === 'success' ? r : { ...r, approved: v && isEligible(r.gen) })));

  // ── 등록 ─────────────────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    setError('');
    const targets = rows.filter((r) => r.approved && r.gen && r.status !== 'success');
    if (targets.length === 0) { setError('승인된 상품이 없습니다.'); return; }
    if (!selectedOutbound) { setError('출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!selectedReturn) { setError('반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!contactNumber.trim()) { setError('고객센터 연락처를 입력해주세요.'); return; }
    const missingImg = targets.filter((r) => r.mainImages.length === 0);
    if (missingImg.length > 0) { setError(`대표이미지가 없는 상품 ${missingImg.length}개가 있습니다. 워커에서 대표이미지 가공 후 다시 시도하세요.`); return; }

    setRegistering(true);
    setProgress({ done: 0, total: targets.length });
    try {
      // 1) init-job — 카테고리 메타 일괄 로드
      const uniqueCats = [...new Set(targets.map((r) => r.gen!.categoryCode).filter(Boolean).map(String))];
      const initRes = await fetch('/api/megaload/products/bulk-register/init-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalCount: targets.length, categoryCodes: uniqueCats }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Job 초기화 실패');
      const { jobId } = initData;
      const categoryMeta: Record<string, { noticeMeta: unknown[]; attributeMeta: unknown[] }> = initData.categoryMeta || {};

      // 2) 배치 분할 + 순차 등록
      let totalSuccess = 0, totalError = 0, doneCount = 0;
      for (let b = 0; b < targets.length; b += BATCH_SIZE) {
        const batch = targets.slice(b, b + BATCH_SIZE);
        const batchUids = new Set(batch.map((r) => r.uid));
        setRows((prev) => prev.map((r) => (batchUids.has(r.uid) ? { ...r, status: 'registering' as RowStatus } : r)));

        const products: Record<string, unknown>[] = [];
        for (const r of batch) {
          const g = r.gen!;
          const catCode = g.categoryCode ? String(g.categoryCode) : '';
          const meta = (catCode && categoryMeta[catCode]) || { noticeMeta: [], attributeMeta: [] };
          // 프리셋 적용 시 원가×마진으로 재계산, 미적용 시 워커 생성값. 정가는 판매가×1.5(할인 배지용).
          const effSelling = effSellingPrice(g, marginLevel) ?? g.sellingPrice ?? 0;
          const effOriginal = effSelling > 0 ? Math.ceil((effSelling * 1.5) / 100) * 100 : undefined;
          const wm = sellerBrandRef.current;
          // 이미지 업로드: 대표(가공본 우선) + 상세/리뷰/정보
          const mainUrls = (await uploadScannedImages(r.mainImages, 10, wm)).filter(Boolean);
          const detailUrls = (await uploadScannedImages(r.scanned.detailImages || [], 10, wm)).filter(Boolean);
          const reviewUrls = (await uploadScannedImages(r.scanned.reviewImages || [], 10, wm)).filter(Boolean);
          const infoUrls = (await uploadScannedImages(r.scanned.infoImages || [], 10, wm)).filter(Boolean);

          const pj = r.scanned.productJson || {};
          products.push({
            uid: r.uid,
            productCode: r.productCode,
            folderPath: r.folderPath,
            name: g.displayName || g.originalName,
            sourceName: g.originalName,
            sourceUrl: g.sourceUrl || r.scanned.sourceUrl,
            brand: (typeof pj.brand === 'string' ? pj.brand : '') || '',
            sellingPrice: effSelling,
            originalPrice: effOriginal,
            sourcePrice: g.sourcePrice ?? (typeof pj.price === 'number' ? pj.price : 0),
            categoryCode: catCode,
            categoryPath: g.categoryPath || '',
            tags: Array.isArray(pj.tags) ? pj.tags : (g.keywords || []),
            description: g.detail || '',
            mainImages: [], detailImages: [], reviewImages: [], infoImages: [],
            noticeMeta: meta.noticeMeta, attributeMeta: meta.attributeMeta,
            // 워커 생성값을 그대로 사용(서버 재생성 방지)
            aiDisplayName: g.displayName || undefined,
            descriptionOverride: g.detail || undefined,
            preUploadedUrls: {
              mainImageUrls: mainUrls,
              detailImageUrls: detailUrls,
              reviewImageUrls: reviewUrls,
              infoImageUrls: infoUrls,
            },
          });
        }

        try {
          const batchRes = await fetch('/api/megaload/products/bulk-register/batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(100_000),
            body: JSON.stringify({
              jobId, batchIndex: b / BATCH_SIZE,
              deliveryInfo: {
                deliveryCompanyCode: 'CJGLS', deliveryChargeType: 'FREE',
                deliveryCharge: 0, freeShipOverAmount: 0,
                deliveryChargeOnReturn: 3000, outboundShippingPlaceCode: selectedOutbound,
              },
              returnInfo: {
                returnCenterCode: selectedReturn, returnCharge: 3000,
                companyContactNumber: contactNumber, afterServiceContactNumber: contactNumber,
                afterServiceInformation: '상품 이상 시 고객센터로 연락 바랍니다.',
              },
              stock: 999, generateAiContent: false, includeReviewImages: true,
              products,
            }),
          });
          const batchData = await batchRes.json().catch(() => ({}));
          if (batchRes.ok && batchData.results) {
            totalSuccess += batchData.successCount || 0;
            totalError += batchData.errorCount || 0;
            const results = batchData.results as { uid?: string; success: boolean; channelProductId?: string; error?: string }[];
            setRows((prev) => prev.map((r) => {
              const res = results.find((x) => x.uid === r.uid);
              if (!res) return r;
              return { ...r, status: res.success ? 'success' : 'error', channelProductId: res.channelProductId, message: res.error };
            }));
          } else {
            totalError += batch.length;
            const msg = batchData.error || `배치 실패 (HTTP ${batchRes.status})`;
            setRows((prev) => prev.map((r) => (batchUids.has(r.uid) ? { ...r, status: 'error', message: msg } : r)));
          }
        } catch (err) {
          totalError += batch.length;
          const msg = err instanceof Error ? err.message : '네트워크 오류';
          setRows((prev) => prev.map((r) => (batchUids.has(r.uid) ? { ...r, status: 'error', message: msg } : r)));
        }
        doneCount += batch.length;
        setProgress({ done: doneCount, total: targets.length });
      }

      await fetch('/api/megaload/products/bulk-register/complete-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, successCount: totalSuccess, errorCount: totalError }),
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setRegistering(false);
    }
  }, [rows, selectedOutbound, selectedReturn, contactNumber, marginLevel]);

  return (
    <div className="space-y-5">
      {/* 물류 정보 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">출고지</label>
          <select className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
            value={selectedOutbound} onChange={(e) => setSelectedOutbound(e.target.value)}>
            <option value="">선택…</option>
            {outbounds.map((p) => (<option key={p.outboundShippingPlaceCode} value={String(p.outboundShippingPlaceCode)}>{p.placeName}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">반품지</label>
          <select className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
            value={selectedReturn} onChange={(e) => setSelectedReturn(e.target.value)}>
            <option value="">선택…</option>
            {returns.map((c) => (<option key={c.returnCenterCode} value={String(c.returnCenterCode)}>{c.shippingPlaceName}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">고객센터 연락처</label>
          <input className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" placeholder="010-0000-0000"
            value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </div>
        {shippingErr && <p className="sm:col-span-3 text-xs text-red-600">{shippingErr}</p>}
      </div>

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handlePick} disabled={scanning || registering}
          className="bg-[#E31837] text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
          {scanning ? '스캔 중…' : '소싱 폴더 선택'}
        </button>
        {rows.length > 0 && (
          <>
            <button onClick={() => setAll(true)} disabled={registering} className="text-sm border border-gray-300 rounded-lg px-3 py-2">전체 승인</button>
            <button onClick={() => setAll(false)} disabled={registering} className="text-sm border border-gray-300 rounded-lg px-3 py-2">전체 해제</button>
            <span className="text-sm text-gray-500">승인 <b className="text-gray-900">{approvedCount}</b> / {rows.length}건</span>
            <span className="flex-1" />
            <button onClick={handleRegister} disabled={registering || approvedCount === 0}
              className="bg-gray-900 text-white text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50">
              {registering ? `등록 중… ${progress.done}/${progress.total}` : `승인분 등록 (${approvedCount})`}
            </button>
          </>
        )}
      </div>
      {scanMsg && <p className="text-xs text-gray-500">{scanMsg}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* 마진 프리셋 — 원가×마진으로 판매가 즉시 재계산(워커 재실행 불필요). '워커 기본'은 생성값 유지 */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-500 mr-1">마진 프리셋:</span>
          <button type="button" onClick={() => setMarginLevel(null)} disabled={registering}
            className={`px-2.5 py-1 text-xs rounded-md border transition ${marginLevel === null ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            워커 기본
          </button>
          {MARGIN_PRESETS.map((preset) => {
            const isActive = marginLevel === preset.level;
            const tone = preset.tone === 'conservative' ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
              : preset.tone === 'aggressive' ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
              : 'text-gray-700 border-gray-300 hover:bg-gray-50';
            return (
              <button key={preset.level} type="button" disabled={registering} onClick={() => setMarginLevel(preset.level)}
                className={`px-2.5 py-1 text-xs rounded-md border transition ${isActive ? 'bg-[#E31837] text-white border-[#E31837]' : tone}`}>
                {preset.label}
              </button>
            );
          })}
          <span className="text-[11px] text-gray-400 ml-1">원가 기반 재계산 · 정가는 판매가×1.5(할인배지)</span>
        </div>
      )}

      {/* 카드 그리드 */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
        {rows.map((r) => {
          const g = r.gen;
          const thumb = r.mainImages[0]?.objectUrl;
          const statusColor = r.status === 'success' ? 'border-green-400' : r.status === 'error' ? 'border-red-400'
            : g?.needsReview ? 'border-amber-300' : 'border-gray-200';
          return (
            <div key={r.uid} className={`bg-white border ${statusColor} rounded-xl p-3 flex flex-col gap-2`}>
              <div className="flex gap-3">
                {thumb
                  ? <img src={thumb} alt="" className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-none" />
                  : <div className="w-20 h-20 rounded-lg bg-gray-100 flex-none" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {r.usingRegen && <span className="text-[10px] text-emerald-600 font-medium">AI 가공 대표</span>}
                    {g?.needsReview && <span className="text-[10px] bg-amber-400 text-white rounded px-1">검수필요</span>}
                    {!g && <span className="text-[10px] bg-gray-400 text-white rounded px-1">워커결과 없음</span>}
                    {r.status === 'success' && <span className="text-[10px] bg-green-500 text-white rounded px-1">등록완료</span>}
                    {r.status === 'error' && <span className="text-[10px] bg-red-500 text-white rounded px-1">실패</span>}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 leading-snug">{g?.displayName || r.scanned.productJson?.name || r.productCode}</div>
                  <div className="text-xs text-blue-600">{g?.categoryPath}{g?.categoryCode ? ` [${g.categoryCode}]` : ''}</div>
                  <div className="text-sm"><b className="text-[#E0245E]">{won(effSellingPrice(g, marginLevel))}</b>{g?.sourcePrice ? <span className="text-xs text-gray-400 line-through ml-1">{won(g.sourcePrice)}</span> : null}{marginLevel && effSellingPrice(g, marginLevel) !== g?.sellingPrice ? <span className="text-[10px] text-rose-500 ml-1">프리셋</span> : null}</div>
                </div>
              </div>
              {g && g.options.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {g.options.map((o, i) => (<span key={i} className="text-[11px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">{o.name}: {o.value}{o.unit || ''}</span>))}
                </div>
              )}
              {g?.sourceUrl && <a href={g.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 break-all">원본: {g.sourceUrl}</a>}
              {g && (
                <div>
                  <button onClick={() => setOpenDetail((p) => ({ ...p, [r.uid]: !p[r.uid] }))} className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1">
                    상세페이지 보기 {openDetail[r.uid] ? '▴' : '▾'}
                  </button>
                  {openDetail[r.uid] && <pre className="mt-1 text-[12px] whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-100 rounded p-2 max-h-72 overflow-auto">{g.detail}</pre>}
                </div>
              )}
              {r.message && <p className="text-[11px] text-red-600">{r.message}</p>}
              {r.channelProductId && <p className="text-[11px] text-green-700">쿠팡 상품ID: {r.channelProductId}</p>}
              <label className="flex items-center gap-2 text-sm mt-auto pt-1">
                <input type="checkbox" checked={r.approved} disabled={!g || r.status === 'success' || registering} onChange={() => toggleApprove(r.uid)} />
                등록 승인
              </label>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && !scanning && (
        <div className="text-center text-sm text-gray-400 py-16 border-2 border-dashed border-gray-200 rounded-xl">
          소싱 폴더를 선택하세요. 워커(run-folder.mjs)가 생성한 결과를 자동으로 불러옵니다.
        </div>
      )}
    </div>
  );
}
