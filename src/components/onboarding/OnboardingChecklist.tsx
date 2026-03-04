'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import { computeStepStates, countCompleted } from './onboarding-utils';
import type { ComputedStep } from './onboarding-utils';
import type { OnboardingStep } from '@/lib/supabase/types';
import OnboardingStepItem from './OnboardingStepItem';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { getTutorialForStep } from '@/lib/data/onboarding-tutorials';

interface OnboardingChecklistProps {
  ptUserId: string;
}

export default function OnboardingChecklist({ ptUserId }: OnboardingChecklistProps) {
  const [steps, setSteps] = useState<ComputedStep[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const totalSteps = ONBOARDING_STEPS.length;

  const fetchSteps = useCallback(async () => {
    // 온보딩 행 조회
    const { data: dbRows } = await supabase
      .from('onboarding_steps')
      .select('*')
      .eq('pt_user_id', ptUserId);

    // 계약서 서명 여부
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .eq('status', 'signed')
      .limit(1);

    // 매출 보고 존재 여부
    const { data: reports } = await supabase
      .from('monthly_reports')
      .select('id')
      .eq('pt_user_id', ptUserId)
      .limit(1);

    const hasSignedContract = (contracts?.length ?? 0) > 0;
    const hasMonthlyReport = (reports?.length ?? 0) > 0;

    const computed = computeStepStates(
      ONBOARDING_STEPS,
      (dbRows || []) as OnboardingStep[],
      hasSignedContract,
      hasMonthlyReport,
    );

    setSteps(computed);
    setLoading(false);
  }, [ptUserId, supabase]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  const completedCount = countCompleted(steps);
  const allDone = completedCount === totalSteps;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const levelLabels: Record<number, string> = {
    0: '입문자',
    1: '준비 중',
    2: '사업자 등록 완료',
    3: '신고 완료',
    4: '쿠팡 셀러',
    5: 'Wing 마스터',
    6: '첫 상품 등록',
    7: '계약 완료',
    8: '쿠팡 셀러 마스터',
  };
  const currentLevel = levelLabels[completedCount] ?? `${completedCount}단계`;

  const handleSelfCheck = async (stepKey: string) => {
    setActionLoading(stepKey);
    setActionError(null);

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptUserId, stepKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || '처리에 실패했습니다.');
        setActionLoading(null);
        return;
      }

      await fetchSteps();
    } catch {
      setActionError('서버 오류가 발생했습니다.');
    }

    setActionLoading(null);
  };

  const handleEvidenceSubmit = async (stepKey: string, file: File) => {
    setActionLoading(stepKey);
    setActionError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${ptUserId}/${stepKey}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('onboarding-evidence')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        setActionError('파일 업로드에 실패했습니다.');
        setActionLoading(null);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('onboarding-evidence')
        .getPublicUrl(filePath);

      const { error: upsertError } = await supabase.from('onboarding_steps').upsert(
        {
          pt_user_id: ptUserId,
          step_key: stepKey,
          status: 'submitted',
          evidence_url: urlData.publicUrl,
          submitted_at: new Date().toISOString(),
          admin_note: null,
        },
        { onConflict: 'pt_user_id,step_key' },
      );

      if (upsertError) {
        setActionError('증빙 제출에 실패했습니다. 다시 시도해주세요.');
        setActionLoading(null);
        return;
      }

      await fetchSteps();
    } catch {
      setActionError('서버 오류가 발생했습니다.');
    }

    setActionLoading(null);
  };

  if (loading) {
    return (
      <Card>
        <div className="py-6 text-center text-gray-400">온보딩 정보를 불러오는 중...</div>
      </Card>
    );
  }

  // 전체 완료 시 축소 뷰
  if (allDone) {
    return (
      <Card className="bg-green-50 border-green-200">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-green-600" />
          <div>
            <span className="text-green-800 font-bold">쿠팡 셀러 마스터</span>
            <p className="text-sm text-green-600">모든 온보딩 단계를 완료했습니다!</p>
          </div>
          <Badge label="8/8 완료" colorClass="bg-green-100 text-green-700" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">온보딩 체크리스트</h2>
            <Badge label={currentLevel} colorClass="bg-[#E31837]/10 text-[#E31837]" />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedCount}/{totalSteps} 완료
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>

      {/* 진행률 바 */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-[#E31837] h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1 text-right">{progressPercent}%</p>
      </div>

      {/* 에러 메시지 */}
      {actionError && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
          {actionError}
        </div>
      )}

      {/* 단계 목록 */}
      {!collapsed && (
        <div className="space-y-2">
          {steps.map((step) => (
            <OnboardingStepItem
              key={step.definition.key}
              definition={step.definition}
              status={step.status}
              adminNote={step.dbRow?.admin_note ?? null}
              evidenceUrl={step.dbRow?.evidence_url ?? null}
              onSelfCheck={() => handleSelfCheck(step.definition.key)}
              onEvidenceSubmit={(file) => handleEvidenceSubmit(step.definition.key, file)}
              loading={actionLoading === step.definition.key}
              tutorialContent={getTutorialForStep(step.definition.key)}
              isLocked={step.isLocked}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
