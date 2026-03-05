'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  Minus,
  Menu,
  Plus,
  X,
  ShieldCheck,
  HandCoins,
  Shield,
  ClipboardList,
  Rocket,
  Trophy,
} from 'lucide-react';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const CTA_URL = '/apply';

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

// ============================================================
// DATA
// ============================================================
const navLinks = [
  { label: '수익 구조', href: '#revenue' },
  { label: 'FAQ', href: '#faq' },
];

const reverseFilterItems = [
  '월 2~3천만원 이상의 매출을 기대하시는 분',
  '노력 없이 수익을 원하시는 분',
  '단기간에 대박을 원하시는 분',
  '교육 내용을 이행하지 않으시는 분',
];

const storyDojeonKakao: ChatMsg[] = [
  { text: '3개월째 독학 중인데', time: '오전 1:42', isMine: true },
  { text: '매출은 나오긴 하는데', time: '오전 1:42', isMine: true },
  { text: '이걸로는 턱없이 부족해', time: '오전 1:43', isMine: true },
  { name: '친구', text: '너 새벽에 또 그거야?', time: '오전 1:50' },
  { name: '친구', text: '좀 자라 진짜', time: '오전 1:50' },
];

const storyJeonHwanKakao: ChatMsg[] = [
  { text: '형 자동화 프로그램 만들 수 있어요?', time: '오후 3:22', isMine: true },
  { name: '개발자', text: '어떤 거?', time: '오후 3:25' },
  { text: '상품 등록이랑 카테고리 매칭', time: '오후 3:26', isMine: true },
  { text: '가격 계산도 자동으로', time: '오후 3:26', isMine: true },
  { name: '개발자', text: '해볼 수 있을 것 같은데', time: '오후 3:28' },
  { text: '꼭 좀 부탁드립니다 진짜', time: '오후 3:28', isMine: true },
];

const curriculumSteps = [
  {
    icon: ClipboardList,
    phase: '준비',
    title: '기반을 세웁니다',
    items: ['사업자 신청', '통신판매업 등록', '쿠팡윙 입점', '신용카드 채택'],
  },
  {
    icon: Rocket,
    phase: '진행',
    title: '매출을 만듭니다',
    items: ['자동화 솔루션(자체개발) 상품 업로드', '업로드 팁', '주문 처리', '반품 처리', '진상 대응', '브랜드사 대응', '쿠팡 대응'],
  },
  {
    icon: Trophy,
    phase: '마무리',
    title: '수익을 확인합니다',
    items: ['쿠팡 빠른 정산', '수익 창출'],
  },
];

const revenueModelItems = [
  { label: '초기 비용', value: '0원', sub: '선투자 없음. 셋업비, 교육비 모두 무료.', icon: ShieldCheck },
  { label: '순이익 배분', value: '30%', sub: '매출이 아닌 순이익 기준. 원가·배송비·광고비 제외 후 계산.', icon: HandCoins, highlight: true },
  { label: '매출 없으면', value: '0원', sub: '리스크 없음. 매출 없으면 1원도 청구하지 않습니다.', icon: Shield },
];

const faqData = [
  { q: '정말 0원으로 시작할 수 있나요?', a: '네, 맞습니다. 초기비용, 셋업비, 교육비 모두 0원입니다. 매출이 발생해서 순이익이 생겼을 때만 30%를 정산합니다. 매출이 없으면 저희도 수익이 없는 구조입니다.' },
  { q: '자동화 프로그램은 어떤 건가요?', a: '상품 등록, AI 카테고리 매칭, 가격 자동 계산 등을 처리하는 자체 개발 프로그램입니다. 수작업으로 하면 몇 시간 걸릴 작업을 몇 분 만에 처리할 수 있습니다. 교육 기간 동안 이 프로그램을 함께 사용하시게 됩니다.' },
  { q: '3개월 후에는 어떻게 되나요?', a: '연장 또는 독립 중 선택하실 수 있습니다. 독립을 원하시면 그동안 배운 노하우로 혼자 운영하시면 되고, 연장을 원하시면 동일 조건으로 계속 함께할 수 있습니다.' },
  { q: '부업으로도 가능한가요?', a: '네, 충분히 가능합니다. 실제로 직장 다니시면서 시작하시는 분이 많습니다. 주 5~10시간 정도만 투자하시면 됩니다. 시간이 많이 드는 작업은 자동화 프로그램과 전담 교육으로 해결합니다.' },
  { q: '쿠팡 경험이 전혀 없어도 되나요?', a: '네, 전혀 없어도 됩니다. 사업자 등록부터 입점, 상품 업로드, 주문 처리까지 모든 과정을 처음부터 함께합니다. 오히려 경험이 없으신 분이 잘못된 습관 없이 더 빠르게 배우시는 경우가 많습니다.' },
  { q: '교육은 어떤 방식으로 진행되나요?', a: '실시간 메시지 답변, 화면공유 교육, 전화 상담을 병행합니다. 오전 10시부터 오후 9시까지 상시 응대하며, 숙련되실 때까지 전담으로 교육해 드립니다.' },
  { q: '정산은 어떻게 하나요?', a: '매월 1회 정산합니다. 해당 월의 쿠팡 정산금에서 상품 원가, 배송비, 광고비 등을 차감한 순이익의 30%를 정산합니다. 상세한 리포트를 함께 제공합니다.' },
];

// ============================================================
// KAKAO CHAT
// ============================================================
type ChatMsg = { name?: string; text: string; time: string; isMine?: boolean; isSystem?: boolean };

function KakaoChat({ messages }: { messages: ChatMsg[] }) {
  return (
    <div className="mt-6 rounded-2xl overflow-hidden border border-gray-200 max-w-[280px] shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 bg-[#2C2C2C]">
        <span className="text-[11px] text-gray-500">&#9664;</span>
        <span className="text-[11px] text-gray-300 font-medium">카카오톡</span>
        <span className="text-[11px] text-gray-500">&#8942;</span>
      </div>
      <div className="bg-[#B2C7D9] px-3 py-3 space-y-2">
        {messages.map((msg, i) => {
          if (msg.isSystem) return (
            <div key={i} className="text-center my-1">
              <span className="inline-block px-3 py-0.5 rounded-full bg-black/10 text-[10px] text-gray-600">{msg.text}</span>
            </div>
          );
          if (msg.isMine) return (
            <div key={i} className="flex justify-end items-end gap-1">
              <span className="text-[9px] text-gray-500 flex-shrink-0 mb-0.5">{msg.time}</span>
              <div className="bg-[#FEE500] text-gray-900 text-[12px] leading-snug rounded-xl rounded-tr-sm px-2.5 py-1.5 max-w-[180px]">{msg.text}</div>
            </div>
          );
          return (
            <div key={i} className="flex items-start gap-1.5">
              {i === 0 || messages[i - 1]?.isMine || messages[i - 1]?.isSystem
                ? <div className="w-7 h-7 rounded-lg bg-gray-400/50 flex-shrink-0 mt-0.5" />
                : <div className="w-7 flex-shrink-0" />}
              <div>
                {(i === 0 || messages[i - 1]?.isMine || messages[i - 1]?.isSystem) && msg.name && (
                  <span className="text-[10px] text-gray-700 font-medium mb-0.5 block">{msg.name}</span>
                )}
                <div className="flex items-end gap-1">
                  <div className="bg-white text-gray-900 text-[12px] leading-snug rounded-xl rounded-tl-sm px-2.5 py-1.5 max-w-[180px]">{msg.text}</div>
                  <span className="text-[9px] text-gray-500 flex-shrink-0 mb-0.5">{msg.time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function FAQAccordionItem({ item, index, openIndex, setOpenIndex }: { item: { q: string; a: string }; index: number; openIndex: number | null; setOpenIndex: (v: number | null) => void }) {
  const isOpen = openIndex === index;
  return (
    <motion.div variants={fadeUp} custom={index} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
      className={`rounded-2xl border transition-all duration-300 ${isOpen ? 'border-gray-300 bg-white shadow-md' : 'border-gray-200 bg-white hover:shadow-sm'}`}>
      <button type="button" onClick={() => setOpenIndex(isOpen ? null : index)} aria-expanded={isOpen}
        className="w-full px-6 py-5 sm:px-8 sm:py-6 flex items-center justify-between text-left gap-4">
        <span className={`text-base sm:text-lg font-semibold leading-snug transition-colors ${isOpen ? 'text-gray-900' : 'text-gray-700'}`}>{item.q}</span>
        <span className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-gray-900' : 'bg-gray-100'}`}>
          {isOpen ? <Minus className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-gray-500" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="px-6 pb-6 sm:px-8 sm:pb-7"><div className="pt-2 border-t border-gray-100"><p className="pt-4 text-gray-600 leading-relaxed text-[15px]">{item.a}</p></div></div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionBadge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (<motion.div variants={fadeUp} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-sm ${className}`}>{children}</motion.div>);
}

function CTAButton({ children, href = CTA_URL, size = 'lg', className = '' }: { children: React.ReactNode; href?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = { sm: 'px-5 py-2.5 text-sm', md: 'px-6 py-3 text-sm', lg: 'px-8 py-4 text-base' };
  return (
    <motion.a href={href} whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 bg-[#E31837] text-white ${sizeClasses[size]} ${className}`}>{children}</motion.a>
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
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const handleNavClick = () => setMobileMenuOpen(false);
  const ptShare = Math.round(calcProfit * 0.3);
  const myShare = calcProfit - ptShare;

  return (
    <main id="main-content" className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* HEADER */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-gray-100 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-[#E31837] flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className={`font-bold text-lg transition-colors duration-500 ${scrolled ? 'text-gray-900' : 'text-white'}`}>셀러허브</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${scrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-gray-300 hover:text-white'}`}>{link.label}</a>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <a href={CTA_URL} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`}>상담 신청</a>
            </div>
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`md:hidden p-2 rounded-lg transition-colors ${scrolled ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`} aria-label="메뉴">
              {mobileMenuOpen
                ? <X className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />
                : <Menu className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden overflow-hidden bg-white/95 backdrop-blur-2xl border-b border-gray-100">
              <div className="px-5 py-4 space-y-1">
                {navLinks.map((link) => (
                  <a key={link.href} href={link.href} onClick={handleNavClick} className="block px-4 py-3 rounded-xl text-base font-medium text-gray-700 hover:bg-gray-50">{link.label}</a>
                ))}
                <div className="pt-3 border-t border-gray-100 mt-2">
                  <a href={CTA_URL} onClick={handleNavClick} className="block px-4 py-3.5 rounded-xl text-base font-semibold text-white bg-[#E31837] text-center">상담 신청</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ================================================================
          S1. HERO — PT의 이중 의미
          ================================================================ */}
      <section className="relative min-h-screen flex items-center justify-center bg-gray-950">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center px-5 sm:px-8">
          <motion.h1 variants={fadeUp} custom={0} className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-relaxed text-white max-w-2xl mx-auto">
            10년 동안<br />
            회원님들의 몸을 만들어 왔습니다.
          </motion.h1>
          <motion.div variants={fadeUp} custom={1} className="mt-6 sm:mt-8">
            <p className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-relaxed text-white max-w-2xl mx-auto">
              지금은 쿠팡으로<br />
              <span className="text-[#E31837]">매출</span>을 만들어 드립니다.
            </p>
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
            <ChevronDown className="w-6 h-6 text-gray-500" />
          </motion.div>
        </motion.div>
      </section>

      {/* ================================================================
          S2. STORY — "제가 여기까지 오게 된 이유" (편지체)
          ================================================================ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-2xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-gray-100 border-gray-200 text-gray-600 mb-6">STORY</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-gray-900">제가 여기까지 오게 된 이유</motion.h2>
          </motion.div>

          <div className="space-y-10 sm:space-y-14">
            {/* 단락 1: PT 트레이너 10년 */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed sm:leading-loose">
                10년 넘게 PT 트레이너로 일했습니다.
                새벽부터 밤까지 회원님들 스케줄에 맞춰 살았고, 그게 당연한 일상이었습니다.
                그런데 경기가 안 좋아지고 벌이가 줄어들며, 안 좋은 일들이 갑작스레 덮쳤습니다.
              </p>
            </motion.div>

            {/* 단락 2: 쿠팡 발견 */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed sm:leading-loose">
                이대로는 안 되겠다 싶어서 찾아본 게 쿠팡이었습니다.
                물불 가릴 처지가 아니더라구요.
                그래서 무작정 시작했습니다.
              </p>
            </motion.div>

            {/* 단락 3: 3개월 독학 */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed sm:leading-loose">
                3달 정도 정말 빡세게 올렸습니다.
                매출이 나오긴 하더라구요.
                그런데 상황을 해결할 만한 매출은 아니었습니다.
                새벽마다 혼자 모니터 앞에서 씨름했습니다.
              </p>
              <KakaoChat messages={storyDojeonKakao} />
            </motion.div>

            {/* 단락 4: 자동화 전환 */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed sm:leading-loose">
                아는 형님 중 개발하시는 분에게 부탁해 자동화 프로그램을 만들게 됐습니다.
                상품 등록, 카테고리 매칭, 가격 계산을 자동으로 돌리자는 거였습니다.
                우여곡절이 많았습니다.
              </p>
              <KakaoChat messages={storyJeonHwanKakao} />
            </motion.div>

            {/* 단락 5: 해결 */}
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed sm:leading-loose">
                결국 이 프로그램으로 닥친 상황들을 풀어낼 수 있었습니다.
                빚을 갚았고, 숨통이 트였습니다.
                주변에 같은 상황에 계신 분들께 알려드렸더니 반응이 좋았습니다.
                그래서 지금, 이 방법을 제대로 전해드리려 합니다.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================
          S3. PHILOSOPHY — "PT란"
          ================================================================ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.p variants={fadeUp} className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 leading-relaxed sm:leading-loose">
              10년 트레이너를 하면서<br />
              저에게 PT란 하나였습니다.
            </motion.p>
            <motion.p variants={fadeUp} custom={1} className="mt-8 sm:mt-10 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 leading-relaxed">
              회원님들의 가려운 곳을<br />긁어드리는 것.
            </motion.p>
            <motion.p variants={fadeUp} custom={2} className="mt-8 sm:mt-10 text-base sm:text-lg text-gray-500 leading-relaxed">
              다른 거창한 건 필요 없다고 생각합니다.<br />
              쿠팡도 마찬가지입니다.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          S4. CURRICULUM — "이렇게 함께합니다"
          ================================================================ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-gray-100 border-gray-200 text-gray-600 mb-6">CURRICULUM</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">이렇게 함께합니다</motion.h2>
          </motion.div>

          {/* 3단계 카드 */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid md:grid-cols-3 gap-6 mb-12">
            {curriculumSteps.map((step, i) => (
              <motion.div key={step.phase} variants={fadeUp} custom={i}
                className="rounded-2xl border border-gray-200 p-7 hover:border-gray-300 transition-colors bg-white">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-5">
                  <step.icon className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-xs font-semibold text-[#E31837] uppercase tracking-wider mb-1">{step.phase}</p>
                <h3 className="text-lg font-bold text-gray-900 mb-4">{step.title}</h3>
                <ul className="space-y-2">
                  {step.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-gray-300 mt-1 flex-shrink-0">&#8226;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>

          {/* 응대 시간 강조 박스 */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={scaleIn}>
            <div className="bg-gray-950 rounded-2xl sm:rounded-3xl p-8 sm:p-10 text-center text-white">
              <p className="text-2xl sm:text-3xl font-extrabold mb-4">오전 10시 ~ 오후 9시</p>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                실시간 문의 답변 &middot; 화면공유 교육 &middot; 급한 용건 언제든 연락
              </p>
              <div className="h-px bg-gray-800 my-6" />
              <p className="text-gray-500 text-sm">숙련되실 때까지 전담으로 교육해 드립니다.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          S5. FILTER + HONESTY — "간절하신 분만" + "전 자원봉사자가 아닙니다"
          ================================================================ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto">
          {/* 상단: 필터 */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-12">
            <SectionBadge className="bg-white/10 border-white/10 text-gray-400 mb-6">FILTER</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-white mb-4">간절하신 분만 지원해 주세요</motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="space-y-4 mb-16">
            {reverseFilterItems.map((text, i) => (
              <motion.div key={i} variants={fadeUp} custom={i} className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-b-0">
                <span className="text-gray-600 mt-0.5 flex-shrink-0 text-lg">&#10005;</span>
                <span className="text-gray-400 text-base">{text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* 구분선 */}
          <div className="h-px bg-gray-800 mb-16" />

          {/* 하단: Honesty */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center">
            <motion.div variants={fadeUp}>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                &ldquo;전 자원봉사자가 아닙니다.&rdquo;
              </p>
            </motion.div>

            <motion.div variants={fadeUp} custom={1} className="mt-10 sm:mt-14 text-left sm:text-center">
              <p className="text-gray-300 text-base sm:text-lg leading-relaxed sm:leading-loose">
                돈을 더 벌고 싶습니다.<br />
                혼자서는 한계가 명확했거든요.
              </p>
              <p className="text-gray-300 text-base sm:text-lg leading-relaxed sm:leading-loose mt-6">
                제가 해왔던 것, 잘하는 것을 활용하자 해서<br />
                런칭하게 된 것이 이 쿠팡PT입니다.
              </p>
              <p className="text-gray-300 text-base sm:text-lg leading-relaxed sm:leading-loose mt-6">
                제가 열심히 움직이는 만큼<br />
                교육생 분들의 매출은 오를 것이고<br />
                그로 인해 저에게 오는 수익 또한 높아지겠죠.
              </p>
              <p className="text-gray-300 text-base sm:text-lg leading-relaxed sm:leading-loose mt-6">
                그러니 꼭 간절하신 분들만 지원하셔서<br />
                서로 윈윈 하는 시너지를 냈으면 합니다.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          S6. REVENUE — 수익 구조
          ================================================================ */}
      <section id="revenue" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-gray-100 border-gray-200 text-gray-600 mb-6">REVENUE</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">수익 구조</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-lg mx-auto">저희가 돈을 벌려면, 먼저 여러분이 돈을 벌어야 합니다.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid md:grid-cols-3 gap-6 mb-14">
            {revenueModelItems.map((item, i) => (
              <motion.div key={item.label} variants={scaleIn} custom={i}
                className={`rounded-2xl p-7 sm:p-8 border transition-all ${item.highlight ? 'bg-gray-950 text-white border-gray-800' : 'bg-white border-gray-200'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${item.highlight ? 'bg-white/10' : 'bg-gray-100'}`}>
                  <item.icon className={`w-6 h-6 ${item.highlight ? 'text-white' : 'text-gray-500'}`} />
                </div>
                <p className={`text-sm font-medium mb-1 ${item.highlight ? 'text-gray-400' : 'text-gray-500'}`}>{item.label}</p>
                <p className={`text-3xl sm:text-4xl font-extrabold mb-3 ${item.highlight ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
                <p className={`text-sm leading-relaxed ${item.highlight ? 'text-gray-400' : 'text-gray-500'}`}>{item.sub}</p>
              </motion.div>
            ))}
          </motion.div>
          {/* 수익 계산기 */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={scaleIn} className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 p-7 sm:p-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center"><Calculator className="w-5 h-5 text-white" /></div>
                <div><h3 className="text-lg font-bold text-gray-900">수익 계산기</h3><p className="text-xs text-gray-500">슬라이더로 예상 순이익을 조절해 보세요</p></div>
              </div>
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3"><span className="text-sm text-gray-500">월 예상 순이익</span><span className="text-lg font-extrabold text-gray-900">{calcProfit}만원</span></div>
                <input type="range" min="50" max="1000" step="10" value={calcProfit} onChange={(e) => setCalcProfit(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 accent-[#E31837]"
                  style={{ background: `linear-gradient(to right, #E31837 ${((calcProfit - 50) / 950) * 100}%, #e5e7eb ${((calcProfit - 50) / 950) * 100}%)` }} />
                <div className="flex justify-between mt-1"><span className="text-xs text-gray-500">50만원</span><span className="text-xs text-gray-500">1,000만원</span></div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100"><span className="text-sm text-gray-500">PT사 수수료 (30%)</span><span className="text-base font-bold text-gray-500">{ptShare}만원</span></div>
                <div className="flex items-center justify-between py-3"><span className="text-sm font-medium text-gray-700">내 순수익 (70%)</span><span className="text-2xl font-extrabold text-gray-900">{myShare}만원</span></div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          S7. FAQ
          ================================================================ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-white border-gray-200 text-gray-600 mb-6">FAQ</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">자주 묻는 질문</motion.h2>
          </motion.div>
          <div className="space-y-3">
            {faqData.map((item, i) => (
              <FAQAccordionItem key={i} item={item} index={i} openIndex={openFAQ} setOpenIndex={setOpenFAQ} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          S8. FINAL CTA — "가벼운 미팅부터 시작하겠습니다"
          ================================================================ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-950 text-white">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-white mb-6">가벼운 미팅부터<br />시작하겠습니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-sm sm:text-base mb-10 leading-relaxed">
              신청 = 계약이 아닙니다.<br />
              미팅 후 진행 여부는 자유롭게 결정하실 수 있습니다.
            </motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <CTAButton href={CTA_URL}>
                상담 신청 <ArrowRight className="w-4 h-4" />
              </CTAButton>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 px-5 sm:px-8 bg-gray-950 border-t border-gray-800">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} 셀러허브. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
