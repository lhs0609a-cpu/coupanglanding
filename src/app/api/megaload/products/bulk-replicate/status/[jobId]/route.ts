/**
 * 복제 잡 진행률 조회
 *
 * GET /api/megaload/products/bulk-replicate/status/[jobId]
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { jobId } = await params;
    const serviceClient = await createServiceClient();

    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const { data: job } = await serviceClient
      .from('sh_replication_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('megaload_user_id', shUserId)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: '잡을 찾을 수 없습니다.' }, { status: 404 });
    }

    const j = job as Record<string, unknown>;
    const productIds = Array.isArray(j.product_ids) ? (j.product_ids as string[]) : [];
    return NextResponse.json({
      jobId: j.id,
      status: j.status,
      total: j.total,
      processed: j.processed,
      succeeded: j.succeeded,
      failed: j.failed,
      skipped: j.skipped,
      targetChannels: j.target_channels,
      productCount: productIds.length,
      marginSettings: j.margin_settings,
      errorLog: j.error_log,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '잡 상태 조회 실패' },
      { status: 500 }
    );
  }
}
