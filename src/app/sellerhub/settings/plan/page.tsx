'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLAN_CONFIGS } from '@/lib/sellerhub/constants';
import type { Plan } from '@/lib/sellerhub/types';
import { Check, Crown, Star, Zap } from 'lucide-react';

const PLAN_ICONS: Record<Plan, typeof Star> = {
  free: Star,
  standard: Zap,
  professional: Crown,
};

const FEATURES = [
  { label: '월 주문 수집', key: 'monthlyOrders', format: (v: number) => v === Infinity ? '무제한' : `${v.toLocaleString()}건` },
  { label: '채널 수', key: 'maxChannels', format: (v: number) => `${v}개` },
  { label: 'AI 크레딧', key: 'aiCredits', format: (v: number) => `${v.toLocaleString()}` },
  { label: '자동화 규칙', key: 'maxAutomationRules', format: (v: number) => v === Infinity ? '무제한' : `${v}개` },
];

export default function PlanPage() {
  const supabase = useMemo(() => createClient(), []);
  const [currentPlan, setCurrentPlan] = useState<Plan>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: shUser } = await supabase
        .from('sellerhub_users')
        .select('plan')
        .eq('profile_id', user.id)
        .single();

      if (shUser) {
        setCurrentPlan((shUser as Record<string, unknown>).plan as Plan);
      }
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">요금제</h1>
        <p className="text-sm text-gray-500 mt-1">SellerHub 요금제를 선택하세요</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(Object.keys(PLAN_CONFIGS) as Plan[]).map((plan) => {
          const config = PLAN_CONFIGS[plan];
          const Icon = PLAN_ICONS[plan];
          const isCurrent = currentPlan === plan;
          const isRecommended = plan === 'standard';

          return (
            <div
              key={plan}
              className={`bg-white rounded-2xl border-2 p-6 relative ${
                isRecommended ? 'border-[#E31837] shadow-lg' : isCurrent ? 'border-blue-500' : 'border-gray-200'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#E31837] text-white text-xs font-bold rounded-full">
                  추천
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                  현재 요금제
                </div>
              )}

              <div className="text-center mb-6">
                <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 ${
                  isRecommended ? 'bg-[#E31837]/10' : 'bg-gray-100'
                }`}>
                  <Icon className={`w-6 h-6 ${isRecommended ? 'text-[#E31837]' : 'text-gray-600'}`} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{config.label}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {config.price === 0 ? '무료' : `₩${(config.price / 1000).toFixed(0)}K`}
                  </span>
                  {config.price > 0 && <span className="text-sm text-gray-500">/월</span>}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {FEATURES.map((feature) => {
                  const value = config[feature.key as keyof typeof config] as number;
                  return (
                    <div key={feature.key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{feature.label}</span>
                      <span className="font-medium text-gray-900">{feature.format(value)}</span>
                    </div>
                  );
                })}
              </div>

              <button
                disabled={isCurrent}
                className={`w-full py-2.5 rounded-lg font-medium text-sm transition ${
                  isCurrent
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isRecommended
                      ? 'bg-[#E31837] text-white hover:bg-red-700'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isCurrent ? '사용 중' : config.price === 0 ? '시작하기' : '업그레이드'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
