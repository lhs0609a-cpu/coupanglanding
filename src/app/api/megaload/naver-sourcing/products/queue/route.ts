import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * 상세 추출 요청 큐.
 *
 * ★ 왜 큐인가: 셀러가 고른 상품에 상세가 없을 때, 셀러 PC 가 직접 네이버를 열게 하면 셀러마다
 *   로그인·캡차·429 를 겪는다(관리자 PC 에서 하루 종일 겪은 그것이다). 요청만 남기고 실제
 *   추출은 관리자 도우미가 대신한다 — 네이버를 두드리는 IP 는 계속 하나뿐이다.
 *
 * POST : 셀러가 고른 상품 중 상세 없는 것을 requested 로 올린다(쿠키 인증, 로그인한 누구나).
 * GET  : 관리자 도우미가 다음에 뽑을 것을 가져간다(Bearer 인증, 관리자만).
 */

/** 도우미가 한 번에 가져갈 작업 수 — 너무 많이 쥐면 앱이 꺼졌을 때 그만큼 멈춘 채로 남는다. */
const CLAIM_LIMIT = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: { ids?: string[] } = {};
  try { body = await request.json(); } catch { /* 아래에서 걸린다 */ }
  const ids = (body.ids ?? []).filter((s) => typeof s === 'string' && s).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: '선택된 상품이 없습니다.' }, { status: 400 });

  const service = await createServiceClient();
  const { data: mu } = await service
    .from('megaload_users').select('id').eq('profile_id', user.id).maybeSingle();

  // 이미 done 인 건 건드리지 않는다 — 요청이 확보된 상세를 되돌리면 안 된다.
  const { data: targets } = await service
    .from('sh_naver_sourcing_products')
    .select('id, detail_status, detail_request_count')
    .in('id', ids)
    .in('detail_status', ['none', 'failed']);

  const rows = targets ?? [];
  if (!rows.length) return NextResponse.json({ ok: true, requested: 0 });

  // 여러 셀러가 같은 상품을 원하면 그게 곧 우선순위다 — 요청 수를 센다.
  const now = new Date().toISOString();
  for (const r of rows) {
    await service.from('sh_naver_sourcing_products').update({
      detail_status: 'requested',
      detail_requested_at: now,
      detail_requested_by: mu?.id ?? null,
      detail_request_count: (r.detail_request_count ?? 0) + 1,
    }).eq('id', r.id);
  }

  return NextResponse.json({ ok: true, requested: rows.length });
}

/**
 * GET — 관리자 도우미가 다음 작업을 가져간다.
 * 가져가는 즉시 running 으로 바꿔 다른 실행이 같은 걸 또 뽑지 않게 한다.
 */
export async function GET(request: NextRequest) {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return NextResponse.json({ error: 'missing access token' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 500 });

  const userClient = createSbClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) return NextResponse.json({ error: 'invalid or expired session' }, { status: 401 });

  const service = await createServiceClient();
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '관리자만 가져갈 수 있습니다.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(CLAIM_LIMIT, Math.max(1, Number(searchParams.get('limit') || '3')));
  // 미수집분까지 채울지 — 셀러 요청이 없을 때 놀지 않게 하는 옵션(기본은 요청만).
  const includeIdle = searchParams.get('idle') === '1';

  // ★ running 이 오래 묶여 있으면 도우미가 중간에 꺼진 것이다 — 30분 지나면 다시 집는다.
  const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await service.from('sh_naver_sourcing_products')
    .update({ detail_status: 'requested' })
    .eq('detail_status', 'running')
    .lt('detail_at', stale);

  const statuses = includeIdle ? ['requested', 'none'] : ['requested'];
  const { data: rows, error } = await service
    .from('sh_naver_sourcing_products')
    .select('id, product_no, url, title')
    .in('detail_status', statuses)
    .order('detail_request_count', { ascending: false })
    .order('detail_requested_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const jobs = rows ?? [];
  if (jobs.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_status: 'running', detail_at: new Date().toISOString() })
      .in('id', jobs.map((j) => j.id));
  }

  return NextResponse.json({ jobs });
}
