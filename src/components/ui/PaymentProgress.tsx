'use client';

import { Check } from 'lucide-react';
import { PAYMENT_FLOW_STEPS } from '@/lib/utils/constants';
import type { PaymentStatus } from '@/lib/supabase/types';

interface PaymentProgressProps {
  currentStatus: PaymentStatus;
}

const STATUS_ORDER: PaymentStatus[] = ['submitted', 'reviewed', 'deposited', 'confirmed'];

function getStepIndex(status: PaymentStatus): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? -1 : idx;
}

export default function PaymentProgress({ currentStatus }: PaymentProgressProps) {
  if (currentStatus === 'pending' || currentStatus === 'rejected') return null;

  const currentIdx = getStepIndex(currentStatus);

  return (
    <div className="flex items-center w-full">
      {PAYMENT_FLOW_STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs mt-1.5 whitespace-nowrap ${
                  isCompleted
                    ? 'text-green-600 font-medium'
                    : isCurrent
                      ? 'text-blue-600 font-medium'
                      : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < PAYMENT_FLOW_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-1rem] ${
                  i < currentIdx ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
