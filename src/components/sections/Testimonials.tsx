'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Star, TrendingUp, ArrowRight } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const testimonials = [
  {
    name: '김*훈',
    role: '의류 셀러',
    avatar: 'K',
    content: '상품명 바꾸니까 클릭률이 진짜 다르더라고요. 같은 상품인데 매출이 2배 됐어요.',
    metric: { before: '월 320만', after: '월 680만', growth: '112%' },
  },
  {
    name: '이*영',
    role: '생활용품 셀러',
    avatar: 'L',
    content: '알바 쓰던 거 그만두고 이걸로 바꿨어요. 월 80만원 아끼면서 더 많이 등록해요.',
    metric: { before: '월 450만', after: '월 920만', growth: '104%' },
  },
  {
    name: '박*수',
    role: '주방용품 셀러',
    avatar: 'P',
    content: '새벽에 일어나서 등록하던 게 지옥이었는데, 이제 자고 일어나면 다 되어있어요.',
    metric: { before: '월 180만', after: '월 540만', growth: '200%' },
  },
];

export default function Testimonials() {
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
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>TESTIMONIALS</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            실제 셀러들의 후기
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            "진작 할 걸" 후기만 있습니다.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-gray-50 rounded-2xl p-6 border border-gray-100"
            >
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                  style={{ backgroundColor: COUPANG_RED }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Content */}
              <p className="text-gray-600 mb-6 leading-relaxed">"{testimonial.content}"</p>

              {/* Metrics */}
              <div
                className="rounded-xl p-4 border"
                style={{ backgroundColor: `${COUPANG_RED}05`, borderColor: `${COUPANG_RED}15` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4" style={{ color: COUPANG_RED }} />
                  <span className="text-sm font-medium" style={{ color: COUPANG_RED }}>
                    {testimonial.metric.growth} 성장
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 line-through">{testimonial.metric.before}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span className="font-bold" style={{ color: COUPANG_RED }}>
                    {testimonial.metric.after}
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
