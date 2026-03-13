'use client';

import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { CHANNEL_LABELS, CHANNEL_BG_COLORS } from '@/lib/sellerhub/constants';
import { CHANNEL_SETUP_GUIDES } from '@/lib/data/channel-setup-guides';
import type { Channel } from '@/lib/sellerhub/types';
import { ExternalLink, Lightbulb, AlertTriangle, Clock, CheckCircle2, Tag } from 'lucide-react';

interface ChannelSetupGuideProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChannelSetupGuide({ channel, isOpen, onClose }: ChannelSetupGuideProps) {
  const router = useRouter();
  const guide = CHANNEL_SETUP_GUIDES[channel];

  const handleGoToOnboarding = () => {
    onClose();
    router.push('/sellerhub/onboarding');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={guide.title} maxWidth="max-w-2xl">
      {/* 헤더 정보 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: CHANNEL_BG_COLORS[channel] }}
          >
            {CHANNEL_LABELS[channel].charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{CHANNEL_LABELS[channel]}</p>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>예상 소요시간: {guide.estimatedTime}</span>
            </div>
          </div>
        </div>

        {/* 사전조건 */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-1.5">사전 준비사항</p>
          <ul className="space-y-1">
            {guide.prerequisites.map((prereq, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                <span>{prereq}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 스텝 타임라인 */}
      <div className="space-y-0 mb-6 max-h-[50vh] overflow-y-auto pr-1">
        {guide.steps.map((step, idx) => (
          <div key={step.stepNumber} className="relative flex gap-4">
            {/* 타임라인 라인 */}
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: CHANNEL_BG_COLORS[channel] }}
              >
                {step.stepNumber}
              </div>
              {idx < guide.steps.length - 1 && (
                <div className="w-0.5 flex-1 bg-gray-200 my-1" />
              )}
            </div>

            {/* 스텝 콘텐츠 */}
            <div className="pb-6 flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 text-sm">{step.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">{step.description}</p>

              {/* 세부 설명 */}
              <ul className="space-y-1 mb-2">
                {step.detailedInstructions.map((inst, i) => (
                  <li key={i} className="text-xs text-gray-700 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:bg-gray-300 before:rounded-full">
                    {inst}
                  </li>
                ))}
              </ul>

              {/* URL 링크 */}
              {step.url && (
                <a
                  href={step.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition mb-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  사이트 열기
                </a>
              )}

              {/* 팁 박스 */}
              {step.tip && (
                <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">{step.tip}</p>
                </div>
              )}

              {/* 경고 박스 */}
              {step.warning && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{step.warning}</p>
                </div>
              )}

              {/* 이 단계에서 얻는 값 */}
              {step.inputFields && step.inputFields.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {step.inputFields.map((field, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-md border border-amber-200"
                    >
                      <Tag className="w-3 h-3" />
                      {field}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 최종 안내 */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-600">{guide.finalNote}</p>
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          닫기
        </button>
        <button
          onClick={handleGoToOnboarding}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
        >
          이해했어요, 연동하러 가기
        </button>
      </div>
    </Modal>
  );
}
