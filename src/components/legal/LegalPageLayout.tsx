'use client';

import Link from 'next/link';
import Footer from '@/components/sections/Footer';

interface TocItem {
  id: string;
  title: string;
}

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  toc: TocItem[];
  children: React.ReactNode;
}

export default function LegalPageLayout({
  title,
  lastUpdated,
  toc,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-lg font-bold text-gray-900">메가로드</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {title}
          </h1>
          <p className="text-sm text-gray-400">
            최종 수정일: {lastUpdated}
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="mb-12 p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <h2 className="text-sm font-bold text-gray-900 mb-4">목차</h2>
          <ol className="space-y-2">
            {toc.map((item, i) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-sm text-gray-500 hover:text-[#E31837] transition-colors"
                >
                  {i + 1}. {item.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Body */}
        <div className="prose prose-gray max-w-none prose-headings:scroll-mt-24 prose-h2:text-xl prose-h2:font-bold prose-h2:text-gray-900 prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-base prose-h3:font-semibold prose-h3:text-gray-800 prose-p:text-[15px] prose-p:leading-relaxed prose-p:text-gray-600 prose-li:text-[15px] prose-li:text-gray-600 prose-table:text-sm">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
