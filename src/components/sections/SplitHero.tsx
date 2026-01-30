'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Users, Monitor, ArrowRight } from 'lucide-react';

export default function SplitHero() {
  const [activeSection, setActiveSection] = useState<'left' | 'right' | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const handleSectionClick = (section: 'left' | 'right') => {
    setIsNavigating(true);
    setActiveSection(section);

    setTimeout(() => {
      if (section === 'left') {
        router.push('/pt');
      } else {
        router.push('/program');
      }
    }, 800);
  };

  return (
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden">
      {/* Left Section - 쿠팡 PT */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${activeSection === 'right' ? 'md:flex-[0.3] flex-[0.4]' : ''}
          ${activeSection === 'left' ? 'md:flex-[0.7] flex-[0.6]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('left')}
        onMouseEnter={() => !isNavigating && setActiveSection('left')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-[#1a1a2e]" />

        {/* Gradient Overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-purple-600/10"
          animate={{ opacity: activeSection === 'left' ? 1 : 0.5 }}
          transition={{ duration: 0.8 }}
        />

        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_50%)]" />
        </div>

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'left' ? 1.1 : 1,
              y: activeSection === 'left' ? -10 : 0
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center transition-all duration-700
              ${activeSection === 'left' ? 'bg-blue-500' : 'bg-white/10 border border-white/20'}
            `}>
              <Users className={`w-10 h-10 md:w-12 md:h-12 transition-colors duration-700
                ${activeSection === 'left' ? 'text-white' : 'text-white/70'}
              `} />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            animate={{
              scale: activeSection === 'left' ? 1.1 : 1,
              y: activeSection === 'left' ? -5 : 0
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-3 tracking-tight text-white"
          >
            쿠팡 PT
          </motion.h2>

          {/* Subtitle - Always visible */}
          <motion.p
            animate={{
              opacity: activeSection === 'right' ? 0.5 : 1,
            }}
            transition={{ duration: 0.5 }}
            className="text-base md:text-lg text-center text-white/60 mb-6"
          >
            전문가와 함께하는 파트너십
          </motion.p>

          {/* Expanded Content */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center overflow-hidden"
              >
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  {['초기비용 0원', '수수료 30%', '전담 관리'].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white/80 border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-2 text-blue-400 font-medium"
                >
                  <span>자세히 알아보기</span>
                  <ArrowRight className="w-4 h-4 animate-pulse" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Minimal CTA when not active */}
          <AnimatePresence>
            {activeSection !== 'left' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-white/40 text-sm"
              >
                <span>클릭하여 입장</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider Line */}
        <div className="hidden md:block absolute right-0 top-[10%] bottom-[10%] w-px bg-white/10" />
        <div className="md:hidden absolute left-[10%] right-[10%] bottom-0 h-px bg-white/10" />
      </motion.div>

      {/* Right Section - 쿠팡대량프로그램 구독 */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${activeSection === 'left' ? 'md:flex-[0.3] flex-[0.4]' : ''}
          ${activeSection === 'right' ? 'md:flex-[0.7] flex-[0.6]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('right')}
        onMouseEnter={() => !isNavigating && setActiveSection('right')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-[#0f0f1a]" />

        {/* Gradient Overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-bl from-emerald-600/20 via-transparent to-cyan-600/10"
          animate={{ opacity: activeSection === 'right' ? 1 : 0.5 }}
          transition={{ duration: 0.8 }}
        />

        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.3),transparent_50%)]" />
        </div>

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'right' ? 1.1 : 1,
              y: activeSection === 'right' ? -10 : 0
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center transition-all duration-700
              ${activeSection === 'right' ? 'bg-emerald-500' : 'bg-white/10 border border-white/20'}
            `}>
              <Monitor className={`w-10 h-10 md:w-12 md:h-12 transition-colors duration-700
                ${activeSection === 'right' ? 'text-white' : 'text-white/70'}
              `} />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            animate={{
              scale: activeSection === 'right' ? 1.1 : 1,
              y: activeSection === 'right' ? -5 : 0
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-3 tracking-tight text-white"
          >
            쿠팡대량프로그램
          </motion.h2>

          {/* Badge */}
          <motion.div
            animate={{
              opacity: activeSection === 'left' ? 0.5 : 1,
            }}
            transition={{ duration: 0.5 }}
            className="mb-4"
          >
            <span className="px-3 py-1 bg-emerald-500/20 rounded-full text-xs text-emerald-400 border border-emerald-500/30">
              구독 서비스
            </span>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            animate={{
              opacity: activeSection === 'left' ? 0.5 : 1,
            }}
            transition={{ duration: 0.5 }}
            className="text-base md:text-lg text-center text-white/60 mb-6"
          >
            AI 자동화 대량등록 솔루션
          </motion.p>

          {/* Expanded Content */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center overflow-hidden"
              >
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  {['월 7.9만원', 'AI 상품명', '대량등록'].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white/80 border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-2 text-emerald-400 font-medium"
                >
                  <span>자세히 알아보기</span>
                  <ArrowRight className="w-4 h-4 animate-pulse" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Minimal CTA when not active */}
          <AnimatePresence>
            {activeSection !== 'right' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-white/40 text-sm"
              >
                <span>클릭하여 입장</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Center Logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:block"
      >
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-black/80 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
            <div className="text-center">
              <p className="text-[10px] font-medium text-white/50 tracking-widest">COUPANG</p>
              <p className="text-sm font-bold text-white">셀러허브</p>
            </div>
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl -z-10" />
        </div>
      </motion.div>

      {/* Navigation Overlay */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-md z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4 mx-auto" />
              <p className="text-white/60 text-sm">이동 중...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
