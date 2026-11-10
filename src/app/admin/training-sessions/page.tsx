'use client';
import { useEffect, useState } from 'react';
import TrainingCalendar from '@/components/training/TrainingCalendar';
import { koreaDate, koreaTime, sessionLabel, TRAINING_CHAT_URL, type TrainingSession } from '@/lib/training';

const blank = { id: '', title: '쿠팡 PT 교육', start: '14:00', end: '16:00', capacity: '', instructions: '', is_open: true };
export default function AdminTrainingSessions() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [date, setDate] = useState(koreaDate(new Date()));
  const [form, setForm] = useState(blank);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const res = await fetch('/api/admin/training-sessions', { cache: 'no-store' }); const body = await res.json();
      if (!res.ok) throw Error(body.error); setSessions(body.data);
    } catch (e) { setError(e instanceof Error ? e.message : '조회 실패'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function choose(d: string) { setDate(d); setForm(blank); setActive(''); setError(''); setMessage(''); }
  function edit(s: TrainingSession) {
    setDate(koreaDate(s.starts_at)); setActive(s.id); setMessage(''); setError('');
    setForm({ id: s.id, title: s.title, start: koreaTime(s.starts_at), end: koreaTime(s.ends_at), capacity: s.capacity?.toString() || '', instructions: s.instructions, is_open: s.is_open });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin/training-sessions', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, title: form.title, starts_at: `${date}T${form.start}:00+09:00`, ends_at: `${date}T${form.end}:00+09:00`, capacity: form.capacity || null, instructions: form.instructions, is_open: form.is_open }) });
      const body = await res.json(); if (!res.ok) throw Error(body.error);
      setMessage('저장했습니다. 모집 중인 미래 일정은 교육 신청 달력에 표시됩니다.');
      await load(); if (!form.id) setForm(blank);
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패'); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    if (!window.confirm('이 신청을 취소하고 신청자의 이름·연락처를 삭제할까요? 신청자에게 취소를 안내한 후 진행해 주세요.')) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/training-sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }) });
      const body = await res.json(); if (!res.ok) throw Error(body.error); await load(); setMessage('신청을 취소했습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '취소 실패'); }
    finally { setBusy(false); }
  }
  const selected = sessions.find(s => s.id === active);
  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-3';
  return <div className="space-y-6 text-slate-900">
    <div><h1 className="text-2xl font-bold">PT 교육 일정·신청</h1><p className="mt-2 text-sm text-slate-600">쿠팡윙 입점을 마친 분들이 실제 PT 교육을 받을 날짜와 시간을 신청합니다.</p>
      <a href="/pt-training" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-blue-700 underline">신청자용 달력 열기 · /pt-training</a>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
    {loading && <p>일정을 불러오는 중입니다…</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <TrainingCalendar sessions={sessions} selected={date} onSelect={choose} admin />
        <h2 className="font-bold">{date} 교육 회차</h2>
        {sessions.filter(s => koreaDate(s.starts_at) === date).map(s => <button key={s.id} type="button" onClick={() => edit(s)} className={`block w-full rounded-xl border bg-white p-4 text-left ${active === s.id ? 'border-rose-600' : 'border-slate-200'}`}>
          <span className="block font-bold">{koreaTime(s.starts_at)}–{koreaTime(s.ends_at)} · {s.title}</span>
          <span className="text-sm text-slate-600">{s.is_open && Date.parse(s.starts_at) > Date.now() ? '모집 중' : '마감/종료'} · 신청 {s.booked}명{s.capacity ? ` / ${s.capacity}명` : ''}</span>
        </button>)}
        <button type="button" onClick={() => { setForm(blank); setActive(''); }} className="rounded-lg border px-4 py-3 text-sm font-bold">이 날짜에 새 회차 추가</button>
      </div>
      <form onSubmit={save} className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold">{form.id ? '회차 수정' : '회차 등록'} · {date}</h2>
        <label className="block text-sm">교육명<input className={input} value={form.title} onChange={e => setForm({...form,title:e.target.value})} required maxLength={100} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">시작 시간<input type="time" className={input} value={form.start} onChange={e => setForm({...form,start:e.target.value})} required disabled={!!selected?.booked} /></label>
          <label className="text-sm">종료 시간<input type="time" className={input} value={form.end} onChange={e => setForm({...form,end:e.target.value})} required disabled={!!selected?.booked} /></label>
        </div>
        {!!selected?.booked && <p className="text-sm text-amber-800">신청자가 있는 회차는 시간이 고정됩니다. 변경이 필요하면 신청자에게 연락 후 새 회차로 안내해 주세요.</p>}
        <label className="block text-sm">정원 (비워두면 제한 없음)<input type="number" min={1} max={1000} className={input} value={form.capacity} onChange={e => setForm({...form,capacity:e.target.value})} /></label>
        <label className="block text-sm">교육 방식·장소·준비물 안내<textarea rows={4} maxLength={2000} className={input} value={form.instructions} onChange={e => setForm({...form,instructions:e.target.value})} placeholder="온라인 접속 방법 또는 교육 장소, 준비물을 입력하세요. 신청자에게 공개됩니다." /></label>
        <div className="rounded-xl bg-yellow-50 p-4 text-sm leading-6"><p>신청 완료자는 교육 안내방으로 안내됩니다. 교육 당일 이 방에 해당 회차의 구글미트 링크를 올려 주세요.</p><a href={TRAINING_CHAT_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold underline">카카오톡 교육 안내방 열기 ↗</a></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.is_open} onChange={e => setForm({...form,is_open:e.target.checked})} />신청 모집 열기</label>
        <p className="text-xs text-slate-500">일정 등록·변경 시 문자나 카톡이 자동 발송되지는 않습니다.</p>
        <button disabled={busy} className="w-full rounded-xl bg-rose-600 p-3 font-bold text-white disabled:opacity-50">{busy ? '저장 중…' : '교육 일정 저장'}</button>
      </form>
    </div>
    {selected && <section className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">{sessionLabel(selected)} 신청자 · {selected.booked}명</h2>
      {!!selected.booked && <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(selected.bookings!.map(b => b.phone).join('\n')); setMessage('연락처를 복사했습니다. 카톡이나 문자로 직접 안내할 때 사용하세요.'); } catch { setError('복사하지 못했습니다. 아래 명단에서 연락처를 확인해 주세요.'); } }}>신청자 연락처 복사</button>}
      {!selected.booked && <p className="mt-3 text-sm text-slate-500">아직 신청자가 없습니다.</p>}
      <div className="mt-3 divide-y">{selected.bookings?.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-bold">{b.name} · <a href={`tel:${b.phone}`} className="text-blue-700">{b.phone}</a></p><p className="text-xs text-slate-500">{koreaDate(b.created_at)} 신청 · 입점 완료 확인</p></div>
        <button type="button" disabled={busy} onClick={() => void cancel(b.id)} className="rounded-lg border px-3 py-2 text-sm text-red-700">신청 취소</button>
      </div>)}</div>
    </section>}
  </div>;
}
