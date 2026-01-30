'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  TrendingUp,
  CheckCircle,
  Shield,
  Phone,
  MessageCircle,
  Target,
  Zap,
  ArrowRight,
  Clock,
  BarChart3,
  AlertTriangle,
  Sparkles,
  Package,
  Search,
  LineChart,
  FileText,
  Headphones,
  Calendar,
  DollarSign,
  Award,
  X,
  CheckCircle2,
  HelpCircle,
  User,
  Briefcase,
  Star,
  Quote,
  Rocket,
  Settings,
  PieChart,
  ShoppingCart,
  Megaphone,
  ClipboardList,
  BadgeCheck,
  CircleDollarSign,
  Timer,
  UserCheck,
  Building2,
  GraduationCap,
  AlertCircle,
  ThumbsUp,
  Minus,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// ==================== DATA ====================

const stats = [
  { value: '94%', label: '3개월 내 매출 발생', icon: TrendingUp, color: 'from-rose-500 to-pink-500' },
  { value: '2.8배', label: '평균 매출 성장률', icon: BarChart3, color: 'from-violet-500 to-purple-500' },
  { value: '47일', label: '첫 매출까지 평균', icon: Clock, color: 'from-amber-500 to-orange-500' },
];

const targetAudience = [
  {
    icon: User,
    title: '쿠팡 입문자',
    description: '뭐부터 해야 할지 모르겠는 초보 셀러',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: AlertCircle,
    title: '매출 정체 셀러',
    description: '3개월 넘게 매출이 안 나오는 분',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: Briefcase,
    title: '시간 없는 직장인',
    description: '부업으로 시작하고 싶은 분',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: TrendingUp,
    title: '스케일업 원하는 셀러',
    description: '월 500만 → 2000만 가고 싶은 분',
    color: 'from-amber-500 to-orange-500',
  },
];

const notForYou = [
  '이미 월 5천만원 이상 매출인 분',
  '즉시 수익을 원하시는 분 (최소 2-3개월 소요)',
  '본인 의견이 강해 조언을 안 따르시는 분',
  '연락이 안 되거나 협조가 어려운 분',
];

const benefits = [
  {
    icon: Shield,
    title: '실패해도 손해 0원',
    description: '선투자 없이 시작. 매출 안 나오면 1원도 안 냅니다.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Users,
    title: '검증된 전문가 배정',
    description: '월 1억 이상 셀러를 만든 PT사가 1:1로 붙습니다.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Zap,
    title: '₩79만원 프로그램 무료',
    description: 'AI 대량등록 솔루션 Pro 플랜을 무제한 사용.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Target,
    title: '돈 되는 상품만 분석',
    description: '레드오션은 피하고, 블루오션만 공략합니다.',
    color: 'from-rose-500 to-pink-500',
  },
];

const services = [
  {
    category: '시장 분석',
    icon: Search,
    color: 'from-blue-500 to-cyan-500',
    items: [
      '카테고리별 경쟁 강도 분석',
      '예상 마진율 계산',
      '트렌드 상품 발굴',
      '경쟁사 가격/전략 분석',
    ],
  },
  {
    category: '상품 소싱',
    icon: Package,
    color: 'from-violet-500 to-purple-500',
    items: [
      '검증된 도매처 연결',
      '해외 소싱 가이드',
      '샘플 검수 체크리스트',
      '초기 물량 추천',
    ],
  },
  {
    category: '등록 최적화',
    icon: FileText,
    color: 'from-rose-500 to-pink-500',
    items: [
      'AI 상품명 최적화',
      '검색 노출 키워드 세팅',
      '상세페이지 구성 가이드',
      '카테고리/옵션 최적화',
    ],
  },
  {
    category: '가격 전략',
    icon: CircleDollarSign,
    color: 'from-amber-500 to-orange-500',
    items: [
      '경쟁력 있는 가격 설정',
      '프로모션 타이밍 전략',
      '마진율 최적화',
      '쿠팡 수수료 계산',
    ],
  },
  {
    category: '광고 운영',
    icon: Megaphone,
    color: 'from-emerald-500 to-teal-500',
    items: [
      '쿠팡 광고 세팅',
      '키워드 입찰 전략',
      'ROAS 최적화',
      '예산 효율화',
    ],
  },
  {
    category: '성과 관리',
    icon: LineChart,
    color: 'from-indigo-500 to-blue-500',
    items: [
      '주간 성과 리포트',
      '매출/마진 트래킹',
      '개선점 피드백',
      '다음 단계 액션 플랜',
    ],
  },
];

const notIncluded = [
  { item: '초기 상품 구매 비용', reason: '상품 매입은 셀러 본인 부담' },
  { item: '물류/배송 처리', reason: '쿠팡 물류 또는 자체 배송' },
  { item: '고객 CS 응대', reason: '반품/교환은 셀러 직접 처리' },
  { item: '자금 투자', reason: 'PT사는 투자자가 아닙니다' },
];

const roadmap = [
  {
    month: '1개월차',
    title: '시장 분석 & 준비',
    icon: Search,
    color: 'from-blue-500 to-cyan-500',
    tasks: [
      '셀러 상황 진단 미팅',
      '유망 카테고리 3개 선정',
      '경쟁 분석 리포트 제공',
      '상품 소싱처 연결',
      '쿠팡 계정 세팅',
    ],
    result: '판매할 상품 3-5개 확정',
  },
  {
    month: '2개월차',
    title: '등록 & 최적화',
    icon: Rocket,
    color: 'from-violet-500 to-purple-500',
    tasks: [
      'AI 상품명 생성 & 등록',
      '상세페이지 최적화',
      '가격 전략 수립',
      '쿠팡 광고 세팅',
      '초기 리뷰 확보 전략',
    ],
    result: '상품 노출 시작, 첫 주문 발생',
  },
  {
    month: '3개월차',
    title: '매출 발생 & 스케일업',
    icon: TrendingUp,
    color: 'from-emerald-500 to-teal-500',
    tasks: [
      '광고 ROAS 최적화',
      '베스트셀러 상품 집중',
      '추가 상품 확장',
      '재고 관리 시스템 구축',
      '월간 성과 분석',
    ],
    result: '안정적 매출 구조 완성',
  },
];

const comparison = [
  { item: '첫 매출까지', alone: '평균 6개월+', withPT: '평균 47일' },
  { item: '성공률', alone: '약 10%', withPT: '94%' },
  { item: '초기 비용', alone: '시행착오 비용 100만원+', withPT: '₩0' },
  { item: '시간 투자', alone: '하루 4-5시간', withPT: '주 2-3시간' },
  { item: '상품 선정', alone: '감으로 선택', withPT: '데이터 기반 분석' },
  { item: '문제 발생시', alone: '혼자 해결', withPT: '전문가 즉시 지원' },
];

const experts = [
  {
    name: '김*호 PT',
    role: '패션/의류 전문',
    experience: '쿠팡 셀러 5년',
    achievement: '담당 셀러 월 매출 총합 12억',
    students: '47명 성공',
    avatar: 'K',
    color: 'from-rose-500 to-pink-500',
    specialties: ['의류', '패션잡화', '액세서리'],
  },
  {
    name: '이*진 PT',
    role: '생활용품 전문',
    experience: '쿠팡 셀러 4년',
    achievement: '담당 셀러 월 매출 총합 8억',
    students: '38명 성공',
    avatar: 'L',
    color: 'from-violet-500 to-purple-500',
    specialties: ['주방용품', '생활용품', '인테리어'],
  },
  {
    name: '박*수 PT',
    role: '전자제품 전문',
    experience: '쿠팡 셀러 6년',
    achievement: '담당 셀러 월 매출 총합 15억',
    students: '52명 성공',
    avatar: 'P',
    color: 'from-amber-500 to-orange-500',
    specialties: ['전자기기', '컴퓨터', '모바일'],
  },
];

const process = [
  { step: '01', title: '무료 상담 신청', desc: '간단한 정보 입력 (2분)', icon: Phone, color: 'from-blue-500 to-cyan-500' },
  { step: '02', title: '전화 상담', desc: '상황 파악 & 가능성 검토 (15분)', icon: MessageCircle, color: 'from-violet-500 to-purple-500' },
  { step: '03', title: 'PT사 매칭', desc: '카테고리에 맞는 전문가 배정', icon: UserCheck, color: 'from-amber-500 to-orange-500' },
  { step: '04', title: '본격 시작', desc: '시장 분석부터 바로 시작', icon: Rocket, color: 'from-emerald-500 to-teal-500' },
];

const successStories = [
  {
    name: '김*현',
    age: '32세',
    job: '직장인 (IT 회사)',
    category: '의류/패션',
    before: {
      situation: '퇴근 후 부업으로 쿠팡 시작. 유튜브 보고 혼자 3개월 했는데 매출 0원.',
      problems: ['뭘 팔아야 할지 몰라서 아무거나 등록', '상품명 대충 작성', '경쟁 분석 없이 가격 설정'],
    },
    after: {
      revenue: '월 2,400만원',
      period: '3개월',
      profit: '월 순이익 480만원',
    },
    story: 'PT사님이 처음에 제가 등록한 상품 보시고 "이건 레드오션이에요" 하시더라고요. 데이터 보여주시면서 왜 안 되는지 설명해주셨어요. 새로 추천받은 카테고리로 바꾸니까 2주 만에 첫 주문이 들어왔습니다.',
    keyChange: '상품 선정을 감이 아닌 데이터로',
    avatar: 'K',
    color: 'from-rose-500 to-pink-500',
  },
  {
    name: '이*수',
    age: '45세',
    job: '자영업 (식당 운영)',
    category: '생활용품',
    before: {
      situation: '코로나로 식당 매출 급감. 온라인 판매 해보려고 했는데 어디서부터 시작해야 할지...',
      problems: ['온라인 판매 경험 전무', '컴퓨터 잘 못함', '시간도 없음'],
    },
    after: {
      revenue: '월 3,200만원',
      period: '2개월',
      profit: '월 순이익 640만원',
    },
    story: '솔직히 처음에는 "내가 이걸 할 수 있을까" 걱정했어요. 근데 PT사님이 정말 하나하나 다 알려주시더라고요. 상품 등록하는 것도 화면 공유하면서 같이 해주셨어요. 지금은 식당보다 쿠팡 매출이 더 커졌습니다.',
    keyChange: '1:1 밀착 케어로 진입장벽 극복',
    avatar: 'L',
    color: 'from-violet-500 to-purple-500',
  },
  {
    name: '박*진',
    age: '28세',
    job: '전업 셀러',
    category: '주방용품',
    before: {
      situation: '다른 플랫폼에서 월 800만원 하다가 쿠팡 진출. 근데 쿠팡은 뭔가 달랐음.',
      problems: ['쿠팡 알고리즘 이해 부족', '광고비만 나가고 매출 없음', '마진율 계산 실수'],
    },
    after: {
      revenue: '월 5,100만원',
      period: '4개월',
      profit: '월 순이익 1,020만원',
    },
    story: '다른 플랫폼이랑 쿠팡은 완전 다르더라고요. PT사님이 쿠팡 광고 시스템 분석해서 알려주시는데, 제가 광고비를 완전 잘못 쓰고 있었어요. 키워드 입찰 전략 바꾸니까 ROAS가 3배 올랐습니다.',
    keyChange: '쿠팡 특화 광고 전략',
    avatar: 'P',
    color: 'from-amber-500 to-orange-500',
  },
];

const faqs = [
  {
    question: '정말 매출 없으면 0원인가요?',
    answer: '네, 맞습니다. 초기 비용, 셋업비, 교육비 모두 0원입니다. 매출이 발생해서 순이익이 생겼을 때만 30%를 정산합니다. 매출이 없으면 저희도 수익이 없는 구조라서, 저희가 더 열심히 할 수밖에 없습니다.',
  },
  {
    question: '30% 수수료는 언제, 어떻게 내나요?',
    answer: '월 1회 정산합니다. 해당 월의 쿠팡 정산금에서 상품 원가, 배송비, 광고비 등을 뺀 "순이익"의 30%입니다. 예를 들어 순이익이 100만원이면 30만원을 정산합니다. 투명하게 엑셀로 계산 내역 공유드립니다.',
  },
  {
    question: 'PT사는 어떤 분이 배정되나요?',
    answer: '판매하실 카테고리에 맞는 전문가가 배정됩니다. 모든 PT사는 본인이 직접 월 1억 이상 매출을 달성한 경험이 있고, 최소 30명 이상의 셀러를 성공시킨 분들입니다. 상담 시 PT사 프로필을 미리 확인하실 수 있습니다.',
  },
  {
    question: '시간을 얼마나 투자해야 하나요?',
    answer: '초기 1개월은 주 5-6시간, 안정화 후에는 주 2-3시간이면 됩니다. 상품 소싱, 등록, 분석 등 시간이 많이 드는 작업은 저희가 도와드리거나 대행합니다. 의사결정이 필요한 부분만 셀러님이 하시면 됩니다.',
  },
  {
    question: '이미 쿠팡 하고 있는데 신청해도 되나요?',
    answer: '물론입니다. 오히려 기존 데이터가 있으면 분석이 더 정확합니다. 현재 매출이 정체되어 있거나, 더 성장하고 싶은 분들이 많이 신청하십니다. 기존 상품 최적화 + 신규 상품 확장을 동시에 진행합니다.',
  },
  {
    question: '중간에 그만둘 수 있나요?',
    answer: '네, 최소 계약 기간이 없습니다. 언제든 해지 가능하고, 위약금도 없습니다. 다만 보통 3개월은 해보셔야 제대로 된 성과가 나오기 때문에, 최소 3개월은 함께 하시는 걸 권장드립니다.',
  },
  {
    question: '상품 재고는 어떻게 해야 하나요?',
    answer: '초기에는 소량으로 시작합니다. 보통 30-50개 정도로 테스트하고, 잘 팔리는 상품만 물량을 늘립니다. 재고 부담 최소화하면서 검증된 상품에만 투자하는 전략입니다. 재고 관리 방법도 알려드립니다.',
  },
  {
    question: '쿠팡 외 다른 플랫폼도 되나요?',
    answer: '현재는 쿠팡에 집중하고 있습니다. 쿠팡에서 안정적인 매출이 나오면, 이후 네이버 스마트스토어 등 확장을 도와드릴 수 있습니다. 하지만 처음부터 여러 플랫폼을 하면 집중도가 떨어져서 권장하지 않습니다.',
  },
];

const guarantees = [
  {
    icon: Shield,
    title: '성과 없으면 비용 0원',
    description: '매출이 발생하지 않으면 한 푼도 받지 않습니다',
  },
  {
    icon: Clock,
    title: '최소 계약 기간 없음',
    description: '언제든 해지 가능, 위약금 없음',
  },
  {
    icon: FileText,
    title: '투명한 정산',
    description: '매월 상세 정산 내역 엑셀로 공유',
  },
  {
    icon: Headphones,
    title: '48시간 내 응답',
    description: '질문/요청 48시간 내 피드백 보장',
  },
];

// ==================== COMPONENTS ====================

function FAQItem({ faq, index, openIndex, setOpenIndex }: {
  faq: { question: string; answer: string };
  index: number;
  openIndex: number | null;
  setOpenIndex: (index: number | null) => void;
}) {
  const isOpen = openIndex === index;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
      className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-lg transition-all ${
        isOpen ? 'border-rose-200 shadow-lg shadow-rose-100/50' : 'border-gray-100'
      }`}
    >
      <button
        onClick={() => setOpenIndex(isOpen ? null : index)}
        className="w-full px-6 py-5 flex items-center justify-between text-left"
      >
        <span className={`font-semibold pr-4 transition-colors ${isOpen ? 'text-[#E31837]' : 'text-gray-900'}`}>
          {faq.question}
        </span>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
            isOpen ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] shadow-lg shadow-rose-200/50' : 'bg-gray-100'
          }`}
        >
          {isOpen ? <Minus className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-gray-500" />}
        </div>
      </button>
      {isOpen && (
        <div className="px-6 pb-6 text-gray-600 leading-relaxed">
          <div className="pt-2 border-t border-gray-100">
            <p className="pt-4">{faq.answer}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function PTPage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);

  return (
    <main className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-all group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">홈으로</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/30">
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">쿠팡 PT</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="hidden sm:flex px-4 py-2 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white text-sm font-semibold shadow-lg shadow-rose-200/30"
          >
            무료 상담
          </motion.button>
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <section className="relative pt-32 pb-24 px-6 bg-gradient-to-b from-white via-gray-50/50 to-white overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-rose-100/40 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-rose-50 to-white border border-rose-100 shadow-sm mb-8"
          >
            <AlertTriangle className="w-4 h-4 text-[#E31837]" />
            <span className="text-sm font-semibold text-[#E31837]">
              혼자 하다 3개월째 매출 0원이신가요?
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 tracking-tight"
          >
            <span className="text-gray-900">팔려야 돈 내세요.</span>
            <br />
            <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
              안 팔리면 0원.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            월 1억 달성한 전문가가 옆에서 같이 해줍니다.
            <br />
            <span className="font-semibold text-gray-900">
              성공하면 30%만 나누세요. 실패하면 0원입니다.
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group px-8 py-4 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-semibold text-lg shadow-xl shadow-rose-200/50 hover:shadow-2xl transition-all flex items-center gap-2"
            >
              <Phone className="w-5 h-5" />
              내 사업 무료 진단받기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 rounded-full bg-white border border-gray-200 font-semibold text-lg shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all flex items-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              카톡으로 문의하기
            </motion.button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-3 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== TARGET AUDIENCE ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 right-0 w-72 h-72 bg-blue-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-blue-50 to-white border border-blue-100 rounded-full text-sm font-semibold text-blue-600 mb-6">
              <Target className="w-4 h-4" />
              WHO IS THIS FOR
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              이런 분께 추천합니다
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {targetAudience.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all text-center"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  <item.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Not For You */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gray-50 rounded-2xl p-8 border border-gray-200"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <X className="w-5 h-5 text-gray-400" />
              이런 분은 안 맞을 수 있어요
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {notForYou.map((item) => (
                <div key={item} className="flex items-center gap-3 text-gray-600">
                  <X className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== BENEFITS ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-0 w-72 h-72 bg-violet-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6">
              WHY COUPANG PT
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              왜 혼자 하면 안 되나요?
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              "열심히만 하면 되겠지"는 틀렸습니다.
              <br />
              <span className="font-medium text-gray-700">방향이 틀리면 노력이 배신합니다.</span>
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${benefit.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-105 transition-transform`}>
                  <benefit.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">{benefit.title}</h3>
                <p className="text-gray-500 leading-relaxed">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== SERVICES ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute bottom-1/3 right-0 w-80 h-80 bg-rose-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-full text-sm font-semibold text-violet-600 mb-6">
              <Settings className="w-4 h-4" />
              WHAT WE DO
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              실제로 해드리는 것들
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              단순 컨설팅이 아닙니다.
              <br />
              <span className="font-medium text-gray-700">직접 분석하고, 세팅하고, 관리합니다.</span>
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {services.map((service, index) => (
              <motion.div
                key={service.category}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg shadow-gray-100/50"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.color} flex items-center justify-center shadow-lg`}>
                    <service.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{service.category}</h3>
                </div>
                <ul className="space-y-2.5">
                  {service.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-gray-600 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* Not Included */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gray-50 rounded-2xl p-8 border border-gray-200"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              포함되지 않는 것 (셀러 직접 진행)
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {notIncluded.map((item) => (
                <div key={item.item} className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="font-medium text-gray-900 mb-1">{item.item}</p>
                  <p className="text-xs text-gray-500">{item.reason}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== ROADMAP ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-50 to-white border border-amber-100 rounded-full text-sm font-semibold text-amber-600 mb-6">
              <Calendar className="w-4 h-4" />
              3-MONTH ROADMAP
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              3개월 성공 로드맵
            </h2>
            <p className="text-gray-500 text-lg">
              체계적인 단계별 진행으로 <span className="font-medium text-gray-700">47일 만에 첫 매출</span>
            </p>
          </motion.div>

          <div className="space-y-8">
            {roadmap.map((phase, index) => (
              <motion.div
                key={phase.month}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  <div className="flex items-center gap-4 lg:w-64">
                    <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${phase.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                      <phase.icon className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold bg-gradient-to-r ${phase.color} bg-clip-text text-transparent`}>
                        {phase.month}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900">{phase.title}</h3>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {phase.tasks.map((task) => (
                        <div key={task} className="flex items-center gap-2 text-gray-600 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          {task}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`lg:w-48 p-4 rounded-xl bg-gradient-to-br ${phase.color} bg-opacity-10 border border-gray-100`}>
                    <p className="text-xs text-gray-500 mb-1">목표 결과</p>
                    <p className="font-bold text-gray-900">{phase.result}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== COMPARISON ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute bottom-1/3 left-0 w-72 h-72 bg-rose-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6">
              VS COMPARISON
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              혼자 vs PT와 함께
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xl"
          >
            <div className="grid grid-cols-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
              <div className="p-5 text-center text-sm font-medium text-gray-500">비교 항목</div>
              <div className="p-5 text-center text-sm font-bold text-gray-400">혼자 할 때</div>
              <div className="p-5 text-center text-sm font-bold text-[#E31837]">PT와 함께</div>
            </div>
            {comparison.map((row, index) => (
              <div key={row.item} className={`grid grid-cols-3 ${index !== comparison.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="p-5 text-center text-sm font-medium text-gray-700">{row.item}</div>
                <div className="p-5 text-center text-sm text-gray-400">{row.alone}</div>
                <div className="p-5 text-center text-sm font-bold text-[#E31837]">{row.withPT}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ==================== EXPERTS ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 right-0 w-80 h-80 bg-violet-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-full text-sm font-semibold text-violet-600 mb-6">
              <Award className="w-4 h-4" />
              EXPERT TEAM
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              검증된 전문가가 담당합니다
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              모든 PT사는 본인이 직접 <span className="font-medium text-gray-700">월 1억 이상</span> 달성한 경험이 있습니다
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {experts.map((expert, index) => (
              <motion.div
                key={expert.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${expert.color} flex items-center justify-center text-2xl font-bold text-white shadow-lg`}>
                    {expert.avatar}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{expert.name}</h3>
                    <p className="text-sm text-gray-500">{expert.role}</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{expert.experience}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{expert.achievement}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{expert.students}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {expert.specialties.map((specialty) => (
                    <span key={specialty} className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${expert.color} text-white`}>
                      {specialty}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PROCESS ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-amber-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 rounded-full text-sm font-semibold text-emerald-600 mb-6">
              <Rocket className="w-4 h-4" />
              HOW TO START
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              시작은 간단합니다
            </h2>
            <p className="text-gray-500 text-lg">
              <span className="font-medium text-gray-700">2분 신청</span> →{' '}
              <span className="font-medium text-gray-700">15분 상담</span> →{' '}
              <span className="font-medium text-gray-700">바로 시작</span>
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {process.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                whileHover={{ y: -4 }}
                className="relative"
              >
                <div className="bg-white rounded-2xl p-8 border border-gray-100 h-full shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all text-center">
                  <span className="text-5xl font-black bg-gradient-to-r from-gray-100 to-gray-200 bg-clip-text text-transparent">
                    {item.step}
                  </span>
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto my-4 shadow-lg`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-2 text-gray-900">{item.title}</h3>
                  <p className="text-gray-500 text-sm">{item.desc}</p>
                </div>
                {index < process.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-3 w-6 items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-gray-300" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section className="py-24 px-6 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#E31837]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-sm font-semibold text-rose-300 mb-6">
              <Sparkles className="w-4 h-4" />
              PRICING
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-white tracking-tight">
              잃을 게 없는 구조입니다
            </h2>
            <p className="text-gray-400 text-lg">
              매출 없으면 비용도 0원. 숨겨진 비용 없습니다.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-3xl p-10 sm:p-14 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10"
          >
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#E31837]/20 to-rose-500/20 border border-rose-500/30 mb-8">
                <CheckCircle className="w-4 h-4 text-rose-400" />
                <span className="font-medium text-sm text-rose-300">성공했을 때만 정산</span>
              </div>

              <div className="mb-10">
                <p className="text-gray-400 mb-2">초기 비용 / 셋업비 / 교육비</p>
                <p className="text-6xl sm:text-7xl font-black text-white mb-2">₩0</p>
                <p className="text-gray-500">매출 발생 전까지 완전 무료</p>
              </div>

              <div className="flex items-center justify-center gap-4 mb-10">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gray-700" />
                <span className="text-gray-500 text-sm">매출이 발생하면</span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gray-700" />
              </div>

              <div className="mb-12">
                <p className="text-8xl sm:text-9xl font-black bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
                  30%
                </p>
                <p className="text-gray-400 mt-2">순이익 기준 성과 보수</p>
              </div>

              {/* Guarantees */}
              <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-10">
                {guarantees.map((item) => (
                  <div key={item.title} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                    <item.icon className="w-5 h-5 flex-shrink-0 text-rose-400" />
                    <div className="text-left">
                      <p className="text-white text-sm font-medium">{item.title}</p>
                      <p className="text-gray-500 text-xs">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-10 py-5 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-lg shadow-xl shadow-rose-500/30 hover:shadow-2xl transition-all"
              >
                지금 무료 상담 신청하기
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== SUCCESS STORIES ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-0 w-80 h-80 bg-rose-100/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6">
              <Quote className="w-4 h-4" />
              SUCCESS STORIES
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              실제 성공 스토리
            </h2>
            <p className="text-gray-500 text-lg">
              숫자 뒤에 숨겨진 <span className="font-medium text-gray-700">진짜 이야기</span>
            </p>
          </motion.div>

          <div className="space-y-8">
            {successStories.map((story, index) => (
              <motion.div
                key={story.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50"
              >
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Profile */}
                  <div className="lg:w-64 flex-shrink-0">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${story.color} flex items-center justify-center text-2xl font-bold text-white shadow-lg`}>
                        {story.avatar}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{story.name}</h3>
                        <p className="text-sm text-gray-500">{story.age} · {story.job}</p>
                      </div>
                    </div>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${story.color} text-white`}>
                      {story.category}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    {/* Before */}
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                        <X className="w-4 h-4" /> BEFORE
                      </h4>
                      <p className="text-gray-600 mb-3">{story.before.situation}</p>
                      <div className="flex flex-wrap gap-2">
                        {story.before.problems.map((problem) => (
                          <span key={problem} className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                            {problem}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Story */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl border-l-4 border-[#E31837]">
                      <p className="text-gray-700 italic">"{story.story}"</p>
                    </div>

                    {/* Key Change */}
                    <div className="mb-6">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium">
                        <Sparkles className="w-4 h-4" />
                        핵심 변화: {story.keyChange}
                      </span>
                    </div>
                  </div>

                  {/* After */}
                  <div className={`lg:w-48 p-6 rounded-xl bg-gradient-to-br ${story.color} text-white`}>
                    <h4 className="text-sm font-bold text-white/80 mb-4 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> AFTER ({story.after.period})
                    </h4>
                    <p className="text-3xl font-black mb-2">{story.after.revenue}</p>
                    <p className="text-sm text-white/80">{story.after.profit}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute bottom-1/3 right-0 w-72 h-72 bg-violet-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-3xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6">
              <HelpCircle className="w-4 h-4" />
              FAQ
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              자주 묻는 질문
            </h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                faq={faq}
                index={index}
                openIndex={openFAQ}
                setOpenIndex={setOpenFAQ}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="py-24 px-6 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#E31837]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-white tracking-tight">
              다음 달에도
              <br />
              <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
                0원이실 건가요?
              </span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 max-w-lg mx-auto">
              상담은 무료입니다. 부담 없이 내 사업의 가능성을 확인하세요.
              <br />
              <span className="text-white font-medium">
                지금 신청하면 48시간 내 전문가가 연락드립니다.
              </span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-10 py-5 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-lg shadow-xl shadow-rose-500/30 hover:shadow-2xl transition-all flex items-center gap-2"
              >
                <Phone className="w-5 h-5" />
                지금 무료 상담받기
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-10 py-5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-medium text-lg hover:bg-white/20 transition-all flex items-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                카톡 문의
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="py-12 px-6 border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/30">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">쿠팡 셀러허브</span>
          </div>
          <p className="text-gray-400 text-sm">© 2025 쿠팡 셀러허브. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
