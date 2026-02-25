'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Users, Monitor, ArrowRight, Sparkles, TrendingUp, Zap, Shield, Bot } from 'lucide-react';

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

  const ptFeatures = [
    { icon: Shield, text: '초기비용 0원' },
    { icon: TrendingUp, text: '94% 매출 달성' },
    { icon: Users, text: '1:1 전담 관리' },
  ];

  const programFeatures = [
    { icon: Bot, text: 'AI 자동화' },
    { icon: Zap, text: '10분 대량등록' },
    { icon: Sparkles, text: 'GPT-4 매칭' },
  ];

  return (
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden bg-white">
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
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-rose-50/30 to-rose-100/20 transition-all duration-700" />

        {/* Decorative blobs */}
        <motion.div
          animate={{
            scale: activeSection === 'left' ? 1.2 : 1,
            opacity: activeSection === 'left' ? 0.15 : 0.05,
          }}
          transition={{ duration: 0.7 }}
          className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-[#E31837] rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            scale: activeSection === 'left' ? 1.1 : 0.8,
            opacity: activeSection === 'left' ? 0.1 : 0.03,
          }}
          transition={{ duration: 0.7 }}
          className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-rose-400 rounded-full blur-[100px]"
        />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 lg:px-16 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'left' ? 1.08 : 1,
              y: activeSection === 'left' ? -10 : 0,
            }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="mb-6"
          >
            <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-[28px] flex items-center justify-center transition-all duration-500 ${
              activeSection === 'left'
                ? 'bg-[#E31837] shadow-2xl shadow-[#E31837]/30'
                : 'bg-gray-50 border border-gray-100 shadow-lg'
            }`}>
              <Users className={`w-9 h-9 md:w-11 md:h-11 transition-colors duration-500 ${
                activeSection === 'left' ? 'text-white' : 'text-gray-400'
              }`} />
            </div>
          </motion.div>

          {/* Badge */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="mb-3"
              >
                <span className="px-3 py-1 bg-[#E31837]/8 border border-[#E31837]/15 rounded-full text-xs font-semibold text-[#E31837] tracking-wide">
                  전문가 파트너십
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Title */}
          <motion.h2
            animate={{ y: activeSection === 'left' ? -2 : 0 }}
            transition={{ duration: 0.4 }}
            className={`text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-center mb-3 tracking-tight transition-colors duration-500 ${
              activeSection === 'left' ? 'text-[#E31837]' : 'text-gray-900'
            }`}
          >
            쿠팡 PT
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'right' ? 0.3 : 1 }}
            className="text-base md:text-lg text-center text-gray-500 mb-6 font-medium max-w-sm"
          >
            전문가가 옆에서 함께 매출을 만듭니다
          </motion.p>

          {/* Features - only on hover */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.35 }}
                className="text-center space-y-6"
              >
                <div className="flex flex-wrap justify-center gap-3">
                  {ptFeatures.map((feature) => (
                    <div
                      key={feature.text}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl text-sm font-medium text-gray-700 border border-gray-100 shadow-sm"
                    >
                      <feature.icon className="w-4 h-4 text-[#E31837]" />
                      {feature.text}
                    </div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#E31837] text-white rounded-2xl font-semibold shadow-xl shadow-[#E31837]/25 hover:shadow-2xl hover:shadow-[#E31837]/35 transition-shadow text-base"
                >
                  자세히 보기
                  <ArrowRight className="w-4.5 h-4.5" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <AnimatePresence>
            {activeSection !== 'left' && mounted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                className="text-xs text-gray-400 tracking-wide"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Vertical Divider */}
        <div className="hidden md:block absolute right-0 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-gray-200/80 to-transparent" />
      </motion.div>

      {/* Right Section - 쿠팡대량프로그램 */}
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
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-bl from-gray-50 via-slate-50/30 to-blue-50/20 transition-all duration-700" />

        {/* Decorative blobs */}
        <motion.div
          animate={{
            scale: activeSection === 'right' ? 1.2 : 1,
            opacity: activeSection === 'right' ? 0.12 : 0.04,
          }}
          transition={{ duration: 0.7 }}
          className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-blue-500 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            scale: activeSection === 'right' ? 1.1 : 0.8,
            opacity: activeSection === 'right' ? 0.08 : 0.02,
          }}
          transition={{ duration: 0.7 }}
          className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] bg-indigo-400 rounded-full blur-[100px]"
        />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 lg:px-16 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'right' ? 1.08 : 1,
              y: activeSection === 'right' ? -10 : 0,
            }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="mb-6"
          >
            <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-[28px] flex items-center justify-center transition-all duration-500 ${
              activeSection === 'right'
                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-2xl shadow-blue-500/30'
                : 'bg-gray-50 border border-gray-100 shadow-lg'
            }`}>
              <Monitor className={`w-9 h-9 md:w-11 md:h-11 transition-colors duration-500 ${
                activeSection === 'right' ? 'text-white' : 'text-gray-400'
              }`} />
            </div>
          </motion.div>

          {/* Badge */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="mb-3"
              >
                <span className="px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-600 tracking-wide">
                  AI 자동화 프로그램
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Title */}
          <motion.h2
            animate={{ y: activeSection === 'right' ? -2 : 0 }}
            transition={{ duration: 0.4 }}
            className={`text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-center mb-3 tracking-tight transition-colors duration-500 ${
              activeSection === 'right' ? 'text-blue-600' : 'text-gray-900'
            }`}
          >
            쿠팡 프로그램
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'left' ? 0.3 : 1 }}
            className="text-base md:text-lg text-center text-gray-500 mb-6 font-medium max-w-sm"
          >
            AI가 상품 등록을 전부 자동화합니다
          </motion.p>

          {/* Features - only on hover */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.35 }}
                className="text-center space-y-6"
              >
                <div className="flex flex-wrap justify-center gap-3">
                  {programFeatures.map((feature) => (
                    <div
                      key={feature.text}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-sm rounded-xl text-sm font-medium text-gray-700 border border-gray-100 shadow-sm"
                    >
                      <feature.icon className="w-4 h-4 text-blue-600" />
                      {feature.text}
                    </div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold shadow-xl shadow-blue-500/25 hover:shadow-2xl hover:shadow-blue-500/35 transition-shadow text-base"
                >
                  자세히 보기
                  <ArrowRight className="w-4.5 h-4.5" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <AnimatePresence>
            {activeSection !== 'right' && mounted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                className="text-xs text-gray-400 tracking-wide"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Center Logo */}
      {mounted && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:block"
        >
          <div className="w-[72px] h-[72px] rounded-2xl bg-white shadow-2xl shadow-gray-300/40 border border-gray-100 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[9px] font-bold text-[#E31837] tracking-[0.15em] uppercase">Coupang</p>
              <p className="text-[13px] font-extrabold text-gray-900 -mt-0.5">셀러허브</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Horizontal Divider (mobile) */}
      <div className="md:hidden absolute left-[15%] right-[15%] top-1/2 h-px bg-gradient-to-r from-transparent via-gray-200/80 to-transparent z-10" />

      {/* Navigation Overlay */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-xl z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full border-2 border-gray-200 border-t-[#E31837] animate-spin" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
