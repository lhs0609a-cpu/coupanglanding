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
