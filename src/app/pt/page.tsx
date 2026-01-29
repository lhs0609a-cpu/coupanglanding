'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Users, TrendingUp, CheckCircle, Shield, Phone, MessageCircle, Target, Award, Zap, Sparkles, Star, ArrowRight, Clock, BarChart3 } from 'lucide-react';
import Link from 'next/link';

const benefits = [
  {
    icon: Shield,
    title: '리스크 제로',
    description: '초기 비용 0원, 매출 발생 시에만 수수료',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Users,
    title: '전담 PT사 배정',
    description: '검증된 전문가의 1:1 밀착 관리',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: Zap,
    title: '프로그램 무제한',
    description: 'AI 상품등록 등 모든 기능 이용',
    gradient: 'from-orange-500 to-red-500',
  },
  {
    icon: Target,
    title: '맞춤 전략 수립',
    description: '상품군 최적화 판매 전략 설계',
    gradient: 'from-emerald-500 to-teal-500',
  },
];

const process = [
  { step: '01', title: '무료 상담', desc: '현재 상황과 목표 파악', icon: MessageCircle },
  { step: '02', title: '시장 분석', desc: '경쟁사 및 트렌드 분석', icon: BarChart3 },
  { step: '03', title: '전략 수립', desc: '맞춤형 판매 전략 제안', icon: Target },
  { step: '04', title: '실행 관리', desc: '전담 PT사 밀착 지원', icon: Users },
];

const testimonials = [
  {
    name: '김*현',
    business: '의류/패션',
    before: '0원',
    after: '2,400만원',
    period: '3개월',
    avatar: 'K',
  },
  {
    name: '이*수',
    business: '생활용품',
    before: '500만원',
    after: '3,200만원',
    period: '2개월',
    avatar: 'L',
  },
  {
    name: '박*진',
    business: '주방용품',
    before: '800만원',
    after: '5,100만원',
    period: '4개월',
    avatar: 'P',
  },
];

const stats = [
  { value: '94%', label: '매출 발생률', icon: TrendingUp },
  { value: '2.8배', label: '평균 성장', icon: BarChart3 },
  { value: '47일', label: '첫 매출까지', icon: Clock },
];

export default function PTPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white overflow-x-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[150px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#030014]/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-all group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">홈으로</span>
          </Link>
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              쿠팡 PT
            </span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="max-w-6xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 mb-8"
          >
            <Award className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-yellow-200/90">성공 보장형 파트너십</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 tracking-tight"
          >
            <span className="text-white">매출이 없으면</span>
            <br />
            <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 bg-clip-text text-transparent">
              비용도 없습니다
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            전문 PT사가 함께하는 성과 기반 파트너십
            <br />
            <span className="text-white/80 font-medium">매출의 30%만 정산하세요</span>
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <button className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-semibold text-lg overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(251,191,36,0.3)]">
              <span className="relative z-10 flex items-center gap-2">
                <Phone className="w-5 h-5" />
                무료 상담 신청
              </span>
            </button>
            <button className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 font-medium text-lg hover:bg-white/10 transition-all flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              카카오톡 문의
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-3 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((stat, i) => (
              <div key={stat.label} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <stat.icon className="w-6 h-6 text-purple-400 mx-auto mb-3" />
                  <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                  <p className="text-sm text-white/50 mt-1">{stat.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-purple-400 font-medium mb-4 block">WHY COUPANG PT</span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              왜 <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">쿠팡 PT</span>인가요?
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              혼자 고민하지 마세요. 전문가와 함께하면 결과가 다릅니다.
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
                className="group relative"
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${benefit.gradient} rounded-3xl blur-xl opacity-0 group-hover:opacity-20 transition-all duration-500`} />
                <div className="relative h-full bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 border border-white/10 hover:border-white/20 transition-all">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${benefit.gradient} p-[1px] mb-6`}>
                    <div className="w-full h-full rounded-2xl bg-[#030014] flex items-center justify-center">
                      <benefit.icon className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-white/50 leading-relaxed">{benefit.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-purple-400 font-medium mb-4 block">PROCESS</span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">진행 과정</h2>
            <p className="text-white/50 text-lg">4단계로 간단하게 시작하세요</p>
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
                <div className="bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-3xl p-8 border border-white/10 h-full">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-5xl font-black bg-gradient-to-r from-purple-500/20 to-pink-500/20 bg-clip-text text-transparent">
                      {item.step}
                    </span>
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <item.icon className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-white/50">{item.desc}</p>
                </div>
                {index < process.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-3 w-6 items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-purple-500/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-purple-400 font-medium mb-4 block">PRICING</span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">투명한 수수료</h2>
            <p className="text-white/50 text-lg">숨겨진 비용 없이, 오직 성과에만 집중</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 via-orange-500 to-pink-500 rounded-[2.5rem] blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
            <div className="relative bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-[2.5rem] p-10 sm:p-14 border border-white/10 overflow-hidden">
              {/* Decorative Elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-yellow-500/10 to-transparent rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-3xl" />

              <div className="relative text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-8">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 font-medium text-sm">성과 기반 정산</span>
                </div>

                <div className="mb-10">
                  <p className="text-white/50 mb-2">초기 비용</p>
                  <p className="text-6xl sm:text-7xl font-black text-white mb-2">₩0</p>
                  <p className="text-white/40">매출 발생 전까지 완전 무료</p>
                </div>

                <div className="flex items-center justify-center gap-4 mb-10">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
                  <span className="text-white/30 text-sm">매출 발생 시</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
                </div>

                <div className="mb-12">
                  <p className="text-8xl sm:text-9xl font-black bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 bg-clip-text text-transparent">
                    30%
                  </p>
                  <p className="text-white/50 mt-2">순매출 기준 수수료</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto mb-10">
                  {[
                    '모든 프로그램 무제한',
                    '전담 PT사 1:1 관리',
                    '최소 계약 기간 없음',
                    '언제든 해지 가능',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span className="text-white/80 text-sm">{item}</span>
                    </div>
                  ))}
                </div>

                <button className="px-10 py-5 rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold text-lg hover:scale-105 transition-transform shadow-[0_0_40px_rgba(251,191,36,0.2)]">
                  무료 상담 신청하기
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent" />
        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-purple-400 font-medium mb-4 block">RESULTS</span>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">실제 고객 성과</h2>
            <p className="text-white/50 text-lg">쿠팡 PT와 함께한 셀러들의 성장</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all" />
                <div className="relative bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 border border-white/10 h-full">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl font-bold">
                      {item.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{item.name}</p>
                      <p className="text-white/40 text-sm">{item.business}</p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl p-5 border border-green-500/10">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                      <span className="text-green-300 text-sm font-medium">{item.period} 성과</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 line-through">{item.before}</span>
                      <ArrowRight className="w-4 h-4 text-green-400" />
                      <span className="text-2xl font-bold text-green-400">{item.after}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              지금 바로
              <br />
              <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                시작하세요
              </span>
            </h2>
            <p className="text-white/50 text-lg mb-10 max-w-lg mx-auto">
              무료 상담으로 내 사업에 맞는 전략을 확인해보세요.
              상담은 무료이며, 부담없이 문의해주세요.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="px-10 py-5 rounded-2xl bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold text-lg hover:scale-105 transition-transform flex items-center gap-2">
                <Phone className="w-5 h-5" />
                무료 상담 신청
              </button>
              <button className="px-10 py-5 rounded-2xl bg-white/5 border border-white/10 font-medium text-lg hover:bg-white/10 transition-all flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                카카오톡 문의
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto text-center text-white/30 text-sm">
          <p>© 2025 쿠팡 셀러허브. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
