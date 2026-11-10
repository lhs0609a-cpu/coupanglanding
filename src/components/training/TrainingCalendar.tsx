'use client';
import { useState } from 'react';
import { koreaDate, type TrainingSession } from '@/lib/training';

export default function TrainingCalendar({ sessions, selected, onSelect, admin = false }: { sessions: TrainingSession[]; selected: string; onSelect: (date: string) => void; admin?: boolean }) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [year, mon] = month.split('-').map(Number);
  const offset = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const today = koreaDate(new Date());
  function move(delta: number) { const d = new Date(Date.UTC(year, mon - 1 + delta, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); }
  return <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
    <div className="mb-4 flex items-center justify-between">
      <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="rounded-lg border px-4 py-2">‹</button>
      <h3 className="font-bold" aria-live="polite">{year}년 {mon}월</h3>
      <button type="button" onClick={() => move(1)} aria-label="다음 달" className="rounded-lg border px-4 py-2">›</button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-sm">
      {['일','월','화','수','목','금','토'].map(d => <div key={d} className="py-2 text-slate-500">{d}</div>)}
      {Array.from({length: offset}, (_, i) => <div key={`empty-${i}`} />)}
      {Array.from({length: days}, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        const available = sessions.filter(s => koreaDate(s.starts_at) === date);
        const disabled = !admin && (!available.length || date < today);
        return <button key={date} type="button" disabled={disabled} aria-label={`${date}${available.length ? ` 교육 ${available.length}회` : ''}`} aria-pressed={selected === date} onClick={() => onSelect(date)} className={`min-h-12 rounded-lg py-2 ${selected === date ? 'bg-rose-600 text-white' : 'hover:bg-rose-50'} disabled:text-slate-300 disabled:hover:bg-white`}>
          {i + 1}{available.length > 0 && <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-current" />}
        </button>;
      })}
    </div>
    <p className="mt-3 text-xs text-slate-500">한국 시간(KST) 기준 · {admin ? '날짜를 눌러 회차를 등록하세요.' : '점이 표시된 날짜에 교육이 있습니다.'}</p>
  </div>;
}
