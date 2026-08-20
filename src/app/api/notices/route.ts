import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;

/**
 * GET /api/notices
 * 로그인한 사용자가 보는 공지사항. PT 사용자(/my/notices)와 셀러(/megaload/notices)가 함께 쓴다.
 *
 * ⚠️ 이게 없어서 **관리자가 쓴 공지를 아무도 못 봤다**(실측 2026-08-21):
 *    /admin/notices 는 DB(notices)에 저장하는데, 사용자 화면은 파일에 박아 둔 예시 배열을
 *    그리고 있었다(fetch 0회). 쓰는 곳과 보는 곳이 이어져 있지 않았다.
 *
 * 읽기는 service-role 로 한다 — notices 의 RLS 설정에 기대지 않고 "발행된 것만" 서버가 고른다.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const service = await createServiceClient();
    const { data, error } = await service
      .from('notices')
      .select('id, title, content, category, is_pinned, created_at, updated_at')
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({ notices: data || [] });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
