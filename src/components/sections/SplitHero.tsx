'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, TrendingUp, Shield, Zap, Bot, Check, Package, BarChart3, DollarSign, Sparkles } from 'lucide-react';

// ─── PT Side CSS Mockup Background ───
function PTMockupBG() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(227,24,55,0.12)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(227,24,55,0.06)_0%,transparent_50%)]" />

      {/* Floating real screenshot elements */}
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        {/* Real: 일매출 705만원 판매분석 */}
        <div className="absolute top-[12%] right-[6%] w-[220px] rounded-xl border border-white/15 overflow-hidden transform rotate-3 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#E31837]" />
            <span className="text-[9px] text-white/60 font-medium">일 매출 705만원</span>
          </div>
          <img src="/images/results/daily-sales-705m.png" alt="일 매출 705만원, 판매 133건" className="w-full" />
        </div>

        {/* Real: 3개월 누적 매출 4066만 */}
        <div className="absolute top-[14%] left-[8%] rounded-xl border border-white/15 overflow-hidden transform -rotate-2 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-400/80" />
            <span className="text-[9px] text-white/60 font-medium">3개월 누적</span>
          </div>
          <img src="/images/results/cumulative-sales-4066m.png" alt="3개월 누적 매출 4,066만원" className="w-full" />
        </div>

        {/* Real: 광고 수익률 951% */}
        <div className="absolute bottom-[28%] left-[6%] w-[180px] rounded-xl border border-white/15 overflow-hidden transform rotate-1 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/70" />
            <span className="text-[9px] text-white/60 font-medium">광고 ROAS 951%</span>
          </div>
          <img src="/images/results/ad-roi-951pct.png" alt="광고 수익률 951%, 전환매출 250만원" className="w-full" />
        </div>

        {/* Real: 쿠팡윙 앱 일매출 89만 */}
        <div className="absolute bottom-[12%] right-[8%] w-[160px] rounded-xl border border-white/15 overflow-hidden transform -rotate-2 shadow-2xl">
          <img src="/images/results/wing-app-899k.png" alt="쿠팡 Wing 앱 일 매출 899,700원" className="w-full rounded-xl" />
        </div>

        {/* Coaching Session Badge */}
        <div className="absolute top-[42%] right-[25%] bg-white/10 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 transform rotate-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-green-500/70 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-white/70">PT 코칭 완료</div>
              <div className="text-[9px] text-white/40">12회 / 12회</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Program Side CSS Mockup Background ───
function ProgramMockupBG() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-bl from-gray-900 via-slate-900 to-gray-800" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(59,130,246,0.08)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(227,24,55,0.08)_0%,transparent_50%)]" />

      {/* Floating mockup elements */}
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        {/* Mini Dashboard */}
        <div className="absolute top-[10%] left-[8%] w-[260px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden transform -rotate-1">
          {/* Sidebar + Content */}
          <div className="flex">
            {/* Mini sidebar */}
            <div className="w-12 bg-white/5 border-r border-white/5 py-3 px-2 space-y-2">
              <div className="w-full h-1.5 rounded bg-blue-400/50" />
              <div className="w-full h-1 rounded bg-white/15" />
              <div className="w-full h-1 rounded bg-white/15" />
              <div className="w-full h-1 rounded bg-white/15" />
              <div className="w-full h-1 rounded bg-white/15" />
            </div>
            {/* Content */}
            <div className="flex-1 p-3">
              <div className="text-[9px] font-bold text-white/60 mb-2">쿠팡 자동화</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-[8px] text-white/40">전체 상품</div>
                  <div className="text-sm font-bold text-blue-400/80">1,004</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-[8px] text-white/40">등록 완료</div>
                  <div className="text-sm font-bold text-green-400/80">847</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-[8px] text-white/40">처리중</div>
                  <div className="text-sm font-bold text-yellow-400/80">122</div>
                </div>
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="text-[8px] text-white/40">대기중</div>
                  <div className="text-sm font-bold text-white/60">35</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Auto Registration Progress */}
        <div className="absolute top-[22%] right-[6%] w-[200px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform rotate-2">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-blue-400/70" />
            <span className="text-[10px] font-bold text-white/60">자동 등록</span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: '여성 원피스 세트', status: '완료', color: 'bg-green-400/70' },
              { name: 'LED 무드등 조명', status: '처리중', color: 'bg-yellow-400/70' },
              { name: '실리콘 주방매트', status: '대기중', color: 'bg-gray-400/50' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-2 py-1.5">
                <span className="text-[9px] text-white/50 truncate flex-1">{item.name}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${item.color} text-white/90`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Matching */}
        <div className="absolute bottom-[30%] left-[10%] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform -rotate-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400/70" />
            <span className="text-[10px] font-bold text-white/60">AI 카테고리 매칭</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-white/70">94.2%</div>
              <div className="text-[8px] text-white/40">정확도</div>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-purple-400/50 flex items-center justify-center">
              <Check className="w-4 h-4 text-purple-400/70" />
            </div>
          </div>
        </div>

        {/* Price Calculator */}
        <div className="absolute bottom-[12%] right-[12%] w-[180px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform rotate-1">
          <div className="text-[9px] text-white/50 mb-1.5">자동 가격 계산</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[9px]">
              <span className="text-white/40">원가</span>
              <span className="text-white/60">₩12,000</span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-white/40">마진 20%</span>
              <span className="text-white/60">₩2,400</span>
            </div>
            <div className="h-px bg-white/10 my-1" />
            <div className="flex justify-between text-[10px]">
              <span className="text-white/50 font-bold">판매가</span>
              <span className="text-white/80 font-bold">₩14,400</span>
            </div>
          </div>
        </div>

        {/* Stats Bar Chart */}
        <div className="absolute top-[50%] right-[35%] bg-white/10 backdrop-blur-sm rounded-lg border border-white/10 p-3 transform -rotate-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3 h-3 text-blue-400/70" />
            <span className="text-[9px] text-white/50">7일 등록 추이</span>
          </div>
          <div className="flex items-end gap-1 h-8">
            {[30, 60, 45, 80, 55, 90, 100].map((h, i) => (
              <div key={i} className="w-3 rounded-t-sm" style={{ height: `${h}%`, background: i === 6 ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.3)' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
        {/* CSS Mockup Background */}
        <PTMockupBG />

        {/* Hover brightness */}
        <div
          className="absolute inset-0 transition-opacity duration-700 bg-black/20"
          style={{ opacity: activeSection === 'left' ? 0 : activeSection === 'right' ? 0.4 : 0.15 }}
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
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-white mb-3 text-shadow"
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

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mb-6">
            {[
              { icon: TrendingUp, label: '직접 검증 매출', color: 'text-red-400' },
              { icon: Shield, label: '0원 시작', color: 'text-red-300' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 glass-card rounded-xl px-4 py-2.5">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-sm font-semibold text-white/90">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
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
        {/* CSS Mockup Background */}
        <ProgramMockupBG />

        {/* Hover brightness */}
        <div
          className="absolute inset-0 transition-opacity duration-700 bg-black/20"
          style={{ opacity: activeSection === 'right' ? 0 : activeSection === 'left' ? 0.4 : 0.15 }}
        />

        {/* Accent line at bottom */}
        <motion.div
          animate={{ scaleX: activeSection === 'right' ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E31837] to-red-700 z-10 origin-right"
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
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-white mb-3 text-shadow"
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
              { icon: Zap, label: '10분 대량등록', color: 'text-red-400' },
              { icon: Bot, label: 'AI 자동화', color: 'text-red-400' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 glass-card rounded-xl px-4 py-2.5">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-sm font-semibold text-white/90">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
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
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#E31837] text-white rounded-2xl font-semibold shadow-xl shadow-red-500/30 hover:shadow-2xl hover:shadow-red-500/40 transition-shadow text-base"
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

      {/* Center Logo */}
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
