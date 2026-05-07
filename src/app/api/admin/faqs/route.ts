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

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('faqs')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('admin faqs GET error:', error);
    void logSystemError({ source: 'admin/faqs', error: error }).catch(() => {});
    return NextResponse.json({ error: 'FAQ 조회에 실패했습니다.' }, { status: 500 });
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
    const { category, question, answer, sort_order, is_published } = body;

    if (!question || !answer) {
      return NextResponse.json({ error: '질문과 답변을 입력해주세요.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('faqs')
      .insert({
        category: category || 'other',
        question,
        answer,
        sort_order: sort_order || 0,
        is_published: is_published !== false,
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_faq',
      targetType: 'faq',
      targetId: data.id,
      details: { question },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin faqs POST error:', error);
    void logSystemError({ source: 'admin/faqs', error: error }).catch(() => {});
    return NextResponse.json({ error: 'FAQ 등록에 실패했습니다.' }, { status: 500 });
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
      .from('faqs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'update_faq',
      targetType: 'faq',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('admin faqs PATCH error:', error);
    void logSystemError({ source: 'admin/faqs', error: error }).catch(() => {});
    return NextResponse.json({ error: 'FAQ 수정에 실패했습니다.' }, { status: 500 });
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
      .from('faqs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'delete_faq',
      targetType: 'faq',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin faqs DELETE error:', error);
    void logSystemError({ source: 'admin/faqs', error: error }).catch(() => {});
    return NextResponse.json({ error: 'FAQ 삭제에 실패했습니다.' }, { status: 500 });
  }
}
