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
import { topCandidatesEmbed, topCandidatesFromVec, embedQueries, isBuilt as embedBuilt } from './category-embed-matcher.mjs';
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
  // ⚠️ 원본 **대분류는 쿼리에서 뺀다**. 네이버 대분류 '생활/건강' 이 '생활'·'건강' 두 낱말로
  //    쪼개지는데, 이 낱말들은 쿠팡 도서 카테고리명에 널려 있다(국내도서>가정 살림>육아/교육>
  //    건강/식생활, 어린이>교양>자기계발>생활, 건강 취미>성생활 …).
  //    실측(2026-08-21): 냉수통·도자기 밥용기의 후보 15개 중 6개가 도서로 채워졌고, 결국
  //    **비식품 2건이 2건 다 도서로 등록 직전까지 갔다**. 대분류를 빼면 같은 상품의 후보가
  //    '밀폐용기/세트 → 물통 → 기타보관용기' 로 정리된다.
  //    대분류는 버려도 손해가 없다 — 가장 덜 구체적인 신호인 데다, 도메인 정합은
  //    preferSourceDomain 이 따로 본다.
  return [
    srcLeaf, srcLeaf,                 // 원본 leaf 2회(가장 강한 신호 가중)
    parts.slice(1).join(' '),         // 원본 경로(대분류 제외 — 위 주석)
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
async function candidatesFor(p, k, qvec) {
  const q = catMatchQuery(p);
  const tok = topCandidates(q, k);
  const decisive = decisiveToken(tok);          // 토큰 매처가 "이건 딱 이거다" 라고 말하는가

  if (embedBuilt()) {
    try {
      // 미리 받아 둔 질의 벡터가 있으면 네트워크를 타지 않는다(순수 계산).
      //   없을 때만 예전처럼 그 자리에서 부른다 — 그 경로는 생성 슬롯과 경쟁하므로 느리다.
      const emb = qvec ? topCandidatesFromVec(qvec, k) : await topCandidatesEmbed(q, k);
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
        return { cands: preferSourceDomain(merged.slice(0, k), p), source: 'embedding+token', decisive };
      }
      return { cands: preferSourceDomain(tok, p), source: 'token', decisive };
    } catch {
      // 인덱스는 빌드됐지만 임베딩 모델(bge-m3) 미설치/오류 → 토큰 폴백
      return { cands: preferSourceDomain(tok, p), source: 'token(embed-unavailable)', decisive };
    }
  }
  return { cands: preferSourceDomain(tok, p), source: 'token', decisive };
}

/**
 * 소싱 원본 대분류와 같은 대분류의 후보를 앞으로 세운다.
 * ---------------------------------------------------------------------------
 * 실측: "차량용 무선충전 거치대"(원본 대분류=자동차용품)에서 매처는 자동차용품 카테고리를
 *   1위로 올렸는데, LLM 이 목록 아래쪽의 **이어폰 액세서리 거치대**(가전)를 골랐다.
 *   대분류는 사람이 이미 정해 준 near-ground-truth 이므로, 같은 대분류를 먼저 보여준다.
 * 매핑 테이블을 박지 않는다 — 원본 대분류 글자와 후보 경로 앞부분의 겹침으로 판정한다
 *   ('자동차용품'↔'자동차용품', '패션의류'↔'패션의류잡화', '디지털/가전'↔'가전 디지털').
 */
/**
 * 원본 분류와 **절대 양립할 수 없는** 후보를 목록에서 아예 뺀다 — 고르기 전에 차단.
 * ---------------------------------------------------------------------------
 * 지금까지 이 규칙은 카테고리 프롬프트의 문장으로만 있었다("원본이 '맥주/음료'면 절대
 * '도서/가구/완구'를 고르지 않는다"). 문장은 지켜지지 않았고, 지켜지지 않아도 아무도 안 막았다.
 *
 * 왜 하필 도서인가 — 쿠팡 도서 leaf 는 상품명이 아니라 **주제어**다("생활", "건강/식생활",
 *   "가정 살림", "요리", "육아/교육"). 그래서 상품과 아무 상관 없는 일반어에도 잘 달라붙는다.
 *   실측(2026-08-21): 네이버 대분류 '생활/건강' 의 낱말 '생활'·'건강' 만으로 후보 15개 중
 *   6개가 도서로 찼고(34453 '건강/식생활' 은 leaf 의 80% 가 그 두 낱말로 설명된다 → 4.59점 5위),
 *   비식품 2건이 2건 다 도서로 확정됐다.
 *   게다가 최종 확정(snapToCandidate)은 토큰 겹침 **동점을 배열 순서로** 가른다 — 실측에서
 *   80584·82008·80203·36018(도서)이 모두 3점 동점이었다. 즉 도서가 목록에 남아 있는 한
 *   "우연히 앞자리면 도서" 가 된다.
 * → 원본이 도서·음반류가 아니면 도서 후보는 애초에 보여 주지 않는다. 전부 걸러져 빈 목록이
 *   되면(=진짜 도서일 수 있다) 원본을 그대로 둔다.
 */
// ⚠️ \b(단어경계)는 ASCII 기준이라 한글엔 안 먹는다 — /^도서\b/ 는 "도서 국내도서…" 를
//    영원히 못 맞춘다(실측: 가드가 통째로 무효였다). 공백/문자열끝으로 직접 끊는다.
const COUPANG_BOOK_TOP = /^(도서|음반|dvd|블루레이)(\s|$)/i;
const SOURCE_IS_BOOKISH = /도서|서적|음반|dvd|블루레이|전자책|만화책|잡지|(^|[^가-힣])책([^가-힣]|$)/i;
function dropImpossibleDomains(cands, p) {
  if (SOURCE_IS_BOOKISH.test(String(p.categoryPath || ''))) return cands;
  const kept = cands.filter((c) => !COUPANG_BOOK_TOP.test(String(c.path || '').trim()));
  return kept.length > 0 ? kept : cands;
}

function preferSourceDomain(cands, p) {
  cands = dropImpossibleDomains(cands, p);
  // ⚠️ 대분류는 '>' 로만 자른다. '/' 까지 자르면 '생활/건강' 이 '생활' 로 잘려 쿠팡 대분류와
  //    아무것도 안 맞고, 그러면 이 앵커가 통째로 무력화된다(실측: 냉수통·밥용기가 도서로 갔을 때
  //    일치 0건 → 원래 순서 유지 → 도서 후보가 그대로 위에 남았다).
  const srcTop = String(p.categoryPath || '').split('>')[0] || '';
  const srcWords = (srcTop.toLowerCase().match(/[가-힣a-z0-9]+/g) || []).filter((w) => w.length >= 2);
  if (srcWords.length === 0) return cands;
  const agrees = (c) => {
    const head = (String(c.path || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || []).slice(0, 2);
    return head.some((h) => srcWords.some((w) => h.includes(w) || w.includes(h)));
  };
  const hit = cands.filter(agrees);
  // 전부 일치하거나 하나도 일치하지 않으면 원래 순서 유지(정보 없음).
  if (hit.length === 0 || hit.length === cands.length) return cands;
  return [...hit, ...cands.filter((c) => !agrees(c))];
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
 * @param {(i:number, total:number, error:string, done:number)=>void} [o.onItemError]
 *   상품 1건 실패 통지. 실패해도 배치는 계속되고, 그 자리는 records[i]=undefined 로 남는다.
 * @returns {Promise<{records:Object[], summary:Object}>}
 *   records 에는 **구멍(undefined)이 있을 수 있다** — 쓰는 쪽에서 반드시 걸러라.
 */
export async function generateBatch(products, { model, sellerId = '', maxDetailTokens = 800, onItem, onItemError, marginBrackets, concurrency = 1 } = {}) {
  if (!model) throw new Error('[ai-batch] model 필요');
  const records = new Array(products.length);
  let ok = 0, review = 0, totalMs = 0, done = 0;
  const sourceCounts = {};
  const t0 = Date.now();

  // ⚡ 상품 단위 동시 실행 — 단일 GPU 라도 ollama 가 여러 요청을 하나의 배치로 디코딩해
  //    처리량이 크게 오른다(순차 1개는 GPU 를 다 못 쓴다). 동시수는 호출부가 남은 VRAM 을
  //    보고 정한다(부족하면 1 = 예전과 동일 동작). 결과는 인덱스로 넣어 순서를 보존한다.
  // ── 카테고리 질의 벡터를 **생성 전에 한 번에** 받아 둔다 ────────────────────
  //   임베딩은 텍스트 생성과 같은 ollama 슬롯을 쓴다. 생성 도중에 부르면 동시 6개가 도는
  //   줄 뒤에 서서 수십 초를 기다린다(실측: 60초를 넘겨도 응답 없음 → 상한이 없던 옛 코드는
  //   거기서 생성 전체가 멈췄다). 지금은 아무도 슬롯을 안 쓰는 이 시점에 전부 받는다.
  //   실패하면 빈 배열이고, 그러면 상품마다 토큰 매칭으로 간다(설계된 폴백, 품질 하락은 있으나
  //   멈추지는 않는다).
  const qvecs = embedBuilt()
    ? await embedQueries(products.map((p) => catMatchQuery(p)), { onLog: (m) => console.log(m) })
    : [];

  const genOne = async (i) => {
    const p = products[i];
    const seed = `${sellerId}:${p.id || p.originalName}`;
    // 후보 15개 — LLM 이 의미로 고르는 단계라 리콜을 넉넉히 준다(프롬프트 비용은 미미).
    //   토큰 매칭 1위가 늘 정답은 아니지만(흔한 단어에 끌린 후보가 위로 올 수 있다),
    //   정답은 상위권에 들어오므로 LLM 이 원본 카테고리 앵커와 함께 고른다.
    const { cands, source, decisive } = await candidatesFor(p, 15, qvecs[i]);
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
      // 원본(DOM) 상품설명 텍스트 — 웹이 맨 끝 "상품 상세정보"에 노출(있을 때만). 길이 컷.
      sourceDescription: (p.productJson && typeof p.productJson.description === 'string' && p.productJson.description.trim())
        ? p.productJson.description.slice(0, 6000) : null,
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
      // 상세글 재생성 횟수·사유 — 속도 진단(bench-allinone-speed)과 검수 화면 참고용.
      detailAttempts: r.detailAttempts ?? 1,
      detailIssueLog: r.detailIssueLog || [],
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
  // ── 상품 단위 실패 격리 ──────────────────────────────────────────────────
  //   ⚠️ 예전엔 genOne 이 그대로 throw 했다 → lane 의 while 로 전파 → Promise.all reject →
  //      generateBatch throw → run-folder 가 .generated.jsonl 을 **쓰기 전에** 죽었다.
  //      (파일 쓰기는 맨 끝 Phase C 의 원자적 rename 이다.)
  //      그래서 한 상품만 터져도 **성공한 나머지까지 전부 소실**됐다.
  //      실측 사고: 모델이 메모리 부족으로 못 떠서 100개 중 결과 0개.
  //   이제 실패한 상품만 비우고(records[i] = undefined) 나머지는 살린다.
  const failures = [];
  let consecutiveFails = 0;
  let abortReason = null;
  //   연속 실패는 "이 PC 에서 모델이 안 뜬다"는 신호다. 100번 반복해봐야 100번 실패하고
  //   시간만 버리므로 일찍 접고, 그때까지 성공한 결과는 그대로 반환한다(throw 하지 않는다).
  const ABORT_AFTER_CONSECUTIVE = 3;
  const lane = async () => {
    while (cursor < products.length) {
      if (abortReason) return;
      const i = cursor++;
      try {
        await genOne(i);
        consecutiveFails = 0;
      } catch (e) {
        const msg = String(e?.message || e);
        failures.push({ index: i, id: products[i]?.id ?? null, error: msg.slice(0, 300) });
        consecutiveFails++;
        // 진행 표시는 계속 흘러야 한다(웹 진행바가 멈춘 것처럼 보이지 않게).
        try { await onItemError?.(i, products.length, msg, ++done); } catch { /* 로깅 실패는 무해 */ }
        if (consecutiveFails >= ABORT_AFTER_CONSECUTIVE) {
          abortReason = `연속 ${consecutiveFails}건 실패 — 남은 ${products.length - done}개를 건너뜁니다: ${msg.slice(0, 200)}`;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));

  return {
    records,
    summary: {
      total: products.length, ok, needsReview: review,
      failed: failures.length, failures: failures.slice(0, 20), abortReason,
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
