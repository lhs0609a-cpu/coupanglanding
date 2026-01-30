'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Sparkles, Target, TrendingUp, Zap } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const aiFeatures = [
  {
    icon: Sparkles,
    title: '클릭되는 상품명 자동 생성',
    description: '쿠팡 검색 알고리즘 분석 기반. 같은 상품도 제목 바꾸면 클릭률 2.3배 차이 납니다.',
    stat: '8종 동시 생성',
  },
  {
    icon: Target,
    title: '타겟 키워드 자동 삽입',
    description: '"오늘출발", "1+1", "베스트" 등 클릭 유도 키워드를 상품에 맞게 자동 배치.',
    stat: '검색 340% ↑',
  },
  {
    icon: TrendingUp,
    title: '경쟁사 상품명 분석',
    description: '판매 TOP 100 상품의 제목 패턴을 분석해서 검증된 구조로 생성합니다.',
    stat: 'TOP 100 분석',
  },
  {
    icon: Zap,
    title: '3초 만에 완성',
    description: '상품 정보 입력 → AI 분석 → 8종 상품명 출력. 단 3초면 끝.',
    stat: '3초 생성',
  },
];

export default function AIFeatures() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>AI POWER</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            왜 AI 상품명이 더 팔릴까요?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
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
              className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${COUPANG_RED}10` }}
                >
                  <feature.icon className="w-6 h-6" style={{ color: COUPANG_RED }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                    <span
                      className="px-2 py-1 text-xs font-bold rounded-full"
                      style={{ backgroundColor: `${COUPANG_RED}10`, color: COUPANG_RED }}
                    >
                      {feature.stat}
                    </span>
                  </div>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
