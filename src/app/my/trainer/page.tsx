'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import {
  TRAINER_EARNING_STATUS_LABELS,
  TRAINER_EARNING_STATUS_COLORS,
} from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import { GraduationCap, Copy, Users, Banknote, TrendingUp, Check } from 'lucide-react';
import Link from 'next/link';
import type { Trainer, TrainerTrainee, TrainerEarning, PtUser, Profile } from '@/lib/supabase/types';

interface TraineeWithProfile extends TrainerTrainee {
  trainee_pt_user: PtUser & { profile: Profile };
}

interface EarningWithTrainee extends TrainerEarning {
  trainee_pt_user: PtUser & { profile: Profile };
}

export default function TrainerPage() {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [trainees, setTrainees] = useState<TraineeWithProfile[]>([]);
  const [earnings, setEarnings] = useState<EarningWithTrainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const currentMonth = getCurrentYearMonth();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!ptUser) { setLoading(false); return; }

      const { data: trainerData } = await supabase
        .from('trainers')
        .select('*')
        .eq('pt_user_id', ptUser.id)
        .single();

      if (!trainerData) { setLoading(false); return; }
      setTrainer(trainerData as Trainer);

      const [traineesRes, earningsRes] = await Promise.all([
        supabase
          .from('trainer_trainees')
          .select('*, trainee_pt_user:pt_users(*, profile:profiles(*))')
          .eq('trainer_id', trainerData.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('trainer_earnings')
          .select('*, trainee_pt_user:pt_users(*, profile:profiles(*))')
          .eq('trainer_id', trainerData.id)
          .order('year_month', { ascending: false }),
      ]);

      setTrainees((traineesRes.data as TraineeWithProfile[]) || []);
      setEarnings((earningsRes.data as EarningWithTrainee[]) || []);
      setLoading(false);
    })();
  }, [supabase]);

  const handleCopy = () => {
    if (!trainer?.referral_code) return;
    const url = `${window.location.origin}/apply?ref=${trainer.referral_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="py-8 text-center text-gray-500">
            트레이너 정보를 찾을 수 없습니다.
          </div>
        </Card>
      </div>
    );
  }

  const activeTrainees = trainees.filter((t) => t.is_active);
  const thisMonthEarnings = earnings.filter((e) => e.year_month === currentMonth);
  const thisMonthBonus = thisMonthEarnings.reduce((sum, e) => sum + e.bonus_amount, 0);

  // 월별 요약
  const monthlyMap = new Map<string, number>();
  earnings.forEach((e) => {
    monthlyMap.set(e.year_month, (monthlyMap.get(e.year_month) || 0) + e.bonus_amount);
  });
  const monthlySummary = Array.from(monthlyMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">트레이너 대시보드</h1>
      </div>

      {/* 추천 코드 카드 */}
      {trainer.referral_code && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-gray-500 mb-1">내 추천 링크</p>
              <p className="text-sm text-gray-700 font-mono bg-gray-50 px-3 py-2 rounded-lg break-all">
                {typeof window !== 'undefined' ? `${window.location.origin}/apply?ref=${trainer.referral_code}` : `/apply?ref=${trainer.referral_code}`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-[#E31837] text-white hover:bg-[#c01530]'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '복사됨!' : '링크 복사'}
            </button>
          </div>
          <div className="mt-2">
            <span className="text-xs text-gray-400">추천 코드: </span>
            <span className="text-xs font-mono font-bold text-gray-700">{trainer.referral_code}</span>
          </div>
        </Card>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="총 교육생"
          value={`${activeTrainees.length}명`}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title={`${formatYearMonth(currentMonth)} 보너스`}
          value={formatKRW(thisMonthBonus)}
          icon={<TrendingUp className="w-5 h-5" />}
          trend={thisMonthBonus > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          title="누적 보너스"
          value={formatKRW(trainer.total_earnings || 0)}
          icon={<Banknote className="w-5 h-5" />}
          trend="up"
        />
      </div>

      {/* 교육생 목록 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold text-gray-900">내 교육생</h2>
          </div>
          {trainees.length > 0 && (
            <Link
              href="/my/trainer/trainees"
              className="text-sm text-[#E31837] hover:underline font-medium"
            >
              상세 보기
            </Link>
          )}
        </div>

        {trainees.length === 0 ? (
          <p className="text-sm text-gray-400">아직 교육생이 없습니다. 추천 링크를 공유해보세요!</p>
        ) : (
          <div className="space-y-2">
            {trainees.map((t) => {
              const traineeEarnings = thisMonthEarnings.find(
                (e) => e.trainee_pt_user_id === t.trainee_pt_user_id
              );
              return (
                <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                    </p>
                    <Badge
                      label={t.is_active ? '활성' : '비활성'}
                      colorClass={t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                    />
                  </div>
                  <div className="text-right">
                    {traineeEarnings ? (
                      <>
                        <p className="text-sm font-medium text-[#E31837]">
                          +{formatKRW(traineeEarnings.bonus_amount)}
                        </p>
                        <p className="text-xs text-gray-400">이번 달 보너스</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">이번 달 보너스 없음</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 월별 보너스 내역 */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Banknote className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-bold text-gray-900">월별 보너스 내역</h2>
        </div>

        {monthlySummary.length === 0 ? (
          <p className="text-sm text-gray-400">보너스 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">월</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">보너스 합계</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map(([month, total]) => (
                  <tr key={month} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-700">{formatYearMonth(month)}</td>
                    <td className="py-2 px-3 text-right font-medium text-[#E31837]">{formatKRW(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 상세 보너스 내역 */}
      {earnings.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">보너스 상세 내역</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">월</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">교육생</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">순이익</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">보너스</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {earnings.slice(0, 30).map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-700">{e.year_month}</td>
                    <td className="py-2 px-3 text-gray-700">
                      {e.trainee_pt_user?.profile?.full_name || '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">{formatKRW(e.trainee_net_profit)}</td>
                    <td className="py-2 px-3 text-right font-medium text-[#E31837]">{formatKRW(e.bonus_amount)}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        label={TRAINER_EARNING_STATUS_LABELS[e.payment_status]}
                        colorClass={TRAINER_EARNING_STATUS_COLORS[e.payment_status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
