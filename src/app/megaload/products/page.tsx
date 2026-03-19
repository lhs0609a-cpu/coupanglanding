'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_SHORT_LABELS, CHANNEL_STATUS_LABELS } from '@/lib/megaload/constants';
import type { Channel, MasterProduct, ProductChannel } from '@/lib/megaload/types';
import { Package, Search, RefreshCw, ChevronLeft, ChevronRight, Upload, PlusCircle, MoreHorizontal, FolderUp, List } from 'lucide-react';
import BulkRegisterPanel from '@/components/megaload/BulkRegisterPanel';

type Tab = 'list' | 'bulk';

export default function ProductsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>('list');
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const PAGE_SIZE = 20;

  const fetchProducts = useCallback(async () => {
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

    let query = supabase
      .from('sh_products')
      .select('*, sh_product_options(*), sh_product_channels(*)', { count: 'exact' })
      .eq('megaload_user_id', (shUser as Record<string, unknown>).id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (search) {
      query = query.ilike('product_name', `%${search}%`);
    }

    const { data, count } = await query;
    setProducts((data as unknown as MasterProduct[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [supabase, page, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const getChannelStatus = (channels: ProductChannel[] | undefined, channel: Channel): string => {
    const ch = channels?.find((c) => c.channel === channel);
    return ch ? ch.status : 'not_registered';
  };

  const getChannelDot = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'suspended': return 'bg-orange-500';
      default: return 'bg-gray-300';
    }
  };

  const handleBulkRegister = async () => {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      await fetch(`/api/megaload/products/${id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: CHANNELS.filter((c) => c !== 'coupang') }),
      });
    }
    await fetchProducts();
    setSelectedIds([]);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'list', label: '상품 목록', icon: <List className="w-4 h-4" /> },
    { key: 'bulk', label: '대량 등록', icon: <FolderUp className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">상품관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tab === 'list' ? `마스터 상품 ${total}개` : '로컬 소싱 폴더에서 상품을 스캔하여 쿠팡에 대량 등록합니다.'}
          </p>
        </div>
        {tab === 'list' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetch('/api/megaload/products/sync-coupang', { method: 'POST' }).then(() => fetchProducts())}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
              쿠팡 동기화
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <Upload className="w-4 h-4" />
              엑셀 등록
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition">
              <PlusCircle className="w-4 h-4" />
              퀵 등록
            </button>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 탭 내용 */}
      {tab === 'list' && (
        <>
          {/* 검색/필터 */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="상품명 검색..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as Channel | '')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">전체 채널</option>
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>{CHANNEL_SHORT_LABELS[ch]}</option>
              ))}
            </select>
          </div>

          {/* 일괄 처리 바 */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-blue-700">{selectedIds.length}개 선택</span>
              <button onClick={handleBulkRegister} className="px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700">
                전채널 등록
              </button>
              <button className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                일괄 품절
              </button>
              <button className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                가격 변경
              </button>
            </div>
          )}

          {/* 상품 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === products.length && products.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상품</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">가격</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">채널 현황</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">옵션</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      불러오는 중...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <Package className="w-8 h-8 mx-auto mb-2" />
                      등록된 상품이 없습니다
                    </td>
                  </tr>
                ) : products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm line-clamp-1">{product.product_name}</div>
                      {product.display_name && (
                        <div className="text-xs text-gray-500">{product.display_name}</div>
                      )}
                      {product.coupang_product_id && (
                        <div className="text-xs text-gray-400">쿠팡 #{product.coupang_product_id}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {product.options?.[0]?.sale_price?.toLocaleString() || '-'}원
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {CHANNELS.map((ch) => {
                          const status = getChannelStatus(product.channels, ch);
                          return (
                            <div
                              key={ch}
                              className="group relative"
                              title={`${CHANNEL_SHORT_LABELS[ch]}: ${CHANNEL_STATUS_LABELS[status]}`}
                            >
                              <div className={`w-3 h-3 rounded-full ${getChannelDot(status)}`} />
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                      {product.options?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100">
                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{total}개 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'bulk' && <BulkRegisterPanel />}
    </div>
  );
}
