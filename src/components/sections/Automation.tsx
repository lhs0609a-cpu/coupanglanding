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
} from 'lucide-react';

const pipelineSteps = [
  { icon: Upload, name: '스캔', percent: 5, description: '폴더/이미지 인식' },
  { icon: Calculator, name: '가격', percent: 15, description: '마진율 자동 적용' },
  { icon: Layers, name: '카테고리', percent: 30, description: 'AI 자동 매칭' },
  { icon: FileText, name: '상품명', percent: 50, description: 'AI 8종 생성' },
  { icon: MessageSquare, name: '리뷰', percent: 65, description: 'AI 5종 생성' },
  { icon: Settings2, name: '옵션', percent: 75, description: '옵션 정규화' },
  { icon: ClipboardCheck, name: '필드', percent: 85, description: '필수 정보 입력' },
  { icon: Rocket, name: '등록', percent: 100, description: 'API 전송 완료' },
];

export default function Automation() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [activeStep, setActiveStep] = useState(7);

  return (
    <section id="automation" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-blue-600 font-semibold mb-4">AUTOMATION</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-black mb-6">
            업로드 한 번으로 쿠팡까지
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            8단계 자동화 파이프라인이 모든 것을 처리합니다.
          </p>
        </motion.div>

        {/* Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          {/* Progress Bar */}
          <div className="relative mb-8">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={isInView ? { width: `${pipelineSteps[activeStep].percent}%` } : {}}
                transition={{ duration: 1, delay: 0.5 }}
                className="h-full bg-blue-600 rounded-full"
              />
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-4">
            {pipelineSteps.map((step, index) => (
              <motion.button
                key={step.name}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.05 }}
                onClick={() => setActiveStep(index)}
                className={`relative p-3 sm:p-4 rounded-xl transition-all ${
                  index <= activeStep
                    ? 'bg-white border-2 border-blue-100'
                    : 'bg-gray-100 border-2 border-transparent'
                } ${index === activeStep ? 'ring-2 ring-blue-600 ring-offset-2' : ''}`}
              >
                {index < activeStep && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                )}

                <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-2 ${
                  index <= activeStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  <step.icon className="w-5 h-5" />
                </div>

                <div className="text-center">
                  <div className={`text-xs sm:text-sm font-semibold ${
                    index <= activeStep ? 'text-black' : 'text-gray-400'
                  }`}>
                    {step.name}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: '폴더 업로드만으로 끝', desc: 'R2 스토리지에 상품 폴더를 업로드하세요.' },
            { title: '24시간 무인 운영', desc: '자는 동안에도 상품이 자동으로 등록됩니다.' },
            { title: '대량 등록 최적화', desc: '수백 개 상품도 한 번에 처리합니다.' },
          ].map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
              className="bg-white rounded-2xl p-8 border border-gray-100"
            >
              <h3 className="text-xl font-bold text-black mb-3">{item.title}</h3>
              <p className="text-gray-600">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
