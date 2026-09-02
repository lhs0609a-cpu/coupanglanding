import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isDetailExtractable } from '@/lib/megaload/naver-store-type';

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
 * GET  : 도우미가 다음에 뽑을 것을 가져간다(Bearer 인증).
 *         · 관리자  — 큐 전체. 지금까지와 같다(미수집분 미리채움 idle=1 도 관리자만).
 *         · 셀러    — **자기가 요청한 것만.** 자기 IP·자기 로그인으로 자기 것을 뽑는다.
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
    .select('id, url, detail_status, detail_request_count')
    .in('id', ids)
    .in('detail_status', ['none', 'failed']);

  // ★ 상세를 못 뽑는 주소는 큐에 넣지 않는다(실측 2026-08-20).
  //   넣으면 도우미가 재시도 6회 × 캡차 대기까지 매달렸다가 실패하고, 30분 뒤 stale 복구가
  //   되살려 **같은 실패를 무한 반복**한다. 큐 한 자리를 영영 잡아먹는 셈이다.
  //   대신 failed 로 확정해 큐에서 빼고, 화면은 카드에 '상세 미지원'을 띄운다.
  const all = targets ?? [];
  const rows = all.filter((r) => isDetailExtractable(r.url));
  const blockedRows = all.filter((r) => !isDetailExtractable(r.url));
  if (blockedRows.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_status: 'failed', detail_at: new Date().toISOString() })
      .in('id', blockedRows.map((r) => r.id));
  }
  if (!rows.length) {
    return NextResponse.json({ ok: true, requested: 0, blocked: blockedRows.length });
  }

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

  return NextResponse.json({ ok: true, requested: rows.length, blocked: blockedRows.length });
}

/**
 * GET — 도우미가 다음 작업을 가져간다.
 * 가져가는 즉시 running 으로 바꿔 다른 실행이 같은 걸 또 뽑지 않게 한다.
 *
 * ── 왜 셀러에게도 열었나 (2026-09-02) ──────────────────────────────────────
 * 원래는 관리자 도우미 한 대만 뽑았다. "셀러 PC 가 직접 네이버를 열면 셀러마다 로그인·캡차를
 * 겪는다"는 이유였고, 그 판단 자체는 지금도 옳다. 그런데 대가가 컸다 — **그 한 대가 멈추면
 * 셀러 전원이 멈춘다.** 실측 2026-09-02: 관리자 도우미가 네이버에 로그인돼 있지 않아
 * 요청이 쌓인 채 8분 대기 후 만료 → 셀러는 10개를 골라도 매번 5개만 받았다. 처리량도
 * 그 한 대의 분당 12건이 전부였다.
 *
 * 그래서 **막지 않되, 강요하지도 않는다**:
 *   · 셀러 도우미는 네이버에 로그인돼 있을 때만 큐를 돈다(도우미 쪽 게이트). 로그인이 없으면
 *     예전 그대로 — 관리자 큐를 기다린다. 셀러에게 네이버 계정을 요구하지 않는다.
 *   · 셀러는 **자기가 요청한 것만** 가져간다. 남의 요청을 남의 IP 로 대신 뽑을 이유가 없고,
 *     그렇게 두면 한 사람의 IP 가 전체 트래픽을 뒤집어쓴다.
 *   · 미수집분 미리채움(idle=1)은 계속 관리자만 — 아무도 원하지 않는 상품까지 뽑는 일은
 *     한 곳에서만 판단한다(v0.5.4 에서 끈 그 동작이다).
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
  const isAdmin = profile?.role === 'admin';

  // 셀러는 **자기 요청분**만 집는다 → 자기 megaload_user_id 가 필요하다.
  //   계정이 아직 없으면(신규) 가져갈 것도 없다 — 빈 손으로 돌려보낸다(에러가 아니다).
  let myUserId: string | null = null;
  if (!isAdmin) {
    const { data: me } = await service
      .from('megaload_users').select('id').eq('profile_id', user.id).maybeSingle();
    myUserId = (me as { id?: string } | null)?.id ?? null;
    if (!myUserId) return NextResponse.json({ jobs: [] });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(CLAIM_LIMIT, Math.max(1, Number(searchParams.get('limit') || '3')));
  // 미수집분까지 채울지 — 아무도 원하지 않는 상품까지 뽑는 판단이라 **관리자만** 할 수 있다.
  const includeIdle = isAdmin && searchParams.get('idle') === '1';

  // ★ running 이 오래 묶여 있으면 도우미가 중간에 꺼진 것이다 — 30분 지나면 다시 집는다.
  const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await service.from('sh_naver_sourcing_products')
    .update({ detail_status: 'requested' })
    .eq('detail_status', 'running')
    .lt('detail_at', stale);

  const statuses = includeIdle ? ['requested', 'none'] : ['requested'];
  let q = service
    .from('sh_naver_sourcing_products')
    .select('id, product_no, url, title')
    .in('detail_status', statuses);
  // 셀러: 내가 요청한 것만. (같은 상품을 여러 명이 요청하면 detail_requested_by 는 마지막
  //   요청자다 — 그때는 그 사람의 도우미가 집고, 나머지는 결과를 같이 받는다. 상품은 공용이다.)
  if (!isAdmin) q = q.eq('detail_requested_by', myUserId);
  const { data: rows, error } = await q
    // 못 뽑는 주소가 앞자리를 차지하지 않게 넉넉히 뽑아서 거른다(아래에서 limit 까지만 넘긴다).
    .order('detail_request_count', { ascending: false })
    .order('detail_requested_at', { ascending: true, nullsFirst: false })
    .limit(limit * 4);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 옛 요청 중에도 마켓·윈도가 섞여 있다 — 도우미에게 넘기지 말고 여기서 failed 로 끝낸다.
  const candidates = rows ?? [];
  const dead = candidates.filter((r) => !isDetailExtractable(r.url));
  if (dead.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_status: 'failed', detail_at: new Date().toISOString() })
      .in('id', dead.map((r) => r.id));
  }
  const jobs = candidates.filter((r) => isDetailExtractable(r.url)).slice(0, limit);
  if (jobs.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_status: 'running', detail_at: new Date().toISOString() })
      .in('id', jobs.map((j) => j.id));
  }

  return NextResponse.json({ jobs });
}
