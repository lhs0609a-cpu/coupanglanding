'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, TrendingUp, Shield, Zap, Bot } from 'lucide-react';

const IMAGES = {
  pt: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&q=80',
  program: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
};

export default function SplitHero() {
  const [activeSection, setActiveSection] = useState<'left' | 'right' | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSectionClick = (section: 'left' | 'right') => {
    if (isNavigating) return;
    setIsNavigating(true);
    setActiveSection(section);

    setTimeout(() => {
      router.push(section === 'left' ? '/pt' : '/program');
    }, 500);
  };

  return (
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden bg-gray-950">
      {/* Left Section - 쿠팡 PT */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${activeSection === 'right' ? 'md:flex-[0.3] flex-[0.35]' : ''}
          ${activeSection === 'left' ? 'md:flex-[0.7] flex-[0.65]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('left')}
        onMouseEnter={() => !isNavigating && setActiveSection('left')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={IMAGES.pt}
            alt="비즈니스 미팅"
            className="w-full h-full object-cover transition-transform duration-700 ease-out"
            style={{ transform: activeSection === 'left' ? 'scale(1.05)' : 'scale(1)' }}
          />
        </div>

        {/* Dark Overlay */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background: activeSection === 'left'
              ? 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.2) 100%)'
              : 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.35) 100%)',
          }}
        />

        {/* Red accent line at bottom */}
        <motion.div
          animate={{ scaleX: activeSection === 'left' ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] z-10 origin-left"
        />

        {/* Content */}
        <div className="relative h-full flex flex-col justify-end px-6 sm:px-10 lg:px-14 pb-12 sm:pb-16 z-10">
          {/* Badge */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="mb-4"
              >
                <span className="px-3 py-1.5 glass-card rounded-full text-xs font-semibold text-white/90 tracking-wide">
                  전문가 파트너십
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Title */}
          <motion.h2
            animate={{ y: activeSection === 'left' ? -4 : 0 }}
            transition={{ duration: 0.4 }}
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-white mb-3 tracking-tight text-shadow"
          >
            쿠팡 PT
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'right' ? 0.4 : 1 }}
            className="text-lg md:text-xl text-white/80 mb-6 font-medium max-w-md text-shadow-sm"
          >
            전문가가 함께 매출을 만듭니다
          </motion.p>

          {/* Stats - always visible */}
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              { icon: TrendingUp, label: '94% 성공률', color: 'text-emerald-400' },
              { icon: Shield, label: '0원 시작', color: 'text-sky-400' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 glass-card rounded-xl px-4 py-2.5">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-sm font-semibold text-white/90">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* CTA Button - on hover */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#E31837] text-white rounded-2xl font-semibold shadow-xl shadow-[#E31837]/30 hover:shadow-2xl hover:shadow-[#E31837]/40 transition-shadow text-base"
                >
                  자세히 보기
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <AnimatePresence>
            {activeSection !== 'left' && mounted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                className="text-xs text-white/50 tracking-wide"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Right Section - 쿠팡 프로그램 */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${activeSection === 'left' ? 'md:flex-[0.3] flex-[0.35]' : ''}
          ${activeSection === 'right' ? 'md:flex-[0.7] flex-[0.65]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('right')}
        onMouseEnter={() => !isNavigating && setActiveSection('right')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={IMAGES.program}
            alt="데이터 분석 대시보드"
            className="w-full h-full object-cover transition-transform duration-700 ease-out"
            style={{ transform: activeSection === 'right' ? 'scale(1.05)' : 'scale(1)' }}
          />
        </div>

        {/* Dark Overlay */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background: activeSection === 'right'
              ? 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.2) 100%)'
              : 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.35) 100%)',
          }}
        />

        {/* Blue accent line at bottom */}
        <motion.div
          animate={{ scaleX: activeSection === 'right' ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 z-10 origin-right"
        />

        {/* Content */}
        <div className="relative h-full flex flex-col justify-end px-6 sm:px-10 lg:px-14 pb-12 sm:pb-16 z-10">
          {/* Badge */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="mb-4"
              >
                <span className="px-3 py-1.5 glass-card rounded-full text-xs font-semibold text-white/90 tracking-wide">
                  AI 자동화 프로그램
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Title */}
          <motion.h2
            animate={{ y: activeSection === 'right' ? -4 : 0 }}
            transition={{ duration: 0.4 }}
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-white mb-3 tracking-tight text-shadow"
          >
            쿠팡 프로그램
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'left' ? 0.4 : 1 }}
            className="text-lg md:text-xl text-white/80 mb-6 font-medium max-w-md text-shadow-sm"
          >
            AI가 상품 등록을 자동화합니다
          </motion.p>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              { icon: Zap, label: '10분 대량등록', color: 'text-amber-400' },
              { icon: Bot, label: 'AI 자동화', color: 'text-violet-400' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 glass-card rounded-xl px-4 py-2.5">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-sm font-semibold text-white/90">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* CTA Button - on hover */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-shadow text-base"
                >
                  자세히 보기
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <AnimatePresence>
            {activeSection !== 'right' && mounted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                className="text-xs text-white/50 tracking-wide"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Center Logo - glass style */}
      {mounted && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:block"
        >
          <div className="w-[76px] h-[76px] rounded-2xl glass-card-light flex items-center justify-center shadow-2xl">
            <div className="text-center">
              <p className="text-[9px] font-bold text-white/80 tracking-[0.15em] uppercase">Coupang</p>
              <p className="text-[13px] font-extrabold text-white -mt-0.5">셀러허브</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Vertical divider (desktop) */}
      <div className="hidden md:block absolute left-1/2 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-white/20 to-transparent z-10 -translate-x-1/2" />

      {/* Horizontal Divider (mobile) */}
      <div className="md:hidden absolute left-[10%] right-[10%] top-1/2 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      {/* Navigation Overlay */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-gray-950/90 backdrop-blur-xl z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
