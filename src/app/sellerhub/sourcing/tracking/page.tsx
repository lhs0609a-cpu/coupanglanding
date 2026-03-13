'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Truck, Package, Clock, Check, AlertTriangle } from 'lucide-react';

interface SourcingOrderItem {
  id: string;
  platform: string;
  platform_order_id: string;
  order_type: string;
  status: string;
  quantity: number;
  total_cny: number;
  total_krw: number;
  ordered_at: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600', icon: Clock },
  ordered: { label: '발주완료', color: 'bg-blue-100 text-blue-700', icon: Package },
  shipped: { label: '해외배송중', color: 'bg-purple-100 text-purple-700', icon: Truck },
  domestic_received: { label: '국내입고', color: 'bg-indigo-100 text-indigo-700', icon: Package },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', icon: Check },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500', icon: AlertTriangle },
  failed: { label: '실패', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function SourcingTrackingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<SourcingOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const { data } = await supabase
      .from('sh_sourcing_orders')
      .select('*')
      .eq('sellerhub_user_id', (shUser as Record<string, unknown>).id)
      .order('created_at', { ascending: false });

    setOrders((data as unknown as SourcingOrderItem[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">발주/배송 현황</h1>
        <p className="text-sm text-gray-500 mt-1">해외 소싱 발주 및 배송 추적</p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">불러오는 중...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <Truck className="w-8 h-8 mx-auto mb-2" />발주 내역이 없습니다
          </div>
        ) : orders.map((order) => {
          const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending;
          const StatusIcon = statusInfo.icon;
          return (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <StatusIcon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {order.platform_order_id || order.id.slice(0, 8)}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {order.order_type === 'dropshipping' ? '드랍쉬핑' : '사입'}
                      {' | '}수량: {order.quantity}개
                      {order.total_cny && ` | ¥${order.total_cny}`}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
