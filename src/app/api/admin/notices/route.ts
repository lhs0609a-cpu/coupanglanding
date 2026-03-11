import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

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

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('notices')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('admin notices GET error:', error);
    return NextResponse.json({ error: '공지사항 조회에 실패했습니다.' }, { status: 500 });
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
    const { title, content, category, is_pinned, is_published } = body;

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('notices')
      .insert({
        title,
        content,
        category: category || 'system',
        is_pinned: is_pinned || false,
        is_published: is_published !== false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_notice',
      targetType: 'notice',
      targetId: data.id,
      details: { title },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin notices POST error:', error);
    return NextResponse.json({ error: '공지사항 등록에 실패했습니다.' }, { status: 500 });
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('notices')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'update_notice',
      targetType: 'notice',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin notices PATCH error:', error);
    return NextResponse.json({ error: '공지사항 수정에 실패했습니다.' }, { status: 500 });
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
      .from('notices')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'delete_notice',
      targetType: 'notice',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin notices DELETE error:', error);
    return NextResponse.json({ error: '공지사항 삭제에 실패했습니다.' }, { status: 500 });
  }
}
