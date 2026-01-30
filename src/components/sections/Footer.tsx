'use client';

// 쿠팡 브랜드 색상
const COUPANG_RED = '#E3192F';

export default function Footer() {
  return (
    <footer className="py-12 px-6 bg-gray-50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: COUPANG_RED }}
            >
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">셀러허브</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <a href="#" className="text-gray-500 hover:text-gray-900 transition-colors">
              이용약관
            </a>
            <a href="#" className="text-gray-500 hover:text-gray-900 transition-colors">
              개인정보처리방침
            </a>
            <a href="#" className="text-gray-500 hover:text-gray-900 transition-colors">
              고객센터
            </a>
          </div>

          {/* Copyright */}
          <p className="text-gray-400 text-sm">
            © 2025 셀러허브. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
