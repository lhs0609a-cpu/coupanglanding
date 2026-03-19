'use client';

import { useState } from 'react';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_BG_COLORS, CHANNEL_COMMISSION_RATES } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import { Check, Loader2, Globe, ShoppingBag, Truck, AlertTriangle } from 'lucide-react';

export default function SourcingRegisterPage() {
  const [sellType, setSellType] = useState<'dropshipping' | 'wholesale'>('dropshipping');
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['coupang', 'naver']);
  const [marginRate, setMarginRate] = useState(30);
  const [registering, setRegistering] = useState(false);
  const [brandWarning, setBrandWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleChannel = (ch: Channel) => {
    setSelectedChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">소싱 상품 등록</h1>
        <p className="text-sm text-gray-500 mt-1">해외 소싱 상품을 국내 쇼핑몰에 등록합니다</p>
      </div>

      {/* 브랜드 경고 */}
      {brandWarning && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-800">지재권 경고</p>
            <p className="text-xs text-orange-600 mt-0.5">{brandWarning}</p>
          </div>
        </div>
      )}

      {/* 판매 방식 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">판매 방식</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSellType('dropshipping')}
            className={`p-4 rounded-lg border-2 text-left transition ${
              sellType === 'dropshipping' ? 'border-[#E31837] bg-red-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Globe className="w-6 h-6 text-[#E31837] mb-2" />
            <p className="font-medium text-gray-900">드랍쉬핑</p>
            <p className="text-xs text-gray-500 mt-1">주문 발생 시 알리에서 직배송</p>
          </button>
          <button
            onClick={() => setSellType('wholesale')}
            className={`p-4 rounded-lg border-2 text-left transition ${
              sellType === 'wholesale' ? 'border-[#E31837] bg-red-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Truck className="w-6 h-6 text-[#E31837] mb-2" />
            <p className="font-medium text-gray-900">사입</p>
            <p className="text-xs text-gray-500 mt-1">미리 사입 후 국내 창고에서 발송</p>
          </button>
        </div>
      </div>

      {/* 마진율 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">마진 설정</h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={10}
            max={100}
            value={marginRate}
            onChange={(e) => setMarginRate(parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-lg font-bold text-[#E31837] min-w-[4rem] text-right">{marginRate}%</span>
        </div>
      </div>

      {/* 채널 선택 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">등록 채널</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => toggleChannel(ch)}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${
                selectedChannels.includes(ch) ? 'border-[#E31837] bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }} />
              <span className="text-sm font-medium text-gray-900">{CHANNEL_LABELS[ch]}</span>
              {selectedChannels.includes(ch) && <Check className="w-4 h-4 text-[#E31837] ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* 배송 안내 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">배송 안내</h2>
        <p className="text-sm text-gray-500">
          {sellType === 'dropshipping'
            ? '해외배송 상품으로 자동 설정됩니다. 배송기간: 7~15일'
            : '국내배송 상품으로 설정됩니다. 일반 배송 안내 적용'}
        </p>
      </div>

      {/* 오류/성공 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-600">소싱 등록이 완료되었습니다.</p>
        </div>
      )}

      {/* 실행 */}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            setRegistering(true);
            setError(null);
            setSuccess(false);
            try {
              const params = new URLSearchParams(window.location.search);
              const productId = params.get('productId');
              const quantity = parseInt(params.get('quantity') || '1', 10);
              const selectedPlatform = params.get('platform') || 'aliexpress';
              if (!productId) {
                setError('상품 ID가 없습니다.');
                setRegistering(false);
                return;
              }
              const res = await fetch('/api/megaload/sourcing/auto-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sourcingProductId: productId,
                  quantity,
                  platform: selectedPlatform,
                  orderType: sellType,
                }),
              });
              if (res.ok) {
                setSuccess(true);
              } else {
                const err = await res.json();
                setError(err.error || '등록 실패');
              }
            } catch {
              setError('네트워크 오류가 발생했습니다.');
            }
            setRegistering(false);
          }}
          disabled={registering || selectedChannels.length === 0}
          className="flex items-center gap-2 px-6 py-3 text-white bg-[#E31837] rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
        >
          {registering && <Loader2 className="w-4 h-4 animate-spin" />}
          <ShoppingBag className="w-4 h-4" />
          {selectedChannels.length}개 채널에 등록
        </button>
      </div>
    </div>
  );
}
