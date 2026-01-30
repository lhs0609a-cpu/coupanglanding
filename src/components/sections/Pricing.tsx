'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Check, X, Sparkles, Zap, Crown, Building2, ArrowRight } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const plans = [
  {
    name: 'Free',
    description: '일단 써보고 결정하세요',
    price: { monthly: 0, yearly: 0 },
    icon: Sparkles,
    features: [
      { text: '상품 등록 10개', included: true },
      { text: '쿠팡 계정 1개', included: true },
      { text: 'AI 요청 50회/월', included: true },
      { text: '자동 등록', included: false },
      { text: 'Google Sheets 연동', included: false },
    ],
    cta: '무료로 시작하기',
    popular: false,
  },
  {
    name: 'Basic',
    description: '월 50개 이상 등록하는 셀러',
    price: { monthly: 29000, yearly: 24000 },
    icon: Zap,
    features: [
      { text: '상품 등록 100개', included: true },
      { text: '쿠팡 계정 2개', included: true },
      { text: 'AI 요청 500회/월', included: true },
      { text: '자동 등록', included: true },
      { text: 'Google Sheets 연동', included: true },
    ],
    cta: '7일 무료 체험',
    popular: false,
  },
  {
    name: 'Pro',
    description: '진지하게 수익 내는 셀러',
    price: { monthly: 79000, yearly: 66000 },
    icon: Crown,
    features: [
      { text: '상품 등록 1,000개', included: true },
      { text: '쿠팡 계정 5개', included: true },
      { text: 'AI 요청 2,000회/월', included: true },
      { text: '자동 등록 (우선순위)', included: true },
      { text: 'Google Sheets 연동', included: true },
      { text: '우선 지원', included: true },
    ],
    cta: '가장 인기 있는 선택',
    popular: true,
  },
  {
    name: 'Enterprise',
    description: '대규모 셀러, 위탁판매 업체',
    price: { monthly: null, yearly: null },
    icon: Building2,
    features: [
      { text: '상품 등록 무제한', included: true },
      { text: '쿠팡 계정 무제한', included: true },
      { text: 'AI 요청 무제한', included: true },
      { text: '전담 매니저 배정', included: true },
      { text: '맞춤형 기능 개발', included: true },
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
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>PRICING</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            알바 3일 월급 = 1년 자동화
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
            월 ₩7.9만으로 연간 <strong className="text-gray-900">₩1,068만원</strong> 인건비 절감
          </p>
          <p className="text-gray-500 mb-8">연간 결제 시 2개월 무료</p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1.5 bg-gray-100 rounded-full">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                !isYearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
              }`}
            >
              월간
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
              }`}
            >
              연간
              <span
                className="px-2 py-0.5 text-white text-xs font-bold rounded-full"
                style={{ backgroundColor: COUPANG_RED }}
              >
                -17%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <div
                      className="px-4 py-1.5 text-white text-sm font-semibold rounded-full"
                      style={{ backgroundColor: COUPANG_RED }}
                    >
                      가장 인기
                    </div>
                  </div>
                )}

                <div
                  className={`h-full bg-white rounded-2xl p-6 border-2 transition-all ${
                    plan.popular ? 'shadow-lg' : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={plan.popular ? { borderColor: COUPANG_RED } : {}}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        plan.popular ? 'text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                      style={plan.popular ? { backgroundColor: COUPANG_RED } : {}}
                    >
                      <plan.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-sm text-gray-500">{plan.description}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">{formatPrice(price)}</span>
                    {price !== null && price > 0 && <span className="text-gray-500">/월</span>}
                  </div>

                  <button
                    className={`w-full py-3 rounded-full font-medium mb-6 transition-colors ${
                      plan.popular ? 'text-white hover:opacity-90' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={plan.popular ? { backgroundColor: COUPANG_RED } : {}}
                  >
                    {plan.cta}
                  </button>

                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.text}
                        className={`flex items-center gap-3 text-sm ${
                          feature.included ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {feature.included ? (
                          <Check className="w-5 h-5 flex-shrink-0" style={{ color: COUPANG_RED }} />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
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

        {/* ROI Calculator Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 p-6 bg-gray-50 rounded-2xl border border-gray-100 max-w-3xl mx-auto"
        >
          <div className="flex items-start gap-4">
            <div className="text-4xl">💡</div>
            <div>
              <h4 className="font-bold text-gray-900 mb-2">투자 대비 수익 계산</h4>
              <p className="text-gray-600 text-sm">
                Pro 플랜(₩7.9만/월) vs 알바 1명(₩89만/월) 비교:
                <br />
                <span className="font-semibold text-gray-900">
                  연간 ₩972만원 절감 + 24시간 자동화 + 실수 0건
                </span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Bottom Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-8 text-center text-gray-500"
        >
          모든 플랜 7일 무료 · 카드 등록 없이 시작 · 30일 환불 보장
        </motion.p>
      </div>
    </section>
  );
}
