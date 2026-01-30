'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Check, Shield, Clock } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

export default function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="py-24" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* Urgency Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            style={{ backgroundColor: `${COUPANG_RED}20`, border: `1px solid ${COUPANG_RED}40` }}
          >
            <Clock className="w-4 h-4" style={{ color: COUPANG_RED }} />
            <span className="text-sm font-medium" style={{ color: COUPANG_RED }}>
              오늘 가입하면 7일 무료
            </span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            지금 시작하면
            <br />
            <span style={{ color: COUPANG_RED }}>내일 아침 쿠팡에 상품이 있습니다</span>
          </h2>

          <p className="text-xl text-gray-400 mb-12 max-w-xl mx-auto">
            더 미루면 알바비만 나갑니다.
            <br />
            <span className="text-white font-medium">7일 무료, 카드 등록도 필요 없습니다.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              className="group px-8 py-4 text-white rounded-full font-semibold text-lg hover:opacity-90 transition-all flex items-center gap-2"
              style={{ backgroundColor: COUPANG_RED }}
            >
              지금 무료로 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" style={{ color: COUPANG_RED }} />
              <span>7일 무료 체험</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" style={{ color: COUPANG_RED }} />
              <span>카드 등록 불필요</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: COUPANG_RED }} />
              <span>30일 환불 보장</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
