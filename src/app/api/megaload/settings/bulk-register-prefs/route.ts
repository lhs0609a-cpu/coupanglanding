import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const { data } = await serviceClient
      .from('megaload_users')
      .select('bulk_register_prefs')
      .eq('id', shUserId)
      .single();

    const prefs = (data as { bulk_register_prefs?: Record<string, unknown> } | null)?.bulk_register_prefs ?? null;
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const body = await req.json();
    const prefs = body?.prefs;
    if (!prefs || typeof prefs !== 'object') {
      return NextResponse.json({ error: 'prefs 객체가 필요합니다.' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('megaload_users')
      .update({ bulk_register_prefs: prefs, updated_at: new Date().toISOString() })
      .eq('id', shUserId);

    if (error) {
      return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '저장 실패' },
      { status: 500 },
    );
  }
}
