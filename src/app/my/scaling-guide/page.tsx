'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { scalingStages } from '@/lib/data/scaling-guide';
import type { ScalingStage } from '@/lib/data/scaling-guide';
import Card from '@/components/ui/Card';
import {
  Building2,
  Users,
  Wallet,
  CheckSquare,
  Rocket,
} from 'lucide-react';

function getStageByRevenue(revenue: number): number {
  if (revenue >= 100_000_000) return 6;
  if (revenue >= 50_000_000) return 5;
  if (revenue >= 30_000_000) return 4;
  if (revenue >= 15_000_000) return 3;
  if (revenue >= 5_000_000) return 2;
  return 1;
}

export default function ScalingGuidePage() {
  const [selectedStage, setSelectedStage] = useState(1);
  const [currentRevenue, setCurrentRevenue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: ptUserData } = await supabase
          .from('pt_users')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (!ptUserData) { setLoading(false); return; }

        const { data: reports } = await supabase
          .from('monthly_reports')
          .select('reported_revenue')
          .eq('pt_user_id', ptUserData.id)
          .order('year_month', { ascending: false })
          .limit(1);

        if (reports && reports.length > 0) {
          const rev = (reports[0] as { reported_revenue: number }).reported_revenue;
          setCurrentRevenue(rev);
          setSelectedStage(getStageByRevenue(rev));
        }
      } catch (err) {
        console.error('scaling guide fetch error:', err);
      }
      setLoading(false);
    })();
  }, [supabase]);

  const stage = scalingStages.find((s) => s.id === selectedStage)!;
  const myStage = currentRevenue !== null ? getStageByRevenue(currentRevenue) : null;

  // 고정비 바 최대값
  const maxCost = Math.max(...stage.fixedCosts.map((c) => c.amountNum));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#E31837]/10 rounded-lg">
          <Building2 className="w-6 h-6 text-[#E31837]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">매출 단계별 운영 가이드</h1>
          <p className="text-sm text-gray-500">매출 성장에 따른 인력·고정비·체크리스트 가이드</p>
        </div>
      </div>

      {/* 현재 단계 안내 */}
      {myStage !== null && (
        <Card className="bg-[#E31837]/5 border-[#E31837]/20">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{scalingStages[myStage - 1].emoji}</span>
            <div>
              <p className="text-sm text-gray-600">
                현재 매출 기준 <span className="font-bold text-[#E31837]">{scalingStages[myStage - 1].title}</span> 단계입니다
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                월매출 {(currentRevenue! / 10000).toLocaleString()}만원
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 탭 UI */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-2 min-w-max">
          {scalingStages.map((s) => {
            const isSelected = s.id === selectedStage;
            const isMy = s.id === myStage;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStage(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#E31837] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.title}</span>
                {isMy && !isSelected && (
                  <span className="w-2 h-2 rounded-full bg-[#E31837]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 단계 헤더 */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{stage.emoji}</span>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{stage.title}</h2>
          <p className="text-sm text-gray-500">{stage.subtitle} · 월매출 {stage.revenueRange}</p>
        </div>
      </div>

      {/* 인력 구성 카드 */}
      <StaffingCard stage={stage} />

      {/* 고정비 내역 카드 */}
      <FixedCostCard stage={stage} maxCost={maxCost} />

      {/* 체크리스트 카드 */}
      <ChecklistCard stage={stage} />

      {/* 다음 단계 진입 신호 카드 */}
      <NextStageCard stage={stage} />
    </div>
  );
}

function StaffingCard({ stage }: { stage: ScalingStage }) {
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">인력 구성</h3>
        </div>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 px-2 font-semibold text-gray-600">역할</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-600">인원</th>
                <th className="text-right py-2 px-2 font-semibold text-gray-600">예상 비용</th>
              </tr>
            </thead>
            <tbody>
              {stage.staffing.map((s, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2.5 px-2">
                    <div>
                      <span className="font-medium text-gray-800">{s.role}</span>
                      {s.note && (
                        <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{s.count}</td>
                  <td className="py-2.5 px-2 text-right font-medium text-gray-700">{s.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function FixedCostCard({ stage, maxCost }: { stage: ScalingStage; maxCost: number }) {
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-gray-900">월 고정비 예상</h3>
        </div>

        <div className="space-y-3">
          {stage.fixedCosts.map((cost, i) => {
            const ratio = maxCost > 0 ? (cost.amountNum / maxCost) * 100 : 0;
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{cost.category}</span>
                  <span className="font-medium text-gray-800">{cost.amount}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(ratio, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-200 pt-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">합계</span>
            <span className="font-bold text-gray-900">{stage.totalFixedCost}</span>
          </div>
          <p className="text-sm text-[#E31837] font-medium mt-1">{stage.costRatio}</p>
        </div>
      </div>
    </Card>
  );
}

function ChecklistCard({ stage }: { stage: ScalingStage }) {
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-bold text-gray-900">이 단계 체크리스트</h3>
        </div>
        <div className="space-y-2">
          {stage.checklist.map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">
              <div className="mt-0.5 w-5 h-5 rounded border-2 border-purple-300 bg-white shrink-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-sm bg-purple-200" />
              </div>
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function NextStageCard({ stage }: { stage: ScalingStage }) {
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-orange-500" />
          <h3 className="text-lg font-bold text-gray-900">
            {stage.id < 6 ? '다음 단계 진입 신호' : '이 단계에서의 방향'}
          </h3>
        </div>
        <p className="text-sm text-gray-500">
          {stage.id < 6
            ? '아래 신호가 보이면 다음 단계로의 투자를 고려하세요'
            : '최고 단계에서 지속 성장을 위한 방향입니다'}
        </p>
        <div className="space-y-2">
          {stage.nextStageSignals.map((signal, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <span className="text-orange-400 shrink-0 mt-0.5">&#x2022;</span>
              <span className="text-gray-700">{signal}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
