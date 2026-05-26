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

/** product_summary.txt 에서 원본 상품 URL 추출 (웹 정규식과 동일) */
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

    out.push({
      id: productCode,
      originalName: String(pj.name || pj.title || name).trim(),
      brand: pj.brand ? String(pj.brand).trim() : '',
      features: deriveFeatures(pj),
      sourceUrl: readSourceUrl(productPath),
      sourcePrice: Number.isFinite(Number(pj.price)) ? Number(pj.price) : null,
      mainImage: mainImages[0] || null,
      mainImages,
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
