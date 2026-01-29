'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Check, Sparkles, Zap, Crown, Building2, ArrowRight, X, Calculator } from 'lucide-react';
import Button from '../ui/Button';

const plans = [
  {
    name: 'Free',
    description: '일단 써보고 결정하세요',
    price: { monthly: 0, yearly: 0 },
    icon: Sparkles,
    color: 'gray',
    features: [
      { text: '상품 등록 10개', included: true },
      { text: '쿠팡 계정 1개', included: true },
      { text: 'AI 요청 50회/월', included: true },
      { text: 'AI 카테고리 매칭', included: true },
      { text: '네이버 변환', included: true },
      { text: 'AI 리뷰 생성', included: false },
      { text: '자동 등록', included: false },
      { text: 'Google Sheets 연동', included: false },
    ],
    cta: '무료로 체험하기',
    ctaDesc: '카드 등록 없이 바로 시작',
    popular: false,
    savings: null,
  },
  {
    name: 'Basic',
    description: '월 50개 이상 등록하는 셀러',
    price: { monthly: 29000, yearly: 24000 },
    icon: Zap,
    color: 'blue',
    features: [
      { text: '상품 등록 100개', included: true },
      { text: '쿠팡 계정 2개', included: true },
      { text: 'AI 요청 500회/월', included: true },
      { text: 'AI 카테고리 매칭', included: true },
      { text: '네이버 변환', included: true },
      { text: 'AI 리뷰 생성', included: true },
      { text: '자동 등록', included: true },
      { text: 'Google Sheets 연동', included: true },
    ],
    cta: '매달 60만원 절약 시작',
    ctaDesc: '7일 무료 후 결제',
    popular: false,
    savings: '알바비 대비 월 60만원 절감',
  },
  {
    name: 'Pro',
    description: '월 300개 이상, 진지한 셀러용',
    price: { monthly: 79000, yearly: 66000 },
    icon: Crown,
    color: 'purple',
    features: [
      { text: '상품 등록 1,000개', included: true },
      { text: '쿠팡 계정 5개', included: true },
      { text: 'AI 요청 2,000회/월', included: true },
      { text: 'AI 카테고리 매칭', included: true },
      { text: '네이버 변환', included: true },
      { text: 'AI 리뷰 생성', included: true },
      { text: '자동 등록 (우선순위)', included: true },
      { text: 'Google Sheets 연동', included: true },
      { text: '우선 지원 (평균 3분)', included: true },
      { text: 'API 액세스', included: true },
    ],
    cta: '연간 970만원 절약 시작',
    ctaDesc: '가장 인기 있는 선택',
    popular: true,
    savings: '알바 1명 연봉 수준 절감',
  },
  {
    name: 'Enterprise',
    description: '대규모 셀러, 위탁판매 업체',
    price: { monthly: null, yearly: null },
    icon: Building2,
    color: 'gray',
    features: [
      { text: '상품 등록 무제한', included: true },
      { text: '쿠팡 계정 무제한', included: true },
      { text: 'AI 요청 무제한', included: true },
      { text: '모든 기능 포함', included: true },
      { text: '전담 매니저 배정', included: true },
      { text: '맞춤형 기능 개발', included: true },
      { text: 'SLA 99.9% 보장', included: true },
      { text: '온프레미스 배포 가능', included: true },
    ],
    cta: '맞춤 견적 받기',
    ctaDesc: '24시간 내 연락드립니다',
    popular: false,
    savings: null,
  },
];

const colorVariants = {
  gray: {
    icon: 'bg-gray-100 text-gray-600',
    badge: 'bg-gray-100 text-gray-700',
    button: 'outline',
  },
  blue: {
    icon: 'bg-blue-100 text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
    button: 'outline',
  },
  purple: {
    icon: 'bg-purple-100 text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
    button: 'primary',
  },
};

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
    <section id="pricing" className="py-24 bg-gradient-to-b from-white to-gray-50 relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 mb-6"
          >
            <Calculator className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">ROI 계산 완료</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            알바 월급 <span className="text-red-500 line-through">89만원</span>
            <br />
            <span className="text-gradient">vs 셀러허브 7.9만원</span>
          </h2>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
            같은 일을 <strong className="text-purple-600">11배 저렴하게</strong>.
            <br />
            연간 <strong className="text-green-600">970만원</strong> 절감 효과.
          </p>

          {/* Anchoring Box */}
          <div className="max-w-xl mx-auto bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 mb-8">
            <p className="text-sm text-gray-600 mb-3 text-center">상품 등록 알바 고용 시</p>
            {/* Mobile: 세로 배치, Desktop: 가로 배치 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-red-600">₩473,280</p>
                <p className="text-xs text-gray-500">월 48시간 × 시급 9,860원</p>
              </div>
              <div className="text-xl sm:text-2xl text-gray-400 rotate-90 sm:rotate-0">→</div>
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-green-600">₩79,000</p>
                <p className="text-xs text-gray-500">셀러허브 Pro</p>
              </div>
              <div className="text-xl sm:text-2xl text-gray-400 hidden sm:block">=</div>
              <div className="text-center mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200 w-full sm:w-auto">
                <p className="text-xl sm:text-2xl font-bold text-purple-600">83% 절감</p>
                <p className="text-xs text-gray-500">월 394,280원 Save</p>
              </div>
            </div>
          </div>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1.5 bg-gray-100 rounded-full">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                !isYearly
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              월간 결제
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              연간 결제
              <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse">
                2개월 무료
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, index) => {
            const colors = colorVariants[plan.color as keyof typeof colorVariants];
            const price = isYearly ? plan.price.yearly : plan.price.monthly;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative ${plan.popular ? 'lg:-mt-4 lg:mb-4' : ''}`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold rounded-full shadow-lg animate-bounce">
                      83%가 선택
                    </div>
                  </div>
                )}

                <div className={`h-full bg-white rounded-3xl p-6 border-2 transition-all duration-300 ${
                  plan.popular
                    ? 'border-purple-300 shadow-xl shadow-purple-100'
                    : 'border-gray-100 hover:border-gray-200 hover:shadow-lg'
                }`}>
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center`}>
                      <plan.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-sm text-gray-500">{plan.description}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-gray-900">
                        {formatPrice(price)}
                      </span>
                      {price !== null && price > 0 && (
                        <span className="text-gray-500">/월</span>
                      )}
                    </div>
                    {isYearly && price !== null && price > 0 && plan.price.monthly !== null && plan.price.yearly !== null && (
                      <p className="text-sm text-green-600 font-medium mt-1">
                        연간 결제 시 {formatPrice((plan.price.monthly - plan.price.yearly) * 12)} 절약
                      </p>
                    )}
                  </div>

                  {/* Savings Badge */}
                  {plan.savings && (
                    <div className="mb-4 px-3 py-2 bg-green-50 rounded-xl border border-green-200">
                      <p className="text-sm font-semibold text-green-700">{plan.savings}</p>
                    </div>
                  )}

                  {/* CTA Button */}
                  <Button
                    variant={colors.button as 'primary' | 'outline'}
                    fullWidth
                    className="mb-2"
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    {plan.cta}
                  </Button>
                  <p className="text-xs sm:text-sm text-center text-gray-600 mb-6">{plan.ctaDesc}</p>

                  {/* Features */}
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.text}
                        className={`flex items-center gap-3 text-sm ${
                          feature.included ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {feature.included ? (
                          <Check className="w-5 h-5 flex-shrink-0 text-green-500" />
                        ) : (
                          <X className="w-5 h-5 flex-shrink-0 text-gray-300" />
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

        {/* Bottom Guarantee */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12"
        >
          <div className="max-w-3xl mx-auto bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border-2 border-green-200">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="text-6xl">🛡️</div>
              <div className="text-center md:text-left">
                <h4 className="text-xl font-bold text-gray-900 mb-2">
                  30일 무조건 환불 보장
                </h4>
                <p className="text-gray-600 mb-2">
                  30일간 써보시고 <strong className="text-green-700">효과 없으면 100% 환불</strong>.
                  카카오톡 한 마디면 끝. 사유 안 물어봅니다.
                </p>
                <p className="text-xs sm:text-sm text-gray-600">
                  지난 6개월 환불 요청: 2,847명 중 8명 (0.3%) · 환불 사유 1위: "쿠팡 판매 안 해서" (제품 문제 X)
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom Note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="mt-8 text-center"
        >
          <p className="text-gray-600">
            모든 플랜 7일 무료 · 카드 등록 없이 시작 · 언제든 업/다운그레이드 가능
          </p>
        </motion.div>
      </div>
    </section>
  );
}
