'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { INVENTORY_CHANGE_LABELS } from '@/lib/sellerhub/constants';
import { Warehouse, Search, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Edit3, Save } from 'lucide-react';

interface InventoryItem {
  id: string;
  product_option_id: string;
  quantity: number;
  reserved_quantity: number;
  safety_stock: number;
  auto_suspend_threshold: number;
  auto_resume_threshold: number;
  warehouse: string;
  updated_at: string;
  option?: {
    id: string;
    sku: string;
    option_name: string;
    option_value: string;
    product?: {
      product_name: string;
    };
  };
}

export default function InventoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchInventory = useCallback(async () => {
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

    // 재고 + 옵션 + 상품 조인
    let query = supabase
      .from('sh_inventory')
      .select(`
        *,
        sh_product_options!inner(
          id, sku, option_name, option_value,
          sh_products!inner(product_name, sellerhub_user_id)
        )
      `, { count: 'exact' })
      .order('quantity', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (filter === 'low') {
      query = query.lte('quantity', 10).gt('quantity', 0);
    } else if (filter === 'out') {
      query = query.lte('quantity', 0);
    }

    const { data, count } = await query;
    setItems((data as unknown as InventoryItem[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, filter, page]);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const handleSave = async (optionId: string) => {
    await fetch(`/api/sellerhub/inventory/${optionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: editQuantity, note: '관리자 수동 조정' }),
    });
    setEditingId(null);
    fetchInventory();
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.quantity <= 0) return { label: '품절', color: 'bg-red-100 text-red-700' };
    if (item.quantity <= item.safety_stock) return { label: '부족', color: 'bg-orange-100 text-orange-700' };
    return { label: '정상', color: 'bg-green-100 text-green-700' };
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고관리</h1>
          <p className="text-sm text-gray-500 mt-1">마스터 재고 = Single Source of Truth</p>
        </div>
        <button
          onClick={fetchInventory}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU, 상품명 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-300 p-0.5">
          {(['all', 'low', 'out'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                filter === f ? 'bg-[#E31837] text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f === 'all' ? '전체' : f === 'low' ? '재고 부족' : '품절'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상품/옵션</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">재고</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">예약</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">가용</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">안전재고</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <Warehouse className="w-8 h-8 mx-auto mb-2" />
                  재고 데이터가 없습니다
                </td>
              </tr>
            ) : items.map((item) => {
              const status = getStockStatus(item);
              const available = item.quantity - item.reserved_quantity;
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 line-clamp-1">
                      {(item.option as Record<string, unknown>)?.product ? ((item.option as Record<string, unknown>).product as Record<string, unknown>)?.product_name as string : '-'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(item.option as Record<string, unknown>)?.option_name as string} {(item.option as Record<string, unknown>)?.option_value ? `/ ${(item.option as Record<string, unknown>).option_value}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{(item.option as Record<string, unknown>)?.sku as string || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {editingId === item.product_option_id ? (
                      <input
                        type="number"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center border border-gray-300 rounded text-sm"
                        autoFocus
                      />
                    ) : (
                      <span className={`text-sm font-medium ${item.quantity <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.quantity}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{item.reserved_quantity}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{available}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{item.safety_stock}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === item.product_option_id ? (
                      <button
                        onClick={() => handleSave(item.product_option_id)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => { setEditingId(item.product_option_id); setEditQuantity(item.quantity); }}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
