// ============================================================
// Megaload 전체 타입 정의
// ============================================================

// --- Enums ---

export type Channel = 'coupang' | 'naver' | 'elevenst' | 'gmarket' | 'auction' | 'lotteon' | 'toss' | 'kakao';

/** 실제 API 연동 여부 — 토스/카카오는 공식 셀러 API 미공개로 준비 중 */
export const UNSUPPORTED_CHANNELS = ['toss', 'kakao'] as const;
export type UnsupportedChannel = typeof UNSUPPORTED_CHANNELS[number];
export function isChannelSupported(channel: Channel): boolean {
  return !(UNSUPPORTED_CHANNELS as readonly string[]).includes(channel);
}
export type SourcingPlatform = 'aliexpress' | 'ali1688';
export type Plan = 'free' | 'standard' | 'professional';

export type ChannelStatus = 'not_registered' | 'pending' | 'active' | 'suspended' | 'failed' | 'deleted';
export type ProductStatus = 'active' | 'suspended' | 'deleted';

export type OrderStatus =
  | 'payment_done' | 'order_confirmed' | 'shipping_ready' | 'shipping' | 'delivered'
  | 'cancel_requested' | 'cancelled' | 'return_requested' | 'returned'
  | 'exchange_requested' | 'exchanged';

export type InventoryChangeType = 'SALE' | 'CANCEL' | 'RETURN' | 'MANUAL' | 'SYNC' | 'RESERVE' | 'RELEASE';

export type TriggerType = 'SCHEDULE' | 'ORDER_STATUS' | 'INVENTORY_LEVEL' | 'API_KEY_EXPIRY';
export type ActionType = 'CONFIRM_ORDER' | 'SEND_INVOICE' | 'SUSPEND_PRODUCT' | 'RESUME_PRODUCT' | 'ADJUST_PRICE' | 'SYNC_INVENTORY' | 'NOTIFY';

export type CreditType = 'ai' | 'sms' | 'kakao' | 'email';
export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type NotificationType = 'info' | 'warning' | 'error' | 'success';
export type InquiryStatus = 'pending' | 'replied' | 'resolved';
export type SellType = 'dropshipping' | 'wholesale';
export type SourcingOrderStatus = 'pending' | 'ordered' | 'shipped' | 'domestic_received' | 'completed' | 'cancelled' | 'failed';
export type BrandCheckResult = 'safe' | 'warning' | 'blocked';
export type GiftConditionType = 'product' | 'category' | 'amount' | 'channel' | 'all';
export type TagType = 'system' | 'custom';
export type ImageType = 'main' | 'detail' | 'option' | 'description';
export type HeaderType = 'header' | 'footer';
export type ScheduleActionType = 'start_sale' | 'end_sale' | 'change_price';
export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly';
export type SubAccountRole = 'staff' | 'viewer';
export type PriceConfigType = 'global' | 'platform' | 'category' | 'product';
export type RiskLevel = 'low' | 'medium' | 'high';

// --- 계정/인증 ---

export interface MegaloadUser {
  id: string;
  profile_id: string;
  plan: Plan;
  ai_credits: number;
  onboarding_done: boolean;
  business_name?: string;
  business_number?: string;
  return_address?: Record<string, unknown>;
  default_courier_code?: string;
  created_at: string;
  updated_at: string;
}

export interface MegaloadSubAccount {
  id: string;
  megaload_user_id: string;
  profile_id: string;
  role: SubAccountRole;
  permissions: string[];
  created_at: string;
}

export interface ChannelCredential {
  id: string;
  megaload_user_id: string;
  channel: Channel;
  credentials: Record<string, unknown>;
  is_connected: boolean;
  last_verified_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

// --- 상품 ---

export interface MasterProduct {
  id: string;
  megaload_user_id: string;
  coupang_product_id?: string;
  product_name: string;
  display_name?: string;
  brand?: string;
  manufacturer?: string;
  category_id?: string;
  status: ProductStatus;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  options?: ProductOption[];
  channels?: ProductChannel[];
  images?: ProductImage[];
}

export interface ProductOption {
  id: string;
  product_id: string;
  sku?: string;
  barcode?: string;
  option_name: string;
  option_value?: string;
  sale_price: number;
  cost_price?: number;
  weight_gram?: number;
  is_active: boolean;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  inventory?: Inventory;
}

export interface ProductChannel {
  id: string;
  product_id: string;
  product_option_id?: string;
  channel: Channel;
  channel_product_id?: string;
  channel_sku?: string;
  status: ChannelStatus;
  price_rule?: Record<string, unknown>;
  channel_category_id?: string;
  channel_url?: string;
  error_message?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  cdn_url?: string;
  image_type: ImageType;
  sort_order: number;
  width?: number;
  height?: number;
  created_at: string;
}

export interface ProductTemplate {
  id: string;
  megaload_user_id: string;
  channel: string;
  template_name: string;
  template_data: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductHeader {
  id: string;
  megaload_user_id: string;
  channel: string;
  header_type: HeaderType;
  content_html: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductSchedule {
  id: string;
  product_id: string;
  action_type: ScheduleActionType;
  scheduled_at: string;
  repeat_type: RepeatType;
  config: Record<string, unknown>;
  executed: boolean;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  megaload_user_id: string;
  name: string;
  parent_id?: string;
  sort_order: number;
  created_at: string;
}

export interface CategoryMapping {
  id: string;
  megaload_user_id: string;
  source_category_id: string;
  source_category_name?: string;
  channel: string;
  channel_category_id: string;
  channel_category_name?: string;
  confidence: number;
  is_ai_generated: boolean;
  created_at: string;
}

export interface SkuMapping {
  id: string;
  megaload_user_id: string;
  channel: string;
  channel_option_name: string;
  internal_sku: string;
  product_option_id?: string;
  created_at: string;
}

export interface ProductNameMapping {
  id: string;
  megaload_user_id: string;
  original_name: string;
  display_name: string;
  product_id?: string;
  created_at: string;
}

// --- 주문 ---

export interface Order {
  id: string;
  megaload_user_id: string;
  channel: Channel;
  channel_order_id: string;
  order_status: OrderStatus;
  buyer_name?: string;
  buyer_phone?: string;
  buyer_email?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  receiver_zipcode?: string;
  receiver_memo?: string;
  total_amount: number;
  shipping_fee: number;
  commission_fee: number;
  courier_code?: string;
  invoice_number?: string;
  is_merged: boolean;
  merge_order_id?: string;
  ordered_at?: string;
  confirmed_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  items?: OrderItem[];
  tags?: OrderTag[];
  memos?: OrderMemo[];
  gifts?: OrderGift[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_option_id?: string;
  channel_product_id?: string;
  product_name: string;
  option_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku?: string;
  created_at: string;
}

export interface OrderTag {
  id: string;
  order_id: string;
  tag: string;
  tag_type: TagType;
  created_at: string;
}

export interface OrderMemo {
  id: string;
  order_id: string;
  author_id?: string;
  content: string;
  is_resolved: boolean;
  created_at: string;
}

export interface OrderGift {
  id: string;
  order_id: string;
  gift_name: string;
  quantity: number;
  rule_id?: string;
  created_at: string;
}

export interface GiftRule {
  id: string;
  megaload_user_id: string;
  rule_name: string;
  condition_type: GiftConditionType;
  condition_config: Record<string, unknown>;
  gift_name: string;
  gift_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- 재고 ---

export interface Inventory {
  id: string;
  product_option_id: string;
  quantity: number;
  reserved_quantity: number;
  safety_stock: number;
  auto_suspend_threshold: number;
  auto_resume_threshold: number;
  warehouse: string;
  updated_at: string;
}

export interface InventoryLog {
  id: string;
  inventory_id: string;
  change_type: InventoryChangeType;
  change_quantity: number;
  before_quantity: number;
  after_quantity: number;
  reference_id?: string;
  note?: string;
  created_at: string;
}

// --- 문의 ---

export interface CsInquiry {
  id: string;
  megaload_user_id: string;
  channel: Channel;
  channel_inquiry_id?: string;
  inquiry_type?: string;
  title?: string;
  content: string;
  buyer_name?: string;
  product_id?: string;
  order_id?: string;
  status: InquiryStatus;
  ai_draft_answer?: string;
  answer?: string;
  answered_at?: string;
  inquired_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CsTemplate {
  id: string;
  megaload_user_id: string;
  template_name: string;
  category?: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- 정산/통계 ---

export interface Settlement {
  id: string;
  megaload_user_id: string;
  channel: Channel;
  settlement_date: string;
  total_sales: number;
  commission: number;
  shipping_fee: number;
  net_amount: number;
  order_count: number;
  raw_data?: Record<string, unknown>;
  created_at: string;
}

export interface DailySalesStats {
  id: string;
  megaload_user_id: string;
  stat_date: string;
  channel: Channel;
  order_count: number;
  total_sales: number;
  cancel_count: number;
  return_count: number;
  created_at: string;
}

// --- 자동화 ---

export interface AutomationRule {
  id: string;
  megaload_user_id: string;
  rule_name: string;
  trigger_type: TriggerType;
  action_type: ActionType;
  trigger_config: Record<string, unknown>;
  action_config: Record<string, unknown>;
  is_active: boolean;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  trigger_data?: Record<string, unknown>;
  action_result?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
  created_at: string;
}

// --- 시스템 ---

export interface CourierCompany {
  id: string;
  name: string;
  code: string;
  coupang_code?: string;
  naver_code?: string;
  elevenst_code?: string;
  gmarket_code?: string;
  auction_code?: string;
  lotteon_code?: string;
  tracking_url_template?: string;
  is_active: boolean;
  created_at: string;
}

export interface SyncJob {
  id: string;
  megaload_user_id: string;
  job_type: string;
  channel?: string;
  status: SyncJobStatus;
  total_count: number;
  processed_count: number;
  error_count: number;
  error_details?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ShNotification {
  id: string;
  megaload_user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface Credit {
  id: string;
  megaload_user_id: string;
  ai_credits: number;
  sms_credits: number;
  kakao_credits: number;
  email_credits: number;
  updated_at: string;
}

export interface CreditLog {
  id: string;
  megaload_user_id: string;
  credit_type: CreditType;
  amount: number;
  balance_after: number;
  description?: string;
  reference_id?: string;
  created_at: string;
}

// --- 소싱 ---

export interface SourcingSource {
  id: string;
  megaload_user_id: string;
  platform: SourcingPlatform;
  account_name?: string;
  app_key?: string;
  app_secret?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourcingProduct {
  id: string;
  megaload_user_id: string;
  source_id?: string;
  platform: SourcingPlatform;
  platform_product_id: string;
  original_url?: string;
  original_title: string;
  translated_title?: string;
  original_description?: string;
  translated_description?: string;
  original_images?: string[];
  processed_images?: string[];
  supplier_name?: string;
  supplier_rating?: number;
  supplier_url?: string;
  brand_check_result?: BrandCheckResult;
  brand_check_details?: Record<string, unknown>;
  sell_type: SellType;
  status: 'draft' | 'registered' | 'suspended' | 'deleted';
  linked_product_id?: string;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  skus?: SourcingProductSku[];
}

export interface SourcingProductSku {
  id: string;
  sourcing_product_id: string;
  original_option_name?: string;
  translated_option_name?: string;
  price_cny: number;
  price_krw: number;
  sale_price_krw?: number;
  moq: number;
  stock?: number;
  sku_image_url?: string;
  weight_gram?: number;
  linked_option_id?: string;
  created_at: string;
}

export interface SourcingPriceConfig {
  id: string;
  megaload_user_id: string;
  config_type: PriceConfigType;
  reference_id?: string;
  margin_rate: number;
  exchange_rate_buffer: number;
  domestic_shipping_fee: number;
  international_shipping_fee: number;
  customs_rate: number;
  vat_included: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourcingOrder {
  id: string;
  megaload_user_id: string;
  sourcing_product_id?: string;
  order_id?: string;
  platform: string;
  platform_order_id?: string;
  order_type: SellType;
  status: SourcingOrderStatus;
  quantity: number;
  total_cny?: number;
  total_krw?: number;
  shipping_agent?: string;
  domestic_courier?: string;
  domestic_invoice?: string;
  error_message?: string;
  ordered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SourcingTracking {
  id: string;
  sourcing_order_id: string;
  tracking_number?: string;
  carrier?: string;
  status: string;
  status_details?: Record<string, unknown>[];
  last_checked_at?: string;
  domestic_converted: boolean;
  domestic_courier?: string;
  domestic_invoice?: string;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRate {
  id: string;
  currency_pair: string;
  rate: number;
  source: string;
  fetched_at: string;
}

export interface CustomsDutyRate {
  id: string;
  hs_code: string;
  category_name?: string;
  duty_rate: number;
  vat_rate: number;
  notes?: string;
  created_at: string;
}

export interface SourcingWishlist {
  id: string;
  megaload_user_id: string;
  platform: string;
  platform_product_id: string;
  product_url?: string;
  title?: string;
  image_url?: string;
  price_cny?: number;
  price_krw?: number;
  last_price_cny?: number;
  price_changed: boolean;
  supplier_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BrandProtection {
  id: string;
  brand_name: string;
  brand_name_ko?: string;
  brand_name_cn?: string;
  category?: string;
  risk_level: RiskLevel;
  keywords?: string[];
  notes?: string;
  created_at: string;
}

// --- 채널 어댑터 인터페이스 ---

export interface ChannelAdapter {
  channel: Channel;
  authenticate(credentials: Record<string, unknown>): Promise<boolean>;
  testConnection(credentials: Record<string, unknown>): Promise<{ success: boolean; message: string }>;

  // 상품
  getProducts(params: { page?: number; size?: number; status?: string }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  createProduct(product: Record<string, unknown>): Promise<{ channelProductId: string; success: boolean }>;
  updateProduct(channelProductId: string, product: Record<string, unknown>): Promise<{ success: boolean }>;
  deleteProduct(channelProductId: string): Promise<{ success: boolean }>;
  updatePrice(channelProductId: string, price: number): Promise<{ success: boolean }>;
  updateStock(channelProductId: string, stock: number): Promise<{ success: boolean }>;
  suspendProduct(channelProductId: string): Promise<{ success: boolean }>;
  resumeProduct(channelProductId: string): Promise<{ success: boolean }>;

  // 주문
  getOrders(params: { startDate: string; endDate: string; status?: string; page?: number }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  confirmOrder(channelOrderId: string): Promise<{ success: boolean }>;
  registerInvoice(channelOrderId: string, courierCode: string, invoiceNumber: string): Promise<{ success: boolean }>;
  cancelOrder(channelOrderId: string, reason: string): Promise<{ success: boolean }>;

  // 문의
  getInquiries(params: { startDate: string; endDate: string; page?: number }): Promise<{ items: Record<string, unknown>[]; totalCount: number }>;
  answerInquiry(inquiryId: string, answer: string): Promise<{ success: boolean }>;

  // 정산
  getSettlements(params: { startDate: string; endDate: string }): Promise<{ items: Record<string, unknown>[] }>;

  // 카테고리
  getCategories(parentId?: string): Promise<{ items: { id: string; name: string; parentId?: string }[] }>;
  searchCategory(keyword: string): Promise<{ items: { id: string; name: string; path: string }[] }>;
}

// --- 프리플라이트 / 카나리 ---

export interface PreflightProductResult {
  pass: boolean;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
  payloadSnapshot: {
    sellerProductName: string;
    displayProductName: string;
    imageCount: number;
    noticeCategoryCount: number;
    attributeCount: number;
    hasDetailPage: boolean;
    payloadSizeKB: number;
  };
  imageStatus: 'fresh' | 'stale' | 'missing';
}

export interface PreflightIssue {
  code: string;
  field: string;
  message: string;
}

export interface CanaryResult {
  success: boolean;
  phases: { name: string; success: boolean; durationMs: number; error?: string }[];
  channelProductId?: string;
  cleanedUp: boolean;
  error?: string;
}

// --- 대시보드/뱃지 ---

export interface MegaloadBadgeData {
  pendingOrders: number;
  pendingInquiries: number;
  lowStockCount: number;
  expiringKeys: number;
  unreadBugReports: number;
}
