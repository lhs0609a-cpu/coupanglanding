import Link from 'next/link';
import { Lock, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import type { ComputedStepStatus } from '@/components/onboarding/onboarding-utils';
import { ONBOARDING_STATUS_LABELS, ONBOARDING_STATUS_COLORS } from '@/lib/utils/constants';

interface ModuleCardProps {
  stepKey: string;
  order: number;
  label: string;
  icon: string;
  tagline: string;
  estimatedTime: string;
  status: ComputedStepStatus;
  isLocked: boolean;
}

export default function ModuleCard({
  stepKey,
  order,
  label,
  icon,
  tagline,
  estimatedTime,
  status,
  isLocked,
}: ModuleCardProps) {
  const isCompleted = status === 'completed' || status === 'approved';

  const cardContent = (
    <div
      className={`relative border rounded-xl p-5 transition h-full ${
        isLocked
          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
          : isCompleted
            ? 'border-green-200 bg-green-50/50 hover:shadow-md hover:border-green-300'
            : status === 'rejected'
              ? 'border-red-200 bg-red-50/30 hover:shadow-md hover:border-red-300'
              : 'border-gray-200 bg-white hover:shadow-md hover:border-[#E31837]/30'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{isLocked ? '🔒' : icon}</span>
          <span className="text-xs font-bold text-gray-400">#{order}</span>
        </div>
        {!isLocked && (
          <Badge
            label={ONBOARDING_STATUS_LABELS[status]}
            colorClass={ONBOARDING_STATUS_COLORS[status]}
          />
        )}
      </div>

      <h3 className={`text-sm font-bold mb-1 ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>
        {label}
      </h3>
      <p className={`text-xs mb-3 line-clamp-2 ${isLocked ? 'text-gray-400' : 'text-gray-500'}`}>
        {tagline}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{estimatedTime}</span>
        {!isLocked && !isCompleted && (
          <ArrowRight className="w-4 h-4 text-[#E31837]" />
        )}
        {isCompleted && (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        )}
        {isLocked && (
          <Lock className="w-4 h-4 text-gray-300" />
        )}
      </div>
    </div>
  );

  if (isLocked) {
    return cardContent;
  }

  return (
    <Link href={`/my/education/${stepKey}`}>
      {cardContent}
    </Link>
  );
}
