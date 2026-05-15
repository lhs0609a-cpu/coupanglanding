import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';

export const maxDuration = 30;


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

    // ── 4단계: pt_users 쿠팡 API 연동 상태 (레거시 — 실 sync는 ⑤ channel_credentials 사용) ──
    const { data: ptUser, error: ptErr } = await serviceClient
      .from('pt_users')
      .select('id, coupang_vendor_id, coupang_api_connected, coupang_access_key, coupang_secret_key')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (!ptUser) {
      // pt_users 없음은 실제 sync 동작과 무관 — warn으로 강등
      steps.push({ step: '4_pt_users', status: 'warn', detail: { note: 'pt_users row 없음 (레거시 테이블 — 실 sync는 channel_credentials 사용). 무시 가능.', error: ptErr?.message } });
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

    // ── 10단계: Fly.io 프록시 /naver-check 연결성 (품절 동기화 핵심 엔드포인트) ──
    const proxyUrl = process.env.COUPANG_PROXY_URL || '';
    const proxySecret = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';
    if (!proxyUrl) {
      steps.push({
        step: '10_proxy_naver_check',
        status: 'warn',
        detail: { note: 'COUPANG_PROXY_URL 환경변수 미설정 — 직접 fetch 경로로만 동작 (네이버 403 가능성 높음)' },
      });
    } else {
      const proxyBase = proxyUrl.replace(/\/proxy\/?$/, '');

      // 실제 사용자 모니터의 source_url 1~3개를 표본으로 테스트
      // (smartstore.naver.com/main 랜딩만 차단되고 상품 페이지는 OK일 수 있음 → 실 URL로 검증)
      const { data: sampleMonitors } = await serviceClient
        .from('sh_stock_monitors')
        .select('id, source_url')
        .eq('megaload_user_id', shUserId)
        .not('source_url', 'eq', '')
        .limit(3);

      const testUrls: { label: string; url: string }[] = [
        { label: 'smartstore_main', url: 'https://smartstore.naver.com/main' },
      ];
      for (const m of (sampleMonitors || []) as { id: string; source_url: string }[]) {
        if (m.source_url) testUrls.push({ label: `monitor_${m.id.slice(0, 8)}`, url: m.source_url });
      }

      const probeResults: { label: string; url: string; status?: number; htmlBytes?: number; error?: string }[] = [];
      for (const probe of testUrls) {
        try {
          const testRes = await fetch(`${proxyBase}/naver-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Proxy-Secret': proxySecret },
            body: JSON.stringify({ url: probe.url }),
            signal: AbortSignal.timeout(20000),
          });
          const text = await testRes.text();
          const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
          if (testRes.ok && parsed?.statusCode) {
            probeResults.push({
              label: probe.label,
              url: probe.url.slice(0, 80),
              status: parsed.statusCode,
              htmlBytes: parsed.html?.length ?? 0,
            });
          } else {
            probeResults.push({
              label: probe.label,
              url: probe.url.slice(0, 80),
              status: testRes.status,
              error: text.slice(0, 200),
            });
          }
        } catch (e) {
          probeResults.push({
            label: probe.label,
            url: probe.url.slice(0, 80),
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const productProbes = probeResults.filter(p => p.label.startsWith('monitor_'));
      const productOk = productProbes.filter(p => p.status === 200).length;
      const productBlocked = productProbes.filter(p => p.status === 429 || p.status === 403).length;

      steps.push({
        step: '10_proxy_naver_check',
        status: productProbes.length === 0 ? 'warn' : (productOk > 0 ? 'ok' : 'fail'),
        detail: {
          proxyUrl: proxyBase,
          probes: probeResults,
          summary: {
            productProbes: productProbes.length,
            productOk,
            productBlocked,
          },
          hint: productOk > 0 && productBlocked === 0
            ? '실제 상품 URL은 정상 — 메인 랜딩만 막힌 경우. 품절 동기화는 작동해야 함.'
            : productOk === 0 && productBlocked > 0
            ? '실제 상품 URL도 차단 — Fly.io IP가 네이버에 throttling 됨. 리전 변경 또는 IP 추가 필요.'
            : productProbes.length === 0
            ? '테스트할 모니터 URL이 없음 — 등록된 source_url이 비어있을 수 있음.'
            : '일부만 성공 — 부분 차단 또는 일시적 throttling.',
        },
      });
    }

    // ── 11단계: Google Translate proxy 우회 테스트 (Vercel 직접 fetch) ──
    // 10단계 fail (Fly.io 프록시 차단) 시 우회 가능성 검증.
    // smartstore.naver.com → smartstore-naver-com.translate.goog 변환하여 구글 IP 경유.
    // Vercel 서버에서 직접 fetch (Fly 프록시 미경유) — 구글 서버가 페이지 fetch 해줌.
    const { data: oneSample } = await serviceClient
      .from('sh_stock_monitors')
      .select('source_url')
      .eq('megaload_user_id', shUserId)
      .not('source_url', 'eq', '')
      .limit(1)
      .maybeSingle();

    const sampleUrl = (oneSample as { source_url?: string } | null)?.source_url
      || 'https://smartstore.naver.com/main';

    let gtUrl: string | null = null;
    try {
      const u = new URL(sampleUrl);
      const translatedHost = u.hostname.replace(/\./g, '-') + '.translate.goog';
      u.hostname = translatedHost;
      u.searchParams.set('_x_tr_sl', 'ko');
      u.searchParams.set('_x_tr_tl', 'en');
      u.searchParams.set('_x_tr_hl', 'en');
      gtUrl = u.toString();
    } catch { /* skip */ }

    if (gtUrl) {
      try {
        // 재시도 로직 — region block 시 최대 3회 재시도
        let gtRes: Response | null = null;
        let html = '';
        let elapsed = 0;
        let attemptCount = 0;
        let regionBlockCount = 0;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
          attemptCount++;
          const t0 = Date.now();
          gtRes = await fetch(gtUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
            },
            signal: AbortSignal.timeout(20000),
          });
          html = await gtRes.text();
          elapsed += Date.now() - t0;
          // region block 감지 → 재시도
          const isRegionBlock = /translation\s*service\s*isn'?t\s*available\s*in\s*your\s*region/i.test(html)
            && !/__PRELOADED_STATE__|productId/i.test(html);
          if (isRegionBlock) {
            regionBlockCount++;
            continue;
          }
          break;
        }
        const finalRes = gtRes!;
        // 네이버 데이터 포함 여부 검증
        const hasNaverData = /__PRELOADED_STATE__|smartstore|naver-shop|productId/i.test(html);
        const hasPrice = /[\d,]+원|\bdispDiscountedSalePrice\b|salePrice/i.test(html);
        steps.push({
          step: '11_google_translate_bypass',
          status: finalRes.ok && hasNaverData ? 'ok' : (finalRes.status === 429 || finalRes.status === 403 ? 'fail' : 'warn'),
          detail: {
            originalUrl: sampleUrl,
            translatedUrl: gtUrl,
            status: finalRes.status,
            htmlBytes: html.length,
            hasNaverData,
            hasPrice,
            responseMs: elapsed,
            attemptCount,
            regionBlockCount,
            hint: finalRes.ok && hasNaverData
              ? '✅ Google Translate 우회 성공! 네이버 데이터 포함 확인. 무료로 차단 회피 가능.'
              : finalRes.status === 429
              ? '구글까지 429 차단 — 호출 빈도 너무 높거나 구글이 우리 IP 차단.'
              : regionBlockCount === attemptCount
              ? `❌ 모든 시도(${attemptCount}회)에서 region block — Vercel server가 region 제한 region에 위치. Edge Function 또는 다른 region 필요.`
              : !hasNaverData
              ? '응답은 받았으나 네이버 데이터 미포함 — 구글 번역 페이지 구조 변경 가능성.'
              : `예상치 못한 응답 (status=${finalRes.status})`,
          },
        });
      } catch (gtErr) {
        steps.push({
          step: '11_google_translate_bypass',
          status: 'fail',
          detail: {
            translatedUrl: gtUrl,
            error: gtErr instanceof Error ? gtErr.message : String(gtErr),
          },
        });
      }
    }

    return NextResponse.json({ steps });
  } catch (err) {
    steps.push({ step: 'unexpected', status: 'fail', detail: err instanceof Error ? err.message : 'Unknown' });
    return NextResponse.json({ steps }, { status: 500 });
  }
}
