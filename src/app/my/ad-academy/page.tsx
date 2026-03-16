'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Tv, Star, Lock, ChevronRight, Trophy, Zap } from 'lucide-react';
import Card from '@/components/ui/Card';
import { AD_ACADEMY_STAGES, STAGE_IDS } from '@/lib/data/ad-academy-stages';
import { getStageProgress, isStageUnlocked, getAcademyOverview } from '@/lib/utils/ad-academy-progress';

export default function AdAcademyPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const overview = mounted ? getAcademyOverview(STAGE_IDS) : null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Tv className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">광고 아카데미</h1>
          <p className="text-sm text-gray-500">게임처럼 배우는 쿠팡 광고 마스터 과정</p>
        </div>
      </div>

      {/* Progress Overview */}
      {mounted && overview && (
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-gray-900">진행률</span>
              </div>
              <span className="text-sm font-medium text-gray-500">
                {overview.clearedCount}/{overview.totalStages} 스테이지
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
              <motion.div
                className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${overview.completionPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="w-4 h-4 fill-current" />
                <span className="font-medium">{overview.totalStars}/{overview.maxStars}</span>
              </div>
              {overview.isAllCleared && (
                <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-full">
                  ALL CLEAR!
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Stage Map */}
      <div className="mt-6 space-y-3">
        {AD_ACADEMY_STAGES.map((stage, idx) => {
          const unlocked = mounted ? isStageUnlocked(stage.id, STAGE_IDS) : idx === 0;
          const progress = mounted ? getStageProgress(stage.id) : null;
          const cleared = progress?.cleared ?? false;
          const stars = progress?.stars ?? 0;
          const isBoss = stage.id === 'boss';

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
            >
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => router.push(`/my/ad-academy/${stage.id}`)}
                className={`w-full text-left rounded-xl border-2 transition-all ${
                  !unlocked
                    ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                    : cleared
                      ? 'border-green-200 bg-white hover:border-green-300 hover:shadow-md'
                      : isBoss
                        ? 'border-red-200 bg-gradient-to-r from-red-50 to-orange-50 hover:border-red-400 hover:shadow-lg'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                }`}
              >
                <div className="p-4 flex items-center gap-4">
                  {/* Stage Number / Icon */}
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                      !unlocked
                        ? 'bg-gray-100'
                        : cleared
                          ? 'bg-green-100'
                          : `bg-gradient-to-br ${stage.bgGradient} text-white`
                    }`}
                  >
                    {!unlocked ? (
                      <Lock className="w-6 h-6 text-gray-400" />
                    ) : cleared ? (
                      '✅'
                    ) : (
                      <span>{stage.emoji}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">
                        {isBoss ? 'BOSS' : `STAGE ${stage.stageNumber}`}
                      </span>
                      {isBoss && !cleared && unlocked && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded animate-pulse">
                          FINAL
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 truncate">{stage.title}</h3>
                    <p className="text-xs text-gray-500 truncate">{stage.subtitle}</p>

                    {/* Stars */}
                    {cleared && (
                      <div className="flex items-center gap-0.5 mt-1">
                        {[1, 2, 3].map(s => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= stars ? 'text-amber-400 fill-current' : 'text-gray-200'
                            }`}
                          />
                        ))}
                        <span className="ml-1.5 text-xs text-green-600 font-medium">
                          +{progress?.pointsEarned || 0}P
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex-shrink-0">
                    {!unlocked ? (
                      <Lock className="w-5 h-5 text-gray-300" />
                    ) : (
                      <ChevronRight className={`w-5 h-5 ${cleared ? 'text-green-400' : 'text-gray-400'}`} />
                    )}
                  </div>
                </div>

                {/* Reward Preview */}
                {unlocked && !cleared && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs text-gray-500">
                      클리어 보상: <span className="font-bold text-amber-600">{stage.rewards.basePoints}P</span>
                      {stage.rewards.badge && (
                        <> + <span className="font-bold text-purple-600">{stage.rewards.badgeLabel}</span> 뱃지</>
                      )}
                    </span>
                  </div>
                )}
              </button>

              {/* Connector Line */}
              {idx < AD_ACADEMY_STAGES.length - 1 && (
                <div className="flex justify-center my-1">
                  <div className={`w-0.5 h-4 ${cleared ? 'bg-green-300' : 'bg-gray-200'}`} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Info */}
      <div className="mt-8 p-4 bg-indigo-50 rounded-xl text-center">
        <p className="text-sm text-indigo-700 font-medium">
          각 스테이지를 클리어하면 포인트와 뱃지를 획득할 수 있어요!
        </p>
        <p className="text-xs text-indigo-500 mt-1">
          전체 클리어 시 보너스 {100}P + 광고 마스터 뱃지
        </p>
      </div>
    </div>
  );
}
