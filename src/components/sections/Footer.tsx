'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="py-16 px-6 bg-gradient-to-b from-gray-50 to-white border-t border-gray-100 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-rose-100/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-violet-100/15 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-lg shadow-rose-200/30">
              <span className="text-white font-bold">C</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">셀러허브</span>
          </motion.div>

          {/* Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="flex flex-wrap items-center justify-center gap-8 text-sm"
          >
            {[
              { href: '#', label: '이용약관' },
              { href: '#', label: '개인정보처리방침' },
              { href: '#', label: '고객센터' },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-gray-500 hover:text-[#E31837] transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </motion.div>

          {/* Copyright */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-sm"
          >
            © 2025 셀러허브. All rights reserved.
          </motion.p>
        </div>
      </div>
    </footer>
  );
}
