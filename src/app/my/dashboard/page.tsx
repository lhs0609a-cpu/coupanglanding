'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PtUser } from '@/lib/supabase/types';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';
import Card from '@/components/ui/Card';
import { ClipboardList, GraduationCap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function MyDashboardPage() {
  const [ptUser, setPtUser] = useState<PtUser | null>(null);
  const [isTrainer, setIsTrainer] = useState(false);
  const [loading, setLoading] = useState(true);

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
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (ptUserData) {
        setPtUser(ptUserData as PtUser);

        // 트레이너 여부 확인
        const { data: trainer } = await supabase
          .from('trainers')
          .select('id')
          .eq('pt_user_id', ptUserData.id)
          .eq('status', 'approved')
          .maybeSingle();

        setIsTrainer(!!trainer);
      }
      setLoading(false);
    })();
  }, [supabase]);

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
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">온보딩 체크리스트</h1>
      </div>

      {/* 트레이너 바로가기 */}
      {isTrainer && (
        <Link href="/my/trainer">
          <Card className="hover:border-[#E31837] hover:shadow-md transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">트레이너 대시보드</p>
                  <p className="text-sm text-gray-500">교육생 관리 및 보너스 확인</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
            </div>
          </Card>
        </Link>
      )}

      {ptUser ? (
        <OnboardingChecklist ptUserId={ptUser.id} />
      ) : (
        <Card>
          <div className="py-8 text-center text-gray-500">
            PT 사용자 정보를 찾을 수 없습니다.
          </div>
        </Card>
      )}
    </div>
  );
}
