'use client';

import { useEffect, useState } from 'react';

/**
 * 메가로드 도우미(데스크탑 앱) 연결 표시등 — 항상 표시.
 * 앱이 로그인 상태면 30초마다 하트비트를 보내고, 웹은 90초 내 하트비트로 online 판정.
 *   🟢 연결됨 / 🔴 미연결 / ⚪ 확인 중
 */
export default function DesktopStatusIndicator() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
        const j = await res.json();
        if (alive) setOnline(!!j.online);
      } catch {
        if (alive) setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const dot = online === null ? 'bg-gray-300' : online ? 'bg-emerald-500' : 'bg-red-400';
  const label = online === null ? '도우미 확인 중…' : online ? '도우미 연결됨' : '도우미 미연결';

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200"
      title={online ? '메가로드 도우미가 켜져 있고 로그인된 상태입니다.' : '메가로드 도우미가 꺼져 있거나 로그인 안 됨. 앱을 켜고 메가로드 연결을 하세요.'}
    >
      <span className={`w-2 h-2 rounded-full ${dot} ${online ? 'animate-pulse' : ''}`} />
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
    </div>
  );
}
