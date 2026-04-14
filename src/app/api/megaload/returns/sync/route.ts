import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

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

        // 요청자 정보 (안심번호 대비 real* 우선)
        const requester = (raw.requester || {}) as Record<string, unknown>;
        const requesterName = str(requester.realName) || str(requester.name);
        const requesterPhone = str(requester.realNumber) || str(requester.safeNumber);
        const addressRaw = str(requester.address) || '';
        const addressDetailRaw = str(requester.addressDetail) || '';
        const requesterAddress = [addressRaw, addressDetailRaw].filter(Boolean).join(' ').trim() || null;
        const requesterZipCode = str(requester.zipCode);

        // returnItems 첫 건
        const returnItems = (raw.returnItems || []) as Record<string, unknown>[];
        const firstItem = returnItems[0] || {};
        const productName = str(firstItem.sellerProductName);
        const optionName = str(firstItem.vendorItemName);
        const releaseStatus = str(firstItem.releaseStatus);

        // returnDeliveryDtos 첫 건 (이미 등록된 회수 운송장)
        const returnDeliveryDtos = (raw.returnDeliveryDtos || []) as Record<string, unknown>[];
        const firstDelivery = returnDeliveryDtos[0] || {};
        const existingInvoiceNo = str(firstDelivery.deliveryInvoiceNo);
        const existingDeliveryCode = str(firstDelivery.deliveryCompanyCode);

        const reasonCategory1 = str(raw.reasonCategory1);
        const reasonCategory2 = str(raw.reasonCategory2);
        const reasonCode = str(raw.returnReason) || str(raw.reasonCode);
        const reasonCodeText = str(raw.returnReasonText) || str(raw.reasonCodeText);
        const cancelCountSum = num(raw.cancelCountSum);
        const returnDeliveryType = str(raw.returnDeliveryType);
        const returnShippingCharge = num(raw.returnShippingCharge);
        const faultByType = str(raw.faultByType);
        const releaseStopStatus = str(raw.releaseStopStatus);

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
            raw_data: raw,
            synced_at: nowIso,
            updated_at: nowIso,
          }, { onConflict: 'megaload_user_id,channel,receipt_id' });

        if (error) {
          errors.push(`receipt_id=${receiptId}: ${error.message}`);
          continue;
        }

        synced++;
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '반품 요청 수집 실패' },
      { status: 500 },
    );
  }
}
