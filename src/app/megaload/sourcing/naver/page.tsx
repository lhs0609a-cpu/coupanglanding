'use client';

/**
 * 네이버 소싱 카탈로그 — **셀러도 보는 화면**.
 *
 * 수집 자체는 관리자 PC 의 도우미만 할 수 있다(네이버가 datacenter IP 를 막는다). 그런데
 * 예전에는 그 결과가 **도우미 메모리에만** 있어서, 앱을 껐다 켜면 사라지고 도우미가 켜진
 * 그 PC 의 브라우저에서만 보였다. 그래서 이 화면이 필요하다 — 저장된 수집물을 서버에서
 * 읽으므로 관리자는 어느 자리에서든, 셀러는 도우미 없이도 볼 수 있다.
 *
 * 조종석(/megaload/naver-sourcing)과 역할이 다르다:
 *   · 조종석 = 수집을 **시키는** 곳(관리자 전용, 도우미 필요)
 *   · 이 화면 = 수집된 것을 **보는** 곳(로그인한 모두, 도우미 불필요)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ExternalLink, PackageSearch, ChevronLeft, ChevronRight, Download, AlertTriangle, Trash2 } from 'lucide-react';
import { findHelper, fetchCollection, startImport, fetchImportState, fetchStatus, kickQueue, type ImportState, type GenState } from '@/lib/megaload/naver-ingest-local';
import { isDetailExtractable, naverStoreType, STORE_TYPE_LABEL } from '@/lib/megaload/naver-store-type';
import NaverCategoryTree, { type CategoryCount } from '@/components/megaload/NaverCategoryTree';
import SkipReviewRiskModal, { type SkipReviewOptions } from '@/components/megaload/SkipReviewRiskModal';
import { armHandoff, peekHandoff, clearHandoff } from '@/lib/megaload/autopilot-handoff';
import { saveRunTiming } from '@/lib/megaload/run-timing';
import { UNCLASSIFIED, PATH_SEP, type CategoryNode } from '@/lib/megaload/naver-category-tree';

interface SourcedProduct {
  id: string;
  product_no: string;
  store_id: string | null;
  url: string;
  title: string;
  price: number;
  thumb: string | null;
  review_count: number;
  naver_category_id: string | null;
  category_path: string | null;
  detail_status: 'none' | 'requested' | 'running' | 'done' | 'failed';
  folder_path: string | null;
  collected_at: string;
}

type Sort = 'recent' | 'price' | 'review';

/**
 * 고를 수 있는 상품인가.
 * 상세를 못 뽑는 주소(네이버 마켓·쇼핑윈도)는 아무리 눌러도 준비되지 않는다 — 실측 2026-08-20:
 * 마켓·윈도 0/3(2 실패 + 1 은 7분째 멈춘 채). 그런 걸 고르게 두면 셀러는 "요청을 걸었습니다"만
 * 반복해서 보게 된다. 그래서 아예 못 고르게 하고 **이유를 카드에 적는다**.
 * 이미 상세를 받아 둔 줄은 예외다 — 지원 범위가 넓어지기 전에 확보한 것도 등록은 돼야 한다.
 */
function isPickable(p: SourcedProduct): boolean {
  return p.detail_status === 'done' || isDetailExtractable(p.url);
}

/** ms → "m분 s초" / "s초" (경과·남은시간 표시용). */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

/**
 * 상세 준비의 **물리 상한** — 네이버 게이트(worker/desktop/main/naver-gate.mjs)가 평균 5초에
 * 1건만 통과시킨다. 도우미 창을 몇 개로 늘려도 이 숫자는 안 변한다.
 */
const DETAIL_RATE_PER_MIN = 12;

/**
 * 기다려 주는 한도. 넘으면 손을 떼고 **그만뒀다고 말한다**.
 * ---------------------------------------------------------------------------
 * 예전엔 건수와 무관한 고정 8분이었다. 그런데 100개를 고르면 도우미가 완벽히 정상이어도
 * 최소 8.3분이 걸린다(위 상한) —— **정상 동작이 반드시 실패로 보였다.** 사람은 있지도 않은
 * 고장을 찾으러 갔다. 건수에 비례시키고 여유 1.5배를 준다.
 */
function waitLimitMs(count: number): number {
  const need = (Math.max(1, count) / DETAIL_RATE_PER_MIN) * 60_000 * 1.5;
  return Math.min(45 * 60_000, Math.max(8 * 60_000, need));
}
/** 처리 주체(관리자 도우미) 점검 주기 — 5초 폴링 중 3번에 한 번. */
const BLOCK_CHECK_EVERY = 3;

/** 생성 단계(러너 마커) → 사람이 읽는 라벨. 순서: 인식 → 글 생성 → 누끼. */
const GEN_STEP_META: Record<NonNullable<GenState['phase']>, { idx: number; label: string }> = {
  recognize: { idx: 1, label: '상품 사진 인식 (대표컷 선정)' },
  text: { idx: 2, label: '상품명·상세페이지 생성' },
  image: { idx: 3, label: '대표사진 누끼 가공' },
};

export default function NaverSourcingCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<SourcedProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  /**
   * 목록을 **바로 가져올 수 있는 것**(상세 확보분)으로만 좁힐지. 기본 켜짐.
   * ---------------------------------------------------------------------------
   * 왜 기본값을 바꿨나: 카탈로그에는 목록만 수집된 상품이 훨씬 많다(상세는 요청된 것만 뽑는다).
   * 그런데 화면은 둘을 같은 카드로 보여 줬고, 사람은 당연히 "여기 있는 건 가져갈 수 있는 것"으로
   * 읽는다. 10개를 고르면 5개만 오는 일이 그래서 생겼다 — 나머지는 그 자리에서 상세를 요청하고
   * 기다려야 하는 것들이었다.
   * ⚠️ 그렇다고 상세 없는 줄을 **카탈로그에서 빼지는 않는다.** 그러면 목록이 텅 비어 고를 것이
   *    사라진다(발견이 이 화면의 존재 이유다). 기본 화면만 좁히고, 끄면 전부 보인다.
   */
  const [onlyDetail, setOnlyDetail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // 올인원으로 가져오기 — 고른 것만 내 PC 로 내려받아 폴더를 만든다.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  /**
   * 내가 **이미 올린** 상품 — 채널상품번호 → 첫 등록 시각(ISO).
   * ---------------------------------------------------------------------------
   * 이 카탈로그는 셀러 여럿이 함께 보는 공용 목록이라, "내가 올린 것"은 화면에서만 갈라 줄 수
   * 있다. 표시가 없으면 같은 상품을 몇 번이고 다시 가져와 생성까지 돌린 뒤(=시간·GPU 소모)
   * 등록 단계에서야 알게 된다. 열쇠는 이미 있다 —— 카탈로그의 product_no 가 도우미 폴더명
   * product_<번호> 를 거쳐 그대로 등록 기록의 productCode 가 된다.
   * ⚠️ 아는 것은 "메가로드로 올린 기록"뿐이다. 윙에서 직접 올린 건 모르므로 **막지 않는다**.
   */
  const [registeredAt, setRegisteredAt] = useState<Record<string, string>>({});
  /** 이미 올린 것을 이 페이지에서 가린다(서버 목록은 그대로 — 페이지 번호가 어긋나지 않게). */
  const [hideRegistered, setHideRegistered] = useState(false);
  /** "그대로 가져오기"를 고른 뒤엔 같은 경고를 다시 띄우지 않는다(사람이 이미 정했다). */
  const [dupDismissed, setDupDismissed] = useState(false);
  /**
   * 관리자만 카탈로그에서 줄을 지울 수 있다.
   * 수집이 완벽하지 않아 잘못 들어온 상품이 생긴다(딸기에 감귤이 섞였다 — 2026-08-26).
   * 지울 길이 없으면 셀러 목록이 계속 오염된 채로 간다. 실제 차단은 서버가 한다.
   */
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imp, setImp] = useState<ImportState | null>(null);
  const [impNote, setImpNote] = useState<string | null>(null);
  // 경과·남은시간을 폴링(2초) 사이에도 매초 갱신하는 티커.
  const [nowTick, setNowTick] = useState(0);
  // 현재 단계의 평균 처리속도 기준점(단계가 바뀌면 리셋) — 남은시간 추정용.
  const etaBaseRef = useRef<{ phase: string; at: number; done: number } | null>(null);
  const [etaMs, setEtaMs] = useState<{ ms: number; at: number } | null>(null);
  // 이 화면에서 시작한 작업인가 — 검수 화면으로 **자동 이동**은 그때만 한다.
  //   (새로고침으로 남의 작업에 끼어든 경우까지 화면을 뺏으면 안 된다)
  const startedHereRef = useRef(false);
  const navigatedRef = useRef(false);
  /**
   * 이번 판의 시계. 끝나고 검수 화면에 도착하면 진행 표시가 통째로 사라져서
   * "1개에 얼마나 걸리더라"를 매번 감으로 답하게 된다 — 100개를 돌릴지 판단할 근거가 없다.
   * 단계 경계를 여기 적어 두고, 넘어갈 때 통째로 넘긴다.
   */
  const runMarks = useRef<{ startedAt: number; detailWaitMs: number; importStartedAt: number }>(
    { startedAt: 0, detailWaitMs: 0, importStartedAt: 0 },
  );
  /* ── 무인 자동등록 ────────────────────────────────────────────────────
     "소싱에서 고르면 사람 손 없이 등록까지"인데, 정작 그 시작점인 이 화면에서는
     켤 수가 없었다 — 무인 설정이 검수 화면의 상태로만 살아서, 이 화면이 검수 화면을
     여는 순간(페이지가 새로 뜬다) 통째로 초기화됐다.
     동의는 **검수 화면과 같은 위험 모달**로 받고, 그 사본만 인계장에 적어 넘긴다. */
  const [autoOn, setAutoOn] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [helperOnline, setHelperOnline] = useState(false);
  // 상세를 요청해 둔 상품 — 준비되면 자동으로 이어서 등록한다.
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  // 그 기다림에도 시계를 붙인다 — 실측 1~1분 반이 걸리는데 아무 표시가 없으면 멈춘 걸로 보인다.
  const [waitStartedAt, setWaitStartedAt] = useState(0);
  const [waitCount, setWaitCount] = useState(0);
  // 그중 몇 개가 준비됐나 — 100개를 기다릴 땐 "진행 중"만으로는 멈춘 것과 구별되지 않는다.
  const [waitReady, setWaitReady] = useState(0);
  /**
   * **기다려도 소용없는 이유**(모르면 null). 상세는 로그인된 관리자 도우미만 가져간다 —
   * 그 도우미가 없거나 로그아웃돼 있으면 요청은 큐에 그대로 앉아 있는다.
   * 실측 2026-08-21: 도우미가 떠 있는데 계정이 로그아웃돼 `claimJobs` 가 매번 빈 손으로
   * 돌아왔고, 요청 1건이 **32분째 requested 인 채** 방치됐다. 그동안 화면은 "곧 됩니다"만
   * 적고 있었다 — 사람은 기다리면 되는 줄 알고 기다린다. 아는 것을 말해야 한다.
   */
  const [waitBlock, setWaitBlock] = useState<string | null>(null);
  const waitBlockRef = useRef<string | null>(null);
  const noteBlock = (why: string | null) => { waitBlockRef.current = why; setWaitBlock(why); };

  /**
   * 이 요청을 가져갈 도우미가 실제로 준비돼 있나 — 아는 만큼만, 단정하지 않고 말한다.
   * 도우미가 이 PC 에 없는 건 셀러에겐 **정상**이다(관리자 PC 가 대신 뽑는다) → 그때는 조용히 있는다.
   */
  const checkQueueWorker = useCallback(async () => {
    try {
      const helper = await findHelper();
      if (!helper) { noteBlock(null); return; }      // 남의 PC 가 처리할 수도 있다 — 단정 금지
      const st = await fetchStatus(helper.ep);
      if (!st || st === 'unsupported') { noteBlock(null); return; }
      if (!st.account) {
        noteBlock('이 PC 도우미에 메가로드 계정이 로그인돼 있지 않습니다 — 상세는 로그인된 관리자 도우미만 가져갑니다. 도우미 창에서 로그인해 주세요.');
        return;
      }
      if (st.isAdmin && !st.naverLogin?.loggedIn) {
        noteBlock('이 PC 도우미가 네이버에 로그인돼 있지 않습니다 — 자동 로그인이 안 되면 상세를 못 가져옵니다. 도우미에서 네이버 로그인을 확인해 주세요.');
        return;
      }
      noteBlock(null);
    } catch { noteBlock(null); }   // 못 물어봤을 뿐이다 — 모르면 겁주지 않는다
  }, []);
  // ── 카테고리 트리 ──
  // 트리 자체는 서버 코드에 동봉된 스냅샷이라 도우미가 없어도 즉시 뜬다. 여기서 받는 건
  // "어느 가지에 몇 개가 쌓였나"까지 포함된 한 덩어리다(요청 1회).
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [counts, setCounts] = useState<Record<string, CategoryCount>>({});
  const [allCount, setAllCount] = useState<CategoryCount>({ total: 0, ready: 0 });
  const [catPath, setCatPath] = useState('');          // '' = 전체
  const [catLoading, setCatLoading] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = new URLSearchParams({ page: String(page), sort });
      if (q) p.set('q', q);
      if (onlyDetail) p.set('detail', '1');
      if (catPath) p.set('path', catPath);
      const res = await fetch(`/api/megaload/naver-sourcing/products?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setProducts(j.products ?? []);
      setTotal(j.total ?? 0);
      setIsAdmin(!!j.isAdmin);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, q, sort, onlyDetail, catPath]);

  useEffect(() => { load(); }, [load]);

  /**
   * 이 페이지에 뜬 상품 중 내가 이미 올린 것을 표시한다.
   * 페이지 단위(60개)라 요청이 가볍고, 실패해도 조용히 넘어간다 — 표시가 없을 뿐 소싱은 그대로 된다.
   */
  useEffect(() => {
    const codes = products.map((p) => p.product_no).filter(Boolean);
    if (codes.length === 0) { setRegisteredAt({}); return; }
    let cancelled = false;
    fetch('/api/megaload/products/bulk-register/registered-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCodes: codes }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && typeof d.registeredAt === 'object') setRegisteredAt(d.registeredAt || {}); })
      .catch(() => { /* 표시가 없을 뿐이다 — 소싱을 막지 않는다 */ });
    return () => { cancelled = true; };
  }, [products]);

  // 목록이 바뀌면 경고를 다시 살린다 — 앞 페이지에서 "그대로"라고 한 것이 다음 페이지까지 가면 안 된다.
  useEffect(() => { setDupDismissed(false); }, [page, catPath, q]);

  /** 고른 줄을 카탈로그에서 지운다(관리자). 되돌릴 수 없으므로 개수를 보여 주고 한 번 묻는다. */
  const removePicked = useCallback(async () => {
    const ids = [...picked];
    if (!ids.length) return;
    const ok = window.confirm(
      `카탈로그에서 ${ids.length.toLocaleString()}개를 지웁니다. 되돌릴 수 없습니다 — `
      + '다시 필요하면 그 카테고리를 다시 수집해야 합니다. 계속할까요?',
    );
    if (!ok) return;
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch('/api/megaload/naver-sourcing/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPicked(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }, [picked, load]);

  /**
   * 카테고리 트리 + 가지별 개수.
   * 목록이 바뀌면(수집·상세 확보) 개수도 바뀌므로 목록을 다시 읽을 때 같이 새로 읽는다.
   * 다만 페이지 넘김·정렬 같은 건 개수를 바꾸지 않으니 그런 걸로는 다시 부르지 않는다.
   */
  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    try {
      const res = await fetch('/api/megaload/naver-sourcing/categories');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setTree(j.tree ?? []);
      setCounts(j.counts ?? {});
      setAllCount(j.all ?? { total: 0, ready: 0 });
    } catch {
      // 트리를 못 받아도 목록은 봐야 한다 — 조용히 트리만 비운다.
      setTree([]);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  /**
   * 도우미에 아직 안 올라간 수집물이 있으면 여기서 올린다.
   * ★ 왜 이 화면에도 두나: 저장은 원래 조종석(/megaload/naver-sourcing)이 수집을 마칠 때만
   *   했다. 그런데 수집은 몇 분씩 걸려서 사람은 그동안 다른 화면으로 가 있기 마련이고,
   *   실제로 이 카탈로그를 보고 있는 동안 수집이 끝나면 **아무 데도 저장되지 않았다**.
   *   저장이 "어느 탭을 보고 있었는가"에 달려 있으면 안 된다.
   * 도우미가 없거나(셀러) 올릴 게 없으면 조용히 아무 일도 하지 않는다.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const helper = await findHelper();
        if (!helper || !alive) return;
        const c = await fetchCollection(helper.ep);
        if (!alive || !c || c.running || !c.items?.length) return;
        const res = await fetch('/api/megaload/naver-sourcing/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: c.items, categoryPath: c.catName || '' }),
        });
        // 관리자가 아니면 403 이 정상이다(셀러는 올릴 권한이 없다) — 조용히 넘어간다.
        if (res.ok && alive) { load(); loadCategories(); }   // 새로 담겼으니 가지별 개수도 다시 센다
      } catch { /* 도우미 미설치·미실행은 정상 상황이다 */ }
    })();
    return () => { alive = false; };
    // 첫 진입에 한 번만 — 폴링하면 셀러 브라우저가 매번 localhost 를 두드린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 진행 폴링 — **가져오기가 끝나도 멈추지 않는다.**
   * ---------------------------------------------------------------------------
   * 예전엔 가져오기(폴더 굽기)가 끝나는 순간 폴링을 껐다. 그런데 진짜 시간이 드는 구간은
   * 그다음(사진 인식 → 상품명·상세 생성 → 누끼)이라, 화면은 몇 분~수십 분 동안 "준비 완료"
   * 한 줄에서 멈춘 것처럼 보였다. 사람은 끝난 줄 알고 나가거나 고장으로 여겼다.
   * 그래서 생성이 도는 동안까지 계속 보고, 검수 가능 시점에 스스로 넘어간다.
   */
  const genRunning = !!imp?.gen?.running;
  const watching = importing || !!imp?.running || genRunning;
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    const t = setInterval(async () => {
      const helper = await findHelper();
      if (!helper || !alive) return;
      const st = await fetchImportState(helper.ep);
      if (!alive || !st) return;
      setImp(st);
      if (!st.running) setImporting(false);

      // 남은시간 — 지금 단계의 평균 처리속도로만 낸다(단계마다 건당 시간이 다르다).
      const g = st.gen;
      const now = Date.now();
      if (g?.running && g.phase && g.total > 0) {
        const base = etaBaseRef.current;
        if (!base || base.phase !== g.phase) {
          etaBaseRef.current = { phase: g.phase, at: now, done: g.done };
          setEtaMs(null);                                   // 단계가 바뀌면 이전 추정은 무효
        } else if (g.done > base.done) {
          const perItem = (now - base.at) / (g.done - base.done);
          setEtaMs({ ms: perItem * (g.total - g.done), at: now });
        }
      }

      // 검수로 넘어갈 순간 — 둘 중 먼저 오는 쪽.
      //   ① reviewReady: 레코드는 저장됐고 대표컷 누끼만 남았다(그건 등록 때 필요한 거라
      //      사람을 기다리게 하지 않는다).
      //   ② 생성 정상 종료: 누끼할 대표컷이 없으면(과일·음식은 누끼를 아예 건너뛴다)
      //      ①의 신호가 나오지 않는다 — 그때는 종료가 곧 준비 완료다.
      // ⚠️ 도우미의 생성 상태는 **이전 판이 끝난 뒤에도 완료 상태로 남아 있다**(running=false,
      //    code=0, reviewReady=true). 그걸 그대로 믿으면, 새 판을 걸자마자 —— 도우미가 아직 새
      //    생성을 시작하기도 전에 —— 옛 완료 신호를 보고 검수 화면으로 넘어간다. 그리고 그 화면은
      //    "도우미가 마지막으로 생성한 폴더"를 읽으므로 **이전 판 결과**가 뜬다.
      //    실측 2026-09-01: 토마토 3개를 걸었는데 직전 판의 오렌지 카드가 떴다.
      //    → 이번 판이 시작된 뒤에 켜진 생성만 이번 것으로 친다(시계 오차 10초는 봐준다).
      const runStartedAt = runMarks.current.importStartedAt || runMarks.current.startedAt;
      const isThisRun = !!g?.startedAt && (!runStartedAt || g.startedAt >= runStartedAt - 10_000);
      const ready = isThisRun && !!g && !g.error && (g.reviewReady || (!g.running && g.code === 0));
      if (ready && startedHereRef.current && !navigatedRef.current) {
        navigatedRef.current = true;
        // 이번 판이 실제로 얼마나 걸렸는지 넘긴다 — 검수 화면이 총합·단계별·100개 환산을 적는다.
        if (runMarks.current.startedAt) {
          const m = runMarks.current;
          saveRunTiming({
            startedAt: m.startedAt,
            count: g?.products || 0,
            detailWaitMs: m.detailWaitMs,
            importMs: m.importStartedAt && g?.startedAt ? Math.max(0, g.startedAt - m.importStartedAt) : 0,
            genStartedAt: g?.startedAt || 0,
          });
        }
        // 검수 화면은 이 화면이 연다고 도우미에 먼저 알린다 — 안 그러면 남은 누끼가 끝날 때
        // 도우미가 브라우저를 또 열어 같은 화면이 탭 두 개가 된다.
        await fetchImportState(helper.ep, { handoff: true }).catch(() => null);
        router.push('/megaload/products/allinone?load=1');
      }
    }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [watching, router]);

  /** 경과·남은시간을 매초 갱신 — 폴링 사이가 비어 보이지 않게. 상세 대기 중에도 돈다. */
  useEffect(() => {
    if (!watching && !waitStartedAt) return;
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [watching, waitStartedAt]);

  /**
   * 새로고침·재진입 복구 — 도우미가 아직 돌고 있으면 그 진행을 이어서 보여 준다.
   * 진행이 브라우저 탭의 수명에 묶여 있으면, 탭을 잘못 닫은 사람은 상황을 영영 못 본다.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      // 인계장이 살아 있으면(같은 탭·30분 이내) 켜진 상태로 보여 준다 — 껐다 켠 줄 알고
      // 두 번 동의하게 만들지 않는다.
      if (peekHandoff()) setAutoOn(true);
      try {
        const helper = await findHelper();
        if (!helper || !alive) return;
        setHelperOnline(true);        // 모달이 "재생성까지 되는지"를 이걸로 안내한다
        const st = await fetchImportState(helper.ep);
        if (!alive || !st) return;
        if (st.running || st.gen?.running) setImp(st);
      } catch { /* 도우미 미실행은 정상 상황이다 */ }
    })();
    return () => { alive = false; };
  }, []);

  /** 무인 자동등록 켜기/끄기. 켤 때만 위험 동의를 받는다. */
  const toggleAuto = () => {
    if (autoOn) { clearHandoff(); setAutoOn(false); return; }
    setAutoOpen(true);
  };
  const confirmAuto = (opts: SkipReviewOptions) => {
    setAutoOpen(false);
    armHandoff({ audit: opts.audit, excludeUnfixed: opts.excludeUnfixed });
    setAutoOn(true);
  };

  /**
   * 고른 상품을 내 PC 로 가져온다.
   * 서버에서 받는 건 **URL 과 JSON 뿐**이다 — 이미지 바이트는 도우미가 CDN 에서 직접 받는다.
   * 그래서 네이버 페이지를 열지 않고, 셀러는 로그인·캡차·429 를 겪지 않는다.
   */
  const runImport = async () => {
    setErr(null);
    setImpNote(null);
    setImporting(true);
    // 이 화면이 시작한 작업이니, 검수 준비가 되면 화면이 스스로 넘어가도 된다.
    startedHereRef.current = true;
    navigatedRef.current = false;
    runMarks.current = { startedAt: Date.now(), detailWaitMs: 0, importStartedAt: 0 };  // 시계 시작
    etaBaseRef.current = null;
    setEtaMs(null);
    try {
      const helper = await findHelper();
      if (!helper) throw new Error('이 PC 에서 메가로드 도우미를 찾지 못했습니다 — 도우미를 실행해 주세요.');

      const res = await fetch('/api/megaload/naver-sourcing/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...picked] }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      // ── 고른 것 대사(對査) ──────────────────────────────────────────────
      // "5개를 체크했는데 3개만 올라온다" 는 신고의 정체는 여기다. 단계마다 조용히 거르는 자리가
      // 있었고(상세 미확보 / 마켓·윈도 / 카탈로그에서 지워진 줄), 화면은 그중 일부만 말했다.
      // 이제 **고른 수 = 진행 + 대기 + 제외** 가 맞아떨어지게 세고, 그 결과를 반드시 남긴다.
      const readyIds = ((j.products ?? []) as { id?: string }[]).map((p) => p?.id).filter(Boolean) as string[];
      const skippedIds = ((j.skipped ?? []) as { id: string }[]).map((x) => x.id);
      // 상세를 못 뽑는 주소는 큐에 넣지 않는다. 넣으면 도우미가 재시도 6회 × 캡차 대기까지
      // 매달렸다가 실패하고, 30분 뒤 서버가 되살려 같은 실패를 무한 반복한다(실측 2026-08-20).
      const byId = new Map(products.map((p) => [p.id, p]));
      const queueIds = skippedIds.filter((id) => {
        const p = byId.get(id);
        return !p || isDetailExtractable(p.url);   // 다른 페이지에서 고른 건 서버가 판정한다
      });
      const blocked = skippedIds.length - queueIds.length;
      // 고른 뒤 카탈로그에서 지워진 줄 — export 가 아예 못 찾은 것들이다. 예전엔 흔적도 없이 사라졌다.
      const gone = Math.max(0, picked.size - readyIds.length - skippedIds.length);
      const notes: string[] = [];
      if (blocked > 0) notes.push(`${blocked}개는 네이버 마켓·쇼핑윈도 상품이라 상세를 가져올 수 없어 제외`);
      if (gone > 0) notes.push(`${gone}개는 카탈로그에서 사라져(삭제됨) 제외`);

      // ★ 상세가 없는 건 막다른 길이 아니다 — **자동으로 요청을 걸어 둔다.**
      //   셀러 PC 가 직접 네이버를 열면 셀러마다 로그인·캡차·429 를 겪으므로, 요청만 남기고
      //   실제 추출은 관리자 도우미가 대신한다.
      let queued = 0;
      if (queueIds.length) {
        try {
          const qr = await fetch('/api/megaload/naver-sourcing/products/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: queueIds }),
          });
          const qj = await qr.json();
          queued = qr.ok ? (qj.requested ?? 0) : 0;
        } catch { /* 요청 등록 실패는 치명적이지 않다 */ }
      }

      if (queued > 0) {
        // ⚠️ 준비된 것만 **먼저 보내지 않는다**. 예전엔 이미 상세가 있는 3개를 즉시 가져와 생성까지
        //    끝내고 검수 화면으로 넘어갔는데, 화면이 넘어가는 순간 이 페이지에서 돌던 나머지
        //    2개의 대기가 통째로 죽었다 —— 고른 5개 중 3개만 올라가고 2개는 흔적도 없었다.
        //    전부 준비되면 함께 간다(급하면 아래 대기 패널의 "준비된 것만 지금" 으로 빠져나간다).
        const all = [...readyIds, ...queueIds];
        setWaitCount(all.length);
        setWaitReady(readyIds.length);
        setWaitStartedAt(Date.now());
        setPendingIds(all);
        setImpNote([
          `고른 ${picked.size}개 중 ${queued}개는 상세가 없어 지금 요청을 걸었습니다 — 준비되면 ${all.length}개를 함께 가져옵니다.`,
          ...notes,
        ].join(' · '));
        // 큐 자동 처리는 60초 주기다 — 요청하자마자 걸리면 아무 일 없이 1분이 흐른다. 깨운다.
        kickQueue(helper.ep);
        // 가져갈 사람이 없으면 8분을 기다릴 이유가 없다 — 걸자마자 확인해서 바로 말한다.
        void checkQueueWorker();
        setImporting(false);
        return;
      }

      if (!j.products?.length) {
        // 가져올 게 없어도 이유는 남긴다 — 아무 일도 안 난 것처럼 보이는 게 제일 나쁘다.
        setImpNote([
          `고른 ${picked.size}개 중 가져올 수 있는 것이 없습니다.`,
          ...notes,
          ...(skippedIds.length && !queueIds.length ? [] : queueIds.length ? ['상세 요청 등록에 실패했습니다 — 잠시 후 다시 시도해 주세요'] : []),
        ].join(' · '));
        setImporting(false);
        return;
      }
      // 빠진 게 있으면 **진행 전에** 말한다 — 끝나고 카드 수를 세어 알아채게 하지 않는다.
      setImpNote(readyIds.length < picked.size
        ? [`고른 ${picked.size}개 중 ${readyIds.length}개로 진행합니다`, ...notes].join(' — ')
        : null);
      // 올인원 생성까지 이어가는 게 이 버튼의 목적이다 — 기본값에 기대지 않고 명시한다.
      runMarks.current.importStartedAt = Date.now();   // 0단계 없이 바로 1단계
      const r = await startImport(helper.ep, j.products, undefined, true);
      setImp({ running: true, total: r.total ?? j.products.length, done: 0, ok: 0, failed: 0, current: '', rootDir: r.rootDir ?? '', stopped: null, at: Date.now(), gen: null });
      setPicked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  /**
   * 요청해 둔 상세가 준비됐는지 지켜본다.
   * ---------------------------------------------------------------------------
   * 실측(2026-08-21, 최근 9건): 요청 → 확보까지 12·52·56·61·76·81·81·93·93초 —— **보통 1~1분 반**이다.
   * 예전 값(14초)만 보고 3분에서 손을 뗐는데, 큐 자동 처리가 60초 주기라 운 나쁘면 대기 1분이
   * 그냥 얹힌다. 게다가 앞에 밀린 요청이 있으면 순번을 기다린다 → 3분은 너무 빠듯했다.
   * 8분까지 기다리고, 5초마다 확인해 준비되는 즉시 이어간다.
   *
   * ⚠️ 포기 판정은 **벽시계**로 한다(횟수로 세지 않는다). 브라우저는 안 보이는 탭의 타이머를
   *    1분에 한 번으로 늦춘다 — 5초 × 96회로 세면 백그라운드에서는 8분이 아니라 한 시간이
   *    넘는다. 실측 2026-08-21: 27분이 지나도 포기가 안 걸린 채 "곧 됩니다"만 떠 있었다.
   */
  /**
   * 준비된 것을 들고 1단계(가져오기)로 넘어간다. dropped>0 이면 못 채운 만큼을 말한다.
   * 대기 감시(아래 effect)와 "준비된 것만 지금 가져오기" 버튼이 같이 쓴다 —— 길이 둘로 갈리면
   * 한쪽만 고쳐지고 다른 쪽은 옛 동작으로 남는다.
   */
  const proceedImport = useCallback(async (
    products: Parameters<typeof startImport>[1], dropped: number,
  ) => {
    setPendingIds([]);
    setWaitStartedAt(0);
    setWaitReady(0);
    noteBlock(null);
    const helper = await findHelper();
    if (!helper) { setImpNote('상세가 준비됐는데 도우미를 찾지 못했습니다 — 도우미를 실행한 뒤 다시 눌러 주세요.'); return; }
    // ⚠️ **왜** 준비되지 않았는지까지 말한다. 이유를 빼면 사람은 "고르면 늘 절반만 온다"로만
    //    받아들이고 원인을 못 찾는다 — 가장 흔한 사유는 관리자 도우미가 네이버에 로그인돼 있지
    //    않아 상세를 못 뽑는 것이고, 그건 고칠 수 있는 문제다(모르면 영영 절반만 온다).
    setImpNote(dropped > 0
      ? `${dropped}개는 아직 준비되지 않아 빼고 ${products.length}개로 진행합니다.`
        + (waitBlockRef.current
          ? ` 준비되지 않은 이유: ${waitBlockRef.current}`
          : ' 나머지는 준비된 뒤 다시 가져와 주세요.')
      : null);
    setImporting(true);
    // 0단계(상세 준비)가 여기서 끝났다 — 그 길이를 확정하고 1단계 시계를 켠다.
    if (runMarks.current.startedAt) {
      runMarks.current.detailWaitMs = Date.now() - runMarks.current.startedAt;
      runMarks.current.importStartedAt = Date.now();
    }
    startedHereRef.current = true;   // 이어서 시작한 것도 이 화면의 작업이다
    navigatedRef.current = false;
    etaBaseRef.current = null;
    setEtaMs(null);
    const r = await startImport(helper.ep, products, undefined, true);
    setImp({ running: true, total: r.total ?? products.length, done: 0, ok: 0, failed: 0, current: '', rootDir: r.rootDir ?? '', stopped: null, at: Date.now(), gen: null });
    setPicked(new Set());
    load(); loadCategories();   // 상세가 확보됐으니 '상세 확보' 개수가 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, loadCategories]);

  /**
   * 기다리지 않고 **지금 준비된 것만** 가져간다.
   * 기본은 전부 함께 가는 것이다(그래야 고른 수와 올라간 수가 같다). 다만 8분을 못 기다릴
   * 사정도 있으므로 길을 하나 열어 두되, **몇 개를 두고 가는지 반드시 말한다**.
   */
  const importReadyNow = useCallback(async () => {
    const all = pendingIds;
    if (!all.length) return;
    try {
      const res = await fetch('/api/megaload/naver-sourcing/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: all }),
      });
      const j = await res.json();
      const ready = (j.products ?? []) as Parameters<typeof startImport>[1];
      if (!res.ok || !ready.length) {
        setImpNote('아직 준비된 상품이 하나도 없습니다 — 조금만 더 기다려 주세요.');
        return;
      }
      await proceedImport(ready, all.length - ready.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [pendingIds, proceedImport]);

  useEffect(() => {
    if (!pendingIds.length) return;
    let alive = true;
    const all = pendingIds;
    // 시작 시각을 여기서 못박는다 — 타이머가 몇 번 돌았는지와 무관하게 실제 흐른 시간으로 잰다.
    const limitMs = waitLimitMs(all.length);
    const deadline = Date.now() + limitMs;
    let checks = 0;

    const t = setInterval(async () => {
      // 처리할 도우미가 준비돼 있나 — 15초에 한 번. 막혀 있으면 그 사실을 화면에 띄운다.
      if (checks++ % BLOCK_CHECK_EVERY === 0) void checkQueueWorker();

      // 준비 상황을 **먼저** 본다 — 시간이 다 됐을 때 "그때까지 준비된 것"을 들고 갈 수 있어야 한다.
      let ready: Parameters<typeof startImport>[1] | null = null;
      try {
        const res = await fetch('/api/megaload/naver-sourcing/products/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: all }),
        });
        const j = await res.json();
        if (res.ok) ready = j.products ?? [];
      } catch { /* 다음 주기에 다시 */ }
      if (!alive) return;
      if (ready) setWaitReady(ready.length);

      // ★ 예전엔 **한 개만 준비돼도** 그것만 들고 떠났다(`!j.products?.length` 로만 판단했다).
      //   100개를 골랐는데 1개로 생성이 시작되고 99개는 조용히 사라졌다. 전부 기다린다.
      if (ready && ready.length >= all.length) {
        clearInterval(t);
        await proceedImport(ready, 0);
        return;
      }

      // 한도를 넘겼다. 조용히 손을 떼면 "기다렸는데 아무 일도 안 났다"가 된다 — 그만뒀다고 말한다.
      // 단, 그때까지 준비된 게 있으면 **버리지 않고** 그것만이라도 들고 간다.
      if (Date.now() > deadline) {
        clearInterval(t);
        if (ready && ready.length > 0) { await proceedImport(ready, all.length - ready.length); return; }
        setPendingIds([]);
        setWaitStartedAt(0);
        setWaitReady(0);
        setImpNote(waitBlockRef.current
          ? `상세 준비가 ${fmtDur(limitMs)}을 넘겨 기다리기를 멈췄습니다 — ${waitBlockRef.current}`
          : `상세 준비가 ${fmtDur(limitMs)}을 넘겨 기다리기를 멈췄습니다 — ${all.length}개 중 준비된 것이 없습니다.`
            + ` 상세는 분당 약 ${DETAIL_RATE_PER_MIN}개까지만 준비할 수 있고(네이버 보호 한도),`
            + ' 그마저도 관리자 도우미가 켜져 있을 때만 진행됩니다.');
        noteBlock(null);
        load(); loadCategories();
      }
    }, 5000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds]);

  const pageSize = 60;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  // 이미 올린 것 숨기기는 **이 페이지 안에서만** 걸러진다(서버 페이지네이션이라 그 이상은 못 한다).
  const visible = hideRegistered ? products.filter((p) => registeredAt[p.product_no] === undefined) : products;
  const registeredHere = products.filter((p) => registeredAt[p.product_no] !== undefined).length;
  // 이 페이지에서 실제로 등록까지 갈 수 있는 것 / 막힌 것 — 숫자를 먼저 보여 준다.
  // 전체 선택에서는 이미 올린 것을 뺀다 — 한 번 누르고 그대로 진행하면 같은 상품이 둘로 올라간다.
  //   (개별 체크는 그대로 둔다 — 다시 올릴 이유가 있는 사람까지 막을 일은 아니다)
  const selectTargets = visible.filter((p) => isPickable(p) && registeredAt[p.product_no] === undefined);
  const pickableCount = selectTargets.length;
  const blockedCount = visible.filter((p) => !isPickable(p)).length;

  /**
   * 고른 것 중 **상세가 아직 없는 것**이 몇 개인가 — 누르기 **전에** 알려주려고 센다.
   * ---------------------------------------------------------------------------
   * 상세 준비는 네이버 보호 한도(분당 약 12개)에 걸려 있어, 100개를 고르면 도우미가 완벽히
   * 정상이어도 최소 8.3분이 그 자리에서 사라진다. 그런데 예전 화면은 **누른 뒤에야** 그
   * 사실을 알려줬다 — 20분 안에 끝내려는 사람에게 예산의 절반을 몰래 태우게 한 셈이다.
   * 지금 이 목록에 있는 것만 셀 수 있으므로(다른 페이지에서 고른 것은 모른다) 하한으로 말한다.
   */
  const pickedHere = products.filter((p) => picked.has(p.id));
  const notReadyHere = pickedHere.filter((p) => p.detail_status !== 'done');
  const readyHere = pickedHere.length - notReadyHere.length;
  /** 고른 것 중 이미 올린 것 — 막지 않고, 누르기 전에 말한다. */
  const dupPicked = pickedHere.filter((p) => registeredAt[p.product_no] !== undefined);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
          <PackageSearch className="w-5 h-5 text-[#E31837]" /> 네이버 소싱 카탈로그
        </h1>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          수집해 둔 상품을 모아 봅니다. 수집은 관리자 PC 의 도우미가 하지만, 결과는 서버에 남아
          <b> 도우미 없이도</b> 여기서 확인할 수 있습니다.
        </p>
      </div>

      {/* 좌: 카테고리 트리(고정) · 우: 목록. 트리를 접으면 격자가 넓어진다. */}
      <div className={`grid gap-4 items-start ${treeOpen ? 'lg:grid-cols-[248px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {treeOpen && (
          <NaverCategoryTree
            tree={tree}
            counts={counts}
            all={allCount}
            selected={catPath}
            loading={catLoading}
            onSelect={(p) => { setPage(1); setPicked(new Set()); setCatPath(p); }}
          />
        )}

        <div className="min-w-0">
          {/* 브레드크럼은 트리를 접어도 남는다 — 지금 어느 가지를 보고 있는지가 사라지면 안 된다. */}
          <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
            <button
              onClick={() => setTreeOpen((v) => !v)}
              className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50"
            >
              {treeOpen ? '카테고리 접기' : '카테고리 열기'}
            </button>
            <button
              onClick={() => { setPage(1); setCatPath(''); }}
              className={catPath ? 'text-gray-500 hover:text-[#E31837]' : 'text-gray-900 font-semibold'}
            >
              전체
            </button>
            {catPath && catPath !== UNCLASSIFIED && catPath.split(PATH_SEP).map((name, i, arr) => {
              const upto = arr.slice(0, i + 1).join(PATH_SEP);
              const last = i === arr.length - 1;
              return (
                <span key={upto} className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  {last ? (
                    <span className="text-gray-900 font-semibold">{name}</span>
                  ) : (
                    <button onClick={() => { setPage(1); setCatPath(upto); }} className="text-gray-500 hover:text-[#E31837]">
                      {name}
                    </button>
                  )}
                </span>
              );
            })}
            {catPath === UNCLASSIFIED && (
              <span className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-gray-900 font-semibold">{UNCLASSIFIED}</span>
                <span className="text-xs text-gray-500">수집 경로가 트리에 붙지 않는 상품</span>
              </span>
            )}
            {(() => {
              const c = catPath ? counts[catPath] : allCount;
              return (
                <span className="ml-auto text-xs text-gray-500">
                  상품 <b className="text-gray-900 tabular-nums">{(c?.total ?? 0).toLocaleString()}</b>개
                  {' · '}상세 확보 <b className="text-emerald-700 tabular-nums">{(c?.ready ?? 0).toLocaleString()}</b>개
                </span>
              );
            })()}
          </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 flex items-end gap-2 flex-wrap">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(queryInput.trim()); }}
        >
          <label className="text-xs text-gray-600">
            상품명 검색
            <div className="mt-1 flex">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="예: 복숭아"
                className="px-3 py-2 rounded-l-lg border border-gray-200 text-sm w-64"
              />
              <button type="submit" className="px-3 py-2 rounded-r-lg bg-gray-900 text-white">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </label>
        </form>

        <label className="text-xs text-gray-600">
          정렬
          <select
            value={sort}
            onChange={(e) => { setPage(1); setSort(e.target.value as Sort); }}
            className="block mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="recent">최근 수집순</option>
            <option value="review">리뷰 많은순</option>
            <option value="price">가격 낮은순</option>
          </select>
        </label>

        <label className="text-xs text-gray-600 inline-flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={onlyDetail}
            onChange={(e) => { setPage(1); setOnlyDetail(e.target.checked); }}
          />
          바로 가져올 수 있는 것만
          <span className="text-gray-400">(상세 확보)</span>
        </label>

        <label
          className="text-xs text-gray-600 inline-flex items-center gap-2 pb-2"
          title="내 쿠팡 계정에 이미 올린 상품을 이 페이지에서 가립니다(서버 목록·페이지 번호는 그대로)."
        >
          <input
            type="checkbox"
            checked={hideRegistered}
            onChange={(e) => setHideRegistered(e.target.checked)}
          />
          이미 올린 것 숨기기{registeredHere > 0 ? ` (${registeredHere})` : ''}
        </label>

        <span className="ml-auto text-sm text-gray-500 pb-2">
          전체 <b className="text-gray-900">{total.toLocaleString()}</b>개
        </span>
      </div>

      {/* 카탈로그와 올인원을 잇는 지점.
          서버에서 오는 건 URL·JSON 뿐이고, 이미지는 내 PC 도우미가 CDN 에서 직접 받는다. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setPicked((prev) => {
            // 상세를 못 뽑는 상품·이미 올린 상품은 전체 선택에서 빠진다(selectTargets).
            const all = selectTargets.length > 0 && selectTargets.every((x) => prev.has(x.id));
            const next = new Set(prev);
            for (const x of selectTargets) { if (all) next.delete(x.id); else next.add(x.id); }
            return next;
          })}
          disabled={!pickableCount}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {pickableCount > 0 && selectTargets.every((x) => picked.has(x.id))
            ? '이 페이지 선택 해제'
            : `이 페이지 전체 선택 (${pickableCount}개)`}
        </button>
        <button
          onClick={runImport}
          disabled={!picked.size || importing || !!imp?.running || genRunning || !!pendingIds.length}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837] text-white text-sm font-medium hover:bg-[#c41230] disabled:opacity-40"
        >
          {importing || imp?.running || genRunning || pendingIds.length ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {pendingIds.length
            ? '상세 준비 중…'
            : genRunning
              ? '상세페이지 만드는 중…'
              : `선택한 ${picked.size.toLocaleString()}개 올인원으로 등록하기`}
        </button>
        {isAdmin && !!picked.size && !importing && (
          <button
            onClick={removePicked}
            disabled={deleting}
            title="카탈로그에서 지웁니다 — 잘못 수집된 상품을 치울 때 씁니다"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            선택 {picked.size.toLocaleString()}개 삭제
          </button>
        )}
        {!!picked.size && !importing && (
          <button onClick={() => setPicked(new Set())} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            선택 해제
          </button>
        )}
        {/* 무인 자동등록 — 검수 화면까지 가는 대신 **등록까지** 간다.
            위험을 감수하는 경로라 주 버튼과 헷갈리지 않게 외곽선으로만 표시한다. */}
        <button
          onClick={toggleAuto}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            autoOn
              ? 'border-[#E31837] bg-red-50 text-[#E31837]'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          title={autoOn
            ? '지금은 검수 화면을 거치지 않고 바로 등록합니다. 누르면 끕니다.'
            : '검수 화면을 거치지 않고 바로 쿠팡에 등록합니다. 위험 동의가 필요합니다.'}
        >
          {autoOn ? '🤖 무인 자동등록 켜짐' : '무인 자동등록'}
        </button>
        <span className="text-xs text-gray-500">
          {autoOn
            ? <>고르면 <b>가져오기 → 생성 → 등록</b>까지 사람 손 없이 갑니다 — <b className="text-[#E31837]">검수 화면을 거치지 않습니다.</b> 등록 직전 10초 동안은 취소할 수 있습니다.</>
            : <>누르면 <b>가져오기 → 상세페이지 생성 → 검수</b>까지 저절로 이어집니다(진행률·남은시간이 아래에 뜹니다). 네이버 로그인은 필요 없습니다.</>}
        </span>
        {/* ── 누르기 전에 말한다 — "이만큼은 기다려야 한다" ────────────────────
            상세가 없는 것을 고르면 그 수만큼 대기가 붙는다. 사람은 그걸 모른 채 눌렀다가
            0단계에서 몇 분을 흘려보냈다. 숫자와 함께, 한 번에 고칠 수 있는 길을 같이 준다. */}
        {notReadyHere.length > 0 && !importing && !imp?.running && !pendingIds.length && (
          <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span>
              고른 것 중 <b>{notReadyHere.length}개</b>는 상세를 아직 안 받아 둔 상품입니다 —
              먼저 준비하는 데 <b>약 {fmtDur((notReadyHere.length / DETAIL_RATE_PER_MIN) * 60_000)}</b>이
              더 걸립니다(네이버 보호 한도 분당 {DETAIL_RATE_PER_MIN}개).
              {readyHere > 0 && <> 지금 바로 시작할 수 있는 건 <b>{readyHere}개</b>입니다.</>}
            </span>
            <span className="flex-1" />
            {readyHere > 0 && (
              <button
                onClick={() => setPicked((prev) => {
                  const next = new Set(prev);
                  for (const p of notReadyHere) next.delete(p.id);
                  return next;
                })}
                className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100"
              >
                상세 확보된 {readyHere}개만 남기기
              </button>
            )}
            <button
              onClick={() => { setPage(1); setOnlyDetail(true); }}
              className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100"
            >
              확보된 것만 보기
            </button>
          </div>
        )}
        {/* ── 이미 올린 상품을 골랐다 ─────────────────────────────────────────
            막지 않는다. 다시 올릴 이유가 있는 사람이 있고(가격·상세 갈아엎기), 여기서 아는 것은
            "메가로드로 올린 기록"뿐이라 단정할 수도 없다. 대신 **누르기 전에** 말한다. */}
        {dupPicked.length > 0 && !dupDismissed && !importing && !imp?.running && !pendingIds.length && (
          <div className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-4 h-4 flex-none" />
            <span>
              고른 것 중 <b>{dupPicked.length}개</b>는 <b>내 쿠팡 계정에 이미 올린 상품</b>입니다 —
              그대로 진행하면 같은 상품이 둘로 올라갑니다.
            </span>
            <span className="flex-1" />
            <button
              onClick={() => setPicked((prev) => {
                const next = new Set(prev);
                for (const p of dupPicked) next.delete(p.id);
                return next;
              })}
              className="px-2.5 py-1 rounded-md border border-blue-300 bg-white text-blue-900 font-medium hover:bg-blue-100"
            >
              {dupPicked.length}개 빼기
            </button>
            <button
              onClick={() => setDupDismissed(true)}
              title="알고도 다시 올립니다 — 이 페이지에서는 다시 묻지 않습니다."
              className="px-2.5 py-1 rounded-md border border-blue-300 bg-white text-blue-900 font-medium hover:bg-blue-100"
            >
              그대로 가져오기
            </button>
          </div>
        )}
        {registeredHere > 0 && !hideRegistered && (
          <span className="w-full text-xs text-gray-600 border-t border-gray-100 pt-2 mt-1">
            이 페이지의 <b>{registeredHere}개</b>는 내가 이미 올린 상품이라 <b>전체 선택에서 뺐습니다</b> —
            다시 올리려면 카드에서 직접 고르면 됩니다.
          </span>
        )}
        {blockedCount > 0 && (
          <span className="w-full text-xs text-gray-600 border-t border-gray-100 pt-2 mt-1">
            이 페이지의 <b>{blockedCount}개</b>는 네이버 마켓·쇼핑윈도 상품이라 아직 상세를 가져올 수
            없어 선택에서 제외했습니다. (스마트스토어·브랜드스토어 상품만 등록됩니다)
          </span>
        )}
      </div>

      {impNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4 inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {impNote}
        </div>
      )}

      {/* ── 0단계 · 상세 준비 대기 ───────────────────────────────────────────
          고른 상품에 상세(옵션·상세글·고시정보)가 없으면 관리자 도우미가 네이버 상품 페이지를
          직접 열어 뽑아야 한다. 실측 1~1분 반. 예전엔 이 구간에 노란 배너 한 줄뿐이라
          "눌렀는데 아무 일도 안 난다"로 보였다 — 시계와 예상치를 붙인다. */}
      {!!waitStartedAt && !!pendingIds.length && (() => {
        const elapsed = Math.max(0, nowTick - waitStartedAt);
        // 예상치는 **건수에 비례**한다. 1개 기준 90초를 100개에도 쓰면 30초 만에 "예상 초과"가
        // 떠서, 정상 진행 중인 100개짜리 작업이 매번 고장처럼 보인다.
        const typicalMs = Math.max(90_000, (waitCount / DETAIL_RATE_PER_MIN) * 60_000);
        // 진행률은 시계가 아니라 **실제로 준비된 개수**로 잰다 — 그게 사람이 알고 싶은 것이다.
        const pct = waitCount > 0 && waitReady > 0
          ? Math.min(95, Math.round((waitReady / waitCount) * 100))
          : Math.min(95, Math.round((elapsed / typicalMs) * 100));
        const late = elapsed > typicalMs * 2;
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-700 flex-none" />
              <span className="text-sm font-semibold text-amber-900">
                0단계 · 상세 준비 중 ({waitReady}/{waitCount}개)
              </span>
              <span className="flex-1" />
              {/* 예상을 넘긴 뒤에도 95%를 띄우면 "거의 다 됐다"는 거짓말이 된다 —
                  실측 2026-08-21: 아무도 안 가져간 채 27분째 95%였다. */}
              <span className="text-sm font-bold text-amber-800 tabular-nums">
                {late ? '예상 초과' : `${pct}%`}
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-amber-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${late ? 'bg-amber-400/70 animate-pulse' : 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-900">
              <span>경과 <b className="tabular-nums">{fmtDur(elapsed)}</b></span>
              {/* 남은시간은 게이트 상한(분당 12건)에서 나온다 — 감이 아니라 계산이다. */}
              <span>예상 <b className="tabular-nums">{fmtDur(typicalMs)}</b></span>
              <span className="text-amber-700">상세 준비는 분당 약 {DETAIL_RATE_PER_MIN}개까지입니다(네이버 보호 한도)</span>
              {!waitBlock && <span className="text-amber-700">준비되는 즉시 가져오기·생성으로 이어집니다</span>}
              <span className="flex-1" />
              {/* 다 기다리는 게 기본이지만, 급하면 여기로 빠져나간다 — 두고 가는 수를 버튼에 적는다. */}
              {waitReady > 0 && waitReady < waitCount && (
                <button
                  onClick={() => void importReadyNow()}
                  title="지금 준비된 것만 가져옵니다. 나머지는 이번 판에 안 들어갑니다."
                  className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100"
                >
                  준비된 {waitReady}개만 지금 가져오기 ({waitCount - waitReady}개 두고)
                </button>
              )}
            </div>

            {/* 기다려도 소용없는 이유를 **알면** 말한다. 모르면 아무 말도 하지 않는다. */}
            {waitBlock && (
              <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 leading-snug">
                <b className="inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> 지금은 아무도 이 요청을 가져가지 못합니다</b>
                <br />{waitBlock}
              </div>
            )}
            <p className="text-[11px] text-amber-700 leading-snug mt-2">
              고르신 상품은 <b>상세를 아직 안 받아 둔 것</b>이라, 관리자 도우미가 네이버 상품
              페이지를 열어 옵션·상세글·고시정보·사진을 먼저 가져옵니다.
              <b> 상세 확보</b> 배지가 붙은 상품을 고르면 이 대기가 없습니다.
              {late && ' 앞에 밀린 요청이 있으면 순번을 기다립니다 — 8분까지 기다린 뒤 멈춥니다.'}
            </p>
          </div>
        );
      })()}

      {/* ── 진행 패널 ────────────────────────────────────────────────────────
          한 번 누르면 검수까지 간다. 그 사이 두 단계(① 가져오기 ② 상세페이지 생성)를
          한 화면에 이어 붙여 "지금 어디쯤이고 얼마나 남았는지"를 계속 말한다. */}
      {imp && (imp.running || imp.done > 0 || imp.gen?.running) && (() => {
        const g = imp.gen ?? null;
        // 누끼할 대표컷이 없으면(과일·음식) '검수준비완료' 신호 없이 그냥 끝난다 — 그때는 종료가 완료다.
        const genOk = !!g && !g.running && g.code === 0 && !g.error;
        const genReady = !!g && !g.error && (g.reviewReady || genOk);
        const step = g?.phase ? GEN_STEP_META[g.phase] : null;
        const genPct = genOk ? 100 : (g && g.total > 0 ? Math.min(100, Math.round((g.done / g.total) * 100)) : null);
        const impPct = imp.total ? Math.round((imp.done / imp.total) * 100) : 0;
        const elapsedMs = g?.startedAt ? Math.max(0, nowTick - g.startedAt) : 0;
        const remainMs = etaMs ? Math.max(0, etaMs.ms - (nowTick - etaMs.at)) : null;
        // 4분 넘게 진행 갱신이 없으면 안내한다(첫 모델 로딩은 원래 길 수 있다).
        const stalled = !!g?.running && !!step && nowTick - g.updatedAt > 240_000;
        return (
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4 space-y-3">
            {/* ① 가져오기 — 사진·정보를 내 PC 로. 몇 초면 끝난다. */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">
                  1단계 · 상품 가져오기 {imp.running ? '진행 중' : (imp.stopped || '완료')}
                </span>
                <span className="text-gray-500">{imp.done}/{imp.total} · 성공 {imp.ok} · 실패 {imp.failed}</span>
              </div>
              <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#E31837] transition-all" style={{ width: `${impPct}%` }} />
              </div>
              {imp.running && imp.current && <p className="text-xs text-gray-500 mt-2 truncate">지금: {imp.current}</p>}
            </div>

            {/* ② 상세페이지 생성 — 여기가 진짜 오래 걸리는 구간이다. */}
            {g && (g.running || g.startedAt > 0) && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-3">
                <div className="flex items-center gap-2">
                  {g.running && <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse flex-none" />}
                  <span className="text-sm font-semibold text-indigo-900">
                    2단계 · {g.error
                      ? '상세페이지 생성 실패'
                      : !g.running
                        ? '상세페이지 생성 완료'
                        : step
                          ? `${step.idx}/3 ${step.label}`
                          : 'AI 엔진 준비 중 (모델 로딩)'}
                  </span>
                  <span className="flex-1" />
                  {genPct != null && !g.error && (
                    <span className="text-sm font-bold text-indigo-700 tabular-nums">{genPct}%</span>
                  )}
                </div>

                <div className="mt-2 h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
                  {genPct != null
                    ? <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${genPct}%` }} />
                    : <div className="h-full w-1/3 bg-indigo-400/70 rounded-full animate-pulse" />}
                </div>

                {!g.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-indigo-800">
                    {step && g.running && <span>진행 <b className="tabular-nums">{g.done}/{g.total}</b>건</span>}
                    <span>경과 <b className="tabular-nums">{fmtDur(elapsedMs)}</b></span>
                    {g.running && (remainMs != null
                      ? <span>남은 예상 <b className="tabular-nums">약 {fmtDur(remainMs)}</b></span>
                      : <span className="text-indigo-500">남은 시간 계산 중…</span>)}
                    <span className="text-indigo-500">상품 {g.products}개</span>
                  </div>
                )}

                {!step && g.running && (
                  <p className="text-[11px] text-indigo-500 leading-snug mt-2">
                    상품명·상세글을 쓰는 AI 와 사진을 보는 AI 를 올리는 중입니다.
                    최초 1회는 내려받기까지 있어 수 분 걸릴 수 있어요 — 정상 진행 중입니다.
                  </p>
                )}
                {stalled && (
                  <p className="text-[11px] text-amber-700 leading-snug mt-2">
                    4분 넘게 진행이 멈춰 있습니다 — 메모리(RAM·VRAM)가 모자랄 수 있습니다.
                    도우미 앱의 로그에서 원인을 볼 수 있습니다.
                  </p>
                )}
                {g.error && (
                  <p className="text-xs text-red-700 leading-snug mt-2">
                    {g.error}
                    <br />
                    폴더는 <code className="text-[11px]">{g.folder || imp.rootDir}</code> 에 남아 있습니다 —
                    올인원 화면에서 직접 골라 다시 실행할 수 있습니다.
                  </p>
                )}
                {genReady && (
                  <p className="text-xs text-emerald-700 mt-2">
                    검수 준비 완료 — 검수 화면으로 이동합니다.
                    {' '}
                    <a href="/megaload/products/allinone?load=1" className="underline font-medium">
                      바로 열기
                    </a>
                    {g.running && ' (대표사진 누끼는 뒤에서 계속 처리됩니다)'}
                  </p>
                )}
              </div>
            )}

            {/* 생성이 아예 안 붙은 경우(구버전 도우미 등)에도 어디에 저장됐는지는 말한다. */}
            {!imp.running && imp.ok > 0 && !g?.startedAt && (
              <p className="text-xs text-gray-500">
                저장 위치: <code className="text-[11px]">{imp.rootDir}</code>
              </p>
            )}
          </div>
        );
      })()}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
          {err}
        </div>
      )}

      {/* 무인 자동등록 동의 — 검수 화면이 쓰는 **그 모달 그대로**다.
          통로를 새로 파면 한쪽이 느슨해진다. preArm = 아직 상품이 없는 시점의 사전 무장. */}
      <SkipReviewRiskModal
        open={autoOpen}
        plan={{ count: 0, excluded: 0, needsReview: 0, unresolvedOptions: 0, certRisk: 0 }}
        helperOnline={helperOnline}
        preArm
        onConfirm={confirmAuto}
        onCancel={() => setAutoOpen(false)}
      />

      {loading ? (
        <div className="py-20 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          {/* ⚠️ 필터 때문에 빈 것을 "수집된 상품이 없다"고 하면 거짓말이 된다 —
              목록은 쌓여 있는데 상세만 아직 없는 상태다. 갈라서 말한다. */}
          {onlyDetail ? (
            <>
              <p className="text-gray-700 font-medium">바로 가져올 수 있는 상품이 아직 없습니다.</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                목록은 수집돼 있지만 <b>상세(옵션·상세글·고시정보)</b>가 아직 안 뽑힌 상태입니다.
                상세는 <b>고른 뒤 요청</b>하면 뽑히고, 준비되는 대로 이어서 가져옵니다.
              </p>
              <button
                onClick={() => { setPage(1); setOnlyDetail(false); }}
                className="mt-3 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                전체 보기 (상세 없는 것 포함)
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-700 font-medium">아직 수집된 상품이 없습니다.</p>
              <p className="text-sm text-gray-500 mt-1">
                관리자가 <b>네이버 소싱</b> 화면에서 카테고리를 수집하면 여기에 쌓입니다.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {visible.map((p) => {
              const pickable = isPickable(p);
              const storeType = naverStoreType(p.url);
              // 이미 올린 상품 — 값이 있으면 등록 시각(빈 문자열이면 시각을 모르는 옛 기록).
              const regAt = registeredAt[p.product_no];
              return (
              <div
                key={p.id}
                className={`rounded-xl border bg-white overflow-hidden hover:shadow-sm transition ${picked.has(p.id) ? 'border-[#E31837] ring-1 ring-[#E31837]' : 'border-gray-200'} ${pickable ? '' : 'opacity-70'}`}
              >
                <div className="relative aspect-square bg-gray-100">
                  <label
                    className={`absolute top-2 left-2 z-10 bg-white/90 rounded p-1 ${pickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    title={!pickable
                      ? `${STORE_TYPE_LABEL[storeType]} 상품은 아직 상세를 가져올 수 없습니다.`
                      : regAt !== undefined
                        ? '내 쿠팡 계정에 이미 올린 상품입니다 — 골라도 되지만 같은 상품이 둘로 올라갑니다.'
                        : undefined}
                  >
                    <input
                      type="checkbox"
                      aria-label={pickable ? `${p.title} 선택` : `${p.title} — 상세 추출 미지원이라 선택할 수 없습니다`}
                      checked={picked.has(p.id)}
                      disabled={!pickable}
                      onChange={(e) => setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        return next;
                      })}
                    />
                  </label>
                  {p.thumb
                    // 네이버 CDN — next/image 최적화를 태우면 우리 서버 트래픽만 는다.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : null}
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-gray-800 line-clamp-2 leading-snug h-8">{p.title}</p>
                  <p className="text-sm font-bold text-gray-900 mt-1.5">
                    {p.price ? `${p.price.toLocaleString()}원` : '-'}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-400">
                      리뷰 {p.review_count ? p.review_count.toLocaleString() : 0}
                    </span>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-[#E31837]"
                      aria-label="네이버에서 열기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {/* ★ 내가 이미 올린 상품 — 가져오기 전에 알아야 헛돈다(가져오기·생성·검수를 다 돈 뒤에야
                      알게 되던 자리다). 막지는 않는다 — 다시 올릴 이유가 있는 사람이 있다. */}
                  {regAt !== undefined && (
                    <span
                      className="mt-1.5 mr-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                      title="메가로드로 등록한 기록 기준입니다. 윙에서 직접 올린 상품은 여기에 안 잡힙니다."
                    >
                      이미 올림{regAt ? ` · ${regAt.slice(0, 10)}` : ''}
                    </span>
                  )}
                  {p.detail_status === 'done' && (
                    <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      상세 확보
                    </span>
                  )}
                  {/* ★ 못 고르는 이유를 카드에 적는다. 예전엔 아무 표시가 없어서 "눌렀는데
                      아무 일도 안 난다"로만 보였다(실측: 마켓·윈도 3건이 그렇게 방치됐다). */}
                  {!pickable && (
                    <span
                      className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200"
                      title={`${STORE_TYPE_LABEL[storeType]} 상품은 아직 상세를 가져올 수 없습니다.`}
                    >
                      {STORE_TYPE_LABEL[storeType]} · 상세 미지원
                    </span>
                  )}
                  {pickable && p.detail_status === 'failed' && (
                    <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                      상세 실패 — 다시 시도
                    </span>
                  )}
                  {(p.detail_status === 'requested' || p.detail_status === 'running') && (
                    <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      상세 준비 중
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {visible.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-700">
                이 페이지의 <b>{products.length}개</b>는 모두 내가 이미 올린 상품이라 가렸습니다.
              </p>
              <button
                onClick={() => setHideRegistered(false)}
                className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
              >
                숨기기 끄고 보기
              </button>
            </div>
          )}

          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">{page} / {lastPage}</span>
              <button
                onClick={() => setPage((n) => Math.min(lastPage, n + 1))}
                disabled={page >= lastPage}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </div>
  );
}
