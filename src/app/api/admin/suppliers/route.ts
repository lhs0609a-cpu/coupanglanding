/**
 * 공급사 가입 승인 관리 (관리자 전용)
 *  GET   /api/admin/suppliers?status=pending  — 신청 목록 + 서류 서명URL
 *  PATCH /api/admin/suppliers  { id, action:'approve'|'reject', reason? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';

export const maxDuration = 30;
const BUCKET = 'supplier-docs';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user : null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status') || 'pending';
  const service = await createServiceClient();

  let q = service
    .from('suppliers')
    .select('*, owner:profiles!suppliers_owner_profile_id_fkey(email, full_name, is_active)')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 서류 서명URL(10분) 생성 — 비공개 버킷
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data: s } = await service.storage.from(BUCKET).createSignedUrl(path, 600);
    return s?.signedUrl || null;
  };
  const suppliers = await Promise.all((data || []).map(async (s: Record<string, unknown>) => ({
    ...s,
    business_license_url: await sign(s.business_license_path as string | null),
    manufacturer_doc_urls: await Promise.all(
      ((s.manufacturer_doc_paths as string[]) || []).map((p) => sign(p)),
    ),
  })));

  return NextResponse.json({ suppliers });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  const { id, action, reason } = await request.json().catch(() => ({}));
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id 와 action(approve|reject)이 필요합니다.' }, { status: 400 });
  }
  if (action === 'reject' && !String(reason || '').trim()) {
    return NextResponse.json({ error: '반려 사유를 입력해주세요.' }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: supplier } = await service.from('suppliers').select('id, owner_profile_id').eq('id', id).single();
  if (!supplier) return NextResponse.json({ error: '공급사를 찾을 수 없습니다.' }, { status: 404 });

  const now = new Date().toISOString();
  const patch = action === 'approve'
    ? { status: 'approved', business_verified: true, rejection_reason: null, reviewed_at: now, reviewed_by: admin.id }
    : { status: 'pending', rejection_reason: String(reason).trim(), reviewed_at: now, reviewed_by: admin.id };

  const { data: updated, error } = await service.from('suppliers').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: `처리 실패: ${error.message}` }, { status: 500 });

  // 승인 시 로그인/활성 플래그도 활성화
  if (action === 'approve') {
    await service.from('profiles').update({ is_active: true }).eq('id', supplier.owner_profile_id);
  }

  logActivity(service, {
    adminId: admin.id,
    action: action === 'approve' ? 'supplier_approved' : 'supplier_rejected',
    targetType: 'supplier', targetId: id,
    details: { reason: action === 'reject' ? reason : undefined },
  }).catch(() => {});

  return NextResponse.json({ supplier: updated });
}
