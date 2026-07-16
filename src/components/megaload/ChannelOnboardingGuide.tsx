'use client';

import { useState, useMemo } from 'react';
import OnboardingMockup from './OnboardingMockup';
import { CHANNEL_ONBOARDING_GUIDES } from '@/lib/data/channel-onboarding-guides';
import { CHANNEL_LABELS, CHANNEL_BG_COLORS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import {
  ExternalLink, Lightbulb, AlertTriangle, Check, ChevronLeft, ChevronRight,
  Clock, Wallet, FileText, Users, ArrowRight, Store, Ban,
} from 'lucide-react';

/**
 * 입점(판매자 회원가입) 가이드 뷰 — 연동 마법사의 "① 입점 방법" 탭.
 * 각 마켓의 실제 가입 절차를 화면 목업 + 실제 스크린샷과 함께 단계별로 안내.
 */
export default function ChannelOnboardingGuide({
  channel,
  onGoConnect,
}: {
  channel: Channel;
  onGoConnect: () => void;
}) {
  const guide = CHANNEL_ONBOARDING_GUIDES[channel];
  const color = CHANNEL_BG_COLORS[channel];
  const label = CHANNEL_LABELS[channel];
  const steps = guide.steps;
  const [idx, setIdx] = useState(0);
  // -1 = 개요(준비물) 화면, 0..n-1 = 각 단계
  const [showOverview, setShowOverview] = useState(true);

  const domain = useMemo(() => {
    try { return steps[idx]?.url ? new URL(steps[idx].url!).hostname : null; } catch { return null; }
  }, [steps, idx]);

  // 준비중(공식 셀러 API/입점 API 미공개) 채널
  if (!guide.available) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Ban className="w-7 h-7 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900">{label} — 셀프 입점 준비 중</h3>
        <p className="text-sm text-gray-500 mt-1.5 px-4 leading-relaxed">{guide.headline}</p>
        <ul className="text-left max-w-sm mx-auto mt-4 space-y-1.5 bg-gray-50 rounded-lg p-3">
          {steps[0]?.detailedInstructions.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="mt-0.5" style={{ color }}>•</span>{t}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-gray-400 mt-4">{guide.finalNote}</p>
      </div>
    );
  }

  // ── 개요(준비물) 화면 ──
  if (showOverview) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: color }}>
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{label} 입점하기</h3>
            <p className="text-xs text-gray-500">{guide.headline}</p>
          </div>
        </div>

        {/* 한눈에 보기 카드 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { icon: <Users className="w-4 h-4" />, label: '대상', value: guide.eligibility },
            { icon: <Clock className="w-4 h-4" />, label: '소요', value: guide.estimatedTime },
            { icon: <Wallet className="w-4 h-4" />, label: '비용', value: guide.cost },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-gray-200 p-2.5">
              <div className="flex items-center gap-1 text-gray-400 mb-1" style={{ color }}>{c.icon}</div>
              <p className="text-[10px] text-gray-400">{c.label}</p>
              <p className="text-[11px] font-medium text-gray-700 leading-tight mt-0.5">{c.value}</p>
            </div>
          ))}
        </div>

        {/* 준비물 */}
        <div className="rounded-lg border border-gray-200 p-3 mb-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
            <FileText className="w-4 h-4" style={{ color }} /> 미리 준비하면 좋아요
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guide.documents.map((d) => (
              <span key={d} className="text-[11px] rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1 text-gray-600">{d}</span>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg mb-4">
          <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">{guide.settlementSummary}</p>
        </div>

        <button
          onClick={() => { setShowOverview(false); setIdx(0); }}
          className="w-full px-4 py-3 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5"
          style={{ backgroundColor: color }}
        >
          입점 절차 시작하기 · 총 {steps.length}단계 <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onGoConnect}
          className="w-full mt-2 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-700"
        >
          이미 {label} 판매자예요 → 바로 연동하기
        </button>
      </div>
    );
  }

  // ── 단계 화면 ──
  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  return (
    <div>
      {/* 진행 점 */}
      <div className="flex items-center gap-1.5 mb-3">
        {steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === idx ? 20 : 8, backgroundColor: i <= idx ? color : '#e5e7eb' }}
            aria-label={`${i + 1}단계`}
          />
        ))}
        <span className="ml-auto text-[11px] text-gray-400">입점 {idx + 1}/{steps.length}</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: color }}>
          {step.stepNumber}
        </div>
        <div>
          <h4 className="font-bold text-gray-900 leading-tight">{step.title}</h4>
          <p className="text-xs text-gray-500">{step.description}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-5 items-start">
        {/* 왼쪽: 실제 화면(크게) */}
        <div>
          <OnboardingMockup
            screen={step.screen}
            color={color}
            domain={domain}
            imageUrl={step.imageUrl}
            imageSource={step.imageSource}
          />
        </div>

        {/* 오른쪽: 따라 하기 */}
        <div>
          <p className="text-xs font-bold text-gray-400 mb-2">이대로 따라 하세요</p>
          <ul className="space-y-2">
            {step.detailedInstructions.map((inst, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-gray-700">
                <span className="mt-0.5 w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>{i + 1}</span>
                {inst}
              </li>
            ))}
          </ul>

          {step.url && (
            <a href={step.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-bold text-white rounded-lg mt-3" style={{ backgroundColor: color }}>
              <ExternalLink className="w-4 h-4" /> 사이트 열기 (새 창)
            </a>
          )}
          {step.tip && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg mt-3">
              <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[13px] text-blue-700 leading-relaxed">{step.tip}</p>
            </div>
          )}
          {step.warning && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg mt-3">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[13px] text-red-700 leading-relaxed">{step.warning}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => (idx === 0 ? setShowOverview(true) : setIdx(idx - 1))}
          className="px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> {idx === 0 ? '개요' : '이전'}
        </button>
        {isLast ? (
          <button
            onClick={onGoConnect}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5"
            style={{ backgroundColor: color }}
          >
            <Check className="w-4 h-4" /> 입점 완료! 이제 연동하기 <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setIdx(idx + 1)}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5"
            style={{ backgroundColor: color }}
          >
            다음 단계 <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
