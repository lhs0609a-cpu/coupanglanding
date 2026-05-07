import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;


/**
 * POST — 배치 등록 잡 완료 처리
 * body: { jobId: string; successCount: number; errorCount: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      jobId: string;
      successCount: number;
      errorCount: number;
    };

    if (!body.jobId) {
      return NextResponse.json({ error: 'jobId가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const totalCount = body.successCount + body.errorCount;

    await serviceClient
      .from('sh_sync_jobs')
      .update({
        status: body.errorCount === totalCount ? 'failed' : 'completed',
        processed_count: totalCount,
        error_count: body.errorCount,
        result: {
          successCount: body.successCount,
          errorCount: body.errorCount,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.jobId);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job 완료 처리 실패' },
      { status: 500 },
    );
  }
}
