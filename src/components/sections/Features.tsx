'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Sparkles,
  RefreshCcw,
  FolderUp,
  Calculator,
  FileSpreadsheet,
  Shield,
  ArrowRight,
} from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI 상품명 8종',
    description: '쿠팡 검색 알고리즘 분석. 클릭되는 상품명 자동 생성.',
    stat: '340% 노출↑',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: RefreshCcw,
    title: '네이버 → 쿠팡',
    description: 'URL 붙여넣기만. 이미지, 옵션 자동 변환.',
    stat: '3일→10분',
    color: 'from-orange-500 to-rose-500',
  },
  {
    icon: FolderUp,
    title: '24시간 자동등록',
    description: '이미지 넣고 자면 끝. 새벽에도 자동 업로드.',
    stat: '무인 운영',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Calculator,
    title: '가격 자동계산',
    description: '수수료, 배송비, 마진율. 실수 없는 가격 설정.',
    stat: '실수 0건',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: FileSpreadsheet,
    title: 'Sheets 연동',
    description: '등록 상품 실시간 기록. 재고관리 한눈에.',
    stat: '80% 절감',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Shield,
    title: '다중 계정 관리',
    description: '5개 계정 한 화면. 로그아웃 반복 끝.',
    stat: '전환 0초',
    color: 'from-amber-500 to-orange-500',
  },
];

export default function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="features" className="py-24 bg-gradient-to-b from-white to-gray-50/50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-block px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
          >
            FEATURES
          </motion.span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            48시간 → 10분
          </h2>
          <p className="text-xl text-gray-500 max-w-lg mx-auto">
            반복 작업은 AI에게.
            <span className="text-gray-900 font-medium"> 당신은 돈 버는 일만.</span>
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              whileHover={{ y: -4 }}
              className="group relative bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300"
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-105 transition-transform`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{feature.description}</p>

              {/* Stat Badge */}
              <span className="inline-block px-3 py-1 bg-gray-50 rounded-full text-xs font-semibold text-gray-600">
                {feature.stat}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            수작업 vs 셀러허브
          </h3>

          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
            <div className="grid grid-cols-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
              <div className="p-4 text-center text-sm font-medium text-gray-500">비교</div>
              <div className="p-4 text-center text-sm font-bold text-gray-400">수작업</div>
              <div className="p-4 text-center text-sm font-bold text-[#E31837]">셀러허브</div>
            </div>

            {[
              { item: '100개 등록', manual: '48시간', sellerhub: '10분' },
              { item: '상품명', manual: '30분/개', sellerhub: '3초/개' },
              { item: '월 비용', manual: '₩89만', sellerhub: '₩7.9만' },
            ].map((row, index) => (
              <div
                key={row.item}
                className={`grid grid-cols-3 ${index !== 2 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="p-4 text-center text-sm font-medium text-gray-700">{row.item}</div>
                <div className="p-4 text-center text-sm text-gray-400 line-through">{row.manual}</div>
                <div className="p-4 text-center text-sm font-bold text-[#E31837]">{row.sellerhub}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-12 text-center"
        >
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#E31837] to-[#c41230] text-white rounded-full font-semibold shadow-xl shadow-rose-200/50 hover:shadow-2xl transition-all"
          >
            7일 무료 체험
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
