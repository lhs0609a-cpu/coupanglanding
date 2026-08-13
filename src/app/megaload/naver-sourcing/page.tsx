'use client';

/**
 * 네이버 소싱 — 관리자 조종석.
 *
 * 수집은 서버가 못 한다(네이버가 datacenter IP 를 차단). 실제로 페이지를 여는 건 이 PC 의
 * 도우미(Electron 내장 크롬)이고, 이 화면은 그걸 조종·관측하는 곳이다.
 * 그래서 "도우미 미연결" 상태에서는 아무것도 할 수 없고, 그 사실을 첫 화면에 명확히 띄운다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Play, Square, MonitorDown, AlertTriangle, RefreshCw, Loader2, ExternalLink,
} from 'lucide-react';
import {
  findHelper, fetchStatus, setWindows, startPool, stopPool, testOne, showWindow,
  type LocalEndpoint, type IngestStatus, type IngestLog, type WindowInfo,
} from '@/lib/megaload/naver-ingest-local';

const ROLE_LABEL: Record<string, string> = { list: '목록 수집', detail: '상세 추출' };
const STATUS_LABEL: Record<string, string> = {
  idle: '대기', warming: '준비 중', navigating: '이동 중',
  working: '작업 중', captcha: '캡차 대기', closed: '닫힘',
};

type Link = 'checking' | 'online' | 'offline' | 'unsupported';

export default function NaverSourcingPage() {
  const [ep, setEp] = useState<LocalEndpoint | null>(null);
  const [link, setLink] = useState<Link>('checking');
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [logs, setLogs] = useState<IngestLog[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 슬라이더를 드래그하는 동안 폴링 결과가 값을 되돌리는 걸 막는다.
  const [draft, setDraft] = useState<number | null>(null);

  const sinceRef = useRef(0);
  const logBoxRef = useRef<HTMLPreElement>(null);

  // ── 도우미 발견 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await findHelper();
      if (cancelled) return;
      setEp(found);
      setLink(found ? 'online' : 'offline');
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 상태 폴링 ──
  const poll = useCallback(async () => {
    if (!ep) return;
    const s = await fetchStatus(ep, sinceRef.current);
    if (s === 'unsupported') { setLink('unsupported'); return; }
    if (!s) { setLink('offline'); return; }
    setLink('online');
    setStatus(s);
    const fresh = s.logs ?? [];
    if (fresh.length) {
      sinceRef.current = fresh[fresh.length - 1].at;
      setLogs((prev) => [...prev, ...fresh].slice(-300));
    }
  }, [ep]);

  useEffect(() => {
    if (!ep) return;
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [ep, poll]);

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try { await fn(); await poll(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  // ── 도우미 미연결 ──
  if (link !== 'online') {
    return (
      <div className="p-6 max-w-3xl">
        <Header />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            {link === 'checking'
              ? <Loader2 className="w-5 h-5 text-amber-600 animate-spin mt-0.5 shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="font-bold text-amber-900">
                {link === 'checking' ? '도우미를 찾는 중…'
                  : link === 'unsupported' ? '도우미 업데이트가 필요합니다'
                    : '이 PC에서 도우미를 찾지 못했습니다'}
              </p>
              <p className="text-sm text-amber-800 mt-1 leading-relaxed">
                {link === 'unsupported'
                  ? '설치된 도우미가 네이버 소싱을 지원하지 않는 버전입니다. 도우미 사이드바의 "업데이트 확인"을 누르고 앱을 재시작해 주세요.'
                  : '네이버는 서버(데이터센터 IP)의 접근을 차단하기 때문에, 수집은 이 PC에 설치된 도우미의 브라우저로만 할 수 있습니다. 도우미를 실행한 뒤 이 페이지를 새로고침해 주세요.'}
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => { setLink('checking'); findHelper().then((f) => { setEp(f); setLink(f ? 'online' : 'offline'); }); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-900 text-sm font-medium hover:bg-amber-100"
                >
                  <RefreshCw className="w-4 h-4" /> 다시 찾기
                </button>
                <a
                  href="/megaload/settings?tab=localgpu"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230]"
                >
                  <MonitorDown className="w-4 h-4" /> 도우미 다운로드
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 도우미에 로그인된 계정이 관리자가 아님 ──
  if (status && !status.isAdmin) {
    return (
      <div className="p-6 max-w-3xl">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-bold text-red-900">도우미가 관리자 계정으로 연결돼 있지 않습니다</p>
          <p className="text-sm text-red-800 mt-1 leading-relaxed">
            현재 도우미 계정: <b>{status.account?.email || '연결 안 됨'}</b>
            {status.account?.role ? ` (${status.account.role})` : ''}
            <br />
            웹에 관리자로 로그인해도 <b>도우미는 별개 계정</b>입니다. 도우미 사이드바의
            &quot;로그아웃 · 다른 계정 연결&quot;로 관리자 계정을 연결해 주세요.
          </p>
        </div>
      </div>
    );
  }

  const configured = draft ?? status?.configured ?? 3;
  const gate = status?.gate;
  const cooling = (gate?.cooldownMsLeft ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl">
      <Header />

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* 1. 동시 창 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-1">동시 창</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          창을 늘리면 페이지가 로딩되는 동안 다른 창이 일하므로 빨라집니다. 다만 네이버 차단을 피하려고
          전체 요청 속도가 고정돼 있어서, <b className="text-gray-700">4개를 넘으면 처리량은 거의 안 늘고 메모리만 더 씁니다.</b>
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range" min={status?.limits.min ?? 1} max={status?.limits.max ?? 6} step={1}
            value={configured}
            onChange={(e) => setDraft(Number(e.target.value))}
            onMouseUp={() => { if (draft !== null && ep) run('windows', () => setWindows(ep, draft)).then(() => setDraft(null)); }}
            onTouchEnd={() => { if (draft !== null && ep) run('windows', () => setWindows(ep, draft)).then(() => setDraft(null)); }}
            className="flex-1 accent-[#E31837]"
          />
          <span className="w-14 text-center font-bold text-gray-900">{configured}개</span>
          {[1, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => ep && run('windows', () => setWindows(ep, n))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              {n === 1 ? '안전 1' : n === 3 ? '표준 3' : '최대 4'}
            </button>
          ))}
        </div>
        {status && status.effective < status.configured && (
          <p className="text-sm text-amber-700 mt-3">
            ⚠️ 차단 신호가 있어 지금은 {status.effective}개로 줄여서 돌고 있습니다. 회복되면 {status.configured}개로 돌아갑니다.
          </p>
        )}
      </section>

      {/* 2. 상태 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">상태</h2>
          <div className="flex gap-2">
            <button
              onClick={() => ep && run('start', () => startPool(ep))}
              disabled={!!busy || status?.running}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#c41230]"
            >
              {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} 창 준비
            </button>
            <button
              onClick={() => ep && run('stop', () => stopPool(ep))}
              disabled={!!busy || !status?.running}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              <Square className="w-4 h-4" /> 정지
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="실행 중인 창" value={String(status?.active ?? 0)} />
          <Stat label="속도 단계" value={String(gate?.level ?? 1)} hint={gate?.level && gate.level > 1 ? '차단으로 감속됨' : '기준선'} />
          <Stat
            label="쿨다운"
            value={cooling ? `${Math.ceil((gate?.cooldownMsLeft ?? 0) / 1000)}초` : '-'}
            danger={cooling}
            hint={cooling ? '네이버가 막아서 전체 정지 중' : undefined}
          />
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
          {status?.windows.length
            ? status.windows.map((w) => <WindowRow key={w.index} w={w} onShow={() => ep && showWindow(ep, w.index)} />)
            : <p className="text-gray-500">{status?.running ? '창을 준비하는 중입니다…' : '창이 없습니다. "창 준비"를 누르세요.'}</p>}
        </div>
      </section>

      {/* 3. 연결 확인 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold text-gray-900 mb-1">연결 확인</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          상품 URL 하나로 수집 경로 전체를 점검합니다. 주소를 직접 여는 게 아니라
          <b className="text-gray-700"> 네이버 안에서 링크를 클릭하는 방식</b>으로 들어갑니다.
          캡차가 뜨면 도우미 창이 화면에 나타나므로 직접 풀면 이어집니다.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://smartstore.naver.com/스토어/products/1234567890"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20"
          />
          <button
            onClick={() => ep && url.trim() && run('test', () => testOne(ep, url.trim()))}
            disabled={!!busy || !url.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800"
          >
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 1건 테스트
          </button>
        </div>
        <pre
          ref={logBoxRef}
          className="h-64 overflow-auto rounded-lg bg-gray-900 text-gray-100 text-xs p-3 leading-relaxed whitespace-pre-wrap"
        >
          {logs.length
            ? logs.map((l) => `${new Date(l.at).toLocaleTimeString()}  ${l.message}`).join('\n')
            : '로그가 여기에 표시됩니다.'}
        </pre>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Search className="w-6 h-6 text-[#E31837]" /> 네이버 소싱
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">관리자</span>
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        네이버 카테고리를 훑어 상품을 수집합니다. 수집은 이 PC의 도우미가 실행합니다 —
        서버는 네이버에 차단되기 때문입니다.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <p className={`text-xl font-bold ${danger ? 'text-[#E31837]' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function WindowRow({ w, onShow }: { w: WindowInfo; onShow: () => void }) {
  const captcha = w.status === 'captcha';
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${captcha ? 'bg-amber-500' : w.busy ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      <span className="text-gray-700">
        창 {w.no} · {w.role ? ROLE_LABEL[w.role] ?? w.role : '대기'} · {STATUS_LABEL[w.status] ?? w.status}
        {w.detail ? ` · ${w.detail}` : ''}
      </span>
      {captcha && (
        <button onClick={onShow} className="inline-flex items-center gap-1 text-[#E31837] font-medium hover:underline">
          <ExternalLink className="w-3.5 h-3.5" /> 창 열기
        </button>
      )}
    </div>
  );
}
