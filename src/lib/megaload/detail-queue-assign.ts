/**
 * 상세 수집 대기분을 어느 도우미가 처리할지 배정한다.
 *
 * 왜 배정이 필요한가: 큐 라우트는 셀러에게 `detail_requested_by = 자기 id` 인 행만 내준다.
 * 비워 두면 그 행은 **관리자 PC 한 대 몫**이 되는데, 네이버 419 차단은 IP당 한도라
 * 한 대로는 시간당 30건이 한계다(실측 2026-09-30: 9,405건이 관리자 전용으로 묶여
 * 3일간 진행 0건). IP 가 늘면 그만큼 배수로 빨라진다.
 *
 * ⚠️ 관리자는 배정과 무관하게 모든 requested 를 집는다(큐 라우트가 admin 에는 필터를
 *    걸지 않는다). 그래서 배정된 행이 셀러 PC 에 묶여 방치될 위험은 없다 —
 *    배정은 순수하게 "일꾼 추가"다.
 * ⚠️ 셀러 도우미는 네이버 로그인이 있을 때만 큐를 돈다(캡차를 자초하지 않으려는 설계).
 *    로그인 없는 셀러에 배정해도 손해는 없고, 나중에 로그인하면 즉시 합류한다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isDetailExtractable } from '@/lib/megaload/naver-store-type';

/** 이 기간 안에 하트비트를 보낸 도우미만 배정 대상으로 본다. */
const ASSIGN_WINDOW_DAYS = 7;

/** 한 번의 UPDATE 로 묶을 행 수 — 수천 건을 한 번에 밀면 타임아웃이 난다. */
export const ASSIGN_CHUNK = 500;

/**
 * 최근 접속한 **셀러** 도우미의 megaload_user_id 목록.
 * 관리자는 제외한다 — 배정 없이도 전량을 처리하므로 몫을 주면 셀러 몫만 줄어든다.
 */
export async function activeSellerHelpers(service: SupabaseClient): Promise<string[]> {
  const since = new Date(Date.now() - ASSIGN_WINDOW_DAYS * 86400000).toISOString();
  const { data: hb } = await service
    .from('megaload_worker_heartbeats')
    .select('megaload_user_id, last_seen')
    .gte('last_seen', since)
    .order('last_seen', { ascending: false })
    .limit(300);

  const ids = [...new Set(((hb || []) as { megaload_user_id: string }[]).map((h) => h.megaload_user_id))];
  if (ids.length === 0) return [];

  const { data: us } = await service.from('megaload_users').select('id, profile_id').in('id', ids);
  const users = (us || []) as { id: string; profile_id: string | null }[];
  const profileIds = [...new Set(users.map((u) => u.profile_id).filter(Boolean))] as string[];
  if (profileIds.length === 0) return ids;

  const { data: profs } = await service.from('profiles').select('id, role').in('id', profileIds);
  const roleOf = new Map(((profs || []) as { id: string; role: string }[]).map((p) => [p.id, p.role]));
  const adminIds = new Set(users.filter((u) => u.profile_id && roleOf.get(u.profile_id) === 'admin').map((u) => u.id));
  return ids.filter((id) => !adminIds.has(id));
}

/**
 * 주어진 행들을 `requested` 로 올리면서 셀러 도우미들에게 라운드로빈 배정한다.
 *
 * `detail_status='none'` 인 행만 건드린다 — 이미 수집됐거나(done) 처리 중인(running)
 * 행을 되돌리면 멀쩡한 상세를 다시 뽑게 된다.
 *
 * @returns 실제로 큐에 올라간 건수
 */
export async function assignToQueue(
  service: SupabaseClient,
  ids: string[],
  opts: { sellers?: string[]; onlyStatus?: string[] } = {},
): Promise<number> {
  if (ids.length === 0) return 0;
  const sellers = opts.sellers ?? (await activeSellerHelpers(service));
  const onlyStatus = opts.onlyStatus ?? ['none'];
  const now = new Date().toISOString();

  let queued = 0;
  for (let i = 0; i < ids.length; i += ASSIGN_CHUNK) {
    const chunk = ids.slice(i, i + ASSIGN_CHUNK);
    // 청크 단위로 담당자를 돌린다 — 500건씩 한 셀러에게 가므로 전체적으로는 고르게 나뉜다.
    const owner = sellers.length ? sellers[(i / ASSIGN_CHUNK) % sellers.length] : null;
    const { data: updated } = await service
      .from('sh_naver_sourcing_products')
      .update({ detail_status: 'requested', detail_requested_at: now, detail_requested_by: owner })
      .in('id', chunk)
      .in('detail_status', onlyStatus)
      .select('id');
    queued += (updated || []).length;
  }
  return queued;
}

/** 담당자가 이 기간 동안 안 보이면 그 몫은 놀고 있는 것으로 본다. */
const ABANDON_DAYS = 3;

/**
 * 폴링한 셀러 도우미가 **스스로 일감을 가져간다**.
 *
 * 왜 필요한가: 배정(assignToQueue)은 목록을 새로 수집하는 순간에만 일어난다. 그래서
 *   나중에 네이버에 로그인한 셀러는 받을 몫이 없어 큐를 돌아도 빈 손으로 돌아온다
 *   (실측 2026-10-13: 도우미 11대가 하트비트를 보내는데 9/30 이후 수집 0건,
 *    6,032건은 16명에게 배정된 채 방치 — 로그인된 도우미가 1대뿐이었다).
 *   미리 나눠 주는 방식은 "지금 켜져 있는 사람"을 알 수 없어 반드시 이 구멍이 생긴다.
 *
 * 그래서 선배정이 아니라 **가져가기**로 뒤집는다. 도우미는 네이버 로그인이 있을 때만
 * 큐를 돌므로, 폴링한다는 것 자체가 "지금 일할 수 있다"는 뜻이다. 일은 켜져 있는
 * 도우미에게만 흘러가고, 로그인하면 그 순간 자동으로 합류한다.
 *
 * 가져갈 수 있는 것: ①주인 없는 행 ②주인이 ABANDON_DAYS 동안 안 보인 행.
 * 상세 결과는 공용이므로(상품 테이블 1행) 누가 뽑든 모두가 같이 쓴다.
 *
 * @returns 이 셀러 몫으로 가져온 건수
 */
export async function adoptUnownedWork(
  service: SupabaseClient,
  myUserId: string,
  want: number,
): Promise<number> {
  if (!myUserId || want <= 0) return 0;

  const take = async (apply: (q: ReturnType<SupabaseClient['from']>) => unknown, n: number): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sel: any = service.from('sh_naver_sourcing_products').select('id').eq('detail_status', 'requested');
    sel = apply(sel);
    const { data } = await sel.limit(n);
    const ids = ((data || []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) return 0;
    // WHERE 에 같은 조건을 다시 건다 — 동시에 폴링한 다른 도우미가 이미 가져갔으면 0건이 된다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let upd: any = service.from('sh_naver_sourcing_products')
      .update({ detail_requested_by: myUserId, detail_requested_at: new Date().toISOString() })
      .in('id', ids)
      .eq('detail_status', 'requested');
    upd = apply(upd);
    const { data: got } = await upd.select('id');
    return ((got || []) as { id: string }[]).length;
  };

  // ① 주인 없는 행 먼저
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let n = await take((q: any) => q.is('detail_requested_by', null), want);
  if (n >= want) return n;

  // ② 주인이 오래 안 보인 행
  const active = await activeSellerHelpers(service);
  const { data: allOwners } = await service
    .from('sh_naver_sourcing_products')
    .select('detail_requested_by')
    .eq('detail_status', 'requested')
    .not('detail_requested_by', 'is', null)
    .limit(2000);
  const owners = [...new Set(((allOwners || []) as { detail_requested_by: string }[]).map((r) => r.detail_requested_by))];
  const since = new Date(Date.now() - ABANDON_DAYS * 86400000).toISOString();
  const { data: seen } = await service
    .from('megaload_worker_heartbeats')
    .select('megaload_user_id')
    .in('megaload_user_id', owners.length ? owners : ['-'])
    .gte('last_seen', since);
  const alive = new Set([...active, ...((seen || []) as { megaload_user_id: string }[]).map((s) => s.megaload_user_id), myUserId]);
  const abandoned = owners.filter((o) => !alive.has(o));
  if (abandoned.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    n += await take((q: any) => q.in('detail_requested_by', abandoned), want - n);
  }
  return n;
}

/** 실패한 상세를 다시 집기까지 쉬는 시간 — 차단·캡차는 시간이 지나면 풀린다. */
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** 이만큼 실패하면 그 상품은 포기한다(사람이 고르면 POST 로 다시 요청할 수는 있다). */
export const MAX_DETAIL_ATTEMPTS = 5;
/** 한 번에 되살릴 수 — 폴링마다 불리므로 가볍게 둔다. 수천 건도 몇 시간이면 다 돈다. */
const REVIVE_BATCH = 100;

/**
 * 상품 탓이 아닌 실패를 큐로 되돌린다.
 *
 * 왜 필요한가: 예전엔 failed 가 **종착역**이었다. 그런데 실패의 대부분은 상품이 아니라
 *   그때의 사정이었다 — 시간 초과·차단(419)·캡차·로그인 끊김·워커를 끈 순간(aborted).
 *   특히 2026-09-30~10-14 클릭 이동 버그 동안은 **전건이** no-navigation 으로 실패해,
 *   v0.6.8 로 고친 뒤에도 그 상품들은 다시는 뽑히지 않았다(과일 7,357 중 상세 1,284).
 *
 * 영구 실패로 보는 것: 상품이 없어진 경우(API 400·404·410)와 상세를 뽑을 수 없는 주소.
 * 나머지는 쉬었다가(6시간) 다시 집되 MAX_DETAIL_ATTEMPTS 번에서 멈춘다.
 * 주인은 비운다 — 지금 켜져 있는 도우미가 adoptUnownedWork 로 가져간다.
 *
 * @returns 되살린 건수
 */
export async function reviveFailed(service: SupabaseClient): Promise<number> {
  const before = new Date(Date.now() - RETRY_COOLDOWN_MS).toISOString();
  const { data } = await service
    .from('sh_naver_sourcing_products')
    .select('id, url, detail')
    .eq('detail_status', 'failed')
    .lt('detail_at', before)
    .order('detail_at', { ascending: true })
    .limit(REVIVE_BATCH * 3);
  const rows = (data || []) as { id: string; url: string; detail: { attempts?: number; apiStatus?: number; error?: string } | null }[];
  const retryable = (r: (typeof rows)[number]) => {
    if (!isDetailExtractable(r.url)) return false;
    const d = r.detail || {};
    if ([400, 404, 410].includes(Number(d.apiStatus))) return false;
    const attempts = Number.isFinite(d.attempts) ? Number(d.attempts) : 1;
    return attempts < MAX_DETAIL_ATTEMPTS;
  };
  // ⚠️ 포기한 행(영구 실패·횟수 초과)은 그대로 두면 detail_at 이 가장 오래돼 **매번 앞자리를
  //    차지하고**, 쌓이면 되살릴 행이 배치에 아예 안 들어온다. 확인한 시각으로 detail_at 을
  //    밀어 뒤로 보낸다 — 상태(failed)와 기록(detail)은 그대로다.
  const giveUp = rows.filter((r) => !retryable(r)).map((r) => r.id);
  if (giveUp.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_at: new Date().toISOString() })
      .in('id', giveUp)
      .eq('detail_status', 'failed');
  }
  const ids = rows.filter(retryable).slice(0, REVIVE_BATCH).map((r) => r.id);
  if (!ids.length) return 0;
  const { data: got } = await service
    .from('sh_naver_sourcing_products')
    .update({ detail_status: 'requested', detail_requested_at: new Date().toISOString(), detail_requested_by: null })
    .in('id', ids)
    .eq('detail_status', 'failed')
    .select('id');
  return ((got || []) as { id: string }[]).length;
}

/**
 * 요청 대기분이 하나도 없을 때, 아직 아무도 안 고른 상품(none)을 이 도우미 몫으로 가져간다.
 *
 * 왜: 담을 때 큐에 올리는 건 **제철 품목만**이다(products/route.ts). 비시즌 품목은 none 으로
 *   남아 관리자 PC 의 미리채움(idle=1)만 기다렸고, 관리자 PC 한 대는 시간당 수십 건이 한계라
 *   사실상 영영 안 채워졌다. 셀러 화면은 done 만 보여 주므로 그만큼 카탈로그가 비어 보인다.
 * 우선순위는 지킨다 — 요청된 일감이 남아 있으면 부르지 않는다(호출부가 확인한다).
 *
 * @returns 가져온 건수
 */
export async function adoptUnrequested(service: SupabaseClient, myUserId: string, want: number): Promise<number> {
  if (!myUserId || want <= 0) return 0;
  const { data } = await service
    .from('sh_naver_sourcing_products')
    .select('id, url')
    .eq('detail_status', 'none')
    .order('review_count', { ascending: false, nullsFirst: false })
    .limit(want * 4);
  const rows = (data || []) as { id: string; url: string }[];
  const dead = rows.filter((r) => !isDetailExtractable(r.url)).map((r) => r.id);
  if (dead.length) {
    await service.from('sh_naver_sourcing_products')
      .update({ detail_status: 'failed', detail_at: new Date().toISOString() })
      .in('id', dead)
      .eq('detail_status', 'none');
  }
  const ids = rows.filter((r) => isDetailExtractable(r.url)).slice(0, want).map((r) => r.id);
  if (!ids.length) return 0;
  const { data: got } = await service
    .from('sh_naver_sourcing_products')
    .update({ detail_status: 'requested', detail_requested_at: new Date().toISOString(), detail_requested_by: myUserId })
    .in('id', ids)
    .eq('detail_status', 'none')
    .select('id');
  return ((got || []) as { id: string }[]).length;
}
