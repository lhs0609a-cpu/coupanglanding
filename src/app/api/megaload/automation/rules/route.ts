import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;


export async function GET() {
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

  const { data: rules } = await supabase
    .from('sh_automation_rules')
    .select('*')
    .eq('megaload_user_id', (shUser as Record<string, unknown>).id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ rules: rules || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: shUser } = await supabase
    .from('megaload_users')
    .select('id, plan')
    .eq('profile_id', user.id)
    .single();

  if (!shUser) {
    return NextResponse.json({ error: 'Megaload 계정이 없습니다' }, { status: 404 });
  }

  const shUserData = shUser as Record<string, unknown>;

  // 요금제별 규칙 수 제한 확인
  const { count } = await supabase
    .from('sh_automation_rules')
    .select('id', { count: 'exact', head: true })
    .eq('megaload_user_id', shUserData.id);

  const planLimits: Record<string, number> = { free: 2, standard: 10, professional: Infinity };
  const maxRules = planLimits[shUserData.plan as string] || 2;

  if ((count || 0) >= maxRules) {
    return NextResponse.json({ error: `현재 요금제에서는 최대 ${maxRules}개의 자동화 규칙만 설정할 수 있습니다` }, { status: 403 });
  }

  const body = await request.json();
  const { rule_name, trigger_type, action_type, trigger_config, action_config } = body;

  const { data: rule, error } = await supabase
    .from('sh_automation_rules')
    .insert({
      megaload_user_id: shUserData.id,
      rule_name,
      trigger_type,
      action_type,
      trigger_config: trigger_config || {},
      action_config: action_config || {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rule });
}
