'use client';

/**
 * 아카데미 환영 화면.
 *
 * ★ 이름을 다시 묻지 않는다. 가입할 때 받은 이름을 그대로 부른다.
 *   입력창을 하나 더 만드는 건 입구에서 사람을 세우는 일이다.
 *
 * ★ "나중에 하기" 를 반드시 둔다.
 *   빠져나갈 문이 없으면 갇힌 느낌이 들고, 갇힌 느낌은 그 자체로 이탈 사유가 된다.
 *   대신 한 번 보고 나면 다시 낚아채지 않는다(intro_seen_at).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, ArrowRight, Loader2 } from 'lucide-react';

export default function WelcomeGate({
  name, firstStepKey, totalSteps, onDismiss,
}: {
  name: string;
  firstStepKey: string | null;
  totalSteps: number;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const mark = async () => {
    try { await fetch('/api/academy/intro', { method: 'POST' }); } catch { /* 기록 실패가 진행을 막지는 않는다 */ }
  };

  const start = async () => {
    setBusy(true);
    await mark();
    if (firstStepKey) router.push(`/my/academy/${firstStepKey}`);
    else onDismiss();
  };

  const later = async () => {
    setBusy(true);
    await mark();
    onDismiss();
    router.push('/my/dashboard');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <GraduationCap className="h-8 w-8 text-[#E31837]" />
        <h1 className="mt-3 text-2xl font-bold text-gray-900">
          {name ? `${name}님, 시작합니다` : '셀러 아카데미를 시작합니다'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          쿠팡 셀러가 되는 데 필요한 것을 <b>{totalSteps}단계</b>로 나눠뒀습니다.
          순서대로만 따라오시면 됩니다.
        </p>

        <ul className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-800">
          <li>📋 <b>읽어드립니다</b> — 각 단계마다 음성으로 설명이 나옵니다</li>
          <li>✅ <b>확인해드립니다</b> — 다 했는지 시스템이 쿠팡에 직접 물어봅니다</li>
          <li>🆘 <b>막히면 알려드립니다</b> — 단계마다 흔한 문제와 해결법이 있습니다</li>
        </ul>

        <p className="mt-3 text-xs text-gray-500">
          먼저 이 일이 어떤 일인지, 나한테 맞는지부터 봅니다. 사업자등록은 그다음입니다.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#E31837] px-4 py-3 text-sm font-semibold text-white hover:bg-[#c41230] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>첫 단계 시작하기 <ArrowRight className="h-4 w-4" /></>}
          </button>
          <button
            type="button"
            onClick={later}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  );
}
