'use client';

import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';

const faqs = [
  {
    question: '쿠팡 Wing API 연동은 어떻게 하나요?',
    answer: '쿠팡 Wing 판매자 센터에서 API 키를 발급받아 저희 서비스에 입력하시면 됩니다. 단계별 가이드를 제공해드리며, 1분 내로 연동이 완료됩니다.',
  },
  {
    question: 'AI 상품명 생성은 어떻게 작동하나요?',
    answer: 'AI가 원본 상품명을 분석하여 쿠팡 검색 알고리즘에 최적화된 키워드를 추출하고, 8종의 상품명을 자동 생성합니다.',
  },
  {
    question: '네이버 상품을 쿠팡으로 어떻게 변환하나요?',
    answer: '네이버 스마트스토어에서 다운로드한 상품 파일을 업로드하면, AI가 자동으로 쿠팡 형식에 맞게 변환합니다.',
  },
  {
    question: '무료 플랜으로 무엇을 할 수 있나요?',
    answer: 'Free 플랜에서는 월 10개 상품 등록, 쿠팡 계정 1개 연동, AI 요청 50회를 사용할 수 있습니다.',
  },
  {
    question: '구독은 언제든 취소할 수 있나요?',
    answer: '네, 언제든 구독을 취소할 수 있습니다. 취소해도 결제 기간이 끝날 때까지 서비스를 계속 이용하실 수 있습니다.',
  },
];

export default function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-blue-600 font-semibold mb-4">FAQ</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-black mb-6">
            자주 묻는 질문
          </h2>
        </motion.div>

        {/* FAQ List */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-4"
        >
          {faqs.map((faq, index) => (
            <div
              key={index}
              className={`bg-gray-50 rounded-xl border transition-all ${
                openIndex === index ? 'border-blue-200' : 'border-gray-100'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left"
              >
                <span className="font-semibold text-black pr-4">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className={`w-5 h-5 ${
                    openIndex === index ? 'text-blue-600' : 'text-gray-400'
                  }`} />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
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
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
            <h3 className="text-xl font-bold text-black mb-3">
              원하는 답을 찾지 못하셨나요?
            </h3>
            <p className="text-gray-600 mb-6">
              고객 지원팀이 친절하게 답변해드립니다
            </p>
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors">
              <MessageCircle className="w-5 h-5" />
              문의하기
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
