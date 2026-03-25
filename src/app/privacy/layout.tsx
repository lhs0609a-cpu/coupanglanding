import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보 처리방침 | 메가로드',
  description: '메가로드 개인정보 처리방침 - 개인정보의 수집, 이용, 보관, 파기 등에 관한 정책을 안내합니다.',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
