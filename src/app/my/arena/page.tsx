'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ARENA_LEVELS, getArenaLevel, getLevelProgress } from '@/lib/utils/arena-points';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, type Achievement } from '@/lib/data/arena-achievements';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Swords, Trophy, Flame, Target, Plus, RefreshCw, Medal } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SellerPoints {
  pt_user_id: string;
  anonymous_name: string | null;
  anonymous_emoji: string | null;
  total_points: number;
  current_level: number;
  streak_days: number;
  longest_streak: number;
  total_listings: number;
  total_revenue: number;
  total_days_active: number;
  weekly_rank: number | null;
  monthly_rank: number | null;
}

interface LeaderboardEntry {
  rank: number;
  anonymous_name: string;
  anonymous_emoji: string;
  total_points: number;
  current_level: number;
  streak_days: number;
  total_listings: number;
  isMe: boolean;
}

interface SellerAchievement {
  achievement_key: string;
  unlocked_at: string;
}

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  metric: string;
  target_value: number;
  reward_points: number;
  start_date: string;
  end_date: string;
  progress?: { current_value: number; completed: boolean }[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SellerArenaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [points, setPoints] = useState<SellerPoints | null>(null);
  const [achievements, setAchievements] = useState<SellerAchievement[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly' | 'monthly' | 'all'>('weekly');
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ listings_count: '', revenue_amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [logResult, setLogResult] = useState<{ points_earned: number; breakdown: string[] } | null>(null);
  const [achievementFilter, setAchievementFilter] = useState<string>('all');

  // ---- Data Fetching -------------------------------------------------------

  const fetchArenaData = async () => {
    try {
      const res = await fetch('/api/arena');
      if (res.ok) {
        const data = await res.json();
        setPoints(data.points ?? null);
        setAchievements(data.achievements ?? []);
        setChallenges(data.challenges ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch arena data', e);
    }
  };

  const fetchLeaderboard = async (period: string) => {
    try {
      const res = await fetch(`/api/arena/leaderboard?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setMyRank(data.myRank ?? null);
      }
    } catch (e) {
      console.error('Failed to fetch leaderboard', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchArenaData(), fetchLeaderboard(leaderboardPeriod)]);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLeaderboard(leaderboardPeriod);
  }, [leaderboardPeriod]);

  // ---- Log Activity Handler ------------------------------------------------

  const handleLogActivity = async () => {
    setSubmitting(true);
    setLogResult(null);
    try {
      const res = await fetch('/api/arena/log-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listings_count: Number(logForm.listings_count) || 0,
          revenue_amount: Number(logForm.revenue_amount) || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogResult({ points_earned: data.points_earned, breakdown: data.breakdown ?? [] });
        // Refresh data
        await Promise.all([fetchArenaData(), fetchLeaderboard(leaderboardPeriod)]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? '활동 기록에 실패했습니다.');
      }
    } catch (e) {
      alert('활동 기록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeLogModal = () => {
    setShowLogModal(false);
    setLogForm({ listings_count: '', revenue_amount: '' });
    setLogResult(null);
  };

  // ---- Derived Data --------------------------------------------------------

  const levelInfo = points ? getLevelProgress(points.total_points) : null;
  const currentLevel = points ? getArenaLevel(points.total_points) : ARENA_LEVELS[0];

  const unlockedKeys = useMemo(() => new Set(achievements.map((a) => a.achievement_key)), [achievements]);

  const filteredAchievements = useMemo(() => {
    if (achievementFilter === 'all') return ACHIEVEMENTS;
    return ACHIEVEMENTS.filter((a) => a.category === achievementFilter);
  }, [achievementFilter]);

  // ---- Loading State -------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Swords className="w-7 h-7 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">셀러 아레나</h1>
        </div>
        <Card>
          <p className="text-center text-gray-500 py-12">불러오는 중...</p>
        </Card>
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ===== 1. Header ===== */}
      <div className="flex items-center gap-3">
        <Swords className="w-7 h-7 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">셀러 아레나</h1>
      </div>

      {/* ===== 2. Stats Header Card ===== */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Name & Level */}
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {points?.anonymous_emoji ?? '❓'}
            </span>
            <div>
              <p className="text-lg font-bold text-gray-900">
                {points?.anonymous_name ?? '아레나 참여 전'}
              </p>
              <Badge
                label={`${currentLevel.emoji} ${currentLevel.label}`}
                colorClass={currentLevel.color}
              />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#E31837]">
                {points?.total_points?.toLocaleString() ?? 0}
              </p>
              <p className="text-gray-500">포인트</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500">
                {points?.streak_days ?? 0} <span className="text-lg">🔥</span>
              </p>
              <p className="text-gray-500">연속 활동</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-700">
                {points?.total_listings?.toLocaleString() ?? 0}
              </p>
              <p className="text-gray-500">등록 상품</p>
            </div>
          </div>
        </div>

        {/* Level Progress Bar */}
        {levelInfo && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>
                {currentLevel.emoji} Lv.{currentLevel.level} {currentLevel.label}
              </span>
              {levelInfo.next ? (
                <span>
                  다음 레벨까지 {levelInfo.pointsNeeded.toLocaleString()}P
                </span>
              ) : (
                <span>최고 레벨 달성!</span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-[#E31837] h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${levelInfo.progress}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* ===== 3. Quick Actions ===== */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowLogModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg font-medium hover:bg-[#c81530] transition"
        >
          <Plus className="w-4 h-4" />
          오늘 활동 기록
        </button>
      </div>

      {/* ===== 4. Log Activity Modal ===== */}
      <Modal isOpen={showLogModal} onClose={closeLogModal} title="오늘 활동 기록">
        {logResult ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <p className="text-3xl font-bold text-[#E31837]">
                +{logResult.points_earned}P
              </p>
              <p className="text-sm text-gray-500 mt-1">획득 포인트</p>
            </div>
            {logResult.breakdown.length > 0 && (
              <ul className="space-y-1 text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {logResult.breakdown.map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
            )}
            <button
              onClick={closeLogModal}
              className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              확인
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                오늘 등록한 상품 수
              </label>
              <input
                type="number"
                min={0}
                value={logForm.listings_count}
                onChange={(e) => setLogForm((f) => ({ ...f, listings_count: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                오늘 매출액 (원)
              </label>
              <input
                type="number"
                min={0}
                value={logForm.revenue_amount}
                onChange={(e) => setLogForm((f) => ({ ...f, revenue_amount: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31837]/30 focus:border-[#E31837]"
              />
            </div>
            <button
              onClick={handleLogActivity}
              disabled={submitting}
              className="w-full py-2.5 bg-[#E31837] text-white rounded-lg font-medium hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '기록 중...' : '활동 기록하기'}
            </button>
          </div>
        )}
      </Modal>

      {/* ===== 5. Leaderboard Section ===== */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold text-gray-900">리더보드</h2>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {([
              { value: 'weekly', label: '주간' },
              { value: 'monthly', label: '월간' },
              { value: 'all', label: '전체' },
            ] as const).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setLeaderboardPeriod(tab.value)}
                className={`px-3 py-1 text-sm rounded-md font-medium transition ${
                  leaderboardPeriod === tab.value
                    ? 'bg-white text-[#E31837] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8">아직 리더보드 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-3 py-1">
              <span className="col-span-1">#</span>
              <span className="col-span-4">셀러</span>
              <span className="col-span-2 text-center">레벨</span>
              <span className="col-span-2 text-right">포인트</span>
              <span className="col-span-1 text-center">🔥</span>
              <span className="col-span-2 text-right">등록</span>
            </div>

            {leaderboard.map((entry) => (
              <div
                key={entry.rank}
                className={`grid grid-cols-12 gap-2 items-center text-sm px-3 py-2 rounded-lg ${
                  entry.isMe
                    ? 'bg-[#E31837]/10 border-l-4 border-[#E31837] font-semibold'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span className="col-span-1 font-bold text-gray-500">
                  {entry.rank <= 3
                    ? ['🥇', '🥈', '🥉'][entry.rank - 1]
                    : entry.rank}
                </span>
                <span className="col-span-4 truncate">
                  {entry.anonymous_emoji} {entry.anonymous_name}
                </span>
                <span className="col-span-2 text-center">
                  {getArenaLevel(entry.total_points).emoji}
                </span>
                <span className="col-span-2 text-right text-[#E31837] font-medium">
                  {entry.total_points.toLocaleString()}
                </span>
                <span className="col-span-1 text-center text-orange-500">
                  {entry.streak_days}
                </span>
                <span className="col-span-2 text-right text-gray-500">
                  {entry.total_listings.toLocaleString()}
                </span>
              </div>
            ))}

            {/* My rank if outside top 50 */}
            {myRank && myRank > 50 && (
              <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
                <p className="text-center text-sm text-gray-500">
                  내 순위: <span className="font-bold text-[#E31837]">{myRank}위</span>
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ===== 6. Achievements Section ===== */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Medal className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-bold text-gray-900">업적</h2>
          <span className="text-xs text-gray-400 ml-1">
            {achievements.length} / {ACHIEVEMENTS.length}
          </span>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-1 mb-4">
          <button
            onClick={() => setAchievementFilter('all')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition ${
              achievementFilter === 'all'
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          {ACHIEVEMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setAchievementFilter(cat.value)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                achievementFilter === cat.value
                  ? 'bg-[#E31837] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* Achievement Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filteredAchievements.map((ach) => {
            const isUnlocked = unlockedKeys.has(ach.key);
            const unlockedData = achievements.find((a) => a.achievement_key === ach.key);

            if (isUnlocked) {
              // Unlocked achievement
              return (
                <div
                  key={ach.key}
                  className="p-3 rounded-lg border border-gray-200 bg-white hover:shadow-sm transition"
                >
                  <div className="text-2xl mb-1">{ach.emoji}</div>
                  <p className="text-sm font-semibold text-gray-900">{ach.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ach.description}</p>
                  {unlockedData && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      {new Date(unlockedData.unlocked_at).toLocaleDateString('ko-KR')} 달성
                    </p>
                  )}
                </div>
              );
            }

            // Locked achievement
            const isSecret = ach.isSecret;
            return (
              <div
                key={ach.key}
                className="p-3 rounded-lg border border-gray-200 bg-gray-50 opacity-60"
              >
                <div className="text-2xl mb-1 grayscale">❓</div>
                <p className="text-sm font-semibold text-gray-400">
                  {isSecret ? '???' : ach.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isSecret ? '비공개 업적' : ach.condition}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ===== 7. Active Challenges Section ===== */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">활성 챌린지</h2>
        </div>

        {challenges.length === 0 ? (
          <p className="text-center text-gray-400 py-8">현재 진행 중인 챌린지가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {challenges.map((ch) => {
              const progress = ch.progress?.[0];
              const currentValue = progress?.current_value ?? 0;
              const isCompleted = progress?.completed ?? false;
              const pct = Math.min(100, Math.round((currentValue / ch.target_value) * 100));

              return (
                <div
                  key={ch.id}
                  className={`p-4 rounded-lg border ${
                    isCompleted
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">
                          {isCompleted && '✅ '}{ch.title}
                        </p>
                        <Badge
                          label={ch.challenge_type === 'individual' ? '개인' : '전체'}
                          colorClass={
                            ch.challenge_type === 'individual'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }
                        />
                      </div>
                      {ch.description && (
                        <p className="text-xs text-gray-500 mt-1">{ch.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#E31837]">+{ch.reward_points}P</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {ch.metric}: {currentValue.toLocaleString()} / {ch.target_value.toLocaleString()}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          isCompleted ? 'bg-green-500' : 'bg-[#E31837]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Date Range */}
                  <p className="text-[10px] text-gray-400 mt-2">
                    {new Date(ch.start_date).toLocaleDateString('ko-KR')} ~{' '}
                    {new Date(ch.end_date).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
