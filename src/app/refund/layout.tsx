import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '환불정책 | 메가로드',
  description: '메가로드 환불정책 - 청약철회, 환불 절차 및 서비스별 환불 규정을 안내합니다.',
};

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
