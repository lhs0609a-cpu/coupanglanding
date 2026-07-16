'use client';

import { useState } from 'react';
import { CHANNEL_LOGOS, CHANNEL_LABELS, CHANNEL_BG_COLORS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

/**
 * 채널 브랜드 로고 타일. 실제 로고(public/channel-logos/)를 우선 표시하고,
 * 로드 실패 시 브랜드색 배경 + 이니셜 박스로 자동 폴백한다.
 */
export default function ChannelLogo({
  channel,
  size = 40,
  rounded = 'rounded-xl',
  className = '',
}: {
  channel: Channel;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  const src = CHANNEL_LOGOS[channel];

  if (err || !src) {
    return (
      <div
        className={`${rounded} flex items-center justify-center text-white font-bold ${className}`}
        style={{ width: size, height: size, backgroundColor: CHANNEL_BG_COLORS[channel], fontSize: size * 0.4 }}
      >
        {CHANNEL_LABELS[channel].charAt(0)}
      </div>
    );
  }

  return (
    <div
      className={`${rounded} overflow-hidden bg-white border border-gray-100 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${CHANNEL_LABELS[channel]} 로고`}
        onError={() => setErr(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
