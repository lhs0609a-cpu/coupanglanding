'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Sparkles, MessageSquareText, Tag, Layers, CheckCircle2 } from 'lucide-react';

const aiFeatures = [
  {
    icon: Sparkles,
    title: 'AI 상품명 생성',
    subtitle: '8종 자동 생성',
    description: '원본 상품명을 분석하여 쿠팡 검색에 최적화된 8가지 상품명을 자동 생성합니다.',
    benefits: ['검색 1페이지 노출 최적화', 'SEO 키워드 자동 추출', '쿠팡 가이드라인 100% 준수'],
  },
  {
    icon: MessageSquareText,
    title: 'AI 리뷰 생성',
    subtitle: '5종 자동 작성',
    description: '상품 특성을 분석하여 다양한 관점의 자연스러운 구매후기 5종을 생성합니다.',
    benefits: ['품질, 배송, 가성비 등 다양한 관점', '실제 구매자 톤앤매너 적용', '구매 전환율 40% 향상'],
  },
  {
    icon: Tag,
    title: 'AI 카테고리 매칭',
    subtitle: '53,000+ 카테고리',
    description: '상품명과 이미지를 분석하여 53,000개 이상의 카테고리 중 최적의 카테고리를 자동 선택합니다.',
    benefits: ['매칭 정확도 95% 이상', '수수료 최적화', '검색 노출 극대화'],
  },
  {
    icon: Layers,
    title: 'AI 검색 태그 생성',
    subtitle: '트렌드 반영',
    description: '쿠팡 검색 트렌드를 분석하여 관련 키워드와 롱테일 키워드를 자동으로 추출합니다.',
    benefits: ['검색 노출 범위 3배 확대', '인기 검색어 자동 포함', '상품에 바로 태그 연결'],
  },
];

export default function AIFeatures() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section id="ai-features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-blue-600 font-semibold mb-4">AI FEATURES</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-black mb-6">
            AI가 일하는 동안, 당신은 쉬세요
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            복잡하고 반복적인 작업은 AI에게 맡기세요.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {aiFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-blue-100 transition-all"
            >
              <div className="flex items-start gap-6">
                <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-7 h-7 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-black">{feature.title}</h3>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                      {feature.subtitle}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-5">{feature.description}</p>
                  <ul className="space-y-2">
                    {feature.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 bg-black rounded-2xl p-8 sm:p-12 text-center"
        >
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            AI 상품명 생성 체험해보기
          </h3>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            평균 검색 노출 순위 상승률 340%. AI가 분석한 키워드로 더 많은 고객에게 도달합니다.
          </p>
          <button className="px-8 py-4 bg-blue-600 text-white rounded-full font-semibold text-lg hover:bg-blue-700 transition-colors">
            무료로 체험하기
          </button>
        </motion.div>
      </div>
    </section>
  );
}
