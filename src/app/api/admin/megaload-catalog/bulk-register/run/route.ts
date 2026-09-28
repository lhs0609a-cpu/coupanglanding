import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkEligibility, registerCatalogProductForUser } from '@/lib/megaload/services/catalog-register';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 한 번 호출에 처리할 최대 건수 — Vercel 300초 안에 끝나도록 보수적으로 잡는다. */
const BATCH_SIZE = 20;

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin';
}

interface CampaignRow {
  id: string;
  dry_run: boolean;
  status: string;
  abort_failure_rate: number;
  total_targets: number;
  done_count: number;
  success_count: number;
  failed_count: number;
}

interface TargetRow {
  id: string;
  megaload_user_id: string;
  catalog_product_id: string;
  attempts: number;
  main_image_index: number | null;
}

/**
 * POST /api/admin/megaload-catalog/bulk-register/run
 *
 * 캠페인의 pending 작업을 최대 BATCH_SIZE 건 처리한다.
 * 남은 게 있으면 hasMore: true 를 돌려주므로, 호출 측이 반복 호출하면 된다.
 *
 * 인증: 관리자 세션 또는 CRON_SECRET.
 *
 * 안전장치 — 실패율이 임계치를 넘으면 캠페인을 자동 중단한다.
 *   잘못된 카탈로그/카테고리로 수십 계정에 쓰레기를 뿌리는 사고를 막는다.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const viaCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!viaCron) {
    const supabase = await createClient();
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { campaignId?: string };
  if (!body.campaignId) return NextResponse.json({ error: 'campaignId 가 필요합니다.' }, { status: 400 });

  const serviceClient = await createServiceClient();

  const { data: campRow } = await serviceClient
    .from('catalog_bulk_campaigns')
    .select('*')
    .eq('id', body.campaignId)
    .maybeSingle();
  const campaign = campRow as unknown as CampaignRow | null;
  if (!campaign) return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  if (campaign.status === 'aborted' || campaign.status === 'completed') {
    return NextResponse.json({ error: `이미 ${campaign.status} 상태인 캠페인입니다.`, status: campaign.status }, { status: 409 });
  }

  await serviceClient
    .from('catalog_bulk_campaigns')
    .update({ status: 'running', started_at: campaign.status === 'pending' ? new Date().toISOString() : undefined })
    .eq('id', campaign.id);

  const { data: pendingRows } = await serviceClient
    .from('catalog_bulk_targets')
    .select('id, megaload_user_id, catalog_product_id, attempts, main_image_index')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  const targets = (pendingRows || []) as unknown as TargetRow[];
  if (targets.length === 0) {
    await serviceClient
      .from('catalog_bulk_campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaign.id);
    return NextResponse.json({ done: true, hasMore: false, processed: 0, message: '처리할 작업이 없습니다.' });
  }

  // 자격은 계정당 1회만 조회해 재사용 — 같은 셀러에 여러 상품을 올릴 때 중복 호출 제거.
  const eligibilityCache = new Map<string, Awaited<ReturnType<typeof checkEligibility>>>();

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const samples: { target: string; ok: boolean; note: string }[] = [];

  for (const t of targets) {
    await serviceClient
      .from('catalog_bulk_targets')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: t.attempts + 1 })
      .eq('id', t.id);

    let eligibility = eligibilityCache.get(t.megaload_user_id);
    if (!eligibility) {
      eligibility = await checkEligibility(serviceClient, t.megaload_user_id);
      eligibilityCache.set(t.megaload_user_id, eligibility);
    }

    try {
      const res = await registerCatalogProductForUser(serviceClient, {
        megaloadUserId: t.megaload_user_id,
        catalogProductId: t.catalog_product_id,
        eligibility,
        dryRun: campaign.dry_run,
        mainImageIndex: t.main_image_index ?? undefined,
      });

      if (res.ok) {
        success++;
        await serviceClient
          .from('catalog_bulk_targets')
          .update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
            channel_product_id: res.channelProductId ?? null,
            sh_product_id: res.shProductId ?? null,
            // dryRun 이면 무엇이 달라졌는지 남겨 눈으로 확인할 수 있게 한다.
            error_message: campaign.dry_run && res.preview
              ? `[시뮬레이션] ${res.preview.displayName} / 대표:${res.preview.mainImage} / ${res.preview.storyFirstLine}`
              : null,
          })
          .eq('id', t.id);
        if (samples.length < 5 && res.preview) {
          samples.push({ target: t.id, ok: true, note: `${res.preview.displayName} — 대표:${res.preview.mainImage}` });
        }
      } else if (res.skipped) {
        skipped++;
        await serviceClient
          .from('catalog_bulk_targets')
          .update({ status: 'skipped', skip_reason: res.skipReason ?? null, error_message: res.error?.slice(0, 500) ?? null, completed_at: new Date().toISOString() })
          .eq('id', t.id);
      } else {
        failed++;
        await serviceClient
          .from('catalog_bulk_targets')
          .update({ status: 'failed', error_message: res.error?.slice(0, 1000) ?? null, completed_at: new Date().toISOString() })
          .eq('id', t.id);
        if (samples.length < 5) samples.push({ target: t.id, ok: false, note: res.error?.slice(0, 120) || '알 수 없는 실패' });
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await serviceClient
        .from('catalog_bulk_targets')
        .update({ status: 'failed', error_message: msg.slice(0, 1000), completed_at: new Date().toISOString() })
        .eq('id', t.id);
      if (samples.length < 5) samples.push({ target: t.id, ok: false, note: msg.slice(0, 120) });
    }
  }

  const doneCount = campaign.done_count + targets.length;
  const successCount = campaign.success_count + success;
  const failedCount = campaign.failed_count + failed;

  // 실패율 임계치 — 초과하면 남은 작업을 더 진행하지 않는다.
  const attempted = successCount + failedCount;
  const failureRate = attempted > 0 ? failedCount / attempted : 0;
  const shouldAbort = attempted >= 5 && failureRate > campaign.abort_failure_rate;

  const { count: remaining } = await serviceClient
    .from('catalog_bulk_targets')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending');

  const hasMore = (remaining || 0) > 0 && !shouldAbort;

  await serviceClient
    .from('catalog_bulk_campaigns')
    .update({
      done_count: doneCount,
      success_count: successCount,
      failed_count: failedCount,
      status: shouldAbort ? 'aborted' : hasMore ? 'running' : 'completed',
      abort_reason: shouldAbort
        ? `실패율 ${(failureRate * 100).toFixed(0)}% — 임계치 ${(campaign.abort_failure_rate * 100).toFixed(0)}% 초과로 자동 중단`
        : null,
      completed_at: hasMore ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  return NextResponse.json({
    processed: targets.length,
    success,
    failed,
    skipped,
    remaining: remaining || 0,
    hasMore,
    aborted: shouldAbort,
    dryRun: campaign.dry_run,
    samples,
  });
}
