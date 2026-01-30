'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { href: '#features', label: '기능' },
    { href: '#pricing', label: '가격' },
    { href: '#faq', label: 'FAQ' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/95 backdrop-blur-xl shadow-sm border-b border-gray-100' : 'bg-white/80 backdrop-blur-lg'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo / Back Button */}
          {showBackButton ? (
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-all group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">홈으로</span>
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: COUPANG_RED }}
              >
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">셀러허브</span>
            </Link>
          )}

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden md:flex items-center gap-4">
            <button className="text-gray-600 hover:text-gray-900 transition-colors font-medium">
              로그인
            </button>
            <button
              className="px-5 py-2.5 text-white rounded-full font-medium hover:opacity-90 transition-all"
              style={{ backgroundColor: COUPANG_RED }}
            >
              무료 시작
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden"
            >
              <div className="pt-4 pb-2 space-y-2">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <div className="pt-2 border-t border-gray-100">
                  <button className="block w-full text-left px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                    로그인
                  </button>
                  <button
                    className="block w-full mt-2 px-4 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-all"
                    style={{ backgroundColor: COUPANG_RED }}
                  >
                    무료 시작
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
