'use client';

import { useState, useEffect } from 'react';
import { Zap, ChevronDown } from 'lucide-react';
import Card from '@/components/ui/Card';
import { DISCOUNT_TYPE_LABELS } from '@/lib/data/promotion-constants';
import type { CoupangCoupon, CoupangContract } from '@/lib/utils/coupang-api-client';

interface InstantCouponCardProps {
  enabled: boolean;
  autoCreate: boolean;
  couponId: string;
  couponName: string;
  titleTemplate: string;
  durationDays: number;
  discount: number;
  discountType: 'RATE' | 'FIXED';
  maxDiscount: number;
  contracts: CoupangContract[];
  existingCoupons: CoupangCoupon[];
  onChange: (field: string, value: unknown) => void;
}

export default function InstantCouponCard({
  enabled,
  autoCreate,
  couponId,
  couponName,
  titleTemplate,
  durationDays,
  discount,
  discountType,
  maxDiscount,
  contracts,
  existingCoupons,
  onChange,
}: InstantCouponCardProps) {
  const [expanded, setExpanded] = useState(enabled);

  // enabled prop이 비동기로 변경될 때 expanded 동기화
  useEffect(() => {
    if (enabled) setExpanded(true);
  }, [enabled]);

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
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange('instant_coupon_auto_create', true)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition ${
                autoCreate
                  ? 'border-[#E31837] bg-red-50 text-[#E31837]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              자동 생성
            </button>
            <button
              type="button"
              onClick={() => onChange('instant_coupon_auto_create', false)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition ${
                !autoCreate
                  ? 'border-[#E31837] bg-red-50 text-[#E31837]'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              기존 쿠폰 선택
            </button>
          </div>

          {autoCreate ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">쿠폰명 템플릿</label>
                <input
                  type="text"
                  value={titleTemplate}
                  onChange={(e) => onChange('instant_coupon_title_template', e.target.value)}
                  placeholder="즉시할인 {date}"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">할인 타입</label>
                  <select
                    value={discountType}
                    onChange={(e) => onChange('instant_coupon_discount_type', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                  >
                    {Object.entries(DISCOUNT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    할인값 {discountType === 'RATE' ? '(%)' : '(원)'}
                  </label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => onChange('instant_coupon_discount', Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">유효기간 (일)</label>
                  <input
                    type="number"
                    value={durationDays}
                    onChange={(e) => onChange('instant_coupon_duration_days', Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                  />
                </div>
                {discountType === 'RATE' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">최대 할인액 (원)</label>
                    <input
                      type="number"
                      value={maxDiscount}
                      onChange={(e) => onChange('instant_coupon_max_discount', Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">기존 쿠폰 선택</label>
              <select
                value={couponId}
                onChange={(e) => {
                  const sel = existingCoupons.find((c) => String(c.couponId) === e.target.value);
                  onChange('instant_coupon_id', e.target.value);
                  onChange('instant_coupon_name', sel?.couponName || '');
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              >
                <option value="">쿠폰을 선택하세요</option>
                {existingCoupons.map((c) => (
                  <option key={c.couponId} value={String(c.couponId)}>
                    {c.couponName} ({c.couponStatus})
                  </option>
                ))}
              </select>
              {couponName && (
                <p className="text-xs text-gray-500 mt-1">선택됨: {couponName}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
