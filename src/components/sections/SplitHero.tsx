'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Users, Monitor, ArrowRight, Sparkles } from 'lucide-react';

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
    }, 600);
  };

  return (
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden bg-[#fafafa]">
      {/* Left Section - 쿠팡 PT */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-700 ease-out
          ${activeSection === 'right' ? 'md:flex-[0.35] flex-[0.4]' : ''}
          ${activeSection === 'left' ? 'md:flex-[0.65] flex-[0.6]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('left')}
        onMouseEnter={() => !isNavigating && setActiveSection('left')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background with gradient */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-white via-white to-rose-50"
          animate={{
            background: activeSection === 'left'
              ? 'linear-gradient(135deg, #fff 0%, #fff5f5 50%, #ffe4e6 100%)'
              : 'linear-gradient(135deg, #fff 0%, #fafafa 100%)'
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Decorative Elements */}
        <div className="absolute top-20 right-20 w-72 h-72 bg-gradient-to-br from-rose-100/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-48 h-48 bg-gradient-to-tr from-rose-50/60 to-transparent rounded-full blur-2xl" />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-8 sm:px-16 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'left' ? 1.05 : 1,
              y: activeSection === 'left' ? -8 : 0
            }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-8"
          >
            <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center transition-all duration-500 ${
              activeSection === 'left'
                ? 'bg-gradient-to-br from-[#E31837] to-[#c41230] shadow-xl shadow-rose-200/50'
                : 'bg-white shadow-lg shadow-gray-200/50 border border-gray-100'
            }`}>
              <Users className={`w-10 h-10 md:w-11 md:h-11 transition-colors duration-500 ${
                activeSection === 'left' ? 'text-white' : 'text-gray-400'
              }`} />
              {activeSection === 'left' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#E31837]" />
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            animate={{
              y: activeSection === 'left' ? -4 : 0
            }}
            transition={{ duration: 0.4 }}
            className={`text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4 tracking-tight transition-colors duration-500 ${
              activeSection === 'left' ? 'text-[#E31837]' : 'text-gray-900'
            }`}
          >
            쿠팡 PT
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'right' ? 0.4 : 1 }}
            className="text-base md:text-lg text-center text-gray-500 mb-8 font-medium"
          >
            전문가와 1:1 파트너십
          </motion.p>

          {/* Expanded Content */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                  {['초기비용 0원', '수익 30% 정산', '전담 관리'].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-sm font-medium text-gray-700 border border-gray-100 shadow-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-full font-semibold shadow-lg shadow-rose-200/50 hover:shadow-xl hover:shadow-rose-300/50 transition-shadow"
                >
                  자세히 보기
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hover hint */}
          <AnimatePresence>
            {activeSection !== 'left' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-gray-400"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="hidden md:block absolute right-0 top-[20%] bottom-[20%] w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent" />
      </motion.div>

      {/* Right Section - 쿠팡대량프로그램 */}
      <motion.div
        className={`relative cursor-pointer overflow-hidden transition-all duration-700 ease-out
          ${activeSection === 'left' ? 'md:flex-[0.35] flex-[0.4]' : ''}
          ${activeSection === 'right' ? 'md:flex-[0.65] flex-[0.6]' : ''}
          ${!activeSection ? 'flex-1' : ''}
        `}
        onClick={() => handleSectionClick('right')}
        onMouseEnter={() => !isNavigating && setActiveSection('right')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background */}
        <motion.div
          className="absolute inset-0"
          animate={{
            background: activeSection === 'right'
              ? 'linear-gradient(225deg, #fff 0%, #fff5f5 50%, #ffe4e6 100%)'
              : 'linear-gradient(225deg, #fafafa 0%, #f5f5f5 100%)'
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Decorative Elements */}
        <div className="absolute top-10 left-20 w-64 h-64 bg-gradient-to-br from-rose-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-20 w-56 h-56 bg-gradient-to-tl from-rose-50/50 to-transparent rounded-full blur-2xl" />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-8 sm:px-16 z-10">
          {/* Icon */}
          <motion.div
            animate={{
              scale: activeSection === 'right' ? 1.05 : 1,
              y: activeSection === 'right' ? -8 : 0
            }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-8"
          >
            <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center transition-all duration-500 ${
              activeSection === 'right'
                ? 'bg-gradient-to-br from-[#E31837] to-[#c41230] shadow-xl shadow-rose-200/50'
                : 'bg-white shadow-lg shadow-gray-200/50 border border-gray-100'
            }`}>
              <Monitor className={`w-10 h-10 md:w-11 md:h-11 transition-colors duration-500 ${
                activeSection === 'right' ? 'text-white' : 'text-gray-400'
              }`} />
              {activeSection === 'right' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#E31837]" />
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            animate={{
              y: activeSection === 'right' ? -4 : 0
            }}
            transition={{ duration: 0.4 }}
            className={`text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-3 tracking-tight transition-colors duration-500 ${
              activeSection === 'right' ? 'text-[#E31837]' : 'text-gray-900'
            }`}
          >
            쿠팡대량프로그램
          </motion.h2>

          {/* Badge */}
          <motion.div
            animate={{ opacity: activeSection === 'left' ? 0.4 : 1 }}
            className="mb-4"
          >
            <span className="px-3 py-1 bg-gradient-to-r from-[#E31837]/10 to-rose-100/50 rounded-full text-xs font-semibold text-[#E31837] border border-[#E31837]/20">
              월 구독 서비스
            </span>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            animate={{ opacity: activeSection === 'left' ? 0.4 : 1 }}
            className="text-base md:text-lg text-center text-gray-500 mb-8 font-medium"
          >
            AI 자동화 대량등록
          </motion.p>

          {/* Expanded Content */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                  {['월 7.9만원', 'AI 상품명 생성', '24시간 자동'].map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-sm font-medium text-gray-700 border border-gray-100 shadow-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#E31837] text-white rounded-full font-semibold shadow-lg shadow-rose-200/50 hover:shadow-xl hover:shadow-rose-300/50 transition-shadow"
                >
                  자세히 보기
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hover hint */}
          <AnimatePresence>
            {activeSection !== 'right' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-gray-400"
              >
                클릭하여 입장
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Center Logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:block"
      >
        <div className="w-20 h-20 rounded-2xl bg-white shadow-2xl shadow-gray-200/50 border border-gray-100 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[10px] font-bold text-[#E31837] tracking-widest">COUPANG</p>
            <p className="text-sm font-bold text-gray-900">셀러허브</p>
          </div>
        </div>
      </motion.div>

      {/* Navigation Overlay */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/90 backdrop-blur-md z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full border-2 border-gray-200 border-t-[#E31837] animate-spin" />
              <p className="text-gray-500 text-sm font-medium">이동 중...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
