'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, CheckCircle2, XCircle, PauseCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface RecentCheck {
  id: string;
  name: string;
  sourceStatus: string;
  coupangStatus: string;
  checkedAt: string;
}

interface RecentActivity {
  recent: RecentCheck[];
  lastCheckAt: string | null;
  checkedLast5Min: number;
  checkedLastHour: number;
}

interface Props {
  // 대시보드가 이미 폴링하는 도우미 상태를 재사용 (중복 조회 방지)
  isAlive: boolean | null; // null = 로딩/미확인
  tokenIssued: boolean;
  heartbeatAgeMin: number;
}

const POLL_MS = 15_000;

// 초 단위까지 세분화한 상대시간 — "지금 돌고 있다"는 생동감을 위해 방금/N초 전까지 표기
function agoLabel(dateStr: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 1000));
  if (sec < 10) return '방금';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

// 원본 상태 → 점 색 + 짧은 라벨
function statusDot(sourceStatus: string, coupangStatus: string) {
  if (sourceStatus === 'sold_out' || sourceStatus === 'removed') {
    return { Icon: XCircle, color: 'text-red-500', label: '품절 감지' };
  }
  if (sourceStatus === 'error') {
    return { Icon: AlertTriangle, color: 'text-yellow-500', label: '조회 실패' };
  }
  if (coupangStatus === 'suspended') {
    return { Icon: PauseCircle, color: 'text-orange-500', label: '쿠팡 중지' };
  }
  return { Icon: CheckCircle2, color: 'text-green-500', label: '판매중 확인' };
}

export default function LiveDetectionMonitor({ isAlive, tokenIssued, heartbeatAgeMin }: Props) {
  const [data, setData] = useState<RecentActivity | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const flashRef = useRef<string | null>(null);
  const [flashing, setFlashing] = useState(false);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/megaload/stock-monitor/recent-activity');
      if (!res.ok) return;
      const d: RecentActivity = await res.json();
      // 새 확인이 들어오면(최상단 id 변경) 잠깐 하이라이트 → "방금 갱신됐다"는 시각 피드백
      const topId = d.recent[0]?.id ?? null;
      if (flashRef.current !== null && topId !== null && topId !== flashRef.current) {
        setFlashing(true);
        setTimeout(() => setFlashing(false), 1200);
      }
      flashRef.current = topId;
      setData(d);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchActivity();
    const id = setInterval(fetchActivity, POLL_MS);
    const onFocus = () => fetchActivity();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [fetchActivity]);

  // 상대시간 라이브 갱신 (5초마다) — 폴링과 별개로 "N초 전"이 흐르게
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // 감지 신호 판정
  //  · 도우미 꺼짐            → 회색/적색 "감지 중지됨"
  //  · 켜짐 + 최근5분 확인>0  → 녹색 펄스 "실시간 감지 중"
  //  · 켜짐 + 최근확인 없음   → 황색 "감지 대기 중"
  const last5 = data?.checkedLast5Min ?? 0;
  const lastHour = data?.checkedLastHour ?? 0;

  type Signal = 'loading' | 'off' | 'live' | 'idle';
  let signal: Signal;
  if (isAlive === null && data === null) signal = 'loading';
  else if (isAlive === false) signal = 'off';
  else if (last5 > 0) signal = 'live';
  else signal = 'idle';

  const theme = {
    loading: { ring: 'border-gray-200', bg: 'bg-white', dot: 'bg-gray-300', text: 'text-gray-500', title: '감지 상태 확인 중…' },
    off: { ring: 'border-gray-200', bg: 'bg-gray-50', dot: 'bg-gray-400', text: 'text-gray-600', title: '감지 중지됨 — 도우미 꺼짐' },
    live: { ring: 'border-emerald-300', bg: 'bg-emerald-50/60', dot: 'bg-emerald-500', text: 'text-emerald-700', title: '실시간 감지 중' },
    idle: { ring: 'border-amber-200', bg: 'bg-amber-50/60', dot: 'bg-amber-400', text: 'text-amber-700', title: '감지 대기 중 — 다음 주기 대기' },
  }[signal];

  return (
    <div className={`rounded-xl border ${theme.ring} ${theme.bg} overflow-hidden transition-colors`}>
      {/* 신호등 헤더 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-3 w-3 flex-shrink-0">
            {signal === 'live' && (
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${theme.dot} opacity-70`} />
            )}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${theme.dot}`} />
          </span>
          <div className="min-w-0">
            <div className={`text-sm font-bold flex items-center gap-1.5 ${theme.text}`}>
              <Radio className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{theme.title}</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {signal === 'live' && '도우미가 원본 상태·가격을 실시간으로 점검하고 있습니다.'}
              {signal === 'idle' && (isAlive
                ? '도우미는 켜져 있습니다. 곧 다음 점검 주기가 돌아갑니다.'
                : '도우미 신호를 기다리는 중입니다.')}
              {signal === 'off' && (tokenIssued
                ? `도우미가 ${heartbeatAgeMin >= 0 ? `${heartbeatAgeMin >= 60 ? `${Math.floor(heartbeatAgeMin / 60)}시간` : `${heartbeatAgeMin}분`} 전 마지막 접속` : '접속한 적 없음'} — 켜야 자동 점검됩니다.`
                : '인증코드를 발급하고 도우미를 켜면 자동 점검이 시작됩니다.')}
              {signal === 'loading' && ' '}
            </div>
          </div>
        </div>

        {/* 처리량 지표 */}
        <div className="text-right flex-shrink-0">
          {data ? (
            <>
              <div className="text-lg font-extrabold text-gray-900 tabular-nums leading-none">
                {lastHour.toLocaleString()}
                <span className="text-[11px] font-medium text-gray-400 ml-1">개</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">최근 1시간 확인</div>
            </>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          )}
        </div>
      </div>

      {/* 확인 피드 */}
      {data && data.recent.length > 0 ? (
        <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
          {data.recent.map((r, i) => {
            const s = statusDot(r.sourceStatus, r.coupangStatus);
            const isTop = i === 0;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-2.5 px-4 py-2 text-xs transition-colors ${
                  isTop && flashing ? 'bg-emerald-100/70' : ''
                }`}
              >
                <s.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${s.color}`} />
                <span className="flex-1 min-w-0 truncate text-gray-700">{r.name}</span>
                <span className={`flex-shrink-0 font-medium ${s.color}`}>{s.label}</span>
                <span className="flex-shrink-0 w-14 text-right text-gray-400 tabular-nums">
                  {agoLabel(r.checkedAt, now)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : data ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          아직 확인된 상품이 없습니다. 「전체 점검 시작」을 누르고 도우미를 켜면 여기에 실시간으로 표시됩니다.
        </div>
      ) : (
        <div className="px-4 py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
        </div>
      )}
    </div>
  );
}
