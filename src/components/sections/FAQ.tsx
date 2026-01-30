'use client';

import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import { Plus, Minus, MessageCircle, HelpCircle } from 'lucide-react';

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
    <section id="faq" className="py-24 bg-gradient-to-b from-gray-50/50 to-white relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-rose-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-violet-100/20 rounded-full blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-rose-50 to-white border border-rose-100 rounded-full text-sm font-semibold text-[#E31837] mb-6"
          >
            <HelpCircle className="w-4 h-4" />
            FAQ
          </motion.div>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            자주 묻는 질문
          </h2>
          <p className="text-xl text-gray-500">
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
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.05 }}
              className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-lg transition-all ${
                openIndex === index ? 'border-rose-200 shadow-lg shadow-rose-100/50' : 'border-gray-100'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
              >
                <span className={`font-semibold pr-4 transition-colors ${
                  openIndex === index ? 'text-[#E31837]' : 'text-gray-900'
                }`}>
                  {faq.question}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                    openIndex === index
                      ? 'bg-gradient-to-br from-[#E31837] to-[#ff4d6a] shadow-lg shadow-rose-200/50'
                      : 'bg-gray-100'
                  }`}
                >
                  {openIndex === index ? (
                    <Minus className="w-4 h-4 text-white" />
                  ) : (
                    <Plus className="w-4 h-4 text-gray-500" />
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
                    <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                      <div className="pt-2 border-t border-gray-100">
                        <p className="pt-4">{faq.answer}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-500 mb-5">더 궁금한 점이 있으신가요?</p>
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#E31837]/10 to-rose-100 border border-rose-200 font-semibold text-[#E31837] hover:shadow-lg hover:shadow-rose-100/50 transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            카카오톡으로 문의하기
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
