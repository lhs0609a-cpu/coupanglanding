/** 상품/상세 API 원본 응답 구조 — 옵션·본문이 왜 비는지 확인. */
import { probeUrl, say } from './_probe-tab.mjs';

const URL_ARG = process.argv.find((a) => a.startsWith('https://'));

const CALL = `
(async () => {
  const marker = '/n/v2/channels/';
  let channelId = null;
  const called = [];
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    const i = u.indexOf(marker);
    if (i >= 0) { if (!channelId) channelId = u.slice(i + marker.length).split('/')[0].split('?')[0]; called.push(u.slice(0, 160)); }
  }
  const segs = location.pathname.split('/').filter(Boolean);
  const cpn = segs[segs.length - 1];
  const get = async (p) => {
    try { const r = await fetch(location.origin + p, { credentials: 'include', headers: { accept: 'application/json' } });
      return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null }; }
    catch (e) { return { ok: false, error: String(e && e.message) }; }
  };
  const main = await get('/n/v2/channels/' + channelId + '/products/' + cpn + '?withWindow=false');
  const P = (main.json) || {};
  const origin = String(P.originProductNo || '');

  // 옵션이 어디 있는지 — option 이 들어간 키를 전부 훑는다
  const optKeys = Object.keys(P).filter((k) => k.toLowerCase().indexOf('option') >= 0)
    .map((k) => ({ k, type: Array.isArray(P[k]) ? 'array[' + P[k].length + ']' : typeof P[k] }));
  const imgKeys = Object.keys(P).filter((k) => k.toLowerCase().indexOf('image') >= 0)
    .map((k) => ({ k, type: Array.isArray(P[k]) ? 'array[' + P[k].length + ']' : typeof P[k] }));

  const ch = P.channel || {};
  // 페이지가 실제로 쓴 checkoutMerchantNo 와 비교한다 — 같으면 API 값만으로 리뷰를 부를 수 있다.
  let observed = null;
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    const m = u.indexOf('checkoutMerchantNo=');
    if (m >= 0) { observed = u.slice(m + 19).split('&')[0]; break; }
  }
  return {
    observedCheckoutMerchantNo: observed,
    naverPaySellerNo: ch.naverPaySellerNo, accountNo: ch.accountNo,
    channelNo: ch.channelNo, channelUid: ch.channelUid,
    match: String(ch.naverPaySellerNo) === String(observed),
  };
})()`;

probeUrl(URL_ARG, CALL, { settleMs: 3500 })
  .then((d) => { say(JSON.stringify(d, null, 1).slice(0, 5000)); process.exit(0); })
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
