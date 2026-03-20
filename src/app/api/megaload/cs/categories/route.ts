import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 카테고리 + 키워드 규칙 로드
    const { data: categories, error: catErr } = await supabase
      .from('sh_cs_categories')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (catErr) throw catErr;

    const { data: rules, error: ruleErr } = await supabase
      .from('sh_cs_keyword_rules')
      .select('*')
      .eq('is_active', true);

    if (ruleErr) throw ruleErr;

    return NextResponse.json({ categories: categories || [], rules: rules || [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { type } = body; // 'category' or 'rule'

    if (type === 'category') {
      const { name, icon, color, priority } = body;
      if (!name) return NextResponse.json({ error: '카테고리명 필수' }, { status: 400 });

      const { data, error } = await supabase
        .from('sh_cs_categories')
        .insert({ name, icon: icon || null, color: color || null, priority: priority || 0 })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ category: data });
    }

    if (type === 'rule') {
      const { category_id, keywords, match_mode } = body;
      if (!category_id || !keywords?.length) {
        return NextResponse.json({ error: 'category_id와 keywords 필수' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('sh_cs_keyword_rules')
        .insert({ category_id, keywords, match_mode: match_mode || 'any' })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ rule: data });
    }

    return NextResponse.json({ error: 'type은 category 또는 rule이어야 합니다' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { type, id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const table = type === 'category' ? 'sh_cs_categories' : 'sh_cs_keyword_rules';
    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    const type = request.nextUrl.searchParams.get('type');
    if (!id || !type) return NextResponse.json({ error: 'id와 type 필수' }, { status: 400 });

    const table = type === 'category' ? 'sh_cs_categories' : 'sh_cs_keyword_rules';
    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 });
  }
}
