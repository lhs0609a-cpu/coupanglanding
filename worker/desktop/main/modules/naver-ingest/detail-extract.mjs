/**
 * 상세 추출 — 목록에서 고른 상품을 **올인원이 먹는 폴더**로 만든다.
 * ---------------------------------------------------------------------------
 * 여기가 소싱과 올인원 사이의 다리다. 올인원(대표컷 선정·상세페이지 생성)은 이미 완성돼
 * 있고, 그것이 요구하는 입력은 폴더 하나다(worker/lib/folder-scanner.mjs):
 *
 *     product_<코드>/
 *       product.json        { name, title, price, brand, tags, options, sourceCategory, … }
 *       product_summary.txt "URL: https://…"
 *       main_images/        대표 후보
 *       detail_images/      상세 이미지
 *
 * ★ DOM 을 긁지 않는다(실측 2026-08-18). 옵션·상세본문·고시정보는 로드 시점 state 에 없고
 *   화면이 뜬 뒤 JSON API 로 온다. 페이지 컨텍스트에서 같은 주소를 부르면 쿠키가 붙은 채
 *   200 으로 정확한 JSON 이 온다. 난독화 클래스도, 렌더 타이밍도 상관없어진다.
 *
 * ★ 번호가 둘이다 — 채널상품번호(URL)와 원상품번호. 상세·고시정보는 **원상품번호**를 쓰고,
 *   그 값은 URL 이 아니라 **상품 API 응답의 originProductNo** 에서 받아야 한다(URL 에서 긁으면
 *   /n/v1/contents/reviews/… 에 걸려 "reviews" 를 집는다 — 실측 실패).
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runOne } from './runner.mjs';

/**
 * 페이지 안에서 상품 API 3종을 부른다.
 * ⚠️ 이 문자열은 템플릿 리터럴이다 — **정규식을 쓰지 말 것**. 백슬래시가 먹혀(\d → d)
 *   조용히 틀린 답을 준다(실측: 가격 매치가 0건이었다). 문자열 연산과 DOMParser 로 푼다.
 */
export const extractDetailJs = `
(async () => {
  const cut = (s, n) => String(s == null ? '' : s).split('\\n').join(' ').trim().slice(0, n);

  // ── 채널ID ──
  // ★ 출처가 하나면 안 된다. 처음엔 performance 리소스 목록에서만 주웠는데, 그 버퍼는
  //   기본 250개에서 넘치면 **오래된 항목부터 조용히 버린다**. 상품 페이지는 리소스가
  //   수백 개라 정작 필요한 /n/v2/channels/ 호출이 사라지고, 그러면 추출이 통째로 실패한다
  //   (되다 안 되다 하는 실패라 재현도 어렵다). 세 곳을 순서대로 본다.
  const marker = '/n/v2/channels/';
  let channelId = null;

  // ① 페이지가 부른 주소 — 가장 확실하지만 버퍼에서 밀려날 수 있다.
  for (const e of (performance.getEntriesByType('resource') || [])) {
    const u = String(e.name || '');
    const i = u.indexOf(marker);
    if (i < 0) continue;
    channelId = u.slice(i + marker.length).split('/')[0].split('?')[0];
    if (channelId) break;
  }

  // ② 페이지 상태에 박힌 channelUid — 실측상 채널ID 와 같은 값이다(버퍼와 무관).
  if (!channelId) {
    try {
      const st = window.__PRELOADED_STATE__;
      if (st) {
        const j = JSON.stringify(st);
        const key = '"channelUid":"';
        const k = j.indexOf(key);
        if (k >= 0) channelId = j.slice(k + key.length).split('"')[0] || null;
      }
    } catch (e) { /* 상태가 없거나 순환참조면 다음 경로로 */ }
  }

  // ③ 마지막 수단 — 문서 안에 남은 주소 조각.
  if (!channelId) {
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const k = html.indexOf(marker);
    if (k >= 0) {
      const tail = html.slice(k + marker.length, k + marker.length + 60);
      channelId = tail.split('/')[0].split('?')[0].split('"')[0].split('\\\\')[0] || null;
    }
  }

  // ── 채널상품번호: 경로 마지막 조각(6자리 이상 숫자) ──
  const segs = location.pathname.split('/').filter(Boolean);
  const last = segs[segs.length - 1] || '';
  const channelProductNo = (last.length >= 6 && String(Number(last)) === last) ? last : null;
  if (!channelId || !channelProductNo) {
    // 어느 쪽이 없는지 말한다 — "못 찾음"만으로는 다음에 또 같은 자리에서 막힌다.
    return {
      name: null,
      error: '채널ID/상품번호 확인 실패 (channelId=' + (channelId || '없음')
        + ', 상품번호=' + (channelProductNo || '없음') + ', 경로=' + location.pathname + ')',
      channelId, channelProductNo,
    };
  }

  const get = async (path) => {
    try {
      const res = await fetch(location.origin + path, { credentials: 'include', headers: { accept: 'application/json' } });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, status: res.status, json: await res.json() };
    } catch (e) { return { ok: false, error: String(e && e.message) }; }
  };

  // ① 상품 본체 — 이름·가격·브랜드·카테고리·옵션·대표이미지
  const main = await get('/n/v2/channels/' + channelId + '/products/' + channelProductNo + '?withWindow=false');
  if (!main.ok) return { name: null, error: '상품 API 실패 ' + (main.status || main.error) };
  const P = main.json || {};
  const originProductNo = String(P.originProductNo || P.productNo || P.id || '');

  // ② 상세 본문 — textContent(글) + renderContent(HTML, 상세 이미지가 여기 있다)
  let detailText = '', detailHtml = '';
  if (originProductNo) {
    const c = await get('/n/v2/channels/' + channelId + '/products/' + channelProductNo
      + '/contents/' + originProductNo + '/PC?isResponsive=true');
    if (c.ok && c.json) {
      detailText = String(c.json.textContent || '');
      detailHtml = String(c.json.renderContent || '');
    }
  }
  // ★ textContent 가 비어 있는 판이 있다(실측: editorType 'SEONE' 은 textContent 1자,
  //   renderContent 11,468자). 그대로 두면 올인원이 "상품설명 0자"로 받아 상세글을 맨땅에서
  //   지어낸다 — 그게 과거 환각의 원인이었다. HTML 에서 본문을 뽑아 채운다.
  if (detailText.trim().length < 20 && detailHtml) {
    try {
      const doc = new DOMParser().parseFromString(detailHtml, 'text/html');
      detailText = ((doc.body && doc.body.textContent) || '').split('\\n').join(' ').trim();
    } catch (e) { /* 파싱 실패면 원래 값 그대로 */ }
  }

  // ③ 고시정보 — 쿠팡 등록에 필수인 항목(품목·중량·원산지 등)
  let notice = null;
  if (originProductNo) {
    const n = await get('/n/v2/channels/' + channelId + '/products/' + originProductNo + '/provided-notice');
    if (n.ok && n.json) notice = n.json;
  }

  // ④ 리뷰 사진 — 올인원이 **본문 교차 1순위**로 쓰는 컷이다(folder-scanner 의 review_images/).
  //    실측(2026-08-18)으로 확정한 것:
  //      주소  /n/v1/contents/reviews/gallery-attaches/{원상품번호}
  //            ?checkoutMerchantNo={머천트}&searchSortType=REVIEW_RANKING&page=1&pageSize=100
  //      응답  { contents:[{ reviewId, totalAttachCount, representAttach:{attachPath, attachType} }] }
  //      attachPath 는 phinf.pstatic.net 의 완전한 URL, attachType 'I' 가 사진(동영상은 제외).
  //    ★ 파라미터를 바꾸면 400 이 온다(pageSize 를 20 으로 줄였더니 400 — 실측).
  //      머천트번호는 마크업에 없어서 **페이지가 이미 부른 주소**에서 줍는다.
  //    ★ 머천트번호는 **상품 API 의 channel.naverPaySellerNo** 에서 얻는다(실측으로 페이지가
  //      쓰는 checkoutMerchantNo 와 같은 값). 페이지가 부른 주소에서 줍는 방법은 리뷰 위젯이
  //      화면에 떠야만 동작하는데, 우리는 스크롤하지 않으므로 대부분 못 줍는다(리뷰 0장).
  //      관측값은 폴백으로만 쓴다.
  const reviewImages = [];
  let merchantNo = (P.channel && P.channel.naverPaySellerNo) ? String(P.channel.naverPaySellerNo) : null;
  if (!merchantNo) {
    for (const e of (performance.getEntriesByType('resource') || [])) {
      const u = String(e.name || '');
      const m = u.indexOf('checkoutMerchantNo=');
      if (m >= 0) { merchantNo = u.slice(m + 19).split('&')[0]; break; }
    }
  }
  if (originProductNo && merchantNo) {
    const rv = await get('/n/v1/contents/reviews/gallery-attaches/' + originProductNo
      + '?checkoutMerchantNo=' + merchantNo + '&searchSortType=REVIEW_RANKING&page=1&pageSize=100');
    if (rv.ok && rv.json && Array.isArray(rv.json.contents)) {
      for (const c of rv.json.contents) {
        const a = c && c.representAttach;
        if (!a || a.attachType !== 'I') continue;          // 'I'=사진. 동영상은 올인원이 못 쓴다
        const p = String(a.attachPath || '');
        if (p && reviewImages.indexOf(p) < 0) reviewImages.push(p);
      }
    }
  }

  // ── 상세 이미지: renderContent 를 DOMParser 로 파싱한다(정규식 금지) ──
  const detailImages = [];
  if (detailHtml) {
    try {
      const doc = new DOMParser().parseFromString(detailHtml, 'text/html');
      for (const im of doc.querySelectorAll('img')) {
        // ★ 상세 이미지는 **지연 로딩**이다(실측 2026-08-18): src 는 1×1 base64 자리표시자이고
        //   진짜 주소는 data-src 에 있다. src 를 먼저 집으면 'data:' 라 전부 버려져 0장이 된다
        //   (이 순서 하나 때문에 상세 이미지가 통째로 비어 있었다). 지연 속성을 먼저 본다.
        const u = im.getAttribute('data-src')
          || im.getAttribute('data-original')
          || im.getAttribute('data-lazy-src')
          || im.getAttribute('src')
          || '';
        if (!u || u.indexOf('data:') === 0) continue;
        const abs = u.indexOf('//') === 0 ? ('https:' + u) : u;
        if (abs.indexOf('pstatic') < 0 && abs.indexOf('phinf') < 0) continue;   // 배너·아이콘 배제
        if (detailImages.indexOf(abs) < 0) detailImages.push(abs);
      }
    } catch (e) { /* 파싱 실패는 이미지 0장으로 */ }
  }

  // ── 대표 후보: 대표이미지 + 추가이미지 ──
  const mainImages = [];
  const push = (u) => {
    if (!u) return;
    const abs = String(u).indexOf('//') === 0 ? ('https:' + u) : String(u);
    if (abs && mainImages.indexOf(abs) < 0) mainImages.push(abs);
  };
  // ★ 실제 필드명은 representImage 다(representativeImage 가 아니다 — 실측). 옛 이름만 보면
  //   대표컷이 productImages 폴백으로만 잡혀 후보가 얇아진다. galleryImages 가 추가 이미지다.
  push(P.representImage && P.representImage.url);
  for (const im of (P.galleryImages || [])) push(im && im.url);
  for (const im of (P.productImages || [])) push(im && (im.url || im.imageUrl));
  push(P.representativeImageUrl || (P.representativeImage && P.representativeImage.url));  // 판이 다를 때 대비
  for (const u of (P.optionalImageUrls || [])) push(u);

  // ── 옵션 조합 — 이름/재고/추가금액. 올인원은 optionName 을 특징 힌트로 쓴다.
  const combos = P.optionCombinations
    || (P.productOption && P.productOption.optionCombinations)
    || [];
  const options = combos.map((c) => ({
    optionName: [c.optionName1, c.optionName2, c.optionName3].filter(Boolean).join(' / '),
    price: Number(c.price) || 0,
    stock: Number(c.stockQuantity) || 0,
    soldOut: !((Number(c.stockQuantity) || 0) > 0) || c.usable === false,
  })).filter((o) => o.optionName);

  // 카테고리 경로 — 올인원의 분류 힌트. 필드명이 판마다 달라 있는 것을 모아 쓴다.
  const cat = P.category || {};
  const categoryPath = [cat.wholeCategoryName, cat.categoryName, P.wholeCategoryName]
    .filter(Boolean)[0] || '';

  return {
    name: cut(P.name, 200) || cut(document.title, 200),   // runOne 이 이 값으로 로드 완료를 본다
    title: cut(P.name, 200),
    channelId, channelProductNo, originProductNo,
    price: Number(P.salePrice || P.dispSalePrice || 0) || 0,
    brand: cut((P.naverShoppingSearchInfo && P.naverShoppingSearchInfo.brandName) || P.brandName || '', 60),
    productStatusType: P.productStatusType || null,
    stockQuantity: Number(P.stockQuantity) || 0,
    categoryPath,
    categoryId: cat.categoryId || cat.wholeCategoryId || '',
    options,
    detailText: detailText.slice(0, 20000),
    detailImages: detailImages.slice(0, 60),
    mainImages: mainImages.slice(0, 20),
    // 30장이면 큐레이션에 충분하다 — 245장을 받으면 다운로드가 추출 시간을 지배한다.
    reviewImages: reviewImages.slice(0, 30),
    notice,
    url: location.href.split('?')[0],
  };
})()
`;

/**
 * 이미지 저장 정책 — **원본 그대로 두지 않는다.**
 * ---------------------------------------------------------------------------
 * 실측(2026-08-19, 복숭아 1건): 대표 9 + 상세 15 + 리뷰 30 = **107MB**. 리뷰컷만 83MB 였다.
 * 상품 100개면 10GB 다. 그런데 이 사진들의 용도를 보면 그만한 해상도가 필요 없다:
 *   · 리뷰컷  — CLIP 큐레이션 대상이자 본문에 작게 끼우는 컷. 800px 이면 충분하다.
 *   · 상세컷  — 상세페이지 본문용. 1000px.
 *   · 대표컷  — 쿠팡에 실제로 올라갈 수 있으니 넉넉히 1200px 로 남긴다(쿠팡 권장 1000px 이상).
 * 줄이는 건 Electron 내장 nativeImage 로 한다 — sharp 같은 네이티브 의존성을 더하지 않는다
 * (이 레포는 Google Drive 경로라 sharp 가 부분 동기화돼 로컬 실행이 깨진 전례가 있다).
 */
const IMAGE_PROFILE = {
  main_: { maxSide: 1200, quality: 85 },
  detail_: { maxSide: 1000, quality: 80 },
  review_: { maxSide: 800, quality: 75 },
};

/** 한 변이 maxSide 를 넘으면 비율을 지켜 줄이고 JPEG 로 다시 굽는다. 실패하면 원본을 쓴다. */
async function shrink(buf, prefix) {
  const prof = IMAGE_PROFILE[prefix];
  if (!prof) return { buf, ext: null };
  try {
    const { nativeImage } = await import('electron');
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { buf, ext: null };
    const { width, height } = img.getSize();
    const longest = Math.max(width, height);
    // 이미 작으면 다시 굽지 않는다 — 재인코딩은 화질만 깎는다.
    if (longest <= prof.maxSide) return { buf, ext: null };
    const resized = width >= height
      ? img.resize({ width: prof.maxSide, quality: 'good' })
      : img.resize({ height: prof.maxSide, quality: 'good' });
    const out = resized.toJPEG(prof.quality);
    // 줄였는데 오히려 커졌으면(작은 PNG 등) 원본이 낫다.
    return out.length < buf.length ? { buf: out, ext: 'jpg' } : { buf, ext: null };
  } catch {
    return { buf, ext: null };   // nativeImage 가 못 읽는 형식이면 원본 그대로
  }
}

/** 이미지 1장 저장. CDN(pstatic)이라 로그인이 필요 없다 — 네이버 페이지 예산과 무관. */
async function saveImage(url, dir, index, prefix) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const { buf, ext: forced } = await shrink(raw, prefix);

  // 확장자는 주소에서 추론하되 이상하면 jpg 로 둔다(올인원 스캐너가 보는 건 확장자뿐이다).
  const clean = url.split('?')[0].toLowerCase();
  let ext = 'jpg';
  for (const e of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
    if (clean.endsWith(e)) { ext = e.slice(1); break; }
  }
  if (forced) ext = forced;      // 다시 구웠으면 실제 형식과 확장자를 맞춘다

  const name = `${prefix}${String(index + 1).padStart(3, '0')}.${ext}`;
  writeFileSync(join(dir, name), buf);
  return { name, bytes: buf.length, savedBytes: raw.length - buf.length };
}

/** 여러 장을 순서대로 — 동시에 쏟아부으면 CDN 이 막는다. 실패는 건너뛰고 계속한다. */
async function saveImages(urls, dir, prefix, onLog) {
  if (!urls.length) return 0;
  mkdirSync(dir, { recursive: true });
  let ok = 0;
  let bytes = 0;
  let saved = 0;
  // ★ 한 장씩 받으면 여기가 상세 추출의 숨은 병목이다(실측 2026-08-19).
  //   장당 339ms · 상품 1개가 대표+상세+리뷰 67장 → **23초를 다운로드에만** 쓰고 있었다.
  //   같은 6장을 동시에 받으니 0.42초(4.8배, 전부 성공) — 67장 환산 23초 → 5초.
  //   다만 무제한 동시는 CDN 이 막을 수 있어 6개로 묶는다(위 실측이 6 동시였다).
  //   실패는 그 장만 건너뛰고 계속한다 — 사진 한 장 때문에 상품을 통째로 버리지 않는다.
  const LANES = 6;
  let next = 0;
  const lane = async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      try {
        const r = await saveImage(urls[i], dir, i, prefix);
        ok += 1;
        bytes += r.bytes;
        saved += r.savedBytes;
      } catch (e) {
        onLog?.(`이미지 ${i + 1} 건너뜀 — ${e?.message || e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, urls.length) }, lane));
  if (ok && saved > 0) {
    const mb = (n) => (n / 1048576).toFixed(1);
    onLog?.(`${prefix.replace('_', '')} ${ok}장 — ${mb(bytes)}MB (원본보다 ${mb(saved)}MB 절약)`);
  }
  return ok;
}

/**
 * 추출 결과를 올인원 폴더로 굽는다.
 * @returns {Promise<{folder:string, mainImages:number, detailImages:number}>}
 */
export async function writeProductFolder(rootDir, data, { onLog } = {}) {
  const code = data.channelProductNo || data.originProductNo || String(Date.now());
  const folder = join(rootDir, `product_${code}`);
  mkdirSync(folder, { recursive: true });

  const mainCount = await saveImages(data.mainImages || [], join(folder, 'main_images'), 'main_', onLog);
  const detailCount = await saveImages(data.detailImages || [], join(folder, 'detail_images'), 'detail_', onLog);
  // review_images/ 는 folder-scanner 가 읽는 이름이다(REVIEW_DIRS 의 첫 항목).
  const reviewCount = await saveImages(data.reviewImages || [], join(folder, 'review_images'), 'review_', onLog);

  // 올인원 스캐너가 읽는 필드 이름에 정확히 맞춘다(folder-scanner.mjs).
  //   name/title 중 긴 쪽이 원본 상품명이 되고, options[].optionName 이 특징 힌트가 된다.
  const productJson = {
    name: data.title || data.name || '',
    title: data.title || data.name || '',
    price: data.price || 0,
    brand: data.brand || '',
    tags: [],
    options: data.options || [],
    sourceCategory: { categoryPath: data.categoryPath || '', categoryId: data.categoryId || '' },
    description: data.detailText || '',
    // 고시정보는 원본 그대로 남긴다 — 쿠팡 등록의 필수 항목(품목·중량·원산지)이 여기서 나온다.
    providedNotice: data.notice || null,
    certifications: [],
    source: {
      channel: 'naver',
      url: data.url || '',
      channelProductNo: data.channelProductNo || '',
      originProductNo: data.originProductNo || '',
      productStatusType: data.productStatusType || null,
      stockQuantity: data.stockQuantity || 0,
      collectedAt: new Date().toISOString(),
    },
  };
  writeFileSync(join(folder, 'product.json'), JSON.stringify(productJson, null, 2), 'utf8');
  writeFileSync(join(folder, 'product_summary.txt'), `URL: ${data.url || ''}\n`, 'utf8');

  return { folder, mainImages: mainCount, detailImages: detailCount, reviewImages: reviewCount };
}

/** 상품 1건 — 페이지를 클릭 이동으로 열고 API 를 불러 폴더까지 만든다. */
export async function extractOne(pool, url, rootDir, { onLog = () => {}, signal } = {}) {
  const r = await runOne(pool, url, { onLog, extract: extractDetailJs, signal });
  if (!r?.ok) return { ok: false, url, error: r?.error || '알 수 없음' };
  const data = r.data || {};
  if (data.error) return { ok: false, url, error: data.error };
  if (!(data.options || []).length && !(data.mainImages || []).length) {
    return { ok: false, url, error: '가져온 것이 없음(옵션·이미지 0)' };
  }

  const saved = await writeProductFolder(rootDir, data, { onLog });
  return {
    ok: true,
    url,
    // 원본 추출 결과 — 서버 업로드가 이걸 그대로 쓴다(요약만으론 옵션·고시정보를 못 올린다).
    data,
    name: data.title || data.name,
    price: data.price,
    options: (data.options || []).length,
    ...saved,
    hasNotice: !!data.notice,
    detailTextLen: (data.detailText || '').length,
  };
}

export function ensureRoot(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
