'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

export default function TrustedBy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <section className="py-12 bg-white border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <p className="text-sm text-gray-500 mb-6">
            <span className="font-semibold" style={{ color: COUPANG_RED }}>2,847명</span>의 셀러가
            이미 사용 중입니다
          </p>

          {/* Stats Row */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {[
              { value: '127만+', label: '등록된 상품' },
              { value: '340%', label: '평균 노출 상승' },
              { value: '4.9/5.0', label: '고객 만족도' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
