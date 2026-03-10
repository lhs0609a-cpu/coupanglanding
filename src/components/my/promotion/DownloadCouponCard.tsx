'use client';

import { useState, useEffect } from 'react';
import { Download, ChevronDown, Copy } from 'lucide-react';
import Card from '@/components/ui/Card';
import type { CoupangCoupon } from '@/lib/utils/coupang-api-client';

interface DownloadCouponCardProps {
  enabled: boolean;
  autoCreate: boolean;
  couponId: string;
  couponName: string;
  titleTemplate: string;
  durationDays: number;
  policies: Record<string, unknown>[];
  existingCoupons: CoupangCoupon[];
  onChange: (field: string, value: unknown) => void;
  onCopyPolicies: (couponId: number) => void;
  copyingPolicies: boolean;
}

export default function DownloadCouponCard({
  enabled,
  autoCreate,
  couponId,
  couponName,
  titleTemplate,
  durationDays,
  policies,
  existingCoupons,
  onChange,
  onCopyPolicies,
  copyingPolicies,
}: DownloadCouponCardProps) {
  const [expanded, setExpanded] = useState(enabled);

  // enabled prop이 비동기로 변경될 때 expanded 동기화
  useEffect(() => {
    if (enabled) setExpanded(true);
  }, [enabled]);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-900">다운로드 쿠폰</h3>
        </div>
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                onChange('download_coupon_enabled', e.target.checked);
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
              onClick={() => onChange('download_coupon_auto_create', true)}
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
              onClick={() => onChange('download_coupon_auto_create', false)}
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
                  onChange={(e) => onChange('download_coupon_title_template', e.target.value)}
                  placeholder="다운로드쿠폰 {date}"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">유효기간 (일)</label>
                <input
                  type="number"
                  value={durationDays}
                  onChange={(e) => onChange('download_coupon_duration_days', Number(e.target.value))}
                  min={1}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                />
              </div>

              {/* Copy policies from existing coupon */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  정책 복사 (기존 쿠폰에서)
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) onCopyPolicies(Number(e.target.value));
                    }}
                  >
                    <option value="">정책 복사할 쿠폰 선택...</option>
                    {existingCoupons.map((c) => (
                      <option key={c.couponId} value={String(c.couponId)}>
                        {c.couponName}
                      </option>
                    ))}
                  </select>
                  {copyingPolicies && (
                    <span className="text-xs text-gray-400 self-center">복사 중...</span>
                  )}
                </div>
                {policies.length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <Copy className="w-3 h-3" />
                      <span>{policies.length}개 정책 설정됨</span>
                    </div>
                    <pre className="text-[10px] text-gray-400 max-h-20 overflow-y-auto">
                      {JSON.stringify(policies, null, 2)}
                    </pre>
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
                  onChange('download_coupon_id', e.target.value);
                  onChange('download_coupon_name', sel?.couponName || '');
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
