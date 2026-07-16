'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Loader2, Check, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import ChannelLogo from '@/components/megaload/ChannelLogo';
import { CHANNEL_LABELS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';

interface ChannelStat {
  channel: Channel;
  total: number;
  active: number;
  needsInput: number;
  failed: number;
  inflight: number;
  done: number;
  settled: boolean;
}

/**
 * 대량등록 직후 "이번에 올린 상품들"이 선택 채널에 어떻게 전파되는지 실시간 표시.
 * replication-status 엔드포인트를 폴링해 채널별 성공/보류/실패/전파중 카운트를 보여준다.
 * 전파는 백그라운드 러너가 처리하므로 결과는 몇 초~수 분에 걸쳐 채워진다.
 */
export default function ReplicationLivePanel({
  productIds,
  targetChannels,
}: {
  productIds: string[];
  /** 사용자가 이번에 고른 전파 대상(비면 렌더 안 함) */
  targetChannels: Channel[];
}) {
  const [stats, setStats] = useState<ChannelStat[]>([]);
  const [allSettled, setAllSettled] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (productIds.length === 0 || targetChannels.length === 0) return;
    let cancelled = false;
    const deadline = Date.now() + 10 * 60 * 1000; // 최대 10분 폴링

    const poll = async () => {
      try {
        const res = await fetch(`/api/megaload/products/replication-status?ids=${encodeURIComponent(productIds.join(','))}`);
        if (res.ok) {
          const data = await res.json() as { perChannel: ChannelStat[]; allSettled: boolean };
          if (!cancelled) {
            // 사용자가 고른 채널만 표시(연결됐지만 이번에 선택 안 한 채널은 숨김)
            const picked = new Set(targetChannels);
            setStats((data.perChannel || []).filter((c) => picked.has(c.channel)));
            setAllSettled(data.allSettled);
            setLoading(false);
          }
        }
      } catch { /* 폴링 실패 — 다음 tick 재시도 */ }
      if (cancelled) return;
      // 아직 미완이고 마감 전이면 계속 폴링(간격 4s)
      timerRef.current = setTimeout(poll, 4000);
    };
    poll();
    // 마감 안전장치
    const stop = setTimeout(() => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); }, deadline - Date.now());

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(stop);
    };
  }, [productIds, targetChannels]);

  // 완료되면 폴링 중단
  useEffect(() => {
    if (allSettled && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [allSettled]);

  if (productIds.length === 0 || targetChannels.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {allSettled ? <Check className="w-5 h-5 text-green-600" /> : <Loader2 className="w-5 h-5 text-[#E31837] animate-spin" />}
          <span className="font-bold text-gray-900">
            다른 채널 전파 {allSettled ? '완료' : '진행 중'}
          </span>
        </div>
        <span className="text-xs text-gray-400">상품 {productIds.length}개 · 채널 {targetChannels.length}곳</span>
      </div>

      <div className="space-y-2">
        {targetChannels.map((ch) => {
          const s = stats.find((x) => x.channel === ch);
          const active = s?.active ?? 0;
          const needsInput = s?.needsInput ?? 0;
          const failed = s?.failed ?? 0;
          const inflight = s ? s.inflight : productIds.length;
          const total = productIds.length;
          const pct = total > 0 ? Math.round(((active + needsInput + failed) / total) * 100) : 0;
          return (
            <div key={ch} className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5">
              <ChannelLogo channel={ch} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{CHANNEL_LABELS[ch]}</span>
                  <span className="text-[11px] text-gray-400">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#E31837] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] shrink-0">
                <span className="inline-flex items-center gap-0.5 text-green-600"><Check className="w-3 h-3" />{active}</span>
                {needsInput > 0 && <span className="inline-flex items-center gap-0.5 text-amber-600"><AlertTriangle className="w-3 h-3" />{needsInput}</span>}
                {failed > 0 && <span className="inline-flex items-center gap-0.5 text-red-600"><XCircle className="w-3 h-3" />{failed}</span>}
                {inflight > 0 && !s?.settled && <span className="inline-flex items-center gap-0.5 text-gray-400"><Loader2 className="w-3 h-3 animate-spin" />{inflight}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {loading && stats.length === 0 && (
        <p className="mt-3 text-center text-xs text-gray-400">전파 상태를 불러오는 중…</p>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
        <span>초록=등록 · 노랑=필수값 보완 필요 · 회색=전파 중</span>
        <Link href="/megaload/products/exceptions" className="inline-flex items-center gap-0.5 font-medium text-gray-600 hover:text-gray-900">
          보완 필요 처리 <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
