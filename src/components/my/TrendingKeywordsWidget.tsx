'use client';

import { useState, useEffect } from 'react';
import type { TrendingKeyword } from '@/lib/supabase/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Flame, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function TrendingKeywordsWidget() {
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trends?limit=5');
        if (res.ok) {
          const result = await res.json();
          setKeywords(result.data || []);
        }
      } catch {
        // silent
      }
      setLoading(false);
    })();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 50) return 'text-orange-500';
    return 'text-gray-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-400';
    return 'bg-gray-300';
  };

  if (loading) {
    return (
      <Card>
        <div className="py-4 text-center text-gray-400 text-sm">불러오는 중...</div>
      </Card>
    );
  }

  if (keywords.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#E31837]" />
            <h3 className="font-bold text-gray-900">인기 트렌드</h3>
          </div>
          <Link
            href="/my/trends"
            className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
          >
            더보기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="space-y-3">
          {keywords.map((kw, index) => (
            <div key={kw.id} className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-400 w-5">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{kw.keyword}</span>
                  <Badge colorClass="bg-blue-100 text-blue-700">{kw.category}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getScoreBg(kw.trend_score)}`}
                    style={{ width: `${kw.trend_score}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right ${getScoreColor(kw.trend_score)}`}>
                  {kw.trend_score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
