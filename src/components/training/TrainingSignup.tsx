'use client';
import { useEffect, useState } from 'react';
import { koreaDate, koreaTime, sessionLabel, TRAINING_CHAT_URL, type TrainingSession } from '@/lib/training';
import { KAKAO_SUPPORT_URL } from '@/lib/support-link';
import TrainingCalendar from './TrainingCalendar';

export default function TrainingSignup() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [date, setDate] = useState(koreaDate(new Date()));
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TrainingSession | null>(null);
  async function load() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/public/training', { cache: 'no-store' }); const body = await res.json();
      if (!res.ok) throw Error(body.error);
      setSessions(body.data);
      if (body.data.length) setDate(koreaDate(body.data[0].starts_at));
    } catch (e) { setError(e instanceof Error ? e.message : '일정 조회 실패'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const session = sessions.find(s => s.id === selected);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!session || busy) return;
    const form = new FormData(e.currentTarget); setBusy(true); setError('');
    try {
      const res = await fetch('/api/public/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.id, name: form.get('name'), phone: form.get('phone'), ready: form.get('ready') === 'on', consent: form.get('consent') === 'on', website: form.get('website') }) });
      const body = await res.json(); if (!res.ok) throw Error(body.error);
      setDone(session);
    } catch (e) { setError(e instanceof Error ? e.message : '신청 실패'); }
    finally { setBusy(false); }
  }
  return <section id="training" className="mt-8 scroll-mt-5 rounded-2xl border border-rose-200 bg-white p-5 sm:p-7">
    <p className="text-sm font-bold text-rose-600">준비 완료 후 교육 신청</p>
    <h2 className="mt-2 text-2xl font-bold">교육 날짜와 시간을 선택하세요</h2>
    <p className="my-4 text-sm leading-6 text-slate-600">사업자등록과 쿠팡윙 입점 승인을 마쳤다면, 참여할 회차를 선택해 주세요. 같은 회차 신청자들과 함께 교육을 진행합니다.</p>
    {done ? <div role="status" className="rounded-xl bg-emerald-50 p-5 text-emerald-900">
      <h3 className="text-lg font-bold">교육 신청이 완료되었습니다.</h3><p className="mt-3 font-bold">{done.title}</p><p>{sessionLabel(done)} (한국 시간)</p>
      {done.instructions && <p className="mt-3 whitespace-pre-wrap">{done.instructions}</p>}
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-900"><h3 className="font-bold">마지막으로, 교육 안내방에 꼭 입장해 주세요.</h3><p className="mt-2 text-sm leading-6">구글미트 참여 링크는 아래 카카오톡 오픈채팅방에 안내드립니다. <strong>신청한 교육 날짜와 시간에 이 방에 올라온 구글미트 링크로 참여해 주세요.</strong></p><p className="mt-2 text-sm leading-6">입장 후 신청하신 이름과 교육 날짜를 남겨 주세요. 교육 시간을 개인 캘린더에도 저장해 두시면 좋습니다.</p></div>
      <a className="mt-4 block rounded-xl bg-yellow-300 px-4 py-4 text-center font-bold text-slate-900" href={TRAINING_CHAT_URL} target="_blank" rel="noopener noreferrer">카카오톡 교육 안내방 입장하기 ↗</a>
      <p className="mt-3 text-sm">일정 변경·취소가 필요하면 신청 이름과 교육 날짜를 알려주세요.</p>
      <a className="mt-3 inline-block text-sm underline" href={KAKAO_SUPPORT_URL} target="_blank" rel="noopener noreferrer">변경·취소 문의</a>
    </div> : <>
      {loading ? <p role="status">교육 일정을 불러오는 중입니다…</p> : sessions.length ? <>
        <TrainingCalendar key={sessions[0]?.id} sessions={sessions} selected={date} onSelect={d => { setDate(d); setSelected(''); setError(''); }} />
        <div className="my-4 space-y-2">
          {sessions.filter(s => koreaDate(s.starts_at) === date).map(s => {
            const full = s.capacity !== null && s.booked >= s.capacity;
            return <button type="button" key={s.id} disabled={full} aria-pressed={selected === s.id} onClick={() => setSelected(s.id)} className={`w-full rounded-xl border p-4 text-left ${selected === s.id ? 'border-rose-600 bg-rose-50' : 'border-slate-200'} disabled:opacity-50`}>
              <span className="block font-bold">{koreaTime(s.starts_at)}–{koreaTime(s.ends_at)} · {s.title}</span>
              <span className="text-sm text-slate-500">{full ? '정원 마감' : s.capacity ? `잔여 ${s.capacity - s.booked}자리` : '신청 가능'}</span>
            </button>;
          })}
        </div>
        {session && <form onSubmit={submit} className="space-y-4 border-t pt-5">
          <p className="font-bold">선택한 일정: {sessionLabel(session)}</p>
          {session.instructions && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6">{session.instructions}</p>}
          <label className="block text-sm font-medium">이름<input name="name" required minLength={2} maxLength={40} autoComplete="name" className="mt-2 w-full rounded-lg border p-3" /></label>
          <label className="block text-sm font-medium">휴대폰 번호<input name="phone" type="tel" required autoComplete="tel" placeholder="010-1234-5678" pattern="01[016789][0-9\s\-]{7,11}" maxLength={15} className="mt-2 w-full rounded-lg border p-3" /></label>
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="flex gap-2 text-sm leading-6"><input type="checkbox" name="ready" required className="mt-1 h-4 w-4 shrink-0" />쿠팡윙 입점 승인을 완료했습니다. (필수)</label>
          <label className="flex gap-2 text-sm leading-6"><input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0" /><span>교육 신청·일정 안내를 위한 이름과 연락처 수집에 동의합니다. 신청 취소 시 삭제되며, 동의하지 않으면 신청할 수 없습니다. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보 처리방침</a></span></label>
          <button disabled={busy} className="w-full rounded-xl bg-rose-600 p-4 font-bold text-white disabled:opacity-50">{busy ? '신청 중…' : '이 날짜로 교육 신청하기'}</button>
        </form>}
      </> : !error && <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6">현재 신청 가능한 교육 일정이 없습니다. 일정이 등록되면 이곳에서 신청할 수 있습니다. 카톡으로 다음 교육 일정을 문의해 주세요.</p>}
      {error && <div role="alert" className="mt-4 text-sm text-red-700"><p>{error}</p>{!sessions.length && <button onClick={() => void load()} className="mt-2 underline">다시 불러오기</button>}</div>}
    </>}
  </section>;
}
