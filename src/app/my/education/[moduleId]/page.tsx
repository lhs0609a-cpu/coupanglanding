'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';
import { computeStepStates } from '@/components/onboarding/onboarding-utils';
import type { ComputedStep } from '@/components/onboarding/onboarding-utils';
import type { OnboardingStep } from '@/lib/supabase/types';
import { getTutorialForStep } from '@/lib/data/onboarding-tutorials';
import { getStepByKey } from '@/lib/utils/education-helpers';
import GuideBreadcrumb from '@/components/guides/GuideBreadcrumb';
import ModuleSlideView from '@/components/education/ModuleSlideView';
import Card from '@/components/ui/Card';
import { Lock } from 'lucide-react';
import Link from 'next/link';

export default function EducationModulePage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;

  const [steps, setSteps] = useState<ComputedStep[]>([]);
  const [ptUserId, setPtUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) { setLoading(false); return; }

    const { data: ptUserData } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUserData) { setLoading(false); return; }

    setPtUserId(ptUserData.id);

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
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentStep = getStepByKey(steps, moduleId);
  const stepDef = ONBOARDING_STEPS.find((s) => s.key === moduleId);
  const tutorial = getTutorialForStep(moduleId);

  const handleSelfCheck = async () => {
    if (!ptUserId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptUserId, stepKey: moduleId }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || '처리에 실패했습니다.');
      } else {
        await fetchData();
      }
    } catch {
      setActionError('서버 오류가 발생했습니다.');
    }
    setActionLoading(false);
  };

  const handleEvidenceSubmit = async (file: File) => {
    if (!ptUserId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${ptUserId}/${moduleId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('onboarding-evidence')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        setActionError('파일 업로드에 실패했습니다.');
        setActionLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('onboarding-evidence')
        .getPublicUrl(filePath);

      const { error: upsertError } = await supabase.from('onboarding_steps').upsert(
        {
          pt_user_id: ptUserId,
          step_key: moduleId,
          status: 'submitted',
          evidence_url: urlData.publicUrl,
          submitted_at: new Date().toISOString(),
          admin_note: null,
        },
        { onConflict: 'pt_user_id,step_key' },
      );

      if (upsertError) {
        setActionError('증빙 제출에 실패했습니다.');
        setActionLoading(false);
        return;
      }

      await fetchData();
    } catch {
      setActionError('서버 오류가 발생했습니다.');
    }
    setActionLoading(false);
  };

  const handleQuizComplete = async () => {
    await fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        </Card>
      </div>
    );
  }

  if (!stepDef) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-500">존재하지 않는 모듈입니다.</div>
        </Card>
      </div>
    );
  }

  // Locked module
  if (currentStep?.isLocked) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <GuideBreadcrumb
          items={[
            { label: '교육 센터', href: '/my/education' },
            { label: stepDef.label },
          ]}
        />
        <Card className="text-center py-12">
          <Lock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-700 mb-1">잠긴 모듈</h2>
          <p className="text-sm text-gray-500 mb-4">이전 단계를 완료하면 이 모듈을 학습할 수 있습니다.</p>
          <Link
            href="/my/education"
            className="inline-flex px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
          >
            교육 센터로 돌아가기
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <GuideBreadcrumb
        items={[
          { label: '교육 센터', href: '/my/education' },
          { label: stepDef.label },
        ]}
      />

      {actionError && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
          {actionError}
        </div>
      )}

      {tutorial ? (
        <ModuleSlideView
          definition={stepDef}
          tutorial={tutorial}
          status={currentStep?.status ?? 'pending'}
          adminNote={currentStep?.dbRow?.admin_note ?? null}
          evidenceUrl={currentStep?.dbRow?.evidence_url ?? null}
          ptUserId={ptUserId ?? ''}
          onSelfCheck={handleSelfCheck}
          onEvidenceSubmit={handleEvidenceSubmit}
          onQuizComplete={handleQuizComplete}
          loading={actionLoading}
        />
      ) : (
        <Card>
          <div className="py-8 text-center text-gray-500">교육 콘텐츠가 준비되지 않았습니다.</div>
        </Card>
      )}
    </div>
  );
}
