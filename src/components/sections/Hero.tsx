'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Play, Zap, Clock, TrendingUp, CheckCircle2, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

const liveStats = [
  { icon: Clock, value: '48시간', arrow: '→', result: '10분', desc: '100개 상품 등록' },
  { icon: TrendingUp, value: '340%', label: '검색 노출', desc: '평균 상승률' },
  { icon: Zap, value: '₩89만', label: '/월 절감', desc: 'vs 알바 1명 인건비' },
];

export default function Hero() {
  const [viewerCount, setViewerCount] = useState(147);

  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount(prev => prev + Math.floor(Math.random() * 3) - 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#030014]">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-cyan-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20">
        <div className="text-center">
          {/* Live Viewer Count */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-red-500/10 border border-red-500/20 mb-6"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-sm font-medium text-red-200/90">
              지금 <strong className="text-white">{viewerCount}명</strong>이 보고 있습니다
            </span>
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 mb-8 ml-3"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-cyan-200/90">AI 기반 자동화 솔루션</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6 tracking-tight"
          >
            알바 1명 월급으로
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 bg-clip-text text-transparent">
              1년 내내 자동 등록
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-10"
          >
            <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              어제도 <span className="text-red-400 font-medium">새벽 2시까지</span> 상품명 복붙하셨죠?
              <br />
              경쟁 셀러는 <span className="text-white font-medium">자면서 100개 등록</span>했습니다.
            </p>
          </motion.div>

          {/* Solution Preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="relative max-w-2xl mx-auto mb-12"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur-xl opacity-20" />
            <div className="relative bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-lg font-semibold text-emerald-300">셀러허브로 바꾸면</span>
              </div>
              <p className="text-white/80">
                폴더 드래그 한 번 → <span className="text-cyan-300 font-medium">AI가 상품명 8종 자동 생성</span>
              </p>
              <p className="text-xl font-bold text-white mt-2">
                자는 동안 쿠팡에 100개 등록 완료
              </p>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
          >
            <button className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold text-lg overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(6,182,212,0.3)]">
              <span className="relative z-10 flex items-center gap-2">
                내 노가다 끝내기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <button className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-medium text-lg hover:bg-white/10 transition-all flex items-center gap-2">
              <Play className="w-5 h-5" />
              2분 데모 영상 보기
            </button>
          </motion.div>

          {/* Risk Reversal */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mb-16"
          >
            <p className="text-white/50 text-sm mb-2">
              7일 무료 · 카드 등록 X · <span className="text-emerald-400 font-medium">30일 환불 보장</span>
            </p>
            <p className="text-white/30 text-xs">
              지난 7일간 <span className="text-white/50">234명</span> 가입 · 평균 첫 등록까지 <span className="text-white/50">7분</span>
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto mb-20"
          >
            {liveStats.map((stat, index) => (
              <motion.div
                key={stat.desc}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-white/[0.03] backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
                    {stat.arrow ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-red-400/80 line-through text-lg">{stat.value}</span>
                        <span className="text-white/30">→</span>
                        <span className="text-emerald-400">{stat.result}</span>
                      </div>
                    ) : (
                      <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                        {stat.value}
                      </span>
                    )}
                  </div>
                  {stat.label && (
                    <p className="text-sm font-medium text-cyan-300/80 mb-1">{stat.label}</p>
                  )}
                  <p className="text-sm text-white/40">{stat.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Before/After Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-12"
        >
          {/* Before */}
          <div className="group relative">
            <div className="absolute inset-0 bg-red-500/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-3xl p-8 border border-red-500/20 h-full">
              <div className="text-center mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 text-red-300 text-sm font-medium">
                  😫 지금 당신의 하루
                </span>
              </div>
              <ul className="space-y-4">
                {[
                  ['상품명 고민', '3시간/개'],
                  ['카테고리 검색', '10분/개'],
                  ['100개 등록', '48시간 야근'],
                  ['알바 고용 시', '월 89만원 출혈'],
                ].map(([label, value]) => (
                  <li key={label} className="flex items-center gap-3 text-white/70">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm">✗</span>
                    <span>{label} <strong className="text-red-400">{value}</strong></span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-6 border-t border-red-500/20 text-center">
                <span className="text-red-400 font-bold text-lg">연간 손실: ₩10,680,000</span>
              </div>
            </div>
          </div>

          {/* After */}
          <div className="group relative">
            <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-3xl p-8 border border-emerald-500/20 h-full">
              <div className="text-center mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-300 text-sm font-medium">
                  😴 셀러허브 쓰면
                </span>
              </div>
              <ul className="space-y-4">
                {[
                  ['AI 상품명 8종', '3초 생성'],
                  ['카테고리', '자동 매칭 95%'],
                  ['100개 등록', '커피 한 잔 시간'],
                  ['월 비용', '단돈 7.9만원'],
                ].map(([label, value]) => (
                  <li key={label} className="flex items-center gap-3 text-white/70">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">✓</span>
                    <span>{label} <strong className="text-emerald-400">{value}</strong></span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-6 border-t border-emerald-500/20 text-center">
                <span className="text-emerald-400 font-bold text-lg">연간 절감: ₩9,720,000</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Savings Calculator */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="relative max-w-3xl mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-3xl blur-2xl opacity-20" />
          <div className="relative bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 rounded-3xl p-8 border border-cyan-500/20 text-center backdrop-blur-sm overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
            <div className="relative">
              <p className="text-cyan-200/80 mb-4">월 100개 상품 등록 기준, 당신이 되찾는 것</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mb-6">
                <div>
                  <p className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                    ₩9,720,000
                  </p>
                  <p className="text-white/50 text-sm mt-1">연간 절감액</p>
                </div>
                <span className="text-white/20 hidden sm:block text-2xl">+</span>
                <div>
                  <p className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                    576시간
                  </p>
                  <p className="text-white/50 text-sm mt-1">연간 시간 절약</p>
                </div>
              </div>
              <p className="text-white/40 text-sm">
                = 매달 <span className="text-white/60">주말 여행 1번</span> + <span className="text-white/60">가족 저녁 48번</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-2.5 bg-white/40 rounded-full"
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
