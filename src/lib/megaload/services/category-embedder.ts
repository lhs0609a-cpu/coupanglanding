// ============================================================
// Tier 1: 시맨틱 카테고리 매칭 (OpenAI 임베딩 + pgvector)
// ============================================================
// 16k 쿠팡 leaf 카테고리에 대한 OpenAI text-embedding-3-small 벡터를
// supabase.coupang_category_embeddings 에 저장해두고, 상품명 임베딩과
// 코사인 유사도로 top-K 후보를 뽑는다.
//
// 토큰 매칭이 실패한 케이스(글루합성어/서술형 상품명/사전 미등록 변형)를
// 의미 기반으로 복구.
//
// 비용: 빌드 1회 ≈ $0.01, 상품 임베딩 100k건/월 ≈ $1
// ============================================================

import { createServiceClient } from '@/lib/supabase/server';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 512;

export interface EmbeddingMatch {
  categoryCode: string;
  categoryPath: string;
  leafName: string;
  depth: number;
  similarity: number;
}

/**
 * 단일 텍스트 → 임베딩 벡터 (512-dim).
 * OPENAI_API_KEY 미설정 시 null.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!text || text.trim().length === 0) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.slice(0, 2000),
        dimensions: EMBED_DIMS,
      }),
    });
    if (!res.ok) {
      console.warn('[category-embedder] embed failed:', res.status);
      return null;
    }
    const data = await res.json() as { data: { embedding: number[] }[] };
    return data.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.warn('[category-embedder] embed error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 여러 텍스트 배치 임베딩 — 빌드 시 사용 (빌드 API 전용).
 * 단일 호출당 최대 100개 입력. OpenAI 한도 = 8192 tokens/req.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return texts.map(() => null);
  if (texts.length === 0) return [];

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts.map(t => t.slice(0, 2000)),
        dimensions: EMBED_DIMS,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[category-embedder] batch embed failed:', res.status, body.slice(0, 200));
      return texts.map(() => null);
    }
    const data = await res.json() as { data: { embedding: number[]; index: number }[] };
    const out: (number[] | null)[] = new Array(texts.length).fill(null);
    for (const item of data.data) {
      out[item.index] = item.embedding;
    }
    return out;
  } catch (err) {
    console.warn('[category-embedder] batch embed error:', err instanceof Error ? err.message : err);
    return texts.map(() => null);
  }
}

/**
 * 상품명으로 top-K 카테고리 후보 검색.
 * 임베딩 미빌드 / OpenAI 키 없음 / DB 오류 시 빈 배열.
 */
export async function findTopKByEmbedding(
  productName: string,
  k = 10,
): Promise<EmbeddingMatch[]> {
  const vec = await embedText(productName);
  if (!vec) return [];

  try {
    const sb = await createServiceClient();
    const { data, error } = await sb.rpc('match_coupang_category', {
      query_embedding: vec as unknown as string,
      match_count: k,
    });
    if (error) {
      console.warn('[category-embedder] rpc error:', error.message);
      return [];
    }
    if (!data || !Array.isArray(data)) return [];
    return (data as Array<{
      category_code: string;
      category_path: string;
      leaf_name: string;
      depth: number;
      similarity: number;
    }>).map(r => ({
      categoryCode: r.category_code,
      categoryPath: r.category_path,
      leafName: r.leaf_name,
      depth: r.depth,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.warn('[category-embedder] findTopK error:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * 임베딩 결과 → CategoryMatchResult 컨버전 (matcher 통합용).
 * 임계값 분기:
 *   ≥ 0.85 : 자동 매칭 (high confidence)
 *   0.65~0.85 : LLM rerank 대상 (Tier 2)
 *   < 0.65 : 미매칭
 */
export const EMBEDDING_AUTO_THRESHOLD = 0.85;
export const EMBEDDING_RERANK_THRESHOLD = 0.65;
