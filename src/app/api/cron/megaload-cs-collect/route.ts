import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { collectInquiriesForUser } from '@/lib/megaload/services/cs-collect';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data: users } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('onboarding_done', true);

  if (!users || users.length === 0) {
    return NextResponse.json({ message: '활성 셀러 없음' });
  }

  let totalCollected = 0;
  let totalErrors = 0;

  for (const user of users) {
    const shUserId = (user as Record<string, unknown>).id as string;
    try {
      const r = await collectInquiriesForUser(supabase, shUserId);
      totalCollected += r.collected;
      totalErrors += r.errors;
    } catch {
      totalErrors++;
    }
  }

  return NextResponse.json({
    success: true,
    totalCollected,
    totalErrors,
    usersProcessed: users.length,
  });
}
