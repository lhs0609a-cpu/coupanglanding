import type { DetailedError, ErrorCategory } from '@/components/megaload/bulk/types';
import { isPlaceholderOptionValue } from './buy-option-value';

interface ErrorPattern {
  patterns: RegExp[];
  category: ErrorCategory;
  field?: string;
  /** 함수면 원문 에러에서 구체적인 항목명을 뽑아 안내한다 */
  suggestion: string | ((message: string) => string);
}

/**
 * 쿠팡 구매옵션 에러 원문에서 "문제가 된 옵션명"만 뽑는다.
 *   유효하지 않은 구매 옵션 값이 존재합니다.
 *   [attrs=사료/간식 주원료="상세페이지 참조", 개당 중량="500g", 수량="1개"|category=110824]
 * → ["사료/간식 주원료"] (참조형 문구가 들어간 것만)
 */
function pickBadBuyOptionNames(message: string): string[] {
  const block = message.match(/attrs=([^|\]]+)/)?.[1];
  if (!block) return [];
  const bad: string[] = [];
  const pairRe = /([^,=]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(block)) !== null) {
    const name = m[1].trim();
    if (name && isPlaceholderOptionValue(m[2])) bad.push(name);
  }
  return bad;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: [/이미 등록된/, /duplicate/i, /already\s+exist/i],
    category: 'duplicate',
    suggestion: '상품 관리에서 확인하거나 선택 해제 후 다시 등록하세요.',
  },
  {
    patterns: [/판매가.*유효하지 않/, /최소 100원/, /1억원/, /sellingPrice/i],
    category: 'price',
    field: 'sellingPrice',
    suggestion: '판매가를 확인해주세요. (100원 ~ 1억원)',
  },
  {
    patterns: [/카테고리.*유효하지 않/, /categoryCode/i, /displayCategoryCode/i, /INVALID.*category/i],
    category: 'category',
    field: 'displayCategoryCode',
    suggestion: 'Step 2에서 카테고리를 다시 선택해주세요.',
  },
  {
    patterns: [/신뢰도\s*부족/, /confidence/i],
    category: 'category',
    field: 'categoryConfidence',
    suggestion: '카테고리 매칭 신뢰도가 낮습니다. 수동으로 카테고리를 지정해주세요.',
  },
  {
    patterns: [/대표이미지/, /image/i, /업로드 실패/, /mainImage/i],
    category: 'image',
    field: 'images',
    suggestion: '이미지 파일을 확인해주세요. 대표이미지가 최소 1장 필요합니다.',
  },
  {
    patterns: [/상표권/, /브랜드.*차단/, /brand.*protect/i, /blocked.*brand/i],
    category: 'brand',
    field: 'brand',
    suggestion: '브랜드 관련 상표권 문제입니다. 상품명과 브랜드를 확인해주세요.',
  },
  {
    patterns: [/출고지/, /반품지/, /배송/, /shipping/i, /outbound/i, /returnCenter/i],
    category: 'shipping',
    suggestion: 'Step 1 배송 설정을 확인해주세요.',
  },
  {
    patterns: [/timeout/i, /ECONNRESET/i, /socket hang up/i, /\b502\b/, /\b503\b/, /네트워크/],
    category: 'network',
    suggestion: '네트워크 오류입니다. 잠시 후 재시도해주세요.',
  },
  {
    // WING 로그인 ID(vendorUserId) 누락·오입력 — 가장 흔한 "원인 모를 등록 실패".
    //   쿠팡 원문: 'vendorUserId' 값을 확인해 주세요
    //   업체코드(vendorId)와 다른 값이라 사용자가 안 넣고 지나가기 쉽다. 이 규칙이 없으면
    //   아래 auth 규칙에도 안 걸려 "기타" 로 뭉개진다(2026-10-13 실측).
    patterns: [/vendorUserId/i, /WING\s*로그인\s*ID/],
    category: 'auth',
    field: 'vendorUserId',
    suggestion: 'WING 로그인 ID가 비어 있거나 잘못됐습니다. 설정 → "쿠팡 셀러 ID"(= WING 로그인 ID) 칸에 wing.coupang.com 로그인할 때 쓰는 ID를 입력하고 저장한 뒤 다시 등록해주세요. 업체코드(A로 시작)와는 다른 값입니다.',
  },
  {
    patterns: [/Unauthorized/i, /인증/, /accessKey/i, /401/, /API.*키.*등록/],
    category: 'auth',
    suggestion: '채널관리 페이지에서 쿠팡 API 키(Vendor ID, Access Key, Secret Key)를 입력해주세요. wing.coupang.com → 판매자정보 → API Key 관리에서 발급할 수 있습니다.',
  },
  {
    patterns: [/고시/, /notice/i, /noticeCategoryName/i],
    category: 'notice',
    suggestion: '고시정보 설정을 확인해주세요.',
  },
  {
    // 쿠팡은 구매옵션 값을 구매자에게 보이는 "옵션명"으로 쓰므로 참조형 문구·빈값을 거부한다.
    //   예: 유효하지 않은 구매 옵션 값이 존재합니다. [attrs=사료/간식 주원료="상세페이지 참조", ...]
    patterns: [/구매\s*옵션\s*값/, /구매\s*옵션.*유효하지\s*않/, /필수\s*구매옵션\s*값을/],
    category: 'attribute',
    field: 'attributes',
    suggestion: (message) => {
      const bad = pickBadBuyOptionNames(message);
      const target = bad.length > 0 ? `구매옵션 "${bad.join('", "')}"` : '해당 구매옵션';
      return `검증 단계로 돌아가 ${target} 에 실제 값을 입력해주세요. `
        + '쿠팡은 구매옵션 값을 구매자에게 보이는 옵션명으로 쓰기 때문에 "상세페이지 참조" 같은 참조 문구를 받지 않습니다.';
    },
  },
  {
    patterns: [/속성/, /attribute/i],
    category: 'attribute',
    suggestion: '카테고리 속성을 확인해주세요.',
  },
];

/** Raw error string → structured DetailedError */
export function classifyError(
  message: string,
  step?: string,
  rawResponse?: string,
): DetailedError {
  // Try to extract error code from message (e.g., "INVALID_PARAMETER: ...")
  const codeMatch = message.match(/^([A-Z_]+)[\s:]/);
  const code = codeMatch?.[1];

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.patterns.some((re) => re.test(message))) {
      return {
        message,
        code,
        category: pattern.category,
        field: pattern.field,
        step,
        suggestion: typeof pattern.suggestion === 'function' ? pattern.suggestion(message) : pattern.suggestion,
        rawResponse,
      };
    }
  }

  return {
    message,
    code,
    category: 'unknown',
    step,
    suggestion: '관리자에게 문의하세요.',
    rawResponse,
  };
}

/** Aggregate errors by category → { category: count } */
export function categorizeErrors(
  errors: DetailedError[],
): Record<ErrorCategory, number> {
  const counts = {} as Record<ErrorCategory, number>;
  for (const err of errors) {
    counts[err.category] = (counts[err.category] || 0) + 1;
  }
  return counts;
}
