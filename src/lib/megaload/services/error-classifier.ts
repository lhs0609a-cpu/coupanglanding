import type { DetailedError, ErrorCategory } from '@/components/megaload/bulk/types';

interface ErrorPattern {
  patterns: RegExp[];
  category: ErrorCategory;
  field?: string;
  suggestion: string;
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
        suggestion: pattern.suggestion,
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
