'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import { computeStepStates, countCompleted } from '@/components/onboarding/onboarding-utils';
import type { ComputedStep } from '@/components/onboarding/onboarding-utils';
import type { OnboardingStep } from '@/lib/supabase/types';
import { getTutorialForStep } from '@/lib/data/onboarding-tutorials';
import { LEVEL_LABELS, getNextIncompleteStep } from '@/lib/utils/education-helpers';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Link from 'next/link';
import { GraduationCap, Trophy, ArrowRight, BookOpen } from 'lucide-react';

interface EducationProgressWidgetProps {
  ptUserId: string;
}

export default function EducationProgressWidget({ ptUserId }: EducationProgressWidgetProps) {
  const [steps, setSteps] = useState<ComputedStep[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);
  const totalSteps = ONBOARDING_STEPS.length;

  const fetchSteps = useCallback(async () => {
    const { data: dbRows } = await supabase
      .from('onboarding_steps')
      .select('*')
      .eq('pt_user_id', ptUserId);

    const { data: contracts } = await supabase
      .from('contracts')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .eq('status', 'signed')
      .limit(1);

    const { data: reports } = await supabase
      .from('monthly_reports')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .limit(1);

    const computed = computeStepStates(
      ONBOARDING_STEPS,
      (dbRows || []) as OnboardingStep[],
      (contracts?.length ?? 0) > 0,
      (reports?.length ?? 0) > 0,
    );

    setSteps(computed);
    setLoading(false);
  }, [ptUserId, supabase]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const completedCount = countCompleted(steps);
  const allDone = completedCount === totalSteps;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const currentLevel = LEVEL_LABELS[completedCount] ?? `${completedCount}단계`;
  const nextStep = getNextIncompleteStep(steps);
  const nextTutorial = nextStep ? getTutorialForStep(nextStep.definition.key) : null;

  if (loading) {
    return (
      <Card>
        <div className="py-6 text-center text-gray-400">교육 정보를 불러오는 중...</div>
      </Card>
    );
  }

  if (allDone) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-green-600" />
          <div className="flex-1">
            <span className="text-green-800 font-bold">쿠팡 셀러 마스터</span>
            <p className="text-sm text-green-600">모든 교육을 완료했습니다!</p>
          </div>
          <Badge label={`${completedCount}/${totalSteps} 완료`} colorClass="bg-green-100 text-green-700" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">교육 진행</h2>
          <Badge label={currentLevel} colorClass="bg-[#E31837]/10 text-[#E31837]" />
        </div>
        <span className="text-sm text-gray-500">{completedCount}/{totalSteps} 완료</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-[#E31837] h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{progressPercent}%</p>
      </div>

      {/* Next module CTA */}
      {nextStep && (
        <Link
          href={`/my/education/${nextStep.definition.key}`}
          className="flex items-center gap-3 p-3 bg-[#E31837]/5 border border-[#E31837]/20 rounded-lg hover:bg-[#E31837]/10 transition mb-3"
        >
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200">
            <span className="text-xl">{nextTutorial?.icon ?? '📚'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {nextStep.definition.order}. {nextStep.definition.label}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {nextTutorial?.tagline ?? nextStep.definition.description}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[#E31837] text-sm font-medium shrink-0">
            학습하기
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      )}

      {/* View all link */}
      <Link
        href="/my/education"
        className="flex items-center justify-center gap-2 w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition"
      >
        <BookOpen className="w-4 h-4" />
        전체 교육 보기
      </Link>
    </Card>
  );
}
