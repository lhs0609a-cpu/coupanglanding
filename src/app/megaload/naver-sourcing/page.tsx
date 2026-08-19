'use client';

/**
 * 네이버 소싱 — 관리자 조종석.
 *
 * 수집은 서버가 못 한다(네이버가 datacenter IP 를 차단). 실제로 페이지를 여는 건 이 PC 의
 * 도우미(Electron 내장 크롬)이고, 이 화면은 그걸 조종·관측하는 곳이다.
 * 그래서 "도우미 미연결" 상태에서는 아무것도 할 수 없고, 그 사실을 첫 화면에 명확히 띄운다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Play, Square, MonitorDown, AlertTriangle, RefreshCw, Loader2, ExternalLink,
  ChevronRight, ChevronDown, Download, X, Stethoscope, LogIn,
} from 'lucide-react';
import {
  findHelper, fetchStatus, setWindows, startPool, stopPool, testOne, showWindow,
  fetchCategories, startPrewarm, stopPrewarm, startCollect, stopCollect, fetchCollection, probePage,
  naverLogin, naverLogout, saveNaverCredential, clearNaverCredential, autoNaverLogin,
  startDetailExtract, stopDetailExtract,
  type LocalEndpoint, type IngestStatus, type IngestLog, type WindowInfo,
  type NaverCategory, type ProductCard,
} from '@/lib/megaload/naver-ingest-local';
import { triggerLocalUpdate } from '@/lib/megaload/allinone-local';
import SourcingPreviewModal from '@/components/megaload/SourcingPreviewModal';

/**
 * 이 화면이 요구하는 최소 도우미 버전.
 * ⚠️ 기능을 추가할 때마다 **여기를 올려야 한다**. 안 올리면 구버전 도우미에서 그 엔드포인트만
 *   404 가 나고, 화면은 원문("not found")을 그대로 뱉어 사용자가 원인을 알 수 없다(실측).
 *   0.2.89 = /naver-ingest 기본 · 0.2.91 = 카테고리 탐색·목록 수집
 *   0.2.92 = 카테고리 트리(하위 분류만 정확히 골라냄 + 발견한 트리 전체 반환)
 *   0.2.93 = 카테고리 트리 미리 읽기(prewarm) — 클릭할 때 읽지 않는다
 *   0.2.94 = 카테고리 스냅샷 동봉(대분류·중분류는 설치 직후부터 요청 0으로 즉시)
 *   0.2.95 = 늦게 그려지는 하위 분류 사이드바 대기 + 전체 일괄 수집(앱 재시작해도 이어함)
 *   0.2.96 = 페이지 진단(수집 0건일 때 실제 DOM 구조를 파일로)
 *   0.2.97 = 목록 페이지 경로 교정(search.shopping) + 네이버 로그인 창
 *   0.2.98 = 네이버 자동 로그인(계정을 OS 암호저장소에 보관, 세션 끊기면 스스로 복구)
 *   0.3.2  = 상세 추출(옵션·상세·고시정보·이미지 → 올인원 폴더) + 세션 자가복구
 *   0.3.3  = 쿠키 즉시 디스크 기록(강제 종료로 로그인이 날아가지 않게)
 */
const MIN_HELPER_VERSION = '0.3.3';

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

/**
 * 카테고리 트리 표시용 사본(브라우저).
 * 원본은 도우미가 디스크에 들고 있지만, 화면을 다시 열 때마다 "불러오는 중"을 보여 주지 않으려면
 * 첫 렌더에 이미 트리가 있어야 한다. 그래서 받은 트리를 그대로 남겨 두고 다음에 즉시 그린다.
 */
const TREE_CACHE_KEY = 'megaload.naverCategoryTree.v1';

function readTreeCache(): Record<string, NaverCategory[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TREE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, NaverCategory[]>) : {};
  } catch { return {}; }
}

function writeTreeCache(tree: Record<string, NaverCategory[]>) {
  try { window.localStorage.setItem(TREE_CACHE_KEY, JSON.stringify(tree)); }
  catch { /* 용량 초과 등 — 표시용 사본이라 실패해도 동작에 지장 없다 */ }
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

  // ── 카테고리 트리 ──
  // 네이버는 전체 트리를 주는 API 가 없어 한 단계씩 들어가며 발견한다. 다만 대분류를 한 번만
  // 열면 도우미가 25개 대분류의 중분류를 통째로 복원해 주므로(map), 그 뒤로는 클릭만으로 펼쳐진다.
  // 이미 본 단계는 도우미가 캐시하므로 되돌아갈 때는 네이버 요청이 없다.
  // 화면을 다시 열 때 도우미 응답을 기다리며 빈 트리를 보여 주지 않으려고 브라우저에도 남긴다
  // (도우미 캐시가 원본이고 이건 표시용 사본이다 — 응답이 오면 그걸로 덮는다).
  const [tree, setTree] = useState<Record<string, NaverCategory[]>>({});  // 부모id → 자식들 ('' = 대분류)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<NaverCategory[]>([]);   // 선택한 카테고리의 경로
  const [catQuery, setCatQuery] = useState('');
  const [target, setTarget] = useState(300);
  const [cards, setCards] = useState<ProductCard[]>([]);
  const [cardQuery, setCardQuery] = useState('');
  // 네이버 자동 로그인 입력 — 저장 요청을 보낸 뒤 즉시 비운다(화면에도 남기지 않는다).
  const [naverId, setNaverId] = useState('');
  const [naverPw, setNaverPw] = useState('');
  // 상세 추출 — 목록에서 고른 것만 깊게 가져온다(건당 30~90초라 전량은 비현실적이다).
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(() => new Set());
  const [outDir, setOutDir] = useState('');
  // 서버 저장 결과 — "긁긴 했는데 어디 갔지"를 없애려고 화면에 명시한다.
  const [savedInfo, setSavedInfo] = useState<{ ok: boolean; count?: number; error?: string } | null>(null);
  // ── 대량 소싱용 목록 조작 ────────────────────────────────────────────
  // 수집은 1,000개까지 나온다. "한 화면에 최대한 많이 + 고르기 쉽게"가 이 화면의 일이다.
  //   보기   격자(기본) = 한 화면에 수십 개. 표 = 숫자 비교가 필요할 때.
  //   정렬   리뷰 많은 순이 소싱의 기본 판단축이라 기본값으로 둔다.
  //   표시량 전량을 한 번에 그리면 썸네일 수백 장이 동시에 떠서 화면이 멎는다 → 점진 표시.
  // 수집 → 상세 → 올인원을 버튼 한 번으로. 전량은 58개면 30~90분이라 개수를 고를 수 있게 둔다.
  const [autoDetail, setAutoDetail] = useState(false);
  const [autoDetailLimit, setAutoDetailLimit] = useState(10);
  /** 미리보기 모달 — 카드를 누르면 이 상품의 상세를 띄운다. */
  const [previewNo, setPreviewNo] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'review' | 'priceAsc' | 'priceDesc' | 'none'>('review');
  const [minReview, setMinReview] = useState(0);
  const [limit, setLimit] = useState(300);

  const here = picked.length ? picked[picked.length - 1] : null;

  /** 검색·필터·정렬을 통과한 전체(표시 개수 제한 전) — 일괄 선택은 이 기준으로 동작한다. */
  const filteredCards = useMemo(() => {
    const q = cardQuery.trim();
    const out = cards.filter((c) => (!q || c.title.includes(q)) && (c.reviewCount || 0) >= minReview);
    if (sortBy === 'review') out.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    else if (sortBy === 'priceAsc') out.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    else if (sortBy === 'priceDesc') out.sort((a, b) => (b.price || 0) - (a.price || 0));
    return out;
  }, [cards, cardQuery, minReview, sortBy]);

  // 화면에 실제로 그리는 목록 — 전체선택 체크박스와 행이 같은 기준을 봐야 어긋나지 않는다.
  const shownCards = useMemo(() => filteredCards.slice(0, limit), [filteredCards, limit]);
  const detail = status?.detail;

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

  // ── 카테고리 트리 ──
  // 한 노드를 펼칠 때만 그 노드의 자식을 읽는다(캐시에 있으면 네이버 요청 0).
  // 응답의 map 에는 도우미가 지금까지 발견한 가지가 전부 들어 있어 그대로 트리에 합친다.
  const loadChildren = useCallback(async (id: string | null, force = false) => {
    if (!ep) return;
    // 대분류(id=null)는 상수라 네트워크가 없다 — 스피너를 띄우지 않는다.
    if (id) { setLoadingId(id); setErr(null); }
    try {
      const page = await fetchCategories(ep, id, force);
      setTree((prev) => ({ ...prev, ...(page.map ?? {}), [id ?? '']: page.children }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (id) setLoadingId(null);
    }
  }, [ep]);

  const hasRoots = !!tree[''];

  // 지난번에 본 트리를 먼저 깔아 첫 화면부터 채워진 상태로 시작한다(서버 렌더와 어긋나지
  // 않도록 렌더가 아니라 마운트 뒤에 읽는다). 도우미 응답이 오면 그걸로 덮인다.
  useEffect(() => {
    const cached = readTreeCache();
    if (Object.keys(cached).length) setTree((prev) => ({ ...cached, ...prev }));
  }, []);

  // 받은 트리는 그대로 남겨 둔다 — 다음에 이 화면을 열면 기다림 없이 바로 그려진다.
  useEffect(() => { if (hasRoots) writeTreeCache(tree); }, [tree, hasRoots]);

  // 도우미가 붙으면 대분류부터 보여준다(대분류는 상수라 네이버 요청 0).
  useEffect(() => {
    if (ep && link === 'online' && !hasRoots) loadChildren(null);
  }, [ep, link, hasRoots, loadChildren]);

  // ── 미리 읽기 ──
  // 고를 때마다 몇 초씩 기다리는 건 잘못된 설계다. 트리는 정적이므로 처음 들어온 순간
  // 도우미가 통째로 읽기 시작하고, 화면은 채워지는 걸 보여 준다.
  const prewarm = status?.prewarm;
  const prewarming = prewarm?.running ?? false;
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!ep || link !== 'online' || !status?.isAdmin) return;
    if (!prewarm || prewarm.running || prewarm.completedAt || autoStarted.current) return;
    autoStarted.current = true;
    startPrewarm(ep, 3).catch(() => { /* 실패는 로그로 흘러간다 */ });
  }, [ep, link, status?.isAdmin, prewarm]);

  // 읽는 동안 트리가 자라는 걸 보여 준다(도우미 로컬 조회라 네이버 요청 0).
  useEffect(() => {
    if (!ep || !prewarming) return;
    const t = setInterval(() => { loadChildren(null); }, 8000);
    return () => clearInterval(t);
  }, [ep, prewarming, loadChildren]);

  // 끝나는 순간 한 번 더 — 마지막에 채워진 가지까지 화면에 반영한다.
  useEffect(() => { if (ep && !prewarming) loadChildren(null); }, [ep, prewarming, loadChildren]);

  const toggleNode = useCallback((c: NaverCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
      return next;
    });
    if (!tree[c.id]) loadChildren(c.id);
  }, [tree, loadChildren]);

  // 이름을 누르면 "선택"이면서 동시에 펼친다 — 고르는 동작과 더 내려가는 동작이 같기 때문이다.
  const pick = useCallback((trail: NaverCategory[]) => {
    setPicked(trail);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const c of trail) next.add(c.id);
      return next;
    });
    const leaf = trail[trail.length - 1];
    if (leaf && !tree[leaf.id]) loadChildren(leaf.id);
  }, [tree, loadChildren]);

  // ── 이름으로 찾기 ──
  // 트리가 깊어지면 눈으로 훑는 게 더 느리다. 이미 발견한 가지 안에서만 찾는다(네이버 요청 0).
  const index = useMemo(() => {
    const parent: Record<string, string> = {};
    const name: Record<string, string> = {};
    for (const [pid, kids] of Object.entries(tree)) {
      for (const k of kids) { parent[k.id] = pid; name[k.id] = k.name; }
    }
    return { parent, name };
  }, [tree]);

  const pathOf = useCallback((id: string): NaverCategory[] => {
    const out: NaverCategory[] = [];
    const guard = new Set<string>();
    let cur: string | undefined = id;
    while (cur && index.name[cur] && !guard.has(cur)) {
      guard.add(cur);
      out.unshift({ id: cur, name: index.name[cur] });
      cur = index.parent[cur] || undefined;
    }
    return out;
  }, [index]);

  const matches = useMemo(() => {
    const q = catQuery.trim();
    if (!q) return [];
    const seen = new Set<string>();
    const out: NaverCategory[][] = [];
    for (const kids of Object.values(tree)) {
      for (const k of kids) {
        if (seen.has(k.id) || !k.name.includes(q)) continue;
        seen.add(k.id);
        out.push(pathOf(k.id));
        if (out.length >= 50) return out;
      }
    }
    return out;
  }, [catQuery, tree, pathOf]);

  // 수집이 끝나면 결과를 가져온다.
  // ★ status 객체 자체를 의존성에 넣으면 2초 폴링마다 새 객체라 매번 결과를 다시 받는다.
  //   변할 때만 반응하도록 원시값(진행 여부·개수)만 본다.
  const collect = status?.collect;
  const collectRunning = collect?.running ?? false;
  const collectCount = collect?.count ?? 0;
  useEffect(() => {
    if (!ep || collectRunning || !collectCount) return;
    fetchCollection(ep).then(async (c) => {
      if (!c?.items?.length) return;
      setCards(c.items);
      // ★ 받자마자 서버에 올린다. 예전엔 결과가 **도우미 메모리에만** 있어서 앱을 껐다 켜면
      //   통째로 사라졌고, 도우미가 켜진 그 PC 에서만 보였다(관리자도 다른 자리에서 못 봄).
      //   수집은 네이버 예산을 태우는 비싼 작업이라 휘발시키면 같은 걸 계속 다시 긁게 된다.
      //   실패해도 화면은 그대로 둔다 — 저장이 안 됐다고 방금 긁은 목록까지 잃을 이유는 없다.
      try {
        const res = await fetch('/api/megaload/naver-sourcing/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: c.items, categoryPath: c.catName || '' }),
        });
        const j = await res.json().catch(() => ({}));
        setSavedInfo(res.ok
          ? { ok: true, count: j.saved ?? c.items.length }
          : { ok: false, error: j.error || `HTTP ${res.status}` });
      } catch (e) {
        setSavedInfo({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
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
  const loggedIntoNaver = !!status?.naverLogin?.loggedIn;

  return (
    <div className="p-6 max-w-5xl">
      <Header />

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* 0. 네이버 로그인 — 나머지 전부의 전제 조건이라 맨 위에 둔다.
           로그인 없이는 목록 페이지가 로그인 화면으로 튕겨서 무엇을 눌러도 0건이다(실측). */}
      {status?.naverLogin && (
        loggedIntoNaver ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-emerald-900 inline-flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                네이버에 로그인돼 있습니다 — 목록 수집이 가능합니다.
                {status.naverLogin.credential?.has && (
                  <span className="text-emerald-700">· 자동 로그인 켜짐({status.naverLogin.credential.idMasked})</span>
                )}
              </p>
              <div className="flex gap-2">
                {status.naverLogin.credential?.has && (
                  <button
                    onClick={() => ep && run('cred-clear', () => clearNaverCredential(ep))}
                    className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-sm text-emerald-800 hover:bg-emerald-50"
                  >
                    저장된 계정 지우기
                  </button>
                )}
                <button
                  onClick={() => ep && run('naver-logout', () => naverLogout(ep))}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-sm text-emerald-800 hover:bg-emerald-50"
                >
                  로그아웃(계정 바꾸기)
                </button>
              </div>
            </div>
            {/* 세션 쿠키 경고 — 로그인은 됐는데 앱을 끄면 풀리는 상태. 원인을 여기서 말해야
                "왜 자꾸 로그인이 풀리냐"가 반복되지 않는다. */}
            {status.naverLogin.persistent === false && !status.naverLogin.credential?.has && (
              <p className="text-xs text-emerald-800 mt-2 leading-relaxed">
                ⚠️ 이 로그인은 <b>세션 쿠키</b>라 도우미를 껐다 켜면 풀립니다. 아래처럼 계정을 저장해 두면
                끊겨도 도우미가 알아서 다시 로그인합니다.
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
            <p className="font-bold text-amber-900 inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> 네이버 로그인이 필요합니다
            </p>
            <p className="text-sm text-amber-900 mt-1.5 leading-relaxed">
              상품 목록 페이지(<code className="text-xs">search.shopping.naver.com</code>)는 <b>로그인 없이 열리지 않습니다</b> —
              로그인 화면으로 넘어가기 때문에 수집이 항상 0건이 됩니다.
              <br />
              <span className="text-amber-800">
                ※ 이 계정으로 자동 수집이 돌아갑니다. 판매용 본계정 대신 <b>부계정</b>을 권합니다.
              </span>
            </p>

            {/* 자동 로그인 — 계정을 이 PC 에 한 번 넣어 두면 세션이 끊겨도 스스로 복구한다.
                비밀번호는 도우미(127.0.0.1)로만 가고 OS 암호저장소에 암호화돼 들어간다. */}
            {status.naverLogin.credential?.has ? (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-amber-900">
                  저장된 계정: <b>{status.naverLogin.credential.idMasked}</b>
                </span>
                <button
                  onClick={() => ep && run('naver-auto', () => autoNaverLogin(ep))}
                  disabled={busy === 'naver-auto' || status.naverLogin.auto?.running}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230] disabled:opacity-50"
                >
                  {busy === 'naver-auto' || status.naverLogin.auto?.running
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <LogIn className="w-4 h-4" />}
                  지금 자동 로그인
                </button>
                <button
                  onClick={() => ep && run('cred-clear', () => clearNaverCredential(ep))}
                  className="px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm text-amber-900 hover:bg-amber-100"
                >
                  저장된 계정 지우기
                </button>
              </div>
            ) : (
              <form
                className="mt-3 flex items-end gap-2 flex-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!ep) return;
                  const id = naverId;
                  const pw = naverPw;
                  setNaverPw('');           // 화면에 남기지 않는다
                  run('cred-save', () => saveNaverCredential(ep, id, pw));
                }}
              >
                <label className="text-xs text-amber-900">
                  네이버 아이디
                  <input
                    value={naverId}
                    onChange={(e) => setNaverId(e.target.value)}
                    autoComplete="off"
                    className="block mt-1 px-3 py-2 rounded-lg border border-amber-300 text-sm w-52 bg-white"
                  />
                </label>
                <label className="text-xs text-amber-900">
                  비밀번호
                  <input
                    type="password"
                    value={naverPw}
                    onChange={(e) => setNaverPw(e.target.value)}
                    autoComplete="off"
                    className="block mt-1 px-3 py-2 rounded-lg border border-amber-300 text-sm w-52 bg-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!naverId || !naverPw || busy === 'cred-save' || status.naverLogin.auto?.running}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230] disabled:opacity-50"
                >
                  {busy === 'cred-save' || status.naverLogin.auto?.running
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <LogIn className="w-4 h-4" />}
                  저장하고 자동 로그인
                </button>
                <button
                  type="button"
                  onClick={() => ep && run('naver-login', () => naverLogin(ep))}
                  disabled={busy === 'naver-login' || status.naverLogin.waiting}
                  className="px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  {status.naverLogin.waiting ? '창에서 로그인해 주세요…' : '창에서 직접 로그인'}
                </button>
              </form>
            )}
            <p className="text-xs text-amber-800 mt-2 leading-relaxed">
              비밀번호는 <b>이 PC 의 도우미에만</b> 저장됩니다 — 우리 서버로 나가지 않고, Windows 암호저장소(DPAPI)로
              암호화돼 들어가며 다시 읽어가는 경로는 없습니다. 캡차나 2단계 인증이 뜨면 도우미 창을 띄워 사장님께 넘깁니다.
              비밀번호가 틀리면 <b>재시도하지 않고</b> 저장을 지웁니다(계정 잠금 방지).
            </p>
          </div>
        )
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
        <div className="flex items-center justify-between mb-1 gap-3">
          <h2 className="font-bold text-gray-900">카테고리 선택</h2>
          <div className="flex items-center gap-3">
            {loadingId !== null && (
              <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 네이버에서 하위 분류를 읽는 중…
              </span>
            )}
            <button
              onClick={() => loadChildren(here?.id ?? null, true)}
              disabled={loadingId !== null}
              title="이 목록을 네이버에서 다시 읽습니다"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 다시 읽기
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-3">
          <b className="text-gray-700">▸ 를 눌러 펼치고, 이름을 눌러 고릅니다.</b> 대분류·중분류는 <b className="text-gray-700">앱에 들어 있어
          기다림 없이</b> 뜨고, 그 아래는 도우미가 미리 읽어 저장해 둡니다(한 번 읽으면 계속 즉시).
          소분류까지 내려갈수록 더 많이 모을 수 있습니다 — 네이버가 한 카테고리당 약 1,000개에서 막기 때문입니다.
        </p>

        {/* 미리 읽기 진행 */}
        {prewarm && (prewarm.running ? (
          <div className="mb-3 rounded-lg border border-[#E31837]/20 bg-[#E31837]/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-800 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#E31837]" />
                {prewarm.depth >= 6 ? '전체 카테고리를 수집하는 중' : '카테고리를 미리 읽는 중'} — 읽은 페이지{' '}
                <b>{prewarm.read.toLocaleString()}</b>장 · 남은 <b>{prewarm.pending.toLocaleString()}</b>개
                {prewarm.current ? <span className="text-gray-500">· {prewarm.current}</span> : null}
              </p>
              <button
                onClick={() => ep && stopPrewarm(ep).catch(() => {})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
              >
                <X className="w-4 h-4" /> 정지
              </button>
            </div>
            <div className="h-1.5 rounded-full bg-white/70 overflow-hidden my-2">
              <div
                className="h-full bg-[#E31837] transition-all"
                style={{ width: `${Math.round((prewarm.read / Math.max(1, prewarm.read + prewarm.pending)) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              네이버 차단을 피하려고 요청 간 3~7초를 지킵니다(품절 모니터와 예산을 나눠 씁니다) —
              남은 시간 약 <b>{Math.max(1, Math.round((prewarm.pending * 5.5) / 60))}분</b>
              {prewarm.depth >= 6 ? ' (내려가면서 더 늘어납니다)' : ''}.
              이 화면을 닫아도, <b>앱을 껐다 켜도</b> 이어서 읽습니다. 지금까지 읽은 가지는 이미 저장돼 있습니다.
            </p>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm text-gray-800">
                {prewarm.completedAt ? (
                  <>
                    카테고리 <b>{prewarm.nodes.toLocaleString()}개</b>를 읽어 뒀습니다 — 펼치기는 즉시 됩니다.
                    {prewarm.failed > 0 ? ` (읽지 못한 ${prewarm.failed}건은 펼칠 때 다시 시도합니다)` : ''}
                  </>
                ) : (
                  <>
                    대분류·중분류는 앱에 들어 있어 바로 뜹니다. <b>그 아래 전부</b>를 한 번에 읽어 두면 다시는 기다리지 않습니다.
                    {prewarm.stopped ? ` (지난 실행: ${prewarm.stopped})` : ''}
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                요청 간 3~7초를 지켜야 해서 소분류까지 20~40분, 끝까지는 몇 시간입니다.
                한 번 눌러 두면 <b>앱을 껐다 켜도 알아서 이어서</b> 하고, 언제든 멈출 수 있습니다.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  // 끝까지 = 페이지 수천 장, 몇 시간짜리다 — 누른 사람이 그걸 알고 눌러야 한다.
                  if (!ep || !window.confirm('말단 분류까지 전부 수집합니다. 페이지 수천 장이라 몇 시간 걸리고, 그동안 네이버 요청 예산을 품절 모니터와 나눠 씁니다.\n\n앱을 껐다 켜도 이어서 하고, 언제든 정지할 수 있습니다. 시작할까요?')) return;
                  startPrewarm(ep, 8).catch(() => {});
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230]"
              >
                <Download className="w-4 h-4" /> 전체 카테고리 한 번에 수집
              </button>
              {!prewarm.completedAt && (
                <button
                  onClick={() => ep && startPrewarm(ep, 3).catch(() => {})}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-100"
                >
                  소분류까지만
                </button>
              )}
            </div>
          </div>
        ))}

        <input
          value={catQuery}
          onChange={(e) => setCatQuery(e.target.value)}
          placeholder="이름으로 찾기 (이미 펼쳐 본 분류 안에서)"
          className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20"
        />

        <div className="rounded-lg border border-gray-100 max-h-[26rem] overflow-auto p-2 mb-4">
          {catQuery.trim() ? (
            matches.length ? (
              <ul>
                {matches.map((trail) => (
                  <li key={trail[trail.length - 1].id}>
                    <button
                      onClick={() => { pick(trail); setCatQuery(''); }}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-50 text-sm"
                    >
                      <span className="text-gray-900 font-medium">{trail[trail.length - 1].name}</span>
                      {trail.length > 1 && (
                        <span className="text-gray-400 ml-2 text-xs">{trail.slice(0, -1).map((c) => c.name).join(' > ')}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 px-2 py-3">
                펼쳐 본 분류 중에는 없습니다 — 트리에서 한 단계 더 펼치면 찾기 대상에 들어옵니다.
              </p>
            )
          ) : tree[''] ? (
            <CategoryTree
              nodes={tree['']}
              trail={[]}
              tree={tree}
              expanded={expanded}
              loadingId={loadingId}
              pickedId={here?.id ?? null}
              onToggle={toggleNode}
              onPick={pick}
            />
          ) : (
            <p className="text-sm text-gray-400 px-2 py-3">카테고리를 불러오는 중…</p>
          )}
        </div>

        {/* 수집 실행 */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
          {here ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-700">
                  선택: <b className="text-gray-900">{picked.map((c) => c.name).join(' > ')}</b>
                </span>
                <span className="text-sm text-gray-500">목표</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                >
                  {[100, 300, 500, 1000].map((n) => <option key={n} value={n}>{n}개</option>)}
                </select>
                {/* 한 번에 — 수집만 하면 사람이 다시 골라 버튼을 또 눌러야 한다.
                    켜 두면 수집 → 상세 → 올인원(상세페이지 생성)까지 버튼 한 번으로 이어진다. */}
                <label className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={autoDetail} onChange={(e) => setAutoDetail(e.target.checked)} />
                  상세까지 한 번에
                </label>
                {autoDetail && (
                  <select
                    value={autoDetailLimit}
                    onChange={(e) => setAutoDetailLimit(Number(e.target.value))}
                    className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                    title="상품 1건에 페이지를 한 장 열어야 해서 건당 30~90초가 걸립니다"
                  >
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>리뷰 상위 {n}개</option>)}
                    <option value={0}>수집된 전부</option>
                  </select>
                )}
                <button
                  onClick={() => ep && run('collect', () => startCollect(ep, {
                    catId: here.id,
                    catName: picked.map((c) => c.name).join(' > '),
                    target,
                    autoDetail,
                    autoDetailLimit: autoDetail ? autoDetailLimit : 0,
                  }))}
                  disabled={!!busy || collect?.running || !loggedIntoNaver}
                  title={loggedIntoNaver ? undefined : '네이버 로그인이 먼저 필요합니다'}
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
                {/* 0건이거나 이상한 게 잡힐 때 — 추측 대신 실제 페이지 구조를 떠 온다(페이지 1장). */}
                <button
                  onClick={() => ep && run('probe', () => probePage(ep, here.id))}
                  disabled={!!busy || collect?.running}
                  title="이 카테고리 페이지가 실제로 어떻게 생겼는지 파일로 남깁니다"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-white"
                >
                  {busy === 'probe' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
                  페이지 진단
                </button>
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
            <p className="text-sm text-gray-500">위 트리에서 수집할 카테고리를 고르세요.</p>
          )}
        </div>
      </section>

      {/* 3. 수집 결과 */}
      {cards.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="font-bold text-gray-900">
              수집 결과{' '}
              <span className="text-gray-400 font-normal">
                {filteredCards.length.toLocaleString()}개
                {filteredCards.length !== cards.length && ` / 전체 ${cards.length.toLocaleString()}`}
              </span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={cardQuery}
                onChange={(e) => setCardQuery(e.target.value)}
                placeholder="상품명 검색"
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-48"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="review">리뷰 많은 순</option>
                <option value="priceAsc">가격 낮은 순</option>
                <option value="priceDesc">가격 높은 순</option>
                <option value="none">수집 순서</option>
              </select>
              <select
                value={minReview}
                onChange={(e) => setMinReview(Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
                title="리뷰가 적은 상품은 잘 안 팔리는 상품일 확률이 높습니다"
              >
                <option value={0}>리뷰 전체</option>
                <option value={10}>10개 이상</option>
                <option value={100}>100개 이상</option>
                <option value={1000}>1,000개 이상</option>
              </select>
              {/* 격자/표 — 격자는 한 화면에 수십 개가 들어와 훑기 좋고, 표는 숫자 비교에 좋다. */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['grid', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-sm ${view === v ? 'bg-[#E31837] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {v === 'grid' ? '격자' : '표'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 일괄 선택 — 대량등록은 한 개씩 누르는 화면으로는 성립하지 않는다. */}
          <div className="flex items-center gap-2 flex-wrap mb-3 text-sm">
            <button
              onClick={() => setPickedProducts(new Set(filteredCards.map((c) => c.productNo)))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            >
              조건에 맞는 {filteredCards.length.toLocaleString()}개 전체 선택
            </button>
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setPickedProducts(new Set(filteredCards.slice(0, n).map((c) => c.productNo)))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                disabled={filteredCards.length < 1}
              >
                상위 {n}개
              </button>
            ))}
            {!!pickedProducts.size && (
              <button
                onClick={() => setPickedProducts(new Set())}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              >
                선택 해제
              </button>
            )}
            <span className="text-gray-500 ml-auto">
              선택 <b className="text-gray-900">{pickedProducts.size.toLocaleString()}</b>개
              {pickedProducts.size > 0 && (
                <span className="text-gray-400">
                  {' '}· 예상 {Math.round((pickedProducts.size * 60) / 60)}분~{Math.round((pickedProducts.size * 90) / 60)}분
                </span>
              )}
            </span>
          </div>
          {/* 격자 보기 — 카드를 눌러 선택한다. 체크박스만 누르게 하면 대량 선택이 고통스럽다. */}
          {view === 'grid' && (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {shownCards.map((c) => {
                const on = pickedProducts.has(c.productNo);
                return (
                  <button
                    key={c.productNo}
                    type="button"
                    // 카드 = 미리보기(등록해도 되는 물건인지 본다), 왼쪽 체크 = 선택.
                    onClick={() => setPreviewNo(c.productNo)}
                    className={`relative text-left rounded-lg border p-2 transition-colors ${
                      on ? 'border-[#E31837] bg-[#E31837]/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <span
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${c.title} 선택`}
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();          // 선택은 미리보기를 열지 않는다
                        setPickedProducts((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.productNo)) next.delete(c.productNo); else next.add(c.productNo);
                          return next;
                        });
                      }}
                      className={`absolute top-3 left-3 w-6 h-6 rounded border flex items-center justify-center text-xs font-bold cursor-pointer ${
                        on ? 'bg-[#E31837] border-[#E31837] text-white' : 'bg-white/90 border-gray-300 text-transparent hover:border-gray-500'}`}
                    >
                      ✓
                    </span>
                    {c.thumb
                      // 네이버 CDN 이미지 — next/image 최적화를 태우면 서버 트래픽만 늘어 그대로 쓴다.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.thumb} alt="" loading="lazy" className="w-full aspect-square rounded object-cover bg-gray-100" />
                      : <div className="w-full aspect-square rounded bg-gray-100" />}
                    <p className="mt-1.5 text-xs text-gray-800 leading-snug line-clamp-2 h-8">{c.title || '(제목 없음)'}</p>
                    <div className="mt-1 flex items-baseline justify-between gap-1">
                      <span className="text-sm font-bold text-gray-900">{c.price ? `${c.price.toLocaleString()}원` : '-'}</span>
                      <span className="text-[11px] text-gray-500">리뷰 {c.reviewCount ? c.reviewCount.toLocaleString() : 0}</span>
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 p-1 rounded bg-white/90 text-gray-400 hover:text-[#E31837]"
                      aria-label="네이버에서 열기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </button>
                );
              })}
            </div>
          )}

          {view === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 w-10">
                    <input
                      type="checkbox"
                      aria-label="화면에 보이는 상품 전체 선택"
                      checked={shownCards.length > 0 && shownCards.every((c) => pickedProducts.has(c.productNo))}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setPickedProducts((prev) => {
                          const next = new Set(prev);
                          for (const c of shownCards) { if (on) next.add(c.productNo); else next.delete(c.productNo); }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="py-2 w-14"></th>
                  <th className="py-2">상품명</th>
                  <th className="py-2 w-28 text-right">가격</th>
                  <th className="py-2 w-20 text-right">리뷰</th>
                  <th className="py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {shownCards.map((c) => (
                    <tr key={c.productNo} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          aria-label={`${c.title} 선택`}
                          checked={pickedProducts.has(c.productNo)}
                          onChange={(e) => setPickedProducts((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.productNo); else next.delete(c.productNo);
                            return next;
                          })}
                        />
                      </td>
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
          )}

          {/* 더 보기 — 전량을 한 번에 그리면 썸네일 수백 장이 동시에 떠서 화면이 멎는다.
              "안 보이는 것"과 "없는 것"을 구분해 말한다 — 선택은 화면 표시량과 무관하게
              조건에 맞는 전체를 대상으로 할 수 있다(위의 일괄 선택 버튼). */}
          {filteredCards.length > shownCards.length && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setLimit((n) => n + 300)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
              >
                300개 더 보기
              </button>
              <button
                onClick={() => setLimit(filteredCards.length)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
              >
                전체 {filteredCards.length.toLocaleString()}개 표시
              </button>
              <span className="text-xs text-gray-400">
                지금 {shownCards.length.toLocaleString()}개 표시 중 — 선택 버튼은 안 보이는 것까지 포함합니다.
              </span>
            </div>
          )}
          {/* 상세 추출 — 여기가 올인원으로 넘어가는 지점이다.
              목록은 넓게 훑고, 등록에 필요한 옵션·상세·고시정보는 고른 것만 깊게 가져온다. */}
          {/* 목록이 길어지면 이 패널이 화면 밖으로 밀린다 — 고른 뒤 버튼을 찾아 한참 스크롤하게
              된다. 선택이 있는 동안에는 아래에 붙여 둔다. */}
          <div className={`mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 ${
            pickedProducts.size ? 'sticky bottom-4 z-10 shadow-lg bg-white/95 backdrop-blur' : ''}`}
          >
            <p className="text-sm text-gray-700 leading-relaxed">
              위 목록은 <b>목록에서 긁은 정보</b>입니다(제목·가격·썸네일·리뷰수). 등록에 필요한
              <b> 옵션·상세페이지·고시정보·이미지</b>는 상품 페이지를 하나씩 열어야 나옵니다 —
              <b> 1건당 30~90초</b>가 걸리므로 전량이 아니라 <b>고른 것만</b> 가져옵니다.
              받아 온 결과는 올인원이 그대로 읽는 폴더로 저장돼, 이어서 대표컷 선정·상세페이지
              생성까지 진행할 수 있습니다.
            </p>
            <div className="mt-3 flex items-end gap-2 flex-wrap">
              <label className="text-xs text-gray-600">
                저장 폴더 <span className="text-gray-400">(비우면 도우미 기본 폴더)</span>
                <input
                  value={outDir}
                  onChange={(e) => setOutDir(e.target.value)}
                  placeholder="예: D:\소싱\과일"
                  className="block mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm w-72 bg-white"
                />
              </label>
              <button
                onClick={() => {
                  if (!ep) return;
                  const urls = cards.filter((c) => pickedProducts.has(c.productNo)).map((c) => c.url);
                  run('detail', () => startDetailExtract(ep, urls, outDir.trim() || undefined));
                }}
                disabled={!ep || !pickedProducts.size || !!busy || detail?.running}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230] disabled:opacity-40"
              >
                {busy === 'detail' || detail?.running
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />}
                선택한 {pickedProducts.size.toLocaleString()}개 상세 가져오기
              </button>
              {detail?.running && (
                <button
                  onClick={() => ep && run('detail-stop', () => stopDetailExtract(ep))}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
                >
                  중단
                </button>
              )}
              {!!pickedProducts.size && (
                <button
                  onClick={() => setPickedProducts(new Set())}
                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:bg-gray-50"
                >
                  선택 해제
                </button>
              )}
            </div>
            {!!pickedProducts.size && !detail?.running && (
              <p className="text-xs text-gray-500 mt-2">
                예상 소요 <b>{Math.ceil((pickedProducts.size * 60) / 60)}분 내외</b>
                (건당 30~90초 · 네이버가 막으면 더 걸립니다)
              </p>
            )}

            {detail && (detail.running || detail.done > 0) && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-800 font-medium">
                    상세 추출 {detail.running ? '진행 중' : (detail.stopped || '완료')}
                  </span>
                  <span className="text-gray-500">
                    {detail.done}/{detail.total} · 성공 {detail.ok} · 실패 {detail.failed}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-[#E31837] transition-all"
                    style={{ width: `${detail.total ? Math.round((detail.done / detail.total) * 100) : 0}%` }}
                  />
                </div>
                {detail.current && (
                  <p className="text-xs text-gray-500 mt-2 truncate">지금: {detail.current}</p>
                )}
                {detail.rootDir && (
                  <p className="text-xs text-gray-500 mt-1">저장 위치: <code className="text-[11px]">{detail.rootDir}</code></p>
                )}
              </div>
            )}
          </div>
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

      {/* 미리보기 — 목록에서 상품을 누르면 등록에 필요한 것(이미지·옵션·상세·고시정보)을 다 보여준다. */}
      {previewNo && (() => {
        const c = cards.find((x) => x.productNo === previewNo);
        if (!c) return null;
        return (
          <SourcingPreviewModal
            ep={ep}
            url={c.url}
            fallback={{ title: c.title, price: c.price, thumb: c.thumb, reviewCount: c.reviewCount }}
            picked={pickedProducts.has(c.productNo)}
            onPick={() => setPickedProducts((prev) => {
              const next = new Set(prev);
              next.add(c.productNo);
              return next;
            })}
            onClose={() => setPreviewNo(null)}
          />
        );
      })()}
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

/**
 * 카테고리 트리 한 단계.
 *
 * 예전엔 현재 단계의 하위 분류만 칩으로 쏟아 냈는데, 어디까지 내려왔는지·형제가 뭐였는지가
 * 화면에서 사라져 훑기가 어려웠다. 여기서는 펼친 가지를 그대로 남긴다.
 * 자식을 아직 모르는 노드(tree[id] === undefined)는 ▸ 를 눌렀을 때 그때 읽는다.
 */
function CategoryTree({
  nodes, trail, tree, expanded, loadingId, pickedId, onToggle, onPick,
}: {
  nodes: NaverCategory[];
  trail: NaverCategory[];
  tree: Record<string, NaverCategory[]>;
  expanded: Set<string>;
  loadingId: string | null;
  pickedId: string | null;
  onToggle: (c: NaverCategory) => void;
  onPick: (trail: NaverCategory[]) => void;
}) {
  return (
    <ul className={trail.length ? 'ml-3 pl-2 border-l border-gray-100' : ''}>
      {nodes.map((c) => {
        const kids = tree[c.id];
        const open = expanded.has(c.id);
        const leaf = kids?.length === 0;          // 읽어 봤더니 하위가 없었던 노드
        const on = pickedId === c.id;
        return (
          <li key={c.id}>
            <div className={`flex items-center rounded-md ${on ? 'bg-[#E31837]/5' : 'hover:bg-gray-50'}`}>
              <button
                onClick={() => onToggle(c)}
                disabled={leaf}
                aria-label={open ? '접기' : '펼치기'}
                className="w-6 h-6 shrink-0 grid place-items-center text-gray-400 hover:text-gray-700 disabled:opacity-0"
              >
                {loadingId === c.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => onPick([...trail, c])}
                className={`flex-1 min-w-0 text-left py-1 pr-2 text-sm truncate ${on ? 'font-bold text-[#E31837]' : 'text-gray-700'}`}
              >
                {c.name}
              </button>
              {kids?.length ? <span className="shrink-0 pr-2 text-[11px] text-gray-400">{kids.length}</span> : null}
            </div>
            {open && kids?.length ? (
              <CategoryTree
                nodes={kids}
                trail={[...trail, c]}
                tree={tree}
                expanded={expanded}
                loadingId={loadingId}
                pickedId={pickedId}
                onToggle={onToggle}
                onPick={onPick}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
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
