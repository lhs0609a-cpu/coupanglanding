'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FEATURE_TUTORIALS, TOTAL_TUTORIAL_XP } from '@/lib/data/feature-tutorials';
import { getTutorialProgress } from '@/lib/utils/tutorial-progress';
import type { TutorialProgress } from '@/lib/utils/tutorial-progress';
import Card from '@/components/ui/Card';
import { Gamepad2, ArrowRight } from 'lucide-react';

export default function TutorialHubWidget() {
  const [progress, setProgress] = useState<TutorialProgress | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const featureKeys = FEATURE_TUTORIALS.map((t) => t.featureKey);
    setProgress(getTutorialProgress(featureKeys));
  }, []);

  if (!mounted || !progress) return null;

  const { completedCount, totalTutorials, totalXpEarned, completionPercent } = progress;

  // 모든 튜토리얼 완료 시 숨김
  if (completedCount === totalTutorials) return null;

  return (
    <Link href="/my/education">
      <Card className="hover:border-purple-300 hover:shadow-md transition cursor-pointer">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5 text-purple-600" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 text-sm">기능 튜토리얼</h3>
              <span className="text-xs font-medium text-amber-600">⚡ {totalXpEarned} XP</span>
            </div>

            {/* 진행률 바 */}
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {completedCount}/{totalTutorials} 완료 · {completionPercent}%
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
