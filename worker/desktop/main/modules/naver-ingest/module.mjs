/**
 * 네이버 소싱 수집 모듈 — **관리자 전용**.
 * ---------------------------------------------------------------------------
 * 카테고리를 훑어 상품을 수집하고, 셀러가 대량등록할 카탈로그로 올린다.
 * 실제 수집은 이 PC(가정 IP)의 내장 크롬으로만 가능하다 — 서버(datacenter IP)는 차단된다.
 *
 * ⚠️ 여기서의 관리자 판정은 **UI 편의**일 뿐 보안 경계가 아니다. 앱은 사용자 PC 에 깔리므로
 *   화면을 숨기는 것으로는 못 막는다. 진짜 차단은 서버가 한다 — 잡 클레임 RPC 와 업로드
 *   API 가 role='admin' 을 검증하며, 관리자가 아니면 잡 자체를 못 받아 수집이 시작되지 않는다.
 */
import naverGate from '../../naver-gate.mjs';
import { WindowPool, WINDOW_MIN, WINDOW_MAX, WINDOW_DEFAULT } from './window-pool.mjs';
import { runOne } from './runner.mjs';

let pool = null;
let ctxRef = null;

const log = (m) => { try { ctxRef?.send('naver-ingest:log', m); } catch { /* ignore */ } };
const pushStatus = (s) => { try { ctxRef?.send('naver-ingest:status', s); } catch { /* ignore */ } };

function isAdmin(ctx) {
  const role = ctx?.services?.runner?.account?.role;
  return role === 'admin';
}

function ensurePool() {
  if (pool) return pool;
  pool = new WindowPool({ onLog: log, onStatus: pushStatus });
  const saved = ctxRef?.store?.get('naverIngestWindows', WINDOW_DEFAULT);
  pool.setCount(saved);
  return pool;
}

/** 관리자가 아니면 여기서 끊는다(서버 검증과 이중). */
function requireAdmin(ctx) {
  if (!ctx?.services?.runner?.loggedIn) throw new Error('메가로드에 먼저 연결하세요.');
  if (!isAdmin(ctx)) throw new Error('관리자 계정만 사용할 수 있습니다.');
}

export default {
  id: 'naver-ingest',
  label: '네이버 소싱',
  icon: '🔎',
  order: 5,
  events: ['naver-ingest:log', 'naver-ingest:status'],

  setup(ctx) {
    ctxRef = ctx;
    // 쿨다운 영속 — 앱을 재시작해도 밴 중이면 계속 쉰다(재시작으로 회피하면 밴이 깊어진다).
    naverGate.init(ctx.paths.userData);
    const st = naverGate.state();
    if (st.cooling) {
      log(`이전 실행에서 걸린 네이버 쿨다운이 ${Math.ceil(st.cooldownMsLeft / 1000)}초 남아 있습니다 — 그만큼 쉬고 시작합니다`);
    }
    naverGate.onChange(() => { if (pool) pushStatus(pool.status()); });
  },

  ipc: {
    'naver-ingest:status': (ctx) => ({
      isAdmin: isAdmin(ctx),
      loggedIn: !!ctx?.services?.runner?.loggedIn,
      account: ctx?.services?.runner?.account || null,
      limits: { min: WINDOW_MIN, max: WINDOW_MAX, default: WINDOW_DEFAULT },
      ...(pool ? pool.status() : {
        running: false,
        configured: ctx.store.get('naverIngestWindows', WINDOW_DEFAULT),
        effective: 0, active: 0, waiting: 0, windows: [], gate: naverGate.state(),
      }),
    }),

    /** 동시 창 개수 변경 — 실행 중에도 즉시 반영된다. */
    'naver-ingest:set-windows': (ctx, { count } = {}) => {
      requireAdmin(ctx);
      const n = ensurePool().setCount(count);
      ctx.store.set('naverIngestWindows', n);
      log(`동시 창 ${n}개로 설정했습니다${n > 4 ? ' (4개를 넘으면 처리량은 안 늘고 메모리만 더 씁니다)' : ''}`);
      return n;
    },

    'naver-ingest:start': async (ctx) => {
      requireAdmin(ctx);
      const p = ensurePool();
      log(`수집 창 ${p.configured}개를 준비합니다…`);
      await p.start();
      log('준비 완료.');
      return p.status();
    },

    'naver-ingest:stop': async () => {
      if (!pool) return true;
      await pool.stop();
      log('수집을 멈추고 창을 정리했습니다.');
      return true;
    },

    /**
     * 연결 확인 — 상품 1건을 클릭 이동으로 열어 상품명·가격을 뽑아본다.
     * P0 의 합격 기준이 이것이다: "직접 URL 없이 상품 1건 열기 성공".
     */
    'naver-ingest:test-one': async (ctx, { url } = {}) => {
      requireAdmin(ctx);
      if (!url) throw new Error('상품 URL 을 입력하세요.');
      const p = ensurePool();
      if (!p.running) { log('창을 준비합니다…'); await p.start(); }
      log(`테스트 시작 — ${url}`);
      const t0 = Date.now();
      const r = await runOne(p, url, {
        onLog: log,
        onCaptcha: (i) => log(`창 ${i + 1} 에서 캡차를 풀어주세요.`),
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (r?.ok) {
        log(`✅ 성공(${secs}초, 시도 ${r.attempt}회) — ${r.data.name} / ${r.data.price ? r.data.price.toLocaleString() + '원' : '가격 미확인'}`);
      } else {
        log(`❌ 실패(${secs}초) — ${r?.error || '알 수 없음'}`);
      }
      return r;
    },

    /** 캡차를 풀도록 해당 창을 화면에 띄운다. */
    'naver-ingest:show-window': (ctx, { index } = {}) => {
      const slot = pool?.slots?.find((s) => s.index === index);
      slot?.sw?.show();
      return !!slot;
    },
  },

  onQuit: () => { try { pool?.stop(); } catch { /* ignore */ } },
};
