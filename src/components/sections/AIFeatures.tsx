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
    benefits: [
      '검색 1페이지 노출 최적화',
      'SEO 키워드 자동 추출',
      '쿠팡 가이드라인 100% 준수',
    ],
    stats: { before: '3시간', after: '3초', improvement: '99%' },
    color: 'purple',
  },
  {
    icon: MessageSquareText,
    title: 'AI 리뷰 생성',
    subtitle: '5종 자동 작성',
    description: '상품 특성을 분석하여 다양한 관점의 자연스러운 구매후기 5종을 생성합니다.',
    benefits: [
      '품질, 배송, 가성비 등 다양한 관점',
      '실제 구매자 톤앤매너 적용',
      '구매 전환율 40% 향상',
    ],
    stats: { before: '리뷰 없음', after: '5종 리뷰', improvement: '40%' },
    color: 'indigo',
  },
  {
    icon: Tag,
    title: 'AI 카테고리 매칭',
    subtitle: '53,000+ 카테고리',
    description: '상품명과 이미지를 분석하여 53,000개 이상의 카테고리 중 최적의 카테고리를 자동 선택합니다.',
    benefits: [
      '매칭 정확도 95% 이상',
      '수수료 최적화',
      '검색 노출 극대화',
    ],
    stats: { before: '10분', after: '1초', improvement: '95%' },
    color: 'blue',
  },
  {
    icon: Layers,
    title: 'AI 검색 태그 생성',
    subtitle: '트렌드 반영',
    description: '쿠팡 검색 트렌드를 분석하여 관련 키워드와 롱테일 키워드를 자동으로 추출합니다.',
    benefits: [
      '검색 노출 범위 3배 확대',
      '인기 검색어 자동 포함',
      '상품에 바로 태그 연결',
    ],
    stats: { before: '키워드 고민', after: '자동 추출', improvement: '300%' },
    color: 'cyan',
  },
];

const colorVariants = {
  purple: {
    bg: 'bg-purple-500/10',
    icon: 'bg-purple-500/20 text-purple-400',
    badge: 'bg-purple-500/20 text-purple-300',
    border: 'border-purple-500/20',
    gradient: 'from-purple-500 to-purple-600',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    icon: 'bg-indigo-500/20 text-indigo-400',
    badge: 'bg-indigo-500/20 text-indigo-300',
    border: 'border-indigo-500/20',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  blue: {
    bg: 'bg-blue-500/10',
    icon: 'bg-blue-500/20 text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300',
    border: 'border-blue-500/20',
    gradient: 'from-blue-500 to-blue-600',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    icon: 'bg-cyan-500/20 text-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-300',
    border: 'border-cyan-500/20',
    gradient: 'from-cyan-500 to-cyan-600',
  },
};

export default function AIFeatures() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section id="ai-features" className="py-24 bg-[#030014] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[150px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 mb-6"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-purple-300">AI 파워</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">AI가 일하는 동안</span>
            <br />당신은 쉬세요
          </h2>

          <p className="text-xl text-white/60 max-w-3xl mx-auto">
            복잡하고 반복적인 작업은 AI에게 맡기세요.
            <br />
            상품명, 리뷰, 카테고리, 태그까지 모든 것을 자동으로 처리합니다.
          </p>
        </motion.div>

        {/* AI Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {aiFeatures.map((feature, index) => {
            const colors = colorVariants[feature.color as keyof typeof colorVariants];
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="group"
              >
                <div className={`h-full bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 border ${colors.border} hover:border-white/20 transition-all duration-300`}>
                  <div className="flex items-start gap-6">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-16 h-16 rounded-2xl ${colors.icon} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className="w-8 h-8" />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-white">
                          {feature.title}
                        </h3>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
                          {feature.subtitle}
                        </span>
                      </div>

                      <p className="text-white/60 mb-5 leading-relaxed">
                        {feature.description}
                      </p>

                      {/* Benefits */}
                      <ul className="space-y-2 mb-6">
                        {feature.benefits.map((benefit) => (
                          <li key={benefit} className="flex items-center gap-2 text-sm text-white/70">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            {benefit}
                          </li>
                        ))}
                      </ul>

                      {/* Stats Comparison */}
                      <div className={`${colors.bg} rounded-2xl p-4`}>
                        <div className="flex items-center justify-between">
                          <div className="text-center">
                            <div className="text-xs sm:text-sm text-white/50 mb-1">이전</div>
                            <div className="text-sm font-semibold text-white/70 line-through decoration-red-400">
                              {feature.stats.before}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-8 h-px bg-white/20" />
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${colors.gradient} flex items-center justify-center text-white text-xs font-bold`}>
                              {feature.stats.improvement}
                            </div>
                            <div className="w-8 h-px bg-white/20" />
                          </div>

                          <div className="text-center">
                            <div className="text-xs sm:text-sm text-white/50 mb-1">이후</div>
                            <div className="text-sm font-bold text-white">
                              {feature.stats.after}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* AI Demo Preview */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20"
        >
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl p-8 sm:p-12 text-white relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }} />
            </div>

            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-3xl sm:text-4xl font-bold mb-4">
                  AI가 만든 상품명으로
                  <br />검색 1페이지를 점령하세요
                </h3>
                <p className="text-purple-100 text-lg mb-6">
                  평균 검색 노출 순위 상승률 340%.
                  <br />
                  AI가 분석한 키워드로 더 많은 고객에게 도달합니다.
                </p>
                <button className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-full font-semibold hover:bg-purple-50 transition-colors">
                  AI 상품명 생성 체험하기
                  <Sparkles className="w-5 h-5" />
                </button>
              </div>

              {/* Demo Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="text-sm text-purple-200 mb-3">입력: 원본 상품명</div>
                <div className="bg-white/10 rounded-xl p-4 mb-4 text-white/80">
                  프리미엄 스테인리스 텀블러 보온보냉 500ml
                </div>

                <div className="text-sm text-purple-200 mb-3">출력: AI 최적화 상품명 (8종)</div>
                <div className="space-y-2">
                  {[
                    '[오늘출발] 프리미엄 스테인리스 텀블러 보온보냉 500ml 대용량',
                    '보온보냉 텀블러 스테인리스 500ml 휴대용 사무실 차량용',
                    '스테인리스 진공 텀블러 500ml 보온병 보냉병 휴대용 물병',
                  ].map((name, i) => (
                    <div key={i} className="bg-white rounded-xl px-4 py-3 text-gray-800 text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      {name}
                    </div>
                  ))}
                  <div className="text-center text-purple-200 text-sm">
                    + 5개 더 보기...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
