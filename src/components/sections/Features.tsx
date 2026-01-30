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
  Check,
} from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI 상품명 생성',
    description: '쿠팡 검색 알고리즘이 좋아하는 키워드를 AI가 자동 분석하여 8종의 상품명을 생성합니다.',
    stat: '검색순위 340% 상승',
  },
  {
    icon: RefreshCcw,
    title: '네이버 → 쿠팡 변환',
    description: '스마트스토어 상품 정보를 복사해서 붙여넣기만 하면 쿠팡 형식으로 자동 변환됩니다.',
    stat: '3일 → 10분으로 단축',
  },
  {
    icon: FolderUp,
    title: '무인 자동 등록',
    description: '폴더에 상품 이미지를 넣고 자면 됩니다. 아침에 일어나면 쿠팡에 전부 등록되어 있어요.',
    stat: '24시간 무인 운영',
  },
  {
    icon: Calculator,
    title: '스마트 가격 계산',
    description: '수수료, 배송비, 마진율을 자동 계산합니다. 가격 실수로 손해보는 일이 없습니다.',
    stat: '가격 실수 0건',
  },
  {
    icon: FileSpreadsheet,
    title: 'Google Sheets 연동',
    description: '등록한 모든 상품이 자동으로 스프레드시트에 기록됩니다. 재고 관리가 쉬워집니다.',
    stat: '관리 시간 80% 절감',
  },
  {
    icon: Shield,
    title: '다중 계정 통합',
    description: '여러 쿠팡 계정을 한 화면에서 관리하세요. 로그아웃/로그인 반복이 필요 없습니다.',
    stat: '계정 전환 0초',
  },
];

export default function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="features" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-blue-600 font-semibold mb-4">FEATURES</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-black mb-6">
            이렇게 시간을 절약합니다
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            반복적인 작업은 AI에게 맡기고, 당신은 사업에 집중하세요.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-blue-100 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-6">
                <feature.icon className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-black mb-3">{feature.title}</h3>
              <p className="text-gray-600 mb-4 leading-relaxed">{feature.description}</p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">
                <Check className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700">{feature.stat}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold text-center text-black mb-8">
            수작업 vs 셀러허브
          </h3>

          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
              <div className="p-4 text-center font-medium text-gray-600">비교 항목</div>
              <div className="p-4 text-center font-bold text-gray-400">수작업</div>
              <div className="p-4 text-center font-bold text-blue-600">셀러허브</div>
            </div>

            {[
              { item: '100개 상품 등록', manual: '48시간', sellerhub: '10분' },
              { item: '상품명 작성', manual: '30분/개', sellerhub: '3초/개' },
              { item: '카테고리 매칭', manual: '직접 검색', sellerhub: '자동 95%' },
              { item: '월 비용', manual: '89만원', sellerhub: '7.9만원' },
            ].map((row, index) => (
              <div key={row.item} className={`grid grid-cols-3 border-b border-gray-100 last:border-b-0 ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <div className="p-4 text-center font-medium text-gray-700">{row.item}</div>
                <div className="p-4 text-center text-gray-400 line-through">{row.manual}</div>
                <div className="p-4 text-center text-blue-600 font-bold">{row.sellerhub}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 text-center"
        >
          <button className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-full font-semibold text-lg hover:bg-blue-700 transition-all">
            자동화 시작하기
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
