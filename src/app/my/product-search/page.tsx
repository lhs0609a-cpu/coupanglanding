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
} from 'lucide-react';

// ── Constants ───────────────────────────────────────────
const GOOGLE_SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms';
const CACHE_KEY = 'product_search_cache';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const MAX_RESULTS = 50;

// ── Types ───────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  image: string;
  url: string;
  date: string;
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
}

type PriceSort = 'sim' | 'asc' | 'dsc';

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
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const products: Product[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 2) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = fields[idx] || '';
    });

    // Auto-detect fields
    let id = '';
    let name = '';
    let image = '';
    let url = '';
    let date = '';

    for (let j = 0; j < fields.length; j++) {
      const val = fields[j];
      const header = (headers[j] || '').toLowerCase();

      if (!id && (header.includes('id') || header.includes('번호') || header === 'no')) {
        id = val;
      } else if (!name && (header.includes('name') || header.includes('상품명') || header.includes('이름') || header.includes('제목'))) {
        name = val;
      } else if (!image && (isImageUrl(val) || header.includes('image') || header.includes('이미지') || header.includes('썸네일'))) {
        image = val;
      } else if (!url && (isProductUrl(val) || header.includes('url') || header.includes('링크'))) {
        url = val;
      } else if (!date && (isDateLike(val) || header.includes('date') || header.includes('날짜') || header.includes('등록일'))) {
        date = val;
      }
    }

    // Fallback: first field as ID, second as name
    if (!id) id = fields[0] || String(i);
    if (!name) name = fields[1] || fields[0] || `상품 ${i}`;

    products.push({ id, name, image, url, date, raw });
  }

  return products;
}

// ── Page Component ──────────────────────────────────────
export default function ProductSearchPage() {
  const [products, setProducts] = useState<Product[]>([]);
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

  // Filtered products
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return products.slice(0, MAX_RESULTS);
    const term = debouncedSearch.toLowerCase();
    return products
      .filter((p) => p.id.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [products, debouncedSearch]);

  // Load from cache or sync
  const syncProducts = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
            setProducts(data);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/naver-shopping/google-sheets-proxy?sheetId=${GOOGLE_SHEET_ID}&gid=0`);
      if (!res.ok) throw new Error('시트 데이터를 가져오지 못했습니다.');
      const csv = await res.text();
      const parsed = parseProducts(csv);
      setProducts(parsed);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsed, timestamp: Date.now() }));
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

  // Price comparison
  const handlePriceCompare = async (product: Product, sort: PriceSort = 'sim') => {
    setPriceModalProduct(product);
    setPriceModalOpen(true);
    setPriceLoading(true);
    setPriceSort(sort);
    setPriceResults([]);

    try {
      const res = await fetch(
        `/api/naver-shopping/search?query=${encodeURIComponent(product.name)}&display=30&sort=${sort}`,
      );
      if (!res.ok) throw new Error('검색 실패');
      const data = await res.json();
      setPriceResults(data.items || []);
    } catch {
      setPriceResults([]);
    } finally {
      setPriceLoading(false);
    }
  };

  const handleSortChange = (sort: PriceSort) => {
    if (priceModalProduct) {
      handlePriceCompare(priceModalProduct, sort);
    }
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
    { key: 'sim', label: '정확도' },
    { key: 'asc', label: '낮은가격' },
    { key: 'dsc', label: '높은가격' },
  ];

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
        </div>
        <button
          type="button"
          onClick={() => syncProducts(true)}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '동기화 중...' : '시트 동기화'}
        </button>
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
          {debouncedSearch && (
            <p className="text-sm text-gray-500">
              검색 결과: <span className="font-bold text-gray-900">{filteredProducts.length}건</span>
              {filteredProducts.length >= MAX_RESULTS && ` (최대 ${MAX_RESULTS}건 표시)`}
            </p>
          )}

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
              <p className="text-sm">검색 중...</p>
            </div>
          ) : priceResults.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              <Package className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">검색 결과가 없습니다.</p>
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
                    <p
                      className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-[#E31837] transition"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.title) }}
                    />
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
