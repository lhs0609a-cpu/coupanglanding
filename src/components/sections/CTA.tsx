'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Check, Shield } from 'lucide-react';

export default function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="py-24 bg-black">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            지금 시작하면
            <br />
            내일 아침 쿠팡에 상품이 있습니다
          </h2>

          <p className="text-xl text-gray-400 mb-12 max-w-xl mx-auto">
            7일 무료 체험. 카드 등록 없이 바로 시작하세요.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button className="group px-8 py-4 bg-blue-600 text-white rounded-full font-semibold text-lg hover:bg-blue-700 transition-all flex items-center gap-2">
              무료로 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-500" />
              <span>7일 무료 체험</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-500" />
              <span>카드 등록 불필요</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <span>30일 환불 보장</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
