'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  Upload,
  Calculator,
  Layers,
  FileText,
  MessageSquare,
  Settings2,
  ClipboardCheck,
  Rocket,
  CheckCircle,
  Zap,
} from 'lucide-react';

const pipelineSteps = [
  { icon: Upload, name: '스캔', percent: 5, description: '폴더/이미지 인식' },
  { icon: Calculator, name: '가격 계산', percent: 10, description: '마진율 자동 적용' },
  { icon: Layers, name: '카테고리', percent: 30, description: 'AI 자동 매칭' },
  { icon: FileText, name: '상품명', percent: 50, description: 'AI 8종 생성' },
  { icon: MessageSquare, name: '리뷰', percent: 60, description: 'AI 5종 생성' },
  { icon: Settings2, name: '옵션 변환', percent: 70, description: '옵션 정규화' },
  { icon: ClipboardCheck, name: '필드 채우기', percent: 80, description: '필수 정보 입력' },
  { icon: Rocket, name: '쿠팡 등록', percent: 100, description: 'API 전송 완료' },
];

export default function Automation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="automation" className="py-24 bg-[#030014] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[150px]" />
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6"
          >
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">완전 자동화</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">업로드 한 번</span>으로
            <br />쿠팡까지 자동 등록
          </h2>

          <p className="text-xl text-white/60 max-w-3xl mx-auto">
            R2 스토리지에 상품 폴더만 업로드하세요.
            <br />
            8단계 자동화 파이프라인이 모든 것을 처리합니다.
          </p>
        </motion.div>

        {/* Pipeline Visualization */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-16"
        >
          {/* Progress Bar */}
          <div className="relative mb-8">
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={isInView ? { width: `${pipelineSteps[activeStep].percent}%` } : {}}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
              />
            </div>
            <div className="absolute right-0 -top-6 text-sm font-semibold text-emerald-400">
              {pipelineSteps[activeStep].percent}%
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-4">
            {pipelineSteps.map((step, index) => (
              <motion.button
                key={step.name}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.08 }}
                onClick={() => setActiveStep(index)}
                className={`relative p-3 sm:p-4 rounded-2xl transition-all duration-300 ${
                  index <= activeStep
                    ? 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30'
                    : 'bg-white/5 border border-white/10'
                } ${index === activeStep ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#030014]' : ''}`}
              >
                {/* Completion Check */}
                {index < activeStep && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                )}

                <div className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-xl flex items-center justify-center mb-2 ${
                  index <= activeStep
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
                    : 'bg-white/10 text-white/40'
                }`}>
                  <step.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>

                <div className="text-center">
                  <div className={`text-xs sm:text-sm font-semibold ${
                    index <= activeStep ? 'text-white' : 'text-white/40'
                  }`}>
                    {step.name}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5 hidden sm:block">
                    {step.description}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-3xl p-8 border border-purple-500/20"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center mb-6">
              <Upload className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              폴더 업로드만으로 끝
            </h3>
            <p className="text-white/60 leading-relaxed">
              R2 스토리지에 상품 폴더를 업로드하세요.
              이미지와 상품 정보를 자동으로 인식합니다.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-3xl p-8 border border-emerald-500/20"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              24시간 무인 운영
            </h3>
            <p className="text-white/60 leading-relaxed">
              자는 동안에도 상품이 자동으로 등록됩니다.
              실시간 진행 상황 모니터링 가능.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-3xl p-8 border border-blue-500/20"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6">
              <Rocket className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              대량 등록 최적화
            </h3>
            <p className="text-white/60 leading-relaxed">
              수백 개 상품도 한 번에 처리.
              병렬 처리로 빠른 등록 속도.
            </p>
          </motion.div>
        </div>

        {/* Demo Video Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-16"
        >
          <div className="bg-gray-900 rounded-3xl overflow-hidden">
            <div className="p-6 sm:p-10">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="text-white">
                  <h3 className="text-2xl sm:text-3xl font-bold mb-4">
                    실제 동작 화면을 확인하세요
                  </h3>
                  <p className="text-gray-300 mb-6">
                    폴더 업로드부터 쿠팡 등록 완료까지,
                    전체 자동화 과정을 영상으로 확인하세요.
                  </p>

                  <ul className="space-y-3">
                    {[
                      '상품 폴더 업로드 → 자동 스캔',
                      'AI 상품명, 리뷰, 카테고리 생성',
                      '쿠팡 API 연동 → 자동 등록',
                      'Google Sheets 자동 백업',
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 text-gray-300">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Video Placeholder */}
                <div className="relative aspect-video bg-gray-800 rounded-2xl overflow-hidden group cursor-pointer">
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />

                  {/* Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
                        <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-gray-900 border-b-8 border-b-transparent ml-1" />
                      </div>
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-white text-sm">
                    2:34
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
