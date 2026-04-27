import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TossPaymentsAPI } from '@/lib/payments/toss-client';
import { randomBytes } from 'crypto';

/**
 * POST /api/admin/payments/charge-test
 *
 * 관리자 전용 — 임의 PT 사용자의 등록 카드로 1~1000원 테스트 결제.
 * monthly_report와 무관하게 즉시 결제만 실행하고 기록 (is_test_transaction=true).
 *
 * body: { ptUserId: string; amount: number (1~1000); cardId?: string; note?: string }
 *
 * 안전장치:
 *  - admin 권한 검증
 *  - 금액 범위 1~1000 강제
 *  - 1분 내 동일 admin이 5회 이상 호출 차단 (단순 rate limit)
 */

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return { id: user.id };
}

function generateTestOrderId(ptUserId: string): string {
  const id8 = ptUserId.replace(/-/g, '').substring(0, 8);
  const ts = Date.now().toString(36);
  const rand = randomBytes(6).toString('hex');
  return `TEST_${id8}_${ts}_${rand}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ptUserId: unknown = body.ptUserId;
    const amount: unknown = body.amount;
    const cardId: unknown = body.cardId;
    const note: unknown = body.note;

    if (typeof ptUserId !== 'string' || !ptUserId) {
      return NextResponse.json({ error: 'ptUserId가 필요합니다.' }, { status: 400 });
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `amount는 ${MIN_AMOUNT}~${MAX_AMOUNT} 사이의 정수여야 합니다.` },
        { status: 400 },
      );
    }

    const serviceClient = await createServiceClient();

    // Rate limit — 같은 admin이 1분 내 5회 초과 호출 차단
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await serviceClient
      .from('payment_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('test_initiated_by', admin.id)
      .gte('created_at', since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: `테스트 결제는 1분당 최대 ${RATE_LIMIT_MAX}회까지 가능합니다.` },
        { status: 429 },
      );
    }

    // PT 사용자 확인
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('id, profile_id')
      .eq('id', ptUserId)
      .maybeSingle();
    if (!ptUser) {
      return NextResponse.json({ error: '해당 PT 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 카드 조회 — cardId 지정 시 해당 카드, 아니면 primary
    let cardQuery = serviceClient
      .from('billing_cards')
      .select('id, billing_key, customer_key, card_company, card_number, failed_count')
      .eq('pt_user_id', ptUserId)
      .eq('is_active', true);
    if (typeof cardId === 'string' && cardId) {
      cardQuery = cardQuery.eq('id', cardId);
    } else {
      cardQuery = cardQuery.eq('is_primary', true);
    }
    const { data: card } = await cardQuery.maybeSingle();
    if (!card) {
      return NextResponse.json(
        { error: '해당 PT 사용자의 활성 결제 카드가 없습니다. 사용자가 먼저 카드 등록을 해야 합니다.' },
        { status: 400 },
      );
    }

    const orderId = generateTestOrderId(ptUserId);
    const orderName = `메가로드 테스트 결제 ${amount.toLocaleString()}원`;
    const testNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null;

    // pending tx insert
    const { data: tx, error: txError } = await serviceClient
      .from('payment_transactions')
      .insert({
        pt_user_id: ptUserId,
        monthly_report_id: null,
        billing_card_id: card.id,
        toss_order_id: orderId,
        amount: amount,
        penalty_amount: 0,
        total_amount: amount,
        status: 'pending',
        payment_method: 'card',
        is_auto_payment: false,
        is_test_transaction: true,
        test_initiated_by: admin.id,
        test_note: testNote,
      })
      .select()
      .single();

    if (txError || !tx) {
      console.error('[charge-test] pending tx insert 실패:', txError);
      return NextResponse.json({ error: '트랜잭션 생성 실패: ' + (txError?.message || 'unknown') }, { status: 500 });
    }

    // 토스 결제 호출
    try {
      const result = await TossPaymentsAPI.payWithBillingKey(
        card.billing_key,
        card.customer_key,
        amount,
        orderId,
        orderName,
      );

      // 성공 처리 — payment_mark_success RPC는 monthly_report_id 기반이라 사용 불가, 직접 update
      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'success',
          toss_payment_key: result.paymentKey,
          receipt_url: result.receipt?.url || null,
          raw_response: result as unknown as Record<string, unknown>,
          approved_at: result.approvedAt,
        })
        .eq('id', tx.id);

      return NextResponse.json({
        success: true,
        transaction: {
          id: tx.id,
          orderId,
          amount,
          paymentKey: result.paymentKey,
          approvedAt: result.approvedAt,
          receiptUrl: result.receipt?.url || null,
        },
      });
    } catch (payErr) {
      const errObj = payErr as { code?: string; message?: string; raw?: unknown };

      await serviceClient
        .from('payment_transactions')
        .update({
          status: 'failed',
          failure_code: errObj.code || 'UNKNOWN',
          failure_message: errObj.message || '결제 실패',
          raw_response: (errObj.raw as Record<string, unknown>) || null,
          failed_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      return NextResponse.json(
        {
          error: errObj.message || '결제 실패',
          failureCode: errObj.code,
          transactionId: tx.id,
        },
        { status: 402 },
      );
    }
  } catch (err) {
    console.error('POST /api/admin/payments/charge-test error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * GET /api/admin/payments/charge-test?limit=20
 *
 * 관리자 전용 — 최근 테스트 결제 내역 조회.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    const serviceClient = await createServiceClient();

    const { data: txs, error } = await serviceClient
      .from('payment_transactions')
      .select(`
        id, pt_user_id, billing_card_id, toss_order_id, toss_payment_key,
        amount, total_amount, status, failure_code, failure_message,
        receipt_url, approved_at, failed_at, test_note, test_initiated_by,
        created_at
      `)
      .eq('is_test_transaction', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // PT 사용자 정보 join
    const ptUserIds = [...new Set((txs || []).map((t: { pt_user_id: string }) => t.pt_user_id))];
    const { data: ptUsers } = await serviceClient
      .from('pt_users')
      .select('id, profile_id, profiles:profile_id(full_name, email)')
      .in('id', ptUserIds);

    type PtUserRow = { id: string; profile_id: string; profiles: { full_name: string | null; email: string | null } | null };
    const ptUserMap = new Map<string, { fullName: string | null; email: string | null }>();
    for (const pu of (ptUsers || []) as unknown as PtUserRow[]) {
      ptUserMap.set(pu.id, {
        fullName: pu.profiles?.full_name ?? null,
        email: pu.profiles?.email ?? null,
      });
    }

    return NextResponse.json({
      transactions: (txs || []).map((t: { pt_user_id: string; [k: string]: unknown }) => ({
        ...t,
        pt_user: ptUserMap.get(t.pt_user_id) || null,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/payments/charge-test error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
