'use client';

import Link from 'next/link';
import { Check, Link2, Info } from 'lucide-react';
import ChannelLogo from '@/components/megaload/ChannelLogo';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

/**
 * 대량등록 시 "어디에 함께 올릴지" 채널 선택 칩.
 * 연결된 채널만 선택 가능, 클릭으로 토글. 선택한 채널로만 등록 성공 직후 전파된다.
 */
export default function ChannelFanoutSelector({
  connectedChannels,
  selected,
  onToggle,
  disabled = false,
}: {
  connectedChannels: Channel[];
  selected: Channel[];
  onToggle: (ch: Channel) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selected);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#E31837]" />
          <span className="text-sm font-bold text-gray-900">함께 올릴 채널 선택</span>
        </div>
        <span className="text-xs text-gray-400">
          쿠팡 등록 + 선택 채널 {selected.length}곳 자동 전파
        </span>
      </div>

      {connectedChannels.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            아직 연결된 다른 채널이 없어요. 쿠팡에만 등록됩니다.{' '}
            <Link href="/megaload/channels" className="font-semibold underline">채널관리에서 연동</Link>하면
            여기서 골라 한 번에 올릴 수 있어요.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {/* 쿠팡은 항상 등록(고정) */}
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#E31837] bg-[#E31837]/5 pl-1 pr-3 py-1">
              <ChannelLogo channel="coupang" size={22} rounded="rounded-full" />
              <span className="text-xs font-bold text-[#E31837]">쿠팡 · 기본</span>
            </span>
            {connectedChannels.map((ch) => {
              const on = selectedSet.has(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(ch)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 pl-1 pr-3 py-1 transition disabled:opacity-50 ${
                    on ? 'border-gray-900 bg-gray-900/5' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <ChannelLogo channel={ch} size={22} rounded="rounded-full" />
                  <span className={`text-xs font-semibold ${on ? 'text-gray-900' : 'text-gray-400'}`}>
                    {CHANNEL_LABELS[ch]}
                  </span>
                  {on && <Check className="w-3.5 h-3.5 text-gray-900" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            선택한 채널 규격(카테고리·필수정보)에 맞게 자동 변환해 전파합니다. 필수값이 부족하면 등록 예외큐에서 보완할 수 있어요.
          </p>
        </>
      )}
    </div>
  );
}
