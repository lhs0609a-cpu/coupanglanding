'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle2, TrendingUp, Users, Award, Sparkles, Zap } from 'lucide-react';

const stats = [
  {
    icon: Users,
    value: '2,847+',
    label: '사용 중인 셀러',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: TrendingUp,
    value: '127만+',
    label: '등록된 상품',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Award,
    value: '4.9/5.0',
    label: '고객 만족도',
    color: 'from-amber-500 to-orange-500',
  },
];

const aiExamples = [
  {
    original: '여성 니트 가디건 봄 가을 겨울 사무실 출근룩',
    generated: [
      '[오늘출발] 부드러운 여성 니트가디건 | 봄가을 오피스룩 필수템',
      '★베스트★ 포근한 여성 울혼방 가디건 | 체형커버',
      '[1+1] 여성 니트가디건 봄가을겨울 | 출근룩 데일리',
    ],
  },
];

export default function SocialProof() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gradient-to-b from-white to-gray-50/50 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 w-72 h-72 bg-rose-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Stats */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -4 }}
              className="text-center p-8 rounded-2xl bg-white border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mx-auto mb-5 shadow-lg`}>
                <stat.icon className="w-7 h-7 text-white" />
              </div>
              <p className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
                {stat.value}
              </p>
              <p className="text-gray-500">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* AI Demo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-center mb-12">
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              className="inline-block px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
            >
              AI DEMO
            </motion.span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
              "진짜 3초 만에 됨?"
            </h2>
            <p className="text-xl text-gray-500">직접 확인하세요.</p>
          </div>

          <div className="max-w-3xl mx-auto">
            {/* Original */}
            <div className="bg-white rounded-t-2xl p-6 border border-gray-200 border-b-0 shadow-lg">
              <p className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs">😐</span>
                원본 상품명 (클릭 안 됨)
              </p>
              <p className="text-lg text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100">
                {aiExamples[0].original}
              </p>
            </div>

            {/* AI Generated */}
            <div className="bg-gradient-to-br from-rose-50/80 to-white rounded-b-2xl p-6 border border-rose-100 shadow-lg">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-[#E31837]">
                  AI가 3초 만에 만든 상품명 (클릭됨)
                </p>
              </div>
              <div className="space-y-3">
                {aiExamples[0].generated.map((name, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#E31837] to-[#ff4d6a] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-200/50">
                      {i + 1}
                    </span>
                    <p className="text-gray-800 bg-white p-4 rounded-xl border border-gray-100 flex-1 shadow-sm hover:shadow-md transition-shadow">
                      {name}
                    </p>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.8 }}
                className="mt-6 flex items-center justify-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#E31837]/10 to-rose-100/50 border border-rose-200/50"
              >
                <TrendingUp className="w-5 h-5 text-[#E31837]" />
                <span className="font-bold text-[#E31837]">
                  검색 노출 340% ↑ / 클릭률 2.3배 ↑
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Guarantee */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 bg-gradient-to-br from-white to-gray-50 rounded-2xl p-8 border border-gray-200 shadow-xl"
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200/50">
              <span className="text-4xl">🛡️</span>
            </div>
            <div className="text-center md:text-left flex-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                효과 없으면 100% 환불
              </h3>
              <p className="text-gray-600 mb-5 leading-relaxed">
                30일간 써보세요. "돈 아깝다" 싶으면 카톡 한 마디로 전액 환불.
                <br />
                <span className="font-semibold text-gray-800">사유 안 물어봅니다. 3영업일 내 입금.</span>
              </p>
              <div className="flex flex-wrap gap-4 text-sm justify-center md:justify-start">
                {[
                  '카카오톡 한 마디면 끝',
                  '사유 묻지 않음',
                  '3영업일 내 입금',
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-700 font-medium">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
