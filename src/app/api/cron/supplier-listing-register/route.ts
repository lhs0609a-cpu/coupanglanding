/** 리스팅 등록 실행 크론 — registering 리스팅을 셀러 쿠팡에 등록. */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runRegistrationBatch } from '@/lib/megaload/supplier/register-runner';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sc = await createServiceClient();
  const result = await runRegistrationBatch({ sc }, 10);
  return NextResponse.json({ success: true, ...result });
}
