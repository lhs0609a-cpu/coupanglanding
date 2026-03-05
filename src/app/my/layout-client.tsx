'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';

interface MyLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  isTrainer?: boolean;
}

export default function MyLayoutClient({ children, userName, userRole, isTrainer }: MyLayoutClientProps) {
  return (
    <DashboardLayout userName={userName} userRole={userRole} variant="user" isTrainer={isTrainer}>
      {children}
    </DashboardLayout>
  );
}
