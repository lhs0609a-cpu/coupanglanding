/**
 * 올인원 텍스트 생성 오케스트레이터 (로컬 LLM)
 * ---------------------------------------------------------------------------
 * 상품 1개 → 노출상품명/제목 · 카테고리 · 상세페이지를 로컬 LLM으로 생성.
 * 각 텍스트는 compliance-mini 로 1차 검사, 위반 시 1회 재생성(회피 지시 강화).
 * 이미지(대표이미지)는 별도(ComfyUI) 단계 — 여기선 텍스트만.
 */
import { generate, parseJsonLoose } from './local-llm.mjs';
import { pickPersona, buildTitlePrompt, buildCategoryPrompt, buildDetailPrompt, buildOptionsPrompt } from './ai-prompts.mjs';
import { checkMini } from './compliance-mini.mjs';
import { checkDisplayName, checkDetail, sanitizeOptions, salvageDisplayName, hasForeignCJK } from './output-quality.mjs';

/** 파싱 실패/빈 키워드 대비 — 원본명·특징에서 검색 키워드 폴백 도출 */
function deriveKeywords(product) {
  const toks = String(product.originalName || '')
    .split(/[\s,/·]+/)
    .map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, '').trim())
    .filter((t) => t.length >= 2 && !hasForeignCJK(t));
  const feats = (product.features || []).filter((f) => typeof f === 'string' && !hasForeignCJK(f));
  return [...new Set([...feats, ...toks])].slice(0, 5);
}

const AVOID = (violations) =>
  violations.length ? `\n\n[재작성] 다음 표현은 법적 위반이라 절대 쓰지 말 것: ${violations.join(', ')}. 같은 의미도 우회 금지.` : '';

const catTokens = (s) => (String(s || '').toLowerCase().match(/[가-힣a-z0-9]+/g) || []).filter((t) => t.length >= 2);

/** LLM이 출력한 카테고리 문자열을 실제 후보 중 가장 가까운 것으로 강제 매핑(코드 보장). */
function snapToCandidate(llmPath, candidates) {
  if (!candidates || candidates.length === 0) return { code: null, path: llmPath, snapped: false };
  const qt = new Set(catTokens(llmPath));
  let best = null, bestScore = -1;
  for (const c of candidates) {
    const ct = catTokens(c.path);
    let score = 0;
    for (const t of ct) if (qt.has(t)) score++;
    // leaf(마지막 토큰) 일치 가중
    const leaf = ct[ct.length - 1];
    if (leaf && qt.has(leaf)) score += 2;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  // 겹치는 토큰이 전혀 없으면 후보 1순위로 폴백
  if (bestScore <= 0) return { code: candidates[0].code, path: candidates[0].path, snapped: true, weak: true };
  return { code: best.code, path: best.path, snapped: true };
}

/** 텍스트 1필드 생성 + 금지어 검사 + 1회 재생성 */
async function genText({ model, system, prompt, options, format, ctx }) {
  let res = await generate({ model, system, prompt, options, format });
  let chk = checkMini(res.text, ctx);
  let retried = false;
  if (!chk.ok) {
    retried = true;
    res = await generate({ model, system, prompt: prompt + AVOID(chk.violations), options, format });
    chk = checkMini(res.text, ctx);
  }
  return { text: res.text, ms: res.ms, tokPerSec: res.tokPerSec, ok: chk.ok, violations: chk.violations, retried };
}

/**
 * @param {Object} product { originalName, categoryPath?, brand?, features?[] }
 * @param {Object} o
 * @param {string} o.model
 * @param {string} [o.personaSeed]      셀러 ID 등 — 아이템위너 회피
 * @param {string[]} [o.categoryCandidates]
 * @param {number} [o.maxDetailTokens=900]
 * @returns {Promise<Object>} 생성 결과 + 타이밍
 */
export async function generateAllFields(product, { model, personaSeed, categoryCandidates = [], maxDetailTokens = 900 } = {}) {
  if (!model) throw new Error('[ai-generator] model 필요');
  const persona = pickPersona(personaSeed || product.originalName);
  const ctx = product.categoryPath || '';
  const t0 = Date.now();

  // 1~3) 제목·카테고리·옵션은 서로 독립 → 병렬 생성.
  //   단일 GPU 라도 ollama 가 동시요청을 배치(OLLAMA_NUM_PARALLEL)로 처리해 순차보다 총시간이 준다.
  //   CPU 환경에서도 안전(정확도·검증 로직은 아래에서 각 결과에 그대로 적용).
  const candObjs = (categoryCandidates || []).map((c) => (typeof c === 'string' ? { code: null, path: c } : c));
  const tp = buildTitlePrompt(product, persona);
  const cp = buildCategoryPrompt(product, candObjs.map((c) => c.path));
  const op = buildOptionsPrompt(product);
  const [titleRaw, catRaw, optRaw] = await Promise.all([
    genText({ model, ...tp, ctx }),
    genText({ model, ...cp, ctx }),
    genText({ model, ...op, ctx }),
  ]);

  // 1) 노출상품명/제목 — 파싱 실패 시 원문을 그대로 저장하지 않고 복구(원문 누출 방지)
  const titleJson = parseJsonLoose(titleRaw.text) || {};
  let displayName = typeof titleJson.displayName === 'string' ? titleJson.displayName.trim() : '';
  let displaySalvaged = false;
  if (!displayName || !checkDisplayName(displayName).ok) {
    displayName = salvageDisplayName(titleJson.displayName || titleRaw.text, product.originalName);
    displaySalvaged = true;
  }
  const dnCheck = checkDisplayName(displayName);
  let keywords = Array.isArray(titleJson.keywords)
    ? titleJson.keywords.filter((k) => typeof k === 'string' && k.trim() && !hasForeignCJK(k)).map((k) => k.trim())
    : [];
  if (keywords.length === 0) keywords = deriveKeywords(product);

  // 2) 카테고리 — LLM 결과를 실제 후보 코드로 강제 매핑
  const catJson = parseJsonLoose(catRaw.text) || {};
  const snapped = snapToCandidate(catJson.categoryPath || catRaw.text, candObjs);

  // 3) 옵션 — 외국어 필드/중복명 제거(쿠팡 옵션 정합성)
  const optJson = parseJsonLoose(optRaw.text) || {};
  const optSan = sanitizeOptions(optJson.options);
  const options = optSan.options;

  // 4) 상세페이지 — 가장 큰 단계라 별도로(위 3종이 끝난 뒤) 생성
  const dp = buildDetailPrompt(product, persona, { maxTokens: maxDetailTokens });
  const detailRaw = await genText({ model, ...dp, ctx });
  const detailCheck = checkDetail(detailRaw.text, { minLen: 200 });

  const totalMs = Date.now() - t0;
  const fields = { title: titleRaw, category: catRaw, detail: detailRaw };
  const complianceOk = Object.values(fields).every((f) => f.ok);

  // 품질 사유 집계 — compliance(법적 금지어) + 품질(외국어·누출·약매칭)
  const qualityIssues = [
    ...dnCheck.issues,
    ...(displaySalvaged ? ['노출명 원문복구'] : []),
    ...detailCheck.issues,
    ...optSan.issues,
    ...(!snapped.code ? ['카테고리 코드없음'] : []),
    ...(snapped.weak ? ['카테고리 약매칭(폴백)'] : []),
  ];
  const needsReview = !complianceOk || qualityIssues.length > 0;

  return {
    persona: persona.key,
    displayName,
    displaySalvaged,
    keywords,
    categoryCode: snapped.code,
    categoryPath: snapped.path,
    categoryLlmRaw: catJson.categoryPath || catRaw.text,
    categorySnapped: snapped.snapped,
    categoryWeak: !!snapped.weak,
    categoryConfidence: catJson.confidence ?? null,
    detail: detailRaw.text,
    options,
    qualityIssues,
    compliance: { ok: complianceOk, byField: {
      title: titleRaw.violations, category: catRaw.violations, detail: detailRaw.violations,
    } },
    timings: {
      totalMs,
      titleMs: titleRaw.ms, categoryMs: catRaw.ms, detailMs: detailRaw.ms,
      tokPerSec: { title: titleRaw.tokPerSec, category: catRaw.tokPerSec, detail: detailRaw.tokPerSec },
    },
    needsReview,
  };
}
