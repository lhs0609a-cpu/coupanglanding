'use client';

import { useState, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNEL_SHORT_LABELS, CHANNEL_COLORS } from '@/lib/sellerhub/constants';
import type { Order } from '@/lib/sellerhub/types';
import { Scan, Check, Package, AlertCircle } from 'lucide-react';

export default function BarcodeOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [barcode, setBarcode] = useState('');
  const [scannedOrders, setScannedOrders] = useState<(Order & { invoiceNumber: string })[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScan = async (value: string) => {
    if (!value.trim()) return;
    setError('');

    // 바코드 = 송장번호로 간주하여 해당 주문 검색 및 송장 등록
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id, default_courier_code')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const shUserData = shUser as Record<string, unknown>;

    // 발주확인 완료된 첫 번째 주문에 송장 등록
    const { data: order } = await supabase
      .from('sh_orders')
      .select('*, sh_order_items(*)')
      .eq('sellerhub_user_id', shUserData.id)
      .in('order_status', ['order_confirmed', 'shipping_ready'])
      .is('invoice_number', null)
      .order('ordered_at', { ascending: true })
      .limit(1)
      .single();

    if (!order) {
      setError('송장 등록 가능한 주문이 없습니다');
      setBarcode('');
      return;
    }

    // 송장 등록 API 호출
    const res = await fetch(`/api/sellerhub/orders/${(order as Record<string, unknown>).id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierCode: shUserData.default_courier_code || 'CJ대한통운',
        invoiceNumber: value.trim(),
      }),
    });

    if (res.ok) {
      setScannedOrders((prev) => [...prev, { ...(order as unknown as Order), invoiceNumber: value.trim() }]);
    } else {
      setError('송장 등록에 실패했습니다');
    }

    setBarcode('');
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">바코드 출고 매니저</h1>
        <p className="text-sm text-gray-500 mt-1">바코드 스캔으로 빠르게 송장을 등록하세요</p>
      </div>

      {/* 스캔 입력 */}
      <div className="bg-white rounded-xl border-2 border-[#E31837] p-6 text-center">
        <Scan className="w-12 h-12 mx-auto text-[#E31837] mb-3" />
        <p className="text-sm text-gray-600 mb-4">바코드를 스캔하거나 송장번호를 입력하세요</p>
        <input
          ref={inputRef}
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleScan(barcode);
            }
          }}
          className="w-full max-w-sm mx-auto px-4 py-3 border-2 border-gray-300 rounded-xl text-center text-lg font-mono focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          placeholder="송장번호 입력..."
          autoFocus
        />
        {error && (
          <div className="mt-3 flex items-center justify-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      {/* 스캔 결과 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">
          처리 완료 <span className="text-[#E31837]">{scannedOrders.length}</span>건
        </h2>
        <div className="space-y-2">
          {scannedOrders.length === 0 ? (
            <p className="text-center text-gray-400 py-6">
              <Package className="w-6 h-6 mx-auto mb-1" />
              <span className="text-sm">스캔한 주문이 여기에 표시됩니다</span>
            </p>
          ) : scannedOrders.map((order, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${CHANNEL_COLORS[order.channel]}`}>
                    {CHANNEL_SHORT_LABELS[order.channel]}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {order.items?.[0]?.product_name || order.channel_order_id}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  송장: {order.invoiceNumber} | {order.receiver_name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
