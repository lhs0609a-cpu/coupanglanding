'use client';

import { usePathname } from 'next/navigation';

// 상담 버튼을 숨길 경로(로그인 후 영역). 새 인증 영역 추가 시 여기 한 줄만 늘리면 된다.
const HIDDEN_PATH_PREFIXES = ['/admin', '/my', '/megaload', '/auth'];

/**
 * 떠다니는 카카오톡 상담 버튼.
 * 페이지 오른쪽 아래 고정, 스크롤해도 따라다닌다. 클릭 시 카카오 오픈채팅 새 탭으로 이동.
 * 공개 랜딩(/, /pt, /program, /start, /guide, 정책 페이지)에서만 노출, 로그인 후 영역에선 숨김.
 */
export default function KakaoChatFloat({
  href = 'https://open.kakao.com/o/skLRf9li',
  label = '카톡 상담',
}: {
  href?: string;
  label?: string;
}) {
  const pathname = usePathname() || '/';
  if (HIDDEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="카카오톡으로 바로 상담하기"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#FEE500] px-4 py-3 text-sm font-bold text-[#3C1E1E] shadow-lg shadow-black/15 ring-1 ring-black/5 transition hover:scale-105 hover:shadow-xl active:scale-95 sm:bottom-6 sm:right-6 sm:px-5 sm:py-3.5"
    >
      {/* 카카오톡 말풍선 아이콘 */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5 sm:h-6 sm:w-6"
        fill="currentColor"
      >
        <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.79 1.87 5.23 4.69 6.62-.2.71-.74 2.69-.85 3.11-.13.51.19.5.4.36.16-.11 2.55-1.73 3.57-2.42.72.1 1.45.16 2.19.16 5.523 0 10-3.477 10-7.83C22 6.477 17.523 3 12 3z" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">상담</span>
    </a>
  );
}
