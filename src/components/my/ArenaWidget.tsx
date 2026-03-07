'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import { Trophy, ArrowRight, Crown, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface RankingInfo {
  myRank: number | null;
  myListings: number | null;
  totalParticipants: number;
}

export default function ArenaWidget() {
  const [info, setInfo] = useState<RankingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/ranking');
        if (res.ok) {
          const data = await res.json();
          setInfo({
            myRank: data.myRank,
            myListings: data.myListings,
            totalParticipants: data.totalParticipants ?? 0,
          });
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

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#E31837]" />
            <h3 className="font-bold text-gray-900">상품등록 랭킹</h3>
          </div>
          <Link
            href="/my/arena"
            className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
          >
            랭킹 보기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {info && info.myListings != null ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-[#E31837]" />
                <span className="text-2xl font-bold text-[#E31837]">
                  {info.myListings.toLocaleString()}
                </span>
                <span className="text-sm text-gray-400">건</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm shrink-0">
              {info.myRank && (
                <div className="text-center">
                  <p className="font-bold text-yellow-600 flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5" />
                    {info.myRank}위
                  </p>
                  <p className="text-xs text-gray-400">내 순위</p>
                </div>
              )}
              <div className="text-center">
                <p className="font-bold text-gray-700">
                  {info.totalParticipants}명
                </p>
                <p className="text-xs text-gray-400">참여</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-gray-500">쿠팡 API를 연동하면 자동으로 랭킹에 참여됩니다</p>
            <Link
              href="/my/arena"
              className="inline-block mt-2 px-4 py-1.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-red-700 transition"
            >
              확인하기
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
