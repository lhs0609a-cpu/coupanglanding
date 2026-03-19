'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';

interface QuestionOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  category: string;
  title: string;
  scenario: string;
  options: QuestionOption[];
}

interface FreeTextQ {
  id: string;
  title: string;
  question: string;
  placeholder: string;
  minLength: number;
}

type Step = 'loading' | 'error' | 'welcome' | 'testing' | 'freetext' | 'submitting' | 'done';

export default function ScreeningPage() {
  const { token } = useParams<{ token: string }>();

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [freeTextQ, setFreeTextQ] = useState<FreeTextQ | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [startTime] = useState(Date.now());
  const [grade, setGrade] = useState('');
  const [direction, setDirection] = useState(1);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 질문 데이터 로드
  useEffect(() => {
    if (!token) return;
    fetch(`/api/screening/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '오류가 발생했습니다.');
        }
        return res.json();
      })
      .then((data) => {
        setCandidateName(data.candidateName);
        setQuestions(data.questions);
        setFreeTextQ(data.freeTextQuestion);
        setStep('welcome');
      })
      .catch((err) => {
        setError(err.message);
        setStep('error');
      });
  }, [token]);

  // 답변 선택
  const selectOption = useCallback(
    (questionId: string, optionId: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: optionId }));

      // 자동 진행 (300ms 딜레이)
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setDirection(1);
          setCurrentIndex((i) => i + 1);
        } else {
          setStep('freetext');
        }
      }, 300);
    },
    [currentIndex, questions.length]
  );

  // 제출
  const handleSubmit = async () => {
    setStep('submitting');
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    try {
      const res = await fetch(`/api/screening/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          freeTextAnswer: freeText,
          timeSpentSeconds: timeSpent,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '제출에 실패했습니다.');
      }

      const data = await res.json();
      setGrade(data.grade || '');
      setStep('done');
    } catch (err: unknown) {
      setError((err as Error).message);
      setStep('error');
    }
  };

  const currentQ = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  // 슬라이드 애니메이션
  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 프로그레스바 */}
      {(step === 'testing' || step === 'freetext') && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1.5 bg-gray-200">
          <div
            className="h-full bg-[#E31837] transition-all duration-500 ease-out"
            style={{ width: step === 'freetext' ? '100%' : `${progress}%` }}
          />
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        {/* Loading */}
        {step === 'loading' && (
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#E31837] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-gray-500">준비 중...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">접속 불가</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        )}

        {/* Welcome */}
        {step === 'welcome' && (
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#E31837]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📋</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">파트너 적합성 테스트</h1>
              <p className="text-gray-500">
                안녕하세요, <span className="font-semibold text-gray-900">{candidateName}</span>님
              </p>
            </div>

            <div className="space-y-4 mb-8 text-sm text-gray-600">
              <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                <span className="text-lg">📝</span>
                <div>
                  <p className="font-medium text-gray-900">21개 시나리오 + 자유서술 1문항</p>
                  <p>각 상황에서 가장 가까운 답변을 선택해 주세요</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                <span className="text-lg">⏱</span>
                <div>
                  <p className="font-medium text-gray-900">약 10~15분 소요</p>
                  <p>충분히 생각하고 솔직하게 답변해 주세요</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                <span className="text-lg">🔒</span>
                <div>
                  <p className="font-medium text-gray-900">비공개 처리</p>
                  <p>답변은 프로그램 심사 용도로만 활용됩니다</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('testing')}
              className="w-full py-4 bg-[#E31837] text-white rounded-xl font-semibold text-lg hover:bg-[#C41530] transition"
            >
              시작하기
            </button>
          </div>
        )}

        {/* Testing */}
        {step === 'testing' && currentQ && (
          <div className="max-w-lg w-full">
            <div className="text-center mb-2">
              <span className="text-sm text-gray-400">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentQ.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-lg p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold text-gray-900 mb-2">{currentQ.title}</h2>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">{currentQ.scenario}</p>

                <div className="space-y-3">
                  {currentQ.options.map((opt) => {
                    const selected = answers[currentQ.id] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => selectOption(currentQ.id, opt.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all text-sm ${
                          selected
                            ? 'border-[#E31837] bg-[#E31837]/5 text-gray-900'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        {opt.text}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Free Text */}
        {step === 'freetext' && freeTextQ && (
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-2">{freeTextQ.title}</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-6">{freeTextQ.question}</p>

            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={freeTextQ.placeholder}
              rows={6}
              className="w-full border-2 border-gray-200 rounded-xl p-4 text-sm focus:border-[#E31837] focus:ring-0 outline-none resize-none"
            />

            <div className="flex items-center justify-between mt-3 mb-6">
              <span className={`text-xs ${freeText.length >= freeTextQ.minLength ? 'text-green-600' : 'text-gray-400'}`}>
                {freeText.length}자 / 최소 {freeTextQ.minLength}자
              </span>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={freeText.length < freeTextQ.minLength}
              className="w-full py-4 bg-[#E31837] text-white rounded-xl font-semibold text-lg hover:bg-[#C41530] transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              제출하기
            </button>
          </div>
        )}

        {/* Submitting */}
        {step === 'submitting' && (
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#E31837] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-gray-500">답변을 제출하고 있습니다...</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">응시 완료</h2>
            <p className="text-gray-600 mb-6">
              답변이 성공적으로 제출되었습니다.<br />
              심사 결과는 별도로 안내드리겠습니다.
            </p>
            {grade && (
              <div className="inline-flex items-center gap-2 bg-gray-50 rounded-xl px-6 py-3">
                <span className="text-sm text-gray-500">내부 등급</span>
                <span className={`text-2xl font-black ${
                  grade === 'S' ? 'text-purple-600' :
                  grade === 'A' ? 'text-green-600' :
                  grade === 'B' ? 'text-blue-600' :
                  grade === 'C' ? 'text-yellow-600' : 'text-red-600'
                }`}>{grade}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
