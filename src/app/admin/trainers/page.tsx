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
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { GraduationCap, RefreshCw, UserPlus, CheckCircle2, XCircle, Copy, Users, Banknote, Search } from 'lucide-react';
import type { Trainer, PtUser, Profile, TrainerTrainee, TrainerEarning } from '@/lib/supabase/types';

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

    await supabase.from('trainers').insert({
      pt_user_id: selectedPtUserId,
      status: 'pending',
      bonus_percentage: 5,
      total_earnings: 0,
    });

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

    setRevokeModal(null);
    setRevokeReason('');
    fetchTrainers();
  };

  const handleOpenDetail = async (trainer: TrainerWithDetails) => {
    setDetailTrainer(trainer);

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
    setEarnings((earningsRes.data as TrainerEarning[]) || []);
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

  const pendingCount = trainers.filter((t) => t.status === 'pending').length;
  const approvedCount = trainers.filter((t) => t.status === 'approved').length;

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

            {/* 교육생 목록 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">교육생 ({trainees.length}명)</h3>
              </div>
              {trainees.length === 0 ? (
                <p className="text-sm text-gray-400">아직 교육생이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {trainees.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t.trainee_pt_user?.profile?.full_name || '이름 없음'}
                        </p>
                        <p className="text-xs text-gray-500">{t.trainee_pt_user?.profile?.email}</p>
                      </div>
                      <Badge
                        label={t.is_active ? '활성' : '비활성'}
                        colorClass={t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                      />
                    </div>
                  ))}
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
