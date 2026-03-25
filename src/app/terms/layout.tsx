import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관 | 메가로드',
  description: '메가로드 서비스 이용약관 - 서비스 이용에 관한 권리, 의무 및 책임사항을 안내합니다.',
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
