'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Check, ChevronDown, Star, Zap, Shield, Clock,
  FolderUp, Tag, Calculator, Users,
  Sparkles, Menu, X, Play, TrendingUp, AlertCircle, Search, ImageIcon,
  CheckCircle2, ArrowDown, MonitorSmartphone, Layers, RefreshCw,
  Brain, DollarSign, Globe, Cpu, Download,
  Heart, CheckCircle,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================
const CTA_URL = 'https://coupang-sellerhub-new.vercel.app/auth/login';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================
const fadeInUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } };
const fadeIn = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5 } } };
const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } } };
const scaleIn = { hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } };

// ============================================================================
// HELPERS
// ============================================================================
function useScrollY() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => { const h = () => setScrollY(window.scrollY); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);
  return scrollY;
}

function AnimatedSection({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (<motion.section ref={ref} id={id} className={className} initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={staggerContainer}>{children}</motion.section>);
}

function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-gray-50 to-gray-50/80 border-b border-gray-100">
      <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#ff5f57]" /><div className="w-3 h-3 rounded-full bg-[#febc2e]" /><div className="w-3 h-3 rounded-full bg-[#28c840]" /></div>
      <div className="flex-1 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-gray-100 text-[11px] text-gray-400 font-medium">
          <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-[#E31837] to-[#ff4d6a]" />{title}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT: Header
// ============================================================================
function Header() {
  const scrollY = useScrollY();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isScrolled = scrollY > 20;
  useEffect(() => { const h = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); }; window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);

  return (
    <>
      <motion.header initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-gray-100/50' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-red-200/50"><Zap className="w-[18px] h-[18px] text-white" strokeWidth={2.5} /></div>
              <span className={`text-lg font-bold transition-colors ${isScrolled ? 'text-gray-900' : 'text-white'}`}>쿠팡 자동화</span>
            </a>
            <nav className="hidden md:flex items-center gap-1">
              {[{ label: '기능', href: '#features' }, { label: '화면 미리보기', href: '#screenshots' }, { label: '요금제', href: '#pricing' }, { label: 'FAQ', href: '#faq' }].map((item) => (
                <a key={item.href} href={item.href} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${isScrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>{item.label}</a>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <a href={CTA_URL} className={`px-4 py-2 text-sm font-medium transition-colors ${isScrolled ? 'text-gray-700' : 'text-white/80'}`}>로그인</a>
              <a href={CTA_URL} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-[#E31837] hover:bg-[#c81530] shadow-lg shadow-red-200/40 transition-all hover:-translate-y-0.5">무료 체험하기</a>
            </div>
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`md:hidden p-2 rounded-lg ${isScrolled ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`} aria-label="메뉴">
              {mobileMenuOpen ? <X className={`w-5 h-5 ${isScrolled ? 'text-gray-700' : 'text-white'}`} /> : <Menu className={`w-5 h-5 ${isScrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>
      </motion.header>
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="fixed inset-x-0 top-16 z-50 bg-white/98 backdrop-blur-xl border-b border-gray-200 shadow-2xl md:hidden">
              <nav className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-1">
                {[{ label: '기능', href: '#features' }, { label: '요금제', href: '#pricing' }, { label: 'FAQ', href: '#faq' }].map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl">{item.label}</a>
                ))}
                <div className="border-t border-gray-100 mt-3 pt-4">
                  <a href={CTA_URL} onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3.5 text-base font-semibold text-white bg-[#E31837] rounded-xl text-center shadow-lg">무료 체험하기</a>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// COMPONENT: Dashboard Mockup
// ============================================================================
function DashboardMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-red-100/50 via-purple-100/25 to-blue-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 윙 판매자센터" />
        <img
          src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1ad3f839e5aa4618a9ef_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80.jpg"
          alt="쿠팡 윙 판매자센터 대시보드 - 매출 현황, 주문 관리, 상품 등록 화면"
          className="w-full"
          loading="eager"
        />
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">등록 완료!</div><div className="text-[10px] text-gray-400">147개 상품 쿠팡 등록</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center"><Sparkles className="w-4 h-4 text-purple-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">AI 매칭 완료</div><div className="text-[10px] text-gray-400">정확도 94.2%</div></div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// COMPONENT: Hero
// ============================================================================
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] sm:min-h-screen flex items-end overflow-hidden pt-16 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] left-[10%] w-[600px] h-[600px] bg-[#E31837]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[10%] right-[15%] w-[400px] h-[400px] bg-indigo-500/8 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:32px_32px]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 w-full z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-end">
          <div className="max-w-xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-6">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E31837] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#E31837]" /></span>
              <span className="text-sm font-medium text-white/90">쿠팡 셀러 필수 자동화 도구</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.12] text-white mb-6 text-shadow">
              100개 상품 등록,<br /><span className="bg-gradient-to-r from-[#ff6b81] to-[#ffb3c1] bg-clip-text text-transparent">10분이면 끝.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="text-lg sm:text-xl text-white/70 leading-relaxed mb-8 text-shadow-sm">
              AI가 카테고리 매칭, 상품명 생성, 가격 계산, 검색태그까지 전부 자동으로.<br className="hidden sm:block" />네이버 스마트스토어 상품도 쿠팡으로 원클릭 변환.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex flex-col sm:flex-row gap-3 mb-8">
              <a href={CTA_URL} className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-base font-semibold text-white bg-[#E31837] rounded-2xl shadow-xl shadow-red-900/30 hover:bg-[#c81530] transition-all hover:-translate-y-0.5">
                무료 체험 시작하기<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#solution" className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-base font-semibold text-white/90 glass-card rounded-2xl hover:bg-white/15 transition-all">
                <Play className="w-4 h-4 text-[#ff6b81]" />작동 방식 보기
              </a>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/50 mb-10">
              {['1일 무료 체험', '카드 등록 불필요', '언제든 해지'].map((t) => (<span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-400" />{t}</span>))}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="grid grid-cols-3 gap-3">
              {[{ value: '48h → 10min', label: '등록 시간 단축' }, { value: '3.4배', label: '검색 노출 증가' }, { value: '~80만원', label: '월 인건비 절감' }].map((stat, i) => (
                <div key={i} className="glass-card rounded-xl px-4 py-3 text-center"><div className="text-base sm:text-lg font-extrabold text-white">{stat.value}</div><div className="text-[11px] text-white/50 mt-0.5">{stat.label}</div></div>
              ))}
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.35 }} className="relative hidden lg:block">
            <DashboardMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// COMPONENT: Trust Bar
// ============================================================================
function TrustBar() {
  return (
    <AnimatedSection className="py-12 bg-gray-50/60 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeIn} className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {[{ icon: <Shield className="w-5 h-5 text-[#E31837]" />, text: '쿠팡 Wing API 공식 연동' }, { icon: <Brain className="w-5 h-5 text-purple-600" />, text: 'GPT-4 기반 AI 엔진' }, { icon: <Globe className="w-5 h-5 text-blue-600" />, text: '네이버 → 쿠팡 자동 변환' }, { icon: <Cpu className="w-5 h-5 text-emerald-600" />, text: '9단계 자동화 파이프라인' }, { icon: <Shield className="w-5 h-5 text-gray-600" />, text: '256-bit SSL 암호화' }].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm font-medium text-gray-600">{item.icon}{item.text}</div>
          ))}
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Pain Points
// ============================================================================
function PainPointsSection() {
  const painPoints = [
    { icon: <Clock className="w-6 h-6" />, title: '상품 하나에 30분씩 걸리는 등록', desc: '상품명 짓고, 카테고리 찾고, 옵션 설정하고... 100개면 이틀 밤새워야 합니다.' },
    { icon: <Search className="w-6 h-6" />, title: '카테고리 매칭, 매번 헷갈림', desc: '쿠팡 카테고리 트리가 너무 복잡합니다. 잘못 매칭하면 검색에서 완전히 사라집니다.' },
    { icon: <Tag className="w-6 h-6" />, title: '검색 노출 안 되는 상품명', desc: '키워드 빠진 상품명은 고객 눈에 보이지 않습니다. SEO가 매출의 핵심입니다.' },
    { icon: <Calculator className="w-6 h-6" />, title: '가격 계산 실수 = 마진 손실', desc: '수수료, 배송비, 마진율 계산을 틀리면 주문마다 적자가 쌓입니다.' },
    { icon: <Users className="w-6 h-6" />, title: '알바 교육에 드는 시간과 비용', desc: '새 직원 뽑아도 쿠팡 등록 교육만 일주일. 이직하면 또 처음부터.' },
    { icon: <RefreshCw className="w-6 h-6" />, title: '네이버 상품 재등록의 번거로움', desc: '네이버 스마트스토어 상품을 쿠팡에 올리려면 처음부터 다시 작업해야 합니다.' },
  ];
  return (
    <AnimatedSection className="py-24 md:py-32 bg-gray-50/80 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(227,24,55,0.03),transparent_50%)]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-50 border border-red-100 text-[#E31837] text-sm font-medium mb-4"><AlertCircle className="w-3.5 h-3.5" />셀러의 현실</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">이런 고민, 있으시죠?</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">매일 반복되는 단순 노동에 지치셨다면, 이제 AI에게 맡기세요.</p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {painPoints.map((point, i) => (
            <motion.div key={i} variants={fadeInUp} className="group relative bg-white rounded-2xl p-6 border border-gray-100 hover:border-red-100 shadow-sm hover:shadow-xl hover:shadow-red-50/50 transition-all hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-red-50 group-hover:bg-red-100 flex items-center justify-center text-[#E31837] mb-4 transition-colors">{point.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{point.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{point.desc}</p>
            </motion.div>
          ))}
        </div>
        <motion.div variants={fadeInUp} className="text-center mt-16"><div className="inline-flex items-center gap-2 text-base font-medium text-gray-400"><span>하지만 걱정 마세요</span><ArrowDown className="w-4 h-4 animate-bounce" /></div></motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Emotional Storytelling
// ============================================================================
function StorytellingSection() {
  const storySteps = [
    { text: '매일 밤 12시, 사무실에 혼자 남아 상품을 등록합니다. 상품 하나에 30분. 100개면 50시간. 꼬박 이틀 밤.', emotion: 'pain' },
    { text: '카테고리가 틀려서 검색에서 사라진 상품 23개. 다시 수정. 키워드 빠진 상품명 때문에 매출 0원인 상품 17개.', emotion: 'pain' },
    { text: '알바생이 퇴사했습니다. 교육에 일주일, 인건비 월 160만원. 또 처음부터 반복.', emotion: 'pain' },
    { text: '그때 발견했습니다. AI가 10분 만에 100개를 등록한다는 것을. 처음엔 믿지 않았습니다. 하지만...', emotion: 'turning' },
  ];

  return (
    <AnimatedSection className="py-24 md:py-32 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-[#E31837]/8 rounded-full blur-[150px]" />
      </div>
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-rose-300 text-sm font-medium mb-4"><Heart className="w-3.5 h-3.5" />REAL STORY</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white mb-4">셀러의 하루가 바뀌는 순간</h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">수많은 셀러들이 겪은 진짜 이야기입니다.</p>
        </motion.div>

        <div className="space-y-6 mb-16">
          {storySteps.map((step, i) => (
            <motion.div key={i} variants={fadeInUp} className={`p-6 rounded-2xl border ${step.emotion === 'turning' ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10'}`}>
              <p className={`text-[15px] sm:text-base leading-relaxed ${step.emotion === 'turning' ? 'text-white font-semibold' : 'text-gray-400'}`}>
                {step.emotion === 'turning' && <Sparkles className="w-5 h-5 text-amber-400 inline mr-2" />}
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Before / After comparison */}
        <motion.div variants={fadeInUp} className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6">
            <div className="flex items-center gap-2 mb-5"><X className="w-5 h-5 text-red-400" /><span className="text-sm font-bold text-red-300">수동 등록</span></div>
            <div className="space-y-3">
              {['상품 100개 등록 = 50시간', '카테고리 오류율 15%', '월 인건비 160만원', '키워드 누락 → 매출 손실'].map((t) => (
                <div key={t} className="flex items-center gap-2.5"><X className="w-4 h-4 text-red-400/60 flex-shrink-0" /><span className="text-sm text-gray-400 line-through">{t}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6">
            <div className="flex items-center gap-2 mb-5"><Zap className="w-5 h-5 text-emerald-400" /><span className="text-sm font-bold text-emerald-300">AI 자동화</span></div>
            <div className="space-y-3">
              {['상품 100개 등록 = 10분', 'AI 카테고리 정확도 94%', '인건비 0원', 'SEO 최적화 상품명 자동 생성'].map((t) => (
                <div key={t} className="flex items-center gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /><span className="text-sm text-emerald-200/80 font-medium">{t}</span></div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Solution Process (4 steps)
// ============================================================================
function SolutionSection() {
  const steps = [
    { num: '01', time: '30초', icon: <FolderUp className="w-7 h-7" />, title: '이미지 폴더 업로드', desc: '상품 이미지가 담긴 폴더를 드래그 앤 드롭. 엑셀 데이터도 자동 매칭됩니다.', detail: '폴더 구조 자동 인식 · 엑셀 데이터 매칭', gradient: 'from-blue-500 to-indigo-600', bg: 'bg-blue-50', dotColor: 'bg-blue-400' },
    { num: '02', time: '3초', icon: <Brain className="w-7 h-7" />, title: 'AI가 자동 처리', desc: 'AI가 카테고리 매칭, SEO 상품명 생성, 마진율 기반 가격 계산, 검색 태그 생성을 동시에 처리합니다.', detail: '카테고리 · 상품명 · 가격 · 태그 동시 생성', gradient: 'from-purple-500 to-violet-600', bg: 'bg-purple-50', dotColor: 'bg-purple-400' },
    { num: '03', time: '선택', icon: <MonitorSmartphone className="w-7 h-7" />, title: '검수 및 수정', desc: 'AI 결과를 대시보드에서 한눈에 확인. 수정이 필요한 부분만 클릭해서 변경.', detail: '원클릭 수정 · 일괄 승인 가능', gradient: 'from-emerald-500 to-green-600', bg: 'bg-emerald-50', dotColor: 'bg-emerald-400' },
    { num: '04', time: '자동', icon: <Cpu className="w-7 h-7" />, title: '쿠팡 자동 등록', desc: 'R2 스토리지에 이미지 업로드 후 쿠팡 Wing API로 자동 등록. Google Sheets에 이력 백업.', detail: '9단계 파이프라인 · R2 스토리지 · Wing API', gradient: 'from-[#E31837] to-[#ff4d6a]', bg: 'bg-red-50', dotColor: 'bg-[#E31837]' },
  ];
  return (
    <AnimatedSection id="solution" className="py-24 md:py-32 relative overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-medium mb-4"><Layers className="w-3.5 h-3.5" />4단계로 끝</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">폴더 하나 넣으면, <span className="bg-gradient-to-r from-[#E31837] to-[#ff6b81] bg-clip-text text-transparent">나머지는 AI가</span></h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">기존 48시간 걸리던 100개 상품 등록, 이제 10분이면 완료됩니다.</p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5">
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeInUp} className="group relative">
              {i < steps.length - 1 && <div className="hidden lg:flex absolute top-14 left-[calc(100%_-_4px)] w-[calc(20px_+_8px)] items-center justify-center z-10"><ArrowRight className="w-4 h-4 text-gray-300" /></div>}
              <div className="relative bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-2 h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <div className={`rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`} style={{ width: 52, height: 52 }}>{step.icon}</div>
                  <span className="text-2xl font-extrabold text-gray-100">{step.num}</span>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${step.bg} mb-3 w-fit`}><div className={`w-1.5 h-1.5 rounded-full ${step.dotColor}`} /><span className="text-xs font-bold text-gray-600">{step.time}</span></div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed flex-1 mb-4">{step.desc}</p>
                <div className="text-[11px] font-medium text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{step.detail}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Screen Mockups Section
// ============================================================================
function ScreenMockupsSection() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['상품 등록', '매출 관리', '정산 분석'];

  return (
    <AnimatedSection id="screenshots" className="py-24 md:py-32 bg-gray-50/80 relative overflow-hidden">
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-sm font-medium mb-4"><MonitorSmartphone className="w-3.5 h-3.5" />화면 미리보기</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">프로그램 화면을 직접 확인하세요</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">실제 사용하게 될 핵심 기능들을 미리 확인해 보세요.</p>
        </motion.div>

        {/* Tab buttons */}
        <motion.div variants={fadeInUp} className="flex gap-2 mb-8 justify-center flex-wrap">
          {tabs.map((tab, i) => (
            <button key={i} type="button" onClick={() => setActiveTab(i)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === i ? 'bg-gray-900 text-white shadow-lg' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{tab}</button>
          ))}
        </motion.div>

        {/* Tab content */}
        <motion.div variants={fadeInUp} className="max-w-4xl mx-auto">
          {activeTab === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 상품 등록" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b7587ddf90a97421004_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-4.jpg"
                alt="쿠팡 윙 상품 등록 메뉴 - 상품관리, 주문배송, 정산, 광고 등 전체 메뉴 구조"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}
          {activeTab === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 상품 관리 대시보드" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b4c10d8b8b95b6a5e88_49a5058d60e0b02956a24c15e42be2fb_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-2.jpg"
                alt="쿠팡 윙 상품 관리 대시보드 - 실시간 매출, 주문현황, 상품 목록 관리 화면"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}
          {activeTab === 2 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="쿠팡 윙 - 정산 & 매출 분석" />
              <img
                src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b86eb717de97ea44fc8_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-6.jpg"
                alt="쿠팡 윙 정산 화면 - 매출 분석, 정산 내역, 수익 그래프"
                className="w-full"
                loading="lazy"
              />
            </div>
          )}
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Feature Showcase (CSS gradients, no images)
// ============================================================================
function FeatureShowcase() {
  const features = [
    { icon: <Brain className="w-7 h-7" />, title: 'AI 카테고리 매칭', subtitle: 'GPT-4 기반 · 90%+ 정확도', desc: '상품 데이터를 분석해 쿠팡 카테고리를 자동 매칭합니다.', highlights: ['GPT-4 기반 분석', '90% 이상 정확도', '신뢰도 점수 표시', '수동 보정 가능'], gradient: 'from-purple-500 to-violet-600', headerGrad: 'from-purple-100 via-violet-50 to-indigo-100' },
    { icon: <Sparkles className="w-7 h-7" />, title: 'AI 상품명 & 검색태그', subtitle: '검색 최적화 · SEO 특화', desc: '쿠팡 검색 알고리즘에 최적화된 상품명과 태그를 자동 생성합니다.', highlights: ['검색 키워드 분석', 'SEO 최적화 타이틀', '자동 검색태그 생성', '카테고리별 포맷'], gradient: 'from-blue-500 to-cyan-600', headerGrad: 'from-blue-100 via-cyan-50 to-sky-100' },
    { icon: <Calculator className="w-7 h-7" />, title: '자동 가격 계산', subtitle: '마진율 · 100원 절삭 · 마크업', desc: '마진 규칙에 따라 판매가를 자동 계산합니다.', highlights: ['퍼센트/고정 마진', '100원 단위 절삭', '정가 자동 마크업', '카테고리별 규칙'], gradient: 'from-emerald-500 to-green-600', headerGrad: 'from-emerald-100 via-green-50 to-teal-100' },
    { icon: <RefreshCw className="w-7 h-7" />, title: '네이버 → 쿠팡 변환', subtitle: 'URL 입력만으로 완료', desc: '네이버 스마트스토어 상품을 쿠팡 형식으로 자동 변환합니다.', highlights: ['URL 또는 Excel', '상품 정보 추출', '쿠팡 형식 변환', '일괄 등록 가능'], gradient: 'from-orange-500 to-amber-600', headerGrad: 'from-orange-100 via-amber-50 to-yellow-100' },
    { icon: <Cpu className="w-7 h-7" />, title: '24시간 자동 등록', subtitle: '9단계 파이프라인', desc: '9단계 자동화 파이프라인으로 등록을 완전 자동화합니다.', highlights: ['스케줄링 설정', 'R2 이미지 스토리지', 'Wing API 연동', '실시간 추적'], gradient: 'from-[#E31837] to-[#ff4d6a]', headerGrad: 'from-rose-100 via-red-50 to-pink-100' },
    { icon: <Download className="w-7 h-7" />, title: '데스크탑 프로그램', subtitle: '상세페이지 · 전처리', desc: '상세페이지 이미지 자동 생성과 네이버 전처리 프로그램을 제공합니다.', highlights: ['상세페이지 생성기', '전처리 프로그램', '원클릭 다운로드', '자동 업데이트'], gradient: 'from-teal-500 to-cyan-600', headerGrad: 'from-teal-100 via-cyan-50 to-blue-100' },
  ];

  return (
    <AnimatedSection id="features" className="py-24 md:py-32 relative overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-medium mb-4"><Zap className="w-3.5 h-3.5" />핵심 기능</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">셀러에게 필요한 <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">모든 자동화</span></h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">AI 기반 자동화로 상품 등록의 모든 과정을 혁신합니다.</p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={i} variants={fadeInUp} className="group bg-white rounded-2xl border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden">
              <div className={`h-32 bg-gradient-to-br ${f.headerGrad} flex items-center justify-center relative`}>
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform`}>{f.icon}</div>
              </div>
              <div className="p-7">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 mb-3"><span className="text-[11px] font-bold text-gray-600">{f.subtitle}</span></div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-5">{f.desc}</p>
                <div className="space-y-2.5">
                  {f.highlights.map((h, j) => (<div key={j} className="flex items-center gap-2.5"><div className="w-4 h-4 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><Check className="w-2.5 h-2.5 text-green-600" /></div><span className="text-sm text-gray-600">{h}</span></div>))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Pricing
// ============================================================================
function PricingSection() {
  const plans = [
    { name: '무료 체험', period: '1일', price: '무료', products: '월 10개', addon: '월 100회', accounts: '1개', popular: false, cta: '무료 체험 시작' },
    { name: '베이직', period: '월', price: '1,490,000', products: '월 3,000개', addon: '월 3,300회', accounts: '1개', popular: true, cta: '시작하기' },
    { name: '프로', period: '월', price: '2,100,000', products: '월 9,000개', addon: '월 9,900회', accounts: '3개', popular: false, cta: '시작하기' },
    { name: '엔터프라이즈', period: '월', price: '2,500,000', products: '무제한', addon: '무제한', accounts: '5개', popular: false, cta: '시작하기' },
  ];

  return (
    <AnimatedSection id="pricing" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50/50 to-white" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-green-50 border border-green-100 text-green-600 text-sm font-medium mb-4"><DollarSign className="w-3.5 h-3.5" />투명한 요금제</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">알바비보다 <span className="bg-gradient-to-r from-[#E31837] to-[#ff6b81] bg-clip-text text-transparent">훨씬 효율적인</span> 자동화</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">1일 무료 체험 후 결정하세요. 결제 후 즉시 이용 가능합니다.</p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto items-start">
          {plans.map((plan, i) => (
            <motion.div key={i} variants={fadeInUp}
              className={`relative bg-white rounded-2xl border flex flex-col ${plan.popular ? 'border-[#E31837]/20 shadow-xl shadow-red-100/40 ring-1 ring-[#E31837]/10 lg:-mt-4' : 'border-gray-200 shadow-sm'} p-6 hover:shadow-xl transition-all hover:-translate-y-1`}>
              {plan.popular && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2"><div className="px-4 py-1 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white text-xs font-bold rounded-full shadow-lg whitespace-nowrap">인기</div></div>}
              <div className="mb-5"><h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>{plan.period === '1일' && <p className="text-xs text-gray-500">1일간 무료 체험</p>}</div>
              <div className="mb-5"><div className="flex items-end gap-1"><span className="text-3xl font-extrabold text-gray-900">{plan.price === '무료' ? '무료' : `₩${plan.price}`}</span>{plan.price !== '무료' && <span className="text-sm text-gray-400 mb-1 font-medium">/월</span>}</div></div>
              <a href={CTA_URL} className={`w-full py-3 px-6 rounded-xl text-center text-sm font-semibold transition-all mb-6 block ${plan.popular ? 'bg-[#E31837] text-white shadow-lg shadow-red-200/50 hover:bg-[#c81530]' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>{plan.cta}</a>
              <div className="space-y-3 flex-1 text-sm">
                {[{ label: '상품 등록', value: plan.products }, { label: '애드온 추출', value: plan.addon }, { label: '쿠팡 계정', value: plan.accounts }, { label: 'AI 기능', value: '무제한' }].map((feat, j) => (
                  <div key={j} className="flex items-center justify-between"><span className="text-gray-500">{feat.label}</span><span className="font-semibold text-gray-900">{feat.value}</span></div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div variants={fadeIn} className="text-center mt-10">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            {['구독은 결제일부터 30일간 유효', '결제 후 즉시 이용 가능', '플랜 변경은 고객센터 문의', '결제 취소는 마이페이지에서 가능'].map((t) => (<span key={t} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-gray-300" />{t}</span>))}
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Testimonials (no images, initial avatars)
// ============================================================================
function TestimonialsSection() {
  const testimonials = [
    { name: '김도현', role: '패션 카테고리 셀러', detail: '월 매출 3억', stars: 5, quote: '혼자서 하루 50개씩 등록하던 걸 이제 500개도 가능합니다. 상품명 품질이 좋아서 검색 노출이 눈에 띄게 올랐어요. 알바 2명 인건비가 그대로 절약됩니다.', metric: '등록 속도 10배 향상', metricColor: 'text-[#E31837]', metricBg: 'bg-red-50', gradient: 'from-rose-500 to-red-600' },
    { name: '박서연', role: '생활용품 셀러', detail: '월 매출 1.5억', stars: 5, quote: '카테고리 매칭이 정말 정확해요. AI가 생성한 상품명도 제가 직접 쓴 것보다 훨씬 키워드가 풍부하고, 실제로 판매가 늘었습니다.', metric: '월 매출 47% 성장', metricColor: 'text-green-600', metricBg: 'bg-green-50', gradient: 'from-emerald-500 to-green-600' },
    { name: '이준호', role: '전자제품 셀러', detail: '쿠팡 5개 계정 운영', stars: 5, quote: '계정 5개를 동시에 운영하는데, 하나의 대시보드에서 전부 관리할 수 있어서 혼란이 사라졌어요. Google Sheets 연동도 편합니다.', metric: '운영 시간 80% 절감', metricColor: 'text-blue-600', metricBg: 'bg-blue-50', gradient: 'from-blue-500 to-indigo-600' },
  ];

  return (
    <AnimatedSection className="py-24 md:py-32 bg-gray-50/80 relative overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-yellow-50 border border-yellow-100 text-yellow-600 text-sm font-medium mb-4"><Star className="w-3.5 h-3.5 fill-yellow-500" />셀러 후기</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">실제 셀러들의 <span className="bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">성장 스토리</span></h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} variants={fadeInUp} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col overflow-hidden">
              <div className={`h-24 bg-gradient-to-br ${t.gradient} flex items-center justify-center relative`}>
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xl font-bold border-2 border-white/30">{t.name[0]}</div>
              </div>
              <div className="p-7 flex flex-col flex-1">
                <div className="flex gap-0.5 mb-4">{Array.from({ length: t.stars }).map((_, j) => (<Star key={j} className="w-[18px] h-[18px] text-yellow-400 fill-yellow-400" />))}</div>
                <p className="text-[15px] text-gray-600 leading-relaxed flex-1 mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${t.metricBg} ${t.metricColor} text-sm font-bold mb-6 w-fit`}><TrendingUp className="w-4 h-4" />{t.metric}</div>
                <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>{t.name[0]}</div>
                  <div><div className="text-sm font-bold text-gray-900">{t.name}</div><div className="text-xs text-gray-500">{t.role} · {t.detail}</div></div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: FAQ
// ============================================================================
function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = [
    { q: 'AI 카테고리 매칭 정확도는 어느 정도인가요?', a: 'GPT-4 기반으로 90% 이상의 정확도를 보입니다. 매칭 결과와 함께 신뢰도 점수를 제공하여 확인이 필요한 항목을 쉽게 파악할 수 있습니다.' },
    { q: '네이버 스마트스토어 상품을 어떻게 가져오나요?', a: '네이버 변환 메뉴에서 상품 URL을 입력하거나 Excel 파일을 업로드하면 됩니다. 상품 정보가 자동으로 추출되고, 쿠팡 형식으로 변환됩니다.' },
    { q: '자동 등록은 어떻게 동작하나요?', a: '자동 등록 메뉴에서 일정과 빈도를 설정하면, AI가 자동으로 카테고리 매칭, 상품명 최적화를 진행하고 쿠팡에 등록합니다.' },
    { q: '가격 정책은 어떻게 설정하나요?', a: '가격 정책 메뉴에서 기본 마진율을 설정합니다. 100원 단위 절삭, 정가 마크업률도 설정 가능하며 카테고리별 별도 규칙도 추가할 수 있습니다.' },
    { q: '대량 상품 등록 시 제한이 있나요?', a: '배치당 최대 100개 상품을 처리합니다. 완료 후 바로 다음 배치를 시작할 수 있어 실질적으로 무제한입니다.' },
    { q: '이미지는 어떻게 처리되나요?', a: '업로드된 이미지는 Cloudflare R2 스토리지에 안전하게 저장됩니다. 쿠팡 등록 시 이미지 URL로 자동 변환됩니다.' },
    { q: '쿠팡 API 키는 어떻게 발급받나요?', a: '쿠팡 Wing → Open API 관리에서 허용 IP를 등록하면 됩니다. 대시보드에서 안내하는 IP 주소를 등록하시면 24시간 내 활성화됩니다.' },
  ];

  return (
    <AnimatedSection id="faq" className="py-24 md:py-32 relative overflow-hidden">
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div variants={fadeInUp} className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-sm font-medium mb-4">FAQ</span>
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 mb-4">자주 묻는 질문</h2>
          <p className="text-lg text-gray-500">궁금한 점이 해결되지 않으면 언제든 문의해 주세요.</p>
        </motion.div>
        <motion.div variants={fadeInUp} className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i} className={`bg-white rounded-2xl border transition-all ${isOpen ? 'border-gray-200 shadow-lg' : 'border-gray-100 shadow-sm hover:border-gray-200'}`}>
                <button type="button" onClick={() => setOpenIdx(isOpen ? null : i)} className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left" aria-expanded={isOpen}>
                  <span className="text-[15px] sm:text-base font-semibold text-gray-900 leading-snug">{faq.q}</span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isOpen ? 'bg-gray-900' : 'bg-gray-100'}`}><ChevronDown className={`w-4 h-4 transition-all ${isOpen ? 'text-white rotate-180' : 'text-gray-500'}`} /></div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden"><div className="px-5 md:px-6 pb-5 md:pb-6 text-[15px] text-gray-500 leading-relaxed">{faq.a}</div></motion.div>)}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Final CTA (CSS gradients only)
// ============================================================================
function FinalCTASection() {
  return (
    <AnimatedSection className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[#E31837]/8 blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-indigo-500/8 blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:40px_40px]" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div variants={fadeInUp}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm"><Zap className="w-4 h-4 text-yellow-400" /><span className="text-sm font-medium text-gray-300">지금 시작하면 오늘부터 자동화</span></div>
        </motion.div>
        <motion.h2 variants={fadeInUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">지금 시작하면<br /><span className="bg-gradient-to-r from-[#ff4d6a] via-[#ff8fa3] to-[#ffb3c1] bg-clip-text text-transparent">내일 아침 상품이 올라갑니다</span></motion.h2>
        <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto">1일 무료 체험 · 카드 등록 불필요 · 5분이면 첫 상품 등록 완료</motion.p>
        <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={CTA_URL} className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-base font-semibold text-white bg-[#E31837] rounded-2xl shadow-2xl shadow-red-900/30 hover:bg-[#ff2a4a] transition-all hover:-translate-y-0.5">무료 체험 시작하기<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></a>
          <a href="#pricing" className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-gray-300 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all backdrop-blur-sm">요금제 비교하기</a>
        </motion.div>
        <motion.div variants={fadeIn} className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-14 text-sm text-gray-500">
          {[{ icon: <Shield className="w-4 h-4" />, text: '256-bit SSL 암호화' }, { icon: <Clock className="w-4 h-4" />, text: '99.9% 가동률 보장' }, { icon: <Users className="w-4 h-4" />, text: '실시간 고객 지원' }].map((item, i) => (<span key={i} className="flex items-center gap-2">{item.icon}{item.text}</span>))}
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// COMPONENT: Footer
// ============================================================================
function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid md:grid-cols-12 gap-8 lg:gap-12">
          <div className="md:col-span-5">
            <a href="#" className="flex items-center gap-2.5 mb-5"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-sm"><Zap className="w-[18px] h-[18px] text-white" strokeWidth={2.5} /></div><span className="text-lg font-bold text-gray-900">쿠팡 자동화</span></a>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mb-5">AI 기반 쿠팡 상품 등록 자동화 솔루션.<br />카테고리 매칭, 상품명 생성, 가격 계산, 네이버 변환까지<br />셀러에게 필요한 모든 것을 자동화합니다.</p>
            <p className="text-xs text-gray-400">본 서비스는 쿠팡 공식 서비스가 아니며, 쿠팡 Wing API를 활용한 서드파티 솔루션입니다.</p>
          </div>
          <div className="md:col-span-2"><h4 className="text-sm font-bold text-gray-900 mb-4">제품</h4><ul className="space-y-3">{[{ label: '기능', href: '#features' }, { label: '요금제', href: '#pricing' }, { label: 'FAQ', href: '#faq' }].map((item) => (<li key={item.label}><a href={item.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{item.label}</a></li>))}</ul></div>
          <div className="md:col-span-2"><h4 className="text-sm font-bold text-gray-900 mb-4">지원</h4><ul className="space-y-3">{['고객센터', '가이드', 'API 문서', '제휴 문의'].map((label) => (<li key={label}><a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{label}</a></li>))}</ul></div>
          <div className="md:col-span-3"><h4 className="text-sm font-bold text-gray-900 mb-4">법적 고지</h4><ul className="space-y-3">{['이용약관', '개인정보처리방침', '서비스 수준 계약(SLA)'].map((label) => (<li key={label}><a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{label}</a></li>))}</ul></div>
        </div>
        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} 쿠팡 자동화. All rights reserved.</p>
          <div className="flex items-center gap-6">{['이용약관', '개인정보처리방침', '쿠키 정책'].map((t) => (<a key={t} href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t}</a>))}</div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function ProgramPage() {
  return (
    <main id="main-content" className="bg-white overflow-x-hidden">
      <Header />
      <HeroSection />
      <TrustBar />
      <PainPointsSection />
      <StorytellingSection />
      <SolutionSection />
      <ScreenMockupsSection />
      <FeatureShowcase />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
