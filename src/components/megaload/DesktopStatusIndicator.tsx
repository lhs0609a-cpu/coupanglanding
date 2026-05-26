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

  // 배포 버전 (next.config 에서 빌드 시 주입) — 최신 푸시 반영 확인용
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || 'local';
  const rawTime = process.env.NEXT_PUBLIC_BUILD_TIME || '';
  let buildTime = '';
  try {
    if (rawTime) {
      const d = new Date(rawTime);
      const k = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST
      buildTime = `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
    }
  } catch { /* ignore */ }

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200"
        title={online ? '메가로드 도우미가 켜져 있고 로그인된 상태입니다.' : '메가로드 도우미가 꺼져 있거나 로그인 안 됨. 앱을 켜고 메가로드 연결을 하세요.'}
      >
        <span className={`w-2 h-2 rounded-full ${dot} ${online ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
      </div>
      <div className="px-3 text-[10px] text-gray-400" title={`배포 커밋 ${sha} · 빌드 ${rawTime}`}>
        배포 {sha}{buildTime ? ` · ${buildTime}` : ''}
      </div>
    </div>
  );
}
