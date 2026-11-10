import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { UUID } from '@/lib/training';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = await createServiceClient();
    const { data, error } = await db.from('pt_training_sessions')
      .select('id,title,starts_at,ends_at,capacity,instructions,is_open,pt_training_bookings(count)')
      .eq('is_open', true).gt('starts_at', new Date().toISOString()).order('starts_at');
    if (error) throw error;
    return NextResponse.json({ data: data.map(({ pt_training_bookings, ...s }) => ({ ...s, booked: pt_training_bookings[0]?.count || 0 })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: '교육 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
    if (!UUID.test(body.session_id || '') || name.length < 2 || name.length > 40 || !/^01[016789]\d{7,8}$/.test(phone) || body.ready !== true || body.consent !== true || body.website) {
      return NextResponse.json({ error: '이름·휴대폰 번호와 준비 완료·개인정보 동의를 확인해 주세요.' }, { status: 400 });
    }
    const db = await createServiceClient();
    const { error } = await db.rpc('pt_training_book', { p_session: body.session_id, p_name: name, p_phone: phone });
    if (error) {
      const messages: Record<string, string> = { SESSION_CLOSED: '신청이 마감된 교육입니다. 다른 회차를 선택해 주세요.', SESSION_FULL: '정원이 마감되었습니다. 다른 회차를 선택해 주세요.', ALREADY_BOOKED: '이 번호로 이미 신청한 회차입니다. 변경은 카톡으로 문의해 주세요.', TOO_MANY_BOOKINGS: '신청 횟수를 초과했습니다. 카톡으로 문의해 주세요.' };
      const code = Object.keys(messages).find(key => error.message.includes(key));
      if (code) return NextResponse.json({ error: messages[code] }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ success: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: '신청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 }); }
}
