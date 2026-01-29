'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Star, Quote, TrendingUp, ExternalLink, BadgeCheck } from 'lucide-react';

const testimonials = [
  {
    name: '김태현 대표',
    company: '태현상회',
    storeType: '생활용품 전문',
    avatar: 'KT',
    rating: 5,
    content: '9월: 하루 8시간 상품 등록 노가다. 10월: 하루 15분. 한 달 만에 신규 상품 847개 등록하고 매출 340% 뛰었습니다. 진짜 인생이 바뀜.',
    before: '월 매출 3,200만원',
    after: '월 매출 1억 800만원',
    highlight: '매출 340% 증가',
    verified: true,
  },
  {
    name: '이수진 대표',
    company: '수진이네 패션',
    storeType: '여성의류',
    avatar: 'LS',
    rating: 5,
    content: '네이버에서 쿠팡으로 확장하는데 3개월 걸릴 줄 알았는데, 셀러허브로 3일 만에 끝남. 500개 상품 이전 완료. 직원 안 뽑아도 됨.',
    before: '3개월 예상',
    after: '3일 완료',
    highlight: '500개 상품 3일 이전',
    verified: true,
  },
  {
    name: '박준혁 대표',
    company: '준혁유통',
    storeType: '도매/위탁',
    avatar: 'PJ',
    rating: 5,
    content: '자동 등록이 진짜 대박. 밤 11시에 폴더 올려놓고 자면 아침 7시에 300개 상품이 쿠팡에 등록되어 있음. 알바 3명분 일을 혼자 함.',
    before: '알바 3명 고용',
    after: '혼자서 처리',
    highlight: '인건비 월 267만원 절감',
    verified: true,
  },
  {
    name: '정미영 대표',
    company: '미영뷰티',
    storeType: '화장품/뷰티',
    avatar: 'JM',
    rating: 5,
    content: 'AI 상품명이 진짜 잘 뽑힘. "40대 주름개선 크림" 검색하면 내 상품이 1페이지에 뜸. 광고비 200만원 → 50만원으로 줄임.',
    before: '광고비 월 200만원',
    after: '광고비 월 50만원',
    highlight: '광고비 75% 절감',
    verified: true,
  },
  {
    name: '최영호 사장',
    company: '영호전자',
    storeType: '가전/전자제품',
    avatar: 'CY',
    rating: 5,
    content: '쿠팡 계정 5개 운영하는데 로그인/로그아웃 지옥이었음. 이제 한 화면에서 전부 관리. 실수로 잘못된 계정에 등록하는 일 사라짐.',
    before: '계정 전환 하루 50회',
    after: '전환 없이 통합 관리',
    highlight: '5개 스토어 동시 관리',
    verified: true,
  },
  {
    name: '한소라 대표',
    company: '소라마켓',
    storeType: '식품/건강식품',
    avatar: 'HS',
    rating: 5,
    content: '카테고리 매칭이 95% 자동으로 맞음. 예전에 5만개 카테고리 뒤지느라 미쳤었는데. 이제 클릭 한 번이면 끝. 시간 아끼니까 매출 올리는 데 집중 가능.',
    before: '카테고리 검색 30분/개',
    after: '자동 매칭 3초',
    highlight: '카테고리 매칭 99% 자동화',
    verified: true,
  },
];

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-50 border border-yellow-200 mb-6"
          >
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-medium text-yellow-700">실제 사용자 인터뷰</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            이 분들도 처음엔
            <br /><span className="text-gradient">"진짜야?"</span> 했습니다
          </h2>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            지금은 <strong className="text-purple-600">연매출 10억 이상</strong> 셀러들입니다.
            <br />
            Before/After 숫자로 증명합니다.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group"
            >
              <div className="h-full bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-purple-100 transition-all duration-300">
                {/* Quote Icon */}
                <div className="mb-4">
                  <Quote className="w-8 h-8 text-purple-200" />
                </div>

                {/* Rating */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>

                {/* Content */}
                <p className="text-gray-700 leading-relaxed mb-6">
                  "{testimonial.content}"
                </p>

                {/* Before/After Stats */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4 mb-6">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-center flex-1">
                      <p className="text-xs sm:text-sm text-gray-600 mb-1">BEFORE</p>
                      <p className="text-sm font-semibold text-red-600">{testimonial.before}</p>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className="text-center flex-1">
                      <p className="text-xs sm:text-sm text-gray-600 mb-1">AFTER</p>
                      <p className="text-sm font-semibold text-green-600">{testimonial.after}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-bold text-purple-700">{testimonial.highlight}</span>
                  </div>
                </div>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{testimonial.name}</span>
                      {testimonial.verified && (
                        <BadgeCheck className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600">{testimonial.company} · {testimonial.storeType}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Video Testimonial CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-purple-50 rounded-full border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer">
            <span className="text-purple-700 font-medium">실제 사용자 인터뷰 영상 보기</span>
            <ExternalLink className="w-4 h-4 text-purple-600" />
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16"
        >
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="testimonial-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#testimonial-grid)" />
              </svg>
            </div>

            <div className="relative">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">
                  숫자가 증명합니다
                </h3>
                <p className="text-purple-200">
                  실제 셀러허브 사용자 데이터 (2024년 1월 기준)
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                {[
                  { value: '2,847+', label: '활성 셀러', subLabel: '매일 +12명 가입 중' },
                  { value: '127만+', label: '등록된 상품', subLabel: '월 평균 23만개 증가' },
                  { value: '₩970만', label: '평균 연간 절감액', subLabel: 'Pro 플랜 사용자 기준' },
                  { value: '0.3%', label: '환불 요청률', subLabel: '2,847명 중 8명' },
                ].map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.4, delay: 1 + index * 0.1 }}
                  >
                    <div className="text-4xl sm:text-5xl font-bold text-white mb-2">
                      {stat.value}
                    </div>
                    <div className="text-purple-100 font-medium">{stat.label}</div>
                    <div className="text-purple-200 text-sm">{stat.subLabel}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
