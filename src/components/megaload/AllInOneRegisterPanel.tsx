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
import {
  diagnoseLocalHelper, discoverLocalEndpoint, fetchLocalManifest,
  fetchLocalList, classifyLocalImages, productDirOf, localFileUrl, fetchLocalFile,
  collectFolderFiles, uploadFolderFiles, startLocalGenerate, pollGenStatus,
  type HelperDiag, type LocalEndpoint, type GenProgress, type GenStep,
} from '@/lib/megaload/allinone-local';
import { focusNextField } from './focusNextField';
import PreUploadConfirmModal from './PreUploadConfirmModal';
import { CertStatusBlock } from './CertStatusBlock';
import CategoryCascadingPicker from './bulk/CategoryCascadingPicker';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
import type { CertPreviewResult } from '@/app/api/megaload/products/cert-preview/route';
import type { OptionPreviewResult } from '@/app/api/megaload/products/option-preview/route';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';

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
  /** KC 등 원본 인증({name,cert_number,…}) — 서버(배치)가 카테고리 메타로 grounding 후 등록에 반영 */
  sourceCertifications?: unknown[];
  displayName: string;
  keywords: string[];
  categoryCode: string | null;
  categoryPath: string;
  options: { name: string; value: string; unit?: string }[];
  detail: string;
  persona?: string;
  needsReview?: boolean;
  thumbProcessed?: boolean | null;
  /** 누끼 가공본이 원본보다 나빠 대표에서 반려됨(run-folder gateCutout) — 기본 대표를 원본으로 */
  thumbRejected?: boolean;
  thumbRejectReason?: string;
  /** 대표컷 후보가 전부 로고/저품질이라 확인이 필요할 때의 사유(run-folder 가 표기) */
  mainImageWarning?: string;
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
  /** 사용자가 트리/드롭다운에서 직접 고른 쿠팡 속성값(속성명→값). 비운 속성은 서버가 자동채움. */
  attributeValues: Record<string, string>;
}

interface Row {
  uid: string;
  productCode: string;
  folderPath: string;
  scanned: ScannedProduct;
  gen: GenRecord | null;
  /** 사용자가 카드에서 수정한 등록값(초기값 = gen 복제) */
  edit: RowEdit;
  /** 대표이미지 후보 — [누끼 가공본…, CLIP 랭킹순 원본…]. 첫 장이 아니라 selectedMainIdx 가 대표다. */
  mainImages: ScannedImageFile[];
  /** mainImages 앞쪽 몇 장이 누끼 가공본인지(뱃지 판정용). 0 이면 가공본 없음. */
  regenCount: number;
  /** 사용자가 고른 대표컷의 mainImages 인덱스. 기본 0(=AI 추천). */
  selectedMainIdx: number;
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

/** 옵션 표시문자열(값+단위) — 오버라이드 전송/비교용. */
function optDisplay(o: { value: string; unit?: string }): string {
  return `${o.value ?? ''}${o.unit || ''}`.trim();
}

/**
 * 상품명에서 못 뽑아 억지 기본값이 들어간 필수옵션 중, 사용자가 아직 안 고친 게 있으면 true.
 * (프리뷰 placeholder 값 그대로면 미해결 → 등록 차단 + 카드에 "직접 입력" 표시)
 */
function unresolvedOptionInput(
  edit: RowEdit,
  prev?: { buyOptions: { name: string; value: string; unit?: string }[]; needsInput?: string[] },
): string[] {
  if (!prev?.needsInput?.length) return [];
  const cur = new Map(edit.options.map((o) => [o.name, optDisplay(o)]));
  const placeholder = new Map(prev.buyOptions.map((o) => [o.name, optDisplay(o)]));
  return prev.needsInput.filter((nm) => {
    const c = cur.get(nm);
    return !c || c === placeholder.get(nm); // 비었거나 placeholder 그대로 = 미입력
  });
}

/** ms → "m분 s초" / "s초" (진행 경과·ETA 표시용). */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

/** 생성 단계(러너 마커) → 사람이 읽는 라벨/순번. 순서: 인식 → 텍스트 → 누끼. */
const GEN_STEP_META: Record<GenStep, { idx: number; label: string }> = {
  recognize: { idx: 1, label: '상품 인식 (대표컷 선정)' },
  text: { idx: 2, label: '상세·노출명 생성' },
  image: { idx: 3, label: '대표사진 누끼 가공' },
};

/** 웹 폴링이 그리는 실시간 생성 진행 스냅샷. */
interface GenView {
  progress: GenProgress | null;   // { phase, done, total } — 없으면 엔진 준비 중
  startedAt: number;              // epoch ms
  updatedAt: number;              // 마지막 진행 갱신(정체 감지)
  etaMs: number | null;           // etaAt 기준 남은 예상(ms)
  etaAt: number;                  // etaMs 를 계산한 시각(카운트다운 기준)
}

/** gen → 초기 편집값 복제(불변 baseline 보존). gen 없으면 빈 값. */
function initEdit(g: GenRecord | null): RowEdit {
  return {
    displayName: g?.displayName || '',
    sellingPrice: g?.sellingPrice ?? null,
    categoryCode: g?.categoryCode || '',
    categoryPath: g?.categoryPath || '',
    detail: g?.detail || '',
    options: (g?.options || []).map((o) => ({ name: o.name, value: o.value, unit: o.unit })),
    attributeValues: {},
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
  /** 진단용 — 어느 위치를 어떤 순서로 뒤졌고 각각 성공했는지 */
  attempts: { where: string; ok: boolean }[];
  /** JSON 파싱에 실패한 줄 수(워커가 쓰다 만 파일 탐지) */
  badLines: number;
}

/** _allinone.generated.jsonl 을 productCode→레코드 맵으로. 루트에 없으면 한 단계 하위까지 탐색.
 *  진단을 위해 파일 존재 여부·레코드 수·키 샘플을 함께 반환한다. */
async function readGenerated(root: FileSystemDirectoryHandle): Promise<GenScan> {
  const map = new Map<string, GenRecord>();
  let fileFound = false;
  let recordCount = 0;
  let badLines = 0;
  let foundIn: string | undefined;
  const attempts: { where: string; ok: boolean }[] = [];

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
        } catch { badLines++; }
      }
      attempts.push({ where: label, ok: true });
      return true;
    } catch { attempts.push({ where: label, ok: false }); return false; }
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

  return { map, fileFound, recordCount, badLines, attempts, sampleSourceIds: [...map.keys()].slice(0, 3), foundIn };
}

/** 스캔 1회의 진단 스냅샷 — "왜 카드가 비었나"를 단계별로 보여주기 위한 전부. */
interface ScanDiag {
  rootName: string;
  productFolders: number;
  sampleCodes: string[];
  jsonl: GenScan;
  matched: number;
  helperUsed: number;
  regenFolders: number;
  /** 필드별 채움 건수 — 어떤 항목이 비어 있는지 한눈에 */
  fill: { label: string; filled: number }[];
}

/** 진단 한 줄 — 통과/실패를 아이콘으로 구분해 "어디서 끊겼는지"를 눈으로 따라가게 한다. */
function DiagLine({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const icon = ok === null ? '·' : ok ? '✔' : '✕';
  const tone = ok === null ? 'text-gray-400' : ok ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className={`${tone} font-bold w-3 flex-none text-center`}>{icon}</span>
      <span className="text-gray-500 w-28 flex-none">{label}</span>
      <span className="text-gray-800 break-all min-w-0">{value}</span>
    </div>
  );
}

/**
 * 스캔 진단 패널.
 * 카드가 비는 원인은 항상 이 순서 중 한 곳이다:
 *   폴더 인식 → jsonl 파일 존재 → 레코드 파싱 → sourceId↔폴더코드 매칭 → 필드별 생성값.
 * 각 단계를 실측값과 함께 보여줘 사용자가 추측 없이 다음 조치를 고를 수 있게 한다.
 */
function DiagPanel({ diag, helper, open, onToggle }: {
  diag: ScanDiag; helper: HelperDiag | null; open: boolean; onToggle: () => void;
}) {
  const j = diag.jsonl;
  const total = diag.productFolders;
  const allMatched = diag.matched === total && total > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl text-xs">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className={`w-2 h-2 rounded-full flex-none ${allMatched ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="font-semibold text-gray-900">진단</span>
        <span className="text-gray-500">
          상품 {total}개 · 워커결과 {diag.matched}개
          {allMatched ? '' : ` · ${total - diag.matched}개 비어 있음`}
        </span>
        <span className="flex-1" />
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-4">
          {/* 1) 파이프라인 단계 */}
          <div>
            <p className="font-semibold text-gray-700 mb-1">생성결과 경로</p>
            <DiagLine ok={total > 0} label="폴더 인식"
              value={`"${diag.rootName}" 안에서 product_* 폴더 ${total}개${diag.sampleCodes.length ? ` (코드 예: ${diag.sampleCodes.join(', ')})` : ''}`} />
            <DiagLine ok={j.fileFound} label="jsonl 파일"
              value={j.fileFound
                ? `_allinone.generated.jsonl 찾음 (위치: ${j.foundIn || '루트'})`
                : `_allinone.generated.jsonl 없음 — 뒤진 위치: ${j.attempts.map((a) => a.where).join(', ') || '루트'}`} />
            <DiagLine ok={j.fileFound ? j.recordCount > 0 : null} label="레코드 파싱"
              value={j.fileFound
                ? `${j.recordCount}건 파싱${j.badLines > 0 ? ` · 깨진 줄 ${j.badLines}건(워커가 쓰다 중단됨)` : ''}`
                : '파일이 없어 건너뜀'} />
            <DiagLine ok={j.recordCount > 0 ? diag.matched > 0 : null} label="키 매칭"
              value={j.recordCount === 0
                ? '레코드가 없어 건너뜀'
                : `${diag.matched}/${total} 매칭 · 워커 sourceId 예: [${j.sampleSourceIds.join(', ') || '없음'}] ↔ 폴더코드 예: [${diag.sampleCodes.join(', ')}]`} />
            <DiagLine ok={helper?.ok ?? false} label="도우미 직독"
              value={helper
                ? `${helper.message}${helper.folder ? ` · 폴더: ${helper.folder}` : ''}${diag.helperUsed > 0 ? ` · 이번 스캔에서 ${diag.helperUsed}건 보충` : ''}`
                : '확인 중…'} />
          </div>

          {/* 2) 필드별 채움 현황 — "카테고리가 안 보인다"를 수치로 확인 */}
          <div>
            <p className="font-semibold text-gray-700 mb-1">항목별 채움 현황</p>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
              {diag.fill.map((f) => {
                const full = f.filled === total && total > 0;
                return (
                  <div key={f.label} className="flex items-center gap-2">
                    <span className={`${full ? 'text-emerald-600' : f.filled === 0 ? 'text-red-600' : 'text-amber-600'} font-bold w-3 text-center`}>
                      {full ? '✔' : f.filled === 0 ? '✕' : '!'}
                    </span>
                    <span className="text-gray-500 flex-1 min-w-0 truncate">{f.label}</span>
                    <span className="text-gray-900 font-medium tabular-nums">{f.filled}/{total}</span>
                  </div>
                );
              })}
            </div>
            {diag.matched === 0 && (
              <p className="text-gray-500 mt-1.5">
                워커결과가 0건이므로 노출상품명·카테고리·판매가·옵션·상세글이 전부 빈 것은 정상입니다.
                대표이미지는 폴더의 원본 사진이라 워커 없이도 보입니다.
              </p>
            )}
          </div>

          {/* 3) 다음 조치 */}
          <div>
            <p className="font-semibold text-gray-700 mb-1">다음 조치</p>
            {allMatched ? (
              <p className="text-emerald-700">모든 상품에 워커결과가 매칭됐습니다. 카드에서 바로 검수하세요.</p>
            ) : !j.fileFound && helper?.ok && helper.folder ? (
              <p className="text-gray-700 break-all">
                도우미가 결과를 들고 있습니다. <b>이 폴더를 선택</b>하세요 — {helper.folder}
              </p>
            ) : !j.fileFound ? (
              <div className="space-y-1.5">
                <p className="text-gray-700">
                  이 폴더는 아직 <b>올인원 생성</b>을 돌리지 않았습니다. 웹은 도우미가 만든 결과를 읽어올 뿐이라,
                  먼저 도우미 앱에서 생성해야 카드가 채워집니다.
                </p>
                <ol className="list-decimal list-inside text-gray-600 space-y-0.5">
                  <li>데스크탑 <b>메가로드 도우미</b> 앱 열기</li>
                  <li>왼쪽 <b>⚙️ 올인원 생성</b> 클릭</li>
                  <li>이 폴더(<b>{diag.rootName}</b>)를 선택하고 실행</li>
                  <li>완료되면 여기서 <b>도우미에서 바로 불러오기</b>(또는 이 폴더 재선택)</li>
                </ol>
                <p className="text-gray-400 text-[11px]">
                  생성엔 ollama(텍스트)·ComfyUI(누끼)가 쓰이며 도우미가 자동으로 준비합니다.
                  누끼 없이 텍스트만 빠르게 하려면 생성 시 <code>--no-thumb</code> 옵션.
                </p>
              </div>
            ) : j.recordCount === 0 ? (
              <p className="text-gray-700">파일은 있으나 레코드가 0건입니다 — 생성이 중간에 끊겼습니다. 도우미 <b>올인원 생성</b>으로 이 폴더를 다시 처리하세요.</p>
            ) : (
              <p className="text-gray-700">
                레코드는 {j.recordCount}건인데 폴더코드와 키가 어긋납니다. 위 &quot;키 매칭&quot; 줄의 두 샘플을 비교해
                도우미 <b>올인원 생성</b>을 <b>바로 이 폴더</b>에서 돌렸는지 확인하세요.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AllInOneRegisterPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  // 웹 업로드 생성의 실시간 진행(단계·건수·경과·ETA). null 이면 생성 중 아님.
  const [gen, setGen] = useState<GenView | null>(null);
  // 경과/ETA 를 폴링(2초) 사이에도 부드럽게 카운트다운시키는 1초 티커.
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  // 현재 단계의 평균 처리속도 기준점(단계 바뀌면 리셋) — ETA 계산용.
  const etaBaseRef = useRef<{ phase: GenStep; at: number; done: number } | null>(null);
  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({});
  // 마진 프리셋: null = 워커 생성값 그대로. 선택 시 원가×프리셋으로 판매가 재계산.
  const [marginLevel, setMarginLevel] = useState<MarginPresetLevel | null>(null);
  // 인증(KC) 등록 미리보기 — 등록을 눌러야 아는 게 아니라 검수 단계에서 보여준다.
  const [certPreviews, setCertPreviews] = useState<Map<string, CertPreviewResult>>(new Map());
  const [certLoading, setCertLoading] = useState(false);
  /** 등록 후 서버가 알려준 인증 미반영 요약 */
  const [certNotice, setCertNotice] = useState('');
  // 구매옵션 미리보기 — 등록 경로(preflight-builder)와 같은 추출기로 "실제 등록될 옵션"을
  // 카드에 미리 채운다. LLM 이 지어낸 "무알콜=무알콜" 대신 카테고리 스키마 기반 진짜 옵션.
  const [optionPreviews, setOptionPreviews] = useState<Map<string, OptionPreviewResult>>(new Map());
  // (uid:categoryCode) 단위로 1회만 자동 채움 — 이후 사용자 수동 수정을 덮어쓰지 않게.
  const optionFilledRef = useRef<Set<string>>(new Set());

  // ── 도우미 직독 ────────────────────────────────────────────────────
  // 도우미(pair-server)가 마지막으로 생성을 끝낸 폴더의 결과를 localhost 에서 미리 받아둔다.
  // 이미지·product.json 스캔은 그대로 브라우저가 한다(핸들이 있어야 등록 업로드가 되므로).
  // 여기서 얻는 건 생성결과뿐 — 선택한 폴더에 _allinone.generated.jsonl 이 없어도 카드가 채워지고,
  // 어느 폴더를 골라야 하는지도 알려줄 수 있어 "키 불일치" 오진단이 사라진다.
  // 도우미가 꺼져 있거나 구버전이면 조용히 null → 기존 폴더 직접 읽기로 폴백.
  const [helperFolder, setHelperFolder] = useState<string | null>(null);
  const helperGenRef = useRef<Map<string, GenRecord> | null>(null);
  // 진단용 — 도우미 연결이 어느 단계에서 끊겼는지 보관(카드가 빌 때 화면에 그대로 노출).
  const [helperDiag, setHelperDiag] = useState<HelperDiag | null>(null);
  const [diag, setDiag] = useState<ScanDiag | null>(null);
  const [diagOpen, setDiagOpen] = useState(true);

  // 생성 중일 때만 1초 티커를 돌려 경과/ETA 표시를 매초 갱신(폴링은 2초라 사이를 메움).
  const genActive = gen !== null;
  useEffect(() => {
    if (!genActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [genActive]);

  // 도우미 연결 진단 — 마운트 시 1회 + 실패 중에는 20초마다 재확인.
  //   재확인이 필요한 이유: 사용자가 앱에서 재연결해도 예전엔 이 페이지를 새로고침해야
  //   상태가 바뀌었다. 안내를 보고 고친 즉시 사라지지 않으면 고친 게 맞는지 알 수 없다.
  //   연결이 정상이면 폴링을 멈춘다(불필요한 호출 0).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      const d = await diagnoseLocalHelper();
      if (cancelled) return;
      setHelperDiag(d);
      if (!d.ok) {
        timer = setTimeout(run, 20_000); // 아직 안 되는 중 → 계속 지켜본다
        return;
      }
      if (!d.raw) return;
      const map = new Map<string, GenRecord>();
      for (const rec of d.raw as GenRecord[]) {
        if (rec?.sourceId != null) map.set(String(rec.sourceId), rec);
      }
      if (map.size === 0) return;
      helperGenRef.current = map;
      setHelperFolder(d.folder ?? null);
    };
    void run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

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

  // ── 인증(KC) 미리보기 ────────────────────────────────────────────
  // 등록 payload 와 같은 grounding 함수를 서버에서 돌려, "이 인증번호가 어느
  // 쿠팡 인증 항목으로 들어가는지"를 검수 단계에서 미리 보여준다.
  // 등록 뒤에는 NOT_REQUIRED 로 조용히 올라간 걸 눈으로 찾기 어렵다.
  const certInput = rows
    .filter((r) => r.status !== 'success' && r.edit.categoryCode)
    .map((r) => {
      const pj = (r.scanned.productJson || {}) as { certifications?: unknown };
      const certs = (Array.isArray(r.gen?.sourceCertifications) && r.gen!.sourceCertifications!.length)
        ? r.gen!.sourceCertifications!
        : (Array.isArray(pj.certifications) ? pj.certifications : []);
      return { uid: r.uid, categoryCode: r.edit.categoryCode, sourceCertifications: certs };
    });
  // 카테고리·인증이 바뀔 때만 재조회 (카드 편집마다 때리지 않도록)
  const certKey = certInput.map((c) => `${c.uid}:${c.categoryCode}:${c.sourceCertifications.length}`).join('|');

  const loadCertPreviews = useCallback(async (input: typeof certInput) => {
    if (input.length === 0) { setCertPreviews(new Map()); return; }
    setCertLoading(true);
    try {
      const res = await fetch('/api/megaload/products/cert-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: input }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { results?: CertPreviewResult[] };
      setCertPreviews(new Map((data.results || []).map((r) => [r.uid, r])));
    } catch {
      // 미리보기 실패는 등록을 막지 않는다 — 블록만 안 뜬다.
      setCertPreviews(new Map());
    } finally {
      setCertLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!certKey) { setCertPreviews(new Map()); return; }
    const t = setTimeout(() => void loadCertPreviews(certInput), 400);
    return () => clearTimeout(t);
    // certKey 가 실제 의존성 — certInput 은 매 렌더 새 배열이라 넣으면 무한루프
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certKey, loadCertPreviews]);

  // ── 구매옵션 미리보기 ────────────────────────────────────────────
  // 카테고리가 정해진 상품에 대해 "실제 등록될 옵션"을 서버에서 계산해 카드에 채운다.
  // 원본(소싱) 상품명이 스펙이 가장 풍부하므로 그것을 1차 소스로 넘긴다.
  const optionInput = rows
    .filter((r) => r.status !== 'success' && r.edit.categoryCode)
    .map((r) => ({
      uid: r.uid,
      categoryCode: r.edit.categoryCode,
      productName: r.gen?.originalName || r.edit.displayName,
      displayName: r.edit.displayName,
      tags: r.gen?.keywords,
      categoryPath: r.edit.categoryPath,
    }));
  // 카테고리·원본명이 바뀔 때만 재조회 (카드 편집마다 때리지 않도록)
  const optionKey = optionInput.map((c) => `${c.uid}:${c.categoryCode}`).join('|');

  const loadOptionPreviews = useCallback(async (input: typeof optionInput) => {
    if (input.length === 0) { setOptionPreviews(new Map()); return; }
    try {
      const res = await fetch('/api/megaload/products/option-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: input }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { results?: OptionPreviewResult[] };
      const map = new Map((data.results || []).map((r) => [r.uid, r]));
      setOptionPreviews(map);
      // 실제 등록될 옵션으로 카드의 옵션칸을 채운다 — (uid:categoryCode)당 1회만.
      setRows((prev) => prev.map((r) => {
        const res2 = map.get(r.uid);
        if (!res2 || !res2.buyOptions || res2.buyOptions.length === 0) return r;
        const key = `${r.uid}:${r.edit.categoryCode}`;
        if (optionFilledRef.current.has(key)) return r; // 이미 채움 → 사용자 수정 보존
        optionFilledRef.current.add(key);
        const options = res2.buyOptions.map((o) => ({ name: o.name, value: o.value, unit: o.unit }));
        // 상품명에서 못 뽑아 억지 기본값이 들어간 필수옵션이 있으면 자동승인을 풀어
        // 사용자가 직접 입력하도록 강제(억지값 등록 방지).
        const needsInput = (res2.needsInput?.length ?? 0) > 0;
        return { ...r, edit: { ...r.edit, options }, approved: needsInput ? false : r.approved };
      }));
    } catch {
      // 미리보기 실패는 등록을 막지 않는다 — 서버가 등록 때 다시 추출한다.
      setOptionPreviews(new Map());
    }
  }, []);

  useEffect(() => {
    if (!optionKey) { setOptionPreviews(new Map()); return; }
    const t = setTimeout(() => void loadOptionPreviews(optionInput), 500);
    return () => clearTimeout(t);
    // optionKey 가 실제 의존성 — optionInput 은 매 렌더 새 배열
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKey, loadOptionPreviews]);

  // ── 카테고리 속성 메타 로드 ──────────────────────────────────────
  // 옵션값을 트리/드롭다운으로 수동 선택할 수 있게, 카테고리별 쿠팡 속성(허용값 포함)을 받아둔다.
  // 코드당 1회만(캐시). 카드에서 "속성 선택"을 펼칠 때 필요.
  const catCodesKey = [...new Set(rows.filter((r) => r.status !== 'success' && r.edit.categoryCode).map((r) => r.edit.categoryCode))].sort().join(',');
  useEffect(() => {
    const codes = catCodesKey ? catCodesKey.split(',').filter(Boolean) : [];
    const need = codes.filter((c) => attrMetaByCode[c] === undefined && !attrLoadingRef.current.has(c));
    if (need.length === 0) return;
    need.forEach((c) => attrLoadingRef.current.add(c));
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/megaload/products/category-meta', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryCodes: need }), signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json() as { attributes?: Record<string, AttributeMeta[]> };
        setAttrMetaByCode((prev) => ({ ...prev, ...(data.attributes || {}) }));
      } catch {
        // 실패해도 등록은 막지 않는다(서버가 등록 때 속성 자동채움). 재시도 가능하게 로딩표시만 해제.
        need.forEach((c) => attrLoadingRef.current.delete(c));
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catCodesKey]);

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

      // 폴더에서 읽은 결과가 우선. 없는 상품만 도우미가 들고 있는 결과로 메운다
      // (폴더에 jsonl 이 아예 없거나, 워커를 다른 경로에서 돌려 키가 어긋난 경우를 함께 구제).
      const helperMap = helperGenRef.current;
      let helperUsed = 0;

      const built: Row[] = [];
      for (const sp of products) {
        let gen = genMap.get(sp.productCode) || null;
        if (!gen && helperMap) {
          gen = helperMap.get(sp.productCode) || null;
          if (gen) helperUsed++;
        }
        const regen = await readRegenImages(sp.dirHandle);
        const usingRegen = regen.length > 0;
        const clip = reorderMainByClip(sp.mainImages || [], gen);
        // 대표 후보 = 누끼 가공본(있으면 앞) + CLIP 랭킹순 원본.
        // ⭐ 예전엔 가공본이 있으면 원본을 통째로 버렸다. 그래서 누끼 결과가 마음에 안 들어도
        //    되돌릴 방법이 없었다(ComfyUI 는 후보를 1장만 만들고 재시도 경로도 없다).
        //    이제 둘 다 남겨 카드에서 고르게 한다 — 기본값은 그대로 AI 추천(index 0).
        // 워커가 상세/리뷰컷을 대표로 승격했으면(폴더 경계 너머 심사) 그 원본도 대표 후보에 넣는다.
        //   웹 스캔은 폴더명으로만 풀을 나누므로, 승격된 컷은 sp.mainImages 에 없다.
        //   regen 바로 뒤에 두어 "누끼 반려 시 기본값(regen.length)"이 곧 이 원본이 되게 한다.
        const promotedName = gen?.mainImage ? basename(gen.mainImage) : '';
        const promotedExtra = promotedName && !(sp.mainImages || []).some((m) => m.name === promotedName)
          ? (sp.detailImages || []).filter((d) => d.name === promotedName)
          : [];
        const mainImages = usingRegen
          ? [...regen, ...promotedExtra, ...clip.images]
          : [...promotedExtra, ...clip.images];
        const reordered = { picked: usingRegen || clip.picked || promotedExtra.length > 0 };
        // 상세: CLIP 이 광고/배송/리뷰컷으로 버린 파일명만 제외(핸들 유지 → 등록 업로드 가능).
        const detailImages = applyDetailCuration(sp.detailImages || [], gen);
        // 썸네일 표시용 objectURL 보장 — 공용 스캐너는 main_images 를 lazy(objectUrl 미생성)로 읽으므로
        // 가공본(regen)이 없는 상품은 (재정렬 후) 첫 장 URL 을 즉시 만들어야 카드 썸네일이 보인다.
        // 기본 대표로 쓸 인덱스(누끼 반려 시 첫 원본) — 그 컷의 썸네일 URL 을 보장해야 카드가 보인다.
        const initialMainIdx = usingRegen && gen?.thumbRejected ? regen.length : 0;
        if (mainImages[initialMainIdx] && !mainImages[initialMainIdx].objectUrl) {
          await ensureObjectUrl(mainImages[initialMainIdx]);
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
          regenCount: regen.length,
          // 기본 대표 = 0번(누끼 가공본). 단 워커가 가공본을 반려했으면(거꾸로/잘림/빈컷 등)
          // 첫 원본(=regen 다음 인덱스)을 기본으로 — 가공본은 후보로 남아 되돌릴 수 있다.
          selectedMainIdx: initialMainIdx,
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

      // 진단 스냅샷 — 항상 기록한다(일부만 비는 경우도 검수 대상이므로).
      const count = (pred: (r: Row) => boolean) => built.filter(pred).length;
      setDiag({
        rootName: root.name,
        productFolders: built.length,
        sampleCodes: built.slice(0, 3).map((r) => r.productCode),
        jsonl: gscan,
        matched: withGen,
        helperUsed,
        regenFolders: count((r) => r.usingRegen),
        fill: [
          { label: '노출상품명', filled: count((r) => !!r.edit.displayName) },
          { label: '카테고리 코드', filled: count((r) => !!r.edit.categoryCode) },
          { label: '카테고리 경로', filled: count((r) => !!r.edit.categoryPath) },
          { label: '판매가', filled: count((r) => r.edit.sellingPrice != null) },
          { label: '필수옵션', filled: count((r) => r.edit.options.length > 0) },
          { label: '상세페이지 글', filled: count((r) => !!r.edit.detail) },
          { label: '대표이미지', filled: count((r) => r.mainImages.length > 0) },
          { label: '대표 누끼가공', filled: count((r) => r.usingRegen) },
        ],
      });
      setDiagOpen(withGen < built.length);
      setScanMsg(
        `상품 ${built.length}개 · 워커결과 매칭 ${withGen}개 · 대표가공 ${built.filter((r) => r.usingRegen).length}개`
        + (helperUsed > 0 ? ` · 도우미에서 ${helperUsed}개 수신` : ''),
      );
      if (withGen === 0) {
        const sampleCodes = built.slice(0, 3).map((r) => r.productCode);
        if (!gscan.fileFound && helperFolder) {
          // 도우미는 결과를 들고 있는데 이 폴더와는 상품코드가 안 맞음 → 폴더를 잘못 고른 것.
          // 경로를 알고 있으니 "워커를 돌려라"가 아니라 "그 폴더를 골라라"가 맞는 안내다.
          setError(
            `이 폴더에는 워커 결과가 없습니다. 도우미가 마지막으로 생성을 끝낸 폴더는 다음 경로입니다 — 이 폴더를 선택하세요:  ${helperFolder}`,
          );
        } else if (!gscan.fileFound) {
          // 파일 자체가 없음 — 가장 흔한 원인. product_* 는 찾았으므로 폴더는 맞고, 올인원 생성만 안 돌린 상태.
          setError(
            `product_* 폴더 ${built.length}개는 찾았지만 이 폴더는 아직 올인원 생성을 돌리지 않았습니다(카드에 채울 결과가 없습니다). ` +
            `데스크탑 메가로드 도우미 앱 → ⚙️ 올인원 생성 → 이 폴더를 선택·실행한 뒤, 여기서 "도우미에서 바로 불러오기"(또는 폴더 재선택)를 누르세요. ` +
            `자세한 절차는 아래 진단 패널의 "다음 조치"를 참고하세요.`,
          );
        } else if (gscan.recordCount === 0) {
          setError('_allinone.generated.jsonl 파일은 있으나 레코드가 0건입니다. 생성이 중간에 끊겼으니 도우미 올인원 생성으로 이 폴더를 다시 처리하세요.');
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
  }, [helperFolder]);

  // ── 도우미에서 바로 불러오기 (폴더 선택 0회) ─────────────────────────
  // 도우미가 이미 폴더 경로를 알고, 결과·이미지가 그 PC 에 있으므로 웹이 localhost 로 직접 읽는다.
  // 이미지도 shim(handle.getFile→fetchLocalFile)으로 감싸 기존 등록 업로드 경로를 그대로 재사용한다.
  // → Storage 선업로드 없음(승인분만 등록 때 올라감), 폴더 재선택 없음.
  const handleLoadFromHelper = useCallback(async () => {
    setError('');
    setScanning(true);
    setScanMsg('도우미 연결 확인 중…');
    try {
      const ep = await discoverLocalEndpoint();
      if (!ep) { const d = await diagnoseLocalHelper(); setError(d.message); return; }
      const mf = await fetchLocalManifest(ep);
      if (!mf) { const d = await diagnoseLocalHelper(); setError(d.message); return; }

      // 로컬 이미지 1장을 ScannedImageFile 로 위장 — 표시는 localhost URL, 업로드는 getFile()이 로컬을 fetch.
      const mkImg = (rel: string): ScannedImageFile => ({
        name: rel.split('/').pop() || 'image.png',
        objectUrl: localFileUrl(ep as LocalEndpoint, rel),
        handle: {
          getFile: async () => {
            const f = await fetchLocalFile(ep as LocalEndpoint, rel);
            if (!f) throw new Error('로컬 이미지 읽기 실패: ' + rel);
            return f;
          },
        } as unknown as FileSystemFileHandle,
      });

      const recs = mf.records as GenRecord[];
      const built: Row[] = [];
      for (let i = 0; i < recs.length; i++) {
        const gen = recs[i];
        setScanMsg(`도우미 결과 불러오는 중 ${i + 1}/${recs.length}…`);
        const code = gen?.sourceId != null ? String(gen.sourceId) : `item_${i + 1}`;
        // 상품 폴더는 레코드의 절대 이미지 경로에서 역산(대표 우선, 없으면 상세 첫 장).
        const prodDir =
          productDirOf(mf.folder, gen?.mainImage) ??
          productDirOf(mf.folder, Array.isArray(gen?.detailImages) ? gen!.detailImages[0] : null);
        const cls = prodDir
          ? classifyLocalImages(await fetchLocalList(ep, prodDir), prodDir)
          : { main: [], regenCount: 0, detail: [], review: [], info: [] };

        const mainImages = cls.main.map(mkImg);
        const detailImages = cls.detail.map(mkImg);
        const reviewImages = cls.review.map(mkImg);
        const infoImages = cls.info.map(mkImg);

        // scanned 는 등록 경로가 reviewImages/infoImages/productJson/sourceUrl 만 참조 →
        // 폴더 핸들 없이 그 필드만 채운 얕은 대체물(ScannedProduct 로 캐스팅).
        const scanned = {
          productCode: code,
          folderName: prodDir || code,
          sourceUrl: gen?.sourceUrl ?? undefined,
          productJson: { name: gen?.originalName, tags: gen?.keywords },
          mainImages, detailImages, infoImages, reviewImages,
        } as unknown as ScannedProduct;

        const edit = initEdit(gen);
        built.push({
          uid: code || crypto.randomUUID(),
          productCode: code,
          folderPath: prodDir || code,
          scanned,
          gen,
          edit,
          mainImages,
          regenCount: cls.regenCount,
          selectedMainIdx: 0,
          detailImages,
          mainAiPicked: cls.regenCount > 0,
          usingRegen: cls.regenCount > 0,
          approved: isEligible(edit) && !gen?.needsReview,
          status: 'idle',
        });
      }
      built.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
      setRows(built);
      const withImg = built.filter((r) => r.mainImages.length > 0).length;
      setScanMsg(`도우미에서 ${built.length}개 불러옴 · 대표이미지 ${withImg}개 · 대표가공 ${built.filter((r) => r.usingRegen).length}개`);
      if (built.length === 0) setError('도우미가 생성한 상품이 없습니다. 올인원 생성을 먼저 완료하세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '도우미 불러오기 실패');
    } finally {
      setScanning(false);
    }
  }, []);

  // 자동 로드(도우미 완료 시)와 업로드 생성이 공유하는 "한 번만" 가드.
  const autoLoadedRef = useRef(false);

  // ── 웹에서 폴더 올려 생성 (앱 안 열고 웹에서 전부) ──────────────────────
  // 브라우저는 폴더 경로를 안 주므로, 폴더 "내용"을 도우미로 업로드해 도우미가 생성한다.
  //   폴더 선택 → 업로드 → 도우미 생성(진행률 폴링) → 완료 시 결과 자동 로드.
  const handleUploadAndGenerate = useCallback(async () => {
    setError('');
    if (!('showDirectoryPicker' in window)) {
      setError('이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.');
      return;
    }
    const ep = await discoverLocalEndpoint();
    if (!ep) {
      const d = await diagnoseLocalHelper();
      setError(`도우미에 연결돼 있어야 업로드 생성이 됩니다. ${d.message}`);
      return;
    }
    let root: FileSystemDirectoryHandle;
    try {
      root = await (window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'read' });
    } catch {
      return; // 사용자가 취소
    }

    setScanning(true);
    try {
      setScanMsg('폴더 파일 목록 읽는 중…');
      const files = await collectFolderFiles(root, (n) => setScanMsg(`파일 ${n}개 확인…`));
      if (files.length === 0) { setError('폴더에 파일이 없습니다.'); return; }

      const session = crypto.randomUUID();
      setScanMsg(`도우미로 업로드 중 0/${files.length}…`);
      const { fail } = await uploadFolderFiles(ep, session, files,
        (done, total) => setScanMsg(`도우미로 업로드 중 ${done}/${total}…`));
      if (fail > 0) setScanMsg(`업로드 ${fail}개 실패(계속 진행) · 생성 시작…`);

      const started = await startLocalGenerate(ep, session, false);
      if (!started) { setError('도우미가 생성을 시작하지 못했습니다. 도우미가 최신 버전인지 확인하세요.'); return; }

      // 진행 폴링 — 완료까지(생성은 ollama·ComfyUI 시간이라 수 분 걸릴 수 있음).
      // 진행 상태(단계·건수·경과·ETA)를 gen 으로 흘려 화면에 실시간 표시한다.
      setScanMsg('');
      const startTs = Date.now();
      etaBaseRef.current = null;
      setNowTick(startTs);
      setGen({ progress: null, startedAt: startTs, updatedAt: startTs, etaMs: null, etaAt: startTs });
      for (let i = 0; i < 3600; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await pollGenStatus(ep, session);
        if (st.state === 'done') { setGen(null); break; }
        if (st.state === 'error') {
          setGen(null);
          setError(`생성 실패: ${st.error || '도우미 로그를 확인하세요.'}`);
          return;
        }
        // 'generating' / 'unknown'(일시 네트워크 요동) 은 마지막 진행을 유지하며 계속 폴링.
        const now = Date.now();
        const startedAt = typeof st.startedAt === 'number' ? st.startedAt : startTs;
        const p = st.progress ?? null;
        // 현재 단계의 평균속도로 ETA 추정. 단계가 바뀌면 기준점 리셋.
        let etaMs: number | null = null;
        if (p && p.total > 0) {
          const base = etaBaseRef.current;
          if (!base || base.phase !== p.phase) {
            etaBaseRef.current = { phase: p.phase, at: now, done: p.done };
          } else if (p.done > base.done) {
            const perItem = (now - base.at) / (p.done - base.done); // ms/건
            etaMs = perItem * (p.total - p.done);
          }
        }
        setGen((prev) => ({
          progress: p,
          startedAt,
          updatedAt: typeof st.updatedAt === 'number' ? st.updatedAt : (prev?.updatedAt ?? now),
          // 이번에 새로 계산했으면 갱신, 아니면(=단계 내 정지) 직전 ETA 를 이어서 카운트다운.
          etaMs: etaMs != null ? etaMs : (prev?.etaMs ?? null),
          etaAt: etaMs != null ? now : (prev?.etaAt ?? now),
        }));
      }

      // 완료 → 도우미가 lastAllinoneFolder 를 이 세션으로 승격했으니 기존 직독으로 로드.
      autoLoadedRef.current = true;
      await handleLoadFromHelper();
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 생성 실패');
    } finally {
      setGen(null);
      setScanning(false);
    }
  }, [handleLoadFromHelper]);

  // ── 이전 결과 자동 로드 안 함(사용자 요청) ──────────────────────────
  // 예전엔 도우미에 결과가 있으면 화면 열자마자 저절로 카드를 채웠다. 그러나 "전에 작업했던
  // 게 계속 떠서 거슬린다"는 피드백 → 이제 이전 생성결과는 사용자가 직접 "이전 생성결과
  // 불러오기" 버튼을 눌러야만 뜬다. (이 웹에서 방금 업로드-생성한 경우는 handleUploadGenerate
  // 가 완료 시 handleLoadFromHelper 를 명시 호출하므로 그 흐름은 그대로 자동 표시된다.)
  //   autoLoadedRef 는 그 생성-후-1회 로드 가드로만 남는다.

  // ── 대표컷 선택 ──────────────────────────────────────────────────
  // 스캐너는 첫 장만 objectUrl 을 즉시 만든다(대량 폴더에서 전부 만들면 메모리·시간 낭비).
  // 그래서 후보 목록을 펼치는 순간에만 그 카드의 나머지 후보 URL 을 만든다.
  const [openMain, setOpenMain] = useState<Record<string, boolean>>({});
  const toggleMainPicker = async (uid: string, candidates: ScannedImageFile[]) => {
    const opening = !openMain[uid];
    if (opening) {
      await Promise.all(candidates.map((img) => (img.objectUrl ? null : ensureObjectUrl(img))));
    }
    setOpenMain((p) => ({ ...p, [uid]: opening }));
    setRows((prev) => [...prev]); // 위에서 채운 objectUrl 을 화면에 반영
  };
  const selectMain = async (uid: string, idx: number, img: ScannedImageFile) => {
    if (!img.objectUrl) await ensureObjectUrl(img);
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, selectedMainIdx: idx } : r)));
  };
  // 상세 편집 토글 — 펼칠 때 상세이미지 썸네일 URL 을 보장(스캐너가 lazy 로 읽으므로).
  const toggleDetail = async (uid: string, detailImages: ScannedImageFile[]) => {
    const opening = !openDetail[uid];
    if (opening) await Promise.all(detailImages.map((img) => (img.objectUrl ? null : ensureObjectUrl(img))));
    setOpenDetail((p) => ({ ...p, [uid]: opening }));
    setRows((prev) => [...prev]); // 채운 objectUrl 반영
  };

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

  // ── 상세 이미지 넣고/빼기 ────────────────────────────────────────
  // 이상한 컷(멤버십 배너 등)을 사용자가 직접 제거하고, 빠진 컷(리뷰/정보/큐레이션 제외분)을
  // 다시 추가할 수 있게 한다. 등록엔 r.detailImages 만 첨부되므로 이 배열만 편집한다.
  const [openDetailPool, setOpenDetailPool] = useState<Record<string, boolean>>({});
  // 카테고리 트리 선택 모달을 연 행(uid). null 이면 닫힘.
  const [catPickerUid, setCatPickerUid] = useState<string | null>(null);
  // 카테고리코드 → 쿠팡 속성 메타(드롭다운 허용값). 옵션값을 트리/드롭다운으로 수동 선택하는 데 사용.
  const [attrMetaByCode, setAttrMetaByCode] = useState<Record<string, AttributeMeta[]>>({});
  const attrLoadingRef = useRef<Set<string>>(new Set());
  const [openAttr, setOpenAttr] = useState<Record<string, boolean>>({});
  const setAttrValue = (uid: string, name: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid
      ? { ...r, edit: { ...r.edit, attributeValues: { ...r.edit.attributeValues, [name]: value } } } : r)));
  const removeDetailImage = (uid: string, name: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid
      ? { ...r, detailImages: r.detailImages.filter((img) => img.name !== name) } : r)));
  const addDetailImage = async (uid: string, img: ScannedImageFile) => {
    if (!img.objectUrl) await ensureObjectUrl(img);
    setRows((prev) => prev.map((r) => (r.uid === uid && !r.detailImages.some((d) => d.name === img.name)
      ? { ...r, detailImages: [...r.detailImages, img] } : r)));
  };
  /** 추가 가능한 이미지 = 스캔한 상세/리뷰/정보 이미지 중 현재 상세에 없는 것(중복 파일명 제외). */
  const addableDetailImages = (r: Row): ScannedImageFile[] => {
    const have = new Set(r.detailImages.map((d) => d.name));
    const pool = [
      ...(r.scanned.detailImages || []),
      ...(r.scanned.reviewImages || []),
      ...(r.scanned.infoImages || []),
    ];
    const seen = new Set<string>();
    return pool.filter((img) => img && !have.has(img.name) && !seen.has(img.name) && seen.add(img.name));
  };
  const toggleDetailPool = async (uid: string, pool: ScannedImageFile[]) => {
    const opening = !openDetailPool[uid];
    if (opening) await Promise.all(pool.map((img) => (img.objectUrl ? null : ensureObjectUrl(img))));
    setOpenDetailPool((p) => ({ ...p, [uid]: opening }));
    setRows((prev) => [...prev]);
  };

  // ── 대표컷 후보(서브이미지) 넣고/빼기 ────────────────────────────
  // 대표 외 후보는 등록 시 서브(상품)이미지로 올라간다. 이상한 컷을 × 로 빼고, 뺀 컷을 + 로 되살린다.
  // mainImages = [누끼(regen)…, 원본…] 구조라 인덱스/regenCount/선택인덱스를 함께 보정한다.
  const removeMainImage = (uid: string, name: string) =>
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const idx = r.mainImages.findIndex((m) => m.name === name);
      if (idx < 0 || r.mainImages.length <= 1) return r; // 최소 1장 유지
      const mainImages = r.mainImages.filter((_, i) => i !== idx);
      const regenCount = idx < r.regenCount ? r.regenCount - 1 : r.regenCount;
      let selectedMainIdx = r.selectedMainIdx;
      if (idx === selectedMainIdx) selectedMainIdx = 0;      // 대표를 지우면 첫 장으로
      else if (idx < selectedMainIdx) selectedMainIdx -= 1;
      selectedMainIdx = Math.max(0, Math.min(selectedMainIdx, mainImages.length - 1));
      return { ...r, mainImages, regenCount, selectedMainIdx };
    }));
  const addMainImage = async (uid: string, img: ScannedImageFile) => {
    if (!img.objectUrl) await ensureObjectUrl(img);
    setRows((prev) => prev.map((r) => (r.uid === uid && !r.mainImages.some((m) => m.name === img.name)
      ? { ...r, mainImages: [...r.mainImages, img] } : r)));
  };
  /** 되살릴 수 있는 대표 후보 = 스캔한 main_images 중 현재 후보에 없는 것. */
  const addableMainImages = (r: Row): ScannedImageFile[] => {
    const have = new Set(r.mainImages.map((m) => m.name));
    return (r.scanned.mainImages || []).filter((img) => img && !have.has(img.name));
  };

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
    // 상품명에 스펙이 없어 억지 기본값이 들어간 필수옵션 — 직접 입력 전엔 등록 차단(1ml 같은 거짓값 방지).
    const needOpt = targets
      .map((r) => ({ r, miss: unresolvedOptionInput(r.edit, optionPreviews.get(r.uid)) }))
      .filter((x) => x.miss.length > 0);
    if (needOpt.length > 0) {
      setError(
        `옵션을 직접 입력해야 하는 상품 ${needOpt.length}개가 있습니다(상품명에 용량·수량 등이 없어 값을 못 뽑음). `
        + `해당 카드의 빨간 옵션칸에 실제 값을 입력하세요: `
        + needOpt.slice(0, 5).map((x) => `${x.r.edit.displayName || x.r.productCode}(${x.miss.join(',')})`).join(' · ')
        + (needOpt.length > 5 ? ` 외 ${needOpt.length - 5}개` : ''),
      );
      return;
    }
    setPreUploadCount(targets.length);
    setPreUploadOpen(true);
  }, [rows, selectedOutbound, selectedReturn, contactNumber, optionPreviews]);

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
          // 사용자가 확정/수정한 옵션값을 실제 등록에 반영(옵션명→값). 서버(preflight)가 추출값 대신 이걸 쓴다.
          //   자동추출과 같은 값은 굳이 안 보내고(서버가 단위까지 정확), 사용자가 바꾼/직접입력한 것만 override.
          const optPrev = optionPreviews.get(r.uid);
          const prevByName = new Map((optPrev?.buyOptions || []).map((o) => [o.name, optDisplay(o)]));
          const needsSet = new Set(optPrev?.needsInput || []);
          const buyOptionValuesOverride: Record<string, string> = {};
          for (const o of e.options) {
            const cur = optDisplay(o);
            if (!cur || !o.name) continue;
            if (needsSet.has(o.name) || (prevByName.has(o.name) && prevByName.get(o.name) !== cur)) {
              buyOptionValuesOverride[o.name] = cur;
            }
          }
          const wm = sellerBrandRef.current;
          // 이미지 업로드: 대표(가공본 우선·CLIP 랭킹 첫장) + 상세(CLIP 큐레이션) + 리뷰/정보
          // 사용자가 고른 컷이 첫 장(=쿠팡 대표)이 되게 재정렬.
          //   · 누끼를 골랐으면 그 1장만 올린다(가공본이 대표일 때의 기존 동작 유지).
          //   · 원본을 골랐으면 고른 컷 + 나머지 원본을 CLIP 순서로(원본이 대표일 때의 기존 동작 유지).
          //   어느 쪽이든 '고르지 않은 누끼'는 올리지 않는다 — 후보였을 뿐이다.
          const chosen = r.mainImages[r.selectedMainIdx];
          const mainOrdered = !chosen
            ? []
            : r.selectedMainIdx < r.regenCount
              ? [chosen]
              : [chosen, ...r.mainImages.filter((_, i) => i >= r.regenCount && i !== r.selectedMainIdx)];
          const mainUrls = (await uploadScannedImages(mainOrdered, 10, wm)).filter(Boolean);
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
            // KC 등 원본 인증 — 서버가 카테고리 메타로 grounding 해 등록 payload 에 반영(전기제품 등록가능)
            sourceCertifications: (Array.isArray(g.sourceCertifications) && g.sourceCertifications.length)
              ? g.sourceCertifications
              : (Array.isArray(pj.certifications) ? (pj.certifications as unknown[]) : undefined),
            tags: [...new Set([...baseTags, ...optionTags])].slice(0, 20),
            description: e.detail || '',
            mainImages: [], detailImages: [], reviewImages: [], infoImages: [],
            noticeMeta: meta.noticeMeta, attributeMeta: meta.attributeMeta,
            // 사용자 수정값을 그대로 사용(서버 재생성 방지)
            aiDisplayName: dispName || undefined,
            descriptionOverride: e.detail || undefined,
            // 사용자가 확정/직접입력한 옵션값 → 서버가 추출값 대신 사용(빈 객체면 전송 안 함)
            buyOptionValuesOverride: Object.keys(buyOptionValuesOverride).length ? buyOptionValuesOverride : undefined,
            // 사용자가 트리/드롭다운에서 고른 쿠팡 속성값(빈 값 제외) — 서버가 자동채움값 대신 사용.
            attributeValuesOverride: (() => {
              const av = Object.fromEntries(Object.entries(e.attributeValues).filter(([, v]) => v && v.trim()));
              return Object.keys(av).length ? av : undefined;
            })(),
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
            // 서버가 인증 매칭 실패를 알려주면(등록은 성공해도) 눈에 보이게 남긴다.
            const cw = batchData.certWarnings as { productCode: string; detail: string; allFailed: boolean }[] | undefined;
            if (cw?.length) {
              const failed = cw.filter((w) => w.allFailed).length;
              setCertNotice(
                `인증정보 미반영 ${cw.length}건${failed > 0 ? ` (${failed}건은 인증번호 없이 등록됨 — 쿠팡 윙에서 직접 입력 필요)` : ''}: `
                + cw.slice(0, 5).map((w) => w.productCode).join(', ')
                + (cw.length > 5 ? ` 외 ${cw.length - 5}건` : ''),
              );
            }
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

      {/* ⚠️ 도우미에 닿지 못하는 상태를 버튼 누르기 전에 알린다.
          예전엔 진단이 마운트 때 이미 실패를 알고 있으면서도, 그 결과가 아래 접이식 "진단"
          패널 안에만 있었다 — 그 패널은 폴더를 한 번 스캔해야 렌더되므로 화면이 비어 있으면
          아무것도 안 보였고, 사용자는 버튼을 눌러 실패해야만 이유를 알 수 있었다.
          단, manifest 단계 실패(=도우미는 정상, 아직 생성 이력이 없음)는 정상 상태이므로 제외한다. */}
      {helperDiag && !helperDiag.ok && helperDiag.stage !== 'manifest' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">도우미에 연결되지 않아 폴더 선택·생성을 할 수 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">{helperDiag.message}</p>
          <p className="mt-1.5 text-[11px] text-amber-700">고치면 자동으로 사라집니다(20초마다 재확인 중).</p>
        </div>
      )}

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* ⭐ 주 버튼 — 폴더 고르면 도우미로 올려 자동 생성까지. 웹에서 전부(앱 안 열어도 됨). */}
        <button onClick={handleUploadAndGenerate} disabled={scanning || registering}
          className="bg-[#E31837] text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
          {scanning ? '처리 중…' : '소싱 폴더 선택 → 자동 생성'}
        </button>
        {/* 이미 도우미가 생성해 둔 결과가 있으면 바로 불러오기(생성 없이). */}
        {helperDiag?.ok && (
          <button onClick={handleLoadFromHelper} disabled={scanning || registering}
            className="text-sm font-semibold rounded-lg px-4 py-2 border border-gray-300 text-gray-700 disabled:opacity-50">
            {scanning ? '불러오는 중…' : `이전 생성결과 불러오기 (${helperDiag.records ?? 0})`}
          </button>
        )}
        {/* 이미 폴더에 결과가 있을 때 그것만 읽기(생성 안 함) — 고급/폴백. */}
        <button onClick={handlePick} disabled={scanning || registering}
          className="text-xs font-medium rounded-lg px-3 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-50">
          {scanning ? '' : '폴더에서 결과만 읽기'}
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

      {/* ── 실시간 생성 진행 패널 ──────────────────────────────────────────
          "처리 중…"만 뜨고 언제 끝날지 몰라 무한정 기다리던 문제 해결.
          단계(인식→생성→누끼)·건수·진행률·경과·남은시간을 매초 갱신한다. */}
      {gen && (() => {
        const p = gen.progress;
        const step = p ? GEN_STEP_META[p.phase] : null;
        const pct = p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
        const elapsedMs = Math.max(0, nowTick - gen.startedAt);
        const remainMs = gen.etaMs != null ? Math.max(0, gen.etaMs - (nowTick - gen.etaAt)) : null;
        // 4분 넘게 진행 갱신이 없으면(엔진 로딩은 예외적으로 길 수 있음) 정체 가능성 안내.
        const stalled = p != null && nowTick - gen.updatedAt > 240_000;
        return (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse flex-none" />
              <span className="text-sm font-semibold text-indigo-900">
                {step ? `${step.idx}/3단계 · ${step.label}` : '엔진 준비 중 (모델 로딩)'}
              </span>
              <span className="flex-1" />
              {pct != null && <span className="text-sm font-bold text-indigo-700 tabular-nums">{pct}%</span>}
            </div>

            {/* 진행 바 — 단계 내 건수 기준. 준비 중(마커 전)엔 불확정 애니메이션. */}
            <div className="h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
              {pct != null
                ? <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                : <div className="h-full w-1/3 bg-indigo-400/70 rounded-full animate-pulse" />}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-indigo-800">
              {p && <span>진행 <b className="tabular-nums">{p.done}/{p.total}</b>건</span>}
              <span>경과 <b className="tabular-nums">{fmtDur(elapsedMs)}</b></span>
              {remainMs != null
                ? <span>남은 예상 <b className="tabular-nums">약 {fmtDur(remainMs)}</b></span>
                : <span className="text-indigo-500">남은 시간 계산 중…</span>}
            </div>

            {!p && (
              <p className="text-[11px] text-indigo-500 leading-snug">
                ollama(텍스트)·ComfyUI(누끼)·CLIP 모델을 올리는 중입니다. 최초 1회는 다운로드까지 있어 수 분 걸릴 수 있어요 — 정상 진행 중입니다.
              </p>
            )}
            {stalled && (
              <p className="text-[11px] text-amber-700 leading-snug">
                4분 넘게 진행 갱신이 없습니다. 한 건이 오래 걸릴 수도 있지만, 계속 멈춰 있으면 도우미 앱의 <b>올인원 생성 로그</b>를 확인하세요.
              </p>
            )}
          </div>
        );
      })()}

      {/* 도우미가 결과를 들고 있으면 어느 폴더를 골라야 하는지 미리 알려준다(폴더 오선택 예방). */}
      {helperFolder && rows.length === 0 && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 break-all">
          도우미가 생성해 둔 결과가 있습니다(<b>{helperFolder}</b>). 위 <b>&ldquo;도우미에서 바로 불러오기&rdquo;</b>를 누르면 폴더 선택 없이 카드가 채워집니다.
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {certNotice && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
          {certNotice}
          <button type="button" onClick={() => setCertNotice('')} className="ml-2 text-xs underline">닫기</button>
        </p>
      )}

      {/* 인증(KC) 등록 상태 — 등록 전에 보여준다. 전기용품 등을 인증정보 없이 올리면 판매정지 사유. */}
      {rows.length > 0 && (
        <CertStatusBlock
          previews={certPreviews}
          products={rows
            .filter((r) => r.status !== 'success')
            .map((r) => ({ uid: r.uid, name: r.edit.displayName || r.gen?.originalName || r.productCode }))}
          loading={certLoading}
          onRetry={() => void loadCertPreviews(certInput)}
        />
      )}

      {/* 진단 — 카테고리·상세글·옵션·노출명·대표이미지가 왜 비었는지 단계별 근거 */}
      {diag && (
        <DiagPanel diag={diag} helper={helperDiag} open={diagOpen} onToggle={() => setDiagOpen((v) => !v)} />
      )}

      {/* 업로드 전 책임 확인 게이트 — 지재권/옵션명/책임동의 */}
      <PreUploadConfirmModal
        open={preUploadOpen}
        count={preUploadCount}
        onConfirm={() => { setPreUploadOpen(false); handleRegister(); }}
        onCancel={() => setPreUploadOpen(false)}
      />

      {/* 카테고리 트리 선택 — 대량등록과 동일 picker. 선택 시 해당 행의 코드·경로를 갱신. */}
      <CategoryCascadingPicker
        isOpen={catPickerUid !== null}
        onClose={() => setCatPickerUid(null)}
        currentCode={rows.find((r) => r.uid === catPickerUid)?.edit.categoryCode || undefined}
        title={`카테고리 선택 — ${rows.find((r) => r.uid === catPickerUid)?.edit.displayName || ''}`}
        onSelect={(code, fullPath) => {
          if (catPickerUid) patchEdit(catPickerUid, { categoryCode: code, categoryPath: fullPath });
          setCatPickerUid(null);
        }}
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
          const thumb = r.mainImages[r.selectedMainIdx]?.objectUrl;
          const regenSelected = r.selectedMainIdx < r.regenCount;
          const editable = !!g && r.status !== 'success' && !registering;
          const priceLow = e.sellingPrice != null && e.sellingPrice < 100;
          const statusColor = r.status === 'success' ? 'border-green-400' : r.status === 'error' ? 'border-red-400'
            : g?.needsReview ? 'border-amber-300' : 'border-gray-200';
          return (
            <div key={r.uid} data-field-scope className={`bg-white border ${statusColor} rounded-xl p-3 flex flex-col gap-2`}>
              <div className="flex gap-3">
                <div className="relative flex-none">
                  {thumb
                    ? <img src={thumb} alt="" className="w-20 h-20 object-cover rounded-lg bg-gray-100" />
                    : <div className="w-20 h-20 rounded-lg bg-gray-100" />}
                  {g?.mainImageWarning && (
                    <span title={g.mainImageWarning}
                      className="absolute -top-1 -left-1 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center cursor-help">!</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 누끼 반려(워커 품질게이트) → 기본이 첫 원본. "직접 선택"으로 잘못 보이지 않게 별도 표기. */}
                    {g?.thumbRejected && r.selectedMainIdx === r.regenCount
                      ? <span title={g.thumbRejectReason || '누끼 결과가 원본보다 나빠 원본을 대표로 사용'}
                          className="text-[10px] bg-amber-500 text-white rounded px-1 cursor-help">누끼 반려 · 원본 대표</span>
                      : r.selectedMainIdx !== 0
                        ? <span className="text-[10px] bg-blue-500 text-white rounded px-1">직접 선택</span>
                        : regenSelected
                          ? <span className="text-[10px] text-emerald-600 font-medium">AI 누끼 대표</span>
                          : r.mainAiPicked && <span className="text-[10px] text-emerald-600 font-medium">AI 선택 대표</span>}
                    {(g?.detailDroppedNames?.length ?? 0) > 0 && (
                      <span className="text-[10px] text-gray-400">상세 광고 {g!.detailDroppedNames!.length}컷 제외</span>
                    )}
                    {g?.needsReview && <span className="text-[10px] bg-amber-400 text-white rounded px-1">검수필요</span>}
                    {!g && (
                      <span title={`폴더코드 "${r.productCode}" 에 해당하는 워커 생성결과를 찾지 못했습니다. 위 진단 패널을 확인하세요.`}
                        className="text-[10px] bg-gray-400 text-white rounded px-1 cursor-help">워커결과 없음</span>
                    )}
                    {r.status === 'success' && <span className="text-[10px] bg-green-500 text-white rounded px-1">등록완료</span>}
                    {r.status === 'error' && <span className="text-[10px] bg-red-500 text-white rounded px-1">실패</span>}
                  </div>
                  {/* 노출명 — 직접 수정(버퍼링: Enter/blur 에만 커밋) */}
                  <DraftField value={e.displayName} disabled={!editable}
                    onCommit={(v) => patchEdit(r.uid, { displayName: v })}
                    placeholder={r.scanned.productJson?.name || r.productCode}
                    className="w-full text-sm font-semibold text-gray-900 leading-snug border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-transparent" />
                  {/* 원본 상품명(소싱 원문) — 노출명과 비교용. 노출명과 다를 때만 표시. */}
                  {g?.originalName && g.originalName !== e.displayName && (
                    <p className="px-1 text-[11px] text-gray-400 leading-snug break-all">
                      <span className="text-gray-400">원본명:</span> {g.originalName}
                    </p>
                  )}
                  {/* 카테고리 경로 + 코드 — 직접 수정 or 트리 선택 */}
                  <div className="flex items-center gap-1">
                    <DraftField value={e.categoryPath} disabled={!editable}
                      onCommit={(v) => patchEdit(r.uid, { categoryPath: v })} placeholder="카테고리 경로"
                      className="flex-1 min-w-0 text-xs text-blue-600 border border-transparent hover:border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-transparent" />
                    <DraftField value={e.categoryCode} disabled={!editable} inputMode="numeric"
                      sanitize={(v) => v.replace(/[^0-9]/g, '')}
                      onCommit={(v) => patchEdit(r.uid, { categoryCode: v })} placeholder="코드"
                      className="w-20 text-xs text-gray-700 border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                    {/* 트리에서 카테고리 직접 선택 (대량등록과 동일 picker) */}
                    <button type="button" disabled={!editable} onClick={() => setCatPickerUid(r.uid)}
                      title="카테고리 트리에서 선택" className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-1.5 py-0.5 disabled:opacity-40">📂</button>
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
              {/* 대표컷 후보 — 누끼 가공본과 원본 중 직접 고른다. 기본값은 AI 추천(0번).
                  워커는 누끼를 1장만 만들지만, 원본 후보가 함께 남아 있어 되돌릴 수 있다. */}
              {r.mainImages.length > 1 && (
                <div>
                  <button type="button" disabled={!editable}
                    onClick={() => toggleMainPicker(r.uid, r.mainImages)}
                    className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 disabled:opacity-40">
                    대표컷 변경 ({r.selectedMainIdx + 1}/{r.mainImages.length}) {openMain[r.uid] ? '▴' : '▾'}
                  </button>
                  {openMain[r.uid] && (() => {
                    const addableMain = addableMainImages(r);
                    return (
                    <>
                      <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                        {r.mainImages.map((img, i) => (
                          <div key={`${img.name}-${i}`} role="button" tabIndex={editable ? 0 : -1}
                            onClick={() => editable && selectMain(r.uid, i, img)}
                            title={i < r.regenCount ? `누끼 가공본 · ${img.name}` : img.name}
                            className={`relative flex-none w-14 h-14 rounded-md overflow-hidden border-2 ${editable ? 'cursor-pointer' : ''} ${i === r.selectedMainIdx ? 'border-[#E31837]' : 'border-transparent hover:border-gray-300'}`}>
                            {img.objectUrl
                              ? <img src={img.objectUrl} alt="" className="w-full h-full object-cover bg-gray-100" />
                              : <div className="w-full h-full bg-gray-100" />}
                            {i < r.regenCount && (
                              <span className="absolute bottom-0 inset-x-0 bg-emerald-600/85 text-white text-[9px] leading-tight text-center">누끼</span>
                            )}
                            {i === r.selectedMainIdx && (
                              <span className="absolute top-0 left-0 bg-[#E31837] text-white text-[9px] leading-none px-1 py-0.5 rounded-br">★대표</span>
                            )}
                            {/* 이 후보를 서브이미지에서 제외(대표 외 후보는 서브이미지로 등록됨) */}
                            {editable && r.mainImages.length > 1 && (
                              <button type="button" title="서브이미지에서 제외"
                                onClick={(ev) => { ev.stopPropagation(); removeMainImage(r.uid, img.name); }}
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-bl w-4 h-4 text-[10px] leading-none flex items-center justify-center">×</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* 뺀 대표 후보 되살리기 */}
                      {addableMain.length > 0 && (
                        <button type="button" disabled={!editable} onClick={() => void toggleDetailPool(`main:${r.uid}`, addableMain)}
                          className="text-[11px] text-blue-600 disabled:opacity-40">
                          {openDetailPool[`main:${r.uid}`] ? '되살리기 닫기' : `+ 뺀 이미지 되살리기 (${addableMain.length})`}
                        </button>
                      )}
                      {openDetailPool[`main:${r.uid}`] && addableMain.length > 0 && (
                        <div className="mt-1 flex gap-1 overflow-x-auto pb-1 bg-gray-50 rounded p-1">
                          {addableMain.map((img) => (
                            <button type="button" key={img.name} disabled={!editable}
                              onClick={() => void addMainImage(r.uid, img)} title="후보로 되살리기"
                              className="relative flex-none group disabled:opacity-40">
                              <img src={img.objectUrl} alt="" loading="lazy"
                                className="h-14 w-14 object-cover rounded border border-gray-200 bg-white opacity-70 group-hover:opacity-100" />
                              <span className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center">+</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                    );
                  })()}
                </div>
              )}

              {/* 옵션 — 카테고리 스키마 기반 실제 등록 옵션(미리보기로 자동 채움). 편집 가능. */}
              {g && (() => {
                const op = optionPreviews.get(r.uid);
                const autoFilled = !!op && op.buyOptions.length > 0;
                const missNames = new Set(unresolvedOptionInput(e, op)); // 직접 입력 필요(미해결)
                return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">
                      옵션 (스펙)
                      {autoFilled && <span className="ml-1 text-[10px] text-emerald-600 font-medium">쿠팡 자동옵션</span>}
                    </span>
                    <button type="button" disabled={!editable} onClick={() => addOption(r.uid)} className="text-[11px] text-blue-600 disabled:opacity-40">+ 옵션 추가</button>
                  </div>
                  {op?.ambiguous && (
                    <p className="text-[10px] text-amber-600">택1 상품 — 값 확인 필요{op.optionCandidates?.length ? `: ${op.optionCandidates.map((c) => `${c.name}(${c.candidates.join('/')})`).join(', ')}` : ''}</p>
                  )}
                  {missNames.size > 0 && (
                    <p className="text-[10px] text-red-600">⚠️ 상품명에 {[...missNames].join('·')} 정보가 없습니다 — 실제 값을 직접 입력하세요(입력 전 등록 불가).</p>
                  )}
                  {e.options.map((o, i) => {
                    const miss = missNames.has(o.name);
                    const vCls = miss ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-blue-300 disabled:bg-gray-50';
                    return (
                    <div key={i} className="flex items-center gap-1">
                      <DraftField value={o.name} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { name: v })} placeholder="항목" className="w-20 text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                      <DraftField value={o.value} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { value: v })} placeholder={miss ? '직접 입력' : '값'} className={`flex-1 min-w-0 text-[11px] border rounded px-1 py-0.5 focus:outline-none ${vCls}`} />
                      <DraftField value={o.unit || ''} disabled={!editable} onCommit={(v) => patchOption(r.uid, i, { unit: v })} placeholder="단위" className="w-12 text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                      <button type="button" disabled={!editable} onClick={() => removeOption(r.uid, i)} className="text-gray-400 hover:text-red-500 text-sm px-1 leading-none disabled:opacity-40">×</button>
                    </div>
                    );
                  })}
                </div>
                );
              })()}
              {/* 옵션값 수동 선택 — 대량등록처럼 카테고리 속성을 트리 펼쳐 드롭다운/입력으로 확정.
                  비워두면 서버가 자동추출/자동채움하고, 여기서 고른 값만 그걸 덮어쓴다(attributeValuesOverride). */}
              {g && e.categoryCode && (() => {
                const meta = attrMetaByCode[e.categoryCode];
                const attrs = (meta || []).filter((a) => a.attributeTypeName);
                if (attrs.length === 0) return null;
                return (
                  <div>
                    <button type="button" onClick={() => setOpenAttr((p) => ({ ...p, [r.uid]: !p[r.uid] }))}
                      className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1">
                      옵션값 수동 선택 (속성 {attrs.length}) {openAttr[r.uid] ? '▴' : '▾'}
                    </button>
                    {openAttr[r.uid] && (
                      <div className="mt-1 grid gap-1.5 sm:grid-cols-2 bg-gray-50 rounded p-2">
                        {attrs.map((a) => {
                          const allowed = a.attributeValues?.map((v) => v.attributeValueName).filter(Boolean) || [];
                          const val = e.attributeValues[a.attributeTypeName] ?? '';
                          const label = `${a.attributeTypeName}${a.basicUnit ? ` (${a.basicUnit})` : ''}${a.required ? ' *' : ''}`;
                          return (
                            <label key={a.attributeTypeName} className="flex flex-col gap-0.5">
                              <span className={`text-[10px] ${a.required ? 'text-red-500' : 'text-gray-500'}`}>{label}</span>
                              {allowed.length > 0 ? (
                                <select value={val} disabled={!editable}
                                  onChange={(ev) => setAttrValue(r.uid, a.attributeTypeName, ev.target.value)}
                                  className="text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-100">
                                  <option value="">자동</option>
                                  {allowed.map((v) => <option key={v} value={v}>{v}</option>)}
                                </select>
                              ) : (
                                <DraftField value={val} disabled={!editable}
                                  onCommit={(v) => setAttrValue(r.uid, a.attributeTypeName, v)}
                                  placeholder={a.basicUnit ? `숫자 (${a.basicUnit})` : '자동'}
                                  className="text-[11px] border border-gray-200 focus:border-blue-300 rounded px-1 py-0.5 focus:outline-none disabled:bg-gray-50" />
                              )}
                            </label>
                          );
                        })}
                        <p className="sm:col-span-2 text-[10px] text-gray-400">빈 칸(자동)은 서버가 상품명에서 자동 추출·채움합니다. 여기서 고른 값만 우선 적용됩니다.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              {g?.sourceUrl && <a href={g.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 break-all">원본: {g.sourceUrl}</a>}
              {g && (
                <div>
                  <button onClick={() => void toggleDetail(r.uid, r.detailImages)} className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1">
                    상세페이지 편집 {openDetail[r.uid] ? '▴' : '▾'}
                    <span className="ml-1 text-gray-400">이미지 {r.detailImages.length}장</span>
                  </button>
                  {openDetail[r.uid] && (() => {
                    const addable = addableDetailImages(r);
                    return (
                    <>
                      {/* 상세페이지에 첨부될 이미지 — 이상한 컷은 × 로 빼고, 빠진 컷은 + 로 추가 */}
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[11px] text-gray-500">상세 이미지 {r.detailImages.length}장 (등록에 첨부)</span>
                        {addable.length > 0 && (
                          <button type="button" disabled={!editable} onClick={() => void toggleDetailPool(r.uid, addable)}
                            className="text-[11px] text-blue-600 disabled:opacity-40">
                            {openDetailPool[r.uid] ? '이미지 추가 닫기' : `+ 이미지 추가 (${addable.length})`}
                          </button>
                        )}
                      </div>
                      {r.detailImages.length > 0 ? (
                        <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
                          {r.detailImages.map((img) => (
                            <div key={img.name} className="relative flex-none">
                              <img src={img.objectUrl} alt="" loading="lazy"
                                className="h-16 w-16 object-cover rounded border border-gray-200 bg-white" />
                              {editable && (
                                <button type="button" onClick={() => removeDetailImage(r.uid, img.name)}
                                  title="상세에서 제외"
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center">×</button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-amber-600">상세 이미지 없음 — 아래 &quot;+ 이미지 추가&quot;로 넣거나, 소싱 폴더에 상세이미지가 없는 경우입니다.</p>
                      )}
                      {/* 추가 가능한 이미지 풀 (리뷰/정보/큐레이션 제외분) — + 로 상세에 포함 */}
                      {openDetailPool[r.uid] && addable.length > 0 && (
                        <div className="mt-1 flex gap-1 overflow-x-auto pb-1 bg-gray-50 rounded p-1">
                          {addable.map((img) => (
                            <button type="button" key={img.name} disabled={!editable}
                              onClick={() => void addDetailImage(r.uid, img)} title="상세에 추가"
                              className="relative flex-none group disabled:opacity-40">
                              <img src={img.objectUrl} alt="" loading="lazy"
                                className="h-16 w-16 object-cover rounded border border-gray-200 bg-white opacity-70 group-hover:opacity-100" />
                              <span className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center">+</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea value={e.detail} disabled={!editable}
                        onChange={(ev) => patchEdit(r.uid, { detail: ev.target.value })}
                        className="mt-1 w-full text-[12px] whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-200 focus:border-blue-300 rounded p-2 h-72 overflow-auto focus:outline-none disabled:bg-gray-100" />
                      {/* 실제 상세페이지 미리보기 — 글(**볼드** 렌더)과 이미지가 함께 교차되어
                          쿠팡에 등록될 모습 그대로. 위 textarea 는 원문 편집용, 아래는 렌더 결과. */}
                      {(() => {
                        const paras = (e.detail || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
                        const imgs = r.detailImages.map((img) => img.objectUrl).filter((u): u is string => !!u);
                        if (paras.length === 0 && imgs.length === 0) return null;
                        const html = buildRichDetailPageHtml({
                          productName: e.displayName || r.scanned.productJson?.name || r.productCode,
                          brand: '',
                          aiStoryParagraphs: paras,
                          reviewImageUrls: [],
                          detailImageUrls: imgs,
                          categoryPath: e.categoryPath,
                        }, 'A');
                        return (
                          <div className="mt-2">
                            <p className="text-[11px] text-gray-500 mb-1">미리보기 (등록될 상세페이지 — 글·이미지 함께)</p>
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ maxHeight: 420, overflowY: 'auto' }}>
                              <iframe
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;}</style></head><body>${html}</body></html>`}
                                title="상세페이지 미리보기"
                                className="w-full border-0"
                                style={{ height: 420 }}
                                sandbox="allow-same-origin"
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </>
                    );
                  })()}
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
          {helperDiag?.ok
            ? '위 “도우미에서 바로 불러오기”를 누르면 폴더 선택 없이 카드가 채워집니다.'
            : '먼저 데스크탑 메가로드 도우미 → ⚙️ 올인원 생성으로 폴더를 처리하세요. 그다음 여기서 “도우미에서 바로 불러오기”(또는 소싱 폴더 선택)로 불러옵니다.'}
        </div>
      )}
    </div>
  );
}
