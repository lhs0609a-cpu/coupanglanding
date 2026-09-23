'use client';

/**
 * 스텝 플레이어 — 설계도 §11-2.
 *
 * 왼쪽에 "보여주는 것"(영상·목업), 오른쪽에 "말해주는 것"(내레이션),
 * 아래에 "확인해주는 것"(판정). 트레이너가 하던 세 가지를 그대로 옮긴 배치다.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, ExternalLink, Clock, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import NarrationPlayer from '@/components/academy/NarrationPlayer';
import VerifyPanel, { TroubleList, type VerifyView } from '@/components/academy/VerifyPanel';

interface StepFull {
  key: string; act: number; title: string; goal: string; why: string;
  estimatedSec: number; xp: number; narration: string[];
  actions: { label: string; href?: string; external?: boolean; copyable?: { label: string; text: string } }[];
  troubleshoot: { symptom: string; cause: string; fix: string }[];
  video?: { youtubeId?: string; src?: string; startSec: number; endSec: number };
  mockup?: { imageUrl: string; capturedAt: string; hotspots: { x: number; y: number; w: number; h: number; label: string; order: number }[] };
  verify: VerifyView;
  locked: boolean; lockReason: string | null;
  progress: { status: string } | null;
}

export default function AcademyStepPage({ params }: { params: Promise<{ stepKey: string }> }) {
  const { stepKey } = use(params);
  const router = useRouter();
  const [step, setStep] = useState<StepFull | null>(null);
  // 통과 후 자동 이동까지 남은 초. null 이면 이동하지 않는다(사용자가 머무르기를 눌렀다).
  const [autoIn, setAutoIn] = useState<number | null>(null);
  const [nextKey, setNextKey] = useState<string | null>(null);
  // 몇 번째 / 전체 몇 개 — 끝이 보여야 사람이 끝까지 간다.
  const [pos, setPos] = useState<{ no: number; total: number } | null>(null);
  const [passed, setPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // 자체 호스팅 영상의 서명 URL. 없는 단계가 대부분이라 null 이 정상이다.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/me');
      const data = await res.json();
      if (!res.ok) { setError(data.error || '불러오지 못했습니다.'); return; }
      const all = (data.steps || []) as StepFull[];
      const idx = all.findIndex((s) => s.key === stepKey);
      if (idx < 0) { setError('없는 단계입니다.'); return; }
      setStep(all[idx]);
      setPos({ no: idx + 1, total: all.length });
      setPassed(all[idx].progress?.status === 'passed');
      const after = all.slice(idx + 1).find((s) => !s.locked);
      setNextKey(after?.key ?? null);
    } catch {
      setError('불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [stepKey]);

  useEffect(() => { void load(); }, [load]);

  // ── 영상 챕터 ───────────────────────────────────────────────
  // 서명 URL 은 한 시간짜리라 미리 받아둘 수 없다. 단계를 열 때 그때그때 받는다.
  // 204(영상 없음)는 오류가 아니라 정상이므로 조용히 넘어간다.
  useEffect(() => {
    let alive = true;
    setVideoUrl(null);
    if (!step?.video?.src) return;
    (async () => {
      try {
        const res = await fetch(`/api/academy/video/${stepKey}`);
        if (!alive || res.status !== 200) return;
        const data = await res.json();
        if (alive && data.url) setVideoUrl(data.url as string);
      } catch { /* 영상이 없어도 단계는 진행돼야 한다 */ }
    })();
    return () => { alive = false; };
  }, [stepKey, step?.video?.src]);

  // ── 통과하면 저절로 다음 단계로 ─────────────────────────────
  //   매번 "다음" 을 누르게 하면 흐름이 끊긴다. 대신 머무를 수 있게 문을 열어둔다.
  useEffect(() => {
    if (autoIn === null || !nextKey) return;
    if (autoIn <= 0) { router.push(`/my/academy/${nextKey}`); return; }
    const t = setTimeout(() => setAutoIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [autoIn, nextKey, router]);

  if (loading) return <div className="py-20 text-center text-gray-400"><Loader2 className="inline h-6 w-6 animate-spin" /></div>;
  if (error || !step) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" /> {error || '없는 단계입니다.'}
        </div>
        <Link href="/my/academy" className="text-sm text-gray-600 underline">아카데미로 돌아가기</Link>
      </div>
    );
  }

  if (step.locked) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h1 className="text-lg font-bold text-gray-900">{step.title}</h1>
          <p className="mt-1.5 text-sm text-gray-600">{step.lockReason}</p>
        </div>
        <Link href="/my/academy" className="text-sm text-gray-600 underline">아카데미로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/my/academy" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> 아카데미
      </Link>

      {/* ── 머리 — 목표와 이유 ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {pos && (
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700">
              {pos.no}<span className="text-gray-400">/{pos.total}</span>
            </span>
          )}
          <h1 className="text-xl font-bold text-gray-900">{step.title}</h1>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" /> 약 {Math.round(step.estimatedSec / 60)}분
          </span>
          <span className="rounded-md bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">+{step.xp} XP</span>
        </div>
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">🎯 {step.goal}</p>
        {/* 이유 없는 지시는 안 지켜진다 */}
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.why}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── 왼쪽 — 보여주는 것 ─────────────────────────── */}
        <div className="space-y-4 lg:col-span-3">
          {/* 자체 호스팅 클립이 우선. 원본이 화면공유 녹화라 유튜브에 그대로 못 올리는 탓에
              잘라내어 비공개 버킷에 둔다. 서명 URL 은 /api/academy/video/[stepKey] 가 준다.
              videoUrl 이 아직 안 왔거나 204(영상 없음)면 아무것도 그리지 않는다. */}
          {videoUrl && (
            <figure className="overflow-hidden rounded-xl border border-gray-200 bg-black">
              <video className="w-full" src={videoUrl} controls preload="metadata" playsInline />
              <figcaption className="border-t border-gray-800 bg-black px-3 py-1.5 text-[11px] text-gray-400">
                실제 1:1 교육 통화에서 이 단계에 해당하는 구간입니다.
              </figcaption>
            </figure>
          )}

          {step.video?.youtubeId && !videoUrl && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
              <iframe
                className="aspect-video w-full"
                src={`https://www.youtube.com/embed/${step.video.youtubeId}?start=${step.video.startSec}&end=${step.video.endSec}&rel=0`}
                title={step.title}
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {step.mockup && (
            <figure className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.mockup.imageUrl} alt={step.title} className="w-full" />
                {step.mockup.hotspots.map((h) => (
                  <span
                    key={h.order}
                    className="absolute rounded-md border-2 border-[#E31837] bg-[#E31837]/10"
                    style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}
                  >
                    <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#E31837] text-[10px] font-bold text-white">
                      {h.order}
                    </span>
                  </span>
                ))}
              </div>
              <figcaption className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
                {step.mockup.capturedAt} 기준 화면입니다. 쿠팡 화면이 바뀌었으면 알려주세요.
              </figcaption>
            </figure>
          )}

          {/* 지금 할 일 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">▸ 지금 할 일</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {step.actions.map((a, i) =>
                a.copyable ? (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(a.copyable!.text);
                        setCopied(a.copyable!.label);
                        setTimeout(() => setCopied(null), 1500);
                      } catch { /* 클립보드 권한 없으면 조용히 넘어간다 */ }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    {copied === a.copyable.label ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {a.copyable.label}
                  </button>
                ) : a.external ? (
                  <a
                    key={i}
                    href={a.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    {a.label} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Link
                    key={i}
                    href={a.href || '#'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                  >
                    {a.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ),
              )}
            </div>
          </div>

          <TroubleList items={step.troubleshoot} />
        </div>

        {/* ── 오른쪽 — 말해주는 것 + 확인해주는 것 ───────── */}
        <div className="space-y-4 lg:col-span-2">
          <NarrationPlayer lines={step.narration} stepKey={step.key} />
          <VerifyPanel
            stepKey={step.key}
            verify={step.verify}
            alreadyPassed={passed}
            onPassed={() => { setPassed(true); setAutoIn(3); }}
          />
          {passed && nextKey && (
            <div className="space-y-2">
              <Link
                href={`/my/academy/${nextKey}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#E31837] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c41230]"
              >
                다음 단계{autoIn !== null && autoIn > 0 ? ` (${autoIn}초)` : ''} <ArrowRight className="h-4 w-4" />
              </Link>
              {autoIn !== null && autoIn > 0 && (
                <button
                  type="button"
                  onClick={() => setAutoIn(null)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50"
                >
                  잠시 후 자동으로 넘어갑니다 · 여기 더 볼게요
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
