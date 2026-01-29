'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { ArrowRight, Clock, Shield, Zap, X, Check, Gift, Users, Bell } from 'lucide-react';

const recentSignups = [
  { location: '서울 강남구', plan: 'Pro', time: '방금 전' },
  { location: '부산 해운대구', plan: 'Basic', time: '2분 전' },
  { location: '경기 성남시', plan: 'Pro', time: '5분 전' },
  { location: '인천 남동구', plan: 'Pro', time: '8분 전' },
  { location: '대구 수성구', plan: 'Basic', time: '12분 전' },
];

export default function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [currentSignup, setCurrentSignup] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 23, minutes: 47, seconds: 32 });

  // Rotate through recent signups
  useEffect(() => {
    const interval = setInterval(() => {
      setShowNotification(true);
      setTimeout(() => {
        setShowNotification(false);
        setCurrentSignup((prev) => (prev + 1) % recentSignups.length);
      }, 4000);
    }, 8000);

    // Show first notification after 3 seconds
    const initialTimeout = setTimeout(() => {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 4000);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Live Signup Notification - 모바일에서는 하단 중앙, 데스크탑에서는 좌측 하단 */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={showNotification ? { y: 0, opacity: 1 } : { y: 100, opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto z-50 bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-gray-200 p-3 sm:p-4 sm:max-w-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
              {recentSignups[currentSignup].location}에서
            </p>
            <p className="text-xs sm:text-sm text-gray-600">
              <strong className="text-purple-600">{recentSignups[currentSignup].plan}</strong> 가입 · {recentSignups[currentSignup].time}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          {/* Limited Time Offer Banner */}
          <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl p-4 mb-8 text-center text-white">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span className="font-bold">이번 주 특별 혜택 마감까지</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xl font-bold">
                <span className="bg-white/20 px-2 py-1 rounded">{String(countdown.hours).padStart(2, '0')}</span>
                <span>:</span>
                <span className="bg-white/20 px-2 py-1 rounded">{String(countdown.minutes).padStart(2, '0')}</span>
                <span>:</span>
                <span className="bg-white/20 px-2 py-1 rounded">{String(countdown.seconds).padStart(2, '0')}</span>
              </div>
            </div>
          </div>

          {/* Main CTA Card */}
          <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-[2.5rem] overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            <div className="relative px-8 py-16 sm:px-16 sm:py-20">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                {/* Left: Copy */}
                <div className="text-center lg:text-left">
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                    오늘 밤,
                    <br />
                    <span className="text-green-400">100개 상품</span>이
                    <br />
                    <span className="text-yellow-300">자동 등록</span>됩니다
                  </h2>

                  <p className="text-xl text-gray-300 mb-8">
                    지금 시작하면 <strong className="text-white">내일 아침</strong>
                    <br />쿠팡 판매자센터에 상품이 올라가 있습니다.
                  </p>

                  {/* What you get today */}
                  <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl p-6 mb-8 border border-green-500/30">
                    <div className="flex items-center gap-2 mb-4">
                      <Gift className="w-5 h-5 text-yellow-400" />
                      <span className="text-yellow-400 font-semibold">지금 가입하면 받는 혜택</span>
                    </div>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3 text-white">
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <span>첫 달 <strong className="text-yellow-300">50% 할인</strong> (79,000원 → 39,500원)</span>
                      </li>
                      <li className="flex items-center gap-3 text-white">
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <span>1:1 온보딩 컨설팅 <strong className="text-yellow-300">무료</strong> (10만원 상당)</span>
                      </li>
                      <li className="flex items-center gap-3 text-white">
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <span>AI 요청 <strong className="text-yellow-300">2배</strong> 제공 (첫 달 한정)</span>
                      </li>
                    </ul>
                  </div>

                  {/* CTA Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 px-10 py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full font-bold text-lg shadow-xl shadow-green-500/25 hover:shadow-2xl hover:shadow-green-500/40 transition-all duration-300"
                  >
                    혜택 받고 시작하기
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </motion.button>

                  <p className="text-gray-400 text-sm mt-4">
                    카드 등록 없이 시작 · <span className="text-green-400">30일 무조건 환불</span>
                  </p>
                </div>

                {/* Right: Social Proof & Guarantee */}
                <div className="space-y-6">
                  {/* Live viewers */}
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center justify-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </span>
                      <span className="text-white">
                        지금 <strong className="text-yellow-300">147명</strong>이 이 페이지를 보고 있습니다
                      </span>
                    </div>
                  </div>

                  {/* What happens next */}
                  <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-2xl p-6 border border-purple-500/30">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-purple-400" />
                      <span className="text-purple-400 font-semibold">가입 후 일어나는 일</span>
                    </div>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-white">
                        <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                        <span><strong>30초:</strong> 회원가입 완료</span>
                      </li>
                      <li className="flex items-start gap-3 text-white">
                        <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                        <span><strong>5분:</strong> 쿠팡 API 연동 완료</span>
                      </li>
                      <li className="flex items-start gap-3 text-white">
                        <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                        <span><strong>10분:</strong> 첫 상품 등록 완료</span>
                      </li>
                      <li className="flex items-start gap-3 text-white">
                        <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-sm font-bold flex-shrink-0">✓</span>
                        <span><strong>내일 아침:</strong> 100개 상품이 쿠팡에!</span>
                      </li>
                    </ul>
                  </div>

                  {/* Guarantee */}
                  <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-8 h-8 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold mb-1">30일 무조건 환불 보장</p>
                      <p className="text-gray-400 text-sm">
                        카톡 한 마디면 끝. 사유 안 물어봄.
                        <br />
                        <span className="text-green-400">환불률 0.3%</span> (그만큼 만족)
                      </p>
                    </div>
                  </div>

                  {/* Social Proof */}
                  <div className="text-center">
                    <p className="text-gray-300 text-sm mb-2">
                      지난 7일간 <span className="text-white font-bold">234명</span>이 시작했습니다
                    </p>
                    <div className="flex items-center justify-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 border-2 border-gray-800 -ml-2 first:ml-0 flex items-center justify-center text-white text-xs font-semibold"
                        >
                          {['KT', 'LS', 'PJ', 'JM', 'CY'][i]}
                        </div>
                      ))}
                      <span className="text-gray-300 text-sm ml-2">+229명</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Final Push */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 text-center"
          >
            <p className="text-gray-600 text-lg mb-4">
              아직 고민되시나요?
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="#" className="text-purple-600 font-semibold hover:underline flex items-center gap-2">
                <Users className="w-5 h-5" />
                실제 사용자 후기 더 보기
              </a>
              <span className="text-gray-300 hidden sm:inline">|</span>
              <a href="#" className="text-purple-600 font-semibold hover:underline">
                카카오톡 실시간 문의 (평균 응답 3분)
              </a>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
