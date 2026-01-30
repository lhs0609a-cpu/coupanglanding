'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowLeft } from 'lucide-react';
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
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'py-3 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm'
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
                  className="flex items-center gap-2 text-gray-400 hover:text-black transition-all group"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-medium hidden sm:inline">홈으로</span>
                </Link>
              )}
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-bold text-black">셀러허브</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="px-4 py-2 text-gray-600 hover:text-black font-medium transition-colors"
                >
                  {link.name}
                </a>
              ))}
            </nav>

            {/* CTA Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <button className="px-4 py-2 text-gray-600 hover:text-black font-medium transition-colors">
                로그인
              </button>
              <button className="px-5 py-2.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
                무료로 시작하기
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-black" />
              ) : (
                <Menu className="w-6 h-6 text-black" />
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
            <div className="bg-white border-b border-gray-100 shadow-lg">
              <nav className="max-w-7xl mx-auto px-6 py-4 space-y-1">
                {navLinks.map((link, index) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="block px-4 py-3 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg font-medium transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </motion.a>
                ))}
                <div className="pt-4 space-y-3 border-t border-gray-100 mt-4">
                  <button className="w-full px-4 py-3 text-gray-600 hover:text-black font-medium transition-colors">
                    로그인
                  </button>
                  <button className="w-full px-4 py-3 rounded-full bg-blue-600 text-white font-medium">
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
