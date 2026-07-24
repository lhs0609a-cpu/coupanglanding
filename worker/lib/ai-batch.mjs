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
 * 카테고리 매칭 쿼리 — 상품명만이 아니라 "상품 전체"를 읽는다.
 *   ⭐ 가장 강한 신호는 **소싱 원본 카테고리**(네이버 등이 이미 분류한 경로)다.
 *      "하이네켄 논알콜릭 330ml 24병" 이름만으론 토큰이 안 맞아 가구로 빠지지만,
 *      원본 카테고리 "식품>음료>맥주>무알콜맥주" 의 leaf('무알콜맥주'→'맥주' 토큰)를
 *      쿼리에 넣으면 쿠팡 '비알콜 맥주' 가 최상위 후보로 올라온다(실측 확인).
 *   leaf 를 2회 넣어 가중하고, 경로·이름·브랜드·특징을 함께 섞는다.
 */
function catMatchQuery(p) {
  const src = String(p.categoryPath || '').trim();
  const parts = src.split(/[>/｜|›»]/).map((s) => s.trim()).filter(Boolean);
  const srcLeaf = parts[parts.length - 1] || '';
  return [
    srcLeaf, srcLeaf,                 // 원본 leaf 2회(가장 강한 신호 가중)
    parts.join(' '),                  // 원본 경로 전체
    p.originalName || '',
    p.brand || '',
    ...(Array.isArray(p.features) ? p.features : []),
  ].filter(Boolean).join(' ');
}

/**
 * 카테고리 후보 — 임베딩(bge-m3) 우선, 실패/미설치 시 토큰 매칭 폴백.
 *   상품 전체(원본 카테고리 포함)를 매칭 쿼리로 쓴다(catMatchQuery).
 * @param {Object} p  상품 { originalName, categoryPath(원본), brand, features }
 * @returns {Promise<{cands:Array, source:'embedding'|'token'|'token(embed-unavailable)'}>}
 */
async function candidatesFor(p, k) {
  const q = catMatchQuery(p);
  const tok = topCandidates(q, k);
  const decisive = decisiveToken(tok);          // 토큰 매처가 "이건 딱 이거다" 라고 말하는가

  if (embedBuilt()) {
    try {
      const emb = await topCandidatesEmbed(q, k);
      if (emb.length) {
        // ⭐ 임베딩 ∪ 토큰 — 둘은 서로 다른 실수를 한다. 임베딩은 의미는 잘 잡지만
        //    "나주배"처럼 품목명이 합성어 꼬리에 숨으면 '과일선물세트' 같은 인접 카테고리를
        //    1위로 올린다. 토큰 매처가 확정적으로 지목한 후보(배)는 반드시 후보에 넣고,
        //    확정적이면 1순위로 세운다(그 경우 LLM 호출도 생략된다).
        const merged = [];
        const seen = new Set();
        // 같은 코드가 양쪽에 있으면 토큰 매처 버전을 쓴다 — 임베딩 메타의 path 에는 leaf 가
        // 빠져 있어(1글자 카테고리) LLM 도 검수화면도 무슨 카테고리인지 알 수 없다.
        const byCode = new Map(tok.map((c) => [c.code, c]));
        const push = (c) => {
          const best = byCode.get(c?.code) || c;
          if (best && !seen.has(best.code)) { seen.add(best.code); merged.push(best); }
        };
        if (decisive) push(tok[0]);
        for (const c of emb) push(c);
        for (const c of tok) push(c);
        return { cands: merged.slice(0, k), source: 'embedding+token', decisive };
      }
      return { cands: tok, source: 'token', decisive };
    } catch {
      // 인덱스는 빌드됐지만 임베딩 모델(bge-m3) 미설치/오류 → 토큰 폴백
      return { cands: tok, source: 'token(embed-unavailable)', decisive };
    }
  }
  return { cands: tok, source: 'token', decisive };
}

/**
 * "LLM 에게 물어볼 필요조차 없는" 압도적 1위인가 — 토큰 매처 점수 기준.
 * ---------------------------------------------------------------------------
 * 후보가 1개뿐이거나(예: '나주배' → 배 하나), 1위가 2위를 크게 앞서면 LLM 호출을 통째로
 * 생략한다(상품당 LLM 4회 → 3회). 정확도는 오히려 올라간다 — 압도적 1위를 두고 LLM 이
 * 다른 후보를 고르는 건 대부분 오답이었다. (임베딩 점수는 코사인이라 척도가 달라 미적용)
 */
function decisiveToken(cands) {
  if (!cands || cands.length === 0) return false;
  if (cands.length === 1) return true;
  const [a, b] = cands;
  if (typeof a.score !== 'number' || typeof b.score !== 'number') return false;
  return a.score >= 4 && a.score >= b.score * 1.8;
}

/**
 * @param {Array<{originalName:string, brand?:string, features?:string[], id?:string, categoryPath?:string}>} products
 * @param {Object} o
 * @param {string} o.model
 * @param {string} [o.sellerId]            아이템위너 회피용 셀러 시드
 * @param {number} [o.maxDetailTokens=800]
 * @param {number} [o.concurrency=1]       동시에 생성할 상품 수(남은 VRAM 에 맞춰 호출부가 결정)
 * @param {(i:number, total:number, rec:Object, done:number)=>void} [o.onItem]
 * @returns {Promise<{records:Object[], summary:Object}>}
 */
export async function generateBatch(products, { model, sellerId = '', maxDetailTokens = 800, onItem, marginBrackets, concurrency = 1 } = {}) {
  if (!model) throw new Error('[ai-batch] model 필요');
  const records = new Array(products.length);
  let ok = 0, review = 0, totalMs = 0, done = 0;
  const sourceCounts = {};
  const t0 = Date.now();

  // ⚡ 상품 단위 동시 실행 — 단일 GPU 라도 ollama 가 여러 요청을 하나의 배치로 디코딩해
  //    처리량이 크게 오른다(순차 1개는 GPU 를 다 못 쓴다). 동시수는 호출부가 남은 VRAM 을
  //    보고 정한다(부족하면 1 = 예전과 동일 동작). 결과는 인덱스로 넣어 순서를 보존한다.
  const genOne = async (i) => {
    const p = products[i];
    const seed = `${sellerId}:${p.id || p.originalName}`;
    const { cands, source, decisive } = await candidatesFor(p, 8);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const r = await generateAllFields(p, {
      model, personaSeed: seed, categoryCandidates: cands, maxDetailTokens, categoryDecisive: decisive,
    });
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
    records[i] = rec;
    totalMs += rec.ms;
    if (rec.needsReview) review++; else ok++;
    // onItem 이 비동기(예: ComfyUI 대표이미지 가공)일 수 있으므로 await — GPU 직렬 보장.
    //   ⚠️ 병렬이면 완료 순서가 인덱스 순이 아니다 → 진행표시는 "완료 개수(done)"로 준다
    //      (i 로 주면 웹 진행바가 뒤로 튄다).
    await onItem?.(i, products.length, rec, ++done);
  };

  const lanes = Math.max(1, Math.min(Number(concurrency) || 1, products.length));
  let cursor = 0;
  const lane = async () => { while (cursor < products.length) await genOne(cursor++); };
  await Promise.all(Array.from({ length: lanes }, lane));

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
      concurrency: lanes,
    },
  };
}
