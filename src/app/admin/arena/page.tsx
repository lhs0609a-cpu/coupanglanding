'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ARENA_LEVELS, getArenaLevel } from '@/lib/utils/arena-points';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Swords, Plus, Users, Trophy, Target, Edit, ToggleLeft, ToggleRight } from 'lucide-react';

interface ArenaUser {
  pt_user_id: string;
  anonymous_name: string | null;
  anonymous_emoji: string | null;
  total_points: number;
  current_level: number;
  streak_days: number;
  total_listings: number;
  total_revenue: number;
  total_days_active: number;
  weekly_rank: number | null;
  monthly_rank: number | null;
  pt_user?: {
    id: string;
    profile?: {
      full_name: string;
      email: string;
    };
  };
}

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  metric: string;
  target_value: number;
  reward_points: number;
  reward_badge: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

const METRIC_LABELS: Record<string, string> = {
  listings: '상품 등록',
  revenue: '매출',
  streak: '연속 활동',
  points: '포인트',
};

const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  weekly: '주간',
  monthly: '월간',
  special: '특별',
};

const CHALLENGE_TYPE_COLORS: Record<string, string> = {
  weekly: 'bg-blue-100 text-blue-700',
  monthly: 'bg-purple-100 text-purple-700',
  special: 'bg-red-100 text-red-700',
};

export default function AdminArenaPage() {
  const [users, setUsers] = useState<ArenaUser[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'challenges'>('users');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ArenaUser | null>(null);
  const [pointsAmount, setPointsAmount] = useState('');
  const [challengeForm, setChallengeForm] = useState({
    title: '',
    description: '',
    challenge_type: 'weekly',
    metric: 'listings',
    target_value: '',
    reward_points: '',
    start_date: '',
    end_date: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/arena');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setChallenges(data.challenges || []);
      }
    } catch (err) {
      console.error('아레나 데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => b.total_points - a.total_points),
    [users]
  );

  const totalUsers = users.length;
  const avgPoints = totalUsers > 0 ? Math.round(users.reduce((s, u) => s + u.total_points, 0) / totalUsers) : 0;
  const highestStreak = users.reduce((max, u) => Math.max(max, u.streak_days), 0);

  // --- Points Award ---
  const handleAwardPoints = async () => {
    if (!selectedUser || !pointsAmount) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/arena', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'award_points',
          pt_user_id: selectedUser.pt_user_id,
          points: Number(pointsAmount),
        }),
      });
      if (res.ok) {
        setShowPointsModal(false);
        setSelectedUser(null);
        setPointsAmount('');
        await fetchData();
      }
    } catch (err) {
      console.error('포인트 부여 실패:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Toggle Challenge ---
  const handleToggleChallenge = async (id: string) => {
    try {
      const res = await fetch('/api/admin/arena', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_challenge', id }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('챌린지 토글 실패:', err);
    }
  };

  // --- Create Challenge ---
  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeForm.title || !challengeForm.target_value || !challengeForm.reward_points || !challengeForm.start_date || !challengeForm.end_date) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/arena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: challengeForm.title,
          description: challengeForm.description || null,
          challenge_type: challengeForm.challenge_type,
          metric: challengeForm.metric,
          target_value: Number(challengeForm.target_value),
          reward_points: Number(challengeForm.reward_points),
          start_date: challengeForm.start_date,
          end_date: challengeForm.end_date,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setChallengeForm({
          title: '',
          description: '',
          challenge_type: 'weekly',
          metric: 'listings',
          target_value: '',
          reward_points: '',
          start_date: '',
          end_date: '',
        });
        await fetchData();
      }
    } catch (err) {
      console.error('챌린지 생성 실패:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#E31837]/10">
          <Swords className="w-6 h-6 text-[#E31837]" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">아레나 관리</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'users'
              ? 'border-[#E31837] text-[#E31837]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          유저 현황
        </button>
        <button
          onClick={() => setActiveTab('challenges')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'challenges'
              ? 'border-[#E31837] text-[#E31837]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target className="w-4 h-4" />
          챌린지 관리
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">전체 유저</p>
                  <p className="text-xl font-bold text-gray-900">{totalUsers}명</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-100">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">평균 포인트</p>
                  <p className="text-xl font-bold text-gray-900">{avgPoints.toLocaleString()}P</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <Target className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">최고 연속일수</p>
                  <p className="text-xl font-bold text-gray-900">{highestStreak}일</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Users Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">이름(실명)</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">이메일</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">익명이름</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">레벨</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">포인트</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">연속일수</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">등록 상품</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">매출</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-500">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => {
                    const level = getArenaLevel(user.total_points);
                    return (
                      <tr key={user.pt_user_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium text-gray-900">
                          {user.pt_user?.profile?.full_name || '-'}
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          {user.pt_user?.profile?.email || '-'}
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          {user.anonymous_emoji && user.anonymous_name
                            ? `${user.anonymous_emoji} ${user.anonymous_name}`
                            : '-'}
                        </td>
                        <td className="py-3 px-2">
                          <Badge
                            label={`${level.emoji} Lv.${level.level} ${level.label}`}
                            colorClass={level.color}
                          />
                        </td>
                        <td className="py-3 px-2 text-right font-semibold text-gray-900">
                          {user.total_points.toLocaleString()}P
                        </td>
                        <td className="py-3 px-2 text-right text-gray-600">
                          {user.streak_days}일
                        </td>
                        <td className="py-3 px-2 text-right text-gray-600">
                          {user.total_listings.toLocaleString()}개
                        </td>
                        <td className="py-3 px-2 text-right text-gray-600">
                          {user.total_revenue.toLocaleString()}원
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setPointsAmount('');
                              setShowPointsModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#E31837]/10 text-[#E31837] hover:bg-[#E31837]/20 transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            포인트 부여
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-400">
                        아레나 유저가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Challenges Tab */}
      {activeTab === 'challenges' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#C81530] transition"
            >
              <Plus className="w-4 h-4" />
              새 챌린지
            </button>
          </div>

          {challenges.length === 0 ? (
            <Card>
              <p className="text-center text-gray-400 py-8">등록된 챌린지가 없습니다.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {challenges.map((challenge) => (
                <Card key={challenge.id}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900 truncate">{challenge.title}</h3>
                        {challenge.description && (
                          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{challenge.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleChallenge(challenge.id)}
                        className="ml-3 flex-shrink-0"
                        title={challenge.is_active ? '비활성화' : '활성화'}
                      >
                        {challenge.is_active ? (
                          <ToggleRight className="w-7 h-7 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-gray-400" />
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        label={CHALLENGE_TYPE_LABELS[challenge.challenge_type] || challenge.challenge_type}
                        colorClass={CHALLENGE_TYPE_COLORS[challenge.challenge_type] || 'bg-gray-100 text-gray-700'}
                      />
                      <Badge
                        label={METRIC_LABELS[challenge.metric] || challenge.metric}
                        colorClass="bg-gray-100 text-gray-700"
                      />
                      <Badge
                        label={challenge.is_active ? '활성' : '비활성'}
                        colorClass={challenge.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">목표: </span>
                        <span className="font-medium text-gray-900">{challenge.target_value.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">보상: </span>
                        <span className="font-medium text-[#E31837]">{challenge.reward_points.toLocaleString()}P</span>
                        {challenge.reward_badge && (
                          <span className="ml-1">{challenge.reward_badge}</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">기간: </span>
                        <span className="font-medium text-gray-900">
                          {challenge.start_date} ~ {challenge.end_date}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Points Modal */}
      <Modal
        isOpen={showPointsModal}
        onClose={() => {
          setShowPointsModal(false);
          setSelectedUser(null);
          setPointsAmount('');
        }}
        title="포인트 부여"
      >
        {selectedUser && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">유저</p>
              <p className="font-bold text-gray-900">
                {selectedUser.pt_user?.profile?.full_name || '(이름 없음)'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                현재 포인트: <span className="font-semibold text-gray-900">{selectedUser.total_points.toLocaleString()}P</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                부여할 포인트 (음수 가능)
              </label>
              <input
                type="number"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(e.target.value)}
                placeholder="예: 100 또는 -50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowPointsModal(false);
                  setSelectedUser(null);
                  setPointsAmount('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleAwardPoints}
                disabled={submitting || !pointsAmount}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#C81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '처리 중...' : '부여하기'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Challenge Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="새 챌린지 만들기"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreateChallenge} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={challengeForm.title}
              onChange={(e) => setChallengeForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="챌린지 제목"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              value={challengeForm.description}
              onChange={(e) => setChallengeForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="챌린지 설명 (선택)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 유형</label>
              <select
                value={challengeForm.challenge_type}
                onChange={(e) => setChallengeForm((f) => ({ ...f, challenge_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              >
                <option value="weekly">주간</option>
                <option value="monthly">월간</option>
                <option value="special">특별</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">지표</label>
              <select
                value={challengeForm.metric}
                onChange={(e) => setChallengeForm((f) => ({ ...f, metric: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              >
                <option value="listings">상품 등록</option>
                <option value="revenue">매출</option>
                <option value="streak">연속 활동</option>
                <option value="points">포인트</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">목표 값</label>
              <input
                type="number"
                value={challengeForm.target_value}
                onChange={(e) => setChallengeForm((f) => ({ ...f, target_value: e.target.value }))}
                placeholder="예: 50"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">보상 포인트</label>
              <input
                type="number"
                value={challengeForm.reward_points}
                onChange={(e) => setChallengeForm((f) => ({ ...f, reward_points: e.target.value }))}
                placeholder="예: 500"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
              <input
                type="date"
                value={challengeForm.start_date}
                onChange={(e) => setChallengeForm((f) => ({ ...f, start_date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
              <input
                type="date"
                value={challengeForm.end_date}
                onChange={(e) => setChallengeForm((f) => ({ ...f, end_date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#C81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '생성 중...' : '챌린지 생성'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
