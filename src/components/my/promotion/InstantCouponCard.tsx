'use client';

import { useState, useEffect } from 'react';
import { Zap, ChevronDown, AlertTriangle, Search } from 'lucide-react';
import Card from '@/components/ui/Card';
import { INSTANT_COUPON_MAX_ITEMS } from '@/lib/data/promotion-constants';
import type { CoupangCoupon } from '@/lib/utils/coupang-api-client';

interface InstantCouponCardProps {
  enabled: boolean;
  couponId: string;
  couponName: string;
  existingCoupons: CoupangCoupon[];
  onChange: (field: string, value: unknown) => void;
}

export default function InstantCouponCard({
  enabled,
  couponId,
  couponName,
  existingCoupons,
  onChange,
}: InstantCouponCardProps) {
  const [expanded, setExpanded] = useState(enabled);
  const [manualId, setManualId] = useState(couponId);

  useEffect(() => {
    if (enabled) setExpanded(true);
  }, [enabled]);

  // Sync manualId when couponId changes externally
  useEffect(() => {
    setManualId(couponId);
  }, [couponId]);

  const handleLoadCoupon = () => {
    if (!manualId.trim()) return;
    onChange('instant_coupon_id', manualId.trim());
    // Look up the name from existing coupons if available
    const found = existingCoupons.find((c) => String(c.couponId) === manualId.trim());
    if (found) {
      onChange('instant_coupon_name', found.couponName);
    }
  };

  const handleSelectExisting = (selectedId: string) => {
    if (!selectedId) return;
    const sel = existingCoupons.find((c) => String(c.couponId) === selectedId);
    onChange('instant_coupon_id', selectedId);
    onChange('instant_coupon_name', sel?.couponName || '');
    setManualId(selectedId);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          <h3 className="text-sm font-bold text-gray-900">즉시할인 쿠폰</h3>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                onChange('instant_coupon_enabled', e.target.checked);
                setExpanded(e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#E31837]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E31837]" />
          </label>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <ChevronDown className={`w-4 h-4 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && enabled && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Coupon ID input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">쿠폰 ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="쿠폰 ID를 입력하세요"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
              <button
                type="button"
                onClick={handleLoadCoupon}
                disabled={!manualId.trim()}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81530] transition disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                불러오기
              </button>
            </div>
          </div>

          {/* 10,000 item warning */}
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700">
              즉시할인 쿠폰은 1개당 최대 <strong>{INSTANT_COUPON_MAX_ITEMS.toLocaleString()}개</strong> 상품에 적용 가능합니다.
              상품 수가 초과되면 새로운 쿠폰이 필요합니다.
            </p>
          </div>

          {/* Coupon name memo */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">쿠폰명 메모</label>
            <input
              type="text"
              value={couponName}
              onChange={(e) => onChange('instant_coupon_name', e.target.value)}
              placeholder="쿠폰명을 입력하세요 (관리용)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          {/* Select from existing coupons */}
          {existingCoupons.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">기존 쿠폰에서 선택</label>
              <select
                value={couponId}
                onChange={(e) => handleSelectExisting(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              >
                <option value="">기존 쿠폰 선택...</option>
                {existingCoupons.map((c) => (
                  <option key={c.couponId} value={String(c.couponId)}>
                    {c.couponName} ({c.couponStatus})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Current selection display */}
          {couponId && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">
                선택된 쿠폰: <span className="font-medium text-gray-900">{couponName || couponId}</span>
                <span className="text-gray-400 ml-2">(ID: {couponId})</span>
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
