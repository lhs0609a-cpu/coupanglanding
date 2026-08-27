/**
 * 상세 추출 실측 — **크롬(CDP) 경로**로 옵션·상세본문·고시정보·리뷰사진이 몇 개 나오는지 잰다.
 * ---------------------------------------------------------------------------
 * 왜 이 탐침이 필요한가: 목록 수집은 크롬으로 옮기며 실측으로 검증했지만(244개→641개),
 * **상세 추출의 크롬 경로는 검증된 적이 없었다.** 일렉트론을 걷어내기 전에 여기서 확인한다.
 *
 * 실전과 같은 경로로 잰다 — runner.mjs 의 openProduct 를 그대로 부른다. 클릭 이동·SPA 대기·
 * 캡차/차단 판정·사람처럼 굴기가 전부 포함된다. 스크롤을 따로 하지 않는 것도 실전과 같다.
 *
 * 순수 node 로 돈다(electron 불필요). URL 은 여러 개 줄 수 있다:
 *   node worker/desktop/scripts/naver-chrome-detail-probe.mjs <상품URL> [<상품URL> …]
 *
 * ★ 최소한 세 가지를 나란히 재라 — 추출기가 갈라지는 지점이다:
 *     스마트스토어 직접 주소 / 브랜드스토어 / smartstore.naver.com/main/products/… (302 리다이렉트)
 *   URL 은 직접 고른다. 여기에 예시를 박아 두면 그 상품이 사라진 날 탐침이 거짓말을 한다.
 *
 * 프로필은 운영과 같은 자리를 쓴다 — 로그인이 거기 남아 있어야 상세가 열린다.
 *   MEGALOAD_CHROME_PROFILE 로 바꿀 수 있다.
 */
import { withProbeTab, say } from './_probe-tab.mjs';
import { naverCookieState } from '../main/modules/naver-ingest/chrome-session.mjs';
import { openProduct } from '../main/modules/naver-ingest/runner.mjs';
import { extractDetailJs } from '../main/modules/naver-ingest/detail-extract.mjs';

const targets = process.argv.filter((a) => a.startsWith('https://'));
if (!targets.length) {
  say('상품 URL 을 하나 이상 인자로 주세요.');
  say('  node scripts/naver-chrome-detail-probe.mjs <스마트스토어URL> <브랜드스토어URL> <main/products URL>');
  process.exit(1);
}

withProbeTab(async (tab) => {
  const li = await naverCookieState();
  if (!li.loggedIn) {
    say(`⚠️ 네이버 로그인이 없습니다${li.hasAuth ? ' (반쪽 세션 — NID_AUT 만 있음)' : ''}.`);
    say('   상세가 열릴 수도 있지만 결과가 실전과 달라집니다. 크롬 창에서 로그인한 뒤 다시 돌리세요.');
  }

  let fail = 0;
  for (const url of targets) {
    say('');
    say('─'.repeat(70));
    say(url);
    const t0 = Date.now();
    const r = await openProduct(tab, url, { extract: extractDetailJs, captchaWaitMs: 0, onLog: (m) => say('  · ' + m) });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (!r.ok) { say(`❌ ${r.error}  (${secs}초)`); fail += 1; continue; }
    const d = r.data || {};
    say(`✅ ${secs}초, 시도 ${r.attempt}회`);
    say('상품명     : ' + String(d.title || d.name || '').slice(0, 50));
    say('가격       : ' + d.price);
    say('브랜드     : ' + (d.brand || '-'));
    say('카테고리   : ' + (d.categoryPath || '-'));
    say('채널/원상품: ' + d.channelId + ' / ' + d.originProductNo);
    say('옵션       : ' + (d.options || []).length + '개   ' + JSON.stringify((d.options || []).slice(0, 2)));
    say('상세 본문  : ' + (d.detailText || '').length + '자');
    say('상세 이미지: ' + (d.detailImages || []).length + '장');
    say('대표 이미지: ' + (d.mainImages || []).length + '장');
    say('리뷰 사진  : ' + (d.reviewImages || []).length + '장  ' + ((d.reviewImages || [])[0] || ''));
    say('고시정보   : ' + (d.notice ? (d.notice.productInfoProvidedNoticeType || 'O') : '없음'));
    // KC 인증번호는 과거에 통째로 누락됐던 자리다 — 항상 눈에 보이게 찍는다.
    say('KC 인증    : ' + (d.certification || d.notice?.certification || '없음'));
  }

  say('');
  say(`끝 — ${targets.length}건 중 실패 ${fail}건`);
  return fail ? 1 : 0;
})
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { say('❌ ' + (e?.stack || e)); process.exit(1); });
