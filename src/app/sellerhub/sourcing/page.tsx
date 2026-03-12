'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SOURCING_PLATFORM_LABELS, SOURCING_PLATFORM_COLORS } from '@/lib/sellerhub/constants';
import { Globe, Search, Image, Link as LinkIcon, Heart, ShoppingBag, Loader2, Star, AlertTriangle } from 'lucide-react';

interface SourcingResult {
  id: string;
  platform: string;
  title: string;
  price_cny: number;
  image_url: string;
  supplier_name: string;
  supplier_rating: number;
  sales_count: number;
  url: string;
}

export default function SourcingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [searchMode, setSearchMode] = useState<'url' | 'keyword' | 'image'>('keyword');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SourcingResult[]>([]);
  const [platform, setPlatform] = useState<'aliexpress' | 'ali1688'>('aliexpress');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);

    // URL 자동 감지
    if (query.includes('aliexpress.com') || query.includes('1688.com')) {
      // URL 입력 → 상품 상세 가져오기
      const detectedPlatform = query.includes('1688.com') ? 'ali1688' : 'aliexpress';
      try {
        const res = await fetch('/api/sellerhub/sourcing/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: query, platform: detectedPlatform }),
        });
        const data = await res.json();
        if (data.product) {
          setResults([data.product]);
        }
      } catch {
        // Handle error
      }
    } else {
      // 키워드 검색
      try {
        const res = await fetch('/api/sellerhub/sourcing/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: query, platform }),
        });
        const data = await res.json();
        setResults(data.products || []);
      } catch {
        // Handle error
      }
    }

    setLoading(false);
  };

  const addToWishlist = async (product: SourcingResult) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return;

    await supabase.from('sh_sourcing_wishlist').upsert({
      sellerhub_user_id: (shUser as Record<string, unknown>).id,
      platform: product.platform,
      platform_product_id: product.id,
      product_url: product.url,
      title: product.title,
      image_url: product.image_url,
      price_cny: product.price_cny,
      supplier_name: product.supplier_name,
    }, { onConflict: 'sellerhub_user_id,platform,platform_product_id' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">해외소싱</h1>
        <p className="text-sm text-gray-500 mt-1">알리익스프레스 / 1688 상품 소싱</p>
      </div>

      {/* 검색 영역 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          {(['keyword', 'url', 'image'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSearchMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition ${
                searchMode === mode ? 'bg-[#E31837] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {mode === 'keyword' && <><Search className="w-3.5 h-3.5" />키워드</>}
              {mode === 'url' && <><LinkIcon className="w-3.5 h-3.5" />URL</>}
              {mode === 'image' && <><Image className="w-3.5 h-3.5" />이미지</>}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'aliexpress' | 'ali1688')}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
            >
              <option value="aliexpress">AliExpress</option>
              <option value="ali1688">1688</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={
              searchMode === 'url'
                ? '알리익스프레스 또는 1688 상품 URL 붙여넣기...'
                : searchMode === 'image'
                  ? '이미지 URL 입력...'
                  : '검색어 입력 (한국어 → 자동 번역)...'
            }
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 bg-[#E31837] text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((product) => (
            <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition">
              <div className="aspect-square bg-gray-100 relative">
                {product.image_url && (
                  <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => addToWishlist(product)}
                  className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full hover:bg-white transition"
                >
                  <Heart className="w-4 h-4 text-gray-600" />
                </button>
                <span className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-medium rounded ${SOURCING_PLATFORM_COLORS[product.platform]}`}>
                  {SOURCING_PLATFORM_LABELS[product.platform]}
                </span>
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{product.title}</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-[#E31837]">¥{product.price_cny}</span>
                  <span className="text-xs text-gray-500">≈ ₩{Math.round(product.price_cny * 190).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-yellow-500" />{product.supplier_rating}
                  </span>
                  <span>{product.supplier_name}</span>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/sellerhub/sourcing/register?productId=${product.id}&platform=${product.platform}`}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />등록
                  </a>
                  <a
                    href={`/sellerhub/sourcing/simulator?cost=${product.price_cny}`}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    시뮬레이터
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Globe className="w-8 h-8 mx-auto mb-2" />
          검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}
