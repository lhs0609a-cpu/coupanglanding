'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Users, TrendingUp, CheckCircle, Shield, Phone, MessageCircle, Target, Award, Zap, ArrowRight, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const benefits = [
  {
    icon: Shield,
    title: '실패해도 손해 0원',
    description: '선투자 없이 시작. 매출 안 나오면 1원도 안 냅니다.',
  },
  {
    icon: Users,
    title: '검증된 전문가 배정',
    description: '월 1억 이상 셀러를 만든 PT사가 1:1로 붙습니다.',
  },
  {
    icon: Zap,
    title: '₩79만원 프로그램 무료',
    description: 'AI 대량등록 솔루션 Pro 플랜을 무제한 사용.',
  },
  {
    icon: Target,
    title: '돈 되는 상품만 분석',
    description: '레드오션은 피하고, 블루오션만 공략합니다.',
  },
];

const process = [
  { step: '01', title: '10분 전화상담', desc: '상황 파악 & 가능성 검토', icon: MessageCircle },
  { step: '02', title: '시장 분석 리포트', desc: '경쟁강도, 예상 마진 계산', icon: BarChart3 },
  { step: '03', title: '판매 전략 수립', desc: '상품 소싱부터 가격까지', icon: Target },
  { step: '04', title: '실행 & 관리', desc: 'PT사가 매주 성과 체크', icon: Users },
];

const testimonials = [
  {
    name: '김*현',
    business: '의류/패션',
    before: '0원',
    after: '2,400만원',
    period: '3개월',
    avatar: 'K',
    quote: '혼자 6개월 삽질한 거 3개월 만에 달성했어요',
  },
  {
    name: '이*수',
    business: '생활용품',
    before: '500만원',
    after: '3,200만원',
    period: '2개월',
    avatar: 'L',
    quote: '마진율 12%에서 23%로 올렸습니다',
  },
  {
    name: '박*진',
    business: '주방용품',
    before: '800만원',
    after: '5,100만원',
    period: '4개월',
    avatar: 'P',
    quote: '상품 선정을 완전 잘못하고 있었더라고요',
  },
];

const stats = [
  { value: '94%', label: '3개월 내 매출 발생', icon: TrendingUp },
  { value: '2.8배', label: '평균 매출 성장률', icon: BarChart3 },
  { value: '47일', label: '첫 매출까지 평균', icon: Clock },
];

export default function PTPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-all group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">홈으로</span>
          </Link>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5" style={{ color: COUPANG_RED }} />
            <span className="font-semibold text-gray-900">쿠팡 PT</span>
          </div>
        </div>
      </nav>

      {/* Hero Section - Problem + Solution */}
      <section className="relative pt-32 pb-24 px-6 bg-gray-50">
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="max-w-6xl mx-auto text-center relative">
          {/* Problem Agitation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-50 border border-red-100 mb-8"
          >
            <AlertTriangle className="w-4 h-4" style={{ color: COUPANG_RED }} />
            <span className="text-sm font-medium" style={{ color: COUPANG_RED }}>
              혼자 하다 3개월째 매출 0원이신가요?
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 tracking-tight"
          >
            <span className="text-gray-900">팔려야 돈 내세요.</span>
            <br />
            <span style={{ color: COUPANG_RED }}>안 팔리면 0원.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            월 1억 달성한 전문가가 옆에서 같이 해줍니다.
            <br />
            <span className="font-semibold text-gray-900">
              성공하면 30%만 나누세요. 실패하면 0원입니다.
            </span>
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <button
              className="group px-8 py-4 rounded-full text-white font-semibold text-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-lg"
              style={{ backgroundColor: COUPANG_RED, boxShadow: `0 10px 30px -10px ${COUPANG_RED}50` }}
            >
              <Phone className="w-5 h-5" />
              내 사업 무료 진단받기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="px-8 py-4 rounded-full bg-white border border-gray-200 font-medium text-lg hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm">
              <MessageCircle className="w-5 h-5" />
              카톡으로 문의하기
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-3 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <stat.icon className="w-6 h-6 mx-auto mb-3" style={{ color: COUPANG_RED }} />
                <p className="text-3xl sm:text-4xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="font-semibold mb-4 block" style={{ color: COUPANG_RED }}>
              WHY COUPANG PT
            </span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900">
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
                className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: `${COUPANG_RED}10` }}
                >
                  <benefit.icon className="w-7 h-7" style={{ color: COUPANG_RED }} />
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">{benefit.title}</h3>
                <p className="text-gray-500 leading-relaxed">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="font-semibold mb-4 block" style={{ color: COUPANG_RED }}>
              PROCESS
            </span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900">
              47일 만에 첫 매출이 나옵니다
            </h2>
            <p className="text-gray-500 text-lg">부담 없이 시작하세요. 상담은 무료입니다.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {process.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                <div className="bg-white rounded-2xl p-8 border border-gray-100 h-full shadow-sm">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-5xl font-black text-gray-100">{item.step}</span>
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${COUPANG_RED}10` }}
                    >
                      <item.icon className="w-6 h-6" style={{ color: COUPANG_RED }} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900">{item.title}</h3>
                  <p className="text-gray-500">{item.desc}</p>
                </div>
                {index < process.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-3 w-6 items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - ROI Anchoring */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="font-semibold mb-4 block" style={{ color: COUPANG_RED }}>
              PRICING
            </span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900">
              잃을 게 없는 구조입니다
            </h2>
            <p className="text-gray-500 text-lg">
              매출 없으면 비용도 0원. 숨겨진 비용 없습니다.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-3xl p-10 sm:p-14 text-white"
            style={{ backgroundColor: '#1a1a1a' }}
          >
            <div className="text-center">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
                style={{ backgroundColor: `${COUPANG_RED}20`, border: `1px solid ${COUPANG_RED}40` }}
              >
                <CheckCircle className="w-4 h-4" style={{ color: COUPANG_RED }} />
                <span className="font-medium text-sm" style={{ color: COUPANG_RED }}>
                  성공했을 때만 정산
                </span>
              </div>

              <div className="mb-10">
                <p className="text-gray-400 mb-2">초기 비용 / 셋업비 / 교육비</p>
                <p className="text-6xl sm:text-7xl font-black text-white mb-2">₩0</p>
                <p className="text-gray-500">매출 발생 전까지 완전 무료</p>
              </div>

              <div className="flex items-center justify-center gap-4 mb-10">
                <div className="h-px flex-1 bg-gray-700" />
                <span className="text-gray-500 text-sm">매출이 발생하면</span>
                <div className="h-px flex-1 bg-gray-700" />
              </div>

              <div className="mb-12">
                <p className="text-8xl sm:text-9xl font-black" style={{ color: COUPANG_RED }}>
                  30%
                </p>
                <p className="text-gray-400 mt-2">순이익 기준 성과 보수</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-10">
                {[
                  '₩79만원 Pro 플랜 무료',
                  '전담 PT사 1:1 배정',
                  '최소 계약 기간 없음',
                  '효과 없으면 즉시 해지',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: COUPANG_RED }} />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>

              <button
                className="px-10 py-5 rounded-full text-white font-bold text-lg hover:opacity-90 transition-colors"
                style={{ backgroundColor: COUPANG_RED }}
              >
                지금 무료 상담 신청하기
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="font-semibold mb-4 block" style={{ color: COUPANG_RED }}>
              REAL RESULTS
            </span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900">
              "진작 할 걸" 후기만 있습니다
            </h2>
            <p className="text-gray-500 text-lg">실제 고객들의 Before → After</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
                    style={{ backgroundColor: COUPANG_RED }}
                  >
                    {item.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-lg text-gray-900">{item.name}</p>
                    <p className="text-gray-500 text-sm">{item.business}</p>
                  </div>
                </div>

                <p className="text-gray-600 mb-4 italic">"{item.quote}"</p>

                <div
                  className="rounded-xl p-5 border"
                  style={{ backgroundColor: `${COUPANG_RED}05`, borderColor: `${COUPANG_RED}20` }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5" style={{ color: COUPANG_RED }} />
                    <span className="text-sm font-medium" style={{ color: COUPANG_RED }}>
                      {item.period} 성과
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 line-through">{item.before}</span>
                    <ArrowRight className="w-4 h-4" style={{ color: COUPANG_RED }} />
                    <span className="text-2xl font-bold" style={{ color: COUPANG_RED }}>
                      {item.after}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA - Urgency + Guarantee */}
      <section className="py-24 px-6" style={{ backgroundColor: '#1a1a1a' }}>
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-white">
              다음 달에도
              <br />
              <span style={{ color: COUPANG_RED }}>0원이실 건가요?</span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 max-w-lg mx-auto">
              상담은 무료입니다. 부담 없이 내 사업의 가능성을 확인하세요.
              <br />
              <span className="text-white font-medium">
                지금 신청하면 48시간 내 전문가가 연락드립니다.
              </span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                className="px-10 py-5 rounded-full text-white font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2"
                style={{ backgroundColor: COUPANG_RED }}
              >
                <Phone className="w-5 h-5" />
                지금 무료 상담받기
              </button>
              <button className="px-10 py-5 rounded-full bg-white/10 border border-white/20 text-white font-medium text-lg hover:bg-white/20 transition-all flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                카톡 문의
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto text-center text-gray-400 text-sm">
          <p>© 2025 쿠팡 셀러허브. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
