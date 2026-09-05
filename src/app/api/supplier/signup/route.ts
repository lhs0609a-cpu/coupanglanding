/**
 * 공급사 전용 회원가입 (관리자 승인 전 비활성)
 *  POST /api/supplier/signup  (JSON)
 *   { email, password, fullName, phone, company_name, representative_name,
 *     business_number, brand_name, homepage_url, mall_url, applicant_note,
 *     uploadToken, business_license_path, manufacturer_doc_paths: string[] }
 *
 * 서류 파일은 /api/supplier/signup/upload-url 로 서명URL 을 받아 브라우저에서
 * Supabase 스토리지로 직접 업로드된다. 여기서는 그 경로만 받아 검증/귀속한다.
 * → 파일 바이트가 이 함수 본문을 거치지 않으므로 Vercel 4.5MB 한도/타임아웃과 무관.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-log';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

const BUCKET = 'supplier-docs';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청 본문을 읽지 못했습니다.' }, { status: 400 });

    const str = (k: string) => (body[k] != null ? String(body[k]).trim() : '');
    const email = str('email').toLowerCase();
    const password = String(body.password || '');
    const fullName = str('fullName');                 // 담당자명
    const phone = str('phone');
    const companyName = str('company_name');
    const representativeName = str('representative_name');
    const businessNumber = str('business_number');
    const brandName = str('brand_name');
    const homepageUrl = str('homepage_url');
    const mallUrl = str('mall_url');
    const applicantNote = str('applicant_note');

    const uploadToken = str('uploadToken');
    const licensePathIn = str('business_license_path');
    const mfrPathsIn = Array.isArray(body.manufacturer_doc_paths)
      ? body.manufacturer_doc_paths.map((p: unknown) => String(p || '').trim()).filter(Boolean)
      : [];

    // ── 필드 검증 ──────────────────────────────────────────
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    if (!companyName) return NextResponse.json({ error: '회사명을 입력해주세요.' }, { status: 400 });
    if (!representativeName) return NextResponse.json({ error: '대표자명을 입력해주세요.' }, { status: 400 });
    if (!businessNumber) return NextResponse.json({ error: '사업자등록번호를 입력해주세요.' }, { status: 400 });
    if (!homepageUrl) return NextResponse.json({ error: '회사 홈페이지 URL을 입력해주세요.' }, { status: 400 });
    if (!mallUrl) return NextResponse.json({ error: '쇼핑몰/스토어 URL을 입력해주세요.' }, { status: 400 });

    // ── 업로드 경로 검증 (위조 방지) ────────────────────────
    if (!UUID_RE.test(uploadToken)) {
      return NextResponse.json({ error: '업로드 세션이 유효하지 않습니다. 파일을 다시 첨부해주세요.' }, { status: 400 });
    }
    const prefix = `signup-pending/${uploadToken}/`;
    if (!licensePathIn || !licensePathIn.startsWith(prefix)) {
      return NextResponse.json({ error: '사업자등록증 업로드를 확인할 수 없습니다. 다시 첨부해주세요.' }, { status: 400 });
    }
    const mfrPaths = mfrPathsIn.filter((p: string) => p.startsWith(prefix));
    if (mfrPaths.length === 0) {
      return NextResponse.json({ error: '제조/공장·상표 증빙서류 업로드를 확인할 수 없습니다.' }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const baseOf = (p: string) => p.slice(prefix.length);

    // ── 업로드된 파일이 실제로 존재하는지 확인 ──────────────
    const { data: listed, error: listErr } = await supabase.storage.from(BUCKET).list(`signup-pending/${uploadToken}`);
    if (listErr) {
      return NextResponse.json({ error: '업로드 확인에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 400 });
    }
    const present = new Set((listed || []).map((o) => o.name));
    if (!present.has(baseOf(licensePathIn))) {
      return NextResponse.json({ error: '사업자등록증 파일이 확인되지 않습니다. 다시 첨부해주세요.' }, { status: 400 });
    }
    for (const p of mfrPaths) {
      if (!present.has(baseOf(p))) {
        return NextResponse.json({ error: '증빙서류 일부가 업로드되지 않았습니다. 다시 첨부해주세요.' }, { status: 400 });
      }
    }

    // 고아 pending 파일 정리 도우미
    const cleanPending = () => supabase.storage.from(BUCKET).remove([licensePathIn, ...mfrPaths]).catch(() => {});

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
      await cleanPending();
      return NextResponse.json({ error: 'Supabase 응답 지연(createUser). 잠시 후 다시 시도해주세요.' }, { status: 504 });
    }
    const { data: userData, error: userErr } = created;
    if (userErr) {
      await cleanPending();
      if (/already been registered|already exists/i.test(userErr.message)) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 409 });
      }
      return NextResponse.json({ error: userErr.message }, { status: 400 });
    }
    const userId = userData.user.id;

    // ── 2) 서류를 유저 폴더로 이동(정리; 실패 시 pending 경로 유지) ─
    const moveToUser = async (from: string): Promise<string> => {
      const to = `${userId}/${baseOf(from)}`;
      const { error } = await supabase.storage.from(BUCKET).move(from, to);
      return error ? from : to;
    };
    const licensePath = await moveToUser(licensePathIn);
    const finalMfrPaths: string[] = [];
    for (const p of mfrPaths) finalMfrPaths.push(await moveToUser(p));

    // 이 시점 이후 롤백은 이동된 최종 경로를 정리
    const rollback = async (msg: string, status = 500) => {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      await supabase.storage.from(BUCKET).remove([licensePath, ...finalMfrPaths]).catch(() => {});
      return NextResponse.json({ error: msg }, { status });
    };

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
      manufacturer_doc_paths: finalMfrPaths,
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
