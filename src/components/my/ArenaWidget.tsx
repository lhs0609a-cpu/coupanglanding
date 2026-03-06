'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import { Swords, ArrowRight, Flame, Trophy } from 'lucide-react';
import Link from 'next/link';
import { ARENA_LEVELS } from '@/lib/utils/arena-points';

interface ArenaStats {
  total_points: number;
  current_level: number;
  streak_days: number;
  weekly_rank: number | null;
  anonymous_name: string | null;
  anonymous_emoji: string | null;
}

export default function ArenaWidget() {
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/arena');
        if (res.ok) {
          const result = await res.json();
          if (result.points) {
            setStats(result.points);
          }
        }
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="py-4 text-center text-gray-400 text-sm">불러오는 중...</div>
      </Card>
    );
  }

  const level = stats ? ARENA_LEVELS.find(l => l.level === stats.current_level) || ARENA_LEVELS[0] : ARENA_LEVELS[0];

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-[#E31837]" />
            <h3 className="font-bold text-gray-900">셀러 아레나</h3>
          </div>
          <Link
            href="/my/arena"
            className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
          >
            참여하기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {stats ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{level.emoji}</span>
              <div>
                <p className="font-bold text-gray-900">{level.label}</p>
                <p className="text-xs text-gray-500">{stats.anonymous_emoji} {stats.anonymous_name}</p>
              </div>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <p className="font-bold text-[#E31837]">{stats.total_points.toLocaleString()}</p>
                <p className="text-xs text-gray-400">포인트</p>
              </div>
              {stats.streak_days > 0 && (
                <div className="text-center">
                  <p className="font-bold text-orange-500 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    {stats.streak_days}
                  </p>
                  <p className="text-xs text-gray-400">연속</p>
                </div>
              )}
              {stats.weekly_rank && (
                <div className="text-center">
                  <p className="font-bold text-yellow-500 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5" />
                    {stats.weekly_rank}위
                  </p>
                  <p className="text-xs text-gray-400">주간</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-gray-500">아레나에 참여하고 다른 셀러들과 경쟁하세요!</p>
            <Link
              href="/my/arena"
              className="inline-block mt-2 px-4 py-1.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
            >
              시작하기
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
