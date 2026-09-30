'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Flag, Trophy } from 'lucide-react';
import type { RoadmapStep } from '@/lib/data/start-roadmap';
import { getStepMockups, isShot } from '@/lib/data/start-mockups';
import { COUPANG_CONNECTION_IP_TEXT, COUPANG_CONNECTION_URL } from '@/lib/data/coupang-connection';
import StepMockup from './StepMockup';

function CopyValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState('');
  return <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 p-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-blue-200">{label}</span>
      <button type="button" className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-500 px-3 py-2 text-xs font-bold text-white" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setMessage('복사했습니다. 윙 입력란에 붙여넣으세요.'); }
        catch { setMessage('아래 값을 직접 선택해 복사해 주세요.'); }
      }}><Copy size={13} />복사</button>
    </div>
    <code className="block select-all break-all text-xs leading-6 text-white">{value}</code>
    <p role="status" className="mt-1 text-xs text-blue-200">{message}</p>
  </div>;
}

export default function MissionGuide({ step, checkedItems, onCheck }: {
  step: RoadmapStep; checkedItems: Record<string, boolean>; onCheck: (id: string) => void;
}) {
  const [selected, setSelected] = useState(() => Math.max(0, step.subSteps.findIndex(s => !checkedItems[s.id])));
  const mission = step.subSteps[selected];
  const workspaceUrl = step.id === 'act1-05-api' && selected < 7 ? 'https://wing.coupang.com' : mission.link?.label === '작업 화면 열기' ? mission.link.url : step.support.url;
  const subIds = step.subSteps.map(s => s.id);
  const screens = getStepMockups(step.id, step.subSteps).filter(s => isShot(s)
    ? s.hotspots.some(h => h.pin === mission.id)
    : s.blocks.some(b => b.pin === mission.id));
  const done = !!checkedItems[mission.id];
  const completed = subIds.filter(id => checkedItems[id]).length;
  const allDone = completed === subIds.length;
  return <div data-mission-guide className="space-y-4">
    <section aria-label="준비물과 작업 경로" className="rounded-xl border border-blue-400/25 bg-blue-500/5 p-4 text-sm leading-6 text-gray-300">
      <h4 className="font-bold text-white">시작 전에 준비하세요</h4>
      <p className="mt-2">{step.support.prepare}</p>
      {step.support.trigger && <p className="mt-2 text-amber-200">{step.support.trigger}</p>}
      {step.support.prerequisite && <a className="mt-2 block text-blue-300 underline" href={`/start?stage=${step.support.prerequisite}`}>필요한 이전 단계 확인하기</a>}
      <p className="mt-3 text-xs text-gray-400">로그인 후 이동할 메뉴: {step.support.path}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a data-workspace-link href={workspaceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">실제 작업 화면 열기<ExternalLink size={14}/></a>
        {workspaceUrl.startsWith('/megaload') && <a href="https://wing.coupang.com" target="_blank" rel="noopener noreferrer" className="py-2 text-blue-300 underline">메가로드 이용 권한이 없으면 쿠팡 윙에서 직접 처리</a>}
      </div>
      {workspaceUrl.startsWith('/megaload') && <p className="mt-2 text-xs">메가로드는 로그인·계정 승인·이용 권한이 필요합니다. 윙을 이용할 때는 위 메뉴 중 윙 경로를 따르세요. 메가로드 카탈로그·자동 등록 기능은 윙에서 동일하게 제공되지 않습니다.</p>}
    </section>
    <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-blue-500/5 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className="flex items-center gap-2 text-violet-200"><Flag size={15} /> STAGE {String(step.number).padStart(2, '0')}</span>
        <span className="text-emerald-300">{completed * 10} / {subIds.length * 10} XP</span>
      </div>
      <div className="my-3 flex gap-1" role="progressbar" aria-label="미션 진행률" aria-valuemin={0} aria-valuemax={subIds.length} aria-valuenow={completed}>
        {subIds.map(id => <span key={id} className={`h-1.5 flex-1 rounded-full ${checkedItems[id] ? 'bg-emerald-400' : 'bg-white/10'}`} />)}
      </div>
      <p className="text-xs leading-5 text-gray-400">화면의 번호를 찾고 → 실제 사이트에서 작업하고 → 완료를 체크하세요. 진행 상황은 이 브라우저에 저장됩니다.</p>
      {allDone && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-300"><Trophy size={18} /> STAGE CLEAR · 모든 미션을 확인했어요!</p>}
    </div>

    <nav aria-label={`${step.title} 세부 미션`} className="flex flex-wrap gap-2">
      {step.subSteps.map((s, i) => <button type="button" key={s.id} aria-current={i === selected ? 'step' : undefined}
        aria-label={`미션 ${i + 1}: ${s.label}${checkedItems[s.id] ? ' (완료)' : ''}`}
        onClick={() => setSelected(i)} className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-bold transition ${i === selected ? 'border-violet-400 bg-violet-500/25 text-white ring-2 ring-violet-400/20' : checkedItems[s.id] ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-gray-400 hover:bg-white/10'}`}>
        {checkedItems[s.id] ? <Check size={14} /> : String(i + 1).padStart(2, '0')}
        {i === selected && <span>현재 미션</span>}
      </button>)}
    </nav>

    <div key={mission.id} className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-violet-300">MISSION {selected + 1} / {subIds.length} · +10 XP</p>
        <h4 className="text-lg font-bold leading-7 text-white">{mission.label}</h4>
        {mission.description && <p className="mt-2 text-sm leading-6 text-gray-300">{mission.description}</p>}
      </div>
      <StepMockup key={mission.id} screens={screens} subIds={subIds} checkedItems={checkedItems} focusPin={mission.id} />
      {mission.id === 'api-4' && <div className="space-y-3">
        <CopyValue label="① 접속 IP · 10개 전체 복사" value={COUPANG_CONNECTION_IP_TEXT} />
        <CopyValue label="② 서비스 URL" value={COUPANG_CONNECTION_URL} />
        <p className="text-xs leading-5 text-gray-400">메가로드 설정 페이지와 같은 값입니다. 집이나 회사의 IP를 입력하지 마세요. 윙에서 저장한 뒤 화면을 다시 열어 값이 유지되는지 확인하세요.</p>
      </div>}
      {mission.id === 'api-4-url' && <CopyValue label="서비스 URL 전체 복사" value={COUPANG_CONNECTION_URL} />}
      {mission.id === 'api-6' && <div className="rounded-xl border border-amber-500/20 p-4 text-sm leading-6 text-gray-300">
        <p className="font-bold text-amber-200">연결이 실패했다면</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>IP 관련 오류: 윙의 연동 정보에 IP 10개가 저장됐는지 확인하세요.</li>
          <li>인증 오류: 업체코드와 키가 같은 판매자 계정에서 발급됐는지, 키가 만료되지 않았는지 확인하세요.</li>
          <li>수정 후 채널관리에서 다시 저장하고 연결 테스트를 실행하세요. 성공 응답을 확인한 뒤 완료 체크합니다.</li>
        </ol>
        <a href="/megaload/channels" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-blue-300">채널관리에서 실제 연결 확인<ExternalLink size={14} /></a>
      </div>}
      {mission.tip && <p className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-200">💡 {mission.tip}</p>}
      {mission.warning && <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">확인해 주세요 · {mission.warning}</p>}
      {mission.link && <a href={mission.link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm text-white hover:bg-white/10">{mission.link.label}<ExternalLink size={14} /></a>}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="mb-3 text-sm leading-6 text-emerald-200">단계 종료 기준: {step.support.complete}</p>
        <p className="mb-2 text-xs font-bold text-emerald-300">완료 체크</p>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-gray-200">
          <input type="checkbox" checked={done} onChange={() => onCheck(mission.id)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
          <span>실제 사이트에서 ‘{mission.label}’ 작업을 완료했습니다.</span>
        </label>
        <p className="mt-2 text-xs leading-5 text-gray-500">이 체크는 직접 기록하는 진행률입니다. 화면 예시를 보는 것만으로 신청·저장·API 연결이 실행되지는 않습니다.</p>
      </div>
    </div>

    <details className="rounded-xl border border-white/10 p-4 text-sm text-gray-300">
      <summary className="cursor-pointer font-bold text-white">막혔을 때 · 도움말과 답변 문구</summary>
      <div className="mt-4 space-y-4">
        {step.troubleshoot.map(t => <div key={t.symptom}><p className="font-semibold text-amber-200">{t.symptom}</p><p className="mt-1 leading-6">{t.cause} {t.fix}</p></div>)}
        {step.actions.map((action, i) => action.copyable ? <div key={i}><CopyValue label={action.copyable.label} value={action.copyable.text}/><p className="mt-1 text-xs">문구는 예시입니다. 실제 주문 상태·확인 일정에 맞게 고치고 확인하지 않은 사실은 삭제하세요.</p></div> : action.href ? <a key={i} href={action.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-300 underline">{action.label}{action.href.startsWith('/my/') && ' (회원 권한 필요)'}<ExternalLink size={14}/></a> : null)}
      </div>
    </details>

    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
      <button type="button" disabled={selected === 0} onClick={() => setSelected(i => i - 1)} className="flex items-center gap-1 rounded-lg px-3 py-3 text-sm text-gray-300 disabled:opacity-30"><ArrowLeft size={16} /> 이전</button>
      {selected < subIds.length - 1 ? <button type="button" onClick={() => setSelected(i => i + 1)} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${done ? 'bg-emerald-500 text-gray-950' : 'bg-white/10 text-white'}`}>{done ? '다음 미션' : '다음 화면 미리보기'}<ArrowRight size={16} /></button>
        : <span className="text-sm font-semibold text-emerald-300">{allDone ? '스테이지 클리어!' : `미완료 미션 ${subIds.length - completed}개`}</span>}
    </div>
  </div>;
}
