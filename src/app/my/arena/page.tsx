'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import { Trophy, RefreshCw, Crown, TrendingUp, Users, AlertCircle } from 'lucide-react';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RankingEntry {
  rank: number;
  anonymous_name: string;
  anonymous_emoji: string;
  total_listings: number;
  isMe: boolean;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SellerRankingPage() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myListings, setMyListings] = useState<number | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [notPtUser, setNotPtUser] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // ---- 쿠팡 API 자동 동기화 ------------------------------------------------

  const syncFromCoupang = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/ranking/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        if (data.needsSetup) {
          setNeedsSetup(true);
        }
        if (res.status === 404) {
          setNotPtUser(true);
          return false;
        }
        setSyncError(data.error);
        return false;
      }

      setMyListings(data.total_listings);
      setLastSynced(data.synced_at);
      setNeedsSetup(false);
      return true;
    } catch {
      setSyncError('동기화 중 오류가 발생했습니다.');
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  // ---- 랭킹 데이터 조회 ----------------------------------------------------

  const fetchRanking = useCallback(async () => {
    try {
      const res = await fetch('/api/ranking');
      if (res.ok) {
        const data = await res.json();
        setRanking(data.ranking ?? []);
        setMyRank(data.myRank ?? null);
        if (data.myListings != null) setMyListings(data.myListings);
        setTotalParticipants(data.totalParticipants ?? 0);
      }
    } catch {
      console.error('Failed to fetch ranking');
      setSyncError('랭킹 데이터를 불러오지 못했습니다.');
    }
  }, []);

  // ---- 초기 로딩: 동기화 → 랭킹 조회 ----------------------------------------

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await syncFromCoupang();
      await fetchRanking();
      setLoading(false);
    };
    init();
  }, [syncFromCoupang, fetchRanking]);

  // ---- 수동 새로고침 --------------------------------------------------------

  const handleRefresh = async () => {
    const ok = await syncFromCoupang();
    if (ok) await fetchRanking();
  };

  // ---- 메달 색상 ------------------------------------------------------------

  const getRankMedal = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700' };
    if (rank === 2) return { emoji: '🥈', bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-600' };
    if (rank === 3) return { emoji: '🥉', bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700' };
    return { emoji: String(rank), bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-500' };
  };

  // ---- Loading State -------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">상품등록 랭킹</h1>
        </div>
        <Card>
          <div className="text-center py-16 space-y-3">
            <RefreshCw className="w-8 h-8 text-[#E31837] animate-spin mx-auto" />
            <p className="text-gray-500">쿠팡에서 상품 등록 수를 가져오는 중...</p>
            <p className="text-xs text-gray-400">처음 접속 시 잠시 시간이 걸릴 수 있습니다</p>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <FeatureTutorial featureKey="arena" />
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">상품등록 랭킹</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? '동기화 중...' : '새로고침'}
        </button>
      </div>

      {/* ===== PT 사용자 아닌 경우 안내 ===== */}
      {notPtUser && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Users className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">랭킹 참여 안내</p>
            <p className="text-sm text-blue-600 mt-1">
              PT 서비스에 가입하고 쿠팡 API를 연동하면 자동으로 랭킹에 참여됩니다.
            </p>
          </div>
        </div>
      )}

      {/* ===== API 연동 필요 안내 ===== */}
      {needsSetup && !notPtUser && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">쿠팡 API 연동이 필요합니다</p>
            <p className="text-sm text-amber-600 mt-1">
              설정에서 쿠팡 API 키를 등록하면 자동으로 상품 등록 수를 가져옵니다.
            </p>
          </div>
        </div>
      )}

      {/* ===== 동기화 에러 ===== */}
      {syncError && !needsSetup && !notPtUser && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">동기화 오류</p>
            <p className="text-sm text-red-600 mt-1">{syncError}</p>
          </div>
        </div>
      )}

      {/* ===== 내 현황 카드 ===== */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">내 총 상품등록 수</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-[#E31837]">
                {myListings != null ? myListings.toLocaleString() : '—'}
              </span>
              <span className="text-lg text-gray-400">건</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <Crown className="w-5 h-5 text-yellow-500" />
                <span className="text-2xl font-bold text-gray-900">
                  {myRank != null ? `${myRank}위` : '—'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">내 순위</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <Users className="w-5 h-5 text-blue-500" />
                <span className="text-2xl font-bold text-gray-900">
                  {totalParticipants}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">참여 셀러</p>
            </div>
          </div>
        </div>
        {lastSynced && (
          <p className="text-xs text-gray-400 mt-3">
            마지막 동기화: {new Date(lastSynced).toLocaleString('ko-KR')}
          </p>
        )}
      </Card>

      {/* ===== 상위 랭커 TOP 3 하이라이트 ===== */}
      {ranking.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[ranking[1], ranking[0], ranking[2]].map((entry, visualIdx) => {
            const isCenter = visualIdx === 1;
            const medal = getRankMedal(entry.rank);
            return (
              <motion.div
                key={entry.rank}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: visualIdx * 0.1 }}
                className={`relative flex flex-col items-center p-4 rounded-xl border-2 ${
                  entry.isMe ? 'border-[#E31837] bg-red-50' : `${medal.border} ${medal.bg}`
                } ${isCenter ? 'sm:-mt-4 sm:pb-6' : ''}`}
              >
                <span className={`text-3xl ${isCenter ? 'text-4xl' : ''}`}>
                  {medal.emoji}
                </span>
                <span className="text-2xl mt-1">{entry.anonymous_emoji}</span>
                <p className={`text-sm font-bold mt-1 text-center truncate w-full ${
                  entry.isMe ? 'text-[#E31837]' : 'text-gray-900'
                }`}>
                  {entry.anonymous_name}
                  {entry.isMe && ' (나)'}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="w-3.5 h-3.5 text-[#E31837]" />
                  <span className="text-lg font-bold text-[#E31837]">
                    {entry.total_listings.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500">건</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ===== 전체 랭킹 테이블 ===== */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">전체 랭킹</h2>
          <span className="text-xs text-gray-400 ml-1">
            총 {totalParticipants}명 참여
          </span>
        </div>

        {ranking.length === 0 ? (
          <p className="text-center text-gray-400 py-12">아직 랭킹 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 px-3 py-2 border-b border-gray-100">
              <span className="col-span-2">순위</span>
              <span className="col-span-6">셀러</span>
              <span className="col-span-4 text-right">등록 건수</span>
            </div>

            <AnimatePresence>
              {ranking.map((entry, idx) => {
                const medal = getRankMedal(entry.rank);
                return (
                  <motion.div
                    key={entry.rank}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`grid grid-cols-12 gap-2 items-center text-sm px-3 py-2.5 rounded-lg transition ${
                      entry.isMe
                        ? 'bg-[#E31837]/10 border-l-4 border-[#E31837] font-semibold'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Rank */}
                    <span className={`col-span-2 font-bold ${medal.text}`}>
                      {entry.rank <= 3 ? (
                        <span className="text-lg">{medal.emoji}</span>
                      ) : (
                        entry.rank
                      )}
                    </span>

                    {/* Name */}
                    <span className="col-span-6 flex items-center gap-2 truncate">
                      <span className="text-lg shrink-0">{entry.anonymous_emoji}</span>
                      <span className={`truncate ${entry.isMe ? 'text-[#E31837]' : 'text-gray-900'}`}>
                        {entry.anonymous_name}
                        {entry.isMe && (
                          <span className="ml-1 text-xs bg-[#E31837] text-white px-1.5 py-0.5 rounded-full">
                            나
                          </span>
                        )}
                      </span>
                    </span>

                    {/* Listings count */}
                    <span className={`col-span-4 text-right font-bold ${
                      entry.isMe ? 'text-[#E31837]' : 'text-gray-700'
                    }`}>
                      {entry.total_listings.toLocaleString()}
                      <span className="text-xs font-normal text-gray-400 ml-1">건</span>
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* 내 순위가 Top 50 밖인 경우 */}
            {myRank && myRank > 50 && (
              <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-200">
                <div className="grid grid-cols-12 gap-2 items-center text-sm px-3 py-2.5 bg-[#E31837]/10 rounded-lg border-l-4 border-[#E31837] font-semibold">
                  <span className="col-span-2 text-[#E31837] font-bold">{myRank}</span>
                  <span className="col-span-6 text-[#E31837]">
                    나
                  </span>
                  <span className="col-span-4 text-right text-[#E31837] font-bold">
                    {myListings?.toLocaleString() ?? 0}
                    <span className="text-xs font-normal ml-1">건</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ===== 안내 ===== */}
      <div className="text-center text-xs text-gray-400 space-y-1 pb-4">
        <p>랭킹은 쿠팡 API를 통해 자동으로 집계됩니다</p>
        <p>페이지 진입 시 자동 동기화되며, 새로고침 버튼으로 수동 갱신할 수 있습니다</p>
        <p>셀러 이름은 익명으로 표시됩니다</p>
      </div>
    </div>
  );
}
