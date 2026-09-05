/**
 * POST /api/supplier/resubmit  (multipart)
 *   반려된 공급사가 서류/정보를 보완해 재제출. status=pending 유지, rejection_reason 초기화,
 *   submitted_at 갱신 → 관리자 재심사 큐로 다시 올라간다. (승인된 공급사는 불가)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60;
const BUCKET = 'supplier-docs';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'];

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] || 'bin').toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const supplier = await getSupplierByProfile(supabase, user.id);
    if (!supplier) return NextResponse.json({ error: '공급사 계정이 없습니다.' }, { status: 404 });
    if (supplier.status === 'approved') {
      return NextResponse.json({ error: '이미 승인된 계정입니다.' }, { status: 400 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: '폼 데이터를 읽지 못했습니다.' }, { status: 400 });

    const str = (k: string) => (form.get(k) != null ? String(form.get(k)).trim() : undefined);
    const license = form.get('business_license');
    const newLicense = license instanceof File && license.size > 0 ? license : null;
    const mfrDocs = form.getAll('manufacturer_docs').filter((f): f is File => f instanceof File && f.size > 0);

    const service = await createServiceClient();

    // 파일 검증 + 업로드
    const checkFile = (f: File) => {
      if (f.size > MAX_FILE_BYTES) throw new Error(`파일 용량은 10MB 이하여야 합니다: ${f.name}`);
      if (!ALLOWED_EXT.includes(extOf(f.name))) throw new Error(`허용되지 않은 파일 형식입니다: ${f.name}`);
    };
    const uploadOne = async (file: File, key: string): Promise<string | null> => {
      checkFile(file);
      const path = `${user.id}/${key}_${Date.now()}.${extOf(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await service.storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      });
      return error ? null : path;
    };

    const patch: Record<string, unknown> = {
      status: 'pending',
      rejection_reason: null,
      reviewed_at: null,
      submitted_at: new Date().toISOString(),
    };

    // 텍스트 필드(제공된 것만 갱신)
    for (const k of ['company_name', 'representative_name', 'business_number', 'brand_name', 'homepage_url', 'mall_url', 'applicant_note', 'contact_phone', 'contact_email']) {
      const v = str(k);
      if (v !== undefined) patch[k] = v === '' ? null : v;
    }

    try {
      if (newLicense) {
        const p = await uploadOne(newLicense, 'license');
        if (!p) return NextResponse.json({ error: '사업자등록증 업로드 실패' }, { status: 500 });
        patch.business_license_path = p;
      }
      if (mfrDocs.length > 0) {
        const paths: string[] = [];
        for (let i = 0; i < mfrDocs.length; i++) {
          const p = await uploadOne(mfrDocs[i], `mfr_${i}`);
          if (p) paths.push(p);
        }
        if (paths.length === 0) return NextResponse.json({ error: '증빙서류 업로드 실패' }, { status: 500 });
        patch.manufacturer_doc_paths = paths; // 재제출은 교체
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : '파일 처리 오류' }, { status: 400 });
    }

    const { error } = await service.from('suppliers').update(patch).eq('id', supplier.id);
    if (error) return NextResponse.json({ error: `재제출 실패: ${error.message}` }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[supplier/resubmit] error:', err);
    void logSystemError({ source: 'supplier/resubmit', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 });
  }
}
