/**
 * GET  /api/supplier/account  → { supplier, gate }   (없으면 supplier=null)
 * POST /api/supplier/account  { company_name, brand_name?, business_number?,
 *                               contact_email?, contact_phone?, logo_url?, logo_public_consent? }
 *   → 공급사 계정 생성(최초) 또는 프로필 수정. 최초 생성 시 status='pending', billing_status='no_card'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile, checkUploadGate } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 30;

/** 수정 허용 필드 화이트리스트 (수수료/카드/상태 등 민감필드는 여기서 못 바꿈) */
const EDITABLE = [
  'company_name', 'brand_name', 'business_number',
  'contact_email', 'contact_phone', 'logo_url', 'logo_public_consent',
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supplier = await getSupplierByProfile(supabase, user.id);
  return NextResponse.json({ supplier, gate: checkUploadGate(supplier) });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const serviceClient = await createServiceClient();

  // 화이트리스트 필드만 추출
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) patch[k] = body[k] === '' ? null : body[k];
  }

  const existing = await getSupplierByProfile(serviceClient, user.id);

  if (existing) {
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ supplier: existing, gate: checkUploadGate(existing) });
    }
    const { data, error } = await serviceClient
      .from('suppliers')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: `수정 실패: ${error.message}` }, { status: 500 });
    return NextResponse.json({ supplier: data, gate: checkUploadGate(data) });
  }

  // 최초 생성 — company_name 필수
  if (!patch.company_name) {
    return NextResponse.json({ error: '회사명(company_name)은 필수입니다.' }, { status: 400 });
  }
  const { data, error } = await serviceClient
    .from('suppliers')
    .insert({ ...patch, owner_profile_id: user.id, status: 'pending', billing_status: 'no_card' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: `공급사 생성 실패: ${error.message}` }, { status: 500 });
  return NextResponse.json({ supplier: data, gate: checkUploadGate(data) });
}
