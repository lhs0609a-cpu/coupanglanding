'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';

interface MyLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}

export default function MyLayoutClient({ children, userName, userRole }: MyLayoutClientProps) {
  return (
    <DashboardLayout userName={userName} userRole={userRole} variant="user">
      {children}
    </DashboardLayout>
  );
}
