'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import { computeStepStates, countCompleted } from '@/components/onboarding/onboarding-utils';
import type { ComputedStep } from '@/components/onboarding/onboarding-utils';
import type { OnboardingStep } from '@/lib/supabase/types';
import { getTutorialForStep } from '@/lib/data/onboarding-tutorials';
import { MODULE_CATEGORIES, LEVEL_LABELS, getStepByKey } from '@/lib/utils/education-helpers';
import ModuleCard from '@/components/education/ModuleCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import EducationCompleteBridge from '@/components/tutorial/EducationCompleteBridge';
import TutorialHub from '@/components/tutorial/TutorialHub';
import { AlertCircle, GraduationCap, Trophy } from 'lucide-react';

export default function EducationHubPage() {
  const [steps, setSteps] = useState<ComputedStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ptUserData } = await supabase
        .from('pt_users')
        .select('id, coupang_api_connected')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!ptUserData) return;

      setApiConnected(!!(ptUserData as { coupang_api_connected?: boolean }).coupang_api_connected);

      const { data: dbRows } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('pt_user_id', ptUserData.id);

      const { data: contracts } = await supabase
        .from('contracts')
        .select('id')
        .eq('pt_user_id', ptUserData.id)
        .eq('status', 'signed')
        .limit(1);

      const { data: reports } = await supabase
        .from('monthly_reports')
        .select('id')
        .eq('pt_user_id', ptUserData.id)
        .limit(1);

      const computed = computeStepStates(
        ONBOARDING_STEPS,
        (dbRows || []) as OnboardingStep[],
        (contracts?.length ?? 0) > 0,
        (reports?.length ?? 0) > 0,
      );

      setSteps(computed);
    } catch (err) {
      setError('교육 정보를 불러오지 못했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = countCompleted(steps);
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const currentLevel = LEVEL_LABELS[completedCount] ?? `${completedCount}단계`;
  const allDone = completedCount === totalSteps;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 교육 기능 튜토리얼 */}
      <FeatureTutorial featureKey="education" />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <GraduationCap className="w-7 h-7 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">교육 센터</h1>
          <Badge label={currentLevel} colorClass="bg-[#E31837]/10 text-[#E31837]" />
        </div>
        <p className="text-sm text-gray-500">쿠팡 셀러가 되기 위한 단계별 교육을 진행하세요.</p>
      </div>

      {/* Overall progress */}
      {allDone ? (
        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-green-600" />
            <div>
              <span className="text-green-800 font-bold">축하합니다! 모든 교육을 완료했습니다</span>
              <p className="text-sm text-green-600">쿠팡 셀러 마스터 레벨을 달성했습니다.</p>
            </div>
            <Badge label={`${completedCount}/${totalSteps} 완료`} colorClass="bg-green-100 text-green-700" />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">전체 진도율</span>
            <span className="text-sm text-gray-500">{completedCount}/{totalSteps} 완료</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-[#E31837] h-3 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-right">{progressPercent}%</p>
        </Card>
      )}

      {/* 교육 완료 → API 연동 브릿지 */}
      {allDone && (
        <EducationCompleteBridge coupangApiConnected={apiConnected} />
      )}

      {/* Category sections */}
      {MODULE_CATEGORIES.map((category) => (
        <div key={category.id}>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-900">{category.title}</h2>
            <p className="text-sm text-gray-500">{category.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {category.stepKeys.map((stepKey) => {
              const step = getStepByKey(steps, stepKey);
              const def = ONBOARDING_STEPS.find((s) => s.key === stepKey);
              const tutorial = getTutorialForStep(stepKey);

              if (!def) return null;

              return (
                <ModuleCard
                  key={stepKey}
                  stepKey={stepKey}
                  order={def.order}
                  label={def.label}
                  icon={tutorial?.icon ?? '📚'}
                  tagline={tutorial?.tagline ?? def.description}
                  estimatedTime={tutorial?.estimatedTotalTime ?? ''}
                  status={step?.status ?? 'pending'}
                  isLocked={step?.isLocked ?? true}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* 기능 튜토리얼 허브 */}
      <TutorialHub />
    </div>
  );
}
