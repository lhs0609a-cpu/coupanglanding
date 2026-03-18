import type { ScannedImageFile } from '@/lib/sellerhub/services/client-folder-scanner';
import type {
  ValidationStatus,
  ValidationIssue,
  CategoryMetadata,
} from '@/lib/sellerhub/services/product-validator';

export interface PriceBracket {
  minPrice: number;
  maxPrice: number | null;
  marginRate: number;
}

export interface PreviewProduct {
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
  validationStatus?: ValidationStatus;
  validationErrors?: ValidationIssue[];
  validationWarnings?: ValidationIssue[];
  status: 'pending' | 'registering' | 'success' | 'error';
  channelProductId?: string;
  errorMessage?: string;
  duration?: number;
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
  duration?: number;
}

export type FilterMode = 'all' | 'problems' | 'no-category' | 'no-image';
export type SortField = 'name' | 'price' | 'confidence' | null;
export type SortDirection = 'asc' | 'desc';

export type { ValidationStatus, ValidationIssue, CategoryMetadata, ScannedImageFile };
