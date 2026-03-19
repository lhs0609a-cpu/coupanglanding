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

// GET: 전체 스크리닝 링크 목록 (결과 JOIN)
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('screening_links')
      .select('*, screening_results(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // screening_results는 1:1이므로 배열→단일 객체로 변환
    const normalized = (data || []).map((link: Record<string, unknown>) => {
      const results = link.screening_results;
      return {
        ...link,
        screening_result: Array.isArray(results) ? results[0] || null : results || null,
        screening_results: undefined,
      };
    });

    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error('admin screening GET error:', error);
    return NextResponse.json({ error: '스크리닝 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새 스크리닝 링크 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireAdmin(supabase);
    if (!user) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { candidate_name, candidate_phone, candidate_memo, expires_days } = body;

    if (!candidate_name) {
      return NextResponse.json({ error: '후보자 이름을 입력해주세요.' }, { status: 400 });
    }

    const days = expires_days || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const token = crypto.randomUUID();

    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from('screening_links')
      .insert({
        token,
        candidate_name,
        candidate_phone: candidate_phone || null,
        candidate_memo: candidate_memo || null,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    await logActivity(serviceClient, {
      adminId: user.id,
      action: 'create_screening',
      targetType: 'screening_link',
      targetId: data.id,
      details: { candidate_name, expires_days: days },
    });

    return NextResponse.json({ data: { ...data, token } });
  } catch (error) {
    console.error('admin screening POST error:', error);
    return NextResponse.json({ error: '스크리닝 링크 생성에 실패했습니다.' }, { status: 500 });
  }
}
