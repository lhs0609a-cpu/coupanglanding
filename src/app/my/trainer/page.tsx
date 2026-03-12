'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatKRW, getCurrentYearMonth, formatYearMonth } from '@/lib/utils/format';
import {
  TRAINER_EARNING_STATUS_LABELS,
  TRAINER_EARNING_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  ONBOARDING_STEPS,
  ONBOARDING_STATUS_COLORS,
  TRAINER_MESSAGE_TEMPLATES,
} from '@/lib/utils/constants';
import { notifyAdminBonusRequested, notifyAdminBonusConfirmed, notifyTraineeFromTrainer } from '@/lib/utils/notifications';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import {
  GraduationCap, Copy, Users, Banknote, TrendingUp, Check, Send, CheckCircle2,
  MessageSquare, ClipboardList, AlertTriangle, Eye, ChevronRight, Plus, Trash2, Edit3, X,
} from 'lucide-react';
import type { Trainer, TrainerTrainee, TrainerEarning, PtUser, Profile, MonthlyReport, OnboardingStep, TrainerMessage, TrainerNote } from '@/lib/supabase/types';

interface TraineeWithProfile extends TrainerTrainee {
  trainee_pt_user: PtUser & { profile: Profile };
}

interface EarningWithTrainee extends TrainerEarning {
  trainee_pt_user: PtUser & { profile: Profile };
}

type TabKey = 'coaching' | 'detail' | 'earnings';

// 시간 차이 텍스트
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '접속 기록 없음';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

// 트레이니 상태 분류
function classifyTrainee(
  trainee: TraineeWithProfile,
  steps: OnboardingStep[],
): 'danger' | 'normal' | 'inactive' {
  if (!trainee.is_active) return 'inactive';
  const lastActive = trainee.trainee_pt_user?.last_active_at;
  const daysSinceActive = lastActive
    ? Math.floor((Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (daysSinceActive >= 14) return 'inactive';

  const completedSteps = steps.filter((s) => s.status === 'approved').length;
  const hasRejected = steps.some((s) => s.status === 'rejected');
  const isInProgress = completedSteps < 12;

  if (hasRejected) return 'danger';
  if (isInProgress && daysSinceActive >= 7) return 'danger';
  if (isInProgress && daysSinceActive >= 3) {
    // Check if stagnant (no step change in 3+ days)
    const lastStepUpdate = steps.reduce((latest, s) => {
      const d = s.completed_at || s.submitted_at || s.updated_at;
      return d && d > latest ? d : latest;
    }, '');
    if (lastStepUpdate) {
      const daysSinceStep = Math.floor((Date.now() - new Date(lastStepUpdate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceStep >= 3) return 'danger';
    }
  }

  return 'normal';
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  danger: { label: '주의 필요', color: 'bg-red-100 text-red-700' },
  normal: { label: '정상', color: 'bg-green-100 text-green-700' },
  inactive: { label: '비활성', color: 'bg-gray-100 text-gray-500' },
};

export default function TrainerPage() {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [trainees, setTrainees] = useState<TraineeWithProfile[]>([]);
  const [earnings, setEarnings] = useState<EarningWithTrainee[]>([]);
  const [traineeReports, setTraineeReports] = useState<Map<string, MonthlyReport>>(new Map());
  const [traineeSteps, setTraineeSteps] = useState<Map<string, OnboardingStep[]>>(new Map());
  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [notes, setNotes] = useState<TrainerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('coaching');
  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(null);

  // Message Modal
  const [msgModalTrainee, setMsgModalTrainee] = useState<TraineeWithProfile | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Note editing
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const currentMonth = getCurrentYearMonth();

  const fetchData = useCallback(async () => {
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
      .select('*, pt_user:pt_users(*, profile:profiles(*))')
      .eq('pt_user_id', ptUser.id)
      .single();

    if (!trainerData) { setLoading(false); return; }
    setTrainer(trainerData as Trainer);

    const [traineesRes, earningsRes, messagesRes, notesRes] = await Promise.all([
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
      supabase
        .from('trainer_messages')
        .select('*')
        .eq('trainer_id', trainerData.id)
        .order('sent_at', { ascending: false })
        .limit(100),
      supabase
        .from('trainer_notes')
        .select('*')
        .eq('trainer_id', trainerData.id)
        .order('created_at', { ascending: false }),
    ]);

    const traineesList = (traineesRes.data as TraineeWithProfile[]) || [];
    setTrainees(traineesList);
    setEarnings((earningsRes.data as EarningWithTrainee[]) || []);
    setMessages((messagesRes.data as TrainerMessage[]) || []);
    setNotes((notesRes.data as TrainerNote[]) || []);

    // 교육생별 당월 정산 상태 + 온보딩 스텝 조회
    const traineeIds = traineesList.map((t) => t.trainee_pt_user_id);
    if (traineeIds.length > 0) {
      const [reportsData, stepsData] = await Promise.all([
        supabase
          .from('monthly_reports')
          .select('*')
          .eq('year_month', currentMonth)
          .in('pt_user_id', traineeIds),
        supabase
          .from('onboarding_steps')
          .select('*')
          .in('pt_user_id', traineeIds),
      ]);

      const rMap = new Map<string, MonthlyReport>();
      (reportsData.data || []).forEach((r) => {
        const report = r as MonthlyReport;
        rMap.set(report.pt_user_id, report);
      });
      setTraineeReports(rMap);

      const sMap = new Map<string, OnboardingStep[]>();
      (stepsData.data || []).forEach((s) => {
        const step = s as OnboardingStep;
        if (!sMap.has(step.pt_user_id)) sMap.set(step.pt_user_id, []);
        sMap.get(step.pt_user_id)!.push(step);
      });
      setTraineeSteps(sMap);
    }

    setLoading(false);
  }, [supabase, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getTrainerName = (): string => {
    const t = trainer as Trainer & { pt_user?: PtUser & { profile?: Profile } };
    return t?.pt_user?.profile?.full_name || '트레이너';
  };

  // --- Earnings actions ---
  const handleRequestPayment = async (earningId: string) => {
    setActionLoading(earningId);
    await supabase
      .from('trainer_earnings')
      .update({ payment_status: 'requested' })
      .eq('id', earningId);

    const earning = earnings.find((e) => e.id === earningId);
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    const trainerName = getTrainerName();
    if (admins && earning) {
      for (const admin of admins) {
        await notifyAdminBonusRequested(supabase, admin.id, trainerName, earning.bonus_amount);
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
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
    const trainerName = getTrainerName();
    if (admins && earning) {
      for (const admin of admins) {
        await notifyAdminBonusConfirmed(supabase, admin.id, trainerName, earning.bonus_amount);
      }
    }

    setEarnings((prev) => prev.map((e) => e.id === earningId ? { ...e, payment_status: 'confirmed' } : e));
    setActionLoading(null);
  };

  // --- Message actions ---
  const handleSendTemplate = async (trainee: TraineeWithProfile, templateKey: string, message: string) => {
    if (!trainer) return;
    setSendingMsg(true);
    await supabase.from('trainer_messages').insert({
      trainer_id: trainer.id,
      trainee_pt_user_id: trainee.trainee_pt_user_id,
      message,
      template_key: templateKey,
    });
    const traineeProfileId = trainee.trainee_pt_user?.profile?.id;
    if (traineeProfileId) {
      await notifyTraineeFromTrainer(supabase, traineeProfileId, getTrainerName(), message);
    }
    // Refresh messages
    const { data } = await supabase
      .from('trainer_messages')
      .select('*')
      .eq('trainer_id', trainer.id)
      .order('sent_at', { ascending: false })
      .limit(100);
    setMessages((data as TrainerMessage[]) || []);
    setSendingMsg(false);
    setMsgModalTrainee(null);
  };

  const handleSendCustom = async () => {
    if (!trainer || !msgModalTrainee || !customMsg.trim()) return;
    setSendingMsg(true);
    await supabase.from('trainer_messages').insert({
      trainer_id: trainer.id,
      trainee_pt_user_id: msgModalTrainee.trainee_pt_user_id,
      message: customMsg.trim(),
      template_key: null,
    });
    const traineeProfileId = msgModalTrainee.trainee_pt_user?.profile?.id;
    if (traineeProfileId) {
      await notifyTraineeFromTrainer(supabase, traineeProfileId, getTrainerName(), customMsg.trim());
    }
    const { data } = await supabase
      .from('trainer_messages')
      .select('*')
      .eq('trainer_id', trainer.id)
      .order('sent_at', { ascending: false })
      .limit(100);
    setMessages((data as TrainerMessage[]) || []);
    setCustomMsg('');
    setSendingMsg(false);
    setMsgModalTrainee(null);
  };

  // --- Note CRUD ---
  const handleAddNote = async (traineeId: string) => {
    if (!trainer || !newNote.trim()) return;
    setNoteLoading(true);
    await supabase.from('trainer_notes').insert({
      trainer_id: trainer.id,
      trainee_pt_user_id: traineeId,
      content: newNote.trim(),
    });
    const { data } = await supabase
      .from('trainer_notes')
      .select('*')
      .eq('trainer_id', trainer.id)
      .order('created_at', { ascending: false });
    setNotes((data as TrainerNote[]) || []);
    setNewNote('');
    setNoteLoading(false);
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editingNoteContent.trim()) return;
    setNoteLoading(true);
    await supabase.from('trainer_notes').update({
      content: editingNoteContent.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', noteId);
    setNotes((prev) => prev.map((n) =>
      n.id === noteId ? { ...n, content: editingNoteContent.trim(), updated_at: new Date().toISOString() } : n
    ));
    setEditingNoteId(null);
    setEditingNoteContent('');
    setNoteLoading(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    setNoteLoading(true);
    await supabase.from('trainer_notes').delete().eq('id', noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setNoteLoading(false);
  };

  // --- Copy ---
  const handleCopy = () => {
    if (!trainer?.referral_code) return;
    const url = `${window.location.origin}/apply?ref=${trainer.referral_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- View helpers ---
  const selectedTrainee = trainees.find((t) => t.trainee_pt_user_id === selectedTraineeId);
  const selectedSteps = selectedTraineeId ? (traineeSteps.get(selectedTraineeId) || []) : [];
  const selectedReport = selectedTraineeId ? traineeReports.get(selectedTraineeId) : undefined;
  const selectedMessages = selectedTraineeId
    ? messages.filter((m) => m.trainee_pt_user_id === selectedTraineeId)
    : [];
  const selectedNotes = selectedTraineeId
    ? notes.filter((n) => n.trainee_pt_user_id === selectedTraineeId)
    : [];

  // Get stuck step
  const getStuckStep = (steps: OnboardingStep[]) => {
    const stepDefs = ONBOARDING_STEPS;
    for (const def of stepDefs) {
      const step = steps.find((s) => s.step_key === def.key);
      if (!step || step.status === 'pending' || step.status === 'rejected') {
        return { def, step };
      }
      if (step.status === 'submitted') {
        return { def, step };
      }
    }
    return null;
  };

  // Recommended action
  const getRecommendedAction = (traineeId: string): { text: string; msg: string } | null => {
    const steps = traineeSteps.get(traineeId) || [];
    const stuck = getStuckStep(steps);
    if (!stuck) return null;

    if (stuck.step?.status === 'rejected') {
      return {
        text: `"${stuck.def.label}" 증빙이 반려됐어요. 재제출을 안내해주세요.`,
        msg: `${stuck.def.label} 증빙이 반려됐어요. 다시 올려주세요!`,
      };
    }
    if (!stuck.step || stuck.step.status === 'pending') {
      return {
        text: `"${stuck.def.label}" 단계를 시작하도록 안내해주세요.`,
        msg: `${stuck.def.label} 단계를 시작해보세요! 도움이 필요하면 연락주세요!`,
      };
    }
    return null;
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

  // Tab buttons
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'coaching', label: '코칭 현황', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'detail', label: '트레이니 상세', icon: <Eye className="w-4 h-4" /> },
    { key: 'earnings', label: '수익 관리', icon: <Banknote className="w-4 h-4" /> },
  ];

  // Danger trainees count
  const dangerCount = trainees.filter((t) => {
    const steps = traineeSteps.get(t.trainee_pt_user_id) || [];
    return classifyTrainee(t, steps) === 'danger';
  }).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">트레이너 코칭</h1>
        {dangerCount > 0 && (
          <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            {dangerCount}명 주의
          </span>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== 탭 1: 코칭 현황 ===== */}
      {activeTab === 'coaching' && (
        <div className="space-y-4">
          {/* 통계 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="총 교육생"
              value={`${activeTrainees.length}명`}
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              title="보낸 메시지"
              value={`${messages.length}건`}
              icon={<MessageSquare className="w-5 h-5" />}
            />
            <StatCard
              title="코칭 메모"
              value={`${notes.length}건`}
              icon={<ClipboardList className="w-5 h-5" />}
            />
          </div>

          {/* 트레이니 카드 */}
          {trainees.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 text-center py-4">아직 교육생이 없습니다. 추천 링크를 공유해보세요!</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {trainees.map((t) => {
                const steps = traineeSteps.get(t.trainee_pt_user_id) || [];
                const status = classifyTrainee(t, steps);
                const badge = STATUS_BADGE[status];
                const completedSteps = steps.filter((s) => s.status === 'approved').length;
                const stuck = getStuckStep(steps);
                const report = traineeReports.get(t.trainee_pt_user_id);
                const reportStatus = report?.payment_status;
                const traineeEarning = thisMonthEarnings.find(
                  (e) => e.trainee_pt_user_id === t.trainee_pt_user_id
                );

                return (
                  <Card key={t.id}>
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">
                              {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                            </p>
                            <Badge label={badge.label} colorClass={badge.color} />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            마지막 접속: {timeAgo(t.trainee_pt_user?.last_active_at ?? null)}
                          </p>
                        </div>
                        {traineeEarning && (
                          <div className="text-right">
                            <p className="text-sm font-medium text-[#E31837]">
                              +{formatKRW(traineeEarning.bonus_amount)}
                            </p>
                            <p className="text-xs text-gray-400">이번 달</p>
                          </div>
                        )}
                      </div>

                      {/* Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">교육 진행률</span>
                          <span className="text-xs font-medium text-gray-700">{completedSteps}/12</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-[#E31837] h-2 rounded-full transition-all"
                            style={{ width: `${(completedSteps / 12) * 100}%` }}
                          />
                        </div>
                        {stuck && (
                          <p className="text-xs text-orange-600 mt-1">
                            {stuck.step?.status === 'rejected' && '반려: '}
                            {stuck.step?.status === 'submitted' && '검토 대기: '}
                            {(!stuck.step || stuck.step.status === 'pending') && '미시작: '}
                            {stuck.def.label}
                          </p>
                        )}
                      </div>

                      {/* Report status + actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {reportStatus ? (
                            <Badge
                              label={`매출: ${PAYMENT_STATUS_LABELS[reportStatus] || reportStatus}`}
                              colorClass={PAYMENT_STATUS_COLORS[reportStatus] || 'bg-gray-100 text-gray-500'}
                            />
                          ) : (
                            <Badge label="매출: 미제출" colorClass="bg-gray-100 text-gray-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMsgModalTrainee(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            메시지
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTraineeId(t.trainee_pt_user_id);
                              setActiveTab('detail');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            상세
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== 탭 2: 트레이니 상세 ===== */}
      {activeTab === 'detail' && (
        <div className="space-y-4">
          {/* 트레이니 선택 */}
          <div className="flex gap-2 flex-wrap">
            {trainees.map((t) => (
              <button
                key={t.trainee_pt_user_id}
                type="button"
                onClick={() => setSelectedTraineeId(t.trainee_pt_user_id)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  selectedTraineeId === t.trainee_pt_user_id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
              </button>
            ))}
          </div>

          {!selectedTrainee ? (
            <Card>
              <p className="text-sm text-gray-400 text-center py-8">
                위에서 교육생을 선택해주세요.
              </p>
            </Card>
          ) : (
            <>
              {/* 교육 현황 */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="w-5 h-5 text-gray-500" />
                  <h2 className="text-lg font-bold text-gray-900">교육 현황</h2>
                  <span className="text-sm text-gray-400">
                    {selectedSteps.filter((s) => s.status === 'approved').length}/12
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-[#E31837] h-2.5 rounded-full transition-all"
                    style={{ width: `${(selectedSteps.filter((s) => s.status === 'approved').length / 12) * 100}%` }}
                  />
                </div>

                {/* Step list */}
                <div className="space-y-2">
                  {ONBOARDING_STEPS.map((def) => {
                    const step = selectedSteps.find((s) => s.step_key === def.key);
                    const status = step?.status || 'pending';
                    const isStuck = getStuckStep(selectedSteps)?.def.key === def.key;

                    return (
                      <div
                        key={def.key}
                        className={`flex items-center justify-between p-2.5 rounded-lg ${
                          isStuck ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {status === 'approved' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : status === 'rejected' ? (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          ) : status === 'submitted' ? (
                            <Send className="w-4 h-4 text-blue-500" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                          )}
                          <span className={`text-sm ${isStuck ? 'font-medium text-orange-700' : 'text-gray-700'}`}>
                            {def.order}. {def.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {step?.completed_at && (
                            <span className="text-xs text-gray-400">
                              {new Date(step.completed_at).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                          <Badge
                            label={status === 'approved' ? '완료' : status === 'rejected' ? '반려' : status === 'submitted' ? '검토대기' : '미완료'}
                            colorClass={ONBOARDING_STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 추천 액션 */}
              {(() => {
                const action = getRecommendedAction(selectedTraineeId!);
                if (!action) return null;
                return (
                  <Card>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-700 mb-2">{action.text}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setMsgModalTrainee(selectedTrainee!);
                            setCustomMsg(action.msg);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition"
                        >
                          <Send className="w-3 h-3" />
                          이 내용으로 메시지 보내기
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })()}

              {/* 활동 요약 */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-3">활동 요약</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">매출 보고</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedReport
                        ? PAYMENT_STATUS_LABELS[selectedReport.payment_status] || selectedReport.payment_status
                        : '미제출'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">쿠팡 연동</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedTrainee.trainee_pt_user?.coupang_api_connected ? '연동됨' : '미연동'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">마지막 접속</p>
                    <p className="text-sm font-medium mt-0.5">
                      {timeAgo(selectedTrainee.trainee_pt_user?.last_active_at ?? null)}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">수수료 납부</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedReport?.fee_payment_status === 'paid' ? '완료'
                        : selectedReport?.fee_payment_status === 'awaiting_payment' ? '대기중'
                        : selectedReport?.fee_payment_status === 'overdue' ? '연체'
                        : '해당없음'}
                    </p>
                  </div>
                </div>
              </Card>

              {/* 코칭 메모 */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900">코칭 메모</h3>
                </div>

                {/* Add note */}
                <div className="flex gap-2 mb-4">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="메모를 입력하세요..."
                    className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddNote(selectedTraineeId!)}
                    disabled={!newNote.trim() || noteLoading}
                    className="self-end px-3 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Note list */}
                {selectedNotes.length === 0 ? (
                  <p className="text-sm text-gray-400">메모가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedNotes.map((note) => (
                      <div key={note.id} className="p-3 bg-gray-50 rounded-lg">
                        {editingNoteId === note.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingNoteContent}
                              onChange={(e) => setEditingNoteContent(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E31837]/20"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateNote(note.id)}
                                disabled={noteLoading}
                                className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                              >
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingNoteId(null); setEditingNoteContent(''); }}
                                className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100 transition"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(note.created_at).toLocaleDateString('ko-KR')}
                                {note.updated_at !== note.created_at && ' (수정됨)'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }}
                                className="p-1 text-gray-400 hover:text-gray-600 transition"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                className="p-1 text-gray-400 hover:text-red-600 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* 보낸 메시지 이력 */}
              <Card>
                <h3 className="text-sm font-bold text-gray-900 mb-3">보낸 메시지 이력</h3>
                {selectedMessages.length === 0 ? (
                  <p className="text-sm text-gray-400">보낸 메시지가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedMessages.slice(0, 20).map((msg) => (
                      <div key={msg.id} className="p-3 bg-blue-50/50 rounded-lg">
                        <p className="text-sm text-gray-700">{msg.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {new Date(msg.sent_at).toLocaleDateString('ko-KR')}
                          </span>
                          {msg.template_key && (
                            <Badge
                              label={TRAINER_MESSAGE_TEMPLATES.find((t) => t.key === msg.template_key)?.label || msg.template_key}
                              colorClass="bg-blue-100 text-blue-700"
                            />
                          )}
                          {msg.is_read && (
                            <span className="text-xs text-green-600">읽음</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ===== 탭 3: 수익 관리 ===== */}
      {activeTab === 'earnings' && (
        <div className="space-y-6">
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

          {/* 교육생 목록 (간략) */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-bold text-gray-900">내 교육생</h2>
            </div>
            {trainees.length === 0 ? (
              <p className="text-sm text-gray-400">아직 교육생이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {trainees.map((t) => {
                  const traineeEarning = thisMonthEarnings.find(
                    (e) => e.trainee_pt_user_id === t.trainee_pt_user_id
                  );
                  const report = traineeReports.get(t.trainee_pt_user_id);
                  const reportStatus = report?.payment_status;
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge
                            label={t.is_active ? '활성' : '비활성'}
                            colorClass={t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                          />
                          {reportStatus ? (
                            <Badge
                              label={PAYMENT_STATUS_LABELS[reportStatus] || reportStatus}
                              colorClass={PAYMENT_STATUS_COLORS[reportStatus] || 'bg-gray-100 text-gray-500'}
                            />
                          ) : (
                            <Badge label="미제출" colorClass="bg-gray-100 text-gray-500" />
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {traineeEarning ? (
                          <>
                            <p className="text-sm font-medium text-[#E31837]">
                              +{formatKRW(traineeEarning.bonus_amount)}
                            </p>
                            <p className="text-xs text-gray-400">이번 달</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">보너스 없음</p>
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
                      <th className="text-center py-2 px-3 font-semibold text-gray-600">액션</th>
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
                        <td className="py-2 px-3 text-right font-medium text-[#E31837]">
                          <span>{formatKRW(e.bonus_amount)}</span>
                          <span className="block text-[10px] text-gray-400">
                            원천징수 3.3%: -{formatKRW(Math.floor(e.bonus_amount * 0.033))}
                          </span>
                        </td>
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
            </Card>
          )}
        </div>
      )}

      {/* ===== 메시지 보내기 모달 ===== */}
      <Modal
        isOpen={!!msgModalTrainee}
        onClose={() => { setMsgModalTrainee(null); setCustomMsg(''); }}
        title={`${msgModalTrainee?.trainee_pt_user?.profile?.full_name || '교육생'}에게 메시지 보내기`}
      >
        {msgModalTrainee && (
          <div className="space-y-4">
            {/* 템플릿 버튼 */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">빠른 전송</p>
              <div className="grid grid-cols-2 gap-2">
                {TRAINER_MESSAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => handleSendTemplate(msgModalTrainee, tpl.key, tpl.message)}
                    disabled={sendingMsg}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-left bg-gray-50 rounded-lg hover:bg-gray-100 transition disabled:opacity-50 border border-gray-200"
                  >
                    <Send className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{tpl.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 커스텀 메시지 */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">직접 작성</p>
              <textarea
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value.slice(0, 200))}
                placeholder="메시지를 입력하세요..."
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
                rows={3}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">{customMsg.length}/200</span>
                <button
                  type="button"
                  onClick={handleSendCustom}
                  disabled={!customMsg.trim() || sendingMsg}
                  className="flex items-center gap-1 px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sendingMsg ? '전송 중...' : '전송'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
