'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  FileText,
  Shield,
  Heart,
  ShoppingBag,
  Check,
  ChevronDown,
  ExternalLink,
  Lightbulb,
  AlertTriangle,
  SkipForward,
  Menu,
  X,
  Clock,
  DollarSign,
  CalendarCheck,
  ChevronRight,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  ROADMAP_STEPS,
  ROADMAP_FAQS,
  type RoadmapStep,
} from '@/lib/data/start-roadmap';
import {
  getStartProgress,
  toggleCheck,
  skipStep,
  isStepCompleted,
  getCompletedStepCount,
  markCompleted,
  type StartProgress,
} from '@/lib/utils/start-progress';

// ─── 상수 ───
const TOTAL_STEPS = ROADMAP_STEPS.length;
const CTA_URL = '/program';

const STEP_ICONS: Record<string, React.ElementType> = {
  FileText,
  Shield,
  Heart,
  ShoppingBag,
};

const ALL_STEP_SUB_IDS = ROADMAP_STEPS.map((s) =>
  s.subSteps.map((ss) => ss.id)
);

// ─── 애니메이션 ───
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

// ─── AnimatedSection ───
function AnimatedSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={staggerContainer}
    >
      {children}
    </motion.section>
  );
}

// ─── 유틸 ───
function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Header
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-gray-950/90 backdrop-blur-xl border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg">메가로드</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/program"
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            프로그램 소개
          </Link>
          <Link
            href={CTA_URL}
            className="px-4 py-2 bg-[#E31837] text-white text-sm font-semibold rounded-lg hover:bg-[#c8152f] transition-colors"
          >
            메가로드 시작하기
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-gray-950/95 backdrop-blur-xl border-b border-white/10"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              <Link
                href="/program"
                className="text-gray-300 hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                프로그램 소개
              </Link>
              <Link
                href={CTA_URL}
                className="px-4 py-2 bg-[#E31837] text-white text-sm font-semibold rounded-lg text-center"
                onClick={() => setMobileOpen(false)}
              >
                메가로드 시작하기
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeroSection() {
  const stats = [
    { label: '필수 비용', value: '4~6만원', icon: DollarSign },
    { label: '예상 소요', value: '약 2~3주', icon: Clock },
    { label: '총 단계', value: `${TOTAL_STEPS}단계`, icon: CalendarCheck },
  ];

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* BG effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E31837]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-[#E31837]/30 bg-[#E31837]/10 text-[#ff6b81] text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            왕초보 셀러를 위한 완벽 가이드
          </div>
        </motion.div>

        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          쿠팡 셀러,{' '}
          <span className="bg-gradient-to-r from-[#E31837] to-[#ff6b81] bg-clip-text text-transparent">
            어디서부터
          </span>{' '}
          시작하지?
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          사업자등록부터 쿠팡 윙 입점까지,
          <br className="hidden sm:block" /> 체크리스트로 하나씩 따라하면 됩니다.
        </motion.p>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
        >
          {stats.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 px-4 py-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur"
            >
              <Icon className="w-5 h-5 text-[#E31837] mb-1" />
              <span className="text-2xl font-bold text-white">{value}</span>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </motion.div>

        <motion.div
          className="mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <a
            href="#step-1"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            아래로 스크롤하여 시작
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CompletionDateWidget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CompletionDateWidget({
  progress,
}: {
  progress: StartProgress;
}) {
  const remainingDays = useMemo(() => {
    let days = 0;
    ROADMAP_STEPS.forEach((step, i) => {
      if (!isStepCompleted(ALL_STEP_SUB_IDS[i], progress)) {
        days += step.estimatedDays;
      }
    });
    return days;
  }, [progress]);

  if (remainingDays === 0) return null;

  const estimatedDate = addBusinessDays(new Date(), remainingDays);

  return (
    <AnimatedSection className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <motion.div
        variants={fadeInUp}
        className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20"
      >
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-sm text-gray-400">예상 완료일</p>
            <p className="text-lg font-bold text-white">
              {formatDate(estimatedDate)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">남은 기간</p>
          <p className="text-lg font-bold text-blue-400">
            약 {remainingDays}영업일
          </p>
        </div>
      </motion.div>
    </AnimatedSection>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StickyProgressBar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StickyProgressBar({
  completedCount,
  heroRef,
}: {
  completedCount: number;
  heroRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!heroRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [heroRef]);

  const pct = (completedCount / TOTAL_STEPS) * 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-16 left-0 right-0 z-40 bg-gray-950/90 backdrop-blur-xl border-b border-white/10"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300 whitespace-nowrap">
              {completedCount}/{TOTAL_STEPS} 완료
            </span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#E31837] to-[#ff6b81] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            {completedCount === TOTAL_STEPS && (
              <span className="text-xs font-semibold text-green-400 whitespace-nowrap">
                ALL CLEAR!
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StepCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StepCard({
  step,
  stepIndex,
  progress,
  isOpen,
  onToggle,
  onCheck,
  onSkip,
}: {
  step: RoadmapStep;
  stepIndex: number;
  progress: StartProgress;
  isOpen: boolean;
  onToggle: () => void;
  onCheck: (subStepId: string) => void;
  onSkip: () => void;
}) {
  const Icon = STEP_ICONS[step.icon] || FileText;
  const subIds = step.subSteps.map((ss) => ss.id);
  const completed = isStepCompleted(subIds, progress);
  const checkedCount = subIds.filter((id) => progress.checkedItems[id]).length;
  const isSkipped = progress.skippedSteps.includes(step.id);

  return (
    <AnimatedSection
      id={`step-${step.number}`}
      className="max-w-3xl mx-auto px-4 sm:px-6"
    >
      <motion.div
        variants={fadeInUp}
        className={`rounded-2xl border transition-colors ${
          completed
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        {/* Header */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-4 p-5 sm:p-6 text-left"
        >
          {/* Number + Icon */}
          <div
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
              completed
                ? 'bg-green-500/20 text-green-400'
                : 'bg-[#E31837]/10 text-[#E31837]'
            }`}
          >
            {completed ? (
              <Check className="w-6 h-6" />
            ) : (
              <Icon className="w-6 h-6" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-500 uppercase">
                Step {step.number}
              </span>
              {!step.required && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                  선택
                </span>
              )}
              {completed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                  {isSkipped ? '건너뜀' : '완료'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white mt-0.5">
              {step.title}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {step.estimatedTime}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> {step.cost}
              </span>
            </div>
          </div>

          {/* Progress ring + Chevron */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-gray-500 hidden sm:block">
              {checkedCount}/{subIds.length}
            </span>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* SubSteps (accordion) */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-3">
                <p className="text-sm text-gray-400 mb-4">{step.subtitle}</p>

                {step.subSteps.map((ss) => {
                  const checked = !!progress.checkedItems[ss.id];
                  return (
                    <div
                      key={ss.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        checked
                          ? 'border-green-500/20 bg-green-500/5'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <div className="pt-0.5">
                          <div
                            onClick={(e) => {
                              e.preventDefault();
                              onCheck(ss.id);
                            }}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                              checked
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {checked && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`font-medium text-sm ${
                              checked
                                ? 'text-gray-500 line-through'
                                : 'text-white'
                            }`}
                          >
                            {ss.label}
                          </span>
                          {ss.description && (
                            <p className="text-xs text-gray-500 mt-1">
                              {ss.description}
                            </p>
                          )}
                        </div>
                      </label>

                      {/* Tip */}
                      {ss.tip && (
                        <div className="mt-3 ml-8 flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <Lightbulb className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-300">{ss.tip}</p>
                        </div>
                      )}

                      {/* Warning */}
                      {ss.warning && (
                        <div className="mt-3 ml-8 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-300">{ss.warning}</p>
                        </div>
                      )}

                      {/* Link */}
                      {ss.link && (
                        <a
                          href={ss.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 ml-8 inline-flex items-center gap-1.5 text-xs font-medium text-[#E31837] hover:text-[#ff6b81] transition-colors"
                        >
                          {ss.link.label}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}

                {/* 건너뛰기 버튼 (선택 스텝) */}
                {!step.required && !completed && (
                  <button
                    onClick={onSkip}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors text-sm"
                  >
                    <SkipForward className="w-4 h-4" />
                    이 단계 건너뛰기
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatedSection>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FAQSection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <AnimatedSection className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <motion.h2
        variants={fadeInUp}
        className="text-2xl sm:text-3xl font-bold text-white text-center mb-10"
      >
        자주 묻는 질문
      </motion.h2>

      <div className="space-y-3">
        {ROADMAP_FAQS.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="text-sm sm:text-base font-medium text-white pr-4">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm text-gray-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </AnimatedSection>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FinalCTA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FinalCTA() {
  return (
    <AnimatedSection className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <motion.div
        variants={fadeInUp}
        className="text-center p-8 sm:p-12 rounded-2xl bg-gradient-to-br from-[#E31837]/10 to-purple-500/10 border border-[#E31837]/20"
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          입점 준비 완료!
        </h2>
        <p className="text-gray-400 mb-8 max-w-lg mx-auto">
          모든 단계를 마치셨다면 이제 쿠팡에서 상품을 등록하고 판매를 시작할 차례입니다.
          메가로드로 상품 등록을 자동화해보세요.
        </p>
        <Link
          href={CTA_URL}
          className="inline-flex items-center gap-2 px-8 py-4 bg-[#E31837] text-white font-bold rounded-xl hover:bg-[#c8152f] transition-colors text-lg"
        >
          메가로드 알아보기
          <ArrowRight className="w-5 h-5" />
        </Link>
      </motion.div>
    </AnimatedSection>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CelebrationOverlay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CelebrationOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="bg-gray-900 border border-white/10 rounded-2xl p-8 sm:p-12 max-w-md mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-6">
          <Sparkles className="w-16 h-16 text-yellow-400 mx-auto" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          축하합니다!
        </h2>
        <p className="text-gray-400 mb-8">
          모든 단계를 완료했습니다.
          <br />
          이제 쿠팡 셀러로서 첫 상품을 등록해보세요!
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={CTA_URL}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#E31837] text-white font-bold rounded-xl hover:bg-[#c8152f] transition-colors"
          >
            메가로드 알아보기
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={onClose}
            className="px-6 py-3 border border-white/10 text-gray-300 rounded-xl hover:bg-white/5 transition-colors"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Footer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Footer() {
  return (
    <footer className="border-t border-white/10 bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <span>&copy; {new Date().getFullYear()} 메가로드. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/program" className="hover:text-gray-300 transition-colors">
            프로그램 소개
          </Link>
          <Link href="/terms" className="hover:text-gray-300 transition-colors">
            이용약관
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function StartPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<StartProgress>(() => ({
    checkedItems: {},
    skippedSteps: [],
    updatedAt: Date.now(),
  }));
  const [openStepIndex, setOpenStepIndex] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setProgress(getStartProgress());
    setMounted(true);
  }, []);

  const completedCount = useMemo(
    () => getCompletedStepCount(ALL_STEP_SUB_IDS, progress),
    [progress]
  );

  // 첫 오픈 스텝: 아직 완료되지 않은 첫 번째 스텝
  useEffect(() => {
    if (!mounted) return;
    const firstIncomplete = ROADMAP_STEPS.findIndex(
      (_, i) => !isStepCompleted(ALL_STEP_SUB_IDS[i], progress)
    );
    if (firstIncomplete !== -1) {
      setOpenStepIndex(firstIncomplete);
    }
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheck = useCallback(
    (stepIndex: number, subStepId: string) => {
      const updated = toggleCheck(subStepId);
      setProgress({ ...updated });

      // 스텝 완료 시 → 다음 스텝으로 이동
      if (isStepCompleted(ALL_STEP_SUB_IDS[stepIndex], updated)) {
        const allDone = getCompletedStepCount(ALL_STEP_SUB_IDS, updated) === TOTAL_STEPS;
        if (allDone) {
          markCompleted(updated);
          setTimeout(() => setShowCelebration(true), 600);
        } else {
          // 다음 미완료 스텝으로
          setTimeout(() => {
            const next = ROADMAP_STEPS.findIndex(
              (_, i) => !isStepCompleted(ALL_STEP_SUB_IDS[i], updated)
            );
            if (next !== -1) {
              setOpenStepIndex(next);
              document
                .getElementById(`step-${ROADMAP_STEPS[next].number}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 800);
        }
      }
    },
    []
  );

  const handleSkip = useCallback((stepIndex: number) => {
    const step = ROADMAP_STEPS[stepIndex];
    const subIds = step.subSteps.map((ss) => ss.id);
    const updated = skipStep(step.id, subIds);
    setProgress({ ...updated });

    const allDone = getCompletedStepCount(ALL_STEP_SUB_IDS, updated) === TOTAL_STEPS;
    if (allDone) {
      markCompleted(updated);
      setTimeout(() => setShowCelebration(true), 600);
    } else {
      setTimeout(() => {
        const next = ROADMAP_STEPS.findIndex(
          (_, i) => !isStepCompleted(ALL_STEP_SUB_IDS[i], updated)
        );
        if (next !== -1) {
          setOpenStepIndex(next);
          document
            .getElementById(`step-${ROADMAP_STEPS[next].number}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 800);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('start-roadmap-progress');
      setProgress({
        checkedItems: {},
        skippedSteps: [],
        updatedAt: Date.now(),
      });
      setOpenStepIndex(0);
      setShowCelebration(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <div ref={heroRef}>
        <HeroSection />
      </div>

      <StickyProgressBar completedCount={completedCount} heroRef={heroRef} />

      <CompletionDateWidget progress={progress} />

      {/* Steps */}
      <div className="space-y-6 py-8">
        {/* Step간 연결선 */}
        {ROADMAP_STEPS.map((step, i) => (
          <div key={step.id}>
            <StepCard
              step={step}
              stepIndex={i}
              progress={progress}
              isOpen={openStepIndex === i}
              onToggle={() =>
                setOpenStepIndex(openStepIndex === i ? -1 : i)
              }
              onCheck={(subStepId) => handleCheck(i, subStepId)}
              onSkip={() => handleSkip(i)}
            />
            {/* 단계 사이 화살표 */}
            {i < ROADMAP_STEPS.length - 1 && (
              <div className="flex justify-center py-2">
                <ChevronRight className="w-5 h-5 text-gray-700 rotate-90" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 리셋 버튼 */}
      {completedCount > 0 && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            진행률 초기화
          </button>
        </div>
      )}

      <FAQSection />
      <FinalCTA />
      <Footer />

      <AnimatePresence>
        {showCelebration && (
          <CelebrationOverlay onClose={() => setShowCelebration(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
