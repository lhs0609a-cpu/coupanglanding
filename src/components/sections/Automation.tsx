'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Upload, Sparkles, Clock, CheckCircle, Moon, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: Upload,
    title: '이미지 폴더에 넣기',
    description: '상품 이미지를 폴더에 드래그 & 드롭',
    time: '30초',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Sparkles,
    title: 'AI가 상품명 생성',
    description: '클릭되는 상품명 8종 자동 생성',
    time: '3초',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Clock,
    title: '예약 시간 설정',
    description: '새벽 4시? 원하는 시간에 자동 등록',
    time: '10초',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: CheckCircle,
    title: '아침에 확인만',
    description: '자고 일어나면 쿠팡에 전부 등록 완료',
    time: '0초',
    color: 'from-emerald-500 to-teal-500',
  },
];

export default function Automation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/3 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-amber-100/30 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
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
            <Moon className="w-4 h-4" />
            AUTOMATION
          </motion.div>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            자는 동안 상품이
            <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent"> 올라갑니다</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
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
              whileHover={{ y: -4 }}
              className="relative"
            >
              <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center h-full shadow-lg shadow-gray-100/50 hover:shadow-xl transition-all">
                {/* Step Number */}
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                  {index + 1}
                </div>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mt-4 mb-5 shadow-lg`}>
                  <step.icon className="w-8 h-8 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm mb-4">{step.description}</p>

                {/* Time Badge */}
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r ${step.color} text-white shadow-sm`}>
                  소요: {step.time}
                </span>
              </div>

              {/* Connector */}
              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 w-6 items-center justify-center z-10">
                  <ArrowRight className="w-5 h-5 text-gray-300" />
                </div>
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
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="inline-flex items-center gap-5 p-6 bg-gradient-to-r from-white to-gray-50 rounded-2xl border border-gray-200 shadow-xl"
          >
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/50">
              <span className="text-3xl">⏱️</span>
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-900 mb-1">100개 상품 등록에 총 소요 시간</p>
              <p className="text-3xl font-black bg-gradient-to-r from-[#E31837] to-[#ff4d6a] bg-clip-text text-transparent">
                10분 <span className="text-lg text-gray-400 font-normal">(vs 수작업 48시간)</span>
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
