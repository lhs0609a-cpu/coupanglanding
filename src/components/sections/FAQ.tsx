'use client';

import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import { HelpCircle, ChevronDown, MessageCircle } from 'lucide-react';
import Button from '../ui/Button';

const faqs = [
  {
    question: '쿠팡 Wing API 연동은 어떻게 하나요?',
    answer: '쿠팡 Wing 판매자 센터에서 API 키(Access Key, Secret Key, Vendor ID)를 발급받아 저희 서비스에 입력하시면 됩니다. 단계별 가이드를 제공해드리며, 1분 내로 연동이 완료됩니다.',
  },
  {
    question: 'AI 상품명 생성은 어떻게 작동하나요?',
    answer: 'AI가 원본 상품명을 분석하여 쿠팡 검색 알고리즘에 최적화된 키워드를 추출하고, 이를 조합하여 8종의 상품명을 자동 생성합니다. 쿠팡 가이드라인을 100% 준수하며, 검색 노출 최적화에 효과적입니다.',
  },
  {
    question: '네이버 상품을 쿠팡으로 어떻게 변환하나요?',
    answer: '네이버 스마트스토어에서 다운로드한 상품 파일(또는 폴더)을 업로드하면, AI가 자동으로 쿠팡 형식에 맞게 변환합니다. 이미지, 옵션, 가격, 상세정보가 모두 자동 매핑됩니다.',
  },
  {
    question: '자동 등록 기능은 무엇인가요?',
    answer: 'R2 클라우드 스토리지에 상품 폴더를 업로드하면, 시스템이 자동으로 스캔하여 AI 처리(상품명, 카테고리, 리뷰 생성) 후 쿠팡에 등록합니다. 24시간 무인으로 운영되어 수백 개 상품도 자동 처리됩니다.',
  },
  {
    question: '무료 플랜으로 무엇을 할 수 있나요?',
    answer: 'Free 플랜에서는 월 10개 상품 등록, 쿠팡 계정 1개 연동, AI 요청 50회를 사용할 수 있습니다. 네이버 변환과 AI 카테고리 매칭도 포함됩니다. 더 많은 기능이 필요하시면 상위 플랜으로 업그레이드하세요.',
  },
  {
    question: '구독은 언제든 취소할 수 있나요?',
    answer: '네, 언제든 구독을 취소할 수 있습니다. 취소해도 결제 기간이 끝날 때까지 서비스를 계속 이용하실 수 있습니다. 위약금이나 추가 비용은 없습니다.',
  },
  {
    question: '결제는 어떤 방법을 지원하나요?',
    answer: '신용카드, 가상계좌, 계좌이체, 휴대폰 결제를 지원합니다. 카카오페이, 네이버페이, 토스 등 간편결제도 가능합니다. 토스페이먼츠로 안전하게 처리됩니다.',
  },
  {
    question: 'API 키 만료 시 어떻게 되나요?',
    answer: '만료 7일 전부터 이메일과 대시보드 알림으로 안내해드립니다. 만료되면 쿠팡 연동 기능이 일시 중지되며, 새 API 키를 등록하시면 즉시 재개됩니다.',
  },
];

export default function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-200 mb-6"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">자주 묻는 질문</span>
          </motion.div>

          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            궁금한 점이 있으신가요?
          </h2>

          <p className="text-xl text-gray-600">
            가장 많이 묻는 질문들을 모았습니다
          </p>
        </motion.div>

        {/* FAQ List */}
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
              transition={{ duration: 0.4, delay: 0.3 + index * 0.05 }}
            >
              <div
                className={`bg-white rounded-2xl border transition-all duration-300 ${
                  openIndex === index
                    ? 'border-purple-200 shadow-lg shadow-purple-100'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-gray-900 pr-4">
                    {faq.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openIndex === index ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown className={`w-5 h-5 ${
                      openIndex === index ? 'text-purple-600' : 'text-gray-500'
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
            </motion.div>
          ))}
        </motion.div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 text-center"
        >
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-8 sm:p-12 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              원하는 답을 찾지 못하셨나요?
            </h3>
            <p className="text-gray-600 mb-6">
              고객 지원팀이 친절하게 답변해드립니다
            </p>
            <Button
              variant="primary"
              size="lg"
              icon={<MessageCircle className="w-5 h-5" />}
              iconPosition="left"
            >
              문의하기
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
