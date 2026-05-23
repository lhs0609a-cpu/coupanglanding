/**
 * 올인원 텍스트 생성 오케스트레이터 (로컬 LLM)
 * ---------------------------------------------------------------------------
 * 상품 1개 → 노출상품명/제목 · 카테고리 · 상세페이지를 로컬 LLM으로 생성.
 * 각 텍스트는 compliance-mini 로 1차 검사, 위반 시 1회 재생성(회피 지시 강화).
 * 이미지(대표이미지)는 별도(ComfyUI) 단계 — 여기선 텍스트만.
 */
import { generate, parseJsonLoose } from './local-llm.mjs';
import { pickPersona, buildTitlePrompt, buildCategoryPrompt, buildDetailPrompt } from './ai-prompts.mjs';
import { checkMini } from './compliance-mini.mjs';

const AVOID = (violations) =>
  violations.length ? `\n\n[재작성] 다음 표현은 법적 위반이라 절대 쓰지 말 것: ${violations.join(', ')}. 같은 의미도 우회 금지.` : '';

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

  // 1) 노출상품명/제목
  const tp = buildTitlePrompt(product, persona);
  const titleRaw = await genText({ model, ...tp, ctx });
  const titleJson = parseJsonLoose(titleRaw.text) || {};

  // 2) 카테고리
  const cp = buildCategoryPrompt(product, categoryCandidates);
  const catRaw = await genText({ model, ...cp, ctx });
  const catJson = parseJsonLoose(catRaw.text) || {};

  // 3) 상세페이지
  const dp = buildDetailPrompt(product, persona, { maxTokens: maxDetailTokens });
  const detailRaw = await genText({ model, ...dp, ctx });

  const totalMs = Date.now() - t0;
  const fields = { title: titleRaw, category: catRaw, detail: detailRaw };
  const allOk = Object.values(fields).every((f) => f.ok);
  const totalTokens = Object.values(fields).reduce((s, f) => s + (f.evalCount || 0), 0);

  return {
    persona: persona.key,
    displayName: titleJson.displayName || titleRaw.text,
    keywords: titleJson.keywords || [],
    categoryPath: catJson.categoryPath || catRaw.text,
    categoryConfidence: catJson.confidence ?? null,
    detail: detailRaw.text,
    compliance: { ok: allOk, byField: {
      title: titleRaw.violations, category: catRaw.violations, detail: detailRaw.violations,
    } },
    timings: {
      totalMs,
      titleMs: titleRaw.ms, categoryMs: catRaw.ms, detailMs: detailRaw.ms,
      tokPerSec: { title: titleRaw.tokPerSec, category: catRaw.tokPerSec, detail: detailRaw.tokPerSec },
    },
    needsReview: !allOk,
  };
}
