import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

function extractYoutubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>, youtube.com/shorts/<id>
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('training_videos')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('admin training-videos GET error:', error);
    void logSystemError({ source: 'admin/training-videos', error: error }).catch(() => {});
    return NextResponse.json({ error: '영상 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, youtube_input, category, sort_order, is_published } = body;

    if (!title) {
      return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
    }
    const youtubeId = extractYoutubeId(youtube_input || '');
    if (!youtubeId) {
      return NextResponse.json({ error: '올바른 YouTube URL 또는 ID가 아닙니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('training_videos')
      .insert({
        title,
        description: description || null,
        youtube_id: youtubeId,
        category: category || 'general',
        thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        sort_order: typeof sort_order === 'number' ? sort_order : 0,
        is_published: is_published !== false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_training_video',
      targetType: 'training_video',
      targetId: data.id,
      details: { title, youtube_id: youtubeId },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin training-videos POST error:', error);
    void logSystemError({ source: 'admin/training-videos', error: error }).catch(() => {});
    return NextResponse.json({ error: '영상 등록에 실패했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, youtube_input, ...rest } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
    if (youtube_input !== undefined) {
      const youtubeId = extractYoutubeId(youtube_input);
      if (!youtubeId) {
        return NextResponse.json({ error: '올바른 YouTube URL 또는 ID가 아닙니다.' }, { status: 400 });
      }
      updates.youtube_id = youtubeId;
      updates.thumbnail_url = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('training_videos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'update_training_video',
      targetType: 'training_video',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin training-videos PATCH error:', error);
    void logSystemError({ source: 'admin/training-videos', error: error }).catch(() => {});
    return NextResponse.json({ error: '영상 수정에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { error } = await serviceClient
      .from('training_videos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'delete_training_video',
      targetType: 'training_video',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin training-videos DELETE error:', error);
    void logSystemError({ source: 'admin/training-videos', error: error }).catch(() => {});
    return NextResponse.json({ error: '영상 삭제에 실패했습니다.' }, { status: 500 });
  }
}
