'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import { Package, HandCoins, RefreshCw, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import CoupangApiAlert, { type CoupangAlertKind } from './CoupangApiAlert';
import { DEFAULT_COST_RATES } from '@/lib/utils/constants';

interface OverviewData {
  productCount: number;
  monthlySales: number;
  monthlySettlement: number;
  monthlyCommission: number;
  estimatedNetProfit?: number;
  estimatedProgramFee?: number;
  sharePercentage?: number;
  yearMonth: string;
  syncedAt: string;
  alert?: CoupangAlertKind | null;
  failedIp?: string | null;
}

function formatKRW(value: number): string {
  if (value >= 10000) {
    return `${Math.floor(value / 10000).toLocaleString()}만원`;
  }
  return `${value.toLocaleString()}원`;
}

function formatExactKRW(value: number): string {
  return `${Math.floor(value).toLocaleString()}원`;
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  return `${MM}.${DD} ${hh}:${mm}`;
}

export default function CoupangOverviewWidget() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/coupang-overview');
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setSyncing(true);
    fetchData();
  };

  if (error) return null;

  if (loading) {
    return (
      <Card>
        <div className="py-6 text-center text-gray-400 text-sm">쿠팡 데이터 불러오는 중...</div>
      </Card>
    );
  }

  if (!data) return null;

  const monthLabel = data.yearMonth.replace('-', '년 ') + '월';
  const sharePct = data.sharePercentage ?? 30;
  const sales = data.monthlySales;
  const programFee = data.estimatedProgramFee ?? 0;
  const netProfit = data.estimatedNetProfit ?? 0;

  // 비용 라인 — DEFAULT_COST_RATES 와 동일 (deposit.ts 의 buildCostBreakdown 과 일치)
  const costLines = [
    { key: 'cost_product',    label: '상품원가',          rate: DEFAULT_COST_RATES.cost_product.rate },
    { key: 'cost_commission', label: '쿠팡 수수료',        rate: DEFAULT_COST_RATES.cost_commission.rate },
    { key: 'cost_returns',    label: '반품/환불비',        rate: DEFAULT_COST_RATES.cost_returns.rate },
    { key: 'cost_shipping',   label: '배송비',            rate: DEFAULT_COST_RATES.cost_shipping.rate },
    { key: 'cost_tax',        label: '세금',              rate: DEFAULT_COST_RATES.cost_tax.rate },
  ].map(({ key, label, rate }) => ({
    key, label, rate,
    amount: Math.round(sales * rate),
  }));

  return (
    <Card>
      {/* 통합 알림 배너 — 7가지 실패 시나리오 모두 일관된 친절 안내 */}
      {data.alert && <CoupangApiAlert alert={data.alert} failedIp={data.failedIp} />}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">쿠팡 연동 현황</h2>
        <div className="flex items-center gap-2">
          {data?.syncedAt && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {formatSyncTime(data.syncedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={syncing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#E31837] hover:bg-red-50 transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 총 등록 상품 */}
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-gray-100">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
          <Package className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">총 등록 상품</p>
          <p className="text-lg font-bold text-gray-900">{data.productCount.toLocaleString()}개</p>
        </div>
      </div>

      {/* 우리 수수료 — 메인 카드 (클릭 시 계산 상세 펼침) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 transition text-left"
      >
        <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 bg-rose-100 text-rose-600">
          <HandCoins className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-rose-600 font-medium">{monthLabel} 우리 수수료 (예상)</p>
          <p className="text-2xl font-bold text-gray-900">{formatKRW(programFee)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            계산 자세히 보기 {expanded ? '닫기' : '펼치기'}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {/* 계산 상세 — 클릭 시 펼침 */}
      {expanded && (
        <div className="mt-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-700 mb-2">계산 과정</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-1.5 text-gray-700">매출</td>
                <td className="py-1.5 text-right font-semibold text-gray-900">{formatExactKRW(sales)}</td>
              </tr>
              {costLines.map((c) => (
                <tr key={c.key}>
                  <td className="py-1 text-gray-500">
                    − {c.label} <span className="text-[10px] text-gray-400">({Math.round(c.rate * 100)}%)</span>
                  </td>
                  <td className="py-1 text-right text-gray-600">{formatExactKRW(c.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 text-gray-500">− 광고비</td>
                <td className="py-1 text-right text-gray-400">0원 (위젯 가정값)</td>
              </tr>
              <tr className="border-t border-gray-300">
                <td className="py-1.5 text-gray-700 font-medium">예상 순이익</td>
                <td className="py-1.5 text-right font-semibold text-emerald-700">{formatExactKRW(netProfit)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-500">× 우리 수수료율</td>
                <td className="py-1 text-right text-gray-600">{sharePct}%</td>
              </tr>
              <tr className="border-t border-gray-300 bg-rose-50/40">
                <td className="py-2 text-gray-900 font-bold">우리 수수료 (예상)</td>
                <td className="py-2 text-right text-lg font-bold text-rose-600">{formatExactKRW(programFee)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
            * 비용 비율은 디폴트값(원가 40% · 쿠팡수수료 10% · 반품 3% · 배송 5% · 세금 10%) 기준 추정.
            광고비는 위젯에서 0원으로 가정합니다. 실제 금액은 매월 정산 리포트 제출 시 입력한 비용으로 확정됩니다.
          </p>
        </div>
      )}
    </Card>
  );
}
