'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/megaload/constants';
import type { Channel, Order, OrderStatus } from '@/lib/megaload/types';
import { ShoppingCart, Search, RefreshCw, ChevronLeft, ChevronRight, Check, Truck, Package, AlertTriangle, Filter } from 'lucide-react';

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
  const PAGE_SIZE = 20;

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

    // 상태별 카운트
    const countPromises = STATUS_TABS.filter((t) => t.key !== 'all').map(async (tab) => {
      const { count } = await supabase
        .from('sh_orders')
        .select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', megaloadUserId)
        .eq('order_status', tab.key);
      return [tab.key, count || 0] as [string, number];
    });

    const counts = await Promise.all(countPromises);
    setStatusCounts(Object.fromEntries(counts));

    // 주문 목록
    let query = supabase
      .from('sh_orders')
      .select('*, sh_order_items(*), sh_order_tags(*)', { count: 'exact' })
      .eq('megaload_user_id', megaloadUserId)
      .order('ordered_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (activeTab !== 'all') {
      query = query.eq('order_status', activeTab);
    }
    if (channelFilter) {
      query = query.eq('channel', channelFilter);
    }
    if (search) {
      query = query.or(`buyer_name.ilike.%${search}%,receiver_name.ilike.%${search}%,channel_order_id.ilike.%${search}%`);
    }

    const { data, count } = await query;
    setOrders((data as unknown as Order[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, activeTab, channelFilter, search, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleQuickSync = async () => {
    setLoading(true);
    await fetch('/api/megaload/orders/sync', { method: 'POST' });
    await fetchOrders();
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0) return;
    await fetch('/api/megaload/orders/bulk/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: selectedIds }),
    });
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
          <button onClick={handleBulkConfirm} className="px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700">
            발주확인
          </button>
          <button className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
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
                      await fetch(`/api/megaload/orders/${order.id}/confirm`, { method: 'POST' });
                      fetchOrders();
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700"
                  >
                    발주확인
                  </button>
                )}
                {order.order_status === 'order_confirmed' && (
                  <button className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700">
                    송장등록
                  </button>
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
    </div>
  );
}
