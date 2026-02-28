'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calculator,
  CheckCircle,
  ChevronDown,
  Clock,
  FileText,
  HandCoins,
  Heart,
  HelpCircle,
  ImageIcon,
  Lightbulb,
  LogIn,
  Menu,
  MessageSquareText,
  Minus,
  Package,
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
  UserCheck,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const CTA_URL = 'https://coupang-sellerhub-new.vercel.app/auth/login';

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

const empathyCards = [
  { icon: AlertTriangle, text: '쿠팡에 상품 올렸는데 주문이 0건...', color: 'from-rose-500 to-red-600' },
  { icon: Search, text: '유튜브 보고 따라했는데 안 됨...', color: 'from-amber-500 to-orange-600' },
  { icon: BarChart3, text: '광고비만 날리고 매출은 제자리...', color: 'from-violet-500 to-purple-600' },
  { icon: Briefcase, text: '직장 다니면서 부업 하고 싶은데 뭐부터?', color: 'from-sky-500 to-blue-600' },
];

const beforeAfterData = {
  before: ['유튜브 무료 강의로 독학', '시행착오만 6개월', '광고비 100만원 이상 낭비', '결국 포기...'],
  after: ['전문가가 상품 선정부터 함께', '평균 47일 만에 첫 매출', '광고 ROAS 최적화로 수익 극대화', '3개월 내 월 500만원+'],
};

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

const storyTimeline = [
  { phase: '시작 전', text: '퇴근 후 11시, 어두운 원룸에서 노트북을 켰습니다. 월급 230만원. 세후 192만원. 월세 50만원 내고 나면 남는 건 142만원. 매달 빠듯한 생활비로 미래를 꿈꿀 여유조차 없었습니다.', emotion: 'dark' as const },
  { phase: '결심', text: '유튜브에서 "쿠팡으로 월 500만원 벌기" 영상을 봤습니다. 마음이 뛰었습니다. "나도 할 수 있을까?" 그날 밤 바로 사업자등록 방법을 검색했습니다.', emotion: 'hope' as const },
  { phase: '1개월 차', text: '상품 20개 등록. 매일 새벽 2시까지 상세페이지 만들고, 키워드 분석하고... 한 달 후 결과: 주문 0건. "뭐가 잘못된 거지?"', emotion: 'struggle' as const },
  { phase: '2개월 차', text: '광고를 돌려봤습니다. 광고비 30만원 나가고, 매출 2만 8천원. 유튜브에서 배운 대로 했는데... 통장 잔고가 줄어드는 걸 보며 불안해졌습니다.', emotion: 'struggle' as const },
  { phase: '3개월 차', text: '결국 광고비 87만원을 날렸습니다. 매출은 여전히 바닥. "아, 역시 나 같은 사람은 안 되는 건가..." 포기하려고 했습니다.', emotion: 'crisis' as const },
  { phase: '전환점', text: '포기하려던 그 순간, 친구가 말했습니다. "쿠팡 PT 서비스 알아? 전문가가 옆에서 같이 해준대." 반신반의로 무료 상담을 신청했습니다.', emotion: 'turning' as const },
  { phase: '첫 상담', text: 'PT사님이 3개월간의 삽질 이유를 10분 만에 진단했습니다. "카테고리가 잘못 매칭됐고, 상품명에 핵심 키워드가 빠져있고, 마진 구조가 안 맞아서 팔릴수록 손해예요."', emotion: 'turning' as const },
  { phase: '47일 후', text: '쿠팡 앱에서 알림이 울렸습니다. "주문이 접수되었습니다." 그 작은 알림 소리에 눈물이 났습니다. "진짜 되는 거구나..." 그 달 매출: 187만원.', emotion: 'success' as const },
  { phase: '3개월 후', text: '매출 680만원. 회사 월급 230만원보다 훨씬 많아졌습니다. 퇴근 후 카페에서 주문 현황을 확인하는 게 세상에서 가장 행복한 시간이 됐습니다.', emotion: 'success' as const },
  { phase: '6개월 후', text: '회사에 사직서를 냈습니다. "사장님, 저 개인 사업 시작합니다." 떨리는 목소리로 말하면서도, 쿠팡 대시보드의 숫자가 용기를 줬습니다.', emotion: 'success' as const },
  { phase: '지금', text: '월 매출 2,340만원. 순이익 약 820만원. 원룸에서 투베드룸 아파트로 이사했습니다. 부모님께 첫 용돈을 드렸습니다. 이 모든 것의 시작은, "혼자 하지 않기로 결심한 것"이었습니다.', emotion: 'peak' as const },
];

const testimonials = [
  {
    name: '김*훈', initial: '김', category: '의류', period: '3개월', before: '0원', after: '월 680만원',
    quote: '처음에는 반신반의했어요. 근데 PT사님이 데이터로 하나하나 보여주시면서 "이 카테고리는 지금이 적기"라고 하시는데 설득력이 달랐어요. 2개월 차에 첫 매출이 터지고, 3개월 차에 680만원까지 왔습니다.',
    gradient: 'from-rose-500 to-red-600',
    journey: [
      { phase: '신청 전', text: '"진짜 될까?" 반신반의로 상담 신청', emotion: 'doubt' as const },
      { phase: '1개월', text: 'PT사님이 데이터로 카테고리 분석', emotion: 'learn' as const },
      { phase: '2개월', text: '첫 주문 알림! 손이 떨렸습니다', emotion: 'excited' as const },
      { phase: '3개월', text: '월 680만원. 회사 월급보다 많아졌습니다', emotion: 'success' as const },
    ],
  },
  {
    name: '이*영', initial: '이', category: '생활용품', period: '4개월', before: '월 120만원', after: '월 920만원',
    quote: '혼자 하다가 한계를 느끼고 신청했어요. PT사님이 제 상품 분석해주시는데 "이건 마진이 안 나오는 구조에요"라고 정확하게 짚어주시더라고요. 상품 라인을 바꾸니까 매출이 7배 이상 뛰었습니다.',
    gradient: 'from-violet-500 to-purple-600',
    journey: [
      { phase: '신청 전', text: '"혼자 하다 한계... 도움이 필요하다"', emotion: 'doubt' as const },
      { phase: '1개월', text: '마진 구조 분석 → 상품 라인 교체', emotion: 'learn' as const },
      { phase: '2개월', text: '매출 상승 시작! 방향이 맞았습니다', emotion: 'excited' as const },
      { phase: '4개월', text: '월 920만원. 매출 7배 성장', emotion: 'success' as const },
    ],
  },
  {
    name: '박*수', initial: '박', category: '주방용품', period: '3개월', before: '부업 시작', after: '월 540만원',
    quote: '직장 다니면서 시간이 없어서 엄두를 못 냈는데, PT사님이 시간 많이 드는 건 대행해주시고 제가 결정만 하면 되니까 가능하더라고요. 주 5시간 정도만 투자하고 있습니다.',
    gradient: 'from-amber-500 to-orange-600',
    journey: [
      { phase: '신청 전', text: '"직장 다니면서 가능할까?" 시간 걱정', emotion: 'doubt' as const },
      { phase: '1개월', text: '핵심 결정만 내가, 나머지는 PT사님이', emotion: 'learn' as const },
      { phase: '2개월', text: '주 5시간 투자로 첫 수익 발생', emotion: 'excited' as const },
      { phase: '3개월', text: '월 540만원. 부업이 본업을 넘었습니다', emotion: 'success' as const },
    ],
  },
];

const notForItems = [
  { text: '이미 월 5천만원 이상 매출인 분', icon: BarChart3 },
  { text: '즉시 수익을 원하시는 분 (최소 2-3개월 소요)', icon: Clock },
  { text: '전문가 조언을 따르기 어려운 분', icon: MessageSquareText },
  { text: '연락이 안 되거나 소통이 어려운 분', icon: Phone },
];

const guaranteeItems = [
  { icon: Shield, title: '3개월 내 매출 미발생 시 비용 0원', desc: '매출이 안 나오면 한 푼도 받지 않습니다. 저희의 자신감입니다.' },
  { icon: CheckCircle, title: '중도 해지 자유', desc: '최소 계약 기간 없음. 위약금 없음. 언제든 해지 가능합니다.' },
  { icon: FileText, title: '투명한 정산 리포트', desc: '매월 상세한 엑셀 리포트 제공. 매출, 원가, 광고비, 순이익 모두 공개.' },
];

const faqData = [
  { q: '정말 0원으로 시작할 수 있나요?', a: '네, 맞습니다. 초기비용, 셋업비, 교육비 모두 0원입니다. 매출이 발생해서 순이익이 생겼을 때만 30%를 정산합니다. 매출이 없으면 저희도 수익이 없는 구조라서, 저희가 더 열심히 할 수밖에 없습니다.' },
  { q: 'PT사는 어떤 분이 배정되나요?', a: '판매하실 카테고리에 맞는 전문가가 배정됩니다. 모든 PT사는 본인이 직접 월 1억 이상 매출을 달성한 경험이 있고, 최소 30명 이상의 셀러를 성공시킨 분들입니다.' },
  { q: '3개월 후에는 어떻게 되나요?', a: '3개월 후에는 연장 또는 독립 중 선택하실 수 있습니다. 독립을 원하시면 그동안 배운 노하우로 혼자 운영하시면 되고, 연장을 원하시면 동일 조건으로 계속 함께할 수 있습니다.' },
  { q: '어떤 카테고리가 잘 되나요?', a: '상담에서 PT사와 함께 데이터 기반으로 분석하는 게 가장 정확합니다. 시장 상황은 계속 변하기 때문에 현재 시점에 가장 유망한 카테고리를 함께 찾아드립니다.' },
  { q: '부업으로도 가능한가요?', a: '네, 충분히 가능합니다. 실제로 파트너의 60% 이상이 직장인입니다. 주 5-10시간 정도만 투자하시면 됩니다. 시간이 많이 드는 작업은 PT사가 도와드리거나 대행합니다.' },
  { q: '해외에서도 가능한가요?', a: '쿠팡 판매를 위해서는 한국 사업자등록증이 필요합니다. 해외 거주라도 한국 사업자가 있으시면 진행 가능합니다.' },
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

function FAQAccordionItem({ item, index, openIndex, setOpenIndex }: { item: { q: string; a: string }; index: number; openIndex: number | null; setOpenIndex: (v: number | null) => void }) {
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

function CTAButton({ children, href = CTA_URL, variant = 'primary', size = 'lg', className = '' }: { children: React.ReactNode; href?: string; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = { sm: 'px-5 py-2.5 text-sm', md: 'px-6 py-3 text-sm', lg: 'px-8 py-4 text-base' };
  const variantClasses = { primary: 'bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white shadow-xl shadow-rose-200/40 hover:shadow-2xl hover:shadow-rose-300/40', secondary: 'bg-white text-gray-900 border border-gray-200 shadow-lg', ghost: 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200' };
  return (
    <motion.a href={href} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>{children}</motion.a>
  );
}

function InitialAvatar({ initial, size = 'md' }: { initial: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-14 h-14 text-base' };
  return (<div className={`${s[size]} rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center text-white font-bold shadow-lg`}>{initial}</div>);
}

// ============================================================
// MOCKUP: 쿠팡 셀러 매출 대시보드
// ============================================================
function CoupangSellerDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-rose-100/50 via-purple-100/30 to-blue-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 윙 판매자센터" />
        <img
          src="https://cdn.prod.website-files.com/6875ff5707fb9eff8f996368/688c1b86eb717de97ea44fc8_%EC%9C%99-%EC%BD%98%ED%85%90%EC%B8%A0-%EC%9D%B4%EB%AF%B8%EC%A7%80-6.jpg"
          alt="쿠팡 윙 판매자센터 - 매출 현황, 정산 분석, 수익 그래프 실제 화면"
          className="w-full"
          loading="eager"
        />
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">매출 달성!</div><div className="text-[10px] text-gray-400">월 1,245만원 돌파</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center"><Star className="w-4 h-4 text-purple-600" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">PT 효과</div><div className="text-[10px] text-gray-400">47일 만에 첫 매출</div></div>
      </motion.div>
    </div>
  );
}

// ============================================================
// MOCKUP: 쿠팡 자동화 대시보드
// ============================================================
function CoupangAutomationDashboard() {
  const steps = [
    { label: '스캔', done: true }, { label: '가격', done: true }, { label: '카테고리', done: true },
    { label: '상품명', done: true }, { label: '리뷰', active: true }, { label: '옵션', done: false },
    { label: '필드', done: false }, { label: '이미지', done: false }, { label: '등록', done: false },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-rose-100/40 via-purple-100/20 to-blue-100/40 rounded-[28px] blur-xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 자동화 대시보드" />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: '오늘 등록', value: '147', change: '+32' }, { label: '대기중', value: '80', change: '' }, { label: '성공률', value: '98.2%', change: '+0.4%' }].map((s) => (
              <div key={s.label} className="bg-gray-50/80 rounded-xl p-3 border border-gray-100/50">
                <div className="text-[10px] font-medium text-gray-400 mb-1">{s.label}</div>
                <div className="text-lg font-bold text-gray-900 leading-none">{s.value}</div>
                {s.change && <div className="flex items-center gap-0.5 mt-1"><TrendingUp className="w-2.5 h-2.5 text-green-500" /><span className="text-[10px] font-semibold text-green-600">{s.change}</span></div>}
              </div>
            ))}
          </div>
          <div className="bg-gradient-to-r from-red-50/80 to-orange-50/60 rounded-xl p-4 border border-red-100/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#E31837] animate-pulse" /><span className="text-sm font-semibold text-gray-800">자동 등록 진행중</span></div>
              <span className="text-[11px] font-bold text-[#E31837] bg-white px-2.5 py-0.5 rounded-full border border-red-100">5/9 단계</span>
            </div>
            <div className="flex gap-1">
              {steps.map((step, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={`w-full h-1.5 rounded-full ${step.done ? 'bg-[#E31837]' : step.active ? 'bg-[#E31837]/70 animate-pulse' : 'bg-gray-200/80'}`} />
                  <span className="text-[7px] font-medium text-gray-400 leading-none whitespace-nowrap">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">최근 등록</div>
            <div className="space-y-1.5">
              {[{ name: '도브 컨디셔너 인텐스 리페어 660ml', cat: '헤어케어', price: '₩46,300' }, { name: '꽃을든남자 레드플로로 동백 헤어 컨디셔너', cat: '헤어케어', price: '₩19,400' }, { name: '모로칸샴푸 모이스처 리페어 컨디셔너 1L', cat: '헤어케어', price: '₩98,000' }].map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100"><ImageIcon className="w-4 h-4 text-gray-300" /></div>
                  <div className="flex-1 min-w-0"><div className="text-[11px] font-medium text-gray-800 truncate">{p.name}</div><div className="text-[10px] text-gray-400 mt-0.5">{p.cat}</div></div>
                  <div className="text-[11px] font-bold text-gray-700 flex-shrink-0">{p.price}</div>
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10">
        <div className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600" /></div>
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
  const stat1 = useCountUp(137);
  const stat2 = useCountUp(94);
  const stat3 = useCountUp(28);

  return (
    <main id="main-content" className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* HEADER */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-gray-100 shadow-sm' : 'bg-white/70 backdrop-blur-xl'}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/30"><span className="text-white font-bold text-sm">S</span></div>
              <span className="font-bold text-lg text-gray-900">셀러허브</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (<a key={link.href} href={link.href} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all">{link.label}</a>))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <a href={CTA_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all flex items-center gap-1.5"><LogIn className="w-4 h-4" />로그인</a>
              <CTAButton href={CTA_URL} size="sm">무료 상담 <ArrowRight className="w-4 h-4" /></CTAButton>
            </div>
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="메뉴">
              {mobileMenuOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden overflow-hidden bg-white/95 backdrop-blur-2xl border-b border-gray-100">
              <div className="px-5 py-4 space-y-1">
                {navLinks.map((link) => (<a key={link.href} href={link.href} onClick={handleNavClick} className="block px-4 py-3 rounded-xl text-base font-medium text-gray-700 hover:bg-gray-50">{link.label}</a>))}
                <div className="pt-3 border-t border-gray-100 mt-2">
                  <a href={CTA_URL} target="_blank" rel="noopener noreferrer" onClick={handleNavClick} className="block px-4 py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-center shadow-lg">무료 상담 신청</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* S1. HERO — Split: 헤드라인 + 쿠팡 매출 대시보드 */}
      <section className="relative min-h-[90vh] sm:min-h-screen flex items-center overflow-hidden bg-white">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-rose-100/60 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 -left-32 w-[400px] h-[400px] bg-rose-50/80 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-28 sm:pt-36 pb-20 sm:pb-28 z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeUp} custom={0} className="mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200">
                  <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>
                  <span className="text-sm font-bold text-red-600">이번 달 신규 모집 잔여 3자리</span>
                </span>
              </motion.div>
              <motion.h1 variants={fadeUp} custom={1} className="text-[2.5rem] sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.12] mb-6 text-gray-900">
                쿠팡에서 매출이<br />안 나오는 이유,<br />
                <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">혼자 하고 있기 때문입니다.</span>
              </motion.h1>
              <motion.p variants={fadeUp} custom={2} className="text-lg sm:text-xl text-gray-500 max-w-xl leading-relaxed mb-10">
                월 1억 파는 전문가가 옆에서 같이 해주면<br className="hidden sm:block" />당신도 <span className="font-semibold text-gray-800">3개월 안에 매출이 나옵니다.</span>
              </motion.p>
              <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-start gap-4 mb-10">
                <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청<ArrowRight className="w-5 h-5" /></CTAButton>
                <CTAButton href="#story" variant="ghost" size="lg">성공 스토리 보기<ChevronDown className="w-5 h-5" /></CTAButton>
              </motion.div>
              <motion.div variants={fadeUp} custom={4} className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {['김', '이', '박'].map((init, i) => (<div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-md">{init}</div>))}
                  <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-md">+134</div>
                </div>
                <div><p className="text-sm font-semibold text-gray-800">지금까지 137명이 함께 했습니다</p><p className="text-xs text-gray-500">전문가와 함께 매출을 만들었습니다</p></div>
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.35 }} className="relative hidden lg:block">
              <CoupangSellerDashboard />
            </motion.div>
          </div>
        </div>
      </section>

      {/* S2. 신뢰 바 */}
      <section className="py-16 sm:py-20 px-5 sm:px-8 bg-gray-50/60 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 gap-6 sm:gap-12">
            <div className="text-center" ref={stat1.ref}><div className="flex items-center justify-center mb-2"><Users className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">{stat1.count}명</span></div><span className="text-sm text-gray-500 font-medium">파트너</span></div>
            <div className="text-center" ref={stat2.ref}><div className="flex items-center justify-center mb-2"><TrendingUp className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">{stat2.count}%</span></div><span className="text-sm text-gray-500 font-medium">매출 발생률</span></div>
            <div className="text-center" ref={stat3.ref}><div className="flex items-center justify-center mb-2"><BarChart3 className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">{(stat3.count / 10).toFixed(1)}배</span></div><span className="text-sm text-gray-500 font-medium">평균 성장</span></div>
          </div>
        </div>
      </section>

      {/* S3. 공감 섹션 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-rose-50 border-rose-200/60 text-[#E31837] mb-6"><MessageSquareText className="w-4 h-4" />공감</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">혹시 이런 상황이신가요?</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-lg mx-auto">혼자 하다 보면 누구나 겪는 일입니다.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-2 gap-5 mb-10">
            {empathyCards.map((card, i) => (
              <motion.div key={card.text} variants={fadeUp} custom={i} whileHover={{ y: -4 }}
                className="relative bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 group cursor-default">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-105 transition-transform`}><card.icon className="w-6 h-6 text-white" /></div>
                  <p className="text-lg font-semibold text-gray-800 leading-snug pt-2">{card.text}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center">
            <p className="text-lg font-semibold text-[#E31837]">하나라도 해당되면, 아래 이야기를 읽어보세요 ↓</p>
          </motion.div>
        </div>
      </section>

      {/* S4. 감동 스토리텔링 — "간절함에서 시작된 이야기" */}
      <section id="story" className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-[#E31837]/8 rounded-full blur-[150px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-white/10 border-white/10 text-rose-300 mb-6"><Heart className="w-4 h-4" />REAL STORY</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-5">간절함에서 시작된 이야기</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-lg max-w-2xl mx-auto">이것은 실제 파트너 김*훈 님의 이야기입니다.<br className="hidden sm:block" />당신의 이야기가 될 수도 있습니다.</motion.p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-gray-700 via-gray-600 to-emerald-500/50" />
            <div className="space-y-0">
              {storyTimeline.map((item, i) => {
                const styles = {
                  dark: { dot: 'bg-gray-600 border-gray-500', badge: 'bg-gray-800 text-gray-400 border-gray-700', text: 'text-gray-400' },
                  hope: { dot: 'bg-sky-500 border-sky-400', badge: 'bg-sky-900/50 text-sky-300 border-sky-700', text: 'text-gray-300' },
                  struggle: { dot: 'bg-amber-500 border-amber-400', badge: 'bg-amber-900/50 text-amber-300 border-amber-700', text: 'text-gray-400' },
                  crisis: { dot: 'bg-red-500 border-red-400 animate-pulse', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-gray-300' },
                  turning: { dot: 'bg-violet-500 border-violet-400', badge: 'bg-violet-900/50 text-violet-300 border-violet-700', text: 'text-gray-300' },
                  success: { dot: 'bg-emerald-500 border-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700', text: 'text-emerald-200/80' },
                  peak: { dot: 'bg-gradient-to-r from-[#E31837] to-[#ff4d6a] border-rose-400 animate-pulse', badge: 'bg-rose-900/50 text-rose-300 border-rose-700', text: 'text-white' },
                };
                const s = styles[item.emotion];
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="relative pl-16 sm:pl-20 pb-8 sm:pb-10">
                    <div className={`absolute left-[18px] sm:left-[26px] top-1 w-4 h-4 rounded-full border-2 ${s.dot} z-10`} />
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mb-2.5 ${s.badge}`}>{item.phase}</div>
                    <p className={`text-[15px] sm:text-base leading-relaxed ${s.text} ${item.emotion === 'peak' ? 'font-semibold' : ''}`}>{item.text}</p>
                    {item.emotion === 'success' && i === 7 && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
                        className="mt-4 inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-3.5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center flex-shrink-0"><Bell className="w-5 h-5 text-white" /></div>
                        <div><div className="text-sm font-bold text-white">쿠팡 주문 알림</div><div className="text-xs text-gray-400">프리미엄 주방도구 세트 5종 · ₩24,900</div><div className="text-[10px] text-emerald-400 mt-0.5 font-semibold">주문이 접수되었습니다</div></div>
                      </motion.div>
                    )}
                    {item.emotion === 'peak' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="mt-5 grid grid-cols-3 gap-3">
                        {[{ label: '월 매출', value: '₩2,340만', c: 'from-[#E31837] to-[#ff4d6a]' }, { label: '순이익', value: '₩820만', c: 'from-emerald-500 to-emerald-600' }, { label: '성장률', value: '+1,017%', c: 'from-violet-500 to-purple-600' }].map((stat) => (
                          <div key={stat.label} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-3 text-center">
                            <div className={`text-lg font-extrabold bg-gradient-to-r ${stat.c} bg-clip-text text-transparent`}>{stat.value}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mt-10 pt-10 border-t border-white/10">
            <p className="text-xl sm:text-2xl font-extrabold text-white mb-3">이 모든 것의 시작은,</p>
            <p className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent mb-8">&ldquo;혼자 하지 않기로 결심한 것&rdquo;이었습니다.</p>
            <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />나도 시작하기<ArrowRight className="w-5 h-5" /></CTAButton>
          </motion.div>
        </div>
      </section>

      {/* S5. Before vs After */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-emerald-50 border-emerald-200/60 text-emerald-700 mb-6"><Zap className="w-4 h-4" />COMPARE</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">혼자 vs 전문가와 함께</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">같은 시간, 같은 노력. 결과는 완전히 다릅니다.</motion.p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInLeft} className="rounded-2xl border border-gray-200 bg-gray-50 p-7 sm:p-9">
              <div className="flex items-center gap-3 mb-7"><div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center"><X className="w-5 h-5 text-gray-400" /></div><h3 className="text-xl font-bold text-gray-400">혼자 할 때</h3></div>
              <div className="space-y-5">{beforeAfterData.before.map((item, i) => (<div key={i} className="flex items-start gap-3"><XCircle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" /><span className="text-gray-400 line-through text-base leading-relaxed">{item}</span></div>))}</div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInRight} className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-7 sm:p-9 relative">
              <div className="absolute -top-3 right-6"><span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold shadow-lg">추천</span></div>
              <div className="flex items-center gap-3 mb-7"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg"><CheckCircle className="w-5 h-5 text-white" /></div><h3 className="text-xl font-bold text-gray-900">PT와 함께</h3></div>
              <div className="space-y-5">{beforeAfterData.after.map((item, i) => (<div key={i} className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" /><span className="text-gray-800 font-medium text-base leading-relaxed">{item}</span></div>))}</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* S6. 프로그램 쇼케이스 — 실제 화면 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-indigo-50 border-indigo-200/60 text-indigo-700 mb-6"><Sparkles className="w-4 h-4" />OUR TOOLS</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">이것이 당신이 사용하게 될<br className="hidden sm:block" /> 프로그램입니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">전문가와 함께, AI 자동화로 매출을 만듭니다.</motion.p>
          </motion.div>
          <div className="grid lg:grid-cols-2 gap-8">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInLeft}>
              <div className="mb-5"><h3 className="text-xl font-bold text-gray-900 mb-1">AI 자동 등록 시스템</h3><p className="text-sm text-gray-500">상품 등록, 카테고리 매칭, 가격 계산까지 모두 자동</p></div>
              <CoupangAutomationDashboard />
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInRight}>
              <div className="mb-5"><h3 className="text-xl font-bold text-gray-900 mb-1">매출 분석 리포트</h3><p className="text-sm text-gray-500">투명한 매출/순이익 추적, 월별 성장 리포트</p></div>
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-100/40 via-indigo-100/20 to-violet-100/40 rounded-[28px] blur-xl" />
                <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
                  <WindowChrome title="매출 분석 리포트 — 2026년 2월" />
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-3.5 border border-blue-100/50">
                        <div className="text-[10px] font-medium text-gray-400 mb-1">총 매출</div>
                        <div className="text-lg font-extrabold text-gray-900">₩12,450,000</div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: '78%' }} /></div>
                        <div className="text-[9px] text-gray-400 mt-1">목표 대비 78%</div>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-50 to-green-50/50 rounded-xl p-3.5 border border-emerald-100/50">
                        <div className="text-[10px] font-medium text-gray-400 mb-1">순이익</div>
                        <div className="text-lg font-extrabold text-emerald-700">₩5,230,000</div>
                        <div className="flex items-center gap-1 mt-2"><TrendingUp className="w-3 h-3 text-emerald-500" /><span className="text-[10px] font-bold text-emerald-600">마진율 42%</span></div>
                      </div>
                    </div>
                    <div className="bg-gray-50/60 rounded-xl p-4 border border-gray-100/50">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">카테고리별 매출</div>
                      <div className="space-y-2.5">
                        {[{ cat: '주방용품', amt: '₩4,200,000', pct: 34, color: 'bg-[#E31837]' }, { cat: '생활용품', amt: '₩3,100,000', pct: 25, color: 'bg-blue-500' }, { cat: '전자제품', amt: '₩2,800,000', pct: 22, color: 'bg-violet-500' }, { cat: '의류/패션', amt: '₩2,350,000', pct: 19, color: 'bg-amber-500' }].map((c) => (
                          <div key={c.cat}>
                            <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-medium text-gray-600">{c.cat}</span><span className="text-[11px] font-bold text-gray-800">{c.amt}</span></div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} whileInView={{ width: `${c.pct}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }} className={`h-full rounded-full ${c.color}`} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ label: '총 주문', value: '847건', change: '+23%' }, { label: '반품률', value: '1.2%', change: '-0.3%' }, { label: 'ROAS', value: '3.8배', change: '+0.5' }].map((m) => (
                        <div key={m.label} className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
                          <div className="text-xs font-bold text-gray-900">{m.value}</div><div className="text-[9px] text-gray-400">{m.label}</div><div className="text-[9px] font-semibold text-emerald-600 mt-0.5">{m.change}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* S7. PROCESS — 6단계 */}
      <section id="process" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-white via-gray-50/40 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-violet-50 border-violet-200/60 text-violet-700 mb-6"><Rocket className="w-4 h-4" />PROCESS</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">상담부터 매출까지, 6단계</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">매출이 나올 때까지 전 과정을 함께 합니다.</motion.p>
          </motion.div>
          <div className="relative">
            <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-gray-200 via-gray-200 to-transparent -translate-x-1/2" />
            <div className="space-y-6 lg:space-y-0">
              {processSteps.map((step, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <motion.div key={step.step} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={isLeft ? slideInLeft : slideInRight}
                    className={`relative lg:flex lg:items-center lg:gap-8 ${i > 0 ? 'lg:mt-6' : ''}`}>
                    <div className={`lg:w-1/2 ${isLeft ? 'lg:pr-12 lg:text-right' : 'lg:order-2 lg:pl-12'}`}>
                      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300">
                        <div className={`flex items-center gap-4 mb-4 ${isLeft ? 'lg:flex-row-reverse' : ''}`}>
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg flex-shrink-0`}><step.icon className="w-6 h-6 text-white" /></div>
                          <div className={isLeft ? 'lg:text-right' : ''}><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Step {step.step}</span><h3 className="text-lg font-bold text-gray-900">{step.title}</h3></div>
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

      {/* S8. 수익 모델 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-rose-50 border-rose-200/60 text-[#E31837] mb-6"><Calculator className="w-4 h-4" />PRICING</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">0원으로 시작합니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">왜 0원이 가능할까요? — <span className="font-semibold text-gray-700">당신이 못 벌면 저희도 못 법니다.</span></motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid md:grid-cols-3 gap-5 mb-14">
            {revenueModelItems.map((item, i) => (
              <motion.div key={item.label} variants={scaleIn} custom={i}
                className={`relative rounded-2xl p-7 sm:p-8 border transition-all ${item.highlight ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] text-white border-transparent shadow-xl shadow-rose-200/40' : 'bg-white border-gray-100 shadow-md hover:shadow-lg'}`}>
                {item.highlight && <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${item.highlight ? 'bg-white/20' : 'bg-rose-50'}`}><item.icon className={`w-6 h-6 ${item.highlight ? 'text-white' : 'text-[#E31837]'}`} /></div>
                <p className={`text-sm font-medium mb-1 ${item.highlight ? 'text-rose-100' : 'text-gray-500'}`}>{item.label}</p>
                <p className={`text-3xl sm:text-4xl font-extrabold mb-3 ${item.highlight ? 'text-white' : 'text-gray-900'}`}>{item.value}</p>
                <p className={`text-sm leading-relaxed ${item.highlight ? 'text-rose-100' : 'text-gray-500'}`}>{item.sub}</p>
              </motion.div>
            ))}
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={scaleIn} className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-xl p-7 sm:p-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md"><Calculator className="w-5 h-5 text-white" /></div>
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
                <div className="flex items-center justify-between py-3 border-b border-gray-100"><span className="text-sm text-gray-500">PT사 수수료 (30%)</span><span className="text-base font-bold text-rose-500">{ptShare}만원</span></div>
                <div className="flex items-center justify-between py-3"><span className="text-sm font-medium text-gray-700">내 순수익 (70%)</span><span className="text-2xl font-extrabold text-emerald-600">{myShare}만원</span></div>
              </div>
              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm text-gray-500 leading-relaxed">혼자 했으면? <span className="font-semibold text-gray-700">3개월째 매출 0원</span>일 확률 90%.<br /><span className="font-semibold text-emerald-600">{myShare}만원은 전문가가 만들어준 수익</span>입니다.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* S9. 성공 사례 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-violet-50 border-violet-200/60 text-violet-700 mb-6"><Star className="w-4 h-4" />SUCCESS STORIES</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">실제 성공 사례</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg">숫자 뒤에 숨겨진 <span className="font-semibold text-gray-700">진짜 이야기</span></motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="space-y-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} variants={fadeUp} custom={i} className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="flex flex-col lg:flex-row">
                  <div className="p-7 sm:p-8 flex-1">
                    <div className="flex items-center gap-4 mb-6">
                      <InitialAvatar initial={t.initial} size="lg" />
                      <div><h3 className="text-lg font-bold text-gray-900">{t.name}</h3><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${t.gradient} text-white`}>{t.category}</span></div>
                    </div>
                    <div className="mb-6 p-4 sm:p-5 rounded-xl bg-gray-50/80 border border-gray-100">
                      <div className="hidden sm:block">
                        <div className="flex items-start justify-between relative">
                          <div className="absolute top-3 left-3 right-3 h-0.5 bg-gray-200 z-0" />
                          {t.journey.map((j, ji) => {
                            const es = { doubt: { dot: 'bg-gray-400', text: 'text-gray-500', icon: <HelpCircle className="w-3 h-3 text-white" /> }, learn: { dot: 'bg-blue-500', text: 'text-blue-600', icon: <Lightbulb className="w-3 h-3 text-white" /> }, excited: { dot: 'bg-amber-500', text: 'text-amber-600', icon: <Sparkles className="w-3 h-3 text-white" /> }, success: { dot: 'bg-emerald-500', text: 'text-emerald-600', icon: <TrendingUp className="w-3 h-3 text-white" /> } };
                            const st = es[j.emotion];
                            return (<div key={ji} className="flex flex-col items-center text-center relative z-10 flex-1"><div className={`w-6 h-6 rounded-full ${st.dot} flex items-center justify-center shadow-sm`}>{st.icon}</div><span className={`text-xs font-bold mt-2 ${st.text}`}>{j.phase}</span><span className="text-xs text-gray-500 mt-1 leading-tight max-w-[140px]">{j.text}</span></div>);
                          })}
                        </div>
                      </div>
                      <div className="sm:hidden space-y-3">
                        {t.journey.map((j, ji) => {
                          const es = { doubt: { dot: 'bg-gray-400', text: 'text-gray-500', icon: <HelpCircle className="w-3 h-3 text-white" /> }, learn: { dot: 'bg-blue-500', text: 'text-blue-600', icon: <Lightbulb className="w-3 h-3 text-white" /> }, excited: { dot: 'bg-amber-500', text: 'text-amber-600', icon: <Sparkles className="w-3 h-3 text-white" /> }, success: { dot: 'bg-emerald-500', text: 'text-emerald-600', icon: <TrendingUp className="w-3 h-3 text-white" /> } };
                          const st = es[j.emotion];
                          return (<div key={ji} className="flex items-start gap-3"><div className="flex flex-col items-center flex-shrink-0"><div className={`w-5 h-5 rounded-full ${st.dot} flex items-center justify-center`}>{st.icon}</div>{ji < t.journey.length - 1 && <div className="w-0.5 h-4 bg-gray-200 mt-1" />}</div><div className="min-w-0 -mt-0.5"><span className={`text-xs font-bold ${st.text}`}>{j.phase}</span><p className="text-xs text-gray-500 leading-tight">{j.text}</p></div></div>);
                        })}
                      </div>
                    </div>
                    <div className="relative pl-5 border-l-[3px] border-[#E31837]/20 mb-6"><Quote className="absolute -left-2.5 -top-1 w-5 h-5 text-[#E31837]/30" /><p className="text-gray-600 leading-relaxed text-[15px] italic">{t.quote}</p></div>
                    <div className="flex items-center gap-4">
                      <div className="px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100"><p className="text-xs text-gray-500 mb-0.5">Before</p><p className="text-sm font-bold text-gray-700">{t.before}</p></div>
                      <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                      <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100"><p className="text-xs text-emerald-600 mb-0.5">After ({t.period})</p><p className="text-sm font-bold text-emerald-700">{t.after}</p></div>
                    </div>
                  </div>
                  <div className={`lg:w-56 p-7 bg-gradient-to-br ${t.gradient} flex flex-col justify-center items-center text-center text-white relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <TrendingUp className="w-8 h-8 mb-3 opacity-80" /><p className="text-sm font-medium text-white/80 mb-1">{t.period} 후 매출</p><p className="text-3xl font-extrabold relative">{t.after}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* S10. 이런 분은 신청하지 마세요 */}
      <section className="relative py-6 sm:py-10 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}
            className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-7 sm:p-10">
            <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><X className="w-5 h-5 text-gray-400" /></div><div><h3 className="text-xl font-bold text-gray-900">이런 분은 신청하지 마세요</h3><p className="text-sm text-gray-500">솔직하게 말씀드립니다. 신뢰가 우선이니까요.</p></div></div>
            <div className="grid sm:grid-cols-2 gap-4">
              {notForItems.map((item, i) => (<motion.div key={item.text} variants={fadeIn} custom={i} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm"><div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5"><item.icon className="w-4 h-4 text-gray-400" /></div><span className="text-sm text-gray-600 leading-relaxed">{item.text}</span></motion.div>))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* S11. GUARANTEE */}
      <section id="guarantee" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-[#E31837]/10 rounded-full blur-[120px]" /></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-white/10 border-white/10 text-rose-300 mb-6"><ShieldCheck className="w-4 h-4" />GUARANTEE</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-5">매출이 안 나오면<br /><span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">0원입니다</span></motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-lg max-w-xl mx-auto">약속 아닌 보장입니다. 서면으로 계약합니다.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="space-y-5">
            {guaranteeItems.map((item, i) => (
              <motion.div key={item.title} variants={fadeUp} custom={i} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10 hover:bg-white/[0.07] transition-all">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg flex-shrink-0"><item.icon className="w-6 h-6 text-white" /></div>
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

      {/* S12. CTA BANNER */}
      <section className="py-6 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="relative bg-gradient-to-r from-rose-50 via-white to-rose-50 rounded-2xl p-6 sm:p-8 border border-rose-100 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-sm">
            <div><p className="text-lg font-bold text-gray-900">94%가 성공한 방법, 확인해 보세요</p><p className="text-sm text-gray-500 mt-1">상담은 무료입니다. 부담 없이 시작하세요.</p></div>
            <CTAButton href={CTA_URL} size="md" className="whitespace-nowrap"><Phone className="w-4 h-4" />무료 상담 신청<ArrowRight className="w-4 h-4" /></CTAButton>
          </motion.div>
        </div>
      </section>

      {/* S13. FAQ */}
      <section id="faq" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-3xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-12">
            <SectionBadge className="bg-sky-50 border-sky-200/60 text-sky-700 mb-6"><HelpCircle className="w-4 h-4" />FAQ</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">자주 묻는 질문</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg">궁금한 점이 더 있으시면 상담에서 편하게 물어보세요.</motion.p>
          </motion.div>
          <div className="space-y-3">{faqData.map((item, i) => (<FAQAccordionItem key={i} item={item} index={i} openIndex={openFAQ} setOpenIndex={setOpenFAQ} />))}</div>
        </div>
      </section>

      {/* S14. FINAL CTA */}
      <section className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] bg-[#E31837]/10 rounded-full blur-[140px]" /></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div variants={fadeUp} custom={0} className="mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/30">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>
                <span className="text-sm font-bold text-red-300">이번 달 잔여 3자리</span>
              </span>
            </motion.div>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">더 이상 혼자 고민하지 마세요.<br /><span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">전문가가 함께 만듭니다.</span></motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg mb-4 max-w-lg mx-auto leading-relaxed">상담은 무료이고, 매출이 없으면 비용도 0원입니다.</motion.p>
            <motion.p variants={fadeUp} custom={3} className="text-white font-medium text-base mb-10">지금 신청하시면 48시간 내 전문가가 연락드립니다.</motion.p>
            <motion.div variants={fadeUp} custom={4} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청하기<ArrowRight className="w-5 h-5" /></CTAButton>
            </motion.div>
            <motion.div variants={fadeUp} custom={5} className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {['초기비용 0원', '최소계약 없음', '94% 성공률', '투명 정산'].map((text) => (<div key={text} className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-sm text-gray-400">{text}</span></div>))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 sm:py-16 px-5 sm:px-8 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">S</span></div><span className="font-bold text-gray-900">쿠팡 셀러허브</span></Link>
            <nav className="flex items-center gap-6">{navLinks.map((link) => (<a key={link.href} href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{link.label}</a>))}</nav>
            <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} 쿠팡 셀러허브</p>
          </div>
        </div>
      </footer>

      {/* FLOATING MOBILE CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-2xl shadow-gray-900/10 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-[#E31837] truncate">이번 달 잔여 3자리 &middot; 초기비용 0원</p><p className="text-sm font-bold text-gray-900 truncate">전문가와 함께 매출 만들기</p></div>
          <motion.a href={CTA_URL} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.95 }} className="flex-shrink-0 px-5 py-3 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-sm shadow-lg shadow-rose-200/50">무료 상담</motion.a>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </main>
  );
}
