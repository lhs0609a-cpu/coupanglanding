'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Users, Monitor, ArrowRight, Sparkles, Crown, Cpu } from 'lucide-react';

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
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden bg-[#0a0a0a]">
      {/* Left Section - 쿠팡 PT */}
      <motion.div
        className={`relative flex-1 cursor-pointer overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${activeSection === 'right' ? 'md:w-[20%] md:flex-none' : ''}
          ${activeSection === 'left' ? 'md:w-[80%] md:flex-none' : ''}
          ${!activeSection ? 'md:w-1/2' : ''}
        `}
        onClick={() => handleSectionClick('left')}
        onMouseEnter={() => !isNavigating && setActiveSection('left')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background Layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a2e] via-[#16082a] to-[#0d0515]" />

        {/* Mesh Gradient */}
        <div className="absolute inset-0 opacity-60">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_rgba(139,92,246,0.3)_0%,_transparent_50%)]" />
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_rgba(236,72,153,0.2)_0%,_transparent_50%)]" />
        </div>

        {/* Animated Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            animate={{
              x: [0, 30, 0],
              y: [0, -20, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[100px]"
          />
          <motion.div
            animate={{
              x: [0, -20, 0],
              y: [0, 30, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-pink-500/20 rounded-full blur-[80px]"
          />
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 py-16 text-white z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 backdrop-blur-sm">
              <Crown className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                Premium Partnership
              </span>
            </div>
          </motion.div>

          {/* Icon */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative mb-8"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl blur-2xl opacity-50" />
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl border border-white/10 flex items-center justify-center">
              <Users className="w-12 h-12 md:w-14 md:h-14 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-4 tracking-tight"
          >
            <span className="bg-gradient-to-r from-white via-purple-100 to-white bg-clip-text text-transparent">
              쿠팡 PT
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-lg md:text-xl text-center mb-10 max-w-md text-purple-100/80 font-light"
          >
            전문가와 함께하는<br />
            <span className="text-white font-medium">성공 보장형 파트너십</span>
          </motion.p>

          {/* Features - Expanded View */}
          <AnimatePresence>
            {activeSection === 'left' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-2 gap-4 mb-10 max-w-lg"
              >
                {[
                  { label: '초기 비용', value: '₩0', sub: '리스크 제로' },
                  { label: '수수료', value: '30%', sub: '성과 기반' },
                  { label: '프로그램', value: '무제한', sub: '전체 이용' },
                  { label: '전담 관리', value: '1:1', sub: 'PT사 배정' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10"
                  >
                    <p className="text-purple-300/80 text-xs mb-1">{item.label}</p>
                    <p className="text-2xl font-bold text-white">{item.value}</p>
                    <p className="text-purple-200/60 text-xs">{item.sub}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className={`flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-white/10 backdrop-blur-sm transition-all duration-300 ${activeSection === 'left' ? 'scale-110' : ''}`}
          >
            <span className="text-white font-medium">자세히 알아보기</span>
            <ArrowRight className={`w-4 h-4 text-white transition-transform duration-300 ${activeSection === 'left' ? 'translate-x-1' : ''}`} />
          </motion.div>
        </div>

        {/* Divider */}
        <div className="hidden md:block absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
      </motion.div>

      {/* Right Section - 프로그램 */}
      <motion.div
        className={`relative flex-1 cursor-pointer overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${activeSection === 'left' ? 'md:w-[20%] md:flex-none' : ''}
          ${activeSection === 'right' ? 'md:w-[80%] md:flex-none' : ''}
          ${!activeSection ? 'md:w-1/2' : ''}
        `}
        onClick={() => handleSectionClick('right')}
        onMouseEnter={() => !isNavigating && setActiveSection('right')}
        onMouseLeave={() => !isNavigating && setActiveSection(null)}
      >
        {/* Background Layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#081220] to-[#050a12]" />

        {/* Mesh Gradient */}
        <div className="absolute inset-0 opacity-60">
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_rgba(6,182,212,0.3)_0%,_transparent_50%)]" />
          <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_rgba(34,197,94,0.2)_0%,_transparent_50%)]" />
        </div>

        {/* Animated Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            animate={{
              x: [0, -30, 0],
              y: [0, 20, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-cyan-500/20 rounded-full blur-[100px]"
          />
          <motion.div
            animate={{
              x: [0, 20, 0],
              y: [0, -30, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-1/3 left-1/4 w-[300px] h-[300px] bg-emerald-500/20 rounded-full blur-[80px]"
          />
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-6 sm:px-12 py-16 text-white z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 backdrop-blur-sm">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium bg-gradient-to-r from-cyan-200 to-emerald-200 bg-clip-text text-transparent">
                AI-Powered Solution
              </span>
            </div>
          </motion.div>

          {/* Icon */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative mb-8"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-3xl blur-2xl opacity-50" />
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 backdrop-blur-xl border border-white/10 flex items-center justify-center">
              <Monitor className="w-12 h-12 md:w-14 md:h-14 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-4 tracking-tight"
          >
            <span className="bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">
              셀러허브
            </span>
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-lg md:text-xl text-center mb-10 max-w-md text-cyan-100/80 font-light"
          >
            AI 기반 자동화 솔루션으로<br />
            <span className="text-white font-medium">스마트한 쿠팡 셀링</span>
          </motion.p>

          {/* Features - Expanded View */}
          <AnimatePresence>
            {activeSection === 'right' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-2 gap-4 mb-10 max-w-lg"
              >
                {[
                  { label: '상품 등록', value: '10분', sub: '100개 기준' },
                  { label: '월 비용', value: '₩7.9만', sub: '알바의 1/10' },
                  { label: 'AI 상품명', value: '8종', sub: '자동 생성' },
                  { label: '검색 노출', value: '340%', sub: '평균 상승' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10"
                  >
                    <p className="text-cyan-300/80 text-xs mb-1">{item.label}</p>
                    <p className="text-2xl font-bold text-white">{item.value}</p>
                    <p className="text-cyan-200/60 text-xs">{item.sub}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className={`flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-white/10 backdrop-blur-sm transition-all duration-300 ${activeSection === 'right' ? 'scale-110' : ''}`}
          >
            <span className="text-white font-medium">자세히 알아보기</span>
            <ArrowRight className={`w-4 h-4 text-white transition-transform duration-300 ${activeSection === 'right' ? 'translate-x-1' : ''}`} />
          </motion.div>
        </div>
      </motion.div>

      {/* Center Logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:block"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full blur-2xl opacity-30" />
          <div className="relative w-28 h-28 rounded-full bg-[#0a0a0a] border border-white/20 flex items-center justify-center shadow-2xl">
            <div className="text-center">
              <Sparkles className="w-6 h-6 text-white/80 mx-auto mb-1" />
              <p className="text-[10px] font-medium text-white/50 tracking-wider">COUPANG</p>
              <p className="text-sm font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">셀러허브</p>
            </div>
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-full border-2 border-white/20 border-t-white animate-spin"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
