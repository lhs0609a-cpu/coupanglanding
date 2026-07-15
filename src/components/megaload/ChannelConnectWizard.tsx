'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { CHANNEL_LABELS, CHANNEL_BG_COLORS } from '@/lib/megaload/constants';
import { CHANNEL_SETUP_GUIDES } from '@/lib/data/channel-setup-guides';
import { CHANNEL_CREDENTIAL_FIELDS } from '@/lib/data/channel-credential-fields';
import type { Channel } from '@/lib/megaload/types';
import type { ChannelGuideStep } from '@/lib/data/channel-setup-guides';
import {
  ExternalLink, Lightbulb, AlertTriangle, Check, ChevronLeft, ChevronRight,
  Star, Trophy, Loader2, KeyRound, PartyPopper, Eye, EyeOff,
} from 'lucide-react';

interface Props {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const XP_PER_STEP = 10;
const XP_CONNECT = 50;

// 진행도에 따른 마스코트 응원 문구 (초등학생도 부담 없게)
function mascotLine(pct: number): string {
  if (pct === 0) return '같이 한 단계씩 가볼까요? 어렵지 않아요! 🐣';
  if (pct < 40) return '좋아요! 그대로 따라오면 돼요 👍';
  if (pct < 70) return '오~ 벌써 절반 왔어요! 💪';
  if (pct < 100) return '거의 다 왔어요! 마지막만 입력하면 끝! ✨';
  return '완벽해요! 채널 정복 완료! 🎉';
}

/** 단계 내용에 맞춰 "이런 화면이 나와요" 목업을 자동 생성 (실제 스크린샷은 추후 드롭인) */
function StepMockup({ step, color }: { step: ChannelGuideStep; color: string }) {
  const [imgError, setImgError] = useState(false);
  let domain: string | null = null;
  try { domain = step.url ? new URL(step.url).hostname : null; } catch { domain = null; }
  const hasKeys = (step.inputFields?.length ?? 0) > 0;
  const isPermission = /권한|체크|✅/.test(step.detailedInstructions.join(' ') + step.title);
  // 실제 화면 이미지가 있고 로드 성공하면 표시, 실패(핫링크 차단 등)하면 목업으로 폴백
  const showRealImage = !!step.imageUrl && !imgError;

  return (
    <div className="rounded-xl border-2 border-gray-200 overflow-hidden bg-white shadow-sm select-none">
      {/* 가짜 윈도우 바 */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        {domain && (
          <span className="ml-2 text-[10px] text-gray-500 bg-white rounded-full px-2 py-0.5 truncate max-w-[200px]">
            🔒 {domain}
          </span>
        )}
      </div>
      {showRealImage ? (
        <figure className="m-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={step.imageUrl}
            alt={step.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full max-h-[340px] object-contain bg-gray-50"
          />
          <figcaption className="text-[10px] text-gray-400 text-center py-1 px-2">
            실제 화면 예시 · 출처: 윈셀링 가이드 (마켓 UI 버전에 따라 다를 수 있어요)
          </figcaption>
        </figure>
      ) : (
      <div className="p-4 min-h-[96px] flex flex-col items-center justify-center gap-2">
        {hasKeys ? (
          // 키를 얻는 단계 → 가짜 키 필드
          <div className="w-full space-y-1.5">
            {step.inputFields!.map((f) => (
              <div key={f} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-amber-800">{f}</span>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">•••••••• <span className="text-blue-500">복사</span></span>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 text-center">이 값을 복사해 두세요 ✂️</p>
          </div>
        ) : isPermission ? (
          // 권한 체크 단계 → 가짜 체크박스
          <div className="grid grid-cols-2 gap-1.5 w-full">
            {['상품 관리', '주문 관리', '클레임 관리', '정산 관리'].map((p) => (
              <span key={p} className="flex items-center gap-1 text-[11px] bg-green-50 border border-green-200 rounded-lg px-2 py-1.5 text-green-700">
                <Check className="w-3 h-3" /> {p}
              </span>
            ))}
          </div>
        ) : (
          // 일반 단계 → 가짜 버튼
          <div
            className="px-4 py-2 rounded-lg text-white text-xs font-bold shadow"
            style={{ backgroundColor: color }}
          >
            {step.title}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default function ChannelConnectWizard({ channel, isOpen, onClose, onConnected }: Props) {
  const guide = CHANNEL_SETUP_GUIDES[channel];
  const fields = CHANNEL_CREDENTIAL_FIELDS[channel];
  const color = CHANNEL_BG_COLORS[channel];
  const guideSteps = guide.steps;
  const keyStepIndex = guideSteps.length;          // 키 입력 단계 인덱스
  const totalSteps = guideSteps.length + (fields ? 1 : 0);
  const storeKey = `chwiz:${channel}`;

  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // 이어하기 (localStorage)
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw) as { step?: number; done?: number[] };
        setStep(Math.min(saved.step ?? 0, totalSteps));
        setDone(new Set(saved.done ?? []));
      } else {
        setStep(0); setDone(new Set());
      }
    } catch { /* ignore */ }
    setResult(null);
  }, [isOpen, storeKey, totalSteps]);

  const persist = useCallback((s: number, d: Set<number>) => {
    try { localStorage.setItem(storeKey, JSON.stringify({ step: s, done: [...d] })); } catch { /* ignore */ }
  }, [storeKey]);

  const completeStep = (idx: number) => {
    const nd = new Set(done); nd.add(idx); setDone(nd);
    const next = Math.min(idx + 1, totalSteps);
    setStep(next); persist(next, nd);
  };

  const goPrev = () => { const p = Math.max(0, step - 1); setStep(p); persist(p, done); };

  const connected = result?.success === true;
  const xp = done.size * XP_PER_STEP + (connected ? XP_CONNECT : 0);
  const progressPct = Math.round((Math.min(step, totalSteps) / totalSteps) * 100);

  const filledRequired = useMemo(
    () => !fields || fields.filter((f) => !f.optional).every((f) => (creds[f.key] || '').trim().length > 0),
    [fields, creds],
  );

  const handleConnect = async () => {
    setTesting(true); setResult(null);
    try {
      const testRes = await fetch('/api/megaload/channels/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, credentials: creds }),
      });
      const testJson = await testRes.json();
      if (!testJson.success) {
        setResult({ success: false, message: testJson.message || '연결 실패 — 키를 다시 확인해주세요' });
        setTesting(false);
        return;
      }
      await fetch('/api/megaload/channels/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, credentials: creds }),
      });
      const nd = new Set(done); nd.add(keyStepIndex); setDone(nd);
      persist(totalSteps, nd);
      setResult({ success: true, message: testJson.message || '연결 성공!' });
      onConnected?.();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : '연결 중 오류' });
    } finally {
      setTesting(false);
    }
  };

  const onGuideStep = step < keyStepIndex;
  const onKeyStep = fields && step === keyStepIndex;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${CHANNEL_LABELS[channel]} 연동하기`} maxWidth="max-w-xl">
      {/* ── 상단: 진행률 + XP + 마스코트 ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full transition-colors"
                style={{ backgroundColor: i < step ? color : i === step ? `${color}88` : '#e5e7eb' }}
              />
            ))}
            <span className="ml-1 text-xs text-gray-400">
              {Math.min(step + (connected ? 0 : 1), totalSteps)}/{totalSteps}
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {xp} XP
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${connected ? 100 : progressPct}%`, backgroundColor: color }} />
        </div>
        <p className="text-xs text-gray-500 mt-2">{mascotLine(connected ? 100 : progressPct)}</p>
      </div>

      {/* ── 완료(축하) 화면 ── */}
      {connected ? (
        <div className="text-center py-8">
          <div className="flex justify-center gap-1 mb-3 text-3xl">
            {['🎉', '🏆', '🎊'].map((e, i) => (
              <span key={i} className="inline-block animate-bounce" style={{ animationDelay: `${i * 120}ms` }}>{e}</span>
            ))}
          </div>
          <h3 className="text-xl font-bold text-gray-900">{CHANNEL_LABELS[channel]} 정복 완료!</h3>
          <p className="text-sm text-gray-500 mt-1">채널 +1 · {XP_CONNECT} XP 획득 🎯</p>
          <div className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full text-white text-sm font-bold" style={{ backgroundColor: color }}>
            <Trophy className="w-4 h-4" /> 연결됨
          </div>
          <p className="text-xs text-gray-400 mt-4">이제 쿠팡에 등록하면 {CHANNEL_LABELS[channel]}에도 자동으로 올라가요.</p>
          <button onClick={onClose} className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: color }}>
            완료
          </button>
        </div>
      ) : onGuideStep ? (
        /* ── 가이드 단계 (한 번에 하나) ── */
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: color }}>
              {guideSteps[step].stepNumber}
            </div>
            <div>
              <h4 className="font-bold text-gray-900">{guideSteps[step].title}</h4>
              <p className="text-xs text-gray-500">{guideSteps[step].description}</p>
            </div>
          </div>

          <StepMockup step={guideSteps[step]} color={color} />

          <ul className="space-y-1.5 my-3">
            {guideSteps[step].detailedInstructions.map((inst, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-gray-100 text-[10px] text-gray-500 flex items-center justify-center shrink-0">{i + 1}</span>
                {inst}
              </li>
            ))}
          </ul>

          {guideSteps[step].url && (
            <a href={guideSteps[step].url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg mb-2" style={{ backgroundColor: color }}>
              <ExternalLink className="w-4 h-4" /> 사이트 열기 (새 창)
            </a>
          )}
          {guideSteps[step].tip && (
            <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg mb-2">
              <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">{guideSteps[step].tip}</p>
            </div>
          )}
          {guideSteps[step].warning && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{guideSteps[step].warning}</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {step > 0 && (
              <button onClick={goPrev} className="px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
            )}
            <button onClick={() => completeStep(step)} className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5" style={{ backgroundColor: color }}>
              <Check className="w-4 h-4" /> 했어요! 다음 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : onKeyStep ? (
        /* ── 키 입력 단계 (인라인 테스트+저장) ── */
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: color }}>
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900">마지막! 키 입력하기</h4>
              <p className="text-xs text-gray-500">복사해 둔 값을 붙여넣고 연결을 확인해요.</p>
            </div>
          </div>

          <div className="space-y-3">
            {fields!.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-sm text-gray-600 mb-1">
                  {f.label}{!f.optional && <span style={{ color }}> *</span>}
                </span>
                <div className="relative">
                  <input
                    type={f.secret && !showSecret[f.key] ? 'password' : 'text'}
                    value={creds[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ ['--tw-ring-color' as string]: `${color}55` }}
                  />
                  {f.secret && (
                    <button type="button" onClick={() => setShowSecret((p) => ({ ...p, [f.key]: !p[f.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showSecret[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </label>
            ))}
          </div>

          {result && !result.success && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg mt-3">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{result.message}</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={goPrev} className="px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> 이전
            </button>
            <button onClick={handleConnect} disabled={!filledRequired || testing}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: color }}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PartyPopper className="w-4 h-4" />}
              연결 테스트 & 저장
            </button>
          </div>
        </div>
      ) : (
        /* ── 준비중 채널(토스/카카오 등 키 필드 없음) ── */
        <div className="py-4">
          <div className="text-center mb-4">
            <p className="text-4xl mb-2">🚧</p>
            <h3 className="font-bold text-gray-900">{CHANNEL_LABELS[channel]} — 준비 중</h3>
            {guide.steps[0]?.description && (
              <p className="text-xs text-gray-500 mt-1 px-2">{guide.steps[0].description}</p>
            )}
          </div>
          {(guide.steps[0]?.detailedInstructions?.length ?? 0) > 0 && (
            <ul className="space-y-1.5 mb-3 bg-gray-50 rounded-lg p-3">
              {guide.steps[0].detailedInstructions.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="mt-0.5" style={{ color }}>•</span>{t}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400 text-center mb-4">{guide.finalNote}</p>
          <button onClick={onClose} className="w-full px-4 py-2.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">닫기</button>
        </div>
      )}
    </Modal>
  );
}
