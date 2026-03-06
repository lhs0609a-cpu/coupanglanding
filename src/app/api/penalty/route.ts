import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const VALID_CATEGORIES = [
  'delivery_delay',
  'cs_nonresponse',
  'return_rate_excess',
  'product_info_mismatch',
  'false_advertising',
] as const;

type PenaltyCategory = (typeof VALID_CATEGORIES)[number];

const DEFAULT_SCORE_IMPACT: Record<PenaltyCategory, number> = {
  delivery_delay: 10,
  cs_nonresponse: 15,
  return_rate_excess: 20,
  product_info_mismatch: 15,
  false_advertising: 25,
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Get pt_user
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // Get penalty records
    const { data: records, error: recordsError } = await supabase
      .from('penalty_records')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .order('created_at', { ascending: false });

    if (recordsError) {
      console.error('penalty_records 조회 오류:', recordsError);
      return NextResponse.json({ error: recordsError.message }, { status: 500 });
    }

    // Get penalty summary
    const { data: summary } = await supabase
      .from('penalty_summary')
      .select('*')
      .eq('pt_user_id', ptUser.id)
      .maybeSingle();

    return NextResponse.json({ records, summary: summary || null });
  } catch (err) {
    console.error('페널티 조회 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // Get pt_user
    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser) {
      return NextResponse.json({ error: 'PT 사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json();
    const { penalty_category, title, description, occurred_at, evidence_url } = body;

    // Validate required fields
    if (!penalty_category || !title) {
      return NextResponse.json({ error: '페널티 유형과 제목은 필수입니다.' }, { status: 400 });
    }

    // Validate penalty_category
    if (!VALID_CATEGORIES.includes(penalty_category)) {
      return NextResponse.json(
        { error: `유효하지 않은 페널티 유형입니다. 허용 값: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      );
    }

    const score_impact = DEFAULT_SCORE_IMPACT[penalty_category as PenaltyCategory];

    const serviceClient = await createServiceClient();

    // Insert penalty record
    const { data: record, error: insertError } = await serviceClient
      .from('penalty_records')
      .insert({
        pt_user_id: ptUser.id,
        penalty_category,
        title,
        description: description || null,
        occurred_at: occurred_at || new Date().toISOString(),
        score_impact,
        evidence_url: evidence_url || null,
        reported_by: 'self',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('페널티 등록 오류:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Recalculate penalty summary
    const { error: rpcError } = await serviceClient
      .rpc('recalculate_penalty_summary', { target_pt_user_id: ptUser.id });

    if (rpcError) {
      console.error('페널티 요약 재계산 오류:', rpcError);
    }

    return NextResponse.json({ data: record });
  } catch (err) {
    console.error('페널티 자가보고 서버 오류:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
