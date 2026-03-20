import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await createClient();
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

// GET: 관리자용 설정 전체 조회
export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .order('key');

  if (error) {
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// PUT: 관리자 설정 수정 (upsert)
export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = await request.json();
  const { key, value } = body as { key: string; value: string };

  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key와 value가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: '설정 수정 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
