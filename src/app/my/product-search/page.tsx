'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import {
  Search,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  ShoppingCart,
  Package,
  ArrowUpDown,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { calculateSimilarity } from '@/lib/utils/string-similarity';

// ── Constants ───────────────────────────────────────────
const LOCAL_CSV_URL = '/data/product-list.csv';
const MAX_RESULTS = 50;

// ── Channel 정의 (CSV id prefix 기준) ──
// NAVER_BULK_DETAIL 을 NAVER_BULK 보다 먼저 매칭해야 하므로 순서 중요.
type ChannelKey = 'all' | 'coupang' | '11st' | 'naver' | 'naver_bulk' | 'naver_bulk_detail';

const CHANNELS: { key: ChannelKey; label: string; prefix: string | null }[] = [
  { key: 'all',               label: '전체',          prefix: null },
  { key: 'coupang',           label: '쿠팡',          prefix: 'COUPANG' },
  { key: '11st',              label: '11번가',        prefix: '11ST' },
  { key: 'naver',             label: '네이버',        prefix: 'NAVER' },
  { key: 'naver_bulk',        label: '네이버 벌크',    prefix: 'NAVER_BULK' },
  { key: 'naver_bulk_detail', label: '네이버 벌크 디테일', prefix: 'NAVER_BULK_DETAIL' },
];

// id → 채널 판정. 긴 prefix부터 검사해 NAVER_BULK_DETAIL 이 NAVER_BULK 보다 우선.
function detectChannel(id: string): ChannelKey {
  const up = id.toUpperCase();
  if (up.startsWith('NAVER_BULK_DETAIL')) return 'naver_bulk_detail';
  if (up.startsWith('NAVER_BULK')) return 'naver_bulk';
  if (up.startsWith('COUPANG')) return 'coupang';
  if (up.startsWith('11ST')) return '11st';
  if (up.startsWith('NAVER')) return 'naver';
  return 'all';
}

// ── Types ───────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  image: string;
  url: string;
  date: string;
  channel: ChannelKey;
  raw: Record<string, string>;
}

interface PriceResult {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  matchScore?: number;
}

type PriceSort = 'sim' | 'asc' | 'dsc' | 'match';

// ── CSV Parser ──────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function isImageUrl(val: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(val) || val.includes('thumbnail') || val.includes('image');
}

function isProductUrl(val: string): boolean {
  return /^https?:\/\//i.test(val) && !isImageUrl(val);
}

function isDateLike(val: string): boolean {
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val);
}

function parseProducts(csv: string): Product[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];

  const products: Product[] = [];

  // 헤더 없는 CSV: 컬럼 순서 고정 (0=고유번호, 1=상품명, 2=링크, 3=날짜)
  for (let i = 0; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 2) continue;

    // 값 기반 자동 감지 (헤더 없음 전제)
    let id = '';
    let name = '';
    let image = '';
    let url = '';
    let date = '';

    for (const val of fields) {
      if (!url && isProductUrl(val)) url = val;
      else if (!image && isImageUrl(val)) image = val;
      else if (!date && isDateLike(val)) date = val;
    }

    if (!id) id = fields[0] || String(i);
    if (!name) name = fields[1] || fields[0] || `상품 ${i}`;

    const raw: Record<string, string> = {};
    fields.forEach((v, idx) => { raw[String(idx)] = v; });

    products.push({ id, name, image, url, date, channel: detectChannel(id), raw });
  }

  return products;
}

// ── Page Component ──────────────────────────────────────
export default function ProductSearchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Price modal state
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceModalProduct, setPriceModalProduct] = useState<Product | null>(null);
  const [priceResults, setPriceResults] = useState<PriceResult[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSort, setPriceSort] = useState<PriceSort>('sim');

  // Clipboard feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Failed images tracking
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Image extraction state
  const [imageExtracting, setImageExtracting] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  // Filtered products — 공백/하이픈으로 토큰 분리 후 AND 매칭.
  //   '카포드' → '카포드' 포함 전체
  //   '6A4D'  → '6A4D' 포함 전체
  //   '카포드 6A4D-10336963077' → 세 토큰 모두 어딘가에 있어야 히트
  //   어느 토큰이든 id/name/url/raw 의 어느 필드에 있어도 매칭으로 인정.
  // 채널별 카운트 — 탭 옆 뱃지에 표시
  const channelCounts = useMemo(() => {
    const counts: Record<ChannelKey, number> = {
      all: products.length,
      coupang: 0, '11st': 0, naver: 0, naver_bulk: 0, naver_bulk_detail: 0,
    };
    for (const p of products) counts[p.channel] = (counts[p.channel] ?? 0) + 1;
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    // 1) 채널 필터 먼저 적용
    const byChannel = activeChannel === 'all'
      ? products
      : products.filter((p) => p.channel === activeChannel);

    // 2) 검색어 필터
    const raw = debouncedSearch.trim();
    if (!raw) return byChannel.slice(0, MAX_RESULTS);
    const tokens = raw.toLowerCase().split(/[\s\-]+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return byChannel.slice(0, MAX_RESULTS);

    return byChannel
      .filter((p) => {
        const haystack = [
          p.id,
          p.name,
          p.url,
          ...Object.values(p.raw || {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
      .slice(0, MAX_RESULTS);
  }, [products, activeChannel, debouncedSearch]);

  // 전체 매칭 수 (slice 전) — "n건 중 50건 표시" 용
  const totalMatchCount = useMemo(() => {
    const byChannel = activeChannel === 'all'
      ? products
      : products.filter((p) => p.channel === activeChannel);
    const raw = debouncedSearch.trim();
    if (!raw) return byChannel.length;
    const tokens = raw.toLowerCase().split(/[\s\-]+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return byChannel.length;
    return byChannel.filter((p) => {
      const haystack = [p.id, p.name, p.url, ...Object.values(p.raw || {})]
        .filter(Boolean).join(' ').toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    }).length;
  }, [products, activeChannel, debouncedSearch]);

  // Load from local static CSV (browser's HTTP cache handles caching automatically)
  const syncProducts = useCallback(async (force = false) => {
    setSyncing(true);
    setError(null);
    try {
      const url = force ? `${LOCAL_CSV_URL}?t=${Date.now()}` : LOCAL_CSV_URL;
      const res = await fetch(url);
      if (!res.ok) throw new Error('상품 데이터를 불러오지 못했습니다.');
      const csv = await res.text();
      const parsed = parseProducts(csv);
      setProducts(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '동기화 실패');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncProducts();
  }, [syncProducts]);

  // 현재 검색 결과(최대 MAX_RESULTS)에 대해서만 og:image 추출 — 대용량(39k+) 대응
  useEffect(() => {
    if (loading || filteredProducts.length === 0) return;
    const needImage = filteredProducts.filter((p) => !p.image && p.url);
    if (needImage.length === 0) return;

    setImageExtracting(true);
    const BATCH_SIZE = 5;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < needImage.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = needImage.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            const res = await fetch(
              `/api/naver-shopping/extract-product-image?url=${encodeURIComponent(p.url)}`,
            );
            if (!res.ok) return { id: p.id, image: '' };
            const data = await res.json();
            return { id: p.id, image: data.image || '' };
          }),
        );

        if (cancelled) break;

        const updates = new Map<string, string>();
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.image) {
            updates.set(r.value.id, r.value.image);
          }
        }

        if (updates.size > 0) {
          setProducts((prev) =>
            prev.map((p) => (updates.has(p.id) ? { ...p, image: updates.get(p.id)! } : p)),
          );
        }
      }
      if (!cancelled) setImageExtracting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, filteredProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price comparison error
  const [priceError, setPriceError] = useState<string | null>(null);

  // Price comparison
  const handlePriceCompare = async (product: Product, sort: PriceSort = 'asc') => {
    setPriceModalProduct(product);
    setPriceModalOpen(true);
    setPriceLoading(true);
    setPriceSort(sort);
    setPriceResults([]);
    setPriceError(null);

    try {
      // URL이 있으면 실제 페이지에서 상품명 추출 시도
      let searchQuery = product.name;
      if (product.url) {
        try {
          const nameRes = await fetch(
            `/api/naver-shopping/extract-product-name?url=${encodeURIComponent(product.url)}`,
          );
          if (nameRes.ok) {
            const nameData = await nameRes.json();
            if (nameData.name) searchQuery = nameData.name;
          }
        } catch { /* 실패 시 기존 이름 사용 */ }
      }

      const apiSort = sort === 'match' ? 'sim' : sort;
      const res = await fetch(
        `/api/naver-shopping/search?query=${encodeURIComponent(searchQuery)}&display=30&sort=${apiSort}`,
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `검색 실패 (${res.status})`);
      }
      const data = await res.json();
      const items: PriceResult[] = (data.items || []).map((item: PriceResult) => ({
        ...item,
        matchScore: calculateSimilarity(product.name, item.title),
      }));

      if (sort === 'match') {
        items.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      }

      setPriceResults(items);
      if (!items.length) {
        setPriceError('네이버 쇼핑에서 일치하는 상품을 찾지 못했습니다.');
      }
    } catch (err) {
      setPriceResults([]);
      setPriceError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
    } finally {
      setPriceLoading(false);
    }
  };

  const handleSortChange = (sort: PriceSort) => {
    if (!priceModalProduct) return;
    // 'match' 정렬은 기존 결과를 클라이언트에서 재정렬
    if (sort === 'match' && priceResults.length > 0) {
      setPriceSort(sort);
      setPriceResults((prev) =>
        [...prev].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)),
      );
      return;
    }
    handlePriceCompare(priceModalProduct, sort);
  };

  // Clipboard
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // HTML 새니타이즈: <b> 태그만 허용
  const sanitizeHtml = (html: string) => {
    return html.replace(/<(?!\/?b\b)[^>]*>/gi, '');
  };

  const formatPrice = (price: string) => {
    const num = parseInt(price, 10);
    if (isNaN(num)) return price;
    return num.toLocaleString('ko-KR') + '원';
  };

  const sortTabs: { key: PriceSort; label: string }[] = [
    { key: 'asc', label: '낮은가격' },
    { key: 'dsc', label: '높은가격' },
    { key: 'sim', label: '정확도' },
    { key: 'match', label: '이름일치' },
  ];

  const getMatchBadge = (score: number) => {
    if (score >= 90) return { text: `${score}%`, color: 'bg-green-100 text-green-700' };
    if (score >= 70) return { text: `${score}%`, color: 'bg-blue-100 text-blue-700' };
    if (score >= 50) return { text: `${score}%`, color: 'bg-yellow-100 text-yellow-700' };
    return { text: `${score}%`, color: 'bg-gray-100 text-gray-500' };
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Search className="w-6 h-6 text-[#E31837]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">상품검색</h1>
            <p className="text-sm text-gray-500">등록 상품 검색 및 가격비교</p>
          </div>
          <Badge label={`${products.length}개`} colorClass="bg-gray-100 text-gray-700" />
          {imageExtracting && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              이미지 로딩
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => syncProducts(true)}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '불러오는 중...' : '데이터 새로고침'}
        </button>
      </div>

      {/* Channel Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200">
        {CHANNELS.map((ch) => {
          const active = activeChannel === ch.key;
          const count = channelCounts[ch.key] ?? 0;
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => setActiveChannel(ch.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${
                active
                  ? 'border-[#E31837] text-[#E31837]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {ch.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                active ? 'bg-[#E31837]/10 text-[#E31837]' : 'bg-gray-100 text-gray-500'
              }`}>
                {count.toLocaleString('ko-KR')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="상품 ID 또는 상품명으로 검색..."
          className="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] transition"
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm">
          <Package className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p>상품 데이터를 불러오는 중...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3" />
          <p>{debouncedSearch ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {debouncedSearch ? '검색 결과: ' : `${CHANNELS.find((c) => c.key === activeChannel)?.label}: `}
            <span className="font-bold text-gray-900">{totalMatchCount.toLocaleString('ko-KR')}건</span>
            {totalMatchCount > MAX_RESULTS && ` (최대 ${MAX_RESULTS}건 표시)`}
          </p>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, idx) => (
                <motion.div
                  key={product.id + '-' + idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.03, duration: 0.3 }}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition"
                >
                  {/* Image */}
                  <div className="w-full h-[140px] bg-gray-50 flex items-center justify-center overflow-hidden">
                    {product.image && !failedImages.has(product.id + '-' + idx) ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-contain"
                        onError={() => {
                          setFailedImages((prev) => new Set(prev).add(product.id + '-' + idx));
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-300">
                        <ImageOff className="w-10 h-10" />
                        <span className="text-xs mt-1">이미지 없음</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight min-h-[2.5rem]">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {product.id}
                      </span>
                      {product.date && <span>{product.date}</span>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePriceCompare(product)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        가격비교
                      </button>
                      {product.url && (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                          title="상품 페이지"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyId(product.id)}
                        className="flex items-center justify-center p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                        title="ID 복사"
                      >
                        {copiedId === product.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Price Comparison Modal */}
      <Modal
        isOpen={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        title={priceModalProduct ? `가격비교: ${priceModalProduct.name}` : '가격비교'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {/* Sort Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {sortTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleSortChange(tab.key)}
                className={`flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 transition ${
                  priceSort === tab.key
                    ? 'border-[#E31837] text-[#E31837]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Results */}
          {priceLoading ? (
            <div className="py-8 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">네이버 쇼핑 검색 중...</p>
            </div>
          ) : priceResults.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              <Package className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{priceError || '검색 결과가 없습니다.'}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {priceResults.map((item, idx) => (
                <motion.a
                  key={item.productId || idx}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-[#E31837]/30 hover:bg-red-50/30 transition group"
                >
                  {/* Thumbnail */}
                  <div className="w-[80px] h-[80px] flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImageOff className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5">
                      <p
                        className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-[#E31837] transition flex-1"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.title) }}
                      />
                      {item.matchScore != null && (() => {
                        const badge = getMatchBadge(item.matchScore);
                        return (
                          <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.color}`}>
                            {badge.text}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-lg font-bold text-[#E31837]">
                        {formatPrice(item.lprice)}
                      </span>
                      {item.hprice && item.hprice !== '0' && (
                        <span className="text-xs text-gray-400 line-through">
                          {formatPrice(item.hprice)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{item.mallName}</p>
                  </div>

                  <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#E31837] flex-shrink-0 transition" />
                </motion.a>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
