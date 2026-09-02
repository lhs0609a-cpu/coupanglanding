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
import type { AllinoneTiming } from '@/lib/megaload/allinone-local';
// 마지막 생성이 어떻게 끝났는지(실패 사유)를 도우미에게 묻는다 — 0건일 때 이유를 말하기 위해.
import { fetchImportState } from '@/lib/megaload/naver-ingest-local';
import {
  diagnoseLocalHelper, discoverLocalEndpoint, fetchLocalManifest,
  fetchLocalList, classifyLocalImages, productDirOf, localFileUrl, fetchLocalFile,
  collectFolderFiles, uploadFolderFiles, startLocalGenerate, pollGenStatus,
  type HelperDiag, type LocalEndpoint, type GenProgress, type GenStep,
} from '@/lib/megaload/allinone-local';
import { focusNextField } from './focusNextField';
import PreUploadConfirmModal from './PreUploadConfirmModal';
import SkipReviewRiskModal, { type SkipReviewPlan, type SkipReviewOptions } from './SkipReviewRiskModal';
import { reportClientError } from '@/lib/utils/client-error-reporter';
import { consumeHandoff } from '@/lib/megaload/autopilot-handoff';
import { consumeRunTiming, type RunTiming } from '@/lib/megaload/run-timing';
import {
  auditProduct, type AuditInput, type AuditResult, type RegenTask,
} from '@/lib/megaload/services/allinone-final-audit';
import { CertStatusBlock } from './CertStatusBlock';
import CategoryCascadingPicker from './bulk/CategoryCascadingPicker';
import { buildRichDetailPageHtml } from '@/lib/megaload/services/detail-page-builder';
import { checkCompliance } from '@/lib/megaload/services/compliance-filter';
import { buildSearchTags } from '@/lib/megaload/services/search-tags';
import type { CertPreviewResult } from '@/app/api/megaload/products/cert-preview/route';
import type { OptionPreviewResult } from '@/app/api/megaload/products/option-preview/route';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';

const BATCH_SIZE = 10;
const IMG_RE = /\.(png|jpg|jpeg|webp)$/i;

/** AI 최종점검: 스캔 → 재생성 1회 → 재스캔. 2 라운드 고정(무한 재생성 방지). */
const MAX_AUDIT_ROUND = 2;
/** 도우미가 꺼져 있으면 잡이 영원히 pending 이라 등록이 멈춘다 — 여기서 끊고 제외/경고로 넘긴다. */
const REGEN_TIMEOUT_MS = 15 * 60_000;

/**
 * 무인 자동등록 설정 — 폴더를 고르기 전에 미리 켜 두는 "검수 생략 예약".
 *
 * ⚠️ 이 상태는 **위험모달을 통과한 동의(consentAt)** 없이는 절대 on 이 될 수 없다.
 *    저장소에서 복원하거나, 다른 코드가 setAutoPilot({on:true}) 하는 식으로 우회하면
 *    사용자가 동의한 적 없는 무인 등록이 돌아간다 → armAutoPilot() 한 경로로만 켠다.
 */
interface AutoPilotState {
  on: boolean;
  /** 등록 직전 AI 최종점검 실행 여부 */
  audit: boolean;
  /** 점검으로도 못 고친 상품을 등록에서 뺄지(false = 경고만 하고 그대로 등록) */
  excludeUnfixed: boolean;
  /** 위험모달 확인 시각(ms). 0 이면 동의 없음 = 절대 실행 금지. */
  consentAt: number;
}
const AUTOPILOT_OFF: AutoPilotState = { on: false, audit: true, excludeUnfixed: true, consentAt: 0 };
/** 자동 등록 직전 취소 유예(초). 무인이라도 눈앞에 있으면 멈출 수 있어야 한다. */
const AUTOPILOT_DELAY_SEC = 10;
/**
 * 동의 유효시간. 아침에 켜 둔 탭이 밤까지 열려 있다가 폴더 하나 골랐다고 전량 등록되면 안 된다.
 * 만료되면 자동으로 꺼지고, 다시 켜려면 동의를 새로 받는다.
 */
const AUTOPILOT_CONSENT_TTL_MS = 6 * 60 * 60_000;
/** 무인일 때 대표컷 가공을 기다려 주는 한도. 넘으면 자동 등록을 포기하고 사람에게 넘긴다. */
const AUTOPILOT_THUMB_WAIT_MS = 15 * 60_000;
const autoPilotArmed = (ap: AutoPilotState, now = Date.now()) =>
  ap.on && ap.consentAt > 0 && now - ap.consentAt < AUTOPILOT_CONSENT_TTL_MS;

/** 점검 진행 스냅샷(화면 패널용). */
interface AuditProgressView {
  phase: 'scan' | 'regen';
  round: number; maxRound: number;
  total: number; fixed: number; warned: number;
  regenDone: number; regenTotal: number;
  message: string;
  /** 점검 시작 시각(epoch ms) — 경과·남은시간 표시용. 라운드가 바뀌어도 유지한다. */
  startedAt: number;
  /** 재생성 단계 시작 시각 — ETA 는 이 단계 안에서만 의미가 있다(스캔은 즉시 끝난다). */
  regenStartedAt: number;
}
/** 점검 결과 요약 — 등록 후에도 화면에 남겨 무엇이 고쳐지고 무엇이 빠졌는지 보여준다. */
interface AuditReport {
  total: number; registered: number;
  fixed: number; warned: number; regenerated: number;
  excluded: { name: string; reasons: string[] }[];
  warnings: { name: string; messages: string[] }[];
}

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
  /** 비전(VLM)이 로고/글자/배송배너/캡처/인물로 판정한 대표 후보 파일명 — 대표컷 후보 목록에서 제외 */
  mainDroppedNames?: string[];
  /** 원본(DOM) 상품설명 텍스트 — 상세페이지 맨 끝 "상품 상세정보"에 노출 */
  sourceDescription?: string | null;
  /** CLIP 이 유지한 리뷰컷 절대경로(참고용) */
  reviewImages?: string[];
  /**
   * CLIP 이 버린 리뷰 파일명 — 사람 얼굴/인물, 채팅·별점 캡처, 영수증·송장, 상품 무관 사진.
   * 리뷰컷은 상세페이지 본문에 크게 실리므로(pickBodyImages 1순위) 여기서 반드시 제외한다.
   */
  reviewDroppedNames?: string[];
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
  /**
   * 대표컷 누끼가 **아직 진행 중**이다(run-folder --defer-thumb).
   * 누끼는 등록 때 필요한 작업이라 생성이 그걸 기다리지 않고 먼저 검수를 열어 준다.
   * 이 값이 true 인 동안 이 상품의 mainImage 는 **원본**이며, 가공이 끝나면 도우미가
   * 같은 파일을 덮어써 최종 대표컷으로 바뀐다 → 등록 전에 다시 불러와야 한다.
   */
  thumbPending?: boolean;
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
  /**
   * 쿠팡에 올릴 갤러리 선택 — 파일명 배열. [0]=대표, [1..9]=추가이미지(최대 9장).
   * null 이면 "자동"(대표 + 우선순위 상위 9장)으로, 예전 동작 그대로다. 사용자가 한 번이라도
   * 고르면 그 순간 확정되어 여기에 남는다.
   * ⚠️ 인덱스가 아니라 **파일명**으로 들고 있어야 후보를 ×로 빼거나 되살려 순서가 바뀌어도
   *    선택이 어긋나지 않는다(mainImages 안에서 파일명은 이미 유일하게 정리돼 있다).
   */
  pickedMain: string[] | null;
  /** 상세이미지: CLIP 이 버린 광고/배송/리뷰컷을 제외한 상세컷(등록 업로드 대상) */
  detailImages: ScannedImageFile[];
  /**
   * 리뷰이미지(review_images/) — 상세페이지 "글↔이미지 교차"의 **1순위 본문 이미지**다
   * (detail-page-builder.pickBodyImages: 리뷰컷이 있으면 상세컷 대신 리뷰컷을 쓴다).
   * 예전엔 카드가 이걸 보여주지도, 미리보기에 넣지도 않아서 "리뷰 폴더를 안 쓰는 것처럼"
   * 보였다(실제로는 등록 시 사용됨). 이제 행 상태로 들고 미리보기·편집에 그대로 반영한다.
   */
  reviewImages: ScannedImageFile[];
  /**
   * 로컬 에이전트(도우미 GPU)가 뽑아 온 **쿠팡 연관검색어** 후보.
   * 검색어 태그 20칸을 채우는 1순위 재료다. 비어 있으면 생성기 키워드 + 조합 폴백으로만 채운다.
   */
  tagCandidates?: string[];
  /** 대표컷이 CLIP(AI) 판단으로 선택/재정렬됐는지(뱃지 표시용) */
  mainAiPicked: boolean;
  usingRegen: boolean;
  /**
   * 지금 들고 있는 상세글이 **어느 분류로 쓰였나**. 초기값은 워커 판단(gen.categoryPath).
   * 카테고리를 바꿨는지는 gen 과 대조해 판정했는데, gen 은 불변이라 **다시 써도 영원히 달랐다** —
   * 재생성을 마친 카드가 계속 "예전 카테고리로 쓰인 그대로"라고 경고했다. 맞는 경고까지
   * 안 믿게 만드는 종류의 거짓말이라, 판정 기준을 "상세글이 쓰인 분류"로 옮긴다.
   */
  detailCatPath: string;
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
/**
 * 상세글에서 마크다운 강조기호를 걷어낸다.
 *   워커는 이제 '**' 를 만들지 않지만, 이전 버전으로 생성해 둔 결과에는 그대로 남아 있다.
 *   편집창·다른 채널에서 별표가 날것으로 보이므로 불러오는 시점에 정리한다(렌더 결과는 동일).
 */
function stripEmphasisMarks(s: string): string {
  return String(s || '')
    .replace(/\*\*([^\n]*?)\*\*/g, '$1')
    .replace(/__([^\n]*?)__/g, '$1')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/\*/g, '');
}

/**
 * 광고법 위반 누적 대상 어휘(유기농·국산·국내산·포도당·수액 등)를 불러오는 시점에 정리한다.
 *   서버(coupang-product-builder)가 등록 직전에 어차피 지우므로, 카드에만 남아 있으면
 *   "검수 화면에서 본 문구 ≠ 실제 등록 문구" 가 된다. 같은 필터를 여기서도 한 번 돌려 일치시킨다.
 *   (워커 릴리스 전까지는 이 정리가 사용자 눈에 보이는 유일한 방어선이기도 하다.)
 */
function scrubForbidden(text: string, categoryPath?: string): string {
  if (!text) return text;
  return checkCompliance(text, { removeErrors: true, categoryContext: categoryPath }).cleanedText;
}

function initEdit(g: GenRecord | null): RowEdit {
  const catPath = g?.categoryPath || '';
  return {
    displayName: scrubForbidden(g?.displayName || '', catPath),
    sellingPrice: g?.sellingPrice ?? null,
    categoryCode: g?.categoryCode || '',
    categoryPath: catPath,
    detail: scrubForbidden(stripEmphasisMarks(g?.detail || ''), catPath),
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
 * 상세이미지에서 CLIP·비전이 버린 광고/배송/리뷰컷만 정확히 제외.
 * 워커가 준 detailDroppedNames(버린 파일명)만 뺀다 — 워커가 못 본 이미지(리뷰/대표오버플로 폴백)는 보존.
 *
 * ⚠️ 예전엔 "전부 걸러지면 원본 유지(안전 우선)" 폴백이 있었다. 그런데 소싱 폴더의 상세컷이
 *    N멤버십·적립 배너 **한 장뿐**인 상품이 흔하다(실측 8건 중 5건: detail_images = 1000x120
 *    "친구 초대하고 5,000P" 배너 1장). 워커는 그 1장을 정확히 광고로 버렸는데 이 폴백이
 *    되살려, 상세페이지 맨 끝 "상품 상세정보"에 네이버 멤버십 광고가 실렸다(등록에도 첨부됨).
 *    파일명이 하나도 안 맞는 경우(큐레이션 무효)는 filtered === scanned 라 자동 보존되므로,
 *    폴백 없이 걸러진 결과를 그대로 쓴다 — "전부 광고"면 0장이 정답이다.
 */
function applyDetailCuration(scanned: ScannedImageFile[], gen: GenRecord | null): ScannedImageFile[] {
  if (!gen) return scanned;
  const dropped = new Set((gen.detailDroppedNames || []).map(basename));
  if (dropped.size === 0) return scanned;
  return scanned.filter((img) => !dropped.has(img.name));
}

/**
 * 비전이 고른 대표컷이 **리뷰 폴더의 사진**인지 판정.
 *
 * ⚠️ 워커는 파일명(basename)만 넘기는데, 소싱 폴더는 `main_images/8.jpg` 와 `review_images/8.jpg`
 *    처럼 폴더만 다르고 이름이 같은 파일이 흔하다. 그래서 "이름이 같으니 같은 사진"으로 취급하면
 *    엉뚱한 폴더의 사진이 대표가 된다. 어느 폴더에서 골랐는지는 **경로**로만 알 수 있다.
 *    (실측 256545708: 비전은 review_images/8.jpg(잡곡 실사)를 골랐는데, 화면엔 비전이 버린
 *     main_images/8.jpg — 거의 백지 이미지 — 가 대표로 떴다.)
 */
/** 쿠팡 상품 이미지 한도 — 0번=대표(REPRESENTATION) + 나머지 9장=추가(DETAIL). */
export const GALLERY_MAX = 10;

/**
 * 사용자가 아직 아무것도 안 골랐을 때의 기본 갤러리 = 대표 + 추천 순위 상위 9장.
 * 순위: 리뷰 실사(지재권 위험 최저) → 누끼 가공본(우리 산출물) → 업체 원본.
 * ⚠️ 순위는 "10장을 넘을 때 뭘 살릴지"에만 쓰고, 살아남은 것의 **순서는 카드 순서 그대로**다.
 */
export function defaultPickedMain(r: Row): string[] {
  const chosen = r.mainImages[r.selectedMainIdx];
  const reviewNames = new Set((r.reviewImages || []).map((x) => x.name));
  const seen = new Set<string>(chosen?.name ? [chosen.name] : []);
  const rest = r.mainImages
    .map((img, i) => ({ img, i }))
    .filter(({ img, i }) => {
      if (i === r.selectedMainIdx) return false;
      if (!img?.name || seen.has(img.name)) return false;
      seen.add(img.name);
      return true;
    });
  const subRank = ({ img, i }: { img: ScannedImageFile; i: number }) =>
    (reviewNames.has(img.name) ? 0 : i < r.regenCount ? 1 : 2);
  const keepIdx = new Set(
    [...rest].sort((a, b) => subRank(a) - subRank(b) || a.i - b.i)
      .slice(0, GALLERY_MAX - 1).map(({ i }) => i),
  );
  return [
    ...(chosen?.name ? [chosen.name] : []),
    ...rest.filter(({ i }) => keepIdx.has(i)).map(({ img }) => img.name),
  ];
}

/**
 * 이 카드가 실제로 올릴 갤러리(파일명 순서대로). 선택이 없으면 기본값.
 * 후보에서 빠진 파일명은 걸러 낸다 — 사라진 사진이 자리를 차지하면 안 된다.
 */
export function pickedMainNames(r: Row): string[] {
  const have = new Set(r.mainImages.map((m) => m.name));
  const cur = r.pickedMain ? r.pickedMain.filter((n) => have.has(n)) : defaultPickedMain(r);
  return cur.slice(0, GALLERY_MAX);
}

export function pickedFromReview(gen: { mainImage?: string | null } | null): boolean {
  const p = String(gen?.mainImage || '').replace(/\\/g, '/').toLowerCase();
  return /\/(review_images|reviews|review|customer_reviews|리뷰[^/]*)\//.test(p);
}

/**
 * 대표컷 후보에서 비전(VLM)이 "상품 아님"으로 본 것(로고/글자/배송배너/캡처/인물)을 제외.
 * 선택된 대표(gen.mainImage)는 어떤 경우에도 남긴다(자기 자신이 후보에서 사라지는 사고 방지).
 * 전부 제외되면 원본 유지(안전 우선).
 *
 * @param keepPicked 선택된 대표를 이름으로 되살릴지 — **대표가 이 목록(main_images)에서 나온 경우만 true**.
 *                   리뷰컷을 대표로 골랐는데 여기서 되살리면, 이름만 같은 다른 사진이 부활한다(위 주석 참조).
 */
export function applyMainCuration(
  scanned: ScannedImageFile[],
  gen: GenRecord | null,
  keepPicked = true,
): ScannedImageFile[] {
  if (!gen) return scanned;
  const dropped = new Set((gen.mainDroppedNames || []).map(basename));
  if (dropped.size === 0) return scanned;
  const keep = keepPicked ? basename(gen.mainImage || '') : '';
  const filtered = scanned.filter((img) => !dropped.has(img.name) || (!!keep && img.name === keep));
  return filtered.length > 0 ? filtered : scanned;
}

/**
 * 리뷰컷에서 워커(CLIP)가 걸러낸 컷을 제외.
 * ⚠️ 상세컷과 달리 **전부 걸러져도 되살리지 않는다** — 제외 사유가 사람 얼굴·영수증 같은
 *    "실으면 안 되는 것"이라, 이미지 0장이 되는 편이 낫다(상세컷으로 자동 폴백된다).
 */
function applyReviewCuration(scanned: ScannedImageFile[], gen: GenRecord | null): ScannedImageFile[] {
  if (!gen) return scanned;
  const dropped = new Set((gen.reviewDroppedNames || []).map(basename));
  if (dropped.size === 0) return scanned;
  return scanned.filter((img) => !dropped.has(img.name));
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
                  <li>완료되면 여기서 <b>도우미 결과 불러오기</b>(또는 이 폴더 재선택)</li>
                </ol>
                <p className="text-gray-400 text-[11px]">
                  생성에 필요한 엔진은 도우미가 자동으로 준비합니다.
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

/**
 * 화면에서 내린 카드(uid)의 부가 상태를 함께 턴다 — 펼침·재생성 표시가 유령으로 남지 않게.
 * 걸리는 키가 없으면 원본을 그대로 돌려줘 불필요한 리렌더를 만들지 않는다.
 */
function dropKeys<T>(map: Record<string, T>, uids: Set<string>): Record<string, T> {
  if (!Object.keys(map).some((k) => uids.has(k))) return map;
  return Object.fromEntries(Object.entries(map).filter(([k]) => !uids.has(k)));
}

export default function AllInOneRegisterPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  // 대표컷 후보 펼침 상태 — 새 생성 시작 시 함께 초기화하므로 rows 와 같이 위에 선언한다.
  const [openMain, setOpenMain] = useState<Record<string, boolean>>({});
  // 로컬 이미지가 깨졌는지 — 도우미가 업데이트·재시작하면 로컬서버 포트가 바뀌어 카드에 박힌
  //   http://127.0.0.1:<옛포트>/... URL 이 전부 죽는다. 하나라도 로드 실패하면 감지해 배너로 안내.
  const [imagesStale, setImagesStale] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  // ⚠️ AI 최종점검 상태는 여기(상단)에 둔다 — 아래 1초 티커 effect 가 이 값을 의존성으로 읽는데,
  //    선언이 그보다 뒤면 렌더 중 TDZ 로 죽는다(hook 은 선언 순서대로 실행된다).
  const [auditProgress, setAuditProgress] = useState<AuditProgressView | null>(null);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  // 등록 진행 — done=등록 끝난 수, prepared=현재 배치에서 이미지 업로드까지 끝난 수.
  //   배치가 10개 단위라 done 만 보면 눈금이 10개마다 한 번씩 뛴다(50개면 5번). 이미지 업로드가
  //   시간의 대부분이라, 그 사이 진행을 prepared 로 채워야 막대가 실제로 움직인다.
  const [progress, setProgress] = useState<{ done: number; total: number; prepared: number; startedAt: number }>(
    { done: 0, total: 0, prepared: 0, startedAt: 0 },
  );
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
  /**
   * 등록이 끝난 뒤 화면에 남기는 결과 한 줄.
   * 성공 카드는 지워지므로(handleRegister 의 finally) 무엇이 몇 건 올라갔는지는 여기서만 보인다.
   */
  const [doneSummary, setDoneSummary] = useState<{ success: number; failed: number; at: number } | null>(null);
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
  // ⭐ 마지막으로 성공한 진단을 붙잡아 둔다 — 진단이 한 번 실패했다고 "이전 생성결과 불러오기"
  //   버튼을 지워버리면 화면이 초기화된 것처럼 보인다(실사용 문의: "자꾸 초기화된다").
  //   생성이 새로 시작되면 결과 파일이 아직 없어 manifest 가 잠깐 실패하는데, 그때 버튼이
  //   사라져서 방금까지 있던 결과를 부를 방법이 없어졌다. 성공 이력이 있으면 계속 보여준다.
  const [lastGoodDiag, setLastGoodDiag] = useState<HelperDiag | null>(null);
  const [diag, setDiag] = useState<ScanDiag | null>(null);
  const [diagOpen, setDiagOpen] = useState(true);

  // 진행 표시용 1초 티커 — 경과/ETA 를 매초 갱신(생성 폴링은 2초라 그 사이를 메운다).
  //   생성뿐 아니라 **AI 최종점검·등록 중에도** 돌려야 그쪽 경과·남은시간이 멈추지 않는다.
  const genActive = gen !== null;
  const tickerOn = genActive || registering || auditProgress !== null;
  useEffect(() => {
    if (!tickerOn) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tickerOn]);

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
      if (d.ok) setLastGoodDiag(d);
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
        // ⚠️ needsInput 에 있는데 buyOptions 엔 행이 없는 옵션이 생긴다(추출 완전실패·택1 그룹 등).
        //    카드는 e.options 만 그리므로 그런 이름은 **입력칸이 아예 안 나오고**,
        //    unresolvedOptionInput 은 "값 없음"으로 보고 영원히 등록을 막았다(실측 2026-08-06).
        //    → 빈 행을 만들어 사용자가 채울 빨간칸을 반드시 준다.
        const have = new Set(options.map((o) => o.name));
        for (const nm of res2.needsInput || []) {
          if (!nm || have.has(nm)) continue;
          have.add(nm);
          options.push({ name: nm, value: '', unit: undefined });
        }
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
        // 비전이 로고/글자/배너로 판정한 대표후보를 먼저 걸러낸 뒤 재정렬한다.
        //   ⚠️ 대표를 리뷰 폴더에서 골랐으면 main_images 의 동명 파일을 되살리지 않는다(pickedFromReview 주석).
        const fromReview = pickedFromReview(gen);
        const clip = reorderMainByClip(applyMainCuration(sp.mainImages || [], gen, !fromReview), gen);
        // 대표 후보 = 누끼 가공본(있으면 앞) + CLIP 랭킹순 원본.
        // ⭐ 예전엔 가공본이 있으면 원본을 통째로 버렸다. 그래서 누끼 결과가 마음에 안 들어도
        //    되돌릴 방법이 없었다(ComfyUI 는 후보를 1장만 만들고 재시도 경로도 없다).
        //    이제 둘 다 남겨 카드에서 고르게 한다 — 기본값은 그대로 AI 추천(index 0).
        // 워커가 상세/리뷰컷을 대표로 승격했으면(폴더 경계 너머 심사) 그 원본도 대표 후보에 넣는다.
        //   웹 스캔은 폴더명으로만 풀을 나누므로, 승격된 컷은 sp.mainImages 에 없다.
        //   regen 바로 뒤에 두어 "누끼 반려 시 기본값(regen.length)"이 곧 이 원본이 되게 한다.
        const promotedName = gen?.mainImage ? basename(gen.mainImage) : '';
        //   리뷰 폴더에서 고른 경우는 아래 reviewForMain 이 담당한다(여기서 상세컷을 끌어오면 안 된다).
        const promotedExtra = promotedName && !fromReview && !(sp.mainImages || []).some((m) => m.name === promotedName)
          ? (sp.detailImages || []).filter((d) => d.name === promotedName)
          : [];
        const mainImages = usingRegen
          ? [...regen, ...promotedExtra, ...clip.images]
          : [...promotedExtra, ...clip.images];
        // 대표컷 후보에 리뷰이미지도 넣는다 — 상품 정면컷이 마땅치 않을 때(성분/로고/짤림뿐)
        //   구매자 실사진을 대표로 고를 수 있게(사용자 요청). 뒤에 붙이므로 기본 대표는 그대로.
        const reviewCurated = applyReviewCuration(sp.reviewImages || [], gen);
        //   비전이 고른 리뷰컷은 동명 파일이 main 에 있어도 반드시 후보에 남긴다(그게 대표다).
        const reviewForMain = reviewCurated.filter((rv) =>
          (fromReview && rv.name === promotedName) ? true : !mainImages.some((m) => m.name === rv.name));
        // 리뷰컷을 대표로 골랐으면 그 컷을 맨 앞으로 — 안 그러면 main 첫 장이 대표가 된다.
        const pickedReview = fromReview ? reviewForMain.find((rv) => rv.name === promotedName) : undefined;
        const mainCandidates = pickedReview && !usingRegen
          ? [pickedReview, ...mainImages, ...reviewForMain.filter((rv) => rv !== pickedReview)]
          : [...mainImages, ...reviewForMain];
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
          mainImages: mainCandidates,
          regenCount: regen.length,
          // 기본 대표 = 0번(누끼 가공본). 단 워커가 가공본을 반려했으면(거꾸로/잘림/빈컷 등)
          // 첫 원본(=regen 다음 인덱스)을 기본으로 — 가공본은 후보로 남아 되돌릴 수 있다.
          selectedMainIdx: initialMainIdx,
          pickedMain: null,   // 자동(대표 + 추천 9장) — 사용자가 고르면 확정된다
          detailImages,
          reviewImages: reviewCurated,
          mainAiPicked: reordered.picked,
          usingRegen,
          // 불러온 상세글은 워커가 정한 분류로 쓰인 것이다 — 여기가 기준선.
          detailCatPath: gen?.categoryPath || edit.categoryPath || '',
          approved: isEligible(edit) && !gen?.needsReview,
          status: 'idle',
        });
      }
      built.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
      setRows(built);
      setDoneSummary(null);   // 새 카드가 들어왔으면 직전 판의 결과 줄은 무효
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
            `데스크탑 메가로드 도우미 앱 → ⚙️ 올인원 생성 → 이 폴더를 선택·실행한 뒤, 여기서 "도우미 결과 불러오기"(또는 폴더 재선택)를 누르세요. ` +
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

  // ── 무인 자동등록(오토파일럿) ────────────────────────────────────
  // "화면도 안 보고 바로 등록"을 위해, 검수 생략 동의를 **폴더를 고르기 전에** 미리 받아 둔다.
  // 켜 두면 생성이 끝나는 즉시(10초 취소 유예 후) 검수 없이 그대로 등록이 시작된다.
  //
  // ⚠️ 동의 없이는 절대 켜지지 않는다 — 그래서 **어디에도 저장하지 않는다**.
  //    sessionStorage/localStorage 에 넣으면 새로고침·복원만으로 "동의한 적 없는 ON" 이 생기고,
  //    그 상태에서 폴더를 한 번 고르면 전량이 무검수로 올라간다. 새로고침하면 꺼지는 게 맞다.
  const [autoPilot, setAutoPilot] = useState<AutoPilotState>(AUTOPILOT_OFF);
  // 생성 완료 콜백(선언 순서상 위쪽)이 최신 설정을 읽도록 ref 로도 들고 있는다.
  const autoPilotRef = useRef(autoPilot);
  /**
   * 무인 자동등록 on/off 의 **유일한** 통로.
   * on=true 는 위험모달 확인(consentAt) 을 동반할 때만 허용한다 — 호출부 실수로 동의 없는
   * 무인 실행이 생기지 않도록 여기서 한 번 더 막는다.
   */
  const applyAutoPilot = useCallback((next: AutoPilotState) => {
    const safe: AutoPilotState = autoPilotArmed(next) ? next : AUTOPILOT_OFF;
    autoPilotRef.current = safe;
    setAutoPilot(safe);
  }, []);
  /** 등록 시작까지 남은 초. null 이면 대기 중 아님. */
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  /**
   * 무인으로 넘어왔고 **아직 카운트다운을 걸지 못한** 상태의 마감시각(ms). null = 해당 없음.
   * 왜 바로 안 거나: 검수 화면은 누끼가 끝나기 전에 열린다(사람을 기다리게 하지 않으려고).
   * 그 상태로 등록하면 등록 게이트에 막혀 **무인이 조용히 실패**한다 — 사람이 켜 놓고 자리를
   * 비웠는데 아무것도 안 올라가는 게 가장 나쁜 결과다. 누끼가 끝난 다음에 건다.
   */
  const [autoArmDeadline, setAutoArmDeadline] = useState<number | null>(null);
  /**
   * 이번 판이 실제로 얼마나 걸렸나. 진행 중에는 경과가 보이지만 검수 화면에 도착하는 순간
   * 그 숫자가 통째로 사라져서, "1개에 얼마 걸리더라"를 매번 감으로 답하게 된다.
   * 끝난 뒤에 총합이 남아야 100개를 돌릴지 말지를 판단할 수 있다.
   */
  const [runReport, setRunReport] = useState<{ timing: RunTiming; arrivedAt: number } | null>(null);

  /**
   * 대표컷 누끼가 아직 돌고 있는 상품 수(0 이면 없음).
   * 생성은 누끼를 기다리지 않고 검수를 먼저 열어 준다 — 사람이 기다릴 일이 아니기 때문이다.
   * 다만 **등록물에는 가공본이 들어가야 하므로**, 남아 있는 동안은 등록을 막고 다시 불러오게 한다.
   */
  const [thumbPendingCount, setThumbPendingCount] = useState(0);
  /** 방금 누끼가 끝났다 — "다시 불러오기"를 눌러 최종 대표컷을 반영하라고 알린다. */
  const [thumbJustDone, setThumbJustDone] = useState(false);

  // 누끼가 끝났는지 지켜본다. 끝나면 사람이 알아서 "다시 불러오기"를 누를 수 있게 알린다.
  //   ⚠️ 자동으로 다시 불러오지 않는다 — 검수 중 편집(승인·수정)을 말없이 날려 버리기 때문이다.
  useEffect(() => {
    if (thumbPendingCount <= 0) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const ep = await discoverLocalEndpoint();
        if (!ep || !alive) return;
        const mf = await fetchLocalManifest(ep);
        if (!mf || !alive) return;
        const left = (mf.records as GenRecord[]).filter((r) => r?.thumbPending).length;
        setThumbPendingCount(left);
        if (left === 0) setThumbJustDone(true);
      } catch { /* 도우미가 잠깐 안 잡히는 건 정상 — 다음 주기에 다시 */ }
    }, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [thumbPendingCount]);

  // ── 도우미 결과 불러오기 (폴더 선택 0회) ─────────────────────────
  // 도우미가 이미 폴더 경로를 알고, 결과·이미지가 그 PC 에 있으므로 웹이 localhost 로 직접 읽는다.
  // 이미지도 shim(handle.getFile→fetchLocalFile)으로 감싸 기존 등록 업로드 경로를 그대로 재사용한다.
  // → Storage 선업로드 없음(승인분만 등록 때 올라감), 폴더 재선택 없음.
  // 반환값은 방금 만든 카드 목록 — 무인 자동등록이 "몇 건 실렸는지"를 상태 갱신을 기다리지 않고 알아야 한다.
  /**
   * 마지막 생성이 실패로 끝났으면 그 사유를 가져온다. 실패가 아니면 null 로 지운다.
   * 도우미가 구버전이거나 응답이 없으면 조용히 넘어간다 — 진단이 안 되는 것뿐, 화면은 그대로 돈다.
   */
  const probeLastGenFailure = useCallback(async (ep: LocalEndpoint) => {
    try {
      const st = await fetchImportState(ep);
      const g = st?.gen ?? null;
      if (!g || g.running) { setLastGenFail(null); return; }
      // error 가 사유의 원본이다. 없으면 종료코드로라도 말한다(0 이 아니면 비정상 종료).
      const why = g.error || (g.code != null && g.code !== 0 ? `생성이 비정상 종료됐습니다(코드 ${g.code})` : null);
      setLastGenFail(why || (st?.stopped && st.failed > 0 ? `가져오기 ${st.failed}건 실패 — ${st.stopped}` : null));
    } catch {
      setLastGenFail(null);
    }
  }, []);

  const handleLoadFromHelper = useCallback(async (): Promise<Row[]> => {
    setError('');
    setScanning(true);
    setImagesStale(false); // 새로 불러오면 현재 포트로 URL 이 재생성되므로 경고 해제
    setScanMsg('도우미 연결 확인 중…');
    try {
      const ep = await discoverLocalEndpoint();
      if (!ep) { const d = await diagnoseLocalHelper(); setError(d.message); return []; }
      const mf = await fetchLocalManifest(ep);
      if (!mf) { const d = await diagnoseLocalHelper(); setError(d.message); return []; }

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

      manifestAtRef.current = mf.generatedAt ? new Date(mf.generatedAt).getTime() : 0;
      setRunTiming(mf.timing ?? null);
      // 결과가 0건이면 "왜 없는지"를 도우미에게 물어 둔다(아래 안내 문구가 이 값을 쓴다).
      if ((mf.records || []).length === 0) void probeLastGenFailure(ep as LocalEndpoint);
      else setLastGenFail(null);
      const recs = mf.records as GenRecord[];
      // 누끼가 아직 도는 중인 상품 수 — 등록 게이트와 안내 배너가 이 값을 본다.
      setThumbPendingCount(recs.filter((r) => r?.thumbPending).length);
      setThumbJustDone(false);
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

        // ⚠️ 로컬 직독도 폴더 스캔과 똑같이 CLIP 큐레이션을 적용한다 — 예전엔 폴더 목록을
        //    그대로 써서, 워커가 "광고/빈 배너"로 버린 컷(예: 텍스트만 있는 흰 배너)이
        //    상세 이미지로 붙었다(실측). 워커가 버린 파일명만 정확히 뺀다.
        const detailImages = applyDetailCuration(cls.detail.map(mkImg), gen);
        const reviewImages = applyReviewCuration(cls.review.map(mkImg), gen);
        const infoImages = cls.info.map(mkImg);
        // 대표 후보: 비전이 로고/글자/배너로 본 컷 제외 + 리뷰이미지를 후보로 추가(직접 대표 선택 가능).
        //   ⚠️ 대표를 리뷰 폴더에서 골랐으면 main_images 쪽 동명 파일을 되살리면 안 된다(pickedFromReview 주석).
        const fromReview = pickedFromReview(gen);
        const mainCurated = applyMainCuration(cls.main.map(mkImg), gen, !fromReview);
        const reviewForMain = reviewImages.filter((rv) =>
          // 리뷰 후보 중복 제거도 이름만 보면 안 된다 — 비전이 고른 리뷰컷이 통째로 사라진다.
          (fromReview && rv.name === basename(gen?.mainImage || ''))
            ? true
            : !mainCurated.some((m) => m.name === rv.name));
        let mainImages = [...mainCurated, ...reviewForMain];
        // ⭐ 비전이 고른 대표(gen.mainImage)를 기본값으로 존중 — 그 컷을 맨 앞으로.
        //   예전엔 목록 첫 장을 무조건 대표로 써서, main 이 비고 전부 리뷰컷이면 첫 리뷰(성분/잎컷)가
        //   대표가 됐다(실측: 알로에 잎). 비전이 리뷰에서 상품컷을 승격했어도 반영이 안 됐다.
        //   단 누끼(regen)가 있으면 이미 index0 이 비전 픽의 누끼본이므로 건드리지 않는다(뱃지·순서 보존).
        const pickName = gen?.mainImage ? basename(gen.mainImage) : '';
        if (pickName && cls.regenCount === 0) {
          // 리뷰컷을 골랐으면 리뷰 구간(mainCurated 뒤쪽)에서 찾는다 — 앞쪽 main 구간의 동명 파일을
          // 집으면 비전이 버린 사진(예: 백지)이 대표가 된다.
          const pi = fromReview
            ? mainImages.findIndex((m, i) => i >= mainCurated.length && m.name === pickName)
            : mainImages.findIndex((m, i) => i < mainCurated.length && m.name === pickName);
          if (pi > 0) mainImages = [mainImages[pi], ...mainImages.filter((_, i) => i !== pi)];
        }

        // scanned 는 등록 경로가 reviewImages/infoImages/productJson/sourceUrl 만 참조 →
        // 폴더 핸들 없이 그 필드만 채운 얕은 대체물(ScannedProduct 로 캐스팅).
        const scanned = {
          productCode: code,
          folderName: prodDir || code,
          sourceUrl: gen?.sourceUrl ?? undefined,
          productJson: { name: gen?.originalName, tags: gen?.keywords, description: gen?.sourceDescription || undefined },
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
          pickedMain: null,
          detailImages,
          reviewImages,
          mainAiPicked: cls.regenCount > 0,
          usingRegen: cls.regenCount > 0,
          // 불러온 상세글은 워커가 정한 분류로 쓰인 것이다 — 여기가 기준선.
          detailCatPath: gen?.categoryPath || edit.categoryPath || '',
          approved: isEligible(edit) && !gen?.needsReview,
          status: 'idle',
        });
      }
      built.sort((a, b) => a.productCode.localeCompare(b.productCode, undefined, { numeric: true }));
      setRows(built);
      setDoneSummary(null);   // 새 카드가 들어왔으면 직전 판의 결과 줄은 무효
      const withImg = built.filter((r) => r.mainImages.length > 0).length;
      setScanMsg(`도우미에서 ${built.length}개 불러옴 · 대표이미지 ${withImg}개 · 대표가공 ${built.filter((r) => r.usingRegen).length}개`);
      if (built.length === 0) setError('도우미가 생성한 상품이 없습니다. 올인원 생성을 먼저 완료하세요.');
      return built;
    } catch (e) {
      setError(e instanceof Error ? e.message : '도우미 불러오기 실패');
      return [];
    } finally {
      setScanning(false);
    }
  }, []);

  // 자동 로드(도우미 완료 시)와 업로드 생성이 공유하는 "한 번만" 가드.
  const autoLoadedRef = useRef(false);
  /**
   * 방금 실어 온 결과가 **언제 만들어진 것인가**(도우미 manifest 의 생성 시각, ms).
   * 이 화면은 "도우미가 마지막으로 생성한 폴더"를 읽을 뿐이라, 그게 이번 판인지 지난 판인지
   * 스스로는 모른다 —— 지난 판 카드를 이번 것으로 알고 다시 등록하면 같은 상품이 두 번 올라간다.
   */
  const manifestAtRef = useRef(0);
  /**
   * 도우미가 알려 준 **마지막 생성의 결말**(실패 사유·중단 사유).
   * ---------------------------------------------------------------------------
   * 0건일 때 화면은 지금까지 "올인원 생성을 먼저 완료하세요"라고만 했다. 그런데 실제로 가장
   * 흔한 경우는 **생성을 돌렸는데 실패한 것**이다(예: 텍스트 엔진이 안 떠서 중단). 그때 이
   * 문구는 사실이 아니고, 사람은 멀쩡히 돌린 작업을 "안 돌렸다"는 말과 함께 돌려받는다.
   * 도우미는 사유를 알고 있다(gen.error / stopped) — 물어서 그대로 옮긴다.
   */
  const [lastGenFail, setLastGenFail] = useState<string | null>(null);
  /**
   * 도우미가 남긴 **이번 판 실측**(단계별 시간·비전 구간).
   * 예전 리포트는 "웹이 버튼을 누른 순간 ~ 카드가 뜬 순간"의 벽시계뿐이라, 느렸을 때
   * 어디가 느렸는지(인식/텍스트/누끼)를 알 수 없었다 — 개선을 숫자로 확인할 수가 없었다.
   */
  const [runTiming, setRunTiming] = useState<AllinoneTiming | null>(null);

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
    // 폴더를 고른 이 순간부터 잰다 — 사람이 탐색기에서 헤맨 시간은 우리 몫이 아니다.
    const runStart = Date.now();
    setRunReport(null);
    // 새 폴더로 생성을 시작하면 이전 결과 카드를 즉시 비운다.
    //   예전엔 생성이 다 끝난 뒤 handleLoadFromHelper 가 setRows(built) 로 덮을 때까지
    //   이전 작업 카드가 화면에 그대로 떠 있었다("새로 작업하는데 기존 화면이 안 사라진다").
    //   또한 이전 카드의 이미지 URL 은 죽은 세션 포트를 가리켜(앱 재시작 시) 깨진 채로 남는다.
    setRows([]);
    setOpenMain({});
    setDoneSummary(null);
    setImagesStale(false);
    setError('');
    setAutoCountdown(null); // 직전 결과에 걸려 있던 자동등록 예약은 새 생성과 함께 무효
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
      const built = await handleLoadFromHelper();
      // 이 경로에도 같은 시계를 남긴다 — "100개면 얼마 걸리나"는 여기서도 똑같이 필요하다.
      if (built.length > 0) {
        setRunReport({
          timing: { startedAt: runStart, count: built.length, detailWaitMs: 0, importMs: 0, genStartedAt: startTs },
          arrivedAt: Date.now(),
        });
      }
      // 무인 자동등록이 켜져 있으면 여기서 바로 등록 카운트다운을 건다(사람 개입 0회).
      //   실행 자체는 카운트다운 effect 가 맡는다 — 이 함수의 finally 가 scanning 을 내린 뒤에
      //   시작해야 등록 버튼/가드와 상태가 어긋나지 않는다.
      if (autoPilotArmed(autoPilotRef.current) && built.length > 0) setAutoCountdown(AUTOPILOT_DELAY_SEC);
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
  //
  // 예외는 **?load=1 로 들어온 경우** 하나다. 소싱 카탈로그(또는 도우미)가 생성을 마치고
  // 이 화면으로 보낸 것이므로, 방금 만든 그 결과를 보러 온 게 확실하다. 이게 없던 동안에는
  // "끝나면 검수 화면이 열립니다"라고 해 놓고 정작 **빈 화면**이 열려, 사람이 '이전 생성결과
  // 불러오기'를 손으로 눌러야 자동 연결이 완성됐다.
  useEffect(() => {
    if (autoLoadedRef.current || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('load') !== '1') return;
    autoLoadedRef.current = true;
    // 카탈로그에서 무인 자동등록을 켜 두고 왔다면 여기서 이어받는다.
    //   **동의는 여기서 만들지 않는다** — 카탈로그가 이 화면과 같은 위험 모달을 띄워
    //   받아 둔 동의의 사본일 뿐이고, applyAutoPilot 이 유효기간을 다시 판정한다.
    //   한 번 쓰면 지워지므로(consume) 다음 판까지 따라오지 않는다.
    const handoff = consumeHandoff();
    const timing = consumeRunTiming();
    handleLoadFromHelper()
      .then((built) => {
        // ⚠️ 실어 온 게 **이번 판**인지 본다. 도우미 폴더는 판이 바뀌어도 마지막 것을 가리키므로,
        //    이번 판의 생성이 아직 안 끝났으면 지난 판 카드가 그대로 올라온다(실측: 토마토를
        //    걸었는데 오렌지가 떴다). 카드를 감추지는 않는다 — 감추면 "빈 화면"이 되어 더 헷갈린다.
        //    대신 **이건 지난 판이다**라고 크게 말하고, 다시 불러올 길을 준다.
        if (timing && manifestAtRef.current > 0 && manifestAtRef.current < timing.startedAt) {
          setError(
            `⚠️ 지금 보이는 카드는 ${new Date(manifestAtRef.current).toLocaleString('ko-KR')} 에 만들어진 `
            + '**지난 판** 결과입니다 — 이번에 고른 상품의 생성이 아직 끝나지 않았습니다. '
            + '이미 등록한 상품일 수 있으니 그대로 올리지 마시고, 생성이 끝난 뒤 '
            + '“도우미 결과 다시 불러오기”를 눌러 주세요.',
          );
        }
        // 카드가 실제로 뜬 이 순간까지가 "누르고 나서 검수까지"다.
        if (timing && built.length > 0) setRunReport({ timing, arrivedAt: Date.now() });
        if (!handoff || built.length === 0) return;
        applyAutoPilot({
          on: true, audit: handoff.audit,
          excludeUnfixed: handoff.excludeUnfixed, consentAt: handoff.consentAt,
        });
        // 누끼가 끝난 뒤에 카운트다운을 건다(아래 effect). 15분 안에 안 끝나면 포기하고 말한다.
        setAutoArmDeadline(Date.now() + AUTOPILOT_THUMB_WAIT_MS);
      })
      .catch(() => { /* 실패 사유는 handleLoadFromHelper 가 화면에 남긴다 */ });
  }, [handleLoadFromHelper, applyAutoPilot]);

  // ── 대표컷 선택 ──────────────────────────────────────────────────
  // 스캐너는 첫 장만 objectUrl 을 즉시 만든다(대량 폴더에서 전부 만들면 메모리·시간 낭비).
  // 그래서 후보 목록을 펼치는 순간에만 그 카드의 나머지 후보 URL 을 만든다.
  const toggleMainPicker = async (uid: string, candidates: ScannedImageFile[]) => {
    const opening = !openMain[uid];
    if (opening) {
      await Promise.all(candidates.map((img) => (img.objectUrl ? null : ensureObjectUrl(img))));
    }
    setOpenMain((p) => ({ ...p, [uid]: opening }));
    setRows((prev) => [...prev]); // 위에서 채운 objectUrl 을 화면에 반영
  };
  /**
   * 이 컷을 **대표**로 삼는다(★). 대표는 갤러리의 0번이므로 선택 목록의 맨 앞으로도 옮긴다 —
   * 안 그러면 대표만 바뀌고 쿠팡에 올라가는 0번은 그대로인, 화면과 결과가 어긋나는 상태가 된다.
   */
  const selectMain = async (uid: string, idx: number, img: ScannedImageFile) => {
    if (!img.objectUrl) await ensureObjectUrl(img);
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const name = r.mainImages[idx]?.name;
      if (!name) return r;
      // 아직 손으로 고른 적이 없으면(pickedMain=null) 자동 선택을 유지한다 — 대표만 바뀐다.
      const pickedMain = r.pickedMain
        ? [name, ...r.pickedMain.filter((n) => n !== name)].slice(0, GALLERY_MAX)
        : null;
      return { ...r, selectedMainIdx: idx, pickedMain };
    }));
  };

  // ── 갤러리(대표 1 + 서브 9) 직접 고르기 ──────────────────────────────────
  // 예전엔 "빼기(×)"만 있었다. 25장 중 5장만 쓰려면 20번을 눌러야 했고, 무엇이 실제로 올라가는지도
  // 카드에서 셀 수 없었다. 이제 **고른 것만 올라간다** — 대표는 ★, 서브는 타일 클릭으로 고른다.
  /** 이 카드가 지금 올리기로 돼 있는 파일명 집합(선택한 적이 없으면 자동 기본값). */
  const pickedSetOf = (r: Row) => new Set(pickedMainNames(r));
  const toggleMainPick = (uid: string, name: string) =>
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const mainName = r.mainImages[r.selectedMainIdx]?.name;
      if (!name || name === mainName) return r;      // 대표는 뺄 수 없다(다른 걸 ★로 먼저 정한다)
      const cur = pickedSetOf(r);
      if (cur.has(name)) cur.delete(name);
      else if (cur.size >= GALLERY_MAX) return r;    // 쿠팡 한도 10장 — 넘겨 고르면 어차피 잘린다
      else cur.add(name);
      // 순서는 **카드에 보이는 순서** 그대로, 대표만 맨 앞. 사용자가 본 대로 올라가야 한다.
      const ordered = [
        ...(mainName ? [mainName] : []),
        ...r.mainImages.filter((m) => m.name !== mainName && cur.has(m.name)).map((m) => m.name),
      ];
      return { ...r, pickedMain: ordered };
    }));
  /** 고르지 않은 후보를 한 번에 뺀다. 되살리기(+)로 언제든 돌아올 수 있으므로 파일은 지우지 않는다. */
  const removeUnpickedMain = (uid: string) =>
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const keep = pickedSetOf(r);
      const kept = r.mainImages.filter((m) => keep.has(m.name));
      if (kept.length === 0 || kept.length === r.mainImages.length) return r;
      // 누끼(regen)는 목록 앞쪽에 모여 있다 — 남은 것 중 몇 장이 누끼인지 다시 센다(뱃지 판정용).
      const regenNames = new Set(r.mainImages.slice(0, r.regenCount).map((m) => m.name));
      const regenCount = kept.filter((m) => regenNames.has(m.name)).length;
      const mainName = r.mainImages[r.selectedMainIdx]?.name;
      const selectedMainIdx = Math.max(0, kept.findIndex((m) => m.name === mainName));
      return { ...r, mainImages: kept, regenCount, selectedMainIdx, pickedMain: kept.map((m) => m.name) };
    }));
  // 상세 편집 토글 — 펼칠 때 상세·리뷰 이미지 썸네일 URL 을 보장(스캐너가 lazy 로 읽으므로).
  //   리뷰컷도 채워야 미리보기가 "실제 등록될 모습"(리뷰컷 우선 교차)과 같아진다.
  const toggleDetail = async (uid: string, detailImages: ScannedImageFile[], reviewImages: ScannedImageFile[] = []) => {
    const opening = !openDetail[uid];
    if (opening) await Promise.all([...detailImages, ...reviewImages].map((img) => (img.objectUrl ? null : ensureObjectUrl(img))));
    setOpenDetail((p) => ({ ...p, [uid]: opening }));
    setRows((prev) => [...prev]); // 채운 objectUrl 반영
  };

  const toggleApprove = (uid: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, approved: !r.approved } : r)));
  const setAll = (v: boolean) =>
    setRows((prev) => prev.map((r) => (r.status === 'success' ? r : { ...r, approved: v && isEligible(r.edit) })));

  // ── 상세글 재생성(도우미 로컬 GPU) ────────────────────────────────
  // 카테고리를 손으로 바꿔도 상세글은 워커가 처음 쓴 그대로 남는다 — 본문은 생성 시점 카테고리의
  // 어휘(subtype-vocab)로 쓰여 있으므로, 카테고리만 고치면 "맥주 글 + 가구 카테고리" 같은 상태가 된다.
  // 여기서 재생성 잡을 넣어 **바뀐 카테고리 기준으로 본문을 다시 쓰게** 한다.
  //   웹(enqueue) → megaload_llm_jobs → 도우미 llm-pull-loop(runContent → generatePerfectDetail)
  //   → result(jsonb) → 웹이 폴링해 카드에 반영.
  // 서버 LLM 을 쓰지 않으므로 호출 비용은 0 이고, 도우미가 꺼져 있으면 켤 때까지 pending 으로 대기한다.
  type RegenState = { batchId: string; status: 'pending' | 'done' | 'error'; message?: string };
  const [regen, setRegen] = useState<Record<string, RegenState>>({});

  const requestDetailRegen = async (uids: string[]) => {
    const targets = rows.filter((r) => uids.includes(r.uid) && r.gen && r.status !== 'success');
    if (targets.length === 0) return;
    const jobs = targets.map((r) => {
      const g = r.gen!;
      const pj = (r.scanned.productJson || {}) as { features?: unknown };
      const catPath = r.edit.categoryPath || g.categoryPath || '';
      return {
        label: `${r.uid}:content`,
        taskType: 'content' as const,
        // 필드명은 도우미 llm-pull-loop.runContent 가 읽는 것 그대로여야 한다(바꾸면 조용히 빈 글).
        input: {
          displayName: r.edit.displayName || g.displayName || g.originalName,
          originalName: g.originalName,
          categoryPath: catPath,
          // leaf 를 명시하지 않으면 도우미가 경로 전체를 leaf 로 써서 어휘가 다시 어긋난다
          // (ai-generator 도 같은 이유로 leaf 를 따로 넘긴다).
          leaf: catPath.split('>').pop()?.trim() || '',
          features: Array.isArray(pj.features) ? pj.features : [],
          seoKeywords: g.keywords || [],
          seed: g.originalName,
        },
      };
    });
    const mark = (s: RegenState) =>
      setRegen((p) => { const n = { ...p }; for (const t of targets) n[t.uid] = s; return n; });
    mark({ batchId: '', status: 'pending' });
    try {
      const res = await fetch('/api/megaload/products/llm-jobs/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs }), signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json() as { batchId?: string; error?: string };
      if (!res.ok || !data.batchId) throw new Error(data.error || `HTTP ${res.status}`);
      mark({ batchId: data.batchId, status: 'pending' });
    } catch (err) {
      mark({ batchId: '', status: 'error', message: err instanceof Error ? err.message : '재생성 요청 실패' });
    }
  };

  // 진행 중인 배치만 폴링 — 전부 done/error 가 되면 키가 비어 자동으로 멈춘다.
  const pendingBatchKey = [...new Set(
    Object.values(regen).filter((s) => s.status === 'pending' && s.batchId).map((s) => s.batchId),
  )].sort().join(',');
  useEffect(() => {
    if (!pendingBatchKey) return;
    const batchIds = pendingBatchKey.split(',');
    let stopped = false;
    const tick = async () => {
      for (const batchId of batchIds) {
        if (stopped) return;
        try {
          const res = await fetch(`/api/megaload/products/llm-jobs?batchId=${encodeURIComponent(batchId)}`, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json() as {
            jobs?: { label: string; status: string; result: unknown; error_message: string | null }[];
          };
          for (const j of data.jobs || []) {
            const uid = j.label.replace(/:content$/, '');
            if (j.status === 'done') {
              // 도우미는 paragraphs 만 돌려준다(text 는 안 실림) → 생성기와 같은 규칙으로 이어붙인다.
              const paragraphs = (j.result as { paragraphs?: string[] } | null)?.paragraphs || [];
              const text = paragraphs.filter(Boolean).join('\n\n');
              if (text) {
                setRows((prev) => prev.map((r) => (r.uid === uid
                  // 카드와 같은 필터를 통과시키되, 기준은 **바뀐** 카테고리다(옛 기준으로 걸러지지 않게).
                  //   그리고 "이 상세글은 이 분류로 쓰였다"를 기록한다 — 안 적으면 다시 쓰고도
                  //   카드가 계속 "예전 카테고리 그대로"라고 경고한다.
                  ? {
                    ...r,
                    detailCatPath: r.edit.categoryPath || r.detailCatPath,
                    edit: { ...r.edit, detail: scrubForbidden(stripEmphasisMarks(text), r.edit.categoryPath) },
                  }
                  : r)));
              }
              setRegen((p) => (p[uid]
                ? { ...p, [uid]: { ...p[uid], status: text ? 'done' : 'error', message: text ? undefined : '빈 결과' } }
                : p));
            } else if (j.status === 'error' || j.status === 'canceled') {
              setRegen((p) => (p[uid]
                ? { ...p, [uid]: { ...p[uid], status: 'error', message: j.error_message || '재생성 실패' } }
                : p));
            }
          }
        } catch { /* 일시 실패 — 다음 tick 에 재시도 */ }
      }
    };
    // 3초 폴링은 "지금 도우미가 돌고 있을 때" 기준이다. 도우미가 꺼져 있으면 잡이 영원히
    // pending 이라 이 페이지를 켜 둔 내내 3초마다 DB 를 때리게 된다 → 2분 뒤부터 15초로 늦춘다.
    let ticks = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await tick();
      if (stopped) return;
      timer = setTimeout(loop, ++ticks < 40 ? 3000 : 15_000);
    };
    void loop();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [pendingBatchKey]);

  /** 워커가 정한 카테고리와 사용자가 지금 지정한 카테고리가 다른 행 — 상세글이 옛 어휘로 남아 있다. */
  const catChangedUids = rows
    .filter((r) => r.gen && r.status !== 'success' && (r.edit.categoryPath || '') !== (r.detailCatPath || ''))
    .map((r) => r.uid);
  /** 재생성 대기 중인 카드가 하나라도 있으면 일괄 버튼을 잠근다(중복 큐잉 방지). */
  const regenBusy = Object.values(regen).some((s) => s.status === 'pending');

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
  /** 리뷰이미지 제외 — 본문 교차(1순위)에서 빼고 싶을 때. */
  const removeReviewImage = (uid: string, name: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid
      ? { ...r, reviewImages: r.reviewImages.filter((img) => img.name !== name) } : r)));
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
  /**
   * 되살릴 수 있는 대표/서브 후보 = 스캔한 main_images + review_images 중 현재 후보에 없는 것.
   * ⚠️ 예전엔 main_images 만 돌려줬다. 후보 목록엔 리뷰컷도 섞여 있는데(mainCandidates),
   *    그걸 ×로 빼면 되살릴 방법이 없었다. 서브이미지 출처가 이 목록 하나뿐이라 더 그렇다.
   */
  const addableMainImages = (r: Row): ScannedImageFile[] => {
    const have = new Set(r.mainImages.map((m) => m.name));
    const seen = new Set<string>();
    return [...(r.scanned.mainImages || []), ...(r.scanned.reviewImages || [])]
      .filter((img) => img && !have.has(img.name) && !seen.has(img.name) && seen.add(img.name));
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

  // ── 검색어 태그 20개 채우기(로컬 에이전트) ────────────────────────
  // 쿠팡 검색어 태그는 상품명 밖의 검색어를 알고리즘에 넣는 유일한 통로인데, 생성기 키워드가
  // 상품명과 겹쳐 6/20 에서 멈추는 카드가 흔했다 — 남는 14칸은 그냥 버리는 노출이다.
  // 그 칸을 **사람이 실제로 치는 쿠팡 연관검색어**로 채운다. 뽑는 주체는 도우미(로컬 GPU)라
  // 호출 비용이 0 이고, 도우미가 꺼져 있으면 조합 폴백(buildSearchTags 의 pad)이 20 을 맞춘다.
  type TagJob = { batchId: string; status: 'pending' | 'done' | 'error'; message?: string };
  const [tagJobs, setTagJobs] = useState<Record<string, TagJob>>({});

  /** 이 카드가 **실제로 등록할** 태그. 카드 표시와 등록 payload 가 같은 함수를 본다. */
  const tagsOf = useCallback((r: Row): string[] => buildSearchTags({
    productName: r.edit.displayName || r.gen?.displayName || r.gen?.originalName || '',
    categoryPath: r.edit.categoryPath || '',
    brand: '',
    sourceName: r.gen?.originalName || '',
    candidates: [
      ...(r.tagCandidates || []),                       // ① 에이전트가 뽑은 연관검색어
      ...(r.gen?.keywords || []),                       // ② 생성기 키워드
    ],
    // 옵션값·속성값은 쿠팡이 이미 검색에 태운다 — 태그로 또 쓰면 20칸 중 하나를 버린다.
    //   (등록 경로와 같은 판단이어야 카드에 보이는 태그와 실제 등록분이 어긋나지 않는다)
    alreadySearchable: [
      ...r.edit.options.map((o) => o.value || ''),
      ...Object.values(r.edit.attributeValues || {}),
    ],
  }), []);

  const requestSearchTags = useCallback(async (uids: string[]) => {
    const targets = rows.filter((r) => uids.includes(r.uid) && r.gen && r.status !== 'success');
    if (targets.length === 0) return;
    const jobs = targets.map((r) => {
      const g = r.gen!;
      const name = r.edit.displayName || g.displayName || g.originalName;
      return {
        label: `${r.uid}:search_tags`,
        taskType: 'search_tags' as const,
        // 필드명은 도우미 llm-pull-loop.runSearchTags 가 읽는 것 그대로여야 한다.
        input: {
          displayName: name,
          originalName: g.originalName,
          categoryPath: r.edit.categoryPath || g.categoryPath || '',
          // 상품명에 이미 있는 낱말은 태그에서 어차피 걸린다 — 모델에도 미리 알려 준다.
          avoid: (name.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).slice(0, 20),
          count: 30,   // 규칙 필터로 절반 이하만 남는다 — 넉넉히 받는다
        },
      };
    });
    const mark = (t: TagJob) =>
      setTagJobs((p) => { const n = { ...p }; for (const x of targets) n[x.uid] = t; return n; });
    mark({ batchId: '', status: 'pending' });
    try {
      const res = await fetch('/api/megaload/products/llm-jobs/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs }), signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json() as { batchId?: string; error?: string };
      if (!res.ok || !data.batchId) throw new Error(data.error || `HTTP ${res.status}`);
      mark({ batchId: data.batchId, status: 'pending' });
    } catch (err) {
      mark({ batchId: '', status: 'error', message: err instanceof Error ? err.message : '연관검색어 요청 실패' });
    }
  }, [rows]);

  // 카드가 들어오면 **자동으로** 맡긴다 — 사람이 상품마다 버튼을 누르게 하지 않는다.
  //   도우미가 꺼져 있으면 걸지 않는다(영영 pending 으로 남는다). 그때는 조합 폴백이 20 을 채운다.
  const requestSearchTagsRef = useRef(requestSearchTags);
  useEffect(() => { requestSearchTagsRef.current = requestSearchTags; }, [requestSearchTags]);
  const tagNeedKey = rows
    .filter((r) => r.gen && r.status !== 'success' && !r.tagCandidates?.length && !tagJobs[r.uid])
    .map((r) => r.uid).join(',');
  useEffect(() => {
    if (!helperDiag?.ok || !tagNeedKey) return;
    void requestSearchTagsRef.current(tagNeedKey.split(','));
  }, [tagNeedKey, helperDiag?.ok]);

  // 진행 중인 배치만 폴링 — 전부 done/error 가 되면 키가 비어 자동으로 멈춘다.
  const tagBatchKey = [...new Set(
    Object.values(tagJobs).filter((t) => t.status === 'pending' && t.batchId).map((t) => t.batchId),
  )].sort().join(',');
  useEffect(() => {
    if (!tagBatchKey) return;
    const batchIds = tagBatchKey.split(',');
    let stopped = false;
    const tick = async () => {
      for (const batchId of batchIds) {
        if (stopped) return;
        try {
          const res = await fetch(`/api/megaload/products/llm-jobs?batchId=${encodeURIComponent(batchId)}`, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json() as {
            jobs?: { label: string; status: string; result: unknown; error_message: string | null }[];
          };
          for (const j of data.jobs || []) {
            if (!j.label.endsWith(':search_tags')) continue;
            const uid = j.label.replace(/:search_tags$/, '');
            if (j.status === 'done') {
              const tags = (j.result as { tags?: string[] } | null)?.tags || [];
              setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, tagCandidates: tags } : r)));
              setTagJobs((p) => ({ ...p, [uid]: { ...(p[uid] || { batchId }), status: 'done' } }));
            } else if (j.status === 'error') {
              // 구버전 도우미는 이 일감을 모른다 — 집어 가서 실패시킨다("알 수 없는 task_type").
              //   원문을 그대로 보여 주면 사람은 고장으로 읽지만, 실제로 할 일은 도우미 업데이트뿐이고
              //   태그 20칸은 사전으로 이미 차 있다. 그러니 **할 일**을 적는다.
              const raw = j.error_message || '생성 실패';
              const stale = /task_type/i.test(raw);
              setTagJobs((p) => ({
                ...p,
                [uid]: { batchId, status: 'error', message: stale ? '도우미 업데이트 필요' : raw },
              }));
            }
          }
        } catch { /* 다음 주기에 다시 */ }
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => { stopped = true; clearInterval(t); };
  }, [tagBatchKey]);

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

  // ── 검수 없이 등록(사용자가 위험을 감수하는 경로) ────────────────
  // 카드별 승인·필수옵션 직접입력·"검수필요" 표시를 전부 무시하고 전량 등록한다.
  // 단, 쿠팡 API 가 거절하는 하드 조건(카테고리코드·판매가·대표이미지·물류정보)은 예외 없이 유지한다 —
  // 이건 "리스크"가 아니라 그냥 실패라, 건너뛰면 사용자에게 돌아가는 건 400 에러뿐이다.
  const [skipOpen, setSkipOpen] = useState(false);
  // 'run' = 지금 있는 카드를 바로 등록 / 'arm' = 앞으로 생성될 것을 무인 등록하도록 예약.
  const [skipMode, setSkipMode] = useState<'run' | 'arm'>('run');
  const [skipPlan, setSkipPlan] = useState<SkipReviewPlan>({
    count: 0, excluded: 0, needsReview: 0, unresolvedOptions: 0, certRisk: 0,
  });
  // 모달 확인 시 등록할 대상 — 상태 갱신을 기다리지 않도록 계산 시점 그대로 붙잡아 둔다.
  const skipTargetsRef = useRef<Row[]>([]);
  // handleRegister 는 아래에서 정의되므로 ref 로 참조(선언 순서 의존 제거).
  const handleRegisterRef = useRef<((t?: Row[]) => void | Promise<void>) | null>(null);

  /**
   * 검수 생략 등록의 대상·요약을 계산한다(수동 버튼과 무인 자동등록이 공유).
   * 물류정보처럼 쿠팡이 무조건 요구하는 값이 비어 있으면 계산 자체를 실패로 돌린다 —
   * 무인 경로에서 이걸 통과시키면 등록 API 가 전건 400 을 뱉는다.
   */
  const buildSkipPlan = useCallback((list: Row[]):
    { targets: Row[]; plan: SkipReviewPlan } | { error: string } => {
    if (!selectedOutbound) return { error: '출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)' };
    if (!selectedReturn) return { error: '반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)' };
    if (!contactNumber.trim()) return { error: '고객센터 연락처를 입력해주세요.' };

    const candidates = list.filter((r) => r.gen && r.status !== 'success');
    if (candidates.length === 0) return { error: '등록할 상품이 없습니다.' };
    // 하드 조건 통과분만 대상. 나머지는 검수를 포기해도 쿠팡이 받지 않는다.
    const targets = candidates.filter((r) => isEligible(r.edit) && r.mainImages.length > 0);
    if (targets.length === 0) {
      return { error: '카테고리코드·판매가(100원 이상)·대표이미지가 갖춰진 상품이 없습니다. 이 항목들은 검수를 건너뛰어도 쿠팡이 거절합니다.' };
    }
    return {
      targets,
      plan: {
        count: targets.length,
        excluded: candidates.length - targets.length,
        needsReview: targets.filter((r) => r.gen?.needsReview).length,
        unresolvedOptions: targets.filter((r) => unresolvedOptionInput(r.edit, optionPreviews.get(r.uid)).length > 0).length,
        certRisk: targets.filter((r) => {
          const c = certPreviews.get(r.uid);
          return !!c && (c.status === 'failed' || c.unmatched.length > 0);
        }).length,
      },
    };
  }, [selectedOutbound, selectedReturn, contactNumber, optionPreviews, certPreviews]);

  const requestSkipReview = useCallback(() => {
    setError('');
    const built = buildSkipPlan(rows);
    if ('error' in built) { setError(built.error); return; }
    skipTargetsRef.current = built.targets;
    setSkipPlan(built.plan);
    setSkipMode('run');
    setSkipOpen(true);
  }, [rows, buildSkipPlan]);

  /** 무인 자동등록 켜기 — 상품이 0건인 시점에 위험 동의부터 받는다(모달 preArm 모드). */
  const requestArmAutoPilot = useCallback(() => {
    setError('');
    skipTargetsRef.current = [];
    setSkipPlan({ count: 0, excluded: 0, needsReview: 0, unresolvedOptions: 0, certRisk: 0 });
    setSkipMode('arm');
    setSkipOpen(true);
  }, []);

  // ── 등록 직전 AI 최종점검 ────────────────────────────────────────
  // 사람 검수를 포기한 자리를 기계가 메운다. 2단계:
  //   Stage A(규칙, 즉시)  — allinone-final-audit.auditProduct 로 전 필드 스캔 + 자동수정.
  //   Stage B(로컬 GPU)    — A 가 "다시 써야 함"으로 표시한 필드만 megaload_llm_jobs 로 재생성.
  // 그 뒤 **한 번 더 스캔**해 실제로 고쳐졌는지 확인한다(사용자 요구: "한번 더 자동으로 수정하고 올리게").
  // 도우미가 꺼져 있으면 Stage B 를 건너뛴다 — 잡이 영원히 pending 이라 등록이 멈추기 때문.
  /** Row → 점검기 입력. 점검기는 순수 함수라 Row 를 모른다. */
  const toAuditInput = useCallback((r: Row): AuditInput => ({
    uid: r.uid,
    displayName: r.edit.displayName,
    categoryCode: r.edit.categoryCode,
    categoryPath: r.edit.categoryPath,
    detail: r.edit.detail,
    options: r.edit.options,
    sellingPrice: r.edit.sellingPrice,
    sourcePrice: r.gen?.sourcePrice ?? null,
    originalName: r.gen?.originalName || '',
    genCategoryPath: r.gen?.categoryPath || '',
    unresolvedOptions: unresolvedOptionInput(r.edit, optionPreviews.get(r.uid)),
    mainImageCount: r.mainImages.length,
    mainPickedFromReview: pickedFromReview(r.gen),
    mainImageWarning: r.gen?.mainImageWarning,
    detailImageCount: r.detailImages.length,
    reviewImageCount: r.reviewImages.length,
  }), [optionPreviews]);

  /** 재생성 잡을 넣고 끝날 때까지 폴링. label = `${uid}:${task}` → result. */
  const runRegenBatch = useCallback(async (
    jobs: { label: string; taskType: RegenTask; input: Record<string, unknown> }[],
    onTick: (done: number, total: number) => void,
  ): Promise<Map<string, unknown>> => {
    const out = new Map<string, unknown>();
    if (jobs.length === 0) return out;
    const res = await fetch('/api/megaload/products/llm-jobs/enqueue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }), signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json() as { batchId?: string; error?: string };
    if (!res.ok || !data.batchId) throw new Error(data.error || `재생성 요청 실패 (HTTP ${res.status})`);

    const pending = new Set(jobs.map((j) => j.label));
    const deadline = Date.now() + REGEN_TIMEOUT_MS;
    while (pending.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const pr = await fetch(`/api/megaload/products/llm-jobs?batchId=${encodeURIComponent(data.batchId)}`, { cache: 'no-store' });
        if (!pr.ok) continue;
        const pd = await pr.json() as { jobs?: { label: string; status: string; result: unknown }[] };
        for (const j of pd.jobs || []) {
          if (!pending.has(j.label)) continue;
          if (j.status === 'done') { out.set(j.label, j.result); pending.delete(j.label); }
          else if (j.status === 'error' || j.status === 'canceled') { pending.delete(j.label); }
        }
        onTick(jobs.length - pending.size, jobs.length);
      } catch { /* 일시 실패 — 다음 tick 에 재시도 */ }
    }
    return out;
  }, []);

  /**
   * 점검 본체. targets 를 스캔·수정하고 **등록해도 되는 목록**을 돌려준다.
   * 화면 카드에도 같은 수정을 반영해, 등록된 내용과 사용자가 나중에 보는 카드가 어긋나지 않게 한다.
   */
  const runFinalAudit = useCallback(async (
    targets: Row[], excludeUnfixed: boolean,
  ): Promise<{ targets: Row[]; report: AuditReport }> => {
    // 등록 대상만 담은 작업 사본 — 라운드마다 여기에 수정을 누적한다.
    let work = targets.map((r) => ({ ...r, edit: { ...r.edit, options: r.edit.options.map((o) => ({ ...o })) } }));
    const helperOk = !!helperDiag?.ok;
    const warnMap = new Map<string, Set<string>>();
    let fixedTotal = 0, regeneratedTotal = 0;
    let lastResults: AuditResult[] = [];

    const nameOf = (r: Row) => r.edit.displayName || r.gen?.originalName || r.productCode;
    /**
     * 카테고리가 바뀌어 상세글을 이미 강제로 다시 쓰게 한 상품 — **한 번만** 건다.
     * gen 은 워커의 원래 판단이라 불변이다. 다시 써도 "바뀐 상태"는 영원히 남으므로,
     * 매 라운드 거는 순간 같은 상품을 MAX_AUDIT_ROUND 만큼 반복 재생성한다.
     */
    const forcedByCategory = new Set<string>();
    const auditStartedAt = Date.now();
    setNowTick(auditStartedAt);

    for (let round = 1; round <= MAX_AUDIT_ROUND; round++) {
      setAuditProgress({
        phase: 'scan', round, maxRound: MAX_AUDIT_ROUND, total: work.length,
        fixed: fixedTotal, warned: warnMap.size, regenDone: 0, regenTotal: 0,
        message: `전 필드 스캔 중… (${round}차)`,
        startedAt: auditStartedAt, regenStartedAt: 0,
      });
      // 브라우저가 진행 패널을 그릴 틈을 준다(동기 스캔이 길면 화면이 얼어 보인다).
      await new Promise((r) => setTimeout(r, 0));

      const results = work.map((r) => auditProduct(toAuditInput(r)));
      lastResults = results;
      const byUid = new Map(results.map((r) => [r.uid, r]));

      // 자동수정 반영 — 작업 사본과 화면 카드 양쪽에.
      const applyPatch = (r: Row): Row => {
        const p = byUid.get(r.uid)?.patch;
        if (!p || Object.keys(p).length === 0) return r;
        return { ...r, edit: { ...r.edit, ...p } };
      };
      work = work.map(applyPatch);
      setRows((prev) => prev.map((r) => (byUid.has(r.uid) ? applyPatch(r) : r)));

      for (const res of results) {
        fixedTotal += res.findings.filter((f) => f.severity === 'fix').length;
        const warns = res.findings.filter((f) => f.severity === 'warn').map((f) => f.message);
        if (warns.length) {
          const set = warnMap.get(res.uid) || new Set<string>();
          warns.forEach((w) => set.add(w));
          warnMap.set(res.uid, set);
        }
      }

      /* ── 사람이 바꾼 카테고리는 규칙 스캔이 못 잡는다 ────────────────────
         auditProduct 는 **지금 값만** 보고 판정하는 순수 함수다. "워커가 정한 분류와
         달라졌다"는 건 원본 판단(gen)과 대조해야 아는 사실이라 스캔이 알 도리가 없다.

         그런데 카테고리를 바꾸면 상세글은 **예전 분류 어휘로 쓰인 그대로** 남는다.
         화면에는 "재생성" 버튼이 뜨지만 그건 사람이 카드를 볼 때 이야기고, 무인
         자동등록은 카드를 안 본다 — 바꿔 놓은 채로 그대로 올라간다.
         등록 직전 점검이 마지막 관문이니 여기서 한 번 다시 쓰게 한다. */
      if (helperOk) {
        const rowsNow = new Map(work.map((r) => [r.uid, r]));
        for (const res of results) {
          if (forcedByCategory.has(res.uid)) continue;
          const r = rowsNow.get(res.uid);
          if (!r?.gen) continue;
          if ((r.edit.categoryPath || '') === (r.detailCatPath || '')) continue;
          forcedByCategory.add(res.uid);
          if (!res.regens.includes('content')) res.regens.push('content');
        }
      }

      const needing = results.filter((r) => r.regens.length > 0);
      if (needing.length === 0) break;
      if (!helperOk || round === MAX_AUDIT_ROUND) break; // 더 손쓸 수 없음 → 아래에서 제외/경고 처리

      // ── Stage B: 문제 필드만 로컬 GPU 재생성 ──
      const rowByUid = new Map(work.map((r) => [r.uid, r]));
      const jobs: { label: string; taskType: RegenTask; input: Record<string, unknown> }[] = [];
      for (const res of needing) {
        const r = rowByUid.get(res.uid);
        if (!r) continue;
        const g = r.gen;
        const pj = (r.scanned.productJson || {}) as { features?: unknown };
        const features = Array.isArray(pj.features) ? pj.features : [];
        const catPath = r.edit.categoryPath || g?.categoryPath || '';
        for (const task of res.regens) {
          // 필드명은 도우미 llm-pull-loop 가 읽는 것 그대로여야 한다(바꾸면 조용히 빈 결과).
          const input: Record<string, unknown> =
            task === 'content'
              ? {
                displayName: r.edit.displayName || g?.displayName || g?.originalName,
                originalName: g?.originalName, categoryPath: catPath,
                leaf: catPath.split('>').pop()?.trim() || '',
                features, seoKeywords: g?.keywords || [], seed: g?.originalName,
              }
              : task === 'display_name'
                ? { originalName: g?.originalName, features, categoryPath: catPath, seed: g?.originalName }
                : task === 'options'
                  ? { originalName: g?.originalName, features }
                  : { originalName: g?.originalName };
          jobs.push({ label: `${r.uid}:${task}`, taskType: task, input });
        }
      }
      if (jobs.length === 0) break;

      setAuditProgress({
        phase: 'regen', round, maxRound: MAX_AUDIT_ROUND, total: work.length,
        fixed: fixedTotal, warned: warnMap.size, regenDone: 0, regenTotal: jobs.length,
        message: `내 PC GPU로 ${needing.length}개 상품 · ${jobs.length}개 항목 재생성 중…`,
        startedAt: auditStartedAt, regenStartedAt: Date.now(),
      });

      let regenResults = new Map<string, unknown>();
      try {
        regenResults = await runRegenBatch(jobs, (done, total) => {
          setAuditProgress((p) => (p ? { ...p, regenDone: done, regenTotal: total } : p));
        });
      } catch (err) {
        // 재생성 자체가 실패해도 점검은 계속 — 아래 라운드에서 제외/경고로 처리된다.
        setAuditProgress((p) => (p ? { ...p, message: err instanceof Error ? err.message : '재생성 실패' } : p));
      }

      // 재생성 결과를 작업 사본과 화면 카드에 반영.
      const patches = new Map<string, Partial<RowEdit>>();
      for (const [label, result] of regenResults) {
        const cut = label.lastIndexOf(':');
        const uid = label.slice(0, cut);
        const task = label.slice(cut + 1) as RegenTask;
        const cur = patches.get(uid) || {};
        if (task === 'content') {
          const paragraphs = (result as { paragraphs?: string[] } | null)?.paragraphs || [];
          const text = paragraphs.filter(Boolean).join('\n\n');
          if (text) cur.detail = text;
        } else if (task === 'display_name') {
          const name = (result as { displayName?: string } | null)?.displayName || '';
          if (name) cur.displayName = name;
        } else if (task === 'options') {
          const opts = (result as { options?: OptionField[] } | null)?.options || [];
          if (opts.length) cur.options = opts.map((o) => ({ name: o.name, value: o.value, unit: o.unit }));
        } else if (task === 'category') {
          const c = result as { categoryCode?: string; categoryPath?: string } | null;
          if (c?.categoryCode) { cur.categoryCode = String(c.categoryCode); cur.categoryPath = c.categoryPath || ''; }
        }
        if (Object.keys(cur).length) { patches.set(uid, cur); regeneratedTotal += 1; }
      }
      const applyRegen = (r: Row): Row => {
        const p = patches.get(r.uid);
        if (!p) return r;
        const edit = { ...r.edit, ...p };
        return {
          ...r,
          edit,
          // 상세글을 다시 썼으면 "어느 분류로 쓰였나"도 같이 옮긴다 — 안 옮기면 점검이
          // 고쳐 놓고도 카드가 계속 "예전 카테고리 그대로"라고 경고한다.
          detailCatPath: p.detail ? (edit.categoryPath || r.detailCatPath) : r.detailCatPath,
        };
      };
      work = work.map(applyRegen);
      setRows((prev) => prev.map((r) => (patches.has(r.uid) ? applyRegen(r) : r)));
    }

    // ── 최종 판정 ──
    const resByUid = new Map(lastResults.map((r) => [r.uid, r]));
    const excluded: { name: string; reasons: string[] }[] = [];
    const kept: Row[] = [];
    for (const r of work) {
      const res = resByUid.get(r.uid);
      const unfixed = res
        ? res.findings.filter((f) => f.severity === 'blocker').map((f) => f.message)
        : [];
      const hardBlocked = !!res?.blocked;
      if (hardBlocked || (unfixed.length > 0 && excludeUnfixed)) {
        excluded.push({ name: nameOf(r), reasons: unfixed.length ? unfixed : ['등록 최소 조건 미달'] });
        continue;
      }
      if (unfixed.length > 0) {
        const set = warnMap.get(r.uid) || new Set<string>();
        unfixed.forEach((m) => set.add(`[미해결] ${m}`));
        warnMap.set(r.uid, set);
      }
      kept.push(r);
    }

    const nameByUid = new Map(work.map((r) => [r.uid, nameOf(r)]));
    const report: AuditReport = {
      total: work.length,
      registered: kept.length,
      fixed: fixedTotal,
      warned: warnMap.size,
      regenerated: regeneratedTotal,
      excluded,
      warnings: [...warnMap.entries()]
        .filter(([uid]) => kept.some((k) => k.uid === uid))
        .map(([uid, set]) => ({ name: nameByUid.get(uid) || uid, messages: [...set] })),
    };
    setAuditProgress(null);
    return { targets: kept, report };
  }, [helperDiag, toAuditInput, runRegenBatch]);

  /**
   * 검수 생략 등록 본체 — 감사 로그 → (선택) AI 최종점검 → 등록.
   * 수동 동의(모달)와 무인 자동등록이 같은 경로를 쓴다. 무인이라고 감사기록·점검을 빼면
   * "누가 언제 뭘 무검수로 올렸는지"가 사라진다.
   */
  const runSkipReviewRegister = useCallback(async (
    initial: Row[], opts: SkipReviewOptions, plan: SkipReviewPlan, via: 'manual' | 'autopilot',
  ) => {
    setAuditReport(null);
    if (initial.length === 0) return;
    const uids = new Set(initial.map((r) => r.uid));
    // 화면의 승인 체크도 켜 둔다 — 실제 등록 대상과 카드 표시가 어긋나지 않게.
    setRows((prev) => prev.map((r) => (uids.has(r.uid) ? { ...r, approved: true } : r)));
    // 감사 기록: 누가·언제·몇 건을·어떤 경고를 안고 올렸는지. dedup 에 먹히지 않도록 메시지에 시각을 넣는다.
    void reportClientError({
      source: 'megaload/allinone/skip-review',
      level: 'warn',
      category: 'megaload',
      message: `검수 생략 등록 ${via === 'autopilot' ? '무인 실행' : '동의'} ${initial.length}건 @${new Date().toISOString()}`,
      context: {
        via,
        count: initial.length,
        audit: opts.audit,
        excludeUnfixed: opts.excludeUnfixed,
        needsReview: plan.needsReview,
        unresolvedOptions: plan.unresolvedOptions,
        certRisk: plan.certRisk,
        productCodes: initial.slice(0, 50).map((r) => r.productCode),
      },
    });

    let targets = initial;
    if (opts.audit) {
      try {
        const { targets: kept, report } = await runFinalAudit(initial, opts.excludeUnfixed);
        targets = kept;
        setAuditReport(report);
      } catch (err) {
        setAuditProgress(null);
        setError(`AI 최종점검 실패 — 등록을 중단했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
        return;
      }
      if (targets.length === 0) {
        setError('AI 최종점검 결과 등록 가능한 상품이 없습니다. 아래 점검 리포트의 제외 사유를 확인하세요.');
        return;
      }
    }
    void handleRegisterRef.current?.(targets);
  }, [runFinalAudit]);

  /** 모달(수동 경로) 확인 — 'arm' 이면 등록 대신 무인 자동등록을 켠다. */
  const confirmSkipReview = useCallback((opts: SkipReviewOptions) => {
    setSkipOpen(false);
    if (skipMode === 'arm') {
      // 이 지점이 "동의"다 — 위험 6종 개별 체크 + 책임 동의 + 확인문구 타이핑을 모두 통과해야 도달한다.
      const consentAt = Date.now();
      applyAutoPilot({ on: true, audit: opts.audit, excludeUnfixed: opts.excludeUnfixed, consentAt });
      // 무장 자체도 기록해 둔다 — 실제 등록은 나중에 사람 없이 일어나므로, 동의 시점이 따로 남아야 한다.
      void reportClientError({
        source: 'megaload/allinone/skip-review',
        level: 'warn',
        category: 'megaload',
        message: `무인 자동등록 동의 @${new Date(consentAt).toISOString()}`,
        context: {
          via: 'autopilot-arm', audit: opts.audit, excludeUnfixed: opts.excludeUnfixed,
          consentAt, expiresAt: consentAt + AUTOPILOT_CONSENT_TTL_MS,
        },
      });
      return;
    }
    void runSkipReviewRegister(skipTargetsRef.current, opts, skipPlan, 'manual');
  }, [skipMode, skipPlan, runSkipReviewRegister, applyAutoPilot]);

  // ── 무인 자동등록 실행 ───────────────────────────────────────────
  const fireAutoPilot = useCallback(() => {
    const ap = autoPilotRef.current;
    // 동의가 없거나 만료됐으면 실행하지 않는다(마지막 방어선). 만료면 조용히 꺼지지 않게 알린다.
    if (!autoPilotArmed(ap)) {
      applyAutoPilot(AUTOPILOT_OFF);
      if (ap.on) setError('무인 자동등록 동의가 만료돼(6시간) 자동 등록을 취소했습니다. 다시 켜려면 동의를 새로 받습니다.');
      return;
    }
    setError('');
    const built = buildSkipPlan(rows);
    if ('error' in built) {
      setError(`무인 자동등록을 시작하지 못했습니다 — ${built.error}`);
      return;
    }
    void runSkipReviewRegister(
      built.targets, { audit: ap.audit, excludeUnfixed: ap.excludeUnfixed }, built.plan, 'autopilot',
    );
  }, [rows, buildSkipPlan, runSkipReviewRegister, applyAutoPilot]);

  // 카운트다운 타이머는 rows 갱신마다 재시작되면 안 된다(그러면 영원히 0 에 못 닿는다) →
  // 실행 함수는 ref 로만 참조하고, effect 는 남은 초에만 의존한다.
  const fireAutoPilotRef = useRef(fireAutoPilot);
  useEffect(() => { fireAutoPilotRef.current = fireAutoPilot; }, [fireAutoPilot]);

  /**
   * 무인 대기 → 카운트다운으로 넘기는 자리.
   * 누끼가 다 끝나야 등록 게이트를 통과한다. 끝났으면 **우리가 다시 불러온다** —
   * 사람 검수 경로에서 자동 재로드를 안 하는 이유는 편집 중인 내용을 날리기 때문인데,
   * 무인에는 그 편집이 없다. 여기서 안 불러오면 게이트가 "다시 불러오세요"로 막고 끝난다.
   */
  useEffect(() => {
    if (autoArmDeadline == null) return;
    if (Date.now() > autoArmDeadline) {
      setAutoArmDeadline(null);
      applyAutoPilot(AUTOPILOT_OFF);
      setError(`대표컷 가공이 ${Math.round(AUTOPILOT_THUMB_WAIT_MS / 60_000)}분을 넘겨 무인 자동등록을 멈췄습니다 — 직접 확인한 뒤 등록해 주세요.`);
      return;
    }
    if (thumbPendingCount > 0) return;      // 아직 가공 중 — 위 감시 effect 가 지켜본다
    let alive = true;
    (async () => {
      if (thumbJustDone) {
        const built = await handleLoadFromHelper();
        if (!alive) return;
        if (built.length === 0) { setAutoArmDeadline(null); return; }
      }
      if (!alive) return;
      setAutoArmDeadline(null);
      setAutoCountdown(AUTOPILOT_DELAY_SEC);
    })();
    return () => { alive = false; };
  }, [autoArmDeadline, thumbPendingCount, thumbJustDone, handleLoadFromHelper, applyAutoPilot]);

  // 취소 유예 카운트다운. 0 이 되는 순간 등록을 시작한다.
  //   setState 를 effect 본문에서 직접 부르지 않도록(연쇄 렌더) 타이머 콜백 안에서만 갱신한다.
  useEffect(() => {
    if (autoCountdown == null) return;
    const t = setTimeout(() => {
      setAutoCountdown((n) => (n != null && n > 1 ? n - 1 : null));
      if (autoCountdown <= 1) fireAutoPilotRef.current();
    }, 1000);
    return () => clearTimeout(t);
  }, [autoCountdown]);

  // ── 등록 ─────────────────────────────────────────────────────────
  /**
   * @param overrideTargets 명시 대상. 지정하면 approved 플래그 대신 이 목록을 그대로 등록한다.
   *   ("검수 없이 등록" 경로 전용 — setRows 로 승인 플래그를 켜도 이 콜백의 rows 클로저는
   *    아직 옛 값이라, 상태 갱신을 기다리지 않고 대상을 직접 넘긴다.)
   */
  const handleRegister = useCallback(async (overrideTargets?: Row[]) => {
    setError('');
    setDoneSummary(null);
    const targets = overrideTargets ?? rows.filter((r) => r.approved && r.gen && r.status !== 'success');
    if (targets.length === 0) { setError('승인된 상품이 없습니다.'); return; }
    if (!selectedOutbound) { setError('출고지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!selectedReturn) { setError('반품지를 선택해주세요. (쿠팡 Wing에 등록 필요)'); return; }
    if (!contactNumber.trim()) { setError('고객센터 연락처를 입력해주세요.'); return; }
    const missingImg = targets.filter((r) => r.mainImages.length === 0);
    if (missingImg.length > 0) { setError(`대표이미지가 없는 상품 ${missingImg.length}개가 있습니다. 워커에서 대표이미지 가공 후 다시 시도하세요.`); return; }
    // 누끼가 아직 도는 중이면 등록하지 않는다 — 지금 올리면 **원본**이 대표로 올라간다.
    //   검수는 먼저 하게 하되(그게 이 단계를 미뤄 둔 이유다), 등록물의 품질은 그대로 지킨다.
    if (thumbPendingCount > 0) {
      setError(`대표컷 가공이 아직 ${thumbPendingCount}건 진행 중입니다 — 끝나면 “도우미 결과 다시 불러오기”를 눌러 최종 대표컷을 반영한 뒤 등록해 주세요.`);
      return;
    }
    if (thumbJustDone) {
      setError('대표컷 가공이 끝났습니다 — “도우미 결과 다시 불러오기”로 최종 대표컷을 반영한 뒤 등록해 주세요.');
      return;
    }

    setRegistering(true);
    // 성공 집계·성공 uid 는 try 밖에 둔다 — 중간에 예외로 튀어도 finally 에서 화면 정리를 마쳐야 한다.
    let totalSuccess = 0, totalError = 0;
    const succeeded = new Set<string>();
    const startedAt = Date.now();
    setNowTick(startedAt);
    setProgress({ done: 0, total: targets.length, prepared: 0, startedAt });
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
      let doneCount = 0;
      for (let b = 0; b < targets.length; b += BATCH_SIZE) {
        const batch = targets.slice(b, b + BATCH_SIZE);
        const batchUids = new Set(batch.map((r) => r.uid));
        setRows((prev) => prev.map((r) => (batchUids.has(r.uid) ? { ...r, status: 'registering' as RowStatus } : r)));
        setProgress((p) => ({ ...p, prepared: 0 }));   // 새 배치 시작 — 준비 눈금 리셋

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
          // ── 상품 갤러리(대표 1 + 서브 최대 9) 구성 ──────────────────────────────
          // 쿠팡은 이미지 배열을 10장까지 받는다(0번=REPRESENTATION, 나머지=DETAIL).
          // 서브이미지는 상품 노출·전환에 쓰이므로 채울수록 유리하다.
          //
          // ⚠️ 예전 동작: 대표로 **누끼 가공본이나 리뷰컷을 고르면 그 1장만** 올렸다.
          //    대표컷 지재권 정책이 들어가면서 공산품=누끼, 과일=리뷰컷이 기본 대표가 됐고,
          //    그 결과 거의 모든 상품이 이미지 1장으로 등록됐다(실측). 화면은 "대표 외 후보는
          //    서브이미지로 등록됩니다" 라고 안내하고 있어 표시와 실제가 어긋나 있었다.
          //
          // 지금: **서브 9장을 리뷰 실사로 채운다**(사용자 확정 2026-07-31).
          //    ① 리뷰 실사    — 구매자 촬영. 업체 상업컷 대비 지재권 위험이 가장 낮다
          //    ② 누끼 가공본  — 리뷰컷이 9장에 못 미칠 때 보충(우리 산출물이라 안전)
          //    ③ 업체 원본    — 위 둘로도 못 채울 때만 마지막 보충(빈 슬롯보다는 낫다)
          //
          // ⚠️ 서브 9장을 **r.reviewImages(리뷰 풀) 에서 직접** 끌어오던 게 버그였다(실측 2026-08-05).
          //    리뷰 풀은 "상세 본문 교차용" 이라 카드 대표컷 후보와 다른 목록이다. 사용자가 후보에서
          //    ×(=툴팁 "서브이미지에서 제외")로 리뷰컷을 다 빼도 리뷰 풀은 그대로였고, 결국 대표1+후보1만
          //    남긴 상품이 쿠팡엔 추가이미지 6장으로 올라갔다.
          //    → 갤러리는 **카드에 보이는 r.mainImages 가 유일한 출처**다.
          //      대표 외에 남긴 후보는 전부 서브로 올라가고, 뺀 건 안 올라간다. 순서도 카드 순서 그대로.
          //    ①②③ 우선순위는 이제 **후보가 10장을 넘어 잘라내야 할 때만** 쓴다(뭘 살릴지의 기준).
          //    쿠팡 10장 한도라 그 이상은 물리적으로 못 올린다 — 카드 버튼의 "서브 N장"이 실제 장수다.
          //    ★ 사용자가 카드에서 고른 것이 있으면 **그게 곧 갤러리**다(pickedMainNames).
          //      아무것도 안 골랐으면 예전과 같은 자동 기본값(대표 + 추천 상위 9장)이 나온다 —
          //      화면·등록이 같은 함수를 보므로 "카드엔 6장인데 8장이 올라갔다" 가 생기지 않는다.
          const galleryNames = pickedMainNames(r);
          const mainByName = new Map(r.mainImages.map((m) => [m.name, m]));
          const mainOrdered = galleryNames
            .map((n) => mainByName.get(n))
            .filter((x): x is ScannedImageFile => !!x);
          const mainUrls = (await uploadScannedImages(mainOrdered, GALLERY_MAX, wm)).filter(Boolean);
          // 본문 교차 이미지는 리뷰컷만(detailUrls 비움).
          // ⚠️ 소싱처 상세컷("상품 상세정보" 섹션)은 **쓰지 않는다**(사용자 확정) — 멤버십·적립 배너가
          //    섞여 들어오는 데다, 상품 정보는 아래 product_info(상품정보제공고시)로 충분하다.
          //    업로드 자체를 안 하므로 스토리지·전송 비용과 등록 시간도 함께 줄어든다.
          const detailUrls: string[] = [];
          // 카드에서 뺀 리뷰컷은 올리지 않는다(r.reviewImages = 편집 반영본).
          const reviewUrls = (await uploadScannedImages(r.reviewImages || [], 10, wm)).filter(Boolean);
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
            // 카드에 보이는 그 태그를 그대로 넘긴다(연관검색어 포함, 20칸). 서버가 같은 빌더로
            // 한 번 더 거르지만 1순위 후보라 순서·내용이 유지된다 — 화면과 등록이 어긋나지 않는다.
            searchTagsOverride: tagsOf(r),
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
            // "상품 상세정보"(원본 설명 텍스트·상세컷) 섹션은 쓰지 않는다 — sourceDescription 도 보내지 않는다.
            preUploadedUrls: {
              mainImageUrls: mainUrls,
              detailImageUrls: detailUrls,
              reviewImageUrls: reviewUrls,
              infoImageUrls: infoUrls,
            },
          });
          // 이미지 업로드가 등록 시간의 대부분이다 — 상품 한 건이 준비될 때마다 눈금을 올려
          // 배치(10개)가 끝날 때까지 막대가 멈춰 보이지 않게 한다.
          setProgress((p) => ({ ...p, prepared: p.prepared + 1 }));
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
            for (const res of results) if (res.success && res.uid) succeeded.add(res.uid);
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
                `인증정보 미반영 ${cw.length}건${failed > 0 ? ` (${failed}건은 "인증대상아님"으로 등록 — 전기용품·어린이제품 계열이면 윙에서 보완)` : ''}: `
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
        setProgress((p) => ({ ...p, done: doneCount, prepared: 0 }));
      }

      await fetch('/api/megaload/products/bulk-register/complete-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, successCount: totalSuccess, errorCount: totalError }),
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setRegistering(false);
      // ── 등록이 끝난 카드는 화면에서 내린다 ─────────────────────────────
      //   예전엔 status='success' 로 초록 테두리만 두른 채 카드가 그대로 남아, 다음 폴더를
      //   불러오기 전까지 이미 올린 화면이 계속 떠 있었다("업로드했는데 이 화면이 안 사라진다").
      //   ⚠️ 실패분은 남긴다 — 사유를 보고 고쳐서 다시 올릴 대상이라, 같이 지우면 무엇이 빠졌는지
      //      아무 데도 안 남는다.
      if (succeeded.size > 0) {
        const removed = targets.filter((r) => succeeded.has(r.uid));
        setRows((prev) => prev.filter((r) => !succeeded.has(r.uid)));
        setOpenMain((prev) => dropKeys(prev, succeeded));
        setOpenDetail((prev) => dropKeys(prev, succeeded));
        setRegen((prev) => dropKeys(prev, succeeded));
        // 내린 카드가 쥐고 있던 blob URL 은 여기서 놓아 준다 — 판을 거듭할수록 메모리에 쌓인다.
        //   도우미 직독 경로의 http://127.0.0.1 URL 은 blob 이 아니라 건드리지 않는다.
        for (const r of removed) {
          const imgs = [...r.mainImages, ...r.detailImages, ...r.reviewImages, ...(r.scanned.infoImages || [])];
          for (const img of imgs) {
            if (img.objectUrl?.startsWith('blob:')) {
              URL.revokeObjectURL(img.objectUrl);
              img.objectUrl = undefined;
            }
          }
        }
      }
      // 카드가 사라져도 "몇 건 올라갔는지"는 남아야 한다 — 결과 줄이 그 자리를 대신한다.
      if (totalSuccess + totalError > 0) {
        setDoneSummary({ success: totalSuccess, failed: totalError, at: Date.now() });
      }
    }
  }, [rows, selectedOutbound, selectedReturn, contactNumber, thumbPendingCount, thumbJustDone]);

  // "검수 없이 등록" 경로가 선언 순서와 무관하게 최신 handleRegister 를 호출하도록 연결.
  useEffect(() => { handleRegisterRef.current = handleRegister; }, [handleRegister]);

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

      {/* ── 무인 자동등록(오토파일럿) — 폴더를 고르기 전에 미리 켜는 자리 ──────────
          "화면도 안 보고 바로 등록"을 하려면 동의가 생성 **전에** 있어야 한다.
          생성이 끝나면 카운트다운만 뜨고, 사람이 아무것도 누르지 않아도 등록까지 간다. */}
      {autoPilot.on ? (
        <div className="rounded-xl border-2 border-[#E31837] bg-red-50/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-sm font-bold text-[#E31837]">🤖 무인 자동등록 켜짐</span>
            <span className="text-xs text-gray-700">
              생성이 끝나면 <b>검수 없이 전량 등록</b> · AI 최종점검{' '}
              <b>{autoPilot.audit ? 'ON' : 'OFF'}</b>
              {autoPilot.audit && <> · 못 고친 상품 <b>{autoPilot.excludeUnfixed ? '제외' : '그대로 등록'}</b></>}
            </span>
            <span className="flex-1" />
            <button type="button" onClick={requestArmAutoPilot}
              className="text-xs font-medium rounded-lg px-3 py-1.5 border border-[#E31837]/50 text-[#E31837] hover:bg-red-100">
              설정 다시하기
            </button>
            <button type="button"
              onClick={() => { setAutoCountdown(null); applyAutoPilot(AUTOPILOT_OFF); }}
              className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-800">
              끄기
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
            {new Date(autoPilot.consentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 동의 ·
            {' '}<b>{new Date(autoPilot.consentAt + AUTOPILOT_CONSENT_TTL_MS).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지 유효</b>.
            새로고침하거나 이 탭을 닫으면 해제되고, 다시 켜려면 동의를 새로 받습니다.
            등록 시작 전 <b>{AUTOPILOT_DELAY_SEC}초</b> 동안만 멈출 수 있습니다.
            {(!selectedOutbound || !selectedReturn || !contactNumber.trim()) && (
              <b className="text-[#E31837]"> ⚠️ 출고지·반품지·연락처가 비어 있어 지금 상태로는 자동등록이 멈춥니다 — 먼저 채워주세요.</b>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-semibold text-gray-900">🤖 무인 자동등록</span>
          <span className="text-xs text-gray-500 leading-relaxed">
            켜 두면 <b>소싱 폴더 선택 → 자동 생성</b>이 끝나는 즉시 검수 화면을 거치지 않고 그대로 쿠팡에 등록합니다
            (등록 직전 AI 최종점검 포함). 켜려면 <b>위험 동의 절차</b>를 거쳐야 합니다.
          </span>
          <span className="flex-1" />
          <button type="button" onClick={requestArmAutoPilot} disabled={registering || !!auditProgress}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-[#E31837] text-[#E31837] hover:bg-red-50 disabled:opacity-50">
            켜기 (동의 필요)
          </button>
        </div>
      )}

      {/* ── 이번 판 소요시간 ────────────────────────────────────────────────
          끝나고 나면 진행 표시가 사라져 "1개에 얼마 걸리더라"를 감으로 답하게 된다.
          총합만으로는 **어디가 느린지** 모르므로 단계별로 쪼개 적고, 100개 환산까지 준다 —
          그게 "지금 100개를 돌려도 되나"에 답하는 유일한 숫자다. */}
      {runReport && (() => {
        const { timing: t, arrivedAt } = runReport;
        const total = Math.max(0, arrivedAt - t.startedAt);
        const genMs = t.genStartedAt ? Math.max(0, arrivedAt - t.genStartedAt) : 0;
        const n = Math.max(1, t.count);
        const per = Math.round(total / n);
        // 100개 환산은 **단순 비례**다. 단계마다 늘어나는 방식이 달라 정확한 예측이 아니라
        // 자릿수 감각을 주는 값이다 — 그래서 문구에 '단순 비례'라고 적는다.
        const per100 = per * 100;
        return (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-gray-900">
                ⏱ 이번 작업 {t.count}개 — 총 {fmtDur(total)}
              </span>
              <span className="text-sm text-gray-700">
                상품당 <b>{fmtDur(per)}</b>
              </span>
              <span className="text-sm text-gray-700">
                100개면 <b>약 {fmtDur(per100)}</b>
                <span className="text-gray-400 text-xs"> (단순 비례)</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              {t.detailWaitMs > 0 && <span>상세 준비 <b className="tabular-nums">{fmtDur(t.detailWaitMs)}</b></span>}
              {t.importMs > 0 && <span>→ 가져오기 <b className="tabular-nums">{fmtDur(t.importMs)}</b></span>}
              {genMs > 0 && <span>→ 상세페이지 생성 <b className="tabular-nums">{fmtDur(genMs)}</b></span>}
              <span className="flex-1" />
              <button type="button" onClick={() => setRunReport(null)} className="text-gray-400 hover:text-gray-600">닫기</button>
            </div>

            {/* ── 생성 단계 실측 ────────────────────────────────────────────
                위 숫자는 "누르고 나서 카드가 뜰 때까지"의 벽시계다. 느렸을 때 **어디가**
                느렸는지는 도우미가 잰 이 값만 안다(인식/텍스트/누끼). 없으면(구버전 도우미)
                줄 자체를 띄우지 않는다 — 빈칸을 보여 주는 것보다 낫다. */}
            {runTiming && (() => {
              const rt = runTiming;
              const goal = 12_000;   // 목표: 상품당 12초(100개 20분)
              const ok = rt.perProductMs <= goal;
              const vs = rt.vision;
              return (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                    <span className="font-semibold text-gray-800">생성 실측</span>
                    <span className={ok ? 'text-emerald-700' : 'text-amber-700'}>
                      상품당 <b className="tabular-nums">{fmtDur(rt.perProductMs)}</b>
                      <span className="text-gray-400"> · 100개 환산 </span>
                      <b className="tabular-nums">{fmtDur(rt.per100Ms)}</b>
                      <span className="text-gray-400"> (목표 20분)</span>
                    </span>
                    <span className="flex-1" />
                    <span className="text-gray-500 tabular-nums">
                      인식 {fmtDur(rt.phase.recogMs)} · 텍스트 {fmtDur(rt.phase.textMs)}
                      {rt.phase.thumbMs > 0 && <> · 누끼 {fmtDur(rt.phase.thumbMs)}</>}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span>비전 {vs.calls}콜 · {vs.cells}칸 (격자 {fmtDur(vs.sheetMs)} + 모델 {fmtDur(vs.vlmMs)})</span>
                    {vs.verbose > 0 && <span className="text-amber-600">재질문 {vs.verbose}회</span>}
                    {vs.timeouts > 0 && <span className="text-red-600">상한초과 {vs.timeouts}회</span>}
                    {rt.settings.recogHits > 0 && <span className="text-emerald-600">인식 캐시 {rt.settings.recogHits}건</span>}
                    <span className="text-gray-400">
                      동시 텍스트 {rt.settings.genConcurrency} · 인식 {rt.settings.recogConcurrency}
                      {rt.settings.overlap ? ' · 겹치기 ON' : ''}
                      {rt.settings.deferThumb ? ' · 누끼 지연' : ''}
                    </span>
                  </div>
                  {!ok && (
                    <p className="text-[11px] text-amber-700 leading-snug">
                      {rt.phase.recogMs > rt.phase.textMs
                        ? '인식(사진 판정)이 가장 큽니다 — 도우미 GPU 여유가 있으면 겹치기가 켜집니다. 같은 폴더를 다시 돌리면 인식 캐시로 이 구간이 빠집니다.'
                        : '텍스트 생성이 가장 큽니다 — 이 구간은 GPU 처리량 상한에 걸려 있어, 동시 개수를 올려도 더 빨라지지 않습니다.'}
                    </p>
                  )}
                </div>
              );
            })()}
            {t.detailWaitMs > 0 && (
              <p className="text-[11px] text-gray-500 leading-snug">
                <b>상세 준비</b>는 아직 자료를 안 받아 둔 상품에만 붙습니다 —
                목록에서 <b>상세 확보</b> 표시가 있는 상품만 고르면 이 시간이 통째로 빠집니다.
              </p>
            )}
          </div>
        );
      })()}

      {/* 무인인데 아직 못 거는 중 — 왜 기다리는지 말한다(아무 표시가 없으면 멈춘 걸로 보인다). */}
      {autoArmDeadline != null && (
        <div className="rounded-xl border-2 border-[#E31837] bg-white px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E31837] animate-pulse flex-none" />
          <span className="text-sm font-bold text-[#E31837]">
            무인 자동등록 대기 — 대표컷 가공 {thumbPendingCount}건이 끝나면 바로 등록합니다
          </span>
          <span className="flex-1" />
          <button type="button"
            onClick={() => { setAutoArmDeadline(null); applyAutoPilot(AUTOPILOT_OFF); }}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-800">
            무인 끄기
          </button>
        </div>
      )}

      {/* 자동 등록 직전 취소 유예 — 무인이라도 눈앞에 있으면 멈출 수 있어야 한다. */}
      {autoCountdown != null && (
        <div className="rounded-xl border-2 border-[#E31837] bg-white px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E31837] animate-pulse flex-none" />
          <span className="text-sm font-bold text-[#E31837]">
            무인 자동등록 — {autoCountdown}초 후 {rows.length}건을 검수 없이 등록합니다
          </span>
          <span className="flex-1" />
          <button type="button" onClick={() => setAutoCountdown(null)}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-gray-900 text-white hover:bg-gray-800">
            지금 멈추기
          </button>
        </div>
      )}

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

      {/* 이미지가 죽은 포트를 가리켜 깨진 상태 — 도우미 재시작 후 흔하다. 복구법을 바로 안내. */}
      {imagesStale && rows.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">이미지가 깨져 보입니다 — 도우미가 업데이트·재시작된 상태입니다</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            재시작하면 로컬 서버 주소가 바뀌어, 지금 카드에 걸린 이미지 링크가 끊깁니다.
            아래 <b>이전 생성결과 불러오기</b>를 다시 누르면 현재 주소로 새로 읽어와 복구됩니다.
          </p>
          {helperDiag?.ok && (
            <button onClick={handleLoadFromHelper} disabled={scanning || registering || !!auditProgress}
              className="mt-2 text-xs font-semibold rounded-lg px-3 py-1.5 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
              {scanning ? '불러오는 중…' : '지금 다시 불러오기'}
            </button>
          )}
        </div>
      )}

      {/* 대표컷 누끼는 검수와 나란히 돈다 — 사람을 기다리게 하지 않되, 등록 전에는 반드시 반영한다. */}
      {(thumbPendingCount > 0 || thumbJustDone) && rows.length > 0 && (
        <div className={`rounded-xl border px-4 py-3 ${thumbJustDone ? 'border-emerald-300 bg-emerald-50' : 'border-sky-300 bg-sky-50'}`}>
          <p className={`text-sm font-semibold ${thumbJustDone ? 'text-emerald-900' : 'text-sky-900'}`}>
            {thumbJustDone
              ? '대표컷 가공이 끝났습니다 — 다시 불러오면 최종 대표컷이 반영됩니다'
              : `대표컷 가공 ${thumbPendingCount}건이 뒤에서 진행 중입니다 — 지금 검수하세요`}
          </p>
          <p className={`mt-1 text-xs leading-relaxed ${thumbJustDone ? 'text-emerald-800' : 'text-sky-800'}`}>
            {thumbJustDone
              ? '검수 내용은 그대로 두고 싶으면 지금 불러오지 말고, 등록 직전에 눌러도 됩니다.'
              : '누끼는 등록할 때 필요한 작업이라 생성이 그걸 기다리지 않고 검수를 먼저 열었습니다. 끝날 때까지 등록은 잠시 막힙니다(원본이 대표로 올라가는 것을 막기 위해서입니다).'}
          </p>
          {thumbJustDone && helperDiag?.ok && (
            <button onClick={handleLoadFromHelper} disabled={scanning || registering || !!auditProgress}
              className="mt-2 text-xs font-semibold rounded-lg px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {scanning ? '불러오는 중…' : '도우미 결과 다시 불러오기'}
            </button>
          )}
        </div>
      )}

      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* ⭐ 주 버튼 — 폴더 고르면 도우미로 올려 자동 생성까지. 웹에서 전부(앱 안 열어도 됨). */}
        <button onClick={handleUploadAndGenerate} disabled={scanning || registering || !!auditProgress}
          className="bg-[#E31837] text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
          {scanning ? '처리 중…' : (autoPilot.on ? '소싱 폴더 선택 → 자동 생성 → 자동 등록' : '소싱 폴더 선택 → 자동 생성')}
        </button>
        {/* 이미 도우미가 생성해 둔 결과가 있으면 바로 불러오기(생성 없이). */}
        {(helperDiag?.ok || lastGoodDiag?.ok) && (() => {
          // 현재 진단이 잠깐 실패해도(생성 시작 직후 등) 마지막 성공 정보로 버튼을 유지한다.
          const src = helperDiag?.ok ? helperDiag : lastGoodDiag!;
          const stale = !helperDiag?.ok;
          return (
            <button onClick={handleLoadFromHelper} disabled={scanning || registering || !!auditProgress}
              title={stale ? '도우미 재확인 중 — 직전에 확인된 결과입니다.' : undefined}
              className="text-sm font-semibold rounded-lg px-4 py-2 border border-gray-300 text-gray-700 disabled:opacity-50">
              {scanning ? '불러오는 중…' : `도우미 결과 불러오기 (${src.records ?? 0})${stale ? ' · 재확인 중' : ''}`}
            </button>
          );
        })()}
        {/* 이미 폴더에 결과가 있을 때 그것만 읽기(생성 안 함) — 고급/폴백. */}
        <button onClick={handlePick} disabled={scanning || registering || !!auditProgress}
          className="text-xs font-medium rounded-lg px-3 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-50">
          {scanning ? '' : '폴더에서 결과만 읽기'}
        </button>
        {rows.length > 0 && (
          <>
            <button onClick={() => setAll(true)} disabled={registering} className="text-sm border border-gray-300 rounded-lg px-3 py-2">전체 승인</button>
            <button onClick={() => setAll(false)} disabled={registering} className="text-sm border border-gray-300 rounded-lg px-3 py-2">전체 해제</button>
            <span className="text-sm text-gray-500">승인 <b className="text-gray-900">{approvedCount}</b> / {rows.length}건</span>
            {/* 카테고리를 바꾼 카드가 있으면 상세글이 옛 카테고리 어휘로 남아 있다 — 한 번에 다시 쓰기. */}
            {catChangedUids.length > 0 && (
              <button type="button" disabled={registering || regenBusy}
                onClick={() => void requestDetailRegen(catChangedUids)}
                title="카테고리를 바꾼 카드의 상세글을 도우미(내 PC GPU)가 새 카테고리 기준으로 다시 씁니다"
                className="text-sm border border-amber-300 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 disabled:opacity-50">
                🔄 카테고리 바뀐 {catChangedUids.length}건 상세글 재생성
              </button>
            )}
            <span className="flex-1" />
            {/* 위험 감수 경로 — 주 버튼과 헷갈리지 않게 외곽선(빨강)으로만 강조한다. */}
            <button onClick={requestSkipReview} disabled={registering || !!auditProgress}
              title="카드별 검수·승인을 건너뛰고 전량 등록합니다. 지재권·옵션·인증 위험을 직접 감수하는 경로입니다(등록 직전 AI 최종점검 선택 가능)."
              className="border border-[#E31837] text-[#E31837] text-sm font-semibold rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50">
              ⚠️ 검수 없이 전체 등록
            </button>
            {/* 점검이 도는 동안(최대 15분) 다른 등록이 겹쳐 시작되지 않게 함께 잠근다. */}
            <button onClick={requestRegister} disabled={registering || !!auditProgress || approvedCount === 0}
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
                생성 엔진(텍스트·누끼·이미지 인식)을 올리는 중입니다. 최초 1회는 다운로드까지 있어 수 분 걸릴 수 있어요 — 정상 진행 중입니다.
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
          도우미가 생성해 둔 결과가 있습니다(<b>{helperFolder}</b>). 위 <b>&ldquo;도우미 결과 불러오기&rdquo;</b>를 누르면 폴더 선택 없이 카드가 채워집니다.
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* ── 등록 결과 ────────────────────────────────────────────────
          성공 카드는 이미 화면에서 내려갔다. 몇 건이 올라갔는지는 이 줄로만 남는다. */}
      {doneSummary && !registering && (
        <div className="rounded-xl border-2 border-green-400 bg-green-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-green-800">
            ✅ 쿠팡 등록 완료 {doneSummary.success}건
            {doneSummary.failed > 0 && <span className="text-red-700"> · 실패 {doneSummary.failed}건</span>}
          </span>
          <span className="text-xs text-green-700">
            {doneSummary.success > 0 && '등록된 카드는 화면에서 내렸습니다(쿠팡 Wing에서 확인). '}
            {doneSummary.failed > 0
              ? '실패한 카드는 사유와 함께 아래에 남겨 뒀습니다 — 고쳐서 다시 등록하세요.'
              : '다음 폴더를 불러오면 새 카드가 채워집니다.'}
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-green-600 tabular-nums">
            {new Date(doneSummary.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button type="button" onClick={() => setDoneSummary(null)}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-green-700 text-white hover:bg-green-800">
            확인
          </button>
        </div>
      )}

      {/* ── 등록 진행 ────────────────────────────────────────────────
          예전엔 버튼에 "등록 중… 3/50" 텍스트뿐이라 얼마나 걸릴지 알 수 없었다.
          진행률·경과·남은시간을 생성 패널과 같은 형식으로 보여준다. */}
      {registering && progress.total > 0 && (() => {
        // prepared 는 현재 배치에서 이미지 업로드까지 끝난 수 — done 이 10개마다 뛰는 사이를 메운다.
        const eff = Math.min(progress.total, progress.done + progress.prepared);
        const pct = Math.min(100, Math.round((eff / progress.total) * 100));
        const elapsedMs = Math.max(0, nowTick - progress.startedAt);
        // ETA 는 **등록 완료분(done)** 기준으로만 낸다. prepared 는 아직 서버 응답 전이라
        // 그걸로 나누면 남은 시간이 실제보다 짧게 나와 계속 뒤로 밀린다.
        const remainMs = progress.done > 0
          ? (elapsedMs / progress.done) * (progress.total - progress.done)
          : null;
        return (
          <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-900 animate-pulse flex-none" />
              <span className="text-sm font-semibold text-gray-900">쿠팡에 등록 중</span>
              <span className="flex-1" />
              <span className="text-sm font-bold text-gray-900 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
              <span>등록 완료 <b className="tabular-nums">{progress.done}/{progress.total}</b>건</span>
              {progress.prepared > 0 && <span className="text-gray-500">이미지 업로드 중 <b className="tabular-nums">{progress.prepared}</b>건</span>}
              <span>경과 <b className="tabular-nums">{fmtDur(elapsedMs)}</b></span>
              {remainMs != null
                ? <span>남은 예상 <b className="tabular-nums">약 {fmtDur(remainMs)}</b></span>
                : <span className="text-gray-400">남은 시간 계산 중… (첫 묶음 완료 후)</span>}
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
              {BATCH_SIZE}개씩 묶어 올립니다. 시간의 대부분은 이미지 업로드이며, 창을 닫으면 중단됩니다.
            </p>
          </div>
        );
      })()}

      {/* ── AI 최종점검 진행 ────────────────────────────────────────── */}
      {auditProgress && (() => {
        const a = auditProgress;
        const pct = a.phase === 'regen' && a.regenTotal > 0
          ? Math.round((a.regenDone / a.regenTotal) * 100)
          : null;
        return (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-none" />
              <span className="text-sm font-semibold text-emerald-900">
                🤖 등록 직전 AI 최종점검 · {a.round}/{a.maxRound}차 · {a.phase === 'scan' ? '스캔' : '재생성'}
              </span>
              <span className="flex-1" />
              {pct != null && <span className="text-sm font-bold text-emerald-700 tabular-nums">{pct}%</span>}
            </div>
            <div className="h-2 w-full rounded-full bg-emerald-100 overflow-hidden">
              {pct != null
                ? <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                : <div className="h-full w-1/3 bg-emerald-400/70 rounded-full animate-pulse" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-900">
              <span>대상 <b className="tabular-nums">{a.total}</b>건</span>
              <span>자동수정 <b className="tabular-nums">{a.fixed}</b>건</span>
              <span>경고 <b className="tabular-nums">{a.warned}</b>건</span>
              {a.regenTotal > 0 && <span>재생성 <b className="tabular-nums">{a.regenDone}/{a.regenTotal}</b></span>}
              <span>경과 <b className="tabular-nums">{fmtDur(Math.max(0, nowTick - a.startedAt))}</b></span>
              {(() => {
                // 남은시간은 재생성 단계에서만 낸다 — 규칙 스캔은 순식간이라 예측할 것이 없다.
                if (a.phase !== 'regen' || a.regenDone <= 0 || a.regenStartedAt <= 0) return null;
                const spent = Math.max(0, nowTick - a.regenStartedAt);
                const remain = (spent / a.regenDone) * (a.regenTotal - a.regenDone);
                return <span>남은 예상 <b className="tabular-nums">약 {fmtDur(remain)}</b></span>;
              })()}
            </div>
            <p className="text-[11px] text-emerald-700 leading-snug">{a.message}</p>
            {a.phase === 'regen' && (
              <p className="text-[11px] text-emerald-600 leading-snug">
                재생성은 내 PC GPU에서 돌아 서버 비용이 들지 않습니다. 도우미 앱이 켜져 있어야 진행됩니다
                (최대 15분 대기 후 중단하고 남은 항목은 제외/경고 처리).
              </p>
            )}
          </div>
        );
      })()}

      {/* ── AI 최종점검 리포트 ──────────────────────────────────────── */}
      {auditReport && (
        <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">🤖 AI 최종점검 리포트</span>
            <span className="flex-1" />
            <button type="button" onClick={() => setAuditReport(null)} className="text-xs text-gray-400 underline">닫기</button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
            <span>점검 <b className="text-gray-900 tabular-nums">{auditReport.total}</b>건</span>
            <span>자동수정 <b className="text-emerald-700 tabular-nums">{auditReport.fixed}</b>건</span>
            <span>재생성 <b className="text-indigo-700 tabular-nums">{auditReport.regenerated}</b>건</span>
            <span>경고 <b className="text-amber-700 tabular-nums">{auditReport.warned}</b>건</span>
            <span>제외 <b className="text-[#E31837] tabular-nums">{auditReport.excluded.length}</b>건</span>
            <span>등록 진행 <b className="text-gray-900 tabular-nums">{auditReport.registered}</b>건</span>
          </div>

          {auditReport.excluded.length > 0 && (
            <div className="rounded-lg border border-[#E31837]/40 bg-red-50/60 p-3">
              <p className="text-xs font-semibold text-[#E31837] mb-1.5">등록에서 제외 — 점검으로도 고치지 못했습니다</p>
              <ul className="space-y-1">
                {auditReport.excluded.slice(0, 20).map((x, i) => (
                  <li key={i} className="text-[11px] text-gray-800 leading-snug">
                    <b className="break-all">{x.name}</b> — {x.reasons.join(' / ')}
                  </li>
                ))}
              </ul>
              {auditReport.excluded.length > 20 && (
                <p className="text-[11px] text-gray-500 mt-1">외 {auditReport.excluded.length - 20}건</p>
              )}
            </div>
          )}

          {auditReport.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1.5">경고 — 등록은 진행되지만 확인이 필요합니다</p>
              <ul className="space-y-1">
                {auditReport.warnings.slice(0, 20).map((x, i) => (
                  <li key={i} className="text-[11px] text-gray-800 leading-snug">
                    <b className="break-all">{x.name}</b> — {x.messages.join(' / ')}
                  </li>
                ))}
              </ul>
              {auditReport.warnings.length > 20 && (
                <p className="text-[11px] text-gray-500 mt-1">외 {auditReport.warnings.length - 20}건</p>
              )}
            </div>
          )}
        </div>
      )}

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
        onConfirm={() => { setPreUploadOpen(false); void handleRegister(); }}
        onCancel={() => setPreUploadOpen(false)}
      />

      {/* 검수 생략 등록 — 위험 5종 개별 체크 + 확인 문구 타이핑을 통과해야 열린다 */}
      <SkipReviewRiskModal
        open={skipOpen}
        plan={skipPlan}
        helperOnline={!!helperDiag?.ok}
        preArm={skipMode === 'arm'}
        onConfirm={confirmSkipReview}
        onCancel={() => setSkipOpen(false)}
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
          // 상세글 재생성 — 카테고리를 바꿔도 본문은 안 따라오므로 사용자가 눌러 다시 쓰게 한다.
          const rg = regen[r.uid];
          const regenning = rg?.status === 'pending';
          const catChanged = !!g && (e.categoryPath || '') !== (r.detailCatPath || '');
          const regenBtn = (
            <button type="button" disabled={!editable || regenning}
              onClick={() => void requestDetailRegen([r.uid])}
              title="도우미(내 PC GPU)가 지금 카테고리 기준으로 상세글을 다시 씁니다. 도우미가 꺼져 있으면 켤 때까지 대기합니다."
              className="flex-none text-[10px] border border-amber-300 text-amber-800 hover:bg-amber-100 rounded px-1.5 py-0.5 disabled:opacity-50">
              {regenning ? '재생성 중…' : '🔄 상세글 재생성'}
            </button>
          );
          const statusColor = r.status === 'success' ? 'border-green-400' : r.status === 'error' ? 'border-red-400'
            : g?.needsReview ? 'border-amber-300' : 'border-gray-200';
          return (
            <div key={r.uid} data-field-scope className={`bg-white border ${statusColor} rounded-xl p-3 flex flex-col gap-2`}>
              <div className="flex gap-3">
                <div className="relative flex-none">
                  {thumb
                    ? <img src={thumb} alt="" onError={() => setImagesStale(true)}
                        className="w-20 h-20 object-cover rounded-lg bg-gray-100" />
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
                  {/* 카테고리를 워커 판단과 다르게 바꿨을 때 — 상세글은 옛 카테고리 어휘 그대로다.
                      바꾼 순간 자동으로 다시 쓰지 않는 이유: 재생성은 로컬 GPU 를 상품당 수십 초 잡아먹고,
                      사용자가 손본 본문을 말없이 덮어쓰면 안 되기 때문. 눌러서 확정하게 한다. */}
                  {catChanged && (
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                      <p className="flex-1 min-w-0 text-[10px] text-amber-800 leading-snug">
                        카테고리를 바꿨습니다 — <b>상세글은 예전 카테고리로 쓰인 그대로</b>입니다.
                      </p>
                      {regenBtn}
                    </div>
                  )}
                  {rg?.status === 'error' && (
                    <p className="text-[10px] text-red-600 leading-snug">재생성 실패: {rg.message}</p>
                  )}
                  {regenning && (
                    <p className="text-[10px] text-amber-700 leading-snug">
                      도우미가 상세글을 다시 쓰는 중입니다(내 PC GPU · 보통 20~60초). 도우미가 꺼져 있으면 켤 때까지 대기합니다.
                    </p>
                  )}
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
                    {/* 서브 장수는 **고른 수**다 — 등록 결과(대표1+서브N)와 카드가 어긋나지 않게. */}
                    이미지 고르기 ({pickedMainNames(r).length}/{r.mainImages.length}) · 서브 {Math.max(0, pickedMainNames(r).length - 1)}장 {openMain[r.uid] ? '▴' : '▾'}
                  </button>
                  {openMain[r.uid] && (() => {
                    const addableMain = addableMainImages(r);
                    // 지금 올라갈 목록 — 화면·등록이 같은 함수를 본다(pickedMainNames).
                    const pickedNames = pickedMainNames(r);
                    const pickedSet = new Set(pickedNames);
                    const mainName = r.mainImages[r.selectedMainIdx]?.name;
                    const unpicked = r.mainImages.filter((m) => !pickedSet.has(m.name));
                    const atCap = pickedSet.size >= GALLERY_MAX;
                    return (
                    <>
                      {/* 무엇이 올라가는지 한 줄로 못박고, 나머지를 한 번에 치울 길을 준다.
                          예전엔 빼기(×)만 있어서 25장 중 5장만 쓰려면 20번을 눌러야 했다. */}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span>
                          올릴 이미지 <b className="text-gray-900">{pickedNames.length}</b>/{GALLERY_MAX}장
                          <span className="text-gray-400"> (대표 1 + 서브 {Math.max(0, pickedNames.length - 1)})</span>
                        </span>
                        <span className="text-gray-400">· 타일을 눌러 고르고, ★ 로 대표를 정합니다</span>
                        <span className="flex-1" />
                        {editable && unpicked.length > 0 && (
                          <button type="button"
                            onClick={() => removeUnpickedMain(r.uid)}
                            title="고르지 않은 후보를 목록에서 뺍니다. 파일은 지우지 않으므로 아래 되살리기로 언제든 돌아옵니다."
                            className="text-[11px] border border-red-200 text-red-700 hover:bg-red-50 rounded px-2 py-0.5">
                            선택 안 한 {unpicked.length}장 삭제
                          </button>
                        )}
                        {editable && unpicked.length > 0 && !atCap && (
                          <button type="button"
                            onClick={() => setRows((prev) => prev.map((x) => (x.uid === r.uid
                              ? { ...x, pickedMain: x.mainImages.slice(0, GALLERY_MAX).map((m) => m.name) }
                              : x)))}
                            title={`앞에서부터 ${GALLERY_MAX}장까지 고릅니다.`}
                            className="text-[11px] border border-gray-200 text-gray-600 hover:bg-gray-50 rounded px-2 py-0.5">
                            전부 고르기
                          </button>
                        )}
                      </div>
                      {/* 후보 전량 노출 — 예전엔 overflow-x-auto 한 줄이라 25장 중 6장만 보이고
                          나머지는 가로 스크롤 뒤에 숨었다(대표를 고르려면 후보가 다 보여야 한다). */}
                      <div className="mt-1 flex flex-wrap gap-1.5 pb-1">
                        {r.mainImages.map((img, i) => {
                          const isMain = i === r.selectedMainIdx;
                          const isPicked = pickedSet.has(img.name);
                          // 한도가 찼는데 안 골라 둔 컷 — 왜 안 눌리는지 말해 준다(조용히 무시하지 않는다).
                          const capBlocked = !isPicked && atCap;
                          return (
                          <div key={`${img.name}-${i}`} role="button" tabIndex={editable ? 0 : -1}
                            onClick={() => editable && !capBlocked && toggleMainPick(r.uid, img.name)}
                            title={capBlocked
                              ? `쿠팡 한도 ${GALLERY_MAX}장을 이미 채웠습니다 — 다른 컷을 빼야 넣을 수 있습니다.`
                              : isMain ? `대표컷 · ${img.name}`
                                : `${isPicked ? '올립니다(서브)' : '안 올립니다'} · ${i < r.regenCount ? '누끼 가공본 · ' : ''}${img.name}`}
                            className={`relative flex-none w-14 h-14 rounded-md overflow-hidden border-2 ${editable && !capBlocked ? 'cursor-pointer' : ''} ${
                              isMain ? 'border-[#E31837]' : isPicked ? 'border-blue-400' : 'border-transparent hover:border-gray-300'
                            } ${isPicked ? '' : 'opacity-40 grayscale'}`}>
                            {img.objectUrl
                              ? <img src={img.objectUrl} alt="" className="w-full h-full object-cover bg-gray-100" />
                              : <div className="w-full h-full bg-gray-100" />}
                            {i < r.regenCount && (
                              <span className="absolute bottom-0 inset-x-0 bg-emerald-600/85 text-white text-[9px] leading-tight text-center">누끼</span>
                            )}
                            {i >= r.regenCount && r.reviewImages.some((rv) => rv.name === img.name) && (
                              <span className="absolute bottom-0 inset-x-0 bg-sky-600/85 text-white text-[9px] leading-tight text-center">리뷰</span>
                            )}
                            {/* ★ = 대표 지정. 예전엔 타일 클릭이 곧 대표라 "여러 장 고르기"를 할 자리가 없었다. */}
                            {isMain ? (
                              <span className="absolute top-0 left-0 bg-[#E31837] text-white text-[9px] leading-none px-1 py-0.5 rounded-br">★대표</span>
                            ) : editable && (
                              <button type="button" title="이 컷을 대표로"
                                onClick={(ev) => { ev.stopPropagation(); void selectMain(r.uid, i, img); }}
                                className="absolute top-0 left-0 bg-black/45 hover:bg-[#E31837] text-white text-[10px] leading-none w-4 h-4 rounded-br flex items-center justify-center">★</button>
                            )}
                            {/* 고른 것에만 체크 — 흑백/컬러만으로는 "고른 것"이 헷갈린다. */}
                            {isPicked && !isMain && (
                              <span className="absolute bottom-0 right-0 bg-blue-500 text-white text-[9px] leading-none w-4 h-4 rounded-tl flex items-center justify-center">✓</span>
                            )}
                            {/* 후보 목록에서 완전히 빼기(되살리기로 복구 가능) */}
                            {editable && r.mainImages.length > 1 && (
                              <button type="button" title="후보에서 빼기(되살릴 수 있습니다)"
                                onClick={(ev) => { ev.stopPropagation(); removeMainImage(r.uid, img.name); }}
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-bl w-4 h-4 text-[10px] leading-none flex items-center justify-center">×</button>
                            )}
                          </div>
                          );
                        })}
                      </div>
                      {/* 뺀 대표 후보 되살리기 */}
                      {addableMain.length > 0 && (
                        <button type="button" disabled={!editable} onClick={() => void toggleDetailPool(`main:${r.uid}`, addableMain)}
                          className="text-[11px] text-blue-600 disabled:opacity-40">
                          {openDetailPool[`main:${r.uid}`] ? '되살리기 닫기' : `+ 뺀 이미지 되살리기 (${addableMain.length})`}
                        </button>
                      )}
                      {openDetailPool[`main:${r.uid}`] && addableMain.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 pb-1 bg-gray-50 rounded p-1">
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
                      {/* 직접 입력 대상 행은 지우면 입력칸이 사라져 등록차단을 풀 방법이 없어진다 → 삭제 금지 */}
                      <button type="button" disabled={!editable || miss} title={miss ? '필수 옵션 — 값을 입력해야 등록됩니다' : '옵션 삭제'}
                        onClick={() => removeOption(r.uid, i)} className="text-gray-400 hover:text-red-500 text-sm px-1 leading-none disabled:opacity-40">×</button>
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
              {/* 검색어 태그 — 쿠팡 검색은 카테고리·상품명·구매옵션·검색어 네 필드를 조합한다.
                  등록될 값을 그대로(같은 빌더로) 보여준다. 상품명에 안 들어간 키워드가 여기로 간다. */}
              {g && (() => {
                const tags = tagsOf(r);                       // 등록에 실리는 그 값 그대로
                const tj = tagJobs[r.uid];
                const fromAgent = new Set((r.tagCandidates || []).map((t) => t.replace(/\s+/g, '').toLowerCase()));
                const agentHits = tags.filter((t) => fromAgent.has(t.replace(/\s+/g, '').toLowerCase())).length;
                return (
                  <div>
                    <p className="text-[11px] text-gray-600 flex flex-wrap items-center gap-x-1.5">
                      <span>
                        검색어 태그 <span className={`font-semibold ${tags.length >= 20 ? 'text-gray-900' : 'text-amber-600'}`}>{tags.length}</span>
                        <span className="text-gray-400">/20</span>
                      </span>
                      {/* 어디서 온 태그인지 — 연관검색어인지 조합으로 채운 것인지 구분돼야 손볼 수 있다. */}
                      {tj?.status === 'pending' && <span className="text-indigo-600">· 쿠팡 연관검색어 뽑는 중…</span>}
                      {agentHits > 0 && <span className="text-emerald-600">· 연관검색어 {agentHits}개 반영</span>}
                      {tj?.status === 'error' && (
                        <span className="text-amber-600" title="태그 20칸은 카테고리 사전으로 이미 차 있습니다 — 등록은 그대로 됩니다.">
                          · 연관검색어 {tj.message} (사전으로 채움)
                        </span>
                      )}
                      {!tj && !r.tagCandidates?.length && (
                        <span className="text-gray-400">· 조합으로 채움{helperDiag?.ok ? '' : ' (도우미를 켜면 연관검색어로 채웁니다)'}</span>
                      )}
                      <button type="button" disabled={!editable || tj?.status === 'pending'}
                        onClick={() => void requestSearchTags([r.uid])}
                        title="도우미(내 PC GPU)가 이 상품의 쿠팡 연관검색어를 다시 뽑습니다. 비용 0."
                        className="text-[10px] text-blue-600 underline disabled:opacity-40 disabled:no-underline">
                        {r.tagCandidates?.length ? '다시 뽑기' : '연관검색어 뽑기'}
                      </button>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span key={t}
                          className={`text-[10px] rounded px-1.5 py-0.5 border ${
                            fromAgent.has(t.replace(/\s+/g, '').toLowerCase())
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>{t}</span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {g?.sourceUrl && <a href={g.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 break-all">원본: {g.sourceUrl}</a>}
              {g && (
                <div>
                  <button onClick={() => void toggleDetail(r.uid, r.scanned.infoImages || [], r.reviewImages)} className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1">
                    상세페이지 편집 {openDetail[r.uid] ? '▴' : '▾'}
                    <span className="ml-1 text-gray-400">
                      리뷰 이미지 {r.reviewImages.length}장
                    </span>
                  </button>
                  {openDetail[r.uid] && (() => {
                    return (
                    <>
                      {/* 상세이미지는 사용하지 않는다(사용자 요청) — 상세페이지 본문은 리뷰이미지로만
                          구성하고, 소싱처 상세컷(로고·배송배너 등 잡컷 섞임)은 등록에도 첨부하지 않는다. */}
                      {/* 리뷰이미지 — 본문 교차 이미지(글 사이에 끼워진다) */}
                      {r.reviewImages.length > 0 && (
                        <>
                          <p className="mt-2 text-[11px] text-emerald-700">
                            리뷰 이미지 {r.reviewImages.length}장 — 상세페이지 본문에서 <b>글 사이에 끼워지는 이미지</b>입니다(리뷰컷 우선).
                          </p>
                          <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
                            {r.reviewImages.map((img) => (
                              <div key={img.name} className="relative flex-none">
                                <img src={img.objectUrl} alt="" loading="lazy"
                                  className="h-16 w-16 object-cover rounded border border-emerald-200 bg-white" />
                                {editable && (
                                  <button type="button" onClick={() => removeReviewImage(r.uid, img.name)}
                                    title="본문에서 제외"
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center">×</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {/* ⭐ 글·이미지 함께 보기 — 실제 등록될 상세페이지 그대로(리뷰컷 교차 포함).
                          예전엔 원문 textarea 가 위에 크게 있어 '**' 만 보이고 이미지는 따로 놀았다.
                          이제 미리보기를 먼저 보여주고, 원문 편집은 아래에서 펼쳐 쓴다. */}
                      {(() => {
                        const paras = (e.detail || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
                        // 본문 교차는 리뷰이미지만.
                        const reviewUrls = r.reviewImages.map((img) => img.objectUrl).filter((u): u is string => !!u);
                        // 상품정보(product_info) — 등록 때 실제로 첨부되는 "상품정보제공고시" 이미지.
                        //   페이지 맨 마지막이 이 상품정보다(대량등록과 동일).
                        // ⚠️ 소싱처 상세컷("상품 상세정보")은 쓰지 않는다 — 배너가 섞여 들어와 사용자가 제외 확정.
                        const infoUrls = (r.scanned.infoImages || []).map((img) => img.objectUrl).filter((u): u is string => !!u);
                        if (paras.length === 0 && reviewUrls.length === 0 && infoUrls.length === 0) return null;
                        const html = buildRichDetailPageHtml({
                          productName: e.displayName || r.scanned.productJson?.name || r.productCode,
                          brand: '',
                          aiStoryParagraphs: paras,
                          // 본문 교차 = 리뷰컷만. 상세이미지는 본문에 넣지 않는다.
                          reviewImageUrls: reviewUrls,
                          detailImageUrls: [],
                          categoryPath: e.categoryPath,
                          // 상품정보제공고시 — 등록 payload 와 동일하게 맨 마지막에.
                          infoImageUrls: infoUrls,
                        }, 'A');
                        return (
                          <div className="mt-2">
                            <p className="text-[11px] text-gray-600 mb-1 font-medium">
                              미리보기 — 등록될 상세페이지(글 + 이미지 교차)
                              {/* 문단 수를 같이 보여준다 — 교차 배치는 min(문단, 이미지) 슬롯으로 정해지므로
                                  "왜 이렇게 나뉘었나"가 이 두 숫자로 바로 설명된다. */}
                              <span className="ml-1 font-normal text-gray-400">
                                글 {paras.length}문단 · 본문 이미지 {reviewUrls.length}장{reviewUrls.length > 0 ? ' (리뷰컷)' : ''}
                                {infoUrls.length > 0 ? ` · 상품정보 ${infoUrls.length}장` : ''}
                              </span>
                            </p>
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ maxHeight: 520, overflowY: 'auto' }}>
                              <iframe
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;}</style></head><body>${html}</body></html>`}
                                title="상세페이지 미리보기"
                                className="w-full border-0"
                                style={{ height: 520 }}
                                sandbox="allow-same-origin"
                              />
                            </div>
                          </div>
                        );
                      })()}
                      {/* 원문(글) 편집 — 미리보기 아래로. 저장하면 위 미리보기가 즉시 갱신된다. */}
                      <div className="mt-2 flex items-center gap-2">
                        {regenBtn}
                        <span className="text-[10px] text-gray-400 leading-snug">
                          마음에 안 들면 다시 씁니다 — 지금 카테고리·노출명 기준(내 PC GPU, 비용 0)
                        </span>
                      </div>
                      <details className="mt-1 group">
                        <summary className="text-[11px] text-gray-500 cursor-pointer select-none">✎ 글 원문 편집</summary>
                        <textarea value={e.detail} disabled={!editable}
                          onChange={(ev) => patchEdit(r.uid, { detail: ev.target.value })}
                          className="mt-1 w-full text-[12px] whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-200 focus:border-blue-300 rounded p-2 h-60 overflow-auto focus:outline-none disabled:bg-gray-100" />
                      </details>
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

      {/* ⚠️ 0건인데 **생성이 실패해서** 0건인 경우가 가장 흔하다. 그때 "생성을 먼저 완료하세요"는
          사실이 아니다 — 사람은 멀쩡히 돌린 작업을 "안 돌렸다"는 말과 함께 돌려받는다.
          도우미가 아는 사유를 그대로 옮긴다. */}
      {rows.length === 0 && !scanning && lastGenFail && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 space-y-1">
          <p className="text-sm font-bold text-red-800">
            마지막 생성이 끝까지 가지 못했습니다 — 그래서 카드가 0건입니다.
          </p>
          <p className="text-sm text-red-700 leading-snug break-words">{lastGenFail}</p>
          <p className="text-[11px] text-red-600 leading-snug">
            가져오기(폴더 만들기)는 됐을 수 있습니다 — 원인을 고친 뒤 도우미의 <b>올인원 생성</b>에서
            같은 폴더를 다시 돌리면 처음부터 받을 필요가 없습니다.
          </p>
        </div>
      )}

      {rows.length === 0 && !scanning && (
        <div className="text-center text-sm text-gray-400 py-16 border-2 border-dashed border-gray-200 rounded-xl">
          {helperDiag?.ok
            ? '위 “도우미 결과 불러오기”를 누르면 폴더 선택 없이 카드가 채워집니다.'
            : '먼저 데스크탑 메가로드 도우미 → ⚙️ 올인원 생성으로 폴더를 처리하세요. 그다음 여기서 “도우미 결과 불러오기”(또는 소싱 폴더 선택)로 불러옵니다.'}
        </div>
      )}
    </div>
  );
}
