import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;


/**
 * 쿠팡 returnRequests createdAt 포맷: yyyy-MM-ddTHH:mm
 */
function toCoupangDate(d: Date): string {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}`;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/megaload/returns/sync
 * 쿠팡 반품 요청 목록을 최근 7일치 수집해서 megaload_return_requests에 upsert
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const serviceClient = await createServiceClient();

    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '메가로드 계정이 필요합니다.';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    let adapter: CoupangAdapter;
    try {
      adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '쿠팡 API 연결 실패';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // 최근 7일 (쿠팡 returnRequests createdAtFrom/To는 yyyy-MM-ddTHH:mm 포맷)
    const now = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const createdAtFrom = toCoupangDate(from);
    const createdAtTo = toCoupangDate(now);

    let items: Record<string, unknown>[] = [];
    try {
      const result = await adapter.getReturnRequests({
        createdAtFrom,
        createdAtTo,
        timeFrame: true,
      });
      items = result.items;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '쿠팡 API 호출 실패';
      return NextResponse.json({ error: `반품 요청 조회 실패: ${msg}` }, { status: 502 });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const raw of items) {
      try {
        const receiptId = num(raw.receiptId);
        if (!receiptId) continue;

        const orderId = num(raw.orderId) ?? 0;
        const paymentId = num(raw.paymentId);
        const receiptType = str(raw.receiptType);
        const receiptStatus = str(raw.receiptStatus) || 'UNKNOWN';

        // 목록 API에는 requester 정보가 없으므로 단건 상세 조회로 가져온다.
        // 쿠팡 반품 API는 최상위 flat 필드로 반환됨:
        //   requesterName / requesterPhoneNumber / requesterAddress /
        //   requesterAddressDetail / requesterZipCode
        let requesterName: string | null = null;
        let requesterPhone: string | null = null;
        let requesterAddress: string | null = null;
        let requesterZipCode: string | null = null;
        let detailRaw: Record<string, unknown> | null = null;

        const extractRequester = (src: Record<string, unknown>) => {
          // 중첩 requester 객체(취소 API 규격)도 방어적으로 허용
          const nested = (src.requester || {}) as Record<string, unknown>;
          const name = str(src.requesterName) || str(nested.realName) || str(nested.name);
          const phone =
            str(src.requesterPhoneNumber) ||
            str(src.requesterPhone) ||
            str(nested.realNumber) ||
            str(nested.safeNumber);
          const addressRaw =
            str(src.requesterAddress) || str(nested.address) || '';
          const addressDetailRaw =
            str(src.requesterAddressDetail) || str(nested.addressDetail) || '';
          const address =
            [addressRaw, addressDetailRaw].filter(Boolean).join(' ').trim() || null;
          const zip = str(src.requesterZipCode) || str(nested.zipCode);
          return { name, phone, address, zip };
        };

        try {
          detailRaw = await adapter.getReturnRequestDetail(receiptId);
          const r = extractRequester(detailRaw);
          requesterName = r.name;
          requesterPhone = r.phone;
          requesterAddress = r.address;
          requesterZipCode = r.zip;
        } catch (detailErr) {
          console.warn(`receipt_id=${receiptId} 상세조회 실패:`, detailErr);
        }

        // 상세 조회에서 누락된 값이 있으면 목록 데이터로 보완
        if (!requesterName || !requesterPhone || !requesterAddress) {
          const r = extractRequester(raw);
          requesterName = requesterName || r.name;
          requesterPhone = requesterPhone || r.phone;
          requesterAddress = requesterAddress || r.address;
          requesterZipCode = requesterZipCode || r.zip;
        }

        // returnItems 첫 건
        const detailItems = detailRaw?.returnItems as Record<string, unknown>[] | undefined;
        const returnItems = (detailItems || raw.returnItems || []) as Record<string, unknown>[];
        const firstItem = returnItems[0] || {};
        const productName = str(firstItem.sellerProductName);
        const optionName = str(firstItem.vendorItemName);
        const releaseStatus = str(firstItem.releaseStatus);

        // returnDeliveryDtos 첫 건 (이미 등록된 회수 운송장)
        const detailDeliveries = detailRaw?.returnDeliveryDtos as Record<string, unknown>[] | undefined;
        const returnDeliveryDtos = (detailDeliveries || raw.returnDeliveryDtos || []) as Record<string, unknown>[];
        const firstDelivery = returnDeliveryDtos[0] || {};
        const existingInvoiceNo = str(firstDelivery.deliveryInvoiceNo);
        const existingDeliveryCode = str(firstDelivery.deliveryCompanyCode);

        const src = detailRaw || raw;
        const reasonCategory1 = str(src.reasonCategory1);
        const reasonCategory2 = str(src.reasonCategory2);
        const reasonCode = str(src.returnReason) || str(src.reasonCode);
        const reasonCodeText = str(src.returnReasonText) || str(src.reasonCodeText);
        const cancelCountSum = num(src.cancelCountSum);
        const returnDeliveryType = str(src.returnDeliveryType);
        const returnShippingCharge = num(src.returnShippingCharge);
        const faultByType = str(src.faultByType);
        const releaseStopStatus = str(src.releaseStopStatus);

        const channelCreatedAt = str(raw.createdAt);
        const channelModifiedAt = str(raw.modifiedAt);

        const nowIso = new Date().toISOString();

        const { error } = await serviceClient
          .from('megaload_return_requests')
          .upsert({
            megaload_user_id: shUserId,
            channel: 'coupang',
            receipt_id: receiptId,
            order_id: orderId,
            payment_id: paymentId,
            receipt_type: receiptType,
            receipt_status: receiptStatus,
            requester_name: requesterName,
            requester_phone: requesterPhone,
            requester_address: requesterAddress,
            requester_zip_code: requesterZipCode,
            reason_category1: reasonCategory1,
            reason_category2: reasonCategory2,
            reason_code: reasonCode,
            reason_code_text: reasonCodeText,
            cancel_count_sum: cancelCountSum,
            return_delivery_type: returnDeliveryType,
            return_delivery_invoice_no: existingInvoiceNo,
            return_delivery_company_code: existingDeliveryCode,
            return_shipping_charge: returnShippingCharge,
            fault_by_type: faultByType,
            release_stop_status: releaseStopStatus,
            product_name: productName,
            option_name: optionName,
            release_status: releaseStatus,
            channel_created_at: channelCreatedAt,
            channel_modified_at: channelModifiedAt,
            raw_data: detailRaw || raw,
            synced_at: nowIso,
            updated_at: nowIso,
          }, { onConflict: 'megaload_user_id,channel,receipt_id' });

        if (error) {
          errors.push(`receipt_id=${receiptId}: ${error.message}`);
          continue;
        }

        synced++;

        // Rate limit 방지: 상세 조회 간 100ms 딜레이
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        const msg = e instanceof Error ? e.message : '처리 실패';
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      collected: items.length,
      synced,
      synced_at: new Date().toISOString(),
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error('returns/sync error:', err);
    void logSystemError({ source: 'megaload/returns/sync', error: err }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '반품 요청 수집 실패' },
      { status: 500 },
    );
  }
}
