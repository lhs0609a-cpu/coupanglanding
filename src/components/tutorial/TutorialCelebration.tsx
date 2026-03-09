'use client';

import { useEffect, useState } from 'react';

interface TutorialCelebrationProps {
  xp: number;
  featureName: string;
  onClose: () => void;
}

export default function TutorialCelebration({ xp, featureName, onClose }: TutorialCelebrationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 약간의 딜레이 후 애니메이션 시작
    const timer = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center text-center px-4">
      {/* 축하 이모지 폭발 */}
      <div className="relative mb-4">
        <div className={`text-6xl transition-all duration-700 ${show ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          🎉
        </div>
        {/* 파티클 효과 */}
        {show && (
          <div className="absolute inset-0 pointer-events-none">
            {['🌟', '⭐', '✨', '💫', '🎊', '🎯'].map((emoji, i) => (
              <span
                key={i}
                className="absolute text-lg animate-celebration-particle"
                style={{
                  left: '50%',
                  top: '50%',
                  animationDelay: `${i * 0.1}s`,
                  // CSS 변수로 방향 설정
                  '--tx': `${Math.cos((i * 60 * Math.PI) / 180) * 60}px`,
                  '--ty': `${Math.sin((i * 60 * Math.PI) / 180) * 60}px`,
                } as React.CSSProperties}
              >
                {emoji}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 축하 메시지 */}
      <h3 className={`text-2xl font-bold text-gray-900 mb-2 transition-all duration-500 delay-300 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}>
        튜토리얼 완료!
      </h3>

      <p className={`text-gray-500 text-sm mb-4 transition-all duration-500 delay-500 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}>
        &quot;{featureName}&quot; 기능을 마스터했습니다!
      </p>

      {/* XP 획득 */}
      <div className={`bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-6 py-3 mb-6 transition-all duration-500 delay-700 ${
        show ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="text-xl font-bold text-amber-700">+{xp} XP</span>
        </div>
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className={`btn-cta px-8 py-2.5 rounded-xl text-sm font-bold transition-all duration-500 delay-1000 ${
          show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        확인
      </button>
    </div>
  );
}
