import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';

/**
 * GET /api/megaload/stock-monitor/diagnose
 * 전체 파이프라인 진단 — 어디서 끊기는지 단계별 확인
 */
export async function GET() {
  const steps: { step: string; status: 'ok' | 'fail' | 'warn'; detail: unknown }[] = [];

  try {
    // ── 1단계: 인증 ──
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user) {
      steps.push({ step: '1_auth', status: 'fail', detail: authErr?.message || 'Not authenticated' });
      return NextResponse.json({ steps });
    }
    steps.push({ step: '1_auth', status: 'ok', detail: { userId: user.id, email: user.email } });

    const serviceClient = await createServiceClient();

    // ── 2단계: megaload_users 조회 (RLS) ──
    const { data: rlsUser, error: rlsErr } = await supabase
      .from('megaload_users')
      .select('id, profile_id, plan')
      .eq('profile_id', user.id)
      .single();
    steps.push({
      step: '2_megaload_users_rls',
      status: rlsUser ? 'ok' : 'warn',
      detail: rlsUser
        ? { id: (rlsUser as Record<string, unknown>).id, plan: (rlsUser as Record<string, unknown>).plan }
        : { error: rlsErr?.message || 'RLS SELECT returned null — RLS policy may block reads' },
    });

    // ── 3단계: megaload_users 조회 (serviceClient, RLS 우회) ──
    const { data: adminUser, error: adminErr } = await serviceClient
      .from('megaload_users')
      .select('id, profile_id, plan')
      .eq('profile_id', user.id)
      .single();
    if (!adminUser) {
      steps.push({ step: '3_megaload_users_admin', status: 'fail', detail: adminErr?.message || 'No row found even with admin client' });
    } else {
      steps.push({ step: '3_megaload_users_admin', status: 'ok', detail: { id: (adminUser as Record<string, unknown>).id } });
    }
    const shUserId = adminUser ? (adminUser as Record<string, unknown>).id as string : null;

    // ── 4단계: pt_users 쿠팡 API 연동 상태 ──
    const { data: ptUser, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_api_connected, coupang_access_key, coupang_secret_key')
      .eq('profile_id', user.id)
      .single();
    if (!ptUser) {
      steps.push({ step: '4_pt_users', status: 'fail', detail: ptErr?.message || 'pt_users row not found' });
    } else {
      const pt = ptUser as Record<string, unknown>;
      steps.push({
        step: '4_pt_users',
        status: pt.coupang_api_connected ? 'ok' : 'warn',
        detail: {
          coupang_api_connected: pt.coupang_api_connected,
          has_vendor_id: !!pt.coupang_vendor_id,
          has_access_key: !!pt.coupang_access_key,
          has_secret_key: !!pt.coupang_secret_key,
        },
      });
    }

    if (!shUserId) {
      steps.push({ step: '5_channel_credentials', status: 'fail', detail: 'Skipped — no megaload_user' });
      steps.push({ step: '6_coupang_api', status: 'fail', detail: 'Skipped — no megaload_user' });
      steps.push({ step: '7_products', status: 'fail', detail: 'Skipped — no megaload_user' });
      steps.push({ step: '8_monitors', status: 'fail', detail: 'Skipped — no megaload_user' });
      return NextResponse.json({ steps });
    }

    // ── 5단계: channel_credentials 쿠팡 ──
    const { data: cred, error: credErr } = await serviceClient
      .from('channel_credentials')
      .select('id, channel, is_connected, credentials, last_verified_at')
      .eq('megaload_user_id', shUserId)
      .eq('channel', 'coupang')
      .single();
    if (!cred) {
      steps.push({ step: '5_channel_credentials', status: 'fail', detail: credErr?.message || 'No coupang credential found' });
    } else {
      const c = cred as Record<string, unknown>;
      const credentials = c.credentials as Record<string, unknown> | null;
      steps.push({
        step: '5_channel_credentials',
        status: c.is_connected ? 'ok' : 'warn',
        detail: {
          is_connected: c.is_connected,
          has_vendorId: !!credentials?.vendorId,
          has_accessKey: !!credentials?.accessKey,
          has_secretKey: !!credentials?.secretKey,
          last_verified_at: c.last_verified_at,
        },
      });
    }

    // ── 6단계: 쿠팡 API 실제 호출 테스트 ──
    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await (adapter as any).getProducts({ page: 1, size: 5 });
      steps.push({
        step: '6_coupang_api',
        status: rawResult.items.length > 0 ? 'ok' : 'warn',
        detail: {
          itemCount: rawResult.items.length,
          firstItemKeys: rawResult.items[0] ? Object.keys(rawResult.items[0]).slice(0, 10) : [],
          firstItemSample: rawResult.items[0]
            ? {
                sellerProductId: rawResult.items[0].sellerProductId,
                productId: rawResult.items[0].productId,
                sellerProductName: rawResult.items[0].sellerProductName,
                productName: rawResult.items[0].productName,
                statusName: rawResult.items[0].statusName,
                status: rawResult.items[0].status,
              }
            : null,
        },
      });
    } catch (apiErr) {
      steps.push({
        step: '6_coupang_api',
        status: 'fail',
        detail: apiErr instanceof Error ? apiErr.message : String(apiErr),
      });
    }

    // ── 7단계: sh_products 현황 ──
    const { count: productCount, error: pcErr } = await serviceClient
      .from('sh_products')
      .select('id', { count: 'exact', head: true })
      .eq('megaload_user_id', shUserId);
    steps.push({
      step: '7_products',
      status: (productCount ?? 0) > 0 ? 'ok' : 'warn',
      detail: { count: productCount, error: pcErr?.message },
    });

    // ── 8단계: sh_stock_monitors 현황 ──
    const { data: monitorRows, count: monitorCount, error: mcErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, product_id, coupang_product_id, source_status, coupang_status, is_active', { count: 'exact' })
      .eq('megaload_user_id', shUserId)
      .limit(5);
    steps.push({
      step: '8_monitors',
      status: (monitorCount ?? 0) > 0 ? 'ok' : 'warn',
      detail: { count: monitorCount, error: mcErr?.message, sample: monitorRows?.slice(0, 3) },
    });

    // ── 9단계: sh_products inner join 테스트 (GET과 동일 쿼리) ──
    const { data: joinTest, error: joinErr } = await serviceClient
      .from('sh_stock_monitors')
      .select('id, sh_products!inner(id, product_name)')
      .eq('megaload_user_id', shUserId)
      .limit(3);
    steps.push({
      step: '9_inner_join_test',
      status: joinErr ? 'fail' : ((joinTest?.length ?? 0) > 0 ? 'ok' : 'warn'),
      detail: {
        matchCount: joinTest?.length ?? 0,
        error: joinErr?.message,
        hint: joinErr ? 'sh_products!inner join fails — monitor의 product_id가 sh_products에 없을 수 있음' : undefined,
      },
    });

    return NextResponse.json({ steps });
  } catch (err) {
    steps.push({ step: 'unexpected', status: 'fail', detail: err instanceof Error ? err.message : 'Unknown' });
    return NextResponse.json({ steps }, { status: 500 });
  }
}
