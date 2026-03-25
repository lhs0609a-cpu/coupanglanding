'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowDown, ArrowRight, AlertTriangle, BookOpen, Calculator,
  Check, ChevronRight, DollarSign,
  FileText, Home, Menu, Minus, Package, Plus, Search,
  ShoppingCart, Star, TrendingUp,
  Truck, Users, X, Zap,
} from 'lucide-react';
import SharedFooter from '@/components/sections/Footer';

// ============================================================================
// ANIMATION VARIANTS (PT-style with custom index delays)
// ============================================================================
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

const slideInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const slideInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

// ============================================================================
// HOOKS & HELPERS
// ============================================================================
function useScrollY() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  return scrollY;
}

function useCountUp(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
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

function AnimatedSection({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.section ref={ref} id={id} className={className} initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger}>
      {children}
    </motion.section>
  );
}

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 border border-rose-200/60 text-sm font-semibold text-[#E31837] mb-4">
      {children}
    </motion.div>
  );
}

function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-gray-50 to-gray-50/80 border-b border-gray-100">
      <div className="flex gap-1.5">
        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex-1 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-gray-100 text-[11px] text-gray-400 font-medium">
          <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-[#E31837] to-[#ff4d6a]" />
          {title}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DATA
// ============================================================================
const navLinks = [
  { label: '위탁판매란?', href: '#what' },
  { label: '마진 계산기', href: '#calculator' },
  { label: '시작 방법', href: '#steps' },
  { label: 'FAQ', href: '#faq' },
];

const faqData = [
  {
    q: '위탁판매는 불법 아닌가요?',
    a: '위탁판매는 100% 합법적인 사업 모델입니다. 쿠팡, 네이버 등 모든 오픈마켓이 공식적으로 허용하고 있는 판매 방식이에요. 다만, 시작 전에 사업자등록(홈택스에서 무료)과 통신판매업 신고(구청에서 무료)를 꼭 해야 합니다. 이 두 가지만 완료하면 떳떳하게 사업을 운영할 수 있습니다.',
  },
  {
    q: '초기 투자금이 많이 필요하지 않나요?',
    a: '사실상 0원입니다. 사업자등록(무료), 쿠팡 윙 가입(무료), 상품 등록(무료)이라 돈이 들지 않아요. 핵심은 "고객이 주문한 후에 도매처에 결제"하는 구조라서, 재고를 미리 사놓을 필요가 없다는 점입니다. 결제 시점이 주문 이후이기 때문에 물건이 안 팔려서 손해보는 일이 없습니다.',
  },
  {
    q: '누구나 할 수 있나요?',
    a: '인터넷 검색과 간단한 문서 작업이 가능한 분이라면 충분합니다. 특별한 기술이나 자격증이 필요하지 않아요. 다만 "쉽게 시작할 수 있다"와 "쉽게 수익을 낼 수 있다"는 다릅니다. 좋은 상품을 찾는 눈과 고객 응대에 대한 성실함이 꾸준한 수익의 핵심입니다.',
  },
  {
    q: '경쟁이 너무 심하지 않나요?',
    a: '인기 카테고리(예: 휴대폰 케이스)는 경쟁이 치열하지만, 쿠팡에는 수천 개의 카테고리가 있습니다. 시즌 상품(여름 선풍기, 겨울 핫팩), 전문 분야 용품, 세트 구성 등 아직 경쟁이 적은 틈새시장이 많습니다. 남들이 안 보는 곳에서 기회를 찾는 것이 핵심 전략입니다.',
  },
  {
    q: '정말 돈이 되나요?',
    a: '솔직하게 말씀드리면, 노력에 비례합니다. 등록한 상품이 많을수록, 좋은 상품을 고를수록 수익이 올라갑니다. 꾸준히 하시는 분들은 월 50~100만원 수준의 부수입을, 전업으로 집중하시는 분들은 월 300만원 이상을 만들기도 합니다. 어떤 사업이든 "자동으로 돈이 들어온다"는 건 없고, 꾸준함이 핵심입니다.',
  },
  {
    q: '본업이 있어도 가능한가요?',
    a: '네, 실제로 직장인 부업으로 시작하시는 분이 가장 많습니다. 퇴근 후 하루 1~2시간이면 상품 등록, 주문 처리, 고객 문의 응대가 가능합니다. 주문이 들어오면 도매처에 발주만 넣으면 되니, 출근 중에도 스마트폰으로 처리할 수 있어요.',
  },
];

const warningCards = [
  { title: '마진 계산은 꼼꼼하게', desc: '판매가에서 원가만 빼면 안 됩니다. 쿠팡 수수료(약 10%), 배송비, 예상 반품비까지 모두 계산해야 실제 수익이 나옵니다.', tip: '위의 마진 계산기로 미리 확인하세요.' },
  { title: '고객 응대는 내 몫', desc: '도매처가 배송하지만, 고객이 문의하면 응답하는 건 판매자입니다. 배송 지연이나 불량이 생기면 도매처와 고객 사이에서 중재해야 합니다.', tip: '빠른 응답이 좋은 리뷰로 이어집니다.' },
  { title: '브랜드 상품은 확인 필수', desc: '나이키, 삼성 등 브랜드 상품은 정식 유통 계약 없이 판매하면 지재권 침해로 계정 정지 + 법적 문제가 생길 수 있습니다.', tip: '브랜드가 없는 일반 생활용품부터 시작하세요.' },
  { title: '최저가 경쟁은 피하기', desc: '같은 상품을 파는 사람이 많으면 가격을 계속 낮추게 되는데, 이러면 결국 마진이 0원이 됩니다.', tip: '세트 구성, 상세페이지 품질 등으로 차별화하세요.' },
  { title: '계정 건강 관리', desc: '배송이 자주 늦거나 고객 문의를 무시하면 쿠팡에서 페널티를 부여합니다. 누적되면 판매 제한이 걸릴 수 있어요.', tip: '주문 알림을 켜고, 당일 발주를 습관화하세요.' },
];

const glossaryTerms = [
  { term: '위탁판매', def: '재고를 직접 보유하지 않고, 도매처의 상품을 쿠팡에 등록해서 판매하는 합법적인 사업 모델입니다.' },
  { term: '도매처', def: '상품을 저렴한 가격에 공급해주는 곳. 대표적으로 오너클랜, 도매꾹 등이 있습니다.' },
  { term: '마진', def: '내 순수익 = 쿠팡 판매가 - 도매 원가 - 쿠팡 수수료. 마진율은 (마진 ÷ 판매가) × 100%입니다.' },
  { term: '수수료율', def: '쿠팡이 판매 금액에서 가져가는 비율. 카테고리마다 다르며 평균 약 10.8%입니다.' },
  { term: '위닝 상품', def: '수요가 있고, 경쟁이 적고, 마진이 남는 좋은 상품. 이걸 잘 찾는 게 수익의 핵심입니다.' },
  { term: '로켓그로스', def: '쿠팡 물류센터에 상품을 직접 입고하는 방식. 위탁판매와는 다른 방식이니 혼동하지 마세요.' },
  { term: '마켓플레이스', def: '판매자가 직접 배송하는 쿠팡의 일반 판매 방식. 위탁판매는 이 방식을 사용합니다.' },
  { term: '발주', def: '고객 주문이 들어온 후, 도매처에 해당 상품을 주문하는 것. 고객 주소로 직접 배송을 요청합니다.' },
  { term: 'CS (고객 서비스)', def: '고객이 문의하거나 반품/교환을 요청할 때 응대하는 것. 판매자의 중요한 역할입니다.' },
  { term: '패널티', def: '배송 지연, 고객 응대 미흡 등이 반복되면 쿠팡이 부여하는 벌점. 누적 시 판매 제한될 수 있습니다.' },
  { term: '윙 (Wing)', def: 'wing.coupang.com — 쿠팡 판매자 전용 관리 사이트. 상품 등록, 주문 확인, 정산 등을 합니다.' },
  { term: '상품등록', def: '도매처 상품의 이미지, 설명, 가격을 쿠팡에 올리는 작업. 한 번 등록하면 고객이 검색해서 주문할 수 있어요.' },
];

const presets = [
  { label: '생활용품', cost: 3000, price: 8900 },
  { label: '주방용품', cost: 8000, price: 19900 },
  { label: '패션잡화', cost: 5000, price: 14900 },
];

// ============================================================================
// HEADER
// ============================================================================
function Header() {
  const scrollY = useScrollY();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isScrolled = scrollY > 20;

  useEffect(() => {
    const h = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-gray-100/50' : 'bg-transparent'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-red-200/50">
                <BookOpen className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
              </div>
              <span className={`text-lg font-bold transition-colors ${isScrolled ? 'text-gray-900' : 'text-white'}`}>
                왕초보 가이드
              </span>
            </a>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((item) => (
                <a key={item.href} href={item.href}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${isScrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <Link href="/pt" className={`px-4 py-2 text-sm font-medium transition-colors ${isScrolled ? 'text-gray-700 hover:text-gray-900' : 'text-white/80 hover:text-white'}`}>
                1:1 PT
              </Link>
              <Link href="/program" className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-[#E31837] hover:bg-[#c81530] shadow-lg shadow-red-200/40 transition-all hover:-translate-y-0.5">
                자동화 프로그램
              </Link>
            </div>
            <button
              type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden p-2 rounded-lg ${isScrolled ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`} aria-label="메뉴"
            >
              {mobileMenuOpen
                ? <X className={`w-5 h-5 ${isScrolled ? 'text-gray-700' : 'text-white'}`} />
                : <Menu className={`w-5 h-5 ${isScrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>
      </motion.header>
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="fixed inset-x-0 top-16 z-50 bg-white/98 backdrop-blur-xl border-b border-gray-200 shadow-2xl md:hidden">
              <nav className="max-w-7xl mx-auto px-4 py-5 flex flex-col gap-1">
                {navLinks.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl">{item.label}</a>
                ))}
                <div className="border-t border-gray-100 mt-3 pt-4 flex flex-col gap-2">
                  <Link href="/pt" onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-xl text-center">1:1 PT 프로그램</Link>
                  <Link href="/program" onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3.5 text-base font-semibold text-white bg-[#E31837] rounded-xl text-center shadow-lg">자동화 프로그램</Link>
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
// SECTION 1: HERO — Premium Dark
// ============================================================================
function HeroSection() {
  const stat1 = useCountUp(0, 1500);
  const stat2 = useCountUp(0, 1500);
  const stat3 = useCountUp(5, 1500);

  return (
    <section className="relative min-h-[90vh] sm:min-h-screen flex items-center overflow-hidden pt-16 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Background: dual radial glows + dot grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[5%] w-[700px] h-[700px] bg-[#E31837]/8 rounded-full blur-[180px]" />
        <div className="absolute bottom-[5%] right-[10%] w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:32px_32px]" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 w-full z-10 text-center">
        {/* Glass badge with pulse dot */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E31837] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E31837]" />
          </span>
          <span className="text-sm font-medium text-white/90">쿠팡 위탁판매 왕초보 가이드</span>
        </motion.div>

        {/* Headline */}
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.12] tracking-tight text-white mb-6"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.3)' }}>
          재고 0개, 사무실 0평, 투자금 0원 —<br />
          <span className="bg-gradient-to-r from-[#ff6b81] to-[#ffb3c1] bg-clip-text text-transparent">
            쿠팡에서 매달 수익 만드는 법
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="text-lg sm:text-xl text-white/50 leading-relaxed mb-12 max-w-2xl mx-auto">
          위탁판매가 뭔지, 어떻게 시작하는지 처음부터 끝까지 알려드립니다
        </motion.p>

        {/* 3 Glass stat cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="grid grid-cols-3 gap-3 sm:gap-4 max-w-lg mx-auto mb-12">
          {[
            { icon: <DollarSign className="w-5 h-5" />, label: '초기투자', value: '0', suffix: '원', ref: stat1.ref },
            { icon: <Package className="w-5 h-5" />, label: '필요 재고', value: '0', suffix: '개', ref: stat2.ref },
            { icon: <Home className="w-5 h-5" />, label: '읽기 시간', value: String(stat3.count), suffix: '분', ref: stat3.ref },
          ].map((stat, i) => (
            <motion.div key={i} whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.98 }}
              className="relative border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-5 text-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />
              <div className="relative">
                <div className="text-[#ff6b81] mb-2 flex justify-center">{stat.icon}</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">
                  <span ref={stat.ref}>{stat.value}</span>{stat.suffix}
                </div>
                <div className="text-xs text-white/40 mt-1">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Scroll arrow */}
        <motion.a
          href="#what"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="inline-flex flex-col items-center gap-2 text-white/30 hover:text-white/60 transition-colors"
        >
          <span className="text-sm">아래로 스크롤</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
            <ArrowDown className="w-5 h-5" />
          </motion.div>
        </motion.a>

        {/* Trust bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/30">
          {['5분 읽기', '초보자도 쉽게 이해', '100% 무료 콘텐츠'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#ff6b81]/60" />
              {t}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================================
// SECTION 2: What is Dropshipping — Editorial Style
// ============================================================================
function WhatSection() {
  const analogies = [
    { icon: <ShoppingCart className="w-6 h-6" />, text: '편의점도 직접 물건을 만들지 않지만 합법적으로 판매하죠? 도매처에서 공급받아 판매하는 것과 같은 구조입니다.', color: 'from-blue-500 to-blue-600' },
    { icon: <Home className="w-6 h-6" />, text: '부동산 중개인이 집을 소유하지 않아도 매매를 연결해주듯이, 위탁판매자는 도매처와 고객 사이를 연결합니다.', color: 'from-emerald-500 to-emerald-600' },
    { icon: <Package className="w-6 h-6" />, text: '도매처가 상품과 배송을 담당하고, 나는 쿠팡에서 상품 등록과 고객 응대를 담당합니다. 각자의 역할이 나뉘어 있는 정식 사업 모델이에요.', color: 'from-[#E31837] to-[#ff4d6a]' },
  ];

  return (
    <AnimatedSection id="what" className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>30초 요약</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            위탁판매란?
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto">
            어렵게 생각하지 마세요. 일상의 비유로 쉽게 이해할 수 있습니다.
          </motion.p>
        </div>

        {/* Editorial cards with big numbers */}
        <div className="max-w-3xl mx-auto space-y-5 mb-14">
          {analogies.map((item, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
              whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }}
              className="group relative bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 shadow-sm hover:shadow-xl hover:shadow-rose-100/30 transition-all duration-300 ring-1 ring-transparent hover:ring-gray-200/60">
              <div className="flex items-start gap-5 sm:gap-6">
                {/* Big number */}
                <div className="shrink-0">
                  <span className="text-4xl sm:text-5xl font-extrabold text-gray-100 group-hover:text-rose-100 transition-colors">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                {/* Content */}
                <div className="flex-1 pt-1">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white mb-3 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {item.icon}
                  </div>
                  <p className="text-gray-700 leading-relaxed font-medium text-base sm:text-lg">{item.text}</p>
                </div>
              </div>
              {/* Gradient connector between cards */}
              {i < analogies.length - 1 && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-px h-6 bg-gradient-to-b from-gray-200 to-transparent" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Key quote with accent border */}
        <motion.div variants={scaleIn} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          className="max-w-2xl mx-auto">
          <div className="relative bg-gradient-to-r from-rose-50/80 to-orange-50/60 rounded-2xl border border-rose-100/80 p-8 sm:p-10">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b from-[#E31837] to-[#ff4d6a]" />
            <span className="text-5xl sm:text-6xl font-serif text-[#E31837]/20 leading-none absolute top-4 left-6">&ldquo;</span>
            <p className="relative text-2xl sm:text-3xl font-bold text-gray-900 leading-snug pl-4">
              도매처 상품을 쿠팡에 등록하고,{' '}
              <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
                판매가와 도매가의 차이가 내 수익
              </span>
            </p>
            <p className="relative text-sm text-gray-500 mt-3 pl-4">
              도매처는 판매 채널을 얻고, 나는 수익을 얻는 — 서로 윈윈하는 구조입니다.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 3: Flow Chart — Interactive Visualization
// ============================================================================
function FlowSection() {
  const steps = [
    { icon: <Search className="w-7 h-7" />, title: '상품 등록', desc: '도매 사이트(오너클랜 등)에서 마진이 남는 상품을 골라 쿠팡에 등록합니다', color: 'from-blue-500 to-blue-600' },
    { icon: <ShoppingCart className="w-7 h-7" />, title: '고객 주문', desc: '쿠팡에서 고객이 내가 등록한 상품을 구매합니다 (이 시점까지 내 돈이 나가는 건 없어요)', color: 'from-emerald-500 to-emerald-600' },
    { icon: <Truck className="w-7 h-7" />, title: '도매처에 발주', desc: '고객의 배송지를 입력해서 도매처에 주문합니다. 도매처가 고객에게 직접 배송해줍니다', color: 'from-amber-500 to-amber-600' },
    { icon: <DollarSign className="w-7 h-7" />, title: '수익 정산', desc: '쿠팡 판매가 - 도매 원가 - 쿠팡 수수료 = 내 순수익. 쿠팡이 정산일에 입금해줍니다', color: 'from-[#E31837] to-[#ff4d6a]' },
  ];

  return (
    <AnimatedSection id="flow" className="py-24 md:py-32 bg-gray-50/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>인터랙티브 플로우</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            어떻게 돌아가는 거야?
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            4단계로 이해하는 위탁판매 프로세스
          </motion.p>
        </div>

        {/* Desktop: horizontal connected flow */}
        <div className="hidden md:block mb-14">
          <div className="relative max-w-4xl mx-auto">
            {/* Gradient connection line */}
            <div className="absolute top-10 left-[12%] right-[12%] h-[2px] bg-gradient-to-r from-blue-300 via-emerald-300 via-amber-300 to-[#ff6b81] rounded-full" />
            <div className="grid grid-cols-4 gap-0 relative">
              {steps.map((step, i) => (
                <motion.div key={i} variants={fadeUp} custom={i}
                  initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                  className="relative flex flex-col items-center text-center px-3">
                  <motion.div
                    whileHover={{ scale: 1.08, y: -4 }}
                    className={`relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white mb-5 shadow-xl`}>
                    {step.icon}
                    {/* Number badge */}
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shadow-md">
                      {i + 1}
                    </div>
                  </motion.div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden space-y-0 mb-14 relative">
          {/* Gradient timeline line */}
          <div className="absolute left-6 top-6 bottom-6 w-[2px] bg-gradient-to-b from-blue-400 via-emerald-400 via-amber-400 to-[#E31837] rounded-full" />
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
              className="relative flex items-start gap-5 py-4">
              <div className={`relative z-10 shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg`}>
                <span className="text-sm font-bold">{i + 1}</span>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <h3 className="text-base font-bold text-gray-900 mb-0.5">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Money flow — WindowChrome */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xl overflow-hidden">
            <WindowChrome title="돈의 흐름 — 시각화" />
            <div className="p-6 bg-gradient-to-r from-emerald-50/60 to-blue-50/60">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-700 font-semibold shadow-sm">고객</span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <span className="px-3.5 py-2 rounded-xl bg-blue-100 text-blue-700 font-semibold shadow-sm">쿠팡</span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <span className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-100 to-red-100 text-[#E31837] font-bold shadow-sm ring-1 ring-[#E31837]/10">나</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-gray-200" />
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <span className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-100 to-red-100 text-[#E31837] font-bold shadow-sm ring-1 ring-[#E31837]/10">나</span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <span className="px-3.5 py-2 rounded-xl bg-amber-100 text-amber-700 font-semibold shadow-sm">도매처</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 4: Comparison — Before/After Dramatic
// ============================================================================
function ComparisonSection() {
  const regularBiz = [
    { label: '초기 자본', value: '300만 ~ 1,000만원' },
    { label: '창고/재고', value: '보관 공간 필요' },
    { label: '포장/배송', value: '직접 처리' },
    { label: '남은 재고', value: '손실 발생' },
    { label: '리스크', value: '높음' },
  ];
  const dropshipping = [
    { label: '초기 자본', value: '0원 (주문 후 결제 구조)' },
    { label: '창고/재고', value: '필요 없음 — 도매처 재고 활용' },
    { label: '포장/배송', value: '도매처가 고객에게 직접 배송' },
    { label: '안 팔리면', value: '쿠팡에서 상품 내리면 끝 (손해 없음)' },
    { label: '리스크', value: '매우 낮음' },
  ];

  return (
    <AnimatedSection className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>비교</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            일반 사업 vs 위탁판매
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            왜 위탁판매가 초보자에게 최적인지 한눈에 비교하세요
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {/* Regular business — slide from left */}
          <motion.div variants={slideInLeft} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
            className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-100/80 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-500 flex items-center gap-2">
                <X className="w-5 h-5 text-gray-400" />
                일반 창업
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {regularBiz.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <X className="w-3 h-3 text-red-400" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-400">{item.label}</span>
                    <p className="text-sm text-gray-500 line-through">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Dropshipping — slide from right with premium border */}
          <motion.div variants={slideInRight} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
            className="relative bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-200 overflow-hidden ring-1 ring-emerald-200/50 shadow-xl shadow-emerald-100/40">
            {/* Recommend badge */}
            <div className="absolute top-4 right-4 z-10">
              <span className="px-3 py-1 text-xs font-bold text-white bg-[#E31837] rounded-full shadow-lg shadow-rose-200/50">
                추천
              </span>
            </div>
            <div className="px-6 py-4 bg-emerald-50/80 border-b border-emerald-200">
              <h3 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-600" />
                위탁판매
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {dropshipping.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-700" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-emerald-600">{item.label}</span>
                    <p className="text-sm text-emerald-900 font-medium">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 5: Margin Calculator — WindowChrome + Premium UI
// ============================================================================
function CalculatorSection() {
  const [cost, setCost] = useState(3000);
  const [price, setPrice] = useState(8900);
  const [feeRate, setFeeRate] = useState(10.8);
  const [dailySales, setDailySales] = useState(5);
  const [activePreset, setActivePreset] = useState(0);

  const fee = Math.round(price * feeRate / 100);
  const margin = price - cost - fee;
  const marginRate = price > 0 ? ((margin / price) * 100).toFixed(1) : '0';
  const monthlyRevenue = margin * dailySales * 30;

  const applyPreset = (p: typeof presets[0], idx: number) => {
    setCost(p.cost);
    setPrice(p.price);
    setActivePreset(idx);
  };

  const sliderTrackStyle = (value: number, min: number, max: number) => {
    const pct = ((value - min) / (max - min)) * 100;
    return {
      background: `linear-gradient(to right, #E31837 0%, #ff4d6a ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
    };
  };

  return (
    <AnimatedSection id="calculator" className="py-24 md:py-32 bg-gray-50/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>마진 계산기</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            얼마나 벌 수 있을까?
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            직접 숫자를 넣어보세요. 실시간으로 예상 수익이 계산됩니다.
          </motion.p>
        </div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mx-auto">
          {/* Preset pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {presets.map((p, idx) => (
              <button key={p.label} onClick={() => applyPreset(p, idx)}
                className={`px-5 py-2.5 text-sm font-semibold rounded-full border transition-all duration-300 ${activePreset === idx
                  ? 'bg-[#E31837] text-white border-[#E31837] shadow-lg shadow-rose-200/50'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-md'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Calculator card with WindowChrome */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-rose-100/40 via-rose-100/20 to-rose-100/40 rounded-[28px] blur-2xl" />
            <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
              <WindowChrome title="마진 계산기 — 실시간 시뮬레이션" />

              <div className="p-6 md:p-8 space-y-6">
                {/* Cost */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    상품 원가 <span className="text-gray-400 font-normal">(도매처 가격)</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="range" min={500} max={50000} step={100} value={cost}
                      onChange={(e) => setCost(Number(e.target.value))}
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#E31837] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-200/50 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                      style={sliderTrackStyle(cost, 500, 50000)} />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))}
                        className="w-24 px-3 py-2 text-right text-sm font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] outline-none" />
                      <span className="text-sm text-gray-400">원</span>
                    </div>
                  </div>
                </div>
                {/* Price */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    판매가 <span className="text-gray-400 font-normal">(쿠팡 판매 가격)</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="range" min={1000} max={100000} step={100} value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#E31837] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-200/50 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                      style={sliderTrackStyle(price, 1000, 100000)} />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
                        className="w-24 px-3 py-2 text-right text-sm font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] outline-none" />
                      <span className="text-sm text-gray-400">원</span>
                    </div>
                  </div>
                </div>
                {/* Fee */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    쿠팡 수수료율 <span className="text-gray-400 font-normal">(카테고리별 상이)</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="range" min={5} max={20} step={0.1} value={feeRate}
                      onChange={(e) => setFeeRate(Number(e.target.value))}
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#E31837] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-200/50 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                      style={sliderTrackStyle(feeRate, 5, 20)} />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" value={feeRate} step={0.1} onChange={(e) => setFeeRate(Number(e.target.value))}
                        className="w-20 px-3 py-2 text-right text-sm font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] outline-none" />
                      <span className="text-sm text-gray-400">%</span>
                    </div>
                  </div>
                </div>
                {/* Daily sales */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    하루 예상 판매량
                  </label>
                  <div className="flex items-center gap-4">
                    <input type="range" min={1} max={50} step={1} value={dailySales}
                      onChange={(e) => setDailySales(Number(e.target.value))}
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#E31837] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-rose-200/50 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                      style={sliderTrackStyle(dailySales, 1, 50)} />
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" value={dailySales} onChange={(e) => setDailySales(Number(e.target.value))}
                        className="w-20 px-3 py-2 text-right text-sm font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] outline-none" />
                      <span className="text-sm text-gray-400">개</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results — dark contrast area */}
              <div className="bg-gray-900 p-6 md:p-8">
                {/* 3 result badges */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: '건당 마진', value: `${margin.toLocaleString()}원`, positive: margin >= 0 },
                    { label: '마진율', value: `${marginRate}%`, positive: margin >= 0 },
                    { label: '쿠팡 수수료', value: `${fee.toLocaleString()}원`, positive: true },
                  ].map((item, i) => (
                    <div key={i} className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
                      <p className="text-xs font-medium text-white/40 mb-1">{item.label}</p>
                      <p className={`text-lg font-bold ${item.positive ? (i < 2 ? 'text-emerald-400' : 'text-white/70') : 'text-red-400'}`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Monthly revenue highlight */}
                {margin > 0 && (
                  <motion.div
                    key={monthlyRevenue}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="text-center bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-4"
                  >
                    <p className="text-sm text-white/50 mb-2">
                      하루 {dailySales}개 × 30일 = 월 예상 수익
                    </p>
                    <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#ff6b81] to-[#ffb3c1] bg-clip-text text-transparent">
                      {Math.round(monthlyRevenue / 10000).toLocaleString()}만원
                    </p>
                  </motion.div>
                )}

                <p className="text-xs text-white/20 text-center">
                  * 위 계산은 참고용 단순 시뮬레이션입니다. 실제 수익은 카테고리별 수수료율, 배송비(보통 도매가에 포함), 반품 발생률 등에 따라 달라질 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 6: 5 Steps — Interactive Timeline
// ============================================================================
function StepsSection() {
  const steps = [
    { title: '사업자등록 + 쿠팡 윙 가입', desc: '홈택스(hometax.go.kr)에서 사업자등록 신청(무료, 당일~2일 발급) → 구청에서 통신판매업 신고 → wing.coupang.com에서 판매자 가입. 모두 온라인으로 가능합니다.', time: '10분', icon: <FileText className="w-5 h-5" /> },
    { title: '도매 사이트에서 상품 찾기', desc: '오너클랜(onerclean.com), 도매꾹(domeggook.com) 같은 도매 사이트에서 상품을 검색합니다. "쿠팡에서 얼마에 팔 수 있는지"를 기준으로 마진이 남는 상품을 골라보세요.', time: '1시간~', icon: <Search className="w-5 h-5" /> },
    { title: '마진 계산 후 쿠팡에 등록', desc: '판매가에서 도매가 + 쿠팡 수수료(약 10%) + 배송비를 빼고 남는 금액이 있으면 쿠팡에 등록합니다. 도매 사이트의 상품 이미지와 설명을 활용할 수 있어요.', time: '30분~', icon: <Calculator className="w-5 h-5" /> },
    { title: '주문이 들어오면 도매처에 발주', desc: '고객이 쿠팡에서 주문하면 알림이 옵니다. 도매 사이트에서 같은 상품을 주문하되, 배송지를 고객의 주소로 입력합니다. 그러면 도매처가 고객에게 직접 보내줍니다.', time: '실시간', icon: <Truck className="w-5 h-5" /> },
    { title: '배송 완료 → 정산일에 수익 입금', desc: '도매처가 발송하면 운송장 번호를 쿠팡에 입력합니다. 배송이 완료되면 쿠팡이 정산일(보통 다음 달)에 판매 대금을 입금해줍니다. 도매가를 제외한 차액이 내 수익이에요.', time: '자동', icon: <DollarSign className="w-5 h-5" /> },
  ];

  return (
    <AnimatedSection id="steps" className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>5단계 시작하기</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            실제로 뭘 하면 되나요?
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            이 순서대로만 따라하면 누구나 시작할 수 있습니다
          </motion.p>
        </div>

        <div className="max-w-2xl mx-auto">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            return (
              <motion.div key={i} variants={fadeUp} custom={i}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
                className="relative flex gap-6 pb-8 last:pb-0"
              >
                {/* Timeline line */}
                {!isLast && (
                  <div className="absolute left-[27px] top-16 bottom-0 w-[2px] bg-gradient-to-b from-[#E31837] to-[#ff4d6a]/30" />
                )}
                {/* Number badge */}
                <div className="relative shrink-0">
                  <motion.div whileHover={{ scale: 1.1 }}
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-rose-200/50 ${isLast
                      ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] ring-4 ring-rose-100'
                      : 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a]'}`}>
                    {i + 1}
                  </motion.div>
                </div>
                {/* Content card */}
                <motion.div whileHover={{ y: -2, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)' }}
                  className={`flex-1 rounded-2xl border p-5 sm:p-6 transition-all duration-300 ${isLast
                    ? 'bg-gradient-to-br from-rose-50 to-orange-50/60 border-rose-200/60 shadow-md'
                    : 'bg-white border-gray-100 shadow-sm hover:border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                      <span className="text-[#E31837]">{step.icon}</span>
                      {step.title}
                    </h3>
                    <span className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full ${isLast
                      ? 'bg-[#E31837] text-white shadow-md shadow-rose-200/50'
                      : 'bg-rose-50 text-[#E31837] border border-rose-200/60'}`}>
                      {step.time}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                  {isLast && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E31837]/10 text-[#E31837] text-xs font-bold">
                      <DollarSign className="w-3.5 h-3.5" />
                      판매가 - 도매가 - 수수료 = 순수익
                    </div>
                  )}
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 7: FAQ — PT-style Accordion
// ============================================================================
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <AnimatedSection id="faq" className="py-24 md:py-32 bg-gray-50/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>FAQ</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            흔한 오해와 진실
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            처음 시작하는 분들이 가장 많이 하는 질문
          </motion.p>
        </div>

        <div className="max-w-2xl mx-auto space-y-3">
          {faqData.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div key={i} variants={fadeUp} custom={i}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
                className={`rounded-2xl border transition-all duration-300 ${isOpen
                  ? 'border-rose-200 bg-white shadow-lg shadow-rose-100/40'
                  : 'border-gray-100 bg-white/80 shadow-sm hover:shadow-md'}`}
              >
                <button type="button" onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md transition-colors ${isOpen ? 'bg-[#E31837]/10 text-[#E31837]' : 'bg-gray-100 text-gray-400'}`}>
                      Q{i + 1}
                    </span>
                    <span className={`text-base font-semibold leading-snug transition-colors ${isOpen ? 'text-[#E31837]' : 'text-gray-900'}`}>
                      {item.q}
                    </span>
                  </div>
                  <span className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${isOpen
                    ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] shadow-md shadow-rose-200/50'
                    : 'bg-gray-100'}`}>
                    {isOpen
                      ? <Minus className="w-4 h-4 text-white" />
                      : <Plus className="w-4 h-4 text-gray-500" />}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6">
                        <div className="pt-2 border-t border-gray-100">
                          <p className="pt-4 text-gray-600 leading-relaxed text-[15px]">{item.a}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 8: Warnings — Dark Premium Cards
// ============================================================================
function WarningsSection() {
  return (
    <AnimatedSection className="py-24 md:py-32 bg-gray-950 relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[30%] right-[10%] w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:24px_24px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="text-center mb-16">
          <motion.div variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold mb-4">
            <AlertTriangle className="w-4 h-4" />
            주의사항
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-5">
            이것만은 꼭 기억하세요
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed">
            미리 알고 시작하면 피할 수 있는 5가지 실수
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {warningCards.map((card, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:border-white/20">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4">
                <span className="text-sm font-bold text-amber-400">{i + 1}</span>
              </div>
              <h3 className="text-base font-bold text-white mb-2">{card.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{card.desc}</p>
              {card.tip && (
                <p className="mt-3 text-xs text-amber-400/80 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">💡</span>
                  <span>{card.tip}</span>
                </p>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 9: Glossary — Card Grid with Accent Bars
// ============================================================================
function GlossarySection() {
  return (
    <AnimatedSection className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <SectionBadge>용어 사전</SectionBadge>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 mb-5">
            이 용어만 알면 준비 완료
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-gray-500 leading-relaxed mb-3">
            위탁판매에서 자주 쓰이는 핵심 용어
          </motion.p>
          <motion.div variants={fadeUp} custom={2}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-100 text-gray-600 text-sm font-medium">
            <BookOpen className="w-4 h-4" />
            {glossaryTerms.length}개 핵심 용어를 마스터하세요
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {glossaryTerms.map((item, i) => (
            <motion.div key={i} variants={fadeUp} custom={i % 6}
              initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
              whileHover={{ y: -4, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)' }}
              className="relative bg-white rounded-xl border border-gray-100 p-5 pl-7 shadow-sm transition-all duration-300 hover:border-gray-200 overflow-hidden">
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#E31837] to-[#ff4d6a]" />
              <h3 className="text-base font-bold text-gray-900 mb-1.5">{item.term}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.def}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

// ============================================================================
// SECTION 10: CTA — Premium Dark
// ============================================================================
function CTASection() {
  const stat1 = useCountUp(200, 2000);
  const stat2 = useCountUp(49, 2000);

  return (
    <AnimatedSection className="py-24 md:py-32 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[30%] left-[20%] w-[500px] h-[500px] bg-[#E31837]/8 rounded-full blur-[150px]" />
        <div className="absolute bottom-[20%] right-[10%] w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:32px_32px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="text-center mb-14">
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-5">
            이해는 됐는데,{' '}
            <span className="bg-gradient-to-r from-[#ff6b81] to-[#ffb3c1] bg-clip-text text-transparent">
              혼자 하려니 막막하신가요?
            </span>
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            수백 명의 초보자가 1:1 코칭으로 첫 수익을 만들었습니다
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-14">
          {/* PT Card */}
          <motion.div variants={fadeUp} custom={0} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}>
            <Link href="/pt" className="block group">
              <motion.div whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }}
                className="relative bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:bg-white/[0.07] overflow-hidden">
                {/* Top accent border */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#E31837] to-[#ff4d6a]" />
                {/* Decorative circle */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/[0.02] rounded-full" />

                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center text-white mb-5 shadow-xl shadow-rose-900/20">
                    <Users className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    1:1 PT 프로그램
                    <ArrowRight className="w-4 h-4 text-white/40 group-hover:translate-x-1 group-hover:text-white/80 transition-all" />
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-5">
                    전문가가 옆에서 하나하나 알려드립니다.
                    상품 선정부터 첫 수익까지 풀 코칭.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['1:1 맞춤 교육', '상품 선정 도움', '첫 수익 보장'].map((tag) => (
                      <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-white/[0.06] text-white/60 border border-white/[0.06]">{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </Link>
          </motion.div>

          {/* Program Card */}
          <motion.div variants={fadeUp} custom={1} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}>
            <Link href="/program" className="block group">
              <motion.div whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }}
                className="relative bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-8 transition-all duration-300 hover:bg-white/[0.07] overflow-hidden">
                {/* Top accent border */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-blue-400" />
                {/* Decorative circle */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/[0.02] rounded-full" />

                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white mb-5 shadow-xl shadow-blue-900/20">
                    <Zap className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                    자동화 프로그램
                    <ArrowRight className="w-4 h-4 text-white/40 group-hover:translate-x-1 group-hover:text-white/80 transition-all" />
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-5">
                    이미 기초를 알고 있다면 도구로 효율을 높이세요.
                    100개 상품 10분 등록, 자동 가격 관리.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['AI 자동 등록', '가격 자동 관리', '카테고리 매칭'].map((tag) => (
                      <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-white/[0.06] text-white/60 border border-white/[0.06]">{tag}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        </div>

        {/* Trust badges with counter */}
        <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {[
            { icon: <Users className="w-4 h-4" />, text: <span>수강생 <span ref={stat1.ref}>{stat1.count}</span>명+</span> },
            { icon: <Star className="w-4 h-4" />, text: <span>만족도 <span ref={stat2.ref}>{stat2.count > 0 ? `${(stat2.count / 10).toFixed(1)}` : '0'}</span>/5.0</span> },
            { icon: <TrendingUp className="w-4 h-4" />, text: '평균 6주 내 첫 수익' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-white/40">
              <span className="text-white/25">{item.icon}</span>
              {typeof item.text === 'string' ? item.text : item.text}
            </div>
          ))}
        </motion.div>
      </div>
    </AnimatedSection>
  );
}

// Footer: uses shared component (SharedFooter)

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function GuidePage() {
  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <WhatSection />
      <FlowSection />
      <ComparisonSection />
      <CalculatorSection />
      <StepsSection />
      <FAQSection />
      <WarningsSection />
      <GlossarySection />
      <CTASection />
      <SharedFooter />
    </main>
  );
}
