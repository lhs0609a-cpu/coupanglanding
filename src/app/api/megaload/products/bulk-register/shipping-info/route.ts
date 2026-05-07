import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 25;

// 클라 30s 가드보다 짧게 — 서버가 먼저 명확한 에러 반환하도록.
const PER_CALL_TIMEOUT_MS = 18000;

function withFastTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} ${ms / 1000}초 응답 없음 — 쿠팡 API 지연`)), ms),
    ),
  ]);
}

/**
 * GET — 쿠팡 출고지/반품지/vendorId 조회
 *
 * 상품 등록 시 필수인 물류 정보를 한꺼번에 반환한다.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Megaload 계정이 없습니다.' }, { status: 404 });
    }

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;

    const vendorId = coupangAdapter.getVendorId();

    // 출고지 + 반품지 병렬 조회. 어댑터 자체 30s timeout 보다 짧은 18s 강제 race —
    // 한쪽이 hang 해도 클라 30s 가드 전에 서버가 명확한 에러로 응답.
    const [outboundSettled, returnSettled] = await Promise.allSettled([
      withFastTimeout(coupangAdapter.getOutboundShippingPlaces(), PER_CALL_TIMEOUT_MS, '출고지'),
      withFastTimeout(coupangAdapter.getReturnShippingCenters(), PER_CALL_TIMEOUT_MS, '반품지'),
    ]);

    const outboundItems = outboundSettled.status === 'fulfilled' ? outboundSettled.value.items : [];
    const returnItems = returnSettled.status === 'fulfilled' ? returnSettled.value.items : [];
    const outboundError = outboundSettled.status === 'rejected'
      ? (outboundSettled.reason instanceof Error ? outboundSettled.reason.message : String(outboundSettled.reason))
      : null;
    const returnError = returnSettled.status === 'rejected'
      ? (returnSettled.reason instanceof Error ? returnSettled.reason.message : String(returnSettled.reason))
      : null;

    if (outboundError) console.error('[shipping-info] 출고지 조회 실패:', outboundError);
    void logSystemError({ source: 'megaload/products/bulk-register/shipping-info', error: outboundError }).catch(() => {});
    if (returnError) console.error('[shipping-info] 반품지 조회 실패:', returnError);
    void logSystemError({ source: 'megaload/products/bulk-register/shipping-info', error: returnError }).catch(() => {});

    const usableOutbound = outboundItems.filter((p) => p.usable);
    const usableReturn = returnItems.filter((c) => c.usable);

    // 둘 다 에러면 사용자에게 에러로 노출 (UI shippingError 활성화)
    if (outboundError && returnError) {
      return NextResponse.json(
        { error: `쿠팡 API 호출 실패 — 출고지: ${outboundError} / 반품지: ${returnError}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      vendorId,
      outboundShippingPlaces: usableOutbound,
      returnShippingCenters: usableReturn,
      // 진단 정보: UI에 표시되진 않지만 콘솔/디버깅에 유용
      diagnostics: {
        outboundTotal: outboundItems.length,
        outboundUsable: usableOutbound.length,
        outboundError,
        returnTotal: returnItems.length,
        returnUsable: usableReturn.length,
        returnError,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '물류 정보 조회 실패' },
      { status: 500 },
    );
  }
}
