'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Sparkles,
  RefreshCcw,
  FolderUp,
  Calculator,
  FileSpreadsheet,
  Shield,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: '검색 1페이지 진입률 89%의 비밀',
    subtitle: 'AI 상품명 생성',
    description: '쿠팡 검색 알고리즘이 좋아하는 키워드를 AI가 자동 분석. 8종 상품명 중 가장 노출 잘 되는 걸 골라드립니다.',
    stat: '평균 검색순위 340% 상승',
    gradient: 'from-purple-500 to-indigo-500',
  },
  {
    icon: RefreshCcw,
    title: '500개 상품, 커피 한 잔 시간에 이전',
    subtitle: '네이버 → 쿠팡 변환',
    description: '스마트스토어 상품 정보를 복사해서 붙여넣기만 하세요. 쿠팡 형식으로 자동 변환됩니다.',
    stat: '3일 작업 → 10분으로 단축',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: FolderUp,
    title: '자는 동안 100개 등록되는 마법',
    subtitle: '무인 자동 등록',
    description: '폴더에 상품 이미지 넣고 자면 됩니다. 아침에 일어나면 쿠팡에 전부 등록되어 있어요.',
    stat: '24시간 무인 운영',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Calculator,
    title: '마진 까먹는 실수, 영원히 끝',
    subtitle: '스마트 가격 계산',
    description: '수수료, 배송비, 마진율 자동 계산. "어? 이거 팔면 손해네?" 더 이상 없습니다.',
    stat: '가격 실수 0건 (사용자 평균)',
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    icon: FileSpreadsheet,
    title: '내 상품, 구글 시트로 한눈에',
    subtitle: 'Google Sheets 연동',
    description: '등록한 모든 상품이 자동으로 스프레드시트에 기록됩니다. 재고 관리, 가격 수정 클릭 한 번.',
    stat: '관리 시간 80% 절감',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    icon: Shield,
    title: '5개 스토어를 1개처럼 관리',
    subtitle: '다중 계정 통합',
    description: '여러 쿠팡 계정 전환하느라 로그아웃/로그인 반복? 이제 한 화면에서 전부 관리하세요.',
    stat: '계정 전환 시간 0초',
    gradient: 'from-pink-500 to-rose-500',
  },
];

export default function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="features" className="py-24 bg-[#030014] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
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
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 mb-6"
          >
            <span className="text-sm font-medium text-red-300">왜 검색 50페이지에 있을까요?</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            경쟁 셀러는 <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">검색 1페이지</span>인데
            <br />당신은 왜 50페이지일까요?
          </h2>

          <p className="text-xl text-white/60 max-w-3xl mx-auto">
            답은 간단합니다. <strong className="text-white">상품명</strong>이 다릅니다.
            <br />
            AI가 <strong className="text-cyan-400">쿠팡 알고리즘이 좋아하는 키워드</strong>를 찾아드립니다.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${feature.gradient} rounded-3xl blur-xl opacity-0 group-hover:opacity-20 transition-all duration-500`} />
              <div className="relative h-full bg-white/[0.03] backdrop-blur-sm rounded-3xl p-8 border border-white/10 hover:border-white/20 transition-all">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${feature.gradient} p-[1px] mb-6`}>
                  <div className="w-full h-full rounded-2xl bg-[#030014] flex items-center justify-center">
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>
                </div>

                {/* Subtitle */}
                <p className="text-sm font-medium text-cyan-400 mb-2">{feature.subtitle}</p>

                {/* Content */}
                <h3 className="text-xl font-bold text-white mb-3 leading-tight">
                  {feature.title}
                </h3>
                <p className="text-white/50 leading-relaxed mb-4">
                  {feature.description}
                </p>

                {/* Stat Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">{feature.stat}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold text-center text-white mb-8">
            수작업 vs 셀러허브, <span className="text-cyan-400">뭐가 다를까요?</span>
          </h3>

          <div className="max-w-4xl mx-auto bg-white/[0.03] backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden overflow-x-auto">
            <div className="min-w-[400px]">
              <div className="grid grid-cols-3 bg-white/5 border-b border-white/10">
                <div className="p-3 sm:p-4 text-center font-medium text-white/60 text-xs sm:text-sm">비교 항목</div>
                <div className="p-3 sm:p-4 text-center font-bold text-red-400 bg-red-500/10 text-xs sm:text-sm">수작업 / 알바</div>
                <div className="p-3 sm:p-4 text-center font-bold text-emerald-400 bg-emerald-500/10 text-xs sm:text-sm">셀러허브</div>
              </div>

              {[
                { item: '100개 상품 등록', manual: '48시간', sellerhub: '10분' },
                { item: '상품명 작성', manual: '30분/개', sellerhub: '3초/개' },
                { item: '카테고리 매칭', manual: '직접 검색', sellerhub: '자동 95%' },
                { item: '월 비용', manual: '89만원', sellerhub: '7.9만원' },
                { item: '실수 가능성', manual: '높음', sellerhub: '거의 없음' },
                { item: '야근', manual: '매일', sellerhub: '불필요' },
              ].map((row, index) => (
                <div key={row.item} className={`grid grid-cols-3 ${index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'} border-b border-white/5 last:border-b-0`}>
                  <div className="p-3 sm:p-4 text-center font-medium text-white/70 text-xs sm:text-sm">{row.item}</div>
                  <div className="p-3 sm:p-4 text-center text-red-400 font-semibold text-xs sm:text-sm">{row.manual}</div>
                  <div className="p-3 sm:p-4 text-center text-emerald-400 font-bold text-xs sm:text-sm">{row.sellerhub}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-16 text-center"
        >
          <p className="text-white/50 mb-6 text-lg">
            아직도 수작업으로 하시겠습니까?
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-2xl font-bold text-lg hover:shadow-[0_0_40px_rgba(6,182,212,0.3)] transition-all"
          >
            자동화 시작하기
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
