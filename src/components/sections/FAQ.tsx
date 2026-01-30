'use client';

import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import { Plus, Minus } from 'lucide-react';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

const faqs = [
  {
    question: 'AI가 만든 상품명, 저품질 걸리지 않나요?',
    answer:
      '걱정 마세요. 쿠팡 가이드라인을 100% 준수하도록 학습되어 있습니다. 금지 키워드, 과장 표현 자동 필터링됩니다. 현재까지 저품질 제재 사례 0건입니다.',
  },
  {
    question: '쿠팡 정책 바뀌면 어떻게 되나요?',
    answer:
      '실시간으로 업데이트됩니다. 쿠팡 정책 변경 시 24시간 내 AI 모델에 반영합니다. 정책 위반으로 제재받을 걱정 없습니다.',
  },
  {
    question: '환불 정말 아무 조건 없이 되나요?',
    answer:
      '네, 30일 내 카카오톡으로 "환불해주세요" 한 마디면 끝입니다. 사유 안 물어보고, 3영업일 내 전액 입금됩니다. 약정도 위약금도 없습니다.',
  },
  {
    question: '컴퓨터 잘 못하는데 써도 되나요?',
    answer:
      '네, 복사/붙여넣기만 할 줄 알면 됩니다. 영상 튜토리얼 + 1:1 카카오톡 지원으로 3일이면 마스터합니다. 60대 셀러분도 잘 쓰고 계십니다.',
  },
  {
    question: '무료 체험 끝나면 자동 결제되나요?',
    answer:
      '아니요. 카드 등록 없이 시작하므로 자동 결제 자체가 불가능합니다. 무료 체험 후 마음에 드시면 그때 결제하시면 됩니다.',
  },
  {
    question: '기존에 등록한 상품도 관리되나요?',
    answer:
      '네, 기존 상품도 Google Sheets로 자동 연동됩니다. 신규 등록 + 기존 상품까지 한 곳에서 관리하세요.',
  },
];

export default function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-gray-50">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="font-semibold mb-4" style={{ color: COUPANG_RED }}>FAQ</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            자주 묻는 질문
          </h2>
          <p className="text-xl text-gray-600">
            아직 망설여지시나요? 궁금한 점을 확인하세요.
          </p>
        </motion.div>

        {/* FAQ Items */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-4"
        >
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
              >
                <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    backgroundColor: openIndex === index ? COUPANG_RED : '#f3f4f6',
                  }}
                >
                  {openIndex === index ? (
                    <Minus className="w-4 h-4 text-white" />
                  ) : (
                    <Plus className="w-4 h-4 text-gray-600" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-500 mb-4">더 궁금한 점이 있으신가요?</p>
          <button
            className="px-6 py-3 rounded-full font-medium transition-all"
            style={{ backgroundColor: `${COUPANG_RED}10`, color: COUPANG_RED }}
          >
            카카오톡으로 문의하기
          </button>
        </motion.div>
      </div>
    </section>
  );
}
