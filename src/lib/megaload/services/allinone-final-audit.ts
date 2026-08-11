/**
 * 올인원 "등록 직전 AI 최종점검" — 순수 규칙 스캔 + 자동수정 계산.
 * ---------------------------------------------------------------------------
 * 검수를 건너뛰고 올리는 경로에서, 사람 대신 마지막으로 전 필드를 훑는 계층이다.
 *
 * 2단계로 나눈 이유:
 *   Stage A(여기)  — 규칙으로 즉시 판정·수정. 브라우저에서 도는 순수 함수라 비용 0·지연 0.
 *   Stage B(호출부) — 여기서 `regens` 로 표시한 것만 로컬 GPU(megaload_llm_jobs)로 재생성.
 *                     LLM 은 느리고 GPU 를 잡으므로 **문제 있는 필드만** 보내는 게 핵심이다.
 *
 * severity 의 뜻:
 *   'blocker' — 쿠팡이 거절하거나 올리면 안 되는 상태. 자동수정도 재생성도 못 하면 등록 제외.
 *   'fix'     — 이 함수가 patch 로 고쳐 놓음(호출부가 적용하면 해소).
 *   'warn'    — 등록은 되지만 사용자가 알아야 하는 것. 막지 않는다.
 *
 * ⚠️ 이미지 자동수정은 여기서 하지 않는다 — 대표컷 선택은 호출부의 Row 상태(selectedMainIdx,
 *    mainImages 배열)를 만져야 하고, '잘림' 판별은 과거 4가지 방법이 전부 실측 실패했다.
 *    여기서는 **구조적으로 확실한 것만**(0장·리뷰컷이 대표·워커 경고) 짚어 준다.
 */
import { checkCompliance } from './compliance-filter';
import { calculateSellingPrice } from './margin-pricing';

export type AuditField = 'displayName' | 'category' | 'detail' | 'options' | 'price' | 'images';
export type AuditSeverity = 'blocker' | 'fix' | 'warn';
/** 로컬 도우미 llm-pull-loop 가 처리하는 taskType 과 1:1 */
export type RegenTask = 'display_name' | 'content' | 'options' | 'category';

export interface AuditFinding {
  field: AuditField;
  severity: AuditSeverity;
  /** 로그·집계용 안정 키 */
  code: string;
  message: string;
  /** 지정되면 이 필드는 로컬 LLM 재생성으로만 고칠 수 있다 */
  regen?: RegenTask;
}

export interface AuditInput {
  uid: string;
  displayName: string;
  categoryCode: string;
  categoryPath: string;
  detail: string;
  options: { name: string; value: string; unit?: string }[];
  sellingPrice: number | null;
  sourcePrice: number | null;
  originalName: string;
  /** 워커가 처음 정한 카테고리 경로. 지금 값과 다르면 상세글이 옛 카테고리 어휘로 남아 있다. */
  genCategoryPath: string;
  /** option-preview 가 "직접 입력 필요"로 표시했는데 아직 placeholder 그대로인 옵션명 */
  unresolvedOptions: string[];
  mainImageCount: number;
  /** 선택된 대표컷이 review_images/ 폴더 사진인지 */
  mainPickedFromReview: boolean;
  /** run-folder 가 남긴 대표컷 경고(후보가 전부 로고/저품질 등) */
  mainImageWarning?: string;
  detailImageCount: number;
  reviewImageCount: number;
}

/** 호출부가 그대로 edit 에 반영하면 되는 자동수정값. 없는 키는 수정 없음. */
export interface AuditPatch {
  displayName?: string;
  detail?: string;
  sellingPrice?: number;
}

export interface AuditResult {
  uid: string;
  findings: AuditFinding[];
  patch: AuditPatch;
  /** 로컬 LLM 재생성이 필요한 taskType(중복 제거) */
  regens: RegenTask[];
  /** 자동수정·재생성으로도 못 살리는 상태 — 호출부가 등록에서 뺀다 */
  blocked: boolean;
}

/** 쿠팡 노출상품명 한도. */
const NAME_MAX = 100;
/** 이보다 짧은 상세글은 SEO·전환 모두에서 사실상 빈 글로 본다(생성 실패 신호). */
const DETAIL_MIN = 200;
/** 판매가가 원가의 이 배수를 넘으면 자릿수 실수 의심. */
const PRICE_SANE_MULT = 12;

/** 마크다운 강조기호 제거 — 편집창·타 채널에서 별표가 날것으로 보인다. */
function stripEmphasis(s: string): string {
  return String(s || '')
    .replace(/\*\*([^\n]*?)\*\*/g, '$1')
    .replace(/__([^\n]*?)__/g, '$1')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/\*/g, '');
}

/** 연속 공백·앞뒤 공백 정리(줄바꿈은 보존). */
function tidyInline(s: string): string {
  return String(s || '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * leaf 가 "혼합곡/기타곡류" 처럼 슬래시 나열일 때, 그 분류 라벨이 본문에 그대로 박혔는지.
 * 전체 leaf 의 18%(2,982/16,259)가 슬래시 나열이라 생성기가 라벨을 문장에 끼워 넣던 실측 결함.
 */
function hasSlashLabelLeak(detail: string, categoryPath: string): boolean {
  const leaf = (categoryPath || '').split('>').pop()?.trim() || '';
  if (!leaf.includes('/') || leaf.length < 4) return false;
  return detail.includes(leaf);
}

/** 생성기가 지시문·메타 문장을 그대로 뱉은 흔적. */
const META_LEAK_RE = /(상세\s*페이지\s*(카피|문구|초안)|다음은[^\n]{0,20}(입니다|드립니다)\s*[:：]|아래와\s*같습니다\s*[:：]|^\s*(제목|본문|출력)\s*[:：])/m;

/** "옵션1", "옵션 2", "1", "-" 처럼 무엇을 고르는지 알 수 없는 **옵션명**. */
function isMeaninglessOptionName(s: string): boolean {
  const t = String(s || '').trim();
  if (!t) return true;
  if (/^옵션\s*\d*$/.test(t)) return true;
  if (/^[-–—.]+$/.test(t)) return true;
  if (/^\d+$/.test(t)) return true;   // 이름이 그냥 숫자면 의미 없음
  return false;
}

/**
 * 값이 비었거나 기호뿐인지.
 * ⚠️ **숫자만 있는 값은 정상이다** — 이 시스템은 값과 단위를 분리해 들고 있어서
 *    `용량 = 500 / ml`, `수량 = 2 / 개` 가 가장 흔한 정상 형태다. 숫자를 의미없음으로
 *    보면 정상 상품 전량이 옵션 재생성 큐로 들어간다(회귀 하니스에서 실제로 잡힌 오판).
 */
function isMeaninglessOptionValue(value: string, unit?: string): boolean {
  const t = `${String(value || '').trim()}${String(unit || '').trim()}`;
  if (!t) return true;
  if (/^[-–—.]+$/.test(t)) return true;
  return false;
}

/**
 * 상품 1건을 전 필드 스캔한다. 순수 함수 — 입력을 변형하지 않고 patch 로만 돌려준다.
 */
export function auditProduct(input: AuditInput): AuditResult {
  const findings: AuditFinding[] = [];
  const patch: AuditPatch = {};
  const regens = new Set<RegenTask>();
  let blocked = false;

  const add = (f: AuditFinding) => { findings.push(f); if (f.regen) regens.add(f.regen); };

  // ── ① 노출상품명 ───────────────────────────────────────────────
  {
    const before = input.displayName || '';
    let name = tidyInline(stripEmphasis(before));
    if (name !== tidyInline(before)) {
      add({ field: 'displayName', severity: 'fix', code: 'name_markdown', message: '상품명의 마크다운 기호(**)를 제거했습니다.' });
    }
    const comp = checkCompliance(name, { removeErrors: true, categoryContext: input.categoryPath });
    if (comp.cleanedText !== name) {
      const words = comp.violations.slice(0, 3).map((v) => v.label).filter(Boolean).join(', ');
      add({
        field: 'displayName', severity: 'fix', code: 'name_forbidden',
        message: `상품명에서 계정 리스크 어휘를 제거했습니다${words ? ` (${words})` : ''}.`,
      });
      name = tidyInline(comp.cleanedText);
    }
    if (name.length > NAME_MAX) {
      name = name.slice(0, NAME_MAX).trim();
      add({ field: 'displayName', severity: 'fix', code: 'name_too_long', message: `상품명이 ${NAME_MAX}자를 넘어 잘랐습니다.` });
    }
    if (!name) {
      add({ field: 'displayName', severity: 'blocker', code: 'name_empty', message: '상품명이 비어 있습니다. 다시 생성합니다.', regen: 'display_name' });
    } else if (name === tidyInline(input.originalName)) {
      add({ field: 'displayName', severity: 'warn', code: 'name_is_source', message: '상품명이 소싱 원본명 그대로입니다(SEO 미적용).' });
    }
    if (name !== before) patch.displayName = name;
  }

  // ── ② 카테고리 ────────────────────────────────────────────────
  {
    const code = String(input.categoryCode || '').trim();
    if (!/^\d+$/.test(code)) {
      add({ field: 'category', severity: 'blocker', code: 'cat_missing', message: '카테고리 코드가 없거나 숫자가 아닙니다. 다시 매칭합니다.', regen: 'category' });
    }
    if (!input.categoryPath.trim()) {
      add({ field: 'category', severity: 'warn', code: 'cat_path_empty', message: '카테고리 경로가 비어 있어 상세글 어휘 검증을 건너뜁니다.' });
    }
    // 카테고리를 바꿨으면 상세글은 옛 카테고리 어휘로 쓰여 있다 — 본문을 다시 써야 한다.
    if (input.genCategoryPath && input.categoryPath && input.genCategoryPath !== input.categoryPath) {
      add({
        field: 'detail', severity: 'blocker', code: 'detail_stale_category',
        message: '카테고리가 생성 시점과 달라 상세글 어휘가 어긋납니다. 본문을 다시 씁니다.', regen: 'content',
      });
    }
  }

  // ── ③ 상세글 ──────────────────────────────────────────────────
  {
    const before = input.detail || '';
    let detail = stripEmphasis(before);
    if (detail !== before) {
      add({ field: 'detail', severity: 'fix', code: 'detail_markdown', message: '상세글의 마크다운 기호(**)를 제거했습니다.' });
    }
    const comp = checkCompliance(detail, { removeErrors: true, categoryContext: input.categoryPath });
    if (comp.cleanedText !== detail) {
      const words = comp.violations.slice(0, 3).map((v) => v.label).filter(Boolean).join(', ');
      add({
        field: 'detail', severity: 'fix', code: 'detail_forbidden',
        message: `상세글에서 표시광고 위반 어휘를 제거했습니다${words ? ` (${words})` : ''}.`,
      });
      detail = comp.cleanedText;
    }
    const plain = detail.replace(/\s/g, '');
    if (plain.length === 0) {
      add({ field: 'detail', severity: 'blocker', code: 'detail_empty', message: '상세글이 비어 있습니다. 다시 씁니다.', regen: 'content' });
    } else if (plain.length < DETAIL_MIN) {
      add({ field: 'detail', severity: 'blocker', code: 'detail_too_short', message: `상세글이 ${plain.length}자로 너무 짧습니다(최소 ${DETAIL_MIN}자). 다시 씁니다.`, regen: 'content' });
    }
    if (hasSlashLabelLeak(detail, input.categoryPath)) {
      add({ field: 'detail', severity: 'blocker', code: 'detail_slash_label', message: '분류 라벨(슬래시 나열)이 본문에 그대로 들어갔습니다. 다시 씁니다.', regen: 'content' });
    }
    if (META_LEAK_RE.test(detail)) {
      add({ field: 'detail', severity: 'blocker', code: 'detail_meta_leak', message: '생성 지시문이 본문에 섞였습니다. 다시 씁니다.', regen: 'content' });
    }
    if (detail !== before) patch.detail = detail;
  }

  // ── ④ 옵션 ────────────────────────────────────────────────────
  {
    if (input.unresolvedOptions.length > 0) {
      add({
        field: 'options', severity: 'blocker', code: 'opt_unresolved',
        message: `필수 옵션 ${input.unresolvedOptions.join(', ')} 이(가) 자동 기본값 그대로입니다. 원본명에서 다시 뽑습니다.`,
        regen: 'options',
      });
    }
    const bad = input.options.filter((o) => isMeaninglessOptionName(o.name) || isMeaninglessOptionValue(o.value, o.unit));
    if (bad.length > 0) {
      add({
        field: 'options', severity: 'blocker', code: 'opt_meaningless',
        message: `의미 없는 옵션명/값 ${bad.length}건(예: ${bad[0].name || '이름없음'}=${bad[0].value || '값없음'}). 다시 뽑습니다.`,
        regen: 'options',
      });
    }
    if (input.options.length === 0 && input.unresolvedOptions.length === 0) {
      add({ field: 'options', severity: 'warn', code: 'opt_none', message: '구매옵션이 없습니다(단일 상품이면 정상).' });
    }
  }

  // ── ⑤ 가격 ────────────────────────────────────────────────────
  {
    const src = input.sourcePrice && input.sourcePrice > 0 ? input.sourcePrice : null;
    let price = input.sellingPrice;
    if (price == null || price < 100) {
      if (src) {
        price = calculateSellingPrice(src);
        add({ field: 'price', severity: 'fix', code: 'price_recomputed', message: `판매가가 없어 원가 ${src.toLocaleString()}원 기준 마진표로 ${price.toLocaleString()}원으로 계산했습니다.` });
      } else {
        add({ field: 'price', severity: 'blocker', code: 'price_missing', message: '판매가와 원가가 모두 없어 가격을 정할 수 없습니다.' });
        blocked = true;
      }
    }
    if (price != null && price >= 100) {
      if (src && price <= src) {
        const fixed = calculateSellingPrice(src);
        add({ field: 'price', severity: 'fix', code: 'price_below_cost', message: `판매가(${price.toLocaleString()}원)가 원가 이하라 ${fixed.toLocaleString()}원으로 올렸습니다.` });
        price = fixed;
      }
      if (price % 10 !== 0) {
        const fixed = Math.round(price / 10) * 10;
        add({ field: 'price', severity: 'fix', code: 'price_round10', message: `판매가를 10원 단위(${fixed.toLocaleString()}원)로 맞췄습니다.` });
        price = fixed;
      }
      if (src && price > src * PRICE_SANE_MULT) {
        add({ field: 'price', severity: 'warn', code: 'price_outlier', message: `판매가가 원가의 ${(price / src).toFixed(1)}배입니다 — 자릿수를 확인하세요.` });
      }
    }
    if (price != null && price !== input.sellingPrice) patch.sellingPrice = price;
  }

  // ── ⑥ 이미지(구조적 검사만) ──────────────────────────────────
  {
    if (input.mainImageCount === 0) {
      add({ field: 'images', severity: 'blocker', code: 'img_no_main', message: '대표이미지 후보가 0장입니다 — 등록할 수 없습니다.' });
      blocked = true;
    }
    // ⚠️ 자동으로 바꾸지 않는다. 리뷰 실사는 업체 상업컷보다 지재권 위험이 낮아 서브 9장을
    //    채우는 데 이미 1순위로 쓰기로 확정된 소재다(2026-07-31). "리뷰컷=잘못"이 아니므로
    //    사실만 알리고 판단은 사용자에게 남긴다.
    if (input.mainPickedFromReview) {
      add({ field: 'images', severity: 'warn', code: 'img_main_from_review', message: '대표컷이 리뷰(구매자) 사진입니다 — 지재권상 안전하지만 화질을 확인하세요.' });
    }
    if (input.mainImageWarning) {
      add({ field: 'images', severity: 'warn', code: 'img_main_warning', message: `대표컷 경고: ${input.mainImageWarning}` });
    }
    if (input.detailImageCount === 0 && input.reviewImageCount === 0) {
      add({ field: 'images', severity: 'warn', code: 'img_no_body', message: '상세 본문에 넣을 이미지(상세·리뷰)가 없습니다 — 글만 노출됩니다.' });
    }
  }

  // 재생성으로 고칠 수 없는 blocker 가 남아 있으면 등록 제외.
  if (findings.some((f) => f.severity === 'blocker' && !f.regen)) blocked = true;

  return { uid: input.uid, findings, patch, regens: [...regens], blocked };
}

/** 여러 건 요약 — 진행 패널/리포트용. */
export function summarizeAudits(results: AuditResult[]) {
  let fixed = 0, warned = 0, blockedCount = 0;
  const regenByTask = new Map<RegenTask, number>();
  for (const r of results) {
    fixed += r.findings.filter((f) => f.severity === 'fix').length;
    warned += r.findings.filter((f) => f.severity === 'warn').length;
    if (r.blocked) blockedCount += 1;
    for (const t of r.regens) regenByTask.set(t, (regenByTask.get(t) || 0) + 1);
  }
  return {
    total: results.length,
    fixed,
    warned,
    blocked: blockedCount,
    needRegen: results.filter((r) => r.regens.length > 0).length,
    regenByTask: [...regenByTask.entries()].map(([task, count]) => ({ task, count })),
  };
}
