// ============================================================
// Tier 2: LLM 후보 재정렬 (GPT-4o-mini)
// ============================================================
// 임베딩이 뽑은 top-10 후보 중 LLM이 상품명에 가장 적합한 카테고리를 선택.
// 임베딩만으로는 모호한 0.65~0.85 신뢰도 구간을 99%+ 정확도로 끌어올림.
//
// 비용: 1건당 ≈ $0.0002 (GPT-4o-mini, 약 800 input + 50 output tokens)
// ============================================================

export interface RerankCandidate {
  code: string;
  path: string;
}

export interface RerankResult {
  code: string;
  path: string;
  confidence: number;
}

/**
 * 후보 카테고리 중 상품에 가장 적합한 1개 선택.
 * OPENAI_API_KEY 미설정 / 호출 실패 시 null.
 */
export async function rerankCategoryCandidates(
  productName: string,
  candidates: RerankCandidate[],
): Promise<RerankResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!candidates || candidates.length === 0) return null;

  // 후보가 1개면 LLM 호출 생략
  if (candidates.length === 1) {
    return { code: candidates[0].code, path: candidates[0].path, confidence: 0.7 };
  }

  // 최대 10개로 제한 — 토큰 절약
  const top = candidates.slice(0, 10);
  const candidateLines = top
    .map((c, i) => `${i + 1}. [${c.code}] ${c.path}`)
    .join('\n');

  const prompt = `아래 상품명을 가장 잘 나타내는 쿠팡 카테고리를 후보 중 하나 골라.

상품명: ${productName}

후보:
${candidateLines}

답변 형식: 번호만 출력 (예: 3). 적합한 후보가 전혀 없으면 0.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '한국 이커머스 카테고리 분류 전문가. 정확한 leaf 카테고리 매칭만 수행. 잡담 없이 번호만.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 8,
      }),
    });
    if (!res.ok) {
      console.warn('[category-llm-reranker] api status:', res.status);
      return null;
    }
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const num = parseInt(raw.match(/\d+/)?.[0] || '0', 10);
    if (!Number.isFinite(num) || num <= 0 || num > top.length) return null;
    const picked = top[num - 1];
    return { code: picked.code, path: picked.path, confidence: 0.88 };
  } catch (err) {
    console.warn('[category-llm-reranker] error:', err instanceof Error ? err.message : err);
    return null;
  }
}
