'use client';

import { useState } from 'react';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_COMMISSION_RATES, CHANNEL_BG_COLORS } from '@/lib/sellerhub/constants';
import type { Channel } from '@/lib/sellerhub/types';
import { Calculator, TrendingUp } from 'lucide-react';

export default function SimulatorPage() {
  const [costCny, setCostCny] = useState(10);
  const [exchangeRate, setExchangeRate] = useState(190);
  const [marginRate, setMarginRate] = useState(30);
  const [shippingFee, setShippingFee] = useState(3000);
  const [sellType, setSellType] = useState<'dropshipping' | 'wholesale'>('dropshipping');

  const calculate = (channel: Channel) => {
    const costKrw = costCny * exchangeRate;
    const commissionRate = CHANNEL_COMMISSION_RATES[channel] / 100;
    const totalCost = costKrw + shippingFee;
    const salePrice = Math.ceil(totalCost * (1 + marginRate / 100) / (1 - commissionRate) / 10) * 10;
    const commission = Math.round(salePrice * commissionRate);
    const profit = salePrice - commission - totalCost;
    const profitRate = salePrice > 0 ? Math.round((profit / salePrice) * 1000) / 10 : 0;
    return { salePrice, commission, profit, profitRate, costKrw: Math.round(costKrw), totalCost };
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">판매가 시뮬레이터</h1>
        <p className="text-sm text-gray-500 mt-1">채널별 실수령액을 미리 계산해보세요</p>
      </div>

      {/* 입력 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">원가 (CNY)</label>
            <input
              type="number"
              value={costCny}
              onChange={(e) => setCostCny(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">환율 (₩/¥)</label>
            <input
              type="number"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">마진율 (%)</label>
            <input
              type="number"
              value={marginRate}
              onChange={(e) => setMarginRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">배송비 (₩)</label>
            <input
              type="number"
              value={shippingFee}
              onChange={(e) => setShippingFee(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">판매 방식</label>
            <select
              value={sellType}
              onChange={(e) => setSellType(e.target.value as 'dropshipping' | 'wholesale')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="dropshipping">드랍쉬핑</option>
              <option value="wholesale">사입</option>
            </select>
          </div>
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            원가: <strong>¥{costCny}</strong> = <strong>₩{Math.round(costCny * exchangeRate).toLocaleString()}</strong>
            {' | '}총 원가(배송 포함): <strong>₩{(Math.round(costCny * exchangeRate) + shippingFee).toLocaleString()}</strong>
          </p>
        </div>
      </div>

      {/* 채널별 결과 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CHANNELS.map((ch) => {
          const result = calculate(ch);
          return (
            <div key={ch} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }} />
                <h3 className="font-medium text-gray-900">{CHANNEL_LABELS[ch]}</h3>
                <span className="text-xs text-gray-400 ml-auto">수수료 {CHANNEL_COMMISSION_RATES[ch]}%</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">판매가</span>
                  <span className="font-bold text-gray-900">₩{result.salePrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">수수료</span>
                  <span className="text-red-600">-₩{result.commission.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">원가+배송</span>
                  <span className="text-gray-600">-₩{result.totalCost.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
                  <span className="font-medium text-gray-700">순이익</span>
                  <span className={`font-bold ${result.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₩{result.profit.toLocaleString()} ({result.profitRate}%)
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
