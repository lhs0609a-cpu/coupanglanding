import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import type { NoticeCategoryMeta } from '@/lib/megaload/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/megaload/services/coupang-product-builder';
import { getNoticeCategoriesWithCacheBatch } from '@/lib/megaload/services/notice-category-cache';

export const maxDuration = 50;

interface InitJobBody {
  totalCount: number;
  categoryCodes: string[]; // 유니크한 카테고리 코드 목록
}

interface CategoryMetaMap {
  [categoryCode: string]: {
    noticeMeta: NoticeCategoryMeta[];
    attributeMeta: AttributeMeta[];
  };
}

/**
 * POST — 배치 등록 잡 초기화
 *  1. sh_sync_jobs 레코드 생성
 *  2. 유니크 카테고리별 notices/attributes 메타 조회
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const body = (await req.json()) as InitJobBody;

    if (!body.totalCount || body.totalCount <= 0) {
      return NextResponse.json({ error: '등록할 상품 수가 필요합니다.' }, { status: 400 });
    }

    // 1. sh_sync_jobs 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({
        megaload_user_id: shUserId,
        channel: 'coupang',
        job_type: 'bulk_register',
        status: 'running',
        total_count: body.totalCount,
        processed_count: 0,
        error_count: 0,
      })
      .select()
      .single();

    const jobId = (job as Record<string, unknown>)?.id as string;
    if (!jobId) {
      return NextResponse.json({ error: 'Job 생성 실패' }, { status: 500 });
    }

    // 2. 유니크 카테고리별 메타 조회
    //   개선 (2026-05-13):
    //     - Notice: getNoticeCategoriesWithCacheBatch 로 Supabase 캐시를 in() 1쿼리로 일괄 조회 → 캐시 hit 시 라이브 API 0회.
    //     - Notice 와 Attribute 를 코드별 sequential 처리하지 않고 분리 병렬 → 한 코드 대기 시간 절반.
    //     - Attribute 는 Supabase 캐시 없음 (별도 마이그레이션 필요) → 코드별 12 동시 라이브 호출.
    const categoryMeta: CategoryMetaMap = {};
    const uniqueCodes = [...new Set(body.categoryCodes || [])].filter(Boolean);

    if (uniqueCodes.length > 0) {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const coupangAdapter = adapter as CoupangAdapter;

      // ─ Notice 일괄 조회 (Supabase 캐시 우선, 미스만 라이브) ─
      const noticePromise = getNoticeCategoriesWithCacheBatch(
        serviceClient,
        coupangAdapter,
        uniqueCodes,
        { concurrency: 10, delayMs: 100 },
      );

      // ─ Attribute 코드별 병렬 조회 (캐시 미적용 — 코드별 1회 라이브) ─
      const ATTR_CONCURRENT = 12;
      const attrMap: Record<string, AttributeMeta[]> = {};
      const attrWorker = async (codes: string[]) => {
        for (const code of codes) {
          try {
            const r = await coupangAdapter.getCategoryAttributes(code);
            attrMap[code] = r.items;
          } catch {
            attrMap[code] = [];
          }
        }
      };
      // 워크큐 패턴 — 균등 분배보다 처리 속도 차이 흡수
      let attrIdx = 0;
      const attrTake = (): string[] => {
        const slot: string[] = [];
        while (attrIdx < uniqueCodes.length && slot.length < 1) slot.push(uniqueCodes[attrIdx++]);
        return slot;
      };
      const attrWorkers = Array.from({ length: Math.min(ATTR_CONCURRENT, uniqueCodes.length) }, async () => {
        for (;;) {
          const next = attrTake();
          if (next.length === 0) return;
          await attrWorker(next);
        }
      });

      // Notice + Attribute 동시 진행
      const [noticeMap] = await Promise.all([noticePromise, Promise.all(attrWorkers)]);

      for (const code of uniqueCodes) {
        categoryMeta[code] = {
          noticeMeta: noticeMap[code] || [],
          attributeMeta: attrMap[code] || [],
        };
      }
    }

    return NextResponse.json({ jobId, categoryMeta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job 초기화 실패' },
      { status: 500 },
    );
  }
}
