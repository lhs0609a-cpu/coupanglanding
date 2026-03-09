'use client';

import Link from 'next/link';
import type { FeatureTutorialData } from '@/lib/data/feature-tutorials';
import { isTutorialCompleted } from '@/lib/utils/tutorial-progress';
import { CheckCircle } from 'lucide-react';

interface TutorialCardProps {
  tutorial: FeatureTutorialData;
  href: string;
}

// featureKey → 페이지 경로 매핑
export const FEATURE_HREFS: Record<string, string> = {
  dashboard: '/my/dashboard',
  report: '/my/report',
  history: '/my/history',
  trends: '/my/trends',
  contract: '/my/contract',
  emergency: '/my/emergency',
  violations: '/my/violations',
  'tax-invoices': '/my/tax-invoices',
  'cs-templates': '/my/cs-templates',
  growth: '/my/growth',
  penalty: '/my/penalty',
  arena: '/my/arena',
  education: '/my/education',
  guides: '/my/guides',
  settings: '/my/settings',
};

export default function TutorialCard({ tutorial, href }: TutorialCardProps) {
  const completed = isTutorialCompleted(tutorial.featureKey);

  return (
    <Link href={href}>
      <div className={`relative rounded-xl border p-4 transition-all hover:shadow-md hover:border-gray-300 cursor-pointer ${
        completed ? 'bg-green-50/50 border-green-200' : 'bg-white border-gray-200'
      }`}>
        {/* 완료 마크 */}
        {completed && (
          <div className="absolute top-3 right-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        )}

        {/* 아이콘 + 이름 */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{tutorial.icon}</span>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{tutorial.name}</h3>
            <p className="text-xs text-gray-500">{tutorial.steps.length}단계</p>
          </div>
        </div>

        {/* XP */}
        <div className="flex items-center justify-between mt-3">
          <span className={`text-xs font-medium ${completed ? 'text-green-600' : 'text-amber-600'}`}>
            ⚡ {tutorial.xp} XP
          </span>
          {completed ? (
            <span className="text-xs text-green-600 font-medium">완료</span>
          ) : (
            <span className="text-xs text-gray-400">미완료</span>
          )}
        </div>
      </div>
    </Link>
  );
}
