import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const categoryId = request.nextUrl.searchParams.get('category_id');

    let query = supabase
      .from('sh_cs_templates')
      .select('*')
      .eq('is_active', true)
      .or(`megaload_user_id.eq.${shUserId},megaload_user_id.eq.00000000-0000-0000-0000-000000000000`)
      .order('sort_order', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ templates: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const body = await request.json();
    const { template_name, category, content, category_id, order_status_condition, variables } = body;

    if (!template_name || !content) {
      return NextResponse.json({ error: '템플릿명과 내용은 필수입니다' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('sh_cs_templates')
      .insert({
        megaload_user_id: shUserId,
        template_name,
        category: category || null,
        content,
        category_id: category_id || null,
        order_status_condition: order_status_condition || null,
        variables: variables || [],
        is_active: true,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const { data, error } = await supabase
      .from('sh_cs_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('megaload_user_id', shUserId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const { error } = await supabase
      .from('sh_cs_templates')
      .delete()
      .eq('id', id)
      .eq('megaload_user_id', shUserId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}
