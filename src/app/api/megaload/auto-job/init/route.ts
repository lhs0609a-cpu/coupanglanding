import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { createAutoJob, type AutoJobPreAnalysis, type AutoJobThresholds } from '@/lib/megaload/services/auto-register-job';

export const maxDuration = 15;

interface InitBody {
  rootFolderName: string;
  dryRun?: boolean;
  preAnalysis: AutoJobPreAnalysis;
  thresholds?: AutoJobThresholds;
}

/**
 * POST /api/megaload/auto-job/init
 * Gate 1 사전분석 결과를 받아 새 자동 등록 잡 생성.
 * 잡은 'pending' 상태로 시작 — 사용자 확인 시 confirm-gate1 로 'scanning' 전환.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const body = (await req.json()) as InitBody;
    if (!body.rootFolderName || !body.preAnalysis) {
      return NextResponse.json({ error: 'rootFolderName + preAnalysis 필요' }, { status: 400 });
    }
    if (!Number.isInteger(body.preAnalysis.productCount) || body.preAnalysis.productCount <= 0) {
      return NextResponse.json({ error: 'preAnalysis.productCount 잘못됨' }, { status: 400 });
    }

    const job = await createAutoJob(serviceClient, shUserId, {
      rootFolderName: body.rootFolderName,
      dryRun: body.dryRun ?? false,
      preAnalysis: body.preAnalysis,
      thresholds: body.thresholds,
    });

    return NextResponse.json({ jobId: job.id, job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '잡 생성 실패' },
      { status: 500 },
    );
  }
}
