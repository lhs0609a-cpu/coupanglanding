'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

import { GROWTH_TIERS, getCurrentTier, getProgressToNextTier, formatRevenue } from '@/lib/data/growth-roadmap';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Map, TrendingUp, CheckCircle, ChevronRight } from 'lucide-react';

interface RevenueHistoryItem {
  year_month: string;
  reported_revenue: number;
}

export default function GrowthRoadmapPage() {
  const [loading, setLoading] = useState(true);
  const [currentRevenue, setCurrentRevenue] = useState(0);
  const [revenueHistory, setRevenueHistory] = useState<RevenueHistoryItem[]>([]);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: ptUserData } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!ptUserData) {
        setLoading(false);
        return;
      }

      const ptUserId = ptUserData.id;

      const { data: reports } = await supabase
        .from('monthly_reports')
        .select('year_month, reported_revenue')
        .eq('pt_user_id', ptUserId)
        .order('year_month', { ascending: false })
        .limit(12);

      if (reports && reports.length > 0) {
        // 가장 최근 월의 매출을 현재 매출로 사용
        setCurrentRevenue((reports[0] as RevenueHistoryItem).reported_revenue);
        // 최근 6개월 데이터를 시간순으로 정렬 (바 차트용)
        const last6 = (reports as RevenueHistoryItem[]).slice(0, 6).reverse();
        setRevenueHistory(last6);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const currentTier = getCurrentTier(currentRevenue);
  const { next: nextTier, progress } = getProgressToNextTier(currentRevenue);
  const maxRevenue = Math.max(...revenueHistory.map((r) => r.reported_revenue), 1);

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
          <Map className="w-6 h-6 text-[#E31837]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">성장 로드맵</h1>
          <p className="text-sm text-gray-500">단계별 목표를 달성하며 셀러로 성장하세요</p>
        </div>
      </div>

      {/* 현재 단계 요약 카드 */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{currentTier.badgeEmoji}</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{currentTier.label}</h2>
                <p className="text-sm text-gray-500">
                  현재 매출: <span className="font-semibold text-gray-700">{formatRevenue(currentRevenue)}원</span>
                </p>
              </div>
            </div>
            <Badge
              label={`Tier ${currentTier.tier}`}
              colorClass={currentTier.badgeColor}
            />
          </div>

          {/* 다음 단계 진행률 */}
          {nextTier ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  다음 단계: <span className="font-medium text-gray-700">{nextTier.badgeEmoji} {nextTier.label}</span>
                </span>
                <span className="font-semibold text-[#E31837]">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-[#E31837] h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                목표 매출: {formatRevenue(nextTier.revenueMin)}원 (남은 금액: {formatRevenue(nextTier.revenueMin - currentRevenue)}원)
              </p>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              최고 단계에 도달했습니다! 축하합니다!
            </div>
          )}
        </div>
      </Card>

      {/* 세로 타임라인 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-6">전체 성장 단계</h2>
        <div className="relative">
          {GROWTH_TIERS.map((tier, index) => {
            const isPast = tier.tier < currentTier.tier;
            const isCurrent = tier.tier === currentTier.tier;

            const isLast = index === GROWTH_TIERS.length - 1;

            return (
              <div key={tier.tier} className="relative flex gap-4">
                {/* 세로 라인 + 노드 */}
                <div className="flex flex-col items-center">
                  {/* 노드 */}
                  <div
                    className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 shrink-0 ${
                      isPast
                        ? 'border-green-500 bg-green-50'
                        : isCurrent
                          ? 'border-[#E31837] bg-[#E31837]/10'
                          : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : isCurrent ? (
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E31837] opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E31837]" />
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">🔒</span>
                    )}
                  </div>
                  {/* 연결 라인 */}
                  {!isLast && (
                    <div
                      className={`w-0.5 grow min-h-[24px] ${
                        isPast ? 'bg-green-300' : isCurrent ? 'bg-[#E31837]/30' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>

                {/* 단계 내용 */}
                <div
                  className={`pb-6 flex-1 ${isLast ? 'pb-0' : ''}`}
                >
                  <div
                    className={`rounded-lg p-4 transition-all ${
                      isCurrent
                        ? 'border-2 border-[#E31837] bg-[#E31837]/5 shadow-sm'
                        : isPast
                          ? 'bg-gray-50 opacity-75'
                          : 'bg-gray-50 opacity-60'
                    }`}
                  >
                    {/* 단계 헤더 */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tier.badgeEmoji}</span>
                        <span
                          className={`font-semibold ${
                            isCurrent ? 'text-[#E31837]' : isPast ? 'text-green-600' : 'text-gray-500'
                          }`}
                        >
                          {tier.label}
                        </span>
                        {isCurrent && (
                          <Badge label="현재 단계" colorClass="bg-[#E31837]/10 text-[#E31837]" />
                        )}
                        {isPast && (
                          <Badge label="완료" colorClass="bg-green-100 text-green-600" />
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{tier.estimatedTimeMonths}</span>
                    </div>

                    {/* 매출 범위 */}
                    <p className="text-xs text-gray-500 mb-2">
                      {formatRevenue(tier.revenueMin)}원
                      {tier.revenueMax ? ` ~ ${formatRevenue(tier.revenueMax)}원` : ' 이상'}
                    </p>

                    {/* 현재 단계: 액션 리스트 + 팁 확장 */}
                    {isCurrent && (
                      <div className="mt-3 space-y-3">
                        <div className="space-y-2">
                          {tier.actions.map((action) => (
                            <div
                              key={action.id}
                              className="flex items-start gap-2 text-sm"
                            >
                              <div className="mt-0.5 w-4 h-4 rounded border border-gray-300 bg-white shrink-0 flex items-center justify-center">
                                <ChevronRight className="w-3 h-3 text-gray-400" />
                              </div>
                              <div>
                                <span className="font-medium text-gray-800">{action.label}</span>
                                <p className="text-xs text-gray-500">{action.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">💡 팁</p>
                          <ul className="space-y-1">
                            {tier.tips.map((tip, tipIndex) => (
                              <li key={tipIndex} className="text-xs text-yellow-800">
                                • {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 현재 단계 액션 플랜 카드 */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#E31837]" />
            <h2 className="text-lg font-bold text-gray-900">현재 단계 액션 플랜</h2>
          </div>
          <p className="text-sm text-gray-500">{currentTier.badgeEmoji} {currentTier.label} 단계에서 집중해야 할 항목들</p>

          <div className="space-y-3">
            {currentTier.actions.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="mt-0.5 w-5 h-5 rounded border-2 border-[#E31837]/30 bg-white shrink-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-sm bg-[#E31837]/20" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800 text-sm">{action.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-700 mb-2">💡 성장 팁</p>
            <ul className="space-y-1.5">
              {currentTier.tips.map((tip, index) => (
                <li key={index} className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* 매출 추이 차트 */}
      {revenueHistory.length > 0 && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#E31837]" />
              <h2 className="text-lg font-bold text-gray-900">최근 매출 추이</h2>
            </div>

            <div className="flex items-end justify-center gap-3" style={{ height: '180px' }}>
              {revenueHistory.map((item) => {
                const barHeight = maxRevenue > 0
                  ? Math.max((item.reported_revenue / maxRevenue) * 100, 2)
                  : 0;

                return (
                  <div key={item.year_month} className="flex flex-col items-center gap-1 flex-1 max-w-[60px] h-full justify-end">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                      {formatRevenue(item.reported_revenue)}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '120px' }}>
                      <div
                        className="w-full bg-[#E31837] rounded-t transition-all duration-500"
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{item.year_month.slice(5)}</span>
                  </div>
                );
              })}
            </div>

            {revenueHistory.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">매출 데이터가 없습니다.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
