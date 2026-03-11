import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { notifyTaxInvoiceIssued } from '@/lib/utils/notifications';
import { generateInvoiceNumber } from '@/lib/calculations/vat';

async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const serviceClient = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const status = searchParams.get('status');

    let query = serviceClient
      .from('tax_invoices')
      .select('*, pt_user:pt_users(id, profile_id, profile:profiles(id, full_name, email))')
      .order('created_at', { ascending: false });

    // PT 사용자는 본인 것만 조회
    if (profile?.role !== 'admin') {
      const { data: ptUser } = await supabase
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (!ptUser) {
        return NextResponse.json({ error: 'PT 사용자가 아닙니다.' }, { status: 403 });
      }
      query = query.eq('pt_user_id', ptUser.id);
    }

    if (yearMonth) query = query.eq('year_month', yearMonth);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { monthly_report_id, pt_user_id, year_month, supply_amount, vat_amount, total_amount } = body;

    if (!monthly_report_id || !pt_user_id || !year_month) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // 이미 발행된 세금계산서가 있는지 확인
    const { data: existing } = await serviceClient
      .from('tax_invoices')
      .select('id')
      .eq('monthly_report_id', monthly_report_id)
      .eq('status', 'issued')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '이미 발행된 세금계산서가 있습니다.' }, { status: 400 });
    }

    // 회사 정보 조회
    const { data: company } = await serviceClient
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    if (!company || !company.business_registration_number) {
      return NextResponse.json({ error: '회사 사업자 정보가 등록되지 않았습니다. 설정에서 등록해주세요.' }, { status: 400 });
    }

    // PT 사용자 사업자 정보 조회
    const { data: ptUser } = await serviceClient
      .from('pt_users')
      .select('*')
      .eq('id', pt_user_id)
      .single();

    if (!ptUser?.business_registration_number) {
      return NextResponse.json({ error: '파트너의 사업자 정보가 등록되지 않았습니다.' }, { status: 400 });
    }

    // 일련번호 생성 (오늘 날짜 기준 발행 건수 + 1)
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const { count } = await serviceClient
      .from('tax_invoices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStr + 'T00:00:00Z')
      .lt('created_at', todayStr + 'T23:59:59Z');

    const invoiceNumber = generateInvoiceNumber((count || 0) + 1, today);

    const { data: invoice, error } = await serviceClient
      .from('tax_invoices')
      .insert({
        invoice_number: invoiceNumber,
        monthly_report_id,
        pt_user_id,
        year_month,
        supplier_business_name: company.business_name,
        supplier_registration_number: company.business_registration_number,
        supplier_representative: company.representative_name,
        supplier_address: company.business_address,
        supplier_business_type: company.business_type || '',
        supplier_business_category: company.business_category || '',
        buyer_business_name: ptUser.business_name || '',
        buyer_registration_number: ptUser.business_registration_number || '',
        buyer_representative: ptUser.business_representative || '',
        buyer_address: ptUser.business_address || '',
        buyer_business_type: ptUser.business_type || '',
        buyer_business_category: ptUser.business_category || '',
        supply_amount: supply_amount || 0,
        vat_amount: vat_amount || 0,
        total_amount: total_amount || 0,
        status: 'issued',
        description: body.description || '쿠팡 셀러 PT 코칭 수수료',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logActivity(serviceClient, {
      adminId: admin.id,
      action: 'issue_tax_invoice',
      targetType: 'tax_invoice',
      targetId: invoice.id,
      details: { invoice_number: invoiceNumber, total_amount, pt_user_id },
    });

    // PT 사용자에게 세금계산서 발행 알림
    try {
      const { data: ptUserProfile } = await serviceClient
        .from('pt_users')
        .select('profile_id')
        .eq('id', pt_user_id)
        .single();

      if (ptUserProfile?.profile_id) {
        await notifyTaxInvoiceIssued(
          serviceClient,
          ptUserProfile.profile_id,
          year_month,
          total_amount || 0,
        );
      }
    } catch {
      // 알림 실패해도 발행은 성공
    }

    return NextResponse.json(invoice);
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
