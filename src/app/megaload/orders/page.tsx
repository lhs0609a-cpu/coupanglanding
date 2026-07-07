'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/megaload/constants';
import type { Channel, Order, OrderStatus } from '@/lib/megaload/types';
import { ShoppingCart, Search, RefreshCw, ChevronLeft, ChevronRight, Check, Truck, Package } from 'lucide-react';
import InvoiceModal, { type InvoiceTarget, type InvoiceInput } from '@/components/megaload/InvoiceModal';

// 송장등록(배송중 전환) 가능한 상태 — 발주확인 이후 & 배송준비(지마켓/옥션)
const INVOICEABLE: OrderStatus[] = ['order_confirmed', 'shipping_ready'];

const STATUS_TABS: { key: OrderStatus | 'all'; label: string; icon: typeof ShoppingCart }[] = [
  { key: 'all', label: '전체', icon: ShoppingCart },
  { key: 'payment_done', label: '결제완료', icon: ShoppingCart },
  { key: 'order_confirmed', label: '발주확인', icon: Check },
  { key: 'shipping_ready', label: '배송준비', icon: Package },
  { key: 'shipping', label: '배송중', icon: Truck },
  { key: 'delivered', label: '배송완료', icon: Check },
];

export default function OrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const [invoiceTargets, setInvoiceTargets] = useState<InvoiceTarget[] | null>(null);
  const PAGE_SIZE = 20;

  // 검색 debounce: 매 키 입력 fetch → 400ms 안정화 후 1회만
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const megaloadUserId = (shUser as Record<string, unknown>).id as string;

    // 상태별 카운트 — 단일 쿼리로 통합 (이전: 5개 별도 count 쿼리 = 5번 왕복)
    // status 컬럼만 fetch → 클라이언트 측에서 GROUP BY (대역폭 작고 응답 빠름)
    const { data: statusRows } = await supabase
      .from('sh_orders')
      .select('order_status')
      .eq('megaload_user_id', megaloadUserId);
    const counts: Record<string, number> = {};
    for (const row of (statusRows as { order_status: string }[] | null) || []) {
      counts[row.order_status] = (counts[row.order_status] || 0) + 1;
    }
    setStatusCounts(counts);

    // 주문 목록 — 필요 컬럼만 (이전: select('*, sh_order_items(*), sh_order_tags(*)') 전체 fetch)
    // 페이지에서 표시되는 정보만 select → 대역폭 절감 + 응답 시간 단축
    let query = supabase
      .from('sh_orders')
      .select('id, channel, channel_order_id, order_status, ordered_at, buyer_name, receiver_name, total_amount, courier_code, invoice_number, items:sh_order_items(id, product_name, quantity, unit_price), tags:sh_order_tags(tag)', { count: 'exact' })
      .eq('megaload_user_id', megaloadUserId)
      .order('ordered_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (activeTab !== 'all') {
      query = query.eq('order_status', activeTab);
    }
    if (channelFilter) {
      query = query.eq('channel', channelFilter);
    }
    if (debouncedSearch) {
      query = query.or(`buyer_name.ilike.%${debouncedSearch}%,receiver_name.ilike.%${debouncedSearch}%,channel_order_id.ilike.%${debouncedSearch}%`);
    }

    const { data, count } = await query;
    setOrders((data as unknown as Order[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, activeTab, channelFilter, debouncedSearch, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleQuickSync = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/megaload/orders/sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 대표 케이스: 연결된 채널이 없음(400) → 채널 연동 안내
        if (res.status === 400 && /채널/.test(json.error || '')) {
          alert('연결된 판매 채널이 없습니다.\n\n[채널관리(연동)] 에서 쿠팡 API(업체코드·액세스키·시크릿키)를 먼저 연결해주세요.');
        } else {
          alert(`주문 수집 실패: ${json.error || res.status}`);
        }
        return;
      }

      // 채널별 에러(부분 실패) 표면화
      if (json.errors && Object.keys(json.errors).length > 0) {
        const lines = Object.entries(json.errors as Record<string, string>)
          .map(([ch, msg]) => `· ${ch}: ${msg}`)
          .join('\n');
        alert(`일부 채널 수집 실패:\n${lines}\n\n(수집 성공 ${json.totalCollected ?? 0}건)`);
      } else if ((json.totalCollected ?? 0) === 0) {
        const per = json.channels
          ? Object.entries(json.channels as Record<string, number>).map(([c, n]) => `${c}:${n}`).join(', ')
          : '';
        alert(`최근 7일 신규 주문이 없습니다.${per ? `\n채널별: ${per}` : ''}`);
      } else {
        alert(`주문 ${json.totalCollected}건 수집 완료`);
      }
    } catch (err) {
      alert(`주문 수집 오류: ${err instanceof Error ? err.message : '네트워크 오류'}`);
    } finally {
      await fetchOrders();
    }
  };

  const orderLabel = (o: Order) =>
    `${CHANNEL_SHORT_LABELS[o.channel]} · ${o.channel_order_id} · ${o.receiver_name || o.buyer_name || ''}`;

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0 || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/megaload/orders/bulk/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.failed > 0) alert(`발주확인: 성공 ${json.success ?? 0}건, 실패 ${json.failed}건`);
      await fetchOrders();
      setSelectedIds([]);
    } finally {
      setConfirming(false);
    }
  };

  // 단건 송장등록 모달 오픈
  const openInvoiceSingle = (o: Order) => {
    setInvoiceTargets([{ id: o.id, label: orderLabel(o) }]);
  };

  // 일괄 송장등록 모달 오픈 (선택 중 송장등록 가능한 상태만)
  const openInvoiceBulk = () => {
    const targets = orders
      .filter((o) => selectedIds.includes(o.id) && INVOICEABLE.includes(o.order_status))
      .map((o) => ({ id: o.id, label: orderLabel(o) }));
    if (targets.length === 0) {
      alert('송장등록은 발주확인(또는 배송준비) 상태의 주문만 가능합니다.');
      return;
    }
    setInvoiceTargets(targets);
  };

  // 모달 제출 → 단건/일괄 API 라우팅
  const submitInvoices = async (invoices: InvoiceInput[]) => {
    if (invoices.length === 1) {
      const { orderId, courierCode, invoiceNumber } = invoices[0];
      const res = await fetch(`/api/megaload/orders/${orderId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierCode, invoiceNumber }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`송장등록 실패: ${j.error || res.status}`);
        throw new Error('invoice failed');
      }
    } else {
      const res = await fetch('/api/megaload/orders/bulk/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`일괄 송장등록 실패: ${j.error || res.status}`);
        throw new Error('bulk invoice failed');
      }
      if (j.failed > 0) alert(`송장등록: 성공 ${j.success ?? 0}건, 실패 ${j.failed}건`);
    }
    await fetchOrders();
    setSelectedIds([]);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">주문관리</h1>
          <p className="text-sm text-gray-500 mt-1">통합 주문 대시보드</p>
        </div>
        <button
          onClick={handleQuickSync}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          퀵 수집
        </button>
      </div>

      {/* 상태 탭 */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === 'all'
            ? Object.values(statusCounts).reduce((s, c) => s + c, 0)
            : statusCounts[tab.key] || 0;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab.key
                  ? 'bg-[#E31837] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-white/20' : 'bg-gray-200'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 검색/필터 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="주문번호, 구매자명, 수취인명..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>
        <select
          value={channelFilter}
          onChange={(e) => { setChannelFilter(e.target.value as Channel | ''); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">전체 채널</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{CHANNEL_SHORT_LABELS[ch]}</option>
          ))}
        </select>
      </div>

      {/* 일괄 처리 */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-blue-700">{selectedIds.length}개 선택</span>
          <button
            onClick={handleBulkConfirm}
            disabled={confirming}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {confirming && <RefreshCw className="w-3 h-3 animate-spin" />}
            발주확인
          </button>
          <button
            onClick={openInvoiceBulk}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Truck className="w-3 h-3" />
            송장등록
          </button>
        </div>
      )}

      {/* 주문 목록 */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            불러오는 중...
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2" />
            주문이 없습니다
          </div>
        ) : orders.map((order) => (
          <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => setSelectedIds((prev) => prev.includes(order.id) ? prev.filter((i) => i !== order.id) : [...prev, order.id])}
                className="mt-1 rounded border-gray-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CHANNEL_COLORS[order.channel]}`}>
                    {CHANNEL_SHORT_LABELS[order.channel]}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ORDER_STATUS_COLORS[order.order_status]}`}>
                    {ORDER_STATUS_LABELS[order.order_status]}
                  </span>
                  <span className="text-xs text-gray-400">{order.channel_order_id}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-gray-900">
                    {order.items?.[0]?.product_name || '상품명 없음'}
                    {(order.items?.length || 0) > 1 && ` 외 ${(order.items?.length || 0) - 1}건`}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>{order.receiver_name}</span>
                  <span>{order.total_amount?.toLocaleString()}원</span>
                  <span>{order.ordered_at ? new Date(order.ordered_at).toLocaleDateString('ko-KR') : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {order.order_status === 'payment_done' && (
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/megaload/orders/${order.id}/confirm`, { method: 'POST' });
                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        alert(`발주확인 실패: ${j.error || res.status}`);
                      }
                      fetchOrders();
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700"
                  >
                    발주확인
                  </button>
                )}
                {INVOICEABLE.includes(order.order_status) && (
                  <button
                    onClick={() => openInvoiceSingle(order)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                  >
                    <Truck className="w-3 h-3" />
                    송장등록
                  </button>
                )}
                {(order.order_status === 'shipping' || order.order_status === 'delivered') && order.invoice_number && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {order.courier_code} {order.invoice_number}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{total}건</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 송장등록 모달 (단건/일괄 공용) */}
      <InvoiceModal
        isOpen={invoiceTargets !== null}
        onClose={() => setInvoiceTargets(null)}
        orders={invoiceTargets || []}
        onSubmit={submitInvoices}
      />
    </div>
  );
}
