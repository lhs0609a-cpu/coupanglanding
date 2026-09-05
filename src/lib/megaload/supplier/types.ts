/**
 * 공급사 셀프 카탈로그 도메인 타입 — migration_supplier_catalog.sql 스키마와 1:1.
 */

export type SupplierStatus = 'pending' | 'approved' | 'suspended';
export type SupplierBillingStatus = 'no_card' | 'active' | 'failed' | 'suspended';
export type CommissionBase = 'retail' | 'supply';

export type CatalogProductStatus =
  | 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'discontinued';

export type CatalogListingStatus =
  | 'registering' | 'active' | 'suspended' | 'failed' | 'deleted';

export type SalesAttributionStatus = 'pending' | 'confirmed' | 'returned' | 'cancelled';
export type SupplierSettlementStatus = 'pending' | 'awaiting_payment' | 'paid' | 'failed' | 'skipped';

export type CatalogChannel = 'coupang' | 'naver' | 'elevenst' | 'gmarket' | 'auction' | 'lotteon';

/** 드롭십 배송/반품/AS 프로필 (공급사 발송 기준) */
export interface ShippingProfile {
  courier?: string;                    // 택배사 코드
  deliveryChargeType?: 'FREE' | 'NOT_FREE' | 'CONDITIONAL_FREE';
  deliveryCharge?: number;
  freeShipOverAmount?: number;
  returnCharge?: number;
  exchangeCharge?: number;
  returnAddress?: string;
  returnZipCode?: string;
  afterServiceTel?: string;
  afterServiceGuide?: string;
  originCode?: string;
}

export interface Supplier {
  id: string;
  owner_profile_id: string;
  company_name: string;
  brand_name: string | null;
  business_number: string | null;
  business_verified: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  logo_public_consent: boolean;
  commission_rate: number;
  commission_base: CommissionBase;
  billing_key: string | null;
  card_company: string | null;
  card_number: string | null;
  card_registered_at: string | null;
  billing_status: SupplierBillingStatus;
  status: SupplierStatus;
  // 공급사 회원가입 검증/심사 (migration_supplier_signup.sql)
  representative_name: string | null;
  homepage_url: string | null;
  mall_url: string | null;
  business_license_path: string | null;
  manufacturer_doc_paths: string[];
  applicant_note: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  // 기본 배송/반품/A/S 프로필 (migration_supplier_default_shipping.sql) — 상품 등록 시 자동 상속
  default_shipping_profile?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogProduct {
  id: string;
  supplier_id: string;
  category_code: string | null;
  category_path: string | null;
  seller_product_name: string;
  display_product_name: string | null;
  brand: string | null;
  manufacturer: string | null;
  origin: string | null;
  search_tags: string[];
  thumbnail_url: string | null;
  image_urls: string[];
  detail_html: string | null;
  notices: Record<string, unknown>;
  attributes: Record<string, unknown>;
  certifications: unknown[];
  min_price: number;
  max_price: number;
  shipping_profile: ShippingProfile;
  preflight_report: Record<string, unknown> | null;
  rejection_reason: string | null;
  status: CatalogProductStatus;
  created_at: string;
  updated_at: string;
}

export interface CatalogProductOption {
  id: string;
  catalog_product_id: string;
  option_name: string;
  supply_price: number;
  stock: number;
  stock_buffer: number;
  sku: string | null;
  barcode: string | null;
  purchase_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogListing {
  id: string;
  catalog_product_id: string;
  seller_megaload_user_id: string;
  channel: CatalogChannel;
  channel_product_id: string | null;
  vendor_item_id: string | null;
  sku_tag: string | null;
  retail_price: number;
  display_name: string | null;
  allocated_stock: number | null;
  status: CatalogListingStatus;
  error_message: string | null;
  registered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesAttribution {
  id: string;
  supplier_id: string;
  catalog_product_id: string;
  catalog_option_id: string | null;
  listing_id: string | null;
  seller_megaload_user_id: string;
  channel: CatalogChannel;
  order_id: string;
  vendor_item_id: string | null;
  quantity: number;
  supply_amount: number;
  retail_amount: number;
  sold_at: string;
  delivered_at: string | null;
  confirm_at: string | null;
  status: SalesAttributionStatus;
  settlement_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierSettlement {
  id: string;
  supplier_id: string;
  year_month: string;
  gmv_confirmed: number;
  commission_rate: number;
  commission_amount: number;
  clawback_amount: number;
  net_amount: number;
  payment_status: SupplierSettlementStatus;
  toss_payment_key: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 상품 등록에 필요한 자격 게이트 결과 */
export interface SupplierUploadGate {
  canUpload: boolean;
  reason: string | null;   // 막힌 이유 (카드 미등록 / 미승인 등)
}
