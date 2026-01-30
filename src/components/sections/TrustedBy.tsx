'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Users, TrendingUp, Award, Sparkles } from 'lucide-react';

const stats = [
  {
    icon: TrendingUp,
    value: '127만+',
    label: '등록된 상품',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: Sparkles,
    value: '340%',
    label: '평균 노출 상승',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: Award,
    value: '4.9/5.0',
    label: '고객 만족도',
    color: 'from-amber-500 to-orange-500',
  },
];

export default function TrustedBy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <section className="py-16 bg-gradient-to-r from-gray-50 via-white to-gray-50 border-y border-gray-100 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-rose-100/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-violet-100/20 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full mb-8"
          >
            <Users className="w-4 h-4 text-[#E31837]" />
            <span className="text-sm">
              <span className="font-bold text-[#E31837]">2,847명</span>
              <span className="text-gray-600">의 셀러가 이미 사용 중입니다</span>
            </span>
          </motion.div>

          {/* Stats Row */}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: index * 0.1 }}
                className="text-center group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-105 transition-transform`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
