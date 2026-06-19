import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { matchCategory } from '@/lib/megaload/services/category-matcher';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import type { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;

// ── LLM 잡 큐 유지보수 크론 ──────────────────────────────────────────────
//  (A) category 잡 서버 처리: 워커는 카테고리 임베딩 미지원(ollama 임베딩 미빌드)이라
//      category task 가 영구 실패했음. 카테고리 매칭은 GPU/ollama 불필요 → 서버가 처리해 살린다.
//      ★ 품질: 반드시 그 유저의 쿠팡 adapter 를 matchCategory 에 넘긴다(라이브 쿠팡 매칭).
//        adapter 없이 로컬만 쓰면 "이탈리아 파스타→도서>여행" 같은 키워드 오매칭으로
//        기존 카테고리를 더 나쁘게 덮어쓴다(category 결과는 editedCategoryCode 에 자동 반영됨).
//  (B) 오래된 pending 자동 정리: 소유 유저가 본인 LLM 워커를 안 켜면 잡이 영영 안 빠짐
//      (claim 은 유저별). 14일+ 방치 pending 은 자동 취소해 큐를 깨끗이 유지.
// ─────────────────────────────────────────────────────────────────────────
const STALE_DAYS = 14;
const CATEGORY_BATCH = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sc = await createServiceClient();
  const summary: Record<string, unknown> = { categoryDone: 0, categoryFail: 0, noAdapter: 0, staleCanceled: 0, error: null };

  try {
    // ── (A) category 잡 수집: pending + 임베딩 미빌드로 error 난 것 ──
    type CatJob = { id: string; input: Record<string, string> | null; megaload_user_id: string };
    const [{ data: pend }, { data: errEmbed }] = await Promise.all([
      sc.from('megaload_llm_jobs').select('id, input, megaload_user_id')
        .eq('task_type', 'category').eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(CATEGORY_BATCH),
      sc.from('megaload_llm_jobs').select('id, input, megaload_user_id')
        .eq('task_type', 'category').eq('status', 'error').ilike('error_message', '%임베딩%')
        .order('created_at', { ascending: true }).limit(CATEGORY_BATCH),
    ]);
    const catJobs = [...((pend || []) as CatJob[]), ...((errEmbed || []) as CatJob[])];

    // 원자적 클레임 — 워커와의 race 방지(claimed_at=now → 워커 claim_llm_jobs 가 5분간 재클레임 안 함)
    const ids = catJobs.map((j) => j.id);
    if (ids.length) {
      await sc.from('megaload_llm_jobs')
        .update({ status: 'processing', claimed_at: new Date().toISOString(), worker_id: 'server-cron' })
        .in('id', ids);
    }

    // 유저별 adapter 캐시 (없으면 null 캐시 → 같은 유저 잡 반복 조회 방지)
    const adapterCache = new Map<string, CoupangAdapter | null>();
    const getAdapter = async (uid: string): Promise<CoupangAdapter | null> => {
      if (adapterCache.has(uid)) return adapterCache.get(uid)!;
      let a: CoupangAdapter | null = null;
      try { a = (await getAuthenticatedAdapter(sc, uid, 'coupang')) as CoupangAdapter; }
      catch { a = null; }
      adapterCache.set(uid, a);
      return a;
    };

    for (const job of catJobs) {
      const input = job.input || {};
      const name = input.originalName || input.productName || input.name || '';
      try {
        if (!name) throw new Error('상품명 없음(category)');
        const adapter = await getAdapter(job.megaload_user_id);
        if (!adapter) {
          // 쿠팡 미연동 → 로컬만 쓰면 오매칭 위험 → 처리 보류(에러로 종결, 무한 재시도 없음)
          await sc.from('megaload_llm_jobs').update({
            status: 'error', error_message: '쿠팡 미연동 — 카테고리 재매칭 보류(연동 후 재요청)',
            completed_at: new Date().toISOString(),
          }).eq('id', job.id);
          summary.noAdapter = (summary.noAdapter as number) + 1;
          continue;
        }
        const r = await matchCategory(name, adapter); // ★ adapter 전달 = 라이브 쿠팡 매칭(등록 품질)
        if (!r?.categoryCode) throw new Error('카테고리 매칭 실패');
        await sc.from('megaload_llm_jobs').update({
          status: 'done',
          result: { categoryCode: r.categoryCode, categoryName: r.categoryName, categoryPath: r.categoryPath, confidence: r.confidence, candidates: [] },
          completed_at: new Date().toISOString(), error_message: null,
        }).eq('id', job.id);
        summary.categoryDone = (summary.categoryDone as number) + 1;
      } catch (e) {
        await sc.from('megaload_llm_jobs').update({
          status: 'error', error_message: String(e instanceof Error ? e.message : e).slice(0, 300),
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        summary.categoryFail = (summary.categoryFail as number) + 1;
      }
    }

    // ── (B) 14일+ 방치 pending 자동 취소 ──
    const cutoff = new Date(Date.now() - STALE_DAYS * 864e5).toISOString();
    const { data: canceled } = await sc.from('megaload_llm_jobs')
      .update({ status: 'canceled', error_message: `${STALE_DAYS}일+ 미처리(워커 미가동) — 자동 취소`, completed_at: new Date().toISOString() })
      .eq('status', 'pending').lt('created_at', cutoff).select('id');
    summary.staleCanceled = (canceled || []).length;
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    void logSystemError({ source: 'cron/megaload-llm-maintenance', error: err }).catch(() => {});
  }

  return NextResponse.json(summary);
}
