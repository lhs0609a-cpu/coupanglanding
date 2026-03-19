import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channel, credentials } = await request.json();

  // Get megaload user
  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  // Upsert credentials
  const { error } = await supabase
    .from('channel_credentials')
    .upsert(
      {
        megaload_user_id: shUser.id,
        channel,
        credentials,
        is_connected: true,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'megaload_user_id,channel' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  const { data: credentials } = await supabase
    .from('channel_credentials')
    .select('channel, is_connected, last_verified_at, expires_at')
    .eq('megaload_user_id', shUser.id);

  return NextResponse.json({ credentials: credentials || [] });
}
