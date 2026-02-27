'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Calculator,
  CheckCircle,
  ChevronDown,
  Clock,
  FileText,
  HandCoins,
  Handshake,
  HelpCircle,
  LogIn,
  Menu,
  MessageSquareText,
  Minus,
  Phone,
  Plus,
  Quote,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const CTA_URL = 'https://coupang-sellerhub-new.vercel.app/auth/login';

const IMAGES = {
  hero: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80',
  meeting: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
  analytics: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
  teamwork: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80',
  warehouse: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=800&q=80',
  laptop: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
  growth: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
  person1: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
  person2: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  person3: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80',
  shipping: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80',
};

// ============================================================
// ANIMATION VARIANTS
// ============================================================
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay: i * 0.08, ease: 'easeOut' },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const slideInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const slideInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

// ============================================================
// DATA
// ============================================================

const navLinks = [
  { label: '진행 과정', href: '#process' },
  { label: '보장 제도', href: '#guarantee' },
  { label: 'FAQ', href: '#faq' },
];

const heroStats = [
  { value: '94%', label: '매출 발생률', icon: TrendingUp },
  { value: '2.8배', label: '평균 성장', icon: BarChart3 },
  { value: '47일', label: '첫 매출', icon: Clock },
];

const targetAudienceCards = [
  { icon: User, title: '쿠팡 입문자', desc: '뭐부터 해야 할지 모르겠는 초보 셀러', gradient: 'from-sky-500 to-blue-600', border: 'border-sky-100' },
  { icon: Target, title: '매출 정체 셀러', desc: '3개월 넘게 매출 0원에 막힌 분', gradient: 'from-rose-500 to-red-600', border: 'border-rose-100' },
  { icon: Briefcase, title: '시간 없는 직장인', desc: '부업으로 시작하고 싶은 분', gradient: 'from-violet-500 to-purple-600', border: 'border-violet-100' },
  { icon: TrendingUp, title: '스케일업 원하는 셀러', desc: '월 500만 → 2000만 목표', gradient: 'from-amber-500 to-orange-600', border: 'border-amber-100' },
];

const notForItems = [
  { text: '이미 월 5천만원 이상 매출인 분', icon: BarChart3 },
  { text: '즉시 수익을 원하시는 분 (최소 2-3개월 소요)', icon: Clock },
  { text: '전문가 조언을 따르기 어려운 분', icon: MessageSquareText },
  { text: '연락이 안 되거나 소통이 어려운 분', icon: Phone },
];

const processSteps = [
  { step: 1, title: '무료 상담', desc: '현재 상황 파악, 목표 설정', detail: '전화 또는 화상으로 15분 상담. 쿠팡 경험, 예산, 목표를 함께 정리합니다.', icon: Phone, color: 'from-sky-500 to-blue-600' },
  { step: 2, title: '전문가 매칭', desc: '카테고리 맞는 PT사 배정', detail: '희망 카테고리에 월 1억+ 경험이 있는 전문가를 배정합니다.', icon: UserCheck, color: 'from-violet-500 to-purple-600' },
  { step: 3, title: '상품 선정 & 소싱', desc: '함께 시장 분석, 상품 발굴', detail: '데이터 기반으로 경쟁 강도, 마진율, 트렌드를 분석해 상품을 선정합니다.', icon: Search, color: 'from-emerald-500 to-teal-600' },
  { step: 4, title: '상품 등록 & 최적화', desc: 'SEO 최적화, 이미지, 상세페이지', detail: 'AI 상품명 생성, 키워드 최적화, 전환율 높은 상세페이지를 함께 제작합니다.', icon: FileText, color: 'from-amber-500 to-orange-600' },
  { step: 5, title: '광고 & 매출 관리', desc: '로켓그로스, 키워드 광고', detail: '쿠팡 광고 세팅부터 ROAS 최적화까지. 예산 대비 최고 효율을 만듭니다.', icon: Rocket, color: 'from-rose-500 to-red-600' },
  { step: 6, title: '수익 정산', desc: '월 정산, 투명 리포트', detail: '매월 상세 정산 리포트를 공유하고, 순이익의 30%만 정산합니다.', icon: HandCoins, color: 'from-indigo-500 to-blue-600' },
];

const revenueModelItems = [
  { label: '초기 비용', value: '0원', sub: '선투자 없음. 셋업비, 교육비 모두 무료.', icon: ShieldCheck, highlight: false },
  { label: '수익 발생 시', value: '순이익의 30%', sub: '매출이 아닌 순이익 기준. 원가, 배송비, 광고비 제외 후 계산.', icon: HandCoins, highlight: true },
  { label: '수익 미발생', value: '0원', sub: '리스크 없음. 매출 없으면 1원도 청구하지 않습니다.', icon: Shield, highlight: false },
];

const benefitCards = [
  { icon: Shield, title: '실패해도 손해 0원', desc: '매출 없으면 비용 없음. 성과가 없으면 저희 수익도 0원이라 더 열심히 합니다.', gradient: 'from-emerald-500 to-teal-600', image: IMAGES.shipping },
  { icon: BadgeCheck, title: '검증된 전문가', desc: '월 1억+ 셀러가 1:1로 붙습니다. 카테고리별 전문가 매칭.', gradient: 'from-violet-500 to-purple-600', image: IMAGES.meeting },
  { icon: Zap, title: '모든 과정 대행', desc: '상품 선정부터 등록, 광고까지 전부 함께 합니다. 의사결정만 하세요.', gradient: 'from-amber-500 to-orange-600', image: IMAGES.warehouse },
  { icon: MessageSquareText, title: '실시간 현황 공유', desc: '카카오톡 그룹 채팅, 주간 리포트로 진행 상황을 투명하게 공유합니다.', gradient: 'from-sky-500 to-blue-600', image: IMAGES.analytics },
];

const guaranteeItems = [
  { icon: Shield, title: '3개월 내 매출 미발생 시 비용 0원', desc: '매출이 안 나오면 한 푼도 받지 않습니다. 저희의 자신감입니다.' },
  { icon: CheckCircle, title: '중도 해지 자유', desc: '최소 계약 기간 없음. 위약금 없음. 언제든 해지 가능합니다.' },
  { icon: FileText, title: '투명한 정산 리포트', desc: '매월 상세한 엑셀 리포트 제공. 매출, 원가, 광고비, 순이익 모두 공개.' },
];

const testimonials = [
  { name: '김*훈', category: '의류', avatar: IMAGES.person1, period: '3개월', before: '0원', after: '월 680만원', quote: '처음에는 반신반의했어요. 근데 PT사님이 데이터로 하나하나 보여주시면서 "이 카테고리는 지금이 적기"라고 하시는데 설득력이 달랐어요. 2개월 차에 첫 매출이 터지고, 3개월 차에 680만원까지 왔습니다.', gradient: 'from-rose-500 to-red-600' },
  { name: '이*영', category: '생활용품', avatar: IMAGES.person2, period: '4개월', before: '월 120만원', after: '월 920만원', quote: '혼자 하다가 한계를 느끼고 신청했어요. PT사님이 제 상품 분석해주시는데 "이건 마진이 안 나오는 구조에요"라고 정확하게 짚어주시더라고요. 상품 라인을 바꾸니까 매출이 7배 이상 뛰었습니다.', gradient: 'from-violet-500 to-purple-600' },
  { name: '박*수', category: '주방용품', avatar: IMAGES.person3, period: '3개월', before: '부업 시작', after: '월 540만원', quote: '직장 다니면서 시간이 없어서 엄두를 못 냈는데, PT사님이 시간 많이 드는 건 대행해주시고 제가 결정만 하면 되니까 가능하더라고요. 주 5시간 정도만 투자하고 있습니다.', gradient: 'from-amber-500 to-orange-600' },
];

const faqData = [
  { q: '정말 0원으로 시작할 수 있나요?', a: '네, 맞습니다. 초기비용, 셋업비, 교육비 모두 0원입니다. 매출이 발생해서 순이익이 생겼을 때만 30%를 정산합니다. 매출이 없으면 저희도 수익이 없는 구조라서, 저희가 더 열심히 할 수밖에 없습니다.' },
  { q: 'PT사는 어떤 분이 배정되나요?', a: '판매하실 카테고리에 맞는 전문가가 배정됩니다. 모든 PT사는 본인이 직접 월 1억 이상 매출을 달성한 경험이 있고, 최소 30명 이상의 셀러를 성공시킨 분들입니다. 상담 시 PT사 프로필을 미리 확인하실 수 있습니다.' },
  { q: '3개월 후에는 어떻게 되나요?', a: '3개월 후에는 연장 또는 독립 중 선택하실 수 있습니다. 독립을 원하시면 그동안 배운 노하우로 혼자 운영하시면 되고, 연장을 원하시면 동일 조건으로 계속 함께할 수 있습니다.' },
  { q: '어떤 카테고리가 잘 되나요?', a: '이건 상담에서 PT사와 함께 분석하는 게 가장 정확합니다. 시장 상황은 계속 변하기 때문에 단정하기 어렵습니다. 다만, 데이터 기반으로 현재 시점에 가장 유망한 카테고리를 함께 찾아드립니다.' },
  { q: '부업으로도 가능한가요?', a: '네, 충분히 가능합니다. 실제로 파트너의 60% 이상이 직장인입니다. 주 5-10시간 정도만 투자하시면 됩니다. 시간이 많이 드는 작업은 PT사가 도와드리거나 대행합니다.' },
  { q: '해외에서도 가능한가요?', a: '쿠팡 판매를 위해서는 한국 사업자등록증이 필요합니다. 해외 거주라도 한국 사업자가 있으시면 진행 가능합니다. 상담에서 구체적으로 안내드립니다.' },
  { q: '정산은 어떻게 하나요?', a: '매월 1회 정산합니다. 해당 월의 쿠팡 정산금에서 상품 원가, 배송비, 광고비 등을 차감한 순이익의 30%를 정산합니다. 상세한 엑셀 리포트를 함께 제공합니다.' },
];

// ============================================================
// HOOK: useCountUp
// ============================================================
function useCountUp(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const started = useRef(false);

  useEffect(() => {
    if (startOnView && !inView) return;
    if (started.current) return;
    started.current = true;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration, startOnView, inView]);

  return { count, ref };
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function FAQAccordionItem({ item, index, openIndex, setOpenIndex }: {
  item: { q: string; a: string }; index: number; openIndex: number | null; setOpenIndex: (v: number | null) => void;
}) {
  const isOpen = openIndex === index;
  return (
    <motion.div variants={fadeUp} custom={index} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
      className={`rounded-2xl border transition-all duration-300 ${isOpen ? 'border-rose-200 bg-white shadow-lg shadow-rose-100/40' : 'border-gray-100 bg-white/80 shadow-sm hover:shadow-md'}`}>
      <button type="button" onClick={() => setOpenIndex(isOpen ? null : index)} aria-expanded={isOpen}
        className="w-full px-6 py-5 sm:px-8 sm:py-6 flex items-center justify-between text-left gap-4">
        <span className={`text-base sm:text-lg font-semibold leading-snug transition-colors ${isOpen ? 'text-[#E31837]' : 'text-gray-900'}`}>{item.q}</span>
        <span className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] shadow-md shadow-rose-200/50' : 'bg-gray-100'}`}>
          {isOpen ? <Minus className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-gray-500" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-6 pb-6 sm:px-8 sm:pb-7">
              <div className="pt-2 border-t border-gray-100">
                <p className="pt-4 text-gray-600 leading-relaxed text-[15px]">{item.a}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionBadge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-sm ${className}`}>
      {children}
    </motion.div>
  );
}

function CTAButton({ children, href = CTA_URL, variant = 'primary', size = 'lg', className = '' }: {
  children: React.ReactNode; href?: string; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const sizeClasses = { sm: 'px-5 py-2.5 text-sm', md: 'px-6 py-3 text-sm', lg: 'px-8 py-4 text-base' };
  const variantClasses = {
    primary: 'bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white shadow-xl shadow-rose-200/40 hover:shadow-2xl hover:shadow-rose-300/40',
    secondary: 'bg-white text-gray-900 border border-gray-200 shadow-lg shadow-gray-100/50 hover:shadow-xl hover:border-gray-300',
    ghost: 'bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20',
  };
  return (
    <motion.a href={href} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </motion.a>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function PTPage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [calcProfit, setCalcProfit] = useState(100);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = () => setMobileMenuOpen(false);
  const ptShare = Math.round(calcProfit * 0.3);
  const myShare = calcProfit - ptShare;

  // Counter hooks for social proof
  const stat1 = useCountUp(94);
  const stat2 = useCountUp(137);

  return (
    <main id="main-content" className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* ================================================================ */}
      {/* STICKY HEADER                                                    */}
      {/* ================================================================ */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-gray-100 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/30 group-hover:shadow-rose-300/50 transition-shadow">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className={`font-bold text-lg tracking-tight transition-colors duration-500 ${scrolled ? 'text-gray-900' : 'text-white'}`}>셀러허브</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${scrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>{link.label}</a>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <a href={CTA_URL} target="_blank" rel="noopener noreferrer" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${scrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
                <LogIn className="w-4 h-4" />로그인
              </a>
              <CTAButton href={CTA_URL} size="sm">무료 상담 <ArrowRight className="w-4 h-4" /></CTAButton>
            </div>
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`md:hidden p-2 rounded-lg transition-colors ${scrolled ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`} aria-label="메뉴">
              {mobileMenuOpen ? <X className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} /> : <Menu className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="md:hidden overflow-hidden bg-white/95 backdrop-blur-2xl border-b border-gray-100">
              <div className="px-5 py-4 space-y-1">
                {navLinks.map((link) => (
                  <a key={link.href} href={link.href} onClick={handleNavClick} className="block px-4 py-3 rounded-xl text-base font-medium text-gray-700 hover:bg-gray-50 transition-all">{link.label}</a>
                ))}
                <div className="pt-3 border-t border-gray-100 mt-2 flex flex-col gap-2">
                  <a href={CTA_URL} target="_blank" rel="noopener noreferrer" onClick={handleNavClick} className="px-4 py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-center shadow-lg shadow-rose-200/30">무료 상담 신청</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ================================================================ */}
      {/* HERO SECTION — Fullbleed Background                              */}
      {/* ================================================================ */}
      <section className="relative min-h-[90vh] sm:min-h-screen flex items-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={IMAGES.hero}
            alt="쿠팡 셀러 성공"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-28 sm:pt-36 pb-20 sm:pb-28 z-10 w-full">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-3xl">
            <motion.div variants={fadeUp} custom={0} className="mb-8">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-card">
                <Handshake className="w-4 h-4 text-rose-300" />
                <span className="text-sm font-semibold text-white/90">쿠팡 전문가 파트너십</span>
              </span>
            </motion.div>

            <motion.h1 variants={fadeUp} custom={1} className="text-[2.75rem] sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight mb-5 text-shadow">
              <span className="text-white">94%가 3개월 안에</span><br />
              <span className="text-white">매출을 만듭니다.</span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={2} className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6">
              <span className="bg-gradient-to-r from-[#ff6b81] to-[#ffb3c1] bg-clip-text text-transparent">못 만들면? 0원.</span>
            </motion.p>

            <motion.p variants={fadeUp} custom={3} className="text-lg sm:text-xl text-white/70 max-w-xl leading-relaxed mb-10 text-shadow-sm">
              검증된 <span className="font-semibold text-white">월 1억+ 셀러</span>가 1:1로 붙어서,<br className="hidden sm:block" />
              상품 선정부터 광고까지 <span className="font-semibold text-white">전부 같이 합니다.</span>
            </motion.p>

            <motion.div variants={fadeUp} custom={4} className="flex flex-col sm:flex-row items-start gap-4 mb-10">
              <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청<ArrowRight className="w-5 h-5" /></CTAButton>
              <CTAButton href="#process" variant="ghost" size="lg">어떻게 진행되나요?<ChevronDown className="w-5 h-5" /></CTAButton>
            </motion.div>

            {/* Glass stat cards */}
            <motion.div variants={fadeUp} custom={5} className="flex flex-wrap gap-4">
              {heroStats.map((stat) => (
                <div key={stat.label} className="glass-card rounded-2xl px-5 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-white/80" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-white">{stat.value}</p>
                    <p className="text-xs text-white/60">{stat.label}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Social proof */}
            <motion.div variants={fadeUp} custom={6} className="flex items-center gap-3 mt-8">
              <div className="flex -space-x-2">
                {[IMAGES.person1, IMAGES.person2, IMAGES.person3].map((src, i) => (
                  <img key={i} src={src} alt="" className="w-10 h-10 rounded-full border-2 border-white/20 object-cover shadow-md" />
                ))}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] border-2 border-white/20 flex items-center justify-center text-white text-xs font-bold shadow-md">+134</div>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white/90">137명의 파트너</p>
                <p className="text-xs text-white/50">전문가와 함께 매출을 만들었습니다</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SOCIAL PROOF STATS BAR                                           */}
      {/* ================================================================ */}
      <section className="py-16 sm:py-20 px-5 sm:px-8 bg-gray-50/60 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 gap-6 sm:gap-12">
            {heroStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <stat.icon className="w-5 h-5 text-[#E31837] mr-2" />
                  <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">{stat.value}</span>
                </div>
                <span className="text-sm text-gray-500 font-medium">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TARGET AUDIENCE                                                   */}
      {/* ================================================================ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-sky-50 border-sky-200/60 text-sky-700 mb-6"><Target className="w-4 h-4" />FOR YOU</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">이런 분께 딱 맞습니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-lg mx-auto">혼자 힘들었다면, 이제 전문가와 함께 시작하세요.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
            {targetAudienceCards.map((card, i) => (
              <motion.div key={card.title} variants={fadeUp} custom={i} whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className={`relative bg-white rounded-2xl p-7 border ${card.border} shadow-sm hover:shadow-xl transition-all duration-300 group cursor-default`}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-5 shadow-lg group-hover:scale-105 transition-transform duration-300`}>
                  <card.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1.5">{card.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* NOT FOR YOU                                                       */}
      {/* ================================================================ */}
      <section className="relative py-6 sm:py-10 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}
            className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-7 sm:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-gray-400" /></div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">이런 분은 안 맞습니다</h3>
                <p className="text-sm text-gray-500">솔직하게 말씀드립니다. 신뢰가 우선이니까요.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {notForItems.map((item, i) => (
                <motion.div key={item.text} variants={fadeIn} custom={i}
                  className="flex items-start gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5"><item.icon className="w-4 h-4 text-gray-400" /></div>
                  <span className="text-sm text-gray-600 leading-relaxed">{item.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PROCESS SECTION                                                   */}
      {/* ================================================================ */}
      <section id="process" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-white via-gray-50/40 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-violet-50 border-violet-200/60 text-violet-700 mb-6"><Rocket className="w-4 h-4" />PROCESS</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">PT 진행 과정</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">체계적인 6단계로 매출이 나올 때까지 함께 합니다.</motion.p>
          </motion.div>

          <div className="relative">
            <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gray-200 via-gray-200 to-transparent -translate-x-1/2" />
            <div className="space-y-6 lg:space-y-0">
              {processSteps.map((step, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <motion.div key={step.step} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
                    variants={isLeft ? slideInLeft : slideInRight}
                    className={`relative lg:flex lg:items-center lg:gap-8 ${i > 0 ? 'lg:mt-6' : ''}`}>
                    <div className={`lg:w-1/2 ${isLeft ? 'lg:pr-12 lg:text-right' : 'lg:order-2 lg:pl-12'}`}>
                      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300">
                        <div className={`flex items-center gap-4 mb-4 ${isLeft ? 'lg:flex-row-reverse' : ''}`}>
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                            <step.icon className="w-6 h-6 text-white" />
                          </div>
                          <div className={isLeft ? 'lg:text-right' : ''}>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step {step.step}</span>
                            <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                          </div>
                        </div>
                        <p className={`text-sm font-medium text-gray-700 mb-2 ${isLeft ? 'lg:text-right' : ''}`}>{step.desc}</p>
                        <p className={`text-sm text-gray-500 leading-relaxed ${isLeft ? 'lg:text-right' : ''}`}>{step.detail}</p>
                      </div>
                    </div>
                    <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white border-2 border-gray-200 items-center justify-center shadow-sm z-10">
                      <span className={`text-xs font-extrabold bg-gradient-to-r ${step.color} bg-clip-text text-transparent`}>{step.step}</span>
                    </div>
                    <div className={`hidden lg:block lg:w-1/2 ${isLeft ? 'lg:order-2' : ''}`} />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* REVENUE MODEL                                                     */}
      {/* ================================================================ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-rose-50 border-rose-200/60 text-[#E31837] mb-6"><Calculator className="w-4 h-4" />PRICING MODEL</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">수익 모델 설명</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">잃을 게 없는 구조입니다. 숨겨진 비용 없습니다.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid md:grid-cols-3 gap-5 mb-14">
            {revenueModelItems.map((item, i) => (
              <motion.div key={item.label} variants={scaleIn} custom={i}
                className={`relative rounded-2xl p-7 sm:p-8 border transition-all duration-300 ${item.highlight ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] text-white border-transparent shadow-xl shadow-rose-200/40' : 'bg-white border-gray-100 shadow-md hover:shadow-lg'}`}>
                {item.highlight && <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${item.highlight ? 'bg-white/20' : 'bg-rose-50'}`}>
                  <item.icon className={`w-6 h-6 ${item.highlight ? 'text-white' : 'text-[#E31837]'}`} />
                </div>
                <p className={`text-sm font-medium mb-1 ${item.highlight ? 'text-rose-100' : 'text-gray-500'}`}>{item.label}</p>
                <p className={`text-3xl sm:text-4xl font-extrabold mb-3 ${item.highlight ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
                <p className={`text-sm leading-relaxed ${item.highlight ? 'text-rose-100' : 'text-gray-500'}`}>{item.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Calculator */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={scaleIn} className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-xl p-7 sm:p-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md"><Calculator className="w-5 h-5 text-white" /></div>
                <div><h3 className="text-lg font-bold text-gray-900">수익 계산기</h3><p className="text-xs text-gray-500">슬라이더로 예상 순이익을 조절해 보세요</p></div>
              </div>
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">월 예상 순이익</span>
                  <span className="text-lg font-extrabold text-gray-900">{calcProfit}만원</span>
                </div>
                <input type="range" min="50" max="1000" step="10" value={calcProfit} onChange={(e) => setCalcProfit(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 accent-[#E31837]"
                  style={{ background: `linear-gradient(to right, #E31837 ${((calcProfit - 50) / 950) * 100}%, #e5e7eb ${((calcProfit - 50) / 950) * 100}%)` }} />
                <div className="flex justify-between mt-1"><span className="text-xs text-gray-400">50만원</span><span className="text-xs text-gray-400">1,000만원</span></div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">PT사 수수료 (30%)</span>
                  <span className="text-base font-bold text-rose-500">{ptShare}만원</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-gray-700">내 순수익 (70%)</span>
                  <span className="text-2xl font-extrabold text-emerald-600">{myShare}만원</span>
                </div>
              </div>
              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm text-gray-500 leading-relaxed">
                  혼자 했으면? <span className="font-semibold text-gray-700">3개월째 매출 0원</span>일 확률 90%.<br />
                  <span className="font-semibold text-emerald-600">{myShare}만원은 전문가가 만들어준 수익</span>입니다.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CORE BENEFITS with images                                         */}
      {/* ================================================================ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-amber-50 border-amber-200/60 text-amber-700 mb-6"><Sparkles className="w-4 h-4" />BENEFITS</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">핵심 혜택</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">왜 전문가와 함께해야 하는지, 4가지 이유.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-2 gap-6">
            {benefitCards.map((card, i) => (
              <motion.div key={card.title} variants={fadeUp} custom={i} whileHover={{ y: -4, transition: { duration: 0.25 } }}
                className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="h-48 overflow-hidden">
                  <img src={card.image} alt={card.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" style={{ top: '30%' }} />
                </div>
                <div className="p-7 relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg -mt-12 mb-4 relative z-10 border-4 border-white`}>
                    <card.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* GUARANTEE SECTION                                                 */}
      {/* ================================================================ */}
      <section id="guarantee" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-[#E31837]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-[20%] w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-white/10 border-white/10 text-rose-300 mb-6"><ShieldCheck className="w-4 h-4" />GUARANTEE</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-5">
              매출이 안 나오면<br /><span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">0원입니다</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-lg max-w-xl mx-auto">약속 아닌 보장입니다. 서면으로 계약합니다.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="space-y-5">
            {guaranteeItems.map((item, i) => (
              <motion.div key={item.title} variants={fadeUp} custom={i}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10 hover:bg-white/[0.07] transition-all duration-300">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg flex-shrink-0">
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <div><h3 className="text-lg font-bold text-white mb-1.5">{item.title}</h3><p className="text-gray-400 leading-relaxed">{item.desc}</p></div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={4} className="mt-12 text-center">
            <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청하기<ArrowRight className="w-5 h-5" /></CTAButton>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIALS with photos                                          */}
      {/* ================================================================ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-violet-50 border-violet-200/60 text-violet-700 mb-6"><Star className="w-4 h-4" />SUCCESS STORIES</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">성공 사례</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg">숫자 뒤에 숨겨진 <span className="font-semibold text-gray-700">진짜 이야기</span></motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="space-y-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} variants={fadeUp} custom={i}
                className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="flex flex-col lg:flex-row">
                  <div className="p-7 sm:p-8 flex-1">
                    <div className="flex items-center gap-4 mb-6">
                      <img src={t.avatar} alt={t.name} className="w-14 h-14 rounded-full object-cover shadow-lg border-2 border-white" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${t.gradient} text-white`}>{t.category}</span>
                      </div>
                    </div>
                    <div className="relative pl-5 border-l-[3px] border-[#E31837]/20 mb-6">
                      <Quote className="absolute -left-2.5 -top-1 w-5 h-5 text-[#E31837]/30" />
                      <p className="text-gray-600 leading-relaxed text-[15px] italic">{t.quote}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100"><p className="text-xs text-gray-500 mb-0.5">Before</p><p className="text-sm font-bold text-gray-700">{t.before}</p></div>
                      <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                      <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100"><p className="text-xs text-emerald-600 mb-0.5">After ({t.period})</p><p className="text-sm font-bold text-emerald-700">{t.after}</p></div>
                    </div>
                  </div>
                  <div className={`lg:w-56 p-7 bg-gradient-to-br ${t.gradient} flex flex-col justify-center items-center text-center text-white relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <TrendingUp className="w-8 h-8 mb-3 opacity-80" />
                    <p className="text-sm font-medium text-white/80 mb-1">{t.period} 후 매출</p>
                    <p className="text-3xl font-extrabold relative">{t.after}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* INLINE CTA BANNER with image                                      */}
      {/* ================================================================ */}
      <section className="py-6 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="relative bg-gradient-to-r from-rose-50 via-white to-rose-50 rounded-2xl p-6 sm:p-8 border border-rose-100 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-sm overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-48 hidden sm:block">
              <img src={IMAGES.growth} alt="" className="w-full h-full object-cover opacity-10" />
            </div>
            <div className="relative">
              <p className="text-lg font-bold text-gray-900">94%가 성공한 방법, 확인해 보세요</p>
              <p className="text-sm text-gray-500 mt-1">상담은 무료입니다. 부담 없이 시작하세요.</p>
            </div>
            <CTAButton href={CTA_URL} size="md" className="whitespace-nowrap relative"><Phone className="w-4 h-4" />무료 상담 신청<ArrowRight className="w-4 h-4" /></CTAButton>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FAQ SECTION                                                       */}
      {/* ================================================================ */}
      <section id="faq" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-3xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-12">
            <SectionBadge className="bg-sky-50 border-sky-200/60 text-sky-700 mb-6"><HelpCircle className="w-4 h-4" />FAQ</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">자주 묻는 질문</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg">궁금한 점이 더 있으시면 상담에서 편하게 물어보세요.</motion.p>
          </motion.div>
          <div className="space-y-3">
            {faqData.map((item, i) => (
              <FAQAccordionItem key={i} item={item} index={i} openIndex={openFAQ} setOpenIndex={setOpenFAQ} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA                                                         */}
      {/* ================================================================ */}
      <section className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] bg-[#E31837]/10 rounded-full blur-[140px]" />
          <img src={IMAGES.warehouse} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.03]" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
              당신의 쿠팡 매출,<br /><span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">전문가가 함께 만듭니다</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-lg mb-4 max-w-lg mx-auto leading-relaxed">
              더 이상 혼자 고민하지 마세요.<br />상담은 무료이고, 매출이 없으면 비용도 0원입니다.
            </motion.p>
            <motion.p variants={fadeUp} custom={2} className="text-white font-medium text-base mb-10">지금 신청하시면 48시간 내 전문가가 연락드립니다.</motion.p>
            <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청하기<ArrowRight className="w-5 h-5" /></CTAButton>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {['초기비용 0원', '최소계약 없음', '94% 성공률', '투명 정산'].map((text) => (
                <div key={text} className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-sm text-gray-400">{text}</span></div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER                                                            */}
      {/* ================================================================ */}
      <footer className="py-12 sm:py-16 px-5 sm:px-8 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">S</span></div>
              <span className="font-bold text-gray-900">쿠팡 셀러허브</span>
            </Link>
            <nav className="flex items-center gap-6">
              {navLinks.map((link) => (<a key={link.href} href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{link.label}</a>))}
            </nav>
            <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} 쿠팡 셀러허브</p>
          </div>
        </div>
      </footer>

      {/* ================================================================ */}
      {/* FLOATING MOBILE CTA                                               */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-2xl shadow-gray-900/10 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#E31837] truncate">초기비용 0원 &middot; 94% 성공률</p>
            <p className="text-sm font-bold text-gray-900 truncate">전문가와 함께 매출 만들기</p>
          </div>
          <motion.a href={CTA_URL} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.95 }}
            className="flex-shrink-0 px-5 py-3 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-sm shadow-lg shadow-rose-200/50">
            무료 상담
          </motion.a>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </main>
  );
}
