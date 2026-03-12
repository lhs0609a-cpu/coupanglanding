// ============================================================
// SellerHub 상수 정의
// ============================================================

import type { Channel, OrderStatus, Plan } from './types';

// --- 채널 ---

export const CHANNELS: Channel[] = ['coupang', 'naver', 'elevenst', 'gmarket', 'auction', 'lotteon'];

export const CHANNEL_LABELS: Record<Channel, string> = {
  coupang: '쿠팡',
  naver: '네이버 스마트스토어',
  elevenst: '11번가',
  gmarket: 'G마켓',
  auction: '옥션',
  lotteon: '롯데온',
};

export const CHANNEL_SHORT_LABELS: Record<Channel, string> = {
  coupang: '쿠팡',
  naver: '네이버',
  elevenst: '11번가',
  gmarket: 'G마켓',
  auction: '옥션',
  lotteon: '롯데온',
};

export const CHANNEL_COLORS: Record<Channel, string> = {
  coupang: 'bg-red-100 text-red-700',
  naver: 'bg-green-100 text-green-700',
  elevenst: 'bg-orange-100 text-orange-700',
  gmarket: 'bg-emerald-100 text-emerald-700',
  auction: 'bg-blue-100 text-blue-700',
  lotteon: 'bg-pink-100 text-pink-700',
};

export const CHANNEL_BG_COLORS: Record<Channel, string> = {
  coupang: '#E31837',
  naver: '#03C75A',
  elevenst: '#FF5722',
  gmarket: '#00A862',
  auction: '#FF6F00',
  lotteon: '#E5006D',
};

export const CHANNEL_ICONS: Record<Channel, string> = {
  coupang: '🛒',
  naver: '🟢',
  elevenst: '🔶',
  gmarket: '🟩',
  auction: '🔵',
  lotteon: '🩷',
};

// --- 주문 상태 ---

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  payment_done: '결제완료',
  order_confirmed: '발주확인',
  shipping_ready: '배송준비',
  shipping: '배송중',
  delivered: '배송완료',
  cancel_requested: '취소요청',
  cancelled: '취소완료',
  return_requested: '반품요청',
  returned: '반품완료',
  exchange_requested: '교환요청',
  exchanged: '교환완료',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  payment_done: 'bg-blue-100 text-blue-700',
  order_confirmed: 'bg-indigo-100 text-indigo-700',
  shipping_ready: 'bg-yellow-100 text-yellow-700',
  shipping: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancel_requested: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-600',
  return_requested: 'bg-red-100 text-red-700',
  returned: 'bg-gray-100 text-gray-600',
  exchange_requested: 'bg-amber-100 text-amber-700',
  exchanged: 'bg-gray-100 text-gray-600',
};

// --- 채널별 주문상태 매핑 ---

export const CHANNEL_ORDER_STATUS_MAP: Record<Channel, Record<string, OrderStatus>> = {
  coupang: {
    ACCEPT: 'payment_done',
    INSTRUCT: 'order_confirmed',
    DEPARTURE: 'shipping',
    DELIVRD: 'delivered',
    CANCEL: 'cancelled',
    RETURN: 'returned',
  },
  naver: {
    PAYMENT_WAITING: 'payment_done',
    PAYED: 'payment_done',
    DELIVERING: 'shipping',
    DELIVERED: 'delivered',
    PURCHASE_DECIDED: 'delivered',
    EXCHANGED: 'exchanged',
    CANCELLED: 'cancelled',
    RETURNED: 'returned',
  },
  elevenst: {
    ORDER_RECEIVED: 'payment_done',
    ORDER_CONFIRMED: 'order_confirmed',
    SHIPPING: 'shipping',
    DELIVERED: 'delivered',
    CANCEL_DONE: 'cancelled',
    RETURN_DONE: 'returned',
  },
  gmarket: {
    PayComplete: 'payment_done',
    ShipReady: 'shipping_ready',
    Shipping: 'shipping',
    DelivComplete: 'delivered',
    Cancel: 'cancelled',
    Return: 'returned',
  },
  auction: {
    PayComplete: 'payment_done',
    ShipReady: 'shipping_ready',
    Shipping: 'shipping',
    DelivComplete: 'delivered',
    Cancel: 'cancelled',
    Return: 'returned',
  },
  lotteon: {
    PAY_COMPLETE: 'payment_done',
    PRODUCT_PREPARE: 'order_confirmed',
    DELIVERING: 'shipping',
    DELIVERY_COMPLETE: 'delivered',
    CANCEL_COMPLETE: 'cancelled',
    RETURN_COMPLETE: 'returned',
  },
};

// --- 택배사 코드 매핑 ---

export const COURIER_CHANNEL_CODES: Record<string, Record<Channel, string>> = {
  CJ대한통운: { coupang: 'CJGLS', naver: 'CJGLS', elevenst: '04', gmarket: 'CJ', auction: 'CJ', lotteon: 'CJ' },
  한진택배: { coupang: 'HANJIN', naver: 'HANJIN', elevenst: '05', gmarket: 'HANJIN', auction: 'HANJIN', lotteon: 'HANJIN' },
  롯데택배: { coupang: 'LOTTE', naver: 'LOTTE', elevenst: '08', gmarket: 'LOTTE', auction: 'LOTTE', lotteon: 'LOTTE' },
  우체국택배: { coupang: 'EPOST', naver: 'EPOST', elevenst: '01', gmarket: 'EPOST', auction: 'EPOST', lotteon: 'EPOST' },
  로젠택배: { coupang: 'LOGEN', naver: 'LOGEN', elevenst: '06', gmarket: 'LOGEN', auction: 'LOGEN', lotteon: 'LOGEN' },
  경동택배: { coupang: 'KDEXP', naver: 'KDEXP', elevenst: '23', gmarket: 'KDEXP', auction: 'KDEXP', lotteon: 'KDEXP' },
};

// --- 채널별 Rate Limit ---

export const CHANNEL_RATE_LIMITS: Record<Channel, { windowMs: number; maxCalls: number }> = {
  coupang: { windowMs: 1000, maxCalls: 5 },
  naver: { windowMs: 60000, maxCalls: 100 },
  elevenst: { windowMs: 60000, maxCalls: 60 },
  gmarket: { windowMs: 60000, maxCalls: 30 },
  auction: { windowMs: 60000, maxCalls: 30 },
  lotteon: { windowMs: 60000, maxCalls: 60 },
};

// --- 채널별 발주확인 배치 사이즈 ---

export const CHANNEL_BATCH_SIZES: Record<Channel, number> = {
  coupang: 50,
  naver: 100,
  elevenst: 50,
  gmarket: 30,
  auction: 30,
  lotteon: 50,
};

// --- 채널별 수수료율 ---

export const CHANNEL_COMMISSION_RATES: Record<Channel, number> = {
  coupang: 10.8,
  naver: 5.5,
  elevenst: 13,
  gmarket: 12,
  auction: 12,
  lotteon: 10,
};

// --- 요금제 ---

export interface PlanConfig {
  label: string;
  price: number;
  monthlyOrders: number;
  maxChannels: number;
  aiCredits: number;
  maxAutomationRules: number;
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  free: {
    label: 'STARTER',
    price: 0,
    monthlyOrders: 300,
    maxChannels: 2,
    aiCredits: 500,
    maxAutomationRules: 2,
  },
  standard: {
    label: 'STANDARD',
    price: 99000,
    monthlyOrders: 10000,
    maxChannels: 6,
    aiCredits: 2400,
    maxAutomationRules: 10,
  },
  professional: {
    label: 'PROFESSIONAL',
    price: 189000,
    monthlyOrders: Infinity,
    maxChannels: 6,
    aiCredits: 10000,
    maxAutomationRules: Infinity,
  },
};

// --- 채널 상태 라벨 ---

export const CHANNEL_STATUS_LABELS: Record<string, string> = {
  not_registered: '미등록',
  pending: '등록중',
  active: '판매중',
  suspended: '품절',
  failed: '실패',
  deleted: '삭제됨',
};

export const CHANNEL_STATUS_COLORS: Record<string, string> = {
  not_registered: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  deleted: 'bg-gray-100 text-gray-400',
};

// --- 재고 변동 타입 ---

export const INVENTORY_CHANGE_LABELS: Record<string, string> = {
  SALE: '판매',
  CANCEL: '취소',
  RETURN: '반품',
  MANUAL: '수동조정',
  SYNC: '동기화',
  RESERVE: '예약',
  RELEASE: '예약해제',
};

// --- 소싱 플랫폼 ---

export const SOURCING_PLATFORM_LABELS: Record<string, string> = {
  aliexpress: 'AliExpress',
  ali1688: '1688',
};

export const SOURCING_PLATFORM_COLORS: Record<string, string> = {
  aliexpress: 'bg-orange-100 text-orange-700',
  ali1688: 'bg-yellow-100 text-yellow-700',
};

// --- 네비게이션 ---

export const SELLERHUB_NAV_ITEMS = [
  { href: '/sellerhub/dashboard', label: '대시보드', icon: 'LayoutDashboard' },
  { href: '/sellerhub/orders', label: '주문관리', icon: 'ShoppingCart', badgeKey: 'pendingOrders' as const },
  { href: '/sellerhub/products', label: '상품관리', icon: 'Package' },
  { href: '/sellerhub/inventory', label: '재고관리', icon: 'Warehouse' },
  { href: '/sellerhub/cs', label: '문의관리', icon: 'MessageSquare', badgeKey: 'pendingInquiries' as const },
  { href: '/sellerhub/settlement', label: '정산', icon: 'Receipt' },
  { href: '/sellerhub/analytics', label: '통계', icon: 'BarChart3' },
  { href: '/sellerhub/automation', label: '자동화', icon: 'Zap' },
  { href: '/sellerhub/sourcing', label: '해외소싱', icon: 'Globe' },
  { href: '/sellerhub/channels', label: '채널관리', icon: 'Link' },
  { href: '/sellerhub/settings', label: '설정', icon: 'Settings' },
] as const;
