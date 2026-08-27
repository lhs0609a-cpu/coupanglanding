/** 리뷰 갤러리 API 응답 구조 실측 — 이미지 URL 이 어느 필드에 있는지 확정한다. */
import { withProbeTab, say } from './_probe-tab.mjs';

const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

const CALL = `
(async () => {
  // ★ 주소를 재구성하지 않는다 — 파라미터 하나만 달라도 400 이 온다(실측: pageSize 를 20 으로
  //   바꿨더니 400). 페이지가 실제로 부른 주소를 그대로 재생한다.
  const mark = '/n/v1/contents/reviews/gallery-attaches/';
  let full = null;
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    if (u.indexOf(mark) >= 0) { full = u; break; }
  }
  if (!full) return { error: 'gallery-attaches 호출을 못 봄(스크롤 부족?)' };

  const res = await fetch(full, { credentials: 'include', headers: { accept: 'application/json' } });
  if (!res.ok) return { error: 'HTTP ' + res.status, full };
  const j = await res.json();

  const shape = (o, d) => {
    if (Array.isArray(o)) return 'array[' + o.length + ']' + (o.length ? ' of ' + JSON.stringify(shape(o[0], d - 1)).slice(0, 400) : '');
    if (o && typeof o === 'object') {
      if (d <= 0) return Object.keys(o).slice(0, 20);
      const r = {};
      for (const k of Object.keys(o).slice(0, 20)) r[k] = shape(o[k], d - 1);
      return r;
    }
    return typeof o === 'string' ? String(o).slice(0, 80) : typeof o;
  };
  const sample = (j.contents || []).slice(0, 4).map((c) => ({
    attachPath: c.representAttach && c.representAttach.attachPath,
    attachType: c.representAttach && c.representAttach.attachType,
    totalAttachCount: c.totalAttachCount,
  }));
  return { full, total: j.totalElements, sample };
})()`;

withProbeTab(async (tab) => {
  const nav = await tab.gotoViaClick(URL_ARG, { timeoutMs: 20000 });
  if (!nav.ok) { say('❌ 이동 실패: ' + (nav.error || 'unknown')); return; }
  await new Promise((r) => { const t = setTimeout(r, 2500); t.unref?.(); });
  // 리뷰 갤러리 위젯은 내려가야 뜬다. 진짜 휠로 굴린다(합성 스크롤은 지연 렌더를 못 깨운다).
  await tab.page.wheel({ steps: 10, deltaY: 700, pauseMs: [400, 700] }).catch(() => {});
  await new Promise((r) => { const t = setTimeout(r, 2000); t.unref?.(); });
  const d = await tab.evaluate(CALL).catch((e) => ({ error: String(e?.message || e) }));
  say(JSON.stringify(d, null, 1).slice(0, 4000));
})
  .then(() => process.exit(0))
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
