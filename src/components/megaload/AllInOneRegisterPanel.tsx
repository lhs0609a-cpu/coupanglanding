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
import { focusNextField } from './focusNextField';
import PreUploadConfirmModal from './PreUploadConfirmModal';

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
  /** CLIP 대표컷 랭킹(점수 내림차순) — 웹이 대표후보를 이 순서로 재정렬(ComfyUI 미가동이어도 AI 선택 유지) */
  mainImageRanked?: { path: string; score: number | null }[] | null;
  /** CLIP 이 유지한 상세컷 절대경로(참고용) */
  detailImages?: string[];
  /** CLIP 이 광고/배송/리뷰컷으로 버린 상세 파일명 — 웹이 스캔한 상세이미지에서 정확히 이것만 제외 */
  detailDroppedNames?: string[];
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

interface OptionField { name: string; value: string; unit?: string }

/** 카드에서 직접 수정 가능한 등록값 — 워커 생성값(gen)을 초기값으로 복제해 보관한다.
 *  등록 시에는 gen 이 아니라 이 값을 전송한다(사용자가 한눈에 고친 결과 반영). */
interface RowEdit {
  displayName: string;
  sellingPrice: number | null;
  categoryCode: string;
  categoryPath: string;
  detail: string;
  options: OptionField[];
}

interface Row {
  uid: string;
  productCode: string;
  folderPath: string;
  scanned: ScannedProduct;
  gen: GenRecord | null;
  /** 사용자가 카드에서 수정한 등록값(초기값 = gen 복제) */
  edit: RowEdit;
  /** 대표이미지: 워커 가공본(main_images_regen) 우선, 없으면 CLIP 랭킹순으로 재정렬한 원본 main_images */
  mainImages: ScannedImageFile[];
  /** 상세이미지: CLIP 이 버린 광고/배송/리뷰컷을 제외한 상세컷(등록 업로드 대상) */
  detailImages: ScannedImageFile[];
  /** 대표컷이 CLIP(AI) 판단으로 선택/재정렬됐는지(뱃지 표시용) */
  mainAiPicked: boolean;
  usingRegen: boolean;
  approved: boolean;
  status: RowStatus;
  message?: string;
  channelProductId?: string;
}

interface OutboundPlace { outboundShippingPlaceCode: number; placeName: string; placeAddresses?: string }
interface ReturnCenter { returnCenterCode: number; shippingPlaceName: string; returnAddress?: string }

const won = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString() + '원');

/** gen → 초기 편집값 복제(불변 baseline 보존). gen 없으면 빈 값. */
function initEdit(g: GenRecord | null): RowEdit {
  return {
    displayName: g?.displayName || '',
    sellingPrice: g?.sellingPrice ?? null,
    categoryCode: g?.categoryCode || '',
    categoryPath: g?.categoryPath || '',
    detail: g?.detail || '',
    options: (g?.options || []).map((o) => ({ name: o.name, value: o.value, unit: o.unit })),
  };
}

/** 등록 가능 최소 조건 — 서버가 거절할 항목(카테고리코드 없음/판매가<100)을 기본 승인에서 제외.
 *  이제 gen 이 아니라 사용자 수정값(edit) 기준으로 판정한다. */
function isEligible(e: RowEdit): boolean {
  return !!e.categoryCode && e.sellingPrice != null && e.sellingPrice >= 100;
}

/**
 * 로컬 draft 로 버퍼링하는 입력칸.
 * 예전엔 onChange 마다 곧바로 전역 rows(setRows)를 갱신 → 카드 전체가 리렌더되며
 * 포커스가 날아가, 한 글자만 쳐도 다음 칸으로 튀는 문제가 있었음.
 * → 타이핑은 로컬 state 에만 반영하고, onBlur/Enter 에서만 전역 커밋한다.
 *   Enter 는 커밋 후 같은 카드의 다음 입력칸으로 포커스를 옮긴다(Tab 과 동일 효과).
 */
function DraftField({
  value, onCommit, disabled, placeholder, className, inputMode, sanitize,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputMode?: 'numeric' | 'text';
  /** 타이핑 즉시 정규화(예: 숫자만 남기기). 미지정이면 원문 그대로. */
  sanitize?: (v: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <input
      value={draft}
      inputMode={inputMode}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => setDraft(sanitize ? sanitize(e.target.value) : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          focusNextField(e.currentTarget);
        }
      }}
    />
  );
}

/** 프리셋 적용가 — level=null이면 워커 생성값. 원가(sourcePrice) 없으면 워커값 폴백.
 *  '프리셋' 버튼이 각 행 edit.sellingPrice 로 일괄 기록하는 데 사용(개별 수정은 그 뒤 덮어쓰기 가능). */
function presetPrice(g: GenRecord | null, level: MarginPresetLevel | null): number | null {
  if (!g) return null;
  if (level == null) return g.sellingPrice;
  if (!g.sourcePrice || g.sourcePrice <= 0) return g.sellingPrice;
  return calculateSellingPrice(g.sourcePrice, applyMarginPreset(level));
}

/** 절대경로/파일명 → 파일명(basename). 워커는 절대경로, 웹 스캐너는 파일명만 가지므로 이걸로 매칭. */
function basename(p: string): string {
  return (p || '').split(/[\\/]/).pop() || p || '';
}

/**
 * 대표후보를 CLIP(AI) 랭킹 순으로 재정렬 — 최적컷이 첫 장(=쿠팡 대표)이 되게 한다.
 * ComfyUI 가공본(regen)이 없을 때만 의미. 랭킹 없으면(구 jsonl·CLIP 미탑재) 원본 순서 유지.
 * @returns {images, picked} picked=AI 판단으로 순서가 정해졌는지
 */
function reorderMainByClip(
  scanned: ScannedImageFile[],
  gen: GenRecord | null,
): { images: ScannedImageFile[]; picked: boolean } {
  if (!gen || scanned.length < 2) return { images: scanned, picked: false };
  const rank = new Map<string, number>();
  if (Array.isArray(gen.mainImageRanked) && gen.mainImageRanked.length > 0) {
    // 점수 유효(=실제 CLIP 분류)한 항목이 있어야 AI 선택으로 인정. 전부 null 이면 폴백(원본순).
    const scored = gen.mainImageRanked.some((r) => r.score != null);
    if (!scored) return { images: scanned, picked: false };
    gen.mainImageRanked.forEach((r, i) => rank.set(basename(r.path), i));
  } else if (gen.mainImage) {
    rank.set(basename(gen.mainImage), -1); // 단일 최적컷만 아는 경우 — 그 컷을 맨 앞으로
  } else {
    return { images: scanned, picked: false };
  }
  const idxOf = (n: string) => (rank.has(n) ? (rank.get(n) as number) : Number.MAX_SAFE_INTEGER);
  const ordered = scanned
    .map((img, i) => ({ img, i }))
    .sort((a, b) => {
      const ra = idxOf(a.img.name), rb = idxOf(b.img.name);
      return ra !== rb ? ra - rb : a.i - b.i; // 안정 정렬(동순위는 원본 순서)
    })
    .map((x) => x.img);
  const changed = ordered.some((img, i) => img !== scanned[i]);
  return { images: ordered, picked: changed };
}

/**
 * 상세이미지에서 CLIP 이 버린 광고/배송/리뷰컷만 정확히 제외.
 * 워커가 준 detailDroppedNames(버린 파일명)만 뺀다 — 워커가 못 본 이미지(리뷰/대표오버플로 폴백)는 보존.
 * 전부 걸러지면(파일명 불일치 등) 원본 유지(안전 우선).
 */
function applyDetailCuration(scanned: ScannedImageFile[], gen: GenRecord | null): ScannedImageFile[] {
  if (!gen) return scanned;
  const dropped = new Set((gen.detailDroppedNames || []).map(basename));
  if (dropped.size === 0) return scanned;
  const filtered = scanned.filter((img) => !dropped.has(img.name));
  return filtered.length > 0 ? filtered : scanned;
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

interface GenScan {
  /** sourceId(=productCode) → 레코드 */
  map: Map<string, GenRecord>;
  /** _allinone.generated.jsonl 파일을 실제로 찾았는지 */
  fileFound: boolean;
  /** 파일 내 총 레코드 수(파싱 성공분) */
  recordCount: number;
  /** 매칭 디버그용 sourceId 샘플 */
  sampleSourceIds: string[];
  /** 파일을 찾은 위치(루트명 또는 하위폴더명) */
  foundIn?: string;
}

/** _allinone.generated.jsonl 을 productCode→레코드 맵으로. 루트에 없으면 한 단계 하위까지 탐색.
 *  진단을 위해 파일 존재 여부·레코드 수·키 샘플을 함께 반환한다. */
async function readGenerated(root: FileSystemDirectoryHandle): Promise<GenScan> {
  const map = new Map<string, GenRecord>();
  let fileFound = false;
  let recordCount = 0;
  let foundIn: string | undefined;

  const tryRead = async (dir: FileSystemDirectoryHandle, label: string): Promise<boolean> => {
    try {
      const fh = await dir.getFileHandle('_allinone.generated.jsonl');
      const text = await (await fh.getFile()).text();
      fileFound = true;
      foundIn = label;
      for (const line of text.split('\n')) {
        const s = line.trim();
        if (!s) continue;
        try {
          const r = JSON.parse(s) as GenRecord;
          recordCount++;
          if (r.sourceId != null) map.set(String(r.sourceId), r);
        } catch { /* skip bad line */ }
      }
      return true;
    } catch { return false; }
  };

  // 1) 루트에서 시도. 2) 못 찾으면 product_* 가 아닌 하위 폴더에서 시도(상위 폴더를 선택한 경우 대비).
  if (!(await tryRead(root, root.name))) {
    try {
      for await (const [name, handle] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (handle.kind !== 'directory' || name.startsWith('product_')) continue;
        if (await tryRead(handle as FileSystemDirectoryHandle, name)) break;
      }
    } catch { /* ignore */ }
  }

  return { map, fileFound, recordCount, sampleSourceIds: [...map.keys()].slice(0, 3), foundIn };
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
      const gscan = await readGenerated(root);
      const genMap = gscan.map;

      setScanMsg('상품 폴더 스캔 중…');
      const { products } = await scanDirectoryHandle(root, (p) =>
        setScanMsg(`스캔 ${p.current}/${p.total} ${p.currentName || ''}`));

      const built: Row[] = [];
      for (const sp of products) {
        const gen = genMap.get(sp.productCode) || null;
        const regen = await readRegenImages(sp.dirHandle);
        const usingRegen = regen.length > 0;
        // 대표: 가공본(regen)이 있으면 그게 이미 CLIP 최적컷의 가공 결과. 없으면 원본을 CLIP 랭킹순 재정렬.
        const reordered = usingRegen
          ? { images: regen, picked: true }
          : reorderMainByClip(sp.mainImages || [], gen);
        const mainImages = reordered.images;
        // 상세: CLIP 이 광고/배송/리뷰컷으로 버린 파일명만 제외(핸들 유지 → 등록 업로드 가능).
        const detailImages = applyDetailCuration(sp.detailImages || [], gen);
        // 썸네일 표시용 objectURL 보장 — 공용 스캐너는 main_images 를 lazy(objectUrl 미생성)로 읽으므로
        // 가공본(regen)이 없는 상품은 (재정렬 후) 첫 장 URL 을 즉시 만들어야 카드 썸네일이 보인다.
        if (mainImages[0] && !mainImages[0].objectUrl) {
          await ensureObjectUrl(mainImages[0]);
        }
        const edit = initEdit(gen);
        built.push({
          uid: sp.productCode || crypto.randomUUID(),
          productCode: sp.productCode,
          folderPath: sp.folderName || sp.productCode,
          scanned: sp,
          gen,
          edit,
          mainImages,
          detailImages,
          mainAiPicked: reordered.picked,
          usingRegen,
          approved: isEligible(edit) && !gen?.needsReview,
          status: 'idle',
        });
      }
      built.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
      setRows(built);
      const withGen = built.filter((r) => r.gen).length;
      setScanMsg(`상품 ${built.length}개 · 워커결과 매칭 ${withGen}개 · 대표가공 ${built.filter((r) => r.usingRegen).length}개`);
      if (withGen === 0) {
        const sampleCodes = built.slice(0, 3).map((r) => r.productCode);
        if (!gscan.fileFound) {
          // 파일 자체가 없음 — 가장 흔한 원인. product_* 는 찾았으므로 폴더는 맞고, 워커만 안 돌린 상태.
          setError(
            `product_* 폴더 ${built.length}개는 찾았지만 같은 폴더에 _allinone.generated.jsonl 이 없습니다. ` +
            `이 폴더에서 워커를 아직 실행하지 않았습니다. 프로젝트 루트 터미널에서 실행하세요:  node worker/run-folder.mjs "<선택한 폴더 절대경로>"  ` +
            `(가격·카테고리·옵션·상세 = ollama 로컬 LLM, 대표사진 누끼·흰배경 = ComfyUI 가 떠 있어야 합니다. ` +
            `누끼 없이 텍스트만 빠르게 만들려면 명령 끝에 --no-thumb 를 붙이세요.)`,
          );
        } else if (gscan.recordCount === 0) {
          setError('_allinone.generated.jsonl 파일은 있으나 레코드가 0건입니다. 워커가 중간에 중단됐을 수 있으니 다시 실행하세요.');
        } else {
          // 파일·레코드는 있는데 폴더코드와 키가 안 맞음 — 다른 폴더에서 생성된 파일일 가능성.
          setError(
            `_allinone.generated.jsonl(${gscan.foundIn || '루트'})에 ${gscan.recordCount}건이 있으나 폴더와 매칭 0개입니다(키 불일치). ` +
            `워커 sourceId 예: [${gscan.sampleSourceIds.join(', ') || '없음'}] ↔ 현재 폴더코드 예: [${sampleCodes.join(', ')}]. ` +
            `워커를 바로 이 폴더에서 다시 실행했는지 확인하세요.`,
          );
        }
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
    setRows((prev) => prev.map((r) => (r.status === 'success' ? r : { ...r, approved: v && isEligible(r.edit) })));

  // ── 인라인 편집 ──────────────────────────────────────────────────
  const patchEdit = (uid: string, patch: Partial<RowEdit>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, edit: { ...r.edit, ...patch } } : r)));
  const patchOption = (uid: string, idx: number, patch: Partial<OptionField>) =>
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const options = r.edit.options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
      return { ...r, edit: { ...r.edit, options } };
    }));
  const addOption = (uid: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid
      ? { ...r, edit: { ...r.edit, options: [...r.edit.options, { name: '', value: '' }] } } : r)));
  const removeOption = (uid: string, idx: number) =>
    setRows((prev) => prev.map((r) => (r.uid === uid
      ? { ...r, edit: { ...r.edit, options: r.edit.options.filter((_, i) => i !== idx) } } : r)));

  // 마진 프리셋 일괄 적용 — 각 행 edit.sellingPrice 에 원가×프리셋 결과를 기록(개별 수정은 그 뒤 덮어쓰기 가능).
  // level=null('워커 기본')은 워커 생성가로 되돌림.
  const applyPreset = (level: MarginPresetLevel | null) => {
    setMarginLevel(level);
    setRows((prev) => prev.map((r) => {
      if (r.status === 'success') return r;
      const p = presetPrice(r.gen, level);
      return p == null ? r : { ...r, edit: { ...r.edit, sellingPrice: p } };
    }));
  };

  // ── 업로드 전 책임 확인 게이트 ───────────────────────────────────
  const [preUploadOpen, setPreUploadOpen] = useState(false);
  const [preUploadCount, setPreUploadCount] = useState(0);
  // 버튼 클릭 → 필드 검증 통과 시에만 책임 확인 게이트 노출 (확인 후 handleRegister 실행)
  const requestRegister = useCallback(() => {
    setError('');
    const targets = rows.filter((r) => r.approved && r.gen && r.status !== 'success');
    if (targets.length === 0) { setError('승인된 상품이 없습니다.'); return; }
    if (!selectedOutbound) { setError('출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!selectedReturn) { setError('반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!contactNumber.trim()) { setError('고객센터 연락처를 입력해주세요.'); return; }
    const missingImg = targets.filter((r) => r.mainImages.length === 0);
    if (missingImg.length > 0) { setError(`대표이미지가 없는 상품 ${missingImg.length}개가 있습니다. 워커에서 대표이미지 가공 후 다시 시도하세요.`); return; }
    setPreUploadCount(targets.length);
    setPreUploadOpen(true);
  }, [rows, selectedOutbound, selectedReturn, contactNumber]);

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
      // 1) init-job — 카테고리 메타 일괄 로드 (사용자가 수정한 카테고리코드 기준)
      const uniqueCats = [...new Set(targets.map((r) => r.edit.categoryCode).filter(Boolean).map(String))];
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
          const e = r.edit;
          const catCode = e.categoryCode ? String(e.categoryCode) : '';
          const meta = (catCode && categoryMeta[catCode]) || { noticeMeta: [], attributeMeta: [] };
          // 사용자가 카드에서 수정한 판매가 사용(미입력 시 워커값 폴백). 정가는 판매가×1.5(할인 배지용).
          const effSelling = e.sellingPrice ?? g.sellingPrice ?? 0;
          const effOriginal = effSelling > 0 ? Math.ceil((effSelling * 1.5) / 100) * 100 : undefined;
          const dispName = e.displayName.trim() || g.displayName || g.originalName;
          // 편집한 서술형 옵션 → 태그로 안전 반영(가격·재고 판매변형 optionVariants 로는 보내지 않음).
          const optionTags = e.options
            .map((o) => `${o.name} ${o.value}${o.unit || ''}`.trim())
            .filter(Boolean);
          const wm = sellerBrandRef.current;
          // 이미지 업로드: 대표(가공본 우선·CLIP 랭킹 첫장) + 상세(CLIP 큐레이션) + 리뷰/정보
          const mainUrls = (await uploadScannedImages(r.mainImages, 10, wm)).filter(Boolean);
          const detailUrls = (await uploadScannedImages(r.detailImages, 10, wm)).filter(Boolean);
          const reviewUrls = (await uploadScannedImages(r.scanned.reviewImages || [], 10, wm)).filter(Boolean);
          const infoUrls = (await uploadScannedImages(r.scanned.infoImages || [], 10, wm)).filter(Boolean);

          const pj = r.scanned.productJson || {};
          const baseTags = Array.isArray(pj.tags) ? (pj.tags as string[]) : (g.keywords || []);
          products.push({
            uid: r.uid,
            productCode: r.productCode,
            folderPath: r.folderPath,
            name: dispName,
            sourceName: g.originalName,
            sourceUrl: g.sourceUrl || r.scanned.sourceUrl,
            brand: (typeof pj.brand === 'string' ? pj.brand : '') || '',
            sellingPrice: effSelling,
            originalPrice: effOriginal,
            sourcePrice: g.sourcePrice ?? (typeof pj.price === 'number' ? pj.price : 0),
            categoryCode: catCode,
            categoryPath: e.categoryPath || '',
            tags: [...new Set([...baseTags, ...optionTags])].slice(0, 20),
            description: e.detail || '',
            mainImages: [], detailImages: [], reviewImages: [], infoImages: [],
            noticeMeta: meta.noticeMeta, attributeMeta: meta.attributeMeta,
            // 사용자 수정값을 그대로 사용(서버 재생성 방지)
            aiDisplayName: dispName || undefined,
            descriptionOverride: e.detail || undefined,
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
  }, [rows, selectedOutbound, selectedReturn, contactNumber]);

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
            <button onClick={requestRegister} disabled={registering || approvedCount === 0}
              className="bg-gray-900 text-white text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50">
              {registering ? `등록 중… ${progress.done}/${progress.total}` : `승인분 등록 (${approvedCount})`}
            </button>
          </>
        )}
      </div>
      {scanMsg && <p className="text-xs text-gray-500">{scanMsg}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* 업로드 전 책임 확인 게이트 — 지재권/옵션명/책임동의 */}
      <PreUploadConfirmModal
        open={preUploadOpen}
        count={preUploadCount}
        onConfirm={() => { setPreUploadOpen(false); handleRegister(); }}
        onCancel={() => setPreUploadOpen(false)}
      />

      {/* 마진 프리셋 — 원가×마진으로 전 카드 판매가 일괄 기록(개별 수정은 그 뒤 카드에서 덮어쓰기). '워커 기본'은 생성값 복원 */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-500 mr-1">마진 프리셋:</span>
          <button type="button" onClick={() => applyPreset(null)} disabled={registering}
            className={`px-2.5 py-1 text-xs rounded-md border transition ${marginLevel === null ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            워커 기본
          </button>
          {MARGIN_PRESETS.map((preset) => {
            const isActive = marginLevel === preset.level;
            const tone = preset.tone === 'conservative' ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
              : preset.tone === 'aggressive' ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
              : 'text-gray-700 border-gray-300 hover:bg-gray-50';
            return (
              <button key={preset.level} type="button" disabled={registering} onClick={() => applyPreset(preset.level)}
                className={`px-2.5 py-1 text-xs rounded-md border transition ${isActive ? 'bg-[#E31837] text-white border-[#E31837]' : tone}`}>
                {preset.label}
              </button>
            );
          })}
          <span className="text-[11px] text-gray-400 ml-1">전 카드 판매가 일괄 적용 · 정가는 판매가×1.5(할인배지)</span>
        </div>
      )}

      {/* 카드 그리드 */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
        {rows.map((r) => {
          const g = r.gen;
          const e = r.edit;
          const thumb = r.mainImages[0]?.objectUrl;
          const editable = !!g && r.status !== 'success' && !registering;
          const priceLow = e.sellingPrice != null && e.sellingPrice < 100;
          const statusColor = r.status === 'success' ? 'border-green-400' : r.status === 'error' ? 'border-red-400'
            : g?.needsReview ? 'border-amber-300' : 'border-gray-200';
          return (
            <div key={r.uid} data-field-scope className={`bg-white border ${statusColor} rounded-xl p-3 flex flex-col gap-2`}>
              <div className="flex gap-3">
                {thumb
                  ? <img src={thumb} alt="" className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-none" />
                  : <div className="w-20 h-20 rounded-lg bg-gray-100 flex-none" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {r.usingRegen && <span className="text-[10px] text-emerald-600 font-medium">AI 가공 대표</span>}
                    {!r.usingRegen && r.mainAiPicked && <span className="text-[10px] text-emerald-600 font-medium">AI 선택 대표</span>}
                    {(g?.detailDroppedNames?.length ?? 0) > 0 && (
                      <span className="text-[10px] text-gray-400">상세 광고 {g!.detailDroppedNames!.length}컷 제외</span>
                    )}
                    {g?.needsReview && <span className="text-[10px] bg-amber-400 text-white rounded px-1">검수필요</span>}
                    {!g && <span className="text-[10px] bg-gray-400 text-white rounded px-1">워커결과 없음</span>}
                    {r.status === 'success' && <span className="text-[10px] bg-green-500 text-white rounded px-1">등록완료</span>}
                    {r.status === 'error' && <span className="text-[10px] bg-red-500 text-white rounded px-1">실패</span>}
                  </div>
                  {/* 노출명 — 직접 수정(버퍼링: Enter/blur 에만 커밋) */}
                  <DraftField value={e.displayName} disabled={!editable}
                    onCommit={(v) => patchEdit(r.uid, { displayName: v })}
                    placeholder={r.scanned.productJson?.name || r.productCode}
                    className="w-full text-sm font-semibold text-gray-900 leading-snug border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-transparent" />
                  {/* 카테고리 경로 + 코드 — 직접 수정 */}
                  <div className="flex items-center gap-1">
                    <DraftField value={e.categoryPath} disabled={!editable}
                      onCommit={(v) => patchEdit(r.uid, { categoryPath: v })} placeholder="카테고리 경로"
                      className="flex-1 min-w-0 text-xs text-blue-600 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-transparent" />
                    <DraftField value={e.categoryCode} disabled={!editable} inputMode="numeric"
                      sanitize={(v) => v.replace(/[^0-9]/g, '')}
                      onCommit={(v) => patchEdit(r.uid, { categoryCode: v })} placeholder="코드"
                      className="w-20 text-xs text-gray-700 border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                  </div>
                  {/* 판매가 — 직접 수정 */}
                  <div className="flex items-center gap-1">
                    <span className="text-[#E0245E] font-bold text-sm">₩</span>
                    <DraftField value={e.sellingPrice != null ? String(e.sellingPrice) : ''} disabled={!editable} inputMode="numeric"
                      sanitize={(v) => v.replace(/[^0-9]/g, '')}
                      onCommit={(v) => { const n = Number(v); patchEdit(r.uid, { sellingPrice: v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n)) }); }}
                      placeholder="판매가"
                      className={`w-28 text-sm font-bold text-[#E0245E] border ${priceLow ? 'border-red-400' : 'border-gray-200'} focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50`} />
                    {g?.sourcePrice ? <span className="text-xs text-gray-400 line-through ml-1">{won(g.sourcePrice)}</span> : null}
                    {priceLow && <span className="text-[10px] text-red-500">최소 100원</span>}
                  </div>
                </div>
              </div>
              {/* 옵션 — 서술형(편집 가능). 등록 시 태그/스펙으로 반영(가격·재고 판매변형 아님) */}
              {g && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">옵션 (스펙)</span>
                    <button type="button" disabled={!editable} onClick={() => addOption(r.uid)} className="text-[11px] text-blue-600 disabled:opacity-40">+ 옵션 추가</button>
                  </div>
                  {e.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <DraftField value={o.name} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { name: v })} placeholder="항목" className="w-20 text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                      <DraftField value={o.value} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { value: v })} placeholder="값" className="flex-1 min-w-0 text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                      <DraftField value={o.unit || ''} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { unit: v })} placeholder="단위" className="w-12 text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                      <button type="button" disabled={!editable} onClick={() => removeOption(r.uid, i)} className="text-gray-400 hover:text-red-500 text-sm px-1 leading-none disabled:opacity-40">×</button>
                    </div>
                  ))}
                </div>
              )}
              {g?.sourceUrl && <a href={g.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 break-all">원본: {g.sourceUrl}</a>}
              {g && (
                <div>
                  <button onClick={() => setOpenDetail((p) => ({ ...p, [r.uid]: !p[r.uid] }))} className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1">
                    상세페이지 편집 {openDetail[r.uid] ? '▴' : '▾'}
                  </button>
                  {openDetail[r.uid] && (
                    <textarea value={e.detail} disabled={!editable}
                      onChange={(ev) => patchEdit(r.uid, { detail: ev.target.value })}
                      className="mt-1 w-full text-[12px] whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-200 focus:border-blue-300 rounded p-2 h-72 overflow-auto focus:outline-none disabled:bg-gray-100" />
                  )}
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
          소싱 폴더를 선택하세요. 워커(node worker/run-folder.mjs &quot;&lt;폴더&gt;&quot;)가 생성한 결과를 자동으로 불러옵니다.
        </div>
      )}
    </div>
  );
}
