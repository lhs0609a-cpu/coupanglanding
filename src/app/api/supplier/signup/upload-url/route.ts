/**
 * 공급사 가입 서류 — 서명 업로드 URL 발급
 *  POST /api/supplier/signup/upload-url  { files: [{ field:'license'|'mfr', name, size }] }
 *   → { uploadToken, uploads: [{ field, name, path, token }] }
 *
 * 파일 바이트는 이 서버(Vercel 함수)를 거치지 않고 브라우저 → Supabase 스토리지로
 * 직접 업로드된다. 그래서 Vercel 4.5MB 본문 한도/함수 타임아웃과 무관하다.
 * 서명 업로드 URL 은 토큰으로 인가되므로 미로그인 가입자도 안전하게 쓸 수 있다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export const maxDuration = 15;

const BUCKET = 'supplier-docs';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 파일당 10MB
const MAX_FILES = 12;
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'];

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] || 'bin').toLowerCase();
}

interface FileReq { field: string; name: string; size: number }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const files: FileReq[] | null = Array.isArray(body?.files) ? body.files : null;
    if (!files || files.length === 0) {
      return NextResponse.json({ error: '업로드할 파일 정보가 없습니다.' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `파일은 최대 ${MAX_FILES}개까지 가능합니다.` }, { status: 400 });
    }

    for (const f of files) {
      const name = String(f?.name || '');
      const size = Number(f?.size || 0);
      const field = String(f?.field || '');
      if (!['license', 'mfr'].includes(field)) {
        return NextResponse.json({ error: '잘못된 파일 구분입니다.' }, { status: 400 });
      }
      if (!ALLOWED_EXT.includes(extOf(name))) {
        return NextResponse.json({ error: `허용되지 않은 파일 형식입니다(${name}). PDF/이미지만 가능합니다.` }, { status: 400 });
      }
      if (size <= 0 || size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `파일 용량은 10MB 이하여야 합니다: ${name}` }, { status: 400 });
      }
    }

    const uploadToken = randomUUID();
    const service = await createServiceClient();

    const uploads: { field: string; name: string; path: string; token: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = `signup-pending/${uploadToken}/${f.field}_${i}.${extOf(String(f.name))}`;
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        return NextResponse.json({ error: `업로드 URL 생성 실패: ${error?.message || 'unknown'}` }, { status: 500 });
      }
      uploads.push({ field: String(f.field), name: String(f.name), path: data.path, token: data.token });
    }

    return NextResponse.json({ uploadToken, uploads });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
