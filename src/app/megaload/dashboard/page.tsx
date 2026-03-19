'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_COLORS, CHANNEL_BG_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/megaload/constants';
import type { Channel, Order } from '@/lib/megaload/types';
import {
  ShoppingCart, Package, Truck, TrendingUp, AlertTriangle, RefreshCw,
  ArrowRight, Key, Box, MessageSquare, Loader2, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  newOrders: number;
  confirmNeeded: number;
  shippingReady: number;
  todaySales: number;
  lowStockCount: number;
  pendingInquiries: number;
  recentOrders: Order[];
  channelStatus: Record<string, boolean>;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashboardData>({
    newOrders: 0,
    confirmNeeded: 0,
    shippingReady: 0,
    todaySales: 0,
    lowStockCount: 0,
    pendingInquiries: 0,
    recentOrders: [],
    channelStatus: {},
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) { setLoading(false); return; }

    const megaloadUserId = (shUser as Record<string, unknown>).id as string;

    const [
      newOrdersRes,
      confirmRes,
      shippingRes,
      inquiriesRes,
      recentRes,
      channelsRes,
    ] = await Promise.all([
      supabase.from('sh_orders').select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', megaloadUserId).eq('order_status', 'payment_done'),
      supabase.from('sh_orders').select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', megaloadUserId).eq('order_status', 'order_confirmed'),
      supabase.from('sh_orders').select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', megaloadUserId).eq('order_status', 'shipping_ready'),
      supabase.from('sh_cs_inquiries').select('id', { count: 'exact', head: true })
        .eq('megaload_user_id', megaloadUserId).eq('status', 'pending'),
      supabase.from('sh_orders').select('*, sh_order_items(*)')
        .eq('megaload_user_id', megaloadUserId)
        .order('ordered_at', { ascending: false })
        .limit(10),
      supabase.from('channel_credentials').select('channel, is_connected')
        .eq('megaload_user_id', megaloadUserId),
    ]);

    // 오늘 매출
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayStats } = await supabase
      .from('sh_daily_sales_stats')
      .select('total_sales')
      .eq('megaload_user_id', megaloadUserId)
      .eq('stat_date', today);

    const todaySales = (todayStats || []).reduce((s: number, d: Record<string, unknown>) => s + ((d.total_sales as number) || 0), 0);

    const channelStatus: Record<string, boolean> = {};
    (channelsRes.data || []).forEach((c: Record<string, unknown>) => {
      channelStatus[c.channel as string] = c.is_connected as boolean;
    });

    setData({
      newOrders: newOrdersRes.count || 0,
      confirmNeeded: confirmRes.count || 0,
      shippingReady: shippingRes.count || 0,
      todaySales,
      lowStockCount: 0,
      pendingInquiries: inquiriesRes.count || 0,
      recentOrders: (recentRes.data as unknown as Order[]) || [],
      channelStatus,
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const quickSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/megaload/orders/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ type: 'error', message: data.error || '주문 수집 실패' });
      } else {
        const total = data.totalCollected || 0;
        const channelErrors = Object.entries(data.channels || {})
          .filter(([, v]) => v === -1)
          .map(([ch]) => ch);
        if (channelErrors.length > 0) {
          setSyncResult({
            type: 'error',
            message: `${total}건 수집, ${channelErrors.join(', ')} 채널 오류 발생`,
          });
        } else {
          setSyncResult({ type: 'success', message: `${total}건 수집 완료` });
        }
      }
    } catch {
      setSyncResult({ type: 'error', message: '네트워크 오류로 수집 실패' });
    }
    await fetchDashboard();
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  };

  const alerts: { message: string; type: 'warning' | 'error'; link: string }[] = [];
  if (data.lowStockCount > 0) {
    alerts.push({ message: `재고 부족 상품 ${data.lowStockCount}개`, type: 'warning', link: '/megaload/inventory' });
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">Today&apos;s Inbox</p>
        </div>
        <button
          onClick={quickSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          퀵 수집
        </button>
      </div>

      {/* 수집 결과 */}
      {syncResult && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${
          syncResult.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
        }`}>
          {syncResult.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
          <span className={`text-sm font-medium ${
            syncResult.type === 'error' ? 'text-red-700' : 'text-green-700'
          }`}>
            {syncResult.message}
          </span>
        </div>
      )}

      {/* 알림 배너 */}
      {alerts.map((alert, i) => (
        <Link
          key={i}
          href={alert.link}
          className={`flex items-center gap-3 p-3 rounded-xl border ${
            alert.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <AlertTriangle className={`w-5 h-5 ${alert.type === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
          <span className={`text-sm font-medium ${alert.type === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
            {alert.message}
          </span>
          <ArrowRight className="w-4 h-4 ml-auto text-gray-400" />
        </Link>
      ))}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/megaload/orders?status=payment_done" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">신규 주문</p>
              <p className="text-2xl font-bold text-gray-900">{data.newOrders}</p>
            </div>
          </div>
        </Link>
        <Link href="/megaload/orders?status=order_confirmed" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">발주확인 필요</p>
              <p className="text-2xl font-bold text-gray-900">{data.confirmNeeded}</p>
            </div>
          </div>
        </Link>
        <Link href="/megaload/orders?status=shipping_ready" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Truck className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">배송 준비</p>
              <p className="text-2xl font-bold text-gray-900">{data.shippingReady}</p>
            </div>
          </div>
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">오늘 매출</p>
              <p className="text-2xl font-bold text-gray-900">₩{data.todaySales.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 채널 상태 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">채널 연결 상태</h2>
        <div className="flex items-center gap-4 flex-wrap">
          {CHANNELS.map((ch) => {
            const connected = data.channelStatus[ch];
            return (
              <div key={ch} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: connected ? CHANNEL_BG_COLORS[ch] : '#D1D5DB' }}
                />
                <span className={`text-sm ${connected ? 'text-gray-700' : 'text-gray-400'}`}>
                  {CHANNEL_SHORT_LABELS[ch]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 최근 주문 (Today's Inbox) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">최근 주문</h2>
          <Link href="/megaload/orders" className="text-sm text-[#E31837] hover:underline flex items-center gap-1">
            전체보기 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : data.recentOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2" />
              <p>주문이 없습니다</p>
              <p className="text-xs mt-1">퀵 수집 버튼을 눌러 주문을 가져오세요</p>
            </div>
          ) : data.recentOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm transition flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${CHANNEL_COLORS[order.channel]}`}>
                {CHANNEL_SHORT_LABELS[order.channel]}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${ORDER_STATUS_COLORS[order.order_status]}`}>
                {ORDER_STATUS_LABELS[order.order_status]}
              </span>
              <span className="text-sm text-gray-900 flex-1 truncate">
                {order.items?.[0]?.product_name || order.channel_order_id}
              </span>
              <span className="text-sm font-medium text-gray-700">
                ₩{order.total_amount?.toLocaleString()}
              </span>
              <span className="text-xs text-gray-400">
                {order.ordered_at ? new Date(order.ordered_at).toLocaleDateString('ko-KR') : ''}
              </span>
              {order.order_status === 'payment_done' && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await fetch(`/api/megaload/orders/${order.id}/confirm`, { method: 'POST' });
                    fetchDashboard();
                  }}
                  className="px-2 py-1 text-xs font-medium text-white bg-[#E31837] rounded hover:bg-red-700"
                >
                  발주확인
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 퀵 링크 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/megaload/cs" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">미답변 문의</p>
            <p className="text-xs text-gray-500">{data.pendingInquiries}건</p>
          </div>
        </Link>
        <Link href="/megaload/inventory" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <Box className="w-5 h-5 text-orange-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">재고 부족</p>
            <p className="text-xs text-gray-500">{data.lowStockCount}건</p>
          </div>
        </Link>
        <Link href="/megaload/sourcing" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <Package className="w-5 h-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">해외소싱</p>
            <p className="text-xs text-gray-500">상품 탐색</p>
          </div>
        </Link>
        <Link href="/megaload/channels" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
          <Key className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">채널 관리</p>
            <p className="text-xs text-gray-500">API 설정</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
