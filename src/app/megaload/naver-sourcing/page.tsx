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
  ChevronRight, Home, Download, X,
} from 'lucide-react';
import {
  findHelper, fetchStatus, setWindows, startPool, stopPool, testOne, showWindow,
  fetchCategories, startCollect, stopCollect, fetchCollection,
  type LocalEndpoint, type IngestStatus, type IngestLog, type WindowInfo,
  type NaverCategory, type ProductCard,
} from '@/lib/megaload/naver-ingest-local';
import { triggerLocalUpdate } from '@/lib/megaload/allinone-local';

/**
 * 이 화면이 요구하는 최소 도우미 버전.
 * ⚠️ 기능을 추가할 때마다 **여기를 올려야 한다**. 안 올리면 구버전 도우미에서 그 엔드포인트만
 *   404 가 나고, 화면은 원문("not found")을 그대로 뱉어 사용자가 원인을 알 수 없다(실측).
 *   0.2.89 = /naver-ingest 기본 · 0.2.91 = 카테고리 탐색·목록 수집
 */
const MIN_HELPER_VERSION = '0.2.91';

/** "0.2.9" vs "0.2.10" 을 문자열 비교하면 틀린다 — 숫자 단위로 비교한다. */
function isOlder(version: string, min: string): boolean {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

const ROLE_LABEL: Record<string, string> = { list: '목록 수집', detail: '상세 추출' };
const STATUS_LABEL: Record<string, string> = {
  idle: '대기', warming: '준비 중', navigating: '이동 중',
  working: '작업 중', captcha: '캡차 대기', closed: '닫힘',
};

type Link = 'checking' | 'online' | 'offline' | 'unsupported';

export default function NaverSourcingPage() {
  const [ep, setEp] = useState<LocalEndpoint | null>(null);
  const [helperVersion, setHelperVersion] = useState<string | null>(null);
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

  // ── 카테고리 브라우저 ──
  // 네이버는 전체 트리를 주는 API 가 없어 한 단계씩 들어가며 발견한다. 이미 본 단계는
  // 도우미가 캐시하므로 되돌아갈 때는 네이버 요청이 없다.
  const [path, setPath] = useState<NaverCategory[]>([]);       // 현재까지 내려온 경로
  const [children, setChildren] = useState<NaverCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [target, setTarget] = useState(300);
  const [cards, setCards] = useState<ProductCard[]>([]);
  const [cardQuery, setCardQuery] = useState('');

  const here = path.length ? path[path.length - 1] : null;

  // ── 도우미 발견 ──
  // /health 는 모든 버전에 있으므로 "찾았다"가 곧 "지원한다"는 아니다. 지원 여부는 아래
  // status 폴링이 404/501 로 판정한다. 여기선 버전만 확보해 안내 문구에 쓴다.
  const locate = useCallback(async () => {
    setLink('checking');
    const found = await findHelper();
    setEp(found?.ep ?? null);
    setHelperVersion(found?.version ?? null);
    setLink(found ? 'online' : 'offline');
  }, []);

  useEffect(() => { locate(); }, [locate]);

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

  // ── 카테고리 이동 ──
  const openCategory = useCallback(async (cat: NaverCategory | null, trail: NaverCategory[]) => {
    if (!ep) return;
    setCatLoading(true); setErr(null);
    try {
      const page = await fetchCategories(ep, cat?.id ?? null);
      setPath(trail);
      setChildren(page.children);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCatLoading(false);
    }
  }, [ep]);

  // 도우미가 붙으면 대분류부터 보여준다(대분류는 상수라 네이버 요청 0).
  useEffect(() => {
    if (ep && link === 'online' && !children.length && !path.length) openCategory(null, []);
  }, [ep, link, children.length, path.length, openCategory]);

  // 수집이 끝나면 결과를 가져온다.
  // ★ status 객체 자체를 의존성에 넣으면 2초 폴링마다 새 객체라 매번 결과를 다시 받는다.
  //   변할 때만 반응하도록 원시값(진행 여부·개수)만 본다.
  const collect = status?.collect;
  const collectRunning = collect?.running ?? false;
  const collectCount = collect?.count ?? 0;
  useEffect(() => {
    if (!ep || collectRunning || !collectCount) return;
    fetchCollection(ep).then((c) => { if (c?.items) setCards(c.items); });
  }, [ep, collectRunning, collectCount]);

  // ── 도우미 미연결 / 구버전 ──
  // 버전이 낮으면 status 는 되는데 카테고리 같은 새 엔드포인트만 404 가 난다.
  // 눌러보고 나서 실패를 알려주는 대신, **들어오자마자** 업데이트를 안내한다.
  const outdated = !!helperVersion && isOlder(helperVersion, MIN_HELPER_VERSION);
  const bannerMode: Link = outdated ? 'unsupported' : link;
  if (link !== 'online' || outdated) {
    const link = bannerMode;   // 아래 분기는 이 값으로 판단한다
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
                  : link === 'unsupported'
                    ? `도우미 업데이트가 필요합니다 — 설치본 v${helperVersion || '?'}, 필요 v${MIN_HELPER_VERSION} 이상`
                    : '이 PC에서 도우미를 찾지 못했습니다'}
              </p>
              <p className="text-sm text-amber-800 mt-1 leading-relaxed">
                {link === 'unsupported'
                  ? '도우미는 정상적으로 찾았지만, 설치된 버전에 네이버 소싱 기능이 아직 없습니다. 아래 "지금 업데이트"를 누르면 도우미가 바로 최신 버전을 받습니다(설치 후 자동 재시작). 앱에서 직접 하려면 도우미 사이드바의 "업데이트 확인"을 누르세요.'
                  : '네이버는 서버(데이터센터 IP)의 접근을 차단하기 때문에, 수집은 이 PC에 설치된 도우미의 브라우저로만 할 수 있습니다. 도우미를 실행한 뒤 아래 "다시 찾기"를 눌러 주세요.'}
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={locate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-900 text-sm font-medium hover:bg-amber-100"
                >
                  <RefreshCw className="w-4 h-4" /> 다시 찾기
                </button>
                {link === 'unsupported' && ep ? (
                  <button
                    onClick={async () => {
                      setErr(null);
                      const ok = await triggerLocalUpdate(ep);
                      if (!ok) setErr('업데이트를 시작하지 못했습니다. 도우미 앱에서 "업데이트 확인"을 눌러 주세요.');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230]"
                  >
                    <RefreshCw className="w-4 h-4" /> 지금 업데이트
                  </button>
                ) : (
                  <a
                    href="/megaload/settings?tab=localgpu"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230]"
                  >
                    <MonitorDown className="w-4 h-4" /> 도우미 다운로드
                  </a>
                )}
              </div>
              {err && <p className="text-sm text-red-700 mt-3">{err}</p>}
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

      {/* 2. 카테고리 선택 → 수집 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-gray-900">카테고리 선택</h2>
          {catLoading && <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 네이버에서 하위 분류를 읽는 중…</span>}
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          네이버는 전체 카테고리 목록을 주는 API가 없어 <b className="text-gray-700">한 단계씩 들어가며 발견</b>합니다.
          한 번 본 단계는 저장돼서 되돌아갈 때는 네이버에 다시 묻지 않습니다.
          소분류까지 내려갈수록 더 많이 모을 수 있습니다 — 네이버가 한 카테고리당 약 1,000개에서 막기 때문입니다.
        </p>

        {/* 경로 */}
        <div className="flex items-center gap-1 flex-wrap text-sm mb-3">
          <button
            onClick={() => openCategory(null, [])}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100"
          >
            <Home className="w-3.5 h-3.5" /> 전체
          </button>
          {path.map((c, i) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              <button
                onClick={() => openCategory(c, path.slice(0, i + 1))}
                className={`px-2 py-1 rounded-md ${i === path.length - 1 ? 'font-bold text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>

        {/* 하위 분류 */}
        {children.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => openCategory(c, [...path, c])}
                disabled={catLoading}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#E31837] hover:text-[#E31837] disabled:opacity-40"
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">
            {catLoading ? '' : here ? '하위 분류가 없습니다 — 여기서 바로 수집할 수 있습니다.' : '카테고리를 불러오는 중…'}
          </p>
        )}

        {/* 수집 실행 */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
          {here ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-700">
                  선택: <b className="text-gray-900">{path.map((c) => c.name).join(' > ')}</b>
                </span>
                <span className="text-sm text-gray-500">목표</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                >
                  {[100, 300, 500, 1000].map((n) => <option key={n} value={n}>{n}개</option>)}
                </select>
                <button
                  onClick={() => ep && run('collect', () => startCollect(ep, { catId: here.id, catName: path.map((c) => c.name).join(' > '), target }))}
                  disabled={!!busy || collect?.running}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#c41230]"
                >
                  {collect?.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  이 카테고리 수집
                </button>
                {collect?.running && (
                  <button
                    onClick={() => ep && run('collect-stop', () => stopCollect(ep))}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-white"
                  >
                    <X className="w-4 h-4" /> 중단
                  </button>
                )}
              </div>
              {collect && (collect.running || collect.count > 0) && (
                <p className="text-sm text-gray-600 mt-3">
                  {collect.catName || collect.catId} —{' '}
                  {collect.running
                    ? `수집 중… ${collect.progress?.collected ?? 0}개 (스크롤 ${collect.progress?.scrolls ?? 0}회)`
                    : `${collect.count}개 수집됨${collect.stopped ? ` · ${collect.stopped}` : ''}`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">대분류를 눌러 원하는 카테고리까지 내려가세요.</p>
          )}
        </div>
      </section>

      {/* 3. 수집 결과 */}
      {cards.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="font-bold text-gray-900">수집 결과 <span className="text-gray-400 font-normal">{cards.length.toLocaleString()}개</span></h2>
            <input
              value={cardQuery}
              onChange={(e) => setCardQuery(e.target.value)}
              placeholder="상품명 검색"
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-56"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 w-14"></th>
                  <th className="py-2">상품명</th>
                  <th className="py-2 w-28 text-right">가격</th>
                  <th className="py-2 w-20 text-right">리뷰</th>
                  <th className="py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {cards
                  .filter((c) => !cardQuery || c.title.includes(cardQuery))
                  .slice(0, 200)
                  .map((c) => (
                    <tr key={c.productNo} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2">
                        {c.thumb
                          // 네이버 CDN 이미지 — next/image 최적화를 태우면 서버 트래픽만 늘어 그대로 쓴다.
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.thumb} alt="" className="w-10 h-10 rounded object-cover bg-gray-100" />
                          : <div className="w-10 h-10 rounded bg-gray-100" />}
                      </td>
                      <td className="py-2 pr-3 text-gray-800">{c.title || '(제목 없음)'}</td>
                      <td className="py-2 text-right text-gray-900 font-medium">
                        {c.price ? `${c.price.toLocaleString()}원` : '-'}
                      </td>
                      <td className="py-2 text-right text-gray-500">{c.reviewCount ? c.reviewCount.toLocaleString() : '-'}</td>
                      <td className="py-2 text-right">
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#E31837]">
                          <ExternalLink className="w-4 h-4 inline" />
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {cards.length > 200 && (
            <p className="text-xs text-gray-400 mt-3">표에는 200개까지만 표시합니다(검색으로 좁힐 수 있습니다). 수집된 전체는 {cards.length.toLocaleString()}개입니다.</p>
          )}
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            여기까지는 <b>목록에서 긁은 정보</b>입니다(제목·가격·썸네일·리뷰수). 옵션·상세·고시정보처럼
            등록에 필요한 나머지는 상품 페이지를 하나씩 열어야 하고 1건당 30~90초가 걸립니다 —
            그래서 <b>고른 것만 깊게</b> 가져오는 단계를 다음에 붙입니다.
          </p>
        </section>
      )}

      {/* 4. 상태 */}
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

      {/* 5. 연결 확인 */}
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
