/**
 * 올인원 배치 생성 오케스트레이터
 * ---------------------------------------------------------------------------
 * 상품 배열 → 각 상품마다 (카테고리 후보[임베딩 우선, 없으면 토큰] → 4필드 생성)
 * → 등록용 레코드 배열. 단일 GPU라 LLM은 순차. 이미지(대표이미지)는 별도 단계.
 *
 * 아이템위너 회피: personaSeed = `${sellerId}:${상품식별}` 로 셀러마다 톤 분산.
 */
import { generateAllFields } from './ai-generator.mjs';
import { topCandidates } from './category-candidates-mini.mjs';
import { topCandidatesEmbed, isBuilt as embedBuilt } from './category-embed-matcher.mjs';
import { calculateSellingPrice } from './margin-mini.mjs';

/**
 * 카테고리 후보 — 임베딩(bge-m3) 우선, 실패/미설치 시 토큰 매칭 폴백.
 * @returns {Promise<{cands:Array, source:'embedding'|'token'|'token(embed-unavailable)'}>}
 */
async function candidatesFor(name, k) {
  if (embedBuilt()) {
    try {
      const c = await topCandidatesEmbed(name, k);
      if (c.length) return { cands: c, source: 'embedding' };
      return { cands: topCandidates(name, k), source: 'token' };
    } catch {
      // 인덱스는 빌드됐지만 임베딩 모델(bge-m3) 미설치/오류 → 토큰 폴백(정확도 저하)
      return { cands: topCandidates(name, k), source: 'token(embed-unavailable)' };
    }
  }
  return { cands: topCandidates(name, k), source: 'token' };
}

/**
 * @param {Array<{originalName:string, brand?:string, features?:string[], id?:string, categoryPath?:string}>} products
 * @param {Object} o
 * @param {string} o.model
 * @param {string} [o.sellerId]            아이템위너 회피용 셀러 시드
 * @param {number} [o.maxDetailTokens=800]
 * @param {(i:number, total:number, rec:Object)=>void} [o.onItem]
 * @returns {Promise<{records:Object[], summary:Object}>}
 */
export async function generateBatch(products, { model, sellerId = '', maxDetailTokens = 800, onItem, marginBrackets } = {}) {
  if (!model) throw new Error('[ai-batch] model 필요');
  const records = [];
  let ok = 0, review = 0, totalMs = 0;
  const sourceCounts = {};
  const t0 = Date.now();
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const seed = `${sellerId}:${p.id || p.originalName}`;
    const { cands, source } = await candidatesFor(p.originalName, 8);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const r = await generateAllFields(p, { model, personaSeed: seed, categoryCandidates: cands, maxDetailTokens });
    const sellingPrice = marginBrackets ? calculateSellingPrice(p.sourcePrice, marginBrackets) : calculateSellingPrice(p.sourcePrice);
    const rec = {
      sourceId: p.id ?? null,
      originalName: p.originalName,
      // 소스 통과 필드(검수화면 표시용)
      sourceUrl: p.sourceUrl ?? null,
      sourcePrice: p.sourcePrice ?? null,
      sellingPrice,                       // 마진 계산 판매가
      mainImage: p.mainImage ?? (Array.isArray(p.mainImages) ? p.mainImages[0] : null),
      mainImageRanked: p.mainImageRanked ?? null,                 // CLIP 대표컷 랭킹(웹 재정렬·검수 표시용)
      detailImages: Array.isArray(p.detailImagesKept) ? p.detailImagesKept : (p.detailImages || []), // 큐레이션된 상세컷(kept)
      detailDroppedNames: Array.isArray(p.detailDroppedNames) ? p.detailDroppedNames : [], // CLIP 이 버린 상세컷 파일명(웹이 정확히 제외)
      sourceCertifications: Array.isArray(p.certifications) ? p.certifications : [], // KC 등 원본 인증 — 웹이 서버 grounding 으로 등록에 반영
      // AI 생성 필드
      displayName: r.displayName,
      keywords: r.keywords,
      categoryCode: r.categoryCode,
      categoryPath: r.categoryPath,
      options: r.options,
      detail: r.detail,
      persona: r.persona,
      needsReview: r.needsReview,
      qualityIssues: r.qualityIssues || [],
      displaySalvaged: !!r.displaySalvaged,
      categoryWeak: !!r.categoryWeak,
      compliance: r.compliance,
      ms: r.timings.totalMs,
    };
    records.push(rec);
    totalMs += rec.ms;
    if (rec.needsReview) review++; else ok++;
    // onItem 이 비동기(예: ComfyUI 대표이미지 가공)일 수 있으므로 await — GPU 직렬 보장.
    await onItem?.(i, products.length, rec);
  }
  return {
    records,
    summary: {
      total: products.length, ok, needsReview: review,
      avgMs: products.length ? Math.round(totalMs / products.length) : 0,
      wallMs: Date.now() - t0,
      // 파일 존재가 아니라 "실제로 어떤 후보 소스를 썼는지" 집계로 보고
      candidateSource: (() => {
        const keys = Object.keys(sourceCounts);
        if (keys.length === 1) return keys[0];
        return keys.map((k) => `${k}:${sourceCounts[k]}`).join(', ');
      })(),
      candidateSourceCounts: sourceCounts,
    },
  };
}
