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
    'naver-ingest:collect': (_ctx, payload = {}) => svc.startCollect(payload),
    'naver-ingest:collect-stop': () => svc.stopCollect(),
    'naver-ingest:collection': () => svc.getCollection(),
  },

  onQuit: () => svc.shutdown(),
};
