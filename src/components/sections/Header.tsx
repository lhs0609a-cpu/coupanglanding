'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const navLinks = [
  { name: '기능', href: '#features' },
  { name: 'AI 파워', href: '#ai-features' },
  { name: '자동화', href: '#automation' },
  { name: '요금제', href: '#pricing' },
  { name: 'FAQ', href: '#faq' },
];

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled
            ? 'py-3 bg-[#030014]/80 backdrop-blur-xl border-b border-white/5'
            : 'py-5 bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-4">
              {showBackButton && (
                <Link
                  href="/"
                  className="flex items-center gap-2 text-white/50 hover:text-white transition-all group"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-medium hidden sm:inline">홈으로</span>
                </Link>
              )}
              <motion.a
                href="#"
                className="flex items-center gap-3"
                whileHover={{ scale: 1.02 }}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 p-[1px]">
                  <div className="w-full h-full rounded-xl bg-[#030014] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </div>
                </div>
                <span className="text-lg font-bold text-white">
                  쿠팡 <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">셀러허브</span>
                </span>
              </motion.a>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  className="px-4 py-2 text-white/60 hover:text-white font-medium transition-colors rounded-lg hover:bg-white/5"
                  whileHover={{ y: -1 }}
                >
                  {link.name}
                </motion.a>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <button className="px-4 py-2 text-white/60 hover:text-white font-medium transition-colors">
                로그인
              </button>
              <button className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-medium hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all">
                무료로 시작하기
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Menu className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 z-40 lg:hidden"
          >
            <div className="bg-[#030014]/95 backdrop-blur-xl border-b border-white/5">
              <nav className="max-w-7xl mx-auto px-6 py-6 space-y-2">
                {navLinks.map((link, index) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="block px-4 py-3 text-lg font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </motion.a>
                ))}
                <div className="pt-4 space-y-3 border-t border-white/10 mt-4">
                  <button className="w-full px-4 py-3 text-white/70 hover:text-white font-medium transition-colors rounded-xl hover:bg-white/5">
                    로그인
                  </button>
                  <button className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-medium">
                    무료로 시작하기
                  </button>
                </div>
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
