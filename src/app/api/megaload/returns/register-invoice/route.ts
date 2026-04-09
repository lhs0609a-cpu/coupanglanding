import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';

/**
 * POST /api/megaload/returns/register-invoice
 * body: { receiptId, deliveryCompanyCode, invoiceNumber, regNumber? }
 *
 * 쿠팡 회수 송장 등록 API 호출 후 sh_return_requests 업데이트
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const receiptId = Number(body.receiptId);
    const deliveryCompanyCode = String(body.deliveryCompanyCode || '').trim();
    const invoiceNumber = String(body.invoiceNumber || '').trim();
    const regNumber = body.regNumber ? String(body.regNumber).trim() : undefined;

    if (!Number.isFinite(receiptId) || receiptId <= 0) {
      return NextResponse.json({ error: 'receiptId가 올바르지 않습니다.' }, { status: 400 });
    }
    if (!deliveryCompanyCode) {
      return NextResponse.json({ error: '택배사 코드가 필요합니다.' }, { status: 400 });
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: '운송장 번호가 필요합니다.' }, { status: 400 });
    }

    // 해당 receipt_id가 이 사용자 소유인지 확인 + 중복 등록 방지
    const { data: existing } = await serviceClient
      .from('sh_return_requests')
      .select('id, receipt_status, return_delivery_type, return_delivery_invoice_no')
      .eq('megaload_user_id', shUserId)
      .eq('channel', 'coupang')
      .eq('receipt_id', receiptId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: '해당 반품 건을 찾을 수 없습니다. 먼저 동기화를 진행해주세요.' },
        { status: 404 },
      );
    }

    const rec = existing as Record<string, unknown>;
    if (rec.return_delivery_type === '전담택배') {
      return NextResponse.json(
        { error: '전담택배 반품 건은 쿠팡이 자동 수거하므로 운송장을 등록할 수 없습니다.' },
        { status: 400 },
      );
    }
    if (rec.return_delivery_invoice_no) {
      return NextResponse.json(
        { error: `이미 회수 운송장이 등록되어 있습니다: ${rec.return_delivery_invoice_no}` },
        { status: 409 },
      );
    }

    let adapter: CoupangAdapter;
    try {
      adapter = (await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang')) as CoupangAdapter;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '쿠팡 API 연결 실패';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    let result: Awaited<ReturnType<CoupangAdapter['registerReturnInvoice']>>;
    try {
      result = await adapter.registerReturnInvoice({
        receiptId,
        deliveryCompanyCode,
        invoiceNumber,
        regNumber,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '쿠팡 API 호출 실패';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // DB 업데이트
    const nowIso = new Date().toISOString();
    await serviceClient
      .from('sh_return_requests')
      .update({
        return_delivery_invoice_no: invoiceNumber,
        return_delivery_company_code: deliveryCompanyCode,
        invoice_registered_at: nowIso,
        updated_at: nowIso,
      })
      .eq('megaload_user_id', shUserId)
      .eq('channel', 'coupang')
      .eq('receipt_id', receiptId);

    return NextResponse.json({
      success: true,
      receiptId,
      deliveryCompanyCode,
      invoiceNumber,
      invoiceNumberId: result?.invoiceNumberId,
    });
  } catch (err) {
    console.error('returns/register-invoice error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '운송장 등록 실패' },
      { status: 500 },
    );
  }
}
