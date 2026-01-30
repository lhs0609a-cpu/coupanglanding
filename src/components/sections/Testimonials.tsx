'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Star, Quote, TrendingUp, BadgeCheck } from 'lucide-react';

const testimonials = [
  {
    name: '김태현 대표',
    company: '태현상회',
    avatar: 'K',
    content: '하루 8시간 상품 등록 노가다가 15분으로 줄었습니다. 한 달 만에 신규 상품 847개 등록.',
    before: '월 매출 3,200만원',
    after: '월 매출 1억 800만원',
    highlight: '매출 340% 증가',
  },
  {
    name: '이수진 대표',
    company: '수진이네 패션',
    avatar: 'L',
    content: '네이버에서 쿠팡으로 확장하는데 3일 만에 끝났습니다. 500개 상품 이전 완료.',
    before: '3개월 예상',
    after: '3일 완료',
    highlight: '500개 상품 3일 이전',
  },
  {
    name: '박준혁 대표',
    company: '준혁유통',
    avatar: 'P',
    content: '밤 11시에 폴더 올려놓고 자면 아침 7시에 300개 상품이 쿠팡에 등록되어 있습니다.',
    before: '알바 3명 고용',
    after: '혼자서 처리',
    highlight: '인건비 월 267만원 절감',
  },
];

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-blue-600 font-semibold mb-4">TESTIMONIALS</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-black mb-6">
            실제 사용자들의 이야기
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Before/After 숫자로 증명합니다.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="h-full bg-white rounded-2xl p-6 border border-gray-100">
                <Quote className="w-8 h-8 text-blue-100 mb-4" />

                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>

                <p className="text-gray-700 leading-relaxed mb-6">
                  "{testimonial.content}"
                </p>

                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-center flex-1">
                      <p className="text-xs text-gray-500 mb-1">BEFORE</p>
                      <p className="text-sm font-medium text-gray-400">{testimonial.before}</p>
                    </div>
                    <div className="text-gray-300">→</div>
                    <div className="text-center flex-1">
                      <p className="text-xs text-gray-500 mb-1">AFTER</p>
                      <p className="text-sm font-medium text-black">{testimonial.after}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">{testimonial.highlight}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-black">{testimonial.name}</span>
                      <BadgeCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-sm text-gray-500">{testimonial.company}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
