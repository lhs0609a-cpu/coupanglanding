'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PtUser, MonthlyReport } from '@/lib/supabase/types';
import { getReportTargetMonth, getSettlementDDay, getSettlementStatus, isEligibleForMonth } from '@/lib/utils/settlement';
import EducationProgressWidget from '@/components/education/EducationProgressWidget';
import TrendingKeywordsWidget from '@/components/my/TrendingKeywordsWidget';
import EmergencyAlertWidget from '@/components/my/EmergencyAlertWidget';
import SettlementDDayBanner from '@/components/settlement/SettlementDDayBanner';
import Card from '@/components/ui/Card';
import { ClipboardList, GraduationCap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function MyDashboardPage() {
  const [ptUser, setPtUser] = useState<PtUser | null>(null);
  const [isTrainer, setIsTrainer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentReport, setCurrentReport] = useState<MonthlyReport | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const targetMonth = getReportTargetMonth();
  const dday = getSettlementDDay(targetMonth);
  const eligible = ptUser ? isEligibleForMonth(ptUser.created_at, targetMonth) : false;
  const reportStatus = ptUser
    ? getSettlementStatus(ptUser.created_at, currentReport?.payment_status || null, targetMonth)
    : 'not_eligible';

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

        // 현재 보고 대상월 리포트 조회
        const { data: reportData } = await supabase
          .from('monthly_reports')
          .select('*')
          .eq('pt_user_id', (ptUserData as PtUser).id)
          .eq('year_month', getReportTargetMonth())
          .maybeSingle();

        if (reportData) {
          setCurrentReport(reportData as MonthlyReport);
        }

        // 트레이너 여부 확인
        const { data: trainer } = await supabase
          .from('trainers')
          .select('id')
          .eq('pt_user_id', (ptUserData as PtUser).id)
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
      {/* 정산 D-Day 배너 */}
      {ptUser && eligible && (
        <SettlementDDayBanner
          variant="compact"
          yearMonth={targetMonth}
          dday={dday}
          reportStatus={reportStatus}
          eligible={eligible}
        />
      )}

      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
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

      {/* 긴급 대응 위젯 */}
      <EmergencyAlertWidget />

      {/* 트렌드 키워드 위젯 */}
      <TrendingKeywordsWidget />

      {ptUser ? (
        <EducationProgressWidget ptUserId={ptUser.id} />
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
