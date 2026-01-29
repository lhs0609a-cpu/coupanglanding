'use client';

import { motion } from 'framer-motion';
import { Sparkles, Mail, Phone, MapPin, ArrowUpRight } from 'lucide-react';

const footerLinks = {
  product: {
    title: '제품',
    links: [
      { name: '기능', href: '#features' },
      { name: 'AI 기능', href: '#ai-features' },
      { name: '자동화', href: '#automation' },
      { name: '요금제', href: '#pricing' },
      { name: 'API', href: '#' },
    ],
  },
  company: {
    title: '회사',
    links: [
      { name: '회사 소개', href: '#' },
      { name: '채용', href: '#' },
      { name: '블로그', href: '#' },
      { name: '뉴스룸', href: '#' },
    ],
  },
  support: {
    title: '지원',
    links: [
      { name: '고객센터', href: '#' },
      { name: 'FAQ', href: '#faq' },
      { name: '이용 가이드', href: '#' },
      { name: '문의하기', href: '#' },
    ],
  },
  legal: {
    title: '법적 고지',
    links: [
      { name: '이용약관', href: '#' },
      { name: '개인정보처리방침', href: '#' },
      { name: '환불정책', href: '#' },
    ],
  },
};

const socialLinks = [
  { name: 'Blog', icon: 'B', href: '#' },
  { name: 'YouTube', icon: 'Y', href: '#' },
  { name: 'Instagram', icon: 'I', href: '#' },
  { name: 'KakaoTalk', icon: 'K', href: '#' },
];

export default function Footer() {
  return (
    <footer className="bg-[#020010] text-white border-t border-white/5">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-[1px]">
                <div className="w-full h-full rounded-xl bg-[#020010] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <span className="text-lg font-bold">
                쿠팡 <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">셀러허브</span>
              </span>
            </div>

            <p className="text-white/40 mb-6 max-w-sm leading-relaxed">
              AI 기반 쿠팡 상품 등록 자동화 솔루션.
              더 적은 시간으로 더 많은 매출을 만드세요.
            </p>

            {/* Contact Info */}
            <div className="space-y-3 text-sm text-white/40">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-white/20" />
                <span>support@sellerhub.co.kr</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-white/20" />
                <span>02-1234-5678</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-white/20" />
                <span>서울특별시 강남구 테헤란로 123</span>
              </div>
            </div>
          </div>

          {/* Links Columns */}
          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h4 className="font-semibold text-white mb-4">{section.title}</h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-white/40 hover:text-white transition-colors text-sm flex items-center gap-1 group"
                    >
                      {link.name}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Copyright */}
            <div className="text-sm text-white/30">
              © 2025 쿠팡 셀러허브. All rights reserved.
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.name}
                  href={social.href}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
                >
                  <span className="text-sm font-semibold">{social.icon}</span>
                </motion.a>
              ))}
            </div>

            {/* Language Selector */}
            <div className="flex items-center gap-4 text-sm text-white/30">
              <button className="hover:text-white transition-colors">
                한국어
              </button>
              <span>|</span>
              <button className="hover:text-white transition-colors">
                English
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
