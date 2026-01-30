'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Check, X, Sparkles, Zap, Crown, Building2 } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    description: '일단 써보세요',
    price: { monthly: 0, yearly: 0 },
    icon: Sparkles,
    color: 'from-gray-400 to-gray-500',
    features: [
      { text: '상품 등록 10개', included: true },
      { text: '쿠팡 계정 1개', included: true },
      { text: 'AI 요청 50회', included: true },
      { text: '자동 등록', included: false },
      { text: 'Sheets 연동', included: false },
    ],
    cta: '무료 시작',
    popular: false,
  },
  {
    name: 'Basic',
    description: '월 50개 이상',
    price: { monthly: 29000, yearly: 24000 },
    icon: Zap,
    color: 'from-blue-500 to-cyan-500',
    features: [
      { text: '상품 등록 100개', included: true },
      { text: '쿠팡 계정 2개', included: true },
      { text: 'AI 요청 500회', included: true },
      { text: '자동 등록', included: true },
      { text: 'Sheets 연동', included: true },
    ],
    cta: '7일 무료',
    popular: false,
  },
  {
    name: 'Pro',
    description: '진지한 셀러',
    price: { monthly: 79000, yearly: 66000 },
    icon: Crown,
    color: 'from-[#E31837] to-[#ff4d6a]',
    features: [
      { text: '상품 등록 1,000개', included: true },
      { text: '쿠팡 계정 5개', included: true },
      { text: 'AI 요청 2,000회', included: true },
      { text: '우선 자동 등록', included: true },
      { text: 'Sheets 연동', included: true },
      { text: '우선 지원', included: true },
    ],
    cta: '가장 인기',
    popular: true,
  },
  {
    name: 'Enterprise',
    description: '대규모 셀러',
    price: { monthly: null, yearly: null },
    icon: Building2,
    color: 'from-violet-500 to-purple-500',
    features: [
      { text: '무제한 등록', included: true },
      { text: '무제한 계정', included: true },
      { text: '무제한 AI', included: true },
      { text: '전담 매니저', included: true },
      { text: '맞춤 개발', included: true },
    ],
    cta: '문의하기',
    popular: false,
  },
];

export default function Pricing() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [isYearly, setIsYearly] = useState(true);

  const formatPrice = (price: number | null) => {
    if (price === null) return '맞춤 견적';
    if (price === 0) return '무료';
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
  };

  return (
    <section id="pricing" className="py-24 bg-gradient-to-b from-gray-50/50 to-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6">
            PRICING
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            알바 3일 = 1년 자동화
          </h2>
          <p className="text-xl text-gray-500 max-w-lg mx-auto mb-8">
            월 ₩7.9만으로 연간
            <span className="text-gray-900 font-semibold"> ₩1,000만원</span> 절감
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center p-1.5 bg-gray-100 rounded-full">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !isYearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              월간
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
              }`}
            >
              연간
              <span className="px-2 py-0.5 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white text-xs font-bold rounded-full">
                -17%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan, index) => {
            const price = isYearly ? plan.price.yearly : plan.price.monthly;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative ${plan.popular ? 'lg:-mt-4 lg:mb-4' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="px-4 py-1 bg-gradient-to-r from-[#E31837] to-[#ff4d6a] text-white text-xs font-bold rounded-full shadow-lg">
                      BEST
                    </span>
                  </div>
                )}

                <div className={`h-full bg-white rounded-2xl p-6 border-2 transition-all hover:shadow-xl ${
                  plan.popular ? 'border-[#E31837] shadow-lg shadow-rose-100' : 'border-gray-100 hover:border-gray-200'
                }`}>
                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                      <plan.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-xs text-gray-500">{plan.description}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <span className="text-3xl font-bold text-gray-900">{formatPrice(price)}</span>
                    {price !== null && price > 0 && <span className="text-gray-400 text-sm">/월</span>}
                  </div>

                  {/* CTA */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 rounded-xl font-semibold text-sm mb-5 transition-all ${
                      plan.popular
                        ? 'bg-gradient-to-r from-[#E31837] to-[#c41230] text-white shadow-lg shadow-rose-200/50'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {plan.cta}
                  </motion.button>

                  {/* Features */}
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.text}
                        className={`flex items-center gap-2.5 text-sm ${
                          feature.included ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {feature.included ? (
                          <Check className="w-4 h-4 text-[#E31837] flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        )}
                        {feature.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-10 text-center text-gray-500 text-sm"
        >
          7일 무료 · 카드 불필요 · 30일 환불 보장
        </motion.p>
      </div>
    </section>
  );
}
