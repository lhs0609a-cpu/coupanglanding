'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SOURCING_PLATFORM_LABELS, SOURCING_PLATFORM_COLORS } from '@/lib/sellerhub/constants';
import { Heart, Trash2, ExternalLink, ShoppingBag, AlertTriangle } from 'lucide-react';

interface WishlistItem {
  id: string;
  platform: string;
  platform_product_id: string;
  product_url: string;
  title: string;
  image_url: string;
  price_cny: number;
  price_krw: number;
  last_price_cny: number;
  price_changed: boolean;
  supplier_name: string;
  notes: string;
  created_at: string;
}

export default function WishlistPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    const { data } = await supabase
      .from('sh_sourcing_wishlist')
      .select('*')
      .eq('sellerhub_user_id', (shUser as Record<string, unknown>).id)
      .order('created_at', { ascending: false });

    setItems((data as unknown as WishlistItem[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

  const removeItem = async (id: string) => {
    await supabase.from('sh_sourcing_wishlist').delete().eq('id', id);
    fetchWishlist();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">찜 목록</h1>
        <p className="text-sm text-gray-500 mt-1">관심 소싱 상품 {items.length}개</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Heart className="w-8 h-8 mx-auto mb-2" />
          찜한 상품이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="aspect-square bg-gray-100 relative">
                {item.image_url && (
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                )}
                {item.price_changed && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded">
                    <AlertTriangle className="w-3 h-3" />가격 변동
                  </div>
                )}
                <span className={`absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded ${SOURCING_PLATFORM_COLORS[item.platform]}`}>
                  {SOURCING_PLATFORM_LABELS[item.platform]}
                </span>
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{item.title}</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-[#E31837]">¥{item.price_cny}</span>
                  {item.price_changed && item.last_price_cny && (
                    <span className="text-xs text-gray-400 line-through">¥{item.last_price_cny}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/sellerhub/sourcing/register?productId=${item.platform_product_id}&platform=${item.platform}`}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />등록
                  </a>
                  {item.product_url && (
                    <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                    </a>
                  )}
                  <button onClick={() => removeItem(item.id)} className="p-1.5 border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-300">
                    <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
