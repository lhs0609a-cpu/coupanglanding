'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle2, TrendingUp, Users, Award, Sparkles } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const stats = [
  { icon: Users, value: '2,847+', label: '사용 중인 셀러' },
  { icon: TrendingUp, value: '127만+', label: '등록된 상품' },
  { icon: Award, value: '4.9/5.0', label: '고객 만족도' },
];

const aiExamples = [
  {
    original: '여성 니트 가디건 봄 가을 겨울 사무실 출근룩',
    generated: [
      '[오늘출발] 부드러운 여성 니트가디건 | 봄가을 오피스룩 필수템',
      '★베스트★ 포근한 여성 울혼방 가디건 | 체형커버',
      '[1+1] 여성 니트가디건 봄가을겨울 | 출근룩 데일리',
    ],
  },
];

export default function SocialProof() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Stats */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center p-8 rounded-2xl bg-gray-50 border border-gray-100"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${COUPANG_RED}10` }}
              >
                <stat.icon className="w-6 h-6" style={{ color: COUPANG_RED }} />
              </div>
              <p className="text-4xl font-bold text-gray-900 mb-2">{stat.value}</p>
              <p className="text-gray-500">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* AI Demo - "이게 진짜 되나?" 의심 제거 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-center mb-12">
            <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>AI DEMO</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              "진짜 3초 만에 됨?"
              <br />
              <span className="text-gray-500 font-normal text-2xl">직접 확인하세요.</span>
            </h2>
          </div>

          <div className="max-w-3xl mx-auto">
            {/* Original */}
            <div className="bg-gray-50 rounded-t-2xl p-6 border border-gray-200 border-b-0">
              <p className="text-sm font-medium text-gray-500 mb-2">🙁 원본 상품명 (클릭 안 됨)</p>
              <p className="text-lg text-gray-700 bg-white p-4 rounded-lg border border-gray-200">
                {aiExamples[0].original}
              </p>
            </div>

            {/* AI Generated */}
            <div
              className="rounded-b-2xl p-6 border"
              style={{ backgroundColor: `${COUPANG_RED}05`, borderColor: `${COUPANG_RED}20` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" style={{ color: COUPANG_RED }} />
                <p className="text-sm font-medium" style={{ color: COUPANG_RED }}>
                  🔥 AI가 3초 만에 만든 상품명 (클릭됨)
                </p>
              </div>
              <div className="space-y-3">
                {aiExamples[0].generated.map((name, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="w-6 h-6 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: COUPANG_RED }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-gray-800 bg-white p-3 rounded-lg border border-gray-100 flex-1 shadow-sm">
                      {name}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="mt-6 flex items-center justify-center gap-2 p-4 rounded-xl"
                style={{ backgroundColor: `${COUPANG_RED}10` }}
              >
                <TrendingUp className="w-5 h-5" style={{ color: COUPANG_RED }} />
                <span className="font-bold" style={{ color: COUPANG_RED }}>
                  검색 노출 340% ↑ / 클릭률 2.3배 ↑
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Guarantee - 마지막 의심 제거 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 bg-gray-50 rounded-2xl p-8 border border-gray-200"
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="text-6xl">🛡️</div>
            <div className="text-center md:text-left flex-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                효과 없으면 100% 환불
              </h3>
              <p className="text-gray-600 mb-4">
                30일간 써보세요. "돈 아깝다" 싶으면 카톡 한 마디로 전액 환불.
                <br />
                <span className="font-medium text-gray-800">사유 안 물어봅니다. 3영업일 내 입금.</span>
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 justify-center md:justify-start">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
                  <span>카카오톡 한 마디면 끝</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
                  <span>사유 묻지 않음</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: COUPANG_RED }} />
                  <span>3영업일 내 입금</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
