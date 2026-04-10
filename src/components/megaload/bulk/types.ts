import type { ScannedImageFile } from '@/lib/megaload/services/client-folder-scanner';
import type {
  ValidationStatus,
  ValidationIssue,
  CategoryMetadata,
} from '@/lib/megaload/services/product-validator';
import type { ImageType } from '@/lib/megaload/services/image-quality-scorer';

export type { ImageType };

export interface PriceBracket {
  minPrice: number;
  maxPrice: number | null;
  marginRate: number;
}

export interface PreviewProduct {
  productCode: string;
  /** product_summary.txt에서 추출한 원본 상품 URL */
  sourceUrl?: string;
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
  /** 네이버 소싱 카테고리 ID (product.json에서 읽음) */
  naverCategoryId?: string;
}

export interface EditableProduct extends PreviewProduct {
  uid: string;
  editedName: string;
  editedBrand: string;
  editedSellingPrice: number;
  editedCategoryCode: string;
  editedCategoryName: string;
  categoryConfidence: number;
  categorySource: string;
  selected: boolean;
  scannedMainImages?: ScannedImageFile[];
  scannedDetailImages?: ScannedImageFile[];
  scannedInfoImages?: ScannedImageFile[];
  scannedReviewImages?: ScannedImageFile[];
  /** product_* 디렉토리 핸들 (main_images 리스캔용) */
  productDirHandle?: FileSystemDirectoryHandle;
  validationStatus?: ValidationStatus;
  validationErrors?: ValidationIssue[];
  validationWarnings?: ValidationIssue[];
  status: 'pending' | 'registering' | 'success' | 'error';
  channelProductId?: string;
  errorMessage?: string;
  detailedError?: DetailedError;
  duration?: number;
  // 쿠팡 API 필드 오버라이드
  editedDisplayProductName?: string;
  editedSellerProductName?: string;
  editedManufacturer?: string;
  editedOriginalPrice?: number;
  editedItemName?: string;
  editedUnitCount?: number;
  editedStock?: number;
  editedMaxBuyPerPerson?: number;
  editedShippingDays?: number;
  editedTaxType?: 'TAX' | 'FREE' | 'ZERO';
  editedAdultOnly?: 'EVERYONE' | 'ADULT_ONLY';
  editedBarcode?: string;
  editedParallelImported?: 'NOT_PARALLEL_IMPORTED' | 'PARALLEL_IMPORTED';
  editedOverseasPurchased?: 'NOT_OVERSEAS_PURCHASED' | 'OVERSEAS_PURCHASED';
  editedNoticeValues?: Record<string, string>;
  editedAttributeValues?: Record<string, string>;
  // 상세페이지 콘텐츠 오버라이드
  editedDescription?: string;
  editedStoryParagraphs?: string[];
  editedReviewTexts?: string[];
  editedContentBlocks?: import('@/lib/megaload/services/persuasion-engine').ContentBlock[];
  // 상세페이지 이미지 선택/순서 (undefined=전체, [2,0,5]=해당 인덱스만 지정 순서)
  editedDetailImageOrder?: number[];
  editedReviewImageOrder?: number[];
  // 다양성 기반 이미지 선택 메타
  detailImageSelectionMeta?: ImageSelectionMeta;
  reviewImageSelectionMeta?: ImageSelectionMeta;
  // 스톡 이미지
  stockMainImageUrls?: string[];
  stockCategoryKey?: string; // 'apple' — runStockImageFetch에서 설정
  useStockImages?: boolean;
  originalScannedMainImages?: ScannedImageFile[];
}

export interface ImageSelectionMeta {
  /** 다양성 점수 0~100 */
  diversityScore: number;
  /** 선택된 이미지의 유형 목록 */
  imageTypes: ImageType[];
  /** 클러스터 수 */
  clusterCount: number;
  /** 워터마크 감지된 이미지 인덱스와 점수 */
  watermarkScores?: { index: number; score: number }[];
  /** 상품 관련성 점수 (원본 인덱스 매핑) */
  relevanceScores?: { index: number; score: number }[];
}

export interface ShippingPlace {
  outboundShippingPlaceCode: string;
  placeName: string;
  placeAddresses: string;
}

export interface ReturnCenter {
  returnCenterCode: string;
  shippingPlaceName: string;
  deliverCode: string;
  returnAddress: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  path: string;
}

export interface CategoryMatchResult {
  index: number;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  confidence: number;
  source: string;
}

export interface BatchResult {
  uid?: string;
  productCode: string;
  name: string;
  success: boolean;
  channelProductId?: string;
  error?: string;
  detailedError?: DetailedError;
  duration?: number;
}

export type ErrorCategory =
  | 'auth' | 'category' | 'image' | 'price' | 'shipping'
  | 'notice' | 'attribute' | 'brand' | 'duplicate'
  | 'validation' | 'network' | 'unknown';

export interface DetailedError {
  message: string;
  code?: string;
  category: ErrorCategory;
  field?: string;
  step?: string;
  suggestion: string;
  rawResponse?: string;
}

export type FilterMode = 'all' | 'problems' | 'no-category' | 'no-image' | 'skipped' | 'sold-out' | 'image-review';
export type SortField = 'name' | 'price' | 'confidence' | null;
export type SortDirection = 'asc' | 'desc';

export type { ValidationStatus, ValidationIssue, CategoryMetadata, ScannedImageFile };
export type { FailureDiagnostic } from '@/lib/megaload/services/category-matcher';
export type { PreventionConfig } from '@/lib/megaload/services/item-winner-prevention';
