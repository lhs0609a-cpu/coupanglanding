/**
 * 공급사 상품 이미지 — 서명 업로드 URL 발급 (공개 버킷 product-images)
 *  POST { files: [{ name, size, type }] } → { uploads: [{ name, path, token, publicUrl }] }
 *
 * 파일 바이트는 브라우저 → Supabase 스토리지로 직접 업로드(uploadToSignedUrl)된다.
 * Vercel 4.5MB 본문 한도/함수 타임아웃과 무관. 공개 버킷이라 publicUrl 을 바로 돌려준다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile } from '@/lib/megaload/supplier/ensure-supplier';
import { randomUUID } from 'crypto';

export const maxDuration = 15;

const BUCKET = 'product-images';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 12;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] || 'jpg').toLowerCase();
}

interface FileReq { name: string; size: number; type?: string }

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const service = await createServiceClient();
    const supplier = await getSupplierByProfile(service, user.id);
    if (!supplier) return NextResponse.json({ error: '공급사 계정이 필요합니다.' }, { status: 403 });

    const body = await request.json().catch(() => null);
    const files: FileReq[] | null = Array.isArray(body?.files) ? body.files : null;
    if (!files || files.length === 0) return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `한 번에 최대 ${MAX_FILES}장까지 가능합니다.` }, { status: 400 });

    const uploads: { name: string; path: string; token: string; publicUrl: string }[] = [];
    for (const f of files) {
      const name = String(f?.name || 'image.jpg');
      const size = Number(f?.size || 0);
      const ext = extOf(name);
      if (!ALLOWED_EXT.includes(ext)) {
        return NextResponse.json({ error: `이미지 파일만 가능합니다(${name}).` }, { status: 400 });
      }
      if (size <= 0 || size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `이미지 용량은 10MB 이하여야 합니다: ${name}` }, { status: 400 });
      }
      const path = `supplier/${supplier.id}/${randomUUID()}.${ext}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        return NextResponse.json({ error: `업로드 URL 생성 실패: ${error?.message || 'unknown'}` }, { status: 500 });
      }
      const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
      uploads.push({ name, path: data.path, token: data.token, publicUrl: pub.publicUrl });
    }

    return NextResponse.json({ uploads });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
