import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET: 공개 읽기 — 유저 설정 페이지에서 IP/URL 표시용
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  const supabase = createServiceClient();

  if (key) {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .eq('key', key)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '설정을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value');

  if (error) {
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
