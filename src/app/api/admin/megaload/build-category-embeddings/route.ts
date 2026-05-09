import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { embedBatch } from '@/lib/megaload/services/category-embedder';
import indexJson from '@/lib/megaload/data/coupang-cat-index.json';
import detailsJson from '@/lib/megaload/data/coupang-cat-details.json';
import { logSystemError, logSystemInfo } from '@/lib/utils/system-log';
import crypto from 'crypto';

export const maxDuration = 300; // 5분 — 16k 카테고리 빌드

type IndexEntry = [string, string, string, number];
type CategoryDetailRaw = { p: string };

/**
 * POST — 16k 쿠팡 카테고리에 대한 임베딩 빌드 / 갱신.
 * 1회 셋업용. text_hash 변경된 카테고리만 재임베딩.
 * body: { force?: boolean, batchSize?: number, offset?: number, limit?: number }
 *  - force: true 시 hash 무시하고 전체 재빌드
 *  - offset/limit: 부분 빌드 (대용량 환경에서 분할 실행)
 */
export async function POST(req: NextRequest) {
  try {
    // 어드민 권한 검증
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase
      .from('pt_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY 미설정' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({})) as {
      force?: boolean;
      batchSize?: number;
      offset?: number;
      limit?: number;
    };
    const force = !!body.force;
    const batchSize = Math.min(Math.max(body.batchSize ?? 100, 16), 200);
    const offset = Math.max(body.offset ?? 0, 0);
    const limit = body.limit ?? Number.POSITIVE_INFINITY;

    const index = indexJson as IndexEntry[];
    const details = detailsJson as unknown as Record<string, CategoryDetailRaw>;

    const sb = await createServiceClient();

    // 기존 hash 조회 (skip 판정용)
    const existingHash = new Map<string, string>();
    if (!force) {
      const { data: rows } = await sb
        .from('coupang_category_embeddings')
        .select('category_code, text_hash');
      for (const r of (rows || []) as Array<{ category_code: string; text_hash: string }>) {
        existingHash.set(r.category_code, r.text_hash);
      }
    }

    // 임베딩 대상 텍스트 구성 — leaf 이름 + path (의미 손실 최소화)
    type Job = {
      code: string;
      path: string;
      leaf: string;
      depth: number;
      text: string;
      hash: string;
    };
    const jobs: Job[] = [];
    const total = Math.min(index.length, offset + limit);
    for (let i = offset; i < total; i++) {
      const [code, , leaf, depth] = index[i];
      const path = details[code]?.p || leaf;
      // 임베딩 텍스트: 풀 path 를 그대로 (`>`를 공백으로 풀어 자연어화).
      // "뷰티>스킨>클렌징>클렌징 폼" → "뷰티 스킨 클렌징 클렌징 폼"
      const text = path.replace(/>/g, ' ');
      const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
      if (!force && existingHash.get(code) === hash) continue;
      jobs.push({ code, path, leaf, depth, text, hash });
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: total - offset,
        embedded: 0,
        message: '변경 없음 — 모든 카테고리가 최신 hash 와 일치',
      });
    }

    // 배치 임베딩 + upsert
    let embedded = 0;
    let failed = 0;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const slice = jobs.slice(i, i + batchSize);
      const vecs = await embedBatch(slice.map(j => j.text));
      const rows = slice
        .map((j, k) => {
          const v = vecs[k];
          if (!v) { failed++; return null; }
          return {
            category_code: j.code,
            category_path: j.path,
            leaf_name: j.leaf,
            depth: j.depth,
            embedding: JSON.stringify(v) as unknown as string, // pgvector 텍스트 입력 ([1,2,3,...])
            text_hash: j.hash,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (rows.length > 0) {
        const { error } = await sb
          .from('coupang_category_embeddings')
          .upsert(rows, { onConflict: 'category_code' });
        if (error) {
          console.warn('[build-category-embeddings] upsert error:', error.message);
          failed += rows.length;
        } else {
          embedded += rows.length;
        }
      }

      // OpenAI 분당 한도 보호
      if (i + batchSize < jobs.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    void logSystemInfo({
      source: 'megaload/build-category-embeddings',
      category: 'megaload',
      message: `카테고리 임베딩 빌드 완료 — ${embedded}건 임베딩, ${failed}건 실패`,
      userId: user.id,
      context: { embedded, failed, force, offset, limit: jobs.length, total },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      embedded,
      failed,
      total,
      pendingNext: total < index.length ? { offset: total } : null,
    });
  } catch (err) {
    console.error('[build-category-embeddings] ERROR:', err);
    void logSystemError({ source: 'megaload/build-category-embeddings', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '임베딩 빌드 실패' },
      { status: 500 },
    );
  }
}
