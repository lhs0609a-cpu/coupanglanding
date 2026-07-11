import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 60; // 파일 업로드 포함

const BUCKET = 'supplier-docs';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 파일당 10MB
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'];

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    p.then((v) => { clearTimeout(tid); resolve(v); }).catch((e) => { clearTimeout(tid); reject(e); });
  });
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] || 'bin').toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: '폼 데이터를 읽지 못했습니다.' }, { status: 400 });

    const str = (k: string) => (form.get(k) ? String(form.get(k)).trim() : '');
    const email = str('email').toLowerCase();
    const password = String(form.get('password') || '');
    const fullName = str('fullName');                 // 담당자명
    const phone = str('phone');
    const companyName = str('company_name');
    const representativeName = str('representative_name');
    const businessNumber = str('business_number');
    const brandName = str('brand_name');
    const homepageUrl = str('homepage_url');
    const mallUrl = str('mall_url');
    const applicantNote = str('applicant_note');

    const license = form.get('business_license');
    const mfrDocs = form.getAll('manufacturer_docs').filter((f): f is File => f instanceof File && f.size > 0);

    // ── 검증 ───────────────────────────────────────────────
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: '회사명을 입력해주세요.' }, { status: 400 });
    if (!representativeName) return NextResponse.json({ error: '대표자명을 입력해주세요.' }, { status: 400 });
    if (!businessNumber) return NextResponse.json({ error: '사업자등록번호를 입력해주세요.' }, { status: 400 });
    if (!homepageUrl) return NextResponse.json({ error: '회사 홈페이지 URL을 입력해주세요.' }, { status: 400 });
    if (!mallUrl) return NextResponse.json({ error: '쇼핑몰/스토어 URL을 입력해주세요.' }, { status: 400 });
    if (!(license instanceof File) || license.size === 0) {
      return NextResponse.json({ error: '사업자등록증 파일을 첨부해주세요.' }, { status: 400 });
    }
    if (mfrDocs.length === 0) {
      return NextResponse.json({ error: '제조/공장·상표 등 증빙서류를 1개 이상 첨부해주세요.' }, { status: 400 });
    }

    const allFiles = [license, ...mfrDocs];
    for (const f of allFiles) {
      if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: `파일 용량은 10MB 이하여야 합니다: ${f.name}` }, { status: 400 });
      if (!ALLOWED_EXT.includes(extOf(f.name))) {
        return NextResponse.json({ error: `허용되지 않은 파일 형식입니다(${f.name}). PDF/이미지만 가능합니다.` }, { status: 400 });
      }
    }

    const supabase = await createServiceClient();

    // ── 1) 인증 유저 생성 ──────────────────────────────────
    let created;
    try {
      created = await withTimeout(
        supabase.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: fullName || companyName, role: 'supplier', phone: phone || null },
        }),
        12_000, 'createUser',
      );
    } catch {
      return NextResponse.json({ error: 'Supabase 응답 지연(createUser). 잠시 후 다시 시도해주세요.' }, { status: 504 });
    }
    const { data: userData, error: userErr } = created;
    if (userErr) {
      if (/already been registered|already exists/i.test(userErr.message)) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: userErr.message }, { status: 400 });
    }
    const userId = userData.user.id;

    // 실패 시 생성한 유저 롤백
    const rollback = async (msg: string, status = 500) => {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json({ error: msg }, { status });
    };

    // ── 2) 서류 업로드(비공개 버킷) ────────────────────────
    const uploadOne = async (file: File, key: string): Promise<string | null> => {
      const path = `${userId}/${key}_${Date.now()}.${extOf(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      });
      return error ? null : path;
    };

    const licensePath = await uploadOne(license, 'license');
    if (!licensePath) return rollback('사업자등록증 업로드에 실패했습니다. 다시 시도해주세요.');
    const mfrPaths: string[] = [];
    for (let i = 0; i < mfrDocs.length; i++) {
      const p = await uploadOne(mfrDocs[i], `mfr_${i}`);
      if (p) mfrPaths.push(p);
    }
    if (mfrPaths.length === 0) return rollback('증빙서류 업로드에 실패했습니다. 다시 시도해주세요.');

    // ── 3) profiles: 역할 supplier + 승인 전 비활성 ────────
    await withTimeout<{ error: { message: string } | null }>(
      Promise.resolve(supabase.from('profiles').update({
        role: 'supplier', is_active: false, full_name: fullName || companyName, phone: phone || null,
      }).eq('id', userId)),
      8_000, 'profiles update',
    ).catch(() => {});

    // ── 4) suppliers 레코드(pending) ───────────────────────
    const { error: supErr } = await supabase.from('suppliers').insert({
      owner_profile_id: userId,
      company_name: companyName,
      brand_name: brandName || null,
      representative_name: representativeName,
      business_number: businessNumber,
      contact_email: email,
      contact_phone: phone || null,
      homepage_url: homepageUrl,
      mall_url: mallUrl,
      business_license_path: licensePath,
      manufacturer_doc_paths: mfrPaths,
      applicant_note: applicantNote || null,
      status: 'pending',
      billing_status: 'no_card',
      submitted_at: new Date().toISOString(),
    });
    if (supErr) return rollback(`공급사 정보 저장 실패: ${supErr.message}`);

    logActivity(supabase, {
      adminId: userId, action: 'supplier_signup', targetType: 'supplier', targetId: userId,
      details: { email, company: companyName },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[supplier/signup] error:', err);
    void logSystemError({ source: 'supplier/signup', error: err }).catch(() => {});
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
