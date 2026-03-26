'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface BankImageEntry {
  id: string;
  cdn_url: string;
  original_filename: string;
}

interface StockImageSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryKey: string;
  categoryLabel: string;
  currentImageUrl: string;
  onSelect: (cdnUrl: string) => void;
}

// 카테고리별 캐시 (모달 재오픈 시 재요청 방지)
const bankImageCache = new Map<string, BankImageEntry[]>();

export default function StockImageSwapModal({
  isOpen,
  onClose,
  categoryKey,
  categoryLabel,
  currentImageUrl,
  onSelect,
}: StockImageSwapModalProps) {
  const [images, setImages] = useState<BankImageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchedKey = useRef('');

  useEffect(() => {
    if (!isOpen || !categoryKey) return;
    if (fetchedKey.current === categoryKey && images.length > 0) return;

    // 캐시 확인
    const cached = bankImageCache.get(categoryKey);
    if (cached) {
      setImages(cached);
      fetchedKey.current = categoryKey;
      return;
    }

    setLoading(true);
    setError('');

    fetch(`/api/megaload/products/stock-images/bank?category=${encodeURIComponent(categoryKey)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { images: BankImageEntry[] }) => {
        setImages(data.images);
        bankImageCache.set(categoryKey, data.images);
        fetchedKey.current = categoryKey;
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : '이미지 로드 실패');
      })
      .finally(() => setLoading(false));
  }, [isOpen, categoryKey, images.length]);

  const handleSelect = (cdnUrl: string) => {
    onSelect(cdnUrl);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${categoryLabel} 스톡 이미지 선택`} maxWidth="max-w-3xl">
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">이미지 로딩 중...</span>
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : images.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          등록된 이미지가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
          {images.map(img => {
            const isSelected = img.cdn_url === currentImageUrl;
            return (
              <button
                key={img.id}
                onClick={() => handleSelect(img.cdn_url)}
                className={`relative rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                  isSelected
                    ? 'border-[#E31837] ring-2 ring-[#E31837] ring-offset-1'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <img
                  src={img.cdn_url}
                  alt={img.original_filename}
                  className="w-full aspect-square object-cover bg-gray-100"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-[#E31837]/10 flex items-center justify-center">
                    <span className="bg-[#E31837] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      현재 선택
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
