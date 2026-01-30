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

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const features = [
  {
    icon: Sparkles,
    title: 'AI 상품명 8종 자동 생성',
    description: '쿠팡 검색 알고리즘이 좋아하는 키워드를 AI가 분석. "여성 니트"를 넣으면 클릭되는 상품명이 8개 나옵니다.',
    stat: '검색순위 340% 상승',
  },
  {
    icon: RefreshCcw,
    title: '네이버 → 쿠팡 1분 변환',
    description: '스마트스토어 상품 URL만 붙여넣으세요. 이미지, 설명, 옵션까지 쿠팡 형식으로 자동 변환.',
    stat: '3일 → 10분 단축',
  },
  {
    icon: FolderUp,
    title: '자는 동안 자동 등록',
    description: '폴더에 이미지 넣고 자면 끝. 아침에 일어나면 쿠팡에 전부 올라가 있습니다. 24시간 무인 운영.',
    stat: '새벽 4시도 자동 등록',
  },
  {
    icon: Calculator,
    title: '가격 실수 0원 보장',
    description: '수수료, 배송비, 마진율 자동 계산. "어? 마이너스네?" 하는 일이 없습니다.',
    stat: '가격 실수 0건',
  },
  {
    icon: FileSpreadsheet,
    title: 'Google Sheets 자동 연동',
    description: '등록한 상품이 실시간으로 스프레드시트에 기록. 재고 관리, 매출 추적이 한눈에.',
    stat: '관리 시간 80% 절감',
  },
  {
    icon: Shield,
    title: '다중 계정 한 화면 관리',
    description: '쿠팡 계정 5개를 한 화면에서. 로그아웃/로그인 반복? 필요 없습니다.',
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
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>FEATURES</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            48시간 → 10분으로 줄이는 방법
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            반복 작업은 AI에게 맡기세요.
            <br />
            <span className="font-medium text-gray-900">당신은 돈 버는 일에만 집중하세요.</span>
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
              className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition-all"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                style={{ backgroundColor: `${COUPANG_RED}10` }}
              >
                <feature.icon className="w-6 h-6" style={{ color: COUPANG_RED }} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 mb-4 leading-relaxed">{feature.description}</p>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: `${COUPANG_RED}08` }}
              >
                <Check className="w-4 h-4" style={{ color: COUPANG_RED }} />
                <span className="text-sm font-semibold" style={{ color: COUPANG_RED }}>
                  {feature.stat}
                </span>
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
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            수작업 vs 셀러허브 <span style={{ color: COUPANG_RED }}>(진짜 비교)</span>
          </h3>

          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 border-b border-gray-200" style={{ backgroundColor: `${COUPANG_RED}05` }}>
              <div className="p-4 text-center font-medium text-gray-600">비교 항목</div>
              <div className="p-4 text-center font-bold text-gray-400">수작업 (알바)</div>
              <div className="p-4 text-center font-bold" style={{ color: COUPANG_RED }}>셀러허브</div>
            </div>

            {[
              { item: '100개 상품 등록', manual: '48시간', sellerhub: '10분' },
              { item: '상품명 작성', manual: '30분/개', sellerhub: '3초/개' },
              { item: '카테고리 매칭', manual: '직접 검색', sellerhub: '자동 95%' },
              { item: '월 비용', manual: '₩89만원', sellerhub: '₩7.9만원' },
              { item: '실수율', manual: '평균 5%', sellerhub: '0%' },
            ].map((row, index) => (
              <div
                key={row.item}
                className={`grid grid-cols-3 border-b border-gray-100 last:border-b-0 ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}
              >
                <div className="p-4 text-center font-medium text-gray-700">{row.item}</div>
                <div className="p-4 text-center text-gray-400 line-through">{row.manual}</div>
                <div className="p-4 text-center font-bold" style={{ color: COUPANG_RED }}>
                  {row.sellerhub}
                </div>
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
          <button
            className="inline-flex items-center gap-2 px-8 py-4 text-white rounded-full font-semibold text-lg hover:opacity-90 transition-all"
            style={{ backgroundColor: COUPANG_RED }}
          >
            7일 무료 체험 시작하기
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
