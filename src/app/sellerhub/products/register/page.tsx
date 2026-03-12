'use client';

import { useState } from 'react';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_BG_COLORS, CHANNEL_COMMISSION_RATES } from '@/lib/sellerhub/constants';
import type { Channel } from '@/lib/sellerhub/types';
import { Check, Loader2 } from 'lucide-react';

export default function ProductRegisterPage() {
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(CHANNELS.filter((c) => c !== 'coupang'));
  const [priceMode, setPriceMode] = useState<'same' | 'custom'>('same');
  const [registering, setRegistering] = useState(false);
  const [results, setResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [channelPrices, setChannelPrices] = useState<Record<string, number>>({});

  const toggleChannel = (channel: Channel) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">채널 등록 설정</h1>
        <p className="text-sm text-gray-500 mt-1">상품을 등록할 채널과 가격 설정을 선택하세요</p>
      </div>

      {/* 채널 선택 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">등록 채널 선택</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CHANNELS.filter((c) => c !== 'coupang').map((ch) => (
            <button
              key={ch}
              onClick={() => toggleChannel(ch)}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${
                selectedChannels.includes(ch)
                  ? 'border-[#E31837] bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }}
              />
              <span className="text-sm font-medium text-gray-900">{CHANNEL_LABELS[ch]}</span>
              {selectedChannels.includes(ch) && <Check className="w-4 h-4 text-[#E31837] ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* 가격 설정 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">가격 설정</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="priceMode"
              checked={priceMode === 'same'}
              onChange={() => setPriceMode('same')}
              className="text-[#E31837]"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">쿠팡과 동일 가격</p>
              <p className="text-xs text-gray-500">모든 채널에 쿠팡 판매가를 그대로 적용</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="priceMode"
              checked={priceMode === 'custom'}
              onChange={() => setPriceMode('custom')}
              className="text-[#E31837]"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">수수료 보정 가격</p>
              <p className="text-xs text-gray-500">채널별 수수료율을 반영하여 가격 자동 조정</p>
            </div>
          </label>
        </div>

        {priceMode === 'custom' && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-3">채널별 수수료율 (자동 적용)</p>
            <div className="grid grid-cols-2 gap-2">
              {selectedChannels.map((ch) => (
                <div key={ch} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{CHANNEL_LABELS[ch]}</span>
                  <span className="font-medium">{CHANNEL_COMMISSION_RATES[ch]}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* 등록 결과 */}
      {Object.keys(results).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">등록 결과</h2>
          <div className="space-y-2">
            {Object.entries(results).map(([ch, result]) => (
              <div key={ch} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">{CHANNEL_LABELS[ch as Channel]}</span>
                <span className={`text-sm font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                  {result.success ? '성공' : result.error || '실패'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 실행 */}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            setRegistering(true);
            setError(null);
            try {
              const params = new URLSearchParams(window.location.search);
              const productId = params.get('productId');
              if (!productId) {
                setError('상품 ID가 없습니다.');
                setRegistering(false);
                return;
              }
              const res = await fetch(`/api/sellerhub/products/${productId}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  channels: selectedChannels,
                  priceMode,
                  prices: channelPrices,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                setResults(data.results);
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
          {selectedChannels.length}개 채널에 등록
        </button>
      </div>
    </div>
  );
}
