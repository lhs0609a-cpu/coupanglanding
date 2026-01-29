'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, TrendingUp, Clock, Users, Award, Sparkles, ArrowRight } from 'lucide-react';

const objections = [
  {
    worry: '"AI가 만든 상품명, 티 나면 어떡해?"',
    answer: '쿠팡 가이드라인 100% 준수. 실제 사용자 평균 검색 순위 340% 상승. 아래 실제 예시를 확인하세요.',
    proof: '검색 1페이지 진입률 89%',
  },
  {
    worry: '"싼 게 비지떡 아니야?"',
    answer: '알바 1명 월급 89만원 vs 셀러허브 7.9만원. 같은 일을 11배 저렴하게. 오히려 AI가 더 정확함.',
    proof: '연간 972만원 절감 효과',
  },
  {
    worry: '"기술적으로 어려우면 어떡해?"',
    answer: '폴더 업로드 한 번이면 끝. 클릭 3번으로 쿠팡 등록 완료. 60대 사장님도 5분 만에 마스터.',
    proof: '평균 학습 시간 5분',
  },
  {
    worry: '"돈 낸 만큼 효과 없으면?"',
    answer: '7일 무료 체험 + 30일 100% 환불 보장. 카톡 한 마디면 끝. 사유 안 물어봄.',
    proof: '환불 요청률 0.3%',
  },
];

const socialProofStats = [
  { icon: Users, value: '2,847+', label: '활성 셀러', color: 'purple' },
  { icon: TrendingUp, value: '127만+', label: '등록된 상품', color: 'blue' },
  { icon: Clock, value: '892,340', label: '시간 절감 (누적)', color: 'green' },
  { icon: Award, value: '4.9/5.0', label: '고객 만족도', color: 'yellow' },
];

const aiExamples = [
  {
    original: '여성 니트 가디건 봄 가을 겨울 사무실 출근룩',
    generated: [
      '[오늘출발] 부드러운 여성 니트가디건 | 봄가을 오피스룩 필수템 | S-2XL',
      '★베스트★ 포근한 여성 울혼방 가디건 | 체형커버 | 사무실룩',
      '[1+1] 여성 니트가디건 봄가을겨울 | 출근룩 데일리 | 12컬러',
    ],
    result: '검색 노출 340% 상승, 클릭률 2.3배 증가',
  },
  {
    original: '남성 반팔티 여름 반팔 티셔츠 면',
    generated: [
      '[쿠팡추천] 시원한 남성 반팔티 | 100% 순면 | 여름 필수템',
      '★1위★ 남자 반팔 티셔츠 | 땀흡수 | 데일리룩 | M-3XL',
      '[1+1이벤트] 남성 면 반팔티 | 여름 기본티 | 15컬러',
    ],
    result: '검색 순위 1페이지 진입, 전환율 45% 상승',
  },
];

export default function SocialProof() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [activeExample, setActiveExample] = useState(0);

  return (
    <section className="py-24 bg-[#030014] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-red-500/10 rounded-full blur-[150px]" />
      </div>

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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-300">솔직히 말씀드릴게요</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            이런 <span className="text-red-400">걱정</span> 하고 계시죠?
          </h2>

          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            저희도 알아요. 새로운 툴 도입이 쉬운 결정이 아니라는 것.
            <br />
            <strong className="text-white">그래서 미리 답변 준비했습니다.</strong>
          </p>
        </motion.div>

        {/* Objection Handling Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {objections.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 border border-white/10 hover:border-white/20 transition-all"
            >
              {/* Worry */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-lg font-semibold text-red-400 italic">
                  {item.worry}
                </p>
              </div>

              {/* Answer */}
              <div className="flex items-start gap-3 mb-4 pl-11">
                <p className="text-white/70 leading-relaxed">
                  {item.answer}
                </p>
              </div>

              {/* Proof Badge */}
              <div className="pl-11">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">{item.proof}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* AI Product Name Demo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-20"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">실제 AI 상품명 예시</span>
            </div>
            <h3 className="text-2xl font-bold text-white">
              "AI가 만든 거 티 난다"고요? <span className="text-purple-400">직접 보세요.</span>
            </h3>
          </div>

          {/* Example Tabs */}
          <div className="flex justify-center gap-4 mb-6">
            {aiExamples.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveExample(index)}
                className={`px-4 py-2 rounded-full font-medium transition-all ${
                  activeExample === index
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                예시 {index + 1}
              </button>
            ))}
          </div>

          {/* Example Card */}
          <div className="max-w-3xl mx-auto bg-white/[0.03] backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-white/10 overflow-hidden">
            {/* Original */}
            <div className="p-4 sm:p-6 bg-red-500/10 border-b border-red-500/20">
              <p className="text-xs sm:text-sm font-medium text-red-400 mb-2">원본 상품명 (평범함)</p>
              <p className="text-sm sm:text-lg text-white bg-white/5 p-2 sm:p-3 rounded-lg border border-red-500/20 break-words">
                {aiExamples[activeExample].original}
              </p>
            </div>

            {/* AI Generated */}
            <div className="p-4 sm:p-6 bg-emerald-500/10">
              <p className="text-xs sm:text-sm font-medium text-emerald-400 mb-3 sm:mb-4">AI 생성 상품명 (검색 최적화)</p>
              <div className="space-y-2 sm:space-y-3">
                {aiExamples[activeExample].generated.map((name, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-2 sm:gap-3"
                  >
                    <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-white bg-white/5 p-2 sm:p-3 rounded-lg border border-emerald-500/20 flex-1 break-words leading-relaxed">
                      {name}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Result */}
              <div className="mt-4 sm:mt-6 flex items-center justify-center gap-2 p-3 sm:p-4 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl border border-emerald-500/30">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                <span className="font-bold text-emerald-300 text-sm sm:text-base text-center">{aiExamples[activeExample].result}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trust Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-8 sm:p-12"
        >
          <div className="text-center mb-10">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              숫자로 증명합니다
            </h3>
            <p className="text-gray-400">
              이미 2,847명의 셀러가 선택한 이유
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {socialProofStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
                className="text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-gray-300 text-sm">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Guarantee Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-3xl p-8 border border-emerald-500/20"
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Shield className="w-12 h-12 text-emerald-400" />
              </div>
            </div>
            <div className="text-center md:text-left flex-1">
              <h3 className="text-2xl font-bold text-white mb-2">
                30일 무조건 환불 보장
              </h3>
              <p className="text-white/70 mb-4">
                30일간 사용해보시고, <strong className="text-emerald-400">기대한 효과가 없으면 전액 환불</strong>해드립니다.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 text-sm text-white/60">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>카카오톡 한 마디면 끝</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>사유 묻지 않음</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>3영업일 내 입금</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-white/40 mt-4">
                * 실제 환불 요청: 2,847명 중 8명 (0.3%) · 환불 사유 1위: "쿠팡 판매 안 해서"
              </p>
            </div>
            <div className="flex-shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-full font-semibold hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all"
              >
                위험 없이 시작하기
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
