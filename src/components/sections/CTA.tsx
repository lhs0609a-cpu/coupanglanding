'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Check, Shield, Sparkles } from 'lucide-react';

export default function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="py-24 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#E31837]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-8"
          >
            <Sparkles className="w-4 h-4 text-[#ff6b7a]" />
            <span className="text-sm font-medium text-white/80">오늘 시작하면 7일 무료</span>
          </motion.div>

          {/* Headline */}
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            지금 시작하면
            <br />
            <span className="bg-gradient-to-r from-[#ff6b7a] to-[#ff8a94] bg-clip-text text-transparent">
              내일 아침 상품이 올라갑니다
            </span>
          </h2>

          <p className="text-xl text-gray-400 mb-10 max-w-lg mx-auto">
            더 미루면 알바비만 나갑니다.
            <br />
            <span className="text-white font-medium">7일 무료, 카드 불필요.</span>
          </p>

          {/* CTA Button */}
          <motion.button
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.98 }}
            className="group px-10 py-5 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white rounded-full font-bold text-lg shadow-2xl shadow-rose-500/30 hover:shadow-rose-500/40 transition-all flex items-center gap-3 mx-auto mb-10"
          >
            지금 무료로 시작하기
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400 text-sm">
            {[
              { icon: Check, text: '7일 무료' },
              { icon: Check, text: '카드 불필요' },
              { icon: Shield, text: '30일 환불 보장' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2">
                <item.icon className="w-4 h-4 text-[#ff6b7a]" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
