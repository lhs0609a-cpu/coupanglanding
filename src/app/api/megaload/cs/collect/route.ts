import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { collectInquiriesForUser } from '@/lib/megaload/services/cs-collect';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 120;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const result = await collectInquiriesForUser(
      supabase,
      (shUser as Record<string, unknown>).id as string,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[cs/collect] error:', err);
    void logSystemError({ source: 'megaload/cs/collect', error: err }).catch(() => {});
    return NextResponse.json({ error: '문의 수집 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
