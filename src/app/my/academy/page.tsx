'use client';

/**
 * 셀러 독학 아카데미 — 지도.
 *
 * 설계도 §11-1. 평평한 목록이 아니라 **길**로 보여준다.
 * 지금 어디 있고 다음이 뭔지가 한눈에 보여야 한다.
 *
 * ★ 잠금 표시는 벌이 아니라 **약속**이다.
 *   "지금 못 배운다" 가 아니라 "그때 배우면 된다" 고 말해준다.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, CheckCircle2, Lock, Loader2, AlertCircle, ArrowRight, Clock, Flame, ListChecks } from 'lucide-react';
import { ACADEMY_BADGES } from '@/lib/data/academy/badges';
import WelcomeGate from '@/components/academy/WelcomeGate';

interface StepView {
  key: string; act: number; order: number; title: string; goal: string;
  estimatedSec: number; xp: number; locked: boolean; lockReason: string | null;
  verify: { level: 1 | 2 | 3 };
  progress: { status: string; attempts: number; passed_at: string | null } | null;
}
interface ActView { act: number; title: string; subtitle: string; access: 'public' | 'pt' }
interface Stats {
  xp: number; totalXp: number; passedCount: number; totalSteps: number;
  level: number; label: string; nextAt: number | null;
}

const LEVEL_BADGE: Record<number, string> = { 1: '🌱', 2: '🔌', 3: '📦', 4: '🚚', 5: '💬' };

export default function AcademyMapPage() {
  const [acts, setActs] = useState<ActView[]>([]);
  const [steps, setSteps] = useState<StepView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [badges, setBadges] = useState<{ badge_key: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 환영 화면 — 아직 안 본 사람에게만. 본 뒤로는 다시 낚아채지 않는다.
  const [intro, setIntro] = useState<{ name: string; firstStepKey: string | null; totalSteps: number } | null>(null);
  // 오늘 할 일 — 실제로 밀린 일에서 만들어진다. 없으면 없다고 말한다.
  const [quests, setQuests] = useState<{
    quests: { key: string; label: string; href: string; xp: number; count?: number }[];
    cleared: boolean;
    checkedCoupang: boolean;
    streak: { current: number; best: number; todayDone: boolean };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/academy/me');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || '불러오지 못했습니다.'); return; }
        setActs(data.acts || []);
        setSteps(data.steps || []);
        setStats(data.stats || null);
        setBadges(data.badges || []);

        // 퀘스트는 쿠팡 조회가 붙어 느릴 수 있다. 지도를 막지 않게 따로 부른다.
        void fetch('/api/academy/quests')
          .then((r) => (r.ok ? r.json() : null))
          .then((q) => { if (q && !cancelled) setQuests(q); })
          .catch(() => { /* 퀘스트 실패가 지도를 막지는 않는다 */ });

        const introRes = await fetch('/api/academy/intro');
        if (introRes.ok && !cancelled) {
          const info = await introRes.json();
          if (!info.seen && !info.hasProgress) {
            setIntro({ name: info.name, firstStepKey: info.firstStepKey, totalSteps: info.totalSteps });
          }
        }
      } catch {
        if (!cancelled) setError('불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const owned = useMemo(() => new Set(badges.map((b) => b.badge_key)), [badges]);
  /** 단계 번호 — 잠긴 것도 번호를 가진다. 그래야 "33개 중 12번째" 가 성립한다. */
  const stepNo = useMemo(() => {
    const m = new Map<string, number>();
    steps.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [steps]);

  /** 다음에 할 일 — 잠기지 않았고 아직 통과 못 한 것 중 제일 앞 */
  const nextStep = useMemo(
    () => steps.find((s) => !s.locked && s.progress?.status !== 'passed'),
    [steps],
  );

  if (loading) {
    return <div className="py-20 text-center text-gray-400"><Loader2 className="inline h-6 w-6 animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }

  const pct = stats && stats.totalSteps > 0 ? Math.round((stats.passedCount / stats.totalSteps) * 100) : 0;

  return (
    <div className="space-y-5">
      {intro && (
        <WelcomeGate
          name={intro.name}
          firstStepKey={intro.firstStepKey}
          totalSteps={intro.totalSteps}
          onDismiss={() => setIntro(null)}
        />
      )}

      {/* ── 머리 — 지금 내 상태 ─────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <GraduationCap className="h-6 w-6 text-gray-900" />
          <h1 className="text-xl font-bold text-gray-900">셀러 아카데미</h1>
          <span className="flex-1" />
          {quests && quests.streak.current > 0 && (
            <span
              title={`최고 ${quests.streak.best}일`}
              className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-sm font-semibold text-orange-700"
            >
              <Flame className="h-4 w-4" /> {quests.streak.current}일 연속
            </span>
          )}
          {stats && (
            <span className="rounded-lg bg-gray-900 px-2.5 py-1 text-sm font-semibold text-white">
              {LEVEL_BADGE[stats.level] || '🌱'} Lv.{stats.level} {stats.label}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-gray-600">
          트레이너 없이 혼자 끝까지 갑니다. 각 단계는 <b>시스템이 직접 쿠팡에 물어봐서</b> 됐는지 확인해드립니다.
        </p>

        {stats && (
          <>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gray-900 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              <span><b className="tabular-nums">{stats.passedCount}</b>/{stats.totalSteps}단계</span>
              <span><b className="tabular-nums">{stats.xp.toLocaleString()}</b> XP</span>
              {stats.nextAt !== null && (
                <span className="text-gray-500">다음 등급까지 {(stats.nextAt - stats.xp).toLocaleString()} XP</span>
              )}
            </div>
          </>
        )}

        {nextStep && (
          <Link
            href={`/my/academy/${nextStep.key}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#E31837] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c41230]"
          >
            이어서 하기 · {nextStep.title}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* ── 오늘 할 일 ─────────────────────────────────────────
          ★ 실제로 밀린 일에서만 만든다. 가짜 할 일을 주는 순간 목록 전체가 신뢰를 잃는다. */}
      {quests && (quests.quests.length > 0 || quests.checkedCoupang) && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <ListChecks className="h-4 w-4 text-gray-500" /> 오늘 할 일
          </p>
          {quests.quests.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              밀린 일이 없습니다. {quests.cleared ? '오늘 운영한 것으로 기록했습니다.' : '주문이나 문의가 들어오면 여기 뜹니다.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {quests.quests.map((q) => (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50"
                  >
                    <span className="inline-block h-4 w-4 flex-none rounded border-2 border-gray-300" />
                    <span className="flex-1 text-gray-900">{q.label}</span>
                    <span className="text-xs tabular-nums text-gray-500">+{q.xp}</span>
                    <ArrowRight className="h-4 w-4 flex-none text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── 길 ───────────────────────────────────────────────── */}
      {acts.map((act) => {
        const actSteps = steps.filter((s) => s.act === act.act);
        if (!actSteps.length) return null;
        const done = actSteps.filter((s) => s.progress?.status === 'passed').length;
        const allLocked = actSteps.every((s) => s.locked);

        return (
          <section key={act.act} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">Act {act.act} · {act.title}</h2>
              <span className="text-sm text-gray-500">{act.subtitle}</span>
              <span className="flex-1" />
              {allLocked
                ? <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"><Lock className="h-3 w-3" /> PT 단계</span>
                : <span className="text-xs tabular-nums text-gray-600">{done}/{actSteps.length}</span>}
            </div>

            <ol className="mt-3 space-y-2">
              {actSteps.map((s) => {
                const passed = s.progress?.status === 'passed';
                const isNext = nextStep?.key === s.key;
                const body = (
                  <div
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      passed ? 'border-emerald-200 bg-emerald-50'
                        : isNext ? 'border-gray-900 bg-white ring-1 ring-gray-900'
                        : s.locked ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    {/* 번호를 보여준다 — 통과하면 체크로 바뀐다. 몇 번째인지 모르면 끝이 안 보인다. */}
                    <span className="mt-0.5 flex-none">
                      {passed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        : s.locked
                          ? <Lock className="h-5 w-5 text-gray-300" />
                          : (
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums ${
                              isNext ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-500'
                            }`}>
                              {stepNo.get(s.key)}
                            </span>
                          )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${s.locked ? 'text-gray-400' : 'text-gray-900'}`}>
                        {s.title}
                        {isNext && <span className="ml-2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white">지금 여기</span>}
                      </span>
                      <span className={`mt-0.5 block text-xs ${s.locked ? 'text-gray-400' : 'text-gray-600'}`}>
                        {s.locked ? s.lockReason : s.goal}
                      </span>
                    </span>
                    {!s.locked && (
                      <span className="flex flex-none items-center gap-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{Math.round(s.estimatedSec / 60)}분</span>
                        <span className="tabular-nums">+{s.xp}</span>
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={s.key}>
                    {s.locked ? body : <Link href={`/my/academy/${s.key}`} className="block">{body}</Link>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {/* ── 뱃지 도감 ───────────────────────────────────────────
          미획득도 함께 보여준다 — 목표가 보여야 움직인다.
          다만 실루엣으로 낮춰서, 가진 것과 헷갈리지 않게 한다. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold text-gray-900">🏅 뱃지</p>
          <span className="text-xs tabular-nums text-gray-500">{owned.size}/{ACADEMY_BADGES.length}</span>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ACADEMY_BADGES.map((b) => {
            const got = owned.has(b.key);
            return (
              <li
                key={b.key}
                title={got ? '획득' : b.how}
                className={`rounded-lg border p-2.5 ${
                  got ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
                }`}
              >
                <span className={`text-lg ${got ? '' : 'opacity-25 grayscale'}`}>{b.emoji}</span>
                <span className={`mt-0.5 block text-xs font-semibold ${got ? 'text-amber-900' : 'text-gray-400'}`}>
                  {b.name}
                </span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${got ? 'text-amber-800' : 'text-gray-400'}`}>
                  {got ? '획득' : b.how}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
