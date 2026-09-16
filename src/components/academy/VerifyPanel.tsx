'use client';

/**
 * "다 했나요?" — 판정 패널.
 *
 * 설계도 §11-3. 여기서 지켜야 하는 것 하나:
 *   **판정 결과는 반드시 근거를 말한다.** "실패했습니다" 만 있으면 사람은 거기서 막힌다.
 *   "쿠팡에 등록된 상품이 0건으로 조회됩니다" 라야 다음 행동을 스스로 찾는다.
 *   서버가 detail 을 주고, 이 화면은 그걸 숨기지 않고 그대로 보여준다.
 */

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, HelpCircle, ShieldQuestion } from 'lucide-react';

interface QuizQ { q: string; choices: string[] }

export interface VerifyView {
  level: 1 | 2 | 3;
  hint?: string;
  checklist?: string[];
  quiz?: QuizQ[];
}

export interface VerifyOutcome {
  passed: boolean;
  detail: string;
  attempts: number;
  canRequestReview: boolean;
  xpAwarded: number;
  badgeAwarded?: string;
  cooldownMs?: number;
}

export default function VerifyPanel({
  stepKey, verify, alreadyPassed, onPassed,
}: {
  stepKey: string;
  verify: VerifyView;
  alreadyPassed: boolean;
  onPassed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyOutcome | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const quiz = verify.quiz ?? [];
  const checklist = verify.checklist ?? [];
  const checklistDone = checklist.every((_, i) => checked[i]);
  const quizDone = quiz.every((_, i) => answers[i] !== undefined);
  const ready = verify.level === 3 ? checklistDone && quizDone : true;

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/academy/steps/${encodeURIComponent(stepKey)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: quiz.map((_, i) => answers[i]) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ passed: false, detail: data.error || '확인에 실패했습니다.', attempts: 0, canRequestReview: false, xpAwarded: 0 });
        return;
      }
      setResult(data);
      if (data.passed) onPassed();
    } catch {
      setResult({ passed: false, detail: '네트워크 오류로 확인하지 못했습니다. 잠시 후 다시 눌러주세요.', attempts: 0, canRequestReview: false, xpAwarded: 0 });
    } finally {
      setBusy(false);
    }
  };

  if (alreadyPassed && !result) {
    return (
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 font-semibold text-emerald-900">
          <CheckCircle2 className="h-5 w-5" /> 이미 통과한 단계입니다
        </p>
      </div>
    );
  }

  // L2 — 증빙 업로드는 아직 서버가 없다. 있는 척하면 사람이 거기서 멈춘다.
  if (verify.level === 2) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 font-semibold text-amber-900">
          <ShieldQuestion className="h-5 w-5" /> 증빙 확인은 준비 중입니다
        </p>
        <p className="mt-1.5 text-sm text-amber-900">{verify.hint}</p>
        <p className="mt-1.5 text-xs text-amber-800">
          지금은 이 단계를 자동으로 확인해드리지 못합니다. 위 안내대로 먼저 진행해두시면,
          증빙 확인 기능이 열릴 때 이어서 통과 처리됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* L3 — 자가 확인 + 퀴즈 */}
      {verify.level === 3 && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          {checklist.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-900">먼저 확인해주세요</p>
              <ul className="mt-2 space-y-1.5">
                {checklist.map((c, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!checked[i]}
                        onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))}
                        className="mt-0.5"
                      />
                      {c}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quiz.map((q, qi) => (
            <fieldset key={qi} className="rounded-lg border border-gray-100 p-3">
              <legend className="px-1 text-sm font-semibold text-gray-900">{q.q}</legend>
              <div className="mt-1 space-y-1">
                {q.choices.map((c, ci) => (
                  <label key={ci} className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`q${qi}`}
                      checked={answers[qi] === ci}
                      onChange={() => setAnswers((p) => ({ ...p, [qi]: ci }))}
                      className="mt-0.5"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div className="rounded-xl border-2 border-gray-900 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">✅ 다 했나요?</p>
        {verify.level === 1 && verify.hint && (
          <p className="mt-1 text-xs text-gray-600">{verify.hint}</p>
        )}
        <button
          type="button"
          onClick={run}
          disabled={busy || !ready}
          className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : '확인하기'}
        </button>
        {!ready && (
          <p className="mt-2 text-center text-xs text-gray-500">위 항목에 모두 답하면 확인할 수 있습니다.</p>
        )}
      </div>

      {result && (
        <div
          role="status"
          className={`rounded-xl border-2 p-4 ${
            result.passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}
        >
          <p className={`flex items-center gap-2 font-semibold ${result.passed ? 'text-emerald-900' : 'text-red-900'}`}>
            {result.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {result.passed ? '확인했습니다' : '아직 안 된 것 같습니다'}
          </p>
          {/* ★ 판정 근거 — 이게 없으면 사람은 여기서 막힌다 */}
          <p className={`mt-1.5 text-sm ${result.passed ? 'text-emerald-900' : 'text-red-900'}`}>{result.detail}</p>

          {result.passed && result.xpAwarded > 0 && (
            <p className="mt-2 text-sm font-semibold text-emerald-800">
              +{result.xpAwarded} XP{result.badgeAwarded ? ' · 🏅 뱃지 획득' : ''}
            </p>
          )}

          {!result.passed && result.canRequestReview && (
            <p className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-800">
              {result.attempts}번 확인했는데 계속 안 되네요. 실제로는 끝내셨는데 확인이 안 되는 것일 수 있습니다 —
              아래 <b>막히셨나요?</b> 를 먼저 보시고, 그래도 안 되면 1:1 문의로 알려주세요. 사람이 직접 확인해드립니다.
            </p>
          )}
          {!result.passed && result.cooldownMs ? (
            <p className="mt-2 text-xs text-red-800">
              약 {Math.ceil(result.cooldownMs / 1000)}초 뒤에 다시 눌러주세요.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function TroubleList({ items }: { items: { symptom: string; cause: string; fix: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <p className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
        <HelpCircle className="h-4 w-4 text-gray-500" /> 막히셨나요?
      </p>
      <div className="divide-y divide-gray-100">
        {items.map((t, i) => (
          <details key={i} className="px-3 py-2">
            <summary className="cursor-pointer text-sm text-gray-800">{t.symptom}</summary>
            <p className="mt-1.5 text-xs text-gray-500">{t.cause}</p>
            <p className="mt-1 text-sm text-gray-900">{t.fix}</p>
          </details>
        ))}
      </div>
      <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
        여기에 없는 문제면 <a href="/my/support" className="underline">1:1 문의</a>로 알려주세요.
      </p>
    </div>
  );
}
