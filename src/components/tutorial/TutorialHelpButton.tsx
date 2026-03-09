'use client';

import { HelpCircle } from 'lucide-react';

interface TutorialHelpButtonProps {
  onClick: () => void;
}

export default function TutorialHelpButton({ onClick }: TutorialHelpButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-[55] w-12 h-12 bg-[#E31837] text-white rounded-full shadow-lg hover:bg-[#c41230] hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center group"
      title="기능 튜토리얼 보기"
    >
      <HelpCircle className="w-5 h-5 group-hover:rotate-12 transition-transform" />
    </button>
  );
}
