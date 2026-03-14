'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Star, Gift, ChevronRight, CheckCircle2, XCircle, Lightbulb, RotateCcw, Home, Sparkles } from 'lucide-react';
import { AD_ACADEMY_STAGES, STAGE_IDS } from '@/lib/data/ad-academy-stages';
import type { ConceptCard, QuizQuestion, OXItem, KeywordItem, BidScenario, StrategyScenario } from '@/lib/data/ad-academy-stages';
import { saveStageResult, isStageUnlocked } from '@/lib/utils/ad-academy-progress';

type Phase = 'intro' | 'concept' | 'minigame' | 'quiz' | 'clear';

export default function StagePlayPage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = use(params);
  const router = useRouter();
  const stage = AD_ACADEMY_STAGES.find(s => s.id === stageId);
  const [phase, setPhase] = useState<Phase>('intro');
  const [mounted, setMounted] = useState(false);

  // Intro state
  const [introLine, setIntroLine] = useState(0);

  // Concept state
  const [cardIndex, setCardIndex] = useState(0);
  const [foundTips, setFoundTips] = useState<string[]>([]);
  const [showTip, setShowTip] = useState(false);

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);

  // Mini-game state
  const [miniGameDone, setMiniGameDone] = useState(false);
  const [miniGameScore, setMiniGameScore] = useState(0);

  // Clear state
  const [stars, setStars] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Redirect if stage not found or locked
  useEffect(() => {
    if (!mounted) return;
    if (!stage) { router.push('/my/ad-academy'); return; }
    if (!isStageUnlocked(stageId, STAGE_IDS)) { router.push('/my/ad-academy'); }
  }, [mounted, stage, stageId, router]);

  // Auto-advance intro lines
  useEffect(() => {
    if (phase !== 'intro' || !stage) return;
    if (introLine < stage.storyIntro.lines.length - 1) {
      const timer = setTimeout(() => setIntroLine(prev => prev + 1), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, introLine, stage]);

  const submitQuiz = useCallback(async () => {
    if (!stage || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/ad-academy/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, answers, bonusTipsFound: foundTips }),
      });
      const data = await res.json();
      if (data.passed) {
        setStars(data.stars);
        setTotalPoints(data.rewards?.pointsAwarded || 0);
        saveStageResult(stageId, data.stars, data.quizScore, foundTips, data.rewards?.pointsAwarded || 0);
        setPhase('clear');
      } else {
        setStars(0);
        setTotalPoints(0);
        setPhase('clear');
      }
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [stage, stageId, answers, foundTips, submitting]);

  if (!stage || !mounted) return null;

  const quiz = stage.checkpointQuiz;
  const currentQuestion = quiz[quizIndex];
  const nextStageIdx = STAGE_IDS.indexOf(stageId) + 1;
  const nextStageId = nextStageIdx < STAGE_IDS.length ? STAGE_IDS[nextStageIdx] : null;

  return (
    <div className="max-w-lg mx-auto min-h-[60vh]">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => router.push('/my/ad-academy')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-400">
            {stage.id === 'boss' ? 'BOSS' : `STAGE ${stage.stageNumber}`}
          </span>
          <span className="text-lg">{stage.emoji}</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Phase Progress Dots */}
      <div className="flex justify-center gap-2 mb-6">
        {(['intro', 'concept', 'minigame', 'quiz', 'clear'] as Phase[]).map(p => (
          <div
            key={p}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              p === phase ? 'bg-indigo-500 scale-125' :
              (['intro', 'concept', 'minigame', 'quiz', 'clear'].indexOf(p) < ['intro', 'concept', 'minigame', 'quiz', 'clear'].indexOf(phase))
                ? 'bg-green-400' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════════════ INTRO ═══════════════ */}
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={`rounded-2xl bg-gradient-to-br ${stage.bgGradient} p-6 text-white min-h-[300px] flex flex-col`}>
              <div className="text-center mb-4">
                <span className="text-5xl">{stage.storyIntro.characterEmoji}</span>
                <h2 className="text-xl font-bold mt-3">{stage.storyIntro.title}</h2>
              </div>
              <div className="flex-1 space-y-3">
                {stage.storyIntro.lines.slice(0, introLine + 1).map((line, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm leading-relaxed text-white/90"
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPhase('concept')}
                className="mt-4 w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-white flex items-center justify-center gap-2"
              >
                시작하기 <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════ CONCEPT CARDS ═══════════════ */}
        {phase === 'concept' && (
          <motion.div key="concept" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
            <ConceptCardView
              cards={stage.conceptCards}
              cardIndex={cardIndex}
              setCardIndex={setCardIndex}
              foundTips={foundTips}
              setFoundTips={setFoundTips}
              showTip={showTip}
              setShowTip={setShowTip}
              onComplete={() => { setPhase('minigame'); setMiniGameDone(false); }}
              themeColor={stage.themeColor}
            />
          </motion.div>
        )}

        {/* ═══════════════ MINI-GAME ═══════════════ */}
        {phase === 'minigame' && (
          <motion.div key="minigame" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MiniGameRouter
              stage={stage}
              onComplete={(score) => { setMiniGameScore(score); setMiniGameDone(true); }}
              done={miniGameDone}
            />
            {miniGameDone && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                type="button"
                onClick={() => setPhase('quiz')}
                className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2"
              >
                체크포인트 퀴즈로! <ChevronRight className="w-5 h-5" />
              </motion.button>
            )}
          </motion.div>
        )}

        {/* ═══════════════ QUIZ ═══════════════ */}
        {phase === 'quiz' && !quizFinished && (
          <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <QuizView
              question={currentQuestion}
              questionNum={quizIndex + 1}
              totalQuestions={quiz.length}
              selectedAnswer={answers[currentQuestion.id]}
              showExplanation={showExplanation}
              onAnswer={(answer) => {
                setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
                setShowExplanation(true);
              }}
              onNext={() => {
                setShowExplanation(false);
                if (quizIndex < quiz.length - 1) {
                  setQuizIndex(quizIndex + 1);
                } else {
                  setQuizFinished(true);
                  submitQuiz();
                }
              }}
            />
          </motion.div>
        )}

        {phase === 'quiz' && quizFinished && submitting && (
          <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="text-5xl mb-4 animate-bounce">⚔️</div>
            <p className="text-gray-500 font-medium">결과를 계산하는 중...</p>
          </motion.div>
        )}

        {/* ═══════════════ CLEAR ═══════════════ */}
        {phase === 'clear' && (
          <motion.div key="clear" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring' }}>
            <div className="text-center py-8">
              {stars > 0 ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.3 }}
                    className="text-6xl mb-4"
                  >
                    🎉
                  </motion.div>
                  <h2 className="text-2xl font-black text-gray-900 mb-2">STAGE CLEAR!</h2>
                  <p className="text-gray-500 mb-4">{stage.monsterName}을(를) 물리쳤어요!</p>

                  {/* Stars */}
                  <div className="flex justify-center gap-2 mb-6">
                    {[1, 2, 3].map(s => (
                      <motion.div
                        key={s}
                        initial={{ opacity: 0, y: -20, rotate: -180 }}
                        animate={{ opacity: 1, y: 0, rotate: 0 }}
                        transition={{ delay: 0.5 + s * 0.2, type: 'spring' }}
                      >
                        <Star className={`w-10 h-10 ${s <= stars ? 'text-amber-400 fill-current' : 'text-gray-200'}`} />
                      </motion.div>
                    ))}
                  </div>

                  {/* Points */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                    className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 mb-6 inline-block"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <span className="text-2xl font-black text-amber-600">+{totalPoints}P</span>
                    </div>
                    {foundTips.length > 0 && (
                      <p className="text-xs text-amber-500 mt-1">히든 팁 {foundTips.length}개 발견!</p>
                    )}
                  </motion.div>
                </>
              ) : (
                <>
                  <div className="text-5xl mb-4">😅</div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">아쉽게 실패!</h2>
                  <p className="text-gray-500 mb-6">다시 도전해보세요! 틀린 문제를 복습하면 쉽게 통과할 수 있어요.</p>
                </>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/my/ad-academy')}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" /> 목록
                </button>
                {stars === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('intro');
                      setIntroLine(0);
                      setCardIndex(0);
                      setQuizIndex(0);
                      setAnswers({});
                      setShowExplanation(false);
                      setQuizFinished(false);
                      setMiniGameDone(false);
                    }}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> 다시 도전
                  </button>
                ) : nextStageId ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/my/ad-academy/${nextStageId}`)}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    다음 스테이지 <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push('/my/ad-academy')}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:opacity-90 flex items-center justify-center gap-2"
                  >
                    <Trophy className="w-4 h-4" /> 완료!
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════ Concept Card View ═══════════════
function ConceptCardView({
  cards, cardIndex, setCardIndex, foundTips, setFoundTips, showTip, setShowTip, onComplete, themeColor,
}: {
  cards: ConceptCard[];
  cardIndex: number;
  setCardIndex: (n: number) => void;
  foundTips: string[];
  setFoundTips: (t: string[]) => void;
  showTip: boolean;
  setShowTip: (b: boolean) => void;
  onComplete: () => void;
  themeColor: string;
}) {
  const card = cards[cardIndex];
  const isLast = cardIndex === cards.length - 1;
  const hasTip = !!card.bonusTip;
  const tipFound = card.bonusTip ? foundTips.includes(card.bonusTip.id) : false;

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400">{cardIndex + 1}/{cards.length}</span>
        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${((cardIndex + 1) / cards.length) * 100}%`, backgroundColor: themeColor }}
          />
        </div>
      </div>

      <motion.div
        key={cardIndex}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-2xl border-2 border-gray-100 p-6 min-h-[280px] flex flex-col"
      >
        <div className="text-center mb-4">
          <span className="text-4xl">{card.emoji}</span>
          <h3 className="text-lg font-bold text-gray-900 mt-2">{card.title}</h3>
        </div>
        <div className="flex-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {card.content}
        </div>

        {/* Hidden Bonus Tip */}
        {hasTip && !tipFound && !showTip && (
          <button
            type="button"
            onClick={() => {
              setShowTip(true);
              if (card.bonusTip) {
                setFoundTips([...foundTips, card.bonusTip.id]);
              }
            }}
            className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium flex items-center gap-2 hover:bg-amber-100 transition"
          >
            <Gift className="w-4 h-4" />
            숨겨진 팁이 있어요! 탭하여 확인
          </button>
        )}
        {(showTip || tipFound) && card.bonusTip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-600">Pro Tip 발견! +{card.bonusTip.points}P</span>
            </div>
            <p className="text-xs text-amber-700">{card.bonusTip.text}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Navigation */}
      <div className="flex gap-3 mt-4">
        {cardIndex > 0 && (
          <button
            type="button"
            onClick={() => { setCardIndex(cardIndex - 1); setShowTip(false); }}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> 이전
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setShowTip(false);
            if (isLast) onComplete();
            else setCardIndex(cardIndex + 1);
          }}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-1 hover:bg-indigo-700"
        >
          {isLast ? '미니게임 시작!' : '다음'} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════ Quiz View ═══════════════
function QuizView({
  question, questionNum, totalQuestions, selectedAnswer, showExplanation, onAnswer, onNext,
}: {
  question: QuizQuestion;
  questionNum: number;
  totalQuestions: number;
  selectedAnswer?: string;
  showExplanation: boolean;
  onAnswer: (answer: string) => void;
  onNext: () => void;
}) {
  const isCorrect = selectedAnswer === question.correctAnswer;
  const isOX = question.type === 'ox';

  return (
    <div>
      <div className="text-xs text-gray-400 mb-2 font-medium">
        체크포인트 퀴즈 {questionNum}/{totalQuestions}
      </div>
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-6">{question.question}</h3>

        {isOX ? (
          <div className="grid grid-cols-2 gap-3">
            {['O', 'X'].map(opt => (
              <button
                key={opt}
                type="button"
                disabled={showExplanation}
                onClick={() => onAnswer(opt)}
                className={`py-6 rounded-xl text-3xl font-black transition-all ${
                  showExplanation
                    ? opt === question.correctAnswer
                      ? 'bg-green-100 border-2 border-green-400 text-green-600'
                      : selectedAnswer === opt
                        ? 'bg-red-100 border-2 border-red-400 text-red-600'
                        : 'bg-gray-50 border-2 border-gray-200 text-gray-300'
                    : selectedAnswer === opt
                      ? 'bg-indigo-100 border-2 border-indigo-400 text-indigo-600'
                      : 'bg-gray-50 border-2 border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {question.options?.map(opt => (
              <button
                key={opt.key}
                type="button"
                disabled={showExplanation}
                onClick={() => onAnswer(opt.key)}
                className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-sm ${
                  showExplanation
                    ? opt.key === question.correctAnswer
                      ? 'bg-green-50 border-green-400 text-green-800'
                      : selectedAnswer === opt.key
                        ? 'bg-red-50 border-red-400 text-red-800'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                    : selectedAnswer === opt.key
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-800'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}
              >
                <span className="font-bold mr-2">{opt.key.toUpperCase()}.</span>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Explanation */}
        {showExplanation && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
              isCorrect ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            {isCorrect ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? '정답! 🎉' : '아쉬워요!'}
              </p>
              <p className="text-xs text-gray-600 mt-1">{question.explanation}</p>
            </div>
          </motion.div>
        )}

        {/* Next Button */}
        {showExplanation && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            type="button"
            onClick={onNext}
            className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
          >
            {questionNum < totalQuestions ? '다음 문제' : '결과 확인!'} <ChevronRight className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ═══════════════ Mini-Game Router ═══════════════
function MiniGameRouter({ stage, onComplete, done }: {
  stage: (typeof AD_ACADEMY_STAGES)[0];
  onComplete: (score: number) => void;
  done: boolean;
}) {
  switch (stage.miniGameType) {
    case 'ox':
      return <OXMiniGame items={stage.miniGameData as OXItem[]} onComplete={onComplete} done={done} />;
    case 'keyword':
      return <KeywordMiniGame items={stage.miniGameData as KeywordItem[]} onComplete={onComplete} done={done} />;
    case 'bid-slider':
      return <BidSliderMiniGame scenario={stage.miniGameData as BidScenario} onComplete={onComplete} done={done} />;
    case 'roas-calc':
      return <ROASMiniGame scenarios={(stage.miniGameData as unknown[]) as { adSpend: number; revenue: number; targetROAS: number }[]} onComplete={onComplete} done={done} />;
    case 'strategy':
      return <StrategyMiniGame scenarios={stage.miniGameData as StrategyScenario[]} onComplete={onComplete} done={done} />;
    case 'comprehensive':
      // Boss stage: skip mini-game, go straight to quiz
      if (!done) onComplete(100);
      return <div className="text-center py-8"><span className="text-5xl">⚔️</span><p className="mt-3 font-bold text-gray-900">최종 보스전 시작!</p><p className="text-sm text-gray-500 mt-1">10문제 종합 퀴즈에 도전하세요</p></div>;
    default:
      if (!done) onComplete(100);
      return null;
  }
}

// ═══════════════ O/X Mini-Game ═══════════════
function OXMiniGame({ items, onComplete, done }: { items: OXItem[]; onComplete: (s: number) => void; done: boolean }) {
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [finished, setFinished] = useState(done);

  const handleAnswer = (answer: boolean) => {
    if (answered) return;
    const correct = answer === items[current].answer;
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    setAnswered(true);
  };

  const next = () => {
    if (current < items.length - 1) {
      setCurrent(c => c + 1);
      setAnswered(false);
    } else {
      setFinished(true);
      onComplete(Math.round(((score + (isCorrect ? 0 : 0)) / items.length) * 100));
    }
  };

  if (finished) {
    return (
      <div className="text-center py-6">
        <span className="text-4xl">🎮</span>
        <p className="font-bold text-gray-900 mt-2">미니게임 클리어!</p>
        <p className="text-sm text-gray-500">{items.length}문제 중 {score}개 정답</p>
      </div>
    );
  }

  const item = items[current];
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-6">
      <div className="text-xs text-gray-400 mb-3">O/X 퀴즈 {current + 1}/{items.length}</div>
      <p className="text-base font-bold text-gray-900 mb-6 text-center">{item.statement}</p>
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            disabled={answered}
            onClick={() => handleAnswer(v)}
            className={`py-5 rounded-xl text-2xl font-black transition ${
              answered
                ? v === item.answer ? 'bg-green-100 border-2 border-green-400 text-green-600' : 'bg-gray-50 border-2 border-gray-200 text-gray-300'
                : 'bg-gray-50 border-2 border-gray-200 hover:border-indigo-300 text-gray-700'
            }`}
          >
            {v ? 'O' : 'X'}
          </button>
        ))}
      </div>
      {answered && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className={`mt-3 text-sm text-center ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
            {isCorrect ? '정답! 🎉' : '오답!'} {item.explanation}
          </p>
          <button type="button" onClick={next} className="mt-3 w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm">
            {current < items.length - 1 ? '다음' : '완료'}
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ═══════════════ Keyword Mini-Game ═══════════════
function KeywordMiniGame({ items, onComplete, done }: { items: KeywordItem[]; onComplete: (s: number) => void; done: boolean }) {
  const [selected, setSelected] = useState<Record<string, 'good' | 'bad'>>({});
  const [submitted, setSubmitted] = useState(done);

  const handleSubmit = () => {
    let correct = 0;
    for (const item of items) {
      const pick = selected[item.word];
      if ((pick === 'good' && item.isGood) || (pick === 'bad' && !item.isGood)) correct++;
    }
    setSubmitted(true);
    onComplete(Math.round((correct / items.length) * 100));
  };

  if (submitted) {
    let correct = 0;
    for (const item of items) {
      const pick = selected[item.word];
      if ((pick === 'good' && item.isGood) || (pick === 'bad' && !item.isGood)) correct++;
    }
    return (
      <div className="text-center py-6">
        <span className="text-4xl">🔑</span>
        <p className="font-bold text-gray-900 mt-2">키워드 분류 완료!</p>
        <p className="text-sm text-gray-500">{items.length}개 중 {correct}개 정답</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
      <p className="text-sm font-bold text-gray-900 mb-1">키워드를 분류하세요!</p>
      <p className="text-xs text-gray-500 mb-4">좋은 키워드는 초록, 나쁜 키워드는 빨강을 선택하세요</p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.word} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-700 truncate">{item.word}</span>
            <button
              type="button"
              onClick={() => setSelected(s => ({ ...s, [item.word]: 'good' }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selected[item.word] === 'good' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'
              }`}
            >
              좋아요
            </button>
            <button
              type="button"
              onClick={() => setSelected(s => ({ ...s, [item.word]: 'bad' }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selected[item.word] === 'bad' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              나빠요
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={Object.keys(selected).length < items.length}
        onClick={handleSubmit}
        className="mt-4 w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-40"
      >
        제출하기
      </button>
    </div>
  );
}

// ═══════════════ Bid Slider Mini-Game ═══════════════
function BidSliderMiniGame({ scenario, onComplete, done }: { scenario: BidScenario; onComplete: (s: number) => void; done: boolean }) {
  const [bid, setBid] = useState(200);
  const [submitted, setSubmitted] = useState(done);

  const margin = scenario.price * scenario.marginRate;
  const estimatedClicks = Math.max(1, Math.round(scenario.dailyBudget / Math.max(bid, 1)));
  const estimatedConversion = 0.1;
  const estimatedSales = Math.round(estimatedClicks * estimatedConversion);
  const estimatedRevenue = estimatedSales * scenario.price;
  const estimatedROAS = Math.round((estimatedRevenue / scenario.dailyBudget) * 100);
  const isOptimal = bid >= scenario.optimalBidRange[0] && bid <= scenario.optimalBidRange[1];

  const handleSubmit = () => {
    setSubmitted(true);
    onComplete(isOptimal ? 100 : 50);
  };

  if (submitted) {
    return (
      <div className="text-center py-6">
        <span className="text-4xl">{isOptimal ? '🎯' : '📊'}</span>
        <p className="font-bold text-gray-900 mt-2">{isOptimal ? '완벽한 입찰가!' : '괜찮은 시도!'}</p>
        <p className="text-sm text-gray-500">최적 범위: {scenario.optimalBidRange[0]}~{scenario.optimalBidRange[1]}원</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
      <p className="text-sm font-bold text-gray-900 mb-1">입찰가를 조절해보세요!</p>
      <p className="text-xs text-gray-500 mb-4">{scenario.productName} (판매가 {scenario.price.toLocaleString()}원, 마진 {Math.round(scenario.marginRate * 100)}%)</p>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">입찰가</span>
          <span className="text-lg font-black text-indigo-600">{bid}원</span>
        </div>
        <input
          type="range"
          min={50}
          max={1500}
          step={50}
          value={bid}
          onChange={e => setBid(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>50원</span><span>1,500원</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center mb-4">
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-400">예상 클릭/일</p>
          <p className="text-sm font-bold text-gray-900">{estimatedClicks}회</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-400">예상 매출/일</p>
          <p className="text-sm font-bold text-gray-900">{estimatedRevenue.toLocaleString()}원</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-400">예상 ROAS</p>
          <p className={`text-sm font-bold ${estimatedROAS >= 300 ? 'text-green-600' : estimatedROAS >= 200 ? 'text-amber-600' : 'text-red-600'}`}>{estimatedROAS}%</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-400">일예산</p>
          <p className="text-sm font-bold text-gray-900">{scenario.dailyBudget.toLocaleString()}원</p>
        </div>
      </div>

      <button type="button" onClick={handleSubmit} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold">
        이 입찰가로 결정!
      </button>
    </div>
  );
}

// ═══════════════ ROAS Mini-Game ═══════════════
function ROASMiniGame({ scenarios, onComplete, done }: { scenarios: { adSpend: number; revenue: number; targetROAS: number }[]; onComplete: (s: number) => void; done: boolean }) {
  const [current, setCurrent] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(done);

  if (finished) {
    return (
      <div className="text-center py-6">
        <span className="text-4xl">📊</span>
        <p className="font-bold text-gray-900 mt-2">ROAS 계산 완료!</p>
        <p className="text-sm text-gray-500">{scenarios.length}문제 중 {score}개 정답</p>
      </div>
    );
  }

  const s = scenarios[current];
  const correctROAS = Math.round((s.revenue / s.adSpend) * 100);

  const handleCheck = () => {
    const userNum = parseInt(userAnswer);
    if (Math.abs(userNum - correctROAS) <= 10) setScore(sc => sc + 1);
    setAnswered(true);
  };

  const next = () => {
    if (current < scenarios.length - 1) {
      setCurrent(c => c + 1);
      setUserAnswer('');
      setAnswered(false);
    } else {
      setFinished(true);
      onComplete(Math.round((score / scenarios.length) * 100));
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
      <div className="text-xs text-gray-400 mb-3">ROAS 계산 {current + 1}/{scenarios.length}</div>
      <div className="bg-indigo-50 rounded-lg p-4 mb-4 text-center">
        <p className="text-sm text-gray-600">광고비: <span className="font-bold text-gray-900">{s.adSpend.toLocaleString()}원</span></p>
        <p className="text-sm text-gray-600">매출: <span className="font-bold text-gray-900">{s.revenue.toLocaleString()}원</span></p>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-gray-700">ROAS =</span>
        <input
          type="number"
          value={userAnswer}
          onChange={e => setUserAnswer(e.target.value)}
          disabled={answered}
          placeholder="숫자 입력"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-center font-bold text-lg"
        />
        <span className="text-sm font-medium text-gray-700">%</span>
      </div>
      {!answered ? (
        <button type="button" onClick={handleCheck} disabled={!userAnswer} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-40">
          확인
        </button>
      ) : (
        <>
          <p className={`text-sm text-center mb-3 ${Math.abs(parseInt(userAnswer) - correctROAS) <= 10 ? 'text-green-600' : 'text-red-600'}`}>
            정답: {correctROAS}% {Math.abs(parseInt(userAnswer) - correctROAS) <= 10 ? '🎉 정확해요!' : '다시 계산해보세요!'}
          </p>
          <button type="button" onClick={next} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold">
            {current < scenarios.length - 1 ? '다음' : '완료'}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════ Strategy Mini-Game ═══════════════
function StrategyMiniGame({ scenarios, onComplete, done }: { scenarios: StrategyScenario[]; onComplete: (s: number) => void; done: boolean }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(done);

  if (finished) {
    return (
      <div className="text-center py-6">
        <span className="text-4xl">🛡️</span>
        <p className="font-bold text-gray-900 mt-2">전략 퀴즈 완료!</p>
        <p className="text-sm text-gray-500">{scenarios.length}문제 중 {score}개 정답</p>
      </div>
    );
  }

  const s = scenarios[current];
  const selectedOpt = s.options.find(o => o.key === selected);

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
      <div className="text-xs text-gray-400 mb-3">상황 판단 {current + 1}/{scenarios.length}</div>
      <div className="bg-amber-50 rounded-lg p-3 mb-4">
        <p className="text-sm font-bold text-gray-900">{s.situation}</p>
      </div>
      <div className="space-y-2">
        {s.options.map(opt => (
          <button
            key={opt.key}
            type="button"
            disabled={!!selected}
            onClick={() => {
              setSelected(opt.key);
              if (opt.isCorrect) setScore(sc => sc + 1);
            }}
            className={`w-full text-left p-3 rounded-xl border-2 text-sm transition ${
              selected
                ? opt.isCorrect
                  ? 'bg-green-50 border-green-400'
                  : selected === opt.key
                    ? 'bg-red-50 border-red-400'
                    : 'bg-gray-50 border-gray-200 opacity-50'
                : 'bg-white border-gray-200 hover:border-indigo-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {selected && selectedOpt && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className={`mt-3 text-xs ${selectedOpt.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
            {selectedOpt.explanation}
          </p>
          <button
            type="button"
            onClick={() => {
              if (current < scenarios.length - 1) {
                setCurrent(c => c + 1);
                setSelected(null);
              } else {
                setFinished(true);
                onComplete(Math.round((score / scenarios.length) * 100));
              }
            }}
            className="mt-3 w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold"
          >
            {current < scenarios.length - 1 ? '다음 상황' : '완료'}
          </button>
        </motion.div>
      )}
    </div>
  );
}
