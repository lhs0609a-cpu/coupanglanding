import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkEligibility } from '@/lib/megaload/services/catalog-register';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 관리자 전용 — 남의 계정에 상품을 올리는 기능이라 예외 없이 admin 만. */
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

interface CreateBody {
  name?: string;
  catalogProductIds?: string[];
  targetFilter?: 'eligible_all' | 'dormant' | 'manual';
  targetUserIds?: string[];
  dryRun?: boolean;
  perUserLimit?: number;
}

/**
 * POST /api/admin/megaload-catalog/bulk-register
 *
 * 일괄 대리 등록 캠페인을 만든다. 실제 등록은 /run 이 처리한다.
 *
 * 대상 선별은 여기서 끝낸다 — 자격 없는 계정은 skipped 로 미리 박아두고
 * 워커는 pending 만 집는다. (워커가 매번 자격을 다시 재는 낭비 제거)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const catalogProductIds = (body.catalogProductIds || []).filter(Boolean);
  if (catalogProductIds.length === 0) {
    return NextResponse.json({ error: '등록할 카탈로그 상품을 1개 이상 선택해야 합니다.' }, { status: 400 });
  }

  const targetFilter = body.targetFilter || 'eligible_all';
  const dryRun = body.dryRun !== false; // 기본값 true — 실수로 바로 쏘지 않게
  const perUserLimit = Math.min(Math.max(body.perUserLimit ?? 10, 1), 200);

  const serviceClient = await createServiceClient();

  // 1) 후보 계정
  const { data: users } = await serviceClient
    .from('megaload_users')
    .select('id, bulk_register_opt_out')
    .limit(500);
  let candidates = ((users || []) as unknown as { id: string; bulk_register_opt_out: boolean | null }[])
    .map((u) => u.id);

  if (targetFilter === 'manual') {
    const picked = new Set(body.targetUserIds || []);
    candidates = candidates.filter((id) => picked.has(id));
    if (candidates.length === 0) {
      return NextResponse.json({ error: '지정한 계정이 없습니다.' }, { status: 400 });
    }
  } else if (targetFilter === 'dormant') {
    // 31일 넘게 업로드가 없는 계정만
    const cutoff = new Date(Date.now() - 31 * 86400000).toISOString();
    const dormant: string[] = [];
    await Promise.all(
      candidates.map(async (id) => {
        const { data } = await serviceClient
          .from('sh_products')
          .select('created_at')
          .eq('megaload_user_id', id)
          .gte('created_at', cutoff)
          .limit(1);
        if (!data || data.length === 0) dormant.push(id);
      }),
    );
    candidates = dormant;
  }

  // 2) 캠페인
  const { data: campRow, error: campErr } = await serviceClient
    .from('catalog_bulk_campaigns')
    .insert({
      created_by: admin.id,
      name: body.name || `대리등록 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      catalog_product_ids: catalogProductIds,
      target_filter: targetFilter,
      target_user_ids: targetFilter === 'manual' ? candidates : [],
      dry_run: dryRun,
      per_user_limit: perUserLimit,
      status: 'pending',
    })
    .select('id')
    .single();
  if (campErr || !campRow) {
    return NextResponse.json({ error: `캠페인 생성 실패: ${campErr?.message}` }, { status: 500 });
  }
  const campaignId = (campRow as { id: string }).id;

  // 3) 자격 심사 후 작업 생성 — 자격 없는 계정은 skipped 로 남겨 이유를 보이게 한다.
  const targets: Record<string, unknown>[] = [];
  let skipped = 0;
  // 상품별로 "몇 번째 셀러인지" 세어 대표이미지를 라운드로빈 배정한다.
  // → 같은 캠페인 안에서 셀러끼리 대표이미지가 겹치지 않는다.
  const seqByProduct = new Map<string, number>();
  const CONCURRENCY = 5;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const chunk = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (userId) => {
        try {
          return { userId, e: await checkEligibility(serviceClient, userId) };
        } catch (err) {
          return {
            userId,
            e: { megaloadUserId: userId, eligible: false, skipReason: 'no_credentials' as const, detail: err instanceof Error ? err.message : String(err) },
          };
        }
      }),
    );
    for (const { userId, e } of results) {
      const products = catalogProductIds.slice(0, perUserLimit);
      for (const pid of products) {
        if (!e.eligible) {
          skipped++;
          targets.push({
            campaign_id: campaignId,
            megaload_user_id: userId,
            catalog_product_id: pid,
            status: 'skipped',
            skip_reason: e.skipReason || 'no_credentials',
            error_message: e.detail?.slice(0, 500) || null,
          });
        } else {
          const seq = seqByProduct.get(pid) ?? 0;
          seqByProduct.set(pid, seq + 1);
          targets.push({
            campaign_id: campaignId,
            megaload_user_id: userId,
            catalog_product_id: pid,
            status: 'pending',
            main_image_index: seq,
          });
        }
      }
    }
  }

  // 넉넉히 쪼개 insert — 한 번에 수천 행을 밀면 타임아웃이 난다.
  for (let i = 0; i < targets.length; i += 500) {
    const { error } = await serviceClient.from('catalog_bulk_targets').insert(targets.slice(i, i + 500));
    if (error) {
      await serviceClient
        .from('catalog_bulk_campaigns')
        .update({ status: 'aborted', abort_reason: `작업 생성 실패: ${error.message}` })
        .eq('id', campaignId);
      return NextResponse.json({ error: `작업 생성 실패: ${error.message}` }, { status: 500 });
    }
  }

  const pending = targets.length - skipped;
  await serviceClient
    .from('catalog_bulk_campaigns')
    .update({ total_targets: targets.length, skipped_count: skipped })
    .eq('id', campaignId);

  return NextResponse.json({
    campaignId,
    dryRun,
    totalTargets: targets.length,
    pending,
    skipped,
    eligibleAccounts: new Set(targets.filter((t) => t.status === 'pending').map((t) => t.megaload_user_id)).size,
    message: dryRun
      ? '시뮬레이션 캠페인이 만들어졌습니다. /run 으로 실행하면 쿠팡에 올리지 않고 결과만 확인합니다.'
      : '실제 등록 캠페인이 만들어졌습니다. /run 으로 실행됩니다.',
  });
}

/** GET — 캠페인 목록 + 진행률 */
export async function GET() {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const serviceClient = await createServiceClient();
  const { data } = await serviceClient
    .from('catalog_bulk_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  return NextResponse.json({ campaigns: data || [] });
}
