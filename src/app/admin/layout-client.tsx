'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';

interface AdminLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}

export default function AdminLayoutClient({ children, userName, userRole }: AdminLayoutClientProps) {
  return (
    <DashboardLayout userName={userName} userRole={userRole} variant="admin">
      {children}
    </DashboardLayout>
  );
}
