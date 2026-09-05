/**
 * 네이버 소싱 수집 모듈 — **관리자 전용**.
 * ---------------------------------------------------------------------------
 * 카테고리를 훑어 상품을 수집하고, 셀러가 대량등록할 카탈로그로 올린다.
 * 실제 수집은 이 PC(가정 IP)의 내장 크롬으로만 가능하다 — 서버(datacenter IP)는 차단된다.
 *
 * 이 파일은 **앱 탭 조종석**일 뿐이고, 수집 코어는 service.mjs 가 단독으로 소유한다.
 * 웹 대시보드(localhost pair-server 경유)도 같은 service 를 호출하므로, 어느 쪽에서
 * 조작하든 창 풀은 하나다(두 벌이 돌면 네이버 예산을 두 배로 태운다).
 *
 * ⚠️ 여기서의 관리자 판정은 **UI 편의**일 뿐 보안 경계가 아니다. 앱은 사용자 PC 에 깔리므로
 *   화면을 숨기는 것으로는 못 막는다. 진짜 차단은 서버가 한다 — 잡 클레임 RPC 와 업로드
 *   API 가 role='admin' 을 검증하며, 관리자가 아니면 잡 자체를 못 받아 수집이 시작되지 않는다.
 */
import * as svc from './service.mjs';
import { startGeneration } from '../../allinone-runner.mjs';

export default {
  id: 'naver-ingest',
  label: '네이버 소싱',
  icon: '🔎',
  order: 5,
  events: ['naver-ingest:log', 'naver-ingest:status'],

  setup(ctx) {
    svc.initService({
      store: ctx.store,
      send: ctx.send,
      userDataDir: ctx.paths.userData,
      getAccount: () => ctx.services?.runner?.account || null,
      // 상세 결과를 도우미가 **직접** 서버에 올리기 위한 것들. 브라우저 탭에 기대면
      // 몇 시간짜리 추출이 끝날 때 아무도 화면을 안 보고 있어 저장이 통째로 유실된다.
      // ★ accessToken 게터가 아니라 token() 을 쓴다. 게터는 **디코드용**이라 만료된 값을 그대로
      //   주고(실측: 서버가 401), token() 은 만료됐으면 refresh 까지 해서 유효한 걸 준다.
      getToken: async () => {
        const s = ctx.services?.runner?.session;
        if (!s) return null;
        try { return await s.token(); } catch { return null; }
      },
      webOrigin: ctx.services?.webOrigin || null,
      // 상세 추출이 끝나면 그 폴더를 올인원에 그대로 넘긴다 — 사람이 폴더를 다시 고르지 않게.
      //   confirmSlow 는 일부러 넘기지 않는다: 추출은 몇십 분짜리라 끝날 때쯤 사람이 화면 앞에
      //   없다. 모달을 띄우면 아무도 안 눌러 생성이 영영 시작되지 않는다(경고만 로그로 남는다).
      //   진행(onProgress)·검수가능(onReviewReady)·완료(onDone)는 service 가 받아 상태로 쌓고,
      //   웹은 그걸 폴링해 진행률·남은시간을 그린다. 여기서는 그대로 통과시키기만 한다.
      runAllinone: ({ folder, onProgress, onReviewReady, onDone, shouldOpenReview }) => startGeneration({
        services: ctx.services,
        paths: ctx.paths,
        store: ctx.store,
        send: ctx.send,
        folder,
        onProgress,
        onReviewReady,
        onDone: (code, reason) => {
          try { onDone?.(code, reason); } catch { /* 상태 갱신 실패가 창 열기를 막지 않는다 */ }
          if (code !== 0) return;
          // 웹 화면이 진행을 지켜보고 있으면 그쪽이 스스로 검수로 넘어간다 — 창을 또 열면 탭이 둘이 된다.
          try { if (shouldOpenReview && !shouldOpenReview()) return; } catch { /* 판단 실패면 연다 */ }
          try {
            const origin = ctx.services?.webOrigin || 'https://www.megaload.co.kr';
            // ?load=1 = "방금 만든 결과를 바로 띄워라". 이게 없으면 검수 화면이 빈 채로 열려
            // 사람이 '이전 생성결과 불러오기'를 손으로 눌러야 했다(자동 연결이 거기서 끊겼다).
            ctx.openUrl(`${origin}/megaload/products/allinone?load=1`);
          } catch { /* 브라우저 열기 실패는 치명적 아님 — 결과는 이미 저장됨 */ }
        },
      }),
    });
  },

  ipc: {
    'naver-ingest:status': () => svc.getStatus(),
    'naver-ingest:set-windows': (_ctx, { count } = {}) => svc.setWindows(count),
    'naver-ingest:start': () => svc.start(),
    'naver-ingest:stop': () => svc.stop(),
    'naver-ingest:test-one': (_ctx, { url } = {}) => svc.testOne(url),
    'naver-ingest:show-window': (_ctx, { index } = {}) => svc.showWindow(index),
    'naver-ingest:categories': (_ctx, { parent, force } = {}) => svc.categories(parent, force),
    'naver-ingest:categories-prewarm': (_ctx, { depth } = {}) => svc.startPrewarm({ depth }),
    'naver-ingest:categories-prewarm-stop': () => svc.stopPrewarm(),
    'naver-ingest:categories-export': () => svc.exportCategories(),
    'naver-ingest:probe': (_ctx, { catId } = {}) => svc.probePage(catId),
    'naver-ingest:probe-product': (_ctx, { url } = {}) => svc.probeProduct(url),
    'naver-ingest:login': () => svc.openNaverLogin(),
    'naver-ingest:logout': () => svc.naverLogout(),
    'naver-ingest:credentials': () => svc.credentialStatus(),
    'naver-ingest:credentials-save': (_ctx, { id, pw } = {}) => svc.saveNaverCredential({ id, pw }),
    'naver-ingest:credentials-clear': () => svc.clearNaverCredential(),
    'naver-ingest:login-auto': () => svc.autoLoginNow({ byHuman: true }),
    'naver-ingest:detail': (_ctx, payload = {}) => svc.startDetailExtract(payload),
    'naver-ingest:detail-stop': () => svc.stopDetailExtract(),
    'naver-ingest:detail-state': () => svc.getDetailState(),
    'naver-ingest:import': (_ctx, payload = {}) => svc.importProducts(payload),
    'naver-ingest:import-state': () => svc.getImportState(),
    'naver-ingest:queue': (_ctx, { on, idle } = {}) => svc.setQueueWorker({ on, idle }),
    'naver-ingest:queue-tick': () => svc.kickQueue(),
    'naver-ingest:collect': (_ctx, payload = {}) => svc.startCollect(payload),
    'naver-ingest:collect-stop': () => svc.stopCollect(),
    'naver-ingest:collection': () => svc.getCollection(),
  },

  onQuit: () => svc.shutdown(),
};
