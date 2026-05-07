import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('notices')
      .select('*')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 읽음 정보 조회
    const { data: reads } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('profile_id', user.id);

    const readNoticeIds = new Set((reads || []).map(r => r.notice_id));

    const notices = (data || []).map(n => ({
      ...n,
      is_read: readNoticeIds.has(n.id),
    }));

    return NextResponse.json({ data: notices });
  } catch (error) {
    console.error('notices GET error:', error);
    void logSystemError({ source: 'notices', error: error }).catch(() => {});
    return NextResponse.json({ error: '공지사항 조회에 실패했습니다.' }, { status: 500 });
  }
}
