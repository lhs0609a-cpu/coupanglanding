// ============================================================
// 상담봇 검색 회귀 테스트
//
// 실행:
//   node --import ./test-loader.mjs scripts/assistant-eval.mjs
//   node --import ./test-loader.mjs scripts/assistant-eval.mjs --verbose
//
// 왜 필요한가
//   KB 문서를 고치거나 검색 스코어링을 만지면 "다른 질문이 조용히 망가지는" 일이 생긴다.
//   프로덕션 엔드포인트로 재보면 레이트 리밋에 걸리고 대화 행이 쌓이므로,
//   검색기만 떼어 내서 직접 돌린다. LLM 도 DB 도 타지 않는다.
//
// 채점
//   accept 에 적은 문서 id 중 하나가 1위면 PASS,
//   3위 안이면 NEAR(부분 점수), 그 밖이면 FAIL.
//   1위 정확도(PASS 비율)가 이 봇의 "근거를 제대로 집었는가" 지표다.
// ============================================================

import { staticKb } from '../src/lib/assistant/kb/index.ts';
import { buildIndex, searchKb } from '../src/lib/assistant/retrieval.ts';

/** [질문, 현재 경로, 정답 후보 id 들] */
const CASES = [
  // ── 시작 · 비용 ──
  ['사업자등록 어떻게 해요', '/start', ['start-', 'guide-', 'ops-what-you-need']],
  ['통신판매업 신고 꼭 해야 하나요', '/start', ['start-', 'guide-', 'article-']],
  ['쿠팡 입점하려면 뭐가 필요해요', '/start', ['ops-what-you-need', 'channel-onboarding-coupang']],
  ['돈이 얼마나 있어야 시작해요', '/pt', ['ops-what-you-need', 'ops-cost-structure', 'pr-settlement-45-7']],
  ['쿠팡PT 비용이 얼마예요', '/pt', ['ops-cost-structure', 'contract-']],
  ['수수료 몇 퍼센트예요', '/pt', ['ops-cost-structure', 'contract-']],
  ['무료체험 있어요', '/program', ['ops-megaload-trial']],
  ['위탁판매가 뭐예요', '/pt', ['pr-consignment-structure']],
  ['이거 진짜 팔려요?', '/pt', ['pr-does-it-sell']],
  ['위험한 건 없어요?', '/pt', ['pr-risks']],

  // ── 등록 ──
  ['상품 어떻게 올려요', '/megaload/products/bulk-register', ['pr-register-7steps']],
  ['폴더가 안 열려요', '/megaload/products/bulk-register', ['pr-register-7steps']],
  ['폴더 선택이 안 돼요', '/megaload/products/bulk-register', ['pr-register-7steps']],
  ['스캔이 계속 돌기만 해요', '/megaload/products/bulk-register', ['pr-register-7steps', 'pr-preflight-fail']],
  ['검증 눌렀는데 게이지가 안 차요', '/megaload/products/bulk-register', ['pr-preflight-fail']],
  ['프리플라이트가 뭐예요', '/megaload/products/bulk-register', ['ts-preflight-canary', 'pr-preflight-fail']],
  ['등록 실패했는데 중복이래요', '/megaload/products/bulk-register', ['ts-duplicate']],
  ['쿠팡 API 오류 떠요', '/megaload/products/bulk-register', ['pr-coupang-api-error-brand', 'ts-auth']],
  ['인증 오류가 나요', '/megaload/channels', ['ts-auth']],
  ['필수필드 누락이 99건이에요', '/megaload/products/bulk-register', ['ts-notice-attribute']],
  ['카테고리가 이상하게 잡혔어요', '/megaload/products/bulk-register', ['op-category-mismatch', 'ts-category-invalid']],
  ['이미지 몇 장 넣어야 해요', '/megaload/products/bulk-register', ['pr-image-two-rules']],
  ['대표이미지 누끼가 뭐예요', '/megaload/products/bulk-register', ['pr-image-two-rules', 'pr-review-image-ad']],
  ['리뷰 이미지 써도 돼요', '/megaload/products/bulk-register', ['pr-review-image-ad', 'op-fresh-food-review-images']],
  ['상품명 어떻게 써요', '/megaload/products/bulk-register', ['pr-two-product-names', 'op-no-brand-in-title']],
  ['상품명에 브랜드 넣어도 돼요', '/megaload/products/bulk-register', ['op-no-brand-in-title']],
  ['옵션값 뭘 넣어야 해요', '/megaload/products/bulk-register', ['pr-two-product-names', 'pr-register-7steps']],
  ['등록 안 할 상품 빼려면', '/megaload/products/bulk-register', ['pr-register-7steps']],
  ['상세페이지 글 고칠 수 있어요', '/megaload/products/bulk-register', ['pr-detail-page-edit']],
  ['자동 제외된 이미지가 뭐예요', '/megaload/products/bulk-register', ['pr-auto-excluded-images']],
  ['등록했는데 상품이 안 보여요', '/megaload/products', ['ts-where-is-data']],

  // ── 주문 · 반품 ──
  ['주문 들어왔는데 뭐해요', '/megaload/orders', ['op-order-fulfillment']],
  ['운송장 어디에 입력해요', '/megaload/orders', ['op-order-fulfillment']],
  ['고객 전화번호 그대로 써도 돼요', '/megaload/orders', ['op-order-fulfillment']],
  ['네이버가 품절이래요', '/megaload/orders', ['op-cost-up-cancel', 'ops-order-cancel']],
  ['주문 취소하고 싶어요', '/megaload/orders', ['ops-order-cancel', 'op-cost-up-cancel']],
  ['반품 요청 왔어요', '/megaload/returns', ['ops-return-request']],
  ['교환해달래요', '/megaload/returns', ['ops-exchange-request']],
  ['배송이 너무 늦는 것 같아요', '/megaload/orders', ['op-order-fulfillment', 'op-beginner-anxiety']],

  // ── 돈 ──
  ['정산 언제 들어와요', '/megaload/settlement', ['pr-settlement-45-7', 'op-fast-settlement']],
  ['빠른정산 신청 조건이 뭐예요', '/megaload/settlement', ['pr-settlement-45-7', 'op-fast-settlement']],
  ['마진 얼마나 남아요', '/my/report', ['pr-margin-32', 'op-margin-dont-touch']],
  ['가격 낮춰도 돼요', '/megaload/products', ['op-margin-dont-touch']],
  ['결제가 잠겼어요', '/my/settings', ['ts-payment-lock']],
  ['정산 보고서 때문에 막혔어요', '/my/report', ['ts-settlement-gate']],

  // ── 매출 ──
  ['매출이 하나도 없어요', '/megaload/dashboard', ['op-revenue-order']],
  ['몇 개 올려야 돈이 돼요', '/megaload/dashboard', ['pr-3000-benchmark', 'op-volume-target']],
  ['프로모션 어떻게 걸어요', '/my/promotion', ['ops-promotion-howto']],
  ['쿠폰 할인율 얼마로 해요', '/my/promotion', ['ops-promotion-howto']],
  ['광고 언제 시작해요', '/megaload/ads', ['ops-ads-when-start']],
  ['전환율이 낮은 것 같아요', '/megaload/analytics', ['ops-metrics-diagnose', 'op-benchmarks']],
  ['조회수가 안 나와요', '/megaload/analytics', ['ops-metrics-diagnose']],

  // ── 사고 ──
  ['브랜드사가 메일 보냈어요', '/my/emergency', ['op-brand-takedown']],
  ['법무법인에서 합의금 내래요', '/my/emergency', ['pr-trademark-demand-letter']],
  ['쿠팡이 24시간 안에 답하래요', '/my/emergency', ['op-coupang-cns-labeling']],
  ['계정 정지됐어요', '/my/emergency', ['ops-account-suspended']],
  ['판매가 중지됐어요', '/my/emergency', ['ops-account-suspended', 'op-coupang-cns-labeling']],
  ['페널티 받았어요', '/my/penalty', ['penalty-', 'ops-account-suspended', 'emergency-']],

  // ── 환경 ──
  ['프로그램이 너무 느려요', '/megaload/settings', ['op-slow-speed']],
  ['도우미가 오프라인이에요', '/megaload/settings', ['ts-desktop-helper']],
  ['캡차가 떠요', '/megaload/naver-sourcing', ['op-naver-captcha']],
  ['품절동기화 안 돼요', '/megaload/stock-monitor', ['ts-stock-monitor']],
  ['로그인이 안 돼요', '/auth/login', ['ts-login-pending']],

  // ── 소싱 ──
  ['뭘 팔아야 해요', '/megaload/sourcing/naver', ['op-what-sells', 'pr-health-food-regulation']],
  ['건기식 팔아도 돼요', '/megaload/sourcing/naver', ['pr-health-food-regulation']],
  ['순위 올려준다고 전화 왔어요', '/megaload/dashboard', ['op-spam-calls']],
  ['오늘 뭐부터 해요', '/megaload/dashboard', ['op-what-to-do-today']],
];

/**
 * 홀드아웃 — **여기에 맞춰 태그를 고치지 않는다.**
 *
 * 위 CASES 는 문서를 만들면서 같이 손본 질문이라 점수가 부풀 수밖에 없다(실측 100%).
 * 아래는 일부러 다른 말로 쓴, 튜닝하지 않은 질문이다. 이쪽 점수가 진짜 실력이다.
 * 처음 쟀을 때 43.3% 였고, 질문별 태그 대신 용어 사전(glossary.ts)을 넣어 76.7% 가 됐다.
 * 점수가 떨어지면 태그를 붙여 메우지 말고 **사전이나 문서 자체**를 고쳐야 한다.
 */
const HOLDOUT = [
  ['처음인데 어디서부터 손대야 할지 모르겠어요','/megaload/dashboard',['op-what-to-do-today','pr-register-7steps']],
  ['올린 물건이 검색에 안 떠요','/megaload/products',['ops-metrics-diagnose','op-revenue-order','ts-where-is-data']],
  ['소싱처에서 값을 올렸네요','/megaload/orders',['op-cost-up-cancel','ops-order-cancel']],
  ['손님이 환불해달라는데요','/megaload/returns',['ops-return-request']],
  ['택배사 어디로 보내야 하죠','/megaload/orders',['op-order-fulfillment']],
  ['통장에 돈이 언제 꽂히나요','/megaload/settlement',['pr-settlement-45-7','op-fast-settlement']],
  ['남는 게 별로 없는 것 같은데','/my/report',['pr-margin-32','op-margin-dont-touch']],
  ['상표권 걸렸다고 연락 왔어요','/my/emergency',['op-brand-takedown','pr-trademark-demand-letter']],
  ['변호사 이름으로 편지가 왔어요','/my/emergency',['pr-trademark-demand-letter','op-brand-takedown']],
  ['쿠팡에서 상품 내리라고 메일 옴','/my/emergency',['op-brand-takedown','op-coupang-cns-labeling']],
  ['아이디가 막힌 것 같아요','/my/emergency',['ops-account-suspended','ts-login-pending']],
  ['프로그램이 자꾸 멈춰요','/megaload/settings',['op-slow-speed','ts-desktop-helper']],
  ['컴퓨터에 깔아야 하는 게 있나요','/megaload/settings',['ts-desktop-helper','ops-what-you-need']],
  ['네이버에서 자꾸 사람인지 확인하래요','/megaload/naver-sourcing',['op-naver-captcha']],
  ['사진을 어떤 걸로 골라야 하나요','/megaload/products/bulk-register',['pr-image-two-rules','op-fresh-food-review-images']],
  ['제목에 회사 이름 써도 되나요','/megaload/products/bulk-register',['op-no-brand-in-title']],
  ['분류가 다르게 들어갔어요','/megaload/products/bulk-register',['op-category-mismatch','ts-category-invalid']],
  ['똑같은 걸 두 번 올렸다고 나와요','/megaload/products/bulk-register',['ts-duplicate']],
  ['키 넣었는데 연결이 안 돼요','/megaload/channels',['ts-auth']],
  ['할인 행사 하고 싶어요','/my/promotion',['ops-promotion-howto']],
  ['돈 들여서 광고할 만한가요','/megaload/ads',['ops-ads-when-start']],
  ['사람들이 보긴 보는데 안 사요','/megaload/analytics',['ops-metrics-diagnose']],
  ['한 달에 얼마나 벌 수 있어요','/pt',['pr-3000-benchmark','pr-margin-32']],
  ['초기에 목돈이 드나요','/pt',['ops-what-you-need','ops-cost-structure','pr-settlement-45-7']],
  ['계약하면 뭘 떼가나요','/pt',['ops-cost-structure']],
  ['재고를 쌓아둬야 하나요','/pt',['pr-consignment-structure']],
  ['영양제 취급해도 괜찮아요','/megaload/sourcing/naver',['pr-health-food-regulation','op-what-sells']],
  ['모르는 번호로 순위 올려준대요','/megaload/dashboard',['op-spam-calls']],
  ['보고서 안 냈더니 화면이 막혔어요','/my/report',['ts-settlement-gate']],
  ['카드값이 밀려서 잠긴 듯해요','/my/settings',['ts-payment-lock']],
];

const verbose = process.argv.includes('--verbose');

const entries = staticKb();
const index = buildIndex(entries);

const surfaceOf = (p) =>
  p.startsWith('/admin') ? 'admin' : p.startsWith('/megaload') ? 'megaload' : p.startsWith('/my') ? 'pt' : 'public';

const matches = (id, accepts) => accepts.some((a) => (a.endsWith('-') ? id.startsWith(a) : id === a));

function run(label, cases) {
  let pass = 0;
  let near = 0;
  let fail = 0;
  console.log(`\n── ${label} (${cases.length}개) ──`);
  for (const [q, path, accept] of cases) {
    const hits = searchKb(index, q, { path, surface: surfaceOf(path), limit: 3 });
    const ids = hits.map((h) => h.entry.id);
    if (ids[0] && matches(ids[0], accept)) {
      pass++;
      if (verbose) console.log(`PASS  ${q}
        → ${hits[0].entry.title}`);
    } else if (ids.some((id) => matches(id, accept))) {
      near++;
      console.log(`NEAR  ${q}`);
      console.log(`        1위: ${hits[0]?.entry.title ?? '(없음)'}`);
      console.log(`        기대: ${accept.join(' | ')}`);
    } else {
      fail++;
      console.log(`FAIL  ${q}`);
      hits.forEach((h, i) => console.log(`        ${i + 1}) [${h.entry.id}] ${h.entry.title}`));
      console.log(`        기대: ${accept.join(' | ')}`);
    }
  }
  const t = cases.length;
  console.log(
    `  → 1위 ${pass}/${t} (${((pass / t) * 100).toFixed(1)}%) · ` +
      `3위내 ${pass + near}/${t} (${(((pass + near) / t) * 100).toFixed(1)}%) · 실패 ${fail}`,
  );
  return { top1: pass / t, top3: (pass + near) / t };
}

const tuned = run('튜닝 세트 — 참고용(부풀려진 점수)', CASES);
const held = run('홀드아웃 — 진짜 실력', HOLDOUT);

console.log('\n' + '='.repeat(64));
console.log(`문서 ${entries.length}건`);
console.log(`튜닝 세트  1위 ${(tuned.top1 * 100).toFixed(1)}% · 3위내 ${(tuned.top3 * 100).toFixed(1)}%`);
console.log(`홀드아웃   1위 ${(held.top1 * 100).toFixed(1)}% · 3위내 ${(held.top3 * 100).toFixed(1)}%   ← 이 숫자를 보세요`);
console.log('='.repeat(64));

// CI 기준선은 **홀드아웃**으로만 판정한다. 튜닝 세트는 언제든 100% 를 만들 수 있어 의미가 없다.
const TOP1_MIN = 0.7;
const TOP3_MIN = 0.88;
if (held.top1 < TOP1_MIN || held.top3 < TOP3_MIN) {
  console.error(
    `
기준 미달 — 홀드아웃 1위 ${(TOP1_MIN * 100).toFixed(0)}% / 3위내 ${(TOP3_MIN * 100).toFixed(0)}% 이상이어야 합니다.` +
      `
질문별 태그를 붙여 메우지 마세요. 용어 사전(glossary.ts)이나 문서를 고쳐야 합니다.`,
  );
  process.exit(1);
}
