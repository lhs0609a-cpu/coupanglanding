'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getProgressToNextTier, formatRevenue } from '@/lib/data/growth-roadmap';
import Card from '@/components/ui/Card';
import { Map, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function GrowthRoadmapWidget() {
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: ptUser } = await supabase
          .from('pt_users')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle();
        if (!ptUser) return;

        const { data: report } = await supabase
          .from('monthly_reports')
          .select('reported_revenue')
          .eq('pt_user_id', ptUser.id)
          .order('year_month', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (report?.reported_revenue != null) {
          setRevenue(report.reported_revenue);
          setHasData(true);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  if (loading) {
    return (
      <Card>
        <div className="py-4 text-center text-gray-400 text-sm">불러오는 중...</div>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="w-5 h-5 text-[#E31837]" />
              <h3 className="font-bold text-gray-900">성장 로드맵</h3>
            </div>
            <Link
              href="/my/growth"
              className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
            >
              더보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="py-2 text-center text-gray-400 text-sm">
            매출 데이터가 없습니다
          </div>
        </div>
      </Card>
    );
  }

  const { current, next, progress } = getProgressToNextTier(revenue);

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-[#E31837]" />
            <h3 className="font-bold text-gray-900">성장 로드맵</h3>
          </div>
          <Link
            href="/my/growth"
            className="flex items-center gap-1 text-sm text-[#E31837] hover:underline"
          >
            더보기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{current.badgeEmoji}</span>
            <span className="font-semibold text-gray-900">{current.label}</span>
            <span className="text-sm text-gray-500">
              (월 {formatRevenue(revenue)})
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{current.label}</span>
              {next ? <span>{next.label}</span> : <span>최고 등급</span>}
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E31837] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {next && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                다음: {next.badgeEmoji} {next.label}
                <span className="ml-1 text-gray-400">
                  ({formatRevenue(next.revenueMin)} 이상)
                </span>
              </p>
              {/* 다음 단계 신규 혜택 미리보기 */}
              {next.benefits.filter((b) => b.isNew).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {next.benefits.filter((b) => b.isNew).slice(0, 3).map((b, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                    >
                      {b.label}
                    </span>
                  ))}
                  {next.benefits.filter((b) => b.isNew).length > 3 && (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] text-gray-400 rounded-full bg-gray-100">
                      +{next.benefits.filter((b) => b.isNew).length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
