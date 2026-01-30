'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Upload, Sparkles, Clock, CheckCircle } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const steps = [
  {
    icon: Upload,
    title: '이미지 폴더에 넣기',
    description: '상품 이미지를 폴더에 드래그 & 드롭',
    time: '30초',
  },
  {
    icon: Sparkles,
    title: 'AI가 상품명 생성',
    description: '클릭되는 상품명 8종 자동 생성',
    time: '3초',
  },
  {
    icon: Clock,
    title: '예약 시간 설정',
    description: '새벽 4시? 원하는 시간에 자동 등록',
    time: '10초',
  },
  {
    icon: CheckCircle,
    title: '아침에 확인만',
    description: '자고 일어나면 쿠팡에 전부 등록 완료',
    time: '0초',
  },
];

export default function Automation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>AUTOMATION</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            자는 동안 상품이 올라갑니다
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            새벽 4시에 알람 맞춰서 등록? 그런 거 없습니다.
            <br />
            <span className="font-medium text-gray-900">이미지 넣고 자면 끝.</span>
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative"
            >
              <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center h-full shadow-sm">
                {/* Step Number */}
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: COUPANG_RED }}
                >
                  {index + 1}
                </div>

                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mt-4 mb-4"
                  style={{ backgroundColor: `${COUPANG_RED}10` }}
                >
                  <step.icon className="w-7 h-7" style={{ color: COUPANG_RED }} />
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm mb-3">{step.description}</p>

                {/* Time Badge */}
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${COUPANG_RED}08`, color: COUPANG_RED }}
                >
                  소요: {step.time}
                </span>
              </div>

              {/* Connector */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-0.5 bg-gray-200" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="text-4xl">⏱️</div>
            <div className="text-left">
              <p className="font-bold text-gray-900">100개 상품 등록에 총 소요 시간</p>
              <p className="text-2xl font-black" style={{ color: COUPANG_RED }}>
                10분 (vs 수작업 48시간)
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
