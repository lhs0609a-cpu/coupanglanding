'use client';

import { useState, useEffect } from 'react';
import { FEATURE_TUTORIALS, TOTAL_TUTORIAL_XP } from '@/lib/data/feature-tutorials';
import { getTutorialProgress } from '@/lib/utils/tutorial-progress';
import type { TutorialProgress } from '@/lib/utils/tutorial-progress';
import TutorialCard, { FEATURE_HREFS } from './TutorialCard';
import { Gamepad2 } from 'lucide-react';

export default function TutorialHub() {
  const [progress, setProgress] = useState<TutorialProgress | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const featureKeys = FEATURE_TUTORIALS.map((t) => t.featureKey);
    setProgress(getTutorialProgress(featureKeys));
  }, []);

  if (!mounted || !progress) return null;

  const { completedCount, totalTutorials, totalXpEarned, completionPercent } = progress;

  return (
    <div className="space-y-4">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Gamepad2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">기능 튜토리얼</h2>
            <p className="text-xs text-gray-500">각 페이지를 방문하여 튜토리얼을 완료하세요</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-amber-600">⚡ {totalXpEarned} / {TOTAL_TUTORIAL_XP} XP</p>
          <p className="text-xs text-gray-400">{completedCount}/{totalTutorials} 완료</p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {FEATURE_TUTORIALS.map((tutorial) => (
          <TutorialCard
            key={tutorial.featureKey}
            tutorial={tutorial}
            href={FEATURE_HREFS[tutorial.featureKey] || '/my/dashboard'}
          />
        ))}
      </div>

      {/* 전체 완료 시 축하 */}
      {completedCount === totalTutorials && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-lg">🎉</p>
          <p className="font-bold text-purple-800">모든 튜토리얼을 마스터했습니다!</p>
          <p className="text-sm text-purple-600">총 {TOTAL_TUTORIAL_XP} XP 획득</p>
        </div>
      )}
    </div>
  );
}
