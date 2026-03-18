import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';
import { CoupangAdapter } from '@/lib/sellerhub/adapters/coupang.adapter';
import type { NoticeCategoryMeta } from '@/lib/sellerhub/services/notice-field-filler';
import type { AttributeMeta } from '@/lib/sellerhub/services/coupang-product-builder';

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

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다.' }, { status: 404 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const body = (await req.json()) as InitJobBody;

    if (!body.totalCount || body.totalCount <= 0) {
      return NextResponse.json({ error: '등록할 상품 수가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 1. sh_sync_jobs 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({
        sellerhub_user_id: shUserId,
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
    const categoryMeta: CategoryMetaMap = {};
    const uniqueCodes = [...new Set(body.categoryCodes || [])].filter(Boolean);

    if (uniqueCodes.length > 0) {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
      const coupangAdapter = adapter as CoupangAdapter;

      // 병렬 조회 (5개 동시) — 순차에서 개선
      const CONCURRENT = 5;
      const fetchCategoryMeta = async (code: string) => {
        let noticeMeta: NoticeCategoryMeta[] = [];
        let attributeMeta: AttributeMeta[] = [];

        try {
          const noticeResult = await coupangAdapter.getNoticeCategoryFields(code);
          noticeMeta = noticeResult.items.map((item) => ({
            noticeCategoryName: item.noticeCategoryName,
            fields: item.noticeCategoryDetailNames.map((d) => ({
              name: d.name,
              required: d.required,
            })),
          }));
        } catch {
          // notices 조회 실패 → 빈 배열
        }

        try {
          const attrResult = await coupangAdapter.getCategoryAttributes(code);
          attributeMeta = attrResult.items;
        } catch {
          // attributes 조회 실패 → 빈 배열
        }

        return { code, noticeMeta, attributeMeta };
      };

      for (let i = 0; i < uniqueCodes.length; i += CONCURRENT) {
        const chunk = uniqueCodes.slice(i, i + CONCURRENT);
        const results = await Promise.allSettled(chunk.map(fetchCategoryMeta));

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { code, noticeMeta: nm, attributeMeta: am } = result.value;
            categoryMeta[code] = { noticeMeta: nm, attributeMeta: am };
          }
        }

        // 청크 간 레이트 리밋
        if (i + CONCURRENT < uniqueCodes.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
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
