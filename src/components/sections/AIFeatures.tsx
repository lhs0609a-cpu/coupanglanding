'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Sparkles, Target, TrendingUp, Zap, Brain } from 'lucide-react';

const aiFeatures = [
  {
    icon: Sparkles,
    title: '클릭되는 상품명 자동 생성',
    description: '쿠팡 검색 알고리즘 분석 기반. 같은 상품도 제목 바꾸면 클릭률 2.3배 차이 납니다.',
    stat: '8종 동시 생성',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: Target,
    title: '타겟 키워드 자동 삽입',
    description: '"오늘출발", "1+1", "베스트" 등 클릭 유도 키워드를 상품에 맞게 자동 배치.',
    stat: '검색 340% ↑',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: TrendingUp,
    title: '경쟁사 상품명 분석',
    description: '판매 TOP 100 상품의 제목 패턴을 분석해서 검증된 구조로 생성합니다.',
    stat: 'TOP 100 분석',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Zap,
    title: '3초 만에 완성',
    description: '상품 정보 입력 → AI 분석 → 8종 상품명 출력. 단 3초면 끝.',
    stat: '3초 생성',
    color: 'from-amber-500 to-orange-500',
  },
];

export default function AIFeatures() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-0 w-96 h-96 bg-violet-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-80 h-80 bg-rose-100/30 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-full text-sm font-semibold text-violet-600 mb-6"
          >
            <Brain className="w-4 h-4" />
            AI POWER
          </motion.div>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            왜 AI 상품명이 더
            <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent"> 팔릴까요?</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            같은 상품도 제목이 다르면 매출이 다릅니다.
            <br />
            <span className="font-medium text-gray-900">AI가 "팔리는 제목"을 만들어 드립니다.</span>
          </p>
        </motion.div>

        {/* AI Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {aiFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl hover:border-gray-200 transition-all"
            >
              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                  </div>
                  <p className="text-gray-500 leading-relaxed mb-4">{feature.description}</p>
                  <span className={`inline-block px-3 py-1.5 bg-gradient-to-r ${feature.color} bg-opacity-10 rounded-full text-xs font-bold text-white shadow-sm`}>
                    {feature.stat}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
