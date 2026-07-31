/**
 * 로컬 소싱 폴더 스캐너 (워커 포트 — 웹 local-product-reader.ts 의 mjs 버전)
 * ---------------------------------------------------------------------------
 * 루트 폴더 안의 product_<코드> 하위 폴더들을 읽어
 * generateBatch() 입력 형식의 상품 배열로 변환한다.
 *
 * 상품 폴더 규칙(웹과 동일):
 *   product_<코드>/
 *     product.json          { name,title,price,brand,tags,options,sourceCategory,... }
 *     product_summary.txt   "URL: https://..." 줄에 원본 링크
 *     main_images/          대표이미지 후보 (jpg|jpeg|png|webp)
 *     detail_images/ ...    (상세/리뷰/정보 — 텍스트 생성엔 미사용)
 *
 * Supabase/브라우저 의존성 없음 — 순수 node:fs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i;

/** 광고/배지/플랫폼 UI 등 비상품 파일명 (웹 AD_FILENAME_PATTERNS 와 동기화) */
const AD_FILENAME_RE =
  /(?:^|[_\-.])(npay|naverpay|naver_|naver-|smartstore|kakaopay|tosspay|payco|banner|badge|icon|logo|watermark|stamp|popup|event_banner|coupon|ad_|promotion|btn_|button_|shopping_|store_|delivery_info|return_info|guide_|notice_ban|footer|header)/i;

/** 디렉토리에서 이미지 파일을 (광고 제외) 자연 정렬로 수집 → 절대경로 배열 */
function collectImages(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_RE.test(f) && !AD_FILENAME_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** 상세이미지 폴더 후보 (웹 local-product-reader 와 동기화) — 존재하는 첫 폴더 채택 */
const DETAIL_DIRS = ['detail_images', 'details', 'detail', 'detail-images', 'detailImages', '상세이미지', '상세 이미지', '상세', 'description_images'];
function collectDetailImages(productPath) {
  for (const name of DETAIL_DIRS) {
    const imgs = collectImages(path.join(productPath, name));
    if (imgs.length) return imgs;
  }
  return [];
}

/**
 * 리뷰이미지 폴더 (웹 allinone-local.REVIEW_DIRS 와 동기화).
 *   ⚠️ 리뷰컷은 상세페이지 본문에서 **글 사이에 끼워지는 1순위 이미지**다
 *      (detail-page-builder.pickBodyImages). 그런데 예전엔 워커가 이 폴더를 아예 읽지 않아
 *      **아무 검사도 없이** 상세페이지에 실렸다 — 사람 얼굴·채팅 캡처·영수증까지.
 *      이제 읽어서 CLIP 큐레이션(curateReviewImages)에 태운다.
 */
const REVIEW_DIRS = ['review_images', 'reviews', 'review', '리뷰이미지', '리뷰 이미지', '리뷰', 'customer_reviews'];
function collectReviewImages(productPath) {
  for (const name of REVIEW_DIRS) {
    const imgs = collectImages(path.join(productPath, name));
    if (imgs.length) return imgs;
  }
  return [];
}

/** product_summary.txt 에서 원본 상품 URL 추출 (웹 정규식과 동일) */
/**
 * 소싱 상품명 꼬리의 "분류 라벨 반복"을 1회로 접는다 — 요청 0회로 실제 제목을 복원한다.
 * ---------------------------------------------------------------------------
 * 소싱 크롤러가 상품명 뒤에 breadcrumb/분류 텍스트를 **여러 번 이어붙여** 저장했다(실측 8/8):
 *   "일리윤 세라마이드 아토 수딩 젤 175ml 바디로션 바디로션 바디로션"
 *   "국산 발아현미 20곡 2kg 혼합곡/기타곡류 혼합곡/기타곡류 혼합곡/기타곡류"
 *   " 혼합곡/기타곡류 혼합곡/기타곡류 혼합곡/기타곡류"   ← 제목 자체가 없는 경우
 * 원본명은 노출명·옵션추출·카테고리 매칭의 1차 입력이라 이 오염이 전부로 번진다.
 *
 * 왜 링크 재조회 대신 이걸 하나: 네이버가 상품 상세 페이지를 막고 있다(실측 2026-07-31 —
 *   Node fetch·구글번역·**진짜 크롬(headless, 쿠키 워밍업 포함)** 전부 동일한 24KB
 *   "[에러] 에러페이지 - 시스템오류". shopping.naver.com 은 정상 로드되므로 상세 페이지만
 *   차단된 상태다). 즉 네트워크로는 못 가져온다. 반면 위 패턴은 **이미 있는 데이터**로
 *   복원 가능하다 — 추가 요청 0회, 차단 위험 0.
 *
 * ⚠️ 반복을 통째로 지우지 않고 **1회만 남긴다**. 지우면 "bebeone 기저귀커버 기저귀커버
 *    기저귀커버" 가 "bebeone"(브랜드만)이 되어 상품 정체성을 잃는다.
 */
export function stripRepeatedTail(raw) {
  const toks = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return toks.join(' ');
  // 꼬리에서 길이 1~4 토큰짜리 블록이 2회 이상 연속 반복되면 1회로 접는다.
  for (let len = 1; len <= 4; len++) {
    if (toks.length < len * 2) continue;
    const block = toks.slice(-len).join(' ');
    let reps = 1;
    let i = toks.length - len;
    while (i - len >= 0 && toks.slice(i - len, i).join(' ') === block) { reps++; i -= len; }
    if (reps >= 2) {
      const head = toks.slice(0, i).join(' ').trim();
      return (head ? `${head} ${block}` : block).trim();
    }
  }
  return toks.join(' ');
}

function readSourceUrl(productPath) {
  const p = path.join(productPath, 'product_summary.txt');
  if (!existsSync(p)) return null;
  try {
    const m = readFileSync(p, 'utf8').match(/URL:\s*(https?:\/\/\S+)/i);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** product.json 파싱 (실패 시 빈 객체) */
function readProductJson(productPath) {
  const p = path.join(productPath, 'product.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/** tags/description 에서 LLM 입력용 핵심 특징 배열 도출 */
function deriveFeatures(pj) {
  const feats = [];
  if (Array.isArray(pj.tags)) feats.push(...pj.tags.filter((t) => typeof t === 'string' && t.trim()));
  // 옵션명도 특징 힌트로(용량/색상/맛 등) — 환각 방지에 도움
  if (Array.isArray(pj.options)) {
    for (const o of pj.options) {
      const n = o && (o.optionName || o.name);
      if (typeof n === 'string' && n.trim() && feats.length < 12) feats.push(n.trim());
    }
  }
  // 중복 제거, 너무 긴 토큰 컷
  return [...new Set(feats)].filter((f) => f.length <= 40).slice(0, 12);
}

/**
 * 루트 폴더를 스캔해 generateBatch 입력 배열을 반환.
 * @param {string} rootDir  product_* 폴더들을 담은 상위 폴더
 * @returns {Array<{id,originalName,brand,features,sourceUrl,sourcePrice,mainImage,mainImages,categoryPath,folderPath}>}
 */
export function scanFolder(rootDir) {
  const root = path.resolve(rootDir);
  if (!existsSync(root)) throw new Error(`폴더가 존재하지 않습니다: ${root}`);
  if (!statSync(root).isDirectory()) throw new Error(`폴더가 아닙니다: ${root}`);

  // 도우미가 소싱 링크에서 직접 받아 둔 실제 판매 제목({상품코드: 제목}).
  //   product.json.name 이 분류 라벨 반복("혼합곡/기타곡류 …")이나 설명 문장인 경우가 많아
  //   그대로 쓰면 노출명·옵션추출·카테고리가 전부 오염된다 → 있으면 이걸 1순위로 쓴다.
  //   파일이 없으면(구버전 도우미·조회 실패) 기존 동작 그대로.
  const sourceTitles = (() => {
    const p = path.join(root, '_source-titles.json');
    if (!existsSync(p)) return {};
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      return j && typeof j === 'object' ? j : {};
    } catch { return {}; }
  })();

  const productDirs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('product_'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const out = [];
  for (const name of productDirs) {
    const productPath = path.join(root, name);
    const productCode = name.replace(/^product_/, '');
    const pj = readProductJson(productPath);
    const mainImages = collectImages(path.join(productPath, 'main_images'));
    const sourceCat = pj.sourceCategory || {};

    // ⚠️ 원본 상품명 = name/title 중 "긴(정보 많은) 쪽". 네이버는 name 에 짧은 이름,
    //    title 에 풀타이틀("...500ML (리필)...")을 저장하는 경우가 있어, 예전처럼 name 을
    //    먼저 쓰면 용량/수량 스펙을 잃어 옵션추출·노출명에서 누락됐다(실측: 아로마티카 500ML).
    //    ⭐ 링크에서 받아 온 실제 판매 제목이 있으면 그게 최우선이다(위 sourceTitles 주석 참조).
    const fetchedTitle = typeof sourceTitles[productCode] === 'string' ? sourceTitles[productCode].trim() : '';
    const rawName = stripRepeatedTail(fetchedTitle || [pj.name, pj.title]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || name);

    out.push({
      id: productCode,
      originalName: rawName,
      brand: pj.brand ? String(pj.brand).trim() : '',
      features: deriveFeatures(pj),
      sourceUrl: readSourceUrl(productPath),
      sourcePrice: Number.isFinite(Number(pj.price)) ? Number(pj.price) : null,
      mainImage: mainImages[0] || null,     // 기본값(이미지인식 전) — run-folder 인식 단계가 최적컷으로 교체
      mainImages,                            // 대표 후보 전체(CLIP 선택 대상)
      detailImages: collectDetailImages(productPath), // 상세페이지 후보(CLIP 큐레이션 대상)
      reviewImages: collectReviewImages(productPath), // 리뷰컷(본문 교차 1순위 — CLIP 큐레이션 대상)
      certifications: Array.isArray(pj.certifications) ? pj.certifications : [], // KC 등 원본 인증({name,cert_number,…}) — 서버가 메타 grounding
      categoryPath: sourceCat.categoryPath || '', // LLM 카테고리 힌트(소싱 원본 분류)
      folderPath: productPath,
      productJson: pj,
    });
  }
  return out;
}

/** 단일 product_<코드> 폴더 1개만 스캔 (디버그/단건용) */
export function scanSingleProduct(productPath) {
  const root = path.dirname(productPath);
  const name = path.basename(productPath);
  if (!name.startsWith('product_')) throw new Error(`product_ 폴더가 아닙니다: ${name}`);
  return scanFolder(root).find((p) => p.folderPath === path.resolve(productPath)) || null;
}
