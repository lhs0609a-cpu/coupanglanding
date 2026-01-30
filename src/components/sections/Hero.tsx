'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Play, CheckCircle2, AlertTriangle } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-white">
      {/* Simple Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20">
        <div className="text-center">
          {/* Problem Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8"
            style={{ backgroundColor: `${COUPANG_RED}08`, borderColor: `${COUPANG_RED}20` }}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: COUPANG_RED }} />
            <span className="text-sm font-medium" style={{ color: COUPANG_RED }}>
              아직도 상품 하나에 30분 쓰세요?
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-6 tracking-tight"
          >
            100개 등록에
            <br />
            <span style={{ color: COUPANG_RED }}>10분이면 끝납니다</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-12"
          >
            알바 3일 치 월급(₩89만)으로 <strong className="text-gray-900">1년 내내</strong> 자동 등록.
            <br />
            AI가 상품명 8종 자동 생성 → 자는 동안 쿠팡에 업로드.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
          >
            <button
              className="group px-8 py-4 rounded-full text-white font-semibold text-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-lg"
              style={{ backgroundColor: COUPANG_RED, boxShadow: `0 10px 30px -10px ${COUPANG_RED}50` }}
            >
              7일 무료로 써보기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="px-8 py-4 rounded-full border-2 border-gray-200 text-gray-700 font-medium text-lg hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center gap-2">
              <Play className="w-5 h-5" />
              2분 데모 영상
            </button>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
              <span>7일 무료, 카드 불필요</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
              <span>30일 환불 보장</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
              <span>2,847명 사용 중</span>
            </div>
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto"
        >
          {[
            { value: '48시간 → 10분', label: '100개 상품 등록 시간' },
            { value: '340%', label: '검색 노출 상승률' },
            { value: '₩89만/월 절감', label: 'vs 알바 1명 고용' },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{stat.value}</p>
              <p className="text-gray-500">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
