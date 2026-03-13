'use client';

import { useState, useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { GuideStep } from '@/lib/data/guides';

interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
}

interface GuideTutorialQuizProps {
  steps: GuideStep[];
  onComplete: () => void;
  onSkip: () => void;
}

function generateQuizzes(steps: GuideStep[]): QuizItem[] {
  const quizzes: QuizItem[] = [];

  for (const step of steps) {
    if (step.tip && quizzes.length < 3) {
      quizzes.push({
        question: `"${step.title}" 단계에서 알아두면 좋은 팁은?`,
        options: [step.tip, '특별한 팁이 없습니다', '고객센터에 문의하세요'],
        correctIndex: 0,
      });
    }
    if (step.warning && quizzes.length < 3) {
      quizzes.push({
        question: `"${step.title}" 단계에서 주의할 점은?`,
        options: ['특별히 없습니다', step.warning, '상관없습니다'],
        correctIndex: 1,
      });
    }
  }

  // 셔플 옵션 순서 (정답 위치 고정 안 되도록)
  return quizzes.slice(0, 3).map((q) => {
    const entries = q.options.map((opt, i) => ({ opt, isCorrect: i === q.correctIndex }));
    // 간단한 셔플
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    return {
      question: q.question,
      options: entries.map((e) => e.opt),
      correctIndex: entries.findIndex((e) => e.isCorrect),
    };
  });
}

export default function GuideTutorialQuiz({
  steps,
  onComplete,
  onSkip,
}: GuideTutorialQuizProps) {
  const quizzes = useMemo(() => generateQuizzes(steps), [steps]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (quizzes.length === 0) {
    // 퀴즈 생성 불가 → 바로 완료
    onComplete();
    return null;
  }

  const quiz = quizzes[currentIdx];
  const isCorrect = selected !== null && selected === quiz.correctIndex;
  const isWrong = selected !== null && selected !== quiz.correctIndex;

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    if (idx === quiz.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx < quizzes.length - 1) {
      setCurrentIdx((p) => p + 1);
      setSelected(null);
    } else {
      setFinished(true);
    }
  };

  if (finished) {
    return (
      <div className="text-center space-y-4 py-8 animate-fade-in-up">
        <div className="text-5xl">🎓</div>
        <h3 className="text-xl font-bold text-gray-900">
          퀴즈 완료!
        </h3>
        <p className="text-gray-600">
          {quizzes.length}문제 중 {score}개 맞았어요
        </p>
        <button
          type="button"
          onClick={onComplete}
          className="px-6 py-3 bg-[#E31837] text-white font-bold rounded-xl hover:bg-[#c01530] transition"
        >
          완료하기 🎉
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">
          ✏️ 간단 퀴즈 ({currentIdx + 1}/{quizzes.length})
        </h3>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition"
        >
          건너뛰기
        </button>
      </div>

      <p className="text-base font-medium text-gray-800">{quiz.question}</p>

      <div className="space-y-2">
        {quiz.options.map((opt, i) => {
          let style = 'border-gray-200 hover:border-gray-400 bg-white';
          if (selected !== null) {
            if (i === quiz.correctIndex) {
              style = 'border-green-500 bg-green-50';
            } else if (i === selected) {
              style = 'border-red-400 bg-red-50';
            } else {
              style = 'border-gray-200 bg-gray-50 opacity-60';
            }
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={selected !== null}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition text-sm ${style}`}
            >
              <span className="flex items-center gap-2">
                {selected !== null && i === quiz.correctIndex && (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                )}
                {selected !== null && i === selected && i !== quiz.correctIndex && (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                {opt}
              </span>
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="space-y-3 animate-fade-in-up">
          <p className={`text-sm font-medium ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
            {isCorrect ? '정답이에요! 👏' : '아쉽지만 틀렸어요 😅'}
          </p>
          <button
            type="button"
            onClick={handleNext}
            className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition"
          >
            {currentIdx < quizzes.length - 1 ? '다음 문제' : '결과 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
