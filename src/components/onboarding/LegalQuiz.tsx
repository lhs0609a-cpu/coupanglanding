'use client';

import { useState } from 'react';
import { getQuizQuestions } from '@/lib/data/quiz-registry';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

interface LegalQuizProps {
  ptUserId: string;
  stepKey: string;
  onComplete: () => void;
  loading: boolean;
}

interface QuizResult {
  questionId: number;
  correct: boolean;
  explanation: string;
}

export default function LegalQuiz({ ptUserId, stepKey, onComplete, loading }: LegalQuizProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [passed, setPassed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quizQuestions = getQuizQuestions(stepKey);
  const question = quizQuestions[currentQuestion];
  const totalQuestions = quizQuestions.length;
  const allAnswered = Object.keys(answers).length === totalQuestions;

  const handleAnswer = (questionId: number, answer: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/quiz-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptUserId, stepKey, answers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '제출에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setResults(data.results);
      setPassed(data.passed);

      if (data.passed) {
        onComplete();
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    }

    setSubmitting(false);
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setResults([]);
    setPassed(false);
    setCurrentQuestion(0);
    setError(null);
  };

  const getResultForQuestion = (questionId: number) =>
    results.find((r) => r.questionId === questionId);

  // Results view
  if (submitted) {
    const correctCount = results.filter((r) => r.correct).length;

    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-lg border ${passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            {passed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>
              {passed ? '축하합니다! 모두 정답이에요!' : `${correctCount}/${totalQuestions} 정답 — 모두 맞혀야 통과해요!`}
            </span>
          </div>
          {!passed && (
            <p className="text-sm text-red-600 mt-1">아래 해설을 읽고 다시 도전해주세요.</p>
          )}
        </div>

        {quizQuestions.map((q) => {
          const result = getResultForQuestion(q.id);
          return (
            <div
              key={q.id}
              className={`p-4 rounded-lg border ${
                result?.correct ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'
              }`}
            >
              <div className="flex items-start gap-2">
                {result?.correct ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Q{q.id}. {q.question}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    내 답: <span className="font-medium">{answers[q.id]}</span>
                    {' / '}
                    정답: <span className="font-medium text-green-700">{q.correctAnswer}</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-2 bg-white/80 p-2 rounded">
                    {q.explanation}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {!passed && (
          <button
            type="button"
            onClick={handleRetry}
            className="w-full py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            다시 풀기
          </button>
        )}
      </div>
    );
  }

  // Quiz question view
  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>문제 {currentQuestion + 1} / {totalQuestions}</span>
        <span>{Object.keys(answers).length}개 답변 완료</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-[#E31837] h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${((currentQuestion + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-bold text-gray-900 mb-3">
          Q{question.id}. {question.question}
        </p>

        {question.type === 'ox' ? (
          <div className="grid grid-cols-2 gap-3">
            {['O', 'X'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleAnswer(question.id, opt)}
                className={`py-3 rounded-lg text-lg font-bold border-2 transition ${
                  answers[question.id] === opt
                    ? 'border-[#E31837] bg-[#E31837]/5 text-[#E31837]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {question.options?.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleAnswer(question.id, opt.key)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition text-sm ${
                  answers[question.id] === opt.key
                    ? 'border-[#E31837] bg-[#E31837]/5 text-[#E31837] font-medium'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium mr-2">({opt.key})</span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentQuestion((c) => Math.max(0, c - 1))}
          disabled={currentQuestion === 0}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition"
        >
          이전 문제
        </button>

        {currentQuestion < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentQuestion((c) => Math.min(totalQuestions - 1, c + 1))}
            className="px-3 py-1.5 text-sm font-medium text-[#E31837] hover:text-[#c01530] transition"
          >
            다음 문제
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* Question dots */}
      <div className="flex items-center justify-center gap-2">
        {quizQuestions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setCurrentQuestion(i)}
            className={`w-8 h-8 rounded-full text-xs font-medium transition ${
              i === currentQuestion
                ? 'bg-[#E31837] text-white'
                : answers[q.id]
                  ? 'bg-[#E31837]/10 text-[#E31837]'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Submit */}
      {allAnswered && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || loading}
          className="w-full py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {submitting ? '채점 중...' : '제출하기'}
        </button>
      )}
    </div>
  );
}
