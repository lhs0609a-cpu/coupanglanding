import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length < 12) return '****';
  return `${key.slice(0, 6)}••••••${key.slice(-4)}`;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const { data } = await serviceClient
      .from('megaload_users')
      .select('gemini_api_key')
      .eq('id', shUserId)
      .single();

    const key = (data as { gemini_api_key?: string } | null)?.gemini_api_key ?? null;
    return NextResponse.json({
      hasKey: !!key,
      maskedKey: maskKey(key),
    });
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
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) return NextResponse.json({ error: 'API 키가 비어있습니다.' }, { status: 400 });
    if (!apiKey.startsWith('AIza')) {
      return NextResponse.json(
        { error: 'Gemini API 키 형식이 올바르지 않습니다. (AIza로 시작해야 합니다)' },
        { status: 400 },
      );
    }

    const { error } = await serviceClient
      .from('megaload_users')
      .update({ gemini_api_key: apiKey, updated_at: new Date().toISOString() })
      .eq('id', shUserId);

    if (error) {
      return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, maskedKey: maskKey(apiKey) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '저장 실패' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const { error } = await serviceClient
      .from('megaload_users')
      .update({ gemini_api_key: null, updated_at: new Date().toISOString() })
      .eq('id', shUserId);

    if (error) {
      return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '삭제 실패' },
      { status: 500 },
    );
  }
}
