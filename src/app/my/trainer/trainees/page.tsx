'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatYearMonth } from '@/lib/utils/format';
import {
  TRAINER_EARNING_STATUS_LABELS,
  TRAINER_EARNING_STATUS_COLORS,
} from '@/lib/utils/constants';
import { notifyAdminBonusRequested, notifyAdminBonusConfirmed } from '@/lib/utils/notifications';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Users, ArrowLeft, Banknote, Send, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { TrainerTrainee, TrainerEarning, PtUser, Profile } from '@/lib/supabase/types';

interface TraineeWithProfile extends TrainerTrainee {
  trainee_pt_user: PtUser & { profile: Profile };
}

interface EarningWithTrainee extends TrainerEarning {
  trainee_pt_user: PtUser & { profile: Profile };
}

export default function TrainerTraineesPage() {
  const [trainees, setTrainees] = useState<TraineeWithProfile[]>([]);
  const [earnings, setEarnings] = useState<EarningWithTrainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedTrainee, setSelectedTrainee] = useState<string | null>(null);
  const [trainerInfo, setTrainerInfo] = useState<{ id: string; profileId: string; name: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!ptUser) { setLoading(false); return; }

    const { data: trainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!trainer) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    setTrainerInfo({ id: trainer.id, profileId: user.id, name: profile?.full_name || '트레이너' });

    const [traineesRes, earningsRes] = await Promise.all([
      supabase
        .from('trainer_trainees')
        .select('*, trainee_pt_user:pt_users(*, profile:profiles(*))')
        .eq('trainer_id', trainer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('trainer_earnings')
        .select('*, trainee_pt_user:pt_users(*, profile:profiles(*))')
        .eq('trainer_id', trainer.id)
        .order('year_month', { ascending: false }),
    ]);

    setTrainees((traineesRes.data as TraineeWithProfile[]) || []);
    setEarnings((earningsRes.data as EarningWithTrainee[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequestPayment = async (earningId: string) => {
    setActionLoading(earningId);
    await supabase
      .from('trainer_earnings')
      .update({ payment_status: 'requested' })
      .eq('id', earningId);

    const earning = earnings.find((e) => e.id === earningId);
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins && earning && trainerInfo) {
      for (const admin of admins) {
        await notifyAdminBonusRequested(supabase, admin.id, trainerInfo.name, earning.bonus_amount);
      }
    }

    setEarnings((prev) => prev.map((e) => e.id === earningId ? { ...e, payment_status: 'requested' } : e));
    setActionLoading(null);
  };

  const handleConfirmPayment = async (earningId: string) => {
    setActionLoading(earningId);
    await supabase
      .from('trainer_earnings')
      .update({ payment_status: 'confirmed' })
      .eq('id', earningId);

    const earning = earnings.find((e) => e.id === earningId);
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins && earning && trainerInfo) {
      for (const admin of admins) {
        await notifyAdminBonusConfirmed(supabase, admin.id, trainerInfo.name, earning.bonus_amount);
      }
    }

    setEarnings((prev) => prev.map((e) => e.id === earningId ? { ...e, payment_status: 'confirmed' } : e));
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card><div className="py-8 text-center text-gray-400">불러오는 중...</div></Card>
      </div>
    );
  }

  const filteredEarnings = selectedTrainee
    ? earnings.filter((e) => e.trainee_pt_user_id === selectedTrainee)
    : earnings;

  const selectedName = selectedTrainee
    ? trainees.find((t) => t.trainee_pt_user_id === selectedTrainee)?.trainee_pt_user?.profile?.full_name || '교육생'
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/my/trainer" className="p-1.5 rounded-lg hover:bg-gray-100 transition">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <Users className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">교육생 상세</h1>
      </div>

      {/* 교육생 목록 */}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-4">교육생 목록</h2>
        {trainees.length === 0 ? (
          <p className="text-sm text-gray-400">교육생이 없습니다.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedTrainee(null)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                !selectedTrainee ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {trainees.map((t) => (
              <button
                key={t.trainee_pt_user_id}
                type="button"
                onClick={() => setSelectedTrainee(t.trainee_pt_user_id)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  selectedTrainee === t.trainee_pt_user_id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                {!t.is_active && ' (비활성)'}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* 선택된 교육생의 보너스 히스토리 */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Banknote className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-bold text-gray-900">
            {selectedName ? `${selectedName} 보너스 내역` : '전체 보너스 내역'}
          </h2>
        </div>

        {filteredEarnings.length === 0 ? (
          <p className="text-sm text-gray-400">보너스 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">월</th>
                  {!selectedTrainee && (
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">교육생</th>
                  )}
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">교육생 순이익</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">보너스율</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">보너스</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">상태</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredEarnings.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-700">{formatYearMonth(e.year_month)}</td>
                    {!selectedTrainee && (
                      <td className="py-2 px-3 text-gray-700">
                        {e.trainee_pt_user?.profile?.full_name || '-'}
                      </td>
                    )}
                    <td className="py-2 px-3 text-right text-gray-700">{formatKRW(e.trainee_net_profit)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{e.bonus_percentage}%</td>
                    <td className="py-2 px-3 text-right font-medium text-[#E31837]">{formatKRW(e.bonus_amount)}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        label={TRAINER_EARNING_STATUS_LABELS[e.payment_status]}
                        colorClass={TRAINER_EARNING_STATUS_COLORS[e.payment_status]}
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      {e.payment_status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleRequestPayment(e.id)}
                          disabled={actionLoading === e.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition disabled:opacity-50"
                        >
                          <Send className="w-3 h-3" />
                          입금요청
                        </button>
                      )}
                      {e.payment_status === 'requested' && (
                        <span className="text-xs text-yellow-600">요청됨</span>
                      )}
                      {e.payment_status === 'deposited' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmPayment(e.id)}
                          disabled={actionLoading === e.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          입금확인
                        </button>
                      )}
                      {e.payment_status === 'confirmed' && (
                        <span className="text-xs text-green-600">완료</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 합계 */}
        {filteredEarnings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">합계</span>
            <span className="text-lg font-bold text-[#E31837]">
              {formatKRW(filteredEarnings.reduce((sum, e) => sum + e.bonus_amount, 0))}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
