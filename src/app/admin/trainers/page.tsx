'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, formatDate } from '@/lib/utils/format';
import {
  TRAINER_STATUS_LABELS,
  TRAINER_STATUS_COLORS,
  TRAINER_EARNING_STATUS_LABELS,
  TRAINER_EARNING_STATUS_COLORS,
} from '@/lib/utils/constants';
import { generateReferralCode } from '@/lib/calculations/trainer';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTrainerApproved, notifyTrainerBonusDeposited } from '@/lib/utils/notifications';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { GraduationCap, RefreshCw, UserPlus, CheckCircle2, XCircle, Copy, Users, Banknote, Search, MessageSquare, ClipboardList, Link2, Unlink } from 'lucide-react';
import MonthPicker from '@/components/ui/MonthPicker';
import type { Trainer, PtUser, Profile, TrainerTrainee, TrainerEarning, OnboardingStep } from '@/lib/supabase/types';
import { ONBOARDING_STEPS } from '@/lib/utils/constants';

interface TrainerWithDetails extends Trainer {
  pt_user: PtUser & { profile: Profile };
}

interface TraineeWithProfile extends TrainerTrainee {
  trainee_pt_user: PtUser & { profile: Profile };
}

const STATUS_TABS = [
  { value: '', label: '전체' },
  { value: 'pending', label: '승인 대기' },
  { value: 'approved', label: '활성' },
  { value: 'revoked', label: '취소' },
];

export default function AdminTrainersPage() {
  const [trainers, setTrainers] = useState<TrainerWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 트레이너 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availablePtUsers, setAvailablePtUsers] = useState<(PtUser & { profile: Profile })[]>([]);
  const [selectedPtUserId, setSelectedPtUserId] = useState('');

  // 상세 모달
  const [detailTrainer, setDetailTrainer] = useState<TrainerWithDetails | null>(null);
  const [trainees, setTrainees] = useState<TraineeWithProfile[]>([]);
  const [earnings, setEarnings] = useState<TrainerEarning[]>([]);

  // 코칭 활동 통계
  const [coachingStats, setCoachingStats] = useState<{ messageCount: number; noteCount: number; lastCoachingDate: string | null }>({ messageCount: 0, noteCount: 0, lastCoachingDate: null });
  const [traineeOnboardingMap, setTraineeOnboardingMap] = useState<Map<string, OnboardingStep[]>>(new Map());

  // 수동 연결 모달
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTrainerId, setLinkTrainerId] = useState<string | null>(null);
  const [unlinkedPtUsers, setUnlinkedPtUsers] = useState<(PtUser & { profile: Profile })[]>([]);
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkReason, setLinkReason] = useState('');
  const [linkEffectiveFrom, setLinkEffectiveFrom] = useState('');
  const [linkRetroactive, setLinkRetroactive] = useState(true);
  const [linkLoading, setLinkLoading] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // 취소 모달
  const [revokeModal, setRevokeModal] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchTrainers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('trainers')
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setTrainers((data as TrainerWithDetails[]) || []);
    setLoading(false);
  }, [statusFilter, supabase]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  const fetchAvailablePtUsers = async () => {
    // PT 사용자 중 아직 트레이너가 아닌 사용자 목록
    const { data: allPtUsers } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .eq('status', 'active');

    const { data: existingTrainers } = await supabase
      .from('trainers')
      .select('pt_user_id');

    const existingIds = new Set((existingTrainers || []).map((t) => (t as { pt_user_id: string }).pt_user_id));
    const available = ((allPtUsers || []) as (PtUser & { profile: Profile })[]).filter(
      (u) => !existingIds.has(u.id)
    );

    setAvailablePtUsers(available);
    setSelectedPtUserId(available.length > 0 ? available[0].id : '');
  };

  const handleOpenAddModal = () => {
    fetchAvailablePtUsers();
    setAddModalOpen(true);
  };

  const handleAddTrainer = async () => {
    if (!selectedPtUserId) return;

    const { data: newTrainer } = await supabase
      .from('trainers')
      .insert({
        pt_user_id: selectedPtUserId,
        status: 'pending',
        bonus_percentage: 5,
        total_earnings: 0,
      })
      .select('id')
      .single();

    // 활동 로그
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'add_trainer',
        targetType: 'trainer',
        targetId: newTrainer?.id,
        details: { pt_user_id: selectedPtUserId },
      });
    }

    setAddModalOpen(false);
    setSelectedPtUserId('');
    fetchTrainers();
  };

  const handleApprove = async (trainerId: string) => {
    // 추천 코드 생성 (중복 방지 loop)
    let code = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('trainers')
        .select('id')
        .eq('referral_code', code)
        .maybeSingle();

      if (!existing) break;
      code = generateReferralCode();
      attempts++;
    }

    await supabase
      .from('trainers')
      .update({
        status: 'approved',
        referral_code: code,
        approved_at: new Date().toISOString(),
      })
      .eq('id', trainerId);

    // 트레이너의 프로필 ID 조회 후 알림 발송
    const trainer = trainers.find((t) => t.id === trainerId);
    const trainerProfileId = trainer?.pt_user?.profile?.id;
    if (trainerProfileId) {
      await notifyTrainerApproved(supabase, trainerProfileId, code);
    }

    // 활동 로그
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'approve_trainer',
        targetType: 'trainer',
        targetId: trainerId,
        details: { referral_code: code },
      });
    }

    fetchTrainers();
  };

  const handleRevoke = async () => {
    if (!revokeModal) return;

    await supabase
      .from('trainers')
      .update({ status: 'revoked' })
      .eq('id', revokeModal);

    // 소속 교육생 비활성화
    await supabase
      .from('trainer_trainees')
      .update({ is_active: false })
      .eq('trainer_id', revokeModal);

    // 활동 로그
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const adminUser = adminSession?.user ?? null;
    if (adminUser) {
      await logActivity(supabase, {
        adminId: adminUser.id,
        action: 'revoke_trainer',
        targetType: 'trainer',
        targetId: revokeModal,
        details: { reason: revokeReason || undefined },
      });
    }

    setRevokeModal(null);
    setRevokeReason('');
    fetchTrainers();
  };

  const handleOpenLinkModal = async (trainerId: string) => {
    setLinkTrainerId(trainerId);
    setLinkTargetId('');
    setLinkReason('');
    setLinkEffectiveFrom('');
    setLinkRetroactive(true);

    // 트레이너에 연결되지 않은 활성 PT 유저 조회
    const { data: allActive } = await supabase
      .from('pt_users')
      .select('*, profile:profiles(*)')
      .eq('status', 'active');

    const { data: linked } = await supabase
      .from('trainer_trainees')
      .select('trainee_pt_user_id')
      .eq('is_active', true);

    const linkedIds = new Set((linked || []).map((l) => (l as { trainee_pt_user_id: string }).trainee_pt_user_id));

    // 트레이너 자신도 제외
    const trainer = trainers.find((t) => t.id === trainerId);
    const trainerPtUserId = trainer?.pt_user_id;

    const available = ((allActive || []) as (PtUser & { profile: Profile })[]).filter(
      (u) => !linkedIds.has(u.id) && u.id !== trainerPtUserId
    );

    setUnlinkedPtUsers(available);
    setLinkModalOpen(true);
  };

  const handleManualLink = async () => {
    if (!linkTrainerId || !linkTargetId) return;
    setLinkLoading(true);

    try {
      const res = await fetch('/api/admin/trainer-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id: linkTrainerId,
          trainee_pt_user_id: linkTargetId,
          link_reason: linkReason || null,
          effective_from: linkEffectiveFrom || null,
          calculate_retroactive: linkRetroactive && !!linkEffectiveFrom,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '연결에 실패했습니다.');
      } else {
        const msg = data.retroactive_count > 0
          ? `연결 완료! 소급 보너스 ${data.retroactive_count}건 (${data.retroactive_total.toLocaleString()}원) 생성됨`
          : '연결이 완료되었습니다.';
        alert(msg);
        setLinkModalOpen(false);
        // 상세 모달 열려있으면 새로고침
        if (detailTrainer && detailTrainer.id === linkTrainerId) {
          handleOpenDetail(detailTrainer);
        }
      }
    } catch {
      alert('서버 오류가 발생했습니다.');
    }
    setLinkLoading(false);
  };

  const handleUnlinkTrainee = async (trainerTraineeId: string) => {
    if (!confirm('이 교육생의 트레이너 연결을 해제하시겠습니까?')) return;
    setUnlinkingId(trainerTraineeId);

    try {
      const res = await fetch('/api/admin/trainer-link', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainer_trainee_id: trainerTraineeId }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '해제에 실패했습니다.');
      } else {
        // 로컬 상태 업데이트
        setTrainees((prev) => prev.map((t) =>
          t.id === trainerTraineeId ? { ...t, is_active: false } : t
        ));
      }
    } catch {
      alert('서버 오류가 발생했습니다.');
    }
    setUnlinkingId(null);
  };

  const handleOpenDetail = async (trainer: TrainerWithDetails) => {
    setDetailTrainer(trainer);

    const [traineesRes, earningsRes, msgCountRes, noteCountRes] = await Promise.all([
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
      supabase
        .from('trainer_messages')
        .select('id, sent_at')
        .eq('trainer_id', trainer.id)
        .order('sent_at', { ascending: false }),
      supabase
        .from('trainer_notes')
        .select('id, created_at')
        .eq('trainer_id', trainer.id)
        .order('created_at', { ascending: false }),
    ]);

    const traineesList = (traineesRes.data as TraineeWithProfile[]) || [];
    setTrainees(traineesList);
    setEarnings((earningsRes.data as TrainerEarning[]) || []);

    const msgData = msgCountRes.data || [];
    const noteData = noteCountRes.data || [];
    const lastMsg = msgData.length > 0 ? (msgData[0] as { sent_at: string }).sent_at : null;
    const lastNote = noteData.length > 0 ? (noteData[0] as { created_at: string }).created_at : null;
    const lastCoaching = [lastMsg, lastNote].filter(Boolean).sort().reverse()[0] || null;
    setCoachingStats({
      messageCount: msgData.length,
      noteCount: noteData.length,
      lastCoachingDate: lastCoaching,
    });

    // 트레이니별 온보딩 스텝 조회
    const traineeIds = traineesList.map((t) => t.trainee_pt_user_id);
    if (traineeIds.length > 0) {
      const { data: stepsData } = await supabase
        .from('onboarding_steps')
        .select('*')
        .in('pt_user_id', traineeIds);
      const sMap = new Map<string, OnboardingStep[]>();
      (stepsData || []).forEach((s) => {
        const step = s as OnboardingStep;
        if (!sMap.has(step.pt_user_id)) sMap.set(step.pt_user_id, []);
        sMap.get(step.pt_user_id)!.push(step);
      });
      setTraineeOnboardingMap(sMap);
    } else {
      setTraineeOnboardingMap(new Map());
    }
  };

  const handleUpdateEarningStatus = async (earningId: string, newStatus: 'deposited') => {
    await supabase
      .from('trainer_earnings')
      .update({ payment_status: newStatus })
      .eq('id', earningId);

    // deposited 전환 시 트레이너에게 알림
    if (newStatus === 'deposited' && detailTrainer) {
      const earning = earnings.find((e) => e.id === earningId);
      const trainerProfileId = detailTrainer.pt_user?.profile?.id;
      if (earning && trainerProfileId) {
        await notifyTrainerBonusDeposited(supabase, trainerProfileId, earning.year_month, earning.bonus_amount);
      }
    }

    // 로컬 상태 즉시 반영
    setEarnings((prev) => prev.map((e) => e.id === earningId ? { ...e, payment_status: newStatus } : e));

    // requestedCounts 갱신
    if (newStatus === 'deposited' && detailTrainer) {
      setRequestedCounts((prev) => {
        const next = new Map(prev);
        const current = next.get(detailTrainer.id) || 0;
        if (current > 1) {
          next.set(detailTrainer.id, current - 1);
        } else {
          next.delete(detailTrainer.id);
        }
        return next;
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filtered = trainers.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = t.pt_user?.profile?.full_name || '';
    const email = t.pt_user?.profile?.email || '';
    const code = t.referral_code || '';
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || code.toLowerCase().includes(q);
  });

  // 입금요청 건수 조회
  const [requestedCounts, setRequestedCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (trainers.length === 0) return;
    const trainerIds = trainers.map((t) => t.id);
    (async () => {
      const { data } = await supabase
        .from('trainer_earnings')
        .select('trainer_id')
        .eq('payment_status', 'requested')
        .in('trainer_id', trainerIds);

      const countMap = new Map<string, number>();
      (data || []).forEach((row) => {
        const id = (row as { trainer_id: string }).trainer_id;
        countMap.set(id, (countMap.get(id) || 0) + 1);
      });
      setRequestedCounts(countMap);
    })();
  }, [trainers, supabase]);

  const pendingCount = trainers.filter((t) => t.status === 'pending').length;
  const approvedCount = trainers.filter((t) => t.status === 'approved').length;
  const totalRequestedCount = Array.from(requestedCounts.values()).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">트레이너 관리</h1>
          {pendingCount > 0 && (
            <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
              {pendingCount}건 대기
            </span>
          )}
          {totalRequestedCount > 0 && (
            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
              {totalRequestedCount}건 입금요청
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTrainers}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition"
          >
            <UserPlus className="w-4 h-4" />
            트레이너 추가
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{trainers.length}</p>
          <p className="text-xs text-gray-500">전체</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
          <p className="text-xs text-gray-500">승인 대기</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
          <p className="text-xs text-gray-500">활성</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {formatKRW(trainers.reduce((sum, t) => sum + (t.total_earnings || 0), 0))}
          </p>
          <p className="text-xs text-gray-500">총 지급 보너스</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 이메일, 추천코드 검색..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Trainer List */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-gray-400">트레이너가 없습니다.</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((trainer) => (
            <Card key={trainer.id}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {trainer.pt_user?.profile?.full_name || '이름 없음'}
                  </h3>
                  <p className="text-sm text-gray-500">{trainer.pt_user?.profile?.email}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge
                      label={TRAINER_STATUS_LABELS[trainer.status]}
                      colorClass={TRAINER_STATUS_COLORS[trainer.status]}
                    />
                    {trainer.referral_code && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(trainer.referral_code!)}
                        className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono rounded hover:bg-blue-100 transition"
                        title="클릭하여 복사"
                      >
                        <Copy className="w-3 h-3" />
                        {trainer.referral_code}
                      </button>
                    )}
                    <span className="text-xs text-gray-400">
                      보너스: {trainer.bonus_percentage}%
                    </span>
                    {(requestedCounts.get(trainer.id) || 0) > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                        {requestedCounts.get(trainer.id)}건 입금요청
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-4 h-4" />
                      총 보너스: {formatKRW(trainer.total_earnings || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(trainer)}
                    className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                  >
                    상세
                  </button>
                  {trainer.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(trainer.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      승인
                    </button>
                  )}
                  {trainer.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => { setRevokeModal(trainer.id); setRevokeReason(''); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
                    >
                      <XCircle className="w-4 h-4" />
                      취소
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Trainer Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="트레이너 추가">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            활성 상태의 PT 사용자 중 트레이너로 등록할 사용자를 선택하세요.
          </p>
          {availablePtUsers.length === 0 ? (
            <p className="text-sm text-gray-400">추가 가능한 PT 사용자가 없습니다.</p>
          ) : (
            <>
              <select
                value={selectedPtUserId}
                onChange={(e) => setSelectedPtUserId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              >
                {availablePtUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.profile?.full_name || '이름 없음'} ({u.profile?.email})
                  </option>
                ))}
              </select>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAddTrainer}
                  disabled={!selectedPtUserId}
                  className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Revoke Modal */}
      <Modal isOpen={!!revokeModal} onClose={() => setRevokeModal(null)} title="트레이너 취소">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            트레이너 자격을 취소하시겠습니까? 소속 교육생의 보너스 연결이 해제됩니다.
          </p>
          <textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none resize-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
            placeholder="취소 사유를 입력하세요 (선택)"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRevokeModal(null)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
            >
              돌아가기
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition"
            >
              취소 확인
            </button>
          </div>
        </div>
      </Modal>

      {/* Manual Link Modal */}
      <Modal isOpen={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="교육생 수동 연결">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            트레이너에 연결되지 않은 활성 PT 사용자를 선택하여 수동으로 연결합니다.
          </p>
          {unlinkedPtUsers.length === 0 ? (
            <p className="text-sm text-gray-400">연결 가능한 PT 사용자가 없습니다.</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">교육생 선택</label>
                <select
                  value={linkTargetId}
                  onChange={(e) => setLinkTargetId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                >
                  <option value="">-- 선택하세요 --</option>
                  {unlinkedPtUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.profile?.full_name || '이름 없음'} ({u.profile?.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">연결 사유</label>
                <input
                  type="text"
                  value={linkReason}
                  onChange={(e) => setLinkReason(e.target.value)}
                  placeholder="예: 오프라인 교육 참가자"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">소급 시작월 (선택)</label>
                <MonthPicker value={linkEffectiveFrom} onChange={setLinkEffectiveFrom} />
              </div>
              {linkEffectiveFrom && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkRetroactive}
                    onChange={(e) => setLinkRetroactive(e.target.checked)}
                    className="w-4 h-4 text-[#E31837] border-gray-300 rounded focus:ring-[#E31837]"
                  />
                  <span className="text-sm text-gray-700">과거 확인된 정산 보너스 소급 계산</span>
                </label>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLinkModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleManualLink}
                  disabled={!linkTargetId || linkLoading}
                  className="flex-1 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-[#c01530] text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Link2 className="w-4 h-4" />
                  {linkLoading ? '연결 중...' : '연결하기'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailTrainer}
        onClose={() => setDetailTrainer(null)}
        title="트레이너 상세"
        maxWidth="max-w-2xl"
      >
        {detailTrainer && (
          <div className="space-y-6">
            {/* 기본 정보 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">이름</div>
                <div className="font-medium">{detailTrainer.pt_user?.profile?.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">상태</div>
                <Badge
                  label={TRAINER_STATUS_LABELS[detailTrainer.status]}
                  colorClass={TRAINER_STATUS_COLORS[detailTrainer.status]}
                />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">추천 코드</div>
                <div className="font-mono text-sm">{detailTrainer.referral_code || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">보너스율</div>
                <div className="font-medium">{detailTrainer.bonus_percentage}%</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">총 보너스</div>
                <div className="font-medium">{formatKRW(detailTrainer.total_earnings || 0)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">승인일</div>
                <div className="font-medium">{detailTrainer.approved_at ? formatDate(detailTrainer.approved_at) : '-'}</div>
              </div>
            </div>

            {/* 코칭 활동 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">코칭 활동</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <p className="text-lg font-bold text-blue-700">{coachingStats.messageCount}</p>
                  <p className="text-xs text-blue-600">보낸 메시지</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <p className="text-lg font-bold text-purple-700">{coachingStats.noteCount}</p>
                  <p className="text-xs text-purple-600">코칭 메모</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mt-1">
                    {coachingStats.lastCoachingDate
                      ? new Date(coachingStats.lastCoachingDate).toLocaleDateString('ko-KR')
                      : '-'}
                  </p>
                  <p className="text-xs text-gray-500">마지막 코칭</p>
                </div>
              </div>
            </div>

            {/* 교육생 목록 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-900">교육생 ({trainees.length}명)</h3>
                </div>
                {detailTrainer.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleOpenLinkModal(detailTrainer.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c01530] transition"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    교육생 수동 연결
                  </button>
                )}
              </div>
              {trainees.length === 0 ? (
                <p className="text-sm text-gray-400">아직 교육생이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {trainees.map((t) => {
                    const steps = traineeOnboardingMap.get(t.trainee_pt_user_id) || [];
                    const completed = steps.filter((s) => s.status === 'approved').length;
                    const stuckStep = (() => {
                      for (const def of ONBOARDING_STEPS) {
                        const step = steps.find((s) => s.step_key === def.key);
                        if (!step || step.status === 'pending' || step.status === 'rejected' || step.status === 'submitted') {
                          return def.label;
                        }
                      }
                      return null;
                    })();

                    return (
                      <div key={t.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                              </p>
                              <p className="text-xs text-gray-500">{t.trainee_pt_user?.profile?.email}</p>
                            </div>
                            <Badge
                              label={t.link_type === 'manual' ? '수동연결' : '추천코드'}
                              colorClass={t.link_type === 'manual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              label={t.is_active ? '활성' : '비활성'}
                              colorClass={t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                            />
                            {t.is_active && (
                              <button
                                type="button"
                                onClick={() => handleUnlinkTrainee(t.id)}
                                disabled={unlinkingId === t.id}
                                className="p-1 text-gray-400 hover:text-red-600 transition disabled:opacity-50"
                                title="연결 해제"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {t.link_type === 'manual' && t.link_reason && (
                          <p className="text-xs text-gray-500 mb-1">사유: {t.link_reason}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-[#E31837] h-1.5 rounded-full"
                              style={{ width: `${(completed / 12) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">{completed}/12</span>
                          {stuckStep && completed < 12 && (
                            <span className="text-xs text-orange-600 whitespace-nowrap">현재: {stuckStep}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 최근 보너스 내역 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">최근 보너스 내역</h3>
              </div>
              {earnings.length === 0 ? (
                <p className="text-sm text-gray-400">보너스 내역이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">월</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">교육생</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">순이익</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">보너스</th>
                        <th className="text-center py-2 px-3 font-semibold text-gray-600">상태</th>
                        <th className="text-center py-2 px-3 font-semibold text-gray-600">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.slice(0, 20).map((e) => (
                        <tr key={e.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-700">{e.year_month}</td>
                          <td className="py-2 px-3 text-gray-700">
                            {(e as TrainerEarning & { trainee_pt_user?: PtUser & { profile?: Profile } }).trainee_pt_user?.profile?.full_name || '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-700">{formatKRW(e.trainee_net_profit)}</td>
                          <td className="py-2 px-3 text-right font-medium text-[#E31837]">{formatKRW(e.bonus_amount)}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge
                              label={TRAINER_EARNING_STATUS_LABELS[e.payment_status]}
                              colorClass={TRAINER_EARNING_STATUS_COLORS[e.payment_status]}
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            {e.payment_status === 'pending' && (
                              <span className="text-xs text-gray-400">대기중</span>
                            )}
                            {e.payment_status === 'requested' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateEarningStatus(e.id, 'deposited')}
                                className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                              >
                                입금완료
                              </button>
                            )}
                            {e.payment_status === 'deposited' && (
                              <span className="text-xs text-blue-600">확인 대기</span>
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
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
