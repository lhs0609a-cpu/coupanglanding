import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { UUID } from '@/lib/training';

async function admin() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const { data } = await auth.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'admin' ? user : null;
}
const denied = () => NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
export async function GET() {
  if (!await admin()) return denied();
  const db = await createServiceClient();
  const { data, error } = await db.from('pt_training_sessions').select('*,pt_training_bookings(id,name,phone,created_at)').order('starts_at', { ascending: false });
  if (error) return NextResponse.json({ error: '교육 일정 조회 실패' }, { status: 500 });
  return NextResponse.json({ data: data.map(({ pt_training_bookings, ...s }) => ({ ...s, bookings: pt_training_bookings, booked: pt_training_bookings.length })) }, { headers: { 'Cache-Control': 'no-store' } });
}
async function save(req: NextRequest, update: boolean) {
  const user = await admin();
  if (!user) return denied();
  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    const start = Date.parse(body.starts_at), end = Date.parse(body.ends_at);
    const capacity = body.capacity === null || body.capacity === '' ? null : Number(body.capacity);
    if (!title || title.length > 100 || instructions.length > 2000 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) || (update && !UUID.test(body.id || '')) || typeof body.is_open !== 'boolean') {
      return NextResponse.json({ error: '제목·교육 시간·정원을 확인해 주세요.' }, { status: 400 });
    }
    if (!update && start <= Date.now()) return NextResponse.json({ error: '지난 일정은 등록할 수 없습니다.' }, { status: 400 });
    const db = await createServiceClient();
    const row = { title, instructions, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), capacity, is_open: body.is_open && start > Date.now() };
    const result = update ? await db.from('pt_training_sessions').update(row).eq('id', body.id).select('id').single() : await db.from('pt_training_sessions').insert({ ...row, created_by: user.id }).select('id').single();
    if (result.error) {
      const msg = result.error.message;
      if (msg.includes('BOOKED_TIME_LOCKED')) return NextResponse.json({ error: '신청자가 있는 회차는 시간을 변경할 수 없습니다. 신청자에게 연락한 후 새 회차로 안내해 주세요.' }, { status: 409 });
      if (msg.includes('CAPACITY_TOO_SMALL')) return NextResponse.json({ error: '현재 신청 인원보다 정원을 줄일 수 없습니다.' }, { status: 409 });
      throw result.error;
    }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: '일정 저장에 실패했습니다.' }, { status: 500 }); }
}
export const POST = (req: NextRequest) => save(req, false);
export const PATCH = (req: NextRequest) => save(req, true);
export async function DELETE(req: NextRequest) {
  if (!await admin()) return denied();
  const body = await req.json();
  if (!UUID.test(body.booking_id || '')) return NextResponse.json({ error: '신청을 선택해 주세요.' }, { status: 400 });
  const db = await createServiceClient();
  const { error } = await db.from('pt_training_bookings').delete().eq('id', body.booking_id);
  return error ? NextResponse.json({ error: '취소에 실패했습니다.' }, { status: 500 }) : NextResponse.json({ success: true });
}
