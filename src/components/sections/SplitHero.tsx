'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, TrendingUp, Shield, Zap, Bot, Check, Package, Sparkles, Store, Boxes, Wallet } from 'lucide-react';
import LiveSellerRevenue from '@/components/sections/LiveSellerRevenue';

type SectionKey = 'left' | 'center' | 'right';

// ─── PT Side CSS Mockup Background ───
function PTMockupBG() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(227,24,55,0.12)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(227,24,55,0.06)_0%,transparent_50%)]" />
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        <div className="absolute top-[12%] right-[6%] w-[200px] rounded-xl border border-white/15 overflow-hidden transform rotate-3 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#E31837]" />
            <span className="text-[9px] text-white/60 font-medium">일 매출 705만원</span>
          </div>
          <img src="/images/results/daily-sales-705m.png" alt="일 매출 705만원" className="w-full" />
        </div>
        <div className="absolute top-[14%] left-[8%] rounded-xl border border-white/15 overflow-hidden transform -rotate-2 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-400/80" />
            <span className="text-[9px] text-white/60 font-medium">3개월 누적</span>
          </div>
          <img src="/images/results/cumulative-sales-4066m.png" alt="3개월 누적 매출 4,066만원" className="w-full" />
        </div>
        <div className="absolute bottom-[30%] left-[6%] w-[160px] rounded-xl border border-white/15 overflow-hidden transform rotate-1 shadow-2xl">
          <div className="bg-white/10 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/70" />
            <span className="text-[9px] text-white/60 font-medium">광고 ROAS 951%</span>
          </div>
          <img src="/images/results/ad-roi-951pct.png" alt="광고 수익률 951%" className="w-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Supplier (center) CSS Mockup Background ───
function SupplierMockupBG() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-gray-900 to-slate-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.14)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(227,24,55,0.06)_0%,transparent_50%)]" />
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        {/* 공급 → 셀러망 확산 다이어그램 */}
        <div className="absolute top-[14%] left-1/2 -translate-x-1/2 w-[220px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform -rotate-1">
          <div className="flex items-center gap-2 mb-2">
            <Boxes className="w-4 h-4 text-emerald-300/80" />
            <span className="text-[10px] font-bold text-white/60">상품 1개 등록</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded bg-emerald-400/20 border border-emerald-300/20 flex items-center justify-center">
                <Store className="w-3 h-3 text-emerald-200/60" />
              </div>
            ))}
          </div>
          <p className="text-[8px] text-white/40 mt-1.5">셀러 8곳이 각자 채널에 판매</p>
        </div>
        {/* 정산 카드 */}
        <div className="absolute bottom-[26%] right-[8%] w-[170px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform rotate-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Wallet className="w-4 h-4 text-emerald-300/80" />
            <span className="text-[10px] font-bold text-white/60">판매분만 정산</span>
          </div>
          <div className="text-lg font-extrabold text-emerald-300/80">수수료 10%</div>
          <p className="text-[8px] text-white/40">실판매 검증 후 카드 자동결제</p>
        </div>
        {/* 브랜드 로고 자리 */}
        <div className="absolute top-[46%] left-[8%] flex flex-col gap-1.5 transform -rotate-2">
          {['BRAND', 'STUDIO', 'LAB'].map((b) => (
            <div key={b} className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[9px] font-bold text-white/50 tracking-widest">{b}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Program Side CSS Mockup Background ───
function ProgramMockupBG() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-bl from-gray-900 via-slate-900 to-gray-800" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(59,130,246,0.08)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(227,24,55,0.08)_0%,transparent_50%)]" />
      <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
        <div className="absolute top-[12%] right-[6%] w-[220px] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform rotate-2">
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
        <div className="absolute bottom-[28%] left-[8%] bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3 transform -rotate-1">
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
      </div>
    </div>
  );
}

interface PanelConfig {
  key: SectionKey;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
  accentBar: string;
  stats: { icon: React.ComponentType<{ className?: string }>; label: string; color: string }[];
  Bg: React.ComponentType;
}

const PANELS: PanelConfig[] = [
  {
    key: 'left',
    title: '쿠팡 PT',
    subtitle: '전문가가 함께 매출을 만듭니다',
    href: '/pt',
    badge: '전문가 파트너십',
    accentBar: 'from-[#E31837] to-[#ff4d6a]',
    stats: [
      { icon: TrendingUp, label: '직접 검증 매출', color: 'text-red-400' },
      { icon: Shield, label: '0원 시작', color: 'text-red-300' },
    ],
    Bg: PTMockupBG,
  },
  {
    key: 'center',
    title: '공급사',
    subtitle: '상품만 올리면 셀러들이 팝니다',
    href: '/supplier-program',
    badge: '공급사 파트너 모집',
    accentBar: 'from-emerald-400 to-teal-500',
    stats: [
      { icon: Boxes, label: '셀러망 자동 확산', color: 'text-emerald-300' },
      { icon: Wallet, label: '판매분만 수수료', color: 'text-emerald-400' },
    ],
    Bg: SupplierMockupBG,
  },
  {
    key: 'right',
    title: '쿠팡 프로그램',
    subtitle: 'AI가 상품 등록을 자동화합니다',
    href: '/program',
    badge: 'AI 자동화 프로그램',
    accentBar: 'from-[#E31837] to-red-700',
    stats: [
      { icon: Zap, label: '10분 대량등록', color: 'text-red-400' },
      { icon: Bot, label: 'AI 자동화', color: 'text-red-400' },
    ],
    Bg: ProgramMockupBG,
  },
];

function flexClass(key: SectionKey, active: SectionKey | null): string {
  if (!active) return 'flex-1';
  if (active === key) return 'md:flex-[1.7] flex-[1.6]';
  return 'md:flex-[0.65] flex-[0.7]';
}

export default function SplitHero() {
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSectionClick = (panel: PanelConfig) => {
    if (isNavigating) return;
    setIsNavigating(true);
    setActiveSection(panel.key);
    setTimeout(() => {
      router.push(panel.href);
    }, 500);
  };

  return (
    <section className="fixed inset-0 flex flex-col md:flex-row overflow-hidden bg-gray-950">
      {PANELS.map((panel) => {
        const isActive = activeSection === panel.key;
        const isCenter = panel.key === 'center';
        return (
          <motion.div
            key={panel.key}
            className={`relative cursor-pointer overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${flexClass(panel.key, activeSection)}`}
            onClick={() => handleSectionClick(panel)}
            onMouseEnter={() => !isNavigating && setActiveSection(panel.key)}
            onMouseLeave={() => !isNavigating && setActiveSection(null)}
          >
            <panel.Bg />

            {/* Hover brightness */}
            <div
              className="absolute inset-0 transition-opacity duration-700 bg-black/20"
              style={{ opacity: isActive ? 0 : activeSection ? 0.4 : 0.15 }}
            />

            {/* Accent line at bottom */}
            <motion.div
              animate={{ scaleX: isActive ? 1 : 0 }}
              transition={{ duration: 0.5 }}
              className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${panel.accentBar} z-10 origin-left`}
            />

            {/* Content */}
            <div className="relative h-full flex flex-col justify-end px-5 sm:px-8 lg:px-10 pb-14 sm:pb-16 z-10">
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="mb-4"
                  >
                    <span className={`px-3 py-1.5 glass-card rounded-full text-xs font-semibold tracking-wide ${isCenter ? 'text-emerald-100' : 'text-white/90'}`}>
                      {panel.badge}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.h2
                animate={{ y: isActive ? -4 : 0 }}
                transition={{ duration: 0.4 }}
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white mb-3 text-shadow"
              >
                {panel.title}
              </motion.h2>

              <motion.p
                animate={{ opacity: activeSection && !isActive ? 0.4 : 1 }}
                className="text-base md:text-lg text-white/80 mb-6 font-medium max-w-md text-shadow-sm"
              >
                {panel.subtitle}
              </motion.p>

              <div className="flex flex-wrap gap-3 mb-6">
                {panel.stats.map((stat) => (
                  <div key={stat.label} className="flex items-center gap-2 glass-card rounded-xl px-3.5 py-2">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    <span className="text-xs sm:text-sm font-semibold text-white/90">{stat.label}</span>
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`inline-flex items-center gap-2.5 px-6 py-3 text-white rounded-2xl font-semibold shadow-xl transition-shadow text-sm sm:text-base ${
                        isCenter
                          ? 'bg-emerald-500 shadow-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/40'
                          : 'bg-[#E31837] shadow-[#E31837]/30 hover:shadow-2xl hover:shadow-[#E31837]/40'
                      }`}
                    >
                      자세히 보기
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {!isActive && mounted && (
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
        );
      })}

      {/* Live 누적 매출 필 (상단 중앙) */}
      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-20"
        >
          <LiveSellerRevenue variant="hero" />
        </motion.div>
      )}

      {/* Vertical dividers (desktop) — 1/3, 2/3 */}
      <div className="hidden md:block absolute left-1/3 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-white/20 to-transparent z-10" />
      <div className="hidden md:block absolute left-2/3 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-white/20 to-transparent z-10" />

      {/* Megaload CTA Fixed Bar */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.5, ease: 'easeOut' }}
        className="fixed bottom-0 left-0 right-0 z-20"
      >
        <div className="bg-gradient-to-r from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-lg border-t border-white/10">
          <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#E31837]/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#E31837]" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-semibold text-white/90">멀티채널 자동화 프로그램</span>
                <span className="text-[10px] sm:text-xs text-white/50 ml-2 hidden sm:inline">6채널 상품·주문·재고 완전 자동화</span>
              </div>
            </div>
            <motion.a
              href="/megaload/dashboard"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#E31837] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-[#E31837]/20 hover:shadow-xl hover:shadow-[#E31837]/30 transition-shadow"
            >
              Megaload
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.a>
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
