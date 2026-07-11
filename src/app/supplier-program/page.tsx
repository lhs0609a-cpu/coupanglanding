'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import SharedFooter from '@/components/sections/Footer';
import SupplierNetworkStats from '@/components/sections/SupplierNetworkStats';
import {
  ArrowRight, Boxes, Store, Wallet, ShieldCheck, Sparkles, Menu, X,
  PackagePlus, CreditCard, TrendingUp, CheckCircle, ChevronDown, Layers,
  Building2, BadgeCheck, Zap,
} from 'lucide-react';

// 공급사 가입/상품등록 진입점 → 회원가입 폼(로그인 후 /supplier 공급사 센터로 이동).
// /auth/login 은 type=signup 로 회원가입 폼을 열고, 로그인 성공 시 redirect 로 이동한다.
// (카톡 상담은 우측 하단 KakaoChatFloat 버튼으로 별도 유지)
const SIGNUP_URL = '/auth/login?type=signup&redirect=/supplier';

const fadeUp = { hidden: { opacity: 0, y: 28 }, visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }) };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };

const navLinks = [
  { href: '#how', label: '작동 방식' },
  { href: '#why', label: '왜 메가로드' },
  { href: '#fee', label: '수수료' },
  { href: '#faq', label: 'FAQ' },
];

const painPoints = [
  { icon: Store, title: '판로가 부족하다', desc: '좋은 상품을 만들어도 팔아줄 셀러·채널을 일일이 뚫기 어렵습니다.' },
  { icon: Zap, title: '마케팅이 버겁다', desc: '상품명·상세페이지·광고까지 직접 하기엔 시간과 비용이 큽니다.' },
  { icon: Layers, title: '재고·정산 리스크', desc: '선입금·대량 매입·미정산 위험 없이 판매된 만큼만 정산받고 싶습니다.' },
];

const steps = [
  { icon: Building2, step: '01', title: '공급사 가입 + 카드 등록', desc: '회사·브랜드 정보를 넣고 자동결제 카드를 등록합니다. 초기비용·월정액은 없습니다.' },
  { icon: PackagePlus, title: '상품 한 번만 등록', step: '02', desc: '카테고리·옵션·공급가·재고를 넣어 카탈로그에 올립니다. 관리자 검수 후 셀러망에 공개됩니다.' },
  { icon: Boxes, step: '03', title: '셀러망이 각자 채널에 판매', desc: '수십~수백 셀러가 딸깍 한 번으로 자기 쿠팡 계정에 유니크 SEO 상품명으로 업로드해 판매합니다.' },
  { icon: Wallet, step: '04', title: '판매분만 수수료 정산', desc: '실제 판매·배송 검증 후, 판매가 일어난 만큼만 수수료 10%가 카드로 자동결제됩니다.' },
];

const whyCards = [
  { icon: BadgeCheck, title: '유니크 SEO 자동 생성', desc: '셀러마다 서로 다른 노출상품명으로 올라가 자기잠식(카니발) 없이 노출면을 넓힙니다.' },
  { icon: Boxes, title: '무재고 셀러망 확산', desc: '상품 1개가 수십 개 채널로 동시 확산. 셀러는 무재고로, 공급사는 판로로 윈윈입니다.' },
  { icon: ShieldCheck, title: '실판매 검증 후 정산', desc: '배송 완료·반품 없음까지 확인된 실제 판매분만 수수료 대상. 미정산·과다청구 위험이 없습니다.' },
  { icon: TrendingUp, title: '데이터 대시보드', desc: 'GMV·판매 셀러·정산 내역을 공급사 대시보드에서 실시간으로 확인합니다.' },
];

const faqs = [
  { q: '초기비용이나 월 이용료가 있나요?', a: '없습니다. 가입·상품 등록은 무료이고, 실제 판매가 일어난 건에 대해서만 수수료 10%를 정산합니다.' },
  { q: '수수료는 언제, 어떻게 내나요?', a: '배송 완료 후 반품 기간이 지나 판매가 확정된 건에 대해, 매월 등록하신 카드로 수수료가 자동결제됩니다. 판매되지 않으면 비용은 0원입니다.' },
  { q: '재고는 어떻게 관리되나요?', a: '공급사가 등록한 재고를 셀러들이 공유합니다. 재고가 소진되면 자동으로 판매가 중단되어 오버셀 위험을 줄입니다.' },
  { q: '내 브랜드가 여러 셀러에게 노출되면 가격이 무너지지 않나요?', a: '노출상품명은 셀러별로 유니크하게 생성되고, 판매가·정책은 카탈로그 기준으로 관리됩니다. 무분별한 최저가 경쟁이 아닌 노출면 확장에 초점을 둡니다.' },
  { q: '어떤 상품이 적합한가요?', a: '제조사·도매·총판 등 안정적으로 공급 가능한 상품이면 좋습니다. 카테고리 제한 없이 등록 후 관리자 검수를 거칩니다.' },
];

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200/60 text-emerald-700">
      {children}
    </span>
  );
}

export default function SupplierProgramPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <main className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {/* HEADER */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-gray-100 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200/30"><Store className="w-4 h-4 text-white" /></div>
              <span className={`font-bold text-lg transition-colors duration-500 ${scrolled ? 'text-gray-900' : 'text-white'}`}>메가로드 공급사</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${scrolled ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50' : 'text-gray-200 hover:text-white'}`}>{link.label}</a>
              ))}
            </nav>
            <div className="hidden md:flex items-center gap-3">
              <a href={SIGNUP_URL} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-all">공급사 가입</a>
            </div>
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`md:hidden p-2 rounded-lg ${scrolled ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`} aria-label="메뉴">
              {mobileMenuOpen ? <X className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} /> : <Menu className={`w-5 h-5 ${scrolled ? 'text-gray-700' : 'text-white'}`} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden overflow-hidden bg-white/95 backdrop-blur-2xl border-b border-gray-100">
              <div className="px-5 py-4 space-y-1">
                {navLinks.map((link) => (<a key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl text-base font-medium text-gray-700 hover:bg-gray-50">{link.label}</a>))}
                <div className="pt-3 border-t border-gray-100 mt-2">
                  <a href={SIGNUP_URL} onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3.5 rounded-xl text-base font-semibold text-white bg-emerald-500 text-center shadow-lg">공급사 가입하기</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HERO */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center bg-gray-950 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-gray-900 to-slate-900" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(16,185,129,0.18)_0%,transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_90%,rgba(227,24,55,0.08)_0%,transparent_55%)]" />
        </div>
        <motion.div initial="hidden" animate={heroInView ? 'visible' : 'hidden'} variants={stagger} className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 text-center pt-24 pb-16">
          <motion.div variants={fadeUp}>
            <SectionBadge><Sparkles className="w-3.5 h-3.5" /> 공급사 파트너 모집</SectionBadge>
          </motion.div>
          <motion.h1 variants={fadeUp} custom={1} className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
            상품만 올리면,<br /><span className="text-emerald-400">셀러망이 대신 팝니다</span>
          </motion.h1>
          <motion.p variants={fadeUp} custom={2} className="mt-6 text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            제조사·도매·공급사라면 상품 한 번만 등록하세요.<br className="hidden sm:block" />
            메가로드 셀러망이 각자 쿠팡 채널에서 판매하고, <b className="text-white">판매가 일어난 만큼만</b> 수수료를 냅니다.
          </motion.p>
          <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={SIGNUP_URL} className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all">
              공급사 가입하고 상품 등록하기 <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#how" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-white/10 text-white font-semibold text-base border border-white/15 hover:bg-white/15 transition-all">
              작동 방식 보기
            </a>
          </motion.div>
          <motion.div variants={fadeUp} custom={4} className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/50">
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> 초기비용·월정액 0원</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> 판매분만 수수료 10%</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-400" /> 실판매 검증 후 정산</span>
          </motion.div>
        </motion.div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
            <ChevronDown className="w-6 h-6 text-white/40" />
          </motion.div>
        </div>
      </section>

      {/* LIVE 셀러 네트워크 실시간 현황 (데이터 로드 실패 시 자동 숨김) */}
      <SupplierNetworkStats />

      {/* PAIN */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <motion.div variants={fadeUp}><SectionBadge>공감</SectionBadge></motion.div>
            <motion.h2 variants={fadeUp} custom={1} className="mt-5 text-3xl sm:text-4xl font-extrabold text-gray-900">좋은 상품, 팔 곳이 문제죠</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-3 gap-5">
            {painPoints.map((p, i) => (
              <motion.div key={p.title} variants={fadeUp} custom={i} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4"><p.icon className="w-5 h-5 text-gray-500" /></div>
                <h3 className="font-bold text-gray-900 mb-2">{p.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <motion.div variants={fadeUp}><SectionBadge>작동 방식</SectionBadge></motion.div>
            <motion.h2 variants={fadeUp} custom={1} className="mt-5 text-3xl sm:text-4xl font-extrabold text-gray-900">가입부터 정산까지, 4단계</motion.h2>
            <motion.p variants={fadeUp} custom={2} className="mt-4 text-gray-500 text-lg">상품 한 번 등록하면 나머지는 셀러망과 시스템이 처리합니다.</motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-2 gap-5">
            {steps.map((s, i) => (
              <motion.div key={s.step} variants={fadeUp} custom={i} className="relative bg-white rounded-2xl p-7 border border-gray-100 shadow-sm">
                <span className="absolute top-6 right-7 text-4xl font-extrabold text-gray-100">{s.step}</span>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4"><s.icon className="w-6 h-6 text-emerald-600" /></div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="text-center mb-14">
            <motion.div variants={fadeUp}><SectionBadge>왜 메가로드</SectionBadge></motion.div>
            <motion.h2 variants={fadeUp} custom={1} className="mt-5 text-3xl sm:text-4xl font-extrabold text-gray-900">단순 위탁이 아닙니다</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger} className="grid sm:grid-cols-2 gap-5">
            {whyCards.map((c, i) => (
              <motion.div key={c.title} variants={fadeUp} custom={i} className="flex gap-4 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><c.icon className="w-5 h-5 text-emerald-600" /></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1.5">{c.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{c.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FEE */}
      <section id="fee" className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.15)_0%,transparent_60%)]" />
        <div className="max-w-3xl mx-auto relative z-10 text-center">
          <SectionBadge>수수료</SectionBadge>
          <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold text-white">팔린 만큼만, 딱 그만큼만</h2>
          <div className="mt-10 inline-flex flex-col items-center bg-white/5 border border-white/10 rounded-3xl px-10 py-10 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-white/60 text-sm mb-2"><CreditCard className="w-4 h-4" /> 판매 확정분 수수료</div>
            <div className="text-6xl font-extrabold text-emerald-400">10%</div>
            <p className="mt-4 text-white/60 text-sm max-w-sm leading-relaxed">
              가입비·월정액·광고비 부담 없음. 배송 완료·반품 없음까지 확인된 실제 판매분에 대해서만 매월 카드로 자동정산됩니다.
            </p>
          </div>
          <div className="mt-10">
            <a href={SIGNUP_URL} className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all">
              지금 공급사 가입하기 <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <SectionBadge>자주 묻는 질문</SectionBadge>
            <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold text-gray-900">궁금한 점을 확인하세요</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <button type="button" onClick={() => setOpenFAQ(openFAQ === i ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left">
                  <span className="font-semibold text-gray-900 pr-4">{f.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${openFAQ === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFAQ === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="px-6 pb-5 text-sm text-gray-500 leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-emerald-50/60 border-t border-emerald-100">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">상품은 준비됐습니다. 판로만 열면 됩니다.</h2>
          <p className="mt-4 text-gray-500 text-lg">지금 가입하고 첫 상품을 등록해보세요. 판매될 때까지 비용은 0원입니다.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={SIGNUP_URL} className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all">
              공급사 가입하기 <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-gray-700 font-semibold text-base border border-gray-200 hover:bg-gray-50 transition-all">
              메인으로
            </Link>
          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
