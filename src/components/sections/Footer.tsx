'use client';

import Link from 'next/link';
import { BUSINESS_INFO } from '@/lib/constants/business-info';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Main Grid */}
        <div className="grid md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="md:col-span-4">
            <Link href="/" className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E31837] to-[#ff4d6a] flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-lg font-bold text-gray-900">메가로드</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mb-5">
              AI 기반 쿠팡 상품 등록 자동화 솔루션.
              <br />
              카테고리 매칭, 상품명 생성, 가격 계산, 대량 등록까지
              <br />
              셀러에게 필요한 모든 것을 자동화합니다.
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              본 서비스는 쿠팡 공식 서비스가 아니며, 쿠팡 Wing API를 활용한
              독립적인 서드파티 솔루션입니다.
            </p>
          </div>

          {/* Product Column */}
          <div className="md:col-span-2">
            <h4 className="text-sm font-bold text-gray-900 mb-4">제품</h4>
            <ul className="space-y-3">
              {[
                { label: '기능', href: '/program#features' },
                { label: '요금제', href: '/program#pricing' },
                { label: 'FAQ', href: '/program#faq' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Column */}
          <div className="md:col-span-3">
            <h4 className="text-sm font-bold text-gray-900 mb-4">지원</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/guide"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  초보 셀러 가이드
                </Link>
              </li>
              <li>
                <Link
                  href="/start"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  사업자등록 체크리스트
                </Link>
              </li>
              <li>
                <Link
                  href="/pt"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  1:1 PT
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal + Account Column */}
          <div className="md:col-span-3">
            <h4 className="text-sm font-bold text-gray-900 mb-4">법적 고지</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  이용약관
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-semibold"
                >
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link
                  href="/refund"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  환불정책
                </Link>
              </li>
            </ul>

            <h4 className="text-sm font-bold text-gray-900 mt-6 mb-4">계정</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/auth/login?type=signup"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  파트너 회원가입
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/login"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                  파트너 로그인
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Business Info Section */}
        <div className="mt-10 pt-8 border-t border-gray-100">
          <div className="text-xs text-gray-400 leading-relaxed space-y-1">
            <p>
              <span className="font-medium text-gray-500">
                {BUSINESS_INFO.companyName}
              </span>{' '}
              | 대표: {BUSINESS_INFO.representative} | 사업자등록번호:{' '}
              {BUSINESS_INFO.businessNumber}
            </p>
            <p>
              주소: {BUSINESS_INFO.address} | 이메일: {BUSINESS_INFO.email} |
              전화: {BUSINESS_INFO.phone}
            </p>
            <p>
              업태: {BUSINESS_INFO.businessType} | 종목:{' '}
              {BUSINESS_INFO.businessItems} | 통신판매업신고번호:{' '}
              {BUSINESS_INFO.ecommerceRegistration}
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {BUSINESS_INFO.companyName}. All
            rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/terms"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-gray-600 hover:text-gray-900 transition-colors font-bold"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/refund"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              환불정책
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
