/**
 * 세션 공유 검증 — "품절 감시 창"과 "소싱 수집 창"이 정말 같은 쿠키를 쓰는가.
 * ---------------------------------------------------------------------------
 * 이게 참이어야 사람이 소싱 화면에서 네이버 로그인 1회 → 품절 감시도 로그인 상태로 조회한다.
 * 세션 객체 동일성으로 판정한다(문자열 비교는 오타를 못 잡고, 쿠키 왕복은 느리다).
 *
 * 실행:
 *   cd worker/desktop
 *   npx --yes electron@33 scripts/naver-session-check.mjs
 */
import { app, BrowserWindow, session } from 'electron';

const out = (s) => process.stdout.write(s + '\n');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let failed = 0;
  try {
    const { NAVER_PARTITION, loginState } = await import('../main/naver-session.mjs');
    const { ScrapeWindow } = await import('../main/modules/naver-ingest/browser.mjs');
    const fetchMod = await import('../main/modules/stock-monitor/naver-fetch.mjs');

    const shared = session.fromPartition(NAVER_PARTITION);
    out(`공유 파티션: ${NAVER_PARTITION}`);

    // ① 소싱 수집 창
    const sw = new ScrapeWindow(0);
    await sw.ensure();
    const ingestSame = sw.wc.session === shared;
    out(`① 소싱 수집 창  → 공유 세션 ${ingestSame ? '✅ 일치' : '❌ 불일치'}`);
    if (!ingestSame) failed++;

    // ② 품절 감시 창 — 모듈이 자기 방식대로(warmUpSession) 창을 만들게 두고 결과를 본다.
    const before = new Set(BrowserWindow.getAllWindows());
    await fetchMod.warmUpSession();
    const monitorWins = BrowserWindow.getAllWindows().filter((w) => !before.has(w));
    if (!monitorWins.length) {
      out('② 품절 감시 창  → ❌ 창이 만들어지지 않음(electron 로드 실패?)');
      failed++;
    } else {
      const monitorSame = monitorWins.every((w) => w.webContents.session === shared);
      out(`② 품절 감시 창  → 공유 세션 ${monitorSame ? '✅ 일치' : '❌ 불일치'}`);
      if (!monitorSame) failed++;
    }

    // ③ 리소스 차단 리스너가 살아있는지 — 둘이 각자 걸면 서로를 지운다(세션당 리스너 1개).
    //    간접 확인: 워밍업이 실제로 통과했는지(쿠키가 심겼는지)로 본다.
    const cookies = await shared.cookies.get({ domain: '.naver.com' });
    out(`③ 공유 세션 네이버 쿠키: ${cookies.length}개 (${cookies.map((c) => c.name).slice(0, 6).join(', ')})`);

    // ④ 지금 로그인 상태 — 2단계(스마트스토어 실측)로 갈 수 있는지의 전제.
    const st = await loginState();
    out(`④ 네이버 로그인: ${st.loggedIn ? '✅ 되어 있음' : '⬜ 아직 안 됨(로그인 필요)'}`);

    out(failed ? `\n결과: ❌ 실패 ${failed}건` : '\n결과: ✅ 세션 공유 정상');
  } catch (e) {
    out('❌ 예외: ' + (e?.stack || e));
    failed++;
  }
  app.exit(failed ? 1 : 0);
});
