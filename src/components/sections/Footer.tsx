'use client';

import Link from 'next/link';

const footerLinks = {
  product: {
    title: '제품',
    links: [
      { name: '기능', href: '#features' },
      { name: 'AI 기능', href: '#ai-features' },
      { name: '자동화', href: '#automation' },
      { name: '요금제', href: '#pricing' },
    ],
  },
  support: {
    title: '지원',
    links: [
      { name: 'FAQ', href: '#faq' },
      { name: '고객센터', href: '#' },
      { name: '이용 가이드', href: '#' },
    ],
  },
  legal: {
    title: '법적 고지',
    links: [
      { name: '이용약관', href: '#' },
      { name: '개인정보처리방침', href: '#' },
    ],
  },
};

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-xl font-bold text-black">
              셀러허브
            </Link>
            <p className="mt-4 text-gray-500 text-sm leading-relaxed">
              AI 기반 쿠팡 상품 등록 자동화.
              <br />
              더 적은 시간으로 더 많은 매출을.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h4 className="font-semibold text-black mb-4">{section.title}</h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-gray-500 hover:text-black transition-colors text-sm"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-400">
          © 2025 셀러허브. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
