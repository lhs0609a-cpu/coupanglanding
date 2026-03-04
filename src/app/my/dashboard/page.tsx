'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PtUser } from '@/lib/supabase/types';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';
import Card from '@/components/ui/Card';
import { ClipboardList } from 'lucide-react';

export default function MyDashboardPage() {
  const [ptUser, setPtUser] = useState<PtUser | null>(null);
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
        .single();

      if (ptUserData) {
        setPtUser(ptUserData as PtUser);
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
