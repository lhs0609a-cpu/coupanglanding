'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Users, TrendingUp, CheckCircle, Shield, Phone, MessageCircle, Target, Award, Zap, ArrowRight, Clock, BarChart3, AlertTriangle, Sparkles } from 'lucide-react';
import Link from 'next/link';

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

const process = [
  { step: '01', title: '10분 전화상담', desc: '상황 파악 & 가능성 검토', icon: MessageCircle, color: 'from-blue-500 to-cyan-500' },
  { step: '02', title: '시장 분석 리포트', desc: '경쟁강도, 예상 마진 계산', icon: BarChart3, color: 'from-violet-500 to-purple-500' },
  { step: '03', title: '판매 전략 수립', desc: '상품 소싱부터 가격까지', icon: Target, color: 'from-amber-500 to-orange-500' },
  { step: '04', title: '실행 & 관리', desc: 'PT사가 매주 성과 체크', icon: Users, color: 'from-emerald-500 to-teal-500' },
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
    color: 'from-rose-500 to-pink-500',
  },
  {
    name: '이*수',
    business: '생활용품',
    before: '500만원',
    after: '3,200만원',
    period: '2개월',
    avatar: 'L',
    quote: '마진율 12%에서 23%로 올렸습니다',
    color: 'from-violet-500 to-purple-500',
  },
  {
    name: '박*진',
    business: '주방용품',
    before: '800만원',
    after: '5,100만원',
    period: '4개월',
    avatar: 'P',
    quote: '상품 선정을 완전 잘못하고 있었더라고요',
    color: 'from-amber-500 to-orange-500',
  },
];

const stats = [
  { value: '94%', label: '3개월 내 매출 발생', icon: TrendingUp, color: 'from-rose-500 to-pink-500' },
  { value: '2.8배', label: '평균 매출 성장률', icon: BarChart3, color: 'from-violet-500 to-purple-500' },
  { value: '47일', label: '첫 매출까지 평균', icon: Clock, color: 'from-amber-500 to-orange-500' },
];

export default function PTPage() {
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
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 bg-gradient-to-b from-white via-gray-50/50 to-white overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-rose-100/40 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-rose-50/30 to-transparent rounded-full" />
        </div>

        <div className="max-w-6xl mx-auto text-center relative z-10">
          {/* Problem Agitation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-rose-50 to-white border border-rose-100 shadow-sm mb-8"
          >
            <AlertTriangle className="w-4 h-4 text-[#E31837]" />
            <span className="text-sm font-semibold text-[#E31837]">
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
            <span className="bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
              안 팔리면 0원.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed"
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
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group px-8 py-4 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-semibold text-lg shadow-xl shadow-rose-200/50 hover:shadow-2xl hover:shadow-rose-300/50 transition-all flex items-center gap-2"
            >
              <Phone className="w-5 h-5" />
              내 사업 무료 진단받기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 rounded-full bg-white border border-gray-200 font-semibold text-lg hover:bg-gray-50 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all flex items-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              카톡으로 문의하기
            </motion.button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-3 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((stat, index) => (
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

      {/* Benefits Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-0 w-72 h-72 bg-violet-100/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-0 w-80 h-80 bg-rose-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
            >
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

      {/* Process Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-violet-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-full text-sm font-semibold text-violet-600 mb-6"
            >
              PROCESS
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
              <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">47일</span>
              {' '}만에 첫 매출이 나옵니다
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
                whileHover={{ y: -4 }}
                className="relative"
              >
                <div className="bg-white rounded-2xl p-8 border border-gray-100 h-full shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-5xl font-black bg-gradient-to-r from-gray-100 to-gray-200 bg-clip-text text-transparent">
                      {item.step}
                    </span>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg`}>
                      <item.icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900">{item.title}</h3>
                  <p className="text-gray-500">{item.desc}</p>
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

      {/* Pricing Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
        {/* Background decorations */}
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
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-sm font-semibold text-rose-300 mb-6"
            >
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

              <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-10">
                {[
                  '₩79만원 Pro 플랜 무료',
                  '전담 PT사 1:1 배정',
                  '최소 계약 기간 없음',
                  '효과 없으면 즉시 해지',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="px-10 py-5 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-lg shadow-xl shadow-rose-500/30 hover:shadow-2xl hover:shadow-rose-500/40 transition-all"
              >
                지금 무료 상담 신청하기
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-0 w-80 h-80 bg-rose-100/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-violet-100/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
            >
              REAL RESULTS
            </motion.div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-gray-900 tracking-tight">
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
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
              >
                <div className="flex items-center gap-4 mb-5">
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-xl font-bold text-white shadow-lg`}>
                    {item.avatar}
                  </div>
                  <div>
                    <p className="font-bold text-lg text-gray-900">{item.name}</p>
                    <p className="text-gray-500 text-sm">{item.business}</p>
                  </div>
                </div>

                <p className="text-gray-600 mb-5 italic leading-relaxed">"{item.quote}"</p>

                <div className={`rounded-xl p-5 bg-gradient-to-br from-gray-50 to-white border border-gray-100`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">{item.period} 성과</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 line-through">{item.before}</span>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                    <span className={`text-2xl font-bold bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}>
                      {item.after}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
        {/* Background decorations */}
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
                className="px-10 py-5 rounded-full bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white font-bold text-lg shadow-xl shadow-rose-500/30 hover:shadow-2xl hover:shadow-rose-500/40 transition-all flex items-center gap-2"
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

      {/* Footer */}
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
