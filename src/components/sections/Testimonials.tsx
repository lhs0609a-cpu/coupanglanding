'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Star, TrendingUp, ArrowRight, Quote } from 'lucide-react';

const testimonials = [
  {
    name: '김*훈',
    role: '의류 셀러',
    avatar: 'K',
    content: '상품명 바꾸니까 클릭률이 진짜 다르더라고요. 같은 상품인데 매출이 2배 됐어요.',
    metric: { before: '월 320만', after: '월 680만', growth: '112%' },
    color: 'from-rose-500 to-pink-500',
  },
  {
    name: '이*영',
    role: '생활용품 셀러',
    avatar: 'L',
    content: '알바 쓰던 거 그만두고 이걸로 바꿨어요. 월 80만원 아끼면서 더 많이 등록해요.',
    metric: { before: '월 450만', after: '월 920만', growth: '104%' },
    color: 'from-violet-500 to-purple-500',
  },
  {
    name: '박*수',
    role: '주방용품 셀러',
    avatar: 'P',
    content: '새벽에 일어나서 등록하던 게 지옥이었는데, 이제 자고 일어나면 다 되어있어요.',
    metric: { before: '월 180만', after: '월 540만', growth: '200%' },
    color: 'from-amber-500 to-orange-500',
  },
];

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gradient-to-b from-white to-gray-50/30 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 w-80 h-80 bg-rose-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-violet-100/30 rounded-full blur-3xl" />
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
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
          >
            <Quote className="w-4 h-4" />
            TESTIMONIALS
          </motion.div>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            실제 셀러들의 후기
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
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
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl p-7 border border-gray-100 shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all"
            >
              {/* Header */}
              <div className="flex items-center gap-4 mb-5">
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-lg font-bold text-white shadow-lg`}>
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Content */}
              <p className="text-gray-600 mb-6 leading-relaxed">"{testimonial.content}"</p>

              {/* Metrics */}
              <div className={`rounded-xl p-5 bg-gradient-to-br ${testimonial.color} bg-opacity-5 border border-gray-100`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${testimonial.color} flex items-center justify-center`}>
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {testimonial.metric.growth} 성장
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 line-through">{testimonial.metric.before}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <span className={`text-lg font-bold bg-gradient-to-r ${testimonial.color} bg-clip-text text-transparent`}>
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
