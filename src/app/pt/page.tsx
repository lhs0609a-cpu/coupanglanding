'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  Calculator,
  CheckCircle,
  ChevronDown,
  Clock,
  FileText,
  HandCoins,
  HelpCircle,
  Lightbulb,
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
  TrendingUp,
  UserCheck,
  X,
  XCircle,
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
  { icon: AlertTriangle, text: '상품 30개 올렸는데 2주째 주문 0건...', color: 'from-[#E31837] to-red-700' },
  { icon: Search, text: '유튜브 보고 광고 돌렸는데 30만원 날림...', color: 'from-[#E31837] to-red-700' },
  { icon: BarChart3, text: '뭐가 문제인지 모르겠음... 카테고리? 가격? 키워드?', color: 'from-[#E31837] to-red-700' },
  { icon: Briefcase, text: '본업 있는데 쿠팡까지 할 시간이 없음...', color: 'from-[#E31837] to-red-700' },
];

const beforeAfterData = {
  before: ['유튜브 무료 강의로 독학 → 정보가 구식이거나 상황에 안 맞음', '카테고리, 키워드, 가격 전부 감으로 → 데이터 없이 추측', '광고비 100만원 이상 낭비 → ROAS 개념 없이 돈만 태움', '3개월째 매출 0원 → 뭐가 문제인지도 모름'],
  after: ['데이터 기반 카테고리 선정 → 검증된 시장에서 시작', 'AI 도구로 상품명·가격·태그 자동 최적화', '첫 달부터 매출 가능 → 평균 6주 내 첫 주문', '3개월 내 월 300만원+ 목표 (보수적 기준)'],
};

const processSteps = [
  { step: 1, title: '무료 상담', desc: '현재 상황 파악, 목표 설정', detail: '전화 또는 화상으로 15분 상담. 현재 상황과 목표를 부담 없이 함께 정리합니다.', icon: Phone, color: 'from-[#E31837] to-red-700' },
  { step: 2, title: '전문가 매칭', desc: '카테고리별 전문 PT사 배정', detail: '희망 카테고리에 실전 경험이 있는 전문가를 배정합니다. 직접 판매 중인 현역 셀러입니다.', icon: UserCheck, color: 'from-[#E31837] to-red-700' },
  { step: 3, title: '시장 분석 & 상품 선정', desc: '데이터 기반 상품 발굴', detail: '데이터 기반으로 경쟁 강도, 마진율, 트렌드를 분석해 상품을 선정합니다.', icon: Search, color: 'from-[#E31837] to-red-700' },
  { step: 4, title: 'AI 도구로 상품 등록 & 최적화', desc: 'SEO 최적화, 이미지, 상세페이지', detail: 'AI 상품명 생성, 키워드 최적화, 전환율 높은 상세페이지를 함께 제작합니다. 이 도구는 저희가 직접 개발하고 매일 사용합니다.', icon: FileText, color: 'from-[#E31837] to-red-700' },
  { step: 5, title: '광고 세팅 & ROAS 관리', desc: '쿠팡 광고 최적화', detail: '쿠팡 광고 세팅부터 ROAS 최적화까지. 예산 대비 최고 효율을 만듭니다.', icon: Rocket, color: 'from-[#E31837] to-red-700' },
  { step: 6, title: '투명 정산', desc: '매출 나야 비용 발생', detail: '매월 상세 정산 리포트를 공유하고, 순이익의 30%만 정산합니다. 매출이 없으면 비용도 0원입니다.', icon: HandCoins, color: 'from-[#E31837] to-red-700' },
];

const revenueModelItems = [
  { label: '초기 비용', value: '0원', sub: '선투자 없음. 셋업비, 교육비 모두 무료.', icon: ShieldCheck, highlight: false },
  { label: '수익 발생 시', value: '순이익의 30%', sub: '매출이 아닌 순이익 기준. 원가, 배송비, 광고비 제외 후 계산.', icon: HandCoins, highlight: true },
  { label: '수익 미발생', value: '0원', sub: '리스크 없음. 매출 없으면 1원도 청구하지 않습니다.', icon: Shield, highlight: false },
];

const storyTimeline = [
  { phase: '33세', text: '돈이 필요했습니다. 모아놓은 돈도 없고, 집도 차도 아무것도 없었습니다. 일은 꾸준히 했습니다. 그냥 돈 쓰는 감각이 안 좋았던 겁니다. 미래에 대한 막연한 두려움이 매일 밤 밀려왔습니다.', emotion: 'dark' as const },
  { phase: '위기', text: '그렇게 뭔가를 알아보던 중, 가족이 빚을 졌습니다. 큰 돈이 필요했습니다. 이건 진짜 안 되겠다 싶어서 부업을 빨리 알아봤습니다.', emotion: 'crisis' as const },
  { phase: '도전', text: '쿠팡 브랜드리스를 알게 됐습니다. 강의 들을 돈도 없어서 3개월 동안 독학했습니다. 진짜 열심히 했습니다. 매출이 나오긴 했습니다. 하지만 이 상황을 타개할 만한 매출은 아니었습니다.', emotion: 'hope' as const },
  { phase: '한계', text: '손으로 해봤자 한계가 있었습니다. 하루에 올릴 수 있는 상품 수가 정해져 있었고, 시간은 부족했고, 매출은 제자리였습니다.', emotion: 'struggle' as const },
  { phase: '전환점', text: '주변에 아는 개발자분과 함께 자동화 프로그램을 만들기 시작했습니다. 상품 등록을 자동화하고, AI로 카테고리를 매칭하고, 가격을 자동 계산했습니다. 그리고 돌렸습니다.', emotion: 'turning' as const },
  { phase: '돌파', text: '매출이 말도 안 되게 올라갔습니다. 안 좋은 상황을 해결했습니다. 빚을 갚았습니다. 처음으로 숨통이 트였습니다.', emotion: 'success' as const },
  { phase: '확산', text: '누나에게 알려줬습니다. 누나 친구분 중 상황이 힘든 분도 이 프로그램을 시작했습니다. 지금 거의 다 해결되어 가고 있습니다.', emotion: 'success' as const },
  { phase: '지금', text: '돈이 간절하신 분들한테 정말 좋을 것 같습니다. 인풋 대비 아웃풋이 정말 좋습니다. 4, 50대 60대 분도 충분히 할 수 있게 만들어 드리겠습니다.', emotion: 'peak' as const },
];

const testimonials = [
  {
    name: '김*훈', initial: '김', category: '의류', period: '3개월', before: '0원', after: '월 680만원',
    quote: '처음에는 반신반의했어요. 근데 PT사님이 데이터로 하나하나 보여주시면서 방향을 잡아주시더라고요. 혼자 했으면 절대 못 찾았을 카테고리에서 첫 매출이 나왔습니다.',
    gradient: 'from-[#E31837] to-red-700',
    journey: [
      { phase: '신청 전', text: '"진짜 될까?" 반신반의로 상담 신청', emotion: 'doubt' as const },
      { phase: '1개월', text: 'PT사님이 데이터로 카테고리 분석', emotion: 'learn' as const },
      { phase: '2개월', text: '첫 주문 알림! 손이 떨렸습니다', emotion: 'excited' as const },
      { phase: '3개월', text: '월 680만원. 회사 월급보다 많아졌습니다', emotion: 'success' as const },
    ],
  },
  {
    name: '이*영', initial: '이', category: '생활용품', period: '4개월', before: '월 120만원', after: '월 920만원',
    quote: '혼자 하다가 한계를 느끼고 신청했어요. PT사님이 제 상품 분석해주시는데 마진이 안 나오는 구조를 정확하게 짚어주시더라고요. 상품 라인을 바꾸니까 매출이 확 뛰었습니다.',
    gradient: 'from-[#E31837] to-red-700',
    journey: [
      { phase: '신청 전', text: '"혼자 하다 한계... 도움이 필요하다"', emotion: 'doubt' as const },
      { phase: '1개월', text: '마진 구조 분석 → 상품 라인 교체', emotion: 'learn' as const },
      { phase: '2개월', text: '매출 상승 시작! 방향이 맞았습니다', emotion: 'excited' as const },
      { phase: '4개월', text: '월 920만원. 매출이 확 뛰었습니다', emotion: 'success' as const },
    ],
  },
  {
    name: '박*수', initial: '박', category: '주방용품', period: '3개월', before: '부업 시작', after: '월 540만원',
    quote: '직장 다니면서 시간이 없어서 엄두를 못 냈는데, PT사님이 시간 많이 드는 건 대행해주시고 제가 결정만 하면 되니까 가능하더라고요. 주 5시간 정도만 투자하고 있습니다.',
    gradient: 'from-[#E31837] to-red-700',
    journey: [
      { phase: '신청 전', text: '"직장 다니면서 가능할까?" 시간 걱정', emotion: 'doubt' as const },
      { phase: '1개월', text: '핵심 결정만 내가, 나머지는 PT사님이', emotion: 'learn' as const },
      { phase: '2개월', text: '주 5시간 투자로 첫 수익 발생', emotion: 'excited' as const },
      { phase: '3개월', text: '월 540만원. 부업이 본업을 넘었습니다', emotion: 'success' as const },
    ],
  },
];

const notForItems = [
  { text: '이미 월 3천만원 이상 매출인 분', icon: BarChart3 },
  { text: '즉시 수익을 원하시는 분 (최소 4-8주 소요)', icon: Clock },
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
  { q: 'PT사는 어떤 분이 배정되나요?', a: '판매하실 카테고리에 맞는 전문가가 배정됩니다. 모든 PT사는 직접 쿠팡에서 판매하고 있는 현역 셀러입니다. 이론이 아닌, 지금도 매일 매출을 만들고 있는 분들이 함께합니다.' },
  { q: '3개월 후에는 어떻게 되나요?', a: '3개월 후에는 연장 또는 독립 중 선택하실 수 있습니다. 독립을 원하시면 그동안 배운 노하우로 혼자 운영하시면 되고, 연장을 원하시면 동일 조건으로 계속 함께할 수 있습니다.' },
  { q: '어떤 카테고리가 잘 되나요?', a: '상담에서 PT사와 함께 데이터 기반으로 분석하는 게 가장 정확합니다. 시장 상황은 계속 변하기 때문에 현재 시점에 가장 유망한 카테고리를 함께 찾아드립니다.' },
  { q: '부업으로도 가능한가요?', a: '네, 충분히 가능합니다. 실제로 직장 다니시면서 시작하시는 분이 많습니다. 주 5-10시간 정도만 투자하시면 됩니다. 시간이 많이 드는 작업은 PT사가 도와드리거나 대행합니다.' },
  { q: '해외에서도 가능한가요?', a: '쿠팡 판매를 위해서는 한국 사업자등록증이 필요합니다. 해외 거주라도 한국 사업자가 있으시면 진행 가능합니다.' },
  { q: '정산은 어떻게 하나요?', a: '매월 1회 정산합니다. 해당 월의 쿠팡 정산금에서 상품 원가, 배송비, 광고비 등을 차감한 순이익의 30%를 정산합니다. 상세한 엑셀 리포트를 함께 제공합니다.' },
  { q: 'PT사분들은 직접 쿠팡에서 판매하시나요?', a: '네, 저희 파트너 전원이 현재도 쿠팡에서 직접 판매하고 있습니다. 하루 매출 1,680만원 이상을 직접 만들고 있고, 그 과정에서 사용하는 도구와 방법을 그대로 공유합니다.' },
  { q: '왜 소수만 모집하나요?', a: '저희도 직접 판매를 병행하고 있어서, 한 번에 많은 분을 케어하기 어렵습니다. 대신 함께하는 분께는 100% 집중해서 결과를 만들어 드립니다.' },
];

// ============================================================
// KAKAO CHAT DATA — 각 섹션별 대화
// ============================================================
const empathyKakao: ChatMsg[] = [
  { name: '누나', text: '야 그거 아직도 해?', time: '오후 11:42' },
  { text: '상품 올리고 있어', time: '오후 11:43', isMine: true },
  { name: '누나', text: '그거 3개월째잖아', time: '오후 11:43' },
  { name: '누나', text: '한 건도 안 팔렸다며...', time: '오후 11:44' },
  { text: '...', time: '오후 11:50', isMine: true },
];

const empathyKakao2: ChatMsg[] = [
  { name: '친구', text: '쿠팡 셀러? ㅋㅋ 그거 돈 되냐', time: '오후 6:22' },
  { text: '아직은... 근데 가능성은 있어', time: '오후 6:24', isMine: true },
  { name: '친구', text: '그거 다 사기래', time: '오후 6:24' },
  { name: '친구', text: '주변에 성공한 사람 봤어?', time: '오후 6:25' },
  { text: '읽음', isSystem: true, time: '' },
];

const storyWigiKakao: ChatMsg[] = [
  { name: '누나', text: '야... 얘기 좀 해야돼', time: '오후 10:22' },
  { text: '무슨 일이야', time: '오후 10:23', isMine: true },
  { name: '누나', text: '집에 빚이 좀 생겼어', time: '오후 10:24' },
  { name: '누나', text: '큰 돈이야', time: '오후 10:24' },
  { text: '...얼마나', time: '오후 10:30', isMine: true },
];

const storyDojeonKakao: ChatMsg[] = [
  { text: '3개월째 독학 중인데', time: '오전 1:42', isMine: true },
  { text: '매출은 나오긴 하는데', time: '오전 1:42', isMine: true },
  { text: '이걸로는 턱없이 부족해', time: '오전 1:43', isMine: true },
  { name: '친구', text: '너 새벽에 또 그거야?', time: '오전 1:50' },
  { name: '친구', text: '좀 자라 진짜', time: '오전 1:50' },
];

const storyHangyeKakao: ChatMsg[] = [
  { text: '하루에 올릴 수 있는 상품이 한계야', time: '오후 11:38', isMine: true },
  { text: '시간은 없고 매출은 제자리', time: '오후 11:38', isMine: true },
  { text: '손으로 하는 건 진짜 한계다', time: '오후 11:39', isMine: true },
  { name: '친구', text: '그래서 어쩔 건데', time: '오후 11:42' },
  { text: '...방법을 찾아야 해', time: '오후 11:45', isMine: true },
];

const storyJeonHwanKakao: ChatMsg[] = [
  { text: '형 자동화 프로그램 만들 수 있어요?', time: '오후 3:22', isMine: true },
  { name: '개발자', text: '어떤 거?', time: '오후 3:25' },
  { text: '상품 등록이랑 카테고리 매칭', time: '오후 3:26', isMine: true },
  { text: '가격 계산도 자동으로', time: '오후 3:26', isMine: true },
  { name: '개발자', text: '해볼 수 있을 것 같은데', time: '오후 3:28' },
  { text: '꼭 좀 부탁드립니다 진짜', time: '오후 3:28', isMine: true },
];

const storyDolPaKakao: ChatMsg[] = [
  { text: '주문 알림 폭주', isSystem: true, time: '' },
  { text: '!!!!!!!!!!!', time: '오전 5:47', isMine: true },
  { text: '매출이 말도 안 되게 올라가고 있어', time: '오전 5:47', isMine: true },
  { name: '친구', text: '뭐?? 얼마나?', time: '오전 5:50' },
  { text: '빚 갚을 수 있을 것 같아', time: '오전 5:51', isMine: true },
  { text: '처음으로 숨통이 트인다', time: '오전 5:51', isMine: true },
];

const beforeKakao: ChatMsg[] = [
  { text: '쿠팡 3개월째인데 주문 0건이야', time: '오후 8:12', isMine: true },
  { name: '친구', text: '유튜브 보고 했어?', time: '오후 8:14' },
  { text: 'ㅇㅇ 유튜브에서 배운대로 했는데...', time: '오후 8:14', isMine: true },
  { name: '친구', text: 'ㅠㅠ 그거 다 옛날 정보래', time: '오후 8:15' },
  { text: '광고비 100만원도 날렸어', time: '오후 8:15', isMine: true },
];

const afterKakao: ChatMsg[] = [
  { text: '야!!!!!!', time: '오후 9:47', isMine: true },
  { text: '오늘 주문 42건 들어왔어', time: '오후 9:47', isMine: true },
  { name: '친구', text: '뭐???? 진짜??', time: '오후 9:48' },
  { text: 'PT사님이 카테고리 바꿔주시고', time: '오후 9:48', isMine: true },
  { text: 'AI로 상품명 최적화하니까 바로 나옴', time: '오후 9:49', isMine: true },
  { name: '친구', text: '...나도 해보고 싶다', time: '오후 9:50' },
];

const processKakao: ChatMsg[] = [
  { name: 'PT사', text: '안녕하세요! 현재 쿠팡 판매 경험이 있으신가요?', time: '오후 2:00' },
  { text: '아뇨 처음이에요. 가능할까요?', time: '오후 2:01', isMine: true },
  { name: 'PT사', text: '충분히 가능합니다', time: '오후 2:01' },
  { name: 'PT사', text: '관심 있는 카테고리가 있으세요?', time: '오후 2:02' },
  { text: '생활용품이요', time: '오후 2:02', isMine: true },
  { name: 'PT사', text: '좋습니다! 데이터 먼저 확인해 볼게요', time: '오후 2:03' },
  { name: 'PT사', text: '내일까지 분석 결과 보내드릴게요', time: '오후 2:03' },
];

const successKakao1: ChatMsg[] = [
  { name: 'PT사', text: '김*훈님, 이 카테고리 데이터 보세요', time: '오후 3:15' },
  { name: 'PT사', text: '경쟁강도 낮고 수요 꾸준합니다', time: '오후 3:15' },
  { text: '오 진짜요? 여기 생각도 못했는데', time: '오후 3:17', isMine: true },
  { text: '2개월 후', isSystem: true, time: '' },
  { text: 'PT사님!!!! 첫 주문 들어왔어요!!!!', time: '오전 6:12', isMine: true },
  { name: 'PT사', text: '축하드립니다!!', time: '오전 6:15' },
  { text: '손이 떨려요 진짜ㅠㅠ', time: '오전 6:15', isMine: true },
];

const successKakao2: ChatMsg[] = [
  { name: 'PT사', text: '이*영님, 현재 마진 구조를 보니까', time: '오후 4:20' },
  { name: 'PT사', text: '이 상품은 팔아도 남는 게 없어요', time: '오후 4:20' },
  { text: '네?? 그럼 어쩌죠', time: '오후 4:22', isMine: true },
  { name: 'PT사', text: '상품 라인을 이쪽으로 바꿔보죠', time: '오후 4:23' },
  { text: '3개월 후', isSystem: true, time: '' },
  { text: '이번 달 920만원이에요!!', time: '오후 8:31', isMine: true },
  { text: 'PT사님 말 듣길 잘했어요ㅠ', time: '오후 8:32', isMine: true },
];

const successKakao3: ChatMsg[] = [
  { text: '저 직장 다니면서 가능할까요?', time: '오전 9:05', isMine: true },
  { text: '하루에 1시간도 힘들 수 있는데...', time: '오전 9:05', isMine: true },
  { name: 'PT사', text: '충분합니다. 시간 드는 건 제가 대행할게요', time: '오전 9:10' },
  { name: 'PT사', text: '핵심 결정만 내려주세요', time: '오전 9:10' },
  { text: '3개월 후', isSystem: true, time: '' },
  { text: '부업이 본업 월급 넘었습니다...', time: '오후 10:15', isMine: true },
  { text: '주 5시간밖에 안 쓰는데ㅠㅠ', time: '오후 10:15', isMine: true },
];

const ctaKakao: ChatMsg[] = [
  { text: '3개월 전', isSystem: true, time: '' },
  { text: '이거 진짜 되는 거야...?', time: '오전 11:30', isMine: true },
  { text: '오늘', isSystem: true, time: '' },
  { text: '이번 달 매출 680만원이야', time: '오후 7:42', isMine: true },
  { name: '친구', text: '...진짜?', time: '오후 7:43' },
  { text: '그때 신청 안 했으면', time: '오후 7:43', isMine: true },
  { text: '아직도 유튜브 보면서 혼자 삽질하고 있었을거야', time: '오후 7:44', isMine: true },
];

const successKakaoMap = [successKakao1, successKakao2, successKakao3];

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
    <motion.a href={href} whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>{children}</motion.a>
  );
}

function InitialAvatar({ initial, size = 'md' }: { initial: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-14 h-14 text-base' };
  return (<div className={`${s[size]} rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center text-white font-bold shadow-lg`}>{initial}</div>);
}

// ============================================================
// MOCKUP: 카카오톡 채팅
// ============================================================
type ChatMsg = { name?: string; text: string; time: string; isMine?: boolean; isSystem?: boolean };

function KakaoChat({ messages }: { messages: ChatMsg[] }) {
  return (
    <div className="mt-4 rounded-2xl overflow-hidden border border-white/15 max-w-[280px] shadow-xl">
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
// MOCKUP: 폰 알림 (다크 배경용)
// ============================================================
function PhoneNotif({ icon, app, title, lines, time = '방금', className = '' }: { icon: string; app: string; title: string; lines: string[]; time?: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3 max-w-[260px] ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs">{icon}</span>
        <span className="text-[10px] text-gray-400 font-medium">{app}</span>
        <span className="text-[10px] text-gray-500 ml-auto">{time}</span>
      </div>
      <p className="text-[12px] font-bold text-white mb-0.5">{title}</p>
      {lines.map((line, i) => (<p key={i} className="text-[11px] text-gray-400 leading-snug">{line}</p>))}
    </div>
  );
}

// ============================================================
// MOCKUP: 통장 입금 알림 (라이트 배경용)
// ============================================================
function BankDeposit({ amount, memo, balance }: { amount: string; memo: string; balance?: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-md p-3 max-w-[240px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md bg-[#FFCC00] flex items-center justify-center"><span className="text-[10px] font-bold text-gray-900">KB</span></div>
        <span className="text-[10px] text-gray-500 font-medium">KB국민은행</span>
        <span className="text-[10px] text-gray-400 ml-auto">방금</span>
      </div>
      <p className="text-[13px] font-extrabold text-[#E31837] mb-0.5">입금 {amount}</p>
      <p className="text-[11px] text-gray-500">{memo}</p>
      {balance && <p className="text-[10px] text-gray-400 mt-1">잔액 {balance}</p>}
    </div>
  );
}

// ============================================================
// SCREENSHOT IMAGE: 쿠팡 셀러 매출 대시보드
// ============================================================
function CoupangSellerDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-r from-rose-100/50 via-red-100/30 to-red-100/50 rounded-[32px] blur-2xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 윙 - 판매분석" />
        <img src="/images/screenshots/20260112_094546.png" alt="쿠팡 윙 판매분석 - 일 판매량 415건, 일 매출 ₩16,803,220" className="w-full" />
      </div>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
        className="absolute -right-3 top-14 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-[#E31837]" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">매출 달성!</div><div className="text-[10px] text-gray-400">일 매출 1,680만원 돌파</div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 }}
        className="absolute -left-3 bottom-24 bg-white rounded-xl border border-gray-200 shadow-xl p-3 flex items-center gap-2.5 z-10 hidden sm:flex">
        <div className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center"><Star className="w-4 h-4 text-[#E31837]" /></div>
        <div><div className="text-[11px] font-bold text-gray-800">직접 검증</div><div className="text-[10px] text-gray-400">실제 판매 데이터</div></div>
      </motion.div>
    </div>
  );
}

// ============================================================
// SCREENSHOT IMAGE: 쿠팡 자동화 대시보드
// ============================================================
function CoupangAutomationDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-red-100/40 via-red-100/20 to-red-100/40 rounded-[28px] blur-xl" />
      <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
        <WindowChrome title="쿠팡 자동화 - 자동 등록" />
        <img src="/images/screenshots/chrome_6MyaK5awma.png" alt="쿠팡 자동화 - 자동 등록 화면 (1,004건 대기, 122건 처리중)" className="w-full" />
      </div>
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
  const stat1 = useCountUp(1680, 2000);
  const stat2 = useCountUp(415);

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
              <a href={CTA_URL} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all flex items-center gap-1.5"><LogIn className="w-4 h-4" />로그인</a>
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
                  <a href={CTA_URL} onClick={handleNavClick} className="block px-4 py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-center shadow-lg">무료 상담 신청</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* S1. HERO */}
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
                쿠팡 매출,<br />
                <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">혼자 만들지 마세요.</span>
              </motion.h1>
              <motion.p variants={fadeUp} custom={2} className="text-lg sm:text-xl text-gray-500 max-w-xl leading-relaxed mb-10">
                하루 매출 1,680만원을 만든 전문가가<br className="hidden sm:block" />당신 옆에서 <span className="font-semibold text-gray-800">같이 합니다.</span>
              </motion.p>
              <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-start gap-4 mb-10">
                <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청<ArrowRight className="w-5 h-5" /></CTAButton>
                <CTAButton href="#story" variant="ghost" size="lg">우리의 이야기 보기<ChevronDown className="w-5 h-5" /></CTAButton>
              </motion.div>
              <motion.div variants={fadeUp} custom={4} className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {['김', '이', '박'].map((init, i) => (<div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-md">{init}</div>))}
                </div>
                <div><p className="text-sm font-semibold text-gray-800">소수 정예로 운영합니다</p><p className="text-xs text-gray-500">직접 판매하는 전문가가 1:1로 함께합니다</p></div>
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
            <div className="text-center" ref={stat1.ref}><div className="flex items-center justify-center mb-2"><HandCoins className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">&#8361;{stat1.count.toLocaleString()}만</span></div><span className="text-sm text-gray-500 font-medium">직접 검증 일 매출</span></div>
            <div className="text-center" ref={stat2.ref}><div className="flex items-center justify-center mb-2"><BarChart3 className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">{stat2.count}건</span></div><span className="text-sm text-gray-500 font-medium">일간 판매 건수</span></div>
            <div className="text-center"><div className="flex items-center justify-center mb-2"><UserCheck className="w-5 h-5 text-[#E31837] mr-2" /><span className="text-3xl sm:text-4xl font-extrabold text-gray-900">1:1 전담</span></div><span className="text-sm text-gray-500 font-medium">소수 정예 코칭</span></div>
          </div>
        </div>
      </section>

      {/* S3. 공감 섹션 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-rose-50 border-rose-200/60 text-[#E31837] mb-6">공감</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">이런 경험, 있으시죠?</motion.h2>
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
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={scaleIn} className="flex justify-center mb-10">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden max-w-xs w-full">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="w-4 h-4 rounded bg-gradient-to-br from-[#E31837] to-[#ff4d6a]" />
                <span className="text-[11px] text-gray-400 font-medium">쿠팡 윙 - 주문관리</span>
              </div>
              <div className="px-6 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-2xl font-extrabold text-gray-200 mb-1">주문 0건</p>
                <p className="text-xs text-gray-400">최근 30일간 접수된 주문이 없습니다</p>
              </div>
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 text-center">상품 32개 등록됨 · 광고 진행 중</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="mb-12">
            <motion.p variants={fadeUp} className="text-center text-sm font-medium text-gray-400 mb-6">그리고 주변의 반응은...</motion.p>
            <div className="grid sm:grid-cols-2 gap-6 max-w-xl mx-auto">
              <motion.div variants={scaleIn} custom={0}>
                <KakaoChat messages={empathyKakao} />
              </motion.div>
              <motion.div variants={scaleIn} custom={1}>
                <KakaoChat messages={empathyKakao2} />
              </motion.div>
            </div>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center">
            <p className="text-xl font-bold text-gray-800 mb-2">이 화면, 이 대화... 익숙하시죠?</p>
            <p className="text-lg font-semibold text-[#E31837]">저희도 똑같았습니다. 그리고 답을 찾았습니다.</p>
          </motion.div>
        </div>
      </section>

      {/* S4. OUR STORY — "우리가 이 서비스를 만든 이유" */}
      <section id="story" className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-[#E31837]/8 rounded-full blur-[150px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[120px]" />
        </div>
        <div className="max-w-4xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-white/10 border-white/10 text-rose-300 mb-6">OUR STORY</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-5">우리가 이 서비스를 만든 이유</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-400 text-lg max-w-2xl mx-auto">우리도 당신과 같은 자리에서 시작했습니다.</motion.p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-gray-700 via-gray-600 to-[#E31837]/50" />
            <div className="space-y-0">
              {storyTimeline.map((item, i) => {
                const styles = {
                  dark: { dot: 'bg-gray-600 border-gray-500', badge: 'bg-gray-800 text-gray-400 border-gray-700', text: 'text-gray-400' },
                  hope: { dot: 'bg-[#E31837] border-red-400', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-gray-300' },
                  struggle: { dot: 'bg-red-400 border-red-400', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-gray-400' },
                  crisis: { dot: 'bg-red-500 border-red-400 animate-pulse', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-gray-300' },
                  turning: { dot: 'bg-[#E31837] border-red-400', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-gray-300' },
                  success: { dot: 'bg-red-500 border-red-400', badge: 'bg-red-900/50 text-red-300 border-red-700', text: 'text-red-200/80' },
                  peak: { dot: 'bg-gradient-to-r from-[#E31837] to-[#ff4d6a] border-rose-400 animate-pulse', badge: 'bg-rose-900/50 text-rose-300 border-rose-700', text: 'text-white' },
                };
                const s = styles[item.emotion];
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="relative pl-16 sm:pl-20 pb-8 sm:pb-10">
                    <div className={`absolute left-[18px] sm:left-[26px] top-1 w-4 h-4 rounded-full border-2 ${s.dot} z-10`} />
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mb-2.5 ${s.badge}`}>{item.phase}</div>
                    <p className={`text-[15px] sm:text-base leading-relaxed ${s.text} ${item.emotion === 'peak' ? 'font-semibold' : ''}`}>{item.text}</p>
                    {i === 1 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
                        <KakaoChat messages={storyWigiKakao} />
                      </motion.div>
                    )}
                    {i === 2 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="mt-3 space-y-3">
                        <PhoneNotif icon="📊" app="쿠팡 윙" title="판매 현황" time="오늘" lines={['이번 달 매출: ₩380,000', '목표 대비: 3.8%', '남은 빚: ₩42,000,000']} />
                        <KakaoChat messages={storyDojeonKakao} />
                      </motion.div>
                    )}
                    {i === 3 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
                        <KakaoChat messages={storyHangyeKakao} />
                      </motion.div>
                    )}
                    {i === 4 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
                        <KakaoChat messages={storyJeonHwanKakao} />
                      </motion.div>
                    )}
                    {i === 5 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
                        <KakaoChat messages={storyDolPaKakao} />
                      </motion.div>
                    )}
                    {i === 5 && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5 }}
                        className="mt-4 rounded-xl border border-white/10 overflow-hidden max-w-sm">
                        <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center flex-shrink-0"><TrendingUp className="w-4 h-4 text-white" /></div>
                          <div><div className="text-xs font-bold text-white">실제 쿠팡 윙 판매분석</div><div className="text-[10px] text-gray-400">하루 415건 · ₩16,803,220</div></div>
                        </div>
                        <img src="/images/screenshots/20260112_094546.png" alt="쿠팡 윙 판매분석 - 일 판매량 415건, 일 매출 ₩16,803,220" className="w-full" />
                      </motion.div>
                    )}
                    {i === 5 && (
                      <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.8 }} className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2 max-w-sm">
                          <div className="rounded-xl border border-white/10 overflow-hidden">
                            <div className="bg-white/10 backdrop-blur-sm px-2 py-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] text-gray-400">ROAS 951%</span></div>
                            <img src="/images/results/ad-roi-951pct.png" alt="광고 수익률 951%" className="w-full" />
                          </div>
                          <div className="rounded-xl border border-white/10 overflow-hidden">
                            <div className="bg-white/10 backdrop-blur-sm px-2 py-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] text-gray-400">ROAS 642%</span></div>
                            <img src="/images/results/ad-roi-642pct.png" alt="광고 수익률 642%" className="w-full" />
                          </div>
                        </div>
                        <PhoneNotif icon="📦" app="쿠팡 윙" title="주문 접수" time="방금" lines={['프리미엄 주방도구 세트 5종 · ₩34,900']} />
                        <PhoneNotif icon="📦" app="쿠팡 윙" title="주문 접수" time="3분 전" lines={['생활용품 세트 3종 · ₩24,900']} className="opacity-70 scale-[0.97] origin-left" />
                        <PhoneNotif icon="📦" app="쿠팡 윙" title="주문 접수" time="7분 전" lines={['인테리어 소품 · ₩19,800']} className="opacity-40 scale-[0.94] origin-left" />
                      </motion.div>
                    )}
                    {i === 6 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
                        <KakaoChat messages={[
                          { text: '누나 이거 한번 해봐', time: '오후 8:12', isMine: true },
                          { text: '내가 다 세팅해줄게', time: '오후 8:12', isMine: true },
                          { name: '누나', text: '나 같은 사람도 돼?', time: '오후 8:15' },
                          { text: '당연하지', time: '오후 8:15', isMine: true },
                          { text: '3개월 후', isSystem: true, time: '' },
                          { name: '누나', text: '야ㅠㅠ 나 통장에 돈 들어왔어', time: '오전 11:47' },
                          { name: '누나', text: '내 친구도 알려줘도 돼?', time: '오전 11:48' },
                          { name: '누나', text: '그 친구도 상황이 좀 힘들거든...', time: '오전 11:48' },
                          { text: '당연하지. 알려줘', time: '오전 11:49', isMine: true },
                        ]} />
                      </motion.div>
                    )}
                    {item.emotion === 'peak' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="mt-5 grid grid-cols-3 gap-3">
                        {[{ label: '직접 검증 일 매출', value: '&#8361;1,680만', c: 'from-[#E31837] to-[#ff4d6a]' }, { label: '일간 판매', value: '415건', c: 'from-[#E31837] to-red-700' }, { label: '코칭 방식', value: '1:1 전담', c: 'from-[#E31837] to-red-700' }].map((stat) => (
                          <div key={stat.label} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-3 text-center">
                            <div className={`text-lg font-extrabold bg-gradient-to-r ${stat.c} bg-clip-text text-transparent`} dangerouslySetInnerHTML={{ __html: stat.value }} />
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
            <p className="text-lg text-gray-400 mb-4">가장 먼저 알려준 사람은, <span className="text-white font-bold">누나</span>였습니다.</p>
            <p className="text-xl sm:text-2xl font-extrabold text-white mb-3">직접 해봤고, 가족에게 알려줬고, 지금은 당신에게.</p>
            <p className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent mb-8">이제, 당신 차례입니다.</p>
            <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />나도 시작하기<ArrowRight className="w-5 h-5" /></CTAButton>
          </motion.div>
        </div>
      </section>

      {/* S5. REAL PROOF — 실제 화면 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-red-50 border-red-200/60 text-[#E31837] mb-6">REAL PROOF</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">이것은 저희의<br className="hidden sm:block" /> 실제 데이터입니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">스톡 이미지가 아닙니다. 저희가 매일 사용하는 쿠팡 윙 화면입니다.</motion.p>
          </motion.div>
          <div className="grid lg:grid-cols-2 gap-8">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInLeft}>
              <div className="mb-5"><h3 className="text-xl font-bold text-gray-900 mb-1">AI 자동 등록 시스템</h3><p className="text-sm text-gray-500">상품 등록, 카테고리 매칭, 가격 계산까지 모두 자동</p></div>
              <CoupangAutomationDashboard />
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInRight}>
              <div className="mb-5"><h3 className="text-xl font-bold text-gray-900 mb-1">매출 분석 리포트</h3><p className="text-sm text-gray-500">투명한 매출/순이익 추적, 월별 성장 리포트</p></div>
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-red-100/40 via-red-100/20 to-red-100/40 rounded-[28px] blur-xl" />
                <div className="relative bg-white rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden">
                  <WindowChrome title="쿠팡 자동화 - 대시보드" />
                  <img src="/images/screenshots/chrome_GHfSYZNoVf.png" alt="쿠팡 자동화 대시보드 - 전체 상품 300개, 등록 추이 차트" className="w-full" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* 실제 매출 증거 갤러리 */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="mt-14">
            <motion.p variants={fadeUp} className="text-center text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">실제 쿠팡 셀러 대시보드 캡처</motion.p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { src: '/images/results/daily-sales-705m.png', label: '일 매출 705만원', sub: '133건 판매' },
                { src: '/images/results/ad-roi-642pct.png', label: 'ROAS 642%', sub: '광고 전환매출 211만원' },
                { src: '/images/results/ad-roi-951pct.png', label: 'ROAS 951%', sub: '광고 전환매출 250만원' },
                { src: '/images/results/cumulative-sales-4066m.png', label: '3개월 누적', sub: '매출 4,066만원' },
              ].map((item, i) => (
                <motion.div key={item.label} variants={scaleIn} custom={i} className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden hover:shadow-lg transition-all">
                  <div className="relative">
                    <img src={item.src} alt={item.label} className="w-full" />
                    <div className="absolute top-1.5 right-1.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/90 text-white text-[9px] font-bold">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />실제
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-bold text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.sub}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mt-10">
            <p className="text-base font-semibold text-gray-600">이 도구를 당신도 함께 사용하게 됩니다.</p>
          </motion.div>
        </div>
      </section>

      {/* S6. Before vs After */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-red-50 border-red-200/60 text-[#E31837] mb-6">COMPARE</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">혼자 vs 전문가와 함께</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">같은 시간, 같은 노력. 결과는 완전히 다릅니다.</motion.p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInLeft} className="rounded-2xl border border-gray-200 bg-gray-50 p-7 sm:p-9">
              <div className="flex items-center gap-3 mb-7"><div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center"><X className="w-5 h-5 text-gray-400" /></div><h3 className="text-xl font-bold text-gray-400">혼자 할 때</h3></div>
              <div className="space-y-5">{beforeAfterData.before.map((item, i) => (<div key={i} className="flex items-start gap-3"><XCircle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" /><span className="text-gray-400 line-through text-base leading-relaxed">{item}</span></div>))}</div>
              <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }} className="mt-6 pt-5 border-t border-gray-200">
                <p className="text-xs text-gray-400 font-medium mb-2">실제 대화</p>
                <KakaoChat messages={beforeKakao} />
              </motion.div>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={slideInRight} className="rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-7 sm:p-9 relative">
              <div className="absolute -top-3 right-6"><span className="inline-flex items-center px-3 py-1 rounded-full bg-[#E31837] text-white text-xs font-bold shadow-lg">추천</span></div>
              <div className="flex items-center gap-3 mb-7"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E31837] to-red-700 flex items-center justify-center shadow-lg"><CheckCircle className="w-5 h-5 text-white" /></div><h3 className="text-xl font-bold text-gray-900">전문가와 함께</h3></div>
              <div className="space-y-5">{beforeAfterData.after.map((item, i) => (<div key={i} className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-[#E31837] flex-shrink-0 mt-0.5" /><span className="text-gray-800 font-medium text-base leading-relaxed">{item}</span></div>))}</div>
              <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }} className="mt-6 pt-5 border-t border-red-100">
                <p className="text-xs text-[#E31837] font-medium mb-2">실제 대화</p>
                <KakaoChat messages={afterKakao} />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* S7. PROCESS — 6단계 */}
      <section id="process" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-white via-gray-50/40 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-red-50 border-red-200/60 text-[#E31837] mb-6">PROCESS</SectionBadge>
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
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mt-12">
            <p className="text-sm text-gray-500 mb-6">Step 4에서 사용하는 AI 도구는 <span className="font-semibold text-gray-700">저희가 직접 개발하고, 저희도 매일 사용하는 도구</span>입니다.</p>
            <div className="max-w-md mx-auto">
              <p className="text-xs text-gray-400 font-medium mb-3 text-left">Step 1 상담은 이런 느낌입니다</p>
              <KakaoChat messages={processKakao} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* S8. 수익 모델 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-16">
            <SectionBadge className="bg-rose-50 border-rose-200/60 text-[#E31837] mb-6">PRICING</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">0원으로 시작합니다</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-xl mx-auto">왜 0원이 가능할까요? — <span className="font-semibold text-gray-700">우리도 직접 판매하고 있기 때문입니다.</span></motion.p>
            <motion.p variants={fadeUp} custom={2} className="text-gray-500 text-sm max-w-lg mx-auto mt-3">당신이 성공하면 우리도 수익이 납니다. 당신이 못 벌면 우리도 0원입니다. 이것이 가장 정직한 구조입니다.</motion.p>
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
                <div className="flex items-center justify-between py-3"><span className="text-sm font-medium text-gray-700">내 순수익 (70%)</span><span className="text-2xl font-extrabold text-[#E31837]">{myShare}만원</span></div>
              </div>
              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm text-gray-500 leading-relaxed">혼자 했으면 3개월째 매출 0원일 수도 있습니다.<br /><span className="font-semibold text-[#E31837]">{myShare}만원은 전문가와 함께 만드는 수익</span>입니다.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* S9. 성공 사례 */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <SectionBadge className="bg-red-50 border-red-200/60 text-[#E31837] mb-6">SUCCESS STORIES</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">함께한 분들의 이야기</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg max-w-lg mx-auto">현재 소수 인원만 함께하고 있습니다.<br />한 분 한 분에게 집중하기 위해서입니다.</motion.p>
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
                            const es = { doubt: { dot: 'bg-gray-400', text: 'text-gray-500', icon: <HelpCircle className="w-3 h-3 text-white" /> }, learn: { dot: 'bg-[#E31837]', text: 'text-[#E31837]', icon: <Lightbulb className="w-3 h-3 text-white" /> }, excited: { dot: 'bg-red-400', text: 'text-red-600', icon: <Sparkles className="w-3 h-3 text-white" /> }, success: { dot: 'bg-red-500', text: 'text-[#E31837]', icon: <TrendingUp className="w-3 h-3 text-white" /> } };
                            const st = es[j.emotion];
                            return (<div key={ji} className="flex flex-col items-center text-center relative z-10 flex-1"><div className={`w-6 h-6 rounded-full ${st.dot} flex items-center justify-center shadow-sm`}>{st.icon}</div><span className={`text-xs font-bold mt-2 ${st.text}`}>{j.phase}</span><span className="text-xs text-gray-500 mt-1 leading-tight max-w-[140px]">{j.text}</span></div>);
                          })}
                        </div>
                      </div>
                      <div className="sm:hidden space-y-3">
                        {t.journey.map((j, ji) => {
                          const es = { doubt: { dot: 'bg-gray-400', text: 'text-gray-500', icon: <HelpCircle className="w-3 h-3 text-white" /> }, learn: { dot: 'bg-[#E31837]', text: 'text-[#E31837]', icon: <Lightbulb className="w-3 h-3 text-white" /> }, excited: { dot: 'bg-red-400', text: 'text-red-600', icon: <Sparkles className="w-3 h-3 text-white" /> }, success: { dot: 'bg-red-500', text: 'text-[#E31837]', icon: <TrendingUp className="w-3 h-3 text-white" /> } };
                          const st = es[j.emotion];
                          return (<div key={ji} className="flex items-start gap-3"><div className="flex flex-col items-center flex-shrink-0"><div className={`w-5 h-5 rounded-full ${st.dot} flex items-center justify-center`}>{st.icon}</div>{ji < t.journey.length - 1 && <div className="w-0.5 h-4 bg-gray-200 mt-1" />}</div><div className="min-w-0 -mt-0.5"><span className={`text-xs font-bold ${st.text}`}>{j.phase}</span><p className="text-xs text-gray-500 leading-tight">{j.text}</p></div></div>);
                        })}
                      </div>
                    </div>
                    <div className="relative pl-5 border-l-[3px] border-[#E31837]/20 mb-6"><Quote className="absolute -left-2.5 -top-1 w-5 h-5 text-[#E31837]/30" /><p className="text-gray-600 leading-relaxed text-[15px] italic">{t.quote}</p></div>
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 font-medium mb-2">PT사와의 실제 대화</p>
                      <KakaoChat messages={successKakaoMap[i]} />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100"><p className="text-xs text-gray-500 mb-0.5">Before</p><p className="text-sm font-bold text-gray-700">{t.before}</p></div>
                      <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                      <div className="px-4 py-2.5 rounded-xl bg-red-50 border border-red-100"><p className="text-xs text-[#E31837] mb-0.5">After ({t.period})</p><p className="text-sm font-bold text-red-700">{t.after}</p></div>
                    </div>
                    <div className="mt-4">
                      <BankDeposit amount={t.after.replace('월 ', '')} memo="쿠팡 정산금" />
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
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mt-10">
            <div className="max-w-lg mx-auto p-6 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-sm text-gray-600 leading-relaxed">솔직하게 말씀드립니다. 저희는 아직 대형 학원이 아닙니다.<br />대신, 한 분 한 분의 매출에 저희의 수익이 걸려있기 때문에<br /><span className="font-semibold text-gray-800">누구보다 진심으로 함께합니다.</span></p>
            </div>
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
            <SectionBadge className="bg-white/10 border-white/10 text-rose-300 mb-6">GUARANTEE</SectionBadge>
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

      {/* S12. FAQ */}
      <section id="faq" className="relative py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/60 to-white overflow-hidden scroll-mt-20">
        <div className="max-w-3xl mx-auto relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-12">
            <SectionBadge className="bg-red-50 border-red-200/60 text-[#E31837] mb-6">FAQ</SectionBadge>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-4">자주 묻는 질문</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-gray-500 text-lg">궁금한 점이 더 있으시면 상담에서 편하게 물어보세요.</motion.p>
          </motion.div>
          <div className="space-y-3">{faqData.map((item, i) => (<FAQAccordionItem key={i} item={item} index={i} openIndex={openFAQ} setOpenIndex={setOpenFAQ} />))}</div>
        </div>
      </section>

      {/* S13. FINAL CTA */}
      <section className="relative py-24 sm:py-32 px-5 sm:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"><div className="absolute top-[10%] left-[15%] w-[500px] h-[500px] bg-[#E31837]/10 rounded-full blur-[140px]" /></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div variants={fadeUp} custom={0} className="mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 border border-red-500/30">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>
                <span className="text-sm font-bold text-red-300">이번 달 모집 인원: 3명</span>
              </span>
            </motion.div>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">시작은 15분<br /><span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">무료 상담입니다.</span></motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-gray-400 text-lg mb-8 max-w-lg mx-auto leading-relaxed">부담 없이 현재 상황을 말씀해 주세요.<br />저희가 도움이 될 수 있는지, 솔직하게 말씀드리겠습니다.</motion.p>
            <motion.div variants={fadeUp} custom={3} className="max-w-xs mx-auto mb-10">
              <p className="text-xs text-gray-500 font-medium mb-3 text-left">3개월이면 이렇게 바뀝니다</p>
              <KakaoChat messages={ctaKakao} />
            </motion.div>
            <motion.p variants={fadeUp} custom={4} className="text-white font-medium text-base mb-8">지금 신청하시면 48시간 내 전문가가 연락드립니다.</motion.p>
            <motion.div variants={fadeUp} custom={5} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <CTAButton href={CTA_URL} size="lg"><Phone className="w-5 h-5" />무료 상담 신청하기<ArrowRight className="w-5 h-5" /></CTAButton>
            </motion.div>
            <motion.div variants={fadeUp} custom={5} className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {['초기비용 0원', '최소계약 없음', '직접 검증', '투명 정산'].map((text) => (<div key={text} className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-red-400" /><span className="text-sm text-gray-400">{text}</span></div>))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 sm:py-16 px-5 sm:px-8 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">S</span></div><span className="font-bold text-gray-900">쿠팡 셀러허브</span></Link>
            <nav className="flex items-center gap-6">
              {navLinks.map((link) => (<a key={link.href} href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{link.label}</a>))}
              <span className="hidden sm:block w-px h-4 bg-gray-200" />
              <Link href="/auth/login?type=signup" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">파트너 회원가입</Link>
              <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">관리자 로그인</Link>
            </nav>
            <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} 쿠팡 셀러허브</p>
          </div>
        </div>
      </footer>

      {/* FLOATING MOBILE CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-2xl shadow-gray-900/10 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-[#E31837] truncate">이번 달 잔여 3자리 &middot; 초기비용 0원</p><p className="text-sm font-bold text-gray-900 truncate">전문가와 함께 매출 만들기</p></div>
          <motion.a href={CTA_URL} whileTap={{ scale: 0.95 }} className="flex-shrink-0 px-5 py-3 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-sm shadow-lg shadow-rose-200/50">무료 상담</motion.a>
        </div>
      </div>
      <div className="h-20 md:hidden" />
    </main>
  );
}
