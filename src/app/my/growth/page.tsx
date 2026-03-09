'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

import {
  GROWTH_TIERS,
  BENEFIT_CATEGORY_META,
  getCurrentTier,
  getProgressToNextTier,
  formatRevenue,
} from '@/lib/data/growth-roadmap';
import type { BenefitCategory } from '@/lib/data/growth-roadmap';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import {
  Map,
  TrendingUp,
  CheckCircle,
  ChevronRight,
  Gift,
  Lock,
  Sparkles,
  GraduationCap,
  Wrench,
  BookOpen,
  Percent,
  Briefcase,
  Users,
  Star,
} from 'lucide-react';

const BENEFIT_ICONS: Record<BenefitCategory, React.ComponentType<{ className?: string }>> = {
  coaching: GraduationCap,
  tools: Wrench,
  content: BookOpen,
  commission: Percent,
  business: Briefcase,
  community: Users,
};

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
      try {
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
          setCurrentRevenue((reports[0] as RevenueHistoryItem).reported_revenue);
          const last6 = (reports as RevenueHistoryItem[]).slice(0, 6).reverse();
          setRevenueHistory(last6);
        }
      } catch (err) {
        console.error('growth page fetch error:', err);
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
      <FeatureTutorial featureKey="growth" />
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

      {/* 단계별 핵심 혜택 비교 (맨 위) */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#E31837]" />
            <h2 className="text-lg font-bold text-gray-900">단계별 핵심 혜택 비교</h2>
          </div>

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-2 font-semibold text-gray-600 w-24">단계</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                      <span>코칭</span>
                    </div>
                  </th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <Wrench className="w-3.5 h-3.5 text-purple-600" />
                      <span>도구</span>
                    </div>
                  </th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <Percent className="w-3.5 h-3.5 text-green-600" />
                      <span>수수료</span>
                    </div>
                  </th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">
                    <div className="flex flex-col items-center gap-0.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      <span>비즈니스</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {GROWTH_TIERS.map((tier) => {
                  const isPastRow = tier.tier < currentTier.tier;
                  const isCurrentRow = tier.tier === currentTier.tier;
                  const isFutureRow = tier.tier > currentTier.tier;

                  const getBenefitSummary = (cat: BenefitCategory): string => {
                    const b = tier.benefits.find((x) => x.category === cat);
                    return b ? b.label : '-';
                  };

                  return (
                    <tr
                      key={tier.tier}
                      className={`border-b border-gray-100 ${
                        isCurrentRow ? 'bg-[#E31837]/5 font-medium' : isFutureRow ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <span>{tier.badgeEmoji}</span>
                          <span className={`${isCurrentRow ? 'text-[#E31837] font-bold' : isPastRow ? 'text-green-600' : 'text-gray-500'}`}>
                            {tier.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-600">
                        {getBenefitSummary('coaching')}
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-600">
                        {getBenefitSummary('tools')}
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-600">
                        {getBenefitSummary('commission')}
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-600">
                        {getBenefitSummary('business')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

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

      {/* 나의 현재 혜택 */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#E31837]" />
            <h2 className="text-lg font-bold text-gray-900">나의 현재 혜택</h2>
            <Badge label={currentTier.label} colorClass={currentTier.badgeColor} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentTier.benefits.map((benefit, i) => {
              const meta = BENEFIT_CATEGORY_META[benefit.category];
              const Icon = BENEFIT_ICONS[benefit.category];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className={`mt-0.5 p-1.5 rounded-lg bg-white border border-gray-200 shrink-0`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-800 text-sm">{benefit.label}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{benefit.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 다음 단계에서 해금되는 혜택 */}
      {nextTier && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-gray-900">다음 단계 신규 혜택</h2>
              <Badge label={nextTier.label} colorClass={nextTier.badgeColor} />
            </div>
            <p className="text-sm text-gray-500">
              {nextTier.badgeEmoji} {nextTier.label} 달성 시 <span className="font-semibold text-[#E31837]">새롭게 해금</span>되는 혜택들
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nextTier.benefits.filter((b) => b.isNew).map((benefit, i) => {
                const meta = BENEFIT_CATEGORY_META[benefit.category];
                const Icon = BENEFIT_ICONS[benefit.category];
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 bg-amber-50/50 border border-amber-200/50 rounded-lg"
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-white border border-amber-200 shrink-0">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-gray-800 text-sm">{benefit.label}</p>
                        <Star className="w-3 h-3 text-amber-400" />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{benefit.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-gradient-to-r from-[#E31837]/5 to-amber-50 border border-[#E31837]/20 rounded-lg p-3 flex items-center gap-3">
              <div className="text-2xl">{nextTier.badgeEmoji}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">
                  {formatRevenue(nextTier.revenueMin - currentRevenue)}원만 더 달성하면 {nextTier.label}!
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  위의 혜택들이 모두 해금됩니다
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 세로 타임라인 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-6">전체 성장 단계</h2>
        <div className="relative">
          {GROWTH_TIERS.map((tier, index) => {
            const isPast = tier.tier < currentTier.tier;
            const isCurrent = tier.tier === currentTier.tier;
            const isFuture = tier.tier > currentTier.tier;
            const isLast = index === GROWTH_TIERS.length - 1;
            const newBenefits = tier.benefits.filter((b) => b.isNew);

            return (
              <div key={tier.tier} className="relative flex gap-4">
                {/* 세로 라인 + 노드 */}
                <div className="flex flex-col items-center">
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
                      <Lock className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={`w-0.5 grow min-h-[24px] ${
                        isPast ? 'bg-green-300' : isCurrent ? 'bg-[#E31837]/30' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>

                {/* 단계 내용 */}
                <div className={`pb-6 flex-1 ${isLast ? 'pb-0' : ''}`}>
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

                    {/* 혜택 미리보기 (모든 단계에 표시) */}
                    {newBenefits.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {newBenefits.slice(0, 4).map((benefit, bi) => {
                          const meta = BENEFIT_CATEGORY_META[benefit.category];
                          const Icon = BENEFIT_ICONS[benefit.category];
                          return (
                            <div
                              key={bi}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${
                                isFuture
                                  ? 'bg-gray-100 text-gray-500'
                                  : isCurrent
                                    ? 'bg-[#E31837]/10 text-[#E31837]'
                                    : 'bg-green-50 text-green-600'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                              {benefit.label}
                            </div>
                          );
                        })}
                        {newBenefits.length > 4 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] text-gray-400 bg-gray-100">
                            +{newBenefits.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tier 0은 isNew가 없으므로 전체 혜택 요약 표시 */}
                    {tier.tier === 0 && newBenefits.length === 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tier.benefits.slice(0, 4).map((benefit, bi) => {
                          const Icon = BENEFIT_ICONS[benefit.category];
                          return (
                            <div
                              key={bi}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${
                                isCurrent
                                  ? 'bg-[#E31837]/10 text-[#E31837]'
                                  : 'bg-green-50 text-green-600'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                              {benefit.label}
                            </div>
                          );
                        })}
                        {tier.benefits.length > 4 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] text-gray-400 bg-gray-100">
                            +{tier.benefits.length - 4}
                          </span>
                        )}
                      </div>
                    )}

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
          </div>
        </Card>
      )}

      {/* 매출 데이터 없을 때 안내 */}
      {revenueHistory.length === 0 && !loading && (
        <Card>
          <div className="py-6 text-center">
            <TrendingUp className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">아직 매출 데이터가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">첫 매출 정산을 제출하면 성장 추이가 표시됩니다.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
